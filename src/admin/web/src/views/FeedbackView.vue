<template>
  <div class="feedback-page">
    <!-- 页头 -->
    <div class="fb-head card">
      <div class="fb-head-left">
        <h2 class="card-title">意见箱</h2>
        <p class="fb-head-desc">收集用户在 PC 端「意见反馈」悬浮按钮提交的意见与建议。待处理意见请及时查看并标记处理结果。</p>
      </div>
      <div class="fb-head-actions">
        <button class="btn btn-ghost btn-sm" type="button" :disabled="loading" @click="loadAll(true)">
          <AppIcon name="refresh" :size="15" :class="{ spinning: refreshing }" />
          刷新
        </button>
      </div>
    </div>

    <p v-if="errorMsg" class="fb-error" role="alert">{{ errorMsg }}</p>

    <!-- 统计卡片 -->
    <div class="fb-stats" aria-label="意见统计">
      <button
        v-for="s in statItems" :key="s.key || 'all'" type="button"
        class="stat-card" :class="{ active: statusFilter === s.key }"
        @click="setStatus(s.key)"
      >
        <span class="stat-label">{{ s.label }}</span>
        <span class="stat-value" :class="'stat-' + (s.key || 'all')">{{ s.count }}</span>
      </button>
    </div>

    <!-- 筛选 -->
    <div class="fb-filter card">
      <span class="filter-label">状态筛选</span>
      <div class="filter-chips" role="tablist" aria-label="意见状态筛选">
        <button
          v-for="s in statusOptions" :key="s.key" type="button" role="tab"
          :aria-selected="statusFilter === s.key"
          class="filter-chip" :class="{ active: statusFilter === s.key }"
          @click="setStatus(s.key)"
        >{{ s.label }}</button>
      </div>
    </div>

    <!-- 意见列表 -->
    <div class="card fb-table-card">
      <div v-if="loading && !items.length" class="empty-state">正在加载意见…</div>
      <div v-else-if="!items.length" class="empty-state">
        <strong>{{ statusFilter ? '筛选条件下暂无意见' : '暂无意见' }}</strong>
        <span>用户在 PC 端点击右下角「意见反馈」悬浮按钮提交后，会出现在这里。</span>
      </div>
      <div v-else class="fb-list">
        <article v-for="item in items" :key="item.id" class="fb-item" :class="{ expanded: expandedId === item.id }">
          <div class="fb-item-head" role="button" tabindex="0" :aria-expanded="expandedId === item.id" @click="toggleExpand(item.id)" @keydown.enter="toggleExpand(item.id)">
            <div class="fb-item-main">
              <div class="fb-item-meta">
                <span class="badge" :class="badgeClass(item.status)">{{ statusText(item.status) }}</span>
                <span class="badge badge-neutral">{{ categoryText(item.category) }}</span>
                <span class="fb-time cell-muted" :title="formatFull(item.createdAt)">{{ formatTime(item.createdAt) }}</span>
              </div>
              <p class="fb-content-preview">{{ item.content }}</p>
              <p class="fb-who cell-muted">
                <span v-if="item.email">{{ item.email }}</span>
                <span v-else>匿名用户</span>
                <template v-if="item.contact">&nbsp;· 联系方式：{{ item.contact }}</template>
              </p>
            </div>
            <div class="fb-item-actions" @click.stop>
              <button
                v-if="item.status === 'pending'"
                class="btn btn-ghost btn-sm" type="button" title="标记为已处理"
                @click="markHandled(item)"
              >标记已处理</button>
              <button
                v-else
                class="btn btn-ghost btn-sm" type="button" title="重新标记为待处理"
                @click="markPending(item)"
              >标记待处理</button>
              <button class="btn btn-ghost btn-sm btn-danger-ghost" type="button" @click="removeItem(item)">
                <AppIcon name="trash" :size="14" />
                删除
              </button>
            </div>
          </div>

          <div v-if="expandedId === item.id" class="fb-item-body">
            <div class="fb-content-full">{{ item.content }}</div>
            <p v-if="item.reply" class="fb-reply">
              <strong>处理回复：</strong>{{ item.reply }}
            </p>
            <div class="fb-reply-form">
              <textarea
                v-model="replyDrafts[item.id]"
                rows="2"
                maxlength="2000"
                placeholder="填写处理回复（选填），保存后写入本条意见…"
                aria-label="处理回复"
              ></textarea>
              <button
                class="btn btn-ghost btn-sm" type="button" :disabled="savingId === item.id"
                @click="saveReply(item)"
              >{{ savingId === item.id ? '保存中…' : '保存回复' }}</button>
            </div>
          </div>
        </article>
      </div>

      <div class="fb-foot">
        <span class="cell-muted">共 {{ total }} 条意见 · 本页 {{ items.length }} 条</span>
        <div class="fb-pager">
          <button class="btn btn-ghost btn-sm" type="button" :disabled="page <= 1 || loading" @click="changePage(page - 1)">上一页</button>
          <span class="cell-muted">第 {{ page }} / {{ totalPages || 1 }} 页</span>
          <button class="btn btn-ghost btn-sm" type="button" :disabled="page >= totalPages || loading" @click="changePage(page + 1)">下一页</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import { api } from '../api'

