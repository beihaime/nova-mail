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
    <button v-perm="'email:send'" class="mobile-compose" @click="writerRef?.open()">
      <AppIcon name="compose" :size="20" />
    </button>
    <button :class="{active: route.name === 'star'}" @click="router.push({name: 'star'})">
      <AppIcon name="starred-nav" :size="19" /><span>{{ $t('starred') }}</span>
    </button>
    <button @click="router.push({name: 'setting'})">
      <AppIcon name="settings-top" :size="19" /><span>{{ $t('settings') }}</span>
    </button>
  </nav>
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
  transition: all 100ms ease;
}

.aside-show {
  -webkit-box-shadow: var(--aside-right-border);
  box-shadow: var(--aside-right-border);
  transform: translateX(0);
  transition: all 100ms ease;
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
  transition: all 100ms ease;
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
  transition: all 0.3s;
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
  .mobile-nav .mobile-compose { place-self: center; width: 46px; height: 46px; min-height: 46px; border-radius: 50%; background: var(--el-color-primary); box-shadow: 0 4px 12px color-mix(in srgb, var(--el-color-primary) 35%, transparent); transform: translateY(-9px); }
  .mobile-nav .mobile-compose :deep(.app-icon) { width: 21px; height: 21px; opacity: 1; }
}
</style>
