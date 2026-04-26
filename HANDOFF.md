# BubbleChart_GPT 交接说明

## 背景

用户诉求：

1. 在前端导航栏增加一个跳转到数据管理后台的按钮。
2. 排查“数据管理后台配置好像没有生效”的问题。
3. 后续用户反馈：“前端刷不出来了都”，随后要求停止修复，写交接文档换 agent 继续。

当前项目路径：

```text
/Users/wendy/AllProject/BubbleChart_GPT
```

项目结构要点：

- 前端：`app/`，React + Vite，默认端口 3000。
- 后端：`backend/`，Flask，默认端口 5050。
- 后台页面：后端内置 `/admin`。
- 图表配置接口：后端 `/api/config`。
- 配置文件：`data/chart_config.json`。

## 已做改动

### 1. 前端导航栏增加“数据后台”按钮

文件：

```text
app/src/sections/Navbar.tsx
```

改动：

- 引入 `Database` 图标。
- `NavbarProps` 新增 `adminHref: string`。
- 右侧操作区新增按钮：

```tsx
<a href={adminHref} target="_blank" rel="noreferrer">
  <Database className="w-3.5 h-3.5" />
  数据后台
</a>
```

### 2. 前端 API 客户端新增后台 URL 方法

文件：

```text
app/src/api/bubblechartClient.ts
```

改动：

- 保留原有 `apiBaseUrl()`。
- 新增导出：

```ts
export function adminUrl(): string {
  return `${apiBaseUrl()}/admin`;
}
```

意图：

- 如果页面路径是 `/bubblechartgpt/`，`adminUrl()` 会返回 `/bubblechartgpt/admin`。
- 如果页面路径是根路径 `/`，返回 `/admin`。

### 3. 主页面在从后台切回来时自动重新加载配置

文件：

```text
app/src/App.tsx
```

改动：

- 引入 `adminUrl`。
- 抽出 `loadChartConfig`。
- 初次加载配置，同时监听：
  - `window.focus`
  - `document.visibilitychange`
- 页面重新获得焦点且可见时重新请求 `/api/config`。

目的：

- 之前前端只在首次加载时读一次配置。
- 后台保存配置后，如果用户回到主页面但不刷新，就会感觉“配置没生效”。
- 现在切回主页面时会自动重读配置。

### 4. Vite preview 补齐 `/admin` 代理

文件：

```text
app/vite.config.ts
```

改动：

- `preview.proxy` 下新增：

```ts
"/admin": {
  target: "http://127.0.0.1:5050",
  changeOrigin: true,
},
```

原本 `server.proxy` 已经有 `/admin`，`preview.proxy` 缺这个。

## 已验证

### 构建

执行过：

```bash
cd app
npm run build
```

结果：通过。

Vite 有 chunk size warning，但不是本次问题。

### 后端接口

曾用 curl 验证：

```bash
curl -sv http://127.0.0.1:5050/api/config
curl -sv http://127.0.0.1:5050/admin
```

结果：

- `/api/config` 返回 200。
- `/admin` 返回 200。

说明当前运行中的后端已经支持配置接口和后台页面。

还做过一次等值 PUT，内容与原配置一致：

```json
{
  "config": {
    "xAxisRange": { "min": 15, "max": 60 },
    "highlightedBrandColors": {},
    "unselectedBrandColor": "#9CA3AF"
  }
}
```

返回 200，没有改变当前配置语义。

### 子路径代理

曾用 curl 验证：

```bash
curl -sv http://127.0.0.1:3000/bubblechartgpt/admin
curl -sv http://127.0.0.1:3000/bubblechartgpt/api/config
```

结果：

- `/bubblechartgpt/admin` 返回 200。
- `/bubblechartgpt/api/config` 返回 200。

## 当前问题：前端刷不出来

用户反馈后，排查到一个非常明确的问题：

访问：

```text
http://127.0.0.1:3000/bubblechartgpt/
```

返回的 HTML 中资源路径是：

```html
<script type="module" crossorigin src="/assets/index-FL3t2ZIP.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-BCvdwauj.css">
```

