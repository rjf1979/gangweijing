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
    if (window.location.pathname !== '/login') window.location.assign('/admin/login')
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
      if (window.location.pathname !== '/login') window.location.assign('/admin/login')
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

  // ===== 简历模板（多套管理 / 预览 / 编辑 / AI 生成 / 设为默认 / 恢复内置） =====
  async listResumeTemplates() {
    const data = await request('/resume-templates')
    return data.occupations || []
  },
  async getResumeTemplate(id) {
    const data = await request(`/resume-templates/${id}`)
    return data.template
  },
  async getResumeTemplateSample() {
    const data = await request('/resume-templates/sample-data')
    return data.sample || {}
  },
  async saveResumeTemplate(id, { name, description, html }) {
    return request(`/resume-templates/${id}`, { method: 'PUT', body: JSON.stringify({ name, description, html }) })
  },
  async createResumeTemplate({ occupationId, name, description, html }) {
    return request(`/resume-templates`, { method: 'POST', body: JSON.stringify({ occupationId, name, description, html }) })
  },
  async generateResumeTemplate(occupationId, { styleNote } = {}) {
    return request(`/resume-templates/${occupationId}/generate`, { method: 'POST', body: JSON.stringify({ styleNote }) })
  },
  async listGenerateJobs() {
    const data = await request('/resume-templates/generate-jobs')
    return data.jobs || []
  },
  async getGenerateJob(jobId) {
    const data = await request(`/resume-templates/generate-jobs/${jobId}`)
    return data.job
  },
  async cancelGenerateJob(jobId) {
    return request(`/resume-templates/generate-jobs/${jobId}/cancel`, { method: 'POST' })
  },
  async retryGenerateJob(jobId) {
    return request(`/resume-templates/generate-jobs/${jobId}/retry`, { method: 'POST' })
  },
  async clearGenerateJobs() {
    return request('/resume-templates/generate-jobs/clear-history', { method: 'POST' })
  },
  async setDefaultResumeTemplate(id) {
    return request(`/resume-templates/${id}/set-default`, { method: 'POST' })
  },
  async resetResumeTemplate(occupationId) {
    return request(`/resume-templates/${occupationId}/reset`, { method: 'POST' })
  },
  async deleteResumeTemplate(id) {
    return request(`/resume-templates/${id}`, { method: 'DELETE' })
  },
}
