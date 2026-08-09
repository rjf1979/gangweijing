<template>
  <article id="job-step" class="task neo-panel" aria-labelledby="job-title-heading">
    <div class="panel-heading"><span class="step-index" aria-hidden="true">03</span><div><p class="section-kicker">TARGET JOB</p><h2 id="job-title-heading">确认目标岗位</h2><p>上传岗位截图进行识别，或直接粘贴完整职位描述。</p></div></div>

    <label class="drop drop-blue" :class="{ 'has-file': file }" for="job-file">
      <input id="job-file" type="file" accept="image/*" @change="onFileChange">
      <span class="drop-action">{{ file ? '已选择截图，点击可重新选择' : '选择岗位截图' }}</span>
      <small>{{ file ? fileMeta : 'JPG、PNG 或 WebP' }}</small>
    </label>

    <div class="field-block"><label for="job-text">职位描述</label><textarea id="job-text" v-model="jobText" rows="10" placeholder="也可以直接粘贴职位描述"></textarea></div>
    <div class="field-row">
      <div class="field-block"><label for="company-short-name">公司简称</label><input id="company-short-name" v-model="companyShortName" autocomplete="organization" placeholder="例如：字节跳动"></div>
      <div class="field-block"><label for="job-title">岗位名称</label><input id="job-title" v-model="jobTitle" placeholder="例如：产品经理"></div>
    </div>
    <p id="job-error" class="error" role="alert">{{ error }}</p>
    <div class="action-row"><button class="neo-button neo-button-secondary" type="button" :disabled="submitting" @click="emit('back', 'facts')">返回事实</button><button id="job-next" class="neo-button neo-button-primary" type="button" :disabled="submitting" @click="submit">{{ submitting ? 'AI 分析中…' : '确认岗位，生成报告' }}</button></div>
  </article>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { store, saveDraft, formatBytes, showLoading, hideLoading } from '../store'

const emit = defineEmits(['next', 'back'])
const router = useRouter()

const file = ref(null)
const fileMeta = ref('')
const jobText = ref('')
const companyShortName = ref('')
const jobTitle = ref('')
const error = ref('')
const submitting = ref(false)

function onFileChange(event) {
  const f = event.target.files && event.target.files[0]
  file.value = f || null
  fileMeta.value = f ? `${f.name} · ${formatBytes(f.size)}` : ''
  error.value = ''
}

async function submit() {
  error.value = ''
  submitting.value = true
  let value = jobText.value.trim()
  const f = file.value
  if (f && !value) {
    showLoading('正在处理目标岗位', '识别岗位信息并准备分析')
    try {
      const data = await api.uploadScreenshot(f)
      value = data.text || ''
      jobText.value = value
      if (data.companyShortName) companyShortName.value = data.companyShortName
      if (data.jobTitle) jobTitle.value = data.jobTitle
    } catch (err) {
      submitting.value = false
      hideLoading()
      error.value = err.message
      return
    }
    hideLoading()
  }
  if (!value) {
    submitting.value = false
    error.value = '请上传截图或粘贴职位描述。'
    return
  }
  saveDraft({
    jobText: value,
    companyShortName: companyShortName.value.trim(),
    jobTitle: jobTitle.value.trim(),
  })
  try {
    const data = await api.post('/api/analyze', {
      resumeText: store.draft.resumeText,
      jobText: value,
      companyShortName: companyShortName.value.trim(),
      jobTitle: jobTitle.value.trim(),
    })
    saveDraft({
      report: null,
      reportName: data.reportName,
      reportUrl: data.reportUrl,
      emailSent: false,
    })
    // 后台排队分析：提交即入队，跳转报告详情页展示“分析中”并自动刷新，完成后展示结果
    store.hasAnyReport = true // 本会话内已完成一次全流程，之后回首页不再强制引导
    submitting.value = false
    const token = data.reportUrl ? String(data.reportUrl).split('/').pop() : ''
    if (token) router.push('/report/' + token)
  } catch (err) {
    submitting.value = false
    if (err.code === 'EMAIL_NOT_VERIFIED') {
      router.push('/verify')
      return
    }
    error.value = err.message
  }
}


onMounted(async () => {
  jobText.value = store.draft.jobText || ''
  companyShortName.value = store.draft.companyShortName || ''
  jobTitle.value = store.draft.jobTitle || ''
  // 以服务端已保存的简历为准，保证分析使用最新简历（避免旧草稿串值）
  try {
    const resume = await api.get('/api/resume')
    if (resume.text) saveDraft({ resumeText: resume.text, facts: undefined })
  } catch {
    // 读取失败时保留本地草稿
  }
})
</script>
