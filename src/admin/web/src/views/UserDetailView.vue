<template>
  <div class="user-detail">
    <div class="page-actions">
      <button class="btn btn-ghost" type="button" @click="$router.push('/users')">
        <AppIcon name="arrow-left" :size="15" /> 返回用户列表
      </button>
    </div>

    <div v-if="loading" class="card detail-loading">
      <div class="skeleton detail-skeleton" role="status"></div>
    </div>

    <div v-else-if="error" class="card empty-state" role="alert">{{ error }}</div>

    <template v-else-if="user">
      <section class="card profile-card">
        <div class="profile-head">
          <span class="profile-avatar" aria-hidden="true">{{ emailPrefix(charAt0).toUpperCase() }}</span>
          <div class="profile-meta">
            <h2 class="profile-email">{{ user.email }}</h2>
            <div class="profile-tags">
              <StatusBadge :value="user.emailVerifiedAt ? 'verified' : 'none'" />
              <span v-if="user.isTest" class="badge badge-warning" title="测试用户">测试用户</span>
              <span class="badge badge-neutral">注册于 {{ formatDate(user.createdAt) }}</span>
            </div>
          </div>
          <div class="profile-actions">
            <button class="btn" type="button" :disabled="busy" @click="toggleTest">
              <AppIcon name="flag" :size="15" /> {{ user.isTest ? '取消测试标记' : '标记为测试用户' }}
            </button>
            <button class="btn btn-danger" type="button" @click="askDelete">
              <AppIcon name="trash" :size="15" /> 删除用户
            </button>
          </div>
        </div>
        <dl class="profile-grid">
          <div class="profile-item">
            <dt>用户 ID</dt>
            <dd class="cell-num">{{ user.id }}</dd>
          </div>
          <div class="profile-item">
            <dt>邮箱验证时间</dt>
            <dd>{{ formatDateTime(user.emailVerifiedAt) }}</dd>
          </div>
          <div class="profile-item">
            <dt>邀请码</dt>
            <dd v-if="user.inviteCode" class="invite-cell">
              <code class="invite-code">{{ user.inviteCode }}</code>
              <button class="btn btn-sm" type="button" @click="copyText(user.inviteCode)">复制</button>
            </dd>
            <dd v-else>—</dd>
          </div>
          <div class="profile-item">
            <dt>邀请链接</dt>
            <dd v-if="user.inviteCode" class="invite-cell">
              <code class="invite-link">{{ inviteLink }}</code>
              <button class="btn btn-sm" type="button" @click="copyText(inviteLink)">复制</button>
            </dd>
            <dd v-else>—</dd>
          </div>
          <div class="profile-item">
            <dt>邀请人</dt>
            <dd>{{ user.invitedByEmail || '—' }}</dd>
          </div>
          <div class="profile-item">
            <dt>邀请人数</dt>
            <dd class="cell-num">{{ user.inviteCount ?? 0 }} 人</dd>
          </div>
          <div class="profile-item">
            <dt>简历更新</dt>
            <dd>{{ formatDateTime(user.resumeUpdatedAt) }}</dd>
          </div>
          <div class="profile-item">
            <dt>验证邮件状态</dt>
            <dd>{{ emailStatusLabel }}</dd>
          </div>
        </dl>
      </section>

      <section class="card">
        <div class="card-head">
          <h2 class="card-title">原始简历文件</h2>
          <span v-if="user.resumeFile" class="badge badge-success">已保留</span>
          <span v-else class="badge badge-neutral">无</span>
        </div>
        <div v-if="user.resumeFile" class="resume-file">
          <div class="resume-file-meta">
            <div class="resume-file-name">{{ user.resumeFile.name }}</div>
            <div class="resume-file-info">
              <span>{{ formatBytes(user.resumeFile.size) }}</span>
              <span>{{ user.resumeFile.mime }}</span>
              <span>上传于 {{ formatDateTime(user.resumeFile.uploadedAt) }}</span>
            </div>
          </div>
          <div class="resume-file-actions">
            <button class="btn btn-sm" type="button" :disabled="fileBusy" @click="previewResumeFile">
              <AppIcon name="eye" :size="13" /> 预览
            </button>
            <button class="btn btn-sm" type="button" :disabled="fileBusy" @click="downloadResumeFile">
              <AppIcon name="external" :size="13" /> 下载
            </button>
            <button class="btn btn-danger btn-sm" type="button" :disabled="fileBusy" @click="askDeleteResumeFile">
              <AppIcon name="trash" :size="13" /> 删除
            </button>
          </div>
        </div>
        <div v-else class="empty-state"><strong>暂无原始文件</strong>该用户尚未上传原始简历文件（可能仅保存了简历文本）</div>
      </section>

      <section class="card">
        <div class="card-head">
          <h2 class="card-title">简历内容</h2>
          <span v-if="user.resumeText" class="badge badge-success">已上传</span>
        </div>
        <div class="card-body">
          <p v-if="!user.resumeText" class="cell-muted resume-empty">该用户尚未上传简历。</p>
          <pre v-else class="resume-text">{{ user.resumeText }}</pre>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <h2 class="card-title">简历结构匹配</h2>
          <span v-if="occupationInfo" class="badge badge-info">职业模板 · {{ occupationInfo.name }}</span>
          <span v-else class="badge badge-neutral">未识别</span>
        </div>
        <div class="card-body">
          <template v-if="occupationInfo">
            <div class="occ-summary">
              <div class="occ-conf">
                <span class="occ-conf-label">匹配置信度</span>
                <span class="occ-conf-value">{{ pct(occupationInfo.confidence) }}</span>
              </div>
              <div v-if="occupationInfo.matchedKeywords.length" class="occ-keywords">
                <span class="occ-kw-label">命中关键词</span>
                <span v-for="k in occupationInfo.matchedKeywords" :key="k.k" class="badge badge-neutral occ-kw">
                  {{ k.k }}<em v-if="k.count > 1">×{{ k.count }}</em>
                </span>
              </div>
            </div>
            <div v-if="structured" class="occ-sections">
              <div class="occ-sections-head">结构化区块对号入座</div>
              <ul class="occ-section-list">
                <li v-for="s in sectionStats" :key="s.key" :class="{ filled: s.filled }">
                  <span class="occ-section-dot" aria-hidden="true"></span>
                  <span class="occ-section-label">{{ s.label }}</span>
                  <span class="occ-section-state">{{ s.filled ? '已填充' : '空' }}</span>
                </li>
              </ul>
            </div>
          </template>
          <p v-else class="cell-muted occ-none">该简历未识别职业模板（旧数据或无足够信号）。</p>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <h2 class="card-title">分析报告</h2>
          <span class="cell-muted">共 {{ reports.length }} 份</span>
        </div>
        <div v-if="reports.length" class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>报告名称</th>
                <th>岗位</th>
                <th>生成时间</th>
                <th>状态</th>
                <th>邮件</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="report in reports" :key="report.id">
                <td>
                  <RouterLink :to="`/reports/${report.id}`">{{ report.reportName || report.jobTitle || '未命名报告' }}</RouterLink>
                </td>
                <td class="cell-secondary">{{ report.jobTitle || '—' }}</td>
                <td class="cell-secondary cell-num">{{ formatDateTime(report.createdAt) }}</td>
                <td><StatusBadge :value="report.status" /></td>
                <td><StatusBadge :value="report.emailStatus" /></td>
                <td>
                  <button class="btn btn-danger btn-sm" type="button" @click="askDeleteReport(report)">
                    <AppIcon name="trash" :size="13" /> 删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="empty-state"><strong>暂无报告</strong>该用户还没有分析报告</div>
      </section>
    </template>

    <ConfirmDialog
      :open="deleteUserOpen"
      title="删除用户"
      :message="user ? `将永久删除用户「${user.email}」。\n其登录会话将全部失效，名下报告将保留但解除关联。此操作不可撤销。` : ''"
      confirm-text="确认删除"
      :busy="busy"
      @close="deleteUserOpen = false"
      @confirm="confirmDeleteUser"
    />
    <ConfirmDialog
      :open="deleteReportTarget !== null"
      title="删除报告"
      :message="deleteReportTarget ? `将标记报告「${deleteReportTarget.reportName || deleteReportTarget.jobTitle || '未命名报告'}」为已删除。\n用户端将不再展示，数据保留在数据库中（可恢复）。` : ''"
      confirm-text="确认删除"
      :busy="busy"
      @close="deleteReportTarget = null"
      @confirm="confirmDeleteReport"
    />
    <ConfirmDialog
      :open="deleteResumeFileOpen"
      title="删除原始简历文件"
      :message="user && user.resumeFile ? `将永久删除用户「${user.email}」上传的原始简历文件「${user.resumeFile.name}」。\n已提取的简历文本会保留，此操作不可撤销。` : ''"
      confirm-text="确认删除"
      :busy="busy"
      @close="deleteResumeFileOpen = false"
      @confirm="confirmDeleteResumeFile"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import StatusBadge from '../components/StatusBadge.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { api } from '../api'
