"""
懂车帝车系配置页抓取器
从 https://www.dongchedi.com/auto/params-carIds-x-{series_id} 抓取车系参数配置
提取：续航、电池容量、功率、智驾芯片、辅助驾驶级别、车身尺寸等
"""
from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup

from bubblechart_backend.db import db_exists, get_connection

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# 参数名 → 统一字段名映射（支持模糊匹配）
_PARAM_ALIASES: Dict[str, List[str]] = {
    "cltc_range": ["纯电续航里程(km)CLTC", "CLTC纯电续航里程", "纯电续航里程CLTC"],
    "nedc_range": ["纯电续航里程(km)NEDC", "NEDC纯电续航里程"],
    "wltc_range": ["纯电续航里程(km)WLTC", "WLTC纯电续航里程"],
    "battery_capacity": ["电池容量(kWh)", "电池容量"],
    "motor_power_kw": ["电动机总功率(kW)", "电动机总功率", "电机总功率"],
    "motor_torque_nm": ["电动机总扭矩(N·m)", "电动机总扭矩", "电机总扭矩"],
    "max_speed": ["最高车速(km/h)", "最高车速"],
    "length": ["长(mm)", "长"],
    "width": ["宽(mm)", "宽"],
    "height": ["高(mm)", "高"],
    "wheelbase": ["轴距(mm)", "轴距"],
    "curb_weight": ["整备质量(kg)", "整备质量"],
    "drive_type": ["驱动方式", "驱动形式"],
    "assistance_level": ["辅助驾驶级别"],
    "chip": ["智驾芯片", "自动驾驶芯片", "辅助驾驶芯片", "座舱芯片", "车机芯片"],
    "radar_lidar": ["激光雷达", "毫米波雷达", "超声波雷达"],
    "fast_charge_time": ["充电时间"],
    "slow_charge_time": [],
    "energy_type": ["能源类型", "动力类型"],
    "zero_to_hundred": ["官方百公里加速时间(s)", "百公里加速", "0-100km/h加速时间"],
    "front_suspension": ["前悬挂形式", "前悬架", "前悬挂"],
    "rear_suspension": ["后悬挂形式", "后悬架", "后悬挂"],
}


def _match_param(raw_name: str) -> Optional[str]:
    """将原始参数名匹配到统一字段名"""
    raw = raw_name.strip().replace(" ", "").replace("\n", "")
    for field, aliases in _PARAM_ALIASES.items():
        for alias in aliases:
            alias_nospace = alias.replace(" ", "")
            if alias_nospace in raw or raw in alias_nospace:
                return field
    return None


def _parse_charge_time(value: str) -> Tuple[Optional[str], Optional[str]]:
    """从'快充0.35小时\n慢充8.94小时'中提取快充和慢充时间"""
    if not value:
        return None, None
    fast = None
    slow = None
    for line in value.split("\n"):
        line = line.strip()
        if line.startswith("快充"):
            fast = line[2:].strip()
        elif line.startswith("慢充"):
            slow = line[2:].strip()
    return fast, slow


def _extract_numeric(value: str) -> Optional[float]:
    """从字符串提取数字，如 '310' → 310, '85(116Ps)' → 85, '1.24' → 1.24"""
    if not value:
        return None
    s = value.strip()
    # 先尝试提取括号前的数字
    m = re.search(r"([\d.]+)", s)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            pass
    return None


def _pick_best_numeric(values: List[str]) -> Optional[float]:
    """从多个版本值中选出最有代表性的数值（取最大值，通常对应高配）"""
    nums = [v for v in (_extract_numeric(x) for x in values) if v is not None]
    if not nums:
        return None
    return max(nums)


def _pick_common_string(values: List[str]) -> Optional[str]:
    """从多个版本值中选出共同值（如果都相同）或最频繁的值"""
    cleaned = [v.strip() for v in values if v.strip()]
    if not cleaned:
        return None
    # 如果所有值都相同
    if len(set(cleaned)) == 1:
        return cleaned[0]
    # 否则返回最频繁的
    from collections import Counter
    return Counter(cleaned).most_common(1)[0][0]


def _clean_assistance_level(value: str) -> Optional[str]:
    """清洗辅助驾驶级别，如 '●L1级●L1级○L1级' → 'L1级'"""
    if not value:
        return None
    # 提取所有级别标记
    levels = re.findall(r"[●○]?(L\d+[+-]?级)", value)
    if not levels:
        return value.strip()
    # 去重并保持顺序
    seen = set()
    unique = []
    for lv in levels:
        if lv not in seen:
            seen.add(lv)
            unique.append(lv)
    return "/".join(unique) if unique else value.strip()


def _clean_cell(cell_soup) -> str:
    """提取表格单元格的纯文本内容"""
    if cell_soup is None:
        return ""
    text = cell_soup.get_text(separator=" ", strip=True)
    # 去除图片占位符
    text = re.sub(r"!\[.*?\]\(.*?\)", "", text)
    return text.strip()


