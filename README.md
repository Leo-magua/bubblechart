# BubbleChart_GPT

汽车配置销量气泡图：React + Vite 前端，Flask 后端，SQLite（`data/saledata.db`）。

## 目录结构

| 路径 | 说明 |
|------|------|
| `app/` | 前端（Vite + TypeScript + React） |
| `backend/` | 后端（Flask + flask-cors） |
| `data/` | 数据目录，默认放置 `saledata.db` |

## 安装依赖

### 前端

```bash
cd app
npm install
```

### 后端

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

建议使用 Python 3.10+（与 `backend/README.md` 一致）。

## 启动后端

```bash
cd backend
source .venv/bin/activate
python run.py
```

默认监听 **http://127.0.0.1:5050**。可用环境变量 `BUBBLECHART_HOST`、`BUBBLECHART_PORT` 等覆盖，详见 `backend/README.md`。

后台启动示例（不阻塞终端）：

```bash
cd backend && nohup ./.venv/bin/python run.py > ../logs-backend.log 2>&1 &
```

## 启动前端

### 开发模式（热更新，默认端口 3000）

开发服务器会把 `/api` 代理到本机 **5050** 端口的后端，请先启动后端。

```bash
cd app
npm run dev
```

浏览器访问终端里打印的本地 URL（一般为 `http://localhost:3000`）。

后台启动示例：

```bash
cd app && nohup npm run dev > ../logs-frontend-dev.log 2>&1 &
```

### 生产构建与预览

```bash
cd app
npm run build
npm run preview
```

`vite.config.ts` 中 `preview` 默认使用 **4173** 端口，并将 `/api` 代理到 `http://127.0.0.1:5050`。

若前后端不在同一机或需直连后端，可在 `app/` 下创建 `.env.local`：

```bash
VITE_API_BASE_URL=http://127.0.0.1:5050
```

未设置时，开发/预览依赖 Vite 的 `/api` 代理；空字符串表示使用相对路径（同源）。

## 导入与刷新数据

### 数据库方式（推荐）

将懂车帝风格的 `saledata.db` 放到项目根下的 `data/` 目录（或通过 `BUBBLECHART_DB_PATH` 指定路径）。重启后端后，前端会通过 `/api/months`、`/api/sales` 读取真实分表数据。

### 页面操作

- **刷新**：导航栏中的「刷新本月数据」会重新请求月份列表与当前月销量；失败时会降级为内置示例数据并提示。
- **导入**：通过「导入」打开对话框，可上传 `.csv` / `.xlsx` / `.xls`。前端调用 `POST /api/import`；若后端尚未实现该接口，界面会收到错误提示，需以后端实现为准。

### 自检接口

```bash
curl -s http://127.0.0.1:5050/api/health
curl -s http://127.0.0.1:5050/api/db
```

## 端口说明

- 后端默认 **5050**，前端开发 **3000**、预览 **4173**。
- **请勿**将本应用占用在 **81** 端口（该端口保留给 DevManager 管理界面）。

## 更多文档

后端 API 与环境变量详见 [backend/README.md](backend/README.md)。
