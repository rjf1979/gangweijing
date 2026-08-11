<template>
  <div class="task-queue">
    <!-- 页头 -->
    <div class="tq-head card">
      <div class="tq-head-left">
        <h2 class="card-title">任务列表</h2>
        <p class="tq-head-desc">统一查看前后端所有长任务的处理情况（AI 模板生成、报告生成、简历解析、截图识别、简历结构化），状态实时同步。存在排队中或执行中的任务时每 4 秒自动刷新。</p>
      </div>
      <div class="tq-head-actions">
        <button class="btn btn-ghost btn-sm" type="button" :disabled="loading" @click="loadAll(true)">
          <AppIcon name="refresh" :size="15" :class="{ spinning: refreshing }" />
          刷新
        </button>
        <button class="btn btn-ghost btn-sm" type="button" :disabled="loading || historyCount === 0" @click="clearHistory">
          <AppIcon name="trash" :size="15" />
          清空历史
        </button>
      </div>
    </div>

    <p v-if="errorMsg" class="tq-error" role="alert">{{ errorMsg }}</p>

    <!-- 统计卡片 -->
    <div class="tq-stats" aria-label="任务统计">
      <button
        v-for="s in statItems"
        :key="s.key || 'all'"
        type="button"
        class="stat-card"
        :class="{ active: statusFilter === s.key }"
        @click="setStatus(s.key)"
      >
        <span class="stat-label">{{ s.label }}</span>
        <span class="stat-value" :class="'stat-' + (s.key || 'all')">{{ s.count }}</span>
      </button>
    </div>

    <!-- 筛选 -->
    <div class="tq-filter card">
      <div class="tq-filter-row">
        <span class="filter-label">任务类型</span>
        <div class="filter-chips" role="tablist" aria-label="任务类型筛选">
          <button
            v-for="t in typeOptions"
            :key="t.key || 'all'"
            type="button"
            role="tab"
            :aria-selected="typeFilter === t.key"
            class="filter-chip"
            :class="{ active: typeFilter === t.key }"
            @click="setType(t.key)"
          >{{ t.label }}</button>
        </div>
      </div>
      <div class="tq-filter-row">
        <span class="filter-label">状态筛选</span>
        <div class="filter-chips" role="tablist" aria-label="任务状态筛选">
          <button
            v-for="s in statusOptions"
            :key="s.key"
            type="button"
            role="tab"
            :aria-selected="statusFilter === s.key"
            class="filter-chip"
            :class="{ active: statusFilter === s.key }"
            @click="setStatus(s.key)"
          >{{ s.label }}</button>
        </div>
      </div>
      <div class="tq-filter-row tq-filter-extra">
        <input
          v-model="keyword"
          type="search"
          class="tq-search"
          placeholder="搜索任务名称 / ID…"
          aria-label="搜索任务"
          @keyup.enter="loadJobs(true)"
          @search="loadJobs(true)"
        />
        <label class="auto-toggle" title="存在排队中或执行中任务时自动每 4 秒刷新">
          <input v-model="autoRefresh" type="checkbox" />
          <span>自动刷新</span>
        </label>
      </div>
    </div>

    <!-- 任务表格 -->
    <div class="card tq-table-card">
      <div v-if="loading && !jobs.length" class="empty-state">正在加载任务…</div>
      <div v-else-if="!filteredJobs.length" class="empty-state">
        <strong>{{ hasFilters ? '筛选条件下暂无任务' : '暂无任务' }}</strong>
        <span>用户上传简历解析、生成分析报告、截图识别，或在「简历模板」页点击「AI 生成新排版」后，任务会出现在这里。</span>
      </div>
      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>任务类型</th>
              <th>任务</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>耗时</th>
              <th>结果</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="job in filteredJobs" :key="job.id">
              <td><span class="badge badge-neutral">{{ job.taskTypeLabel || job.taskType || '—' }}</span></td>
              <td>
                <div class="job-name" :title="job.title">{{ job.title || '—' }}</div>
                <div class="job-sub cell-muted" :title="job.subtitle">{{ job.subtitle || '—' }}</div>
                <div class="job-id cell-muted" :title="job.id">{{ shortId(job.id) }}<span v-if="job.retriedFrom && job.retriedFrom !== job.id" class="retried-mark" title="由重试产生">重试</span></div>
              </td>
              <td><span class="badge" :class="badgeClass(job.status)">{{ statusText(job.status) }}</span></td>
              <td class="cell-secondary">{{ formatTime(job.createdAt) }}</td>
              <td class="cell-secondary">{{ durationText(job) }}</td>
              <td>
                <div v-if="job.status === 'done'" class="job-result job-done" :title="doneTitle(job)">{{ doneText(job) }}</div>
                <div v-else-if="job.status === 'error'" class="job-result job-error" :title="job.error">{{ job.error || '执行失败' }}</div>
                <div v-else-if="job.status === 'canceled'" class="cell-muted">已取消</div>
                <div v-else class="cell-muted">—</div>
              </td>
              <td class="col-actions">
                <button v-if="job.status === 'pending'" class="btn btn-ghost btn-sm" type="button" @click="cancelJob(job)">
                  <AppIcon name="pause" :size="14" />
                  取消排队
                </button>
                <button v-else-if="job.status === 'error' || job.status === 'canceled'" class="btn btn-ghost btn-sm" type="button" @click="retryJob(job)">
                  <AppIcon name="play" :size="14" />
                  重试
                </button>
                <span v-else class="cell-muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="tq-foot">
        <span class="cell-muted">共 {{ total }} 个任务 · 本页 {{ filteredJobs.length }} 个 · 排队/执行中 {{ activeCount }}</span>
        <div class="tq-pager">
          <button class="btn btn-ghost btn-sm" type="button" :disabled="page <= 1 || loading" @click="changePage(page - 1)">上一页</button>
          <span class="cell-muted">第 {{ page }} / {{ totalPages || 1 }} 页</span>
          <button class="btn btn-ghost btn-sm" type="button" :disabled="page >= totalPages || loading" @click="changePage(page + 1)">下一页</button>
        </div>
        <span v-if="hasActive" class="live-tip"><span class="live-dot" aria-hidden="true"></span>自动刷新中</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import { api } from '../api'

