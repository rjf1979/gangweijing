// 简历字段编辑器模型：把结构化简历拆解为可编辑表单（基础信息字段 + 区块字段），
// 套用哪套模板就按哪套模板的字段结构对号入座编辑，保存时再组装回结构化。
import { normalizeStructured } from './resumeBlocks.js'

// ---------- 基础信息字段（拆解为独立字段保存） ----------
export const BASIC_FIELDS = [
  { key: 'name', label: '姓名', placeholder: '姓名' },
  { key: 'gender', label: '性别', placeholder: '男 / 女' },
  { key: 'birth_year', label: '出生年月', placeholder: '如 1995' },
  { key: 'phone', label: '电话', placeholder: '手机号' },
  { key: 'email', label: '邮箱', placeholder: '邮箱地址' },
  { key: 'location', label: '所在地', placeholder: '城市' },
  { key: 'current_company', label: '在职公司', placeholder: '当前公司' },
  { key: 'current_title', label: '职位', placeholder: '当前职位' },
  { key: 'years_of_experience', label: '工作年限', placeholder: '如 8' },
  { key: 'expected_salary', label: '期望薪资', placeholder: '如 25-35K' },
  { key: 'job_intention', label: '求职意向', placeholder: '目标岗位' },
  { key: 'available_date', label: '到岗时间', placeholder: '如 随时到岗' },
]

// ---------- 区块编辑器定义（与后端 RESUME_STRUCTURE_SCHEMA 对齐） ----------
const SECTION_DEFS = {
  summary: { type: 'text', title: '个人摘要', field: 'summary' },
  self_evaluation: { type: 'text', title: '自我评价', field: 'self_evaluation' },
  job_intention: {
    type: 'object', title: '求职意向',
    fields: [
      { key: 'target_position', label: '目标职位' },
      { key: 'expected_city', label: '期望城市' },
      { key: 'expected_salary', label: '期望薪资' },
      { key: 'job_type', label: '工作性质' },
      { key: 'available_date', label: '到岗时间' },
    ],
  },
  skills: {
    type: 'skills', title: '技能特长',
    lists: [
      { key: 'technical', label: '技术栈 / 编程语言' },
      { key: 'tools', label: '工具软件' },
      { key: 'soft', label: '软技能' },
      { key: 'languages', label: '语言能力' },
    ],
  },
  work_experience: {
    type: 'items', title: '工作经历',
    fields: [
      { key: 'company', label: '公司' }, { key: 'title', label: '职位' },
      { key: 'start_date', label: '开始时间' }, { key: 'end_date', label: '结束时间' },
      { key: 'industry', label: '行业' },
    ],
    lists: [
      { key: 'responsibilities', label: '工作职责' },
      { key: 'achievements', label: '业绩成果' },
      { key: 'skills_used', label: '使用技能' },
    ],
  },
  project_experience: {
    type: 'items', title: '项目经历',
    fields: [
      { key: 'name', label: '项目名称' }, { key: 'role', label: '担任角色' },
      { key: 'start_date', label: '开始时间' }, { key: 'end_date', label: '结束时间' },
      { key: 'description', label: '项目描述' },
    ],
    lists: [{ key: 'achievements', label: '项目成果' }, { key: 'tech_stack', label: '技术栈' }],
  },
  education: {
    type: 'items', title: '教育经历',
    fields: [
      { key: 'school', label: '学校' }, { key: 'degree', label: '学历' },
      { key: 'major', label: '专业' }, { key: 'start_date', label: '开始时间' },
      { key: 'end_date', label: '结束时间' }, { key: 'gpa', label: 'GPA' },
    ],
    lists: [{ key: 'honors', label: '荣誉' }],
  },
  certificates: { type: 'lines', title: '证书资质', field: 'certificates' },
  awards: { type: 'lines', title: '获奖荣誉', field: 'awards' },
  interests: { type: 'lines', title: '兴趣爱好', field: 'interests' },
  training: {
    type: 'items', title: '培训经历',
    fields: [
      { key: 'name', label: '名称' }, { key: 'institution', label: '机构' },
      { key: 'date', label: '时间' }, { key: 'description', label: '描述' },
    ],
  },
  languages: { type: 'items', title: '语言能力', fields: [{ key: 'language', label: '语言' }, { key: 'fluency', label: '熟练程度' }] },
  volunteer: { type: 'items', title: '志愿者经历', fields: [{ key: 'organization', label: '组织' }, { key: 'role', label: '角色' }, { key: 'date', label: '时间' }, { key: 'description', label: '描述' }] },
  social: { type: 'items', title: '社团活动', fields: [{ key: 'organization', label: '组织' }, { key: 'role', label: '角色' }, { key: 'date', label: '时间' }, { key: 'description', label: '描述' }] },
  publications: { type: 'items', title: '发表论文', fields: [{ key: 'title', label: '标题' }, { key: 'journal', label: '期刊' }, { key: 'date', label: '时间' }, { key: 'authors', label: '作者' }] },
  patents: { type: 'items', title: '专利', fields: [{ key: 'name', label: '名称' }, { key: 'patent_no', label: '专利号' }, { key: 'date', label: '时间' }, { key: 'status', label: '状态' }] },
  portfolio: { type: 'items', title: '个人作品', fields: [{ key: 'name', label: '名称' }, { key: 'url', label: '链接' }, { key: 'description', label: '描述' }] },
  open_source: { type: 'items', title: '开源项目', fields: [{ key: 'name', label: '名称' }, { key: 'url', label: '链接' }, { key: 'description', label: '描述' }] },
  references: { type: 'items', title: '推荐人', fields: [{ key: 'name', label: '姓名' }, { key: 'company', label: '公司' }, { key: 'title', label: '职位' }, { key: 'contact', label: '联系方式' }] },
}

