<template>
  <div class="resume-templates">
    <header class="tpl-filter-header card" aria-label="职位筛选">
      <span class="filter-label">职位筛选</span>
      <div class="filter-chips">
        <button type="button" class="filter-chip" :class="{ active: !filterOccId }" @click="selectOccupationFilter('')">全部</button>
        <button
          v-for="occ in occupations"
          :key="occ.occupationId"
          type="button"
          class="filter-chip"
          :class="{ active: filterOccId === occ.occupationId }"
          @click="selectOccupationFilter(occ.occupationId)"
        >{{ occ.name }}</button>
      </div>
    </header>
    <div class="tpl-layout">
      <!-- 左：职业分组模板列表 -->
      <aside class="tpl-list card" aria-label="职业模板列表">
        <div class="list-head">
          <div class="list-head-row">
            <h2 class="card-title">职业模板</h2>
            <span class="list-count">{{ flatTemplates.length }} 套</span>
          </div>
          <button class="btn btn-primary btn-sm create-tpl-btn" type="button" @click="openCreate">
            <AppIcon name="plus" :size="15" />
            新增模板
          </button>
        </div>
        <p class="list-hint">每个职业可有多套排版：内置 1 套 + AI 生成多套。选中任意一套可预览 / 编辑；「设为默认」决定该职业实际使用哪套。</p>
        <div class="occ-groups">
          <div v-for="occ in filteredOccupations" :key="occ.occupationId" class="occ-group">
            <div class="occ-head">
              <span class="occ-name">{{ occ.name }}</span>
              <span class="occ-count">{{ occ.templates.length }} 套</span>
            </div>
            <div class="occ-tpls">
              <button
                v-for="tpl in occ.templates"
                :key="tpl.id"
                type="button"
                class="tpl-item"
                :class="{ active: tpl.id === activeId }"
                @click="selectTemplate(tpl.id)"
              >
                <span class="tpl-name-row">
                  <span class="tpl-name">{{ tpl.name }}</span>
                  <span v-if="tpl.isDefault" class="default-badge">默认</span>
                </span>
                <span class="tpl-meta">
                  <span class="source-badge" :class="'source-' + tpl.source">{{ sourceLabel(tpl.source) }}</span>
                  <span class="tpl-size">{{ kb(tpl.htmlLength) }}</span>
                </span>
              </button>
              <p v-if="!occ.templates.length" class="occ-empty">暂无模板</p>
            </div>
          </div>
        </div>
        <p v-if="!occupations.length" class="list-empty">暂无模板，请确认服务端已放置内置模板文件。</p>
      </aside>

      <!-- 右：详情 -->
      <section class="tpl-main" aria-label="模板详情">
        <div v-if="!current" class="card empty-tip">
          <p>从左侧选择一套模板开始预览 / 编辑。</p>
        </div>

        <template v-else>
          <div class="card tpl-toolbar">
            <div class="tpl-title-group">
              <h2 class="card-title">{{ current.name }}</h2>
              <span v-if="current.isDefault" class="default-badge">默认</span>
              <span class="source-badge" :class="'source-' + current.source">{{ sourceLabel(current.source) }}</span>
              <span class="updated-at" :title="current.updatedAt">更新于 {{ formatTime(current.updatedAt) }}</span>
            </div>
            <div class="toolbar-actions">
              <button v-if="!current.isDefault" class="btn btn-ghost btn-sm" type="button" :disabled="busy" @click="setDefaultTemplate">
                <AppIcon name="check" :size="15" />
                设为默认
              </button>
              <button class="btn btn-ghost btn-sm" type="button" :disabled="busy" @click="toggleMode">
                <AppIcon :name="mode === 'preview' ? 'edit' : 'eye'" :size="15" />
                {{ mode === 'preview' ? '编辑 HTML' : '返回预览' }}
              </button>
              <button class="btn btn-ghost btn-sm" type="button" :disabled="busy || generating" @click="openGenerate">
                <AppIcon name="spark" :size="15" />
                AI 生成新排版
              </button>
              <button class="btn btn-primary btn-sm" type="button" :disabled="busy || !dirty" @click="saveDraft">
                <AppIcon name="check" :size="15" />
                保存
              </button>
              <button v-if="occHasBuiltin" class="btn btn-ghost btn-sm" type="button" :disabled="busy" @click="resetTemplate">
                <AppIcon name="layers" :size="15" />
                恢复内置
              </button>
              <button class="btn btn-ghost btn-sm btn-danger-text" type="button" :disabled="busy" @click="removeTemplate">
                <AppIcon name="trash" :size="15" />
                删除
              </button>
            </div>
          </div>

          <!-- AI 生成新排版面板 -->
          <div v-if="generateOpen" class="card regen-panel">
            <div class="regen-row">
              <label class="field regen-field" for="style-note">
                <span class="field-label">风格要求（可选）</span>
                <input
                  id="style-note"
                  v-model.trim="styleNote"
                  class="input"
                  type="text"
                  maxlength="300"
                  placeholder="例如：深蓝商务风、金色点缀、突出业绩数字…"
                />
              </label>
              <div class="regen-actions">
                <button class="btn btn-primary btn-sm" type="button" :disabled="generating" @click="generateNew">
                  <AppIcon name="spark" :size="15" />
                  {{ generating ? '提交中…' : '开始生成' }}
                </button>
                <button class="btn btn-ghost btn-sm" type="button" :disabled="generating" @click="generateOpen = false">取消</button>
              </div>
            </div>
            <p v-if="regenError" class="regen-error">{{ regenError }}</p>
            <p class="regen-hint">使用「AI 设置」中的默认文本模型与 Key 生成一套全新排版（不覆盖现有模板）；结果使用占位符渲染，不包含真实数据。提交后任务在后台排队执行，关闭本面板不影响生成；连续点击多次会依次排队，每套都会生成。</p>
          </div>

          <!-- 编辑面板 -->
          <div v-if="mode === 'edit'" class="card edit-panel">
            <div class="edit-fields">
              <label class="field">
                <span class="field-label">模板名称</span>
                <input v-model="draftName" class="input" type="text" maxlength="120" />
              </label>
              <label class="field">
                <span class="field-label">模板描述</span>
                <input v-model="draftDescription" class="input" type="text" maxlength="500" />
              </label>
            </div>
            <div class="edit-actions">
              <button class="btn btn-primary btn-sm" type="button" :disabled="busy" @click="saveDraft">保存模板</button>
              <button class="btn btn-ghost btn-sm" type="button" @click="applyDraft">应用并预览</button>
              <span v-if="editHint" class="edit-hint" :class="{ error: editError }">{{ editHint }}</span>
            </div>
            <textarea
              v-model="draftHtml"
              class="html-editor"
              spellcheck="false"
              :disabled="busy"
              aria-label="模板 HTML 源码"
            />
            <p class="regen-hint">{{ placeholderHint }}</p>
          </div>

          <!-- 预览 -->
          <div v-else class="card preview-card">
            <div class="preview-toolbar">
              <div class="zoom-controls" aria-label="预览缩放">
                <button class="btn btn-ghost btn-sm btn-zoom" type="button" @click="zoomOut" :disabled="zoom <= 0.4" aria-label="缩小">−</button>
                <span class="zoom-label">{{ Math.round(zoom * 100) }}%</span>
                <button class="btn btn-ghost btn-sm btn-zoom" type="button" @click="zoomIn" :disabled="zoom >= 1.5" aria-label="放大">＋</button>
                <button class="btn btn-ghost btn-sm btn-zoom" type="button" @click="zoom = 0.8">适应</button>
              </div>
              <div class="preview-msg">
                <span v-if="genJobs.length" class="busy-tip"><AppIcon name="activity" :size="14" />AI 生成后台执行中（{{ genJobs.length }} 个）：{{ genJobsText }}；关闭面板/弹窗不影响，完成后自动刷新列表</span>
                <span v-else-if="regenNote" class="regen-note">{{ regenNote }}</span>
                <span v-else-if="genError" class="regen-error">{{ genError }}</span>
                <span v-else-if="editHint" class="edit-hint" :class="{ error: editError }">{{ editHint }}</span>
                <span v-else class="preview-src">来源：{{ sourceLabel(current.source) }}</span>
              </div>
            </div>
            <div class="preview-scroll">
              <div class="preview-stage" :style="{ width: 794 * zoom + 'px', height: 1123 * zoom + 'px' }">
                <iframe
                  :srcdoc="previewHtml"
                  :style="{ width: '794px', height: '1123px', transform: 'scale(' + zoom + ')', transformOrigin: 'top left' }"
                  sandbox=""
                  title="简历模板 A4 预览"
                />
              </div>
            </div>
          </div>
        </template>
      </section>
    </div>
  <!-- ===== 新增模板弹窗 ===== -->
  <div v-if="createOpen" class="modal-mask" @click.self="closeCreate">
    <div class="modal create-modal" role="dialog" aria-modal="true" aria-label="新增简历模板">
      <div class="modal-head">
        <h3>新增简历模板</h3>
        <button class="icon-btn" type="button" aria-label="关闭" @click="closeCreate">
          <AppIcon name="x" :size="18" />
        </button>
      </div>
      <div class="modal-body">
        <div class="create-fields">
          <label class="field" for="create-occ">
            <span class="field-label">选择职业 <b class="req">*</b></span>
            <select id="create-occ" v-model="createOccupationId" class="input select-input">
              <option v-for="occ in occupations" :key="occ.occupationId" :value="occ.occupationId">{{ occ.name }}</option>
            </select>
          </label>
          <label class="field" for="create-name">
            <span class="field-label">模板名称（可选）</span>
            <input id="create-name" v-model.trim="createName" class="input" type="text" maxlength="120" placeholder="留空自动命名" />
          </label>
        </div>

        <div class="create-mode-tabs" role="tablist" aria-label="创建方式">
          <button type="button" role="tab" :aria-selected="createMode === 'ai'" :class="{ active: createMode === 'ai' }" @click="switchCreateMode('ai')">
            <AppIcon name="spark" :size="14" /> AI 生成
          </button>
          <button type="button" role="tab" :aria-selected="createMode === 'html'" :class="{ active: createMode === 'html' }" @click="switchCreateMode('html')">
            <AppIcon name="edit" :size="14" /> 粘贴 HTML
          </button>
        </div>

        <div v-if="createMode === 'ai'" class="create-pane">
          <p class="pane-hint">由 AI 按所选职业生成一套全新排版，不覆盖现有模板；提交后任务在后台排队执行，关闭弹窗不影响生成，连续提交多次会依次排队，完成后自动刷新列表，可在编辑器中继续修改。</p>
          <label class="field" for="create-style">
            <span class="field-label">风格要求（可选）</span>
            <input id="create-style" v-model.trim="createStyleNote" class="input" type="text" maxlength="300" placeholder="例如：深蓝商务风、金色点缀、突出业绩数字…" />
          </label>
          <p v-if="createError" class="create-error">{{ createError }}</p>
          <div class="pane-actions">
            <button class="btn btn-primary" type="button" :disabled="creating || !createOccupationId" @click="createByAi">
              <AppIcon name="spark" :size="15" />
              {{ creating ? '提交中…' : 'AI 生成' }}
            </button>
          </div>
        </div>

        <div v-else class="create-pane">
          <p class="pane-hint">粘贴一套完整 HTML（内联样式、A4 + 打印优化、占位符语法、禁止外部资源与示例数据）。</p>
          <textarea v-model="createHtml" class="html-editor create-editor" spellcheck="false" placeholder="<html>…</html>"></textarea>
          <div class="pane-tools">
            <button class="btn btn-ghost btn-sm" type="button" @click="toggleCreatePreview">
              <AppIcon :name="createPreviewing ? 'edit' : 'eye'" :size="14" />
              {{ createPreviewing ? '返回编辑' : '预览渲染效果' }}
            </button>
            <span class="create-hint" :class="{ error: createError }">{{ createError || createHint }}</span>
          </div>
          <div v-if="createPreviewing" class="create-preview">
            <div class="preview-scroll">
              <div class="preview-stage">
                <iframe :srcdoc="createPreviewHtml" title="新增模板渲染预览" sandbox="" style="width: 794px; height: 1123px; border: 0; background: #fff; display: block" />
              </div>
            </div>
          </div>
          <div class="pane-actions">
            <button class="btn btn-primary" type="button" :disabled="creating || !createHtml.trim()" @click="createByHtml">
              <AppIcon name="plus" :size="15" />
              {{ creating ? '创建中…' : '创建模板' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import { api } from '../api'
import { renderTemplate } from '../utils/renderTemplate'

const occupations = ref([])
const activeId = ref('')
const current = ref(null)
const sample = ref({})
const mode = ref('preview') // preview | edit
const draftHtml = ref('')
const draftName = ref('')
const draftDescription = ref('')
const busy = ref(false)
const generating = ref(false)
const generateOpen = ref(false)
const styleNote = ref('')
const regenError = ref('')
const regenNote = ref('')
const editHint = ref('')
const placeholderHint = '占位符语法：{{字段}} 取字段、{{#list}}…{{/list}} 循环数组、{{^字段}}…{{/字段}} 空值兜底、{{#if:字段}}…{{/if}} 条件显示；basic 信息已展开到顶层（如 {{name}}）。'
const editError = ref(false)
const zoom = ref(0.8)
const previewHtml = ref('')
const createOpen = ref(false)
const createOccupationId = ref('')
const createName = ref('')
const createMode = ref('ai') // 'ai' | 'html'
const createStyleNote = ref('')
const createHtml = ref('')
const createPreviewing = ref(false)
const createPreviewHtml = ref('')
const createHint = ref('AI 生成使用后台「AI 设置」中已配置的默认模型与 Key；粘贴 HTML 需为完整文档（内联样式 + 占位符），创建后可继续编辑。')
const createError = ref('')
const creating = ref(false)
const genJobs = ref([]) // 后台 AI 生成任务：{ jobId, occupationName, status }
const genError = ref('')
let genTimer = null

const flatTemplates = computed(() => occupations.value.flatMap(o => o.templates || []))
const genJobsText = computed(() => genJobs.value.map(g => `${g.occupationName}·${genStatusText(g.status)}`).join('、'))
const filterOccId = ref('') // '' = 全部
const filteredOccupations = computed(() => filterOccId.value
  ? occupations.value.filter(o => o.occupationId === filterOccId.value)
  : occupations.value)
const selectedOccupation = computed(() => {
  if (!current.value) return null
  return occupations.value.find(o => o.occupationId === current.value.occupationId) || null
})
const occHasBuiltin = computed(() => Boolean(selectedOccupation.value?.hasBuiltin))

const dirty = computed(() => {
  if (!current.value) return false
  return (
    draftHtml.value !== current.value.html ||
    draftName.value !== current.value.name ||
    draftDescription.value !== current.value.description
  )
})

function genStatusText(status) {
  return { pending: '排队中', running: '生成中', done: '已完成', error: '失败' }[status] || status
}

const sourceLabel = s => ({ builtin: '内置', ai: 'AI 生成', manual: '人工编辑' }[s] || s || '—')
const kb = n => `${((Number(n) || 0) / 1024).toFixed(1)} KB`

function formatTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function loadSample() {
  try {
    sample.value = await api.getResumeTemplateSample()
  } catch {
    sample.value = {}
  }
}

async function loadList(selectId) {
  try {
    occupations.value = await api.listResumeTemplates()
    const all = flatTemplates.value
    if (selectId && all.some(t => t.id === selectId)) {
      await selectTemplate(selectId)
    } else if (activeId.value && all.some(t => t.id === activeId.value)) {
      await selectTemplate(activeId.value)
    } else if (all.length) {
      const firstOcc = occupations.value[0]
      const target = firstOcc?.templates?.find(t => t.isDefault) || firstOcc?.templates?.[0] || all[0]
      if (target) await selectTemplate(target.id)
    }
  } catch (error) {
    editHint.value = error.message
    editError.value = true
  }
}

async function selectTemplate(id) {
  activeId.value = id
  generateOpen.value = false
  regenError.value = ''
  regenNote.value = ''
  editHint.value = ''
  editError.value = false
  mode.value = 'preview'
  busy.value = true
  try {
    current.value = await api.getResumeTemplate(id)
    draftHtml.value = current.value.html
    draftName.value = current.value.name
    draftDescription.value = current.value.description
    refreshPreview()
  } catch (error) {
    current.value = null
    editHint.value = error.message
    editError.value = true
  } finally {
    busy.value = false
  }
}

function refreshPreview() {
  try {
    previewHtml.value = renderTemplate(draftHtml.value, sample.value)
  } catch {
    previewHtml.value = draftHtml.value
  }
}

function applyDraft() {
  refreshPreview()
  mode.value = 'preview'
}

function toggleMode() {
  if (mode.value === 'preview') mode.value = 'edit'
  else applyDraft()
}

function patchListItem(tpl) {
  for (const occ of occupations.value) {
    const t = (occ.templates || []).find(x => x.id === tpl.id)
    if (t) {
      t.name = tpl.name
      t.source = tpl.source
      t.isDefault = Boolean(tpl.isDefault)
      t.htmlLength = String(tpl.html || '').length
      t.updatedAt = tpl.updatedAt
      return
    }
  }
}

async function saveDraft() {
  if (!current.value || busy.value) return
  busy.value = true
  regenNote.value = ''
  editError.value = false
  try {
    await api.saveResumeTemplate(current.value.id, {
      name: draftName.value,
      description: draftDescription.value,
      html: draftHtml.value,
    })
    current.value = await api.getResumeTemplate(current.value.id)
    patchListItem(current.value)
    editHint.value = '已保存（来源：人工编辑）。'
    editError.value = false
    refreshPreview()
  } catch (error) {
    editHint.value = error.message
    editError.value = true
  } finally {
    busy.value = false
  }
}

function stopGenPolling() {
  if (genTimer) { clearInterval(genTimer); genTimer = null }
}

function startGenPolling() {
  if (genTimer) return
  genTimer = setInterval(pollGenJobs, 4000)
}

async function pollGenJobs() {
  let jobs
  try {
    jobs = await api.listGenerateJobs()
  } catch (error) {
    stopGenPolling()
    genJobs.value = []
    genError.value = error.message || '无法查询 AI 生成任务，请刷新页面查看结果。'
    return
  }
  const byId = new Map(jobs.map(j => [j.id, j]))
  const remaining = []
  for (const g of genJobs.value) {
    const remote = byId.get(g.jobId)
    if (!remote) {
      genError.value = `任务「${g.occupationName}」已失效（服务可能重启），请重新发起生成。`
      continue
    }
    if (remote.status === 'done') {
      if (remote.templateId) {
        try {
          await loadList(remote.templateId)
          regenNote.value = `AI 已生成「${remote.templateName || '新模板'}」（未覆盖现有模板），可继续预览 / 编辑 / 设为默认。`
        } catch (error) {
          genError.value = error.message
        }
      }
      continue
    }
    if (remote.status === 'error') {
      genError.value = `「${g.occupationName}」AI 生成失败：${remote.error || '未知错误'}`
      continue
    }
    remaining.push({ ...g, status: remote.status })
  }
  genJobs.value = remaining
  if (!genJobs.value.length) stopGenPolling()
}

function trackGenJob(jobId, occupationName) {
  genError.value = ''
  genJobs.value.push({ jobId, occupationName: occupationName || '该职业', status: 'pending' })
  startGenPolling()
}

async function loadPendingGenJobs() {
  try {
    const jobs = await api.listGenerateJobs()
    const active = jobs.filter(j => j.status === 'pending' || j.status === 'running')
    if (active.length) {
      genJobs.value = active.map(j => ({ jobId: j.id, occupationName: j.occupationName || j.occupationId, status: j.status }))
      startGenPolling()
    }
  } catch {
    // 忽略：任务接口不可用时不做恢复
  }
}

function selectOccupationFilter(occupationId) {
  filterOccId.value = occupationId || ''
  generateOpen.value = false
  regenError.value = ''
  regenNote.value = ''
  const occ = filteredOccupations.value.find(o => o.templates && o.templates.length)
  const target = occ?.templates?.find(t => t.isDefault) || occ?.templates?.[0]
  if (target && target.id !== activeId.value) selectTemplate(target.id)
}

function openGenerate() {
  regenError.value = ''
  styleNote.value = ''
  generateOpen.value = true
}

async function generateNew() {
  if (!current.value || generating.value) return
  generating.value = true
  regenError.value = ''
  regenNote.value = ''
  editHint.value = ''
  try {
    const res = await api.generateResumeTemplate(current.value.occupationId, { styleNote: styleNote.value })
    const occName = selectedOccupation.value?.name || current.value.occupationId
    generateOpen.value = false
    trackGenJob(res.jobId, occName)
    regenNote.value = `已提交「${occName}」AI 生成任务，后台排队执行中（关闭面板不影响生成），完成后自动刷新列表。`
  } catch (error) {
    regenError.value = error.message
  } finally {
    generating.value = false
  }
}

async function setDefaultTemplate() {
  if (!current.value || busy.value) return
  const occName = selectedOccupation.value?.name || current.value.occupationId
  if (!window.confirm(`确定将「${current.value.name}」设为「${occName}」的默认模板吗？`)) return
  busy.value = true
  editError.value = false
  try {
    await api.setDefaultResumeTemplate(current.value.id)
    await loadList(current.value.id)
    regenNote.value = '已设为该职业的默认模板。'
  } catch (error) {
    editHint.value = error.message
    editError.value = true
  } finally {
    busy.value = false
  }
}

async function resetTemplate() {
  if (!current.value || busy.value) return
  if (!window.confirm('确定将该职业的模板恢复为内置版本吗？内置内容将覆盖内置记录（AI/人工版本不会被删除，仍保留在列表中）。')) return
  busy.value = true
  regenNote.value = ''
  editError.value = false
  try {
    await api.resetResumeTemplate(current.value.occupationId)
    await loadList(current.value.occupationId)
    regenNote.value = '已恢复内置版本。'
  } catch (error) {
    editHint.value = error.message
    editError.value = true
  } finally {
    busy.value = false
  }
}

async function removeTemplate() {
  if (!current.value || busy.value) return
  const occName = selectedOccupation.value?.name || current.value.occupationId
  const tip = current.value.isDefault
    ? `「${current.value.name}」是「${occName}」当前默认模板。删除后将自动把该职业剩余最早一套设为默认。`
    : `确定删除「${current.value.name}」吗？`
  if (!window.confirm(`${tip}\n（内置模板删除后，下次服务启动会自动重建）`)) return
  busy.value = true
  editError.value = false
  try {
    const occ = selectedOccupation.value
    const nextId = occ?.templates?.find(t => t.isDefault && t.id !== current.value.id)?.id
      || occ?.templates?.find(t => t.id !== current.value.id)?.id
    await api.deleteResumeTemplate(current.value.id)
    current.value = null
    activeId.value = ''
    await loadList(nextId || undefined)
    regenNote.value = '模板已删除。'
  } catch (error) {
    editHint.value = error.message
    editError.value = true
  } finally {
    busy.value = false
  }
}

const zoomIn = () => { zoom.value = Math.min(1.5, Math.round((zoom.value + 0.1) * 10) / 10) }

function openCreate() {
  createError.value = ''
  createName.value = ''
  createMode.value = 'ai'
  createStyleNote.value = ''
  createHtml.value = ''
  createPreviewing.value = false
  createPreviewHtml.value = ''
  const occWith = occupations.value.find(o => (o.templates || []).length)
  createOccupationId.value = occWith?.occupationId || occupations.value[0]?.occupationId || ''
  createOpen.value = true
}

function closeCreate() {
  createOpen.value = false
  creating.value = false
  createError.value = ''
}

function switchCreateMode(mode) {
  createMode.value = mode
  createError.value = ''
  createPreviewing.value = false
}

function toggleCreatePreview() {
  if (!createHtml.value.trim()) {
    createError.value = '请先粘贴模板 HTML 内容。'
    return
  }
  try {
    createPreviewHtml.value = renderTemplate(createHtml.value, sample.value)
  } catch (error) {
    createError.value = `预览渲染失败：${error.message}`
    return
  }
  createError.value = ''
  createPreviewing.value = !createPreviewing.value
}

async function createByAi() {
  if (!createOccupationId.value || creating.value) return
  creating.value = true
  createError.value = ''
  try {
    const res = await api.generateResumeTemplate(createOccupationId.value, { styleNote: createStyleNote.value })
    const occName = occupations.value.find(o => o.occupationId === createOccupationId.value)?.name || createOccupationId.value
    closeCreate()
    trackGenJob(res.jobId, occName)
    regenNote.value = `已提交「${occName}」AI 生成任务，后台排队执行中（关闭弹窗不影响生成），完成后自动刷新列表。`
  } catch (error) {
    createError.value = error.message
  } finally {
    creating.value = false
  }
}

async function createByHtml() {
  if (!createOccupationId.value || creating.value) return
  if (!createHtml.value.trim()) {
    createError.value = '请粘贴模板 HTML 内容。'
    return
  }
  creating.value = true
  createError.value = ''
  try {
    const res = await api.createResumeTemplate({
      occupationId: createOccupationId.value,
      name: createName.value || undefined,
      html: createHtml.value,
    })
    const newId = res.template?.id
    closeCreate()
    if (newId) await loadList(newId)
    regenNote.value = '已创建新模板（来源：人工编辑），可继续预览 / 编辑 / 设为默认。'
  } catch (error) {
    createError.value = error.message
  } finally {
    creating.value = false
  }
}
const zoomOut = () => { zoom.value = Math.max(0.4, Math.round((zoom.value - 0.1) * 10) / 10) }

onMounted(async () => {
  await loadSample()
  await loadList()
  await loadPendingGenJobs()
})

onUnmounted(() => {
  stopGenPolling()
})
</script>



<style scoped>

/* ===== 职业分组列表 ===== */
.occ-groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  flex: 1;
}
.occ-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.occ-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 4px;
}
.occ-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
  letter-spacing: 0.2px;
}
.occ-count {
  font-size: 11px;
  color: var(--color-text-muted);
}
.occ-tpls {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.occ-empty {
  font-size: 12px;
  color: var(--color-text-muted);
  padding: 4px 8px;
}
.tpl-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

/* ===== 默认徽标 ===== */
.default-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.6;
  white-space: nowrap;
  background: rgba(34, 197, 94, 0.16);
  color: #16a34a;
  border: 1px solid rgba(34, 197, 94, 0.35);
}

