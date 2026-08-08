<template>
  <span class="masked-text"><template v-for="(seg, i) in segments" :key="i"><template v-if="seg.type === 'masked'"><span class="mask-tag">{{ seg.label }}</span><input class="mask-input" :class="{ 'is-filled': seg.filled }" :value="seg.value" :placeholder="seg.masked" :aria-label="seg.label" @input="onInput($event, seg)" /></template><template v-else>{{ seg.text }}</template></template></span>
</template>

<script setup>
import { computed } from 'vue'
import { splitMasked } from '../utils/maskedText.js'

const props = defineProps({
  text: { type: String, default: '' },
  // 全局唯一分段前缀（如 'summary'、'work_0'、'contact-phone'），保证填写缓存 key 稳定
  segKey: { type: String, required: true },
  fills: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['fill'])

// 脱敏片段 id 带上 segKey 前缀，跨区块/跨版本稳定；填写值来自父级 fills（本机 localStorage 隔离）
const segments = computed(() => splitMasked(props.text).map(seg => {
  if (seg.type !== 'masked') return seg
  const id = `${props.segKey}-${seg.id}`
  const saved = props.fills[id]
  const value = typeof saved === 'string' && saved.trim() !== '' ? saved : seg.masked
  return { ...seg, id, value, filled: value !== seg.masked && value.trim() !== '' }
}))

function onInput(event, seg) {
  const value = event.target.value
  emit('fill', { id: seg.id, value, filled: value.trim() !== '' && value.trim() !== seg.masked })
}
</script>