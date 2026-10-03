<template>
  <div class="box">
    <div class="container">
      <div class="title">{{$t('profile')}}</div>
      <div class="item">
        <div>{{$t('username')}}</div>
        <div>
          <span v-if="setNameShow" class="edit-name-input">
            <el-input v-model="accountName"  ></el-input>
            <span class="edit-name" @click="setName">
             {{$t('save')}}
            </span>
          </span>
          <span v-else class="user-name">
            <span >{{ userStore.user.name }}</span>
            <span class="edit-name" @click="showSetName">
             {{$t('change')}}
            </span>
          </span>
        </div>
      </div>
      <div class="item">
        <div>{{$t('emailAccount')}}</div>
        <div>{{ userStore.user.email }}</div>
      </div>
      <div class="item">
        <div>{{$t('password')}}</div>
        <div>
          <el-button type="primary" @click="pwdShow = true">{{$t('changePwdBtn')}}</el-button>
        </div>
      </div>
    </div>
    <div class="connected-accounts">
      <div class="title">{{$t('connectedAccounts')}}</div>
      <div class="connected-account-row">
        <div class="connected-account-details">
          <el-avatar
            v-if="githubAccount.connected && githubAccount.avatarUrl"
            :src="githubAccount.avatarUrl"
            :size="32"
            @error="handleGithubAvatarError"
          />
          <span v-else class="github-mark" aria-hidden="true">
            <Icon icon="codicon:github-inverted" width="18" height="18" />
          </span>
          <div>
            <div class="provider-name">GitHub</div>
            <div class="provider-status" v-if="githubAccount.connected">@{{ githubAccount.login }} · {{$t('connected')}}</div>
            <div class="provider-status" v-else>{{$t('connectGithubDesc')}}</div>
          </div>
        </div>
        <el-button v-if="githubAccount.connected" @click="disconnectGithub" :loading="githubLoading">{{$t('disconnect')}}</el-button>
        <el-button v-else type="primary" @click="connectGithub" :loading="githubLoading">{{$t('connect')}}</el-button>
      </div>
      <div class="connected-account-row">
        <div class="connected-account-details">
          <el-avatar
            v-if="googleAccount.connected && googleAccount.avatarUrl"
            :src="googleAccount.avatarUrl"
            :size="32"
            @error="handleGoogleAvatarError"
          />
          <span v-else class="provider-mark google-mark" aria-hidden="true">
            <Icon icon="devicon:google" width="18" height="18" />
          </span>
          <div>
            <div class="provider-name">Google</div>
            <div class="provider-status" v-if="googleAccount.connected">{{ googleAccount.email }} · {{$t('connected')}}</div>
            <div class="provider-status" v-else>{{$t('connectGoogleDesc')}}</div>
          </div>
        </div>
        <el-button v-if="googleAccount.connected" @click="disconnectGoogle" :loading="googleLoading">{{$t('disconnect')}}</el-button>
        <el-button v-else type="primary" @click="connectGoogle" :loading="googleLoading">{{$t('connect')}}</el-button>
      </div>
    </div>

    <div class="appearance">
      <div class="title">{{ $t('visualStyle') }}</div>

      <div class="appearance-editor">
        <div class="appearance-row appearance-mode-row">
          <div class="appearance-label">
            <span>{{ $t('mode') }}</span>
            <small>{{ $t('appearanceModeDesc') }}</small>
          </div>
          <div class="theme-options" role="radiogroup" :aria-label="$t('mode')">
            <button
              v-for="option in themeOptions"
              :key="option.value"
              type="button"
              class="theme-option nova-segmented-button"
              :class="{ active: uiStore.themeMode === option.value }"
              :aria-checked="uiStore.themeMode === option.value"
              role="radio"
              @click="selectTheme(option.value, $event)"
            >
              <span class="theme-miniature" :class="`theme-miniature-${option.value}`" aria-hidden="true"><i></i><b></b><em></em></span>
              <span>{{ option.label }}</span>
            </button>
          </div>
        </div>

        <div class="appearance-row">
          <div class="appearance-label">
            <span>{{ $t('theme') }}</span>
            <small>{{ activePaletteLabel }}</small>
          </div>
          <div class="appearance-actions">
            <el-select class="theme-preset-select" :model-value="activePreset" @change="setPreset">
              <el-option v-for="preset in themePresetOptions" :key="preset.value" :label="preset.label" :value="preset.value" />
            </el-select>
            <button type="button" class="nova-icon-button appearance-action" :aria-label="$t('importTheme')" :title="$t('importTheme')" @click="themeImportInput?.click()"><Icon icon="solar:import-linear" width="18" height="18" /></button>
            <button type="button" class="nova-icon-button appearance-action" :aria-label="$t('exportTheme')" :title="$t('exportTheme')" @click="exportTheme"><Icon icon="solar:export-linear" width="18" height="18" /></button>
            <input ref="themeImportInput" class="theme-import-input" type="file" accept="application/json,.json" @change="importTheme" />
          </div>
        </div>

        <div v-for="token in colorTokens" :key="token.key" class="appearance-row appearance-color-row">
          <div class="appearance-label"><span>{{ token.label }}</span></div>
          <div class="color-control">
            <input :ref="(element) => { colorInputs[token.key] = element }" class="color-native-input" type="color" :value="activePalette[token.key]" :aria-label="token.label" @input="setPaletteColor(token.key, $event.target.value)" />
            <button type="button" class="color-swatch" :style="{ backgroundColor: activePalette[token.key] }" :aria-label="`${token.label}: ${activePalette[token.key]}`" @click="colorInputs[token.key]?.click()"></button>
            <input class="color-hex-input" :value="activePalette[token.key]" spellcheck="false" maxlength="7" @change="setPaletteColor(token.key, $event.target.value)" @keyup.enter="$event.target.blur()" />
          </div>
        </div>

        <div class="appearance-row appearance-reset-row">
          <span>{{ $t('resetThemeDesc', { theme: activePaletteLabel }) }}</span>
          <el-button @click="resetPalette">{{ $t('resetTheme') }}</el-button>
        </div>
      </div>
    </div>

    <div class="language">
      <div class="title">{{$t('language')}}</div>
      <el-select
          :model-value="langSelect"
          class="language-select"
          placeholder="Select"
          @change="changeLang"
      >
        <el-option label="简体中文" value="zh" @pointerdown.prevent.stop="changeLang('zh')"/>
        <el-option label="English" value="en" @pointerdown.prevent.stop="changeLang('en')"/>
      </el-select>
    </div>

    <div class="time-format">
      <div class="title">{{ $t('timeFormat') }}</div>
      <div class="time-format-options" role="radiogroup" :aria-label="$t('timeFormat')">
        <button
          v-for="option in timeFormatOptions"
          :key="option.value"
          type="button"
          class="time-format-option nova-segmented-button"
          :class="{ active: settingStore.timeFormat === option.value }"
          :aria-checked="settingStore.timeFormat === option.value"
          role="radio"
          @click="settingStore.timeFormat = option.value"
        >{{ option.label }}</button>
      </div>
    </div>

    <div class="notification">
      <div class="title">{{ $t('notification') }}</div>

      <div class="notification-row">
        <div class="notification-label">
          <span>{{ $t('pushNotification') }}</span>
          <small class="notification-status" :class="{ 'is-on': pushOn }">{{ pushStatusText }}</small>
        </div>
        <div class="notification-actions">
          <el-button v-if="pushOn" :loading="pushTesting" @click="sendTestPush">{{ $t('pushTest') }}</el-button>
          <el-switch
              :model-value="pushOn"
              :loading="pushLoading"
              :disabled="!pushAvailable"
              @change="togglePush"
          />
        </div>
      </div>

      <div class="notification-row">
        <span class="notification-label">{{ $t('notificationSound') }}</span>
        <el-switch v-model="settingStore.notificationSound"/>
      </div>

      <div class="notification-row">
        <span class="notification-label">{{ $t('notificationSoundType') }}</span>
        <div class="notification-actions">
          <el-select v-model="soundType" class="notification-select">
            <el-option
                v-for="sound in soundOptions"
                :key="sound.type"
                :label="sound.label"
                :value="sound.type"
            />
          </el-select>
          <el-button class="notification-play" @click="previewSound">
            <Icon icon="solar:play-linear" width="16" height="16" />
            <span>{{ $t('notificationSoundPlay') }}</span>
          </el-button>
        </div>
      </div>

      <!-- A browser that refuses to play leaves the reader with a silent app and
           no explanation, and the console is not available on a phone. -->
      <p v-if="notificationSoundStatus.lastError" class="notification-sound-error">
        ⚠ {{ $t('notificationSoundFailed') }}: {{ notificationSoundStatus.lastError }}
      </p>
    </div>
    <div class="del-email" v-perm="'my:delete'">
      <div class="title">{{$t('deleteUser')}}</div>
      <div style="color: var(--regular-text-color);">
        {{$t('delAccountMsg')}}
      </div>
      <div>
        <el-button type="primary" @click="deleteConfirm">{{$t('deleteUserBtn')}}</el-button>
      </div>
    </div>
    <el-dialog v-model="pwdShow" :title="$t('changePassword')" width="340">
      <div class="update-pwd">
        <el-input type="password" :placeholder="$t('newPassword')" v-model="form.password" autocomplete="off" @keyup.enter="submitPwd"/>
        <el-input type="password" :placeholder="$t('confirmPassword')" v-model="form.newPwd" autocomplete="off" @keyup.enter="submitPwd"/>
        <el-button type="primary" :loading="setPwdLoading" @click="submitPwd">{{$t('save')}}</el-button>
      </div>
    </el-dialog>
  </div>