/* ===== 删除按钮 ===== */
.btn-danger-text {
  color: var(--color-danger, #ef4444);
}
.btn-danger-text:hover {
  background: rgba(239, 68, 68, 0.1);
}

.resume-templates {
  min-width: 0;
}

.tpl-layout {
  display: grid;
  grid-template-columns: 268px 1fr;
  gap: 16px;
  align-items: start;
}

/* ===== 左列表 ===== */
.tpl-list {
  padding: 16px;
  position: sticky;
  top: calc(var(--topbar-height) + 16px);
  max-height: calc(100vh - var(--topbar-height) - 32px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.list-count {
  font-size: 12px;
  color: var(--color-text-muted);
}
.list-hint {
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-muted);
  margin-bottom: 12px;
}
.tpl-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  flex: 1;
}
.tpl-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--motion-fast), background var(--motion-fast);
}
.tpl-item:hover {
  border-color: var(--color-primary);
  background: var(--color-surface-2);
}
.tpl-item.active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}
.tpl-name {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}
.tpl-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tpl-size {
  font-size: 11px;
  color: var(--color-text-muted);
}
.list-empty {
  font-size: 12.5px;
  color: var(--color-text-muted);
  padding: 12px 4px;
}

/* ===== 来源标签 ===== */
.source-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.6;
  white-space: nowrap;
}
.source-builtin {
  background: rgba(34, 197, 94, 0.14);
  color: #22c55e;
}
.source-ai {
  background: rgba(139, 92, 246, 0.14);
  color: #a78bfa;
}
.source-manual {
  background: rgba(245, 158, 11, 0.14);
  color: #f59e0b;
}

