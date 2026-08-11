// 内置简历模板元数据：id -> 名称/职业/描述
// 模板 HTML 文件位于 ./builtin/<id>.html；种子导入时仅处理实际存在的文件
// （当前已上线 tech 一套，其余职业模板文件后续补充，补充后重启后台即自动识别）
export const BUILTIN_TEMPLATE_META = {
  tech: {
    name: '技术 / 研发 · 深蓝科技风',
    occupationId: 'tech',
    description: '左侧深蓝技术栏（技能矩阵/证书/开源）+ 右侧时间线与项目卡片，适合技术研发岗。',
  },
  product: {
    name: '产品 / 运营 · 靛紫清爽风',
    occupationId: 'product',
    description: '顶部渐变页眉 + 卡片式经历 + 浅紫侧栏，适合产品运营岗。',
  },
  sales: {
    name: '销售 / 市场 · 红橙业绩风',
    occupationId: 'sales',
    description: '业绩数字视觉强化 + 高对比配色，适合销售市场岗。',
  },
  finance: {
    name: '金融 / 财会 · 深蓝金稳风',
    occupationId: 'finance',
    description: '证书置顶 + 严谨表格分区 + 深蓝金稳重配色，适合金融财会岗。',
  },
  design: {
    name: '设计 / 创意 · 极简留白风',
    occupationId: 'design',
    description: '大留白 + 大字号 + 几何装饰，突出视觉表达，适合设计创意岗。',
  },
  functional: {
    name: '职能支持 · 灰蓝规范风',
    occupationId: 'functional',
    description: '清晰分区 + 图标化标签 + 工整排版，适合职能支持岗。',
  },
  medical: {
    name: '医疗 / 教育 / 科研 · 青绿温和风',
    occupationId: 'medical',
    description: '圆润温和 + 青绿专业色，适合医疗教育科研岗。',
  },
  entry: {
    name: '应届生 / 实习生 · 活力渐变风',
    occupationId: 'entry',
    description: '模块卡片 + 校园经历突出 + 活力渐变，适合应届生实习岗。',
  },
  management: {
    name: '管理岗 · 深色商务风',
    occupationId: 'management',
    description: '深色页眉 + 金色点缀 + 商务大气，适合中高层管理岗。',
  },
  general: {
    name: '通用 / 综合 · 经典黑白风',
    occupationId: 'general',
    description: '经典黑白中性排版，适合无法判断职业或综合岗位。',
  },
}