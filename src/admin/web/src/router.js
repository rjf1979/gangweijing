import { createRouter, createWebHistory } from 'vue-router'
import { store } from './store'

const routes = [
  { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('./components/AdminLayout.vue'),
    children: [
      { path: '', name: 'dashboard', component: () => import('./views/DashboardView.vue'), meta: { title: '统计概览' } },
      { path: 'users', name: 'users', component: () => import('./views/UsersView.vue'), meta: { title: '用户管理' } },
      { path: 'users/:id', name: 'user-detail', component: () => import('./views/UserDetailView.vue'), meta: { title: '用户详情' } },
      { path: 'reports', name: 'reports', component: () => import('./views/ReportsView.vue'), meta: { title: '报告管理' } },
      { path: 'reports/:id', name: 'report-detail', component: () => import('./views/ReportDetailView.vue'), meta: { title: '报告详情' } },
      { path: 'ai-settings', name: 'ai-settings', component: () => import('./views/AiSettingsView.vue'), meta: { title: 'AI 设置' } },
      { path: 'settings', name: 'settings', component: () => import('./views/SettingsView.vue'), meta: { title: '系统设置' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory('/admin/'),
  routes,
})

router.beforeEach(async (to) => {
  if (to.meta.public) {
    if (store.token) return { path: '/' }
    return true
  }
  if (!store.sessionChecked) {
    try {
      await import('./api').then(({ api }) => api.refreshSession())
    } catch {
      // 网络异常时放行，页面内会提示
    }
  }
  if (!store.token) return { path: '/login', query: { redirect: to.fullPath } }
  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · 岗位镜管理后台` : '岗位镜管理后台'
})

export default router
