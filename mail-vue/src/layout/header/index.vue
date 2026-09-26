<template>
  <div class="header" :class="!hasPerm('email:send') ? 'not-send' : ''">
    <div class="header-btn">
      <hanburger class="menu-button" @click="changeAside"></hanburger>
      <span class="breadcrumb-item">{{ $t(route.meta.title) }}</span>
    </div>
    <label class="search-shell desktop-search-only">
      <AppIcon name="search" :size="18" />
      <input v-model="keyword" :placeholder="$t('searchMail')" type="search" @keydown="handleKeydown" />
      <button v-if="keyword" class="search-clear" type="button" :aria-label="$t('clearSearch')" @click="clear">×</button>

    </label>
    <div class="toolbar">
      <div v-if="uiStore.dark" class="sun-icon icon-item" @click="openDark($event)">
        <AppIcon name="theme-toggle" :size="20" />
      </div>
      <div v-else class="dark-icon icon-item" @click="openDark($event)">
        <AppIcon name="theme-toggle" :size="20" />
      </div>
      <div
          class="notice icon-item"
          role="button"
          :aria-label="$t('noticeTitle')"
          :title="$t('noticeTitle')"
          @click="openNotice"
      >
        <AppIcon name="notifications" :size="20" />
        <!-- Data-driven unread dot: nothing renders at 0/null/undefined. -->
        <span
            v-if="Number(uiStore.unreadNotifications) > 0"
            class="notice-dot"
            aria-hidden="true"
        ></span>
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
                  <span class="address-email">{{ address.email }}</span>
                  <!-- Trailing status: the current-address check, then the
                       primary badge. Both shrink-proof, so neither can move the
                       address text — every address keeps one shared left
                       baseline. -->
                  <span
                      v-if="address.accountId === currentAccount.accountId"
                      class="address-state-check"
                      aria-hidden="true"
                  >
                    <svg class="address-state-icon" viewBox="0 0 16 16" width="16" height="16" focusable="false" aria-hidden="true">
                      <path d="M3.4 8.5 6.6 11.6 12.7 5.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </span>
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
import {computed, onMounted, ref, watch} from "vue";
import {useSettingStore} from "@/store/setting.js";
import {hasPerm} from "@/perm/perm.js"
import {useI18n} from "vue-i18n";
import {setExtend} from "@/utils/day.js"
import {applyThemeTransition} from "@/utils/theme-transition.js"
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
  uiStore.refreshNotifications()
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
  // Opening the announcement clears the unread dot for this visitor.
  uiStore.markNotificationsRead()
  uiStore.showNotice()
}

// The dot reflects the configured announcement, so keep it in sync whenever the
// notice settings arrive or change.
watch(
  () => [
    settingStore.settings.notice,
    settingStore.settings.noticeTitle,
    settingStore.settings.noticeContent
  ],
  () => uiStore.refreshNotifications()
)

