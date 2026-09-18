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
const settingStore = useSettingStore()
const uiStore = useUiStore()
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import('@/icons/index.js')
const { locale } = useI18n()
locale.value = settingStore.lang
watch(() => settingStore.lang, () => locale.value = settingStore.lang)

// Nova theme preference
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')

if (!['light', 'dark', 'system'].includes(uiStore.themeMode)) {
  uiStore.themeMode = uiStore.dark ? 'dark' : 'light'
}

uiStore.applyTheme()

function handleSystemThemeChange() {
  if (uiStore.themeMode === 'system') {
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
})

onBeforeUnmount(() => {
  if (systemTheme.removeEventListener) {
    systemTheme.removeEventListener('change', handleSystemThemeChange)
  } else {
    systemTheme.removeListener(handleSystemThemeChange)
  }
})
</script>
