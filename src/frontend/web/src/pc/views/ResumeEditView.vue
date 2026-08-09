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
        <strong>正在按「{{ occupationName }}」模板编辑</strong>
        <p v-if="templateDescription">{{ templateDescription }}</p>
      </div>
      <p class="fine privacy-note">✏️ 保存后简历将按该行业模板的区块顺序重新组织；手机号 / 邮箱等隐私仍自动脱敏，不会明文保存。</p>
      <form class="edit-form" @submit.prevent="save">
        <article v-for="sec in sections" :key="sec.id" class="edit-section neo-panel">
          <header class="edit-section-head">
            <h2>{{ sec.title }}</h2>
            <span v-if="sec.required" class="neo-tag neo-tag-lime">模板必填</span>
          </header>

          <div v-if="sec.kind === 'fields'" class="edit-fields">
            <div class="field-row">
              <div v-for="f in sec.fieldDefs" :key="f.key" class="field-block">
                <label :for="'f_' + sec.id + '_' + f.key">{{ f.label }}<span v-if="f.required" class="req">*</span></label>
                <select v-if="isSelect(f)" :id="'f_' + sec.id + '_' + f.key" v-model="sec.values[f.key]">
                  <option value=""></option>
                  <option v-if="sec.values[f.key] && !SELECT_OPTIONS[f.key].includes(sec.values[f.key])" :value="sec.values[f.key]">{{ sec.values[f.key] }}</option>
                  <option v-for="opt in SELECT_OPTIONS[f.key]" :key="opt" :value="opt">{{ opt }}</option>
                </select>
                <input v-else :id="'f_' + sec.id + '_' + f.key" v-model="sec.values[f.key]" :placeholder="f.placeholder || ''" />
              </div>
            </div>
          </div>

          <div v-else-if="sec.kind === 'text'" class="field-block">
            <label :for="'f_' + sec.id">{{ sec.title }}</label>
            <textarea :id="'f_' + sec.id" v-model="sec.text" rows="6" placeholder="填写{{ sec.title }}内容"></textarea>
          </div>

          <div v-else-if="sec.kind === 'lines'" class="field-block">
            <label :for="'f_' + sec.id">{{ sec.title }}（每行一条）</label>
            <textarea :id="'f_' + sec.id" v-model="sec.lines" rows="6" placeholder="每行一条"></textarea>
          </div>

          <div v-else-if="sec.kind === 'skills'" class="edit-fields">
            <div v-for="k in SKILL_KEYS" :key="k" class="field-block">
              <label :for="'f_' + sec.id + '_' + k">{{ SKILL_LABELS[k] }}（每行一条）</label>
              <textarea :id="'f_' + sec.id + '_' + k" v-model="sec.skills[k]" rows="3" placeholder="每行一条"></textarea>
            </div>
          </div>

          <div v-else-if="sec.kind === 'items'" class="edit-items">
            <div v-for="(item, i) in sec.items" :key="item._key" class="edit-item">
              <div class="edit-item-head">
                <b>{{ sec.title }} #{{ i + 1 }}</b>
                <button type="button" class="text-button danger" @click="removeItem(sec, i)">删除</button>
              </div>
              <div class="edit-item-body">
                <div class="field-row">
                  <div v-for="f in sec.textDefs" :key="f.key" class="field-block">
                    <label :for="'f_' + sec.id + '_' + f.key + '_' + item._key">{{ f.label }}<span v-if="f.required" class="req">*</span></label>
                    <select v-if="isSelect(f)" :id="'f_' + sec.id + '_' + f.key + '_' + item._key" v-model="item.values[f.key]">
                      <option value=""></option>
                      <option v-if="item.values[f.key] && !SELECT_OPTIONS[f.key].includes(item.values[f.key])" :value="item.values[f.key]">{{ item.values[f.key] }}</option>
                      <option v-for="opt in SELECT_OPTIONS[f.key]" :key="opt" :value="opt">{{ opt }}</option>
                    </select>
                    <input v-else :id="'f_' + sec.id + '_' + f.key + '_' + item._key" v-model="item.values[f.key]" />
                  </div>
                </div>
                <div v-for="f in sec.listDefs" :key="f.key" class="field-block">
                  <label :for="'f_' + sec.id + '_' + f.key + '_' + item._key">{{ f.label }}（每行一条）</label>
                  <textarea :id="'f_' + sec.id + '_' + f.key + '_' + item._key" v-model="item.lists[f.key]" rows="3" placeholder="每行一条"></textarea>
                </div>
              </div>
            </div>
            <button type="button" class="neo-button neo-button-secondary add-item" @click="addItem(sec)">＋ 添加{{ sec.title }}</button>
          </div>
        </article>

        <article v-if="protectedSections.length" class="edit-section neo-panel edit-protected">
          <header class="edit-section-head"><h2>未覆盖内容</h2></header>
          <p class="fine">以下内容系统未能归入上方区块，保存时会一并保留（如与上方重复可删除）。</p>
          <div v-for="(p, i) in protectedSections" :key="i" class="field-block">
            <label :for="'f_protected_' + i">{{ p.title }}</label>
            <textarea :id="'f_protected_' + i" v-model="p.content" rows="4"></textarea>
          </div>
        </article>

        <p class="error" role="alert">{{ error }}</p>
        <div class="action-row">
          <router-link class="neo-button neo-button-secondary" to="/my-resume">返回</router-link>
          <button class="neo-button neo-button-primary" type="submit" :disabled="saving">{{ saving ? '保存中…' : '保存简历' }}</button>
        </div>
      </form>
    </template>
    <p v-else class="resume-empty">{{ emptyText }}</p>
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { showLoading, hideLoading, saveDraft } from '../store'
import { SECTION_CATALOG, getSectionById, getTemplateById } from '../data/resumeStructureTemplates.js'
import { normalizeStructured, structuredToText, parseTextSections, sectionIdOfTitle } from '../utils/resumeBlocks.js'

