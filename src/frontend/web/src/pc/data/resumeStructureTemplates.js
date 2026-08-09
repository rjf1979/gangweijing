// ============================================================
// 按职业区分的简历结构模板目录（后台管理系统查看用）
// ------------------------------------------------------------
// 设计依据：
//  1. 国际标准：JSON Resume Schema（basics/work/education/skills/certificates/
//     publications/languages/interests/references/projects…）
//  2. FRESH Resume Schema（扩展 affiliation/service/samples/testimonials…）
//  3. 中文简历学术惯例（个人基本信息 / 求职意向 / 自我评价 / 教育经历 /
//     工作经历 / 其它信息 六类分层）
//  4. 现有系统区块模型：BLOCK_DEFS（8 个通用区块）+ FREE_TITLES（自由区块）
//     （见 src/frontend/web/src/pc/utils/resumeBlocks.js）
//  5. 行业招聘实践：技术 / 产品运营 / 销售市场 / 金融财会 / 设计创意 /
//     职能支持 / 医疗教育 / 应届生 / 管理岗 的差异化撰写重点
//
// 该目录是“简历结构对号入座”的蓝本：后续解析/业务实现按职业选择结构，
// 把上传简历的文字归入对应区块字段。当前阶段仅用于后台查看结构。
// ============================================================

// ---------- 区块渲染类型 ----------
export const KIND_LABELS = {
  header: '页眉',
  text: '文本',
  list: '列表',
  lines: '行',
  skills: '技能',
}

// 系统映射状态：block=现有通用区块 / free=现有自由区块 / basic=结构化基础信息 / new=需扩展
export const SYSTEM_MAP_LABELS = {
  block: '现有通用区块',
  free: '现有自由区块',
  basic: '结构化基础信息',
  new: '需扩展字段',
}

// ---------- 字段类型 ----------
export const FIELD_TYPE_LABELS = {
  text: '文本',
  date: '日期',
  list: '列表',
  select: '枚举',
}

