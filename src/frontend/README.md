# 岗位镜用户端

岗位镜（candidate-fit-tool）的用户端应用，面向求职者：上传简历 → 确认事实 → 上传岗位图分析 → 生成/分享报告。

- 后端：Node.js + Express 5 + PostgreSQL（`src/frontend/server`），端口 3215，`/api/*` 接口
- 前端：uni-app + Vue3（`src/frontend/web`），一套代码编译 H5 / 微信小程序 / App；PC 端 Vue3 + Vite 双入口
- 数据：用户 / 会话 / 报告（`app_users` / `app_sessions` / `app_reports`），与管理后台（`src/admin`）共用同一 PostgreSQL 数据库

## 目录结构

```
src/frontend/
├── server/          # 核心后端：用户/会话/简历/报告 API，托管 H5 与 PC 构建产物
│   ├── server.js    # Express 入口（端口 3215，读取 public/h5、public/pc）
│   ├── db.js        # PostgreSQL 读写
│   ├── scripts/     # 数据迁移等脚本
│   └── .env.example # 环境变量示例
└── web/             # 用户端前端：uni-app（H5/小程序/App）+ PC 版
    ├── src/pages/   # 移动端页面（uni-app）
    ├── src/pc/      # PC 端（Vue3 + Vite）
    └── vite.config.js / vite.pc.config.js
```

## 快速开始

### 1. 后端

```bash
cd src/frontend/server
cp .env.example .env   # 填入数据库连接与 AI/邮件密钥
npm install
npm run dev            # http://127.0.0.1:3215
```

### 2. 前端（H5 / 小程序 / App）

```bash
cd src/frontend/web
npm install
npm run dev:h5            # H5 开发（vite 代理到 127.0.0.1:3215）
npm run build:h5          # 构建 H5 → dist/build/h5
npm run build:mp-weixin   # 构建微信小程序 → dist/build/mp-weixin（微信开发者工具导入）
npm run build:app         # 构建 App 资源 → dist/build/app（HBuilderX 导入打包）
```

### 3. 前端（PC 版）

```bash
cd src/frontend/web
npm run dev:pc            # PC 开发（vite）
npm run build:pc          # 构建 PC → dist/build/pc
```

生产部署时，将 H5 产物拷至 `src/frontend/server/public/h5`、PC 产物拷至 `src/frontend/server/public/pc`，后端自动托管（server.js 按 UA 分流 H5 / PC）。

## 功能模块

- 用户：注册 / 登录（邮箱验证）、会话管理（H5 Cookie；小程序/App 手动 Token）
- 简历：上传解析（docx / pdf）、文本编辑保存、原始文件保留归档（存储于 server/.runtime/resume-files/<用户ID>/，磁盘用 UUID 命名，原名存库，供管理后台预览/下载）
- 岗位：上传招聘截图，AI 识别岗位信息（公司 / 岗位 / 职责 / 要求）
- 报告：AI 生成简历 × 岗位分维度分析报告，生成分享链接，邮件通知
- PC 分流：移动端访问 H5，宽屏访问 PC 版；旧 URL 兼容重定向（/report/:token、/verify-email/:token、/my-resume 等）

## 环境变量（src/frontend/server）

| 变量 | 说明 |
| --- | --- |
| `PORT` / `HOST` | 服务端口（默认 3215）/ 监听地址 |
| `APP_URL_MODE` | 数据库与公开地址选择模式：local / server |
| `LOCAL_APP_URL` / `SERVER_APP_URL` | 公开访问地址（生成报告分享链接用） |
| `DATABASE_URL_LOCAL` / `DATABASE_URL_SERVER` / `DATABASE_URL` | 数据库连接串 |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` / `OPENAI_VISION_MODEL` | AI 分析 / 截图识别 |
| `RESEND_API_KEY` / `EMAIL_FROM` | 验证邮件与报告通知邮件 |