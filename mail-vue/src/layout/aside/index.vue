<template>
  <el-scrollbar class="scroll">
    <div>
      <div class="title" >
        <AppIcon class="brand-mark" name="brand-app" :size="44" />
        <div>{{settingStore.settings.title}}</div>
      </div>
      <button v-perm="'email:send'" class="compose nova-primary-button" @click="openCompose">
         <span>{{ $t('compose') }}</span>
      </button>
      <el-menu class="nova-sidebar-nav" :collapse="false">
        <el-menu-item class="nova-navigation-button" @click="router.push({name: 'email'})" index="email"
                      :class="route.meta.name === 'email' ? 'choose-item' : ''">
          <span class="nav-icon"><AppIcon name="nova-sidebar-inbox" :size="18" inline /></span>
          <span class="menu-name">{{$t('inbox')}}</span>
        </el-menu-item>
        <el-menu-item class="nova-navigation-button" @click="router.push({name: 'send'})" index="send" v-perm="'email:send'"
                      :class="route.meta.name === 'send' ? 'choose-item' : ''">
          <span class="nav-icon"><AppIcon name="nova-sidebar-sent" :size="18" inline /></span>
          <span class="menu-name">{{$t('sent')}}</span>
        </el-menu-item>
        <el-menu-item class="nova-navigation-button" @click="router.push({name: 'draft'})" index="draft" v-perm="'email:send'"
                      :class="route.meta.name === 'draft' ? 'choose-item' : ''">
          <span class="nav-icon"><AppIcon name="nova-sidebar-drafts" :size="18" inline /></span>
          <span class="menu-name">{{$t('drafts')}}</span>
        </el-menu-item>
        <el-menu-item class="nova-navigation-button" @click="router.push({name: 'star'})" index="star"
                      :class="route.meta.name === 'star' ? 'choose-item' : ''">
          <span class="nav-icon"><AppIcon name="nova-sidebar-starred" :size="18" inline /></span>
          <span class="menu-name">{{$t('starred')}}</span>
        </el-menu-item>
        <!-- Only users who may archive (the swipe action reuses `email:delete`)
             can ever have anything in here. -->
        <el-menu-item class="nova-navigation-button" @click="router.push({name: 'archive'})" index="archive" v-perm="'email:delete'"
                      :class="route.meta.name === 'archive' ? 'choose-item' : ''">
          <span class="nav-icon"><AppIcon name="nova-sidebar-archive" :size="18" inline /></span>
          <span class="menu-name">{{$t('archive')}}</span>
        </el-menu-item>
        <el-menu-item class="nova-navigation-button" @click="router.push({name: 'trash'})" index="trash" v-perm="'email:delete'"
                      :class="route.meta.name === 'trash' ? 'choose-item' : ''">
          <span class="nav-icon"><AppIcon name="nova-sidebar-trash" :size="18" inline /></span>
          <span class="menu-name">{{$t('trash')}}</span>
        </el-menu-item>
        <el-menu-item v-if="showDesktopSettings" class="nova-navigation-button" @click="router.push({name: 'setting'})" index="setting"
                      :class="route.meta.name === 'setting' ? 'choose-item' : ''">
          <span class="nav-icon"><AppIcon name="nova-sidebar-settings" :size="18" inline /></span>
          <span class="menu-name">{{$t('settings')}}</span>
        </el-menu-item>
      </el-menu>
    </div>
  </el-scrollbar>
  <footer class="aside-footer">
    <div class="send-usage">
      <AppIcon name="nova-sidebar-sent" :size="17" inline />

      <div class="send-usage-body">
        <div class="send-usage-head">
          <span>{{ $t('sendCount') }}</span>

          <strong v-if="sendLimit > 0">
            {{ sendRemaining }}/{{ sendLimit }}
          </strong>

          <strong v-else>∞</strong>
        </div>

        <div
          v-if="sendLimit > 0 &&
                settingStore.settings.send !== 1 &&
                !['ban', 'internal'].includes(sendQuotaType)"
          class="send-usage-track"
          role="progressbar"
          :aria-valuenow="sendRemainingPercent"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span :style="{ width: `${sendRemainingPercent}%` }"></span>
        </div>

        <small
          v-if="settingStore.settings.send === 1 ||
                sendQuotaType === 'ban'"
        >
          {{ $t('disabled') }}
        </small>

        <small v-else-if="sendQuotaType === 'internal'">
          {{ $t('sendInternal') }}
        </small>

        <small v-else-if="sendLimit > 0">
          {{ $t('remainingUses') }}
          {{ sendRemaining }}
          ·
          {{ sendRemainingPercent }}%
        </small>

        <small v-else>
          {{ $t('unlimited') }}
        </small>
      </div>
    </div>

    <div class="aside-version">
      Nova Mail · v{{ appVersion }}
    </div>
  </footer>
</template>

<script setup>
import router from "@/router/index.js";
import { useRoute } from "vue-router";
import {useSettingStore} from "@/store/setting.js";
import {useUiStore} from "@/store/ui.js";
import {useUserStore} from "@/store/user.js";
import {computed} from "vue";
import {useMediaQuery} from '@vueuse/core'
import packageInfo from '../../../package.json'

const settingStore = useSettingStore();
const route = useRoute();
const uiStore = useUiStore();
const userStore = useUserStore();
const showDesktopSettings = useMediaQuery('(min-width: 768px)')

const sendQuotaType = computed(
  () => userStore.user?.role?.sendType || ''
)

