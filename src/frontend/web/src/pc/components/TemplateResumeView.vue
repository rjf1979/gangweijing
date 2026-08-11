<!-- 职业默认简历模板渲染：独立 iframe（srcdoc）承载模板完整 HTML。
  模板自带样式与 @media print A4 设置，避免与全局样式冲突；
  渲染后自动把脱敏片段（含 * 的文本）高亮为可点击填写，填写值仅存本机浏览器。 -->
<template>
  <article class="template-resume">
    <div class="template-meta">
      <span class="neo-tag neo-tag-lime">已套用职业模板</span>
      <span v-if="template.source" class="neo-tag neo-tag-blue">{{ sourceLabel(template.source) }}</span>
      <span class="template-name">{{ template.name || template.occupationId }}</span>
      <span v-if="template.description" class="template-desc">{{ template.description }}</span>
    </div>
    <p class="fine privacy-note">✏️ 点击模板中高亮的脱敏内容可填写真实信息，打印/保存 PDF 后输出完整简历；填写内容只保存在本机浏览器，不会上传到服务器。</p>
    <div class="template-frame-wrap">
      <iframe
        ref="frameEl"
        class="template-frame"
        :title="'简历模板：' + (template.name || '')"
        :srcdoc="doc"
        @load="onLoad"
      ></iframe>
    </div>
  </article>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { renderTemplate } from '../utils/renderTemplate.js'

const props = defineProps({
  template: { type: Object, default: null },
  structured: { type: Object, default: null },
  signature: { type: String, default: '' },
  avatar: { type: String, default: '' },
})

const frameEl = ref(null)
const frameHeight = ref(0)
const ready = ref(false)

function sourceLabel(source) {
  if (source === 'ai') return 'AI 生成'
  if (source === 'manual') return '人工编辑'
  return '内置'
}

const FILLS_KEY = 'jobMirrorTplFills'

// 渲染 + 脱敏填写准备：把含脱敏标记（*）的文本节点包成可点击 span，注入本地填写脚本
function prepareDoc(html) {
  const dom = new DOMParser().parseFromString(String(html || ''), 'text/html')
  if (!dom.body) return html
  let keyIndex = 0
  const walker = dom.createTreeWalker(dom.body, NodeFilter.SHOW_TEXT)
  const textNodes = []
  let node
  while ((node = walker.nextNode())) {
    if (/\*{2,}/.test(node.nodeValue || '')) textNodes.push(node)
  }
  for (const tn of textNodes) {
    const span = dom.createElement('span')
    span.className = 'tm-fill'
    span.setAttribute('data-key', 'f' + (keyIndex++))
    span.textContent = tn.nodeValue
    tn.parentNode.replaceChild(span, tn)
  }
  const style = dom.createElement('style')
  style.textContent = '.tm-fill{background:#fff2b8;border-bottom:2px dashed #f2a93b;border-radius:3px;padding:0 2px;cursor:text;}.tm-fill.tm-filled{background:#e2f5d8;border-bottom-style:solid;border-bottom-color:#5fae45;}'
  dom.head.appendChild(style)
  const script = dom.createElement('script')
  script.textContent = `(function(){var KEY='${FILLS_KEY}';var signature=${JSON.stringify(props.signature || '')};var fills={};try{var all=JSON.parse(localStorage.getItem(KEY)||'{}');fills=all[signature]||{}}catch(e){}function persist(){try{var all=JSON.parse(localStorage.getItem(KEY)||'{}');all[signature]=fills;localStorage.setItem(KEY,JSON.stringify(all))}catch(e){}}var items=document.querySelectorAll('.tm-fill');for(var i=0;i<items.length;i++){(function(el){var key=el.getAttribute('data-key');var orig=el.textContent;if(fills[key]){el.textContent=fills[key];el.classList.add('tm-filled')}el.title='点击填写真实信息（仅保存在本机浏览器）';el.addEventListener('click',function(){var cur=fills[key]||el.textContent;var next=window.prompt('填写真实信息（仅保存在本机浏览器，不会上传）：',cur);if(next===null)return;var v=String(next).trim();if(v){fills[key]=v;el.textContent=v;el.classList.add('tm-filled')}else{delete fills[key];el.textContent=orig;el.classList.remove('tm-filled')}persist()})})(items[i])}})()`
  dom.body.appendChild(script)
  return '<!DOCTYPE html>\n' + dom.documentElement.outerHTML
}

const doc = computed(() => {
  if (!props.template || !props.template.html) return ''
  const rendered = renderTemplate(props.template.html, { ...(props.structured || {}), avatar: props.avatar || '' })
  return prepareDoc(rendered)
})

async function onLoad() {
  ready.value = true
  await nextTick()
  resize()
}

function resize() {
  const frame = frameEl.value
  if (!frame || !frame.contentDocument) return
  const docEl = frame.contentDocument.documentElement
  frameHeight.value = Math.max(docEl.scrollHeight || 0, 500)
  setTimeout(() => {
    const d = frame.contentDocument
    if (d) frameHeight.value = Math.max(d.documentElement.scrollHeight || 0, 500)
  }, 150)
}

function printTemplate() {
  const frame = frameEl.value
  if (frame && frame.contentWindow) {
    frame.contentWindow.focus()
    try { frame.contentWindow.print(); return } catch (e) { /* 降级到父窗口打印 */ }
  }
  window.print()
}

defineExpose({ printTemplate })
</script>

<style scoped>
.template-resume { display: grid; gap: var(--space-3); }
.template-meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.template-name { font-weight: 900; font-size: 15px; }
.template-desc { color: var(--color-muted); font-size: 13px; font-weight: 700; }
.template-frame-wrap { display: grid; justify-items: center; width: 100%; }
.template-frame {
  width: 794px;
  max-width: 100%;
  height: v-bind(frameHeight + 'px');
  border: 1px solid #d8dde6;
  border-radius: var(--radius-sm);
  background: #fff;
  box-shadow: var(--shadow-hard-sm);
}
</style>
