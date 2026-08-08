<template>
  <div class="settings">
    <div v-if="loading" class="card settings-loading">
      <div class="skeleton settings-skeleton" role="status"></div>
    </div>

    <div v-else-if="error" class="card empty-state" role="alert">{{ error }}</div>

    <template v-else>
      <!-- 站点设置 -->
      <section class="card">
        <div class="card-head">
          <h2 class="card-title">站点设置</h2>
        </div>
        <form class="card-body settings-form" novalidate @submit.prevent="saveSite">
          <div class="form-grid">
            <div class="field">
              <label class="field-label" for="site-name">站点名称</label>
              <input id="site-name" v-model.trim="form.siteName" class="input" maxlength="60" required />
            </div>
            <div class="field">
              <label class="field-label" for="free-quota">每用户免费分析次数</label>
              <input id="free-quota" v-model.number="form.freeQuota" class="input" type="number" min="0" max="999" required />
              <p class="field-hint">0 表示不限制；当前为预留配置，主服务接入后生效。</p>
            </div>
            <div class="field">
              <span class="field-label" id="reg-label">新用户注册</span>
              <label class="switch" for="reg-toggle">
                <input id="reg-toggle" v-model="form.registrationEnabled" type="checkbox" aria-labelledby="reg-label" />
                <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
                <span class="switch-text">{{ form.registrationEnabled ? '开放注册' : '关闭注册' }}</span>
              </label>
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="announcement">公告内容</label>
            <textarea id="announcement" v-model.trim="form.announcement" class="input" rows="3" maxlength="500" placeholder="展示给用户的公告，可留空"></textarea>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" :disabled="savingSite">{{ savingSite ? '保存中…' : '保存设置' }}</button>
          </div>
        </form>
      </section>

      <!-- 邮件配置（Resend） -->
      <section class="card">
        <div class="card-head">
          <h2 class="card-title">邮件配置（Resend）</h2>
          <span class="badge" :class="settings?.resend_api_key_masked || environment.emailEnvConfigured ? 'badge-success' : 'badge-neutral'">
            {{ settings?.resend_api_key_masked || environment.emailEnvConfigured ? '已配置' : '未配置' }}
          </span>
        </div>
        <form class="card-body settings-form" novalidate @submit.prevent="saveEmailConfig">
          <div class="form-grid">
            <div class="field">
              <label class="field-label" for="email-api-key">Resend API Key</label>
              <input
                id="email-api-key"
                v-model.trim="emailForm.apiKey"
                class="input"
                type="password"
                autocomplete="new-password"
                placeholder="re_…（留空表示不修改）"
              />
              <p class="field-hint">留空表示不修改；已保存的密钥仅以掩码显示，不会回传明文。</p>
            </div>
            <div class="field">
              <label class="field-label" for="email-from">发件人地址</label>
              <input id="email-from" v-model.trim="emailForm.emailFrom" class="input" type="email" placeholder="noreply@example.com" />
              <p class="field-hint">需为 Resend 已验证域名下的地址，保存后即时生效。</p>
            </div>
          </div>
          <div class="field">
            <span class="field-label" id="email-clear-label">清除已保存的 API Key</span>
            <label class="switch" for="email-clear-toggle">
              <input id="email-clear-toggle" v-model="emailForm.clearKey" type="checkbox" aria-labelledby="email-clear-label" />
              <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
              <span class="switch-text">{{ emailForm.clearKey ? '保存后清除' : '保留密钥' }}</span>
            </label>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" :disabled="savingEmail">{{ savingEmail ? '保存中…' : '保存邮件配置' }}</button>
          </div>
        </form>
      </section>

      <section class="grid-2">
        <!-- 环境服务状态 -->
        <article class="card">
          <div class="card-head">
            <h2 class="card-title">服务配置状态</h2>
          </div>
          <div class="card-body env-list">
            <div class="env-row">
              <span class="env-name">邮件密钥（数据库）</span>
              <span class="badge" :class="settings?.resend_api_key_masked ? 'badge-success' : 'badge-neutral'">
                {{ settings?.resend_api_key_masked ? '已配置' : '未配置' }}
              </span>
            </div>
            <div class="env-row">
              <span class="env-name">邮件密钥（环境变量兜底）</span>
              <span class="badge" :class="environment.emailEnvConfigured ? 'badge-success' : 'badge-neutral'">
                {{ environment.emailEnvConfigured ? '已配置' : '未配置' }}
              </span>
            </div>
            <p class="field-hint env-hint">邮件密钥后台保存优先，环境变量作为兜底；密钥仅以掩码展示，保存后即时生效。</p>
          </div>
        </article>

        <!-- 管理员账号 -->
        <article class="card">
          <div class="card-head">
            <h2 class="card-title">管理员账号</h2>
            <button class="btn btn-sm" type="button" @click="addOpen = true">
              <AppIcon name="plus" :size="14" /> 添加
            </button>
          </div>
          <div class="card-body admin-list">
            <div v-for="admin in admins" :key="admin.id" class="admin-row">
              <span class="admin-avatar" aria-hidden="true">{{ emailPrefix(admin.email).charAt(0).toUpperCase() }}</span>
              <div class="admin-info">
                <strong :class="{ current: admin.id === meId }">
                  {{ admin.email }}
                  <span v-if="admin.id === meId" class="current-tag">当前</span>
                </strong>
                <small>登录于 {{ formatDateTime(admin.lastLoginAt) }}</small>
              </div>
              <button
                v-if="admin.id !== meId"
                class="btn btn-ghost btn-sm icon-btn"
                type="button"
                :aria-label="`删除管理员 ${admin.email}`"
                :title="`删除管理员 ${admin.email}`"
                @click="askDeleteAdmin(admin)"
              >
                <AppIcon name="trash" :size="14" />
              </button>
            </div>
          </div>
        </article>
      </section>

      <!-- 修改密码 -->
      <section class="card">
        <div class="card-head">
          <h2 class="card-title">修改当前管理员密码</h2>
        </div>
        <form class="card-body settings-form" novalidate @submit.prevent="changePassword">
          <div class="form-grid">
            <div class="field">
              <label class="field-label" for="old-password">原密码</label>
              <input id="old-password" v-model="passwordForm.oldPassword" class="input" type="password" autocomplete="current-password" required />
            </div>
            <div class="field">
              <label class="field-label" for="new-password">新密码</label>
              <input id="new-password" v-model="passwordForm.newPassword" class="input" type="password" minlength="8" autocomplete="new-password" required />
              <p class="field-hint">至少 8 位。修改成功后需要重新登录。</p>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn" type="submit" :disabled="passwordBusy || !passwordForm.oldPassword || passwordForm.newPassword.length < 8">
              {{ passwordBusy ? '修改中…' : '修改密码' }}
            </button>
          </div>
        </form>
      </section>
    </template>

    <!-- 添加管理员弹窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="addOpen" class="modal-overlay" @click.self="addOpen = false">
          <form class="modal-panel" role="dialog" aria-modal="true" aria-label="添加管理员" @submit.prevent="addAdmin">
            <div class="modal-head">
              <span class="modal-icon is-primary" aria-hidden="true"><AppIcon name="shield" :size="20" /></span>
              <h3>添加管理员</h3>
            </div>
            <div class="modal-body">
              <div class="field">
                <label class="field-label" for="add-email">管理员邮箱</label>
                <input id="add-email" v-model.trim="addForm.email" class="input" type="email" autocomplete="off" required />
              </div>
              <div class="field">
                <label class="field-label" for="add-password">初始密码</label>
                <input id="add-password" v-model="addForm.password" class="input" type="password" minlength="8" autocomplete="new-password" required />
                <p class="field-hint">至少 8 位，首次登录后建议立即修改。</p>
              </div>
              <p v-if="addError" class="field-error" role="alert">{{ addError }}</p>
            </div>
            <div class="modal-foot">
              <button class="btn" type="button" @click="addOpen = false">取消</button>
              <button class="btn btn-primary" type="submit" :disabled="addBusy">{{ addBusy ? '添加中…' : '添加' }}</button>
            </div>
          </form>
        </div>
      </Transition>
    </Teleport>

    <ConfirmDialog
      :open="deleteAdminTarget !== null"
      title="删除管理员"
      :message="deleteAdminTarget ? `将删除管理员「${deleteAdminTarget.email}」。该账号将立即无法登录后台。` : ''"
      confirm-text="确认删除"
      :busy="deletingAdmin"
      @close="deleteAdminTarget = null"
      @confirm="confirmDeleteAdmin"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { api } from '../api'
