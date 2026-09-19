<template>
  <el-scrollbar class="scroll">
    <div>
      <div class="title" >
        <AppIcon class="brand-mark" name="brand-app" :size="44" />
        <div>{{settingStore.settings.title}}</div>
      </div>
      <button v-perm="'email:send'" class="compose" @click="openCompose">
         <span>{{ $t('compose') }}</span>
      </button>
      <el-menu :collapse="false">
        <el-menu-item @click="router.push({name: 'email'})" index="email"
                      :class="route.meta.name === 'email' ? 'choose-item' : ''">
          <AppIcon name="inbox" :size="19" />
          <span class="menu-name">{{$t('inbox')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'send'})" index="send" v-perm="'email:send'"
                      :class="route.meta.name === 'send' ? 'choose-item' : ''">
          <AppIcon name="sent-nav" :size="19" />
          <span class="menu-name">{{$t('sent')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'draft'})" index="draft" v-perm="'email:send'"
                      :class="route.meta.name === 'draft' ? 'choose-item' : ''">
          <AppIcon name="drafts-nav" :size="19" />
          <span class="menu-name">{{$t('drafts')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'star'})" index="star"
                      :class="route.meta.name === 'star' ? 'choose-item' : ''">
          <AppIcon name="starred-nav" :size="19" />
          <span class="menu-name">{{$t('starred')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'setting'})" index="setting"
                      :class="route.meta.name === 'setting' ? 'choose-item' : ''">
          <AppIcon name="settings-top" :size="19" />
          <span class="menu-name">{{$t('settings')}}</span>
        </el-menu-item>
        <div class="manage-title" v-perm="['all-email:query','user:query','role:query','setting:query','analysis:query','reg-key:query']">
          <div>{{$t('manage')}}</div>
        </div>
        <el-menu-item @click="router.push({name: 'analysis'})" index="analysis" v-perm="'analysis:query'"
                      :class="route.meta.name === 'analysis' ? 'choose-item' : ''">
          <AppIcon name="history" :size="19" />
          <span class="menu-name">{{$t('analytics')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'user'})" index="setting" v-perm="'user:query'"
                      :class="route.meta.name === 'user' ? 'choose-item' : ''">
          <AppIcon name="users" :size="19" />
          <span class="menu-name">{{$t('allUsers')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'all-email'})" index="all-email" v-perm="'all-email:query'"
                      :class="route.meta.name === 'all-email' ? 'choose-item' : ''">
          <AppIcon name="mail-unread" :size="19" />
          <span class="menu-name">{{$t('allMail')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'role'})" index="setting" v-perm="'role:query'"
                      :class="route.meta.name === 'role' ? 'choose-item' : ''">
          <AppIcon name="lock" :size="19" />
          <span class="menu-name">{{$t('permissions')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'reg-key'})" index="reg-key" v-perm="'reg-key:query'"
                      :class="route.meta.name === 'reg-key' ? 'choose-item' : ''">
          <AppIcon name="label-nav" :size="19" />
          <span class="menu-name">{{$t('inviteCode')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'sys-setting'})" index="sys-setting" v-perm="'setting:query'"
                      :class="route.meta.name === 'sys-setting' ? 'choose-item' : ''">
          <AppIcon name="settings-top" :size="19" />
          <span class="menu-name">{{$t('SystemSettings')}}</span>
        </el-menu-item>
      </el-menu>
    </div>
  </el-scrollbar>
  <footer class="aside-footer">
    <div class="send-usage">
      <AppIcon name="send-action" :size="17" />

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
import packageInfo from '../../../package.json'

const settingStore = useSettingStore();
const route = useRoute();
const uiStore = useUiStore();
const userStore = useUserStore();

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
  margin: 6px 14px 4px;
  width: calc(100% - 28px);
  height: 42px;

  border: none;
  border-radius: 10px;

  color: #fff;
  background: var(--el-color-primary);

  display: flex;
  align-items: center;
  justify-content: center;

  cursor: pointer;
  font-weight: 650;

  transition:
    filter .16s ease,
    transform .16s ease;
}

.compose:hover {
  filter: brightness(.94);
}

.compose:active {
  transform: scale(.98);
}


.title {
  margin: 12px 14px 8px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  position: relative;

  font-size: 19px;
  font-weight: 700;

  align-items: center;
  justify-content: center;
  gap: 8px;

  color: var(--el-text-color-primary);
  max-width: 240px;
  padding: 0 10px;

  > div {
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


.manage-title {
  margin-top: 8px;
  padding-left: 24px;
  color: var(--secondary-text-color);
  font-size: 12px;
}

.el-menu-item {
  margin: 1px 10px !important;
  border-radius: 9px;
  height: 38px;
  padding: 9px 12px !important;
}

.choose-item {
  font-weight: 650;
  background: var(--aside-menu-active-background) !important;
  backdrop-filter: blur(4px);
}

@media (hover: hover) {
  .el-menu-item:hover {
    background: var(--base-fill) !important;
  }
}

.menu-name {
  user-select: none;
  margin-left: 12px;
}


:deep(.el-scrollbar__wrap--hidden-default ) {
  background: var(--aside-backgound) !important;
}

:deep(.el-menu-item) {
  background: var(--aside-backgound);
}
:deep(.el-menu-item img) { width: 19px; height: 19px; opacity: .78; }
:deep(.choose-item img) { opacity: 1; }

/* Most navigation assets are embedded monochrome PNGs inside their SVG files.
 * Keep the active brand/blue icon untouched, while lifting inactive icons only
 * in dark mode so they remain readable without changing the light theme. */
:global(.dark .el-menu-item:not(.choose-item) .app-icon) {
  filter: var(--nova-ui-icon-filter);
  opacity: 1;
}
:global(.dark .el-menu-item:not(.choose-item):hover .app-icon) {
  filter: var(--nova-ui-icon-filter-hover);
}
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