</template>
<script setup>
import {onMounted, reactive, ref, computed, watch, defineOptions} from 'vue'
import {resetPassword, userDelete} from "@/request/my.js";
import {useUserStore} from "@/store/user.js";
import router from "@/router/index.js";
import {useRoute} from "vue-router";
import {accountSetName} from "@/request/account.js";
import {useAccountStore} from "@/store/account.js";
import {useI18n} from "vue-i18n";
import {useSettingStore} from "@/store/setting.js";
import {useUiStore} from "@/store/ui.js";
import {connectGithubAccount, disconnectGithubAccount, githubConnectedAccount, connectGoogleAccount, disconnectGoogleAccount, googleConnectedAccount} from '@/request/ouath.js';
import {Icon} from '@iconify/vue';
import {applyThemeTransition} from "@/utils/theme-transition.js";
import {availablePresets, PALETTE_KEYS, parseThemeImport, normalizeHex} from '@/utils/theme-palette.js';
import {
  NOTIFICATION_SOUNDS,
  notificationSoundStatus,
  playNotificationSound,
  preloadNotificationSound,
  setNotificationSoundType,
  stopNotificationSound,
} from '@/utils/notificationSound.js';
import {
  PUSH_STATUS,
  disablePush,
  enablePush,
  pushState,
  sendTestNotification,
  syncPushSubscription,
} from '@/utils/webPush.js';

