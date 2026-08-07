<template>
  <div class="dashboard">
    <!-- 指标卡 -->
    <section class="metric-grid" aria-label="关键指标">
      <article v-for="metric in metrics" :key="metric.label" class="card metric-card">
        <div class="metric-icon" :class="`is-${metric.tone}`" aria-hidden="true">
          <AppIcon :name="metric.icon" :size="18" />
        </div>
        <div class="metric-body">
          <p class="metric-label">{{ metric.label }}</p>
          <p class="metric-value cell-num">{{ formatNumber(metric.value) }}</p>
          <p class="metric-sub">{{ metric.sub }}</p>
        </div>
      </article>
    </section>

    <!-- 趋势 + 状态分布 -->
    <section class="grid-2">
      <article class="card chart-card">
        <div class="card-head">
          <h2 class="card-title">近 14 天动态</h2>
          <div class="legend" aria-hidden="true">
            <span class="legend-item"><i class="dot is-users"></i>新注册</span>
            <span class="legend-item"><i class="dot is-reports"></i>新报告</span>
          </div>
        </div>
        <div class="card-body">
          <div v-if="loading" class="skeleton chart-skeleton" role="status"></div>
          <div v-else-if="trendError" class="empty-state" role="alert">{{ trendError }}</div>
          <div v-else class="trend-chart" :aria-label="`近 ${trend.length} 天新注册与新报告柱状图`">
            <div v-for="item in trend" :key="item.date" class="trend-col" :title="`${item.date}：注册 ${item.users}，报告 ${item.reports}`">
              <div class="trend-bars">
                <div class="trend-bar is-users" :style="{ height: barHeight(item.users) }"></div>
                <div class="trend-bar is-reports" :style="{ height: barHeight(item.reports) }"></div>
              </div>
              <span class="trend-label">{{ dayLabel(item.date) }}</span>
            </div>
          </div>
        </div>
      </article>

      <article class="card chart-card">
        <div class="card-head">
          <h2 class="card-title">报告状态</h2>
        </div>
        <div class="card-body">
          <div v-if="loading" class="skeleton chart-skeleton" role="status"></div>
          <div v-else-if="trendError" class="empty-state" role="alert">{{ trendError }}</div>
          <div v-else class="status-list">
            <div v-for="item in statusRows" :key="item.key" class="status-row">
              <div class="status-top">
                <span class="status-name">{{ item.label }}</span>
                <span class="cell-num">{{ item.count }}</span>
              </div>
              <div class="status-track">
                <div class="status-fill" :class="`is-${item.tone}`" :style="{ width: `${item.percent}%` }"></div>
              </div>
            </div>
          </div>
        </div>
      </article>
    </section>

    <!-- 最新动态 -->
    <section class="grid-2">
      <article class="card list-card">
        <div class="card-head">
          <h2 class="card-title">最新注册用户</h2>
          <RouterLink class="text-link" to="/users">查看全部</RouterLink>
        </div>
        <div class="card-body list-body">
          <div v-if="loading" class="skeleton list-skeleton" role="status"></div>
          <div v-else-if="trendError" class="empty-state" role="alert">{{ trendError }}</div>
          <ul v-else-if="stats.recentUsers.length" class="feed-list">
            <li v-for="user in stats.recentUsers" :key="user.id" class="feed-row">
              <span class="feed-avatar" aria-hidden="true">{{ emailPrefix(user.email).charAt(0).toUpperCase() }}</span>
              <div class="feed-main">
                <RouterLink class="feed-title" :to="`/users/${user.id}`">{{ user.email }}</RouterLink>
                <span class="feed-sub">{{ user.email_verified_at ? '已验证邮箱' : '未验证邮箱' }}</span>
              </div>
              <time class="feed-time" :datetime="user.created_at">{{ formatDateTime(user.created_at) }}</time>
            </li>
          </ul>
          <div v-else class="empty-state"><strong>暂无用户</strong>还没有注册用户</div>
        </div>
      </article>

      <article class="card list-card">
        <div class="card-head">
          <h2 class="card-title">最新分析报告</h2>
          <RouterLink class="text-link" to="/reports">查看全部</RouterLink>
        </div>
        <div class="card-body list-body">
          <div v-if="loading" class="skeleton list-skeleton" role="status"></div>
          <div v-else-if="trendError" class="empty-state" role="alert">{{ trendError }}</div>
          <ul v-else-if="stats.recentReports.length" class="feed-list">
            <li v-for="report in stats.recentReports" :key="report.id" class="feed-row">
              <span class="feed-doc" aria-hidden="true"><AppIcon name="file-text" :size="15" /></span>
              <div class="feed-main">
                <RouterLink class="feed-title" :to="`/reports/${report.id}`">{{ reportTitle(report) }}</RouterLink>
                <span class="feed-sub">
                  <StatusBadge :value="report.status" />
                  <StatusBadge :value="report.email_status" />
                </span>
              </div>
              <time class="feed-time" :datetime="report.created_at">{{ formatDateTime(report.created_at) }}</time>
            </li>
          </ul>
          <div v-else class="empty-state"><strong>暂无报告</strong>还没有生成分析报告</div>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { api } from '../api'

const loading = ref(true)
const trendError = ref('')
const stats = ref({ users: {}, reports: {}, recentUsers: [], recentReports: [], statusBreakdown: [], emailStatusBreakdown: [], trend: [] })
const maxTrend = ref(0)

