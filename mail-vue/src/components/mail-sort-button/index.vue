<template>
  <el-tooltip v-if="!mobile" effect="dark" :content="label" :show-after="500">
    <button class="mail-sort-button desktop-sort-button" type="button" :aria-label="label" @click="$emit('toggle')">
      <Icon :icon="icon" width="20" height="20" />
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
const icon = computed(() => props.timeSort === 0
  ? 'material-symbols-light:timer-arrow-down-outline'
  : 'material-symbols-light:timer-arrow-up-outline')
</script>

<style scoped>
.desktop-sort-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--nova-button-radius);
  background: transparent;
  color: var(--el-text-color-primary);
  cursor: pointer;
}

.desktop-sort-button:hover {
  background: var(--nova-hover);
}
</style>
