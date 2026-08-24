# 记账高手 · 家庭共享版 —— 部署指南

一个零依赖的 Node 后端 + PWA 前端，夫妻两台手机打开同一链接即可实时共享同一本账。

## 目录说明
- `server.js` —— 同步后端（也顺带托管前端静态文件，无需额外 Web 服务器）
- `public/` —— PWA 前端（index.html / manifest / sw.js / icon.svg）
- `seed.json` —— 初始账本种子（2026 年 1–7 月历史数据 + 期初 196826.82）
- `data/` —— 运行时各家庭房间账本（自动生成，已 gitignore）

## 运行方式
```bash
node server.js          # 默认端口 3000；可用 PORT 环境变量覆盖
```
打开 `http://localhost:3000/` 即 APP。手机访问用服务器公网地址。

## 一键部署到免费云主机

### 方案 A：Render（推荐，免费、无需信用卡）
1. 把本目录内容推到一个 GitHub 仓库（公开/私有均可）。
2. 打开 https://render.com → 注册（可用 GitHub 登录，无需信用卡）。
3. New → Blueprint → 连接该仓库 → Render 自动读取 `render.yaml` → Create。
4. 约 1 分钟部署完成，得到固定地址 `https://jizhang-gongxiang-xxx.onrender.com`。
   - 免费实例 15 分钟无访问会休眠，首次打开稍慢（几秒唤醒），之后正常。
   - 链接**固定不变**，可直接发给老婆。

### 方案 B：Koyeb（免费、无需信用卡）
1. 推到 GitHub 仓库。
2. https://koyeb.com → 用 GitHub 登录 → Create App → 选仓库 → 运行命令填 `node server.js` → Deploy。
3. 得到固定地址 `https://xxxx.koyeb.app`。

### 方案 C：你有自己的服务器 / VPS
```bash
# 上传本目录后
npm install   # 其实零依赖可省，但保险
node server.js
# 或用 Docker
docker build -t jizhang . && docker run -d -p 3000:3000 jizhang
```
再配个反向代理（Nginx/Caddy）+ 域名即可。

## ⚠️ 关于云端数据存储（重要）
- 账本以文件存在服务器 `data/` 目录。免费云主机的磁盘在**每次重新部署时会被重置**，
  但 `seed.json` 在仓库里，所以**历史账单（2026 年 1–7 月）会在重新部署后自动重建**。
- 部署后新增的家庭记录建议**定期在 APP 内「设置 → 导出备份」**留存 JSON，重装/迁移时「导入备份」即可。
- 如需云端持久化，可在 Render 上挂一个 Disk，或在 APP 里养成每月导出备份的习惯。

## 手机使用
1. 用手机浏览器打开部署得到的地址（或房间邀请链接 `?room=xxx`）。
2. 浏览器菜单 →「添加到主屏幕」→ 桌面出现 APP 图标，全屏使用，像原生应用。
3. 双方打开同一房间链接，谁记一笔对方约 20 秒内可见，顶部显示同步状态。
