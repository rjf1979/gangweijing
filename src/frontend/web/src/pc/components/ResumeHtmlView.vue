<!-- 简历 HTML 渲染：屏幕版（脱敏可填写）+ 打印版（纯值已复原）
  数据源 = 原文描述块（resumeBlocks.buildBlocks text-first），不改原文 -->
<template>
  <article class="resume-html">
    <!-- 屏幕版（可编辑脱敏输入） -->
    <div class="html-screen resume-sheet">
      <div class="resume-sheet-inner">
        <!-- 职业模板徽标（识别结果，纯展示不改原文） -->
        <div v-if="occupationBadge" class="rh-occupation-badge" :class="'rh-occ-' + occupationBadge.id">{{ occupationBadge.text }}</div>

        <!-- 页眉：优先原文头部块（header），否则回退 contact 对象 -->
        <template v-if="rawHeader">
          <header class="rh-head">
            <h1 v-if="rawHeader.name" class="rh-name"><MaskedText :text="rawHeader.name" seg-key="raw-name" :fills="fills" @fill="onFill" /></h1>
            <div v-if="rawHeader.lines.length" class="rh-contact">
              <span v-for="(ln, i) in rawHeader.lines" :key="i" class="rh-contact-item">
                <span class="rh-contact-value"><MaskedText :text="ln" :seg-key="'raw-h' + i" :fills="fills" @fill="onFill" /></span>
              </span>
            </div>
          </header>
        </template>
        <header v-else-if="hasContact" class="rh-head">
          <h1 v-if="contact.name" class="rh-name"><MaskedText :text="contact.name" seg-key="contact-name" :fills="fills" @fill="onFill" /></h1>
          <div v-if="headLine" class="rh-title"><MaskedText :text="headLine" seg-key="contact-title" :fills="fills" @fill="onFill" /></div>
          <div v-if="contactItems.length" class="rh-contact">
            <span v-for="item in contactItems" :key="item.k" class="rh-contact-item">
              <span class="rh-contact-label">{{ item.label }}</span>
              <span class="rh-contact-value"><MaskedText :text="item.value" :seg-key="'contact-' + item.k" :fills="fills" @fill="onFill" /></span>
            </span>
          </div>
        </header>
        <main v-if="bodyBlocks.length" class="rh-body">
          <section v-for="block in bodyBlocks" :key="block.id" class="rh-section" :class="['rh-' + block.id, { 'rh-emphasis': block.emphasis }, block.emphasis === 'core' ? 'rh-emphasis-core' : '', block.emphasis === 'secondary' ? 'rh-emphasis-secondary' : '']">
            <h2 v-if="block.title" class="rh-h2">{{ block.title }}</h2>
            <!-- 原文描述块（text-first 排版） -->
            <div v-if="block.kind === 'raw'" class="rh-raw">
              <template v-for="(g, gi) in block.groups" :key="gi">
                <div v-if="g.type === 'subhead'" class="rh-subhead"><MaskedText :text="g.text" :seg-key="seg(block, gi)" :fills="fills" @fill="onFill" /></div>
                <div v-else-if="g.type === 'time'" class="rh-raw-time"><MaskedText :text="g.text" :seg-key="seg(block, gi)" :fills="fills" @fill="onFill" /></div>
                <article v-else-if="g.type === 'entry'" class="rh-entry">
                  <div v-if="g.time" class="rh-entry-time">{{ g.time }}</div>
                  <div class="rh-entry-main">
                    <div class="rh-entry-head">
                      <strong v-if="g.lines[0]" class="rh-entry-title"><MaskedText :text="g.lines[0]" :seg-key="seg(block, gi, 0)" :fills="fills" @fill="onFill" /></strong>
                      <span v-if="g.lines.length > 1" class="rh-entry-sub"><MaskedText :text="g.lines.slice(1).join(' · ')" :seg-key="seg(block, gi, 'sub')" :fills="fills" @fill="onFill" /></span>
                    </div>
                  </div>
                </article>
                <ul v-else-if="g.type === 'list'" class="rh-raw-list">
                  <li v-for="(it, li) in g.items" :key="li"><MaskedText :text="it" :seg-key="seg(block, gi, li)" :fills="fills" @fill="onFill" /></li>
                </ul>
                <div v-else class="rh-text"><MaskedText :text="g.text" :seg-key="seg(block, gi)" :fills="fills" @fill="onFill" /></div>
              </template>
            </div>
            <!-- 旧结构化兜底（原文为空时的极端情况，保持兼容） -->
            <div v-else-if="block.kind === 'text' || block.kind === 'body'" class="rh-text">
              <MaskedText :text="block.data" :seg-key="block.id" :fills="fills" @fill="onFill" />
            </div>
            <ul v-else-if="block.kind === 'lines'" class="rh-lines">
              <li v-for="(line, i) in linesOf(block.data)" :key="i"><MaskedText :text="line" :seg-key="block.id + '-l' + i" :fills="fills" @fill="onFill" /></li>
            </ul>
            <div v-else-if="block.kind === 'skills'" class="rh-skills">
              <template v-for="g in skillGroups" :key="g.key">
                <div v-if="skillItems(block, g.key).length" class="rh-skill-group">
                  <span class="rh-skill-label">{{ g.label }}</span>
                  <span class="rh-skill-items">{{ skillItems(block, g.key).join('、') }}</span>
                </div>
              </template>
            </div>
            <div v-else-if="block.kind === 'list'" class="rh-timeline">
              <article v-for="(item, i) in block.data" :key="i" class="rh-entry">
                <div v-if="entryTime(item)" class="rh-entry-time">{{ entryTime(item) }}</div>
                <div class="rh-entry-main">
                  <div class="rh-entry-head">
                    <strong class="rh-entry-title"><MaskedText :text="entryMain(block, item)" :seg-key="segKey(block, i, 'main')" :fills="fills" @fill="onFill" /></strong>
                    <span v-if="entrySub(block, item)" class="rh-entry-sub"><MaskedText :text="entrySub(block, item)" :seg-key="segKey(block, i, 'sub')" :fills="fills" @fill="onFill" /></span>
                  </div>
                  <div v-if="entryMeta(block, item)" class="rh-entry-meta"><MaskedText :text="entryMeta(block, item)" :seg-key="segKey(block, i, 'meta')" :fills="fills" @fill="onFill" /></div>
                  <div v-if="entryDesc(block, item)" class="rh-entry-desc"><MaskedText :text="entryDesc(block, item)" :seg-key="segKey(block, i, 'desc')" :fills="fills" @fill="onFill" /></div>
                  <ul v-if="entryList(block, item).length" class="rh-entry-list">
                    <li v-for="(t, j) in entryList(block, item)" :key="j"><MaskedText :text="t" :seg-key="segKey(block, i, 'li' + j)" :fills="fills" @fill="onFill" /></li>
                  </ul>
                </div>
              </article>
            </div>
          </section>
        </main>
      </div>
    </div>
    <!-- 打印版（纯值，已复原填写） -->
    <div class="html-print resume-sheet" aria-hidden="true" v-html="printHtml"></div>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import MaskedText from './MaskedText.vue'
