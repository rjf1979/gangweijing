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

// ---------- 区块 ----------
function renderBlock(block, fills) {
  const title = block.title ? `<h2 class="rh-h2">${esc(block.title)}</h2>` : ''
  let inner = ''
  if (block.kind === 'list') inner = renderListBlock(block, fills)
  else if (block.kind === 'skills') inner = renderSkillsBlock(block.data)
  else if (block.kind === 'lines') inner = renderLinesBlock(block, fills)
  else inner = renderText(block.data, block.id, fills)
  return `<section class="rh-section ${block.id ? 'rh-' + esc(block.id) : ''}">${title}${inner}</section>`
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
export function renderResumeHtml({ contact, blocks, fills }) {
  const head = renderContactHtml(contact, fills || {})
  const body = (blocks || []).map(b => renderBlock(b, fills || {})).join('')
  return `<div class="resume-sheet-inner">${head}${body ? `<main class="rh-body">${body}</main>` : ''}</div>`
}