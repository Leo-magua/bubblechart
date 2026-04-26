# 前端部署注意事项

> ⚠️ **每次修改前端代码后，构建和预览必须遵循以下步骤，否则页面会白屏。**

---

## 问题背景

本项目前端通过 **Vite** 构建，部署在子路径 `/bubblechartgpt/` 下（由 DevManager/nginx 统一代理）。

如果构建时不指定 `VITE_BASE_PATH`，`dist/index.html` 中的资源引用会是绝对路径 `/assets/...`，在子路径下访问时会因为路径不匹配而返回 HTML，导致浏览器报错：

```
Expected JavaScript module but got text/html
```

**这个问题已反复出现多次，请务必按以下流程操作。**

---

## 正确部署流程

### 1. 重新构建（必须带 base path）

```bash
cd /Users/wendy/AllProject/BubbleChart_GPT/app
VITE_BASE_PATH=/bubblechartgpt/ npm run build
```

构建完成后，**务必检查** `dist/index.html` 中的资源路径是否包含 `/bubblechartgpt/`：

```bash
grep 'src=' dist/index.html
# ✅ 正确：src="/bubblechartgpt/assets/index-xxx.js"
# ❌ 错误：src="/assets/index-xxx.js"
```

### 2. 启动预览服务（必须带同一 base path）

```bash
nohup env VITE_BASE_PATH=/bubblechartgpt/ npm run preview -- --port 4173 \
  > ../logs-frontend-preview-deploy.log 2>&1 &
```

### 3. 记录 PID（便于后续管理）

```bash
echo $! > ../.devmanager/pids/bubblechartgpt_deploy.pid
```

### 4. 验证

```bash
# 首页
curl -I http://127.0.0.1:4173/bubblechartgpt/
# → 200 text/html

# JS 资源
curl -I http://127.0.0.1:4173/bubblechartgpt/assets/index-xxx.js
# → 200 text/javascript
```

---

## 一键脚本

也可以使用以下合并命令：

```bash
cd /Users/wendy/AllProject/BubbleChart_GPT/app && \
  VITE_BASE_PATH=/bubblechartgpt/ npm run build && \
  nohup env VITE_BASE_PATH=/bubblechartgpt/ npm run preview -- --port 4173 \
    > ../logs-frontend-preview-deploy.log 2>&1 & \
  echo $! > ../.devmanager/pids/bubblechartgpt_deploy.pid && \
  echo "Preview PID: $(cat ../.devmanager/pids/bubblechartgpt_deploy.pid)"
```

---

## 常见错误

| 错误 | 原因 |
|------|------|
| 页面白屏，控制台报 `Expected JavaScript module but got text/html` | 构建或预览时缺少 `VITE_BASE_PATH=/bubblechartgpt/` |
| `npm run preview` 后 404 | 预览服务器 base path 和构建时不一致 |
| Cursor 修改后页面崩溃 | Cursor 通常不会自动带 base path 构建，修改后需手动重新部署 |

---

## 服务信息

| 项目 | 值 |
|------|-----|
| 前端目录 | `/Users/wendy/AllProject/BubbleChart_GPT/app` |
| 构建工具 | Vite |
| 预览端口 | `4173` |
| Base Path | `/bubblechartgpt/` |
| PID 文件 | `.devmanager/pids/bubblechartgpt_deploy.pid` |
| 日志文件 | `logs-frontend-preview-deploy.log` |
| 访问地址 | http://127.0.0.1:4173/bubblechartgpt/ |