const router = useRouter()

const hasResume = ref(false)
const emptyText = ref('')
const meta = ref('')
const occupationName = ref('通用 / 综合')
const templateDescription = ref('')
const template = ref(null)
const sections = ref([])
const protectedSections = ref([])
const saving = ref(false)
const error = ref('')

const SKILL_KEYS = ['technical', 'tools', 'soft', 'languages']
const SKILL_LABELS = { technical: '专业技能', tools: '工具', soft: '软技能', languages: '语言' }
const SELECT_OPTIONS = {
  gender: ['男', '女'],
  job_type: ['全职', '兼职', '实习', '不限'],
  degree: ['博士', '硕士', '本科', '大专', '中专/高中', '其他'],
}

let uidSeed = 0
function uid() { uidSeed += 1; return 'item_' + Date.now().toString(36) + '_' + uidSeed }

function splitLines(v) {
  return String(v || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean)
}

function isSelect(f) {
  return f.type === 'select' && SELECT_OPTIONS[f.key]
}

function hasStructuredData(id, s) {
  switch (id) {
    case 'basic': return Object.values(s.basic || {}).some(v => String(v || '').trim())
    case 'job_intention': return Object.values(s.job_intention || {}).some(v => String(v || '').trim())
    case 'summary': return Boolean(String(s.summary || '').trim())
    case 'self_evaluation': return Boolean(String(s.self_evaluation || '').trim())
    case 'skills': return SKILL_KEYS.some(k => Array.isArray(s.skills?.[k]) && s.skills[k].length > 0)
    default: return Array.isArray(s[id]) && s[id].length > 0
  }
}

