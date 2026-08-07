<template>
  <div class="login-page">
    <div class="login-glow" aria-hidden="true"></div>
    <div class="login-card">
      <div class="login-brand">
        <span class="login-mark" aria-hidden="true">镜</span>
        <div>
          <h1>岗位镜管理后台</h1>
          <p>运营数据与系统管理控制台</p>
        </div>
      </div>

      <form class="login-form" novalidate @submit.prevent="onSubmit">
        <div class="field">
          <label class="field-label" for="login-email">管理员邮箱</label>
          <input
            id="login-email"
            v-model.trim="email"
            class="input"
            type="email"
            name="email"
            autocomplete="username"
            placeholder="admin@example.com"
            required
          />
        </div>
        <div class="field">
          <label class="field-label" for="login-password">密码</label>
          <input
            id="login-password"
            v-model="password"
            class="input"
            type="password"
            name="password"
            autocomplete="current-password"
            placeholder="请输入密码"
            required
          />
        </div>

        <p v-if="error" class="login-error" role="alert">
          <AppIcon name="shield" :size="14" decorative />
          {{ error }}
        </p>

        <button class="btn btn-primary login-btn" type="submit" :disabled="busy || !email || !password">
          {{ busy ? '正在登录…' : '登录后台' }}
        </button>
      </form>

      <p class="login-foot">仅限授权管理员访问 · 操作将被记录</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import { api } from '../api'
import { toast } from '../store'

const router = useRouter()
const route = useRoute()
const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')

async function onSubmit() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await api.login(email.value, password.value)
    toast('登录成功', 'success')
    router.replace(String(route.query.redirect || '/'))
  } catch (err) {
    error.value = err.message || '登录失败，请重试。'
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--color-bg);
  overflow: hidden;
}
.login-glow {
  position: absolute;
  width: 560px;
  height: 560px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(34, 197, 94, 0.14), transparent 65%);
  top: -160px;
  right: -120px;
  pointer-events: none;
}
.login-card {
  position: relative;
  width: 100%;
  max-width: 400px;
  padding: 36px 34px 28px;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.login-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 28px;
}
.login-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--color-primary), #0ea5e9);
  color: #04140a;
  font-weight: 700;
  font-size: 22px;
  box-shadow: var(--shadow-primary);
}
.login-brand h1 {
  font-size: 18px;
  margin-bottom: 2px;
}
.login-brand p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 12.5px;
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.login-btn {
  margin-top: 6px;
  min-height: 42px;
  font-size: 14px;
}
.login-error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--color-danger-soft);
  color: var(--color-danger);
  font-size: 13px;
}
.login-foot {
  margin: 22px 0 0;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 12px;
}
</style>