import { toast } from '../store'

const route = useRoute()
const router = useRouter()
const userId = computed(() => String(route.params.id))

const loading = ref(true)
const error = ref('')
const user = ref(null)
const reports = ref([])
const deleteUserOpen = ref(false)
const deleteReportTarget = ref(null)
const deleteResumeFileOpen = ref(false)
const fileBusy = ref(false)
const busy = ref(false)

const structured = computed(() => user.value?.resumeStructured || null)
const occupationInfo = computed(() => {
  const occ = structured.value?.occupation
  if (!occ || !occ.id) return null
  return {
    id: String(occ.id),
    name: occ.name || String(occ.id),
    confidence: typeof occ.confidence === 'number' ? occ.confidence : 0,
    matchedKeywords: Array.isArray(occ.matchedKeywords) ? occ.matchedKeywords.filter(k => k && typeof k === 'object' && k.k) : [],
  }
})
function pct(v) {
  return Math.round((Number(v) || 0) * 100) + '%'
}
const SECTION_LABELS = [
  { key: 'job_intention', label: '求职意向' },
  { key: 'summary', label: '个人摘要' },
  { key: 'education', label: '教育经历' },
  { key: 'work_experience', label: '工作经历' },
  { key: 'project_experience', label: '项目经历' },
  { key: 'skills', label: '技能特长' },
  { key: 'certificates', label: '证书资质' },
  { key: 'awards', label: '获奖荣誉' },
  { key: 'self_evaluation', label: '自我评价' },
  { key: 'training', label: '培训经历' },
  { key: 'languages', label: '语言能力' },
  { key: 'volunteer', label: '志愿者经历' },
  { key: 'social', label: '社团活动' },
  { key: 'publications', label: '发表论文' },
  { key: 'patents', label: '专利' },
  { key: 'portfolio', label: '个人作品' },
  { key: 'open_source', label: '开源项目' },
  { key: 'interests', label: '兴趣爱好' },
  { key: 'references', label: '推荐人' },
]
const sectionStats = computed(() => {
  const s = structured.value || {}
  const count = v => Array.isArray(v) ? v.length : (typeof v === 'string' && String(v).trim() ? 1 : 0)
  const skillCount = sk => sk && typeof sk === 'object' ? ['technical', 'tools', 'soft', 'languages'].reduce((n, k) => n + (Array.isArray(sk[k]) ? sk[k].length : 0), 0) : 0
  return SECTION_LABELS.map(({ key, label }) => ({
    key, label,
    filled: key === 'skills' ? skillCount(s.skills) > 0 : count(s[key]) > 0,
  }))
})

