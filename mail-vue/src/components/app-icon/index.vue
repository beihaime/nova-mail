<template>
  <span
      v-if="inline"
      class="app-icon"
      :class="{ 'is-decorative': decorative, 'is-inline': true }"
      :data-icon-name="resolvedName"
      :role="decorative ? 'presentation' : 'img'"
      :aria-label="decorative ? undefined : label || resolvedName"
      :style="{ '--app-icon-size': `${size}px` }"
      v-html="rawSource"
  ></span>
  <img
      v-else
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
import {
  appIconAssetKey,
  isPreservedIconColor,
  resolveAppIconAsset,
  resolveAppIconName,
} from '@/utils/app-icon-resolver.js'

const props = defineProps({
  name: {type: String, required: true},
  size: {type: [Number, String], default: 20},
  label: {type: String, default: ''},
  decorative: {type: Boolean, default: true},
  /** Render trusted local SVG markup so its currentColor follows the parent. */
  inline: {type: Boolean, default: false},
  /** Force keep original colors (skip dark-mode invert). Auto-detected for known colored icons. */
  preserve: {type: Boolean, default: false},
})

const uiStore = useUiStore()
const assets = import.meta.glob('../../icons/svg/*.svg', {eager: true, query: '?url', import: 'default'})
const rawAssets = import.meta.glob('../../icons/svg/nova-sidebar-*.svg', {eager: true, query: '?raw', import: 'default'})

const resolvedName = computed(() => resolveAppIconName(props.name, { dark: uiStore.dark }))

const preserveColor = computed(() => props.preserve || isPreservedIconColor(resolvedName.value))

// The asset lookup is constrained to the local icon directory by the resolver;
// a name that is not bundled falls back to a neutral local glyph rather than a
// branding asset.
const source = computed(() => resolveAppIconAsset(assets, props.name, { dark: uiStore.dark }).src)
// Source is restricted to the local icon directory above; no user-provided SVG
// is ever rendered through v-html.
const rawSource = computed(() => rawAssets[appIconAssetKey(resolvedName.value)] || '')
</script>

<style scoped>
.app-icon {
  width: var(--app-icon-size);
  height: var(--app-icon-size);
  display: block;
  flex: 0 0 auto;
  object-fit: contain;
}

:global(.app-icon.is-inline svg) {
  display: block;
  width: 100%;
  height: 100%;
}

/* Monochrome PNG icons are drawn dark; invert them for dark theme. */
:global(html.dark .app-icon:not(.preserve-color):not(.is-inline)) {
  filter: var(--nova-ui-icon-filter);
}

:global(html.dark .app-icon:not(.preserve-color):not(.is-inline):hover) {
  filter: var(--nova-ui-icon-filter-hover);
}

:global(html.dark .app-icon.preserve-color) {
  filter: none;
}
</style>
