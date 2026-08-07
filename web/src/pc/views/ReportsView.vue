<template>
  <section class="flow">
    <div class="list-head">
      <div><p class="section-kicker">MY_REPORTS</p><h1>我的分析报告</h1></div>
      <div class="list-tools">
        <label for="report-filter">状态</label>
        <select id="report-filter" v-model="filter">
          <option value="all">全部状态</option>
          <option value="completed">已完成</option>
          <option value="analyzing">分析中</option>
          <option value="failed">失败</option>
        </select>
        <router-link class="neo-button neo-button-primary" to="/facts">分析新岗位</router-link>
      </div>
    </div>
    <div id="report-list" class="report-list">
      <p v-if="loading">正在加载报告…</p>
      <div v-else-if="loadError" class="empty"><strong>加载失败</strong><p>{{ loadError }}</p></div>
      <div v-else-if="!rows.length" class="empty">
        <strong>{{ filtered ? '没有符合条件的报告' : '还没有报告' }}</strong>
        <p>{{ filtered ? '换一个状态筛选，或开始新的岗位分析。' : '确认简历事实并提交目标岗位后，报告会保存在这里。' }}</p>
        <router-link v-if="filtered" to="/reports">查看全部报告</router-link>
        <router-link v-else to="/facts">开始第一次分析</router-link>
      </div>
      <template v-else>
        <router-link v-for="item in rows" :key="item.id" class="report-row" :to="rowTarget(item)">
          <div><strong>{{ item.reportName }}</strong><small>{{ formatDate(item.createdAt) }}</small></div>
          <span class="status" :class="'status-' + item.status">{{ statusLabel[item.status] || item.status }}</span>
          <span class="mail" :class="'mail-' + item.emailStatus">邮件：{{ mailLabel[item.emailStatus] || item.emailStatus }}</span>
        </router-link>
      </template>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'
import { showLoading, hideLoading } from '../store'

const filter = ref('all')
const reports = ref([])
const loading = ref(true)
const loadError = ref('')

const statusLabel = { completed: '已完成', analyzing: '分析中', failed: '失败' }
const mailLabel = { sent: '已发送', pending: '待发送', failed: '发送失败', not_configured: '未配置', unknown: '未知' }

const filtered = computed(() => filter.value !== 'all')
const rows = computed(() => {
  if (!filtered.value) return reports.value
  return reports.value.filter(item => item.status === filter.value)
})

function rowTarget(item) {
  const token = item.reportUrl ? String(item.reportUrl).split('/').pop() : ''
  return token ? '/report/' + token : '/reports'
}

function formatDate(value) {
  return new Date(value).toLocaleString('zh-CN')
}

onMounted(async () => {
  showLoading('正在加载报告', '读取你的分析记录')
  try {
    const data = await api.get('/api/reports')
    reports.value = data.reports || []
  } catch (err) {
    loadError.value = err.message
  } finally {
    loading.value = false
    hideLoading()
  }
})
</script>
