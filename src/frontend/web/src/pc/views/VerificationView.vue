<template>
  <section class="welcome verification-layout" aria-labelledby="verification-title">
    <article class="neo-panel verification-panel">
      <p class="neo-tag neo-tag-blue">EMAIL VERIFICATION</p>
      <h1 id="verification-title">{{ title }}</h1>
      <p class="lead">{{ copy }}</p>
      <p class="neo-alert neo-alert-info" role="status" aria-live="polite">{{ status }}</p>
      <div class="action-row">
        <button v-if="mode === 'notice'" id="resend-verification" class="neo-button neo-button-primary" type="button" :disabled="sending" @click="resend">
          {{ sending ? '发送中…' : '重新发送验证邮件' }}
        </button>
        <button v-if="showContinue" class="neo-button neo-button-primary" type="button" @click="continueApp">继续使用岗位镜</button>
      </div>
    </article>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { store, refreshSession, maskedEmail, showLoading, hideLoading, clearJobDraft } from '../store'

const props = defineProps({
  mode: { type: String, default: 'notice' }, // notice | verify-link
})

const route = useRoute()
const router = useRouter()

const title = ref('验证邮箱后继续')
const copy = ref('')
const status = ref('如果没有收到邮件，可以重新发送。')
const sending = ref(false)
const showContinue = ref(false)

async function continueApp() {
  showLoading('正在确认账号状态', '正在为你准备下一步')
  await refreshSession()
  if (!store.authenticated) {
    hideLoading()
    router.replace('/')
    return
  }
  if (!store.user?.emailVerified) {
    hideLoading()
    router.replace('/verify')
    return
  }
  let hasResume = false
  try {
    const data = await api.get('/api/resume')
    hasResume = Boolean(data.hasResume)
  } catch { /* 忽略，按无简历处理 */ }
  hideLoading()
  if (hasResume) {
    clearJobDraft() // 验证后进入岗位分析视为全新分析：清空上次岗位草稿
    router.replace('/job')
  } else {
    router.replace('/resume')
  }
}

async function resend() {
  sending.value = true
  try {
    const data = await api.post('/api/verification-email', {})
    status.value = data.verified
      ? '邮箱已经验证，可以继续使用。'
      : '验证邮件已重新发送，请检查收件箱和垃圾邮件。'
  } catch (err) {
    status.value = err.message
  } finally {
    sending.value = false
  }
}

async function verifyLink() {
  showLoading('正在验证邮箱', '正在确认你的验证链接')
  try {
    await api.post('/api/verify-email', { token: route.params.token })
    title.value = '邮箱验证成功'
    copy.value = '你的邮箱已经完成验证，现在可以生成并接收岗位分析报告。'
    status.value = '验证状态已保存到账号。'
    // 验证成功后按账号进度引导下一步
    await refreshSession()
    if (store.authenticated && store.user?.emailVerified) {
      let hasResume = false
      try {
        const data = await api.get('/api/resume')
        hasResume = Boolean(data.hasResume)
      } catch { /* 忽略 */ }
      if (hasResume) {
        copy.value = '你的邮箱已经完成验证，简历已就绪。接下来上传岗位截图或粘贴职位描述，开始分析。'
      } else {
        copy.value = '你的邮箱已经完成验证。接下来先上传简历，再开始岗位分析。'
      }
    } else {
      copy.value = '你的邮箱已经完成验证。请登录后继续上传简历并开始岗位分析。'
    }
    showContinue.value = true
  } catch (err) {
    title.value = '验证链接不可用'
    copy.value = err.message
    status.value = '登录后可以重新发送验证邮件。'
    showContinue.value = true
  } finally {
    hideLoading()
  }
}

onMounted(() => {
  if (props.mode === 'notice') {
    copy.value = `验证链接已发送至 ${maskedEmail(store.email)}。完成验证后才能生成和接收分析报告。`
    showContinue.value = false
  } else {
    copy.value = '正在确认验证链接…'
    status.value = ''
    verifyLink()
  }
})
</script>