function makeSection(def, required, s) {
  const id = def.id
  const base = { id, title: def.title, required: Boolean(required), fieldDefs: def.fields || [], kind: 'text' }
  if (id === 'basic' || id === 'job_intention') {
    const values = {}
    for (const f of def.fields || []) {
      const raw = s[id] && s[id][f.key]
      values[f.key] = (raw !== undefined && raw !== null) ? String(raw) : ''
    }
    return { ...base, kind: 'fields', values }
  }
  if (id === 'summary' || id === 'self_evaluation') {
    return { ...base, kind: 'text', text: String(s[id] || '') }
  }
  if (id === 'skills') {
    const sk = s.skills || {}
    const skills = {}
    for (const k of SKILL_KEYS) skills[k] = Array.isArray(sk[k]) ? sk[k].join('\n') : ''
    return { ...base, kind: 'skills', skills }
  }
  if (id === 'certificates' || id === 'awards' || id === 'interests') {
    return { ...base, kind: 'lines', lines: Array.isArray(s[id]) ? s[id].join('\n') : '' }
  }
  const textDefs = (def.fields || []).filter(f => f.type !== 'list')
  const listDefs = (def.fields || []).filter(f => f.type === 'list')
  const items = (Array.isArray(s[id]) ? s[id] : []).filter(x => x && typeof x === 'object').map(item => {
    const values = {}
    const lists = {}
    for (const f of textDefs) values[f.key] = (item[f.key] !== undefined && item[f.key] !== null) ? String(item[f.key]) : ''
    for (const f of listDefs) lists[f.key] = Array.isArray(item[f.key]) ? item[f.key].join('\n') : ''
    return { _key: uid(), values, lists }
  })
  return { ...base, kind: 'items', textDefs, listDefs, items }
}

function buildEditSections(s) {
  const occ = (s.occupation && s.occupation.id) ? s.occupation : { id: 'general', name: '通用 / 综合' }
  const tpl = getTemplateById(occ.id) || getTemplateById('general')
  const requiredMap = {}
  for (const x of tpl.structure || []) if (x && x.id) requiredMap[x.id] = Boolean(x.required)
  const result = []
  const seen = new Set()
  const push = (id) => {
    const def = getSectionById(id)
    if (!def || seen.has(id)) return
    result.push(makeSection(def, requiredMap[id], s))
    seen.add(id)
  }
  for (const x of tpl.structure || []) {
    const id = x && x.id
    if (id && id !== 'extra') push(id)
  }
  // 模板未列出但有数据的区块追加在末尾，保证内容只多不少
  for (const def of SECTION_CATALOG) {
    if (def.id === 'extra' || seen.has(def.id)) continue
    if (hasStructuredData(def.id, s)) push(def.id)
  }
  return { occ, tpl, sections: result }
}

function buildProtected(text, s) {
  const list = []
  if (!text) return list
  const secs = parseTextSections(text)
  for (const sec of secs) {
    const content = String(sec.content || '').trim()
    if (!content) continue
    if (sec.title === null) {
      // 页眉行：仅保留基本信息未覆盖的行（限 4 行内，避免无标题整篇简历与表单重复）
      const lines = content.split('\n').map(x => x.trim()).filter(Boolean)
      if (lines.length > 4) continue
      const covered = Object.values(s.basic || {}).map(v => String(v || '').trim()).filter(Boolean).join(' ')
      const extra = lines.filter(l => !covered.includes(l))
      if (extra.length) list.push({ title: '补充信息', content: extra.join('\n') })
    } else {
      const sid = sectionIdOfTitle(sec.title)
      if (sid === 'extra') {
        // 附加/补充信息已在 extra_sections 登记过（round-trip）则跳过，避免每次保存重复追加
        const registered = (s.extra_sections || []).some(x => String(x && x.content || '').trim() === content)
        if (!registered) list.push({ title: sec.title, content })
        continue
      }
      const covered = Boolean(sid && hasStructuredData(sid, s))
      if (!covered) list.push({ title: sec.title, content })
    }
  }
  return list
}

