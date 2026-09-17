<template>
  <div class="header" :class="!hasPerm('email:send') ? 'not-send' : ''">
    <div class="header-btn">
      <hanburger @click="changeAside"></hanburger>
      <span class="breadcrumb-item">{{ $t(route.meta.title) }}</span>
    </div>
    <label class="search-shell">
      <AppIcon name="search" :size="18" />
      <input v-model="keyword" :placeholder="$t('searchMail')" type="search" @keydown="handleKeydown" />
      <button v-if="keyword" class="search-clear" type="button" :aria-label="$t('clearSearch')" @click="clear">×</button>
      <kbd v-else>⌘ K</kbd>
    </label>
    <div class="toolbar">
      <div v-if="uiStore.dark" class="sun-icon icon-item" @click="openDark($event)">
        <AppIcon name="theme-toggle" :size="20" />
      </div>
      <div v-else class="dark-icon icon-item" @click="openDark($event)">
        <AppIcon name="theme-toggle" :size="20" />
      </div>
      <div class="notice icon-item" @click="openNotice">
        <AppIcon name="notifications" :size="20" />
      </div>
      <el-dropdown ref="userinfoRef" @visible-change="e => userInfoShow = e" :teleported="false" popper-class="detail-dropdown">
        <div class="avatar" @click.stop="openAccountSwitcher" >
          <img v-if="currentAvatar" class="avatar-image" :src="currentAvatar" alt="" @error="handleAvatarError" />
          <div v-else class="avatar-text">
            <div>{{ formatName(currentAccount.email || userStore.user.email) }}</div>
          </div>
          <div class="account-summary">
            <strong>{{ accountDisplayName }}</strong>
            <span>{{ currentAccount.email || userStore.user.email }}</span>
          </div>
          <Icon class="setting-icon" icon="mingcute:down-small-fill" width="24" height="24"/>
        </div>
        <template #dropdown>
          <div class="user-details">
            <div class="account-dropdown-head">
              <img v-if="currentAvatar" class="account-dropdown-avatar account-dropdown-avatar-image" :src="currentAvatar" alt="" @error="handleAvatarError" />
              <div v-else class="account-dropdown-avatar">{{ formatName(primaryAddress) }}</div>
              <div>
                <strong>{{ accountDisplayName }}</strong>
                <span>{{ $t('accountLabel') }}</span>
              </div>
            </div>
            <div class="address-section">
              <div class="address-section-label">{{ $t('mailAddresses') }}</div>
              <div class="address-list" v-if="accounts.length">
                <button
                    v-for="address in accounts"
                    :key="address.accountId"
                    class="address-option"
                    :class="{ selected: address.accountId === currentAccount.accountId }"
                    @click="selectAccount(address)"
                >
                  <AppIcon v-if="address.accountId === currentAccount.accountId" name="checkbox-checked" :size="16" />
                  <span v-else class="address-check-placeholder"></span>
                  <span class="address-email">{{ address.email }}</span>
                  <small v-if="address.email === primaryAddress" class="primary-badge">{{ $t('primary') }}</small>
                </button>
              </div>
              <div v-else class="address-loading">{{ $t('loading') }}</div>
            </div>
            <div class="account-dropdown-actions">
              <button v-if="hasPerm('account:query')" @click="openManageAddresses"><AppIcon name="user" :size="17" />{{ $t('manageAddresses') }}</button>
              <button @click="router.push({ name: 'setting' })"><AppIcon name="settings-top" :size="17" />{{ $t('settings') }}</button>
              <button class="sign-out" :disabled="logoutLoading" @click="clickLogout">{{ $t('logOut') }}</button>
            </div>
          </div>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup>
import router from "@/router";
import hanburger from '@/components/hamburger/index.vue'
import {logout} from "@/request/login.js";
import {useUiStore} from "@/store/ui.js";
import {useUserStore} from "@/store/user.js";
import {useRoute} from "vue-router";
import {computed, onMounted, ref} from "vue";
import {useSettingStore} from "@/store/setting.js";
import {hasPerm} from "@/perm/perm.js"
import {useI18n} from "vue-i18n";
import {setExtend} from "@/utils/day.js"
import {accountList} from "@/request/account.js";
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {useMailSearch} from "@/composables/use-mail-search.js";

