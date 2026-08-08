// 简历区块模型：容错解析 + 自适应区块注册表 + 自由区块识别 + 内容保护 + 覆盖率观测
// 数据源只读：脱敏文本(resume_text) + 已有结构化(resume_structured)，不改原文、不新增 AI 调用

// ---------- 容错工具 ----------
function asString(v) {
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).trim()
  return ''
}
const NOISE = new Set(['无', '暂无', '未知', '无记录', '-', '—', 'n/a', 'N/A', 'null', 'undefined', '无'])
function cleanText(v) {
  const s = asString(v)
  if (!s) return ''
  if (NOISE.has(s.toLowerCase())) return ''
  return s
}
function asArray(v) {
  if (Array.isArray(v)) return v
  if (typeof v === 'string' && v.trim()) return [v]
  return []
}
function cleanArray(arr) {
  return asArray(arr)
    .map(x => (typeof x === 'string' ? x.trim() : x))
    .filter(x => {
      if (x === null || x === undefined) return false
      if (typeof x === 'string') return x.trim() !== '' && !NOISE.has(x.trim().toLowerCase())
      return true
    })
}
function normExpItem(item, textKeys, listKeys) {
  if (typeof item === 'string') {
    const t = cleanText(item)
    return t ? { raw: t } : {}
  }
  if (!item || typeof item !== 'object') return {}
  const out = {}
  for (const k of textKeys) {
    const v = cleanText(item[k])
    if (v) out[k] = v
  }
  for (const k of listKeys || []) {
    const arr = cleanArray(item[k])
    if (arr.length) out[k] = arr
  }
  return out
}
function normSkills(skills) {
  const s = (skills && typeof skills === 'object') ? skills : {}
  return {
    technical: cleanArray(s.technical),
    tools: cleanArray(s.tools),
    soft: cleanArray(s.soft),
    languages: cleanArray(s.languages),
  }
}
function skillsEmpty(skills) {
  return !skills || (!skills.technical.length && !skills.tools.length && !skills.soft.length && !skills.languages.length)
}

// ---------- 结构化数据归一（字段级容错） ----------
const BASIC_KEYS = ['name', 'gender', 'birth_year', 'phone', 'email', 'location', 'current_company', 'current_title', 'years_of_experience', 'expected_salary', 'job_intention', 'available_date']
export function normalizeStructured(raw) {
  const s = (raw && typeof raw === 'object') ? raw : {}
  const basic = (s.basic && typeof s.basic === 'object') ? s.basic : {}
  const nBasic = {}
  for (const k of BASIC_KEYS) {
    const v = cleanText(basic[k])
    if (v) nBasic[k] = v
  }
  const skills = normSkills(s.skills)
  return {
    basic: nBasic,
    summary: cleanText(s.summary),
    self_evaluation: cleanText(s.self_evaluation),
    education: asArray(s.education).map(e => normExpItem(e, ['school', 'degree', 'major', 'start_date', 'end_date', 'gpa'], ['honors'])).filter(x => Object.keys(x).length),
    work_experience: asArray(s.work_experience).map(w => normExpItem(w, ['company', 'title', 'start_date', 'end_date', 'industry'], ['responsibilities', 'achievements', 'skills_used'])).filter(x => Object.keys(x).length),
    project_experience: asArray(s.project_experience).map(p => normExpItem(p, ['name', 'role', 'start_date', 'end_date', 'description'], ['achievements', 'tech_stack'])).filter(x => Object.keys(x).length),
    skills,
    certificates: cleanArray(s.certificates),
    awards: cleanArray(s.awards),
    warnings: cleanArray(s.warnings),
    extra_sections: asArray(s.extra_sections)
      .map(x => {
        if (typeof x === 'object' && x) return { title: cleanText(x.title), content: cleanText(x.content) }
        const t = cleanText(x)
        return t ? { title: '', content: t } : {}
      })
      .filter(x => x.title || x.content),
  }
}

