<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <SiteHeader />
  <main id="main-content" tabindex="-1">
    <router-view />
  </main>
  <SiteFooter />
  <AppLoading />
</template>

<script setup>
import { onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import AppLoading from './components/AppLoading.vue'
import { store, refreshSession, hideLoading } from './store'

const router = useRouter()

onMounted(async () => {
  // 首屏：确认账号状态 → 等路由守卫完成初始重定向 → 完成引导 → 收起加载层
  await refreshSession()
  await router.isReady()
  store.booted = true
  await nextTick()
  hideLoading()
})
</script>