const charAt0 = computed(() => String(user.value?.email || '?').charAt(0))
const inviteLink = computed(() => {
  const code = user.value?.inviteCode
  return code ? window.location.origin + '/login?invite=' + encodeURIComponent(code) : ''
})
function copyText(text) {
  if (!text) return
  navigator.clipboard?.writeText(text).then(() => toast('已复制', 'success')).catch(() => toast('复制失败', 'error'))
}
async function toggleTest() {
  const target = user.value
  if (!target) return
  busy.value = true
  try {
    const next = !target.isTest
    const data = await api.patch(`/users/${userId.value}`, { isTest: next })
    target.isTest = data.isTest
    toast(next ? '已标记为测试用户' : '已取消测试标记', 'success')
  } catch (err) {
    toast(err.message || '操作失败', 'error')
  } finally {
    busy.value = false
  }
}
const emailStatusLabel = computed(() => {
  const map = { none: '未发送', sent: '已发送', failed: '发送失败', verified: '已验证' }
  return map[user.value?.verificationEmailStatus] || user.value?.verificationEmailStatus || '—'
})

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}
function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await api.get(`/users/${userId.value}`)
    user.value = data.user
    reports.value = data.reports
  } catch (err) {
    error.value = err.message || '加载用户详情失败。'
  } finally {
    loading.value = false
  }
}

