<template>
  <section class="resume-view">
    <div class="resume-toolbar">
      <div><p class="section-kicker">MY_RESUME</p><h1>我的简历</h1></div>
      <div class="resume-actions">
        <router-link class="neo-button neo-button-secondary" to="/resume?mode=replace">更新简历</router-link>
        <button id="print-resume" class="neo-button neo-button-primary" type="button" @click="printPage">打印或保存 PDF</button>
      </div>
    </div>
    <p class="fine">{{ meta }}</p>
    <template v-if="hasResume">
      <p v-if="maskSummary" class="fine privacy-note">🔒 本简历已自动脱敏：{{ maskSummary }}</p>
      <p class="fine privacy-note">✏️ 点击文档中高亮的脱敏内容可填写真实信息，打印/保存 PDF 后输出完整简历；填写内容只保存在本机浏览器，不会上传到服务器。</p>
      <p v-if="hasFills" class="fine mask-clear"><button type="button" class="link-button" @click="clearFills">清空已填写的复原内容</button></p>
    </template>
    <article class="resume-document">
      <pre id="resume-document-text" class="resume-text"><template v-for="(seg, i) in segments" :key="i"><template v-if="seg.type === 'masked'"><span class="mask-tag">{{ seg.label }}</span><input class="mask-input" :class="{ 'is-filled': seg.filled }" :value="seg.value" :placeholder="seg.masked" :aria-label="seg.label" @input="onMaskInput($event, seg)" /></template><template v-else>{{ seg.text }}</template></template></pre>
      <pre class="print-output" aria-hidden="true">{{ printText }}</pre>
    </article>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'
import { showLoading, hideLoading } from '../store'

const text = ref('')
const meta = ref('')
const hasResume = ref(false)
const segments = ref([])
const maskSummary = ref('')
const signature = ref('')

// 复原填写只保存在本机浏览器（localStorage），绝不写入服务器/数据库；
// 填写缓存按「简历版本」签名隔离，简历更新后签名变化，旧填写自动失效，避免张冠李戴
const FILLS_KEY = 'jobMirrorResumeFills'

function simpleHash(str) {
  let h = 5381
  const s = String(str || '')
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}
function resumeSignature(updatedAt, textValue) {
  return `${updatedAt || '0'}|${simpleHash(textValue)}`
}
function readFills() {
  try {
    const all = JSON.parse(localStorage.getItem(FILLS_KEY) || '{}')
    return all[signature.value] || {}
  } catch { return {} }
}
function persistFills() {
  try {
    const all = JSON.parse(localStorage.getItem(FILLS_KEY) || '{}')
    const fills = {}
    for (const seg of segments.value) {
      if (seg.type === 'masked' && seg.filled) fills[seg.id] = seg.value
    }
    all[signature.value] = fills
    localStorage.setItem(FILLS_KEY, JSON.stringify(all))
  } catch { /* 隐私模式等无法写入时静默降级，仅影响本地记忆 */ }
}

// 识别已脱敏片段（与后端 maskResumePII 产物一致），标注类型供填写复原；复原内容仅本地打印使用，不上传服务器
const MASK_PATTERNS = [
  { type: 'phone', label: '手机号', re: /1[3-9]\d\*{4}\d{4}/ },
  { type: 'landline', label: '座机', re: /0\d{2,3}-?\d{3,4}\*{4}/ },
  { type: 'email', label: '邮箱', re: /[A-Za-z0-9_+-]\*{1,3}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/ },
  { type: 'idcard', label: '身份证号', re: /\d{6}\*{7,8}\d{3,4}/ },
  { type: 'bankcard', label: '银行卡号', re: /\d{6}\*{6}\d{4}/ },
  { type: 'wechat', label: '微信号/QQ', re: /(?:微信|QQ|qq|Q Q)[：:]\*{4}/ },
  { type: 'address', label: '门牌号', re: /[\u4e00-\u9fa5]{1,12}?(?:路|街|道|巷|弄|大道)\*{2}号/ },
  { type: 'building', label: '楼栋室号', re: /\d{1,4}(?:栋|号楼)\*{2}(?=室|单元|号)/ },
]

function buildSegments(raw) {
  const list = []
  const combined = new RegExp(MASK_PATTERNS.map(p => p.re.source).join('|'), 'g')
  let last = 0
  let id = 0
  let m
  while ((m = combined.exec(raw)) !== null) {
    if (m.index > last) list.push({ type: 'text', text: raw.slice(last, m.index) })
    const masked = m[0]
    const info = MASK_PATTERNS.find(p => p.re.test(masked)) || { label: '脱敏信息' }
    list.push({ type: 'masked', id: 'm' + (id++), label: info.label, masked, value: masked, filled: false })
    last = m.index + masked.length
  }
  if (last < raw.length) list.push({ type: 'text', text: raw.slice(last) })
  return list
}

function restoreFills() {
  const fills = readFills()
  for (const seg of segments.value) {
    if (seg.type !== 'masked') continue
    const saved = fills[seg.id]
    if (typeof saved === 'string' && saved !== seg.masked) {
      seg.value = saved
      seg.filled = true
    }
  }
}

function onMaskInput(event, seg) {
  seg.value = event.target.value
  seg.filled = seg.value.trim() !== '' && seg.value.trim() !== seg.masked
  persistFills()
}

function clearFills() {
  try {
    const all = JSON.parse(localStorage.getItem(FILLS_KEY) || '{}')
    delete all[signature.value]
    localStorage.setItem(FILLS_KEY, JSON.stringify(all))
  } catch { /* 静默降级 */ }
  for (const seg of segments.value) {
    if (seg.type === 'masked') { seg.value = seg.masked; seg.filled = false }
  }
}

const hasFills = computed(() => segments.value.some(seg => seg.type === 'masked' && seg.filled))

// 打印/保存 PDF 输出纯文本版：已填写的复原值直接替换进正文，避免浏览器不打印 input 值导致 PDF 缺内容
const printText = computed(() => segments.value.map(seg => {
  if (seg.type !== 'masked') return seg.text
  return seg.filled ? seg.value : seg.masked
}).join(''))

function printPage() {
  window.print()
}

onMounted(async () => {
  showLoading('正在打开我的简历', '读取账号中保存的简历版本')
  try {
    const data = await api.get('/api/resume')
    hasResume.value = Boolean(data.hasResume)
    text.value = data.text || ''
    if (hasResume.value) {
      signature.value = resumeSignature(data.updatedAt, text.value)
      segments.value = buildSegments(text.value)
      restoreFills()
      const fields = Array.isArray(data.maskedFields) && data.maskedFields.length ? data.maskedFields : []
      maskSummary.value = fields.length ? fields.map(f => `${f.label}×${f.count}`).join('、') : ''
    } else {
      segments.value = [{ type: 'text', text: '账号中还没有可查看的简历。' }]
      maskSummary.value = ''
    }
    meta.value = hasResume.value
      ? `最近更新：${new Date(data.updatedAt).toLocaleString('zh-CN')}`
      : ''
  } catch (err) {
    text.value = err.message
    segments.value = [{ type: 'text', text: err.message }]
    maskSummary.value = ''
  } finally {
    hideLoading()
  }
})
</script>