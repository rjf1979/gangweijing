<template>
  <div class="admin-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">镜</span>
        <div class="brand-text">
          <strong>岗位镜</strong>
          <small>管理后台</small>
        </div>
      </div>

      <nav class="nav" aria-label="主导航">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" class="nav-item" :class="{ active: isActive(item) }">
          <AppIcon :name="item.icon" :size="18" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar-foot">
        <div class="admin-chip">
          <span class="admin-avatar" aria-hidden="true">{{ avatarChar }}</span>
          <div class="admin-meta">
            <strong :title="adminEmail">{{ adminEmail }}</strong>
            <small>管理员</small>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm logout-btn" type="button" @click="onLogout">
          <AppIcon name="logout" :size="15" />
          退出登录
        </button>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <h1 class="page-title">{{ pageTitle }}</h1>
        <div class="topbar-right">
          <span class="env-dot" :title="envTitle" aria-hidden="true"></span>
          <span class="env-label">{{ envLabel }}</span>
        </div>
      </header>
      <main class="content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { api } from '../api'
import { store } from '../store'

const route = useRoute()
const router = useRouter()

const navItems = [
  { to: '/', label: '统计概览', icon: 'dashboard' },
  { to: '/users', label: '用户管理', icon: 'users' },
  { to: '/reports', label: '报告管理', icon: 'file-text' },
  { to: '/resume-templates', label: '简历模板', icon: 'file-text' },
  { to: '/resume-structure', label: '简历结构', icon: 'layers' },
  { to: '/ai-settings', label: 'AI 设置', icon: 'spark' },
  { to: '/settings', label: '系统设置', icon: 'settings' },
]

const pageTitle = computed(() => route.meta.title || '管理后台')
const adminEmail = computed(() => store.admin?.email?.split('@')[0] || 'admin')
const avatarChar = computed(() => String(adminEmail.value || 'A').charAt(0).toUpperCase())
const envLabel = computed(() => (import.meta.env.DEV ? '开发环境' : '生产环境'))
const envTitle = computed(() => `当前为${envLabel.value}，管理接口地址 /api/admin`)

function isActive(item) {
  if (item.to === '/') return route.path === '/'
  return route.path.startsWith(item.to)
}

async function onLogout() {
  await api.logout()
  router.replace('/login')
}
</script>

<style scoped>
.admin-shell {
  display: flex;
  min-height: 100vh;
}

/* ===== 侧边栏 ===== */
.sidebar {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  width: var(--sidebar-width);
  height: 100vh;
  flex-shrink: 0;
  background: var(--color-bg-deep);
  border-right: 1px solid var(--color-border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 20px 16px;
}
.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--color-primary), #0ea5e9);
  color: #04140a;
  font-weight: 700;
  font-size: 18px;
  box-shadow: var(--shadow-primary);
}
.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.brand-text strong {
  font-size: 15.5px;
  letter-spacing: 0.02em;
}
.brand-text small {
  color: var(--color-text-muted);
  font-size: 11.5px;
  letter-spacing: 0.12em;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  flex: 1;
  overflow-y: auto;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 13.5px;
  font-weight: 500;
  transition: background var(--motion-fast), color var(--motion-fast);
}
.nav-item:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}
.nav-item.active {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 600;
}
.nav-item.active::before {
  content: "";
  position: absolute;
}

.sidebar-foot {
  padding: 14px 16px;
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.admin-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.admin-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: var(--color-surface-3);
  color: var(--color-primary);
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}
.admin-meta {
  min-width: 0;
  line-height: 1.3;
}
.admin-meta strong {
  display: block;
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.admin-meta small {
  color: var(--color-text-muted);
  font-size: 11px;
}
.logout-btn {
  width: 100%;
}

/* ===== 主区域 ===== */
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--topbar-height);
  padding: 0 28px;
  background: rgba(11, 17, 32, 0.86);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--color-border);
}
.page-title {
  font-size: 17px;
  font-weight: 600;
}
.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-muted);
  font-size: 12px;
}
.env-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.6);
}
.content {
  flex: 1;
  padding: 24px 28px 48px;
  max-width: var(--content-max);
  width: 100%;
  margin: 0 auto;
}

@media (max-width: 860px) {
  .sidebar {
    width: 72px;
  }
  .brand-text,
  .nav-item span,
  .admin-meta,
  .logout-btn span {
    display: none;
  }
  .brand {
    justify-content: center;
    padding: 20px 8px 16px;
  }
  .nav-item {
    justify-content: center;
  }
  .sidebar-foot {
    align-items: center;
  }
  .logout-btn {
    width: auto;
  }
}
</style>
