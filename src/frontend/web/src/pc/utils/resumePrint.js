// 简历打印版 HTML 生成：输出纯值（已复原填写）版本，与屏幕版 .resume-html 结构/class 一致
// 仅用于 window.print() 的 @media print 输出，规避浏览器不打印 input 值导致 PDF 缺内容
import { escapeHtml, fillMasked } from './maskedText.js'

// ---------- 头部字段展示配置（与 ResumeHtmlView 共用） ----------
export const CONTACT_LABELS = {
  gender: '性别',
  birth_year: '出生年份',
  phone: '手机号',
  email: '邮箱',
  location: '所在地',
  current_company: '当前公司',
  current_title: '当前职位',
  years_of_experience: '工作年限',
  expected_salary: '期望薪资',
  job_intention: '求职意向',
  available_date: '到岗时间',
}
export const CONTACT_ORDER = ['job_intention', 'years_of_experience', 'gender', 'birth_year', 'phone', 'email', 'location', 'current_company', 'current_title', 'expected_salary', 'available_date']

// ---------- 列表区块字段配置（工作/项目/教育通用） ----------
export const LIST_CFG = {
  work_experience: { main: 'company', sub: ['title'], desc: '', meta: ['industry'], list: ['responsibilities', 'achievements', 'skills_used'] },
  project_experience: { main: 'name', sub: ['role'], desc: 'description', meta: [], list: ['achievements', 'tech_stack'] },
  education: { main: 'school', sub: ['degree', 'major'], desc: '', meta: ['gpa'], list: ['honors'] },
}

function esc(v) {
  return escapeHtml(v)
}
// 用复原填写替换脱敏片段；segKey 需全局唯一（区块+条目+字段）
function fillSeg(text, segKey, fills) {
  return fillMasked(text, id => fills[`${segKey}-${id}`])
}
function linesOf(data) {
  if (Array.isArray(data)) return data.map(x => String(x ?? '')).filter(Boolean)
  return String(data || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean)
}
function timeRange(start, end) {
  const a = String(start || '').trim()
  const b = String(end || '').trim()
  if (a && b) return `${a} - ${b}`
  return a || b
}
function hasText(v) {
  return String(v ?? '').trim() !== ''
}

// ---------- 头部 ----------
function renderContactHtml(contact, fills) {
  const c = contact || {}
  const name = fillSeg(c.name || '', 'contact-name', fills)
  const titleLine = [c.current_title, c.current_company].filter(Boolean).join(' @ ')
  const items = CONTACT_ORDER.map(k => (c[k] ? { k, value: c[k] } : null)).filter(Boolean)
  let html = '<header class="rh-head">'
  if (name) html += `<h1 class="rh-name">${esc(name)}</h1>`
  if (titleLine) html += `<div class="rh-title">${esc(fillSeg(titleLine, 'contact-title', fills))}</div>`
  if (items.length) {
    html += '<div class="rh-contact">' + items.map(it => {
      const v = fillSeg(it.value, `contact-${it.k}`, fills)
      return `<span class="rh-contact-item"><span class="rh-contact-label">${esc(CONTACT_LABELS[it.k] || it.k)}</span><span class="rh-contact-value">${esc(v)}</span></span>`
    }).join('') + '</div>'
  }
  html += '</header>'
  return html
}

// ---------- 原文头部块（kind='raw' 页眉） ----------
function renderRawHeader(block, fills) {
  const g = block && block.groups && block.groups[0]
  if (!g || g.type !== 'header') return ''
  let html = '<header class="rh-head">'
  if (g.name) html += `<h1 class="rh-name">${esc(fillSeg(g.name, 'raw-name', fills))}</h1>`
  if (g.lines && g.lines.length) {
    html += '<div class="rh-contact">' + g.lines.map((ln, i) =>
      `<span class="rh-contact-item"><span class="rh-contact-value">${esc(fillSeg(ln, 'raw-h' + i, fills))}</span></span>`
    ).join('') + '</div>'
  }
  html += '</header>'
  return html
}

// ---------- 原文描述块（text-first 排版，与屏幕版 segKey 一致） ----------
function renderRawGroups(block, fills) {
  const groups = block.groups || []
  return groups.map((g, gi) => {
    const key = s => `${block.id}-g${gi}` + (s === undefined || s === '' ? '' : '-' + s)
    if (g.type === 'subhead') return `<div class="rh-subhead">${esc(fillSeg(g.text, key(''), fills))}</div>`
    if (g.type === 'time') return `<div class="rh-raw-time">${esc(fillSeg(g.text, key(''), fills))}</div>`
    if (g.type === 'entry') {
      const title = (g.lines && g.lines[0]) || ''
      const sub = (g.lines && g.lines.slice(1).join(' · ')) || ''
      const timeHtml = g.time ? `<div class="rh-entry-time">${esc(g.time)}</div>` : ''
      let head = `<div class="rh-entry-head"><strong class="rh-entry-title">${esc(fillSeg(title, key(0), fills))}</strong>`
      if (sub) head += `<span class="rh-entry-sub">${esc(fillSeg(sub, key('sub'), fills))}</span>`
      head += '</div>'
      return `<article class="rh-entry">${timeHtml}<div class="rh-entry-main">${head}</div></article>`
    }
    if (g.type === 'list') {
      const items = (g.items || []).map((it, li) => `<li>${esc(fillSeg(it, key(li), fills))}</li>`).join('')
      return items ? `<ul class="rh-raw-list">${items}</ul>` : ''
    }
    return `<div class="rh-text">${esc(fillSeg(g.text, key(''), fills))}</div>`
  }).join('')
}

