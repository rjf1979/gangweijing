﻿# 简历结构模板（按职业区分）设计文档

> 状态：设计完成 + 管理后台查看已上线 + 差异化排版渲染 + 岗位-简历职业联动（2026-08-09）
> 说明：本设计是「上传简历文字对号入座」的结构蓝本。当前阶段先在管理后台查看结构，
> 后续业务实现按职业选择模板，把上传简历归入对应区块字段。

## 一、网络调研结论（最详细的简历结构信息）

### 1. 国际标准 JSON Resume（jsonresume.org/schema）
顶层字段：`basics`、`work`、`volunteer`、`education`、`awards`、`certificates`、
`publications`、`skills`、`languages`、`interests`、`references`、`projects`、`meta`

- `basics`：name / label / image / email / phone / url / summary / location / profiles
- `work`：name / position / url / startDate / endDate / summary / highlights
- `education`：institution / url / area / studyType / startDate / endDate / score / courses
- `skills`：name / level / keywords
- `projects`：name / description / highlights / keywords / dates / url / roles / entity / type

### 2. FRESH Resume Schema（github.com/dvaneson/fresh-resume-schema）
在 JSON Resume 基础上扩展：affiliation（社团/协会）、service（志愿/军旅）、
samples（作品集）、social、testimonials、extracurricular、writing/reading/speaking 等。

### 3. 中文简历学术惯例（《中文简历解析及招聘需求匹配算法研究》）
层次化六类：个人基本信息、求职意向、自我评价、教育经历、工作经历、其它信息
（其它信息含项目 / 技能 / 证书 / 奖励）。

### 4. 行业招聘实践（按职业差异）
| 职业 | 结构要点 |
| --- | --- |
| 技术/互联网 | 技术栈前置分类（语言/框架/工具/平台）；项目用「技术难点+方案+量化结果」；GitHub/博客加分 |
| 金融/财会 | 资质证书置顶（CPA/CFA/FRM/从业资格）；财务语言量化；Bloomberg/Wind/SAP/Python 熟练度 |
| 销售/市场 | 业绩数据前置（销售额/达成率/排名）；客户开发→商机→客户成功闭环；ROI/CAC/转化率 |
| 产品/运营 | 项目按「问题-方案-验证」；DAU/转化率/留存/GMV 量化；B端/C端/数据产品侧重不同 |
| 职能支持 | HR：招聘周期/试用期通过率；行政：成本控制；法务：合同审核周期/风险规避 |
| 应届生 | 教育前置；实习与校园实践 STAR；突出潜力与学习能力 |
| 设计岗 | 作品集优先；风格标签；布局灵活 |
| 医疗/教育 | 执业资格、临床经验、科研成果、手术/教学案例 |
| 管理岗 | 团队规模/管理幅度、0到1落地、战略/组织/人才培养 |

### 5. 简历智能解析行业实践（textin 方案）
三层链路：版式解析（标题/段落/列表/坐标）→ 文档理解（语言/版式/模块分布）→
结构化抽取（统一字段 schema）。核心字段稳定 + 扩展字段可保留、结果可溯源、
规则归一化（手机号/邮箱/日期/学历）。

## 二、设计：按职业区分的简历结构模板

### 数据来源
- 管理后台：`src/admin/web/src/data/resumeStructureTemplates.js`（后台查看页数据源）
- 现有系统区块模型：`src/frontend/web/src/pc/utils/resumeBlocks.js`
  - `BLOCK_DEFS`（8 个通用区块）：summary / work_experience / project_experience /
    education / skills / certificates / awards / self_evaluation
  - `FREE_TITLES`（自由区块）：培训经历、社团活动、志愿者、公益、专利、论文、著作、
    学术成果、开源项目、个人作品、语言能力、兴趣爱好、个人特长、附加信息

### 区块全集（21 类，85 个结构化字段）
基本信息(页眉)、求职意向、个人摘要、自我评价、工作经历、项目经历、教育经历、
技能特长、证书资质、获奖荣誉、培训经历、语言能力、志愿/公益、社团/校园活动、
论文/著作/学术成果、专利、个人作品/作品集、开源项目、兴趣爱好、推荐人/证明人、附加信息。

每个区块统一含：识别标题别名、渲染类型（页眉/文本/列表/行/技能）、关键字段
（字段名/中文名/类型/必备与否）、撰写说明、系统映射（现有通用区块/自由区块/结构化基础/需扩展）。

