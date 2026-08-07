// 岗位镜多端请求封装：统一管理会话 token（兼容 H5 / 微信小程序 / App）
// 后端会话依赖 jm_session cookie；小程序/App 不自动管理 cookie，
// 这里手动存储并在请求头同时带 X-Session-Token 与 Cookie，双保险。
const SESSION_KEY = 'jm_session'

// #ifdef H5
// H5 开发走 vite devServer 代理（见 vite.config.js），生产构建前改为 https://gwj.zhicha.io
const BASE = ''
// #endif
// #ifndef H5
// 小程序/App：开发时若需连本地服务，改成局域网 IP 如 http://192.168.x.x:3215
const BASE = 'https://gwj.zhicha.io'
// #endif

function getSessionToken() {
  try { return uni.getStorageSync(SESSION_KEY) || '' } catch (e) { return '' }
}

function saveSessionToken(token) {
  try {
    if (token) uni.setStorageSync(SESSION_KEY, token)
    else uni.removeStorageSync(SESSION_KEY)
  } catch (e) {}
}

// 从响应中提取 Set-Cookie 里的 jm_session（兼容小程序 res.cookies 与 H5 res.header）
function extractSessionToken(res) {
  try {
    if (res.cookies && res.cookies.length) {
      const c = res.cookies.find(x => String(x).indexOf('jm_session=') >= 0)
      if (c) return String(c).split('jm_session=')[1].split(';')[0]
    }
    const sc = res.header && (res.header['set-cookie'] || res.header['Set-Cookie'])
    if (sc) {
      const m = String(sc).match(/jm_session=([^;]+)/)
      if (m) return m[1]
    }
  } catch (e) {}
  return ''
}

function authHeader() {
  const token = getSessionToken()
  const header = {}
  if (token) {
    header['X-Session-Token'] = token
    header['Cookie'] = 'jm_session=' + token
  }
  return header
}

function request(options) {
  const header = Object.assign({}, options.header || {}, authHeader())
  return new Promise((resolve, reject) => {
    uni.request({
      url: BASE + options.url,
      method: options.method || 'GET',
      data: options.data,
      header: header,
      timeout: options.timeout || 60000,
      success: (res) => {
        const t = extractSessionToken(res)
        if (t) saveSessionToken(t)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          const data = res.data || {}
          const err = new Error(data.error || ('请求失败（' + res.statusCode + '）'))
          err.statusCode = res.statusCode
          err.code = data.code || ''
          if (res.statusCode === 401) saveSessionToken('')
          reject(err)
        }
      },
      fail: () => reject(new Error('网络异常，请检查连接后重试。'))
    })
  })
}

// 上传文件（简历/岗位截图），支持进度回调 onProgress(percent)
function upload(url, filePath, name, options) {
  options = options || {}
  const header = Object.assign({}, options.header || {}, authHeader())
  return new Promise((resolve, reject) => {
    const task = uni.uploadFile({
      url: BASE + url,
      filePath: filePath,
      name: name,
      formData: options.formData || {},
      header: header,
      success: (res) => {
        const t = extractSessionToken(res)
        if (t) saveSessionToken(t)
        let data = {}
        try { data = JSON.parse(res.data || '{}') } catch (e) {}
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data)
        } else {
          reject(new Error(data.error || '上传失败，请重试。'))
        }
      },
      fail: () => reject(new Error('网络异常，请检查连接后重试。'))
    })
    if (typeof options.onProgress === 'function') {
      task.onProgressUpdate((e) => {
        const pct = e.total > 0 ? Math.round(e.loaded / e.total * 100) : 0
        options.onProgress(pct)
      })
    }
  })
}

const api = {
  get: (url, data) => request({ url: url, method: 'GET', data: data }),
  post: (url, data) => request({ url: url, method: 'POST', data: data }),
  put: (url, data) => request({ url: url, method: 'PUT', data: data }),
  upload: upload,
  getSessionToken: getSessionToken,
  saveSessionToken: saveSessionToken
}

export default api
