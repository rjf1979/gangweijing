<template>
  <view class="page">
    <view v-if="noResume" class="card">
      <text class="lead">还没有简历</text>
      <text class="muted">岗位分析需要先有简历内容，请先上传简历。</text>
      <button class="btn btn-primary" @click="goResume">去上传简历</button>
    </view>

    <template v-else>
      <view class="card">
        <text class="kicker">STEP 3 · JOB</text>
        <text class="title">岗位分析</text>
        <text class="muted">上传岗位截图（AI 识别）或粘贴岗位描述，再生成匹配分析报告。</text>

        <view class="tabs">
          <view class="tab" :class="{ active: inputMode === 'paste' }" @click="inputMode = 'paste'">粘贴岗位</view>
          <view class="tab" :class="{ active: inputMode === 'image' }" @click="inputMode = 'image'">截图识别</view>
        </view>

        <view v-if="inputMode === 'paste'">
          <text class="label">岗位描述</text>
          <textarea class="textarea" v-model="jobText" placeholder="粘贴招聘岗位的完整描述（职责、要求、薪资、地点等）" />
        </view>

        <view v-else>
          <button class="btn btn-blue" :disabled="recognizing" @click="chooseImage">
            {{ recognizing ? '识别中…' : '选择岗位截图' }}
          </button>
          <view v-if="imagePath" class="file-meta">
            <text class="tag tag-blue">截图</text>
            <image class="thumb" :src="imagePath" mode="aspectFill" />
          </view>
          <view v-if="warnings.length" class="warn-box">
            <text class="label">识别提示</text>
            <text v-for="(w, i) in warnings" :key="i" class="warn-item">{{ w }}</text>
          </view>
          <text class="label">识别结果（可编辑）</text>
          <textarea class="textarea" v-model="jobText" placeholder="AI 识别结果将显示在这里，请核对补充" />
        </view>

        <view class="row">
          <view class="col">
            <text class="label">公司简称</text>
            <input class="input" v-model="companyShortName" placeholder="可选" />
          </view>
          <view class="col">
            <text class="label">岗位名称</text>
            <input class="input" v-model="jobTitle" placeholder="可选" />
          </view>
        </view>

        <view v-if="errorText" class="error">{{ errorText }}</view>

        <button class="btn btn-primary" :disabled="analyzing || !jobText.trim()" @click="analyze">
          {{ analyzing ? 'AI 分析中…（约 30-60 秒，请勿离开）' : '生成分析报告' }}
        </button>
      </view>
    </template>
  </view>
</template>

<script>
import api from '../../api/index.js'
export default {
  data() {
    return {
      noResume: false,
      inputMode: 'paste',
      jobText: '',
      companyShortName: '',
      jobTitle: '',
      imagePath: '',
      warnings: [],
      recognizing: false,
      analyzing: false,
      errorText: ''
    }
  },
  onLoad() {
    this.loadResume()
  },
  methods: {
    async loadResume() {
      try {
        const r = await api.get('/api/resume')
        if (!r.hasResume) this.noResume = true
      } catch (e) {
        this.noResume = true
      }
    },
    goResume() { uni.reLaunch({ url: '/pages/resume/index' }) },
    chooseImage() {
      this.errorText = ''
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          this.imagePath = res.tempFilePaths && res.tempFilePaths[0]
          this.recognize()
        },
        fail: () => {}
      })
    },
    async recognize() {
      if (!this.imagePath) return
      this.recognizing = true
      this.errorText = ''
      try {
        const data = await api.upload('/api/extract/screenshot', this.imagePath, 'screenshot')
        this.jobText = data.text || ''
        this.companyShortName = data.companyShortName || ''
        this.jobTitle = data.jobTitle || ''
        this.warnings = data.warnings || []
        if (!this.jobText) this.errorText = '未能从截图中识别到内容，请尝试更清晰的图片或改用粘贴。'
      } catch (e) {
        this.errorText = e.message
      } finally {
        this.recognizing = false
      }
    },
    async analyze() {
      this.errorText = ''
      const jobText = String(this.jobText || '').trim()
      if (!jobText) { this.errorText = '请先提供岗位内容。'; return }
      this.analyzing = true
      try {
        const draft = uni.getStorageSync('resumeDraft') || ''
        let resumeText = draft
        if (!resumeText) {
          const r = await api.get('/api/resume')
          resumeText = r.text || ''
        }
        if (!resumeText) { this.errorText = '缺少简历内容，请先上传简历。'; this.analyzing = false; return }
        const data = await api.post('/api/analyze', {
          resumeText: resumeText,
          jobText: jobText,
          jobTitle: this.jobTitle,
          companyShortName: this.companyShortName
        }, { timeout: 180000 })
        uni.setStorageSync('lastReport', data.report || {})
        uni.setStorageSync('lastReportName', data.reportName || '')
        uni.setStorageSync('lastReportUrl', data.reportUrl || '')
        uni.showToast({ title: '报告已生成', icon: 'success' })
        setTimeout(() => {
          const token = (data.reportUrl || '').split('/report/')[1] || ''
          uni.reLaunch({ url: '/pages/report/detail?token=' + token + '&name=' + encodeURIComponent(data.reportName || '') + '&url=' + encodeURIComponent(data.reportUrl || '') })
        }, 600)
      } catch (e) {
        this.errorText = e.message
      } finally {
        this.analyzing = false
      }
    }
  }
}
</script>

<style>
.tabs {
  display: flex;
  margin-top: 24rpx;
  border: 4rpx solid #111111;
  border-radius: 12rpx;
  overflow: hidden;
}
.tab {
  flex: 1;
  text-align: center;
  padding: 20rpx 0;
  font-size: 28rpx;
  font-weight: 800;
  background: #ffffff;
}
.tab.active {
  background: #c7ff3d;
}
.row {
  display: flex;
}
.col {
  flex: 1;
  margin-right: 16rpx;
}
.col:last-child { margin-right: 0; }
.file-meta {
  display: flex;
  align-items: center;
  margin-top: 24rpx;
}
.thumb {
  width: 120rpx;
  height: 120rpx;
  border: 3rpx solid #111111;
  border-radius: 12rpx;
  margin-left: 16rpx;
}
.warn-box {
  margin-top: 24rpx;
  border: 3rpx dashed #111111;
  border-radius: 12rpx;
  padding: 16rpx 24rpx;
  background: #fff8e1;
}
.warn-item {
  display: block;
  font-size: 24rpx;
  color: #7a5b00;
}
</style>
