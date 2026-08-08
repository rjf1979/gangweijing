// 脱敏文本工具：分段标注、复原替换、HTML 转义、版本签名
// 仅用于排版展示与本地复原填写，绝不修改/上传 resume_text 原文

// 脱敏模式：与后端 maskResumePII 产物保持一致（幂等）
export const MASK_PATTERNS = [
  { type: 'phone', label: '手机号', re: /1[3-9]\d\*{4}\d{4}/ },
  { type: 'landline', label: '座机', re: /0\d{2,3}-?\d{3,4}\*{4}/ },
  { type: 'email', label: '邮箱', re: /[A-Za-z0-9_+-]\*{1,3}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/ },
  { type: 'idcard', label: '身份证号', re: /\d{6}\*{7,8}\d{3,4}/ },
  { type: 'bankcard', label: '银行卡号', re: /\d{6}\*{6}\d{4}/ },
  { type: 'wechat', label: '微信号/QQ', re: /(?:微信|QQ|qq|Q Q)[：:]\*{4}/ },
  { type: 'address', label: '门牌号', re: /[\u4e00-\u9fa5]{1,12}?(?:路|街|道|巷|弄|大道)\*{2}号/ },
  { type: 'building', label: '楼栋室号', re: /\d{1,4}(?:栋|号楼)\*{2}(?=室|单元|号)/ },
]

const MASK_COMBINED = new RegExp(MASK_PATTERNS.map(p => p.re.source).join('|'), 'g')

// 把一段文本切成普通文字 + 脱敏片段（segments）
// 返回 [{ type:'text', text } | { type:'masked', id, label, masked, value, filled }]
export function splitMasked(raw) {
  const text = String(raw || '')
  const list = []
  let last = 0
  let id = 0
  let m
  MASK_COMBINED.lastIndex = 0
  while ((m = MASK_COMBINED.exec(text)) !== null) {
    if (m.index > last) list.push({ type: 'text', text: text.slice(last, m.index) })
    const masked = m[0]
    const info = MASK_PATTERNS.find(p => p.re.test(masked)) || { label: '脱敏信息' }
    list.push({ type: 'masked', id: 'm' + (id++), label: info.label, masked, value: masked, filled: false })
    last = m.index + masked.length
  }
  if (last < text.length) list.push({ type: 'text', text: text.slice(last) })
  return list
}

// 判断文本是否含脱敏片段（快速检查，用于决定是否需要行内标注）
export function hasMasked(raw) {
  MASK_COMBINED.lastIndex = 0
  return MASK_COMBINED.test(String(raw || ''))
}

// 用复原填写值替换脱敏片段，返回纯文本（打印/PDF 输出用）
// getValue(segId) -> string | undefined
export function fillMasked(raw, getValue) {
  const segs = splitMasked(raw)
  return segs.map(seg => {
    if (seg.type !== 'masked') return seg.text
    const v = typeof getValue === 'function' ? getValue(seg.id) : undefined
    if (typeof v === 'string' && v.trim() !== '' && v.trim() !== seg.masked) return v
    return seg.masked
  }).join('')
}

// HTML 转义（渲染结构化内容时防 XSS）
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function simpleHash(str) {
  let h = 5381
  const s = String(str || '')
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

// 简历版本签名：更新时间和内容哈希共同决定，签名变化即旧填写失效
export function resumeSignature(updatedAt, textValue) {
  return `${updatedAt || '0'}|${simpleHash(textValue)}`
}