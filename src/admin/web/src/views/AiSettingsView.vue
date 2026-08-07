<template>
  <div class="ai-settings">
    <div v-if="loading" class="card ai-loading" role="status">
      <div class="skeleton ai-skeleton"></div>
    </div>

    <div v-else-if="error" class="card empty-state" role="alert">{{ error }}</div>

    <template v-else>
      <!-- 页头 -->
      <section class="card">
        <div class="card-head ai-head">
          <div class="ai-head-text">
            <h2 class="card-title">AI 模型库</h2>
            <p class="ai-desc">
              维护用于简历文本分析与截图 OCR 的大模型。公司、模型 ID、API 地址与价目以人工填写为准；
              第三方参考价目只用于辅助填写，不会直接写入。
            </p>
          </div>
          <div class="ai-head-actions">
            <button class="btn" type="button" :disabled="fetchingRef" @click="openReference">
              <AppIcon name="download" :size="15" />
              {{ fetchingRef ? '拉取中…' : '拉取参考价目' }}
            </button>
            <button class="btn btn-primary" type="button" @click="openAdd">
              <AppIcon name="plus" :size="15" />
              添加模型
            </button>
          </div>
        </div>

        <!-- 概览条 -->
        <div class="card-body ai-summary">
          <div class="summary-item">
            <span class="summary-label">默认文本模型</span>
            <span v-if="defaultText" class="summary-value mono">{{ defaultText.provider }} · {{ defaultText.modelId }}</span>
            <span v-else class="summary-value summary-empty">未设置</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">默认 OCR 模型</span>
            <span v-if="defaultOcr" class="summary-value mono">{{ defaultOcr.provider }} · {{ defaultOcr.modelId }}</span>
            <span v-else class="summary-value summary-empty">未设置</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">已启用</span>
            <span class="summary-value">{{ enabledCount }} / {{ models.length }}</span>
          </div>
        </div>
      </section>

      <!-- 空态 -->
      <section v-if="models.length === 0" class="card empty-state">
        <strong>还没有配置任何 AI 模型</strong>
        <p>添加一个文本模型用于简历分析，或先拉取第三方参考价目辅助填写。</p>
        <div class="empty-actions">
          <button class="btn" type="button" @click="openReference">拉取参考价目</button>
          <button class="btn btn-primary" type="button" @click="openAdd">添加模型</button>
        </div>
      </section>
      <!-- 模型分组列表 -->
      <section v-else class="ai-groups">
        <article v-for="group in groups" :key="group.type" class="card">
          <div class="card-head">
            <h3 class="card-title">{{ group.label }}</h3>
            <span class="badge" :class="group.items.length ? 'badge-info' : 'badge-neutral'">
              {{ group.items.length }} 个
            </span>
          </div>

          <div v-if="group.items.length === 0" class="card-body empty-inline">
            暂无{{ group.label }}，点击右上角「添加模型」进行配置。
          </div>

          <ul v-else class="model-list">
            <li v-for="model in group.items" :key="model.id" class="model-row">
              <div class="model-main">
                <div class="model-title">
                  <span class="provider-chip">{{ model.provider }}</span>
                  <code class="model-id">{{ model.modelId }}</code>
                  <span v-if="model.isDefault" class="badge badge-success">默认</span>
                </div>
                <div v-if="model.displayName" class="model-sub">{{ model.displayName }}</div>
                <div class="model-meta">
                  <span v-if="model.apiBaseUrl" class="meta-line" :title="model.apiBaseUrl">
                    <AppIcon name="link" :size="12" />{{ model.apiBaseUrl }}
                  </span>
                  <span v-if="model.contextWindow" class="meta-line">上下文 {{ formatNumber(model.contextWindow) }}</span>
                  <span class="meta-line">输入 {{ formatPrice(model.inputPrice) }} / 输出 {{ formatPrice(model.outputPrice) }} 美元·百万tokens</span>
                  <span class="meta-line">{{ protocolLabel(model.apiProtocol) }}</span>
                </div>
              </div>
              <div class="model-actions">
                <label class="switch" :title="model.enabled ? '点击停用' : '点击启用'">
                  <input type="checkbox" :checked="model.enabled" :aria-label="`启用 ${model.modelId}`" @change="toggleEnabled(model, $event)" />
                  <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
                </label>
                <button v-if="!model.isDefault" class="btn btn-ghost btn-sm" type="button" :disabled="defaultBusy" @click="setDefault(model)">
                  <AppIcon name="check-circle" :size="14" /> 设为默认
                </button>
                <button class="btn btn-ghost btn-sm icon-btn" type="button" :aria-label="`编辑 ${model.modelId}`" :title="`编辑 ${model.modelId}`" @click="openEdit(model)">
                  <AppIcon name="edit" :size="14" />
                </button>
                <button class="btn btn-ghost btn-sm icon-btn" type="button" :aria-label="`删除 ${model.modelId}`" :title="`删除 ${model.modelId}`" @click="askDelete(model)">
                  <AppIcon name="trash" :size="14" />
                </button>
              </div>
            </li>
          </ul>
        </article>
      </section>
    </template>
    <!-- 添加 / 编辑模型弹窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="formOpen" class="modal-overlay" @click.self="closeForm">
          <div class="modal-panel modal-wide" role="dialog" aria-modal="true" :aria-label="formMode === 'edit' ? '编辑 AI 模型' : '添加 AI 模型'">
            <form novalidate @submit.prevent="saveModel">
              <div class="modal-head">
                <span class="modal-icon is-primary" aria-hidden="true"><AppIcon name="spark" :size="20" /></span>
                <h3>{{ formMode === 'edit' ? '编辑 AI 模型' : '添加 AI 模型' }}</h3>
                <button class="modal-close" type="button" aria-label="关闭" @click="closeForm"><AppIcon name="x" :size="16" /></button>
              </div>

              <div class="modal-body">
                <div class="form-grid">
                  <div class="field field-span-2">
                    <label class="field-label" for="model-provider">大模型公司名称</label>
                    <select id="model-provider" v-model="providerChoice" class="select" @change="onProviderChange">
                      <option v-for="p in providerOptions" :key="p.value" :value="p.value">{{ p.label }}</option>
                    </select>
                    <p class="field-hint">选择知名厂商会带出该厂商的默认 API 地址与常见模型 ID 提示，也可以选「自定义厂商」手动填写。</p>
                  </div>

                  <div v-if="providerChoice === '__custom__'" class="field field-span-2">
                    <label class="field-label" for="model-custom-provider">自定义厂商名称</label>
                    <input id="model-custom-provider" v-model.trim="form.provider" class="input" maxlength="60" placeholder="例如：某公司大模型平台" required />
                  </div>

                  <div class="field">
                    <label class="field-label" for="model-type">模型类型</label>
                    <select id="model-type" v-model="form.modelType" class="select" @change="onModelTypeChange">
                      <option v-for="t in meta.modelTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
                    </select>
                    <p class="field-hint">文本模型用于简历内容分析；OCR 模型用于截图识别，建议选支持视觉输入的模型。</p>
                  </div>

                  <div class="field">
                    <label class="field-label" for="model-protocol">接口协议</label>
                    <select id="model-protocol" v-model="form.apiProtocol" class="select">
                      <option v-for="p in meta.apiProtocols" :key="p.value" :value="p.value">{{ p.label }}</option>
                    </select>
                  </div>

                  <div class="field field-span-2">
                    <label class="field-label" for="model-id">模型 ID</label>
                    <input
                      id="model-id"
                      v-model.trim="form.modelId"
                      class="input mono-input"
                      list="ai-model-suggestions"
                      maxlength="200"
                      :placeholder="modelIdPlaceholder"
                      required
                    />
                    <datalist id="ai-model-suggestions">
                      <option v-for="s in modelSuggestions" :key="s" :value="s"></option>
                    </datalist>
                    <div class="field-inline">
                      <p class="field-hint">调用接口时实际使用的模型标识；输入时可按厂商+类型提示常见 ID。</p>
                      <button class="btn btn-sm btn-ghost" type="button" @click="openReference">
                        <AppIcon name="download" :size="13" /> 从参考价目填入
                      </button>
                    </div>
                  </div>

                  <div class="field">
                    <label class="field-label" for="model-display">显示名称</label>
                    <input id="model-display" v-model.trim="form.displayName" class="input" maxlength="120" placeholder="可选，便于识别" />
                  </div>

                  <div class="field">
                    <label class="field-label" for="model-context">上下文窗口（tokens）</label>
                    <input id="model-context" v-model.number="form.contextWindow" class="input" type="number" min="0" step="1" placeholder="例如 128000" />
                  </div>
                  <div class="field">
                    <label class="field-label" for="model-input-price">输入价格（美元 / 百万 tokens）</label>
                    <input id="model-input-price" v-model.number="form.inputPrice" class="input" type="number" min="0" step="0.0001" placeholder="例如 0.15" />
                  </div>

                  <div class="field">
                    <label class="field-label" for="model-output-price">输出价格（美元 / 百万 tokens）</label>
                    <input id="model-output-price" v-model.number="form.outputPrice" class="input" type="number" min="0" step="0.0001" placeholder="例如 0.6" />
                  </div>

                  <div class="field field-span-2">
                    <label class="field-label" for="model-base-url">API 地址（Base URL）</label>
                    <input id="model-base-url" v-model.trim="form.apiBaseUrl" class="input" :placeholder="baseUrlPlaceholder" />
                    <p class="field-hint">按接口协议拼接 /chat/completions 或 /responses 调用；留空表示不覆盖，沿用旧配置。</p>
                  </div>

                  <div class="field field-span-2">
                    <label class="field-label" for="model-official-url">官网地址（可选）</label>
                    <input id="model-official-url" v-model.trim="form.officialUrl" class="input" :placeholder="officialUrlPlaceholder" />
                  </div>
                </div>

                <div class="form-grid form-switches">
                  <label class="switch">
                    <input v-model="form.enabled" type="checkbox" />
                    <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
                    <span class="switch-text">启用该模型</span>
                  </label>
                  <label class="switch">
                    <input v-model="form.isDefault" type="checkbox" />
                    <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
                    <span class="switch-text">设为该类型的默认模型</span>
                  </label>
                </div>

                <p v-if="formError" class="field-error" role="alert">{{ formError }}</p>
              </div>

              <div class="modal-foot">
                <button class="btn" type="button" @click="closeForm">取消</button>
                <button class="btn btn-primary" type="submit" :disabled="saving">
                  {{ saving ? '保存中…' : (formMode === 'edit' ? '保存修改' : '添加模型') }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>
    <!-- 参考价目弹窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="refOpen" class="modal-overlay" @click.self="closeReference">
          <div class="modal-panel modal-ref" role="dialog" aria-modal="true" aria-label="第三方参考价目">
            <div class="modal-head">
              <span class="modal-icon is-info" aria-hidden="true"><AppIcon name="download" :size="20" /></span>
              <h3>第三方参考价目</h3>
              <button class="modal-close" type="button" aria-label="关闭" @click="closeReference"><AppIcon name="x" :size="16" /></button>
            </div>

            <div class="modal-body">
              <p class="ref-note">
                数据来源：OpenRouter 第三方代理（非各厂商官方账单价）。仅作填写参考，点「填入」后
                <strong>仍需手动确认</strong>模型 ID 与 API 地址，并点击保存才会写入正式配置。
              </p>

              <div v-if="!refData" class="ref-init">
                <p>拉取国内外知名大模型厂商在 OpenRouter 上的模型与价位参考（约 20 家厂商）。</p>
                <button class="btn btn-primary" type="button" :disabled="fetchingRef" @click="fetchReference">
                  <AppIcon name="download" :size="15" />
                  {{ fetchingRef ? '拉取中…' : '拉取参考价目' }}
                </button>
                <p v-if="refError" class="field-error" role="alert">{{ refError }}</p>
              </div>

              <template v-else>
                <div class="ref-tools">
                  <select v-model="refProvider" class="select ref-provider" aria-label="按厂商筛选">
                    <option value="">全部厂商</option>
                    <option v-for="p in refData.providers" :key="p" :value="p">{{ p }}</option>
                  </select>
                  <input v-model.trim="refKeyword" class="input ref-search" type="search" placeholder="搜索模型 ID / 名称" aria-label="搜索模型" />
                  <span class="ref-count">共 {{ filteredRef.length }} 条</span>
                </div>

                <div class="table-wrap ref-table-wrap">
                  <table class="table ref-table">
                    <thead>
                      <tr>
                        <th>厂商</th>
                        <th>模型 ID</th>
                        <th>名称</th>
                        <th class="cell-num">上下文</th>
                        <th class="cell-num">输入价 $/M</th>
                        <th class="cell-num">输出价 $/M</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="m in filteredRef" :key="m.id">
                        <td><span class="provider-chip">{{ m.provider }}</span></td>
                        <td><code class="model-id">{{ m.id }}</code></td>
                        <td class="cell-secondary">{{ m.name }}</td>
                        <td class="cell-num">{{ m.contextLength ? formatNumber(m.contextLength) : '—' }}</td>
                        <td class="cell-num">{{ m.inputPrice == null ? '—' : m.inputPrice }}</td>
                        <td class="cell-num">{{ m.outputPrice == null ? '—' : m.outputPrice }}</td>
                        <td class="ref-fill-cell">
                          <button class="btn btn-sm btn-primary" type="button" @click="fillFromReference(m)">填入</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div v-if="filteredRef.length === 0" class="ref-empty">没有匹配的模型。</div>
                </div>
              </template>
            </div>

            <div class="modal-foot">
              <button class="btn" type="button" @click="closeReference">关闭</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <ConfirmDialog
      :open="deleteTarget !== null"
      title="删除 AI 模型"
      :message="deleteTarget ? `将删除「${deleteTarget.provider} · ${deleteTarget.modelId}」。删除后该模型不再可用于分析。` : ''"
      confirm-text="确认删除"
      :busy="deleting"
      @close="deleteTarget = null"
      @confirm="confirmDelete"
    />
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { api } from '../api'
import { toast } from '../store'

const loading = ref(true)
const error = ref('')
const models = ref([])
const meta = ref({
  providers: [],
  modelTypes: [{ value: 'text', label: '文本模型' }, { value: 'ocr', label: 'OCR 模型' }],
  apiProtocols: [],
  knownModels: {},
  providerDefaults: {},
})
const defaultBusy = ref(false)

// 表单
const formOpen = ref(false)
const formMode = ref('add')
const saving = ref(false)
const formError = ref('')
const form = reactive({
  provider: '',
  modelType: 'text',
  modelId: '',
  displayName: '',
  apiBaseUrl: '',
  officialUrl: '',
  apiProtocol: 'chat_completions',
  inputPrice: null,
  outputPrice: null,
  contextWindow: null,
  enabled: true,
  isDefault: false,
})
const editingId = ref(null)
const providerChoice = ref('')

// 参考价目
const refOpen = ref(false)
const fetchingRef = ref(false)
const refError = ref('')
const refData = ref(null)
const refProvider = ref('')
const refKeyword = ref('')

// 删除
const deleteTarget = ref(null)
const deleting = ref(false)

const groups = computed(() => [
  { type: 'text', label: '文本模型', items: models.value.filter(m => m.modelType === 'text') },
  { type: 'ocr', label: 'OCR 模型', items: models.value.filter(m => m.modelType === 'ocr') },
])
const defaultText = computed(() => models.value.find(m => m.modelType === 'text' && m.isDefault) || null)
const defaultOcr = computed(() => models.value.find(m => m.modelType === 'ocr' && m.isDefault) || null)
const enabledCount = computed(() => models.value.filter(m => m.enabled).length)

const providerOptions = computed(() => [
  ...meta.value.providers.map(p => ({ value: p.key, label: p.label })),
  { value: '__custom__', label: '自定义厂商…' },
])

const providerKey = computed(() => {
  const hit = meta.value.providers.find(p => p.label === form.provider)
  return hit ? hit.key : ''
})
const baseUrlPlaceholder = computed(() => providerKey.value ? (meta.value.providerDefaults[providerKey.value]?.apiBaseUrl || 'https://…/v1') : 'https://…/v1')
const officialUrlPlaceholder = computed(() => providerKey.value ? (meta.value.providerDefaults[providerKey.value]?.officialUrl || 'https://…') : 'https://…')
const modelIdPlaceholder = computed(() => {
  const known = meta.value.knownModels[providerKey.value]?.[form.modelType] || []
  return providerKey.value ? `例如 ${known[0] || 'model-id'}` : '输入模型 ID'
})
const modelSuggestions = computed(() => meta.value.knownModels[providerKey.value]?.[form.modelType] || [])

const filteredRef = computed(() => {
  let list = refData.value?.models || []
  if (refProvider.value) list = list.filter(m => m.provider === refProvider.value)
  const kw = refKeyword.value.trim().toLowerCase()
  if (kw) list = list.filter(m => m.id.toLowerCase().includes(kw) || m.name.toLowerCase().includes(kw) || m.provider.toLowerCase().includes(kw))
  return list
})
function protocolLabel(value) {
  return meta.value.apiProtocols.find(p => p.value === value)?.label || value || '—'
}
function formatPrice(value) {
  if (value == null || value === '') return '—'
  return String(value)
}
function formatNumber(value) {
  if (value == null) return '—'
  return new Intl.NumberFormat('zh-CN').format(value)
}

function resetForm() {
  form.provider = ''
  form.modelType = 'text'
  form.modelId = ''
  form.displayName = ''
  form.apiBaseUrl = ''
  form.officialUrl = ''
  form.apiProtocol = 'chat_completions'
  form.inputPrice = null
  form.outputPrice = null
  form.contextWindow = null
  form.enabled = true
  form.isDefault = false
  providerChoice.value = ''
  editingId.value = null
  formError.value = ''
}

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    const [list, metaData] = await Promise.all([api.get('/ai-models'), api.get('/ai-models/meta')])
    models.value = list.models || []
    meta.value = { ...meta.value, ...metaData }
  } catch (err) {
    error.value = err.message || '加载 AI 模型失败。'
  } finally {
    loading.value = false
  }
}