const { t } = useI18n()
const accountStore = useAccountStore()
const settingStore = useSettingStore()
const uiStore = useUiStore()
const userStore = useUserStore();
const route = useRoute();
const setPwdLoading = ref(false)
const setNameShow = ref(false)
const accountName = ref(null)
const langSelect = ref(settingStore.lang)
const timeFormatOptions = computed(() => [
  { value: '24h', label: t('timeFormat24h') },
  { value: '12h', label: t('timeFormat12h') },
])
const githubLoading = ref(false)
const githubAccount = reactive({ connected: false, login: '', avatarUrl: '' })
const googleLoading = ref(false)
const googleAccount = reactive({ connected: false, email: '', avatarUrl: '' })
const themeImportInput = ref(null)
const colorInputs = reactive({})

const themeOptions = computed(() => {
  const zh = settingStore.lang === 'zh'

  return [
    { value: 'light', label: zh ? '浅色' : 'Light' },
    { value: 'dark', label: zh ? '深色' : 'Dark' },
    { value: 'system', label: zh ? '跟随系统' : 'System' },
  ]
})

function selectTheme(mode, event) {
  applyThemeTransition(mode, event)
}

const activePaletteMode = computed(() => uiStore.dark ? 'dark' : 'light')
const activePalette = computed(() => uiStore[`${activePaletteMode.value}Palette`])
const activePreset = computed(() => uiStore[`${activePaletteMode.value}ThemePreset`])
const activePaletteLabel = computed(() =>
  activePaletteMode.value === 'dark' ? t('darkTheme') : t('lightTheme')
)
const themePresetOptions = computed(() => {
  const labels = {
    'nova-default': t('themePresetDefault'),
    terracotta: t('themePresetTerracotta'),
    graphite: t('themePresetGraphite'),
    forest: t('themePresetForest'),
    lavender: t('themePresetLavender'),
    matcha: t('themePresetMatcha'),
    sakura: t('themePresetSakura'),
    arctic: t('themePresetArctic'),
    mocha: t('themePresetMocha'),
    amber: t('themePresetAmber'),
    aurora: t('themePresetAurora'),
    cobalt: t('themePresetCobalt'),
    orchid: t('themePresetOrchid'),
    crimson: t('themePresetCrimson'),
    pine: t('themePresetPine'),
    lunar: t('themePresetLunar'),
    cyber: t('themePresetCyber'),
    custom: t('themePresetCustom'),
  }
  return [...availablePresets(activePaletteMode.value), 'custom'].map((value) => ({ value, label: labels[value] }))
})
const colorTokens = computed(() => PALETTE_KEYS.map((key) => ({ key, label: t(`themeColor${key[0].toUpperCase()}${key.slice(1)}`) })))

