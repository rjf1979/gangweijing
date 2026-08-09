<template>
  <div class="resume-structure">
    <!-- 页头说明 -->
    <section class="intro card">
      <div class="intro-text">
        <h2 class="intro-title">简历结构模板</h2>
        <p class="intro-desc">
          按职业区分简历的推荐区块顺序、字段与撰写重点，作为「上传简历对号入座」的结构蓝本。设计依据：JSON Resume / FRESH 国际标准、中文简历学术惯例、现有系统区块模型（BLOCK_DEFS + FREE_TITLES）与行业招聘实践。
        </p>
      </div>
      <div class="stats" aria-label="模板统计">
        <div class="stat">
          <strong class="stat-num">{{ stats.totalOccupations }}</strong>
          <span class="stat-label">职业模板</span>
        </div>
        <div class="stat">
          <strong class="stat-num">{{ stats.totalSections }}</strong>
          <span class="stat-label">区块类型</span>
        </div>
        <div class="stat">
          <strong class="stat-num">{{ stats.totalFields }}</strong>
          <span class="stat-label">结构化字段</span>
        </div>
      </div>
    </section>

    <!-- 职业切换 -->
    <section class="occupation-picker" aria-label="选择职业">
      <div class="picker-head">
        <label class="picker-label" for="template-search">筛选职业</label>
        <input
          id="template-search"
          v-model.trim="query"
          class="input search-input"
          type="search"
          placeholder="输入岗位 / 关键词，如：产品、Java、CPA…"
        />
      </div>
      <div
        class="tabs"
        role="tablist"
        aria-label="简历结构职业模板"
        :style="{ '--tab-count': filteredTemplates.length }"
      >
        <button
          v-for="tpl in filteredTemplates"
          :id="'tab-' + tpl.id"
          :key="tpl.id"
          role="tab"
          type="button"
          class="tab"
          :class="{ active: tpl.id === activeId }"
          :aria-selected="tpl.id === activeId"
          :aria-controls="'panel-' + tpl.id"
          @click="activate(tpl.id)"
          @keydown="onTabKeydown"
        >
          <span class="tab-name">{{ tpl.name }}</span>
          <span class="tab-count" :title="`${tpl.structure.length} 个区块`">{{ tpl.structure.length }}</span>
        </button>
        <p v-if="!filteredTemplates.length" class="tabs-empty">没有匹配「{{ query }}」的职业模板</p>
      </div>
    </section>

    <!-- 模板详情 -->
    <section
      v-if="template"
      :id="'panel-' + template.id"
      role="tabpanel"
      :aria-labelledby="'tab-' + template.id"
      class="detail"
    >
      <div class="detail-grid">
        <!-- 左：推荐结构顺序 -->
        <div class="structure-column">
          <div class="card structure-card">
            <div class="card-head">
              <h3 class="card-title">推荐结构顺序</h3>
              <button class="btn btn-ghost btn-sm" type="button" @click="toggleAll">
                <AppIcon :name="allExpanded ? 'chevron-right' : 'chevron-down'" :size="15" />
                {{ allExpanded ? '全部收起' : '全部展开' }}
              </button>
            </div>
            <ol class="structure-list">
              <li v-for="item in structure" :key="item.id" class="structure-item" :class="{ required: item.required }">
                <button
                  type="button"
                  class="structure-row"
                  :aria-expanded="isExpanded(item.id)"
                  @click="toggleSection(item.id)"
                >
                  <span class="step" aria-hidden="true">{{ item.order }}</span>
                  <span class="row-main">
                    <span class="row-title">
                      {{ item.section.title }}
                      <span v-if="item.required" class="badge badge-warning badge-mini">必备</span>
                    </span>
                    <span class="row-meta">
                      <span class="kind-chip">{{ KIND_LABELS[item.section.kind] }}</span>
                      <span class="map-chip" :class="'map-' + item.section.systemMap">{{ SYSTEM_MAP_LABELS[item.section.systemMap] }}</span>
                    </span>
                  </span>
                  <AppIcon :name="isExpanded(item.id) ? 'chevron-down' : 'chevron-right'" :size="16" class="row-chevron" decorative />
                </button>

                <div v-if="isExpanded(item.id)" class="structure-body">
                  <p v-if="item.section.note" class="section-note">{{ item.section.note }}</p>

                  <div v-if="item.section.aliases?.length" class="aliases">
                    <span class="mini-label">识别标题</span>
                    <div class="alias-chips">
                      <span v-for="a in item.section.aliases" :key="a" class="chip">{{ a }}</span>
                    </div>
                  </div>

                  <div v-if="item.section.fields?.length" class="fields">
                    <span class="mini-label">关键字段</span>
                    <table class="fields-table">
                      <thead>
                        <tr>
                          <th>字段</th>
                          <th>说明</th>
                          <th>类型</th>
                          <th>要求</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="f in item.section.fields" :key="f.key">
                          <td class="cell-mono">{{ f.key }}</td>
                          <td>{{ f.label }}</td>
                          <td class="cell-secondary">{{ FIELD_TYPE_LABELS[f.type] }}</td>
                          <td>
                            <span v-if="f.required" class="badge badge-warning badge-mini">必备</span>
                            <span v-else class="cell-muted">可选</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </li>
            </ol>
          </div>
        </div>

        <!-- 右：职业画像 + 重点 + 版式预览 -->
        <aside class="side-column">
          <div class="card profile-card">
            <div class="card-head">
              <h3 class="card-title">职业画像</h3>
            </div>
            <div class="card-body">
              <p class="profile-desc">{{ template.description }}</p>
              <div v-if="template.keywords?.length" class="keywords">
                <span class="mini-label">识别关键词</span>
                <div class="keyword-chips">
                  <span v-for="k in template.keywords" :key="k" class="chip chip-keyword">{{ k }}</span>
                </div>
              </div>
              <p v-else class="cell-muted keywords-empty">通用模板，无固定识别关键词，作为默认兜底。</p>
            </div>
          </div>

          <div class="card emphasis-card">
            <div class="card-head">
              <h3 class="card-title">撰写与渲染重点</h3>
            </div>
            <ol class="emphasis-list">
              <li v-for="(e, i) in template.emphasis" :key="i">{{ e }}</li>
            </ol>
          </div>

          <div class="card preview-card">
            <div class="card-head">
              <h3 class="card-title">版式预览</h3>
              <span class="badge badge-neutral badge-mini">示意</span>
            </div>
            <div class="card-body">
              <div class="preview-sheet" aria-hidden="true">
                <div v-for="item in structure" :key="item.id" class="preview-block" :class="'preview-' + item.section.kind">
                  <template v-if="item.section.kind === 'header'">
                    <div class="pv-name">姓名</div>
                    <div class="pv-line pv-line-short"></div>
                    <div class="pv-line pv-line-mid"></div>
                  </template>
                  <template v-else>
                    <div class="pv-head">
                      <span class="pv-title">{{ item.section.title }}</span>
                      <span class="pv-line pv-line-mini"></span>
                    </div>
                    <div v-if="item.section.kind === 'skills'" class="pv-chips">
                      <span v-for="n in 4" :key="n" class="pv-chip"></span>
                    </div>
                    <template v-else-if="item.section.kind === 'list'">
                      <div class="pv-line pv-line-mid"></div>
                      <div class="pv-line pv-line-full"></div>
                    </template>
                    <template v-else-if="item.section.kind === 'text'">
                      <div class="pv-line pv-line-full"></div>
                      <div class="pv-line pv-line-mid"></div>
                    </template>
                    <template v-else>
                      <div class="pv-line pv-line-mid"></div>
                    </template>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import {
  OCCUPATION_TEMPLATES,
  KIND_LABELS,
  SYSTEM_MAP_LABELS,
  FIELD_TYPE_LABELS,
  getTemplateById,
  getStructureWithSections,
  templateStats,
} from '../data/resumeStructureTemplates.js'

