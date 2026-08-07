<template>
  <view class="page">
    <view class="card">
      <text class="kicker">ACCOUNT</text>
      <text class="title">{{ mode === 'login' ? '登录' : '注册' }}</text>

      <text class="label">邮箱</text>
      <input class="input" v-model="email" placeholder="you@example.com" type="text" />

      <text class="label">密码</text>
      <input class="input" v-model="password" placeholder="至少 8 位" type="password" />

      <view v-if="errorText" class="error">{{ errorText }}</view>
      <view v-if="okText" class="success">{{ okText }}</view>

      <button class="btn btn-primary" :disabled="submitting" @click="submit">
        {{ submitting ? '请稍候…' : (mode === 'login' ? '登录' : '注册') }}
      </button>

      <button class="btn btn-ghost" @click="toggleMode">
        {{ mode === 'login' ? '没有账号？去注册' : '已有账号？去登录' }}
      </button>

      <view v-if="mode === 'register' || (mode === 'login' && verifyHint)" class="verify-box">
        <text class="muted">注册成功后会发送验证邮件。把邮件链接末尾的 token 粘贴到下面完成邮箱验证（验证通过后即可生成报告）。</text>
        <text class="label">验证码 / token</text>
        <input class="input" v-model="verifyToken" placeholder="邮件链接中的 token" />
        <button class="btn" :disabled="verifying" @click="verify">{{ verifying ? '验证中…' : '验证邮箱' }}</button>
        <button class="btn btn-ghost" :disabled="sending" @click="resend">重新发送验证邮件</button>
      </view>
    </view>
  </view>
</template>

<script>
import api from '../../api/index.js'
export default {
  data() {
    return {
      mode: 'login',
      email: '',
      password: '',
      verifyToken: '',
      verifyHint: false,
      submitting: false,
      verifying: false,
      sending: false,
      errorText: '',
      okText: ''
    }
  },
  onLoad() {
    // 已登录但未验证邮箱时，直接展示验证区
    api.get('/api/session').then(session => {
      if (session.authenticated && session.user && !session.user.emailVerified) {
        this.email = session.user.email
        this.verifyHint = true
        this.mode = 'login'
      }
    }).catch(() => {})
  },
  methods: {
    toggleMode() {
      this.mode = this.mode === 'login' ? 'register' : 'login'
      this.verifyHint = false
      this.errorText = ''
      this.okText = ''
    },
    async submit() {
      this.errorText = ''
      this.okText = ''
      if (!this.email || !this.password) { this.errorText = '请输入邮箱和密码。'; return }
      this.submitting = true
      try {
        if (this.mode === 'login') {
          await api.post('/api/login', { email: this.email, password: this.password })
          uni.showToast({ title: '登录成功', icon: 'success' })
          setTimeout(() => uni.reLaunch({ url: '/pages/index/index' }), 600)
        } else {
          await api.post('/api/register', { email: this.email, password: this.password })
          uni.showToast({ title: '注册成功', icon: 'success' })
          this.okText = '注册成功！验证邮件已发送，请查收并粘贴 token 完成验证。'
        }
      } catch (e) {
        this.errorText = e.message
      } finally {
        this.submitting = false
      }
    },
    async verify() {
      this.errorText = ''
      this.okText = ''
      if (!this.verifyToken) { this.errorText = '请先粘贴邮件中的验证 token。'; return }
      this.verifying = true
      try {
        const data = await api.post('/api/verify-email', { token: this.verifyToken })
        this.okText = '邮箱验证成功！' + (data.email ? '（' + data.email + '）' : '')
        uni.showToast({ title: '验证成功', icon: 'success' })
        setTimeout(() => uni.reLaunch({ url: '/pages/index/index' }), 800)
      } catch (e) {
        this.errorText = e.message
      } finally {
        this.verifying = false
      }
    },
    async resend() {
      this.errorText = ''
      this.okText = ''
      this.sending = true
      try {
        await api.post('/api/verification-email')
        this.okText = '验证邮件已重新发送，请查收。'
      } catch (e) {
        this.errorText = e.message
      } finally {
        this.sending = false
      }
    }
  }
}
</script>

<style>
.verify-box {
  margin-top: 32rpx;
  border-top: 3rpx dashed #111111;
  padding-top: 16rpx;
}
</style>