// 职业模板徽标（与屏幕版一致，打印版同样输出）
function occupationBadge(occ) {
  if (!occ || !occ.id) return ''
  const pct = Math.round((occ.confidence || 0) * 100)
  const kw = Array.isArray(occ.matchedKeywords) && occ.matchedKeywords.length ? occ.matchedKeywords.slice(0, 4).map(k => k.k).join('、') : ''
  const id = String(occ.id).replace(/[^\w-]/g, '')
  const text = `职业模板：${occ.name || occ.id} · 置信度 ${pct}%` + (kw ? `（命中：${kw}）` : '')
  return `<div class="rh-occupation-badge rh-occ-${esc(id)}">${esc(text)}</div>`
}

// ---------- 区块 ----------
function renderBlock(block, fills) {
  const title = block.title ? `<h2 class="rh-h2">${esc(block.title)}</h2>` : ''
  let inner = ''
  if (block.kind === 'raw') inner = renderRawGroups(block, fills)
  else if (block.kind === 'list') inner = renderListBlock(block, fills)
  else if (block.kind === 'skills') inner = renderSkillsBlock(block.data)
  else if (block.kind === 'lines') inner = renderLinesBlock(block, fills)
  else inner = renderText(block.data, block.id, fills)
  const cls = ['rh-section', block.id ? 'rh-' + esc(block.id) : '', block.emphasis ? 'rh-emphasis' : '', block.emphasis === 'core' ? 'rh-emphasis-core' : '', block.emphasis === 'secondary' ? 'rh-emphasis-secondary' : ''].filter(Boolean).join(' ')
  return `<section class="${cls}">${title}${inner}</section>`
}

function renderText(data, segKey, fills) {
  return `<div class="rh-text">${esc(fillSeg(String(data ?? ''), segKey, fills))}</div>`
}

function renderLinesBlock(block, fills) {
  const lines = linesOf(block.data)
  if (!lines.length) return ''
  const items = lines.map((l, i) => `<li>${esc(fillSeg(l, `${block.id}-l${i}`, fills))}</li>`).join('')
  return `<ul class="rh-lines">${items}</ul>`
}

function renderSkillsBlock(skills) {
  const groups = [
    { key: 'technical', label: '专业技能' },
    { key: 'tools', label: '工具' },
    { key: 'soft', label: '软技能' },
    { key: 'languages', label: '语言' },
  ]
  const html = groups
    .filter(g => Array.isArray(skills[g.key]) && skills[g.key].length)
    .map(g => `<div class="rh-skill-group"><span class="rh-skill-label">${esc(g.label)}</span><span class="rh-skill-items">${skills[g.key].map(x => esc(String(x))).join('、')}</span></div>`)
    .join('')
  return html ? `<div class="rh-skills">${html}</div>` : ''
}

function renderListBlock(block, fills) {
  const cfg = LIST_CFG[block.id] || { main: '', sub: [], desc: '', meta: [], list: [] }
  const entries = block.data.map((item, i) => renderEntry(item, i, block.id, cfg, fills)).filter(Boolean)
  return entries.length ? `<div class="rh-timeline">${entries.join('')}</div>` : ''
}

function renderEntry(item, i, blockId, cfg, fills) {
  const isObj = item && typeof item === 'object'
  const get = k => (isObj ? String(item[k] ?? '') : '').trim()
  const key = s => `${blockId}-${i}-${s}`
  const raw = isObj ? '' : String(item ?? '').trim()
  const time = timeRange(get('start_date'), get('end_date'))
  const main = raw || get(cfg.main)
  if (!main && !time) return ''
  const sub = (cfg.sub || []).map(k => get(k)).filter(Boolean).join(' · ')
  const meta = (cfg.meta || []).map(k => get(k)).filter(Boolean).join(' · ')
  const desc = cfg.desc ? get(cfg.desc) : ''
  const listTexts = (cfg.list || []).flatMap(k => linesOf(item[k]))
  const timeHtml = time ? `<div class="rh-entry-time">${esc(time)}</div>` : ''
  let body = `<div class="rh-entry-head"><strong class="rh-entry-title">${esc(fillSeg(main, key('main'), fills))}</strong>`
  if (sub) body += `<span class="rh-entry-sub">${esc(fillSeg(sub, key('sub'), fills))}</span>`
  body += '</div>'
  if (meta) body += `<div class="rh-entry-meta">${esc(fillSeg(meta, key('meta'), fills))}</div>`
  if (desc) body += `<div class="rh-entry-desc">${esc(fillSeg(desc, key('desc'), fills))}</div>`
  if (listTexts.length) {
    body += `<ul class="rh-entry-list">${listTexts.map((t, j) => `<li>${esc(fillSeg(t, `${key('li')}${j}`, fills))}</li>`).join('')}</ul>`
  }
  return `<article class="rh-entry">${timeHtml}<div class="rh-entry-main">${body}</div></article>`
}

// ---------- 主入口 ----------
export function renderResumeHtml({ contact, blocks, fills, occupation }) {
  const f = fills || {}
  const list = blocks || []
  const headerBlock = list.find(b => b.id === 'header' && b.kind === 'raw')
  const rawHead = headerBlock ? renderRawHeader(headerBlock, f) : ''
  const head = rawHead || renderContactHtml(contact, f)
  const body = list.filter(b => b.id !== 'header').map(b => renderBlock(b, f)).join('')
  const badge = occupationBadge(occupation)
  return `<div class="resume-sheet-inner">${badge}${head}${body ? `<main class="rh-body">${body}</main>` : ''}</div>`
}
