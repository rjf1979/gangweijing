// ============================================================
// 职业识别模块：基于简历文本 + 结构化字段，匹配 10 个职业模板关键词
// ------------------------------------------------------------
// 设计依据：src/admin/web/src/data/resumeStructureTemplates.js 的
// OCCUPATION_TEMPLATES.keywords（后台「简历结构」模板目录，用户已确认）
// 职责：
//  1. 上传/保存简历时识别职业，写入 structured.occupation 元数据
//  2. 旧数据（无 occupation）在读取时按文本兜底识别
//  3. 提供职业名称 / 强调区块映射，供前端渲染与管理后台展示
// 无任何外部依赖，前后台 server（ESM）均可直接 import。
// ============================================================

// 关键词权重：strong=3（决定性信号）/ medium=2（常规）/ weak=1（泛化词，需防误伤）
export const OCCUPATION_TEMPLATES = [
  {
    id: 'tech', name: '技术 / 研发',
    keywords: [
      { k: '后端', w: 3 }, { k: '前端', w: 3 }, { k: '全栈', w: 3 }, { k: '算法', w: 3 },
      { k: '架构师', w: 3 }, { k: '测试工程师', w: 3 }, { k: '运维', w: 3 }, { k: 'SRE', w: 3 },
      { k: 'DevOps', w: 3 }, { k: '机器学习', w: 3 }, { k: '深度学习', w: 3 }, { k: '大数据', w: 3 },
      { k: '开发', w: 2 }, { k: '工程师', w: 2 }, { k: '测试', w: 2 }, { k: '架构', w: 2 },
      { k: 'Java', w: 2 }, { k: 'Python', w: 2 }, { k: 'Go', w: 2 }, { k: 'C++', w: 2 },
      { k: '技术栈', w: 2 }, { k: '数据', w: 1 }, { k: 'AI', w: 1 }, { k: '编程', w: 2 },
    ],
  },
  {
    id: 'product', name: '产品 / 运营',
    keywords: [
      { k: '产品经理', w: 3 }, { k: '产品负责人', w: 3 }, { k: '产品运营', w: 3 },
      { k: '用户运营', w: 3 }, { k: '内容运营', w: 3 }, { k: '活动运营', w: 3 },
      { k: '增长', w: 2 }, { k: '项目管理', w: 2 }, { k: 'PM', w: 2 },
      { k: '产品', w: 1 }, { k: '运营', w: 1 }, { k: '需求', w: 1 }, { k: '用户', w: 1 },
    ],
  },
  {
    id: 'sales', name: '销售 / 市场',
    keywords: [
      { k: '销售总监', w: 3 }, { k: '销售经理', w: 3 }, { k: '大客户', w: 3 }, { k: '区域经理', w: 3 },
      { k: '销售', w: 2 }, { k: '市场', w: 2 }, { k: '商务', w: 2 }, { k: 'BD', w: 2 },
      { k: '渠道', w: 2 }, { k: '推广', w: 2 }, { k: '营销', w: 2 }, { k: '客户', w: 1 },
    ],
  },
  {
    id: 'finance', name: '金融 / 财会',
    keywords: [
      { k: 'CPA', w: 3 }, { k: 'CFA', w: 3 }, { k: 'FRM', w: 3 }, { k: '证券', w: 3 }, { k: '投行', w: 3 },
      { k: '金融', w: 2 }, { k: '银行', w: 2 }, { k: '投资', w: 2 }, { k: '基金', w: 2 }, { k: '保险', w: 2 },
      { k: '审计', w: 2 }, { k: '会计', w: 2 }, { k: '财务', w: 2 }, { k: '风控', w: 2 }, { k: '量化', w: 2 },
      { k: '分析师', w: 2 },
    ],
  },
  {
    id: 'design', name: '设计 / 创意',
    keywords: [
      { k: 'UI', w: 3 }, { k: 'UX', w: 3 }, { k: '插画', w: 3 }, { k: '视觉设计', w: 3 },
      { k: '交互设计', w: 3 }, { k: '产品设计', w: 3 }, { k: '平面设计', w: 3 },
      { k: '设计', w: 2 }, { k: '视觉', w: 2 }, { k: '交互', w: 2 }, { k: '平面', w: 2 },
      { k: '品牌', w: 2 }, { k: '创意', w: 2 }, { k: '视频', w: 2 }, { k: '剪辑', w: 2 }, { k: '动效', w: 2 },
    ],
  },
  {
    id: 'functional', name: '职能支持',
    keywords: [
      { k: '人力资源', w: 3 }, { k: '招聘', w: 3 }, { k: 'HR', w: 2 }, { k: '行政', w: 2 },
      { k: '法务', w: 2 }, { k: '律师', w: 2 }, { k: '合规', w: 2 }, { k: '客服', w: 2 },
      { k: '文秘', w: 2 }, { k: '助理', w: 2 }, { k: '后勤', w: 2 }, { k: '采购', w: 2 },
      { k: '前台', w: 2 },
    ],
  },
  {
    id: 'medical', name: '医疗 / 教育 / 科研',
    keywords: [
      { k: '医生', w: 3 }, { k: '护士', w: 3 }, { k: '医师', w: 3 }, { k: '临床', w: 3 },
      { k: '教师', w: 3 }, { k: '老师', w: 2 }, { k: '教学', w: 2 }, { k: '研究员', w: 3 },
      { k: '科研', w: 2 }, { k: '实验室', w: 2 }, { k: '医疗', w: 2 }, { k: '药学', w: 2 },
      { k: '护理', w: 2 }, { k: '口腔', w: 2 }, { k: '中医', w: 2 },
    ],
  },
  {
    id: 'entry', name: '应届生 / 实习生',
    keywords: [
      { k: '应届', w: 3 }, { k: '校招', w: 3 }, { k: '校园招聘', w: 3 }, { k: '毕业生', w: 3 },
      { k: '管培生', w: 3 }, { k: '实习生', w: 3 }, { k: '本科', w: 1 }, { k: '硕士', w: 1 },
      { k: '博士', w: 1 },
    ],
  },
  {
    id: 'management', name: '管理岗',
    keywords: [
      { k: 'CEO', w: 3 }, { k: 'CTO', w: 3 }, { k: 'COO', w: 3 }, { k: 'CFO', w: 3 },
      { k: '总经理', w: 3 }, { k: '副总裁', w: 3 }, { k: '合伙人', w: 3 }, { k: '事业部负责人', w: 3 },
      { k: '总监', w: 2 }, { k: 'VP', w: 2 }, { k: '事业部', w: 2 }, { k: '负责人', w: 1 },
    ],
  },
  {
    id: 'general', name: '通用 / 综合',
    keywords: [],
  },
]

