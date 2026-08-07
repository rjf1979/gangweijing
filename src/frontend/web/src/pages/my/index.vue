<template>
  <view class="page">
    <view class="card">
      <text class="kicker">ACCOUNT</text>
      <text class="title">我的</text>

      <view v-if="busy" class="muted">正在加载…</view>
      <template v-else>
        <view class="account-row">
          <text class="label inline">邮箱</text>
          <text class="value">{{ email || '未登录' }}</text>
        </view>
        <view class="account-row">
          <text class="label inline">邮箱状态</text>
          <text class="tag" :class="emailVerified ? 'tag-green' : 'tag-yellow'">{{ emailVerified ? '已验证' : '未验证' }}</text>
        </view>

        <button class="btn btn-primary" @click="goResume">我的简历</button>
        <button class="btn btn-blue" @click="goReports">我的分析报告</button>
        <button v-if="loggedIn" class="btn btn-pink" @click="logout">退出登录</button>
        <button v-else class="btn" @click="goAuth">去登录</button>
      </template>
    </view>
  </view>
</template>

<script>
import api from '../../api/index.js'
export default {
  data() {
    return { busy: true, loggedIn: false, email: '', emailVerified: false }
  },
  onShow() {
    this.load()
  },
  methods: {
    async load() {
      this.busy = true
      try {
        const session = await api.get('/api/session')
        this.loggedIn = Boolean(session.authenticated)
        this.email = session.user ? session.user.email : ''
        this.emailVerified = Boolean(session.user && session.user.emailVerified)
      } catch (e) {
        this.loggedIn = false
      } finally {
        this.busy = false
      }
    },
    goResume() { uni.navigateTo({ url: '/pages/resume/index' }) },
    goReports() { uni.navigateTo({ url: '/pages/report/list' }) },
    goAuth() { uni.navigateTo({ url: '/pages/auth/index' }) },
    logout() {
      uni.showModal({
        title: '退出登录',
        content: '确定要退出当前账号吗？',
        success: (res) => {
          if (res.confirm) {
            api.saveSessionToken('')
            uni.removeStorageSync('resumeDraft')
            uni.reLaunch({ url: '/pages/index/index' })
          }
        }
      })
    }
  }
}
</script>

<style>
.account-row {
  display: flex;
  align-items: center;
  margin-top: 20rpx;
}
.label.inline { margin: 0; width: 160rpx; }
.value {
  font-size: 28rpx;
  font-weight: 700;
  word-break: break-all;
}
</style>