const {t} = useI18n();
const route = useRoute();
const settingStore = useSettingStore();
const userStore = useUserStore();
const uiStore = useUiStore();
const accountStore = useAccountStore();
const emailStore = useEmailStore();
const {keyword, clear, handleKeydown} = useMailSearch();
const logoutLoading = ref(false)
const userInfoShow = ref(false)
const userinfoRef = ref({})
const accounts = ref([])

const currentAccount = computed(() => accountStore.currentAccount || {})
const primaryAddress = computed(() => userStore.user.email || currentAccount.value.email || '')
const accountDisplayName = computed(() => userStore.user.name || formatName(primaryAddress.value))
const currentAvatar = computed(() => userStore.githubAvatar || userStore.googleAvatar)

const accountCount = computed(() => {
  return userStore.user.role.accountCount
})

const sendType = computed(() => {

  if (settingStore.settings.send === 1) {
    return t('disabled')
  }

  if (!hasPerm('email:send')) {
    return t('unauthorized')
  }

  if (userStore.user.role.sendType === 'ban') {
    return t('sendBanned')
  }

  if (userStore.user.role.sendType === 'internal') {
    return t('sendInternal')
  }

  if (!userStore.user.role.sendCount) {
    return t('unlimited')
  }

  if (userStore.user.role.sendType === 'day') {
    return t('daily')
  }

  if (userStore.user.role.sendType === 'count') {
    return t('total')
  }
})

const sendCount = computed(() => {


  if (!hasPerm('email:send')) {
    return null
  }

  if (userStore.user.role.sendType === 'ban') {
    return null
  }

  if (userStore.user.role.sendType === 'internal') {
    return null
  }

  if (!userStore.user.role.sendCount) {
    return null
  }

  if (settingStore.settings.send === 1) {
    return null
  }

  return userStore.user.sendCount + '/' + userStore.user.role.sendCount
})

function userInfoHide() {
    if (userInfoShow.value) {
        userinfoRef.value.handleClose()
    } else {
        userinfoRef.value.handleOpen()
    }
}

function openAccountSwitcher() {
  if (window.innerWidth < 768) {
    // The mobile account list used to open alongside this dropdown. Keep the
    // profile interaction single-owned by the account popover; the full
    // address-management page remains available through Manage addresses.
    uiStore.accountShow = false
    userInfoHide()
    return
  }
  userInfoHide()
}

function selectAccount(account) {
  if (account.accountId === currentAccount.value.accountId) {
    userinfoRef.value.handleClose()
    return
  }
  accountStore.currentAccountId = account.accountId
  accountStore.currentAccount = account
  emailStore.emailScroll?.refreshList()
  emailStore.sendScroll?.refreshList()
  userinfoRef.value.handleClose()
}

function openManageAddresses() {
  userinfoRef.value.handleClose()
  router.push({ name: 'addresses' })
}

async function loadAccounts() {
  if (!hasPerm('account:query')) return
  const list = await accountList(0, 30)
  accounts.value = list
  accountStore.addresses = list
  if (!currentAccount.value?.accountId && list[0]) {
    accountStore.currentAccountId = list[0].accountId
    accountStore.currentAccount = list[0]
  }
}

onMounted(() => {
  loadAccounts().catch(() => {
    accounts.value = []
  })
  userStore.refreshGithubAccount()
  userStore.refreshGoogleAccount()
})

function handleAvatarError() {
  if (userStore.githubAvatar) userStore.githubAvatar = ''
  else userStore.googleAvatar = ''
}

function changeLang(lang) {
  setExtend(lang === 'en' ? 'en' : 'zh-cn')
  settingStore.lang = lang
}

function openNotice() {
  uiStore.showNotice()
}