function collectStructured(s) {
  const out = JSON.parse(JSON.stringify(s))
  for (const sec of sections.value) {
    const id = sec.id
    if (sec.kind === 'fields') {
      const values = {}
      for (const f of sec.fieldDefs) { const v = String(sec.values[f.key] ?? '').trim(); if (v) values[f.key] = v }
      if (id === 'basic') out.basic = values
      else if (id === 'job_intention') out.job_intention = values
    } else if (sec.kind === 'text') {
      out[id] = String(sec.text || '').trim()
    } else if (sec.kind === 'skills') {
      out.skills = {}
      for (const k of SKILL_KEYS) out.skills[k] = splitLines(sec.skills[k])
    } else if (sec.kind === 'lines') {
      out[id] = splitLines(sec.lines)
    } else if (sec.kind === 'items') {
      const items = []
      for (const it of sec.items) {
        const obj = {}
        for (const f of sec.textDefs) { const v = String(it.values[f.key] ?? '').trim(); if (v) obj[f.key] = v }
        for (const f of sec.listDefs) { const arr = splitLines(it.lists[f.key]); if (arr.length) obj[f.key] = arr }
        if (Object.keys(obj).length) items.push(obj)
      }
      out[id] = items
    }
  }
  // 未覆盖内容并入 extra_sections（同标题同内容去重，避免每轮保存重复累积）
  const extras = Array.isArray(out.extra_sections) ? out.extra_sections.filter(x => x && typeof x === 'object') : []
  const seen = new Set(extras.map(x => `${x.title || '附加信息'}\u0000${x.content || ''}`))
  for (const p of protectedSections.value) {
    const content = String(p.content || '').trim()
    if (!content) continue
    const title = String(p.title || '附加信息').trim()
    const key = `${title}\u0000${content}`
    if (seen.has(key)) continue
    seen.add(key)
    extras.push({ title, content })
  }
  out.extra_sections = extras
  return out
}

function addItem(sec) {
  const values = {}
  const lists = {}
  for (const f of sec.textDefs) values[f.key] = ''
  for (const f of sec.listDefs) lists[f.key] = ''
  sec.items.push({ _key: uid(), values, lists })
}

function removeItem(sec, i) {
  sec.items.splice(i, 1)
}

async function save() {
  error.value = ''
  const editedStructured = collectStructured(JSON.parse(JSON.stringify(structuredCache.value)))
  const text = structuredToText(editedStructured, template.value)
  if (!text.trim()) {
    error.value = '简历内容不能为空，请至少填写姓名或一段内容。'
    return
  }
  saving.value = true
  showLoading('正在保存简历', '按行业模板重组并保存')
  try {
    await api.put('/api/resume', { text, structured: editedStructured })
    saveDraft({ resumeText: text })
    hideLoading()
    router.push('/my-resume')
  } catch (err) {
    hideLoading()
    saving.value = false
    error.value = err.message
  }
}

const structuredCache = ref(null)

onMounted(async () => {
  showLoading('正在打开编辑', '读取你的简历')
  try {
    const data = await api.get('/api/resume')
    hasResume.value = Boolean(data.hasResume)
    if (!hasResume.value) {
      emptyText.value = '账号中还没有简历，请先上传或粘贴简历。'
      meta.value = ''
      return
    }
    meta.value = `最近更新：${new Date(data.updatedAt).toLocaleString('zh-CN')}`
    const s = normalizeStructured(data.structured)
    structuredCache.value = s
    const { occ, tpl, sections: secs } = buildEditSections(s)
    occupationName.value = occ.name || tpl.name || '通用 / 综合'
    templateDescription.value = tpl.description || ''
    template.value = tpl
    sections.value = secs
    protectedSections.value = buildProtected(data.text || '', s)
  } catch (err) {
    emptyText.value = err.message
    meta.value = ''
  } finally {
    hideLoading()
  }
})
</script>