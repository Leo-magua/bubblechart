from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Optional

from flask import Flask, Response, jsonify, request, send_from_directory
from flask_cors import CORS

from bubblechart_backend import __version__ as package_version
from bubblechart_backend.config import Config, load_config
from bubblechart_backend import db as dbutil
from bubblechart_backend import dongchedi_sales
from bubblechart_backend import crawler

DEFAULT_CHART_CONFIG: dict[str, Any] = {
    "xAxisRange": {"min": 15, "max": 60},
    "highlightedBrandColors": {},
    "unselectedBrandColor": "#9CA3AF",
}

DEFAULT_BRAND_PALETTE = [
    "#00D084",
    "#3B82F6",
    "#EF4444",
    "#06B6D4",
    "#8B5CF6",
    "#F59E0B",
    "#EC4899",
    "#FF6B35",
    "#14B8A6",
    "#A855F7",
]


def _chart_config_path(cfg: Config) -> Path:
    return cfg.data_dir / "chart_config.json"


def _normalize_hex_color(value: Any, fallback: str) -> str:
    if not isinstance(value, str):
        return fallback
    color = value.strip()
    if re.match(r"^#[0-9A-Fa-f]{6}$", color):
        return color.upper()
    return fallback


def _normalize_chart_config(raw: Any) -> dict[str, Any]:
    config = json.loads(json.dumps(DEFAULT_CHART_CONFIG))
    if not isinstance(raw, dict):
        return config

    axis = raw.get("xAxisRange")
    if isinstance(axis, dict):
        try:
            min_value = float(axis.get("min", config["xAxisRange"]["min"]))
            max_value = float(axis.get("max", config["xAxisRange"]["max"]))
            if min_value < max_value:
                config["xAxisRange"] = {"min": min_value, "max": max_value}
        except (TypeError, ValueError):
            pass

    highlighted = raw.get("highlightedBrandColors")
    if isinstance(highlighted, dict):
        normalized: dict[str, str] = {}
        for brand, color in highlighted.items():
            brand_name = str(brand).strip()
            if brand_name:
                normalized[brand_name] = _normalize_hex_color(color, DEFAULT_BRAND_PALETTE[len(normalized) % len(DEFAULT_BRAND_PALETTE)])
        config["highlightedBrandColors"] = normalized

    config["unselectedBrandColor"] = _normalize_hex_color(
        raw.get("unselectedBrandColor"),
        DEFAULT_CHART_CONFIG["unselectedBrandColor"],
    )
    return config