const metrics = computed(() => [
  { label: '用户总数', value: stats.value.users.total ?? 0, sub: `今日 +${stats.value.users.today ?? 0}`, icon: 'users', tone: 'green' },
  { label: '已验证用户', value: stats.value.users.verified ?? 0, sub: `含简历 ${stats.value.users.withResume ?? 0} 人`, icon: 'shield', tone: 'blue' },
  { label: '报告总数', value: stats.value.reports.total ?? 0, sub: `今日 +${stats.value.reports.today ?? 0}`, icon: 'file-text', tone: 'amber' },
  { label: '本周新增报告', value: stats.value.reports.week ?? 0, sub: `本周注册 ${stats.value.users.week ?? 0} 人`, icon: 'activity', tone: 'violet' },
])

const trend = computed(() => stats.value.trend || [])
const statusRows = computed(() => {
  const map = {
    completed: { label: '已完成', tone: 'green' },
    pending: { label: '处理中', tone: 'amber' },
    failed: { label: '失败', tone: 'red' },
    unknown: { label: '未知', tone: 'slate' },
  }
  const breakdown = stats.value.statusBreakdown || []
  const total = breakdown.reduce((sum, item) => sum + item.n, 0) || 1
  return breakdown.map(item => ({ ...(map[item.status] || { label: item.status, tone: 'slate' }), count: item.n, percent: Math.round((item.n / total) * 100) }))
})

function formatNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}
function emailPrefix(email) {
  return String(email || '').split('@')[0] || '?'
}
function reportTitle(report) {
  return report.report_name || report.job_title || '未命名报告'
}
function dayLabel(date) {
  const [y, m, d] = String(date).split('-')
  return `${Number(m)}/${Number(d)}`
}
function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
function barHeight(value) {
  const max = maxTrend.value || 1
  return `${Math.max(2, Math.round((value / max) * 92))}%`
}

onMounted(async () => {
  try {
    stats.value = await api.get('/stats')
    maxTrend.value = Math.max(...(stats.value.trend || []).map(item => Math.max(item.users, item.reports)), 1)
  } catch (error) {
    trendError.value = error.message || '加载统计数据失败。'
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 指标卡 */
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.metric-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px 20px;
}
.metric-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  flex-shrink: 0;
}
.metric-icon.is-green { background: var(--color-success-soft); color: var(--color-success); }
.metric-icon.is-blue { background: var(--color-info-soft); color: var(--color-info); }
.metric-icon.is-amber { background: var(--color-warning-soft); color: var(--color-warning); }
.metric-icon.is-violet { background: rgba(139, 92, 246, 0.16); color: #a78bfa; }
.metric-body {
  min-width: 0;
}
.metric-label {
  margin: 0;
  font-size: 12.5px;
  color: var(--color-text-secondary);
}
.metric-value {
  margin: 2px 0 0;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.01em;
}
.metric-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

/* 双栏 */
.grid-2 {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 16px;
}
@media (max-width: 1080px) {
  .metric-grid { grid-template-columns: repeat(2, 1fr); }
  .grid-2 { grid-template-columns: 1fr; }
}

/* 趋势图 */
.legend {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--color-text-muted);
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 3px;
}
.dot.is-users { background: var(--color-success); }
.dot.is-reports { background: var(--color-info); }

.chart-skeleton {
  height: 240px;
}
.trend-chart {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 250px;
  padding-top: 8px;
}
.trend-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.trend-bars {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 3px;
}
.trend-bar {
  width: 7px;
  border-radius: 3px 3px 0 0;
  transition: height var(--motion-base);
  min-height: 2px;
}
.trend-bar.is-users { background: var(--color-success); opacity: 0.9; }
.trend-bar.is-reports { background: var(--color-info); opacity: 0.85; }
.trend-label {
  font-size: 10.5px;
  color: var(--color-text-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* 状态分布 */
.status-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.status-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.status-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}
.status-name {
  color: var(--color-text-secondary);
}
.status-track {
  height: 8px;
  border-radius: 4px;
  background: var(--color-bg-deep);
  overflow: hidden;
}
.status-fill {
  height: 100%;
  border-radius: 4px;
  transition: width var(--motion-base);
}
.status-fill.is-green { background: var(--color-success); }
.status-fill.is-amber { background: var(--color-warning); }
.status-fill.is-red { background: var(--color-danger); }
.status-fill.is-slate { background: var(--color-text-muted); }

/* 列表 */
.text-link {
  font-size: 12.5px;
  color: var(--color-text-secondary);
}
.text-link:hover {
  color: var(--color-primary);
}
.list-body {
  padding: 8px 20px 12px;
}
.list-skeleton {
  height: 180px;
}
.feed-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.feed-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid var(--color-border);
}
.feed-row:last-child {
  border-bottom: none;
}
.feed-avatar,
.feed-doc {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-md);
  flex-shrink: 0;
  font-weight: 700;
}
.feed-avatar {
  background: var(--color-surface-3);
  color: var(--color-primary);
}
.feed-doc {
  background: var(--color-info-soft);
  color: var(--color-info);
}
.feed-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.feed-title {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.feed-title:hover {
  color: var(--color-primary);
}
.feed-sub {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.feed-time {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
</style>