<template>
  <header class="site-header">
    <div class="header-inner">
      <router-link class="brand" to="/" aria-label="岗位镜首页">
        <span class="brand-mark" aria-hidden="true">岗</span><span>岗位镜</span>
      </router-link>
      <span class="quiet">AI 求职分析</span>
      <nav class="header-actions" aria-label="账户内容">
        <router-link to="/my-resume">我的简历</router-link>
        <router-link to="/reports">我的报告</router-link>
      </nav>
    </div>
  </header>
</template>

<script setup>
// 顶部导航：品牌 + 我的简历 / 我的报告（与第一版 PC 一致）
</script>
