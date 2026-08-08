<template>
  <article id="resume-step" class="task neo-panel" aria-labelledby="resume-title">
    <div class="panel-heading"><span class="step-index" aria-hidden="true">01</span><div><p class="section-kicker">RESUME</p><h2 id="resume-title">上传你的简历</h2><p>支持 PDF、图片、DOCX，AI 自动识别版式结构；也可以直接粘贴文本。</p></div></div>

    <label class="drop drop-blue" :class="{ 'has-file': file }" for="resume-file">
      <input id="resume-file" type="file" accept=".pdf,.docx,.doc,image/*" @change="onFileChange">
      <span class="drop-action">{{ file ? '已选择文件，点击可重新选择' : '选择简历文件' }}</span>
      <small id="resume-file-status">{{ file ? '已选择文件，点击可重新选择' : 'PDF、图片或 DOCX，文件仅用于本次分析' }}</small>
      <span id="resume-file-meta" class="file-meta" :class="{ hidden: !file }">{{ fileMeta }}</span>
    </label>

    <p class="fine privacy-note">🔒 简历保存后自动脱敏（手机号、邮箱、证件号等敏感信息），仅用于 AI 分析，保护你的隐私。</p>

    <div class="upload-progress" :class="{ 'is-busy': busy }" :hidden="!uploading">
      <div class="upload-track" role="progressbar" aria-label="简历上传进度" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="uploadPct">
        <span class="upload-fill" :style="{ width: uploadPct + '%' }"></span>
      </div>
      <div class="upload-caption"><span>{{ uploadLabel }}</span><span>{{ busy ? '…' : uploadPct + '%' }}</span></div>
    </div>

    <div class="field-block"><label for="resume-text">简历文本</label><textarea id="resume-text" v-model="text" rows="8" placeholder="没有文件时，在这里粘贴简历文本" @input="onTextInput"></textarea></div>
    <p id="resume-error" class="error" role="alert">{{ error }}</p>
    <div class="action-row action-row-end"><button id="resume-next" class="neo-button neo-button-primary" type="button" :disabled="submitting" @click="submit">{{ submitting ? (uploading ? '上传中…' : '保存中…') : '解析简历' }}</button></div>
  </article>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api'
import { store, saveDraft, formatBytes, showLoading, hideLoading } from '../store'

const emit = defineEmits(['next'])

const text = ref('')
const file = ref(null)
const fileMeta = ref('')
const error = ref('')
const submitting = ref(false)
const uploading = ref(false)
const busy = ref(false)
const uploadPct = ref(0)
const uploadLabel = ref('正在上传简历…')

// OCR 识别结果：上传后暂存，用户未手动编辑文本时随保存一并提交，避免二次文本模型解析
const ocrStructured = ref(null)
const ocrUsage = ref(null)
const ocrModel = ref('')
const textTouched = ref(false)

function onFileChange(event) {
  const f = event.target.files && event.target.files[0]
  file.value = f || null
  fileMeta.value = f ? `${f.name} · ${formatBytes(f.size)}` : ''
  error.value = ''
  textTouched.value = false
  ocrStructured.value = null
  ocrUsage.value = null
  ocrModel.value = ''
}

function onTextInput() {
  textTouched.value = true
}

function fail(message) {
  uploading.value = false
  busy.value = false
  submitting.value = false
  error.value = message
  hideLoading()
}

async function submit() {
  error.value = ''
  let value = text.value.trim()
  let fileRef = ''
  let structured, usage, model
  if (file.value) {
    submitting.value = true
    uploading.value = true
    uploadPct.value = 0
    busy.value = false
    uploadLabel.value = '正在上传简历…'
    try {
      const data = await api.uploadResume(file.value, pct => {
        uploadPct.value = pct
        if (pct >= 100) {
          busy.value = true
          uploadLabel.value = '正在识别简历版式结构…'
        }
      })
      value = data.text || ''
      fileRef = data.fileRef || ''
      text.value = value
      textTouched.value = false
      ocrStructured.value = data.structured || null
      ocrUsage.value = data.usage || null
      ocrModel.value = data.model || ''
    } catch (err) {
      return fail(err.message)
    }
  } else {
    submitting.value = true
    showLoading('正在读取简历', '提取文本并保存到你的账号')
  }
  if (!value) return fail('请上传简历或粘贴简历文本。')
  // 仅当用户未手动编辑文本时，才把 OCR 结构化结果随保存提交（避免结构对不上已改文本）
  if (!textTouched.value) {
    structured = ocrStructured.value || undefined
    usage = ocrUsage.value || undefined
    model = ocrModel.value || undefined
  }
  try {
    await api.put('/api/resume', { text: value, fileRef, structured, usage, model })
  } catch (err) {
    return fail(err.message)
  }
  uploading.value = false
  busy.value = false
  submitting.value = false
  hideLoading()
  saveDraft({ resumeText: value })
  emit('next')
}

onMounted(() => {
  text.value = store.draft.resumeText || ''
})
</script>