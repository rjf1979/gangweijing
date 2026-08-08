<template>
  <section class="resume-view">
    <div class="resume-toolbar">
      <div><p class="section-kicker">MY_RESUME</p><h1>我的简历</h1></div>
      <div class="resume-actions">
        <router-link class="neo-button neo-button-secondary" to="/resume?mode=replace">更新简历</router-link>
        <button id="print-resume" class="neo-button neo-button-primary" type="button" :disabled="!hasContent" @click="printPage">打印或保存 PDF</button>
      </div>
    </div>
    <p class="fine">{{ meta }}</p>
    <template v-if="hasContent">
      <p v-if="maskSummary" class="fine privacy-note">🔒 本简历已自动脱敏：{{ maskSummary }}</p>
      <p class="fine privacy-note">✏️ 点击文档中高亮的脱敏内容可填写真实信息，打印/保存 PDF 后输出完整简历；填写内容只保存在本机浏览器，不会上传到服务器。</p>
      <p v-if="hasFills" class="fine mask-clear"><button type="button" class="link-button" @click="clearFills">清空已填写的复原内容</button></p>
    </template>
    <article class="resume-document">
      <ResumeHtmlView v-if="hasContent" :contact="contact" :blocks="blocks" :fills="fills" @fill="onFill" />
      <p v-else class="resume-empty">{{ emptyText }}</p>
    </article>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'
import { showLoading, hideLoading } from '../store'
import ResumeHtmlView from '../components/ResumeHtmlView.vue'
import { buildBlocks } from '../utils/resumeBlocks.js'
import { resumeSignature } from '../utils/maskedText.js'

const text = ref('')
const meta = ref('')
const hasResume = ref(false)
const maskSummary = ref('')
const signature = ref('')
const contact = ref({})
const blocks = ref([])
const fills = ref({})
const emptyText = ref('')

const hasContent = computed(() => hasResume.value && blocks.value.length > 0)
const hasFills = computed(() => Object.keys(fills.value).some(id => {
  const v = fills.value[id]
  return typeof v === 'string' && v.trim() !== ''
}))

// 复原填写只保存在本机浏览器（localStorage），绝不写入服务器/数据库；
// 填写缓存按「简历版本」签名隔离，简历更新后签名变化，旧填写自动失效，避免张冠李戴
const FILLS_KEY = 'jobMirrorResumeFills'

function readFills() {
  try {
    const all = JSON.parse(localStorage.getItem(FILLS_KEY) || '{}')
    return all[signature.value] || {}
  } catch { return {} }
}
function persistFills() {
  try {
    const all = JSON.parse(localStorage.getItem(FILLS_KEY) || '{}')
    all[signature.value] = { ...fills.value }
    localStorage.setItem(FILLS_KEY, JSON.stringify(all))
  } catch { /* 隐私模式等无法写入时静默降级，仅影响本地记忆 */ }
}

function onFill({ id, value, filled }) {
  const next = { ...fills.value }
  if (filled) next[id] = value
  else delete next[id]
  fills.value = next
  persistFills()
}

function clearFills() {
  try {
    const all = JSON.parse(localStorage.getItem(FILLS_KEY) || '{}')
    delete all[signature.value]
    localStorage.setItem(FILLS_KEY, JSON.stringify(all))
  } catch { /* 静默降级 */ }
  fills.value = {}
}

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
      // 结构化优先 + 文本兜底 + 自由区块 + 内容保护（数据源只读，不新增 AI 调用）
      const result = buildBlocks({ structured: data.structured, text: text.value })
      contact.value = result.contact || {}
      blocks.value = result.blocks || []
      fills.value = readFills()
      // 自我完善一档观测埋点：仅本地控制台记录覆盖率，供后续沉淀进区块注册表
      if (result.coverage) {
        console.debug('[resume-blocks] coverage:', JSON.stringify(result.coverage))
      }
      const fields = Array.isArray(data.maskedFields) && data.maskedFields.length ? data.maskedFields : []
      maskSummary.value = fields.length ? fields.map(f => `${f.label}×${f.count}`).join('、') : ''
      emptyText.value = blocks.value.length ? '' : '简历内容为空，请更新简历。'
      meta.value = `最近更新：${new Date(data.updatedAt).toLocaleString('zh-CN')}`
    } else {
      emptyText.value = '账号中还没有可查看的简历。'
      maskSummary.value = ''
      meta.value = ''
    }
  } catch (err) {
    emptyText.value = err.message
    maskSummary.value = ''
    meta.value = ''
  } finally {
    hideLoading()
  }
})
</script>