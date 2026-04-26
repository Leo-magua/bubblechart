# SQLite 读取：默认识别懂车帝分表 month_{YYYYMM}，供 /api/months 与后续 /api/sales
import re
import sqlite3
from pathlib import Path
from typing import List, Optional, Tuple

_MONTH_TABLE = re.compile(r"^month_(\d{6})$")


def db_exists(path: Path) -> bool:
    return path.is_file() and path.stat().st_size > 0


def get_connection(readonly: bool, db_path: Path) -> sqlite3.Connection:
    if readonly:
        uri = f"file:{db_path}?mode=ro"
        return sqlite3.connect(uri, uri=True)
    return sqlite3.connect(str(db_path))


def _parse_month_to_iso(name: str) -> Optional[str]:
    m = _MONTH_TABLE.match(name)
    if not m:
        return None
    yyyymm = m.group(1)
    return f"{yyyymm[:4]}-{yyyymm[4:6]}"


def list_dongchedi_style_months(db_path: Path) -> List[str]:
    """从 sqlite 中找出 month_YYYYMM 表，返回 YYYY-MM 降序（最新在前）。"""
    if not db_exists(db_path):
        return []
    try:
        conn = get_connection(True, db_path)
    except OSError:
        return []
    try:
        cur = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
        names = [row[0] for row in cur.fetchall()]
    finally:
        conn.close()

    months: List[Tuple[str, str]] = []
    for n in names:
        iso = _parse_month_to_iso(n)
        if iso:
            months.append((n, iso))
    # 按表名中的 YYYYMM 数值降序
    months.sort(key=lambda x: x[0], reverse=True)
    return [iso for _, iso in months]
