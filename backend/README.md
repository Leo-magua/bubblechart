# BubbleChart 后端（F003 骨架）

Flask + `flask-cors`，与懂车帝参考项目一致的数字清洗 `cleaning.clean_number`；默认从项目根下 `data/saledata.db` 只读探查 `month_YYYYMM` 分表。

## 环境

- Python 3.10+（建议 3.11）

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## 运行

```bash
cd backend
source .venv/bin/activate
python run.py
```

默认监听 `http://127.0.0.1:5050`。可用环境变量（可选）覆盖：

| 变量 | 说明 |
|------|------|
| `BUBBLECHART_HOST` | 默认 `127.0.0.1` |
| `BUBBLECHART_PORT` | 默认 `5050` |
| `BUBBLECHART_DEBUG` | 设为 `1` / `true` 开启调试 |
| `BUBBLECHART_PROJECT_ROOT` | 项目根目录，默认从包路径推断为 BubbleChart_GPT |
| `BUBBLECHART_DATA_DIR` | 数据目录，默认 `<项目根>/data` |
| `BUBBLECHART_DB_PATH` | SQLite 文件路径，默认 `<数据目录>/saledata.db` |
| `BUBBLECHART_DB_NAME` | 仅当未设置 `BUBBLECHART_DB_PATH` 时生效，默认 `saledata.db` |

## 接口

- `GET /api/health` — 健康检查（`ok` + `service` + `version`）
- `GET /api/months` — 自库中分表名解析的月份列表（`YYYY-MM`，新在前）
- `GET /api/sales?month=YYYY-MM` — 业务数据占位，当前返回 `items: []`；有库文件时 `source` 为 `sqlite`，否则为 `mock`
- `GET /api/db` — 开发用：数据路径与库是否存在、分表数量

将 `saledata.db` 放入 `../data/`（或配置 `BUBBLECHART_DB_PATH`）后即可被探查。库不存在时服务仍可启动。
