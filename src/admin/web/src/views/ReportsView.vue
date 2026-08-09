<template>
  <div class="reports-page">
    <div class="toolbar card">
      <form class="search-form" role="search" @submit.prevent="applyFilters">
        <AppIcon name="search" :size="16" class="search-icon" decorative />
        <input
          v-model.trim="keyword"
          class="input search-input"
          type="search"
          placeholder="搜索邮箱 / 公司 / 岗位 / 报告名…"
          aria-label="搜索报告"
        />
        <select v-model="statusFilter" class="select status-select" aria-label="按状态筛选">
          <option value="">全部状态</option>
          <option value="completed">已完成</option>
          <option value="pending">处理中</option>
          <option value="failed">失败</option>
        </select>
        <select v-model="emailFilter" class="select status-select" aria-label="按邮件状态筛选">
          <option value="">全部邮件状态</option>
          <option value="sent">已发送</option>
          <option value="failed">发送失败</option>
          <option value="not_configured">未配置</option>
          <option value="pending">待发送</option>
        </select>
        <button class="btn" type="submit" :disabled="loading">筛选</button>
        <button v-if="hasFilters" class="btn btn-ghost" type="button" @click="resetFilters">清除</button>
      </form>
      <span class="toolbar-count">共 {{ total }} 份报告</span>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>报告名称</th>
              <th>公司</th>
              <th>岗位</th>
              <th>邮箱</th>
              <th>生成时间</th>
              <th>状态</th>
              <th>邮件</th>
              <th>Tokens / 费用</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody v-if="loading">
            <tr v-for="i in 8" :key="i">
              <td colspan="9"><div class="skeleton row-skeleton"></div></td>
            </tr>
          </tbody>
          <tbody v-else-if="error">
            <tr><td colspan="9" class="cell-muted" role="alert">{{ error }}</td></tr>
          </tbody>
          <tbody v-else-if="reports.length">
            <tr v-for="report in reports" :key="report.id" class="row-link" @click="$router.push(`/reports/${report.id}`)">
              <td>
                <span class="report-name">{{ report.report_name || report.job_title || '未命名报告' }}</span>
              </td>
              <td class="cell-secondary">{{ report.company_short_name || '—' }}</td>
              <td class="cell-secondary">{{ report.job_title || '—' }}</td>
              <td class="cell-secondary cell-mono">{{ report.email || '—' }}</td>
              <td class="cell-secondary cell-num">{{ formatDateTime(report.created_at) }}</td>
              <td><StatusBadge :value="report.status" /></td>
              <td><StatusBadge :value="report.email_status" /></td>
              <td class="cell-secondary cell-num cell-cost">
                <template v-if="report.usage?.totalTokens">
                  <div>{{ report.usage.totalTokens.toLocaleString() }} <span class="cost-token-label">tokens</span></div>
                  <div class="cell-cost-amount">{{ formatCost(report.cost_usd) }}</div>
                  <span v-if="report.costSource" class="cost-source-tag" :class="report.costSource === 'api' ? 'tag-real' : 'tag-estimate'">{{ report.costSource === 'api' ? '真实' : '估算' }}</span>
                </template>
                <span v-else>—</span>
              </td>
              <td class="cell-actions">
                <button class="btn btn-danger btn-sm" type="button" @click.stop="askDelete(report)">
                  <AppIcon name="trash" :size="13" /> 删除
                </button>
              </td>
            </tr>
          </tbody>
          <tbody v-else>
            <tr><td colspan="9"><div class="empty-state"><strong>没有匹配的报告</strong>调整筛选条件试试</div></td></tr>
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <span class="pagination-info">第 {{ page }} / {{ totalPages }} 页 · 每页 {{ pageSize }} 条</span>
        <button class="page-btn" type="button" :disabled="page <= 1" aria-label="上一页" @click="goPage(page - 1)">
          <AppIcon name="chevron-left" :size="14" decorative />
        </button>
        <button
          v-for="p in pageNumbers"
          :key="p"
          class="page-btn"
          :class="{ active: p === page }"
          type="button"
          :aria-current="p === page ? 'page' : undefined"
          @click="goPage(p)"
        >
          {{ p }}
        </button>
        <button class="page-btn" type="button" :disabled="page >= totalPages" aria-label="下一页" @click="goPage(page + 1)">
          <AppIcon name="chevron-right" :size="14" decorative />
        </button>
      </div>
    </div>

    <ConfirmDialog
      :open="deleteTarget !== null"
      title="删除报告"
      :message="deleteTarget ? `将标记报告「${deleteTarget.report_name || deleteTarget.job_title || '未命名报告'}」为已删除。\n用户端将不再展示，数据保留在数据库中（可恢复）。` : ''"
      confirm-text="确认删除"
      :busy="deleting"
      @close="deleteTarget = null"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import StatusBadge from '../components/StatusBadge.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { api } from '../api'