async function reloadModels() {
  const list = await api.get('/ai-models')
  models.value = list.models || []
}

function openAdd() {
  resetForm()
  formMode.value = 'add'
  formOpen.value = true
}

function openEdit(model) {
  resetForm()
  formMode.value = 'edit'
  editingId.value = model.id
  form.provider = model.provider
  form.modelType = model.modelType
  form.modelId = model.modelId
  form.displayName = model.displayName || ''
  form.apiBaseUrl = model.apiBaseUrl || ''
  form.officialUrl = model.officialUrl || ''
  form.apiProtocol = model.apiProtocol || 'chat_completions'
  form.inputPrice = model.inputPrice
  form.outputPrice = model.outputPrice
  form.contextWindow = model.contextWindow
  form.enabled = model.enabled
  form.isDefault = model.isDefault
  const hit = meta.value.providers.find(p => p.label === model.provider)
  providerChoice.value = hit ? hit.key : '__custom__'
  formOpen.value = true
}

function closeForm() {
  formOpen.value = false
  formError.value = ''
}

function onProviderChange() {
  if (providerChoice.value === '__custom__') return
  const p = meta.value.providers.find(x => x.key === providerChoice.value)
  if (!p) return
  const prevKey = meta.value.providers.find(x => x.label === form.provider)?.key || ''
  form.provider = p.label
  if (!form.apiBaseUrl || (prevKey && form.apiBaseUrl === meta.value.providerDefaults[prevKey]?.apiBaseUrl)) {
    const def = meta.value.providerDefaults[p.key]?.apiBaseUrl
    if (def) form.apiBaseUrl = def
  }
}