const sendLimit = computed(
  () => Math.max(
    0,
    Number(userStore.user?.role?.sendCount || 0)
  )
)

const sendUsed = computed(
  () => Math.max(
    0,
    Number(userStore.user?.sendCount || 0)
  )
)

const sendRemaining = computed(() =>
  sendLimit.value > 0
    ? Math.max(0, sendLimit.value - sendUsed.value)
    : 0
)

const sendRemainingPercent = computed(() =>
  sendLimit.value > 0
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            (sendRemaining.value / sendLimit.value) * 100
          )
        )
      )
    : 100
)
const appVersion = packageInfo.version
const openCompose = () => uiStore.writerRef?.open()

</script>

<style lang="scss" scoped>

.compose {
  margin: 6px 10px 4px;
  width: calc(100% - 20px);
  height: 42px;

}


.title {
  margin: 12px 14px 8px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  position: relative;

  font-size: 19px;
  font-weight: 600;

  align-items: center;
  justify-content: center;
  gap: 8px;

  color: var(--el-text-color-primary);
  max-width: 240px;
  padding: 0 10px;

  > div {
    font-family: var(--nova-font-reading);
    letter-spacing: -.01em;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: calc(240px - 20px - 44px);
  }

  :deep(.el-icon) {
    flex-shrink: 0;
    font-size: 20px;
  }

  .user-right-icon {
    align-self: center;
    position: absolute;
    font-size: 12px;
    right: 8px;
    color: #ffffff;
  }
}

.brand-mark {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}


:deep(.nova-sidebar-nav .el-menu-item) {
  margin: 1px 10px !important;
  border-radius: 9px;
  height: 38px;
  padding: 0 12px !important;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: center;
  column-gap: 12px;
  line-height: 1;
  color: var(--el-text-color-primary);
  transition: background-color var(--nova-motion-fast) var(--nova-motion-ease), color var(--nova-motion-fast) var(--nova-motion-ease), box-shadow var(--nova-motion-fast) var(--nova-motion-ease);
}

:deep(.nova-sidebar-nav .choose-item) {
  color: var(--el-color-primary);
  font-weight: 650;
  background: var(--nova-selected) !important;
}

:deep(.nova-sidebar-nav .el-menu-item.choose-item:hover) {
  background: var(--nova-selected) !important;
}

@media (hover: hover) {
  :deep(.nova-sidebar-nav .el-menu-item:hover) {
    background: var(--nova-button-hover) !important;
  }
}

:deep(.nova-sidebar-nav .el-menu-item:active) { background: var(--nova-button-active) !important; }
:deep(.nova-sidebar-nav .el-menu-item:focus-visible) { outline: none; box-shadow: var(--nova-button-focus-ring); }

.menu-name {
  user-select: none;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 20px;
}

.nav-icon :deep(.app-icon) {
  width: 18px;
  height: 18px;
  display: block;
  flex: 0 0 auto;
}


:deep(.el-scrollbar__wrap--hidden-default ) {
  background: var(--aside-backgound) !important;
}

:deep(.el-menu-item) {
  background: var(--aside-backgound);
}
:deep(.el-menu-item img) { width: 19px; height: 19px; opacity: .78; }
:deep(.choose-item img) { opacity: 1; }

:global(.dark .send-usage > .app-icon) {
  filter: none !important;
  opacity: .9;
}

:deep(.el-menu) {
  background: var(--aside-backgound);
}

.el-menu {
  margin-top: 14px;
  border-right: 0;
  width: 232px;
}

:deep(.el-divider__text) {
  background: var(--aside-backgound);
  color: #FFFFFF;
}

.scroll {
  /* Sidebar content: fills the space above the footer and scrolls on its own,
     so the quota block never moves and never needs the user to scroll. */
  flex: 1 1 auto;
  min-height: 0;
  height: auto;
}

.aside-footer {
  flex: 0 0 auto;
  padding: 8px 18px 14px;
  color: var(--secondary-text-color);
}

@media (max-width: 1025px) {
  .scroll {
    overscroll-behavior: contain;
  }

  .aside-footer {
    /* Match the scrolling panel instead of the raw --el-bg-color so light/dark
       stay visually continuous, and clear the phone's home-indicator area. */
    background: var(--aside-backgound);
    padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  }
}

@media (max-width: 767px) {
  /* The phone drawer has no room for the desktop compose button — the floating
     compose action owns that job. `display:none` removes the button and the
     vertical space it occupied, so nothing is left behind. */
  .compose {
    display: none;
  }

  /* The removed button used to contribute the gap under the brand; keep the
     brand-to-menu rhythm natural without it. */
  .el-menu {
    margin-top: 10px;
  }
}

.send-usage {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 0 11px;
  border-top: 1px solid var(--light-border);
}

.send-usage > .app-icon {
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--el-color-primary);
  opacity: .9;
}

.send-usage-body {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 5px;
}

.send-usage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.send-usage-head span {
  min-width: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--regular-text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.send-usage-head strong {
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 650;
  color: var(--regular-text-color);
}

.send-usage-track {
  position: relative;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--light-ill);
}

.send-usage-track > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--el-color-primary);
  transition:
    width var(--nova-motion-base) var(--nova-motion-ease);
}

.send-usage small {
  font-size: 10px;
  line-height: 1.35;
  color: var(--secondary-text-color);
}

.aside-version {
  padding-top: 9px;
  border-top: 1px solid var(--light-border);
  font-size: 10px;
  text-align: center;
  opacity: .72;
}
</style>
