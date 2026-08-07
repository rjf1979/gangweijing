<template>
  <section class="resume-view">
    <div class="resume-toolbar">
      <div><p class="section-kicker">MY_RESUME</p><h1>我的简历</h1></div>
      <div class="resume-actions">
        <router-link class="neo-button neo-button-secondary" to="/resume?mode=replace">更新简历</router-link>
        <button id="print-resume" class="neo-button neo-button-primary" type="button" @click="printPage">打印或保存 PDF</button>
      </div>
    </div>
    <p class="fine">{{ meta }}</p>
    <article class="resume-document"><pre id="resume-document-text">{{ text || '账号中还没有可查看的简历。' }}</pre></article>
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api'
import { showLoading, hideLoading } from '../store'

const text = ref('')
const meta = ref('')

function printPage() {
  window.print()
}

onMounted(async () => {
  showLoading('正在打开我的简历', '读取账号中保存的简历版本')
  try {
    const data = await api.get('/api/resume')
    text.value = data.text || ''
    meta.value = data.hasResume
      ? `最近更新：${new Date(data.updatedAt).toLocaleString('zh-CN')}`
      : ''
  } catch (err) {
    text.value = err.message
  } finally {
    hideLoading()
  }
})
</script>
