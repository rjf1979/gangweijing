<template>
  <article id="job-step" class="task neo-panel" aria-labelledby="job-title-heading">
    <div class="panel-heading"><span class="step-index" aria-hidden="true">03</span><div><p class="section-kicker">TARGET JOB</p><h2 id="job-title-heading">确认目标岗位</h2><p>上传岗位截图进行识别，或直接粘贴完整职位描述。</p></div></div>

    <div v-if="result" id="job-success" class="neo-alert neo-alert-success" role="status">
      <div class="job-success-text">
        <strong>岗位已更新，报告已生成</strong>
        <p>{{ result.reportName }} 已保存，首页「最近报告」会展示本次结果，随时可以回来查看。</p>
      </div>
      <div class="action-row job-success-actions">
        <router-link class="neo-button neo-button-primary" :to="result.reportPath">查看报告</router-link>
        <router-link class="neo-button neo-button-secondary" to="/">回到首页</router-link>
        <button class="neo-button neo-button-secondary" type="button" @click="result = null">继续编辑岗位</button>
      </div>
    </div>

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
    <div class="action-row"><button class="neo-button neo-button-secondary" type="button" @click="emit('back', 'facts')">返回事实</button><button id="job-next" class="neo-button neo-button-primary" type="button" :disabled="submitting" @click="submit">{{ submitting ? 'AI 分析中…' : '确认岗位，生成报告' }}</button></div>
  </article>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
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
const result = ref(null)

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
      resumeText: store.draft.facts || store.draft.resumeText,
      jobText: value,
      companyShortName: companyShortName.value.trim(),
      jobTitle: jobTitle.value.trim(),
    })
    saveDraft({
      report: data.report,
      reportName: data.reportName,
      reportUrl: data.reportUrl,
      emailSent: data.emailSent,
    })
    // 更新岗位后不再引导进入分析流程：报告已保存，首页「最近报告」可直接查看
    const token = String(data.reportUrl || '').split('/report/').pop()
    result.value = {
      reportName: data.reportName || '',
      reportPath: token ? '/report/' + token : '/reports',
    }
    submitting.value = false
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (err) {
    submitting.value = false
    if (err.code === 'EMAIL_NOT_VERIFIED') {
      router.push('/verify')
      return
    }
    error.value = err.message
  }
}

// 用户再次编辑岗位时，撤下上一次的成功提示
watch([jobText, companyShortName, jobTitle, file], () => {
  if (result.value) result.value = null
})

onMounted(() => {
  jobText.value = store.draft.jobText || ''
  companyShortName.value = store.draft.companyShortName || ''
  jobTitle.value = store.draft.jobTitle || ''
})
</script>

<style scoped>
.job-success-text strong { font-size: 17px; }
.job-success-text p { margin: 6px 0 0; color: var(--color-ink); }
.job-success-actions { margin-top: 10px; }
.job-success-actions .neo-button { flex: 0 0 auto; }
</style>