/* ===== 右详情 ===== */
.tpl-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.empty-tip {
  padding: 48px 24px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 14px;
}

.tpl-toolbar {
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.tpl-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}
.tpl-title-group .card-title {
  font-size: 15px;
}
.updated-at {
  font-size: 12px;
  color: var(--color-text-muted);
}
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.toolbar-actions .btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* ===== AI 重新生成 ===== */
.regen-panel {
  padding: 14px 16px;
  border-color: rgba(139, 92, 246, 0.4);
}
.regen-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}
.regen-field {
  flex: 1;
  min-width: 260px;
}
.regen-actions {
  display: flex;
  gap: 8px;
}
.regen-error {
  margin-top: 10px;
  font-size: 12.5px;
  color: var(--color-danger, #ef4444);
}
.regen-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-text-muted);
}

/* ===== 编辑面板 ===== */
.edit-panel {
  padding: 16px;
}
.edit-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}
.edit-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.edit-hint {
  font-size: 12.5px;
  color: var(--color-success, #22c55e);
}
.edit-hint.error {
  color: var(--color-danger, #ef4444);
}
.html-editor {
  width: 100%;
  min-height: 520px;
  padding: 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: #0d1424;
  color: #dbe4f5;
  font-family: "Cascadia Code", Consolas, "JetBrains Mono", monospace;
  font-size: 12.5px;
  line-height: 1.6;
  resize: vertical;
  tab-size: 2;
}
.html-editor:focus {
  outline: none;
  border-color: var(--color-primary);
}

/* ===== 预览 ===== */
.preview-card {
  padding: 12px;
}
.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.zoom-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}
.btn-zoom {
  min-width: 30px;
  padding: 4px 8px;
  font-size: 13px;
}
.zoom-label {
  font-size: 12px;
  color: var(--color-text-muted);
  min-width: 44px;
  text-align: center;
}
.preview-msg {
  font-size: 12.5px;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
}
.busy-tip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #a78bfa;
}
.regen-note {
  color: var(--color-success, #22c55e);
}
.preview-src {
  color: var(--color-text-muted);
}
.preview-scroll {
  overflow: auto;
  background: #1a2233;
  border-radius: var(--radius-md);
  padding: 20px;
  max-height: calc(100vh - var(--topbar-height) - 220px);
  display: flex;
  justify-content: flex-start;
}
.preview-stage {
  flex-shrink: 0;
  background: #fff;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
}
.preview-stage iframe {
  border: 0;
  display: block;
  background: #fff;
}

/* ===== 新增模板弹窗 ===== */
.modal-mask {
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
.modal {
  width: 100%;
  max-width: 880px;
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.modal-head h3 {
  font-size: 15.5px;
}
.modal-body {
  padding: 18px 20px 20px;
  overflow-y: auto;
}
.create-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 14px;
}
.req {
  color: var(--color-danger);
  font-style: normal;
}
.select-input {
  appearance: none;
  padding-right: 32px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7a96' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}
.create-mode-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  margin-bottom: 14px;
  border-radius: var(--radius-md);
  background: var(--color-bg-deep);
  border: 1px solid var(--color-border);
}
.create-mode-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--motion-fast), color var(--motion-fast);
}
.create-mode-tabs button:hover {
  color: var(--color-text);
}
.create-mode-tabs button.active {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.create-pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pane-hint {
  font-size: 12.5px;
  color: var(--color-text-muted);
  line-height: 1.6;
  margin: 0;
}
.pane-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.pane-tools {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.create-editor {
  min-height: 300px;
  font-family: var(--font-mono);
}
.create-preview {
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--color-border);
}
.create-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.5;
}
.create-hint.error {
  color: var(--color-danger);
}
.create-error {
  font-size: 12.5px;
  color: var(--color-danger);
  background: var(--color-danger-soft);
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background var(--motion-fast), color var(--motion-fast), border-color var(--motion-fast);
}
.icon-btn:hover {
  background: var(--color-surface-3);
  color: var(--color-text);
}
@media (max-width: 640px) {
  .create-fields {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1080px) {
  .tpl-layout {
    grid-template-columns: 220px 1fr;
  }
}
@media (max-width: 860px) {
  .tpl-layout {
    grid-template-columns: 1fr;
  }
  .tpl-list {
    position: static;
    max-height: none;
  }
  .tpl-items {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .tpl-item {
    width: auto;
    flex: 1 1 180px;
  }
  .edit-fields {
    grid-template-columns: 1fr;
  }
}

/* ===== 职位筛选 header ===== */
.tpl-filter-header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
}
.filter-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  white-space: nowrap;
}
.filter-chips {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.filter-chip {
  padding: 6px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface-2);
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.4;
  cursor: pointer;
  transition: border-color var(--motion-fast), color var(--motion-fast), background var(--motion-fast);
}
.filter-chip:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.filter-chip.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}
</style>