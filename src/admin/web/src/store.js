import { reactive, readonly } from 'vue'

const TOKEN_KEY = 'jm_admin_token'

export const store = reactive({
  token: localStorage.getItem(TOKEN_KEY) || '',
  admin: null,
  sessionChecked: false,
  toasts: [],
})

let toastId = 0
export function toast(message, type = 'success') {
  const id = ++toastId
  store.toasts.push({ id, message, type })
  setTimeout(() => {
    const index = store.toasts.findIndex(item => item.id === id)
    if (index >= 0) store.toasts.splice(index, 1)
  }, 3200)
}

export function setSession(token, admin) {
  store.token = token
  store.admin = admin
  store.sessionChecked = true
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function clearSession() {
  store.token = ''
  store.admin = null
  store.sessionChecked = true
  localStorage.removeItem(TOKEN_KEY)
}

export { readonly }