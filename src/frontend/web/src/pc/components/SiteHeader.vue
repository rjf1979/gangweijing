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
        <router-link to="/job">岗位分析</router-link>
        <router-link to="/reports">我的报告</router-link>
      </nav>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import { store } from '../store'

const emailPrefix = computed(() => String(store.user?.email || '').split('@')[0] || '已登录用户')
const displayName = computed(() => {
  const name = emailPrefix.value
  return name.length > 8 ? `${name.slice(0, 8)}...` : name
})
</script>