const query = ref('')
const activeId = ref('general')
const expanded = reactive(new Set())

const stats = templateStats()

const filteredTemplates = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return OCCUPATION_TEMPLATES
  return OCCUPATION_TEMPLATES.filter(tpl => {
    const haystack = [tpl.name, tpl.description, ...(tpl.keywords || [])].join(' ').toLowerCase()
    return haystack.includes(q)
  })
})

const template = computed(() => getTemplateById(activeId.value))
const structure = computed(() => getStructureWithSections(template.value))

const allExpanded = computed(() => structure.value.length > 0 && structure.value.every(item => expanded.has(item.id)))

function isExpanded(id) {
  return expanded.has(id)
}
function toggleSection(id) {
  if (expanded.has(id)) expanded.delete(id)
  else expanded.add(id)
}
function toggleAll() {
  if (allExpanded.value) {
    structure.value.forEach(item => expanded.delete(item.id))
  } else {
    structure.value.forEach(item => expanded.add(item.id))
  }
}
function activate(id) {
  activeId.value = id
  const tab = document.getElementById('tab-' + id)
  tab?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' })
}
function onTabKeydown(event) {
  const tabs = [...document.querySelectorAll('.tabs [role="tab"]')]
  const index = tabs.indexOf(event.currentTarget)
  let next = index
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length
  else return
  event.preventDefault()
  const target = tabs[next]
  if (target) {
    target.focus()
    activate(target.id.replace('tab-', ''))
  }
}

onMounted(() => {
  // 默认展开前三个区块，方便快速浏览
  structure.value.slice(0, 3).forEach(item => expanded.add(item.id))
})

watch(filteredTemplates, (list) => {
  if (!list.some(t => t.id === activeId.value)) {
    const next = list[0]
    if (next) activeId.value = next.id
  }
})
</script>

<style scoped>
.resume-structure {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* ===== 页头 ===== */
.intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 20px 24px;
}
.intro-title {
  font-size: 16px;
  margin-bottom: 6px;
}
.intro-desc {
  margin: 0;
  max-width: 760px;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}
