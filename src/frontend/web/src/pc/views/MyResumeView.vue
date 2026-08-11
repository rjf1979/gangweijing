<template>
  <section class="resume-view">
    <div class="resume-toolbar">
      <div><p class="section-kicker">MY_RESUME</p><h1>我的简历</h1></div>
      <div class="resume-actions">
        <router-link v-if="hasResume" class="neo-button neo-button-secondary" to="/resume/edit">编辑简历</router-link>
        <router-link class="neo-button neo-button-secondary" to="/resume?mode=replace">更新简历</router-link>
        <button id="print-resume" class="neo-button neo-button-primary" type="button" :disabled="!hasContent" @click="printPage">打印或保存 PDF</button>
      </div>
    </div>
    <p class="fine">{{ meta }}</p>
    <article class="avatar-card neo-panel" aria-label="简历头像">
      <div class="avatar-card-body">
        <div class="avatar-frame" :class="{ 'avatar-empty': !avatarUrl }">
          <img v-if="avatarUrl" :src="avatarUrl" alt="我的头像" class="avatar-img" />
          <span v-else class="avatar-placeholder" aria-hidden="true">👤</span>
        </div>
        <div class="avatar-card-info">
          <h2 class="avatar-card-title">简历头像</h2>
          <p class="fine avatar-card-hint">上传后，所套用的简历模板中如需头像（模板占位符 <code>&#123;&#123;avatar&#125;&#125;</code>）会自动套用。</p>
          <div class="avatar-card-actions">
            <input ref="avatarInput" id="avatar-file" type="file" accept="image/*" class="avatar-file-input" @change="onAvatarFile" />
            <label for="avatar-file" class="neo-button neo-button-secondary avatar-upload-btn" :class="{ 'avatar-btn-disabled': uploading }">
              {{ uploading ? '上传中…' : (avatarUrl ? '更换头像' : '上传头像') }}
            </label>
            <span v-if="uploadProgress > 0 && uploadProgress < 100" class="avatar-progress" role="status">上传 {{ uploadProgress }}%</span>
          </div>
          <p v-if="avatarError" class="error">{{ avatarError }}</p>
        </div>
      </div>
    </article>
    <div v-if="hasTemplate && hasContent" class="resume-view-switch" role="group" aria-label="简历展示方式">
      <button type="button" class="resume-view-switch-btn" :class="{ active: viewMode === 'template' }" @click="switchView('template')">模板视图</button>
      <button type="button" class="resume-view-switch-btn" :class="{ active: viewMode === 'text' }" @click="switchView('text')">原文排版</button>
    </div>
    <div v-if="viewMode === 'template' && templateList.length > 1" class="template-switcher" role="group" aria-label="选择套用的简历模板">
      <span class="template-switcher-label">套用模板：</span>
      <button
        v-for="t in templateList"
        :key="t.id"
        type="button"
        class="template-switcher-btn"
        :class="{ active: currentTemplateId === t.id }"
        @click="selectTemplate(t)"
      >
        {{ t.name || t.id }}
        <span v-if="t.isDefault" class="neo-tag neo-tag-lime template-tag">默认</span>
        <span v-else class="neo-tag neo-tag-blue template-tag">{{ sourceLabel(t.source) }}</span>
      </button>
    </div>
    <template v-if="hasContent && viewMode === 'text'">
      <p v-if="maskSummary" class="fine privacy-note">🔒 本简历已自动脱敏：{{ maskSummary }}</p>
      <p class="fine privacy-note">✏️ 点击文档中高亮的脱敏内容可填写真实信息，打印/保存 PDF 后输出完整简历；填写内容只保存在本机浏览器，不会上传到服务器。</p>
      <p v-if="hasFills" class="fine mask-clear"><button type="button" class="link-button" @click="clearFills">清空已填写的复原内容</button></p>
    </template>
    <article class="resume-document" :class="{ 'resume-document-template': viewMode === 'template' }">
      <TemplateResumeView v-if="hasContent && viewMode === 'template'" ref="templateView" :template="templateInfo.template" :structured="structured" :signature="signature" :avatar="avatarUrl" />
      <ResumeHtmlView v-else-if="hasContent" :contact="contact" :blocks="blocks" :fills="fills" :occupation="occupation" @fill="onFill" />
      <p v-else class="resume-empty">{{ emptyText }}</p>
    </article>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'
