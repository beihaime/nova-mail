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
        <div class="avatar" @click="userInfoHide" >
          <div class="avatar-text">
            <div>{{ formatName(userStore.user.email) }}</div>
          </div>
          <Icon class="setting-icon" icon="mingcute:down-small-fill" width="24" height="24"/>
        </div>
        <template #dropdown>
          <div class="user-details">
            <div class="details-avatar">
              {{ formatName(userStore.user.email) }}
            </div>
            <div class="user-name">
              {{ userStore.user.name }}
            </div>
            <div class="detail-email" @click="copyEmail(userStore.user.email)">
              {{ userStore.user.email }}
            </div>
            <div class="detail-user-type">
              <el-tag>{{ userStore.user.role.name }}</el-tag>
            </div>
            <div class="action-info">
              <div>
                <span style="margin-right: 10px">{{ $t('sendCount') }}</span>
                <span style="margin-right: 10px">{{ $t('accountCount') }}</span>
              </div>
              <div>
                <div>
                  <span v-if="sendCount" style="margin-right: 5px">{{ sendCount }}</span>
                  <el-tag v-if="!hasPerm('email:send')">{{ sendType }}</el-tag>
                  <el-tag v-else>{{ sendType }}</el-tag>
                </div>
                <div>
                  <el-tag v-if="settingStore.settings.manyEmail || settingStore.settings.addEmail">
                    {{ $t('disabled') }}
                  </el-tag>
                  <span v-else-if="accountCount && hasPerm('account:add')"
                        style="margin-right: 5px">{{ $t('totalUserAccount', {msg: accountCount}) }}</span>
                  <el-tag v-else-if="!accountCount && hasPerm('account:add')">{{ $t('unlimited') }}</el-tag>
                  <el-tag v-else-if="!hasPerm('account:add')">{{ $t('unauthorized') }}</el-tag>
                </div>
              </div>
            </div>
            <div class="logout">
              <el-button type="primary" :loading="logoutLoading" @click="clickLogout">{{ $t('logOut') }}</el-button>
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
import {computed, ref} from "vue";
import {useSettingStore} from "@/store/setting.js";
import {hasPerm} from "@/perm/perm.js"
import {useI18n} from "vue-i18n";
import {setExtend} from "@/utils/day.js"

const {t} = useI18n();
const route = useRoute();
const settingStore = useSettingStore();
const userStore = useUserStore();
const uiStore = useUiStore();
const logoutLoading = ref(false)
const userInfoShow = ref(false)
const userinfoRef = ref({})

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

function userInfoHide(e) {
    if (userInfoShow.value) {
        userinfoRef.value.handleClose()
    } else {
        userinfoRef.value.handleOpen()
    }
}

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
  width: 250px;
  font-size: 14px;
  display: grid;
  grid-template-columns: 1fr;
  justify-items: center;

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
  gap: 16px;
  grid-template-columns: auto minmax(220px, 610px) auto 1fr;
}

.header.not-send {
  grid-template-columns: auto minmax(220px, 610px) 1fr;
}

.search-shell {
  height: 44px;
  align-self: center;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  color: var(--regular-text-color);
  background: var(--extra-light-fill);
  border: 1px solid var(--light-border);
  border-radius: 13px;
  transition: border-color .16s ease, box-shadow .16s ease;
  img { width: 18px; height: 18px; opacity: .68; }
  input { width: 100%; min-width: 0; color: inherit; }
  input::placeholder { color: var(--regular-text-color); opacity: .92; }
  &:focus-within { border-color: var(--el-color-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-primary) 14%, transparent); }
  kbd { padding: 2px 7px; white-space: nowrap; font-size: 12px; color: var(--regular-text-color); background: var(--base-fill); border-radius: 6px; }
}

.writer-box {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 2px;

  .writer {
    width: 36px;
    height: 36px;
    border-radius: 10px;
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
    width: 36px;
    height: 36px;
    border-radius: 10px;
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
      height: 34px;
      width: 34px;
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: 10px;
      border: 1px solid var(--dark-border);
    }

    .setting-icon {
      position: relative;
      top: 0;
      margin-right: 10px;
      bottom: 10px;
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
  .breadcrumb-item { font-size: 16px; }
}

.el-tooltip__trigger:first-child:focus-visible {
  outline: unset;
}
</style>
