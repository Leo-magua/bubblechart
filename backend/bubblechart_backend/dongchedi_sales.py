# 懂车帝 month_YYYYMM 分表 → 前端 ConfigVersion[] 形状（camelCase JSON）
from __future__ import annotations

import hashlib
import re
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

from bubblechart_backend.cleaning import clean_number
from bubblechart_backend.db import db_exists, get_connection

# 与前端 mockData BRAND_COLORS 对齐，未知品牌用稳定伪色
_BRAND_COLORS: Dict[str, str] = {
    "理想": "#00D084",
    "问界": "#3B82F6",
    "特斯拉": "#EF4444",
    "小鹏": "#06B6D4",
    "蔚来": "#8B5CF6",
    "比亚迪": "#F59E0B",
    "极氪": "#EC4899",
    "小米": "#FF6B35",
}

_MONTH_ISO = re.compile(r"^(\d{4})-(\d{2})$")
_MONTH_TABLE = re.compile(r"^month_\d{6}$")


def validated_month_table_name(month_iso: str) -> Optional[str]:
    """将 YYYY-MM 转为 month_YYYYMM；非法月份返回 None。"""
    m = _MONTH_ISO.match((month_iso or "").strip())
    if not m:
        return None
    y, mo = m.group(1), m.group(2)
    mi = int(mo)
    if mi < 1 or mi > 12:
        return None
    return f"month_{y}{mo}"


def _price_mean(price_str: Optional[str]) -> Optional[float]:
    """与 dongchedi create_car_sales_db.price_mean 一致：从「x-y万」「x万」解析均价（万）。"""
    if not price_str:
        return None
    s = str(price_str).strip()
    m = re.match(r"([\d.]+)-([\d.]+)万", s)
    if m:
        low, high = float(m.group(1)), float(m.group(2))
        return round((low + high) / 2, 2)
    m2 = re.match(r"([\d.]+)万", s)
    if m2:
        return float(m2.group(1))
    return None


def _clean_sales_num(value: Any) -> int:
    """销量：兼容千分位；含「万」时按万辆→台；其余走 clean_number。"""
    if value is None:
        return 0
    s = str(value).strip()
    if not s:
        return 0
    if "万" in s:
        head = s.split("万", 1)[0]
        num = re.sub(r"[^\d.]", "", head)
        try:
            return int(round(float(num) * 10000))
        except (ValueError, TypeError):
            return 0
    if s.endswith("+"):
        s = s[:-1].strip()
    n = clean_number(s)
    if isinstance(n, float):
        return int(round(n))
    return int(n)


def _stable_color_hex(brand: str) -> str:
    digest = hashlib.sha256(brand.encode("utf-8")).hexdigest()
    r = int(digest[0:2], 16)
    g = int(digest[2:4], 16)
    b = int(digest[4:6], 16)
    return f"#{r:02x}{g:02x}{b:02x}"


def brand_color_for(brand: str) -> str:
    b = (brand or "").strip()
    if b in _BRAND_COLORS:
        return _BRAND_COLORS[b]
    return _stable_color_hex(b or "unknown")


def infer_power_type(car_name: str) -> str:
    """榜单无能源字段时的弱启发式，失败则「未知」。"""
    n = (car_name or "").upper()
    c = car_name or ""
    if "增程" in c or "EREV" in n or "REEV" in n:
        return "增程"
    if "DM-I" in n or "PHEV" in n or "插混" in c:
        return "插混"
    if "DM" in n and "DM-I" not in n:
        return "插混"
    if "EV" in n or "纯电" in c:
        return "纯电"
    return "未知"


def _table_columns(conn: sqlite3.Connection, table: str) -> List[str]:
    if not _MONTH_TABLE.match(table):
        return []
    cur = conn.execute(f'PRAGMA table_info("{table}")')
    return [row[1] for row in cur.fetchall()]


