# 与 /Users/wendy/Project/dongchedi/app.py 中 clean_number 一致：去逗号等非数字字符，非法则 0
import re


def clean_number(value):
    if value is None:
        return 0
    cleaned = re.sub(r"[^\d.]", "", str(value))
    try:
        if "." in cleaned:
            return float(cleaned)
        return int(cleaned)
    except (ValueError, TypeError):
        return 0
