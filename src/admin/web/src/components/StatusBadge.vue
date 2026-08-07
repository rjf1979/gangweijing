<template>
  <span class="badge" :class="badgeClass">{{ label }}</span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  value: { type: String, default: '' },
})

const LABELS = {
  completed: '已完成',
  pending: '处理中',
  failed: '失败',
  sent: '已发送',
  not_configured: '未配置',
  unknown: '未知',
  verified: '已验证',
  none: '未发送',
}

const badgeClass = computed(() => {
  switch (props.value) {
    case 'completed': return 'badge-success'
    case 'sent': return 'badge-success'
    case 'verified': return 'badge-success'
    case 'pending': return 'badge-warning'
    case 'failed': return 'badge-danger'
    case 'not_configured': return 'badge-neutral'
    case 'none': return 'badge-neutral'
    default: return 'badge-neutral'
  }
})

const label = computed(() => LABELS[props.value] || props.value || '—')
</script>