def _resolve_field_mapping(columns: List[str]) -> Dict[str, str]:
    """
    与 dongchedi app.py get_data 类似：按列名子串推断；优先精确懂车帝字段名。
    返回 logical_name -> actual_column_name
    """
    mapping: Dict[str, str] = {}
    lower_to_orig = {c.lower(): c for c in columns}

    exact = [
        ("seriesid", "seriesid"),
        ("car_name", "car_name"),
        ("brand", "brand"),
        ("level", "level"),
        ("price_range", "price_range"),
        ("price_avg", "price_avg"),
        ("sales_num", "sales_num"),
        ("date", "date"),
    ]
    for logical, name in exact:
        if name in lower_to_orig:
            mapping[logical] = lower_to_orig[name]

    def take(logical: str, col: str) -> None:
        if logical not in mapping and col in lower_to_orig:
            mapping[logical] = lower_to_orig[col]

    for col in columns:
        cl = col.lower()
        if any(x in cl for x in ("car", "model", "name", "车型", "车名")) and "sales" not in cl:
            take("car_name", col)
        elif any(x in cl for x in ("brand", "manufacturer", "make", "品牌", "厂商")):
            take("brand", col)
        elif "level" in cl or "级别" in cl or "类型" in cl:
            take("level", col)
        elif "price_range" in cl or "价格区间" in cl or "指导价" in cl:
            take("price_range", col)
        elif any(x in cl for x in ("price", "avg", "average", "价格", "均价")):
            if not any(x in cl for x in ("sales", "volume", "quantity", "销量", "数量", "num")):
                take("price_avg", col)
        elif any(x in cl for x in ("sales", "volume", "quantity", "销量", "数量")):
            if not any(x in cl for x in ("price", "avg", "均价")):
                take("sales_num", col)
        elif cl in ("date", "month", "月份", "年月"):
            take("date", col)
        elif "series" in cl and "id" in cl:
            take("seriesid", col)

    if "car_name" not in mapping and columns:
        mapping["car_name"] = columns[0]
    if "brand" not in mapping and len(columns) > 1:
        mapping["brand"] = columns[1]
    return mapping


def _quote_id(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
        (table,),
    ).fetchone()
    return row is not None


def _coerce_price(price_avg: Any, price_range: Any) -> float:
    if price_avg is not None and str(price_avg).strip() != "":
        try:
            return round(float(price_avg), 2)
        except (TypeError, ValueError):
            pass
    pm = _price_mean(price_range if price_range is not None else None)
    if pm is not None:
        return float(pm)
    return 0.0


def _row_to_config_version(rec: Dict[str, Any], month_iso: str) -> Dict[str, Any]:
    brand = (rec.get("brand") or "").strip()
    model = (rec.get("car_name") or "").strip()
    seriesid = (rec.get("seriesid") or "").strip()
    if seriesid:
        rid = seriesid
    else:
        h = hashlib.sha1(f"{month_iso}|{brand}|{model}".encode("utf-8")).hexdigest()[:14]
        rid = f"anon-{h}"

    price = _coerce_price(rec.get("price_avg"), rec.get("price_range"))
    sales = _clean_sales_num(rec.get("sales_num"))
    level = (rec.get("level") or "").strip() or "未知"
    config_name = "全系合计"
    full_name = f"{brand} {model}".strip()
    pr = rec.get("price_range")
    price_range_str = None
    if pr:
        ps = str(pr).strip()
        price_range_str = ps
        if ps and ps not in full_name:
            full_name = f"{full_name} {ps}".strip()

    return {
        "id": rid,
        "brand": brand,
        "brandColor": brand_color_for(brand),
        "model": model,
        "configName": config_name,
        "fullName": full_name,
        "price": price,
        "priceRange": price_range_str,
        "sales": sales,
        "level": level,
        "powerType": infer_power_type(model),
        "month": month_iso.strip(),
    }


def load_config_versions_for_month(db_path: Path, month_iso: str) -> List[Dict[str, Any]]:
    """
    读取单月分表，输出可直接 jsonify 的 dict 列表（camelCase，与 app/src/types ConfigVersion 一致）。
    无库、无表或读失败时返回空列表。
    """
    table = validated_month_table_name(month_iso)
    if not table or not db_exists(db_path):
        return []

    try:
        conn = get_connection(True, db_path)
    except OSError:
        return []

    try:
        if not _table_exists(conn, table):
            return []
        columns = _table_columns(conn, table)
        if not columns:
            return []
        fm = _resolve_field_mapping(columns)
        if "car_name" not in fm or "brand" not in fm or "sales_num" not in fm:
            return []

        select_cols: List[str] = []
        aliases = [
            "seriesid",
            "car_name",
            "brand",
            "level",
            "price_range",
            "price_avg",
            "sales_num",
            "date",
        ]
        for logical in aliases:
            if logical in fm:
                select_cols.append(f"{_quote_id(fm[logical])} AS {_quote_id(logical)}")

        sql = f"SELECT {', '.join(select_cols)} FROM {_quote_id(table)}"
        cur = conn.execute(sql)
        rows = cur.fetchall()
        colnames = [d[0] for d in cur.description]
        return [_row_to_config_version(dict(zip(colnames, tup)), month_iso) for tup in rows]
    except sqlite3.Error:
        return []
    finally:
        conn.close()
