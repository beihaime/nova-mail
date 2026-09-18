<template>
  <img
      class="app-icon"
      :class="{ 'is-decorative': decorative, 'preserve-color': preserveColor }"
      :data-icon-name="resolvedName"
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
  /** Force keep original colors (skip dark-mode invert). Auto-detected for known colored icons. */
  preserve: {type: Boolean, default: false},
})

const uiStore = useUiStore()
const assets = import.meta.glob('../../icons/svg/*.svg', {eager: true, query: '?url', import: 'default'})

/** Icons that already carry brand/status colors — must not be inverted in dark mode. */
const PRESERVE_COLOR_ICONS = new Set([
  'add',
  'alert-action',
  'brand-app-dark',
  'brand-app-light',
  'brand-mark',
  'checkbox-checked',
  'checkbox-unchecked',
  'compose',
  'delete-action',
  'document-action',
  'download-action',
  'favorite-action',
  'flag-filled',
  'folder-action',
  'folder-blue',
  'folder-green',
  'folder-orange',
  'folder-purple',
  'folder-red',
  'folder-yellow',
  'inbox',
  'mail-action',
  'more-action',
  'notifications',
  'profile-avatar',
  'send-action',
  'settings-action',
  'star-action',
  'star-filled',
  'status-blue',
  'status-gray',
  'status-green',
  'status-red',
  'status-yellow',
  'tag-action',
])

const resolvedName = computed(() => {
  if (props.name === 'brand-app') return uiStore.dark ? 'brand-app-dark' : 'brand-app-light'
  // The toggle shows the theme the user can switch to, matching the existing interaction.
  if (props.name === 'theme-toggle') return uiStore.dark ? 'theme-light' : 'theme-dark'
  return props.name
})

const preserveColor = computed(() => props.preserve || PRESERVE_COLOR_ICONS.has(resolvedName.value))

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

/* Monochrome PNG icons are drawn dark; invert them for dark theme. */
:global(html.dark .app-icon:not(.preserve-color)) {
  filter: var(--nova-ui-icon-filter);
}

:global(html.dark .app-icon:not(.preserve-color):hover) {
  filter: var(--nova-ui-icon-filter-hover);
}

:global(html.dark .app-icon.preserve-color) {
  filter: none;
}
</style>