def _has_class(elem, prefix: str) -> bool:
    """检查元素的 class 是否包含指定前缀（懂车帝使用 css-modules，类名带 hash）"""
    if elem is None:
        return False
    classes = elem.get("class", [])
    if isinstance(classes, str):
        classes = [classes]
    return any(prefix in str(c) for c in classes)


def parse_config_page(html: str) -> Dict[str, Any]:
    """
    解析懂车帝配置页 HTML，提取结构化参数
    懂车帝使用 css-modules，类名格式如 table_row__yVX1h、table_col__3Pc3_、cell_normal__37nRi
    返回: {
        "series_id": str,
        "series_name": str,
        "configs_count": int,
        "params": {field: value|list},
        "raw": {param_name: [values]},
    }
    """
    soup = BeautifulSoup(html, "html.parser")

    # 尝试提取车系名（从 title）
    title_tag = soup.find("title")
    series_name = ""
    if title_tag:
        # title 格式如: 【吉利银河星愿...参数配置】...
        title_text = title_tag.get_text(strip=True)
        # 取第一个 "参数配置" 之前的文本，再取第一行
        series_name = title_text.split("参数配置")[0].strip()
        # 如果开头有【，去掉
        if series_name.startswith("【"):
            series_name = series_name[1:]
        # 只保留第一行（去掉换行后的配置版本列表）
        series_name = series_name.split("\n")[0].strip()

    raw_params: Dict[str, List[str]] = {}

    # 方式1：从页面 JSON 数据提取（现代 SPA）
    for script in soup.find_all("script"):
        text = script.string or ""
        for pattern in [
            r"window\.__INITIAL_STATE__\s*=\s*(\{.*?\});",
            r"window\._SSR_HYDRATED_DATA\s*=\s*(\{.*?\});",
        ]:
            m = re.search(pattern, text, re.DOTALL)
            if m:
                try:
                    data = json.loads(m.group(1))
                    return _parse_json_config(data, series_name)
                except (json.JSONDecodeError, TypeError):
                    continue

    # 方式2：解析懂车帝 css-modules 网格结构
    # 行: div[class*="table_row__"]
    # 列: div[class*="table_col__"]
    # 标签列内的 label 元素
    # 值列内的 div[class*="cell_"]
    row_divs = [
        d for d in soup.find_all("div")
        if _has_class(d, "table_row__")
    ]

    for row in row_divs:
        cols = [
            d for d in row.find_all("div", recursive=False)
            if _has_class(d, "table_col__")
        ]
        if len(cols) < 2:
            continue

        # 第一列：标签
        label_elem = cols[0].find("label")
        param_name = label_elem.get_text(strip=True) if label_elem else ""
        if not param_name:
            continue

        # 后续列：值
        values: List[str] = []
        for col in cols[1:]:
            val_elems = [
                d for d in col.find_all("div", recursive=False)
                if _has_class(d, "cell_")
            ]
            if val_elems:
                values.append(val_elems[0].get_text(strip=True))
            else:
                #  fallback: 直接取列的文本
                text = col.get_text(strip=True)
                if text:
                    values.append(text)

        if values:
            raw_params[param_name] = values

    # 方式3：降级到传统 table 解析
    if not raw_params:
        for table in soup.find_all("table"):
            for row in table.find_all("tr"):
                cells = row.find_all(["td", "th"])
                if len(cells) < 2:
                    continue
                param_name = _clean_cell(cells[0])
                if not param_name:
                    continue
                values = [_clean_cell(c) for c in cells[1:]]
                if any(v for v in values):
                    raw_params[param_name] = values

    # 将原始参数映射到统一字段
    params: Dict[str, Any] = {}
    for raw_name, values in raw_params.items():
        field = _match_param(raw_name)
        if not field:
            continue

        # 数值型取最大（通常高配才有大电池、大功率）
        if field in (
            "cltc_range", "nedc_range", "wltc_range", "battery_capacity",
            "motor_power_kw", "motor_torque_nm", "max_speed", "length",
            "width", "height", "wheelbase", "curb_weight", "zero_to_hundred",
        ):
            val = _pick_best_numeric(values)
            if val is not None:
                params[field] = val
        else:
            val = _pick_common_string(values)
            if not val:
                continue
            # 特殊字段处理
            if field == "assistance_level":
                val = _clean_assistance_level(val)
            elif field == "fast_charge_time":
                # 从"充电时间"解析快充/慢充
                fast, slow = _parse_charge_time(val)
                if fast:
                    params["fast_charge_time"] = fast
                if slow:
                    params["slow_charge_time"] = slow
                continue
            params[field] = val

    return {
        "series_name": series_name,
        "configs_count": max(len(v) for v in raw_params.values()) if raw_params else 0,
        "params": params,
        "raw": raw_params,
    }


def _parse_json_config(data: Dict, series_name: str) -> Dict[str, Any]:
    """从懂车帝页面 JSON 数据中提取配置参数"""
    # 这个结构取决于懂车帝实际的 JSON 格式，需要根据实际情况调整
    params: Dict[str, Any] = {}
    raw: Dict[str, List[str]] = {}

    # TODO: 根据实际 JSON 结构调整解析逻辑
    # 懂车帝的配置数据通常在某个嵌套结构中
    # 这里先返回一个占位，后续根据实际页面结构完善

    return {
        "series_name": series_name,
        "configs_count": 0,
        "params": params,
        "raw": raw,
        "json_parsed": True,
    }