import { store, toast } from '../store'

const loading = ref(true)
const error = ref('')
const settings = ref(null)
const admins = ref([])
const environment = ref({})
const savingSite = ref(false)
const savingEmail = ref(false)
const passwordBusy = ref(false)
const addOpen = ref(false)
const addBusy = ref(false)
const addError = ref('')
const deleteAdminTarget = ref(null)
const deletingAdmin = ref(false)

const form = reactive({ siteName: '', announcement: '', freeQuota: 3, registrationEnabled: true })
const passwordForm = reactive({ oldPassword: '', newPassword: '' })
const addForm = reactive({ email: '', password: '' })
const emailForm = reactive({ apiKey: '', emailFrom: '', clearKey: false })

const meId = computed(() => store.admin?.id)

function emailPrefix(email) {
  return String(email || '').split('@')[0] || '?'
}
function formatDateTime(value) {
  if (!value) return '从未登录'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await api.get('/settings')
    settings.value = data.settings
    admins.value = data.admins
    environment.value = data.environment
    if (data.settings) {
      form.siteName = data.settings.site_name || ''
      form.announcement = data.settings.announcement || ''
      form.freeQuota = data.settings.free_quota ?? 3
      form.registrationEnabled = Boolean(data.settings.registration_enabled)
    }
    applySettings(data.settings)
  } catch (err) {
    error.value = err.message || '加载设置失败。'
  } finally {
    loading.value = false
  }
}

async function saveSite() {
  savingSite.value = true
  try {
    await api.put('/settings', {
      siteName: form.siteName,
      announcement: form.announcement,
      freeQuota: form.freeQuota,
      registrationEnabled: form.registrationEnabled,
    })
    toast('站点设置已保存', 'success')
    await reloadSettingsState()
  } catch (err) {
    toast(err.message || '保存失败', 'error')
  } finally {
    savingSite.value = false
  }
}

