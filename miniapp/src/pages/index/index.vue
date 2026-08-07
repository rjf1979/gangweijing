<template>
  <view class="page">
    <view class="card card-accent-lime">
      <text class="kicker">JOB MIRROR</text>
      <text class="title">岗位镜</text>
      <text class="subtitle">简历 + 岗位，一键生成 AI 匹配分析报告</text>
    </view>

    <view v-if="busy" class="card">
      <text class="muted">正在加载…</text>
    </view>

    <view v-else-if="state === 'guest'" class="card">
      <text class="lead">登录后开始使用</text>
      <text class="muted">登录后可上传简历、分析岗位并长期保存报告。</text>
      <button class="btn btn-primary" @click="goAuth">登录 / 注册</button>
    </view>

    <view v-else-if="state === 'unverified'" class="card">
      <text class="lead">请先验证注册邮箱</text>
      <text class="muted">验证通过后才能生成分析报告，请查收注册邮件。</text>
      <button class="btn btn-blue" @click="goAuth">去验证邮箱</button>
    </view>

    <view v-else-if="state === 'no-resume'" class="card">
      <text class="lead">还没有上传简历</text>
      <text class="muted">上传 PDF / Word 简历，AI 自动提取并整理内容。</text>
      <button class="btn btn-primary" @click="goResume">上传简历</button>
      <button class="btn btn-ghost" @click="goJob">已有岗位截图？直接去岗位分析</button>
    </view>

    <view v-else class="card">
      <text class="lead">简历已就绪</text>
      <text class="muted">上传岗位截图或粘贴岗位描述，生成匹配分析报告。</text>
      <button class="btn btn-primary" @click="goJob">上传岗位图 / 开始分析</button>
    </view>

    <view class="card">
      <text class="kicker">QUICK ACTIONS</text>
      <view class="grid">
        <view class="cell" @click="goResume">
          <text class="cell-title">简历</text>
          <text class="cell-sub">上传 / 编辑</text>
        </view>
        <view class="cell cell-blue" @click="goJob">
          <text class="cell-title">岗位分析</text>
          <text class="cell-sub">截图 / 粘贴</text>
        </view>
        <view class="cell cell-yellow" @click="goReports">
          <text class="cell-title">分析报告</text>
          <text class="cell-sub">历史列表</text>
        </view>
        <view class="cell cell-pink" @click="goMy">
          <text class="cell-title">我的</text>
          <text class="cell-sub">账号与资料</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import api from '../../api/index.js'
export default {
  data() {
    return { busy: true, state: 'guest' }
  },
  onShow() {
    this.refresh()
  },
  methods: {
    async refresh() {
      this.busy = true
      try {
        const session = await api.get('/api/session')
        if (!session.authenticated) { this.state = 'guest'; return }
        if (!session.user.emailVerified) { this.state = 'unverified'; return }
        const r = await api.get('/api/resume')
        this.state = r.hasResume ? 'ready' : 'no-resume'
      } catch (e) {
        this.state = 'guest'
      } finally {
        this.busy = false
      }
    },
    goAuth() { uni.navigateTo({ url: '/pages/auth/index' }) },
    goResume() { uni.navigateTo({ url: '/pages/resume/index' }) },
    goJob() { uni.navigateTo({ url: '/pages/job/index' }) },
    goReports() { uni.navigateTo({ url: '/pages/report/list' }) },
    goMy() { uni.navigateTo({ url: '/pages/my/index' }) }
  }
}
</script>

<style>
.grid {
  display: flex;
  flex-wrap: wrap;
  margin-top: 20rpx;
}
.cell {
  width: calc(50% - 16rpx);
  box-sizing: border-box;
  border: 4rpx solid #111111;
  border-radius: 16rpx;
  background: #ffffff;
  padding: 24rpx;
  margin: 8rpx;
  box-shadow: 6rpx 6rpx 0 rgba(17, 17, 17, 0.92);
}
.cell-blue { background: #73c7ff; }
.cell-yellow { background: #ffd84d; }
.cell-pink { background: #ff8fa3; }
.cell-title {
  display: block;
  font-size: 30rpx;
  font-weight: 900;
}
.cell-sub {
  display: block;
  font-size: 22rpx;
  color: #4a4a4a;
  margin-top: 4rpx;
}
</style>
