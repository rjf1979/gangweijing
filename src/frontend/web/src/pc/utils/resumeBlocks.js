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
  // schema v2 自由区块归一：兼容「对象数组」与「字符串数组」两种来源（AI 结构化 / 本地解析）
  const objArr = (arr, textKeys, extra) => asArray(arr)
    .map(x => {
      if (typeof x === 'string') {
        const t = cleanText(x)
        return t ? { [extra || 'name']: t } : {}
      }
      return normExpItem(x, textKeys, [])
    })
    .filter(x => Object.keys(x).length)
  const ji = (s.job_intention && typeof s.job_intention === 'object') ? s.job_intention : {}
  const nJobIntention = {}
  for (const k of ['target_position', 'expected_city', 'expected_salary', 'job_type', 'available_date']) {
    const v = cleanText(ji[k])
    if (v) nJobIntention[k] = v
  }
  return {
    basic: nBasic,
    job_intention: nJobIntention,
    summary: cleanText(s.summary),
    self_evaluation: cleanText(s.self_evaluation),
    education: asArray(s.education).map(e => normExpItem(e, ['school', 'degree', 'major', 'start_date', 'end_date', 'gpa'], ['honors'])).filter(x => Object.keys(x).length),
    work_experience: asArray(s.work_experience).map(w => normExpItem(w, ['company', 'title', 'start_date', 'end_date', 'industry'], ['responsibilities', 'achievements', 'skills_used'])).filter(x => Object.keys(x).length),
    project_experience: asArray(s.project_experience).map(p => normExpItem(p, ['name', 'role', 'start_date', 'end_date', 'description'], ['achievements', 'tech_stack'])).filter(x => Object.keys(x).length),
    skills,
    certificates: cleanArray(s.certificates),
    awards: cleanArray(s.awards),
    training: objArr(s.training, ['name', 'institution', 'date', 'description']),
    languages: objArr(s.languages, ['language', 'fluency'], 'language'),
    volunteer: objArr(s.volunteer, ['organization', 'role', 'date', 'description']),
    social: objArr(s.social, ['organization', 'role', 'date', 'description']),
    publications: objArr(s.publications, ['title', 'journal', 'date', 'authors']),
    patents: objArr(s.patents, ['name', 'patent_no', 'date', 'status']),
    portfolio: objArr(s.portfolio, ['name', 'url', 'description']),
    open_source: objArr(s.open_source, ['name', 'url', 'description']),
    interests: cleanArray(s.interests),
    references: objArr(s.references, ['name', 'company', 'title', 'contact']),
    warnings: cleanArray(s.warnings),
    extra_sections: asArray(s.extra_sections)
      .map(x => {
        if (typeof x === 'object' && x) return { title: cleanText(x.title), content: cleanText(x.content) }
        const t = cleanText(x)
        return t ? { title: '', content: t } : {}
      })
      .filter(x => x.title || x.content),
    occupation: normalizeOccupation(s.occupation),
  }
}

