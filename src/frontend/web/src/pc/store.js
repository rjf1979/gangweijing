// 岗位镜 PC 版全局状态：会话、草稿（sessionStorage 与老版同 key 兼容）、页面加载层
import { reactive } from 'vue'
import { api } from './api'

const DRAFT_KEY = 'jobMirrorDraft'

function readDraft() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}') } catch { return {} }
}

export const store = reactive({
  sessionChecked: false,
  authenticated: false,
  user: null,          // { id, email, emailVerified }
  email: '',
  booted: false,       // 首屏初始化是否完成（之后路由切换才显示「正在切换页面」）
  redirectAfterLogin: null,
  guideChecked: false,   // 首次全流程引导状态是否已加载（有报告=已完成全流程）
  hasAnyReport: false,   // 是否已生成过至少一份分析报告
  draft: readDraft(),
  loading: false,
  loadingTitle: '正在加载',
  loadingTip: '请稍候，马上进入正确页面',
  loadingStartedAt: 0,
})

export function saveDraft(patch) {
  store.draft = { ...store.draft, ...patch }
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(store.draft))
}

let hideTimer = null

export function showLoading(title = '正在加载', tip = '请稍候，马上进入正确页面') {
  clearTimeout(hideTimer)
  store.loadingTitle = title
  store.loadingTip = tip
  store.loadingStartedAt = Date.now()
  store.loading = true
}

export function hideLoading() {
  // 「正在切换页面」过渡效果最短停留 0.5 秒（浏览器回退时也不会闪没或卡死）
  const isNav = store.loadingTitle === '正在切换页面'
  const remain = isNav ? 500 - (Date.now() - store.loadingStartedAt) : 0
  clearTimeout(hideTimer)
  if (remain > 0) {
    hideTimer = setTimeout(() => { store.loading = false }, remain)
    return
  }
  store.loading = false
}

let sessionPromise = null

export async function refreshSession() {
  if (sessionPromise) return sessionPromise
  sessionPromise = (async () => {
    try {
      const data = await api.get('/api/session')
      store.authenticated = Boolean(data.authenticated)
      store.user = data.user || null
      store.email = data.user?.email || ''
    } catch {
      store.authenticated = false
      store.user = null
    }
    store.sessionChecked = true
  })().finally(() => { sessionPromise = null })
  return sessionPromise
}

export function clearSession() {
  store.authenticated = false
  store.user = null
  store.email = ''
}

export function maskedEmail(value) {
  const [name, domain = ''] = String(value || '').split('@')
  return name ? `${name.slice(0, 2)}***@${domain}` : ''
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export const STEPS = ['resume', 'facts', 'job', 'report']
export const STEP_LABELS = { resume: '简历', facts: '事实', job: '岗位', report: '报告' }