def fetch_series_config(series_id: str, timeout: int = 20) -> Optional[Dict[str, Any]]:
    """
    抓取懂车帝车系配置页
    """
    url = f"https://www.dongchedi.com/auto/params-carIds-x-{series_id}"
    try:
        resp = requests.get(
            url,
            headers={
                "User-Agent": _USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            },
            timeout=timeout,
        )
        resp.raise_for_status()
        result = parse_config_page(resp.text)
        result["series_id"] = series_id
        result["source_url"] = url
        return result
    except Exception as e:
        return {
            "series_id": series_id,
            "error": str(e),
            "params": {},
            "raw": {},
        }


# ============================================================================
# 数据库操作
# ============================================================================

_SERIES_CONFIG_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS series_config (
    series_id TEXT PRIMARY KEY,
    series_name TEXT,
    crawled_at TEXT DEFAULT (datetime('now')),
    configs_count INTEGER DEFAULT 0,
    cltc_range INTEGER,
    nedc_range INTEGER,
    wltc_range INTEGER,
    battery_capacity REAL,
    motor_power_kw REAL,
    motor_torque_nm REAL,
    max_speed INTEGER,
    length INTEGER,
    width INTEGER,
    height INTEGER,
    wheelbase INTEGER,
    curb_weight INTEGER,
    drive_type TEXT,
    assistance_level TEXT,
    chip TEXT,
    radar_lidar TEXT,
    fast_charge_time TEXT,
    slow_charge_time TEXT,
    energy_type TEXT,
    zero_to_hundred REAL,
    front_suspension TEXT,
    rear_suspension TEXT,
    raw_json TEXT
)
"""


def ensure_series_config_table(db_path: Path) -> None:
    """确保 series_config 表存在"""
    if not db_exists(db_path):
        return
    conn = get_connection(False, db_path)
    try:
        conn.execute(_SERIES_CONFIG_TABLE_SQL)
        conn.commit()
    finally:
        conn.close()


def save_series_config(db_path: Path, data: Dict[str, Any]) -> bool:
    """保存或更新车系配置数据"""
    series_id = data.get("series_id")
    if not series_id:
        return False

    ensure_series_config_table(db_path)
    p = data.get("params", {})

    conn = get_connection(False, db_path)
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO series_config (
                series_id, series_name, configs_count,
                cltc_range, battery_capacity, motor_power_kw, motor_torque_nm,
                max_speed, length, width, height, wheelbase, curb_weight,
                drive_type, assistance_level, chip, radar_lidar,
                fast_charge_time, slow_charge_time, energy_type, zero_to_hundred,
                front_suspension, rear_suspension, raw_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                series_id,
                data.get("series_name", ""),
                data.get("configs_count", 0),
                p.get("cltc_range"),
                p.get("battery_capacity"),
                p.get("motor_power_kw"),
                p.get("motor_torque_nm"),
                p.get("max_speed"),
                p.get("length"),
                p.get("width"),
                p.get("height"),
                p.get("wheelbase"),
                p.get("curb_weight"),
                p.get("drive_type"),
                p.get("assistance_level"),
                p.get("chip"),
                p.get("radar_lidar"),
                p.get("fast_charge_time"),
                p.get("slow_charge_time"),
                p.get("energy_type"),
                p.get("zero_to_hundred"),
                p.get("front_suspension"),
                p.get("rear_suspension"),
                json.dumps(data.get("raw", {}), ensure_ascii=False, default=str) if data.get("raw") else None,
            ),
        )
        conn.commit()
        return True
    except sqlite3.Error:
        return False
    finally:
        conn.close()


def get_series_config(db_path: Path, series_id: str) -> Optional[Dict[str, Any]]:
    """从数据库读取车系配置"""
    if not db_exists(db_path):
        return None

    ensure_series_config_table(db_path)
    conn = get_connection(True, db_path)
    try:
        cur = conn.execute(
            "SELECT * FROM series_config WHERE series_id = ? LIMIT 1",
            (series_id,),
        )
        row = cur.fetchone()
        if not row:
            return None

        colnames = [d[0] for d in cur.description]
        rec = dict(zip(colnames, row))

        # 过滤掉 None 值
        return {k: v for k, v in rec.items() if v is not None}
    except sqlite3.Error:
        return None
    finally:
        conn.close()


def batch_crawl_missing_configs(
    db_path: Path,
    series_ids: List[str],
    force_refresh: bool = False,
) -> Tuple[int, int]:
    """
    批量抓取缺失的配置数据
    返回: (成功数, 失败数)
    """
    ensure_series_config_table(db_path)
    success = 0
    failed = 0

    for sid in series_ids:
        if not force_refresh:
            existing = get_series_config(db_path, sid)
            if existing:
                continue

        data = fetch_series_config(sid)
        if data and not data.get("error"):
            if save_series_config(db_path, data):
                success += 1
            else:
                failed += 1
        else:
            failed += 1

    return success, failed
