// 岗位镜 PC 版路由：恢复第一版 PC 单页流程（pathname 路由，history 模式）
import { createRouter, createWebHistory } from 'vue-router'
import { store, refreshSession, showLoading, hideLoading } from './store'
import WelcomeView from './views/WelcomeView.vue'
import VerificationView from './views/VerificationView.vue'
import FlowView from './views/FlowView.vue'
import MyResumeView from './views/MyResumeView.vue'
import ReportsView from './views/ReportsView.vue'
import ShareReportView from './views/ShareReportView.vue'

const routes = [
  { path: '/', name: 'welcome', component: WelcomeView },
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
    return { path: '/' }
  }
  if (to.meta.requiresAuth && store.authenticated && !store.user?.emailVerified) {
    return { path: '/verify' }
  }
  return true
})

router.afterEach(() => {
  if (store.booted) hideLoading()
})

export default router