// ---------- 职业识别结果归一（后端 resumeOccupation.js 写入的 occupation 元数据） ----------
function normalizeOccupation(raw) {
  const occ = (raw && typeof raw === 'object') ? raw : {}
  if (!occ.id) return null
  return {
    id: String(occ.id).trim() || 'general',
    name: cleanText(occ.name) || '',
    confidence: typeof occ.confidence === 'number' ? occ.confidence : 0,
    score: typeof occ.score === 'number' ? occ.score : 0,
    boost: typeof occ.boost === 'number' ? occ.boost : 0,
    matchedKeywords: Array.isArray(occ.matchedKeywords)
      ? occ.matchedKeywords.filter(k => k && typeof k === 'object' && String(k.k || '').trim()).map(k => ({ k: String(k.k), w: typeof k.w === 'number' ? k.w : 0, count: typeof k.count === 'number' ? k.count : 0 })).slice(0, 8)
      : [],
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

// ---------- 职业模板强调区块（与后端 resumeOccupation.js EMPHASIS_SECTIONS 保持一致） ----------
// 职业模板强调分级：core=核心区块（视觉最重，如证书置顶/技术栈）/ secondary=次级区块
// 仅做版式视觉分级，绝不改变原文描述块的顺序与内容
export const EMPHASIS_SECTIONS = {
  tech: { core: ['skills'], secondary: ['project_experience'] },
  product: { core: ['project_experience'], secondary: ['work_experience'] },
  sales: { core: ['work_experience'], secondary: ['summary'] },
  finance: { core: ['certificates'], secondary: ['skills'] },
  design: { core: ['portfolio'], secondary: ['project_experience'] },
  functional: { core: ['work_experience'], secondary: ['training'] },
  medical: { core: ['certificates'], secondary: ['publications'] },
  entry: { core: ['education'], secondary: ['job_intention', 'social'] },
  management: { core: ['work_experience'], secondary: ['references'] },
  general: { core: [], secondary: [] },
}
// 区块标题 → 结构区块 id（含自由区块，用于职业强调命中判断）
const TITLE_TO_SECTION = {
  '培训经历': 'training', '培训': 'training', '进修': 'training',
  '语言能力': 'languages', '语言': 'languages', '外语能力': 'languages',
  '志愿者经历': 'volunteer', '志愿者服务': 'volunteer', '公益活动': 'volunteer', '社会活动': 'volunteer',
  '社团活动': 'social', '学生工作': 'social', '校园经历': 'social',
  '发表论文': 'publications', '论文': 'publications', '著作': 'publications', '学术成果': 'publications',
  '专利': 'patents', '专利成果': 'patents',
  '个人作品': 'portfolio', '作品集': 'portfolio', '代表作品': 'portfolio',
  '开源项目': 'open_source', '开源贡献': 'open_source',
  '兴趣爱好': 'interests', '兴趣': 'interests', '爱好': 'interests',
  '推荐人': 'references', '证明人': 'references',
  '求职意向': 'job_intention', '期望职位': 'job_intention', '意向岗位': 'job_intention', '目标岗位': 'job_intention',
}
function sectionIdOfTitle(title) {
  const t = normalizeTitle(stripTitlePrefix(title))
  const def = defByTitle(title)
  if (def) return def.id
  for (const k of Object.keys(TITLE_TO_SECTION)) {
    if (normalizeTitle(k) === t) return TITLE_TO_SECTION[k]
  }
  return null
}
// 命中职业模板强调区块 → 加视觉分级标注（core/secondary，不改原文顺序）
function annotateEmphasis(blocks, occupation) {
  const occId = occupation && occupation.id
  const emph = (occId && EMPHASIS_SECTIONS[occId]) || { core: [], secondary: [] }
  const core = emph.core || []
  const secondary = emph.secondary || []
  if (!core.length && !secondary.length) return
  for (const b of blocks || []) {
    if (b.id === 'header') continue
    const sid = sectionIdOfTitle(b.title)
    if (sid && core.includes(sid)) b.emphasis = 'core'
    else if (sid && secondary.includes(sid)) b.emphasis = 'secondary'
  }
}

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
// ---------- 原文描述块解析（text-first 排版：不改原文、不调用 AI） ----------
// 小节标题关键词：出现在行尾冒号前，作为区块内的强调小节
const SUBHEAD_KEYWORDS = ['内容', '业绩', '职责', '工作内容', '主要工作', '工作职责', '岗位职责', '任职要求', '项目描述', '项目介绍', '负责内容', '主要职责', '自我评价', '个人优势', '技能', '技术栈', '专业能力', '职责描述', '工作描述', '项目成果', '项目业绩', '个人总结', '基本情况', '工作业绩']
const _Y = String.raw`\d{4}`
const _M = String.raw`(?:[./\\-年]\d{1,2})?`
const _YM = String.raw`${_Y}${_M}`
const _SEP = String.raw`\s*[-–—至到~]\s*`
const _END = String.raw`(?:${_YM}|至今|现在|今|当前)`
// 独立时间行：2017.06-2022.04 / 2020.08-至今 / 2011-2013
const TIME_RE = new RegExp(`^${_YM}${_SEP}${_END}$`)
// 行内日期：计算机信息管理2011-2013 → 提取 2011-2013
const INLINE_DATE_RE = /\d{4}[./年\\-]\d{1,2}(?:[./\\-]\d{1,2})?\s*[-–—至到~]\s*(?:\d{4}[./年\\-]\d{1,2}(?:[./\\-]\d{1,2})?|至今|现在|今|当前)|\d{4}\s*[-–—至到~]\s*\d{4}/g
// 显式列表项：1、 1. 1） （1） - · ● 一、
const LIST_ITEM_RE = /^(?:\d{1,2}\s*[、.．)）]|[-·•*●]\s*|（\d{1,2}）\s*|\(\d{1,2}\)\s*|[一二三四五六七八九十]+\s*[、.．)）])/

