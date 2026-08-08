<template>
  <section class="home-dashboard" aria-labelledby="home-title">
    <article class="home-hero neo-panel">
      <p class="section-kicker">YOUR WORKSPACE</p>
      <h1 id="home-title">你好，{{ displayName }}</h1>
      <p class="lead">从简历到岗位分析，所有任务和报告都在这里继续。</p>
      <div class="home-next">
        <div>
          <strong>{{ nextAction.title }}</strong>
          <p>{{ nextAction.description }}</p>
        </div>
        <router-link class="neo-button neo-button-primary" :to="nextAction.to">{{ nextAction.label }}</router-link>
      </div>
    </article>

    <section class="home-section" aria-labelledby="progress-title">
      <div class="home-section-heading"><div><p class="section-kicker">CURRENT PATH</p><h2 id="progress-title">分析进度</h2></div></div>
      <ol class="home-progress">
        <li :class="{ complete: resumeReady }"><b>01</b><span>简历</span><small>{{ resumeReady ? '已准备' : '待完成' }}</small></li>
        <li :class="{ complete: factsConfirmed }"><b>02</b><span>事实确认</span><small>{{ factsConfirmed ? '已完成' : (resumeReady ? '待确认' : '等待简历') }}</small></li>
        <li :class="{ complete: hasJobs }"><b>03</b><span>目标岗位</span><small>{{ hasJobs ? '已完成' : '待完成' }}</small></li>
        <li :class="{ complete: hasReports }"><b>04</b><span>分析报告</span><small>{{ hasReports ? '已生成' : '待生成' }}</small></li>
      </ol>
      <div class="home-stats" aria-label="完成统计">
        <div class="home-stat">
          <b>{{ stats.jobs }}</b>
          <span>目标岗位已完成</span>
        </div>
        <div class="home-stat">
          <b>{{ stats.reports }}</b>
          <span>分析报告已生成</span>
        </div>
      </div>
    </section>

    <section class="home-section" aria-labelledby="recent-reports-title">
      <div class="home-section-heading">
        <div><p class="section-kicker">HISTORY</p><h2 id="recent-reports-title">最近报告</h2></div>
        <router-link class="text-button" to="/reports">查看全部</router-link>
      </div>
      <p v-if="loading" class="home-status" role="status">正在读取你的分析记录…</p>
      <p v-else-if="loadError" class="error" role="alert">{{ loadError }}</p>
      <div v-else-if="reports.length" class="home-report-list">
        <a v-for="report in reports" :key="report.id" class="home-report-row" :href="report.reportUrl">
          <div><strong>{{ report.reportName }}</strong><small>{{ report.jobTitle }}</small></div>
          <time>{{ formatDate(report.createdAt) }}</time>
        </a>
      </div>
      <div v-else class="home-empty">
        <strong>还没有分析报告</strong>
        <p>完成岗位信息录入后，即可在这里查看每次分析结果。</p>
      </div>
    </section>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { saveDraft, store } from '../store'

const reports = ref([])
const stats = ref({ jobs: 0, reports: 0 })
const resumeReady = ref(Boolean(store.draft.resumeText))
const factsConfirmed = ref(false)
const loading = ref(true)
const loadError = ref('')

const hasJobs = computed(() => stats.value.jobs > 0)
const hasReports = computed(() => stats.value.reports > 0)

const displayName = computed(() => {
  const name = String(store.user?.email || '').split('@')[0] || '你'
  return name.length > 8 ? `${name.slice(0, 8)}...` : name
})
const nextAction = computed(() => {
  if (!resumeReady.value) return { title: '先准备你的简历', description: '上传文件或粘贴简历文本，开始建立分析基础。', label: '上传简历', to: '/resume' }
  if (!factsConfirmed.value) return { title: '确认简历事实', description: '核对简历中的职业事实，确保 AI 分析基于真实信息。', label: '确认事实', to: '/facts' }
  return { title: '录入目标岗位', description: '填写目标岗位信息，生成 AI 匹配分析报告。', label: '录入岗位', to: '/job' }
})

function formatDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(value))
}

onMounted(async () => {
  try {
    const [resume, reportData] = await Promise.all([api.get('/api/resume'), api.get('/api/reports')])
    resumeReady.value = Boolean(resume.hasResume)
    factsConfirmed.value = Boolean(resume.factsConfirmed)
    if (resume.text) saveDraft({ resumeText: resume.text, facts: undefined })
    reports.value = (reportData.reports || []).slice(0, 3)
    const total = (reportData.reports || []).length
    stats.value = reportData.stats || { jobs: total, reports: total }
  } catch (error) {
    loadError.value = error.message || '暂时无法读取首页数据，请稍后重试。'
  } finally {
    loading.value = false
  }
})
</script>