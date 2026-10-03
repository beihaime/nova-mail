<template>
  <el-tooltip v-if="!mobile" effect="dark" :content="label" :show-after="500">
    <button class="mail-sort-button desktop-sort-button nova-icon-button nova-toolbar-button" type="button" :aria-label="label" @click="$emit('toggle')">
      <Icon class="sort-glyph" :class="{ 'is-ascending': timeSort !== 0 }" icon="solar:sort-vertical-linear" width="21" height="21" />
    </button>
  </el-tooltip>
  <button
      v-else
      class="mobile-tool-button nova-mobile-icon-button mobile-sort"
      type="button"
      :aria-label="t('sortByTime')"
      @click="$emit('toggle')"
  >
    <Icon icon="solar:sort-vertical-linear" width="21" height="21" />
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'

const props = defineProps({
  timeSort: { type: Number, default: 0 },
  mobile: { type: Boolean, default: false },
})

defineEmits(['toggle'])

const { t } = useI18n()
const label = computed(() => t(props.timeSort === 0 ? 'newestFirst' : 'oldestFirst'))
</script>

<style scoped>
.sort-glyph {
  transition: transform 160ms ease;
}

.sort-glyph.is-ascending {
  transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .sort-glyph {
    transition: none;
  }
}
</style>