function setPreset(preset) {
  if (preset === 'custom') return
  uiStore.setThemePreset(activePaletteMode.value, preset)
}

function setPaletteColor(key, value) {
  const color = normalizeHex(value)
  if (!color) {
    ElMessage({ message: t('invalidThemeColor'), type: 'warning', plain: true })
    return
  }
  uiStore.setThemePalette(activePaletteMode.value, { ...activePalette.value, [key]: color })
}

function resetPalette() {
  uiStore.resetThemePalette(activePaletteMode.value)
}

function exportTheme() {
  const payload = JSON.stringify({ light: uiStore.lightPalette, dark: uiStore.darkPalette }, null, 2)
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
  link.download = 'nova-mail-theme.json'
  link.click()
  URL.revokeObjectURL(link.href)
}

async function importTheme(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  const theme = parseThemeImport(await file.text())
  if (!theme) {
    ElMessage({ message: t('invalidThemeImport'), type: 'error', plain: true })
    return
  }
  uiStore.setThemePalette('light', theme.light)
  uiStore.setThemePalette('dark', theme.dark)
  ElMessage({ message: t('themeImported'), type: 'success', plain: true })
}

/* ---------- Notification sound ---------- */

const soundOptions = NOTIFICATION_SOUNDS

// The store is the single source of truth, so the choice survives reloads.
const soundType = computed({
  get: () => settingStore.notificationSoundType,
  set: (type) => {
    settingStore.notificationSoundType = setNotificationSoundType(type)
  },
})

// Auditioning should feel immediate: keep the selected file buffered.
watch(
  () => settingStore.notificationSoundType,
  (type) => preloadNotificationSound(type)
)

watch(
  () => settingStore.notificationSound,
  (enabled) => {
    if (!enabled) stopNotificationSound()
  }
)

async function previewSound() {
  // An explicit click, so it plays even while the automatic sound is off.
  const played = await playNotificationSound(settingStore.notificationSoundType, { force: true })

  // Never fail silently: the line above the button then shows why, and the
  // message makes it obvious that the click was heard but the sound was refused.
  if (!played) {
    ElMessage.warning(`${t('notificationSoundFailed')}: ${notificationSoundStatus.lastError}`)
  }
}

/* ---------- Web Push (system notifications) ---------- */

const pushLoading = ref(false)
const push = reactive({ supported: true, available: true, permission: PUSH_STATUS.DEFAULT, subscribed: false })

// The switch follows the server, not just the browser: a lingering local
// subscription must not look enabled when the Worker has no VAPID keys.
const pushAvailable = computed(() => push.supported && push.available && push.permission !== PUSH_STATUS.DENIED)
const pushOn = computed(() => push.available && push.subscribed)

const pushStatusText = computed(() => {
  if (!push.supported) return t('pushStatusUnsupported')
  if (!push.available) return t('pushStatusUnavailable')
  if (push.permission === PUSH_STATUS.DENIED) return t('pushStatusDenied')
  return push.subscribed ? t('pushStatusOn') : t('pushStatusOff')
})