.stats {
  display: flex;
  gap: 22px;
  flex-shrink: 0;
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.stat-num {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-primary);
  font-variant-numeric: tabular-nums;
}
.stat-label {
  font-size: 11.5px;
  color: var(--color-text-muted);
}

/* ===== 职业切换 ===== */
.occupation-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.picker-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.picker-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}
.search-input {
  max-width: 360px;
}
.tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 2px 2px 6px;
  scrollbar-width: thin;
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: all var(--motion-fast);
  flex-shrink: 0;
}
.tab:hover {
  border-color: var(--color-border-strong);
  color: var(--color-text);
}
.tab.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #04140a;
  font-weight: 600;
  box-shadow: var(--shadow-primary);
}
.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--radius-full);
  background: var(--color-surface-3);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.tab.active .tab-count {
  background: rgba(4, 20, 10, 0.16);
}
.tabs-empty {
  margin: 0;
  padding: 10px 4px;
  color: var(--color-text-muted);
  font-size: 13px;
}

/* ===== 详情两栏 ===== */
.detail-grid {
  display: grid;
  grid-template-columns: 7fr 5fr;
  gap: 18px;
  align-items: start;
}
@media (max-width: 1080px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}

/* ===== 结构列表 ===== */
.structure-list {
  list-style: none;
  margin: 0;
  padding: 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.structure-item {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-deep);
  overflow: hidden;
  transition: border-color var(--motion-fast);
}
.structure-item:hover {
  border-color: var(--color-border-strong);
}
.structure-item.required {
  border-left: 3px solid var(--color-warning);
}
.structure-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: none;
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.structure-row:hover {
  background: var(--color-surface-2);
}
.step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-full);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 12.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.row-title {
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.row-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.kind-chip,
.map-chip {
  font-size: 11px;
  line-height: 20px;
  padding: 0 8px;
  border-radius: var(--radius-full);
}
.kind-chip {
  background: var(--color-surface-3);
  color: var(--color-text-secondary);
}
.map-chip {
  background: var(--color-info-soft);
  color: var(--color-info);
}
.map-chip.map-block {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.map-chip.map-free {
  background: var(--color-surface-3);
  color: var(--color-text-secondary);
}
.map-chip.map-new {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.row-chevron {
  color: var(--color-text-muted);
  flex-shrink: 0;
}
.structure-body {
  padding: 4px 14px 16px 52px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.section-note {
  margin: 0;
  font-size: 12.5px;
  color: var(--color-text-secondary);
  line-height: 1.7;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
}
.mini-label {
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}
.alias-chips,
.keyword-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  font-size: 11.5px;
  line-height: 24px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}
.chip-keyword {
  background: var(--color-info-soft);
  border-color: transparent;
  color: var(--color-info);
}
.fields-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.fields-table th {
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
  padding: 6px 8px;
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}
.fields-table td {
  padding: 7px 8px;
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}
.fields-table tbody tr:last-child td {
  border-bottom: none;
}
.cell-mono {
  font-family: var(--font-mono);
  font-size: 12px;
  white-space: nowrap;
}
.cell-secondary {
  color: var(--color-text-secondary);
}
.cell-muted {
  color: var(--color-text-muted);
  font-size: 12px;
}
.badge-mini {
  padding: 0 8px;
  font-size: 11px;
  line-height: 18px;
}

/* ===== 右侧栏 ===== */
.side-column {
  display: flex;
  flex-direction: column;
  gap: 18px;
  position: sticky;
  top: calc(var(--topbar-height) + 18px);
}
.profile-desc {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.75;
}
.keywords {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.keywords-empty {
  margin: 0;
}
.emphasis-list {
  margin: 0;
  padding: 14px 20px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  counter-reset: em;
}
.emphasis-list li {
  position: relative;
  padding-left: 24px;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.65;
}
.emphasis-list li::before {
  counter-increment: em;
  content: counter(em);
  position: absolute;
  left: 0;
  top: 1px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 10.5px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* ===== 版式预览 ===== */
.preview-sheet {
  background: #fff;
  color: #0b1120;
  border-radius: var(--radius-md);
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--shadow-md);
}
.preview-block {
  border: 1px dashed rgba(11, 17, 32, 0.14);
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.preview-block.preview-header {
  border: none;
  padding: 2px 0;
  gap: 6px;
}
.pv-name {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.pv-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.pv-title {
  font-size: 11.5px;
  font-weight: 700;
  color: #0b1120;
}
.pv-line {
  height: 5px;
  border-radius: 3px;
  background: #d7dee9;
}
.pv-line-short { width: 44%; }
.pv-line-mid { width: 68%; }
.pv-line-mini { width: 18%; }
.pv-line-full { width: 100%; }
.pv-chips {
  display: flex;
  gap: 5px;
}
.pv-chip {
  width: 30px;
  height: 10px;
  border-radius: 5px;
  background: #d7dee9;
}

@media (max-width: 860px) {
  .intro {
    flex-direction: column;
    align-items: flex-start;
  }
  .stats {
    width: 100%;
    justify-content: space-between;
  }
  .side-column {
    position: static;
  }
}
</style>