import { toast } from '../store'

const reports = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const statusFilter = ref('')
const emailFilter = ref('')
const loading = ref(false)
const error = ref('')
const deleteTarget = ref(null)
const deleting = ref(false)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const pageNumbers = computed(() => {
  const current = page.value
  const last = totalPages.value
  const start = Math.max(1, Math.min(current - 2, last - 4))
  return Array.from({ length: Math.min(5, last) }, (_, i) => start + i)
})
const hasFilters = computed(() => Boolean(keyword.value || statusFilter.value || emailFilter.value))

function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function formatCost(value) {
  if (value == null) return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  if (n === 0) return '$0.000000'
  if (n < 0.0000005) return '<$0.000001'
  return `$${n.toFixed(6)}`
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize.value) })
    if (keyword.value) params.set('q', keyword.value)
    if (statusFilter.value) params.set('status', statusFilter.value)
    if (emailFilter.value) params.set('emailStatus', emailFilter.value)
    const data = await api.get(`/reports?${params.toString()}`)
    reports.value = data.reports
    total.value = data.total
  } catch (err) {
    error.value = err.message || '加载报告失败。'
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  page.value = 1
  load()
}
function resetFilters() {
  keyword.value = ''
  statusFilter.value = ''
  emailFilter.value = ''
  page.value = 1
  load()
}
function goPage(next) {
  if (next < 1 || next > totalPages.value) return
  page.value = next
  load()
}
function askDelete(report) {
  deleteTarget.value = report
}
async function confirmDelete() {
  const target = deleteTarget.value
  if (!target) return
  deleting.value = true
  try {
    await api.delete(`/reports/${target.id}`)
    toast('报告已标记删除', 'success')
    deleteTarget.value = null
    if (reports.value.length === 1 && page.value > 1) page.value -= 1
    load()
  } catch (err) {
    toast(err.message || '删除失败', 'error')
  } finally {
    deleting.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.reports-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 20px;
}
.search-form {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
  position: relative;
}
.search-icon {
  position: absolute;
  left: 12px;
  color: var(--color-text-muted);
  pointer-events: none;
}
.search-input {
  padding-left: 36px;
  flex: 1;
  min-width: 180px;
}
.status-select {
  width: auto;
  min-width: 120px;
}
.toolbar-count {
  color: var(--color-text-muted);
  font-size: 12.5px;
  white-space: nowrap;
}
.row-skeleton {
  height: 20px;
}
.report-name {
  font-weight: 500;
}
.cell-mono {
  font-family: var(--font-mono);
  font-size: 12.5px;
}
.cell-cost {
  white-space: nowrap;
}
.cost-token-label {
  color: var(--color-text-muted);
  font-size: 12px;
}
.cell-cost-amount {
  color: var(--color-text-muted);
  font-size: 12px;
  margin-top: 2px;
}
.cost-source-tag {
  display: inline-block;
  margin-top: 2px;
  padding: 0 6px;
  border-radius: var(--radius-full);
  font-size: 11px;
  line-height: 18px;
}
.cost-source-tag.tag-real {
  background: rgba(22, 163, 74, 0.12);
  color: #16a34a;
}
.cost-source-tag.tag-estimate {
  background: var(--color-surface-3);
  color: var(--color-text-muted);
}
@media (max-width: 1100px) {
  .toolbar { flex-direction: column; align-items: stretch; }
  .search-form { flex-wrap: wrap; }
}
.cell-actions { white-space: nowrap; }
</style>
