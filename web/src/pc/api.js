// 岗位镜 PC 版请求封装：同源 fetch（自动携带 HttpOnly 会话 Cookie），上传用 XHR 支持进度
async function request(url, options = {}) {
  const headers = { ...(options.headers || {}) }
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error || `请求失败（${response.status}）`)
    error.statusCode = response.status
    error.code = data.code || ''
    throw error
  }
  return data
}

function upload(url, field, file, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append(field, file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    if (typeof onProgress === 'function') {
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return
        onProgress(Math.round(event.loaded / event.total * 100))
      }
    }
    xhr.onload = () => {
      let data = {}
      try { data = JSON.parse(xhr.responseText) } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else reject(new Error(data.error || '上传失败，请重试。'))
    }
    xhr.onerror = () => reject(new Error('网络异常，请检查连接后重试。'))
    xhr.send(form)
  })
}

export const api = {
  get: (url) => request(url),
  post: (url, body) => request(url, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  put: (url, body) => request(url, { method: 'PUT', body: JSON.stringify(body) }),
  uploadResume: (file, onProgress) => upload('/api/extract/resume', 'resume', file, onProgress),
  uploadScreenshot: (file) => upload('/api/extract/screenshot', 'screenshot', file),
}
