<template>
  <article id="report-step" class="report neo-panel" aria-labelledby="report-title">
    <ReportContent :report="report" :meta="meta" />
    <div class="action-row"><button class="neo-button neo-button-secondary" type="button" @click="emit('back', 'job')">修改材料后重分析</button></div>
  </article>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { store } from '../store'
import ReportContent from './ReportContent.vue'

const emit = defineEmits(['back'])

const report = ref(store.draft.report || null)
const meta = ref({
  reportName: store.draft.reportName || '',
  reportUrl: store.draft.reportUrl || '',
  emailSent: store.draft.emailSent,
})

onMounted(() => {
  report.value = store.draft.report || null
  meta.value = {
    reportName: store.draft.reportName || '',
    reportUrl: store.draft.reportUrl || '',
    emailSent: store.draft.emailSent,
  }
})
</script>