// 展示顺序（与 resumeBlocks 序列化顺序对齐）
export const SECTION_ORDER = [
  'job_intention', 'summary', 'self_evaluation', 'skills', 'work_experience',
  'project_experience', 'education', 'certificates', 'awards', 'training',
  'languages', 'volunteer', 'social', 'publications', 'patents', 'portfolio',
  'open_source', 'references', 'interests',
]

export function sectionDef(id) { return SECTION_DEFS[id] || null }

// ---------- 工具 ----------
function cleanText(v) { return String(v ?? '').trim() }
function linesToArr(str) {
  return String(str ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
}
function arrToLines(arr) {
  return (Array.isArray(arr) ? arr : []).map(x => String(x ?? '').trim()).filter(Boolean).join('\n')
}
function cleanObj(obj) {
  const out = {}
  for (const k of Object.keys(obj || {})) {
    const v = String(obj[k] ?? '').trim()
    if (v) out[k] = v
  }
  return out
}

let uidSeed = 0
function uid() { uidSeed += 1; return 'f' + Date.now().toString(36) + '_' + uidSeed }

// 区块是否有数据（决定是否展示 / 序列化）
export function sectionHasData(id, s) {
  const st = s || {}
  switch (id) {
    case 'summary': return Boolean(cleanText(st.summary))
    case 'self_evaluation': return Boolean(cleanText(st.self_evaluation))
    case 'job_intention': return Object.keys(cleanObj(st.job_intention)).length > 0
    case 'skills': {
      const sk = st.skills || {}
      return ['technical', 'tools', 'soft', 'languages'].some(k => (Array.isArray(sk[k]) ? sk[k].length : 0) > 0)
    }
    case 'certificates':
    case 'awards':
    case 'interests':
      return Array.isArray(st[id]) && st[id].length > 0
    default:
      return Array.isArray(st[id]) && st[id].length > 0
  }
}

// ---------- structured → 表单 ----------
export function structuredToForm(structured) {
  const s = normalizeStructured(structured || {})
  const basic = {}
  for (const f of BASIC_FIELDS) basic[f.key] = cleanText(s.basic[f.key])
  const sections = []
  for (const id of SECTION_ORDER) {
    if (!sectionHasData(id, s)) continue
    sections.push(makeSectionForm(id, s))
  }
  return { basic, sections }
}

function makeSectionForm(id, s) {
  const def = SECTION_DEFS[id]
  const base = { _key: uid(), id, title: def.title }
  if (def.type === 'text') {
    base.text = cleanText(s[def.field])
  } else if (def.type === 'object') {
    const obj = {}
    for (const f of def.fields) obj[f.key] = cleanText((s[id] || {})[f.key])
    base.object = obj
  } else if (def.type === 'skills') {
    const lists = {}
    for (const l of def.lists) lists[l.key] = arrToLines((s.skills || {})[l.key])
    base.lists = lists
  } else if (def.type === 'lines') {
    base.lines = arrToLines(s[def.field])
  } else if (def.type === 'items') {
    base.items = (Array.isArray(s[id]) ? s[id] : []).map(item => {
      const fields = {}
      for (const f of def.fields) fields[f.key] = cleanText(item[f.key])
      const lists = {}
      for (const l of def.lists || []) lists[l.key] = arrToLines(item[l.key])
      return { _key: uid(), fields, lists }
    })
  }
  return base
}

// ---------- 表单 → structured（对号入座回填；base 中未编辑区块原样保留） ----------
export function formToStructured(form, baseStructured) {
  const base = normalizeStructured(baseStructured || {})
  const out = JSON.parse(JSON.stringify(base || {}))
  // 基础信息
  out.basic = out.basic || {}
  for (const f of BASIC_FIELDS) {
    const v = cleanText(form.basic && form.basic[f.key])
    if (v) out.basic[f.key] = v
    else delete out.basic[f.key]
  }
  // 区块：只覆盖表单中出现的区块
  for (const sec of (form.sections || [])) {
    const def = SECTION_DEFS[sec.id]
    if (!def) continue
    const data = sectionFormToData(def, sec)
    if (data == null) delete out[sec.id]
    else out[sec.id] = data
  }
  // 职业由服务端按最新文本重新识别，不沿用旧职业元数据
  delete out.occupation
  delete out.warnings
  return out
}

function sectionFormToData(def, sec) {
  if (def.type === 'text') {
    return cleanText(sec.text) || null
  }
  if (def.type === 'object') {
    const obj = cleanObj(sec.object)
    return Object.keys(obj).length ? obj : null
  }
  if (def.type === 'skills') {
    const sk = {}
    for (const l of def.lists) sk[l.key] = linesToArr(sec.lists && sec.lists[l.key])
    const has = def.lists.some(l => sk[l.key].length > 0)
    return has ? sk : null
  }
  if (def.type === 'lines') {
    const arr = linesToArr(sec.lines)
    return arr.length ? arr : null
  }
  // items
  const items = []
  for (const item of (sec.items || [])) {
    const obj = {}
    for (const f of def.fields) {
      const v = cleanText(item.fields && item.fields[f.key])
      if (v) obj[f.key] = v
    }
    for (const l of def.lists || []) {
      const arr = linesToArr(item.lists && item.lists[l.key])
      if (arr.length) obj[l.key] = arr
    }
    if (Object.keys(obj).length) items.push(obj)
  }
  return items.length ? items : null
}

// ---------- 模板字段结构推断：解析模板占位符，得出该模板用到的基础字段与区块 ----------
const BASIC_KEYS = new Set(BASIC_FIELDS.map(f => f.key))
const SECTION_IDS = new Set(Object.keys(SECTION_DEFS))

function templatePathToSection(path) {
  const first = String(path).split('.')[0]
  if (BASIC_KEYS.has(first)) return 'basic'
  if (SECTION_IDS.has(first)) return first
  return null
}

export function inferTemplateFields(html) {
  const src = String(html || '')
  const basicKeys = new Set()
  const sections = new Set()
  // 循环块归属：{{#xxx}}...{{/xxx}} 内出现的裸字段归 xxx
  const blockRe = /\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g
  let m
  while ((m = blockRe.exec(src))) {
    const sec = templatePathToSection(m[1])
    if (sec && sec !== 'basic') sections.add(sec)
    const innerRe = /\{\{([\w.]+)\}\}/g
    let im
    while ((im = innerRe.exec(m[2]))) {
      const first = String(im[1]).split('.')[0]
      if (BASIC_KEYS.has(first)) basicKeys.add(first)
    }
  }
  // 顶层占位符（含 {{^xxx}} / {{#if:xxx}} 内字段）
  const fieldRe = /\{\{\^?([\w.]+)\}\}|\{\{#if:([\w.]+)\}\}/g
  let fm
  while ((fm = fieldRe.exec(src))) {
    const path = fm[1] || fm[2]
    const sec = templatePathToSection(path)
    if (sec === 'basic') basicKeys.add(String(path).split('.')[0])
    else if (sec) sections.add(sec)
  }
  return {
    basicKeys: BASIC_FIELDS.filter(f => basicKeys.has(f.key)).map(f => f.key),
    sectionIds: SECTION_ORDER.filter(id => sections.has(id)),
  }
}

// 数组项展示标签（如「某科技公司 · 高级产品经理」）
export function itemLabel(id, item) {
  const def = SECTION_DEFS[id]
  if (!def || !def.fields || !item) return ''
  const parts = def.fields.map(f => cleanText(item[f.key])).filter(Boolean)
  return parts.slice(0, 2).join(' · ')
}

// 空表单（用于「添加区块」）
export function emptySectionForm(id) {
  return makeSectionForm(id, {})
}

export function addItemToSection(sec) {
  const def = SECTION_DEFS[sec.id]
  if (!def || def.type !== 'items') return
  const fields = {}
  for (const f of def.fields) fields[f.key] = ''
  const lists = {}
  for (const l of def.lists || []) lists[l.key] = ''
  sec.items.push({ _key: uid(), fields, lists })
}