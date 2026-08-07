<template>
  <article id="facts-step" class="task neo-panel" aria-labelledby="facts-title">
    <div class="panel-heading"><span class="step-index" aria-hidden="true">02</span><div><p class="section-kicker">FACT CHECK</p><h2 id="facts-title">确认简历事实</h2><p>只保留真实经历，删改含糊内容并补充可核实信息。</p></div></div>
    <div class="field-block fact-editor"><label for="facts-text">职业事实</label><textarea id="facts-text" v-model="facts" rows="14" placeholder="核对并完善你的职业事实"></textarea></div>
    <p id="facts-error" class="error" role="alert">{{ error }}</p>
    <div class="action-row"><button class="neo-button neo-button-secondary" type="button" @click="emit('back', 'resume')">返回简历</button><button id="facts-next" class="neo-button neo-button-primary" type="button" :disabled="submitting" @click="submit">{{ submitting ? '保存中…' : '确认事实，继续' }}</button></div>
  </article>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api'
import { store, saveDraft, showLoading, hideLoading } from '../store'

const emit = defineEmits(['next', 'back'])

const facts = ref('')
const error = ref('')
const submitting = ref(false)

async function submit() {
  error.value = ''
  const value = facts.value.trim()
  if (!value) {
    error.value = '请确认或补充职业事实。'
    return
  }
  submitting.value = true
  showLoading('正在保存简历事实', '保存完成后进入目标岗位')
  try {
    await api.put('/api/resume', { text: value })
    saveDraft({ facts: value })
    hideLoading()
    emit('next')
  } catch (err) {
    hideLoading()
    submitting.value = false
    error.value = err.message
  }
}

onMounted(() => {
  facts.value = store.draft.facts || store.draft.resumeText || ''
})
</script>
