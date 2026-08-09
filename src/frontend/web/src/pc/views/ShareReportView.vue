﻿<template>
  <section class="flow">
    <article v-if="error" class="report neo-panel">
      <div class="report-heading"><h2>报告不可用</h2><div class="neo-alert neo-alert-error">{{ error }}</div></div>
    </article>
    <article v-else-if="pending" class="report neo-panel">
      <div class="report-heading"><h2>报告分析中</h2><div class="neo-alert neo-alert-info">任务正在后台排队分析，页面会自动刷新，完成后将展示分析结果。</div></div>
    </article>
    <article v-else-if="report" class="report neo-panel">
      <ReportContent :report="report" :meta="meta" :occupation-match="occupationMatch" />
    </article>
    <article v-else class="report neo-panel"><p class="fine">正在加载报告…</p></article>
  </section>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import ReportContent from '../components/ReportContent.vue'

const route = useRoute()
const report = ref(null)
const pending = ref(false)
const meta = ref({})
const occupationMatch = ref(null)
const error = ref('')
let pollTimer = null

async function loadReport() {
  try {
    const data = await api.get('/api/reports/' + encodeURIComponent(route.params.token))
    if (data.status === 'analyzing' || (!data.report && !data.error)) {
      // 后台排队分析：未完成时展示“分析中”，每 5 秒自动刷新
      pending.value = true
      report.value = null
      meta.value = { reportName: data.reportName, jobTitle: data.jobTitle, createdAt: data.createdAt }
      if (pollTimer) clearTimeout(pollTimer)
      pollTimer = setTimeout(loadReport, 5000)
      return
    }
    pending.value = false
    report.value = data.report
    meta.value = { reportName: data.reportName, jobTitle: data.jobTitle, createdAt: data.createdAt }
    occupationMatch.value = { jobOccupation: data.jobOccupation || null, resumeOccupation: data.resumeOccupation || null }
  } catch (err) {
    error.value = err.message || '报告加载失败，请稍后重试。'
  }
}
onMounted(loadReport)
onUnmounted(() => { if (pollTimer) clearTimeout(pollTimer) })
</script>