async function refreshPushState() {
  try {
    Object.assign(push, await pushState())
  } catch (error) {
    console.warn('Nova Mail: could not read the push state', error)
  }
}

const PUSH_FAILURE_MESSAGE = {
  [PUSH_STATUS.DENIED]: 'pushDeniedMsg',
  [PUSH_STATUS.UNSUPPORTED]: 'pushUnsupportedMsg',
  [PUSH_STATUS.UNAVAILABLE]: 'pushUnavailableMsg',
  [PUSH_STATUS.DEFAULT]: 'pushDeniedMsg',
}

async function togglePush(enabled) {
  if (pushLoading.value || !push.supported) return

  pushLoading.value = true

  try {
    const result = enabled ? await enablePush() : await disablePush()

    if (enabled && result.status !== PUSH_STATUS.GRANTED) {
      ElMessage({
        message: t(PUSH_FAILURE_MESSAGE[result.status] || 'reqFailErrorMsg'),
        type: 'warning',
        plain: true,
      })
    } else if (enabled) {
      ElMessage({ message: t('pushEnabledMsg'), type: 'success', plain: true })
    }
  } catch (error) {
    console.error('Nova Mail: push toggle failed', error)
    ElMessage({ message: t('reqFailErrorMsg'), type: 'error', plain: true })
  } finally {
    pushLoading.value = false
    await refreshPushState()
  }
}

const pushTesting = ref(false)

/**
 * Ask the server to push to this account's devices.
 *
 * The device count is the point: if it stays 1 while this browser is enabled,
 * this browser's subscription never reached the server; if it counts this
 * browser and no notification appears, the OS is silencing it (Windows Focus
 * Assist, macOS Focus, Chrome site permission).
 */
async function sendTestPush() {
  pushTesting.value = true

  try {
    const data = await sendTestNotification()

    if (!data?.devices) {
      ElMessage({ message: t('pushTestNone'), type: 'warning', plain: true })
    } else {
      ElMessage({
        message: t('pushTestResult', { sent: data.sent, total: data.devices }),
        type: 'success',
        plain: true,
      })
    }

    await refreshPushState()
  } catch (error) {
    console.error('Nova Mail: test notification failed', error)
    ElMessage({ message: t('reqFailErrorMsg'), type: 'error', plain: true })
  } finally {
    pushTesting.value = false
  }
}


defineOptions({
  name: 'setting'
})

onMounted(async () => {
  // Normalise a value persisted by an older build, then warm the sound the
  // user is most likely to audition.
  settingStore.notificationSoundType = setNotificationSoundType(settingStore.notificationSoundType)
  preloadNotificationSound(settingStore.notificationSoundType)

  try {
    const account = await githubConnectedAccount()
    Object.assign(githubAccount, account)
    userStore.githubConnected = Boolean(account?.connected)
    userStore.githubAvatar = account?.connected && account?.avatarUrl ? account.avatarUrl : ''
    const google = await googleConnectedAccount()
    Object.assign(googleAccount, google)
    userStore.googleConnected = Boolean(google?.connected)
    userStore.googleAvatar = google?.connected && google?.avatarUrl ? google.avatarUrl : ''
    const status = route.query.google
    if (status === 'connected') ElMessage({ message: t('googleConnected'), type: 'success', plain: true })
    if (status === 'failed') ElMessage({ message: t('googleLoginFailed'), type: 'warning', plain: true })
    if (status === 'denied') ElMessage({ message: t('googleAuthorizationCancelled'), type: 'warning', plain: true })
  } catch {
    // The endpoint can be unavailable until the non-destructive migration runs.
  }

  // Re-register a device whose endpoint rotated (or whose row was cleaned up
  // after a 404/410), then show the real state. Both are best effort.
  await syncPushSubscription()
  await refreshPushState()
})

async function connectGithub() {
  if (githubLoading.value) return
  githubLoading.value = true
  try {
    const { authorizeUrl } = await connectGithubAccount()
    window.location.assign(authorizeUrl)
  } finally {
    githubLoading.value = false
  }
}