function onModelTypeChange() {
  // 切换类型后模型 ID 建议会跟随刷新；已填内容保留
}

async function saveModel() {
  formError.value = ''
  const provider = form.provider.trim()
  const modelId = form.modelId.trim()
  if (!provider) { formError.value = '请选择或填写大模型公司名称。'; return }
  if (!modelId) { formError.value = '请填写模型 ID。'; return }
  const payload = {
    provider,
    modelType: form.modelType,
    modelId,
    displayName: form.displayName,
    apiBaseUrl: form.apiBaseUrl,
    officialUrl: form.officialUrl,
    apiProtocol: form.apiProtocol,
    inputPrice: form.inputPrice,
    outputPrice: form.outputPrice,
    contextWindow: form.contextWindow,
    enabled: form.enabled,
    isDefault: form.isDefault,
  }
  saving.value = true
  try {
    if (formMode.value === 'edit' && editingId.value) {
      await api.put(`/ai-models/${editingId.value}`, payload)
      toast('模型已更新', 'success')
    } else {
      await api.post('/ai-models', payload)
      toast('模型已添加', 'success')
    }
    closeForm()
    await reloadModels()
  } catch (err) {
    formError.value = err.message || '保存失败。'
  } finally {
    saving.value = false
  }
}

async function toggleEnabled(model, event) {
  const next = event.target.checked
  try {
    await api.put(`/ai-models/${model.id}`, { enabled: next })
    model.enabled = next
    toast(next ? '模型已启用' : '模型已停用', 'success')
  } catch (err) {
    toast(err.message || '操作失败', 'error')
    event.target.checked = !next
  }
}

