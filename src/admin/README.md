# 岗位镜管理后台

独立管理后台项目，用于运营岗位镜（candidate-fit-tool）的业务数据：用户、分析报告、站点设置与管理员账号。

- 后端：Node.js + Express 5 + PostgreSQL（`src/admin/server`）
- 前端：Vue 3 + Vite（`src/admin/web`），桌面端 PC 后台，独立设计，不依赖主站前端
- 数据：与主项目共用同一 PostgreSQL 数据库（`app_users` / `app_sessions` / `app_reports`），管理员体系独立（`admin_users` / `admin_sessions` / `admin_settings`）

## 目录结构

```
src/admin/
├── server/          # 后端：认证、统计、用户/报告管理、设置 API，托管前端构建产物
│   └── .env.example # 环境变量示例
└── web/             # 前端：Vue3 + Vite
    └── src/         # 页面与组件
```

## 快速开始

### 1. 后端

```bash
cd src/admin/server
cp .env.example .env   # 填入数据库连接与初始管理员账号
npm install
npm run dev            # http://127.0.0.1:3216
```

首次启动时，若 `admin_users` 为空且配置了 `ADMIN_INIT_EMAIL` / `ADMIN_INIT_PASSWORD`，会自动创建初始管理员，登录后请立即在「系统设置」中修改密码。

### 2. 前端

```bash
cd src/admin/web
npm install
npm run dev            # 开发模式，代理 /api 到 127.0.0.1:3216
npm run build          # 构建产物输出到 src/admin/web/dist
```

生产部署时，将 `src/admin/web/dist` 拷贝到 `src/admin/server/dist`（或直接构建到该目录），后端自动托管。

## 功能模块

- 统计概览：用户/报告总量与今日、本周增量，近 14 天趋势，最新动态
- 用户管理：搜索、查看详情（简历与报告）、原始简历文件维护（预览 / 下载 / 删除）、删除用户（级联清理其简历文件目录）
- 报告管理：搜索与状态筛选、查看报告内容、删除报告
- 系统设置：站点基础设置、管理员账号管理、改密码、环境服务状态查看
- AI 分析配置：在后台直接维护 OpenAI 兼容接口的 API Key / Base URL / 对话模型 / 视觉模型，保存后主服务即时生效（主服务未配置时使用环境变量兜底）
- 邮件配置（Resend）：在后台直接维护 Resend API Key 与发件人地址，用于发送分析报告邮件，保存后主服务即时生效（环境变量兜底）
- 密钥安全：密钥写入数据库后永不回传明文，仅以掩码展示；留空不修改，显式勾选「清除」才会清空

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `PORT` | 服务端口，默认 3216 |
| `HOST` | 监听地址，默认 127.0.0.1 |
| `DATABASE_URL_LOCAL` / `DATABASE_URL_SERVER` / `DATABASE_URL` | 数据库连接串 |
| `APP_URL_MODE` | 数据库选择模式：local / server |
| `ADMIN_INIT_EMAIL` / `ADMIN_INIT_PASSWORD` | 初始管理员账号（仅空表时创建） |
| `FRONTEND_DATA_DIR` | 用户端简历原文件目录（相对 src/admin/server 解析，默认 `../../frontend/server/.runtime`；部署时用户端 .runtime 不在默认位置才需要设置） |
| `OPENAI_*` / `RESEND_*` / `EMAIL_FROM` | 主服务环境变量，作为 AI / 邮件配置的兜底；后台数据库配置优先 |