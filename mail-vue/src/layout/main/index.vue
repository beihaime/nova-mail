<template>
  <div :class="accountShow && hasPerm('account:query') ? 'main-box-show' : 'main-box-hide'">
    <div :class="accountShow && hasPerm('account:query') ? 'block-show' : 'block-hide'" @click="uiStore.accountShow = false"></div>
    <account  :class="accountShow && hasPerm('account:query') ? 'show' : 'hide'" />
    <div v-if="isDesktopReading" class="desktop-mail-workspace">
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
import ContentPane from '@/views/content/index.vue'

const settingStore = useSettingStore()
const uiStore = useUiStore();
const route = useRoute()
let  innerWidth =  window.innerWidth
const isDesktop = ref(window.innerWidth >= 1024)

let elNotification = null

const accountShow = computed(() => {
  // On a phone the account selector remains available from the reader as a
  // drawer; desktop keeps the reading pane unobstructed.
  return uiStore.accountShow && settingStore.settings.manyEmail === 0 && (!isDesktop.value || route.name !== 'content')
})

const isDesktopReading = computed(() => route.name === 'content' && isDesktop.value)

// Normal configured notice popups are intentionally disabled.
 // System Settings preview still uses changePreview below.

watch(() => uiStore.changePreview, () => {
  showNotice(uiStore.previewData)
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
  document.body.classList.remove('mail-pane-resizing')
})

const handleResize = () => {
  isDesktop.value = window.innerWidth >= 1024
  if (innerWidth !== window.innerWidth) innerWidth = window.innerWidth
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
    transition: opacity var(--nova-motion-base) var(--nova-motion-ease), background-color var(--nova-motion-base) var(--nova-motion-ease);
  }
}

.block-hide {
  position: fixed;
  pointer-events: none;
  transition: opacity var(--nova-motion-base) var(--nova-motion-ease), background-color var(--nova-motion-base) var(--nova-motion-ease);
}

.show {
  animation: nova-popover-in var(--nova-motion-base) var(--nova-motion-ease) both;
  @media (max-width: 767px) {
    position: fixed;
    z-index: 100;
    width: 260px;
  }
}

.hide {
  transition: opacity var(--nova-motion-base) var(--nova-motion-ease), transform var(--nova-motion-base) var(--nova-motion-ease);
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
  animation: nova-view-in var(--nova-motion-base) var(--nova-motion-ease) both;
}

.desktop-mail-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: var(--el-bg-color);
  animation: nova-view-in var(--nova-motion-base) var(--nova-motion-ease) both;
}

.desktop-message-list { min-width: 0; }
.desktop-reading-pane { min-width: 0; }


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
