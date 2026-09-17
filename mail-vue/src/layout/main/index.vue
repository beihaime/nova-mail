<template>
  <div :class="accountShow && hasPerm('account:query') ? 'main-box-show' : 'main-box-hide'">
    <div :class="accountShow && hasPerm('account:query') ? 'block-show' : 'block-hide'" @click="uiStore.accountShow = false"></div>
    <account  :class="accountShow && hasPerm('account:query') ? 'show' : 'hide'" />
    <div v-if="isDesktopReading" ref="workspaceRef" class="desktop-mail-workspace" :class="{ 'reader-expanded': uiStore.readerExpanded }" :style="workspaceStyle">
      <EmailPane class="desktop-message-list" />
      <div
          class="mail-splitter"
          role="separator"
          aria-label="Resize message list"
          aria-orientation="vertical"
          @pointerdown="startResize"
          @dblclick="resetPaneWidth"
      ></div>
      <ContentPane class="desktop-reading-pane" />
    </div>
    <router-view v-else class="main-view" v-slot="{ Component,route }">
      <keep-alive :include="['email','all-email','send','sys-setting','star','user','role','analysis','reg-key','draft']">
        <component :is="Component" :key="route.name"/>
      </keep-alive>
    </router-view>
  </div>
</template>
<script setup>
import account from '@/layout/account/index.vue'
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
import {computed, onBeforeUnmount, onMounted, ref, watch} from "vue";
import { useRoute } from 'vue-router'
import { hasPerm } from "@/perm/perm.js"
import EmailPane from '@/views/email/index.vue'
import ContentPane from '@/views/content/index.vue'

const settingStore = useSettingStore()
const uiStore = useUiStore();
const route = useRoute()
let  innerWidth =  window.innerWidth
const isDesktop = ref(window.innerWidth >= 1024)
const workspaceRef = ref(null)
const DEFAULT_PANE_WIDTH = 440
const MIN_PANE_WIDTH = 300
const MAX_PANE_WIDTH = 700
const MIN_READING_WIDTH = 360
const paneWidth = ref(readPaneWidth())
let isResizing = false

let elNotification = null

const accountShow = computed(() => {
  // On a phone the account selector remains available from the reader as a
  // drawer; desktop keeps the reading pane unobstructed.
  return uiStore.accountShow && settingStore.settings.manyEmail === 0 && (!isDesktop.value || route.name !== 'content')
})

const isDesktopReading = computed(() => route.name === 'content' && isDesktop.value)
const workspaceStyle = computed(() => ({ '--mail-list-width': `${paneWidth.value}px` }))

watch(() => uiStore.changeNotice, () => {

  const settings = settingStore.settings

  let data = {
    notice: settings.notice,
    noticeWidth: settings.noticeWidth,
    noticeTitle: settings.noticeTitle,
    noticeContent: settings.noticeContent,
    noticeType: settings.noticeType,
    noticeDuration: settings.noticeDuration,
    noticePosition: settings.noticePosition,
    noticeOffset: settings.noticeOffset
  }

  showNotice(data)
})

watch(() => uiStore.changePreview, () => {
  showNotice(uiStore.previewData)
})

watch(() => route.name, (name) => {
  if (name !== 'content') uiStore.readerExpanded = false
})

function showNotice(data) {

  if (data.notice === 1) {
    return;
  }

  if (elNotification) {
    elNotification.close()
  }

  const style = document.createElement('style');
  style.innerHTML = `
  .custom-notice.el-notification {
    --el-notification-width: min(${data.noticeWidth}px,calc(100% - 30px)) !important;
  }
  `;

  document.head.appendChild(style);

  elNotification = ElNotification({
    title: data.noticeTitle,
    message: `<div style="width: 100%;height: 100%;">${data.noticeContent}</div>`,
    type: data.noticeType === 'none' ? '' : data.noticeType,
    duration: data.noticeDuration,
    position: data.noticePosition,
    offset: data.noticeOffset,
    dangerouslyUseHTMLString: true,
    customClass: 'custom-notice'
  })
}

onMounted(() => {
  // Accounts remain available from the list toolbar, but should not permanently
  // consume a desktop column in the mail workspace.
  if (isDesktop.value) uiStore.accountShow = false
  window.addEventListener('resize', handleResize)
  handleResize()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('pointermove', resizePane)
  window.removeEventListener('pointerup', stopResize)
  document.body.classList.remove('mail-pane-resizing')
})

const handleResize = () => {
  isDesktop.value = window.innerWidth >= 1024
  if (innerWidth !== window.innerWidth) innerWidth = window.innerWidth
  paneWidth.value = clampPaneWidth(paneWidth.value)
}

