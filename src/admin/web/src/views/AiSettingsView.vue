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
              候选模型池 + 多套 API Key 配合：模型库维护可用大模型，每个模型可绑定官方或中转站的 Key；
              「当前使用的 Key」与「默认模型」即当前生效组合。第三方参考价目仅辅助填写。
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
            <span class="summary-label">当前使用的 Key</span>
            <span v-if="defaultKey" class="summary-value mono">
              {{ defaultKey.name }}
              <span v-if="defaultKey.baseUrl" class="summary-key-url" :title="defaultKey.baseUrl">{{ defaultKey.baseUrl }}</span>
            </span>
            <span v-else class="summary-value summary-empty">未设置（走系统设置兜底）</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">默认文本模型</span>
            <span v-if="defaultText" class="summary-value mono">{{ defaultText.provider }} · {{ defaultText.modelId }}</span>
            <span v-else class="summary-value summary-empty">未设置</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">截图识别模型</span>
            <span v-if="screenshotModel" class="summary-value mono">
              {{ screenshotModel.provider }} · {{ screenshotModel.modelId }}
              <span class="badge badge-info">多模态</span>
            </span>
            <span v-else class="summary-value summary-empty">未设置</span>
          </div>
        </div>
      </section>

      <!-- 接口调用配置 -->
      <section class="card">
        <div class="card-head">
          <div class="ai-head-text">
            <h3 class="card-title">接口调用</h3>
            <p class="ai-desc">
              AI 接口调用支持长文本（最大 1M 字符），生成大段 HTML 模板时超时按下方秒数等待；请根据实际耗时调大。
            </p>
          </div>
        </div>
        <div class="card-body call-config-body">
          <div class="call-config-row">
            <label class="field call-field" for="call-timeout">
              <span class="field-label">接口调用超时（秒）</span>
              <input
                id="call-timeout"
                v-model.number="callTimeout"
                class="input"
                type="number"
                min="30"
                max="3600"
                step="30"
              />
            </label>
            <div class="call-config-actions">
              <button class="btn btn-primary" type="button" :disabled="savingCall" @click="saveCallTimeout">
                <AppIcon name="check" :size="15" />
                {{ savingCall ? '保存中…' : '保存' }}
              </button>
              <span v-if="callSaved" class="call-saved">已保存</span>
            </div>
          </div>
          <p class="call-hint">说明：模板 AI 生成实测约 110-125 秒，默认 300 秒足够；如需生成更长内容可在 30-3600 秒范围内调整。接口请求体已放大至 5MB，可承载 1M 字符级长文本。</p>
          <p v-if="callError" class="call-error">{{ callError }}</p>
        </div>
      </section>

      <!-- API Key 池 -->
      <section class="card">
        <div class="card-head">
          <div class="ai-head-text">
            <h3 class="card-title">API Key 池</h3>
            <p class="ai-desc">
              官方与中转站等多套凭证共存：每套 Key 自带 Base URL 与密钥，可分别「设为当前使用」；
              模型在「绑定 API Key」中选择使用哪套，未绑定的模型跟随当前使用的 Key。
            </p>
          </div>
          <div class="ai-head-actions">
            <button class="btn btn-primary" type="button" @click="openKeyAdd">
              <AppIcon name="plus" :size="15" /> 添加 Key
            </button>
          </div>
        </div>

        <div v-if="keys.length === 0" class="card-body empty-inline">
          还没有配置任何 API Key。添加官方或中转站的 Key 后，才能在模型上绑定使用。
        </div>

        <ul v-else class="model-list">
          <li v-for="key in keys" :key="key.id" class="model-row">
            <div class="model-main">
              <div class="model-title">
                <span class="key-name">{{ key.name }}</span>
                <span v-if="key.isDefault" class="badge badge-success">当前使用</span>
                <span v-if="key.provider" class="provider-chip">{{ key.provider }}</span>
                <span v-if="!key.enabled" class="badge badge-neutral">已停用</span>
              </div>
              <div class="model-meta">
                <span v-if="key.baseUrl" class="meta-line" :title="key.baseUrl">
                  <AppIcon name="link" :size="12" />{{ key.baseUrl }}
                </span>
                <span class="meta-line mono">{{ key.apiKeyMasked || '未配置密钥' }}</span>
                <span class="meta-line">绑定模型 {{ boundModelCount(key.id) }} 个</span>
                <span v-if="key.remark" class="meta-line">{{ key.remark }}</span>
              </div>
            </div>
            <div class="model-actions">
              <label class="switch" :title="key.enabled ? '点击停用' : '点击启用'">
                <input type="checkbox" :checked="key.enabled" :aria-label="`启用 ${key.name}`" @change="toggleKeyEnabled(key, $event)" />
                <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
              </label>
              <button v-if="!key.isDefault" class="btn btn-ghost btn-sm" type="button" :disabled="keyBusy" @click="setDefaultKey(key)">
                <AppIcon name="check-circle" :size="14" /> 设为当前使用
              </button>
              <button class="btn btn-ghost btn-sm icon-btn" type="button" :aria-label="`编辑 ${key.name}`" :title="`编辑 ${key.name}`" @click="openKeyEdit(key)">
                <AppIcon name="edit" :size="14" />
              </button>
              <button class="btn btn-ghost btn-sm icon-btn" type="button" :aria-label="`删除 ${key.name}`" :title="`删除 ${key.name}`" @click="askDeleteKey(key)">
                <AppIcon name="trash" :size="14" />
              </button>
            </div>
          </li>
        </ul>
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
                  <span v-if="model.multimodal" class="badge badge-info">多模态</span>
                </div>
                <div v-if="model.displayName" class="model-sub">{{ model.displayName }}</div>
                <div class="model-meta">
                  <span v-if="model.apiKeyName" class="meta-line" :title="`绑定 Key：${model.apiKeyName}`">
                    <AppIcon name="key" :size="12" />{{ model.apiKeyName }}
                  </span>
                  <span v-else-if="defaultKey" class="meta-line" :title="`跟随当前使用的 Key：${defaultKey.name}`">
                    <AppIcon name="key" :size="12" />跟随 {{ defaultKey.name }}
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
                    <p class="field-hint">选择知名厂商会带出该厂商的常见模型 ID 提示，也可以选「自定义厂商」手动填写。</p>
                  </div>

                  <div v-if="providerChoice === '__custom__'" class="field field-span-2">
                    <label class="field-label" for="model-custom-provider">自定义厂商名称</label>
                    <input id="model-custom-provider" v-model.trim="form.provider" class="input" maxlength="60" placeholder="例如：某公司大模型平台" required />
                  </div>

                  <div class="field">
                    <label class="field-label" for="model-protocol">接口协议</label>
                    <select id="model-protocol" v-model="form.apiProtocol" class="select">
                      <option v-for="p in meta.apiProtocols" :key="p.value" :value="p.value">{{ p.label }}</option>
                    </select>
                  </div>

                  <div class="field">
                    <label class="field-label" for="model-display">显示名称</label>
                    <input id="model-display" v-model.trim="form.displayName" class="input" maxlength="120" placeholder="可选，便于识别" />
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
                      <p class="field-hint">调用接口时实际使用的模型标识；输入时可按厂商与是否多模态提示常见 ID。</p>
                      <button class="btn btn-sm btn-ghost" type="button" @click="openReference">
                        <AppIcon name="download" :size="13" /> 从参考价目填入
                      </button>
                    </div>
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

                  <div class="field">
                    <label class="field-label" for="model-official-url">官网地址（可选）</label>
                    <input id="model-official-url" v-model.trim="form.officialUrl" class="input" :placeholder="officialUrlPlaceholder" />
                  </div>

                  <div class="field field-span-2">
                    <label class="field-label" for="model-api-key">绑定 API Key</label>
                    <select id="model-api-key" v-model="form.apiKeyId" class="select">
                      <option :value="null">跟随当前使用的 Key（自动）</option>
                      <option v-for="k in enabledKeys" :key="k.id" :value="k.id">{{ k.name }}{{ k.isDefault ? '（当前使用）' : '' }}</option>
                    </select>
                    <p class="field-hint">调用时优先使用该模型绑定的 Key；不绑定则使用「当前使用的 Key」。官方模型绑官方 Key，中转模型绑中转 Key。</p>
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
                  <label class="switch">
                    <input v-model="form.multimodal" type="checkbox" />
                    <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
                    <span class="switch-text">支持多模态（视觉输入）</span>
                  </label>
                </div>
                <p class="field-hint">
                  勾选后，截图识别（OCR）将复用该模型；请确认模型本身支持图片/视觉输入。
                </p>

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
    <!-- 添加 / 编辑 API Key 弹窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="keyFormOpen" class="modal-overlay" @click.self="closeKeyForm">
          <div class="modal-panel" role="dialog" aria-modal="true" :aria-label="keyFormMode === 'edit' ? '编辑 API Key' : '添加 API Key'">
            <form novalidate @submit.prevent="saveKey">
              <div class="modal-head">
                <span class="modal-icon is-primary" aria-hidden="true"><AppIcon name="key" :size="20" /></span>
                <h3>{{ keyFormMode === 'edit' ? '编辑 API Key' : '添加 API Key' }}</h3>
                <button class="modal-close" type="button" aria-label="关闭" @click="closeKeyForm"><AppIcon name="x" :size="16" /></button>
              </div>
              <div class="modal-body">
                <div class="form-grid">
                  <div class="field field-span-2">
                    <label class="field-label" for="key-name">Key 名称</label>
                    <input id="key-name" v-model.trim="keyForm.name" class="input" maxlength="60" placeholder="例如：DeepSeek 官方 / 中转站 A" required />
                    <p class="field-hint">便于识别的名称，将显示在模型绑定与「当前生效配置」中。</p>
                  </div>
                  <div class="field field-span-2">
                    <label class="field-label" for="key-provider">来源 / 厂商（可选）</label>
                    <select id="key-provider" v-model="keyForm.providerChoice" class="select" @change="onKeyProviderChange">
                      <option value="__none__">不填（通用中转）</option>
                      <option v-for="p in meta.providers" :key="p.key" :value="p.key">{{ p.label }}</option>
                      <option value="__custom__">自定义来源…</option>
                    </select>
                    <input v-if="keyForm.providerChoice === '__custom__'" v-model.trim="keyForm.provider" class="input mono-input" maxlength="60" placeholder="例如：某中转服务商" />
                  </div>
                  <div class="field field-span-2">
                    <label class="field-label" for="key-api-key">API Key</label>
                    <input id="key-api-key" v-model.trim="keyForm.apiKey" class="input mono-input" type="password" autocomplete="off" :placeholder="keyForm.apiKeyPlaceholder || 'sk-…（编辑时留空表示不修改）'" />
                    <div class="field-inline">
                      <p class="field-hint">密钥仅以掩码显示，不会回传明文。</p>
                      <label class="switch">
                        <input v-model="keyForm.clearKey" type="checkbox" />
                        <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
                        <span class="switch-text">保存后清除密钥</span>
                      </label>
                    </div>
                  </div>
                  <div class="field field-span-2">
                    <label class="field-label" for="key-base-url">Base URL</label>
                    <input id="key-base-url" v-model.trim="keyForm.baseUrl" class="input mono-input" placeholder="https://api.example.com/v1" />
                    <p class="field-hint">官方 Key 填官方地址，中转站 Key 填中转地址；模型未单独填 API 地址时使用此地址。</p>
                  </div>
                  <div class="field field-span-2">
                    <label class="field-label" for="key-remark">备注（可选）</label>
                    <input id="key-remark" v-model.trim="keyForm.remark" class="input" maxlength="300" placeholder="例如：余额 / 限流说明" />
                  </div>
                </div>
                <div class="form-grid form-switches">
                  <label class="switch">
                    <input v-model="keyForm.enabled" type="checkbox" />
                    <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
                    <span class="switch-text">启用该 Key</span>
                  </label>
                  <label class="switch">
                    <input v-model="keyForm.isDefault" type="checkbox" />
                    <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
                    <span class="switch-text">设为当前使用</span>
                  </label>
                </div>
                <p class="field-hint">「当前使用」的 Key 是未绑定模型的默认凭证；同一时间只能有一个。</p>
                <p v-if="keyFormError" class="field-error" role="alert">{{ keyFormError }}</p>
              </div>
              <div class="modal-foot">
                <button class="btn" type="button" @click="closeKeyForm">取消</button>
                <button class="btn btn-primary" type="submit" :disabled="savingKey">
                  {{ savingKey ? '保存中…' : (keyFormMode === 'edit' ? '保存修改' : '添加 Key') }}
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
                数据来源：OpenRouter 第三方代理（非各厂商官方账单价）。抓取结果会<strong>保存到参考价目库</strong>，仅作填写参考；
                点「填入」后<strong>仍需手动确认</strong>模型 ID 与 API 地址，并点击保存才会写入正式 AI 配置。
              </p>

              <div v-if="!refData" class="ref-init">
                <p>尚未拉取过参考价目。首次拉取会把国内外知名大模型厂商的模型与价位（约 20 家）记录到数据库，后续可手动更新。</p>
                <button class="btn btn-primary" type="button" :disabled="fetchingRef" @click="fetchReference">
                  <AppIcon name="download" :size="15" />
                  {{ fetchingRef ? '拉取中…' : '首次拉取价目' }}
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
                  <span v-if="refData.fetchedAt" class="ref-updated" title="最近一次抓取保存时间">上次更新 {{ formatDateTime(refData.fetchedAt) }}</span>
                  <button class="btn btn-sm" type="button" :disabled="fetchingRef" @click="fetchReference">
                    <AppIcon name="download" :size="13" />
                    {{ fetchingRef ? '更新中…' : '手动更新' }}
                  </button>
                </div>
                <p v-if="refError" class="field-error" role="alert">{{ refError }}</p>

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

    <ConfirmDialog
      :open="keyDeleteTarget !== null"
      title="删除 API Key"
      :message="keyDeleteTarget ? `将删除「${keyDeleteTarget.name}」。绑定该 Key 的模型将自动改为跟随当前使用的 Key。` : ''"
      confirm-text="确认删除"
      :busy="deletingKey"
      @close="keyDeleteTarget = null"
      @confirm="confirmDeleteKey"
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
const keys = ref([])
const meta = ref({
  providers: [],
  modelTypes: [{ value: 'text', label: '文本模型' }],
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
  officialUrl: '',
  apiProtocol: 'chat_completions',
  inputPrice: null,
  outputPrice: null,
  contextWindow: null,
  enabled: true,
  isDefault: false,
  multimodal: false,
  apiKeyId: null,
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

// API Key 池
const keyFormOpen = ref(false)
const keyFormMode = ref('add')
const savingKey = ref(false)
const keyFormError = ref('')
const keyEditingId = ref(null)
const keyBusy = ref(false)
const keyDeleteTarget = ref(null)
const deletingKey = ref(false)
  // 接口调用配置
  const callTimeout = ref(300)
  const savingCall = ref(false)
  const callError = ref('')
  const callSaved = ref(false)

  const keyForm = reactive({
  name: '',
  providerChoice: '__none__',
  provider: '',
  apiKey: '',
  apiKeyPlaceholder: '',
  baseUrl: '',
  remark: '',
  enabled: true,
  isDefault: false,
  clearKey: false,
})

const groups = computed(() => [
  { type: 'all', label: '全部模型', items: models.value },
])
const defaultText = computed(() => models.value.find(m => m.modelType === 'text' && m.isDefault) || null)
// 截图识别模型：优先默认文本模型且支持多模态，其次任意启用的多模态模型
const screenshotModel = computed(() => {
  if (!models.value.length) return null
  const def = models.value.find(m => m.multimodal && m.isDefault && m.enabled) || null
  if (def) return def
  return models.value.find(m => m.multimodal && m.enabled) || null
})
const defaultKey = computed(() => keys.value.find(k => k.isDefault) || null)
const enabledKeys = computed(() => keys.value.filter(k => k.enabled))

const providerOptions = computed(() => [
  ...meta.value.providers.map(p => ({ value: p.key, label: p.label })),
  { value: '__custom__', label: '自定义厂商…' },
])

const providerKey = computed(() => {
  const hit = meta.value.providers.find(p => p.label === form.provider)
  return hit ? hit.key : ''
})
const officialUrlPlaceholder = computed(() => providerKey.value ? (meta.value.providerDefaults[providerKey.value]?.officialUrl || 'https://…') : 'https://…')
const suggestionKind = computed(() => (form.multimodal ? 'multimodal' : 'text'))
const modelIdPlaceholder = computed(() => {
  const known = meta.value.knownModels[providerKey.value]?.[suggestionKind.value] || []
  return providerKey.value ? `例如 ${known[0] || 'model-id'}` : '输入模型 ID'
})
const modelSuggestions = computed(() => meta.value.knownModels[providerKey.value]?.[suggestionKind.value] || [])

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
function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d)
}

