<template>
  <section id="welcome" class="welcome auth-layout" aria-labelledby="welcome-title">
    <div class="auth-intro">
      <p class="neo-tag neo-tag-lime">JOB_MIRROR AI</p>
      <h1 id="welcome-title">先登录，<br><mark>再开始分析。</mark></h1>
      <p class="lead">上传简历和目标岗位，AI 会拆解证据、缺口和可执行的优化方向。</p>
    </div>
    <form id="onboarding" class="neo-panel auth-panel" @submit.prevent="submit">
      <p v-if="inviteCode" id="invite-hint" class="neo-alert neo-alert-info invite-hint" role="status">
        🎁 你已通过邀请链接访问，注册后自动与邀请人建立关联。
      </p>
      <label for="onboard-email">邮箱</label>
      <input id="onboard-email" v-model.trim="email" type="email" autocomplete="email" inputmode="email" required>
      <label for="onboard-password">密码</label>
      <input id="onboard-password" v-model="password" type="password" autocomplete="current-password" minlength="8" required placeholder="至少 8 位">
      <p id="onboard-error" class="error" role="alert">{{ error }}</p>
      <button id="auth-submit" class="neo-button neo-button-primary" type="submit" :disabled="submitting">
        {{ loginMode ? '登录并继续' : '创建账号并开始' }}
      </button>
      <button id="auth-switch" class="text-button" type="button" @click="toggleMode">
        {{ loginMode ? '没有账号？注册' : '已有账号？登录' }}
      </button>
      <div class="auth-disclaimer" role="note" aria-label="使用须知">
        <strong>使用须知</strong>
        <p>当前为公测阶段，岗位分析次数不设限，全程由 AI 分析生成，仅供求职参考。</p>
        <p>分析由大模型（gpt-5.6 或 deepseek v4，系统会根据实际情况自动切换）生成，模型存在成本开销，后续可能调整为收费服务。</p>
        <p>所有内容本站拥有最终解释权。本站只是一个辅助工具，并非权威机构或官方组织，请结合个人实际情况独立判断。</p>
      </div>
    </form>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { store, saveDraft, showLoading, hideLoading } from '../store'

const route = useRoute()
const router = useRouter()
const loginMode = ref(true)
const email = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)

// 邀请外链参数：注册时提交给服务端，把新账号与邀请人绑定
const inviteCode = computed(() => String(route.query.invite || '').trim().slice(0, 32))

function toggleMode() {
  loginMode.value = !loginMode.value
  error.value = ''
}

async function submit() {
  error.value = ''
  submitting.value = true
  showLoading(loginMode.value ? '正在登录' : '正在创建账号', '正在安全确认你的账号信息')
  try {
    const data = await api.post(loginMode.value ? '/api/login' : '/api/register', {
      email: email.value,
      password: password.value,
      ...(loginMode.value ? {} : { invite: inviteCode.value }),
    })
    store.authenticated = true
    store.user = data.user
    store.email = data.user.email
    if (!data.user.emailVerified) {
      router.replace('/verify')
      return
    }
    const target = store.redirectAfterLogin || '/'
    store.redirectAfterLogin = null
    router.replace(target)
  } catch (err) {
    error.value = err.message
    hideLoading()
  } finally {
    submitting.value = false
  }
}
</script>
