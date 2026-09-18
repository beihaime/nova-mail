<template>
  <el-container class="layout" :class="{'has-mobile-nav': route.name !== 'content'}">
    <el-aside
        class="aside"
        :class="uiStore.asideShow ? 'aside-show' : 'el-aside-hide'">
      <Aside />
    </el-aside>
    <div
        :class="(uiStore.asideShow && isMobile)? 'overlay-show':'overlay-hide'"
        @click="uiStore.asideShow = false"
    ></div>
    <el-container class="main-container">
      <el-main>
        <el-header>
            <Header />
        </el-header>
        <Main />
      </el-main>
    </el-container>
  </el-container>
  <nav v-if="route.name !== 'content'" class="mobile-nav" aria-label="Mail navigation">
    <button :class="{active: route.name === 'email'}" @click="router.push({name: 'email'})">
      <AppIcon name="inbox" :size="19" /><span>{{ $t('inbox') }}</span>
    </button>
    <button @click="uiStore.asideShow = true">
      <AppIcon name="folder-nav" :size="19" /><span>{{ $t('folders') }}</span>
    </button>
<<<<<<< HEAD
    <button v-perm="'email:send'" class="mobile-compose" :aria-label="$t('compose')" @click="writerRef?.open()">
      <AppIcon name="mail-action" :size="50" />
      <span class="mobile-compose-label">{{ $t('compose') }}</span>
    </button>
=======
>>>>>>> codex/mobile-nova-polish
    <button :class="{active: route.name === 'star'}" @click="router.push({name: 'star'})">
      <AppIcon name="starred-nav" :size="19" /><span>{{ $t('starred') }}</span>
    </button>
    <button :class="{active: route.name === 'setting'}" @click="router.push({name: 'setting'})">
      <AppIcon name="settings-top" :size="19" /><span>{{ $t('settings') }}</span>
    </button>
  </nav>
  <button v-if="route.name === 'email'" v-perm="'email:send'" class="mobile-compose-fab" :aria-label="$t('compose')" @click="writerRef?.open()">
    <AppIcon name="compose" :size="24" />
  </button>
  <writer ref="writerRef" />
</template>

<script setup>
import Aside from '@/layout/aside/index.vue'
import Header from '@/layout/header/index.vue'
import Main from '@/layout/main/index.vue'
import { ref, onMounted, onBeforeUnmount } from 'vue'
import {useUiStore} from "@/store/ui.js";
import writer from '@/layout/write/index.vue'
import router from '@/router/index.js'
import {useRoute} from 'vue-router'

const uiStore = useUiStore();
const writerRef = ref({})
const route = useRoute()
const isMobile = ref(window.innerWidth < 1025)
const handleResize = () => {
  isMobile.value = window.innerWidth < 1025
  uiStore.asideShow = window.innerWidth > 1024;
}