async function setDefault(model) {
  defaultBusy.value = true
  try {
    await api.post(`/ai-models/${model.id}/default`)
    toast('已设为默认模型', 'success')
    await reloadModels()
  } catch (err) {
    toast(err.message || '操作失败', 'error')
  } finally {
    defaultBusy.value = false
  }
}

function askDelete(model) {
  deleteTarget.value = model
}
async function confirmDelete() {
  const target = deleteTarget.value
  if (!target) return
  deleting.value = true
  try {
    await api.delete(`/ai-models/${target.id}`)
    toast('模型已删除', 'success')
    deleteTarget.value = null
    await reloadModels()
  } catch (err) {
    toast(err.message || '删除失败', 'error')
    deleteTarget.value = null
  } finally {
    deleting.value = false
  }
}

function openReference() {
  refOpen.value = true
  if (!refData.value) fetchReference()
}
function closeReference() {
  refOpen.value = false
}
async function fetchReference() {
  fetchingRef.value = true
  refError.value = ''
  try {
    refData.value = await api.post('/ai-models/fetch')
    refProvider.value = ''
    refKeyword.value = ''
  } catch (err) {
    refError.value = err.message || '拉取失败。'
  } finally {
    fetchingRef.value = false
  }
}

function fillFromReference(ref) {
  resetForm()
  formMode.value = 'add'
  form.provider = ref.provider
  form.modelId = String(ref.id).split('/').slice(1).join('/') || ref.id
  form.displayName = ref.name || ''
  form.inputPrice = ref.inputPrice
  form.outputPrice = ref.outputPrice
  form.contextWindow = ref.contextLength
  const p = meta.value.providers.find(x => x.label === ref.provider)
  if (p) {
    providerChoice.value = p.key
    const def = meta.value.providerDefaults[p.key]?.apiBaseUrl
    if (def) form.apiBaseUrl = def
  }
  refOpen.value = false
  formOpen.value = true
  toast('已按参考数据填入表单，请核对后保存', 'success')
}

