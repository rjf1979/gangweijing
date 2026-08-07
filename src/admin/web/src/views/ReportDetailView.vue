<template>
  <div class="report-detail">
    <div class="page-actions">
      <button class="btn btn-ghost" type="button" @click="$router.push('/reports')">
        <AppIcon name="arrow-left" :size="15" /> 返回报告列表
      </button>
      <button class="btn btn-danger" type="button" @click="deleteOpen = true">
        <AppIcon name="trash" :size="15" /> 删除报告
      </button>
    </div>

    <div v-if="loading" class="card detail-loading">
      <div class="skeleton detail-skeleton" role="status"></div>
    </div>

    <div v-else-if="error" class="card empty-state" role="alert">{{ error }}</div>

    <template v-else-if="report">
      <section class="card meta-card">
        <div class="meta-head">
          <div class="meta-title">
            <h2>{{ report.reportName || '未命名报告' }}</h2>
            <p class="meta-sub">
              {{ report.companyShortName || '未知公司' }}
              <template v-if="report.jobTitle"> · {{ report.jobTitle }}</template>
            </p>
          </div>
          <div class="meta-tags">
            <StatusBadge :value="report.status" />
            <StatusBadge :value="report.emailStatus" />
          </div>
        </div>
        <dl class="meta-grid">
          <div class="meta-item">
            <dt>报告 ID</dt>
            <dd class="cell-num">{{ report.id }}</dd>
          </div>
          <div class="meta-item">
            <dt>关联邮箱</dt>
            <dd>{{ report.email || '—' }}</dd>
          </div>
          <div class="meta-item">
            <dt>生成时间</dt>
            <dd>{{ formatDateTime(report.createdAt) }}</dd>
          </div>
          <div class="meta-item">
            <dt>更新时间</dt>
            <dd>{{ formatDateTime(report.updatedAt) }}</dd>
          </div>
          <div class="meta-item">
            <dt>AI 模型</dt>
            <dd>{{ report.usage?.model || '—' }}</dd>
          </div>
          <div class="meta-item">
            <dt>Token 用量</dt>
            <dd class="cell-num">
              <template v-if="report.usage?.totalTokens">
                {{ report.usage.totalTokens.toLocaleString() }} <span class="meta-unit">tokens</span>
                <span v-if="report.usage.inputTokens != null || report.usage.outputTokens != null" class="meta-hint">输入 {{ (report.usage.inputTokens || 0).toLocaleString() }} · 输出 {{ (report.usage.outputTokens || 0).toLocaleString() }}</span>
              </template>
              <template v-else>—</template>
            </dd>
          </div>
          <div class="meta-item">
            <dt>估算费用</dt>
            <dd class="cell-num">
              <template v-if="report.costUsd != null">
                {{ formatCost(report.costUsd) }}
                <span class="meta-hint">按模型公开价目估算</span>
              </template>
              <template v-else>—</template>
            </dd>
          </div>
        </dl>
      </section>

      <template v-if="data && Object.keys(data).length">
        <section v-if="data.summary" class="card">
          <div class="card-head"><h2 class="card-title">分析摘要</h2></div>
          <div class="card-body">
            <p class="summary-text">{{ data.summary }}</p>
          </div>
        </section>

        <section v-if="data.qualification" class="card">
          <div class="card-head"><h2 class="card-title">匹配度判断</h2></div>
          <div class="card-body">
            <div class="qual-row">
              <span class="qual-label">结论</span>
              <span class="badge" :class="qualBadgeClass">{{ data.qualification.status || '—' }}</span>
            </div>
            <div v-if="data.qualification.evidence" class="qual-row">
              <span class="qual-label">依据</span>
              <p class="qual-text">{{ data.qualification.evidence }}</p>
            </div>
            <div v-if="data.qualification.risks" class="qual-row">
              <span class="qual-label">风险</span>
              <p class="qual-text">{{ data.qualification.risks }}</p>
            </div>
          </div>
        </section>

        <section v-if="data.dimensions?.length" class="card">
          <div class="card-head"><h2 class="card-title">维度评分</h2></div>
          <div class="card-body dim-list">
            <article v-for="dim in data.dimensions" :key="dim.name" class="dim-item">
              <div class="dim-head">
                <div class="dim-name">
                  <strong>{{ dim.name }}</strong>
                  <span class="dim-score cell-num" :aria-label="`${dim.name} ${dim.score_0_to_5} 分`">{{ dim.score_0_to_5 ?? '—' }}<small>/5</small></span>
                </div>
                <div class="dim-dots" :aria-hidden="true">
                  <span v-for="i in 5" :key="i" class="dim-dot" :class="{ filled: i <= Math.round(dim.score_0_to_5 || 0) }"></span>
                </div>
              </div>
              <p v-if="dim.evidence" class="dim-evidence"><strong>依据：</strong>{{ dim.evidence }}</p>
              <p v-if="dim.gap" class="dim-gap"><strong>差距：</strong>{{ dim.gap }}</p>
            </article>
          </div>
        </section>

        <section v-if="data.verify?.length" class="card">
          <div class="card-head">
            <h2 class="card-title">待核实事项</h2>
            <span class="count-chip cell-num">{{ data.verify.length }}</span>
          </div>
          <div class="card-body">
            <ul class="check-list">
              <li v-for="(item, index) in data.verify" :key="index">
                <AppIcon name="shield" :size="15" class="check-icon" decorative />
                {{ item }}
              </li>
            </ul>
          </div>
        </section>

        <section v-if="data.resume_rewrite?.length" class="card">
          <div class="card-head">
            <h2 class="card-title">简历优化建议</h2>
            <span class="count-chip cell-num">{{ data.resume_rewrite.length }}</span>
          </div>
          <div class="card-body rewrite-list">
            <article v-for="(item, index) in data.resume_rewrite" :key="index" class="rewrite-item">
              <h3>{{ item.section || `建议 ${index + 1}` }}</h3>
              <p v-if="item.original_issue" class="rewrite-row"><strong>原问题：</strong>{{ item.original_issue }}</p>
              <p v-if="item.rewrite_direction" class="rewrite-row"><strong>优化方向：</strong>{{ item.rewrite_direction }}</p>
              <p v-if="item.example" class="rewrite-row"><strong>示例：</strong><span class="rewrite-example">{{ item.example }}</span></p>
            </article>
          </div>
        </section>

        <section v-if="data.actions?.length" class="card">
          <div class="card-head">
            <h2 class="card-title">行动建议</h2>
            <span class="count-chip cell-num">{{ data.actions.length }}</span>
          </div>
          <div class="card-body">
            <ol class="action-list">
              <li v-for="(item, index) in data.actions" :key="index">{{ item }}</li>
            </ol>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <h2 class="card-title">原始数据</h2>
            <button class="btn btn-ghost btn-sm" type="button" @click="showRaw = !showRaw">
              {{ showRaw ? '收起' : '查看 JSON' }}
            </button>
          </div>
          <div v-if="showRaw" class="card-body">
            <pre class="raw-json">{{ prettyJson }}</pre>
          </div>
        </section>
      </template>

      <div v-else class="card empty-state"><strong>报告内容为空</strong>该记录没有可展示的分析数据</div>
    </template>

    <ConfirmDialog
      :open="deleteOpen"
      title="删除报告"
      :message="report ? `将永久删除报告「${report.reportName || '未命名报告'}」。此操作不可撤销。` : ''"
      confirm-text="确认删除"
      :busy="deleting"
      @close="deleteOpen = false"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import StatusBadge from '../components/StatusBadge.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { api } from '../api'