const PAGE_SIZE = 50

const jobs = ref([])
const total = ref(0)
const stats = ref({ pending: 0, running: 0, done: 0, error: 0, canceled: 0, total: 0 })
const loading = ref(false)
const refreshing = ref(false)
const errorMsg = ref('')
const typeFilter = ref('') // '' = 全部
const statusFilter = ref('') // '' = 全部
const keyword = ref('')
const page = ref(1)
const autoRefresh = ref(true)
let timer = null

const STATUS_META = {
  pending: { label: '排队中', badge: 'badge-neutral' },
  running: { label: '执行中', badge: 'badge-info' },
  done: { label: '已完成', badge: 'badge-success' },
  error: { label: '失败', badge: 'badge-danger' },
  canceled: { label: '已取消', badge: 'badge-warning' },
}
const typeOptions = [
  { key: '', label: '全部类型' },
  { key: 'template_generate', label: 'AI 模板生成' },
  { key: 'report_generate', label: '报告生成' },
  { key: 'resume_parse', label: '简历解析' },
  { key: 'screenshot_ocr', label: '截图识别' },
  { key: 'resume_structure', label: '简历结构化' },
]
const statusOptions = Object.entries(STATUS_META).map(([key, meta]) => ({ key, label: meta.label }))

const statItems = computed(() => [
  { key: '', label: '全部', count: stats.value.total || 0 },
  ...statusOptions.map(s => ({ key: s.key, label: s.label, count: stats.value[s.key] || 0 })),
])
const historyCount = computed(() => (stats.value.done || 0) + (stats.value.error || 0) + (stats.value.canceled || 0))
const hasActive = computed(() => (stats.value.pending || 0) + (stats.value.running || 0) > 0)
const activeCount = computed(() => (stats.value.pending || 0) + (stats.value.running || 0))
const filteredJobs = computed(() => jobs.value)
const hasFilters = computed(() => Boolean(typeFilter.value || statusFilter.value || keyword.value))
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

const statusText = s => STATUS_META[s]?.label || s || '—'
const badgeClass = s => STATUS_META[s]?.badge || 'badge-neutral'
const shortId = id => (id ? String(id).slice(0, 8) : '—')
const pad2 = n => String(n).padStart(2, '0')

function formatTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function durationText(job) {
  if (!job.startedAt || !job.finishedAt) return job.status === 'running' ? '进行中' : '—'
  const ms = new Date(job.finishedAt) - new Date(job.startedAt)
  if (Number.isNaN(ms) || ms < 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec} 秒`
  return `${Math.floor(sec / 60)} 分 ${pad2(sec % 60)} 秒`
}

function doneText(job) {
  if (!job.result) return '已完成'
  return job.result.templateName || job.result.reportName || (job.result.fileRef ? '解析完成' : '已完成')
}
function doneTitle(job) {
  return doneText(job)
}

function setType(key) {
  typeFilter.value = key || ''
  page.value = 1
  loadAll()
}
function setStatus(key) {
  statusFilter.value = key || ''
  page.value = 1
  loadAll()
}
function changePage(next) {
  if (next < 1 || next > totalPages.value) return
  page.value = next
  loadJobs()
}

async function loadStats() {
  try {
    stats.value = (await api.jobsStats()) || {}
  } catch (error) {
    // 统计失败不阻塞列表
  }
}

async function loadJobs(manual = false) {
  if (manual) refreshing.value = true
  loading.value = true
  try {
    const data = await api.listJobs({
      type: typeFilter.value || undefined,
      status: statusFilter.value || undefined,
      q: keyword.value.trim() || undefined,
      limit: PAGE_SIZE,
      offset: (page.value - 1) * PAGE_SIZE,
    })
    jobs.value = data.jobs || []
    total.value = data.total || 0
    errorMsg.value = ''
  } catch (error) {
    errorMsg.value = error.message || '无法查询任务列表，请刷新页面重试。'
  } finally {
    loading.value = false
    refreshing.value = false
    syncPolling()
  }
}

async function loadAll(manual = false) {
  await Promise.all([loadStats(), loadJobs(manual)])
}

function startPolling() {
  if (timer) return
  timer = setInterval(() => { loadStats(); loadJobs() }, 4000)
}
function stopPolling() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
function syncPolling() {
  if (autoRefresh.value && hasActive.value) startPolling()
  else stopPolling()
}

async function cancelJob(job) {
  if (!window.confirm(`确定取消「${job.title || job.id}」的排队任务吗？`)) return
  try {
    await api.cancelJob(job.id)
    await loadAll()
  } catch (error) {
    errorMsg.value = error.message
  }
}

async function retryJob(job) {
  const action = job.status === 'canceled' ? '重新执行' : '重试'
  if (!window.confirm(`确定${action}「${job.title || job.id}」吗？`)) return
  try {
    await api.retryJob(job.id)
    await loadAll()
  } catch (error) {
    errorMsg.value = error.message
  }
}

async function clearHistory() {
  if (!window.confirm('确定清空已完成 / 失败 / 已取消的任务历史吗？排队中和执行中的任务会保留。')) return
  try {
    await api.clearJobs()
    await loadAll()
  } catch (error) {
    errorMsg.value = error.message
  }
}

onMounted(() => {
  loadAll()
})
onUnmounted(() => {
  stopPolling()
})
</script>

<style scoped>
.task-queue {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

/* ===== 页头 ===== */
.tq-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  flex-wrap: wrap;
}
.tq-head-left {
  min-width: 0;
}
.tq-head-desc {
  margin: 6px 0 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--color-text-muted);
  max-width: 760px;
}
.tq-head-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.tq-error {
  margin: 0;
  padding: 10px 14px;
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: var(--radius-md);
  background: var(--color-danger-soft);
  color: var(--color-danger);
  font-size: 13px;
}

/* ===== 统计卡片 ===== */
.tq-stats {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--space-3);
}
.stat-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--motion-fast), background var(--motion-fast), transform var(--motion-fast);
}
.stat-card:hover {
  border-color: var(--color-border-strong);
  background: var(--color-surface-2);
}
.stat-card.active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}
.stat-label {
  font-size: 12px;
  color: var(--color-text-muted);
}
.stat-value {
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  color: var(--color-text);
}
.stat-value.stat-pending { color: var(--color-text-secondary); }
.stat-value.stat-running { color: var(--color-info); }
.stat-value.stat-done { color: var(--color-success); }
.stat-value.stat-error { color: var(--color-danger); }
.stat-value.stat-canceled { color: var(--color-warning); }

/* ===== 筛选 ===== */
.tq-filter {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
}
.tq-filter-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.tq-filter-extra {
  justify-content: space-between;
}
.filter-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  white-space: nowrap;
  min-width: 58px;
}
.filter-chips {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.filter-chip {
  padding: 6px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface-2);
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.4;
  font-family: inherit;
  cursor: pointer;
  transition: border-color var(--motion-fast), color var(--motion-fast), background var(--motion-fast);
}
.filter-chip:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.filter-chip.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}
.tq-search {
  min-width: 220px;
  padding: 7px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
  color: var(--color-text);
  font-size: 13px;
  font-family: inherit;
}
.tq-search:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-soft);
}
.auto-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  font-size: 12.5px;
  color: var(--color-text-secondary);
  cursor: pointer;
  user-select: none;
}
.auto-toggle input {
  accent-color: var(--color-primary);
  cursor: pointer;
}

/* ===== 表格 ===== */
.tq-table-card {
  overflow: hidden;
}
.table th.col-actions,
.table td.col-actions {
  text-align: right;
  white-space: nowrap;
}
.job-name {
  font-weight: 600;
  font-size: 13.5px;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.job-sub {
  max-width: 320px;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.job-id {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 11.5px;
}
.retried-mark {
  padding: 0 6px;
  border-radius: var(--radius-full);
  background: var(--color-warning-soft);
  color: var(--color-warning);
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.6;
}
.job-result {
  max-width: 280px;
  font-size: 12.5px;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.job-done {
  color: var(--color-success);
}
.job-error {
  color: var(--color-danger);
}

.tq-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
  flex-wrap: wrap;
}
.tq-pager {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.live-tip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-info);
}
.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-info);
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.7);
  animation: live-pulse 1.6s ease-in-out infinite;
}
@keyframes live-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
.spinning {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .live-dot { animation: none; }
  .spinning { animation: none; }
}

@media (max-width: 1080px) {
  .tq-stats {
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (max-width: 640px) {
  .tq-stats {
    grid-template-columns: repeat(2, 1fr);
  }
  .tq-filter-extra {
    flex-direction: column;
    align-items: stretch;
  }
  .auto-toggle {
    margin-left: 0;
  }
  .tq-search {
    min-width: 0;
    width: 100%;
  }
  .tq-foot {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