onMounted(loadAll)
</script>
<style scoped>
.ai-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.ai-loading {
  min-height: 260px;
}
.ai-skeleton {
  height: 260px;
  margin: 20px;
}
.ai-head {
  align-items: flex-start;
}
.ai-head-text {
  min-width: 0;
}
.ai-desc {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: var(--color-text-muted);
  max-width: 720px;
}
.ai-head-actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}
@media (max-width: 860px) {
  .ai-head {
    flex-direction: column;
    gap: 12px;
  }
  .ai-head-actions {
    width: 100%;
  }
  .ai-head-actions .btn {
    flex: 1;
  }
}

/* 概览条 */
.ai-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  padding: 16px 20px;
}
@media (max-width: 860px) {
  .ai-summary {
    grid-template-columns: 1fr;
    gap: 10px;
  }
}
.summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  background: var(--color-bg-deep);
  border: 1px solid var(--color-border);
}
.summary-label {
  font-size: 12px;
  color: var(--color-text-muted);
}
.summary-value {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.summary-value.mono {
  font-family: var(--font-mono);
  font-size: 12.5px;
}
.summary-empty {
  color: var(--color-warning);
  font-weight: 500;
}

/* 空态 */
.empty-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 14px;
}
.empty-inline {
  text-align: center;
  color: var(--color-text-muted);
}