function resetForm() {
  form.provider = ''
  form.modelType = 'text'
  form.modelId = ''
  form.displayName = ''
  form.officialUrl = ''
  form.apiProtocol = 'chat_completions'
  form.inputPrice = null
  form.outputPrice = null
  form.contextWindow = null
  form.enabled = true
  form.isDefault = false
  form.multimodal = false
  form.apiKeyId = null
  providerChoice.value = ''
  editingId.value = null
  formError.value = ''
}

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    const [list, metaData, keyData, settingsData] = await Promise.all([api.get('/ai-models'), api.get('/ai-models/meta'), api.get('/ai-keys'), api.get('/settings')])
    models.value = list.models || []
    keys.value = keyData.keys || []
    meta.value = { ...meta.value, ...metaData }
    callTimeout.value = settingsData?.settings?.ai_call_timeout_seconds ?? 300
  } catch (err) {
    error.value = err.message || '加载 AI 模型失败。'
  } finally {
    loading.value = false
  }
}

async function reloadModels() {
  const [list, keyData] = await Promise.all([api.get('/ai-models'), api.get('/ai-keys')])
  models.value = list.models || []
  keys.value = keyData.keys || []
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
  form.officialUrl = model.officialUrl || ''
  form.apiProtocol = model.apiProtocol || 'chat_completions'
  form.inputPrice = model.inputPrice
  form.outputPrice = model.outputPrice
  form.contextWindow = model.contextWindow
  form.enabled = model.enabled
  form.isDefault = model.isDefault
  form.multimodal = Boolean(model.multimodal)
  form.apiKeyId = model.apiKeyId || null
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
  form.provider = p.label
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
    officialUrl: form.officialUrl,
    apiProtocol: form.apiProtocol,
    inputPrice: form.inputPrice,
    outputPrice: form.outputPrice,
    contextWindow: form.contextWindow,
    enabled: form.enabled,
    isDefault: form.isDefault,
    multimodal: form.multimodal,
    apiKeyId: form.apiKeyId,
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

function resetKeyForm() {
  keyForm.name = ''
  keyForm.providerChoice = '__none__'
  keyForm.provider = ''
  keyForm.apiKey = ''
  keyForm.apiKeyPlaceholder = ''
  keyForm.baseUrl = ''
  keyForm.remark = ''
  keyForm.enabled = true
  keyForm.isDefault = false
  keyForm.clearKey = false
  keyEditingId.value = null
  keyFormError.value = ''
}
function openKeyAdd() {
  resetKeyForm()
  keyFormMode.value = 'add'
  keyFormOpen.value = true
}
function openKeyEdit(key) {
  resetKeyForm()
  keyFormMode.value = 'edit'
  keyEditingId.value = key.id
  keyForm.name = key.name
  keyForm.apiKeyPlaceholder = key.apiKeyMasked || ''
  keyForm.baseUrl = key.baseUrl || ''
  keyForm.remark = key.remark || ''
  keyForm.enabled = key.enabled
  keyForm.isDefault = key.isDefault
  const hit = meta.value.providers.find(p => p.label === key.provider)
  keyForm.providerChoice = hit ? hit.key : (key.provider ? '__custom__' : '__none__')
  keyForm.provider = key.provider || ''
  keyFormOpen.value = true
}
function closeKeyForm() {
  keyFormOpen.value = false
  keyFormError.value = ''
}
function onKeyProviderChange() {
  if (keyForm.providerChoice === '__custom__') {
    if (!keyForm.provider) keyForm.provider = '自定义'
    return
  }
  if (keyForm.providerChoice === '__none__') {
    keyForm.provider = ''
    return
  }
  const p = meta.value.providers.find(x => x.key === keyForm.providerChoice)
  keyForm.provider = p ? p.label : ''
  if (!keyForm.baseUrl) {
    const def = meta.value.providerDefaults[keyForm.providerChoice]?.apiBaseUrl
    if (def) keyForm.baseUrl = def
  }
}
async function saveKey() {
  keyFormError.value = ''
  const name = keyForm.name.trim()
  if (!name) { keyFormError.value = '请填写 Key 名称。'; return }
  const payload = {
    name,
    provider: keyForm.provider || '',
    apiKey: keyForm.apiKey,
    baseUrl: keyForm.baseUrl,
    remark: keyForm.remark,
    enabled: keyForm.enabled,
    isDefault: keyForm.isDefault,
    clearKey: keyForm.clearKey,
  }
  savingKey.value = true
  try {
    if (keyFormMode.value === 'edit' && keyEditingId.value) {
      await api.put(`/ai-keys/${keyEditingId.value}`, payload)
      toast('Key 已更新', 'success')
    } else {
      await api.post('/ai-keys', payload)
      toast('Key 已添加', 'success')
    }
    closeKeyForm()
    await reloadModels()
  } catch (err) {
    keyFormError.value = err.message || '保存失败。'
  } finally {
    savingKey.value = false
  }
}
async function toggleKeyEnabled(key, event) {
  const next = event.target.checked
  try {
    await api.put(`/ai-keys/${key.id}`, { enabled: next })
    key.enabled = next
    toast(next ? 'Key 已启用' : 'Key 已停用', 'success')
  } catch (err) {
    toast(err.message || '操作失败', 'error')
    event.target.checked = !next
  }
}
async function setDefaultKey(key) {
  keyBusy.value = true
  try {
    await api.post(`/ai-keys/${key.id}/default`)
    toast('已设为当前使用的 Key', 'success')
    await reloadModels()
  } catch (err) {
    toast(err.message || '操作失败', 'error')
  } finally {
    keyBusy.value = false
  }
}
function askDeleteKey(key) {
  keyDeleteTarget.value = key
}
async function confirmDeleteKey() {
  const target = keyDeleteTarget.value
  if (!target) return
  deletingKey.value = true
  try {
    await api.delete(`/ai-keys/${target.id}`)
    toast('Key 已删除', 'success')
    keyDeleteTarget.value = null
    await reloadModels()
  } catch (err) {
    toast(err.message || '删除失败', 'error')
    keyDeleteTarget.value = null
  } finally {
    deletingKey.value = false
  }
}
function boundModelCount(keyId) {
  return models.value.filter(m => m.apiKeyId === keyId).length
}

function openReference() {
  refOpen.value = true
  if (!refData.value) loadReference()
}
function closeReference() {
  refOpen.value = false
}
async function loadReference() {
  refError.value = ''
  try {
    const data = await api.get('/ai-models/reference')
    refData.value = data.total > 0 ? data : null
    refProvider.value = ''
    refKeyword.value = ''
  } catch (err) {
    refError.value = err.message || '读取参考价目失败。'
  }
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
  if (p) providerChoice.value = p.key
  refOpen.value = false
  formOpen.value = true
  toast('已按参考数据填入表单，请核对后保存', 'success')
}

async function saveCallTimeout() {
  const n = Math.round(Number(callTimeout.value))
  if (!Number.isFinite(n) || n < 30 || n > 3600) {
    callError.value = '超时时间需为 30-3600 秒。'
    return
  }
  savingCall.value = true
  callError.value = ''
  callSaved.value = false
  try {
    await api.put('/settings', { aiCallTimeoutSeconds: n })
    callTimeout.value = n
    callSaved.value = true
    setTimeout(() => { callSaved.value = false }, 2000)
  } catch (err) {
    callError.value = err.message || '保存失败。'
  } finally {
    savingCall.value = false
  }
}

onMounted(loadAll)
</script>
<style scoped>
.ai-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.call-config-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.call-config-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}
.call-field {
  flex: 1 1 260px;
}
.call-config-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.call-saved {
  font-size: 12.5px;
  color: var(--color-success, #22c55e);
}
.call-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 0;
  line-height: 1.6;
}
.call-error {
  font-size: 12.5px;
  color: var(--color-danger);
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
.modal-panel > form {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.modal-panel.modal-ref {
  max-width: 920px;
}
.modal-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px 0;
  flex-shrink: 0;
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
  flex: 1;
  min-height: 0;
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-deep);
  flex-shrink: 0;
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
.ref-updated {
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
/* Key 池 */
.key-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text);
}
.key-name + .badge,
.key-name + .provider-chip {
  margin-left: 8px;
}
.summary-key-url {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}
.meta-line .app-icon {
  margin-right: 4px;
}
</style>
