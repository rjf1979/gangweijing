<template>
  <div class="report-heading">
    <p class="neo-tag neo-tag-lime">STEP 04 / 在线报告</p>
    <h2 id="report-title">{{ title }}</h2>
    <p id="summary" class="summary">{{ report.summary }}</p>
    <p class="report-disclaimer">分析结果基于简历与岗位文本，不代表实际录用概率。</p>
  </div>

  <section class="neo-section neo-section-green" aria-labelledby="qualification-heading">
    <h3 id="qualification-heading">总体结论</h3>
    <div class="card"><strong>{{ report.qualification?.status }}</strong><p>{{ report.qualification?.evidence }}</p></div>
  </section>

  <section class="neo-section neo-section-blue" aria-labelledby="evidence-heading">
    <h3 id="evidence-heading">匹配证据</h3>
    <div>
      <div v-for="item in report.dimensions" :key="item.name" class="card">
        <strong>{{ item.name }} · {{ item.score_0_to_5 }}/5</strong>
        <p>{{ item.evidence }}</p>
        <p>{{ item.gap }}</p>
      </div>
    </div>
  </section>

  <section class="neo-section neo-section-pink" aria-labelledby="verify-heading">
    <h3 id="verify-heading">风险与待核实项</h3>
    <ul v-if="verifyItems.length" class="risk-list">
      <li v-for="(item, i) in verifyItems" :key="i">{{ item }}</li>
    </ul>
    <p v-else class="fine">未发现明显风险或待核实项。</p>
  </section>

  <section class="neo-section" aria-labelledby="rewrite-heading">
    <h3 id="rewrite-heading">简历优化建议</h3>
    <div>
      <div v-for="(item, i) in report.resume_rewrite" :key="i" class="card">
        <strong>{{ item.section }}</strong>
        <p>{{ item.original_issue }}</p>
        <p>{{ item.rewrite_direction }}</p>
        <p>{{ item.example }}</p>
      </div>
    </div>
  </section>

  <section class="neo-section neo-section-lime" aria-labelledby="actions-heading">
    <h3 id="actions-heading">投递前行动</h3>
    <ol class="action-list"><li v-for="(item, i) in report.actions" :key="i">{{ item }}</li></ol>
  </section>

  <aside v-if="meta.reportUrl" class="report-link">
    <strong>保存你的报告地址</strong>
    <p>稍后可通过此地址重新查看，请勿公开分享。</p>
    <div><input id="report-url" readonly :value="meta.reportUrl"><button id="copy-report" class="secondary" @click="copyUrl">{{ copied ? '已复制' : '复制地址' }}</button></div>
    <small>{{ meta.emailSent ? '地址已发送到注册邮箱。' : '邮件暂未发送，请先保存此地址。' }}</small>
  </aside>
</template>

<script setup>
import { ref, computed } from 'vue'
import { store } from '../store'

const props = defineProps({
  report: { type: Object, required: true },
  meta: { type: Object, default: () => ({}) },
})

const copied = ref(false)

const title = computed(() => {
  return props.meta.reportName || store.draft.reportName || props.meta.jobTitle || store.draft.jobTitle || '岗位适配报告'
})

const verifyItems = computed(() => {
  const risks = String(props.report.qualification?.risks || '').split(/[；;。\n]+/).map(s => s.trim()).filter(Boolean)
  return [...risks, ...(props.report.verify || [])]
})

async function copyUrl() {
  try {
    await navigator.clipboard.writeText(props.meta.reportUrl)
    copied.value = true
  } catch { /* 剪贴板不可用时忽略 */ }
}
</script>
