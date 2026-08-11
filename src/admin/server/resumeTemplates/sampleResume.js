// 简历模板预览用示例数据（与结构化字段对齐；basic 展开到顶层供模板直接引用）
export const SAMPLE_RESUME = {
  name: '林晓芸',
  gender: '女',
  birth_year: '1994',
  phone: '138-0000-1234',
  email: 'xiaoyun.lin@example.com',
  location: '上海',
  current_company: '云帆科技',
  current_title: '高级产品经理',
  years_of_experience: '7年',
  expected_salary: '30-40K·14薪',
  job_intention: '高级产品经理',
  available_date: '随时到岗',

  target_position: '高级产品经理',
  expected_city: '上海',
  expected_salary_short: '30-40K·14薪',
  job_type: '全职',
  available_date_short: '随时到岗',

  summary: '7 年互联网产品经验，横跨 B 端企业服务与 C 端增长，主导过 3 个百万级用户产品的从 0 到 1。擅长需求洞察、数据驱动决策与跨团队协同，曾将核心转化率提升 32%。',

  self_evaluation: '逻辑清晰、结果导向，擅长把复杂业务拆解为可落地的产品方案；沟通与推动力强，多次在跨 5 个团队的项目中担任主协调人。',

  skills: {
    technical: ['Axure', 'Figma', 'SQL', 'Python 数据分析', 'A/B 实验设计'],
    tools: ['Jira', 'Confluence', 'Metabase', 'Tableau', 'Notion'],
    soft: ['需求洞察', '数据驱动', '跨团队协同', '用户研究'],
    languages: ['英语 CET-6'],
  },

  work_experience: [
    {
      company: '云帆科技',
      title: '高级产品经理',
      start_date: '2021-06',
      end_date: '至今',
      industry: '企业服务 / SaaS',
      responsibilities: [
        '负责核心 SaaS 产品的整体规划与迭代，管理 8 人产品小组',
        '搭建用户反馈闭环，季度需求评审覆盖 200+ 条客户诉求',
        '主导定价与商业化改版，推动客单价提升 18%',
      ],
      achievements: ['核心转化率提升 32%', '年度续费率 96%', '荣获公司年度产品创新奖'],
      skills_used: ['A/B 实验', 'SQL', 'Figma'],
    },
    {
      company: '星云网络',
      title: '产品经理',
      start_date: '2018-03',
      end_date: '2021-05',
      industry: '移动互联网 / 工具',
      responsibilities: [
        '负责用户增长模块，主导新人引导链路改版',
        '与算法团队协作搭建个性化推荐，DAU 提升 27%',
      ],
      achievements: ['新用户 7 日留存提升 15%', '获季度 OKR 卓越奖'],
      skills_used: ['数据埋点', 'Push 策略'],
    },
  ],

  project_experience: [
    {
      name: 'SaaS 客户成功平台',
      role: '产品负责人',
      start_date: '2022-03',
      end_date: '至今',
      description: '面向中大型客户的客户成功管理平台，覆盖健康度监控、续费预警与客户分层运营。',
      achievements: ['交付周期缩短 40%', '客户健康度评分模型上线后预警准确率 85%'],
      tech_stack: ['SQL', 'Metabase', 'Figma'],
    },
    {
      name: '新人增长实验平台',
      role: '产品经理',
      start_date: '2019-08',
      end_date: '2020-12',
      description: '统一 A/B 实验平台，支持灰度发布与效果归因，降低实验成本。',
      achievements: ['实验搭建耗时从 3 天降至 2 小时', '年累计实验 300+ 次'],
      tech_stack: ['数据埋点', 'A/B 实验'],
    },
  ],

  education: [
    {
      school: '华东理工大学',
      degree: '本科',
      major: '信息管理与信息系统',
      start_date: '2014-09',
      end_date: '2018-06',
      gpa: '3.6 / 4.0',
      honors: ['校优秀毕业生', '国家励志奖学金'],
    },
  ],

  certificates: [
    { name: 'PMP 项目管理专业人士认证', issuer: 'PMI', date: '2022-05' },
    { name: 'NPDP 产品经理国际资格认证', issuer: 'PDMA', date: '2021-11' },
  ],

  awards: [
    { name: '年度产品创新奖', issuer: '云帆科技', date: '2023-01' },
    { name: '季度 OKR 卓越奖', issuer: '星云网络', date: '2020-10' },
  ],

  training: [
    { name: '数据驱动产品决策实战营', institution: '三节课', date: '2021-04', description: '系统学习漏斗分析、留存模型与实验设计。' },
  ],

  open_source: [
    { name: 'pm-growth-handbook', url: 'github.com/xiaoyun/pm-growth-handbook', description: '增长方法论开源手册，累计 800+ Star。' },
  ],

  portfolio: [
    { name: '个人作品集', url: 'xiaoyun.design', description: '产品方案、竞品分析与设计评审案例集。' },
  ],

  publications: [
    { title: '从 0 到 1 搭建 SaaS 客户成功体系', journal: '人人都是产品经理', date: '2023-06' },
  ],

  interests: ['产品读书会', '马拉松', '摄影'],

  languages: [{ language: '英语', fluency: 'CET-6，商务沟通' }],

  references: [{ name: '可提供', company: '', title: '', contact: '' }],
}
