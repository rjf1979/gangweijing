<template>
  <router-view />
  <div class="toast-viewport" role="status" aria-live="polite">
    <transition-group name="toast">
      <div v-for="item in store.toasts" :key="item.id" class="toast-item" :class="`toast-${item.type}`">
        <span class="toast-dot" aria-hidden="true"></span>
        {{ item.message }}
      </div>
    </transition-group>
  </div>
</template>

<script setup>
import { store } from './store'
</script>

<style scoped>
.toast-viewport {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.toast-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 260px;
  max-width: 420px;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  background: var(--color-surface-3);
  border: 1px solid var(--color-border-strong);
  box-shadow: var(--shadow-lg);
  font-size: 13.5px;
  color: var(--color-text);
  pointer-events: auto;
}
.toast-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-success);
  flex-shrink: 0;
}
.toast-warning .toast-dot { background: var(--color-warning); }
.toast-error .toast-dot { background: var(--color-danger); }
.toast-info .toast-dot { background: var(--color-info); }

.toast-enter-active,
.toast-leave-active {
  transition: opacity var(--motion-base), transform var(--motion-base);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(16px);
}
</style>