function openDark(e) {
  applyThemeTransition(uiStore.dark ? 'light' : 'dark', e)
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


/* Mobile Header v2.
   Desktop behavior, mail search, OAuth avatars and account switching remain
   owned by the stable implementation above. */

@media (max-width: 767px) {
  .header,
  .header.not-send {
    height: 60px;
    min-height: 60px;

    padding: 0 12px;
    column-gap: 6px;
    row-gap: 0;

    /* The title owns the free row; the toolbar keeps its intrinsic width. The
       Inbox search now lives on its own row underneath the app bar. */
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;

    background: var(--nova-mobile-header-bg);
  }

  .header-btn {
    grid-column: 1;
    grid-row: 1;
    min-width: 0;
    gap: 2px;
  }

  .toolbar {
    grid-column: 2;
    grid-row: 1;

    /* Phone app bar: theme toggle and avatar read as one control group with a
       deliberate 16px seat between them, instead of touching each other. */
    gap: 16px;
    align-items: center;
    justify-content: end;
  }

  .search-shell {
    display: none;
  }

  /* 44px tap target: a quiet square, never a filled button. The header keeps
     its 60px height because the target is centred inside it, not stacked. */
  .toolbar .icon-item {
    width: 44px;
    height: 44px;
    border-radius: 10px;
  }

  /* Phones keep the bundled sun/moon assets (dark → sun, light → moon). Their
     art carries different internal transparent padding (the sun fills ~76% of
     its canvas, the moon ~63%), so each box is scaled to land both glyphs on
     the same ~20px optical size instead of matching raw box widths. ~20px keeps
     the toggle on the same scale as the rest of the phone chrome (bottom nav
     22px, compose 21px) instead of dominating the title and the avatar; the
     44px `.icon-item` above still owns the touch target. */
  .toolbar .sun-icon .app-icon {
    width: 26px;
    height: 26px;
  }

  .toolbar .dark-icon .app-icon {
    width: 32px;
    height: 32px;
  }

  .toolbar .notice {
    display: none;
  }

  .toolbar .setting-icon {
    display: none;
  }

  .toolbar .el-dropdown {
    width: 42px;
    height: 42px;

    display: grid;
    place-items: center;
  }

  .toolbar .avatar {
    width: 42px;
    height: 42px;

    margin: 0;

    justify-content: center;
  }

  .toolbar .avatar .avatar-text {
    width: 42px;
    height: 42px;
  }

  .toolbar .avatar .avatar-image {
    width: 42px;
    height: 42px;
    flex: 0 0 42px;
  }

  .toolbar .avatar .account-summary {
    display: none;
  }

  .breadcrumb-item {
    min-width: 0;

    font-size: 20px;
    font-weight: 600;

    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}



/* Mobile uses the Inbox search field instead of the desktop header search. */
@media (max-width: 767px) {
  .header > .search-shell {
    display: none !important;
  }
}



@media (max-width: 767px) {
  .desktop-search-only {
    display: none !important;
  }
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
  animation: nova-popover-in var(--nova-motion-base) var(--nova-motion-ease) forwards;

  .account-dropdown-head {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 15px 10px;
    /* Fixed header: it must not be squeezed by a long address list. */
    flex: 0 0 auto;
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
  /* Hairline under the section label: the top edge of the scrolling region. */
  .address-section-label { padding: 1px 15px 8px; border-bottom: 1px solid var(--nova-divider-soft, color-mix(in srgb, var(--nova-divider) 55%, transparent)); }
  /* The list owns the whole leftover column and scrolls itself: aliases are laid
     out flat (no collapsing, no paging, no "view all"), so it is always the list
     that scrolls — never the menu. */
  .address-list { flex: 1 1 auto; min-height: 0; max-height: none; overflow-y: auto; padding: 0 8px 8px; }
  .address-option {
    /* 43px again on the wide menu: a mouse-driven list reads better compact.
       Phones keep the taller touch row (see the 767px block). */
    width: 100%; height: 43px; display: flex; align-items: center; gap: 8px; padding: 0 7px;
    text-align: left; color: var(--el-text-color-primary); border-radius: 8px; cursor: pointer;
    transition: background-color .14s ease;
    .address-email { min-width: 0; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    &:hover { background: var(--nova-hover); }
    &.selected { color: var(--el-color-primary); font-weight: 600; background: var(--nova-selected); }
  }
  .primary-badge { flex: 0 0 auto; padding: 2px 6px; border-radius: 5px; color: var(--el-color-primary); background: color-mix(in srgb, var(--el-color-primary) 10%, transparent); font-size: 10px; font-weight: 650; }
  /* Trailing current-address check. Shrink-proof like the badge, so the trailing
     status can never move the address text. */
  .address-state-check { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 16px; width: 16px; height: 16px; margin-left: 2px; }
  .address-state-icon { display: block; }
  .address-loading { padding: 16px; color: var(--regular-text-color); text-align: center; }
  .account-dropdown-actions { flex: 0 0 auto; border-top: 1px solid var(--nova-divider); padding: 7px; display: grid; }
  .account-dropdown-actions button { min-height: 36px; display: flex; align-items: center; gap: 9px; padding: 0 8px; border-radius: 8px; text-align: left; color: var(--el-text-color-primary); cursor: pointer; }
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
  .search-clear { flex: 0 0 auto; width: 22px; height: 22px; border-radius: 50%; color: var(--regular-text-color); font-size: 17px; line-height: 20px; cursor: pointer; animation: nova-fade-scale-in var(--nova-motion-fast) var(--nova-motion-ease) forwards; }
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
    filter: var(--nova-ui-icon-filter) !important;
    opacity: 1 !important;
  }

  :global(.dark .toolbar .icon-item:hover .app-icon) {
    filter: var(--nova-ui-icon-filter-hover) !important;
    opacity: 1 !important;
  }

  .notice {
    position: relative;
    margin-right: 4px;
  }

  /* Only rendered when the store reports an unread notification. */
  .notice-dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--el-color-danger);
    box-shadow: 0 0 0 2px var(--nova-surface);
    pointer-events: none;
  }

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
  .header {
    height: 60px;
    min-height: 60px;
    padding: 0 12px;
    column-gap: 6px;
    row-gap: 0;
    align-items: center;
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .header.not-send { grid-template-columns: minmax(0, 1fr) auto; }
  .search-shell { display: none; }
  .header-btn { grid-column: 1; grid-row: 1; gap: 2px; }
  .toolbar { grid-column: 2; grid-row: 1; gap: 16px; }
  /* Menu button: a fixed 44px tap target instead of the 50px the hamburger
     component's inline `padding: 0 15px` produced, so the title sits closer. */
  .menu-button {
    width: 44px;
    height: 44px;
    padding: 0 !important;
    display: grid;
    place-items: center;
  }
  /* Phones keep the theme toggle: a 44px target whose sun/moon glyph is scaled
     to ~20px optical size (per-asset boxes live in the block above), still
     vertically centred on the 42px avatar and seated 16px away from it. */
  .toolbar .sun-icon,
  .toolbar .dark-icon { width: 44px; height: 44px; }
  .toolbar .notice { display: none; }
  .toolbar .setting-icon { display: none; }
  .toolbar .avatar { margin-left: 0; }
  .toolbar .avatar .avatar-text { width: 42px; height: 42px; }
  .toolbar .avatar .avatar-image { width: 42px; height: 42px; flex: 0 0 42px; }
  .toolbar .icon-item { width: 44px; height: 44px; }
  .toolbar .avatar .account-summary { display: none; }
  .breadcrumb-item { font-size: 15px; }
}

/* ---- Mobile Account Sheet -------------------------------------------------
   The layout is shared with the wide account menu above: one column capped in
   height, a fixed account header, the address list as the only scrolling region
   and fixed actions. Phones only add the phone-specific chrome — a viewport
   relative cap, native touch scrolling, no desktop scrollbar and the fade that
   replaces it.

   One 15px text gutter runs through the whole menu on both breakpoints: the
   "Mail addresses" label, the addresses and the action rows all start on the
   same x, and only the rounded row backgrounds are inset from it (8px of list
   padding + 7px of row padding = the 15px gutter). */
@media (max-width: 767px) {
  .user-details {
    /* `dvh` tracks the collapsing browser chrome; engines without dynamic
       viewport units fall back to the vh rule above the breakpoint. */
    max-height: min(75dvh, 720px);

    .address-option {
      /* Phone rows keep the touch height (48-52px band). */
      height: 50px;
    }

    .address-list {
      /* Native touch scrolling, no desktop scrollbar chrome, and no scroll
         chaining onto the page behind the sheet. */
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      scrollbar-width: none;

      /* Content fade at both ends, so the region reads as scrollable without a
         visible scrollbar. A mask carries alpha only, so it needs no colour at
         all — identical in light and dark. */
      -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%);
      mask-image: linear-gradient(to bottom, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%);
    }

    .address-list::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none;
    }
  }
}

.el-tooltip__trigger:first-child:focus-visible {
  outline: unset;
}
</style>
