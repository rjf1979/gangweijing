<template>
  <div class="feedback-widget">
    <!-- 悬浮入口：右下角固定小图标 -->
    <button
      id="feedback-fab"
      class="feedback-fab"
      type="button"
      :aria-expanded="open"
      aria-haspopup="dialog"
      aria-label="意见反馈"
      :title="open ? '收起意见反馈' : '意见反馈'"
      @click="toggle"
    >
      <svg v-if="!open" class="feedback-fab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M8 9h8" /><path d="M8 13h5" />
      </svg>
      <svg v-else class="feedback-fab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18 6 6 18" /><path d="m6 6 12 12" />
      </svg>
    </button>

    <!-- 意见反馈面板 -->
    <div v-if="open" ref="panel" class="feedback-panel" role="dialog" aria-modal="false" aria-labelledby="feedback-title">
      <div class="feedback-head">
        <div>
          <p class="feedback-kicker">FEEDBACK</p>
          <h2 id="feedback-title" class="feedback-title">意见反馈</h2>
        </div>
        <button class="feedback-close" type="button" aria-label="关闭意见反馈" @click="close">×</button>
      </div>

      <div v-if="done" class="feedback-done" role="status">
        <p class="feedback-done-mark" aria-hidden="true">✓</p>
        <strong>已收到你的反馈</strong>
        <p class="fine">感谢你的建议，我们会认真查看并持续改进。</p>
      </div>

      <form v-else class="feedback-form" @submit.prevent="submit">
        <fieldset class="feedback-fieldset">
          <legend>反馈类型</legend>
          <div class="feedback-cats" role="group" aria-label="反馈类型">
            <button
              v-for="cat in categories" :key="cat.value" type="button"
              class="feedback-cat" :class="{ active: category === cat.value }"
              :aria-pressed="category === cat.value"
              @click="category = cat.value"
            >{{ cat.label }}</button>
          </div>
        </fieldset>

        <label for="feedback-content">意见内容 <span class="feedback-required" aria-hidden="true">*</span></label>
        <textarea
          id="feedback-content" v-model="content" rows="4" required
          :maxlength="MAX_CONTENT" placeholder="说说你的想法、遇到的问题或改进建议…"
          @keydown.esc="close"
        ></textarea>
        <p class="feedback-count" :class="{ over: content.length > MAX_CONTENT }">{{ content.length }}/{{ MAX_CONTENT }}</p>

        <label for="feedback-contact">联系方式 <span class="feedback-optional">（选填）</span></label>
        <input
          id="feedback-contact" v-model="contact" type="text" :maxlength="100"
          :placeholder="loggedIn ? '已使用登录邮箱，可补充微信 / 手机号' : '邮箱 / 微信 / 手机号，方便我们回复你'"
        >
        <p v-if="loggedIn" class="fine feedback-mail-tip">将使用你的登录邮箱 <strong>{{ store.email || '已登录账号' }}</strong> 作为联系方式。</p>

        <p v-if="error" class="error" role="alert">{{ error }}</p>

        <div class="feedback-actions">
          <button type="button" class="neo-button neo-button-secondary" :disabled="submitting" @click="close">取消</button>
          <button id="feedback-submit" type="submit" class="neo-button neo-button-primary" :disabled="submitting">
            {{ submitting ? '提交中…' : '提交反馈' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { api } from '../api'
import { store } from '../store'

const MAX_CONTENT = 2000
const categories = [
  { value: 'suggestion', label: '功能建议' },
  { value: 'bug', label: '问题反馈' },
  { value: 'other', label: '其他' },
]

const open = ref(false)
const done = ref(false)
const submitting = ref(false)
const error = ref('')
const category = ref('suggestion')
const content = ref('')
const contact = ref('')
const panel = ref(null)

const loggedIn = computed(() => Boolean(store.authenticated && store.user))

function toggle() {
  if (open.value) close()
  else openPanel()
}

function openPanel() {
  open.value = true
  done.value = false
  error.value = ''
  if (loggedIn.value) contact.value = ''
  nextTick(() => {
    const ta = document.getElementById('feedback-content')
    if (ta) ta.focus()
  })
}

function close() {
  open.value = false
  error.value = ''
}

function onKeydown(event) {
  if (event.key === 'Escape' && open.value) close()
}

async function submit() {
  error.value = ''
  const text = content.value.trim()
  if (text.length < 2) {
    error.value = '请填写 2 字以上的意见内容。'
    return
  }
  submitting.value = true
  try {
    await api.post('/api/feedback', { category: category.value, content: text, contact: contact.value.trim() })
    done.value = true
    content.value = ''
    contact.value = ''
    setTimeout(() => { if (done.value) close() }, 1800)
  } catch (err) {
    error.value = err.message || '提交失败，请稍后重试。'
  } finally {
    submitting.value = false
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.feedback-widget { position: fixed; right: var(--space-5); bottom: var(--space-5); z-index: calc(var(--layer-header) + 5); }

.feedback-fab {
  display: grid;
  width: 58px;
  height: 58px;
  margin-left: auto;
  place-items: center;
  border: var(--border-strong);
  border-radius: 50%;
  background: var(--color-lime);
  box-shadow: var(--shadow-hard-md);
  color: var(--color-ink);
  cursor: pointer;
  transition: background var(--motion-fast), transform var(--motion-fast), box-shadow var(--motion-fast);
}
.feedback-fab:hover { background: var(--color-yellow); }
.feedback-fab:active { transform: translate(3px, 3px); box-shadow: var(--shadow-hard-pressed); }
.feedback-fab-icon { width: 26px; height: 26px; }

.feedback-panel {
  width: min(380px, calc(100vw - 40px));
  margin-bottom: var(--space-3);
  margin-left: auto;
  padding: var(--space-5);
  border: var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: var(--shadow-hard-md);
  max-height: min(640px, calc(100dvh - 120px));
  overflow: auto;
}

.feedback-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
.feedback-kicker { margin: 0 0 2px; color: var(--color-muted); font-size: 11px; font-weight: 900; letter-spacing: .08em; }
.feedback-title { margin: 0; font-size: 22px; font-weight: 900; }
.feedback-close {
  width: 34px; height: 34px;
  border: var(--border-thin);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  box-shadow: var(--shadow-hard-xs);
  color: var(--color-ink);
  font-size: 20px; line-height: 1;
  cursor: pointer;
}
.feedback-close:active { transform: translate(2px, 2px); box-shadow: var(--shadow-hard-pressed); }

.feedback-form { margin-top: var(--space-4); }
.feedback-fieldset { margin: 0 0 var(--space-4); padding: 0; border: 0; }
.feedback-fieldset legend { margin-bottom: var(--space-2); font-weight: 800; }
.feedback-cats { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.feedback-cat {
  padding: 6px 12px;
  border: var(--border-thin);
  border-radius: 999px;
  background: var(--color-surface);
  box-shadow: var(--shadow-hard-xs);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: background var(--motion-fast);
}
.feedback-cat:hover { background: var(--color-yellow); }
.feedback-cat.active { background: var(--color-lime); }

.feedback-required { color: var(--color-red); }
.feedback-optional { color: var(--color-muted); font-weight: 600; font-size: 13px; }
.feedback-count { margin: 4px 0 0; color: var(--color-muted); font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; }
.feedback-count.over { color: var(--color-red); font-weight: 800; }
.feedback-mail-tip { margin-top: var(--space-2); }

.feedback-done { padding: var(--space-5) 0; text-align: center; }
.feedback-done-mark {
  display: grid;
  width: 48px; height: 48px;
  margin: 0 auto var(--space-3);
  place-items: center;
  border-radius: 50%;
  background: var(--color-green);
  border: var(--border-thin);
  box-shadow: var(--shadow-hard-xs);
  font-size: 24px;
  font-weight: 900;
}

.feedback-actions { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-4); }

@media (max-width: 480px) {
  .feedback-widget { right: var(--space-3); bottom: var(--space-3); }
  .feedback-fab { width: 52px; height: 52px; }
  .feedback-panel { max-height: calc(100dvh - 100px); }
}
</style>