function askDelete() {
  deleteUserOpen.value = true
}
async function confirmDeleteUser() {
  busy.value = true
  try {
    await api.delete(`/users/${userId.value}`)
    toast('用户已删除', 'success')
    router.replace('/users')
  } catch (err) {
    toast(err.message || '删除失败', 'error')
    deleteUserOpen.value = false
  } finally {
    busy.value = false
  }
}
function askDeleteReport(report) {
  deleteReportTarget.value = report
}
async function confirmDeleteReport() {
  const target = deleteReportTarget.value
  if (!target) return
  busy.value = true
  try {
    await api.delete(`/reports/${target.id}`)
    toast('报告已标记删除', 'success')
    deleteReportTarget.value = null
    reports.value = reports.value.filter(item => item.id !== target.id)
  } catch (err) {
    toast(err.message || '删除失败', 'error')
    deleteReportTarget.value = null
  } finally {
    busy.value = false
  }
}
function askDeleteResumeFile() {
  deleteResumeFileOpen.value = true
}
async function confirmDeleteResumeFile() {
  busy.value = true
  try {
    await api.delete(`/users/${userId.value}/resume-file`)
    user.value.resumeFile = null
    toast('原始简历文件已删除', 'success')
    deleteResumeFileOpen.value = false
  } catch (err) {
    toast(err.message || '删除失败', 'error')
    deleteResumeFileOpen.value = false
  } finally {
    busy.value = false
  }
}
async function previewResumeFile() {
  if (!user.value?.resumeFile) return
  fileBusy.value = true
  try {
    await api.openResumeFile(userId.value, { download: false })
  } catch (err) {
    toast(err.message || '打开失败', 'error')
  } finally {
    fileBusy.value = false
  }
}
async function downloadResumeFile() {
  if (!user.value?.resumeFile) return
  fileBusy.value = true
  try {
    await api.openResumeFile(userId.value, { download: true, filename: user.value.resumeFile.name })
  } catch (err) {
    toast(err.message || '下载失败', 'error')
  } finally {
    fileBusy.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.user-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-actions {
  display: flex;
}
.detail-skeleton {
  height: 180px;
}
.profile-card {
  padding: 22px 24px;
}
.profile-head {
  display: flex;
  align-items: center;
  gap: 16px;
}
.profile-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--color-surface-3), var(--color-border));
  color: var(--color-primary);
  font-size: 22px;
  font-weight: 700;
  flex-shrink: 0;
}
.profile-meta {
  min-width: 0;
  flex: 1;
}
.profile-email {
  font-size: 18px;
  margin-bottom: 6px;
  overflow-wrap: anywhere;
}
.profile-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.invite-cell { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.invite-code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 700; letter-spacing: 0.5px; }
.invite-link { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; word-break: break-all; }
.profile-actions {
  flex-shrink: 0;
}
.profile-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin: 20px 0 0;
  padding-top: 18px;
  border-top: 1px solid var(--color-border);
}
.profile-item dt {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 4px;
}
.profile-item dd {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
  overflow-wrap: anywhere;
}
@media (max-width: 980px) {
  .profile-grid { grid-template-columns: repeat(2, 1fr); }
}
.occ-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 20px;
  margin-bottom: 16px;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
}
.occ-conf { display: inline-flex; align-items: baseline; gap: 8px; }
.occ-conf-label { font-size: 12px; color: var(--color-text-muted); }
.occ-conf-value { font-size: 20px; font-weight: 800; color: var(--color-primary); font-variant-numeric: tabular-nums; }
.occ-keywords { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.occ-kw-label { font-size: 12px; color: var(--color-text-muted); }
.occ-kw em { font-style: normal; opacity: .7; margin-left: 2px; }
.occ-sections { border-top: 1px solid var(--color-border); padding-top: 12px; }
.occ-sections-head { font-size: 12px; font-weight: 700; color: var(--color-text-muted); margin-bottom: 8px; }
.occ-section-list { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 18px; margin: 0; padding: 0; list-style: none; }
.occ-section-list li { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-text-secondary); }
.occ-section-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-border); flex-shrink: 0; }
.occ-section-list li.filled .occ-section-dot { background: var(--color-success); }
.occ-section-list li.filled .occ-section-label { color: var(--color-text); font-weight: 600; }
.occ-section-state { margin-left: auto; font-size: 11px; color: var(--color-text-muted); }
.occ-section-list li.filled .occ-section-state { color: var(--color-success); }
.occ-none { margin: 0; }
@media (max-width: 760px) {
  .occ-section-list { grid-template-columns: repeat(2, 1fr); }
}

.resume-empty {
  margin: 0;
}
.resume-text {
  margin: 0;
  max-height: 420px;
  overflow: auto;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-deep);
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
.resume-file {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.resume-file-meta {
  min-width: 0;
  flex: 1;
}
.resume-file-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  overflow-wrap: anywhere;
  margin-bottom: 6px;
}
.resume-file-info {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--color-text-muted);
}
.resume-file-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
</style>