### 10 个职业模板
| 模板 | 区块数 | 结构要点 |
| --- | --- | --- |
| 技术/研发 | 12 | 技术栈+项目前置；开源/作品/论文加分 |
| 产品/运营 | 10 | 项目「问题-方案-验证」；数据量化 |
| 销售/市场 | 10 | 业绩前置；销售闭环 |
| 金融/财会 | 10 | 证书置顶；财务语言 |
| 设计/创意 | 10 | 作品集置顶；版式灵活 |
| 职能支持 | 9 | HR/行政/法务专业流程 |
| 医疗/教育/科研 | 10 | 执业资格置顶；临床/科研 |
| 应届生/实习生 | 14 | 求职意向前置；教育前置；STAR |
| 管理岗 | 10 | 管理成果；推荐人 |
| 通用/综合 | 10 | 默认兜底，与 BLOCK_DEFS 顺序一致 |

每个模板含：职业画像描述、识别关键词（后续用于岗位/简历自动匹配职业）、
推荐区块顺序（含必备标记）、撰写与渲染重点。

## 三、后台查看（本次交付）

- 路由：`/admin/resume-templates`（菜单「简历结构」，位于报告管理之后）
- 页面：`src/admin/web/src/views/ResumeStructureView.vue`
- 功能：职业切换（tab，键盘可用）、关键词搜索过滤、区块顺序明细
  （别名/字段表/必备标记/系统映射）、职业画像与关键词、撰写渲染重点、版式示意预览、
  全部展开/收起
- 数据：`src/admin/web/src/data/resumeStructureTemplates.js`（静态配置，无需后端改动）

## 四、业务实现（已确认，开发进行中）

### 已完成

1. **职业识别模块**（`src/frontend/server/resumeOccupation.js`）
   - 10 职业关键词（权重 strong=3 / medium=2 / weak=1），标题命中加权
   - 应届生结构化信号加成（无全职 + 近 3 年教育）
   - `detectOccupation(text, structured)` / `withOccupation(structured, text)` / `occupationName(id)`
   - 返回 `{ id, name, confidence, score, matchedKeywords, boost }`；低信号兜底 general
2. **结构化 schema v2 字段扩展**（`src/frontend/server/server.js` + `resumeParse.js`）
   - 新增：job_intention、training、languages、volunteer、social、publications、patents、portfolio、open_source、interests、references
   - 上传/解析/保存均写入 occupation；旧数据读取时按文本实时识别（不落库）
   - 本地版式解析支持全部自由区块标题（对象数组 / 字符串数组两种存储）
3. **前端渲染适配**（`resumeBlocks.js` / `ResumeHtmlView.vue` / `resumePrint.js` / `styles.css`）
   - buildBlocks 返回 occupation，按职业模板对命中区块打 emphasis 标注（不改原文顺序）
   - 屏幕版 + 打印版顶部输出「职业模板」徽标（名称 + 置信度 + 命中关键词）
   - 强调区块左侧强调条 + 浅色底（`--rh-*` 商务变量）
4. **管理后台展示**（`src/admin/server/server.js` / `UserDetailView.vue`）
   - 用户详情返回 `resumeStructured`；新增「简历结构匹配」卡片
   - 显示职业模板徽章、匹配置信度、命中关键词、19 个结构化区块对号入座概览
   - 旧数据无 occupation 显示「未识别」
5. **差异化排版渲染**（`resumeBlocks.js` / `ResumeHtmlView.vue` / `resumePrint.js` / `styles.css`）
   - EMPHASIS_SECTIONS 升级为 core / secondary 两级分级（10 个职业模板全覆盖）
   - 核心区块=粗强调条+深色底；次级区块=细强调条+浅色底；不改原文顺序与内容
6. **岗位-简历职业联动**（`server.js` / `ReportContent.vue` / `ShareReportView.vue`）
   - `/api/analyze` 记录 `jobOccupation`（岗位文本识别）+ `resumeOccupation`（简历职业快照）
   - `/api/reports/:token` 返回两字段；报告页顶部职业一致性提示条（一致 / 差异 / 单侧识别）
7. **多职业样本回归验证**
   - `.codex/tmp/test_occupation_emphasis.mjs`：11 例职业识别 + 10 模板强调分级（文本路径）+ references / job_intention 结构化兜底路径 = 23 项全通过

### 待办 / 后续

1. （可选增强）按职业模板对区块排序 / 置顶：当前仅做强调分级，不动用户原文顺序，后续如需可增加「模板推荐顺序」开关
2. 更多真实简历样本持续回归（扩充 `.codex/tmp/test_occupation_emphasis.mjs` 用例库）