def _load_chart_config(cfg: Config) -> dict[str, Any]:
    path = _chart_config_path(cfg)
    if not path.exists():
        return _normalize_chart_config({})
    try:
        return _normalize_chart_config(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        return _normalize_chart_config({})


def _save_chart_config(cfg: Config, config: dict[str, Any]) -> None:
    cfg.data_dir.mkdir(parents=True, exist_ok=True)
    _chart_config_path(cfg).write_text(
        json.dumps(config, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _list_known_brands(cfg: Config) -> list[str]:
    brands: set[str] = set()
    if dbutil.db_exists(cfg.db_path):
        import sqlite3

        conn = sqlite3.connect(str(cfg.db_path))
        try:
            for month in dbutil.list_dongchedi_style_months(cfg.db_path):
                table = dongchedi_sales.validated_month_table_name(month)
                if not table:
                    continue
                try:
                    cur = conn.execute(f'SELECT DISTINCT brand FROM "{table}" WHERE brand IS NOT NULL AND TRIM(brand) != ""')
                    brands.update(str(row[0]).strip() for row in cur.fetchall() if str(row[0]).strip())
                except sqlite3.Error:
                    continue
        finally:
            conn.close()

    brands.update(_load_chart_config(cfg)["highlightedBrandColors"].keys())
    return sorted(brands)


def create_app(config: Optional[Config] = None) -> Flask:
    cfg = config or load_config()
    app = Flask(__name__)
    CORS(app)

    # ------------------------------------------------------------------
    # 基础 API
    # ------------------------------------------------------------------
    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify(
            {
                "ok": True,
                "service": "bubblechart-backend",
                "version": cfg.version or package_version,
            }
        )

    @app.route("/api/months", methods=["GET"])
    def months():
        months_list = dbutil.list_dongchedi_style_months(cfg.db_path)
        return jsonify({"ok": True, "months": months_list})

    @app.route("/api/sales", methods=["GET"])
    def sales():
        month = request.args.get("month", "").strip()
        if not month:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "query parameter month=YYYY-MM is required",
                    }
                ),
                400,
            )
        if dongchedi_sales.validated_month_table_name(month) is None:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "invalid month=YYYY-MM (expected calendar month 01-12)",
                    }
                ),
                400,
            )
        if dbutil.db_exists(cfg.db_path):
            items = dongchedi_sales.load_config_versions_for_month(cfg.db_path, month)
            return jsonify(
                {
                    "ok": True,
                    "month": month,
                    "source": "sqlite",
                    "items": items,
                }
            )
        return jsonify(
            {
                "ok": True,
                "month": month,
                "source": "mock",
                "items": [],
            }
        )

    @app.route("/api/db", methods=["GET"])
    def db_info():
        """开发用：数据目录、库文件是否就绪。"""
        path: Path = cfg.db_path
        mlist = (
            dbutil.list_dongchedi_style_months(path)
            if dbutil.db_exists(path)
            else []
        )
        return jsonify(
            {
                "ok": True,
                "data_dir": str(cfg.data_dir),
                "db_path": str(path),
                "db_exists": dbutil.db_exists(path),
                "month_table_count": len(mlist),
            }
        )

    # ------------------------------------------------------------------
    # 数据抓取 API
    # ------------------------------------------------------------------
    @app.route("/api/fetch", methods=["POST"])
    def fetch_data():
        """
        触发懂车帝销量榜抓取。
        Body JSON:
        {
            "months": ["202508"],      // 可选，默认当前月
            "headless": true           // 可选
        }
        """
        body = request.get_json(silent=True) or {}
        months = body.get("months")
        headless = body.get("headless", True)

        if not months:
            now = __import__("datetime").datetime.now()
            months = [now.strftime("%Y%m")]

        # 校验格式
        for m in months:
            if not re.match(r"^\d{6}$", str(m)):
                return jsonify({"ok": False, "error": f"月份格式错误: {m}，应为 YYYYMM"}), 400

        messages: list = []
        def on_progress(msg: str):
            messages.append(msg)
            app.logger.info(msg)

        results = crawler.crawl_months(
            cfg.db_path,
            months,
            headless=headless,
            progress_callback=on_progress,
        )
        return jsonify({
            "ok": all(r["success"] for r in results),
            "results": results,
            "logs": messages,
        })

    @app.route("/api/preview", methods=["GET"])
    def preview_data():
        """
        返回数据库中所有月份表的摘要（JSON 接口，供前端页面调用）。
        """
        months_list = dbutil.list_dongchedi_style_months(cfg.db_path)
        summary = []
        if dbutil.db_exists(cfg.db_path):
            import sqlite3
            conn = sqlite3.connect(str(cfg.db_path))
            for m_iso in months_list:
                table = dongchedi_sales.validated_month_table_name(m_iso)
                if not table:
                    continue
                cur = conn.execute(f'SELECT COUNT(*) FROM "{table}"')
                count = cur.fetchone()[0]
                cur = conn.execute(f'SELECT brand, car_name, sales_num FROM "{table}" ORDER BY CAST(REPLACE(REPLACE(sales_num,",",""),"+","") AS REAL) DESC LIMIT 5')
                top5 = [{"brand": r[0], "car_name": r[1], "sales_num": r[2]} for r in cur.fetchall()]
                summary.append({
                    "month": m_iso,
                    "count": count,
                    "top5": top5,
                })
            conn.close()
        return jsonify({"ok": True, "summary": summary})

    # ------------------------------------------------------------------
    # 图表配置 API
    # ------------------------------------------------------------------
    @app.route("/api/config", methods=["GET"])
    def chart_config():
        return jsonify({"ok": True, "config": _load_chart_config(cfg)})

    @app.route("/api/config", methods=["PUT"])
    def update_chart_config():
        body = request.get_json(silent=True) or {}
        normalized = _normalize_chart_config(body.get("config", body))
        _save_chart_config(cfg, normalized)
        return jsonify({"ok": True, "config": normalized})

    @app.route("/api/brands", methods=["GET"])
    def brands():
        return jsonify({
            "ok": True,
            "brands": _list_known_brands(cfg),
            "palette": DEFAULT_BRAND_PALETTE,
        })

    @app.route("/api/import", methods=["POST"])
    def import_data():
        """导入 CSV/Excel 文件到 SQLite 月份分表。"""
        from bubblechart_backend.import_service import import_file_to_db

        if "file" not in request.files:
            return jsonify({"ok": False, "error": "未找到上传的文件"}), 400

        file = request.files["file"]
        if not file or file.filename == "" or file.filename is None:
            return jsonify({"ok": False, "error": "文件为空"}), 400

        month_hint = request.form.get("monthHint", "").strip() or None
        file_bytes = file.read()

        result = import_file_to_db(cfg.db_path, file_bytes, file.filename, month_hint)
        if not result["ok"]:
            return jsonify(result), 400
        return jsonify(result)

    # ------------------------------------------------------------------
    # 数据管理 HTML 页面（后端自带的预览/管理页，走 3000 代理）
    # ------------------------------------------------------------------
    _ADMIN_HTML = """
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BubbleChart 数据管理</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; padding: 20px; color: #333; }
    .container { max-width: 1040px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    h1 { font-size: 22px; margin-bottom: 20px; }
    h2 { font-size: 16px; margin: 20px 0 12px; color: #555; }
    .btn { background: #1677ff; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .btn:hover { background: #4096ff; }
    .btn-secondary { background: #52c41a; }
    .btn-secondary:hover { background: #73d13d; }
    .section { margin-bottom: 24px; }
    .form-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
    input[type="text"], input[type="number"] { padding: 6px 10px; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 14px; }
    input[type="number"] { width: 110px; }
    input[type="color"] { width: 40px; height: 32px; padding: 2px; border: 1px solid #d9d9d9; border-radius: 6px; background: #fff; }
    .hint { color: #777; font-size: 12px; line-height: 1.6; }
    .brand-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; margin: 12px 0; }
    .brand-item { display: flex; align-items: center; gap: 8px; padding: 8px; border: 1px solid #f0f0f0; border-radius: 8px; background: #fafafa; }
    .brand-item label { display: flex; align-items: center; gap: 6px; flex: 1; cursor: pointer; }
    .brand-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .log-box { background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 12px; max-height: 300px; overflow-y: auto; white-space: pre-wrap; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #f0f0f0; }
    th { background: #fafafa; font-weight: 600; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; background: #e6f7ff; color: #1677ff; }
    .empty { color: #999; text-align: center; padding: 40px; }
</style>
</head>
<body>
<div class="container">
    <h1>🚗 BubbleChart 数据管理后台</h1>

    <div class="section">
        <h2>📊 数据库状态</h2>
        <div id="db-status">加载中...</div>
    </div>

    <div class="section">
        <h2>⚙️ 前端图表配置</h2>
        <div class="form-row">
            <label>主图横轴范围（成交均价）：</label>
            <input type="number" id="x-min" step="0.1" placeholder="最小值">
            <span>到</span>
            <input type="number" id="x-max" step="0.1" placeholder="最大值">
            <span class="hint">单位：万</span>
        </div>
        <div class="form-row">
            <label>新增关注品牌：</label>
            <input type="text" id="brand-name" placeholder="输入品牌名">
            <button class="btn" onclick="addBrand()">添加品牌</button>
            <button class="btn btn-secondary" onclick="saveChartConfig()">保存配置</button>
        </div>
        <p class="hint">勾选的品牌会使用指定颜色；未勾选的品牌在前端统一显示为灰色。</p>
        <div id="brand-list" class="brand-grid">加载中...</div>
        <div id="config-status" class="hint"></div>
    </div>

    <div class="section">
        <h2>🕷️ 抓取数据</h2>
        <div class="form-row">
            <label>月份 (YYYYMM)：</label>
            <input type="text" id="fetch-month" placeholder="如 202508" value="">
            <button class="btn" onclick="fetchData()">开始抓取</button>
            <button class="btn btn-secondary" onclick="loadPreview()">刷新预览</button>
        </div>
        <div class="log-box" id="log">等待操作...</div>
    </div>

    <div class="section">
        <h2>📋 数据预览</h2>
        <div id="preview-table">暂无数据</div>
    </div>
</div>

<script>
    const API_BASE = '/api';
    let chartConfig = {
        xAxisRange: { min: 15, max: 60 },
        highlightedBrandColors: {},
        unselectedBrandColor: '#9CA3AF'
    };
    let knownBrands = [];
    let brandPalette = [];

    function nextBrandColor() {
        const used = Object.values(chartConfig.highlightedBrandColors);
        const color = brandPalette.find(c => !used.includes(c));
        return color || brandPalette[used.length % Math.max(brandPalette.length, 1)] || '#3B82F6';
    }

    function renderBrandList() {
        const el = document.getElementById('brand-list');
        el.innerHTML = '';
        const brands = Array.from(new Set([
            ...knownBrands,
            ...Object.keys(chartConfig.highlightedBrandColors)
        ])).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

        if (!brands.length) {
            el.innerHTML = '<div class="empty">暂无品牌。可手动输入品牌名添加。</div>';
            return;
        }

        brands.forEach(brand => {
            const selected = Object.prototype.hasOwnProperty.call(chartConfig.highlightedBrandColors, brand);
            const item = document.createElement('div');
            item.className = 'brand-item';

            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = selected;
            checkbox.onchange = () => {
                if (checkbox.checked) {
                    chartConfig.highlightedBrandColors[brand] = chartConfig.highlightedBrandColors[brand] || nextBrandColor();
                } else {
                    delete chartConfig.highlightedBrandColors[brand];
                }
                renderBrandList();
            };
            const name = document.createElement('span');
            name.textContent = brand;
            label.appendChild(checkbox);
            label.appendChild(name);

            const color = document.createElement('input');
            color.type = 'color';
            color.value = selected ? chartConfig.highlightedBrandColors[brand] : chartConfig.unselectedBrandColor;
            color.disabled = !selected;
            color.onchange = () => {
                chartConfig.highlightedBrandColors[brand] = color.value;
            };

            item.appendChild(label);
            item.appendChild(color);
            el.appendChild(item);
        });
    }

    async function loadChartConfig() {
        const [configRes, brandsRes] = await Promise.all([
            fetch(`${API_BASE}/config`),
            fetch(`${API_BASE}/brands`)
        ]);
        const configData = await configRes.json();
        const brandsData = await brandsRes.json();
        if (configData.ok) {
            chartConfig = configData.config;
            document.getElementById('x-min').value = chartConfig.xAxisRange.min;
            document.getElementById('x-max').value = chartConfig.xAxisRange.max;
        }
        if (brandsData.ok) {
            knownBrands = brandsData.brands || [];
            brandPalette = brandsData.palette || [];
        }
        renderBrandList();
    }

    function addBrand() {
        const input = document.getElementById('brand-name');
        const brand = input.value.trim();
        if (!brand) return;
        if (!knownBrands.includes(brand)) knownBrands.push(brand);
        chartConfig.highlightedBrandColors[brand] = chartConfig.highlightedBrandColors[brand] || nextBrandColor();
        input.value = '';
        renderBrandList();
    }

    async function saveChartConfig() {
        const min = Number(document.getElementById('x-min').value);
        const max = Number(document.getElementById('x-max').value);
        const status = document.getElementById('config-status');
        if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
            status.textContent = '横轴范围必须是有效数字，并且最小值小于最大值。';
            status.style.color = '#cf1322';
            return;
        }

        chartConfig.xAxisRange = { min, max };
        const res = await fetch(`${API_BASE}/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: chartConfig })
        });
        const data = await res.json();
        if (data.ok) {
            chartConfig = data.config;
            status.textContent = '配置已保存，刷新前端页面后生效。';
            status.style.color = '#389e0d';
            renderBrandList();
        } else {
            status.textContent = '保存失败：' + (data.error || '未知错误');
            status.style.color = '#cf1322';
        }
    }

    async function loadDbStatus() {
        const res = await fetch(`${API_BASE}/db`);
        const data = await res.json();
        const el = document.getElementById('db-status');
        if (data.ok) {
            el.innerHTML = `
                <p>📁 数据目录: <code>${data.data_dir}</code></p>
                <p>💾 数据库: <code>${data.db_path}</code></p>
                <p>✅ 库存在: <strong>${data.db_exists ? '是' : '否'}</strong></p>
                <p>📅 月份表数: <strong>${data.month_table_count}</strong></p>
            `;
        } else {
            el.innerHTML = '<p style="color:red">获取状态失败</p>';
        }
    }

    async function fetchData() {
        const monthInput = document.getElementById('fetch-month').value.trim();
        const log = document.getElementById('log');
        const NL = String.fromCharCode(10);
        log.textContent = '开始抓取...' + NL;

        const months = monthInput ? [monthInput] : [];
        try {
            const res = await fetch(`${API_BASE}/fetch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ months, headless: true })
            });
            const data = await res.json();
            if (data.logs && data.logs.length) {
                log.textContent += data.logs.join(NL) + NL;
            }
            const rows = Array.isArray(data.results) ? data.results : [];
            rows.forEach(r => {
                log.textContent += `[${r.success ? '✅' : '❌'}] ${r.month}: ${r.message}` + NL;
            });
            loadDbStatus();
            loadPreview();
        } catch (e) {
            log.textContent += '错误: ' + e.message + NL;
        }
    }

    async function loadPreview() {
        const el = document.getElementById('preview-table');
        el.innerHTML = '加载中...';
        try {
            const res = await fetch(`${API_BASE}/preview`);
            const data = await res.json();
            if (!data.ok || !data.summary.length) {
                el.innerHTML = '<div class="empty">暂无数据，请先抓取。</div>';
                return;
            }
            let html = '';
            data.summary.forEach(s => {
                html += `<h3><span class="badge">${s.month}</span> 共 ${s.count} 条 — TOP5</h3>`;
                html += '<table><thead><tr><th>品牌</th><th>车型</th><th>销量</th></tr></thead><tbody>';
                s.top5.forEach(row => {
                    html += `<tr><td>${row.brand}</td><td>${row.car_name}</td><td>${row.sales_num}</td></tr>`;
                });
                html += '</tbody></table>';
            });
            el.innerHTML = html;
        } catch (e) {
            el.innerHTML = '<div class="empty">加载失败: ' + e.message + '</div>';
        }
    }

    // 默认填充当前月
    const now = new Date();
    document.getElementById('fetch-month').value = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}`;

    loadDbStatus();
    loadChartConfig();
    loadPreview();
</script>
</body>
</html>
    """

    @app.route("/admin", methods=["GET"])
    def admin_page():
        """数据管理后台页面（静态 HTML，不经 Jinja 解析，避免与内联 JS 冲突）。"""
        return Response(_ADMIN_HTML, mimetype="text/html; charset=utf-8")

    # ------------------------------------------------------------------
    # 前端静态文件服务 (SPA)
    # ------------------------------------------------------------------
    _FRONTEND_DIST = str(cfg.project_root / "app" / "dist")

    @app.route("/assets/<path:filepath>")
    def serve_frontend_assets(filepath):
        return send_from_directory(f"{_FRONTEND_DIST}/assets", filepath)

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_frontend_spa(path):
        # API 路由已匹配，不处理
        if path.startswith("api/") or path == "admin":
            from flask import abort
            abort(404)
        # 空路径 → index.html
        if not path:
            return send_from_directory(_FRONTEND_DIST, "index.html")
        # 尝试返回静态文件
        import os
        full_path = os.path.join(_FRONTEND_DIST, path)
        if os.path.isfile(full_path):
            return send_from_directory(_FRONTEND_DIST, path)
        # SPA fallback
        return send_from_directory(_FRONTEND_DIST, "index.html")

    return app
