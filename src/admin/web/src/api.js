import { store, setSession, clearSession } from './store'

const API_BASE = '/api/admin'

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (store.token) headers.Authorization = `Bearer ${store.token}`

  let response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  } catch (error) {
    throw new ApiError('网络连接失败，请检查服务是否可用。', 0)
  }

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (response.status === 401) {
    clearSession()
    if (window.location.pathname !== '/login') window.location.assign('/login')
    throw new ApiError(data?.error || '登录已过期，请重新登录。', 401)
  }

  if (!response.ok) {
    throw new ApiError(data?.error || `请求失败（${response.status}）`, response.status)
  }
  return data
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body || {}) }),
  delete: (path) => request(path, { method: 'DELETE' }),

  async login(email, password) {
    const data = await request('/login', { method: 'POST', body: JSON.stringify({ email, password }) })
    setSession(data.token, data.admin)
    return data.admin
  },
  async logout() {
    try {
      await request('/logout', { method: 'POST' })
    } catch {
      // 忽略退出时的网络错误
    }
    clearSession()
  },
  async refreshSession() {
    if (!store.token) {
      store.sessionChecked = true
      return null
    }
    try {
      const data = await request('/me')
      store.admin = data.admin
      return data.admin
    } catch (error) {
      if (error.status === 401) return null
      throw error
    } finally {
      store.sessionChecked = true
    }
  },

  // 打开/下载用户原始简历文件（预览用 blob 新窗口，下载用 a[download]）
  async openResumeFile(userId, { download = false, filename = 'resume' } = {}) {
    const headers = {}
    if (store.token) headers.Authorization = `Bearer ${store.token}`
    let response
    try {
      response = await fetch(`${API_BASE}/users/${userId}/resume-file${download ? '?download=1' : ''}`, { headers })
    } catch (error) {
      throw new ApiError('网络连接失败，请检查服务是否可用。', 0)
    }
    if (response.status === 401) {
      clearSession()
      if (window.location.pathname !== '/login') window.location.assign('/login')
      throw new ApiError('登录已过期，请重新登录。', 401)
    }
    if (!response.ok) {
      let data = null
      try { data = await response.json() } catch {}
      throw new ApiError(data?.error || `请求失败（${response.status}）`, response.status)
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    if (download) {
      const a = document.createElement('a')
      a.href = url
      a.download = filename || 'resume'
      document.body.appendChild(a)
      a.click()
      a.remove()
    } else {
      window.open(url, '_blank')
    }
    setTimeout(() => URL.revokeObjectURL(url), 120000)
  },
}