<template>
  <div class="header" :class="!hasPerm('email:send') ? 'not-send' : ''">
    <div class="header-btn">
      <hanburger @click="changeAside"></hanburger>
      <span class="breadcrumb-item">{{ $t(route.meta.title) }}</span>
    </div>
    <label class="search-shell">
      <img src="@/icons/svg/search.svg" alt="" />
      <input :placeholder="$t('searchMail')" type="search" />
      <kbd>⌘ K</kbd>
    </label>
    <div v-perm="'email:send'" class="writer-box" @click="openSend">
      <div class="writer">
        <img src="@/icons/svg/compose.svg" alt="" />
      </div>
    </div>
    <div class="toolbar">
      <div v-if="uiStore.dark" class="sun-icon icon-item" @click="openDark($event)">
        <Icon icon="mingcute:sun-fill"/>
      </div>
      <div v-else class="dark-icon icon-item" @click="openDark($event)">
        <Icon icon="solar:moon-linear"/>
      </div>
      <div class="notice icon-item" @click="openNotice">
        <img src="@/icons/svg/notifications.svg" alt="" />
      </div>
      <el-dropdown ref="userinfoRef" @visible-change="e => userInfoShow = e" :teleported="false" popper-class="detail-dropdown">
        <div class="avatar" @click="openAccountSwitcher" >
          <div class="avatar-text">
            <div>{{ formatName(currentAccount.email || userStore.user.email) }}</div>
          </div>
          <div class="account-summary">
            <strong>{{ userStore.user.name || currentAccount.name || formatName(userStore.user.email) }}</strong>
            <span>{{ currentAccount.email || userStore.user.email }}</span>
          </div>
          <Icon class="setting-icon" icon="mingcute:down-small-fill" width="24" height="24"/>
        </div>
        <template #dropdown>
          <div class="user-details">
            <div class="account-dropdown-head">
              <strong>{{ userStore.user.name || currentAccount.name }}</strong>
              <span @click="copyEmail(userStore.user.email)">{{ userStore.user.email }}</span>
            </div>
            <div class="address-list" v-if="accounts.length">
              <button
                  v-for="address in accounts"
                  :key="address.accountId"
                  class="address-option"
                  :class="{ selected: address.accountId === currentAccount.accountId }"
                  @click="selectAccount(address)"
              >
                <img v-if="address.accountId === currentAccount.accountId" src="@/icons/svg/checkbox-checked.svg" alt="" />
                <span v-else class="address-check-placeholder"></span>
                <span>{{ address.email }}</span>
              </button>
            </div>
            <div v-else class="address-loading">{{ $t('loading') }}</div>
            <div class="account-dropdown-actions">
              <button v-if="hasPerm('account:query')" @click="openManageAddresses">{{ $t('manage') }} {{ $t('accountCount') }}</button>
              <button @click="router.push({ name: 'setting' })">{{ $t('settings') }}</button>
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
import {Icon} from "@iconify/vue";
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

const {t} = useI18n();
const route = useRoute();
const settingStore = useSettingStore();
const userStore = useUserStore();
const uiStore = useUiStore();
const accountStore = useAccountStore();
const emailStore = useEmailStore();
const logoutLoading = ref(false)
const userInfoShow = ref(false)
const userinfoRef = ref({})
const accounts = ref([])

const currentAccount = computed(() => accountStore.currentAccount || {})

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
    uiStore.accountShow = true
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
  uiStore.accountShow = true
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
})

async function copyEmail(email) {
  try {
    await navigator.clipboard.writeText(email);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true,
    })
  } catch (err) {
    console.error(`${t('copyFailMsg')}:`, err);
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true,
    })
  }
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

function openSend() {
  uiStore.writerRef.open()
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
  return email[0]?.toUpperCase() || ''
}

</script>
<style>
.detail-dropdown {
  color: var(--el-text-color-primary) !important;
}
</style>
<style lang="scss" scoped>

:deep(.el-popper.is-pure) {
  border-radius: 6px;
}

