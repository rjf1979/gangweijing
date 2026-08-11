// 简历模板轻量渲染引擎（管理后台预览 + 将来用户端复用）
// 语法：
//   {{field}}            字段（支持 a.b 点号路径；数组自动用「、」连接；HTML 转义）
//   {{.}}                循环块内当前字符串项
//   {{#list}}...{{/list}}  数组循环：对每个元素建立作用域渲染
//   {{^list}}...{{/list}}  空值/空数组时渲染
//   {{#if:field}}...{{/if}} 字段非空时渲染
export function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// 转义后的文本内换行统一转为 <br>：真实换行与字面 \n/\r\n 都处理，
// 避免结构化数据里遗留的字面 \n 在模板中原样显示（如 Node.js\nVue3）
function nl2br(escaped) {
  return String(escaped || '')
    .replace(/\\r\\n/g, '<br>')
    .replace(/\\n/g, '<br>')
    .replace(/\r\n/g, '<br>')
    .replace(/\n/g, '<br>')
}

function valAt(ctx, path) {
  if (path === '.') return ctx && ctx['.'] !== undefined ? ctx['.'] : ''
  const keys = String(path).split('.')
  let cur = ctx
  for (const k of keys) {
    if (cur == null) return ''
    cur = cur[k]
  }
  return cur
}

function fmt(v) {
  if (v == null) return ''
  if (Array.isArray(v)) return v.filter(x => x != null && String(x).trim() !== '').join('、')
  if (typeof v === 'object') return ''
  return String(v)
}

function expand(tpl, ctx) {
  let s = String(tpl || '')
  // 1) 数组循环块
  s = s.replace(/\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (m, path, inner) => {
    const list = valAt(ctx, path)
    if (!Array.isArray(list) || list.length === 0) return ''
    return list.map(item => expand(inner, item && typeof item === 'object' ? item : { '.': item })).join('')
  })
  // 2) 空值块
  s = s.replace(/\{\{\^([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (m, path, inner) => {
    const v = valAt(ctx, path)
    const empty = v == null || (Array.isArray(v) && v.length === 0) || String(v).trim() === ''
    return empty ? expand(inner, ctx) : ''
  })
  // 3) 条件块
  s = s.replace(/\{\{#if:([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (m, path, inner) => {
    const v = valAt(ctx, path)
    const has = v != null && (!Array.isArray(v) || v.length > 0) && String(v).trim() !== ''
    return has ? expand(inner, ctx) : ''
  })
  // 4) 循环块内当前字符串项
  s = s.replace(/\{\{\.\}\}/g, m => nl2br(escapeHtml(fmt(valAt(ctx, '.')))))
  // 5) 叶子字段
  s = s.replace(/\{\{([\w.]+)\}\}/g, (m, path) => nl2br(escapeHtml(fmt(valAt(ctx, path)))))
  return s
}

// basic 展开到顶层，模板可直接写 {{name}} 而非 {{basic.name}}
export function renderTemplate(template, data) {
  const ctx = { ...((data && data.basic) || {}), ...(data || {}) }
  return expand(template, ctx)
}