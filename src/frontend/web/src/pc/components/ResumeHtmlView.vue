<template>
  <article class="resume-html">
    <!-- 屏幕版（可编辑脱敏输入） -->
    <div class="html-screen resume-sheet">
      <div class="resume-sheet-inner">
        <header v-if="hasContact" class="rh-head">
          <h1 v-if="contact.name" class="rh-name"><MaskedText :text="contact.name" seg-key="contact-name" :fills="fills" @fill="onFill" /></h1>
          <div v-if="headLine" class="rh-title"><MaskedText :text="headLine" seg-key="contact-title" :fills="fills" @fill="onFill" /></div>
          <div v-if="contactItems.length" class="rh-contact">
            <span v-for="item in contactItems" :key="item.k" class="rh-contact-item">
              <span class="rh-contact-label">{{ item.label }}</span>
              <span class="rh-contact-value"><MaskedText :text="item.value" :seg-key="'contact-' + item.k" :fills="fills" @fill="onFill" /></span>
            </span>
          </div>
        </header>
        <main v-if="blocks.length" class="rh-body">
          <section v-for="block in blocks" :key="block.id" class="rh-section" :class="'rh-' + block.id">
            <h2 v-if="block.title" class="rh-h2">{{ block.title }}</h2>
            <!-- 文本/正文（含脱敏标注） -->
            <div v-if="block.kind === 'text' || block.kind === 'body'" class="rh-text">
              <MaskedText :text="block.data" :seg-key="block.id" :fills="fills" @fill="onFill" />
            </div>
            <!-- 证书/获奖等行条目 -->
            <ul v-else-if="block.kind === 'lines'" class="rh-lines">
              <li v-for="(line, i) in linesOf(block.data)" :key="i"><MaskedText :text="line" :seg-key="block.id + '-l' + i" :fills="fills" @fill="onFill" /></li>
            </ul>
            <!-- 技能分组 -->
            <div v-else-if="block.kind === 'skills'" class="rh-skills">
              <template v-for="g in skillGroups" :key="g.key">
                <div v-if="skillItems(block, g.key).length" class="rh-skill-group">
                  <span class="rh-skill-label">{{ g.label }}</span>
                  <span class="rh-skill-items">{{ skillItems(block, g.key).join('、') }}</span>
                </div>
              </template>
            </div>
            <!-- 时间线条目（工作/项目/教育） -->
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
})
const emit = defineEmits(['fill'])

function onFill(payload) {
  emit('fill', payload)
}

const hasContact = computed(() => props.contact && Object.keys(props.contact).length > 0)
const headLine = computed(() => [props.contact.current_title, props.contact.current_company].filter(Boolean).join(' @ '))
const contactItems = computed(() => CONTACT_ORDER
  .map(k => (props.contact[k] ? { k, label: CONTACT_LABELS[k] || k, value: props.contact[k] } : null))
  .filter(Boolean))

// 打印版：纯值 HTML（已用填写值复原脱敏），规避 input 不被浏览器打印
const printHtml = computed(() => renderResumeHtml({ contact: props.contact, blocks: props.blocks, fills: props.fills }))

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