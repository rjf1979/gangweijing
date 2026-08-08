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

        <view class="dim-overview">
          <view class="dim-ring" :style="ringStyle">
            <view class="dim-ring-inner">
              <text class="dim-ring-score">{{ fitPct }}</text>
              <text class="dim-ring-unit">%</text>
            </view>
          </view>
          <view class="dim-overview-meta">
            <text class="dim-avg">平均 {{ avgScore }}/5 · 共 {{ dims.length }} 个维度</text>
            <view class="dim-stats">
              <text class="dim-stat dim-stat-strong">强项 {{ strongCount }}</text>
              <text class="dim-stat dim-stat-fair">达标 {{ midCount }}</text>
              <text class="dim-stat dim-stat-weak">短板 {{ weakCount }}</text>
            </view>
            <text v-if="bestDim" class="dim-best"><text class="lbl">最佳</text>{{ bestDim.name }} {{ bestDim.score }}/5</text>
            <text v-if="worstDim" class="dim-worst"><text class="lbl">最弱</text>{{ worstDim.name }} {{ worstDim.score }}/5</text>
          </view>
        </view>

        <view v-for="(d, i) in sortedDims" :key="i" class="dim" :class="'dim-level-' + d.level.key">
          <view class="dim-head">
            <text class="dim-rank">{{ i + 1 }}</text>
            <text class="dim-name">{{ d.name }}</text>
            <text class="dim-badge" :class="'badge-' + d.level.key">{{ d.level.label }}</text>
            <text class="dim-score">{{ d.score }}/5</text>
          </view>
          <view class="dim-bar-wrap">
            <view class="dim-bar" :class="'bar-' + d.level.key" :style="{ width: d.pct + '%' }"></view>
            <view class="dim-bar-ticks"><view v-for="t in 5" :key="t"></view></view>
          </view>
          <view class="dim-bar-meta">
            <text class="dim-pct">{{ d.pct }}%</text>
            <text class="dim-scale">0·1·2·3·4·5</text>
          </view>
          <view v-if="d.evidence.length" class="block">
            <text class="block-title lbl-blue">证据</text>
            <text v-for="(e, ei) in d.evidence" :key="ei" class="line">· {{ e }}</text>
          </view>
          <view v-if="d.gap.length" class="block">
            <text class="block-title lbl-pink">差距</text>
            <text v-for="(g, gi) in d.gap" :key="gi" class="line gap">· {{ g }}</text>
          </view>
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
      const list = Array.isArray(this.report.dimensions) ? this.report.dimensions : []
      return list.map(d => {
        const score = this.normScore(d.score_0_to_5)
        return {
          name: String(d.name || '未命名维度'),
          score: Number(score.toFixed(1)),
          pct: Math.round(score / 5 * 100),
          level: this.levelOf(score),
          evidence: this.toList(d.evidence),
          gap: this.toList(d.gap)
        }
      })
    },
    sortedDims() {
      return this.dims.slice().sort((a, b) => b.score - a.score)
    },
    avgScore() {
      if (!this.dims.length) return '0.0'
      return Number((this.dims.reduce((s, d) => s + d.score, 0) / this.dims.length).toFixed(1))
    },
    fitPct() {
      if (!this.dims.length) return 0
      return Math.round(this.dims.reduce((s, d) => s + d.score, 0) / this.dims.length / 5 * 100)
    },
    strongCount() { return this.dims.filter(d => d.score >= 4).length },
    midCount() { return this.dims.filter(d => d.score >= 3 && d.score < 4).length },
    weakCount() { return this.dims.filter(d => d.score < 3).length },
    bestDim() { return this.sortedDims[0] || null },
    worstDim() { return this.sortedDims.length > 1 ? this.sortedDims[this.sortedDims.length - 1] : null },
    ringStyle() {
      const pct = Math.max(0, Math.min(100, this.fitPct))
      return { background: 'conic-gradient(#111111 ' + pct + '%, #e8e5dc ' + pct + '%)' }
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
    normScore(v) {
      const n = Number(v)
      return Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : 0
    },
    toList(v) {
      if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean)
      return String(v || '').split(/[；;。\n]+/).map(s => s.trim()).filter(Boolean)
    },
    levelOf(score) {
      const levels = [
        { key: 'top', min: 4.5, label: '卓越' },
        { key: 'strong', min: 4, label: '优秀' },
        { key: 'good', min: 3, label: '良好' },
        { key: 'fair', min: 2, label: '待提升' },
        { key: 'weak', min: 0, label: '短板' }
      ]
      return levels.find(l => score >= l.min) || levels[levels.length - 1]
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
.dim-overview {
  display: flex;
  align-items: center;
  gap: 28rpx;
  margin-top: 20rpx;
  padding: 24rpx;
  border: 3rpx solid #111111;
  border-radius: 10rpx;
  background: #ffffff;
}
.dim-ring {
  flex: 0 0 auto;
  width: 148rpx;
  height: 148rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dim-ring-inner {
  width: 112rpx;
  height: 112rpx;
  border-radius: 50%;
  background: #ffffff;
  display: flex;
  align-items: baseline;
  justify-content: center;
  flex-direction: row;
}
.dim-ring-score { font-size: 44rpx; font-weight: 950; line-height: 1; }
.dim-ring-unit { font-size: 20rpx; font-weight: 900; margin-left: 2rpx; }
.dim-overview-meta { flex: 1; min-width: 0; }
.dim-avg { display: block; font-size: 24rpx; font-weight: 800; }
.dim-stats { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 12rpx; }
.dim-stat {
  padding: 4rpx 14rpx;
  border: 3rpx solid #111111;
  border-radius: 8rpx;
  font-size: 20rpx;
  font-weight: 800;
}
.dim-stat-strong { background: #79e39a; }
.dim-stat-fair { background: #ffd84d; }
.dim-stat-weak { background: #ff5c73; color: #ffffff; }
.dim-best, .dim-worst { display: block; margin-top: 10rpx; font-size: 22rpx; font-weight: 800; }
.dim-worst { color: #a3352c; }
.dim { margin-top: 28rpx; padding: 20rpx; border: 3rpx solid #111111; border-radius: 10rpx; background: #ffffff; }
.dim-level-top { border-left: 10rpx solid #c7ff3d; }
.dim-level-strong { border-left: 10rpx solid #79e39a; }
.dim-level-good { border-left: 10rpx solid #ffd84d; }
.dim-level-fair { border-left: 10rpx solid #ff9f43; }
.dim-level-weak { border-left: 10rpx solid #ff5c73; }
.dim-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10rpx;
}
.dim-rank {
  flex: 0 0 auto;
  min-width: 40rpx;
  text-align: center;
  padding: 4rpx 8rpx;
  border: 3rpx solid #111111;
  border-radius: 8rpx;
  background: #111111;
  color: #ffffff;
  font-size: 22rpx;
  font-weight: 900;
}
.dim-name { flex: 1; min-width: 0; font-size: 28rpx; font-weight: 900; }
.dim-badge {
  flex: 0 0 auto;
  padding: 4rpx 14rpx;
  border: 3rpx solid #111111;
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: 900;
}
.badge-top { background: #c7ff3d; }
.badge-strong { background: #79e39a; }
.badge-good { background: #ffd84d; }
.badge-fair { background: #ff9f43; }
.badge-weak { background: #ff5c73; color: #ffffff; }
.dim-score { flex: 0 0 auto; font-size: 30rpx; font-weight: 950; font-variant-numeric: tabular-nums; }
.dim-bar-wrap {
  position: relative;
  height: 28rpx;
  border: 3rpx solid #111111;
  border-radius: 999rpx;
  background: #ffffff;
  margin: 14rpx 0 0;
  overflow: hidden;
}
.dim-bar { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999rpx; }
.bar-top { background: #c7ff3d; }
.bar-strong { background: #79e39a; }
.bar-good { background: #ffd84d; }
.bar-fair { background: #ff9f43; }
.bar-weak { background: #ff5c73; }
.dim-bar-ticks {
  position: absolute;
  left: 0; top: 0; right: 0; bottom: 0;
  display: flex;
}
.dim-bar-ticks view { flex: 1; border-right: 2rpx solid rgba(17, 17, 17, 0.28); }
.dim-bar-ticks view:last-child { border-right: 0; }
.dim-bar-meta { display: flex; justify-content: space-between; margin-top: 6rpx; }
.dim-pct { font-size: 22rpx; font-weight: 900; }
.dim-scale { font-size: 18rpx; color: #4a4a4a; font-weight: 700; }
.lbl-blue { color: #005fcc; }
.lbl-pink { color: #b3261e; }
</style>