onMounted(() => {
  uiStore.writerRef = writerRef

  window.addEventListener('resize', handleResize)
  handleResize()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<style lang="scss" scoped>
.el-aside-hide {
  position: fixed;
  left: 0;
  height: 100%;
  z-index: 100;
  transform: translateX(-100%);
  transition: transform var(--nova-motion-base) var(--nova-motion-ease), box-shadow var(--nova-motion-base) var(--nova-motion-ease);
}

.aside-show {
  -webkit-box-shadow: var(--aside-right-border);
  box-shadow: var(--aside-right-border);
  transform: translateX(0);
  transition: transform var(--nova-motion-base) var(--nova-motion-ease), box-shadow var(--nova-motion-base) var(--nova-motion-ease);
  z-index: 101;
  @media (max-width: 1025px) {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 101;
    height: 100%;
    background: var(--el-bg-color);
  }
}

.el-aside {
  width: auto;
  transition: transform var(--nova-motion-base) var(--nova-motion-ease), box-shadow var(--nova-motion-base) var(--nova-motion-ease);
}

.layout {
  height: 100%;
  position: fixed;
  width: 100%;
  top: 0;
  left: 0;
  overflow: hidden;
}

.main-container {
  min-height: 100%;
  background: var(--el-bg-color);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.el-main {
  padding: 0;
}

.el-header {
  background: var(--el-bg-color);
  border-bottom: solid 1px var(--el-border-color);
  padding: 0 0 0 0;
}

@media (min-width: 1026px) {
  .layout { background: var(--settings-page-background); padding: 12px; gap: 12px; }
  .aside-show { border-radius: 16px; overflow: hidden; }
  .main-container { border: 1px solid var(--light-border); border-radius: 16px; min-height: 0; }
  .el-header { border-bottom-color: var(--light-border); }
}

.overlay-show {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.4);
  z-index: 99;
  transition: opacity var(--nova-motion-base) var(--nova-motion-ease), background-color var(--nova-motion-base) var(--nova-motion-ease);
  opacity: 1;
}

.overlay-hide {
  display: flex;
  pointer-events: none;
  opacity: 0;
}

.mobile-nav { display: none; }

@media (max-width: 767px) {
  .layout.has-mobile-nav { padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px)); }
  .main-container { min-height: 0; }
  .el-header { height: 56px; border-bottom: 0; background: var(--nova-surface); }
  .mobile-nav { position: fixed; z-index: 20; display: grid; grid-template-columns: repeat(4, 1fr); align-items: center; padding: 4px 10px env(safe-area-inset-bottom, 0px); left: 0; right: 0; bottom: 0; height: calc(60px + env(safe-area-inset-bottom, 0px)); background: var(--nova-surface); border-top: 1px solid var(--nova-divider); }
  .mobile-nav button { min-width: 0; min-height: 52px; display: grid; place-items: center; gap: 0; color: var(--regular-text-color); cursor: pointer; font-size: 11px; }
  .mobile-nav button :deep(.app-icon) { width: 19px; height: 19px; opacity: .75; }
  .mobile-nav button.active { color: var(--el-color-primary); font-weight: 650; }
<<<<<<< HEAD
  .mobile-nav button.active :deep(.app-icon) { opacity: 1; }
  :global(.dark .mobile-nav button:not(.active) .app-icon) { opacity: 1; }
  .mobile-nav .mobile-compose {
    place-self: center;
    width: 52px;
    height: 52px;
    min-height: 52px;
    padding: 0;
    border-radius: 999px;
    color: #fff;
    background: transparent;
    box-shadow: 0 6px 16px color-mix(in srgb, var(--el-color-primary) 30%, transparent);
    transform: translateY(-6px);
    transition: transform var(--nova-motion-fast) var(--nova-motion-ease), box-shadow var(--nova-motion-fast) var(--nova-motion-ease), filter var(--nova-motion-fast) var(--nova-motion-ease);
  }
  .mobile-nav .mobile-compose:hover,
  .mobile-nav .mobile-compose:focus-visible {
    background: transparent;
    box-shadow: 0 8px 20px color-mix(in srgb, var(--el-color-primary) 38%, transparent);
    transform: translateY(-7px);
  }
  .mobile-nav .mobile-compose:active { transform: translateY(-6px) scale(.94); filter: brightness(.98); }
  .mobile-nav .mobile-compose :deep(.app-icon) {
    width: 50px;
    height: 50px;
    opacity: 1;
    filter: none !important;
  }
  .mobile-nav .mobile-compose-label { display: none; }
=======
  .mobile-nav button.active :deep(.app-icon) { opacity: 1; filter: brightness(0) saturate(100%) invert(43%) sepia(93%) saturate(3364%) hue-rotate(192deg) brightness(102%); }
  .mobile-compose-fab { position: fixed; z-index: 21; right: 20px; bottom: calc(60px + env(safe-area-inset-bottom, 0px) + 16px); width: 56px; height: 56px; display: grid; place-items: center; border-radius: 50%; background: var(--el-color-primary); box-shadow: 0 5px 15px color-mix(in srgb, var(--el-color-primary) 30%, transparent); cursor: pointer; }
  .mobile-compose-fab :deep(.app-icon) { filter: brightness(0) invert(1); }
}
.mobile-compose-fab { display: none; }
@media (max-width: 767px) { .mobile-compose-fab { display: grid; } }
@media (max-width: 767px) and (display-mode: standalone) {
  .layout { padding-top: env(safe-area-inset-top, 0px); background: var(--nova-surface); }
>>>>>>> codex/mobile-nova-polish
}
</style>
