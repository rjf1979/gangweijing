<template>
  <section class="flow">
    <div class="list-head">
      <div><p class="section-kicker">MY_REPORTS</p><h1>我的分析报告</h1></div>
      <div class="list-tools">
        <div class="filter-group">
          <label for="report-filter">状态筛选</label>
          <select id="report-filter" v-model="filter">
            <option value="all">全部状态</option>
            <option value="completed">已完成</option>
            <option value="analyzing">分析中</option>
            <option value="failed">失败</option>
          </select>
        </div>
        <button id="new-analysis" class="neo-button neo-button-primary" type="button" :disabled="starting" @click="startNewAnalysis">
          {{ starting ? '正在确认…' : '分析新岗位' }}
        </button>
      </div>
    </div>
    <div id="report-list" class="report-list">
      <p v-if="loading">正在加载报告…</p>
      <div v-else-if="loadError" class="empty"><strong>加载失败</strong><p>{{ loadError }}</p></div>
      <div v-else-if="!rows.length" class="empty">
        <strong>{{ filtered ? '没有符合条件的报告' : '还没有报告' }}</strong>
        <p>{{ filtered ? '换一个状态筛选，或开始新的岗位分析。' : '确认简历事实并提交目标岗位后，报告会保存在这里。' }}</p>
        <router-link v-if="filtered" to="/reports">查看全部报告</router-link>
        <router-link v-else to="/resume" @click.prevent="startNewAnalysis">开始第一次分析</router-link>
      </div>
      <template v-else>
        <router-link v-for="item in rows" :key="item.id" class="report-row" :to="rowTarget(item)">
          <div><strong>{{ item.reportName }}</strong><small>{{ formatDate(item.createdAt) }}</small></div>
          <span class="status" :class="'status-' + item.status">{{ statusLabel[item.status] || item.status }}</span>
          <span class="mail" :class="'mail-' + item.emailStatus">邮件：{{ mailLabel[item.emailStatus] || item.emailStatus }}<template v-if="item.emailSentToday">（今日 {{ item.emailSentToday }}/{{ item.emailMaxToday }}）</template></span>
          <div class="row-actions">
            <button v-if="item.canResendEmail" class="neo-button neo-button-secondary report-resend-email" type="button" :disabled="resendingId === item.id || emailLimitReached(item)" :title="emailLimitReached(item) ? '今日发送已达上限' : ''" @click.prevent.stop="resendEmail(item)">{{ resendingId === item.id ? '发送中…' : '重新发送邮件' }}</button>
            <button v-if="item.canReanalyze" class="neo-button neo-button-secondary report-reanalyze" type="button" :disabled="reanalyzingId === item.id" @click.prevent.stop="reanalyze(item)">{{ reanalyzingId === item.id ? '分析中…' : '重新分析' }}</button>
            <button class="neo-button neo-button-secondary report-delete" type="button" :disabled="deletingId === item.id" @click.prevent.stop="deleteReport(item)">{{ deletingId === item.id ? '删除中…' : '删除' }}</button>
          </div>
        </router-link>
      </template>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { store, showLoading, hideLoading, saveDraft, clearJobDraft } from '../store'

const router = useRouter()
const filter = ref('all')
const reports = ref([])
const loading = ref(true)
const loadError = ref('')
const starting = ref(false)
const reanalyzingId = ref(null)
const resendingId = ref(null)
const deletingId = ref(null)

const statusLabel = { completed: '已完成', analyzing: '分析中', failed: '失败' }
const mailLabel = { sent: '已发送', pending: '待发送', failed: '发送失败', not_configured: '未配置', unknown: '未知' }

const filtered = computed(() => filter.value !== 'all')
const rows = computed(() => {
  if (!filtered.value) return reports.value
  return reports.value.filter(item => item.status === filter.value)
})

async function startNewAnalysis() {
  if (starting.value) return
  starting.value = true
  clearJobDraft() // 每次「分析新岗位」都是全新分析：清空上次岗位草稿
  showLoading('正在切换页面', '正在确认你的简历状态')
  try {
    const data = await api.get('/api/resume')
    if (data.hasResume) {
      // 有简历：把后端简历恢复到前端草稿，进入岗位分析流程（事实确认 → 目标岗位）
      if (!store.draft.resumeText) saveDraft({ resumeText: data.text || '', facts: undefined, report: undefined })
      router.push('/facts')
    } else {
      // 无简历 → 上传简历流程
      router.push('/resume')
    }
  } catch {
    router.push('/resume')
  } finally {
    starting.value = false
  }
}

function rowTarget(item) {
  const token = item.reportUrl ? String(item.reportUrl).split('/').pop() : ''
  return token ? '/report/' + token : '/reports'
}

function formatDate(value) {
  return new Date(value).toLocaleString('zh-CN')
}

async function loadReports() {
  const data = await api.get('/api/reports')
  reports.value = data.reports || []
  loadError.value = ''
  return data
}

// 重新发送邮件：服务端强制两次至少间隔 10 分钟、同一报告当天最多 5 次，达到限制时给出明确提示
function emailLimitReached(item) {
  return (item.emailSentToday || 0) >= (item.emailMaxToday || 5)
}

async function resendEmail(item) {
  if (resendingId.value) return
  resendingId.value = item.id
  try {
    const data = await api.post('/api/reports/' + item.id + '/resend-email', {})
    await loadReports()
    window.alert('邮件已重新发送，请注意查收。' + (data.emailSentToday ? `（今日已发送 ${data.emailSentToday}/${data.emailMaxToday} 次）` : ''))
  } catch (err) {
    window.alert(err.message)
  } finally {
    resendingId.value = null
  }
}

// 重新分析：基于原报告的岗位内容 + 用户最新简历生成新报告，完成后跳转新报告
// 删除报告（软删除）：标记无效，前端过滤不再展示；数据保留在数据库，可恢复
async function deleteReport(item) {
  if (deletingId.value) return
  if (!window.confirm(`确定删除报告「${item.reportName || item.jobTitle || '未命名报告'}」吗？\n删除后将从你的报告列表隐藏，数据保留。`)) return
  deletingId.value = item.id
  try {
    await api.delete('/api/reports/' + item.id)
    await loadReports()
  } catch (err) {
    window.alert('删除失败：' + err.message)
  } finally {
    deletingId.value = null
  }
}

async function reanalyze(item) {
  if (reanalyzingId.value) return
  reanalyzingId.value = item.id
  showLoading('正在重新分析', '基于该岗位内容和你最新的简历生成新报告')
  try {
    const data = await api.post('/api/reports/' + item.id + '/reanalyze', {})
    await loadReports()
    const token = data.reportUrl ? String(data.reportUrl).split('/').pop() : ''
    if (token) router.push('/report/' + token)
  } catch (err) {
    if (err.code === 'EMAIL_NOT_VERIFIED') {
      router.push('/verify')
      return
    }
    window.alert('重新分析失败：' + err.message)
  } finally {
    reanalyzingId.value = null
    hideLoading()
  }
}

onMounted(async () => {
  showLoading('正在加载报告', '读取你的分析记录')
  try {
    await loadReports()
  } catch (err) {
    loadError.value = err.message
  } finally {
    loading.value = false
    hideLoading()
  }
})
</script>
