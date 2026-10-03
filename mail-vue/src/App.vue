<template>
  <el-config-provider :locale="settingStore.lang === 'zh' ? zhCn : null">
    <router-view />
    <KeyboardShortcuts v-model="showShortcuts" />
    <div v-if="bootError" class="nova-boot-error" role="alert">
      {{ $t('startupError') }}
    </div>
  </el-config-provider>
</template>
<script setup>
import { useI18n } from "vue-i18n";
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import {useSettingStore} from "@/store/setting.js";
import {useUiStore} from "@/store/ui.js";
import {applyDocumentLocale} from "@/i18n/locale.js";
import KeyboardShortcuts from '@/components/keyboard-shortcuts/index.vue'
import {useKeyboardShortcuts} from '@/composables/use-keyboard-shortcuts.js'
const settingStore = useSettingStore()
const uiStore = useUiStore()
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import('@/icons/index.js')
const { locale } = useI18n()
const showShortcuts = ref(false)
const bootError = ref(Boolean(window.__NOVA_BOOT_ERROR__))
useKeyboardShortcuts(showShortcuts)

function syncLocale() {
  locale.value = settingStore.lang
  applyDocumentLocale(settingStore.lang)
}

syncLocale()
watch(() => settingStore.lang, syncLocale)

// Nova theme preference
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')

uiStore.applyTheme()

function handleSystemThemeChange() {
  if (uiStore.themeMode === 'system') {
    uiStore.applyTheme()
  }
}

// Installed PWAs (e.g. Android Chrome) can re-sample the status bar colour when
// the app returns to the foreground, so re-apply the theme to keep it in sync.
function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    uiStore.applyTheme()
  }
}

watch(
  () => uiStore.themeMode,
  () => uiStore.applyTheme()
)

onMounted(() => {
  if (systemTheme.addEventListener) {
    systemTheme.addEventListener('change', handleSystemThemeChange)
  } else {
    systemTheme.addListener(handleSystemThemeChange)
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onBeforeUnmount(() => {
  if (systemTheme.removeEventListener) {
    systemTheme.removeEventListener('change', handleSystemThemeChange)
  } else {
    systemTheme.removeListener(handleSystemThemeChange)
  }
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<style scoped>
.nova-boot-error {
  position: fixed;
  z-index: 1000;
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  left: 16px;
  padding: 12px 16px;
  border: 1px solid var(--nova-danger, var(--el-color-danger));
  border-radius: var(--nova-button-radius, 10px);
  color: var(--nm-text-primary, var(--el-text-color-primary));
  background: var(--nm-surface-elevated, var(--el-bg-color-overlay));
  box-shadow: var(--nova-shadow-md, 0 8px 24px rgba(0, 0, 0, .12));
  font-size: 14px;
  text-align: center;
}
</style>
