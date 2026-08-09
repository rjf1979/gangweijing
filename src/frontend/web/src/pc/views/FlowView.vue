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

    <StepResume v-if="active === 'resume'" :key="route.fullPath" @next="onResumeNext" />
    <StepFacts v-else-if="active === 'facts'" :key="route.fullPath" @next="go('job')" @back="go('resume')" />
    <StepJob v-else-if="active === 'job'" :key="route.fullPath" @next="go('report')" @back="go('facts')" />
    <StepReport v-else-if="active === 'report'" :key="route.fullPath" @back="go('job')" />
  </section>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { store, saveDraft, STEPS } from '../store'
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

let resumePromise = null
// 草稿为空时先从服务端加载已保存简历，避免新会话（sessionStorage 无草稿）把用户弹回重新上传
async function loadServerResume() {
  if (store.draft.resumeText) return
  if (resumePromise) return resumePromise
  resumePromise = (async () => {
    try {
      const resume = await api.get('/api/resume')
      if (resume.text) saveDraft({ resumeText: resume.text, facts: undefined })
    } catch {
      // 读取失败时保留本地草稿，不阻塞页面
    }
  })().finally(() => { resumePromise = null })
  return resumePromise
}

// 流程进入逻辑：先保证草稿有简历（服务端兜底），再按步骤跳转
// 有简历自动进事实、无简历回简历、无事实回事实、无报告回事实/简历
async function ensureStep() {
  const replacing = route.query.mode === 'replace'
  if (!store.draft.resumeText && !replacing) {
    await loadServerResume()
  }
  const d = store.draft
  let s = props.step
  if (s === 'resume' && d.resumeText && !replacing) s = 'facts'
  if (s === 'facts' && !d.resumeText) s = 'resume'
  if (s === 'job' && !d.resumeText) s = 'facts'
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

// 「更新简历」入口（?mode=replace）提交后直接返回展示简历，不再进入岗位分析流程
function onResumeNext() {
  if (route.query.mode === 'replace') {
    router.replace('/my-resume')
    return
  }
  go('facts')
}

watch([() => props.step, () => route.query.mode], ensureStep)
onMounted(ensureStep)
</script>
