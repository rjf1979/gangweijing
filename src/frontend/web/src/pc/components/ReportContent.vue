﻿<template>
  <div class="report-heading">
    <p class="neo-tag neo-tag-lime">STEP 04 / 在线报告</p>
    <h2 id="report-title">{{ title }}</h2>
    <p id="summary" class="summary">{{ report.summary }}</p>
    <p class="report-disclaimer">分析结果基于简历与岗位文本，不代表实际录用概率。</p>
  </div>

  <div v-if="occupationBanner" class="neo-alert occupation-banner" :class="'neo-alert-' + occupationBanner.type" role="status">
    <strong class="occupation-banner-head">{{ occupationBanner.head }}</strong>
    <span class="occupation-banner-text">{{ occupationBanner.text }}</span>
  </div>

  <section class="neo-section neo-section-green" aria-labelledby="qualification-heading">
    <h3 id="qualification-heading">总体结论</h3>
    <div class="card"><strong>{{ report.qualification?.status }}</strong><p>{{ report.qualification?.evidence }}</p></div>
  </section>

  <section class="neo-section neo-section-blue" aria-labelledby="evidence-heading">
    <h3 id="evidence-heading"><span>02</span> 匹配证据 · 维度评分</h3>

    <div v-if="dims.length" class="dim-overview">
      <div class="dim-fit-box">
        <p class="dim-fit-label">综合匹配度</p>
        <p class="dim-fit-score"><strong>{{ fitPct }}</strong><span>%</span></p>
        <p class="dim-fit-note">基于 {{ dims.length }} 个维度 · 平均 {{ avgScore }}/5</p>
        <div class="dim-fit-stats">
          <span class="stat stat-strong">强项 {{ strongCount }}</span>
          <span class="stat stat-fair">达标 {{ midCount }}</span>
          <span class="stat stat-weak">短板 {{ weakCount }}</span>
        </div>
        <p v-if="bestDim" class="dim-fit-best"><span>最佳</span>{{ bestDim.name }} {{ bestDim.score }}/5</p>
        <p v-if="worstDim" class="dim-fit-worst"><span>最弱</span>{{ worstDim.name }} {{ worstDim.score }}/5</p>
      </div>
      <div v-if="radar" class="dim-radar">
        <svg viewBox="0 0 260 220" role="img" aria-label="维度评分雷达图" focusable="false">
          <polygon v-for="(ring, ri) in radar.rings" :key="'r' + ri" :points="ring" class="radar-ring" />
          <line v-for="(axis, ai) in radar.axes" :key="'a' + ai" :x1="axis[0]" :y1="axis[1]" :x2="axis[2]" :y2="axis[3]" class="radar-axis" />
          <polygon :points="radar.points" class="radar-area" />
          <circle v-for="(pt, pi) in radar.vertices" :key="'v' + pi" :cx="pt[0]" :cy="pt[1]" r="3.6" class="radar-dot" />
          <text v-for="(lb, li) in radar.labels" :key="'l' + li" :x="lb[0]" :y="lb[1]" text-anchor="middle" class="radar-label">{{ lb[2] }}</text>
        </svg>
      </div>
    </div>

    <div v-if="dims.length" class="dim-list">
      <div v-for="(item, i) in sortedDims" :key="item.name" class="dim-card" :class="'dim-level-' + item.level.key">
        <div class="dim-card-head">
          <span class="dim-rank">{{ i + 1 }}</span>
          <strong class="dim-name">{{ item.name }}</strong>
          <span class="dim-badge" :class="'badge-' + item.level.key">{{ item.level.label }}</span>
          <span class="dim-score"><strong>{{ item.score }}</strong><small>/5</small></span>
        </div>
        <div class="dim-bar-wrap" role="img" :aria-label="item.name + ' 得分 ' + item.score + '/5，即 ' + item.pct + '%'">
          <span class="dim-bar" :class="'bar-' + item.level.key" :style="{ width: item.pct + '%' }"></span>
          <span class="dim-bar-ticks" aria-hidden="true"><i v-for="t in 5" :key="t"></i></span>
        </div>
        <div class="dim-bar-meta">
          <span class="dim-pct">{{ item.pct }}%</span>
          <span class="dim-scale" aria-hidden="true">0·1·2·3·4·5</span>
        </div>
        <p v-if="item.evidence.length" class="dim-block">
          <span class="dim-block-label">证据</span>
          <template v-for="(e, ei) in item.evidence" :key="'e' + ei"><span class="dim-line">{{ e }}</span></template>
        </p>
        <p v-if="item.gap.length" class="dim-block dim-gap">
          <span class="dim-block-label">差距</span>
          <template v-for="(g, gi) in item.gap" :key="'g' + gi"><span class="dim-line">{{ g }}</span></template>
        </p>
      </div>
    </div>
    <p v-else class="fine">暂无维度评分。</p>
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
  occupationMatch: { type: Object, default: null },
})

const copied = ref(false)