function readPaneWidth() {
  const value = Number(localStorage.getItem('nova-mail-pane-width'))
  return Number.isFinite(value) ? Math.min(MAX_PANE_WIDTH, Math.max(MIN_PANE_WIDTH, value)) : DEFAULT_PANE_WIDTH
}

function clampPaneWidth(value) {
  const workspaceWidth = workspaceRef.value?.clientWidth
  const widthForReadingPane = workspaceWidth ? workspaceWidth - MIN_READING_WIDTH - 8 : MAX_PANE_WIDTH
  const maxWidth = Math.max(MIN_PANE_WIDTH, Math.min(MAX_PANE_WIDTH, widthForReadingPane))
  return Math.min(maxWidth, Math.max(MIN_PANE_WIDTH, Math.round(value)))
}

function startResize(event) {
  if (event.button !== 0 || !workspaceRef.value) return
  isResizing = true
  event.currentTarget.setPointerCapture?.(event.pointerId)
  document.body.classList.add('mail-pane-resizing')
  window.addEventListener('pointermove', resizePane)
  window.addEventListener('pointerup', stopResize, { once: true })
}

function resizePane(event) {
  if (!isResizing || !workspaceRef.value) return
  const workspaceLeft = workspaceRef.value.getBoundingClientRect().left
  paneWidth.value = clampPaneWidth(event.clientX - workspaceLeft)
}

function stopResize() {
  if (!isResizing) return
  isResizing = false
  localStorage.setItem('nova-mail-pane-width', String(paneWidth.value))
  document.body.classList.remove('mail-pane-resizing')
  window.removeEventListener('pointermove', resizePane)
}

function resetPaneWidth() {
  paneWidth.value = clampPaneWidth(DEFAULT_PANE_WIDTH)
  localStorage.setItem('nova-mail-pane-width', String(paneWidth.value))
}

</script>
<style lang="scss" scoped>

.block-show {
  position: fixed;
  @media (max-width: 767px) {
    position: absolute;
    right: 0;
    border: 0;
    height: 100%;
    width: 100%;
    background: #000000;
    opacity: 0.6;
    z-index: 10;
    transition: all 300ms;
  }
}

.block-hide {
  position: fixed;
  pointer-events: none;
  transition: all 300ms;
}

.show {
  transition: all 100ms;
  @media (max-width: 767px) {
    position: fixed;
    z-index: 100;
    width: 260px;
  }
}

.hide {
  transition: all 100ms;
  position: fixed;
  transform: translateX(-100%);
  opacity: 0;
  @media (max-width: 1024px) {
    width: 260px;
    z-index: 100;
  }
}


.main-box-show,
.main-box-hide {
  position: relative;
  display: grid;
  grid-template-columns: 1fr;
  height: calc(100% - 60px);
}

.block-show {
  inset: 0;
  z-index: 10;
  background: rgba(12, 18, 28, .18);
  backdrop-filter: blur(1px);
}

.show {
  position: absolute;
  z-index: 11;
  inset: 0 auto 0 0;
  width: min(320px, 88vw);
  background: var(--el-bg-color);
  border-right: 1px solid var(--light-border);
  box-shadow: 18px 0 42px rgba(15, 23, 42, .14);
}


.main-view {
  background: var(--el-bg-color);
}

.desktop-mail-workspace {
  display: grid;
  grid-template-columns: minmax(300px, var(--mail-list-width)) 8px minmax(360px, 1fr);
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: var(--el-bg-color);
}

.desktop-message-list { min-width: 0; }
.desktop-reading-pane { min-width: 0; }

.desktop-mail-workspace.reader-expanded {
  grid-template-columns: minmax(0, 1fr);
}

.desktop-mail-workspace.reader-expanded .desktop-message-list,
.desktop-mail-workspace.reader-expanded .mail-splitter {
  display: none;
}

.mail-splitter {
  position: relative;
  z-index: 2;
  cursor: col-resize;
  touch-action: none;
  user-select: none;
}

.mail-splitter::after {
  content: '';
  position: absolute;
  inset: 0 3px;
  background: var(--nova-divider);
  transition: background-color .16s ease, box-shadow .16s ease;
}

.mail-splitter:hover::after,
.mail-pane-resizing .mail-splitter::after {
  background: var(--el-color-primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--el-color-primary) 22%, transparent);
}

:global(body.mail-pane-resizing) {
  cursor: col-resize !important;
  user-select: none !important;
}


.navigation {
  height: 30px;
  border-bottom: solid 1px var(--el-menu-border-color);
  display: inline-flex;
  justify-items: center;
  align-items: center;
  width: 100%;
  .tag {
    background: var(--el-bg-color);
    margin-left: 5px;
  }
}
</style>
