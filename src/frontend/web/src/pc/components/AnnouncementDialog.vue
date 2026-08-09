<template>
  <div v-if="visible" class="announcement-mask" role="dialog" aria-modal="true" aria-labelledby="announcement-title">
    <div class="announcement-dialog">
      <h2 id="announcement-title" class="announcement-title">公告</h2>
      <div class="announcement-body">{{ announcement }}</div>
      <div class="announcement-actions">
        <button type="button" class="neo-button neo-button-primary" :disabled="acking" @click="ack">
          {{ acking ? '正在确认…' : '我知道了' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { api } from '../api'
import { store } from '../store'

const visible = ref(false)
const announcement = ref('')
const acking = ref(false)
let checked = false

async function check() {
  if (checked) return
  checked = true
  try {
    const data = await api.get('/api/config')
    const text = String(data.announcement || '').trim()
    if (!text) return
    const ackAt = data.announcementAckAt ? Date.parse(data.announcementAckAt) : 0
    const updatedAt = data.announcementUpdatedAt ? Date.parse(data.announcementUpdatedAt) : 0
    // 未确认过 -> 弹；已确认过 -> 仅当公告有版本时间且确认时间早于公告更新时间时再弹
    const needAck = ackAt <= 0 ? true : (updatedAt > 0 ? ackAt < updatedAt : false)
    if (!needAck) return
    announcement.value = data.announcement
    visible.value = true
    await nextTick()
    document.querySelector('.announcement-actions .neo-button')?.focus()
  } catch {
    // 拉取失败不阻塞正常使用，下次会话再提示
  }
}

async function ack() {
  if (acking.value) return
  acking.value = true
  try {
    await api.post('/api/announcement/ack', {})
  } catch {
    // 记录失败也关闭，下次会话再提示
  }
  acking.value = false
  visible.value = false
}

// 登录状态就绪后检查（refreshSession 完成后 authenticated 变为 true）
watch(() => store.authenticated, (val) => { if (val) check() }, { immediate: true })
</script>