async function connectGoogle() {
  if (googleLoading.value) return
  googleLoading.value = true
  try {
    const { authorizeUrl } = await connectGoogleAccount()
    window.location.assign(authorizeUrl)
  } finally {
    googleLoading.value = false
  }
}

function handleGoogleAvatarError() {
  googleAccount.avatarUrl = ''
  userStore.googleAvatar = ''
}

function disconnectGoogle() {
  ElMessageBox.confirm(t('disconnectGoogleConfirm'), {
    confirmButtonText: t('disconnect'),
    cancelButtonText: t('cancel'),
    type: 'warning',
  }).then(async () => {
    googleLoading.value = true
    try {
      await disconnectGoogleAccount()
      Object.assign(googleAccount, { connected: false, email: '', avatarUrl: '' })
      userStore.googleConnected = false
      userStore.googleAvatar = ''
      ElMessage({ message: t('googleDisconnected'), type: 'success', plain: true })
    } finally {
      googleLoading.value = false
    }
  })
}

function handleGithubAvatarError() {
  // The connection is still valid if GitHub temporarily declines the avatar
  // request. Fall back to the provider mark instead of a broken image.
  githubAccount.avatarUrl = ''
  userStore.githubAvatar = ''
}

function disconnectGithub() {
  ElMessageBox.confirm(t('disconnectGithubConfirm'), {
    confirmButtonText: t('disconnect'),
    cancelButtonText: t('cancel'),
    type: 'warning',
  }).then(async () => {
    githubLoading.value = true
    try {
      await disconnectGithubAccount()
      Object.assign(githubAccount, { connected: false, login: '', avatarUrl: '' })
      userStore.githubConnected = false
      userStore.githubAvatar = ''
      ElMessage({ message: t('githubDisconnected'), type: 'success', plain: true })
    } finally {
      githubLoading.value = false
    }
  })
}

function showSetName() {
  accountName.value = userStore.user.name
  setNameShow.value = true
}

function setName() {

  if (!accountName.value) {
    ElMessage({
      message: t('emptyUserNameMsg'),
      type: 'error',
      plain: true,
    })
    return;
  }

  setNameShow.value = false
  let name = accountName.value

  if (name === userStore.user.name) {
    return
  }

  userStore.user.name = accountName.value

  accountSetName(userStore.user.account.accountId,name).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })

    accountStore.changeUserAccountName = name

  }).catch(() => {
    userStore.user.name = name
  })
}

function changeLang(lang) {
  let setting = {}
  try {
    setting = JSON.parse(localStorage.getItem('setting') || '{}')
  } catch (e) {
    setting = {}
  }
  localStorage.setItem('setting', JSON.stringify({...setting, lang}))
  window.location.reload()
}

const pwdShow = ref(false)
const form = reactive({
  password: '',
  newPwd: '',
})

const deleteConfirm = () => {
  ElMessageBox.confirm(t('delAccountConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userDelete().then(() => {
      localStorage.removeItem('token');
      router.replace('/login');
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true,
      })
    })
  })
}


