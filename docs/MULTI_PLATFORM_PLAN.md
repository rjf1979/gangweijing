# 多端混合演进方案（MULTI_PLATFORM_PLAN）

> 目标：在不动后端 API 的前提下，让「岗位镜」同时覆盖 Web、微信小程序、iOS/Android App。
> 路线：混合演进 —— 短期快速上线（套壳），中期按需原生增量（uni-app），长期看数据决定 App 原生化。

## 一、架构总览（现状对多端友好）

- 后端：Node/Express 纯 REST API（登录/简历/岗位/报告），前端是 3 个静态文件，**前后端完全解耦**。
- 结论：**后端 API 一字不改**，三端前端各自实现、共享同一套 API 与数据库。

```
┌────────────┐   ┌──────────────────┐   ┌───────────────────┐
│  Web (现状) │   │ 微信小程序 (uni-app)│   │ App (Capacitor/uni)│
│ 原生 JS     │   │ Vue3 一套代码      │   │ 初期套壳→按需原生    │
└─────┬──────┘   └────────┬─────────┘   └─────────┬─────────┘
      └───────────────────┼───────────────────────┘
                  ┌────────▼────────┐
                  │ REST API (server.js) │
                  └────────┬────────┘
                           │
                  ┌────────▼────────┐
                  │ PostgreSQL / db.js │
                  └─────────────────┘
```

## 二、阶段划分

### 阶段 1：快速上线（几天，零框架改造）
- **App**：Capacitor 套壳现有 Web（现有 H5 已响应式），打包 iOS/Android。
- **小程序**：企业主体下用 web-view 内嵌 H5（个人主体不支持 web-view，需改为阶段 2 直上）。
- 后端不动；验证需求与留存。

### 阶段 2：核心业务原生增量（uni-app，1-2 周）
- 用 **uni-app（Vue3）** 新建小程序工程，复用后端 API，先迁移主流程：
  1. 登录（先邮箱密码；后续加微信登录）
  2. 简历上传（uni.uploadFile → 复用 /api/extract/resume）
  3. 岗位截图识别（uni.chooseImage → /api/extract/screenshot）
  4. 生成报告 / 报告列表 / 分享
- Web 保持现状，与 uni-app 并存；H5 端由 uni-app 编译产物后续可替换。

### 阶段 3：按需演进（长期）
- 小程序原生能力：订阅消息、分享卡片、微信支付（如需）。
- App 原生化：仅当 App 留存/性能数据支持时，用 uni-app 的 App 端或原生工程重做。

## 三、技术选型

- 前端多端框架：**uni-app + Vue3（Vite）**，理由：
  - 微信小程序兼容中文生态最成熟；
  - Vue3 对现有原生 JS 团队迁移门槛低；
  - 一套代码可编译 H5/小程序/App，Web 可渐进替换；
  - 后端 API 零改动。
- 备选：Taro(React)（若团队更熟 React 再评估）。

## 四、页面/组件映射（由现有 app.js 功能推导）

| 现有功能 | uni-app 页面 | 后端 API |
|---|---|---|
| 登录/注册/邮箱验证 | pages/auth/index | /api/login /api/register /api/session /api/verify-email |
| 简历上传/粘贴 | pages/resume/index | /api/extract/resume /api/resume |
| 事实确认 | pages/facts/index | /api/resume(PUT) |
| 岗位截图/粘贴+分析 | pages/job/index | /api/extract/screenshot /api/analyze |
| 报告查看/分享 | pages/report/index | /api/reports /api/reports/:token |
| 我的简历/我的报告 | pages/my/index | /api/resume /api/reports |

## 五、后端补充需求（阶段 2 起，向后兼容新增）

- 微信登录：GET /api/auth/wechat (code2session → 绑定/创建用户)，与邮箱密码并存。
- 上传接口已兼容 multipart，小程序 uni.uploadFile 可直接复用。
- CORS/域名：小程序 request 需配合法域名（https + ICP 备案），生产域名 gwj.zhicha.io 需在微信后台配置。

## 六、待确认决策

1. 微信小程序主体：企业 / 个人？（决定阶段 1 web-view 是否可行）
2. App 目标：双端都要，还是先 Android？
3. uni-app 工程放仓库内子目录（推荐 miniapp/）还是独立仓库？
4. 是否需要微信登录（阶段 2）或先只做邮箱密码？

## 七、风险

- 小程序包体积限制（主包 2MB）→ 分包规划。
- web-view 内嵌 H5 体验一般 → 阶段 2 原生页面替代。
- 现有 AI 分析为同步请求（刷新丢失）→ 多端统一改为异步任务 + 轮询（独立优化项）。
- 上架合规（隐私、备案、开发者账号）。

## 八、目录工程化落地（2026-08-07）

- 决策 3 已落地：uni-app 工程从 miniapp/ 移入 **web/**，与 **server/** 并列管理；仓库根只保留 README/LICENSE/.gitignore/docs/.codex。
- 旧 Web 三件套（index.html/app.js/styles.css）归档至 web/legacy/，保留参考不再维护。
- 计划文档与样式参考统一归入 docs/。
- **PC/H5 适配**：globalStyle 增加 rpx 宽屏换算（rpxCalcMaxDeviceWidth 1920、rpxCalcBaseDeviceWidth 750）；App.vue 增加 ≥768px 媒体查询（.page max-width 880px 居中、.card 收窄）——小程序与 App 端不触发，H5 宽屏居中阅读。
- **三端编译验证通过**：npm run build:h5（dist/build/h5）、build:mp-weixin（dist/build/mp-weixin）、build:app（dist/build/app）。
- **server.js 托管 H5**：静态托管 web/dist/build/h5，非 API 路径 fallback 到 H5 SPA；旧 URL 重定向 /report/:token、/verify-email/:token、/my-resume → 对应 hash 页。
- 后端 currentSession 兼容 X-Session-Token header（小程序双头，Web 不受影响）。
- 待确认：微信 appid、小程序真机合法域名配置、App 打包与上架（由用户决定）。