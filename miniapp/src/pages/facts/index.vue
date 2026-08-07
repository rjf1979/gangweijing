<template>
  <view class="page">
    <view class="card">
      <text class="kicker">STEP 2 · FACTS</text>
      <text class="title">确认简历事实</text>
      <text class="muted">核对、修正简历内容，确保 AI 分析基于真实信息。</text>

      <text class="label">简历内容</text>
      <textarea class="textarea tall" v-model="text" placeholder="正在加载简历…" />

      <button class="btn btn-primary" :disabled="saving || !text.trim()" @click="save">
        {{ saving ? '保存中…' : '保存并去岗位分析' }}
      </button>
      <view v-if="errorText" class="error">{{ errorText }}</view>
    </view>
  </view>
</template>

<script>
import api from '../../api/index.js'
export default {
  data() {
    return { text: '', saving: false, errorText: '' }
  },
  onLoad() {
    const draft = uni.getStorageSync('resumeDraft')
    if (draft) {
      this.text = draft
    } else {
      api.get('/api/resume').then(r => {
        if (r.hasResume) {
          this.text = r.text
          uni.setStorageSync('resumeDraft', r.text)
        }
      }).catch(() => {})
    }
  },
  methods: {
    async save() {
      this.errorText = ''
      const text = String(this.text || '').trim()
      if (!text) { this.errorText = '简历内容不能为空。'; return }
      this.saving = true
      try {
        await api.put('/api/resume', { text: text })
        uni.setStorageSync('resumeDraft', text)
        uni.showToast({ title: '已保存', icon: 'success' })
        setTimeout(() => uni.navigateTo({ url: '/pages/job/index' }), 500)
      } catch (e) {
        this.errorText = e.message
      } finally {
        this.saving = false
      }
    }
  }
}
</script>

<style>
.textarea.tall { min-height: 420rpx; }
</style>