function isSubhead(line) {
  const s = String(line || '').trim().replace(/^[-·•*●]\s*/, '')
  const core = s.replace(/[：:]\s*$/, '').trim()
  if (!core || core.length > 10) return false
  const n = normalizeTitle(core)
  return SUBHEAD_KEYWORDS.some(k => n === normalizeTitle(k) || (n.startsWith(normalizeTitle(k)) && n.length <= normalizeTitle(k).length + 2))
}
function needSpace(prev, next) {
  return /[A-Za-z0-9)）]$/.test(prev) && /^[A-Za-z0-9(（]/.test(next)
}
// 保守续行：仅强特征视为同一行的续行（避免吞掉下一家公司/项目）
function isContinuation(prev, next) {
  const p = prev.trim(); const nx = next.trim()
  if (!p || !nx) return false
  if (/[，,、：:]$/.test(p)) return true
  if (/^[（(【「]/.test(nx)) return true
  if (/[A-Za-z0-9)）]$/.test(p) && /^[A-Za-z0-9(（]/.test(nx)) return true
  if (/(的|了|吧|么|呢|着|过)$/.test(p)) return true
  if (/(以及?|并且?|同时|通过|利用|包括|进行|负责|针对|和|与|及|或|将|把|从|对|为|以|向|被|给|于|是|在|中)$/.test(p)) return true
  return false
}
// 段落软换行合并：PDF 提取的断行在展示层连成连贯段落（原文文字不变）
function joinParagraph(lines) {
  let out = ''
  for (const l of lines) {
    if (!out) { out = l; continue }
    out += (needSpace(out, l) ? ' ' : '') + l
  }
  return out
}
// 行内日期条目（教育经历：学校/学历/专业+时间）
function splitInlineEntries(buf) {
  const entries = []
  let cur = []
  let hasDate = false
  for (const l of buf) {
    const m = l.match(INLINE_DATE_RE)
    if (m) {
      cur.push(l.replace(m[0], '').trim())
      entries.push({ type: 'entry', time: m[0], lines: cur, inline: true })
      cur = []; hasDate = true
    } else cur.push(l)
  }
  if (cur.length) entries.push({ type: 'entry', time: '', lines: cur })
  return hasDate ? entries : null
}
// 一段连续普通行 → entry（时间线条目）/ 隐式列表 / 段落
function flushPlain(buf, afterSubhead) {
  if (!buf.length) return []
  // 1. 独立时间行 → 与前面 1-2 个短行组成时间线条目（公司/项目 + 职位 + 时间）
  let timeIdx = -1
  for (let j = buf.length - 1; j >= 0; j--) {
    if (TIME_RE.test(buf[j])) { timeIdx = j; break }
  }
  if (timeIdx >= 0) {
    let headStart = timeIdx
    let take = 0
    while (take < 2 && headStart - 1 >= 0) {
      if (buf[headStart - 1].length <= 20) { headStart--; take++ } else break
    }
    const result = []
    const prefix = buf.slice(0, headStart)
    if (prefix.length) result.push(...flushPlain(prefix, afterSubhead))
    result.push({ type: 'entry', time: buf[timeIdx], lines: buf.slice(headStart, timeIdx), inline: false })
    return result
  }
  // 2. 行内日期条目（教育经历）
  const inline = splitInlineEntries(buf)
  if (inline) return inline
  // 3. 小节标题后的短行无句号 → 隐式列表；否则合并为段落
  if (afterSubhead && buf.every(l => l.length <= 32) && !buf.some(l => /[。！？]$/.test(l))) {
    return [{ type: 'list', items: buf.slice() }]
  }
  return [{ type: 'para', text: joinParagraph(buf) }]
}
// 区块正文 → 描述块组（subhead / entry / list / para / time）
function buildGroups(content) {
  const lines = String(content || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const groups = []
  let i = 0
  const n = lines.length
  while (i < n) {
    const line = lines[i]
    if (isSubhead(line)) {
      groups.push({ type: 'subhead', text: line })
      i++
    } else if (LIST_ITEM_RE.test(line)) {
      const items = []
      let cur = line
      i++
      while (i < n) {
        const l = lines[i]
        if (LIST_ITEM_RE.test(l)) { items.push(cur); cur = l; i++; continue }
        if (isSubhead(l) || TIME_RE.test(l)) break
        if (isContinuation(cur, l)) { cur += (needSpace(cur, l) ? ' ' : '') + l; i++; continue }
        // 前瞻：后面 4 行内出现独立时间行 → 是下一个条目开头，结束当前列表
        let hasTime = false
        for (let k = i; k < Math.min(n, i + 4); k++) { if (TIME_RE.test(lines[k])) { hasTime = true; break } }
        if (hasTime) break
        cur += (needSpace(cur, l) ? ' ' : '') + l; i++; continue
      }
      items.push(cur)
      groups.push({ type: 'list', items })
    } else {
      const buf = []
      while (i < n && !isSubhead(lines[i]) && !LIST_ITEM_RE.test(lines[i])) {
        buf.push(lines[i]); i++
      }
      const afterSubhead = groups.length && groups[groups.length - 1].type === 'subhead'
      groups.push(...flushPlain(buf, afterSubhead))
    }
  }
  return groups
}
// 原文按标题切分为头部 + 区块；strict 头部阶段仅接受独立标题行，避免联系行被误判
function parseRawResume(text) {
  const rawLines = String(text || '').split(/\r?\n/)
  const headerLines = []
  const sections = []
  const unknownTitles = []
  let current = null
  let inHeader = true
  for (const rawLine of rawLines) {
    const line = rawLine.trim()
    if (!line) continue
    const m = matchTitle(line, { strict: inHeader })
    if (inHeader) {
      if (m && !m.rest) {
        inHeader = false
        current = { title: line, content: '' }
        sections.push(current)
      } else {
        headerLines.push(line)
      }
    } else if (m) {
      current = { title: line, content: m.rest }
      sections.push(current)
      if (!defByTitle(m.title)) unknownTitles.push(m.title)
    } else if (current) {
      current.content += (current.content ? '\n' : '') + line
    }
  }
  return { headerLines, sections, unknownTitles }
}
// 头部 → 联系方式（尽力提取，缺失字段留空）
function extractContact(headerLines) {
  const c = {}
  const lines = headerLines.slice()
  if (lines.length && !/[:：|]/.test(lines[0])) c.name = lines[0]
  for (const l of headerLines) {
    const phone = l.match(/1[3-9]\d\*{4}\d{4}/); if (phone) c.phone = phone[0]
    const email = l.match(/[A-Za-z0-9_+-]\*{1,3}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/); if (email) c.email = email[0]
    if (!c.gender) { const g = l.match(/男|女/); if (g) c.gender = g[0] }
    const birth = l.match(/生日[：:]\s*(\d{4})/); if (birth) c.birth_year = birth[1]
    const exp = l.match(/工作经验[：:]\s*(\d+)\s*年/); if (exp) c.years_of_experience = exp[1] + '年'
  }
  return c
}
// 头部 → 页眉组（姓名大字 + 联系行）
function buildHeaderGroups(headerLines) {
  const lines = headerLines.slice()
  const name = (lines.length && !/[:：|]/.test(lines[0])) ? lines.shift() : ''
  return { type: 'header', name, lines }
}
// ---------- 主入口：原文描述块优先（text-first），结构化仅作极端兜底 ----------
export function buildBlocks({ structured, text }) {
  const rawText = String(text || '')

  // 完全没有可用内容
  if (!rawText.trim()) {
    const s = normalizeStructured(structured)
    if (hasAnyStructured(s)) {
      // 极端兜底：原文为空但历史结构化存在 → 走旧结构化渲染，避免空白
      return buildStructuredFallback(s)
    }
    return { contact: {}, blocks: [], occupation: s.occupation, coverage: { source: 'empty', structuredIds: [], emptyBlocks: BLOCK_DEFS.map(d => d.id), textFallback: [], freeBlocks: [], unknownTitles: [], leftover: [], totalBlocks: 0 } }
  }

  const { headerLines, sections, unknownTitles } = parseRawResume(rawText)
  const blocks = []
  if (headerLines.length) {
    blocks.push({ id: 'header', title: null, kind: 'raw', groups: [buildHeaderGroups(headerLines)], source: 'text', order: -1 })
  }
  sections.forEach((sec, i) => {
    blocks.push({ id: 'sec_' + i, title: sec.title, kind: 'raw', groups: buildGroups(sec.content), source: 'text', order: i })
  })
  const s = normalizeStructured(structured)
  const contact = extractContact(headerLines)
  const coverage = {
    source: blocks.length ? 'text' : 'empty',
    structuredIds: [],
    emptyBlocks: [],
    textFallback: blocks.filter(b => b.id !== 'header').map(b => b.id),
    freeBlocks: [],
    unknownTitles: [...new Set(unknownTitles)],
    leftover: [],
    totalBlocks: blocks.length,
  }
  annotateEmphasis(blocks, s.occupation)
  return { contact, blocks, coverage, occupation: s.occupation }
}

// ---------- 旧结构化兜底（原文为空时的极端情况，保持兼容） ----------
function buildStructuredFallback(s) {
  const blocks = []
  BLOCK_DEFS.forEach((def, i) => {
    const data = pickStructured(def, s)
    if (hasData(def, data)) {
      blocks.push({ id: def.id, title: def.title, kind: def.kind, data, source: 'structured', order: i })
    }
  })
  s.extra_sections.forEach((x, i) => {
    blocks.push({ id: 'extra_sec_' + i, title: x.title || '附加信息', kind: 'text', data: x.content, source: 'structured', order: 900 + i })
  })
  blocks.sort((a, b) => a.order - b.order)
  const coverage = collectCoverage({ s, blocks, unknownTitles: [] })
  annotateEmphasis(blocks, s.occupation)
  return { contact: s.basic, blocks, coverage, occupation: s.occupation }
}

// ---------- 描述块 → 原文文本逆向序列化（按描述块编辑后保存用） ----------
// 规则与 buildBlocks 解析互逆：页眉(姓名+联系行)、区块标题、subhead/para/time 原样成行，
// entry 输出 lines 各一行并把时间拼到末行（兼容独立时间行与行内日期两种原文格式，round-trip 稳定），
// list 每项一行。内容 100% 来自编辑后的块，不新增 AI 调用。
export function serializeBlocksToText(blocks) {
  const out = []
  for (const b of blocks || []) {
    if (!b || b.kind !== 'raw') continue
    if (b.id === 'header') {
      const g = b.groups && b.groups[0]
      if (g && g.type === 'header') {
        if (String(g.name || '').trim()) out.push(String(g.name).trim())
        for (const ln of g.lines || []) if (String(ln || '').trim()) out.push(String(ln).trim())
      }
      continue
    }
    if (String(b.title || '').trim()) out.push(String(b.title).trim())
    for (const g of b.groups || []) {
      if (!g) continue
      if (g.type === 'entry') {
        const lines = (g.lines || []).map(x => String(x ?? '')).map(x => x.trim()).filter(Boolean)
        const time = String(g.time || '').trim()
        // 行内日期（教育经历：专业+时间同行）→ 时间拼回末行；独立时间行（工作/项目）→ 时间单独成行
        if (g.inline && time) {
          if (lines.length) {
            const last = lines[lines.length - 1]
            lines[lines.length - 1] = last.includes(time) ? last : last + time
          } else {
            out.push(time)
          }
        }
        if (lines.length) out.push(...lines)
        if (!g.inline && time) out.push(time)
      } else if (g.type === 'list') {
        for (const it of g.items || []) if (String(it ?? '').trim()) out.push(String(it).trim())
      } else if (g.type === 'subhead' || g.type === 'time' || g.type === 'para') {
        if (String(g.text || '').trim()) out.push(String(g.text).trim())
      }
    }
  }
  return out.join('\n')
}
