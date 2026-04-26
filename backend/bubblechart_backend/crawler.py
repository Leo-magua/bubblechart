"""
懂车帝销量榜抓取模块。
改编自 /Users/wendy/Project/dongchedi/create_car_sales_db.py
"""
from __future__ import annotations

import re
import sqlite3
import time
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple


def price_mean(price_str: Optional[str]) -> Optional[float]:
    """从「x-y万」「x万」解析均价（万）。"""
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


def get_month_list(start: str, end: str) -> List[str]:
    """生成 YYYYMM 月份列表（含首尾）。"""
    months: List[str] = []
    start_dt = datetime.strptime(start, "%Y%m")
    end_dt = datetime.strptime(end, "%Y%m")
    cur_dt = start_dt
    while cur_dt <= end_dt:
        months.append(cur_dt.strftime("%Y%m"))
        if cur_dt.month == 12:
            cur_dt = cur_dt.replace(year=cur_dt.year + 1, month=1)
        else:
            cur_dt = cur_dt.replace(month=cur_dt.month + 1)
    return months


def create_table_if_not_exists(conn: sqlite3.Connection, table_name: str) -> None:
    cursor = conn.cursor()
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS {table_name} (
            seriesid TEXT,
            car_name TEXT,
            brand TEXT,
            level TEXT,
            price_range TEXT,
            price_avg REAL,
            sales_num TEXT,
            dcf_score_link TEXT,
            date TEXT
        )
    """)
    conn.commit()


def save_to_db(conn: sqlite3.Connection, table_name: str, data: List[Tuple]) -> None:
    cursor = conn.cursor()
    cursor.executemany(f"""
        INSERT INTO {table_name} (seriesid, car_name, brand, level, price_range, price_avg, sales_num, dcf_score_link, date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, data)
    conn.commit()


def crawl_one_month(
    db_path: Path,
    date_str: str,
    headless: bool = True,
    progress_callback: Optional[callable] = None,
) -> dict:
    """
    抓取单月懂车帝销量榜并写入 db_path。
    返回 {"success": bool, "month": str, "count": int, "message": str}
    """
    from playwright.sync_api import sync_playwright
    from bs4 import BeautifulSoup

    conn = sqlite3.connect(str(db_path))
    table_name = f"month_{date_str}"
    create_table_if_not_exists(conn, table_name)

    url = f"https://www.dongchedi.com/sales/sale-x-{date_str}-x-x-x-x"
    all_car_names: set = set()
    scroll_count = 0
    data_to_save: List[Tuple] = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=headless,
                args=[
                    "--disable-features=DownloadBubble,DownloadBubbleV2",
                    "--disable-popup-blocking",
                ],
            )
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 800},
                accept_downloads=False,
            )
            page = context.new_page()
            page.on("download", lambda download: download.cancel())
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(2000)

            while True:
                page.evaluate("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(1.5)
                html = page.content()
                soup = BeautifulSoup(html, "html.parser")
                car_blocks = soup.find_all("div", class_="tw-py-16 tw-pr-12")
                sales_blocks = soup.find_all("div", class_="tw-py-16 tw-text-center")

                new_count = 0
                for car, sales in zip(car_blocks, sales_blocks):
                    a_tag = car.find("a", class_="tw-font-semibold")
                    if not a_tag:
                        continue
                    car_name = a_tag.get_text(strip=True)

                    seriesid = None
                    href = a_tag.get("href", "")
                    match_series = re.search(r"/auto/series/(\d+)", href)
                    if match_series:
                        seriesid = match_series.group(1)

                    if car_name in all_car_names:
                        continue
                    all_car_names.add(car_name)

                    brand_level_text = car.find("span", class_="tw-text-12").get_text(strip=True)
                    brand = ""
                    level = ""
                    if "/" in brand_level_text:
                        parts = brand_level_text.split("/", 1)
                        brand = parts[0].strip()
                        level = parts[1].strip() if len(parts) > 1 else ""
                    else:
                        brand = brand_level_text.strip()

                    price = car.find("p", class_="tw-leading-22").get_text(strip=True)
                    price_avg = price_mean(price)

                    links = car.find_all("a")
                    dcf_score_link = ""
                    for a in links:
                        if "懂车分" in a.get_text():
                            dcf_score_link = "https://www.dongchedi.com" + a["href"]
                            break

                    sales_num = sales.find("p", class_="tw-text-18").get_text(strip=True)
                    data_to_save.append(
                        (seriesid, car_name, brand, level, price, price_avg, sales_num, dcf_score_link, date_str)
                    )
                    new_count += 1

                scroll_count += 1
                msg = f"第{scroll_count}次下拉，本次新采集{new_count}条，累计{len(all_car_names)}条。"
                if progress_callback:
                    progress_callback(msg)

                if new_count == 0:
                    break

                last_height = page.evaluate("document.body.scrollHeight")
                page.evaluate("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(0.5)
                new_height = page.evaluate("document.body.scrollHeight")
                if new_height == last_height:
                    break

            browser.close()

        # 先清空旧数据再写入（避免重复）
        conn.execute(f"DELETE FROM {table_name}")
        save_to_db(conn, table_name, data_to_save)
        conn.close()
        return {
            "success": True,
            "month": date_str,
            "count": len(all_car_names),
            "message": f"{table_name} 采集完成，共 {len(all_car_names)} 条。",
        }
    except Exception as e:
        conn.close()
        return {
            "success": False,
            "month": date_str,
            "count": 0,
            "message": f"采集 {date_str} 出错：{e}",
        }


def crawl_months(
    db_path: Path,
    months: List[str],
    headless: bool = True,
    progress_callback: Optional[callable] = None,
) -> List[dict]:
    """批量抓取多个月份。"""
    results: List[dict] = []
    for m in months:
        if progress_callback:
            progress_callback(f"开始采集 {m}...")
        res = crawl_one_month(db_path, m, headless=headless, progress_callback=progress_callback)
        results.append(res)
    return results
