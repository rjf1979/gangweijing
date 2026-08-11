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


// 头像兜底：模板未声明 {{avatar}} 占位时，若提供了头像 URL，
// 自动把模板中的姓名圆（class 含 avatar 的元素）升级为头像图片。
// 保证「我的简历 / 编辑预览」里上传的头像在任意模板视图中都能展示。
function ensureAvatar(html, avatarUrl) {
  if (!avatarUrl) return html
  const url = String(avatarUrl)
  // 渲染结果已引用该头像 URL：模板自带 {{avatar}}，无需兜底
  if (html.includes(url)) return html
  // 候选 class：avatar 系（姓名圆/头像位）优先，其次 profile-mark/photo/portrait 等常见头像位
  const classRe = 'avatar|profile-mark|profile_photo|headshot|portrait|photo|avatar-photo|avatar-wrap|avatar-box'
  const re = new RegExp('<([a-zA-Z][\\w-]*)([^>]*\\bclass\\s*=\\s*["\'][^"\']*\\b(' + classRe + ')\\b[^"\']*["\'][^>]*)>([\\s\\S]*?)<\\/\\1>', 'i')
  const m = re.exec(html)
  if (!m) return html
  // 元素内部已有 img（模板自带头像位），不覆盖
  if (/<img[\s>]/i.test(m[4])) return html
  const tag = m[1]
  const attrs = m[2]
  const safeUrl = url.replace(/"/g, '&quot;')
  const img = '<img src="' + safeUrl + '" alt="头像" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block">'
  return html.slice(0, m.index) + '<' + tag + attrs + '>' + img + '</' + tag + '>' + html.slice(m.index + m[0].length)
}

// basic 展开到顶层，模板可直接写 {{name}} 而非 {{basic.name}}
export function renderTemplate(template, data) {
  const ctx = { ...((data && data.basic) || {}), ...(data || {}) }
  let html = expand(template, ctx)
  html = ensureAvatar(html, data && data.avatar)
  return html
}