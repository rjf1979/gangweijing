<template>
  <view class="page">
    <view v-if="busy" class="card">
      <text class="muted">正在加载报告…</text>
    </view>

    <view v-else-if="errorText" class="card">
      <text class="error">{{ errorText }}</text>
    </view>

    <template v-else>
      <view class="card card-accent-lime">
        <text class="kicker">REPORT</text>
        <text class="title">{{ reportName || '岗位匹配分析报告' }}</text>
        <text v-if="createdAt" class="muted">{{ formatTime(createdAt) }}</text>
        <button v-if="reportUrl" class="btn btn-dark" @click="copyLink">复制报告链接</button>
      </view>

      <view v-if="report.summary" class="card">
        <text class="kicker">SUMMARY</text>
        <text class="summary-text">{{ report.summary }}</text>
      </view>

      <view v-if="report.qualification" class="card">
        <text class="kicker">QUALIFICATION</text>
        <text class="tag" :class="qualTagClass(report.qualification.status)">{{ report.qualification.status || '未评估' }}</text>
        <view v-if="report.qualification.evidence && report.qualification.evidence.length" class="block">
          <text class="block-title">匹配证据</text>
          <text v-for="(e, i) in report.qualification.evidence" :key="i" class="line">· {{ e }}</text>
        </view>
        <view v-if="report.qualification.risks && report.qualification.risks.length" class="block">
          <text class="block-title">潜在风险</text>
          <text v-for="(e, i) in report.qualification.risks" :key="i" class="line">· {{ e }}</text>
        </view>
      </view>

      <view v-if="dims.length" class="card">
        <text class="kicker">DIMENSIONS</text>
        <view v-for="(d, i) in dims" :key="i" class="dim">
          <view class="dim-head">
            <text class="dim-name">{{ d.name }}</text>
            <text class="dim-score">{{ d.score_0_to_5 }}/5</text>
          </view>
          <view class="dim-bar-wrap">
            <view class="dim-bar" :style="{ width: dimPct(d.score_0_to_5) + '%' }"></view>
          </view>
          <text v-if="d.evidence" class="line">证据：{{ d.evidence }}</text>
          <text v-if="d.gap" class="line gap">差距：{{ d.gap }}</text>
        </view>
      </view>

      <view v-if="report.verify && report.verify.length" class="card">
        <text class="kicker">TO VERIFY</text>
        <text v-for="(v, i) in report.verify" :key="i" class="line">· {{ v }}</text>
      </view>

      <view v-if="rewrites.length" class="card">
        <text class="kicker">RESUME REWRITE</text>
        <view v-for="(rw, i) in rewrites" :key="i" class="rw">
          <text class="rw-section">{{ rw.section }}</text>
          <text class="line"><text class="lbl">原问题：</text>{{ rw.original_issue }}</text>
          <text class="line"><text class="lbl">改写方向：</text>{{ rw.rewrite_direction }}</text>
          <text class="line"><text class="lbl">示例：</text>{{ rw.example }}</text>
        </view>
      </view>

      <view v-if="actions.length" class="card">
        <text class="kicker">NEXT ACTIONS</text>
        <text v-for="(a, i) in actions" :key="i" class="line">· {{ a }}</text>
      </view>
    </template>
  </view>
</template>

<script>
import api from '../../api/index.js'
export default {
  data() {
    return {
      token: '',
      reportUrl: '',
      reportName: '',
      createdAt: '',
      report: {},
      busy: true,
      errorText: ''
    }
  },
  computed: {
    dims() {
      return Array.isArray(this.report.dimensions) ? this.report.dimensions : []
    },
    rewrites() {
      return Array.isArray(this.report.resume_rewrite) ? this.report.resume_rewrite : []
    },
    actions() {
      return Array.isArray(this.report.actions) ? this.report.actions : []
    }
  },
  onLoad(options) {
    this.token = options.token || ''
    this.reportUrl = options.url ? decodeURIComponent(options.url) : ''
    this.reportName = options.name ? decodeURIComponent(options.name) : ''
    this.load()
  },
  methods: {
    async load() {
      if (this.token) {
        try {
          const data = await api.get('/api/reports/' + this.token)
          this.reportName = data.reportName || this.reportName
          this.createdAt = data.createdAt || ''
          this.report = data.report || {}
          this.busy = false
          return
        } catch (e) {
          this.errorText = e.message
          this.busy = false
          return
        }
      }
      // 无 token：展示本地刚生成的报告
      const local = uni.getStorageSync('lastReport')
      if (local && Object.keys(local).length) {
        this.report = local
        this.reportName = uni.getStorageSync('lastReportName') || this.reportName
        this.reportUrl = uni.getStorageSync('lastReportUrl') || this.reportUrl
        this.busy = false
        return
      }
      this.errorText = '报告不存在或链接无效。'
      this.busy = false
    },
    formatTime(s) {
      if (!s) return ''
      const d = new Date(s)
      const p = n => (n < 10 ? '0' + n : String(n))
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
    },
    dimPct(score) {
      const s = Number(score) || 0
      return Math.max(0, Math.min(100, Math.round(s / 5 * 100)))
    },
    qualTagClass(status) {
      const s = String(status || '')
      if (s.indexOf('匹配') >= 0 || s.indexOf('符合') >= 0 || s.indexOf('qualified') >= 0) return 'tag-green'
      if (s.indexOf('不') >= 0 || s.indexOf('差距') >= 0 || s.indexOf('gap') >= 0) return 'tag-pink'
      return 'tag-yellow'
    },
    copyLink() {
      if (!this.reportUrl) return
      uni.setClipboardData({
        data: this.reportUrl,
        success: () => uni.showToast({ title: '链接已复制', icon: 'success' })
      })
    }
  }
}
</script>

<style>
.summary-text {
  display: block;
  font-size: 28rpx;
  margin-top: 12rpx;
}
.block { margin-top: 20rpx; }
.block-title {
  display: block;
  font-size: 26rpx;
  font-weight: 800;
  margin-bottom: 8rpx;
}
.line {
  display: block;
  font-size: 26rpx;
  margin-top: 6rpx;
}
.line.gap { color: #b3261e; }
.dim { margin-top: 24rpx; }
.dim-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.dim-name { font-size: 28rpx; font-weight: 800; }
.dim-score { font-size: 24rpx; font-weight: 800; }
.dim-bar-wrap {
  height: 28rpx;
  border: 3rpx solid #111111;
  border-radius: 8rpx;
  background: #ffffff;
  margin: 8rpx 0;
  overflow: hidden;
}
.dim-bar {
  height: 100%;
  background: #c7ff3d;
}
.rw {
  border-top: 3rpx dashed #111111;
  margin-top: 20rpx;
  padding-top: 16rpx;
}
.rw-section {
  display: block;
  font-size: 28rpx;
  font-weight: 900;
  margin-bottom: 8rpx;
}
.lbl { font-weight: 800; }
</style>
