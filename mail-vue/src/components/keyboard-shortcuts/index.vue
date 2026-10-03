<template>
  <el-dialog
      v-model="visible"
      class="keyboard-shortcuts-dialog"
      width="min(620px, calc(100vw - 32px))"
      :title="t('keyboardShortcuts')"
      :append-to-body="true"
  >
    <div class="shortcut-grid">
      <section v-for="section in sections" :key="section.title" class="shortcut-section">
        <h3>{{ t(section.title) }}</h3>
        <div v-for="item in section.items" :key="item.label" class="shortcut-row">
          <span class="shortcut-keys">
            <kbd v-for="key in item.keys" :key="key">{{ key }}</kbd>
          </span>
          <span>{{ t(item.label) }}</span>
        </div>
      </section>
    </div>
  </el-dialog>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const sections = [
  {
    title: 'shortcutGeneral',
    items: [
      { keys: ['C'], label: 'shortcutComposeAction' },
      { keys: ['/'], label: 'shortcutSearch' },
      { keys: ['?'], label: 'shortcutShowShortcuts' },
      { keys: ['Esc'], label: 'shortcutCloseBack' },
    ],
  },
  {
    title: 'shortcutNavigation',
    items: [
      { keys: ['G', 'then', 'I'], label: 'shortcutInbox' },
      { keys: ['G', 'then', 'S'], label: 'shortcutSent' },
      { keys: ['G', 'then', 'D'], label: 'shortcutDrafts' },
      { keys: ['G', 'then', 'A'], label: 'shortcutArchive' },
      { keys: ['G', 'then', 'T'], label: 'shortcutTrash' },
    ],
  },
  {
    title: 'shortcutMessageList',
    items: [
      { keys: ['J', '/ ↓'], label: 'shortcutNextMessage' },
      { keys: ['K', '/ ↑'], label: 'shortcutPreviousMessage' },
      { keys: ['Enter', '/ O'], label: 'shortcutOpen' },
      { keys: ['X'], label: 'shortcutSelect' },
      { keys: ['S'], label: 'shortcutStar' },
      { keys: ['E'], label: 'shortcutArchive' },
      { keys: ['#', '/ Delete'], label: 'shortcutMoveToTrash' },
      { keys: ['Shift', 'I'], label: 'shortcutMarkRead' },
      { keys: ['Shift', 'U'], label: 'shortcutMarkUnread' },
    ],
  },
  {
    title: 'shortcutReading',
    items: [
      { keys: ['R'], label: 'shortcutReply' },
      { keys: ['A'], label: 'shortcutReplyAll' },
      { keys: ['F'], label: 'shortcutForward' },
      { keys: ['E'], label: 'shortcutArchive' },
      { keys: ['S'], label: 'shortcutStar' },
      { keys: ['#', '/ Delete'], label: 'shortcutMoveToTrash' },
      { keys: ['J'], label: 'shortcutNextMessage' },
      { keys: ['K'], label: 'shortcutPreviousMessage' },
    ],
  },
  {
    title: 'shortcutCompose',
    items: [
      { keys: ['Ctrl', 'Enter'], label: 'shortcutSend' },
      { keys: ['Esc'], label: 'shortcutCloseBack' },
    ],
  },
]
</script>

<style scoped>
:deep(.keyboard-shortcuts-dialog) {
  background: var(--nova-surface);
  border: 1px solid var(--nova-border);
  color: var(--nova-text-primary);
}

.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px 28px;
}

.shortcut-section h3 {
  margin: 0 0 9px;
  color: var(--nova-text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.shortcut-row {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 30px;
  color: var(--nova-text-primary);
  font-size: 13px;
}

.shortcut-keys {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

kbd {
  min-width: 24px;
  padding: 3px 6px;
  border: 1px solid var(--nova-border);
  border-bottom-width: 2px;
  border-radius: 6px;
  background: var(--nova-surface-muted);
  color: var(--nova-text-secondary);
  font: 600 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  text-align: center;
  white-space: nowrap;
}

@media (max-width: 620px) {
  .shortcut-grid { grid-template-columns: 1fr; gap: 18px; }
}
</style>
