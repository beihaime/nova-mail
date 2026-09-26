<template>
  <section class="addresses-view">
    <account page-mode />
  </section>
</template>

<script setup>
import { defineOptions } from 'vue'
import account from '@/layout/account/index.vue'

defineOptions({ name: 'addresses' })
</script>

<style scoped>
.addresses-view {
  height: 100%;
  min-height: 0;
  overflow: auto;
  background: var(--el-bg-color);
}
</style>
