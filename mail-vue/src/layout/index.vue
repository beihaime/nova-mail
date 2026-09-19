<template>
  <el-container
      class="layout"
      :class="{
        'has-mobile-nav': route.name !== 'content',
        'aside-open': uiStore.asideShow && isMobile
      }">
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
      <AppIcon name="inbox" :size="24" /><span>{{ $t('inbox') }}</span>
    </button>
    <button @click="uiStore.asideShow = true">
      <AppIcon name="folder-nav" :size="24" /><span>{{ $t('folders') }}</span>
    </button>
    <button :class="{active: route.name === 'star'}" @click="router.push({name: 'star'})">
      <AppIcon name="starred-nav" :size="24" /><span>{{ $t('starred') }}</span>
    </button>
    <button :class="{active: route.name === 'setting'}" @click="router.push({name: 'setting'})">
      <AppIcon name="settings-top" :size="24" /><span>{{ $t('settings') }}</span>
    </button>
  </nav>
  <button
      v-if="route.name === 'email'"
      v-perm="'email:send'"
      class="mobile-compose-fab"
      :aria-label="$t('compose')"
      @click="writerRef?.open()"
  >
    <Icon icon="solar:pen-2-linear" width="24" height="24" />
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
import {useGlobalMailAlert} from '@/composables/use-global-mail-alert.js'

const uiStore = useUiStore();
const writerRef = ref({})
const route = useRoute()

// New-mail sound on every route: the Inbox and the reader poll on their own, so
// this covers the rest without adding a second request where they already run.
useGlobalMailAlert()
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
  /* Sidebar shell is a fixed flex column: navigation content scrolls, the
     quota footer is pinned. Previously the scroll region was an arbitrary
     `calc(100% - 82px)` while the footer measured ~114px tall, so the footer
     was pushed below the fold (clipped on desktop, scrollable on mobile). */
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

@media (max-width: 1025px) {
  .el-aside {
    height: 100dvh;
    max-height: 100dvh;
  }

  /* Stacking-context fix.
     `.layout` is position:fixed, so it forms a stacking context at
     `z-index: auto`. The drawer (101) and overlay (99) live inside it, while
     the bottom nav (20) and compose FAB (21) are siblings *outside* it — so
     those fixed elements painted over the whole drawer no matter how high the
     drawer's own z-index was. Raising the shell itself while the drawer is open
     puts the drawer + scrim above every fixed mobile element. Poppers teleported
     to <body> (Element Plus dialogs, 2000+) intentionally stay on top. */
  .layout.aside-open {
    z-index: 1200;
  }
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
  /* `overflow-y: auto` promotes the `visible` x-axis to `auto` per CSS, which
     turns this scroll port into a horizontal scroller. The app shell is a fixed
     one-column layout, so the page must never scroll sideways. */
  overflow-x: hidden;
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
    padding-bottom: calc(66px + env(safe-area-inset-bottom, 0px));
  }

  .el-header {
    height: calc(64px + env(safe-area-inset-top, 0px));
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

    height: calc(66px + env(safe-area-inset-bottom, 0px));
    min-height: 0;

    padding:
      3px
      10px
      env(safe-area-inset-bottom, 0px);

    background: var(--nova-surface);
    border-top: 1px solid var(--nova-divider);
    backdrop-filter: none;
  }

  .mobile-nav button {
    min-width: 0;
    min-height: 0;

    display: grid;
    place-items: center;
    gap: 2px;

    color: var(--regular-text-color);
    font-size: 13px;
    line-height: 1.1;
  }

  .mobile-nav button span {
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .mobile-nav button :deep(.app-icon) {
    width: 24px;
    height: 24px;
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

    right: 16px;
    bottom: calc(
      66px +
      env(safe-area-inset-bottom, 0px) +
      14px
    );

    width: 56px;
    height: 56px;

    display: grid;
    place-items: center;

    padding: 0;
    border: 0;
    border-radius: 18px;

    color: #fff;
    background: var(--el-color-primary);
    cursor: pointer;

    /* Gmail Android keeps the FAB almost flat: a soft ambient shadow only. */
    box-shadow:
      0 2px 6px
      color-mix(in srgb, var(--el-color-primary) 22%, transparent);

    transition:
      transform var(--nova-motion-fast) var(--nova-motion-ease),
      box-shadow var(--nova-motion-fast) var(--nova-motion-ease);
  }

  .mobile-compose-fab :deep(.iconify) {
    color: #fff;
    opacity: 1;
  }

  .mobile-compose-fab:hover,
  .mobile-compose-fab:focus-visible {
    box-shadow:
      0 3px 8px
      color-mix(in srgb, var(--el-color-primary) 26%, transparent);
  }

  .mobile-compose-fab:active {
    transform: scale(.94);
  }

  :global(.dark .mobile-compose-fab) {
    box-shadow: 0 2px 6px rgba(0, 0, 0, .34);
  }
}

@media (max-width: 767px) and (display-mode: standalone) {
  .layout {
    background: var(--nova-surface);
  }
}

</style>