function openDark(e) {

  const nextIsDark = !uiStore.dark
  const root = document.documentElement

  if (!document.startViewTransition) {
    switchDark(nextIsDark, root);
    return
  }

  const x = e.clientX
  const y = e.clientY

  const maxX = Math.max(x, window.innerWidth - x)
  const maxY = Math.max(y, window.innerHeight - y)
  const endRadius = Math.hypot(maxX, maxY)

  // 标记切换目标，供 CSS 选择器使用
  root.setAttribute('data-theme-to', nextIsDark ? 'dark' : 'light')
  root.style.setProperty('--vt-x', `${x}px`)
  root.style.setProperty('--vt-y', `${y}px`)
  root.style.setProperty('--vt-end-radius', `${endRadius + 10}px`)

  const transition = document.startViewTransition(() => {
    switchDark(nextIsDark, root);
  })

  transition.finished.finally(() => {
    // 清理标记
    root.removeAttribute('data-theme-to')
  })
}

function switchDark(nextIsDark, root) {
  root.setAttribute('class', nextIsDark ? 'dark' : '')
  const metaTag = document.getElementById('theme-color-meta');
  const isMobile =  !window.matchMedia("(pointer: fine) and (hover: hover)").matches;
  metaTag.setAttribute('content', nextIsDark ? (isMobile ? '#141414' : '#000000') : (isMobile ? '#191A23' : '#F1F1F1'));
  uiStore.dark = nextIsDark
}

function changeAside() {
  uiStore.asideShow = !uiStore.asideShow
}

function clickLogout() {
  logoutLoading.value = true
  logout().then(() => {
    localStorage.removeItem("token")
    router.replace('/login')
  }).finally(() => {
    logoutLoading.value = false
  })
}

function formatName(email) {
  return email?.[0]?.toUpperCase() || ''
}

</script>
<style>
.detail-dropdown {
  color: var(--el-text-color-primary) !important;
}
</style>
<style lang="scss" scoped>