function submitPwd() {

  if (setPwdLoading.value) return

  if (!form.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password.length < 6) {
    ElMessage({
      message: t('pwdLengthMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password !== form.newPwd) {
    ElMessage({
      message: t('confirmPwdFailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  setPwdLoading.value = true
  resetPassword(form.password).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })
    pwdShow.value = false
    setPwdLoading.value = false
    form.password = ''
    form.newPwd = ''
  }).catch(() => {
    setPwdLoading.value = false
  })

}

</script>
<style scoped lang="scss">
.box {
  /* The page owns its width so long account names / emails can never stretch it
     past the viewport; content shrinks instead (see min-width: 0 below). */
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 40px 40px;

  @media (max-width: 767px) {
    padding: 30px 30px;
  }

  .update-pwd {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .title {
    font-size: 18px;
    font-weight: bold;
  }

  .container {
    font-size: 14px;
    display: grid;
    gap: 20px;
    margin-bottom: 40px;

    .item {
      display: grid;
      grid-template-columns: 50px minmax(0, 1fr);
      gap: 140px;
      position: relative;
      /* Grid items default to `min-width: auto`, so a nowrap value (user name,
         email) would ratchet the column open and widen the whole page. */
      min-width: 0;

      > div {
        min-width: 0;
      }

      .user-name {
        display: grid;
        grid-template-columns: minmax(0, auto) minmax(0, 1fr);
        min-width: 0;
        span:first-child {
          min-width: 0;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      }

      .edit-name-input {
        position: absolute;
        bottom: -6px;
        .el-input {
          width: min(200px,calc(100vw - 222px));
        }
      }

      .edit-name {
        color: #4dabff;
        padding-left: 10px;
        cursor: pointer;
      }

      @media (max-width: 767px) {
        gap: 24px;
      }

      div:first-child {
        font-weight: bold;
      }

      div:last-child {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }
  }

  .language {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-bottom: 40px;

    .language-select {
      width: 100px;
    }
  }

  .time-format {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-bottom: 40px;
  }

  .time-format-options {
    display: inline-flex;
    align-self: flex-start;
    gap: 6px;
  }

  .time-format-option {
    min-width: 104px;
  }

  .connected-accounts {
    display: grid;
    gap: 16px;
    margin-bottom: 40px;
    font-size: 14px;

    .connected-account-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 14px 16px;
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 12px;
      min-width: 0;
    }

    .connected-account-details {
      min-width: 0;
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      gap: 12px;

      /* Only the text column may shrink; it truncates the handle/email. */
      > div {
        flex: 1 1 auto;
        min-width: 0;
      }

      /* Every provider avatar is the same fixed 32px circle. `flex: 0 0 32px`
         (plus min-width) stops flex from squashing the OAuth image into an
         ellipse when a long Google address squeezes the row. */
      .github-mark,
      .provider-mark,
      :deep(.el-avatar) {
        flex: 0 0 32px;
        width: 32px;
        height: 32px;
        min-width: 32px;
        min-height: 32px;
        border-radius: 50%;
      }

      /* Keep the bitmap square inside the circle instead of stretching. */
      :deep(.el-avatar > img) {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    /* The action button keeps its full label — it must never be squeezed or
       pushed off-screen by a long provider handle. */
    .connected-account-row :deep(.el-button) {
      flex: 0 0 auto;
    }

    .github-mark {
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--el-fill-color);
      color: var(--el-text-color-primary);
    }

    .provider-mark {
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--el-fill-color);
    }

    .google-mark { background: var(--el-bg-color); }

    .provider-name { font-weight: 600; }
    .provider-status {
      color: var(--el-text-color-secondary);
      font-size: 13px;
      margin-top: 2px;

      /* Long handles / addresses stay on one line and truncate. */
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }

  .del-email {
    font-size: 14px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
}

  /* ---------- Notification sound ---------- */
  .notification {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-bottom: 40px;
    font-size: 14px;
  }

  .notification-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 14px 16px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 12px;
    min-width: 0;
  }

  .notification-label { min-width: 0; }

  .notification-label > span { display: block; }

  /* Status under the label: muted by default, primary once enabled. */
  .notification-status {
    display: block;
    margin-top: 2px;
    color: var(--regular-text-color);
    font-size: 12px;
  }

  .notification-status.is-on { color: var(--el-color-primary); }

  .notification-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .notification-actions :deep(.el-button) {
    flex: 0 0 auto;
  }

  .notification-select { width: 150px; }

  .notification-play {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  /* Why the last attempt produced no sound (blocked autoplay, a decode error…).
     Wrapped: the reason is a technical string and can be long. */
  .notification-sound-error {
    margin: 8px 0 0;
    color: var(--el-color-warning);
    font-size: 12px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  @media (max-width: 767px) {
    .notification-row {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
    }

    .notification-actions {
      justify-content: space-between;
    }

    .notification-select { flex: 1; width: auto; }
  }

  /* ---------- Appearance ---------- */
  .appearance {
    margin-bottom: 34px;
  }

  .appearance-editor {
    margin-top: 14px;
    overflow: hidden;
    border: 1px solid var(--nova-divider);
    border-radius: 12px;
    background: var(--nova-surface);
  }

  .appearance-row {
    min-height: 58px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 22px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--nova-divider-soft);
  }

  .appearance-row:last-child { border-bottom: 0; }
  .appearance-mode-row { align-items: flex-start; }

  .appearance-label {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: var(--el-text-color-primary);
    font-weight: 500;
  }

  .appearance-label small {
    color: var(--el-text-color-secondary);
    font-size: 12px;
    font-weight: 400;
  }

  .theme-options {
    display: flex;
    flex: 0 1 auto;
    gap: 10px;
  }

  .theme-option {
    width: 96px;
    display: grid;
    gap: 7px;
    padding: 8px;
    border: 1px solid var(--nova-divider);
    border-radius: 9px;
    color: var(--el-text-color-primary);
    background: var(--nova-surface-muted);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    text-align: left;
  }

  .theme-option:hover {
    border-color: color-mix(
      in srgb,
      var(--el-color-primary) 55%,
      var(--nova-divider)
    );
  }

  .theme-option.active {
    color: var(--el-color-primary);
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--el-color-primary) 38%, transparent);
  }

  .theme-miniature {
    position: relative;
    height: 38px;
    overflow: hidden;
    display: block;
    border: 1px solid color-mix(in srgb, var(--nova-divider) 80%, transparent);
    border-radius: 5px;
    background: #fff;
  }

  .theme-miniature::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 17px;
    background: #eef1f5;
  }

  .theme-miniature i,
  .theme-miniature b,
  .theme-miniature em {
    position: absolute;
    left: 23px;
    right: 6px;
    height: 4px;
    display: block;
    border-radius: 2px;
    background: #d5dbe5;
  }

  .theme-miniature i { top: 8px; background: #0a84ff; }
  .theme-miniature b { top: 17px; }
  .theme-miniature em { top: 26px; right: 17px; }
  .theme-miniature-dark { background: #17191d; border-color: #343944; }
  .theme-miniature-dark::before { background: #20242b; }
  .theme-miniature-dark b, .theme-miniature-dark em { background: #59616d; }
  .theme-miniature-system { background: linear-gradient(90deg, #fff 0 50%, #17191d 50% 100%); }
  .theme-miniature-system::before { background: linear-gradient(90deg, #eef1f5 0 50%, #20242b 50% 100%); }
  .theme-miniature-system b, .theme-miniature-system em { background: linear-gradient(90deg, #d5dbe5 0 50%, #59616d 50% 100%); }

  .appearance-actions, .color-control {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .theme-preset-select { width: 138px; }
  .appearance-action { --nova-icon-button-size: 32px; }
  .theme-import-input, .color-native-input { display: none; }

  .color-swatch {
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    border: 1px solid color-mix(in srgb, var(--nova-divider) 84%, transparent);
    border-radius: 7px;
    cursor: pointer;
  }

  .color-hex-input {
    width: 84px;
    padding: 5px 0;
    color: var(--el-text-color-primary);
    background: transparent;
    font-family: var(--nova-font-code);
    font-size: 13px;
    text-align: right;
    text-transform: uppercase;
    cursor: pointer;
  }

  .color-hex-input:focus-visible, .color-swatch:focus-visible, .theme-option:focus-visible {
    outline: none;
    box-shadow: var(--nova-button-focus-ring);
  }

  .appearance-reset-row {
    min-height: 54px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  .appearance-reset-row > span { min-width: 0; }
  .appearance-reset-row :deep(.el-button) { flex: 0 0 auto; }

  @media (max-width: 767px) {
    .time-format-options { width: 100%; }
    .time-format-option { flex: 1 1 0; min-width: 0; }
    .appearance-row { gap: 12px; padding: 12px; }
    .appearance-mode-row { display: block; }
    .appearance-mode-row .appearance-label { margin-bottom: 10px; }
    .theme-options {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px;
    }

    .theme-option { width: auto; min-width: 0; padding: 6px; }
    .theme-miniature { height: 32px; }
    .theme-miniature i { top: 7px; }
    .theme-miniature b { top: 15px; }
    .theme-miniature em { top: 23px; }
    .theme-preset-select { width: min(124px, 42vw); }
    .appearance-actions { gap: 4px; }
    .appearance-action { --nova-icon-button-size: 30px; }
    .color-hex-input { width: 76px; }
    .appearance-reset-row { align-items: flex-start; }
  }

</style>
