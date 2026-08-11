<template>
  <section class="resume-view">
    <div class="resume-toolbar">
      <div><p class="section-kicker">RESUME EDIT</p><h1>编辑简历</h1></div>
      <div class="resume-actions">
        <router-link class="neo-button neo-button-secondary" to="/my-resume">返回</router-link>
        <button id="save-resume-edit" class="neo-button neo-button-primary" type="button" :disabled="saving || !hasResume" @click="save">{{ saving ? '保存中…' : '保存简历' }}</button>
      </div>
    </div>
    <p class="fine">{{ meta }}</p>
    <template v-if="hasResume">
      <div class="neo-alert neo-alert-info edit-template-banner">
        <strong>按所套用模板的字段结构编辑</strong>
        <p>基础信息已拆解为独立字段保存；各区块按字段对号入座填写，数据实时套用到当前模板预览。切换模板后字段表单自动补齐该模板用到的区块。</p>
      </div>

      <div v-if="templateList.length" class="template-switcher edit-template-switcher" role="group" aria-label="选择套用的简历模板">
        <span class="template-switcher-label">套用模板：</span>
        <button
          v-for="t in templateList"
          :key="t.id"
          type="button"
          class="template-switcher-btn"
          :class="{ active: currentTemplateId === t.id }"
          @click="selectTemplate(t)"
        >
          {{ t.name || t.id }}
          <span v-if="t.isDefault" class="neo-tag neo-tag-lime template-tag">默认</span>
          <span v-else class="neo-tag neo-tag-blue template-tag">{{ sourceLabel(t.source) }}</span>
        </button>
      </div>

      <form class="edit-form" @submit.prevent="save">
        <article class="edit-section neo-panel">
          <header class="edit-section-head">
            <h2>基本信息</h2>
            <span class="neo-tag neo-tag-lime">独立字段保存</span>
          </header>
          <div class="edit-fields basic-grid">
            <div v-for="f in BASIC_FIELDS" :key="f.key" class="field-block">
              <label :for="'f_basic_' + f.key">{{ f.label }}</label>
              <input :id="'f_basic_' + f.key" v-model.trim="form.basic[f.key]" :placeholder="f.placeholder" type="text" />
            </div>
          </div>
        </article>

        <article v-for="(sec, i) in form.sections" :key="sec._key" class="edit-section neo-panel">
          <header class="edit-section-head">
            <h2>{{ sec.title }}</h2>
            <span class="section-actions">
              <button type="button" class="text-button" :disabled="i === 0" @click="moveSection(i, -1)">上移</button>
              <button type="button" class="text-button" :disabled="i === form.sections.length - 1" @click="moveSection(i, 1)">下移</button>
              <button type="button" class="text-button danger" @click="removeSection(i)">删除区块</button>
            </span>
          </header>

          <div v-if="secType(sec) === 'text'" class="field-block">
            <label :for="'f_' + sec.id">内容</label>
            <textarea :id="'f_' + sec.id" v-model.trim="sec.text" rows="5" :placeholder="'填写' + sec.title"></textarea>
          </div>

          <div v-else-if="secType(sec) === 'object'" class="edit-fields">
            <div v-for="f in secFields(sec)" :key="f.key" class="field-block">
              <label :for="'f_' + sec.id + '_' + f.key">{{ f.label }}</label>
              <input :id="'f_' + sec.id + '_' + f.key" v-model.trim="sec.object[f.key]" type="text" />
            </div>
          </div>

          <div v-else-if="secType(sec) === 'skills'" class="edit-fields">
            <div v-for="l in secLists(sec)" :key="l.key" class="field-block">
              <label :for="'f_' + sec.id + '_' + l.key">{{ l.label }}（每行一项）</label>
              <textarea :id="'f_' + sec.id + '_' + l.key" v-model.trim="sec.lists[l.key]" rows="4"></textarea>
            </div>
          </div>

          <div v-else-if="secType(sec) === 'lines'" class="field-block">
            <label :for="'f_' + sec.id">{{ sec.title }}（每行一项）</label>
            <textarea :id="'f_' + sec.id" v-model.trim="sec.lines" rows="5"></textarea>
          </div>

          <div v-else class="edit-items">
            <article v-for="(item, j) in sec.items" :key="item._key" class="edit-item">
              <header class="edit-item-head">
                <b>{{ itemLabel(sec.id, item.fields) || ('第 ' + (j + 1) + ' 条') }}</b>
                <span class="section-actions">
                  <button type="button" class="text-button" :disabled="j === 0" @click="moveItem(sec, j, -1)">上移</button>
                  <button type="button" class="text-button" :disabled="j === sec.items.length - 1" @click="moveItem(sec, j, 1)">下移</button>
                  <button type="button" class="text-button danger" @click="removeItem(sec, j)">删除</button>
                </span>
              </header>
              <div class="edit-item-body">
                <div class="edit-fields">
                  <div v-for="f in secFields(sec)" :key="f.key" class="field-block">
                    <label :for="'f_' + sec.id + '_' + j + '_' + f.key">{{ f.label }}</label>
                    <input :id="'f_' + sec.id + '_' + j + '_' + f.key" v-model.trim="item.fields[f.key]" type="text" />
                  </div>
                  <div v-for="l in secLists(sec)" :key="l.key" class="field-block">
                    <label :for="'f_' + sec.id + '_' + j + '_' + l.key">{{ l.label }}（每行一项）</label>
                    <textarea :id="'f_' + sec.id + '_' + j + '_' + l.key" v-model.trim="item.lists[l.key]" rows="3"></textarea>
                  </div>
                </div>
              </div>
            </article>
            <button type="button" class="neo-button neo-button-secondary add-item" @click="addItemToSection(sec)">＋ 添加一条</button>
          </div>
        </article>

        <div v-if="availableSections.length" class="edit-actions add-section-bar">
          <label class="add-section-label" for="add-section-select">添加区块</label>
          <select id="add-section-select" v-model="addSectionId">
            <option value="" disabled>选择要添加的区块</option>
            <option v-for="s in availableSections" :key="s" :value="s">{{ sectionDef(s).title }}</option>
          </select>
          <button id="add-section-btn" type="button" class="neo-button neo-button-secondary" :disabled="!addSectionId" @click="appendSection">＋ 添加区块</button>
        </div>
        <p v-if="error" class="error">{{ error }}</p>
      </form>

      <div v-if="currentTemplate && previewHtml" class="edit-preview">
        <header class="edit-preview-head">
          <h2>实时预览（{{ currentTemplate.name || '模板' }}）</h2>
          <span class="fine">字段编辑后自动对号入座渲染，保存后「我的简历」按该模板展示</span>
        </header>
        <div class="template-frame-wrap">
          <iframe ref="previewFrame" class="template-frame" :title="'预览：' + (currentTemplate.name || '')" :srcdoc="previewHtml" @load="onPreviewLoad"></iframe>
        </div>
      </div>
    </template>
    <p v-else class="resume-empty">{{ emptyText }}</p>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { showLoading, hideLoading, saveDraft } from '../store'