:deep(.el-popper.is-pure) {
  border: 1px solid var(--nova-divider);
  background: var(--nova-surface);
  border-radius: 14px;
  box-shadow: 0 14px 34px color-mix(in srgb, #101828 14%, transparent);
  overflow: hidden;
}

.user-details {
  width: min(340px, calc(100vw - 24px));
  min-width: 300px;
  max-height: min(620px, calc(100vh - 100px));
  font-size: 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .account-dropdown-head {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 15px 10px;
    strong, span { display: block; }
    strong { font-size: 14px; color: var(--el-text-color-primary); font-weight: 680; }
    span { margin-top: 2px; font-size: 12px; color: var(--regular-text-color); }
    > div:not(.account-dropdown-avatar) { align-self: flex-start; min-width: 0; text-align: left; }
  }

  .account-dropdown-avatar {
    width: 38px; height: 38px; display: grid; place-items: center; flex: 0 0 38px;
    border-radius: 50%; color: var(--el-color-primary); background: var(--nova-selected);
    border: 1px solid color-mix(in srgb, var(--el-color-primary) 18%, var(--nova-divider)); font-weight: 700;
  }
  .account-dropdown-avatar-image { display: block; object-fit: cover; border: 0; }
  .address-section-label { display: block; align-self: flex-start; width: 100%; color: var(--regular-text-color); font-size: 11px; font-weight: 650; letter-spacing: .08em; text-align: left; text-transform: uppercase; }
  .address-section { display: flex; flex: 1 1 auto; min-height: 0; flex-direction: column; padding-top: 11px; }
  .address-section-label { padding: 1px 15px 8px; }
  .address-list { padding: 0 15px 7px; max-height: min(360px, calc(100vh - 285px)); overflow: auto; }
  .address-option {
    width: 100%; height: 43px; display: flex; align-items: center; gap: 8px; padding: 0 10px;
    text-align: left; color: var(--el-text-color-primary); border-radius: 8px; cursor: pointer;
    transition: background-color .14s ease;
    .address-email { min-width: 0; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    &:hover { background: var(--nova-hover); }
    &.selected { color: var(--el-color-primary); font-weight: 600; background: var(--nova-selected); }
    .app-icon, .address-check-placeholder { width: 16px; height: 16px; flex: 0 0 16px; }
  }
  .primary-badge { flex: 0 0 auto; padding: 2px 6px; border-radius: 5px; color: var(--el-color-primary); background: color-mix(in srgb, var(--el-color-primary) 10%, transparent); font-size: 10px; font-weight: 650; }
  .address-loading { padding: 16px; color: var(--regular-text-color); text-align: center; }
  .account-dropdown-actions { flex: 0 0 auto; border-top: 1px solid var(--nova-divider); padding: 7px; display: grid; }
  .account-dropdown-actions button { min-height: 36px; display: flex; align-items: center; gap: 9px; padding: 0 10px; border-radius: 8px; text-align: left; color: var(--el-text-color-primary); cursor: pointer; }
  .account-dropdown-actions button:hover { background: var(--nova-hover); }
  .account-dropdown-actions .sign-out { color: #d84a4a; }
}


.header {
  text-align: right;
  font-size: 12px;
  display: grid;
  height: 100%;
  gap: 12px;
  padding: 0 14px;
  grid-template-columns: minmax(92px, auto) minmax(220px, 1fr) auto;
}

.header.not-send {
  grid-template-columns: minmax(92px, auto) minmax(220px, 1fr) auto;
}

.search-shell {
  height: 38px;
  align-self: center;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 11px;
  color: var(--regular-text-color);
  background: transparent;
  border: 1px solid var(--nova-divider);
  border-radius: 10px;
  transition: border-color .16s ease, box-shadow .16s ease;
  .app-icon { opacity: .68; }
  :global(.dark .search-shell .app-icon) { filter: var(--nova-ui-icon-filter); opacity: 1; }
  input { width: 100%; min-width: 0; color: inherit; }
  input::placeholder { color: var(--regular-text-color); opacity: .92; }
  .search-clear { flex: 0 0 auto; width: 22px; height: 22px; border-radius: 50%; color: var(--regular-text-color); font-size: 17px; line-height: 20px; cursor: pointer; }
  .search-clear:hover { color: var(--el-text-color-primary); background: var(--nova-hover); }
  &:focus-within { border-color: var(--el-color-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-primary) 12%, transparent); }
  kbd { padding: 2px 6px; white-space: nowrap; font-size: 11px; color: var(--regular-text-color); background: var(--base-fill); border-radius: 5px; }
}

.header-btn {
  display: inline-flex;
  align-items: center;
  height: 100%;
  min-width: 0;
}

.breadcrumb-item {
  font-weight: bold;
  font-size: 15px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.toolbar {
  display: flex;
  justify-content: end;
  gap: 6px;
  @media (max-width: 767px) {
    gap: 10px;
  }

  .icon-item {
    align-self: center;
    width: 34px;
    height: 34px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .icon-item:hover {
    background: var(--base-fill);
  }

  :global(.dark .toolbar .icon-item .app-icon) {
    filter: var(--nova-ui-icon-filter);
    opacity: 1;
  }

  :global(.dark .toolbar .icon-item:hover .app-icon) {
    filter: var(--nova-ui-icon-filter-hover);
  }

  .notice { margin-right: 4px; }

  .avatar {
    display: flex;
    align-items: center;
    cursor: pointer;

    .avatar-text {
      background: var(--el-bg-color);
      color: var(--el-text-color-primary);
      height: 33px;
      width: 33px;
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: 50%;
      border: 1px solid var(--nova-divider);
    }

    .avatar-image {
      width: 33px;
      height: 33px;
      flex: 0 0 33px;
      border-radius: 50%;
      object-fit: cover;
    }

    .setting-icon {
      position: relative;
      top: 0;
      margin-right: 10px;
      bottom: 10px;
    }

    .account-summary {
      display: grid;
      gap: 1px;
      max-width: min(180px, 16vw);
      margin-left: 8px;
      text-align: left;
      line-height: 1.2;
      strong, span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      strong { font-size: 13px; font-weight: 650; color: var(--el-text-color-primary); }
      span { font-size: 11px; color: var(--regular-text-color); }
    }
  }

}

@media (max-width: 767px) {
  .header { height: auto; min-height: 58px; padding: 8px 12px; gap: 8px; grid-template-columns: auto 1fr auto; }
  .header.not-send { grid-template-columns: auto 1fr; }
  .search-shell { display: none; }
  .toolbar .notice { display: none; }
  .toolbar .setting-icon { display: none; }
  .toolbar .avatar { margin-left: 2px; }
  .toolbar .avatar .account-summary { display: none; }
  .breadcrumb-item { font-size: 16px; }
}

.el-tooltip__trigger:first-child:focus-visible {
  outline: unset;
}
</style>
