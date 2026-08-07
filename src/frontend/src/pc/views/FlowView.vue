<template>
  <section id="flow" class="flow" aria-label="岗位分析流程">
    <nav class="steps" aria-label="分析进度">
      <span class="neo-step" :class="{ active: active === 'resume', complete: activeIndex > 0 }"><b>01</b><em>简历</em></span>
      <i aria-hidden="true"></i>
      <span class="neo-step" :class="{ active: active === 'facts', complete: activeIndex > 1 }"><b>02</b><em>事实</em></span>
      <i aria-hidden="true"></i>
      <span class="neo-step" :class="{ active: active === 'job', complete: activeIndex > 2 }"><b>03</b><em>岗位</em></span>
      <i aria-hidden="true"></i>
      <span class="neo-step" :class="{ active: active === 'report' }"><b>04</b><em>报告</em></span>
    </nav>

    <StepResume v-if="active === 'resume'" @next="go('facts')" />
    <StepFacts v-else-if="active === 'facts'" @next="go('job')" @back="go('resume')" />
    <StepJob v-else-if="active === 'job'" @next="go('report')" @back="go('facts')" />
    <StepReport v-else-if="active === 'report'" @back="go('job')" />
  </section>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { store, STEPS } from '../store'
import StepResume from '../components/StepResume.vue'
import StepFacts from '../components/StepFacts.vue'
import StepJob from '../components/StepJob.vue'
import StepReport from '../components/StepReport.vue'

const props = defineProps({
  step: { type: String, default: 'resume' },
})

const route = useRoute()
const router = useRouter()
const active = ref(props.step)

const activeIndex = computed(() => STEPS.indexOf(active.value))

// 恢复第一版 PC 的进入逻辑：有简历自动进事实、无简历回简历、无事实回事实、无报告回事实/简历
function ensureStep() {
  const d = store.draft
  let s = props.step
  const replacing = route.query.mode === 'replace'
  if (s === 'resume' && d.resumeText && !replacing) s = 'facts'
  if (s === 'facts' && !d.resumeText) s = 'resume'
  if (s === 'job' && !d.facts) s = 'facts'
  if (s === 'report' && !d.report) s = d.resumeText ? 'facts' : 'resume'
  if (s !== props.step) {
    router.replace('/' + s)
    return
  }
  active.value = s
}

function go(step) {
  router.push('/' + step)
}

watch([() => props.step, () => route.query.mode], ensureStep)
onMounted(ensureStep)
</script>
