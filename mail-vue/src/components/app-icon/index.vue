<template>
  <img
      class="app-icon"
      :class="{ 'is-decorative': decorative }"
      :src="source"
      :alt="label || ''"
      :width="size"
      :height="size"
      :style="{ '--app-icon-size': `${size}px` }"
  />
</template>

<script setup>
import {computed} from 'vue'
import {useUiStore} from '@/store/ui.js'

const props = defineProps({
  name: {type: String, required: true},
  size: {type: [Number, String], default: 20},
  label: {type: String, default: ''},
  decorative: {type: Boolean, default: true},
})

const uiStore = useUiStore()
const assets = import.meta.glob('../../icons/svg/*.svg', {eager: true, query: '?url', import: 'default'})

const resolvedName = computed(() => {
  if (props.name === 'brand-app') return uiStore.dark ? 'brand-app-dark' : 'brand-app-light'
  // The toggle shows the theme the user can switch to, matching the existing interaction.
  if (props.name === 'theme-toggle') return uiStore.dark ? 'theme-light' : 'theme-dark'
  return props.name
})

const source = computed(() => assets[`../../icons/svg/${resolvedName.value}.svg`] || assets['../../icons/svg/status-gray.svg'])
</script>

<style scoped>
.app-icon {
  width: var(--app-icon-size);
  height: var(--app-icon-size);
  display: block;
  flex: 0 0 auto;
  object-fit: contain;
}
</style>
