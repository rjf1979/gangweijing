<template>
  <div class="users-page">
    <div class="toolbar card">
      <form class="search-form" role="search" @submit.prevent="applySearch">
        <AppIcon name="search" :size="16" class="search-icon" decorative />
        <input
          v-model.trim="keyword"
          class="input search-input"
          type="search"
          placeholder="按邮箱搜索用户…"
          aria-label="按邮箱搜索用户"
        />
        <button class="btn" type="submit" :disabled="loading">搜索</button>
        <button v-if="keyword" class="btn btn-ghost" type="button" @click="resetSearch">清除</button>
      </form>
      <span class="toolbar-count">共 {{ total }} 位用户</span>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>邮箱</th>
              <th>注册时间</th>
              <th>邮箱验证</th>
              <th>简历</th>
              <th class="cell-num">报告数</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody v-if="loading">
            <tr v-for="i in 6" :key="i">
              <td colspan="6"><div class="skeleton row-skeleton"></div></td>
            </tr>
          </tbody>
          <tbody v-else-if="error">
            <tr><td colspan="6" class="cell-muted" role="alert">{{ error }}</td></tr>
          </tbody>
          <tbody v-else-if="users.length">
            <tr v-for="user in users" :key="user.id" class="row-link" @click="$router.push(`/users/${user.id}`)">
              <td>
                <span class="user-email">{{ user.email }}</span>
              </td>
              <td class="cell-secondary cell-num">{{ formatDateTime(user.created_at) }}</td>
              <td>
                <StatusBadge :value="user.email_verified_at ? 'verified' : 'none'" />
              </td>
              <td class="cell-secondary">
                <span v-if="user.has_resume" class="yes-tag"><AppIcon name="check" :size="13" /> 已上传</span>
                <span v-else class="cell-muted">—</span>
              </td>
              <td class="cell-num">{{ user.report_count ?? '—' }}</td>
              <td class="cell-actions">
                <button class="btn btn-danger btn-sm" type="button" @click.stop="askDelete(user)">
                  <AppIcon name="trash" :size="14" /> 删除
                </button>
              </td>
            </tr>
          </tbody>
          <tbody v-else>
            <tr><td colspan="6"><div class="empty-state"><strong>没有匹配的用户</strong>换个关键词试试</div></td></tr>
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
      title="删除用户"
      :message="deleteTarget ? `将永久删除用户「${deleteTarget.email}」。\n该用户的所有登录会话将失效，其名下报告将保留但不再关联该用户。此操作不可撤销。` : ''"
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

const users = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const appliedKeyword = ref('')
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

function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize.value) })
    if (appliedKeyword.value) params.set('q', appliedKeyword.value)
    const data = await api.get(`/users?${params.toString()}`)
    users.value = data.users
    total.value = data.total
  } catch (err) {
    error.value = err.message || '加载用户失败。'
  } finally {
    loading.value = false
  }
}

function applySearch() {
  page.value = 1
  appliedKeyword.value = keyword.value
  load()
}
function resetSearch() {
  keyword.value = ''
  appliedKeyword.value = ''
  page.value = 1
  load()
}
function goPage(next) {
  if (next < 1 || next > totalPages.value) return
  page.value = next
  load()
}
function askDelete(user) {
  deleteTarget.value = user
}
async function confirmDelete() {
  const target = deleteTarget.value
  if (!target) return
  deleting.value = true
  try {
    await api.delete(`/users/${target.id}`)
    toast('用户已删除', 'success')
    deleteTarget.value = null
    if (users.value.length === 1 && page.value > 1) page.value -= 1
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
.users-page {
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
  max-width: 520px;
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
}
.toolbar-count {
  color: var(--color-text-muted);
  font-size: 12.5px;
  white-space: nowrap;
}
.row-skeleton {
  height: 20px;
}
.user-email {
  font-weight: 500;
}
.yes-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-success);
  font-size: 12.5px;
}
.cell-actions { white-space: nowrap; }
</style>