// ---------- 区块注册表（通用区块：标题别名 + 渲染 kind） ----------
export const BLOCK_DEFS = [
  { id: 'summary', title: '个人摘要', aliases: ['个人摘要', '个人简介', '职业概述', '简介', 'summary', 'profile'], kind: 'text' },
  { id: 'work_experience', title: '工作经历', aliases: ['工作经历', '工作经验', '职业经历', '工作履历', '从业经历', '实习经历', '实习经验'], kind: 'list' },
  { id: 'project_experience', title: '项目经历', aliases: ['项目经历', '项目经验', '项目案例', '参与项目', '主导项目'], kind: 'list' },
  { id: 'education', title: '教育经历', aliases: ['教育经历', '教育背景', '学习经历', '学历', '教育'], kind: 'list' },
  { id: 'skills', title: '技能特长', aliases: ['技能', '专业技能', '技能特长', '技术栈', '核心技能', '专业能力'], kind: 'skills' },
  { id: 'certificates', title: '证书资质', aliases: ['证书', '资格证书', '证书资质', '资质证书', '职称'], kind: 'lines' },
  { id: 'awards', title: '获奖荣誉', aliases: ['获奖', '荣誉', '获奖荣誉', '奖项', '所获荣誉'], kind: 'lines' },
  { id: 'self_evaluation', title: '自我评价', aliases: ['自我评价', '个人评价', '自我评估', '自我总结', '个人优势', '核心优势', '个人亮点', '个人特长'], kind: 'text' },
]

// 高频自由区块标题（注册表之外，文本中出现即自动生成区块）
export const FREE_TITLES = [
  '培训经历', '社团活动', '志愿者经历', '志愿者服务', '公益活动', '社会活动',
  '专利', '发表论文', '论文', '著作', '学术成果', '开源项目', '个人作品',
  '语言能力', '兴趣爱好', '个人特长', '附加信息', '其他',
]