但是当前 3000 服务配置的 public base 是：

```text
/bubblechartgpt/
```

直接访问：

```text
http://127.0.0.1:3000/assets/index-FL3t2ZIP.js
```

返回 404，并提示：

```text
The server is configured with a public base URL of /bubblechartgpt/ - did you mean to visit /bubblechartgpt/assets/index-FL3t2ZIP.js instead?
```

访问：

```text
http://127.0.0.1:3000/bubblechartgpt/assets/index-FL3t2ZIP.js
```

返回 200。

因此当前白屏/刷不出来的直接原因很可能是：

```text
HTML 里引用的是 /assets/...，但服务要求资源从 /bubblechartgpt/assets/... 加载。
```

## 为什么会这样

`app/vite.config.ts` 里：

```ts
base: process.env.VITE_BASE_PATH || process.env.BASE_PATH || '/',
```

当前运行日志 `bubblechartgpt-dev.log` 显示 Vite 是以 `/bubblechartgpt/` base 启动的：

```text
VITE v7.3.0 ready
Local: http://localhost:3000/bubblechartgpt/
```

但 `app/dist/index.html` 或当前服务返回的 HTML 里仍是根路径 `/assets/...`。

可能原因：

1. 刚才执行 `npm run build` 时没有传 `BASE_PATH=/bubblechartgpt/` 或 `VITE_BASE_PATH=/bubblechartgpt/`，导致生成的 `dist/index.html` 引用根路径资源。
2. 当前 3000 服务像是在用 Vite base `/bubblechartgpt/` 提供内容，但返回了不匹配 base 的构建产物。
3. 也可能有外部 DevManager/nginx/启动脚本把根路径重定向到 `/bubblechartgpt/`，但静态产物不是用相同 base 构建的。

## 下一步建议

接手 agent 优先做这几件事：

1. 不要继续改业务代码，先恢复前端可访问。
2. 确认当前 3000 进程到底是什么启动的：

```bash
ps -ax -o pid,ppid,stat,command | rg 'BubbleChart_GPT|vite|3000'
```

如果沙箱报 `operation not permitted`，需要按环境规则申请提升权限。

3. 如果访问入口必须是 `/bubblechartgpt/`，重新用匹配 base 的方式构建：

```bash
cd /Users/wendy/AllProject/BubbleChart_GPT/app
BASE_PATH=/bubblechartgpt/ npm run build
```

或：

```bash
VITE_BASE_PATH=/bubblechartgpt/ npm run build
```

构建后检查：

```bash
sed -n '1,40p' dist/index.html
```

期望看到：

```html
src="/bubblechartgpt/assets/..."
href="/bubblechartgpt/assets/..."
```

4. 如果希望根路径 `/` 访问，则应停止用 `/bubblechartgpt/` base 启动，或者让入口改回根路径，避免 base 和访问路径不一致。

5. 当前 `app/index.html` 是开发模板，仍写着：

```html
<script type="module" src="/src/main.tsx"></script>
```

如果 dev server 用 `/bubblechartgpt/` base，Vite 通常会处理这个路径；但如果看到 HTML 里是 `/assets/...`，说明你拿到的是构建产物，不是 dev 模板。

## 需要注意

- 不要随手删除 `dist/`，除非明确知道当前服务不是依赖它。刚才用户已经因为前端不可用中断了修复。
- 当前项目根没有 `.git`，不能依赖 git 回滚。
- `npm run lint` 当前失败，但大多是既有问题，不要作为恢复前端的阻塞项。
- `npm run build` 是通过的，但要注意 base 是否正确。

## 相关文件

本次改动涉及：

```text
app/src/sections/Navbar.tsx
app/src/api/bubblechartClient.ts
app/src/App.tsx
app/vite.config.ts
```

运行/日志相关：

```text
bubblechartgpt-dev.log
logs-frontend-dev.log
logs-backend.log
app/dist/index.html
```

配置相关：

```text
data/chart_config.json
backend/bubblechart_backend/app.py
```