// ============================================================
// 区块总目录（所有职业可引用的区块全集，字段与现有 normalizeStructured 对齐）
// ============================================================
export const SECTION_CATALOG = [
  {
    id: 'basic',
    title: '基本信息',
    aliases: ['基本信息', '个人信息', '个人资料', '联系方式', '基本资料', '个人情况'],
    kind: 'header',
    systemMap: 'basic',
    note: '以页眉形式渲染：姓名大字 + 联系方式行，其余字段可在详情中展示。',
    fields: [
      { key: 'name', label: '姓名', required: true, type: 'text' },
      { key: 'gender', label: '性别', type: 'select' },
      { key: 'birth_year', label: '出生年份', type: 'text' },
      { key: 'phone', label: '手机号', required: true, type: 'text' },
      { key: 'email', label: '邮箱', type: 'text' },
      { key: 'location', label: '所在地', type: 'text' },
      { key: 'current_company', label: '当前公司', type: 'text' },
      { key: 'current_title', label: '当前职位', type: 'text' },
      { key: 'years_of_experience', label: '工作年限', type: 'text' },
      { key: 'expected_salary', label: '期望薪资', type: 'text' },
      { key: 'job_intention', label: '求职意向', type: 'text' },
      { key: 'available_date', label: '到岗时间', type: 'text' },
    ],
  },
  {
    id: 'job_intention',
    title: '求职意向',
    aliases: ['求职意向', '期望职位', '意向岗位', '目标岗位'],
    kind: 'lines',
    systemMap: 'new',
    note: '应届生与求职方向明确的岗位建议独立成块；字段与 basic 部分复用。',
    fields: [
      { key: 'target_position', label: '目标岗位', required: true, type: 'text' },
      { key: 'expected_city', label: '期望城市', type: 'text' },
      { key: 'expected_salary', label: '期望薪资', type: 'text' },
      { key: 'job_type', label: '工作性质', type: 'select' },
      { key: 'available_date', label: '到岗时间', type: 'text' },
    ],
  },
  {
    id: 'summary',
    title: '个人摘要',
    aliases: ['个人摘要', '个人简介', '职业概述', '简介', 'profile', 'summary'],
    kind: 'text',
    systemMap: 'block',
    note: '一段话概括职业定位与核心价值，建议 3-5 行；销售/管理岗可在其中嵌入核心业绩。',
    fields: [{ key: 'content', label: '摘要内容', required: true, type: 'text' }],
  },
  {
    id: 'self_evaluation',
    title: '自我评价',
    aliases: ['自我评价', '个人评价', '自我评估', '个人优势', '核心优势', '个人亮点', '个人特长'],
    kind: 'text',
    systemMap: 'block',
    note: '偏能力素质的定性描述；与摘要二选一或互为补充。',
    fields: [{ key: 'content', label: '评价内容', type: 'text' }],
  },
  {
    id: 'work_experience',
    title: '工作经历',
    aliases: ['工作经历', '工作经验', '职业经历', '工作履历', '从业经历', '实习经历', '实习经验'],
    kind: 'list',
    systemMap: 'block',
    note: '时间线倒序；每条经历按「公司 + 职位 + 时间 + 职责 + 业绩」组织。',
    fields: [
      { key: 'company', label: '公司', required: true, type: 'text' },
      { key: 'title', label: '职位', required: true, type: 'text' },
      { key: 'start_date', label: '开始时间', type: 'date' },
      { key: 'end_date', label: '结束时间', type: 'date' },
      { key: 'industry', label: '行业', type: 'text' },
      { key: 'responsibilities', label: '工作职责', type: 'list' },
      { key: 'achievements', label: '工作业绩', type: 'list' },
      { key: 'skills_used', label: '使用技能', type: 'list' },
    ],
  },
  {
    id: 'project_experience',
    title: '项目经历',
    aliases: ['项目经历', '项目经验', '项目案例', '参与项目', '主导项目'],
    kind: 'list',
    systemMap: 'block',
    note: '每条项目按「名称 + 角色 + 时间 + 描述 + 成果 + 技术栈」组织；技术岗强调难点与量化结果。',
    fields: [
      { key: 'name', label: '项目名称', required: true, type: 'text' },
      { key: 'role', label: '角色', type: 'text' },
      { key: 'start_date', label: '开始时间', type: 'date' },
      { key: 'end_date', label: '结束时间', type: 'date' },
      { key: 'description', label: '项目描述', type: 'text' },
      { key: 'achievements', label: '项目成果', type: 'list' },
      { key: 'tech_stack', label: '技术栈', type: 'list' },
    ],
  },
  {
    id: 'education',
    title: '教育经历',
    aliases: ['教育经历', '教育背景', '学习经历', '学历', '教育'],
    kind: 'list',
    systemMap: 'block',
    note: '倒序排列；应届生岗位前移到显眼位置，突出学校 / 专业 / 绩点。',
    fields: [
      { key: 'school', label: '学校', required: true, type: 'text' },
      { key: 'degree', label: '学历', type: 'select' },
      { key: 'major', label: '专业', type: 'text' },
      { key: 'start_date', label: '开始时间', type: 'date' },
      { key: 'end_date', label: '结束时间', type: 'date' },
      { key: 'gpa', label: '绩点', type: 'text' },
      { key: 'honors', label: '在校荣誉', type: 'list' },
    ],
  },
  {
    id: 'skills',
    title: '技能特长',
    aliases: ['技能', '专业技能', '技能特长', '技术栈', '核心技能', '专业能力', '职业技能'],
    kind: 'skills',
    systemMap: 'block',
    note: '按「专业技能 / 工具 / 软技能 / 语言」四类组织；技术岗置顶并细化分类。',
    fields: [
      { key: 'technical', label: '专业技能', type: 'list' },
      { key: 'tools', label: '工具', type: 'list' },
      { key: 'soft', label: '软技能', type: 'list' },
      { key: 'languages', label: '语言', type: 'list' },
    ],
  },
  {
    id: 'certificates',
    title: '证书资质',
    aliases: ['证书', '资格证书', '证书资质', '资质证书', '职称', '职业资格'],
    kind: 'lines',
    systemMap: 'block',
    note: '金融 / 医疗 / 财会等资质导向岗位置顶；字段含名称、颁发机构与时间。',
    fields: [
      { key: 'name', label: '证书名称', required: true, type: 'text' },
      { key: 'issuer', label: '颁发机构', type: 'text' },
      { key: 'date', label: '获得时间', type: 'date' },
    ],
  },
  {
    id: 'awards',
    title: '获奖荣誉',
    aliases: ['获奖', '荣誉', '获奖荣誉', '奖项', '所获荣誉'],
    kind: 'lines',
    systemMap: 'block',
    note: '按含金量排序；竞赛获奖对技术 / 应届生岗位有加分。',
    fields: [
      { key: 'name', label: '奖项名称', required: true, type: 'text' },
      { key: 'issuer', label: '颁发方', type: 'text' },
      { key: 'date', label: '时间', type: 'date' },
    ],
  },
  {
    id: 'training',
    title: '培训经历',
    aliases: ['培训经历', '培训', '进修'],
    kind: 'list',
    systemMap: 'free',
    note: '职业进修、内训、技能认证培训；职能支持与医疗教育岗常用。',
    fields: [
      { key: 'name', label: '培训项目', required: true, type: 'text' },
      { key: 'institution', label: '培训机构', type: 'text' },
      { key: 'date', label: '时间', type: 'date' },
      { key: 'description', label: '内容', type: 'text' },
    ],
  },
  {
    id: 'languages',
    title: '语言能力',
    aliases: ['语言能力', '语言', '外语能力'],
    kind: 'lines',
    systemMap: 'free',
    note: '语言 + 熟练程度（如 CET-6、流利、母语）。',
    fields: [
      { key: 'language', label: '语言', required: true, type: 'text' },
      { key: 'fluency', label: '熟练程度', type: 'text' },
    ],
  },
  {
    id: 'volunteer',
    title: '志愿 / 公益经历',
    aliases: ['志愿者经历', '志愿者服务', '公益活动', '社会活动'],
    kind: 'list',
    systemMap: 'free',
    note: '展示社会责任感与组织能力；应届生 / 医疗 / 职能岗可补充。',
    fields: [
      { key: 'organization', label: '组织', required: true, type: 'text' },
      { key: 'role', label: '角色', type: 'text' },
      { key: 'date', label: '时间', type: 'date' },
      { key: 'description', label: '说明', type: 'text' },
    ],
  },
  {
    id: 'social',
    title: '社团 / 校园活动',
    aliases: ['社团活动', '学生工作', '校园经历'],
    kind: 'list',
    systemMap: 'free',
    note: '学生干部、社团、活动组织经历；应届生模板重要补充。',
    fields: [
      { key: 'organization', label: '组织', required: true, type: 'text' },
      { key: 'role', label: '角色', type: 'text' },
      { key: 'date', label: '时间', type: 'date' },
      { key: 'description', label: '说明', type: 'text' },
    ],
  },
  {
    id: 'publications',
    title: '论文 / 著作 / 学术成果',
    aliases: ['论文', '发表论文', '著作', '学术成果'],
    kind: 'list',
    systemMap: 'free',
    note: '科研 / 医疗 / 学术岗位核心区块，突出期刊等级与影响因子。',
    fields: [
      { key: 'title', label: '标题', required: true, type: 'text' },
      { key: 'journal', label: '期刊 / 载体', type: 'text' },
      { key: 'date', label: '时间', type: 'date' },
      { key: 'authors', label: '作者', type: 'text' },
    ],
  },
  {
    id: 'patents',
    title: '专利',
    aliases: ['专利', '专利成果'],
    kind: 'lines',
    systemMap: 'free',
    note: '技术 / 科研岗加分项，注明专利号与状态。',
    fields: [
      { key: 'name', label: '专利名称', required: true, type: 'text' },
      { key: 'patent_no', label: '专利号', type: 'text' },
      { key: 'date', label: '时间', type: 'date' },
      { key: 'status', label: '状态', type: 'select' },
    ],
  },
  {
    id: 'portfolio',
    title: '个人作品 / 作品集',
    aliases: ['个人作品', '作品集', '代表作品'],
    kind: 'list',
    systemMap: 'free',
    note: '设计 / 创意 / 内容岗位置顶；附链接，突出代表作与数据效果。',
    fields: [
      { key: 'name', label: '作品名称', required: true, type: 'text' },
      { key: 'url', label: '链接', type: 'text' },
      { key: 'description', label: '说明', type: 'text' },
    ],
  },
  {
    id: 'open_source',
    title: '开源项目',
    aliases: ['开源项目', '开源贡献'],
    kind: 'list',
    systemMap: 'free',
    note: '技术岗加分项，注明仓库链接、Star 数与核心贡献。',
    fields: [
      { key: 'name', label: '项目', required: true, type: 'text' },
      { key: 'url', label: '链接', type: 'text' },
      { key: 'description', label: '说明', type: 'text' },
    ],
  },
  {
    id: 'interests',
    title: '兴趣爱好',
    aliases: ['兴趣爱好', '兴趣', '爱好'],
    kind: 'lines',
    systemMap: 'free',
    note: '简写即可，体现个性与团队契合度。',
    fields: [{ key: 'content', label: '内容', type: 'text' }],
  },
  {
    id: 'references',
    title: '推荐人 / 证明人',
    aliases: ['推荐人', '证明人', 'reference'],
    kind: 'list',
    systemMap: 'new',
    note: '管理岗 / 资深岗可附；需经本人同意，一般写「可提供」。',
    fields: [
      { key: 'name', label: '姓名', required: true, type: 'text' },
      { key: 'company', label: '公司', type: 'text' },
      { key: 'title', label: '职务', type: 'text' },
      { key: 'contact', label: '联系方式', type: 'text' },
    ],
  },
  {
    id: 'extra',
    title: '附加信息',
    aliases: ['附加信息', '其他', '其他信息'],
    kind: 'text',
    systemMap: 'free',
    note: '内容保护兜底：未被任何区块吸收的文本自动归入此处，内容只多不少。',
    fields: [{ key: 'content', label: '内容', type: 'text' }],
  },
]