import { CONTACT_LABELS, CONTACT_ORDER, LIST_CFG, renderResumeHtml } from '../utils/resumePrint.js'

const props = defineProps({
  contact: { type: Object, default: () => ({}) },
  blocks: { type: Array, default: () => [] },
  fills: { type: Object, default: () => ({}) },
  occupation: { type: Object, default: null },
})
const emit = defineEmits(['fill'])

function onFill(payload) {
  emit('fill', payload)
}

// 职业模板徽标（后端识别结果 occupation.id/name/confidence）
const occupationBadge = computed(() => {
  const o = props.occupation
  if (!o || !o.id) return null
  const pct = Math.round((o.confidence || 0) * 100)
  const kw = Array.isArray(o.matchedKeywords) && o.matchedKeywords.length ? o.matchedKeywords.slice(0, 4).map(k => k.k).join('、') : ''
  return {
    id: String(o.id).replace(/[^\w-]/g, ''),
    text: `职业模板：${o.name || o.id} · 置信度 ${pct}%` + (kw ? `（命中：${kw}）` : ''),
  }
})

// 原文头部块（kind='raw' 且 groups[0].type === 'header'）
const rawHeader = computed(() => {
  const b = (props.blocks || []).find(x => x.id === 'header')
  const g = b && b.groups && b.groups[0]
  return g && g.type === 'header' ? g : null
})
// 正文区块（排除页眉块）
const bodyBlocks = computed(() => (props.blocks || []).filter(b => b.id !== 'header'))

const hasContact = computed(() => props.contact && Object.keys(props.contact).length > 0)
const headLine = computed(() => [props.contact.current_title, props.contact.current_company].filter(Boolean).join(' @ '))
const contactItems = computed(() => CONTACT_ORDER
  .map(k => (props.contact[k] ? { k, label: CONTACT_LABELS[k] || k, value: props.contact[k] } : null))
  .filter(Boolean))

// 打印版：纯值 HTML（已用填写值复原脱敏），规避 input 不被浏览器打印
const printHtml = computed(() => renderResumeHtml({ contact: props.contact, blocks: props.blocks, fills: props.fills, occupation: props.occupation }))

// 原文描述块分段 key：区块 + 组 + 子项，全局唯一，保证填写缓存稳定
function seg(block, gi, suffix) {
  return `${block.id}-g${gi}` + (suffix === undefined || suffix === '' ? '' : '-' + suffix)
}

const skillGroups = [
  { key: 'technical', label: '专业技能' },
  { key: 'tools', label: '工具' },
  { key: 'soft', label: '软技能' },
  { key: 'languages', label: '语言' },
]

function linesOf(data) {
  if (Array.isArray(data)) return data.map(x => String(x ?? '')).filter(Boolean)
  return String(data || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean)
}
function skillItems(block, key) {
  const s = block.data || {}
  return Array.isArray(s[key]) ? s[key] : []
}

// ---------- 列表条目辅助（与 resumePrint.js 的 LIST_CFG 保持一致） ----------
function isObj(item) { return item && typeof item === 'object' }
function get(item, k) { return isObj(item) ? String(item[k] ?? '').trim() : '' }
function cfgOf(block) { return LIST_CFG[block.id] || { main: '', sub: [], desc: '', meta: [], list: [] } }
function segKey(block, i, suffix) { return `${block.id}-${i}-${suffix}` }
function entryMain(block, item) {
  const raw = isObj(item) ? '' : String(item ?? '').trim()
  return raw || get(item, cfgOf(block).main)
}
function entrySub(block, item) {
  return (cfgOf(block).sub || []).map(k => get(item, k)).filter(Boolean).join(' · ')
}
function entryMeta(block, item) {
  return (cfgOf(block).meta || []).map(k => get(item, k)).filter(Boolean).join(' · ')
}
function entryDesc(block, item) {
  const d = cfgOf(block).desc
  return d ? get(item, d) : ''
}
function entryList(block, item) {
  return (cfgOf(block).list || []).flatMap(k => linesOf(item[k]))
}
function entryTime(item) {
  const a = get(item, 'start_date')
  const b = get(item, 'end_date')
  if (a && b) return `${a} - ${b}`
  return a || b
}
</script>
