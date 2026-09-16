<template>
  <el-scrollbar class="scroll">
    <div>
      <div class="title" >
        <img class="brand-mark" src="@/icons/svg/brand-mark.svg" alt="" />
        <div>{{settingStore.settings.title}}</div>
      </div>
      <button v-perm="'email:send'" class="compose" @click="openCompose">
        <img src="@/icons/svg/compose.svg" alt="" /> <span>{{ $t('compose') }}</span>
      </button>
      <el-menu :collapse="false" style="margin-top: 14px">
        <el-menu-item @click="router.push({name: 'email'})" index="email"
                      :class="route.meta.name === 'email' ? 'choose-item' : ''">
          <img src="@/icons/svg/inbox.svg" alt="" />
          <span class="menu-name">{{$t('inbox')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'send'})" index="send" v-perm="'email:send'"
                      :class="route.meta.name === 'send' ? 'choose-item' : ''">
          <img src="@/icons/svg/sent-nav.svg" alt="" />
          <span class="menu-name">{{$t('sent')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'draft'})" index="draft" v-perm="'email:send'"
                      :class="route.meta.name === 'draft' ? 'choose-item' : ''">
          <img src="@/icons/svg/drafts-nav.svg" alt="" />
          <span class="menu-name">{{$t('drafts')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'star'})" index="star"
                      :class="route.meta.name === 'star' ? 'choose-item' : ''">
          <img src="@/icons/svg/starred-nav.svg" alt="" />
          <span class="menu-name">{{$t('starred')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'setting'})" index="setting"
                      :class="route.meta.name === 'setting' ? 'choose-item' : ''">
          <img src="@/icons/svg/settings-top.svg" alt="" />
          <span class="menu-name">{{$t('settings')}}</span>
        </el-menu-item>
        <div class="manage-title" v-perm="['all-email:query','user:query','role:query','setting:query','analysis:query','reg-key:query']">
          <div>{{$t('manage')}}</div>
        </div>
        <el-menu-item @click="router.push({name: 'analysis'})" index="analysis" v-perm="'analysis:query'"
                      :class="route.meta.name === 'analysis' ? 'choose-item' : ''">
          <img src="@/icons/svg/history.svg" alt="" />
          <span class="menu-name">{{$t('analytics')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'user'})" index="setting" v-perm="'user:query'"
                      :class="route.meta.name === 'user' ? 'choose-item' : ''">
          <img src="@/icons/svg/users.svg" alt="" />
          <span class="menu-name">{{$t('allUsers')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'all-email'})" index="all-email" v-perm="'all-email:query'"
                      :class="route.meta.name === 'all-email' ? 'choose-item' : ''">
          <img src="@/icons/svg/mail-unread.svg" alt="" />
          <span class="menu-name">{{$t('allMail')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'role'})" index="setting" v-perm="'role:query'"
                      :class="route.meta.name === 'role' ? 'choose-item' : ''">
          <img src="@/icons/svg/lock.svg" alt="" />
          <span class="menu-name">{{$t('permissions')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'reg-key'})" index="reg-key" v-perm="'reg-key:query'"
                      :class="route.meta.name === 'reg-key' ? 'choose-item' : ''">
          <img src="@/icons/svg/label-nav.svg" alt="" />
          <span class="menu-name">{{$t('inviteCode')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'sys-setting'})" index="sys-setting" v-perm="'setting:query'"
                      :class="route.meta.name === 'sys-setting' ? 'choose-item' : ''">
          <img src="@/icons/svg/settings-top.svg" alt="" />
          <span class="menu-name">{{$t('SystemSettings')}}</span>
        </el-menu-item>
      </el-menu>
    </div>
  </el-scrollbar>
</template>

<script setup>
import router from "@/router/index.js";
import { useRoute } from "vue-router";
import {useSettingStore} from "@/store/setting.js";
import {useUiStore} from "@/store/ui.js";

const settingStore = useSettingStore();
const route = useRoute();
const uiStore = useUiStore();
const openCompose = () => uiStore.writerRef?.open()

</script>

<style lang="scss" scoped>

.title {
  margin: 12px 14px 8px;
  height: 38px;
  border-radius: 12px;
  display: flex;
  position: relative;
  font-size: 16px;
  font-weight: bold;
  align-items: center;
  justify-content: center;
  gap: 5px;
  color: var(--el-text-color-primary);
  max-width: 240px;
  padding: 0 10px;
  > div {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: calc(240px - 20px - 30px);
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
.brand-mark { width: 25px; height: 25px; }
.compose { margin: 6px 14px 4px; width: calc(100% - 28px); height: 40px; border-radius: 10px; color: #fff; background: var(--el-color-primary); display: flex; gap: 9px; align-items: center; justify-content: center; cursor: pointer; font-weight: 650; transition: filter .16s ease, transform .16s ease; }
.compose:hover { filter: brightness(.94); }
.compose:active { transform: scale(.98); }
.compose img { width: 18px; height: 18px; filter: brightness(0) invert(1); }


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

:deep(.el-menu) {
  background: var(--aside-backgound);
}

.el-menu {
  border-right: 0;
  width: 232px;
}

:deep(.el-divider__text) {
  background: var(--aside-backgound);
  color: #FFFFFF;
}

.scroll {

}
</style>
