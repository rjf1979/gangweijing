﻿<template>
  <section class="flow">
    <article v-if="error" class="report neo-panel">
      <div class="report-heading"><h2>报告不可用</h2><div class="neo-alert neo-alert-error">{{ error }}</div></div>
    </article>
    <article v-else-if="report" class="report neo-panel">
      <ReportContent :report="report" :meta="meta" :occupation-match="occupationMatch" />
    </article>
    <article v-else class="report neo-panel"><p class="fine">正在加载报告…</p></article>
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import { showLoading, hideLoading } from '../store'
import ReportContent from '../components/ReportContent.vue'

const route = useRoute()
const report = ref(null)
const meta = ref({})
const occupationMatch = ref(null)
const error = ref('')

onMounted(async () => {
  showLoading('正在打开报告', '读取在线分析结果')
  try {
    const data = await api.get('/api/reports/' + encodeURIComponent(route.params.token))
    report.value = data.report
    meta.value = { reportName: data.reportName, jobTitle: data.jobTitle, createdAt: data.createdAt }
    occupationMatch.value = { jobOccupation: data.jobOccupation || null, resumeOccupation: data.resumeOccupation || null }
  } catch (err) {
    error.value = err.message || '报告加载失败，请稍后重试。'
  } finally {
    hideLoading()
  }
})
</script>
