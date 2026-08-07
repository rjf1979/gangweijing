<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-panel" role="dialog" aria-modal="true" :aria-label="title">
          <div class="modal-head">
            <span class="modal-icon" :class="`is-${tone}`" aria-hidden="true">
              <AppIcon :name="tone === 'danger' ? 'trash' : 'shield'" :size="20" />
            </span>
            <h3>{{ title }}</h3>
          </div>
          <div class="modal-body">{{ message }}</div>
          <div class="modal-foot">
            <button class="btn" type="button" @click="$emit('close')">取消</button>
            <button class="btn" :class="tone === 'danger' ? 'btn-danger' : 'btn-primary'" type="button" :disabled="busy" @click="$emit('confirm')">
              {{ busy ? '处理中…' : confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import AppIcon from './AppIcon.vue'

defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  message: { type: String, default: '' },
  confirmText: { type: String, default: '确认' },
  tone: { type: String, default: 'danger' },
  busy: { type: Boolean, default: false },
})
defineEmits(['close', 'confirm'])
</script>

<style scoped>
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
  max-width: 440px;
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
  flex-shrink: 0;
}
.modal-icon.is-danger {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.modal-icon.is-primary {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.modal-head h3 {
  font-size: 15.5px;
}
.modal-body {
  padding: 14px 20px 20px;
  color: var(--color-text-secondary);
  font-size: 13.5px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
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
.modal-enter-active .modal-panel,
.modal-leave-active .modal-panel {
  transition: transform var(--motion-base);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal-panel,
.modal-leave-to .modal-panel {
  transform: translateY(10px) scale(0.98);
}
</style>