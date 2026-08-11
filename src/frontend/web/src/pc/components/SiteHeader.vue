<template>
  <header class="site-header">
    <div class="header-inner">
      <router-link class="brand" to="/" aria-label="岗位镜首页">
        <span class="brand-mark" aria-hidden="true">岗</span><span>岗位镜</span>
      </router-link>
      <span class="quiet">AI 求职分析</span>
      <nav v-if="store.authenticated" class="header-actions" aria-label="账户内容">
        <span class="user-nickname" :title="emailPrefix" :aria-label="`当前登录用户：${emailPrefix}`">{{ displayName }}</span>
        <router-link to="/my-resume">我的简历</router-link>
        <button type="button" class="header-link" @click="openJobAnalysis">岗位分析</button>
        <router-link to="/reports">我的报告</router-link>
        <button id="invite-btn" type="button" class="header-link" @click="inviteDialog.open()">邀请好友</button>
        <button id="logout-btn" type="button" class="header-link" @click="doLogout">退出登录</button>
      </nav>
    </div>
    <InviteDialog ref="inviteDialog" />
  </header>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { store, clearJobDraft, logout, showLoading, hideLoading } from '../store'
import InviteDialog from './InviteDialog.vue'

const router = useRouter()
const inviteDialog = ref(null)

// 退出登录：清理会话与本地草稿后回到登录页
async function doLogout() {
  showLoading('正在退出', '清理登录状态')
  await logout()
  hideLoading()
  router.push('/login')
}

const emailPrefix = computed(() => String(store.user?.email || '').split('@')[0] || '已登录用户')
const displayName = computed(() => {
  const name = emailPrefix.value
  return name.length > 8 ? `${name.slice(0, 8)}...` : name
})

// 页头「岗位分析」始终作为一次全新的分析进入：清空上次岗位草稿，避免读到旧岗位信息。
// 带上时间戳 query，即使已在岗位页点击，也会强制刷新表单回到空白。
function openJobAnalysis() {
  clearJobDraft()
  router.push('/job?fresh=' + Date.now())
}
</script>