import { structuredToText } from '../utils/resumeBlocks.js'
import { renderTemplate } from '../utils/renderTemplate.js'
import {
  BASIC_FIELDS, SECTION_ORDER, sectionDef, structuredToForm, formToStructured,
  inferTemplateFields, sectionHasData, itemLabel, emptySectionForm, addItemToSection,
} from '../utils/fieldEditor.js'

const router = useRouter()

const hasResume = ref(false)
const emptyText = ref('')
const meta = ref('')
const form = ref({ basic: {}, sections: [] })
const baseStructured = ref(null)
const templateList = ref([])
const currentTemplate = ref(null)
const saving = ref(false)
const error = ref('')
const addSectionId = ref('')
const previewFrame = ref(null)
const avatarUrl = ref('')

const currentTemplateId = computed(() => (currentTemplate.value ? currentTemplate.value.id : ''))

const availableSections = computed(() => {
  const existing = new Set(form.value.sections.map(s => s.id))
  return SECTION_ORDER.filter(id => !existing.has(id))
})

// 实时预览：表单 → structured → 模板渲染
const previewHtml = computed(() => {
  const tpl = currentTemplate.value
  if (!tpl || !tpl.html || !baseStructured.value) return ''
  const st = formToStructured(form.value, baseStructured.value)
  return renderTemplate(tpl.html, { ...st, avatar: avatarUrl.value })
})

function secType(sec) { const d = sectionDef(sec.id); return d ? d.type : '' }
function secFields(sec) { const d = sectionDef(sec.id); return (d && d.fields) || [] }
function secLists(sec) { const d = sectionDef(sec.id); return (d && d.lists) || [] }
function sourceLabel(source) {
  if (source === 'ai') return 'AI 生成'
  if (source === 'manual') return '人工编辑'
  return '内置'
}

function moveSection(i, dir) {
  const j = i + dir
  if (j < 0 || j >= form.value.sections.length) return
  const arr = form.value.sections
  const tmp = arr[i]
  arr[i] = arr[j]
  arr[j] = tmp
}

function removeSection(i) {
  form.value.sections.splice(i, 1)
}

function moveItem(sec, i, dir) {
  const j = i + dir
  if (!sec.items || j < 0 || j >= sec.items.length) return
  const tmp = sec.items[i]
  sec.items[i] = sec.items[j]
  sec.items[j] = tmp
}

function removeItem(sec, i) {
  sec.items.splice(i, 1)
}

function appendSection() {
  if (!addSectionId.value) return
  form.value.sections.push(emptySectionForm(addSectionId.value))
  addSectionId.value = ''
}