const PAGE_SIZE = 20

const items = ref([])
const total = ref(0)
const stats = ref({ total: 0, pending: 0, handled: 0 })
const loading = ref(false)
const refreshing = ref(false)
const errorMsg = ref('')
const statusFilter = ref('') // '' = 全部
const page = ref(1)
const expandedId = ref(null)
const savingId = ref(null)
const replyDrafts = reactive({})

const STATUS_META = {
  pending: { label: '待处理', badge: 'badge-warning' },
  handled: { label: '已处理', badge: 'badge-success' },
}
const CATEGORY_TEXT = { suggestion: '功能建议', bug: '问题反馈', other: '其他' }

const statusOptions = Object.entries(STATUS_META).map(([key, meta]) => ({ key, label: meta.label }))
const statItems = computed(() => [
  { key: '', label: '全部', count: stats.value.total || 0 },
  ...statusOptions.map(s => ({ key: s.key, label: s.label, count: stats.value[s.key] || 0 })),
])
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

const statusText = s => STATUS_META[s]?.label || s || '—'
const badgeClass = s => STATUS_META[s]?.badge || 'badge-neutral'
const categoryText = c => CATEGORY_TEXT[c] || c || '其他'
const pad2 = n => String(n).padStart(2, '0')

function formatTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
function formatFull(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${formatTime(value)}:${pad2(d.getSeconds())}`
}

function setStatus(key) {
  statusFilter.value = key || ''
  page.value = 1
  expandedId.value = null
  loadAll()
}
function changePage(next) {
  if (next < 1 || next > totalPages.value) return
  page.value = next
  loadList()
}
function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? null : id
  if (expandedId.value && replyDrafts[id] === undefined) {
    const item = items.value.find(i => i.id === id)
    if (item) replyDrafts[id] = item.reply || ''
  }
}

async function loadStats() {
  try {
    stats.value = (await api.feedbackStats()) || {}
  } catch (error) {
    // 统计失败不阻塞列表
  }
}
async function loadList() {
  loading.value = true
  try {
    const data = await api.listFeedback({
      status: statusFilter.value || undefined,
      limit: PAGE_SIZE,
      offset: (page.value - 1) * PAGE_SIZE,
    })
    items.value = data.items || []
    total.value = data.total || 0
    errorMsg.value = ''
  } catch (error) {
    errorMsg.value = error.message || '无法查询意见列表，请刷新页面重试。'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}
async function loadAll(manual = false) {
  if (manual) refreshing.value = true
  await Promise.all([loadStats(), loadList()])
}

async function markHandled(item) {
  const reply = String(replyDrafts[item.id] || '').trim()
  try {
    await api.updateFeedback(item.id, { status: 'handled', reply })
    replyDrafts[item.id] = ''
    await loadAll()
  } catch (error) {
    errorMsg.value = error.message
  }
}
async function markPending(item) {
  try {
    await api.updateFeedback(item.id, { status: 'pending', reply: item.reply || '' })
    await loadAll()
  } catch (error) {
    errorMsg.value = error.message
  }
}
async function saveReply(item) {
  const reply = String(replyDrafts[item.id] || '').trim()
  savingId.value = item.id
  try {
    await api.updateFeedback(item.id, { reply })
    await loadAll()
  } catch (error) {
    errorMsg.value = error.message
  } finally {
    savingId.value = null
  }
}
async function removeItem(item) {
  if (!window.confirm(`确定删除这条意见吗？
「${item.content.slice(0, 30)}${item.content.length > 30 ? '…' : ''}」`)) return
  try {
    await api.deleteFeedback(item.id)
    delete replyDrafts[item.id]
    if (expandedId.value === item.id) expandedId.value = null
    await loadAll()
  } catch (error) {
    errorMsg.value = error.message
  }
}

onMounted(() => loadAll())
</script>

<style scoped>
.feedback-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

/* ===== 页头 ===== */
.fb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  flex-wrap: wrap;
}
.fb-head-left { min-width: 0; }
.fb-head-desc {
  margin: 6px 0 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--color-text-muted);
  max-width: 760px;
}
.fb-head-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.fb-error {
  margin: 0;
  padding: 10px 14px;
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: var(--radius-md);
  background: var(--color-danger-soft);
  color: var(--color-danger);
  font-size: 13px;
}

/* ===== 统计卡片 ===== */
.fb-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
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
.stat-label { font-size: 12px; color: var(--color-text-muted); }
.stat-value {
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.stat-value.stat-pending { color: var(--color-warning); }
.stat-value.stat-handled { color: var(--color-success); }

/* ===== 筛选 ===== */
.fb-filter {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  flex-wrap: wrap;
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
  padding: 5px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 12.5px;
  cursor: pointer;
  transition: border-color var(--motion-fast), color var(--motion-fast), background var(--motion-fast);
}
.filter-chip:hover {
  border-color: var(--color-border-strong);
  color: var(--color-text);
}
.filter-chip.active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 600;
}

/* ===== 意见列表 ===== */
.fb-table-card { overflow: hidden; }
.fb-list {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--color-border);
}
.fb-item {
  border-bottom: 1px solid var(--color-border);
  transition: background var(--motion-fast);
}
.fb-item:hover { background: var(--color-surface-2); }
.fb-item-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  cursor: pointer;
  flex-wrap: wrap;
}
.fb-item-main { min-width: 0; flex: 1 1 480px; }
.fb-item-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.fb-content-preview {
  margin: 0 0 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 13.5px;
  line-height: 1.6;
}
.fb-who { margin: 0; font-size: 12px; }
.fb-item-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 0 0 auto;
}
.btn-danger-ghost {
  color: var(--color-danger);
}
.btn-danger-ghost:hover {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.fb-item-body {
  padding: var(--space-4) var(--space-5) var(--space-5);
  border-top: 1px dashed var(--color-border);
  background: var(--color-surface-1);
}
.fb-content-full {
  margin: 0 0 var(--space-3);
  font-size: 14px;
  line-height: 1.75;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.fb-reply {
  margin: 0 0 var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-left: 3px solid var(--color-success);
  background: var(--color-surface);
  border-radius: var(--radius-sm);
  font-size: 13px;
  line-height: 1.6;
}
.fb-reply-form {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
}
.fb-reply-form textarea {
  flex: 1;
  min-height: 56px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
}
.fb-reply-form textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-soft);
}

.fb-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  flex-wrap: wrap;
}
.fb-pager {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

@media (max-width: 720px) {
  .fb-stats { grid-template-columns: repeat(3, 1fr); }
  .fb-item-head { flex-direction: column; }
}
</style>