// ============================================================
// 按职业区分的简历结构模板
// structure：推荐区块顺序（首个为基本信息，渲染为页眉）
// emphasis：该职业的撰写 / 渲染重点
// keywords：用于后续自动识别该职业的岗位 / 简历关键词
// ============================================================
export const OCCUPATION_TEMPLATES = [
  {
    id: 'tech',
    name: '技术 / 研发',
    description: '软件工程师、前后端、算法、测试、运维、架构、数据等研发类岗位。招聘方最关心技术栈匹配度与项目落地能力，因此技术栈与项目经历前置。',
    keywords: ['开发', '工程师', '后端', '前端', '算法', '测试', '运维', '架构', '数据', 'Java', 'Python', 'Go', 'C++', '全栈', 'SRE', 'DevOps', '机器学习', 'AI'],
    structure: [
      { id: 'basic', required: true },
      { id: 'summary', required: true },
      { id: 'skills', required: true },
      { id: 'work_experience', required: true },
      { id: 'project_experience', required: true },
      { id: 'education' },
      { id: 'certificates' },
      { id: 'awards' },
      { id: 'open_source' },
      { id: 'portfolio' },
      { id: 'publications' },
      { id: 'extra' },
    ],
    emphasis: [
      '技术栈按「编程语言 / 框架 / 工具 / 平台」分类前置，一眼可读',
      '项目用「技术难点 + 解决方案 + 量化结果」结构描述',
      'GitHub、开源项目、技术博客是重要加分项',
      '算法岗突出竞赛成绩与论文；前端突出作品与框架深度；后端突出高并发与性能优化',
    ],
  },
  {
    id: 'product',
    name: '产品 / 运营',
    description: '产品经理、产品运营、用户运营、内容运营、活动运营、增长、项目管理等岗位。招聘方看重需求洞察、方案落地与数据验证。',
    keywords: ['产品经理', '产品', '运营', '用户运营', '内容运营', '活动运营', '增长', '项目管理', 'PM', '产品运营'],
    structure: [
      { id: 'basic', required: true },
      { id: 'summary', required: true },
      { id: 'work_experience', required: true },
      { id: 'project_experience', required: true },
      { id: 'skills' },
      { id: 'education' },
      { id: 'certificates' },
      { id: 'awards' },
      { id: 'portfolio' },
      { id: 'extra' },
    ],
    emphasis: [
      '项目按「问题 → 方案 → 验证」逻辑组织，逻辑闭环清晰',
      '用数据量化成果：DAU、转化率、留存、GMV、NPS',
      'B 端突出业务理解与交付，C 端突出用户体验与增长',
      '运营按用户 / 内容 / 活动方向，对应突出各自案例',
    ],
  },
  {
    id: 'sales',
    name: '销售 / 市场',
    description: '销售、市场、商务、BD、渠道、推广、营销等岗位。招聘方第一眼就要看到业绩数字，业绩数据前置是核心。',
    keywords: ['销售', '市场', '商务', 'BD', '客户', '渠道', '推广', '营销', '增长', '大客户', '区域经理', '销售总监'],
    structure: [
      { id: 'basic', required: true },
      { id: 'summary', required: true },
      { id: 'work_experience', required: true },
      { id: 'project_experience' },
      { id: 'education' },
      { id: 'skills' },
      { id: 'certificates' },
      { id: 'awards' },
      { id: 'training' },
      { id: 'extra' },
    ],
    emphasis: [
      '业绩数据前置：销售额、达成率、排名、回款金额',
      '呈现「客户开发 → 商机管理 → 客户成功」完整闭环',
      '用 ROI / CAC / 转化率表达投入产出比',
      '突出大客户资源、行业人脉与区域覆盖能力',
    ],
  },
  {
    id: 'finance',
    name: '金融 / 财会',
    description: '银行、证券、投资、基金、保险、审计、会计、财务、风控、量化等岗位。资质证书是硬门槛，必须置顶。',
    keywords: ['金融', '银行', '证券', '投资', '基金', '保险', '审计', '会计', '财务', '风控', '量化', '分析师', '投行', 'CPA', 'CFA', 'FRM'],
    structure: [
      { id: 'basic', required: true },
      { id: 'summary', required: true },
      { id: 'certificates', required: true },
      { id: 'work_experience', required: true },
      { id: 'project_experience' },
      { id: 'education' },
      { id: 'skills' },
      { id: 'awards' },
      { id: 'publications' },
      { id: 'extra' },
    ],
    emphasis: [
      '资质证书置顶：CPA / CFA / FRM / 证券基金从业资格',
      '用财务语言量化成果：降本幅度、审计通过率、投资收益',
      '工具熟练度：Bloomberg / Wind / SAP / Python / Excel',
      '突出合规意识、风险控制与严谨性',
    ],
  },
  {
    id: 'design',
    name: '设计 / 创意',
    description: 'UI/UX、视觉、交互、插画、平面、品牌、创意、视频剪辑、动效等岗位。作品集是第一位，版式可更灵活。',
    keywords: ['设计', 'UI', 'UX', '视觉', '交互', '插画', '平面', '品牌', '创意', '视频', '剪辑', '动效', '产品设计'],
    structure: [
      { id: 'basic', required: true },
      { id: 'summary', required: true },
      { id: 'portfolio', required: true },
      { id: 'work_experience', required: true },
      { id: 'project_experience' },
      { id: 'education' },
      { id: 'skills' },
      { id: 'awards' },
      { id: 'interests' },
      { id: 'extra' },
    ],
    emphasis: [
      '作品集优先展示，链接可点击直达',
      '用设计风格标签（简约 / 新拟态 / 3D 等）辅助定位',
      '版式布局更灵活，突出视觉表达与还原度',
      '用数据说明设计价值：转化提升、满意度、使用时长',
    ],
  },
  {
    id: 'functional',
    name: '职能支持',
    description: 'HR、行政、法务、客服、文秘、采购等支持类岗位。招聘方看重专业流程、成本意识与稳定性。',
    keywords: ['HR', '人力资源', '招聘', '行政', '前台', '法务', '律师', '合规', '客服', '文秘', '助理', '后勤', '采购'],
    structure: [
      { id: 'basic', required: true },
      { id: 'summary', required: true },
      { id: 'work_experience', required: true },
      { id: 'education' },
      { id: 'certificates' },
      { id: 'skills' },
      { id: 'training' },
      { id: 'awards' },
      { id: 'extra' },
    ],
    emphasis: [
      'HR：招聘周期缩短、试用期通过率、人才梯队建设',
      '行政：成本控制、流程优化、活动组织',
      '法务：合同审核周期、风险规避、合规体系建设',
      '突出细致度、稳定性与跨部门协作能力',
    ],
  },
  {
    id: 'medical',
    name: '医疗 / 教育 / 科研',
    description: '医生、护士、教师、研究员、实验室等岗位。执业资格与科研成果是核心竞争力，资质置顶。',
    keywords: ['医生', '护士', '医疗', '药学', '护理', '教师', '老师', '教学', '科研', '研究员', '实验室', '临床', '口腔', '中医'],
    structure: [
      { id: 'basic', required: true },
      { id: 'summary', required: true },
      { id: 'certificates', required: true },
      { id: 'work_experience', required: true },
      { id: 'education' },
      { id: 'publications' },
      { id: 'training' },
      { id: 'awards' },
      { id: 'volunteer' },
      { id: 'extra' },
    ],
    emphasis: [
      '执业资格、职称证、规培证等资质置顶',
      '突出临床经验、手术 / 病例数量、科研成果',
      '教师岗突出教学成果、升学率、教研课题',
      '科研岗突出论文、专利、基金项目',
    ],
  },
  {
    id: 'entry',
    name: '应届生 / 实习生',
    description: '应届毕业生、实习生、管培生等无全职经验或少量实习的人群。教育前置，用潜力与校园实践弥补经验空白。',
    keywords: ['应届', '实习生', '校招', '管培生', '本科', '硕士', '博士', '校园招聘', '毕业生'],
    structure: [
      { id: 'basic', required: true },
      { id: 'job_intention', required: true },
      { id: 'summary' },
      { id: 'education', required: true },
      { id: 'work_experience' },
      { id: 'project_experience' },
      { id: 'social' },
      { id: 'volunteer' },
      { id: 'skills' },
      { id: 'certificates' },
      { id: 'awards' },
      { id: 'languages' },
      { id: 'interests' },
      { id: 'extra' },
    ],
    emphasis: [
      '教育经历前置，突出学校 / 专业 / 绩点 / 排名',
      '实习与校园实践用 STAR 法则描述',
      '突出学习能力、潜力与可塑性',
      '竞赛、论文、学生工作、证书均可补充',
    ],
  },
  {
    id: 'management',
    name: '管理岗',
    description: '总监、VP、总经理、CTO、CEO 等管理层岗位。招聘方看重战略视野、组织建设与业务结果。',
    keywords: ['总监', 'VP', '总经理', 'CTO', 'CEO', 'COO', 'CFO', '负责人', '事业部', '合伙人', '副总裁'],
    structure: [
      { id: 'basic', required: true },
      { id: 'summary', required: true },
      { id: 'work_experience', required: true },
      { id: 'project_experience' },
      { id: 'education' },
      { id: 'certificates' },
      { id: 'training' },
      { id: 'awards' },
      { id: 'references' },
      { id: 'extra' },
    ],
    emphasis: [
      '突出团队规模、管理幅度与跨部门协作',
      '强调从 0 到 1 项目落地与业务结果',
      '体现战略规划、组织建设与人才培养',
      '可附推荐人 / 证明人（需本人同意）',
    ],
  },
  {
    id: 'general',
    name: '通用 / 综合',
    description: '无法判断职业方向时的默认模板，覆盖绝大多数岗位的通用结构，与现有 BLOCK_DEFS 默认顺序一致。',
    keywords: [],
    structure: [
      { id: 'basic', required: true },
      { id: 'summary' },
      { id: 'work_experience', required: true },
      { id: 'project_experience' },
      { id: 'education', required: true },
      { id: 'skills' },
      { id: 'certificates' },
      { id: 'awards' },
      { id: 'self_evaluation' },
      { id: 'extra' },
    ],
    emphasis: [
      '覆盖大多数岗位的通用结构，空区块自动隐藏',
      '无法判断职业时使用该模板兜底',
      '与现有系统 BLOCK_DEFS 顺序一一对应',
    ],
  },
]

// ---------- 便捷查询 ----------
export function getSectionById(id) {
  return SECTION_CATALOG.find(s => s.id === id) || null
}
export function getTemplateById(id) {
  return OCCUPATION_TEMPLATES.find(t => t.id === id) || null
}
export function getStructureWithSections(template) {
  if (!template) return []
  return template.structure
    .map((item, index) => ({ ...item, order: index + 1, section: getSectionById(item.id) }))
    .filter(x => x.section)
}

// ---------- 统计 ----------
export function templateStats() {
  const totalSections = SECTION_CATALOG.length
  const totalFields = SECTION_CATALOG.reduce((sum, s) => sum + (s.fields?.length || 0), 0)
  const totalOccupations = OCCUPATION_TEMPLATES.length
  return { totalSections, totalFields, totalOccupations }
}
