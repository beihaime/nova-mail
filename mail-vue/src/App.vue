<template>
  <el-config-provider :locale="settingStore.lang === 'zh' ? zhCn : null">
    <router-view />
  </el-config-provider>
</template>
<script setup>
import { useI18n } from "vue-i18n";
import { watch, onMounted, onBeforeUnmount } from "vue";
import {useSettingStore} from "@/store/setting.js";
import {useUiStore} from "@/store/ui.js";
import {applyDocumentLocale} from "@/i18n/locale.js";
const settingStore = useSettingStore()
const uiStore = useUiStore()
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import('@/icons/index.js')
const { locale } = useI18n()

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