/* 模型列表 */
.ai-groups {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.model-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.model-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--color-border);
}
.model-row:last-child {
  border-bottom: none;
}
.model-row:hover {
  background: var(--color-surface-2);
}
.model-main {
  min-width: 0;
  flex: 1;
}
.model-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.provider-chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 10px;
  border-radius: var(--radius-full);
  background: var(--color-info-soft);
  color: var(--color-info);
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
  white-space: nowrap;
}
.model-id {
  font-family: var(--font-mono);
  font-size: 13.5px;
  color: var(--color-text);
  background: var(--color-bg-deep);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  overflow-wrap: anywhere;
}
.model-sub {
  margin-top: 4px;
  font-size: 12.5px;
  color: var(--color-text-secondary);
}
.model-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-top: 8px;
}
.meta-line {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-muted);
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.icon-btn {
  padding: 6px;
  min-height: 30px;
}

/* 弹窗通用 */
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
  max-width: 640px;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 48px);
}
.modal-panel.modal-ref {
  max-width: 920px;
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
.modal-icon.is-info {
  background: var(--color-info-soft);
  color: var(--color-info);
}
.modal-head h3 {
  font-size: 15.5px;
  flex: 1;
}
.modal-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background var(--motion-fast), color var(--motion-fast);
}
.modal-close:hover {
  background: var(--color-surface-3);
  color: var(--color-text);
}
.modal-body {
  padding: 14px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
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

/* 表单 */
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px 16px;
}
.field-span-2 {
  grid-column: 1 / -1;
}
@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
  .field-span-2 {
    grid-column: auto;
  }
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  margin: 0;
}
.field-inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.field-inline .field-hint {
  margin: 0;
}
@media (max-width: 640px) {
  .field-inline {
    flex-direction: column;
    align-items: flex-start;
  }
}
.mono-input {
  font-family: var(--font-mono);
}
.form-switches {
  display: flex;
  gap: 24px;
  padding-top: 4px;
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

/* 参考价目 */
.ref-note {
  margin: 0;
  font-size: 12.5px;
  color: var(--color-text-secondary);
  background: var(--color-warning-soft);
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: var(--radius-md);
  padding: 10px 12px;
}
.ref-init {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 0;
  text-align: center;
  color: var(--color-text-secondary);
}
.ref-init p {
  margin: 0;
  max-width: 480px;
}
.ref-tools {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ref-provider {
  max-width: 220px;
}
.ref-search {
  flex: 1;
}
.ref-count {
  font-size: 12.5px;
  color: var(--color-text-muted);
  white-space: nowrap;
}
@media (max-width: 720px) {
  .ref-tools {
    flex-wrap: wrap;
  }
  .ref-provider {
    max-width: none;
    width: 100%;
  }
}
.ref-table-wrap {
  max-height: 46vh;
  overflow-y: auto;
}
.ref-table {
  min-width: 720px;
}
.ref-fill-cell {
  text-align: right;
  white-space: nowrap;
}
.ref-empty {
  padding: 32px 0;
  text-align: center;
  color: var(--color-text-muted);
}
</style>