function normalizeTitle(t) {
  return String(t || '').trim().toLowerCase()
}
function stripTitlePrefix(line) {
  let s = String(line || '').trim()
  s = s.replace(/^([（(【\[])?\s*第?[一二三四五六七八九十百\d]{1,3}\s*[、.．:：]\s*/, '')
  s = s.replace(/^[-·•*●]\s*/, '')
  return s.trim()
}

// 精确标题列表（别名 + 自由标题，按长度降序，先匹配长标题避免前缀吞并）
const ALL_TITLES_LIST = [...new Set([...BLOCK_DEFS.flatMap(d => d.aliases), ...FREE_TITLES])].sort((a, b) => b.length - a.length)
// 保守启发式：仅当短行 + 无标点/数字/空格 + 强标题后缀时才视为未知新标题
const STRONG_SUFFIX_RE = /(经历|经验|背景|技能|证书|资质|荣誉|获奖|评价|评估|特长|语言|爱好|兴趣|活动|志愿者|专利|成果|业绩|作品|论文|著作|信息|其他)$/

// 标题匹配：返回 { title, rest }（rest 为「标题：内容」冒号后的内容），非标题返回 null
function matchTitle(line) {
  const s = String(line || '').trim()
  if (!s) return null
  const stripped = stripTitlePrefix(s)
  if (!stripped) return null
  const n = normalizeTitle(stripped)
  // 1. 精确标题（允许后跟冒号/空格携带内容）
  for (const t of ALL_TITLES_LIST) {
    const tn = normalizeTitle(t)
    if (n === tn) return { title: t, rest: '' }
    if (stripped.startsWith(t) && /^[：:]\s*/.test(stripped.slice(t.length))) {
      return { title: t, rest: stripped.slice(t.length).replace(/^[：:]\s*/, '') }
    }
  }
  // 2. 保守启发式：未知新标题
  if (s.length <= 14 && STRONG_SUFFIX_RE.test(stripped) && !/[\s，。：:、,.\d]/.test(stripped)) {
    return { title: stripped, rest: '' }
  }
  return null
}

// 按标题找注册表区块定义
export function defByTitle(title) {
  const n = normalizeTitle(stripTitlePrefix(title))
  return BLOCK_DEFS.find(d => d.aliases.some(a => normalizeTitle(a) === n)) || null
}
function defOrder(id) {
  const i = BLOCK_DEFS.findIndex(d => d.id === id)
  return i < 0 ? 50 : i
}

// ---------- 文本段落解析（按标题分割，供文本兜底/自由区块/内容保护） ----------
export function parseTextSections(text) {
  const sections = []
  let current = null
  const lines = String(text || '').split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    const m = matchTitle(line)
    if (m) {
      current = { title: m.title, content: m.rest }
      sections.push(current)
    } else if (current) {
      current.content += (current.content ? '\n' : '') + line
    } else if (sections.length && sections[0].title === null) {
      sections[0].content += (sections[0].content ? '\n' : '') + line
    } else {
      sections.unshift({ title: null, content: line })
    }
  }
  return sections
}

// ---------- 区块数据提取 ----------
function pickStructured(def, s) {
  switch (def.id) {
    case 'summary': return s.summary
    case 'work_experience': return s.work_experience
    case 'project_experience': return s.project_experience
    case 'education': return s.education
    case 'skills': return s.skills
    case 'certificates': return s.certificates
    case 'awards': return s.awards
    case 'self_evaluation': return s.self_evaluation
    default: return ''
  }
}
function hasData(def, data) {
  if (def.kind === 'list') return Array.isArray(data) && data.length > 0
  if (def.kind === 'lines') return Array.isArray(data) && data.length > 0
  if (def.kind === 'skills') return !skillsEmpty(data)
  return typeof data === 'string' && data.trim() !== ''
}

function hasAnyStructured(s) {
  return BLOCK_DEFS.some(d => hasData(d, pickStructured(d, s)))
}

// ---------- 覆盖率观测（自我完善一档埋点） ----------
function collectCoverage({ s, blocks, unknownTitles }) {
  const structuredIds = BLOCK_DEFS.filter(d => hasData(d, pickStructured(d, s))).map(d => d.id)
  return {
    source: hasAnyStructured(s) ? 'structured' : (blocks.length ? 'text' : 'empty'),
    structuredIds,
    emptyBlocks: BLOCK_DEFS.filter(d => !structuredIds.includes(d.id)).map(d => d.id),
    textFallback: blocks.filter(b => b.source === 'text').map(b => b.id),
    freeBlocks: blocks.filter(b => b.source === 'free').map(b => b.title),
    unknownTitles: [...new Set(unknownTitles)],
    leftover: blocks.filter(b => b.source === 'leftover').map(b => b.id),
    totalBlocks: blocks.length,
  }
}

// ---------- 主入口：结构化优先 + 文本兜底 + 自由区块 + 内容保护 ----------
export function buildBlocks({ structured, text }) {
  const s = normalizeStructured(structured)
  const rawText = String(text || '')

  // 完全没有可用内容
  if (!hasAnyStructured(s) && !rawText.trim()) {
    return { contact: {}, blocks: [], coverage: { source: 'empty', structuredIds: [], emptyBlocks: BLOCK_DEFS.map(d => d.id), textFallback: [], freeBlocks: [], unknownTitles: [], leftover: [], totalBlocks: 0 } }
  }

  // 无结构化 → 整份文本作为正文区块（保留脱敏标注能力），仍观测新标题
  if (!hasAnyStructured(s)) {
    const sections = parseTextSections(rawText)
    const unknownTitles = sections.filter(x => x.title && !defByTitle(x.title)).map(x => x.title)
    const blocks = [{ id: 'body', title: null, kind: 'body', data: rawText, source: 'text', order: 0 }]
    const coverage = collectCoverage({ s, blocks, unknownTitles })
    return { contact: {}, blocks, coverage }
  }

  const sections = parseTextSections(rawText)
  const blocks = []
  const covered = new Set()
  const unknownTitles = []

  // 1. 通用区块：结构化优先
  BLOCK_DEFS.forEach((def, i) => {
    const data = pickStructured(def, s)
    if (hasData(def, data)) {
      blocks.push({ id: def.id, title: def.title, kind: def.kind, data, source: 'structured', order: i })
      covered.add(def.id)
    }
  })

  // 2. 文本兜底 + 自由区块（一次文本解析结果复用）
  sections.forEach(sec => {
    if (!sec.title) return
    const def = defByTitle(sec.title)
    if (def) {
      if (!covered.has(def.id) && sec.content.trim()) {
        covered.add(def.id)
        blocks.push({ id: def.id, title: def.title, kind: def.kind === 'skills' ? 'text' : def.kind, data: sec.content, source: 'text', order: defOrder(def.id) })
      }
    } else {
      unknownTitles.push(sec.title)
      blocks.push({ id: 'free_' + blocks.length, title: sec.title, kind: 'text', data: sec.content, source: 'free', order: 100 + unknownTitles.length })
    }
  })

  // 3. 内容保护：头部未吸收段落 → 附加信息
  const header = sections.find(x => x.title === null)
  if (header && header.content.trim()) {
    blocks.push({ id: 'extra', title: '附加信息', kind: 'text', data: header.content, source: 'leftover', order: 999 })
  }

  // 4. extra_sections（未来 AI 开放 schema 支持）
  s.extra_sections.forEach((x, i) => {
    blocks.push({ id: 'extra_sec_' + i, title: x.title || '附加信息', kind: 'text', data: x.content, source: 'structured', order: 900 + i })
  })

  blocks.sort((a, b) => a.order - b.order)
  const coverage = collectCoverage({ s, blocks, unknownTitles })
  return { contact: s.basic, blocks, coverage }
}