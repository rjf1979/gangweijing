<template>
  <view class="page">
    <view class="card">
      <text class="kicker">STEP 1 · RESUME</text>
      <text class="title">上传简历</text>
      <text class="muted">支持 PDF / Word，AI 自动提取文本；也可以直接粘贴简历内容。</text>

      <button class="btn btn-blue" :disabled="busyUpload" @click="chooseFile">
        选择简历文件（PDF / Word）
      </button>

      <view v-if="file" class="file-meta">
        <text class="tag tag-green">文件</text>
        <text class="file-name">{{ file.name }}</text>
        <text class="file-size">{{ formatBytes(file.size) }}</text>
      </view>

      <view v-if="file && uploadState === 'uploading'" class="progress-wrap">
        <view class="progress-bar" :style="{ width: progress + '%' }"></view>
      </view>
      <view v-if="file && uploadState === 'extracting'" class="progress-wrap">
        <view class="progress-bar is-busy" :style="{ width: '100%' }"></view>
      </view>
      <text v-if="file && (uploadState === 'uploading' || uploadState === 'extracting')" class="progress-label">{{ progressLabel }}</text>

      <button v-if="file && uploadState === 'idle'" class="btn btn-primary" @click="uploadFile">上传并解析</button>
      <view v-if="uploadError" class="error">{{ uploadError }}</view>
    </view>

    <view class="card">
      <text class="kicker">RESUME TEXT</text>
      <text class="label">简历文本（可编辑）</text>
      <textarea class="textarea" v-model="text" placeholder="上传后自动填入，或直接粘贴简历内容" />
      <button class="btn btn-primary" :disabled="saving || !text.trim()" @click="save">
        {{ saving ? '保存中…' : '保存简历' }}
      </button>
      <view v-if="saveError" class="error">{{ saveError }}</view>
      <view v-if="savedOk" class="success">已保存 ✓ 下一步确认简历事实</view>
      <button v-if="savedOk" class="btn" @click="goFacts">去确认简历事实</button>
    </view>
  </view>
</template>

<script>
import api from '../../api/index.js'
function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}
function chooseResumeFile() {
  return new Promise((resolve, reject) => {
    // #ifdef H5
    uni.chooseFile({
      count: 1,
      extension: ['.pdf', '.doc', '.docx'],
      success: (res) => {
        const f = res.tempFiles && res.tempFiles[0]
        if (f) resolve({ path: f.path, name: f.name || 'resume.pdf', size: f.size || 0 })
        else reject(new Error('未选择文件。'))
      },
      fail: () => reject(new Error('未选择文件。'))
    })
    // #endif
    // #ifndef H5
    uni.chooseMessage({
      count: 1,
      extension: ['pdf', 'doc', 'docx'],
      success: (res) => {
        const f = res.tempFiles && res.tempFiles[0]
        if (f) resolve({ path: f.path, name: f.name || 'resume.pdf', size: f.size || 0 })
        else reject(new Error('未选择文件。'))
      },
      fail: () => reject(new Error('未选择文件。'))
    })
    // #endif
  })
}
export default {
  data() {
    return {
      file: null,
      progress: 0,
      uploadState: 'idle', // idle | uploading | extracting
      progressLabel: '',
      uploadError: '',
      text: '',
      saving: false,
      saveError: '',
      savedOk: false
    }
  },
  computed: {
    busyUpload() {
      return this.uploadState === 'uploading' || this.uploadState === 'extracting'
    }
  },
  onLoad() {
    const draft = uni.getStorageSync('resumeDraft')
    if (draft) this.text = draft
    // 已有账号简历则回填
    api.get('/api/resume').then(r => {
      if (r.hasResume && !this.text) this.text = r.text
    }).catch(() => {})
  },
  methods: {
    formatBytes,
    async chooseFile() {
      this.uploadError = ''
      this.savedOk = false
      try {
        const f = await chooseResumeFile()
        this.file = f
        this.progress = 0
        this.uploadState = 'idle'
      } catch (e) {
        this.uploadError = e.message
      }
    },
    async uploadFile() {
      if (!this.file) return
      this.uploadError = ''
      this.uploadState = 'uploading'
      this.progress = 0
      this.progressLabel = '正在上传简历…'
      try {
        const data = await api.upload('/api/extract/resume', this.file.path, 'resume', {
          onProgress: (pct) => {
            this.progress = pct
            if (pct >= 100) {
              this.uploadState = 'extracting'
              this.progressLabel = '正在提取简历文本…'
            } else {
              this.progressLabel = '正在上传简历…'
            }
          }
        })
        this.uploadState = 'extracting'
        this.progressLabel = '正在提取简历文本…'
        this.text = data.text || ''
        this.uploadState = 'idle'
        this.progressLabel = ''
        uni.setStorageSync('resumeDraft', this.text)
        uni.showToast({ title: '解析完成', icon: 'success' })
      } catch (e) {
        this.uploadState = 'idle'
        this.progressLabel = ''
        this.uploadError = e.message
      }
    },
    async save() {
      this.saveError = ''
      this.savedOk = false
      const text = String(this.text || '').trim()
      if (!text) { this.saveError = '简历内容不能为空。'; return }
      this.saving = true
      try {
        await api.put('/api/resume', { text: text })
        uni.setStorageSync('resumeDraft', text)
        this.savedOk = true
        uni.showToast({ title: '已保存', icon: 'success' })
      } catch (e) {
        this.saveError = e.message
      } finally {
        this.saving = false
      }
    },
    goFacts() { uni.navigateTo({ url: '/pages/facts/index' }) }
  }
}
</script>

<style>
.file-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 24rpx;
}
.file-name {
  font-size: 28rpx;
  font-weight: 800;
  margin-right: 16rpx;
}
.file-size {
  font-size: 24rpx;
  color: #4a4a4a;
}
</style>
