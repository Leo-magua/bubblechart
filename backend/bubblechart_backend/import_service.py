# CSV/Excel 导入 → SQLite month_YYYYMM 分表
from __future__ import annotations

import datetime
import hashlib
import io
import re
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from bubblechart_backend.cleaning import clean_number
from bubblechart_backend.db import get_connection
from bubblechart_backend.dongchedi_sales import validated_month_table_name, _price_mean


def _resolve_df_field_mapping(columns: List[str]) -> Dict[str, str]:
    """将 DataFrame 列名映射到逻辑字段名。"""
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
        elif cl in ("date", "month", "月份", "年月", "日期"):
            take("date", col)
        elif "series" in cl and "id" in cl:
            take("seriesid", col)

    if "car_name" not in mapping and columns:
        mapping["car_name"] = columns[0]
    if "brand" not in mapping and len(columns) > 1:
        mapping["brand"] = columns[1]
    return mapping


def _infer_month_from_filename(filename: str) -> Optional[str]:
    """从文件名推断月份 YYYY-MM。"""
    patterns = [
        r"(\d{4})[-_](\d{2})",
        r"(\d{4})(\d{2})",
    ]
    for pat in patterns:
        m = re.search(pat, filename)
        if m:
            y, mo = m.group(1), m.group(2)
            if 1 <= int(mo) <= 12:
                return f"{y}-{mo}"
    return None


def _infer_month_from_data(df: pd.DataFrame, date_col: Optional[str]) -> Optional[str]:
    """从数据中的日期列推断月份。"""
    if not date_col or date_col not in df.columns:
        return None
    for val in df[date_col].dropna().astype(str).head(20):
        val = val.strip()
        m = re.match(r"(\d{4})[-/年\\s]*(\d{2})", val)
        if m:
            y, mo = m.group(1), m.group(2)
            if 1 <= int(mo) <= 12:
                return f"{y}-{mo}"
    return None


def _clean_sales(value: Any) -> int:
    """清洗销量字段。"""
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


def _clean_price(value: Any) -> float:
    """清洗价格字段，返回均价（万）。"""
    if value is None:
        return 0.0
    s = str(value).strip()
    if not s:
        return 0.0
    pm = _price_mean(s)
    if pm is not None:
        return float(pm)
    try:
        return round(float(re.sub(r"[^\d.]", "", s)), 2)
    except (ValueError, TypeError):
        return 0.0


def _create_month_table(conn: sqlite3.Connection, table: str) -> None:
    """创建懂车帝风格的月份分表（如果不存在）。"""
    conn.execute(
        f'''CREATE TABLE IF NOT EXISTS "{table}" (
            seriesid TEXT,
            car_name TEXT,
            brand TEXT,
            level TEXT,
            price_range TEXT,
            price_avg REAL,
            sales_num TEXT,
            dcf_score_link TEXT,
            date TEXT
        )'''
    )


def _stable_id(brand: str, model: str, month_iso: str) -> str:
    """为没有 seriesid 的记录生成稳定 ID。"""
    h = hashlib.sha1(f"{month_iso}|{brand}|{model}".encode("utf-8")).hexdigest()[:14]
    return f"anon-{h}"


def import_file_to_db(
    db_path: Path,
    file_bytes: bytes,
    filename: str,
    month_hint: Optional[str] = None,
) -> Dict[str, Any]:
    """
    将上传的 CSV/Excel 文件导入 SQLite 数据库。
    返回 {"ok": bool, "month"?: str, "rowCount"?: int, "message"?: str, "error"?: str}
    """
    ext = filename.lower()
    try:
        if ext.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_bytes), dtype=str, keep_default_na=False)
        elif ext.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(file_bytes), dtype=str, keep_default_na=False)
        else:
            return {"ok": False, "error": "不支持的文件格式，请上传 .csv 或 .xlsx/.xls"}
    except Exception as e:
        return {"ok": False, "error": f"文件解析失败: {e}"}

    if df.empty:
        return {"ok": False, "error": "文件为空，没有可导入的数据"}

    columns = list(df.columns)
    mapping = _resolve_df_field_mapping(columns)

    # 检查必需字段
    required = ["car_name", "brand", "sales_num"]
    missing = [f for f in required if f not in mapping]
    if missing:
        return {
            "ok": False,
            "error": f"无法识别必需列: {', '.join(missing)}。请确保文件包含车型、品牌、销量字段。",
        }

    # 推断月份
    month_iso: Optional[str] = None
    if month_hint:
        hint = month_hint.strip()
        if validated_month_table_name(hint):
            month_iso = hint

    if not month_iso:
        month_iso = _infer_month_from_filename(filename)

    if not month_iso:
        date_col = mapping.get("date")
        month_iso = _infer_month_from_data(df, date_col)

    if not month_iso:
        now = datetime.datetime.now()
        month_iso = f"{now.year}-{now.month:02d}"

    table = validated_month_table_name(month_iso)
    if not table:
        return {"ok": False, "error": f"无法确定有效的月份: {month_iso}"}

    # 数据清洗与转换
    rows: List[Tuple] = []
    for _, raw in df.iterrows():
        rec = {logical: raw.get(orig, "") for logical, orig in mapping.items()}
        brand = str(rec.get("brand") or "").strip()
        model = str(rec.get("car_name") or "").strip()
        seriesid = str(rec.get("seriesid") or "").strip()
        if not seriesid:
            seriesid = _stable_id(brand, model, month_iso)
        level = str(rec.get("level") or "").strip() or "未知"
        price_range = str(rec.get("price_range") or "").strip() or None
        price_avg = _clean_price(rec.get("price_avg"))
        sales_num = str(_clean_sales(rec.get("sales_num")))
        date_str = month_iso

        rows.append(
            (seriesid, model, brand, level, price_range, price_avg, sales_num, None, date_str)
        )

    # 写入数据库
    try:
        conn = get_connection(False, db_path)
        try:
            _create_month_table(conn, table)
            conn.execute(f'DELETE FROM "{table}"')
            conn.executemany(
                f'INSERT INTO "{table}" '
                '(seriesid, car_name, brand, level, price_range, price_avg, sales_num, dcf_score_link, date) '
                'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                rows,
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        return {"ok": False, "error": f"数据库写入失败: {e}"}

    return {
        "ok": True,
        "month": month_iso,
        "rowCount": len(rows),
        "message": f"成功导入 {len(rows)} 条记录到 {month_iso}",
    }