function applySettings(s) {
  if (!s) return
  emailForm.apiKey = ''
  emailForm.emailFrom = s.email_from || ''
  emailForm.clearKey = false
}

async function reloadSettingsState() {
  const data = await api.get('/settings')
  settings.value = data.settings
  environment.value = data.environment
  applySettings(data.settings)
}

async function saveEmailConfig() {
  savingEmail.value = true
  try {
    await api.put('/settings', {
      resendApiKey: emailForm.apiKey,
      emailFrom: emailForm.emailFrom,
      clearResendKey: emailForm.clearKey,
    })
    toast('邮件配置已保存', 'success')
    await reloadSettingsState()
  } catch (err) {
    toast(err.message || '保存失败', 'error')
  } finally {
    savingEmail.value = false
  }
}

async function changePassword() {
  passwordBusy.value = true
  try {
    await api.post('/password', { oldPassword: passwordForm.oldPassword, newPassword: passwordForm.newPassword })
    toast('密码已修改，请重新登录', 'success')
    passwordForm.oldPassword = ''
    passwordForm.newPassword = ''
    setTimeout(() => {
      api.logout().then(() => { window.location.assign('/admin/login') })
    }, 800)
  } catch (err) {
    toast(err.message || '修改失败', 'error')
  } finally {
    passwordBusy.value = false
  }
}

async function addAdmin() {
  addError.value = ''
  addBusy.value = true
  try {
    await api.post('/admins', { email: addForm.email, password: addForm.password })
    toast('管理员已添加', 'success')
    addOpen.value = false
    addForm.email = ''
    addForm.password = ''
    admins.value = (await api.get('/settings')).admins
  } catch (err) {
    addError.value = err.message || '添加失败。'
  } finally {
    addBusy.value = false
  }
}

function askDeleteAdmin(admin) {
  deleteAdminTarget.value = admin
}
async function confirmDeleteAdmin() {
  const target = deleteAdminTarget.value
  if (!target) return
  deletingAdmin.value = true
  try {
    await api.delete(`/admins/${target.id}`)
    toast('管理员已删除', 'success')
    deleteAdminTarget.value = null
    admins.value = admins.value.filter(item => item.id !== target.id)
  } catch (err) {
    toast(err.message || '删除失败', 'error')
    deleteAdminTarget.value = null
  } finally {
    deletingAdmin.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.settings-skeleton {
  height: 240px;
}
.settings-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}
@media (max-width: 860px) {
  .form-grid { grid-template-columns: 1fr; }
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  margin: 0;
}
.form-actions {
  display: flex;
  justify-content: flex-end;
}

.card-head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}
@media (max-width: 980px) {
  .grid-2 { grid-template-columns: 1fr; }
}

/* 开关 */
.switch {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  min-height: 36px;
}
.switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.switch-track {
  position: relative;
  width: 42px;
  height: 24px;
  border-radius: var(--radius-full);
  background: var(--color-surface-3);
  border: 1px solid var(--color-border-strong);
  transition: background var(--motion-base), border-color var(--motion-base);
}
.switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-text-muted);
  transition: transform var(--motion-base), background var(--motion-base);
}
.switch input:checked + .switch-track {
  background: var(--color-primary);
  border-color: var(--color-primary);
}
.switch input:checked + .switch-track .switch-thumb {
  transform: translateX(18px);
  background: #04140a;
}
.switch input:focus-visible + .switch-track {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}
.switch-text {
  font-size: 13.5px;
  color: var(--color-text-secondary);
}

/* 环境状态 */
.env-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.env-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid var(--color-border);
}
.env-row:last-of-type {
  border-bottom: none;
}
.env-name {
  font-size: 13px;
  color: var(--color-text-secondary);
}
.env-value {
  font-size: 13px;
  overflow-wrap: anywhere;
  text-align: right;
}
.env-hint {
  margin-top: 10px;
}

/* 管理员列表 */

.admin-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.admin-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border);
}
.admin-row:last-child {
  border-bottom: none;
}
.admin-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: var(--color-surface-3);
  color: var(--color-primary);
  font-weight: 700;
  flex-shrink: 0;
}
.admin-info {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.admin-info strong {
  font-size: 13.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.admin-info strong.current {
  color: var(--color-primary);
}
.admin-info small {
  color: var(--color-text-muted);
  font-size: 12px;
}
.current-tag {
  margin-left: 6px;
  padding: 0 8px;
  border-radius: var(--radius-full);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 600;
}
.icon-btn {
  padding: 6px;
  min-height: 30px;
}

/* 弹窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(3, 7, 16, 0.66);
  backdrop-filter: blur(2px);
}
.modal-panel {
  width: 100%;
  max-width: 420px;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.modal-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px 0;
}
.modal-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-md);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  flex-shrink: 0;
}
.modal-head h3 {
  font-size: 15.5px;
}
.modal-body {
  padding: 14px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-deep);
}
.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--motion-base);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>