.user-details {
  width: 280px;
  font-size: 14px;
  display: grid;
  grid-template-columns: 1fr;
  justify-items: stretch;

  .account-dropdown-head {
    display: grid;
    gap: 2px;
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--nova-divider);

    strong { font-size: 14px; color: var(--el-text-color-primary); }
    span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--regular-text-color); cursor: pointer; }
  }

  .address-list { padding: 6px; max-height: min(300px, 42vh); overflow: auto; }
  .address-option {
    width: 100%; min-height: 36px; display: flex; align-items: center; gap: 9px; padding: 7px 9px;
    text-align: left; color: var(--el-text-color-primary); border-radius: 8px; cursor: pointer;
    transition: background-color .14s ease;
    span:last-child { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    &:hover { background: var(--nova-hover); }
    &.selected { color: var(--el-color-primary); font-weight: 600; background: var(--nova-selected); }
    img, .address-check-placeholder { width: 16px; height: 16px; flex: 0 0 16px; }
  }
  .address-loading { padding: 16px; color: var(--regular-text-color); text-align: center; }
  .account-dropdown-actions { border-top: 1px solid var(--nova-divider); padding: 6px; display: grid; }
  .account-dropdown-actions button { min-height: 34px; padding: 0 10px; border-radius: 8px; text-align: left; color: var(--el-text-color-primary); cursor: pointer; }
  .account-dropdown-actions button:hover { background: var(--nova-hover); }
  .account-dropdown-actions .sign-out { color: #d84a4a; }

  .user-name {
    font-weight: bold;
    margin-top: 10px;
    padding-left: 20px;
    padding-right: 20px;
    width: 250px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: center;
  }

  .detail-user-type {
    margin-top: 10px;
  }

  .action-info {
    width: 100%;
    display: grid;
    grid-template-columns: auto auto;
    margin-top: 10px;

    > div:first-child {
      display: grid;
      align-items: center;
      gap: 10px;
    }

    > div:last-child {
      display: grid;
      gap: 10px;
      text-align: center;

      > div {
        display: flex;
        align-items: center;
      }
    }
  }

  .detail-email {
    padding-left: 20px;
    padding-right: 20px;
    width: 250px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: center;
    color: var(--regular-text-color);
    cursor: pointer;
  }

  .logout {
    margin-top: 20px;
    width: 100%;
    padding-left: 10px;
    padding-right: 10px;
    padding-bottom: 10px;

    .el-button {
      border-radius: 6px;
      height: 28px;
      width: 100%;
    }
  }

  .details-avatar {
    margin-top: 20px;
    height: 40px;
    width: 40px;
    background: var(--el-bg-color);
    color: var(--el-text-color-primary);
    border: 1px solid var(--dark-border);
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
  }
}


.header {
  text-align: right;
  font-size: 12px;
  display: grid;
  height: 100%;
  gap: 12px;
  padding: 0 14px;
  grid-template-columns: minmax(92px, auto) minmax(220px, 1fr) auto auto;
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
  img { width: 18px; height: 18px; opacity: .68; }
  input { width: 100%; min-width: 0; color: inherit; }
  input::placeholder { color: var(--regular-text-color); opacity: .92; }
  &:focus-within { border-color: var(--el-color-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-primary) 12%, transparent); }
  kbd { padding: 2px 6px; white-space: nowrap; font-size: 11px; color: var(--regular-text-color); background: var(--base-fill); border-radius: 5px; }
}

.writer-box {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 2px;

  .writer {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    color: #ffffff;
    background: var(--el-color-primary);
    transition: filter .16s ease, transform .16s ease;
    display: flex;
    align-items: center;
    justify-content: center;

    .writer-text {
      margin-left: 15px;
      font-size: 14px;
      font-weight: bold;;
    }
  }
  &:hover .writer { filter: brightness(.94); }
  &:active .writer { transform: scale(.96); }
  img { width: 18px; filter: brightness(0) invert(1); }
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

  .notice {
    font-size: 22px;
    margin-right: 4px;
  }

  .dark-icon {
    font-size: 20px;
  }

  .sun-icon {
    font-size: 24px;
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
  .writer-box { margin-left: 0; }
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
