<template>
  <div v-if="visible" class="invite-mask" role="dialog" aria-modal="true" aria-labelledby="invite-title">
    <div class="invite-dialog">
      <h2 id="invite-title" class="invite-title">邀请好友</h2>
      <div class="invite-body">
        <p class="invite-lead">把邀请链接分享给好友，对方注册后即计入你的邀请。</p>

        <div v-if="loading" class="invite-status" role="status">正在读取邀请信息…</div>
        <p v-else-if="error" class="error" role="alert">{{ error }}</p>
        <template v-else>
          <dl v-if="info.invitedBy" class="invite-row">
            <dt>邀请人</dt>
            <dd>{{ info.invitedBy.email }}</dd>
          </dl>
          <div class="invite-field">
            <span class="invite-field-label">我的邀请码</span>
            <div class="invite-field-row">
              <code class="invite-code">{{ info.code || '—' }}</code>
              <button type="button" class="neo-button neo-button-secondary invite-copy" :disabled="copying !== ''" @click="copy('code', info.code)">
                {{ copying === 'code' ? '已复制' : '复制' }}
              </button>
            </div>
          </div>
          <div class="invite-field">
            <span class="invite-field-label">邀请链接</span>
            <div class="invite-field-row">
              <code class="invite-link">{{ info.link || '—' }}</code>
              <button type="button" class="neo-button neo-button-secondary invite-copy" :disabled="copying !== ''" @click="copy('link', info.link)">
                {{ copying === 'link' ? '已复制' : '复制' }}
              </button>
            </div>
          </div>
          <p v-if="copyError" class="error invite-copy-error" role="alert">{{ copyError }}</p>
          <p class="invite-stat" role="status">
            已邀请 <strong>{{ info.inviteCount ?? 0 }}</strong> 位新用户
          </p>
          <p class="invite-tip fine">复制邀请链接发送给好友，对方通过链接注册即自动绑定为你的邀请。</p>
        </template>
      </div>
      <div class="invite-actions">
        <button type="button" class="neo-button neo-button-primary" @click="close">知道了</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { api } from '../api'

const visible = ref(false)
const loading = ref(false)
const error = ref('')
const info = ref({})
const copying = ref('')
const copyError = ref('')

function close() {
  visible.value = false
  error.value = ''
}

async function open() {
  visible.value = true
  loading.value = true
  error.value = ''
  info.value = {}
  try {
    info.value = await api.get('/api/me/invite')
  } catch (err) {
    error.value = err.message || '读取邀请信息失败。'
  } finally {
    loading.value = false
  }
}

async function copyText(text) {
  // 优先 Clipboard API（HTTPS/本地安全上下文）
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* 降级到 execCommand */ }
  // 降级：临时 textarea + execCommand
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

async function copy(key, text) {
  if (!text) return
  copying.value = key
  copyError.value = ''
  const ok = await copyText(text)
  if (ok) {
    setTimeout(() => { if (copying.value === key) copying.value = '' }, 1200)
  } else {
    copying.value = ''
    copyError.value = '复制失败，请手动选择文本复制'
    setTimeout(() => { copyError.value = '' }, 2000)
  }
}

defineExpose({ open })
</script>
