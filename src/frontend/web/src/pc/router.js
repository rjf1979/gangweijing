// 岗位镜 PC 版路由：恢复第一版 PC 单页流程（pathname 路由，history 模式）
import { createRouter, createWebHistory } from 'vue-router'
import { api } from './api'
import { store, refreshSession, showLoading, hideLoading } from './store'
import WelcomeView from './views/WelcomeView.vue'
import HomeView from './views/HomeView.vue'
import VerificationView from './views/VerificationView.vue'
import FlowView from './views/FlowView.vue'
import MyResumeView from './views/MyResumeView.vue'
import ReportsView from './views/ReportsView.vue'
import ShareReportView from './views/ShareReportView.vue'

const routes = [
  { path: '/', name: 'home', component: HomeView, meta: { requiresAuth: true } },
  { path: '/login', name: 'welcome', component: WelcomeView, beforeEnter: async () => {
    if (!store.sessionChecked) await refreshSession()
    if (!store.authenticated) return true
    return store.user?.emailVerified ? { path: '/' } : { path: '/verify' }
  } },
  { path: '/verify', name: 'verify-notice', component: VerificationView, props: { mode: 'notice' } },
  { path: '/verify-email/:token', name: 'verify-email', component: VerificationView, props: { mode: 'verify-link' } },
  { path: '/resume', name: 'resume', component: FlowView, props: { step: 'resume' }, meta: { requiresAuth: true } },
  { path: '/facts', name: 'facts', component: FlowView, props: { step: 'facts' }, meta: { requiresAuth: true } },
  { path: '/job', name: 'job', component: FlowView, props: { step: 'job' }, meta: { requiresAuth: true } },
  { path: '/report', name: 'report', component: FlowView, props: { step: 'report' }, meta: { requiresAuth: true } },
  { path: '/my-resume', name: 'my-resume', component: MyResumeView, meta: { requiresAuth: true } },
  { path: '/reports', name: 'reports', component: ReportsView, meta: { requiresAuth: true } },
  { path: '/report/:token', name: 'share-report', component: ShareReportView },
]

const router = createRouter({
  history: createWebHistory('/'),
  routes,
  scrollBehavior() { return { top: 0 } },
})

// 首次全流程引导：仅当「未生成过任何报告」时进入首页才引导（完成过一次全流程后正常进首页）
let guidePromise = null
async function loadGuideState() {
  if (store.guideChecked) return
  if (guidePromise) return guidePromise
  guidePromise = (async () => {
    try {
      const data = await api.get('/api/reports')
      store.hasAnyReport = (data.stats?.reports || 0) > 0
    } catch {
      // 读取失败按「已完成」处理，避免把用户卡在引导循环里
      store.hasAnyReport = true
    }
    store.guideChecked = true
  })().finally(() => { guidePromise = null })
  return guidePromise
}

router.beforeEach(async (to, from) => {
  // 路由切换统一显示「正在切换页面」过渡层（最短 0.5 秒，由 hideLoading 保证）
  if (from.path !== to.path && store.booted) {
    showLoading('正在切换页面', '正在为你准备下一步')
  }
  if (to.meta.requiresAuth && !store.sessionChecked) {
    await refreshSession()
  }
  if (to.meta.requiresAuth && !store.authenticated) {
    store.redirectAfterLogin = to.fullPath
    return { path: '/login' }
  }
  if (to.meta.requiresAuth && store.authenticated && !store.user?.emailVerified) {
    return { path: '/verify' }
  }
  // 首次引导：未完成过一次全流程（尚无任何报告）时，进入首页默认引导走全流程
  if (to.path === '/' && store.authenticated && store.user?.emailVerified) {
    await loadGuideState()
    if (!store.hasAnyReport) {
      return { path: '/resume' }
    }
  }
  return true
})

router.afterEach(() => {
  if (store.booted) hideLoading()
})

export default router