const title = computed(() => {
  return props.meta.reportName || store.draft.reportName || props.meta.jobTitle || store.draft.jobTitle || '岗位适配报告'
})

const verifyItems = computed(() => {
  const risks = String(props.report.qualification?.risks || '').split(/[；;。\n]+/).map(s => s.trim()).filter(Boolean)
  return [...risks, ...(props.report.verify || [])]
})

// 岗位-简历职业一致性提示（后端 /api/reports/:token 返回 jobOccupation / resumeOccupation）
const occupationBanner = computed(() => {
  const job = props.occupationMatch?.jobOccupation
  const resume = props.occupationMatch?.resumeOccupation
  const jobName = job?.name || ''
  const resumeName = resume?.name || ''
  if (jobName && resumeName && job.id === resume.id) {
    return { type: 'success', head: '职业方向一致', text: `岗位模板：${jobName} · 简历模板：${resumeName}，方向匹配，报告结论更可靠。` }
  }
  if (jobName && resumeName && job.id !== resume.id) {
    return { type: 'warning', head: '职业方向存在差异', text: `岗位偏向${jobName}，简历侧重${resumeName}，建议针对目标岗位补充相关经历后再评估。` }
  }
  if (jobName) {
    return { type: 'info', head: '岗位模板', text: `已按「${jobName}」模板评估目标岗位。` }
  }
  if (resumeName) {
    return { type: 'info', head: '简历模板', text: `简历识别为「${resumeName}」方向。` }
  }
  return null
})

// ---------- 维度评分展示 ----------
const LEVELS = [
  { key: 'top', min: 4.5, label: '卓越' },
  { key: 'strong', min: 4, label: '优秀' },
  { key: 'good', min: 3, label: '良好' },
  { key: 'fair', min: 2, label: '待提升' },
  { key: 'weak', min: 0, label: '短板' },
]

function normScore(v) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : 0
}
function toList(v) {
  if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean)
  return String(v || '').split(/[；;。\n]+/).map(s => s.trim()).filter(Boolean)
}
function levelOf(score) {
  return LEVELS.find(l => score >= l.min) || LEVELS[LEVELS.length - 1]
}
function shortName(name) {
  const s = String(name || '')
  return s.length > 5 ? s.slice(0, 4) + '…' : s
}

const dims = computed(() => {
  const list = Array.isArray(props.report.dimensions) ? props.report.dimensions : []
  return list.map(d => {
    const score = normScore(d.score_0_to_5)
    const level = levelOf(score)
    return {
      name: String(d.name || '未命名维度'),
      score: Number(score.toFixed(1)),
      pct: Math.round(score / 5 * 100),
      level,
      evidence: toList(d.evidence),
      gap: toList(d.gap),
    }
  })
})

const sortedDims = computed(() => [...dims.value].sort((a, b) => b.score - a.score))
const avgScore = computed(() => {
  if (!dims.value.length) return '0.0'
  const s = dims.value.reduce((sum, d) => sum + d.score, 0) / dims.value.length
  return Number(s.toFixed(1))
})
const fitPct = computed(() => {
  if (!dims.value.length) return 0
  return Math.round(dims.value.reduce((sum, d) => sum + d.score, 0) / dims.value.length / 5 * 100)
})
const strongCount = computed(() => dims.value.filter(d => d.score >= 4).length)
const midCount = computed(() => dims.value.filter(d => d.score >= 3 && d.score < 4).length)
const weakCount = computed(() => dims.value.filter(d => d.score < 3).length)
const bestDim = computed(() => sortedDims.value[0] || null)
const worstDim = computed(() => sortedDims.value.length > 1 ? sortedDims.value[sortedDims.value.length - 1] : null)

const radar = computed(() => {
  const list = sortedDims.value.slice(0, 8)
  const n = list.length
  if (n < 3) return null
  const cx = 130, cy = 110, r = 78
  const angle = i => (Math.PI * 2 * i) / n - Math.PI / 2
  const pt = (i, k) => [cx + r * k * Math.cos(angle(i)), cy + r * k * Math.sin(angle(i))]
  const fmt = v => Number(v.toFixed(2))
  const rings = [1, 2, 3, 4, 5].map(k => list.map((_, i) => pt(i, k / 5).map(fmt).join(',')).join(' '))
  const axes = list.map((_, i) => [...pt(i, 1).map(fmt), cx, cy])
  const data = list.map((d, i) => pt(i, d.score / 5).map(fmt))
  const labels = list.map((d, i) => {
    const lr = 100
    return [cx + lr * Math.cos(angle(i)), cy + lr * Math.sin(angle(i)) + 3, shortName(d.name)]
  })
  return {
    rings,
    axes,
    points: data.map(v => v.join(',')).join(' '),
    vertices: data,
    labels,
  }
})


async function copyUrl() {
  try {
    await navigator.clipboard.writeText(props.meta.reportUrl)
    copied.value = true
  } catch { /* 剪贴板不可用时忽略 */ }
}
</script>