export const OCCUPATION_MAP = Object.fromEntries(OCCUPATION_TEMPLATES.map(t => [t.id, t]))

// 各职业「渲染强调」区块（管理后台模板 structure 中的前置/置顶项，供前端排版轻微强调，
// 不改原文顺序：仅对命中区块加视觉标注）
export const EMPHASIS_SECTIONS = {
  tech: ['skills', 'project_experience'],
  product: ['project_experience', 'work_experience'],
  sales: ['work_experience', 'summary'],
  finance: ['certificates', 'skills'],
  design: ['portfolio'],
  functional: ['work_experience', 'training'],
  medical: ['certificates', 'publications'],
  entry: ['education', 'job_intention', 'social'],
  management: ['work_experience', 'references'],
  general: [],
}

export function occupationName(id) {
  return OCCUPATION_MAP[id]?.name || '通用 / 综合'
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 标题字段文本：当前职位 / 求职意向 / 工作/项目/实习标题（权重最高的信号源）
function collectTitleText(structured) {
  const parts = []
  const basic = structured?.basic && typeof structured.basic === 'object' ? structured.basic : {}
  if (basic.current_title) parts.push(basic.current_title)
  if (basic.job_intention) parts.push(String(basic.job_intention))
  const jobIntention = structured?.job_intention && typeof structured.job_intention === 'object' ? structured.job_intention : {}
  if (jobIntention.target_position) parts.push(jobIntention.target_position)
  for (const w of structured?.work_experience || []) if (w && w.title) parts.push(String(w.title))
  for (const p of structured?.project_experience || []) if (p && p.role) parts.push(String(p.role))
  for (const i of structured?.internship_experience || []) if (i && i.title) parts.push(String(i.title))
  return parts.join(' ')
}

// 应届生结构化信号：无全职工作经历 + 教育经历较新（近 3 年内毕业）
function entryStructuralBoost(structured) {
  let boost = 0
  const work = structured?.work_experience
  const fullTime = Array.isArray(work) ? work.filter(w => !/实习|intern/i.test(String(w?.title || ''))) : []
  // 无全职工作经历 → 倾向应届/实习
  if (fullTime.length === 0) boost += 2
  const edu = structured?.education || []
  const currentYear = new Date().getFullYear()
  if (Array.isArray(edu) && edu.length && edu.some(e => {
    const end = String(e?.end_date || '').slice(0, 4)
    return /^\d{4}$/.test(end) && Number(end) >= currentYear - 3
  })) boost += 2
  return boost
}

// 核心：从简历文本 + 结构化识别职业
// 返回 { id, name, confidence, score, matchedKeywords: [{k,w}], boost }
// 兜底 general：confidence 低（< 0.5 且 score 低于阈值时返回 general）
export function detectOccupation(text, structured) {
  const fullText = String(text || '')
  const titleText = collectTitleText(structured)
  const scores = {}
  const matched = {}
  for (const t of OCCUPATION_TEMPLATES) {
    if (!t.keywords.length) continue
    let score = 0
    const hits = []
    for (const { k, w } of t.keywords) {
      if (!k) continue
      const re = new RegExp(escapeRegExp(k), 'gi')
      let count = 0
      const m = fullText.match(re)
      if (m) count += Math.min(m.length, 3)
      // 标题命中：权重 x2.5（信号源最强），同一关键词按标题命中 1 次计
      if (titleText && titleText.match(new RegExp(escapeRegExp(k), 'i'))) count += 1
      if (!count) continue
      // 标题命中额外加权：总命中次数 > 0 时，标题命中多给 1.5 倍
      const titleBonus = titleText && titleText.match(new RegExp(escapeRegExp(k), 'i')) ? 1.5 : 0
      const ww = w * (1 + titleBonus)
      const add = Math.round(ww * count * 10) / 10
      score += add
      hits.push({ k, w, count, add })
    }
    scores[t.id] = Math.round(score * 10) / 10
    matched[t.id] = hits
  }

  // 应届生结构化信号加成
  const entryBoost = entryStructuralBoost(structured)
  if (entryBoost > 0) {
    scores.entry = Math.round(((scores.entry || 0) + entryBoost) * 10) / 10
  }
  // 应届关键词命中额外加成（应届/校招/毕业生/管培生 等强信号 +3）
  const entryStrongRe = /(应届|校招|校园招聘|毕业生|管培生)/i
  if (entryStrongRe.test(fullText)) {
    scores.entry = Math.round(((scores.entry || 0) + 3) * 10) / 10
  }

  // 取最高分与次高分
  const ranked = Object.keys(scores)
    .filter(id => id !== 'general')
    .sort((a, b) => (scores[b] - scores[a]) || (distinctCount(b) - distinctCount(a)) || 0)
  function distinctCount(id) { return matched[id]?.length || 0 }
  const top = ranked[0]
  const second = ranked[1]
  if (!top) return { id: 'general', name: '通用 / 综合', confidence: 0.3, score: 0, matchedKeywords: [], boost: entryBoost }
  const topScore = scores[top]
  const secondScore = second ? scores[second] : 0
  // 阈值：低于 3 分视为无足够信号 → 兜底通用
  if (topScore < 3) {
    return { id: 'general', name: '通用 / 综合', confidence: 0.3, score: topScore, matchedKeywords: matched[top] || [], boost: entryBoost }
  }
  // 置信度：差距越大越确定；0.4 ~ 0.98
  const ratio = secondScore > 0 ? topScore / (topScore + secondScore) : 1
  const confidence = Math.round(Math.min(0.98, Math.max(0.4, 0.5 + (ratio - 0.5) * 1.6)) * 100) / 100
  const sortedHits = [...(matched[top] || [])].sort((a, b) => b.add - a.add)
  return {
    id: top, name: occupationName(top), confidence,
    score: topScore, matchedKeywords: sortedHits.slice(0, 8), boost: entryBoost,
  }
}

// 便捷：对已结构化数据补充 occupation（无则识别，有则原样返回）
export function withOccupation(structured, text) {
  const s = structured && typeof structured === 'object' ? structured : {}
  if (s.occupation && s.occupation.id) return s
  const occ = detectOccupation(text, s)
  return { ...s, occupation: occ }
}
