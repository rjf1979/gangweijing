# 岗位镜（gangweijing）

AI 求职材料审阅工具：上传简历 → 确认事实 → 上传岗位图分析 → 生成/分享报告。

## 目录结构

```
candidate-fit-tool/
├── server/   # 后端 Node/Express：server.js、db.js、.env、scripts/、traineddata/
├── web/      # 前端 uni-app + Vue3：一套代码编译 H5 / 微信小程序 / App
│   └── legacy/   # 旧版 Web 三件套归档（index.html / app.js / styles.css）
├── docs/     # 产品与开发文档（多端方案、UI 改造、产品流程等）
└── .codex/   # 项目记忆（memory/）
```

## 后端（server/）

```bash
cd server
npm install
node --env-file=.env server.js   # 默认端口 3215（PORT 可覆盖）
```

- API 前缀 `/api/*`；生产域名 https://gwj.zhicha.io（发布由用户决定）。
- server.js 同时托管 H5 构建产物（web/dist/build/h5），并兼容旧 URL 重定向（/report/:token、/verify-email/:token、/my-resume 等）。

## 前端（web/）

uni-app + Vue3 工程，一套代码多端编译，PC（宽屏）与移动端自适应；H5 亦兼容微信小程序与 App 打包。

```bash
cd web
npm install
npm run dev:h5            # H5 开发（vite 代理到 127.0.0.1:3215）
npm run build:h5          # 构建 H5 → dist/build/h5（server 直接托管）
npm run build:mp-weixin   # 构建微信小程序 → dist/build/mp-weixin（微信开发者工具导入）
npm run build:app         # 构建 App 资源 → dist/build/app（HBuilderX 导入打包）
```

- 页面：首页 / 登录注册（邮箱验证）/ 上传简历 / 事实确认 / 岗位分析 / 报告列表 / 报告详情 / 我的。
- PC 适配：全局 rpx 宽屏换算（rpxCalcMaxDeviceWidth 1920）+ 媒体查询（≥768px 内容区居中、最大宽 880px）。

## 文档（docs/）

- MULTI_PLATFORM_PLAN.md — 多端混合演进方案
- UI_REDESIGN_PLAN.md — Neo-brutalist UI 改造计划
- DEVELOPMENT_PLAN.md / PRODUCT_FLOWS.md — 开发计划与产品流程