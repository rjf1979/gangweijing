<template>
  <div v-if="store.loading" id="app-loading" class="app-loading" role="status" aria-live="polite" aria-atomic="true">
    <div class="loading-mark" aria-hidden="true"><span></span><span></span><span></span></div>
    <strong>{{ store.loadingTitle }}</strong>
    <span>{{ store.loadingTip }}</span>
  </div>
</template>

<script setup>
import { store } from '../store'
</script>