import { showLoading, hideLoading } from '../store'
import ResumeHtmlView from '../components/ResumeHtmlView.vue'
import TemplateResumeView from '../components/TemplateResumeView.vue'
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
const occupation = ref(null)
const emptyText = ref('')
const structured = ref(null)
const templateInfo = ref(null)
const templateList = ref([])
const viewMode = ref('text')
const templateView = ref(null)
const avatarUrl = ref('')
const avatarError = ref('')
const uploading = ref(false)
const uploadProgress = ref(0)
const avatarInput = ref(null)

const currentTemplateId = computed(() => (templateInfo.value && templateInfo.value.template) ? templateInfo.value.template.id : '')

async function selectTemplate(t) {
  templateInfo.value = { ...(templateInfo.value || {}), template: t }
  try {
    await api.put('/api/resume/template', { templateId: t.id })
  } catch (err) {
    console.warn('模板选择保存失败：', err.message)
  }
}

function sourceLabel(source) {
  if (source === 'ai') return 'AI 生成'
  if (source === 'manual') return '人工编辑'
  return '内置'
}

const hasContent = computed(() => hasResume.value && blocks.value.length > 0)
const hasTemplate = computed(() => Boolean(templateInfo.value && templateInfo.value.applied && templateInfo.value.template && templateInfo.value.template.html))
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
  if (viewMode.value === 'template' && templateView.value) templateView.value.printTemplate()
  else window.print()
}

async function onAvatarFile(event) {
  const f = event.target.files && event.target.files[0]
  event.target.value = ''
  if (!f) return
  if (!f.type || !f.type.startsWith('image/')) {
    avatarError.value = '请选择图片格式（JPG / PNG / WebP / GIF）。'
    return
  }
  if (f.size > 5 * 1024 * 1024) {
    avatarError.value = '头像图片不能超过 5MB。'
    return
  }
  avatarError.value = ''
  uploading.value = true
  uploadProgress.value = 0
  try {
    const data = await api.uploadAvatar(f, pct => { uploadProgress.value = pct })
    const url = data.avatar && data.avatar.url ? location.origin + data.avatar.url : ''
    if (url) avatarUrl.value = url
  } catch (err) {
    avatarError.value = err.message
  } finally {
    uploading.value = false
    uploadProgress.value = 0
  }
}

function switchView(mode) {
  viewMode.value = mode
}

onMounted(async () => {
  showLoading('正在打开我的简历', '读取账号中保存的简历版本')
  try {
    const [data, tpl, tpls] = await Promise.all([
      api.get('/api/resume'),
      api.get('/api/resume/template').catch(() => null),
      api.get('/api/resume/templates').catch(() => null),
    ])
    hasResume.value = Boolean(data.hasResume)
    text.value = data.text || ''
    if (hasResume.value) {
      signature.value = resumeSignature(data.updatedAt, text.value)
      structured.value = data.structured || null
      avatarUrl.value = data.avatar && data.avatar.url ? location.origin + data.avatar.url : ''
      // 模板列表（后台管理系统生成的全部模板）优先：默认模板作为初始套用，列表内可自由切换
      if (tpls && Array.isArray(tpls.templates) && tpls.templates.length) {
        templateList.value = tpls.templates
        const preferred = tpls.preferredTemplateId ? tpls.templates.find(x => x.id === tpls.preferredTemplateId) : null
        const def = preferred || tpls.templates.find(x => x.isDefault) || tpls.templates[0]
        templateInfo.value = { applied: true, occupation: tpls.occupation || (tpl && tpl.occupation), template: def }
      } else {
        templateList.value = []
        templateInfo.value = tpl
      }
      if (hasTemplate.value) viewMode.value = 'template'
      // 原文描述块优先（text-first 排版），结构化仅作兜底；数据源只读，不新增 AI 调用
      const result = buildBlocks({ structured: data.structured, text: text.value })
      contact.value = result.contact || {}
      blocks.value = result.blocks || []
      occupation.value = result.occupation || null
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
