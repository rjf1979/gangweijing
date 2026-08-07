<template>
  <view class="page">
    <view class="card">
      <view class="list-head">
        <view>
          <text class="kicker">MY REPORTS</text>
          <text class="title">我的分析报告</text>
        </view>
        <button class="btn btn-primary small" @click="goJob">分析新岗位</button>
      </view>

      <view class="filters">
        <text class="tag" :class="{ 'tag-lime': filter === 'all' }" @click="filter = 'all'">全部</text>
        <text class="tag" :class="{ 'tag-green': filter === 'completed' }" @click="filter = 'completed'">已完成</text>
        <text class="tag" :class="{ 'tag-yellow': filter === 'analyzing' }" @click="filter = 'analyzing'">分析中</text>
        <text class="tag" :class="{ 'tag-pink': filter === 'failed' }" @click="filter = 'failed'">失败</text>
      </view>

      <view v-if="busy" class="muted">正在加载报告…</view>

      <view v-else-if="errorText" class="error">{{ errorText }}</view>

      <view v-else-if="!filtered.length" class="empty">
        <text class="lead">还没有报告</text>
        <text class="muted">确认简历事实并提交目标岗位后，报告会保存在这里。</text>
        <button class="btn" @click="goJob">开始第一次分析</button>
      </view>

      <view v-else class="report-list">
        <view v-for="item in filtered" :key="item.id" class="report-row" @click="open(item)">
          <view class="report-main">
            <text class="report-name">{{ item.reportName }}</text>
            <text class="report-time">{{ formatTime(item.createdAt) }}</text>
          </view>
          <view class="report-side">
            <text class="status" :class="'status-' + item.status">{{ statusText(item.status) }}</text>
            <text class="mail">{{ mailText(item.emailStatus) }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import api from '../../api/index.js'
const STATUS_TEXT = { completed: '已完成', analyzing: '分析中', failed: '失败' }
const MAIL_TEXT = { sent: '邮件已发', pending: '邮件待发', failed: '邮件失败', not_configured: '邮件未配置', unknown: '未知' }
export default {
  data() {
    return { busy: true, errorText: '', reports: [], filter: 'all' }
  },
  computed: {
    filtered() {
      if (this.filter === 'all') return this.reports
      return this.reports.filter(r => r.status === this.filter)
    }
  },
  onShow() {
    this.load()
  },
  methods: {
    async load() {
      this.busy = true
      this.errorText = ''
      try {
        const data = await api.get('/api/reports')
        this.reports = data.reports || []
      } catch (e) {
        this.errorText = e.message
      } finally {
        this.busy = false
      }
    },
    formatTime(s) {
      if (!s) return ''
      const d = new Date(s)
      const p = n => (n < 10 ? '0' + n : String(n))
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
    },
    statusText(s) { return STATUS_TEXT[s] || s || '未知' },
    mailText(s) { return MAIL_TEXT[s] || s || '未知' },
    open(item) {
      const token = (item.reportUrl || '').split('/report/')[1] || ''
      uni.navigateTo({ url: '/pages/report/detail?token=' + token + '&name=' + encodeURIComponent(item.reportName || '') + '&url=' + encodeURIComponent(item.reportUrl || '') })
    },
    goJob() { uni.navigateTo({ url: '/pages/job/index' }) }
  }
}
</script>

<style>
.list-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.btn.small {
  height: 68rpx;
  line-height: 60rpx;
  padding: 0 24rpx;
  font-size: 26rpx;
  margin-top: 0;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  margin-top: 20rpx;
}
.report-row {
  border: 4rpx solid #111111;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-top: 20rpx;
  background: #ffffff;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.report-name {
  display: block;
  font-size: 28rpx;
  font-weight: 800;
}
.report-time {
  display: block;
  font-size: 22rpx;
  color: #4a4a4a;
  margin-top: 6rpx;
}
.report-side { text-align: right; }
.status {
  display: inline-block;
  font-size: 22rpx;
  font-weight: 800;
  border: 3rpx solid #111111;
  border-radius: 8rpx;
  padding: 2rpx 12rpx;
}
.status-completed { background: #79e39a; }
.status-analyzing { background: #ffd84d; }
.status-failed { background: #ff8fa3; }
.mail {
  display: block;
  font-size: 20rpx;
  color: #4a4a4a;
  margin-top: 8rpx;
}
.empty {
  margin-top: 32rpx;
}
</style>
