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
    <button :class="{active: route.name === 'star'}" @click="router.push({name: 'star'})">
      <AppIcon name="starred-nav" :size="19" /><span>{{ $t('starred') }}</span>
    </button>
    <button :class="{active: route.name === 'setting'}" @click="router.push({name: 'setting'})">
      <AppIcon name="settings-top" :size="19" /><span>{{ $t('settings') }}</span>
    </button>
  </nav>
  <button
      v-if="route.name === 'email'"
      v-perm="'email:send'"
      class="mobile-compose-fab"
      :aria-label="$t('compose')"
      @click="writerRef?.open()"
  >
    <Icon icon="solar:pen-2-linear" width="26" height="26" />
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
import {Icon} from '@iconify/vue'

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
  height: 100dvh;
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
  .layout.has-mobile-nav { padding-bottom: 66px; }
  .main-container { min-height: 0; }
  .mobile-nav { position: fixed; z-index: 20; display: grid; grid-template-columns: repeat(5, 1fr); align-items: end; padding: 7px 10px max(8px, env(safe-area-inset-bottom)); left: 0; right: 0; bottom: 0; min-height: 66px; background: color-mix(in srgb, var(--el-bg-color) 92%, transparent); border-top: 1px solid var(--light-border); backdrop-filter: blur(18px); }
  .mobile-nav button { min-width: 0; min-height: 48px; display: grid; place-items: center; gap: 2px; color: var(--regular-text-color); cursor: pointer; font-size: 10px; }
  .mobile-nav button :deep(.app-icon) { width: 19px; height: 19px; opacity: .75; }
  .mobile-nav button.active { color: var(--el-color-primary); font-weight: 650; }
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
}


/* Mobile UI v2 shell.
   This intentionally comes last so desktop and the proven stable styles above
   remain untouched. */
.mobile-compose-fab {
  display: none;
}

@media (max-width: 767px) {
  .layout.has-mobile-nav {
    padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
  }

  .el-header {
    height: calc(56px + env(safe-area-inset-top, 0px));
    padding-top: env(safe-area-inset-top, 0px);
    border-bottom: 0;
    background: var(--nova-surface);
  }

  .mobile-nav {
    position: fixed;
    z-index: 20;
    left: 0;
    right: 0;
    bottom: 0;

    display: grid;
    grid-template-columns: repeat(4, 1fr);
    align-items: center;

    height: calc(64px + env(safe-area-inset-bottom, 0px));
    min-height: 0;

    padding:
      4px
      10px
      env(safe-area-inset-bottom, 0px);

    background: var(--nova-surface);
    border-top: 1px solid var(--nova-divider);
    backdrop-filter: none;
  }

  .mobile-nav button {
    min-width: 0;
    min-height: 54px;

    display: grid;
    place-items: center;
    gap: 1px;

    color: var(--regular-text-color);
    font-size: 11px;
  }

  .mobile-nav button :deep(.app-icon) {
    width: 20px;
    height: 20px;
    opacity: .72;
  }

  .mobile-nav button.active {
    color: var(--el-color-primary);
    font-weight: 650;
  }

  .mobile-nav button.active :deep(.app-icon) {
    opacity: 1;
  }

  .mobile-compose-fab {
    position: fixed;
    z-index: 21;

    right: 18px;
    bottom: calc(
      64px +
      env(safe-area-inset-bottom, 0px) +
      16px
    );

    width: 58px;
    height: 58px;

    display: grid;
    place-items: center;

    padding: 0;
    border: 0;
    border-radius: 50%;

    color: #fff;
    background: var(--el-color-primary);
    cursor: pointer;

    box-shadow:
      0 7px 18px
      color-mix(in srgb, var(--el-color-primary) 28%, transparent);
  }

  .mobile-compose-fab :deep(.iconify) {
    color: #fff;
    opacity: 1;
  }

  .mobile-compose-fab:active {
    transform: scale(.94);
  }
}

@media (max-width: 767px) and (display-mode: standalone) {
  .layout {
    background: var(--nova-surface);
  }
}

</style>