import { toast } from '../store'

const route = useRoute()
const router = useRouter()
const reportId = computed(() => String(route.params.id))

const loading = ref(true)
const error = ref('')
const report = ref(null)
const deleteOpen = ref(false)
const deleting = ref(false)
const showRaw = ref(false)

const data = computed(() => report.value?.data || {})
const prettyJson = computed(() => JSON.stringify(data.value, null, 2))
const qualBadgeClass = computed(() => {
  const status = String(data.value?.qualification?.status || '')
  if (status.includes('匹配')) return 'badge-success'
  if (status.includes('不匹配') || status.includes('风险')) return 'badge-danger'
  return 'badge-warning'
})

function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function formatCost(value) {
  if (value == null) return '—'
  const n = Number(value)
  if (n === 0) return '$0.00'
  if (n < 0.01) return '<$0.01'
  return `$${n.toFixed(4)}`
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const dataResult = await api.get(`/reports/${reportId.value}`)
    report.value = dataResult.report
  } catch (err) {
    error.value = err.message || '加载报告详情失败。'
  } finally {
    loading.value = false
  }
}

async function confirmDelete() {
  deleting.value = true
  try {
    await api.delete(`/reports/${reportId.value}`)
    toast('报告已删除', 'success')
    router.replace('/reports')
  } catch (err) {
    toast(err.message || '删除失败', 'error')
    deleteOpen.value = false
  } finally {
    deleting.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.report-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.detail-skeleton {
  height: 200px;
}
.meta-card {
  padding: 22px 24px;
}
.meta-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.meta-title h2 {
  font-size: 18px;
  margin-bottom: 4px;
  overflow-wrap: anywhere;
}
.meta-sub {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 13.5px;
}
.meta-tags {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.meta-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin: 20px 0 0;
  padding-top: 18px;
  border-top: 1px solid var(--color-border);
}
.meta-item dt {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 4px;
}
.meta-item dd {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
  overflow-wrap: anywhere;
}
.meta-unit {
  font-size: 12px;
  color: var(--color-text-muted);
  font-weight: 400;
}
.meta-hint {
  display: block;
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 2px;
}
@media (max-width: 980px) {
  .meta-grid { grid-template-columns: repeat(2, 1fr); }
}

.summary-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.75;
  color: var(--color-text);
  white-space: pre-wrap;
}

.qual-row {
  display: grid;
  grid-template-columns: 84px 1fr;
  gap: 12px;
  align-items: start;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border);
}
.qual-row:last-child {
  border-bottom: none;
}
.qual-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-muted);
  padding-top: 2px;
}
.qual-text {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.dim-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.dim-item {
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-deep);
}
.dim-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.dim-name {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
.dim-name strong {
  font-size: 14px;
}
.dim-score {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-primary);
}
.dim-score small {
  font-size: 11px;
  color: var(--color-text-muted);
  font-weight: 500;
}
.dim-dots {
  display: flex;
  gap: 5px;
  flex-shrink: 0;
}
.dim-dot {
  width: 22px;
  height: 6px;
  border-radius: 3px;
  background: var(--color-surface-3);
}
.dim-dot.filled {
  background: var(--color-primary);
}
.dim-evidence,
.dim-gap {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.65;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
}
.dim-evidence strong,
.dim-gap strong {
  color: var(--color-text);
  font-weight: 600;
}

.count-chip {
  padding: 1px 10px;
  border-radius: var(--radius-full);
  background: var(--color-surface-3);
  color: var(--color-text-secondary);
  font-size: 12.5px;
}
.check-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.check-list li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 13.5px;
  line-height: 1.65;
}
.check-icon {
  color: var(--color-warning);
  margin-top: 2px;
  flex-shrink: 0;
}

.rewrite-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.rewrite-item {
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-deep);
}
.rewrite-item h3 {
  font-size: 13.5px;
  margin-bottom: 8px;
  color: var(--color-primary);
}
.rewrite-row {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.65;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
}
.rewrite-row strong {
  color: var(--color-text);
  font-weight: 600;
}
.rewrite-example {
  color: var(--color-text-secondary);
}

.action-list {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.action-list li {
  font-size: 13.5px;
  line-height: 1.65;
}

.raw-json {
  margin: 0;
  max-height: 460px;
  overflow: auto;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-deep);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
}
</style>