// 把模板用到的区块（结构化中还没有的）补进编辑表单，按模板字段结构对号入座
function mergeTemplateSections(tpl) {
  if (!tpl || !tpl.html) return
  const inferred = inferTemplateFields(tpl.html)
  const existing = new Set(form.value.sections.map(s => s.id))
  for (const id of inferred.sectionIds) {
    if (!existing.has(id)) {
      form.value.sections.push(emptySectionForm(id))
      existing.add(id)
    }
  }
}

async function selectTemplate(t) {
  currentTemplate.value = t
  mergeTemplateSections(t)
  try {
    await api.put('/api/resume/template', { templateId: t.id })
  } catch (err) {
    console.warn('模板选择保存失败：', err.message)
  }
}

async function save() {
  error.value = ''
  const structured = formToStructured(form.value, baseStructured.value)
  const text = structuredToText(structured, currentTemplate.value)
  if (!text.trim()) {
    error.value = '简历内容不能为空，请至少填写姓名或一段内容。'
    return
  }
  saving.value = true
  showLoading('正在保存简历', '按模板字段结构保存')
  try {
    await api.put('/api/resume', { text, structured })
    saveDraft({ resumeText: text })
    hideLoading()
    router.push('/my-resume')
  } catch (err) {
    hideLoading()
    saving.value = false
    error.value = err.message
  }
}

async function onPreviewLoad() {
  await nextTick()
  const f = previewFrame.value
  if (!f) return
  const setHeight = () => {
    if (f.contentDocument && f.contentDocument.documentElement) {
      f.style.height = Math.max(f.contentDocument.documentElement.scrollHeight, 500) + 'px'
    }
  }
  setHeight()
  setTimeout(setHeight, 200)
}

onMounted(async () => {
  showLoading('正在打开编辑', '读取你的简历')
  try {
    const [data, tpls] = await Promise.all([
      api.get('/api/resume'),
      api.get('/api/resume/templates').catch(() => null),
    ])
    hasResume.value = Boolean(data.hasResume)
    if (!hasResume.value) {
      emptyText.value = '账号中还没有简历，请先上传或粘贴简历。'
      meta.value = ''
      return
    }
    meta.value = `最近更新：${new Date(data.updatedAt).toLocaleString('zh-CN')}`
    baseStructured.value = data.structured || null
    avatarUrl.value = data.avatar && data.avatar.url ? location.origin + data.avatar.url : ''
    form.value = structuredToForm(data.structured || null)
    if (tpls && Array.isArray(tpls.templates) && tpls.templates.length) {
      templateList.value = tpls.templates
      const preferred = tpls.preferredTemplateId ? tpls.templates.find(x => x.id === tpls.preferredTemplateId) : null
      currentTemplate.value = preferred || tpls.templates.find(x => x.isDefault) || tpls.templates[0] || null
    }
    // 套用模板字段结构：模板用到的区块补进表单；结构化有数据但模板未用到的区块也保留（数据不丢）
    const withDataIds = []
    const base = data.structured || null
    for (const id of SECTION_ORDER) if (sectionHasData(id, base)) withDataIds.push(id)
    const existing = new Set(form.value.sections.map(s => s.id))
    for (const id of withDataIds) {
      if (!existing.has(id)) {
        form.value.sections.push(emptySectionForm(id))
        existing.add(id)
      }
    }
    if (currentTemplate.value) mergeTemplateSections(currentTemplate.value)
  } catch (err) {
    emptyText.value = err.message
    meta.value = ''
  } finally {
    hideLoading()
  }
})
</script>

<style scoped>
.basic-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); }
.section-actions { display: inline-flex; align-items: center; gap: 2px; flex-wrap: wrap; }
.section-actions .text-button { min-height: 36px; padding: 4px 8px; }
.text-button:disabled { opacity: .45; cursor: not-allowed; text-decoration: none; }
.edit-actions { display: flex; justify-content: flex-end; }
.add-section-bar { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.add-section-label { font-size: 13px; font-weight: 900; color: var(--color-muted); }
#add-section-select { min-height: 44px; padding: 4px 10px; border: var(--border-thin); border-radius: var(--radius-sm); background: var(--color-surface); font: inherit; }
.edit-template-switcher { margin-top: var(--space-4); }
.edit-preview { margin-top: var(--space-6); padding: clamp(18px, 3vw, 28px); border: var(--border-strong); border-radius: var(--radius-md); background: var(--color-surface); box-shadow: var(--shadow-hard-md); }
.edit-preview-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-4); }
.edit-preview-head h2 { margin: 0; font-size: 22px; line-height: 1.3; }
.template-frame-wrap { display: grid; justify-items: center; width: 100%; }
.template-frame { width: 794px; max-width: 100%; height: 900px; border: 1px solid #d8dde6; border-radius: var(--radius-sm); background: #fff; }
@media (max-width: 640px) {
  .basic-grid { grid-template-columns: 1fr; }
}
</style>