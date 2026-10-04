<template>
  <div class="box">
    <div class="settings-content">
    <div v-if="section === 'home'" class="settings-home">
      <div class="settings-home-title">{{ $t('settings') }}</div>
      <button class="settings-category-row" type="button" @click="router.push('/settings/account-security')">
        <span class="settings-category-icon"><Icon icon="solar:shield-check-linear" width="22" height="22" /></span>
        <span class="settings-category-copy"><strong>{{ $t('accountSecurity') }}</strong><small>{{ $t('accountSecurityDesc') }}</small></span>
        <Icon class="settings-category-chevron" icon="solar:alt-arrow-right-linear" width="18" height="18" />
      </button>
      <button class="settings-category-row" type="button" @click="router.push('/settings/personalization')">
        <span class="settings-category-icon"><Icon icon="solar:palette-linear" width="22" height="22" /></span>
        <span class="settings-category-copy"><strong>{{ $t('personalization') }}</strong><small>{{ $t('personalizationDesc') }}</small></span>
        <Icon class="settings-category-chevron" icon="solar:alt-arrow-right-linear" width="18" height="18" />
      </button>
      <button class="settings-category-row" type="button" @click="router.push('/settings/about')">
        <span class="settings-category-icon"><Icon icon="solar:info-circle-linear" width="22" height="22" /></span>
        <span class="settings-category-copy"><strong>{{ $t('about') }}</strong><small>{{ $t('aboutDesc') }}</small></span>
        <Icon class="settings-category-chevron" icon="solar:alt-arrow-right-linear" width="18" height="18" />
      </button>
    </div>

    <div v-else class="settings-subpage-header">
      <button class="settings-back-button" type="button" :aria-label="$t('back')" @click="router.replace(settingsBackPath)">
        <Icon icon="solar:arrow-left-linear" width="20" height="20" />
      </button>
      <h1>{{ $t(settingsTitleKey) }}</h1>
    </div>

    <div v-if="section === 'account'" class="settings-directory">
      <div class="settings-directory-heading">{{ $t('accountLabel') }}</div>
      <button v-for="item in accountEntries" :key="item.path" class="settings-category-row" type="button" @click="router.push(item.path)">
        <span class="settings-category-icon"><Icon :icon="item.icon" width="22" height="22" /></span>
        <span class="settings-category-copy"><strong>{{ $t(item.title) }}</strong><small>{{ $t(item.description) }}</small></span>
        <Icon class="settings-category-chevron" icon="solar:alt-arrow-right-linear" width="18" height="18" />
      </button>
      <div class="settings-directory-heading security-heading">{{ $t('security') }}</div>
      <button v-for="item in securityEntries" :key="item.path" class="settings-category-row" :class="{ 'danger-entry': item.danger }" type="button" @click="router.push(item.path)">
        <span class="settings-category-icon"><Icon :icon="item.icon" width="22" height="22" /></span>
        <span class="settings-category-copy"><strong>{{ $t(item.title) }}</strong><small>{{ $t(item.description) }}</small></span>
        <Icon class="settings-category-chevron" icon="solar:alt-arrow-right-linear" width="18" height="18" />
      </button>
    </div>

    <section v-if="section === 'profile'" class="settings-section profile-section">
      <h2 class="settings-section-title">{{ $t('accountInformation') }}</h2>
      <div class="settings-panel">
        <div class="settings-row profile-row">
          <span class="settings-row-title">{{ $t('username') }}</span>
          <div class="profile-value">
            <template v-if="setNameShow">
              <el-input v-model="accountName" class="profile-name-input" @keyup.enter="setName" />
              <button class="settings-text-action" type="button" @click="setName">{{ $t('save') }}</button>
            </template>
            <template v-else>
              <span class="profile-value-text">{{ userStore.user.name }}</span>
              <button class="settings-text-action" type="button" @click="showSetName">{{ $t('change') }}</button>
            </template>
          </div>
        </div>
        <div class="settings-row profile-row">
          <span class="settings-row-title">{{ $t('emailAccount') }}</span>
          <span class="profile-value-text">{{ userStore.user.email }}</span>
        </div>
        <div class="settings-row profile-row">
          <span class="settings-row-title">{{ $t('password') }}</span>
          <div class="profile-value">
            <span class="profile-value-text" aria-hidden="true">••••••••</span>
            <button class="settings-text-action" type="button" @click="pwdShow = true">{{ $t('change') }}</button>
          </div>
        </div>
      </div>
    </section>
    <section v-if="section === 'connected'" class="settings-section connected-accounts">
      <h2 class="settings-section-title">{{ $t('linkedProviders') }}</h2>
      <div class="settings-panel">
      <div class="settings-row connected-account-row">
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
      <div class="settings-row connected-account-row">
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
    </section>
    <section v-if="section === 'addresses'" class="settings-section addresses-page">
      <h2 class="settings-section-title">{{ $t('managedAddresses') }}</h2>
      <div class="settings-panel addresses-panel"><account page-mode :show-page-intro="false" /></div>
    </section>

    <section v-if="section === 'personalization'" class="settings-section appearance">
      <h2 class="settings-section-title">{{ $t('visualStyle') }}</h2>

      <div class="settings-panel appearance-editor">
        <div class="settings-row appearance-row appearance-mode-row">
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
              <span class="theme-miniature" :style="themePreviewStyle(option.value)" aria-hidden="true"><i></i><b></b><em></em></span>
              <span>{{ option.label }}</span>
            </button>
          </div>
        </div>

        <div class="settings-row appearance-row">
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

        <div v-for="token in colorTokens" :key="token.key" class="settings-row appearance-row appearance-color-row">
          <div class="appearance-label"><span>{{ token.label }}</span></div>
          <div class="color-control">
            <input :ref="(element) => { colorInputs[token.key] = element }" class="color-native-input" type="color" :value="activePalette[token.key]" :aria-label="token.label" @input="setPaletteColor(token.key, $event.target.value)" />
            <button type="button" class="color-swatch" :style="{ backgroundColor: activePalette[token.key] }" :aria-label="`${token.label}: ${activePalette[token.key]}`" @click="colorInputs[token.key]?.click()"></button>
            <input class="color-hex-input" :value="activePalette[token.key]" spellcheck="false" maxlength="7" @change="setPaletteColor(token.key, $event.target.value)" @keyup.enter="$event.target.blur()" />
          </div>
        </div>

        <div class="settings-row appearance-row appearance-reset-row">
          <span>{{ $t('resetThemeDesc', { theme: activePaletteLabel }) }}</span>
          <el-button @click="resetPalette">{{ $t('resetTheme') }}</el-button>
        </div>
      </div>
    </section>

    <section v-if="section === 'personalization'" class="settings-section language">
      <h2 class="settings-section-title">{{ $t('language') }}</h2>
      <div class="settings-panel"><div class="settings-row settings-control-row">
      <span class="settings-row-title">{{ $t('language') }}</span>
      <el-select
          :model-value="langSelect"
          class="language-select"
          placeholder="Select"
          @change="changeLang"
      >
        <el-option label="简体中文" value="zh" @pointerdown.prevent.stop="changeLang('zh')"/>
        <el-option label="English" value="en" @pointerdown.prevent.stop="changeLang('en')"/>
      </el-select>
      </div></div>
    </section>

    <section v-if="section === 'personalization'" class="settings-section time-format">
      <h2 class="settings-section-title">{{ $t('timeFormat') }}</h2>
      <div class="settings-panel"><div class="settings-row settings-control-row">
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
        >
          <span class="time-format-option-label">{{ option.label }}</span>
          <span class="time-format-option-example">{{ option.example }}</span>
        </button>
      </div>
      </div></div>
    </section>

    <section v-if="section === 'personalization'" class="settings-section swipe-actions-setting">
      <h2 class="settings-section-title">{{ $t('swipeActions') }}</h2>
      <div class="settings-panel swipe-actions-options">
        <div class="settings-row swipe-action-setting-row">
          <span class="swipe-action-direction">← {{ $t('swipeLeft') }}</span>
          <el-select v-model="settingStore.swipeLeftAction" class="swipe-action-select" :aria-label="$t('swipeLeft')">
            <el-option
                v-for="option in swipeActionOptions"
                :key="option.id"
                :label="$t(option.labelKey)"
                :value="option.id"
            />
          </el-select>
        </div>
        <div class="settings-row swipe-action-setting-row">
          <span class="swipe-action-direction">{{ $t('swipeRight') }} →</span>
          <el-select v-model="settingStore.swipeRightAction" class="swipe-action-select" :aria-label="$t('swipeRight')">
            <el-option
                v-for="option in swipeActionOptions"
                :key="option.id"
                :label="$t(option.labelKey)"
                :value="option.id"
            />
          </el-select>
        </div>
      </div>
    </section>

    <section v-if="section === 'personalization'" class="settings-section mail-density-setting">
      <h2 class="settings-section-title">{{ $t('mailList') }}</h2>
      <div class="settings-panel"><div class="settings-row settings-control-row">
      <div class="settings-row-copy">
        <span class="settings-row-title">{{ $t('mailListDensity') }}</span>
        <small>{{ $t('mailListDensityDesc') }}</small>
      </div>
      <div class="time-format-options" role="radiogroup" :aria-label="$t('mailListDensity')">
        <button
          v-for="density in ['compact', 'normal']"
          :key="density"
          type="button"
          class="time-format-option nova-segmented-button"
          :class="{ active: settingStore.mailListDensity === density }"
          :aria-checked="settingStore.mailListDensity === density"
          :disabled="densitySaving"
          role="radio"
          @click="changeMailDensity(density)"
        >
          <span class="time-format-option-label">{{ $t(density === 'compact' ? 'mailDensityCompact' : 'mailDensityNormal') }}</span>
        </button>
      </div>
      </div></div>
    </section>

    <section v-if="section === 'personalization'" class="settings-section notification">
      <h2 class="settings-section-title">{{ $t('notification') }}</h2>
      <div class="settings-panel notification-panel">
      <div class="settings-row notification-row notification-toggle-row">
        <div class="settings-row-copy">
          <span class="settings-row-title">{{ $t('pushNotification') }}</span>
          <small class="notification-status">{{ !pushOn || !pushAvailable ? pushStatusText : $t('pushNotificationDesc') }}</small>
        </div>
        <div class="notification-switch">
          <el-switch
              :model-value="pushOn"
              :loading="pushLoading"
              :disabled="!pushAvailable"
              @change="togglePush"
          />
        </div>
      </div>

      <div v-if="pushOn" class="notification-test-row">
        <el-button class="nova-secondary-button" :loading="pushTesting" @click="sendTestPush">{{ $t('pushTest') }}</el-button>
      </div>

      <div class="settings-row notification-row notification-toggle-row">
        <span class="settings-row-title">{{ $t('notificationSound') }}</span>
        <el-switch v-model="settingStore.notificationSound"/>
      </div>

      <div class="settings-row notification-row notification-sound-row">
        <span class="settings-row-title">{{ $t('notificationSoundType') }}</span>
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
      </div>

      <!-- A browser that refuses to play leaves the reader with a silent app and
           no explanation, and the console is not available on a phone. -->
      <p v-if="notificationSoundStatus.lastError" class="notification-sound-error">
        ⚠ {{ $t('notificationSoundFailed') }}: {{ notificationSoundStatus.lastError }}
      </p>
    </section>
    <section v-if="section === 'delete' && canDeleteAccount" class="settings-section danger-section">
      <h2 class="settings-section-title danger-title">{{ $t('dangerZone') }}</h2>
      <div class="settings-panel">
        <div class="settings-row danger-row">
          <div class="settings-row-copy">
            <span class="settings-row-title">{{ $t('deleteUser') }}</span>
            <small>{{ $t('delAccountMsg') }}</small>
          </div>
          <el-button class="settings-danger-button" type="danger" @click="deleteConfirm">{{ $t('deleteUserBtn') }}</el-button>
        </div>
      </div>
    </section>
    <template v-if="section === 'sessions'">
      <section class="settings-section security">
        <h2 class="settings-section-title">{{ $t('devicesAndSessions') }}</h2>
        <div class="settings-panel session-list" v-loading="sessionsLoading">
          <div v-for="session in sessions" :key="session.id" class="settings-row session-row">
            <span class="session-icon" aria-hidden="true"><Icon icon="solar:devices-linear" width="20" height="20" /></span>
            <div class="session-details">
              <div class="session-title">{{ session.browser }} · {{ session.os }}</div>
              <div class="session-meta">{{ session.deviceType }} · {{ session.location }}</div>
              <div class="session-meta">{{ $t('lastActive') }}: {{ formatSessionTime(session.lastActiveAt) }} · {{ session.ipAddress }}</div>
              <div class="session-meta">{{ $t('loginTime') }}: {{ formatSessionTime(session.createdAt) }}</div>
            </div>
            <div class="session-action">
              <span v-if="session.current" class="session-current">{{ $t('thisDevice') }}</span>
              <el-button v-else text type="danger" :loading="revokingSession === session.id" @click="signOutSession(session)">{{ $t('signOut') }}</el-button>
            </div>
          </div>
          <div v-if="!sessions.length && !sessionsLoading" class="session-empty">{{ $t('noActiveSessions') }}</div>
        </div>
        <el-button v-if="sessions.some(session => !session.current)" class="revoke-others-button" @click="signOutOtherSessions">{{ $t('signOutOtherDevices') }}</el-button>
      </section>
      <section class="settings-section login-alerts">
        <h2 class="settings-section-title">{{ $t('loginAlerts') }}</h2>
        <div class="settings-panel">
          <div class="settings-row security-setting-row"><span>{{ $t('email') }}</span><el-switch v-model="loginAlerts.email" :loading="loginAlertsLoading" @change="saveLoginAlerts" /></div>
          <div class="settings-row security-setting-row"><div><span>{{ $t('telegram') }}</span><small v-if="!loginAlerts.telegramAvailable">{{ $t('notConnected') }}</small></div><el-switch v-model="loginAlerts.telegram" :disabled="!loginAlerts.telegramAvailable" :loading="loginAlertsLoading" @change="saveLoginAlerts" /></div>
        </div>
      </section>
    </template>
    <div v-if="section === 'about'" class="about-page">
      <div class="about-brand"><img src="/icons/nova-mail-192.png" alt="Nova Mail" /><strong>Nova Mail</strong></div>
      <p>{{ $t('aboutDescription') }}</p>
      <div class="settings-panel about-details">
        <div class="settings-row">
          <span>{{ $t('author') }}</span>
          <a class="about-link" href="https://github.com/beihaime" target="_blank" rel="noopener noreferrer">
            beihaime <span aria-hidden="true">→</span>
          </a>
        </div>
        <div class="settings-row">
          <span>{{ $t('repository') }}</span>
          <a class="about-link" href="https://github.com/beihaime/nova-mail" target="_blank" rel="noopener noreferrer">
            github.com/beihaime/nova-mail <span aria-hidden="true">→</span>
          </a>
        </div>
        <div class="settings-row"><span>{{ $t('appName') }}</span><span>Nova Mail</span></div>
        <div class="settings-row"><span>{{ $t('appVersion') }}</span><span>{{ appVersion }}</span></div>
      </div>
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
import {onMounted, onBeforeUnmount, reactive, ref, computed, watch, defineOptions} from 'vue'
import {resetPassword, userDelete} from "@/request/my.js";
import {useUserStore} from "@/store/user.js";
import {hasPerm} from '@/perm/perm.js';
import router from "@/router/index.js";
import {useRoute} from "vue-router";
import {accountSetName} from "@/request/account.js";
import {useAccountStore} from "@/store/account.js";
import {useI18n} from "vue-i18n";
import {useSettingStore} from "@/store/setting.js";
import account from '@/layout/account/index.vue';
import packageInfo from '../../../package.json';
import {useUiStore} from "@/store/ui.js";
import {getSessions, revokeSession, revokeOtherSessions, getLoginAlerts, updateLoginAlerts} from '@/request/security.js';
import {connectGithubAccount, disconnectGithubAccount, githubConnectedAccount, connectGoogleAccount, disconnectGoogleAccount, googleConnectedAccount} from '@/request/ouath.js';
import {Icon} from '@iconify/vue';
import {applyThemeTransition} from "@/utils/theme-transition.js";
import {availablePresets, PALETTE_KEYS, parseThemeImport, normalizeHex} from '@/utils/theme-palette.js';
import {SWIPE_ACTION_OPTIONS} from '@/utils/swipe-actions.js';
import {formatDateTime, formatTime} from '@/utils/day.js';
import {clearAuthenticatedSession} from '@/utils/session-state.js';
import {setMailListDensity} from '@/request/preferences.js';
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
const accountPath = '/settings/account-security'
const section = computed(() => {
  const path = route.path
  if (path === accountPath) return 'account'
  if (path === `${accountPath}/profile`) return 'profile'
  if (path === `${accountPath}/addresses`) return 'addresses'
  if (path === `${accountPath}/connected-accounts`) return 'connected'
  if (path === `${accountPath}/sessions`) return 'sessions'
  if (path === `${accountPath}/delete-account`) return 'delete'
  if (path === '/settings/personalization') return 'personalization'
  if (path === '/settings/about') return 'about'
  return 'home'
})
const settingsBackPath = computed(() => ['profile', 'addresses', 'connected', 'sessions', 'delete'].includes(section.value) ? accountPath : '/settings')
const settingsTitleKey = computed(() => ({
  account: 'accountSecurity', profile: 'profile', addresses: 'emailAddresses',
  connected: 'connectedAccounts', sessions: 'deviceSessions', delete: 'deleteUser',
  personalization: 'personalization', about: 'about',
})[section.value] || 'settings')
const accountEntries = [
  { path: `${accountPath}/profile`, title: 'profile', description: 'profileDesc', icon: 'solar:user-circle-linear' },
  { path: `${accountPath}/addresses`, title: 'emailAddresses', description: 'emailAddressesDesc', icon: 'solar:letter-linear' },
  { path: `${accountPath}/connected-accounts`, title: 'connectedAccounts', description: 'connectedAccountsDesc', icon: 'solar:link-linear' },
]
const canDeleteAccount = computed(() => Array.isArray(userStore.user?.permKeys) && hasPerm('my:delete'))
const securityEntries = computed(() => [
  { path: `${accountPath}/sessions`, title: 'deviceSessions', description: 'deviceSessionsDesc', icon: 'solar:devices-linear' },
  ...(canDeleteAccount.value ? [{ path: `${accountPath}/delete-account`, title: 'deleteUser', description: 'deleteAccountDesc', icon: 'solar:trash-bin-trash-linear', danger: true }] : []),
])
const appVersion = packageInfo.version ? `v${String(packageInfo.version).replace(/^v/i, '')}` : ''
const densitySaving = ref(false)
async function changeMailDensity(density) {
  if (densitySaving.value || settingStore.mailListDensity === density) return
  const previous = settingStore.mailListDensity
  settingStore.mailListDensity = density
  densitySaving.value = true
  try {
    await setMailListDensity(density)
  } catch (error) {
    settingStore.mailListDensity = previous
    console.error('Nova Mail: unable to save mail list density', error)
  } finally {
    densitySaving.value = false
  }
}
const setPwdLoading = ref(false)
const setNameShow = ref(false)
const accountName = ref(null)
const langSelect = ref(settingStore.lang)
const timeFormatNow = ref(new Date())
const timeFormatOptions = computed(() => [
  { value: '24h', label: t('timeFormat24h'), example: formatTime(timeFormatNow.value, '24h') },
  { value: '12h', label: t('timeFormat12h'), example: formatTime(timeFormatNow.value, '12h') },
])
let timeFormatTimer = null
let timeFormatTimeout = null

function stopTimeFormatClock() {
  if (timeFormatTimeout) window.clearTimeout(timeFormatTimeout)
  if (timeFormatTimer) window.clearInterval(timeFormatTimer)
  timeFormatTimeout = null
  timeFormatTimer = null
}

function startTimeFormatClock() {
  stopTimeFormatClock()
  const refresh = () => { timeFormatNow.value = new Date() }
  refresh()
  timeFormatTimeout = window.setTimeout(() => {
    refresh()
    timeFormatTimer = window.setInterval(refresh, 60000)
  }, 60000 - (Date.now() % 60000))
}

watch(section, (current) => {
  if (current === 'personalization') startTimeFormatClock()
  else stopTimeFormatClock()
}, { immediate: true })
const swipeActionOptions = SWIPE_ACTION_OPTIONS
const githubLoading = ref(false)
const githubAccount = reactive({ connected: false, login: '', avatarUrl: '' })
const googleLoading = ref(false)
const googleAccount = reactive({ connected: false, email: '', avatarUrl: '' })
const sessions = ref([])
const sessionsLoading = ref(false)
const revokingSession = ref('')
const loginAlertsLoading = ref(false)
const loginAlerts = reactive({ email: true, telegram: false, telegramAvailable: false })
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

function themePreviewStyle(mode) {
  const light = uiStore.lightPalette
  const dark = uiStore.darkPalette
  const split = (key) => mode === 'system'
    ? `linear-gradient(90deg, ${light[key]} 0 50%, ${dark[key]} 50% 100%)`
    : (mode === 'dark' ? dark[key] : light[key])
  return {
    '--preview-background': split('background'),
    '--preview-surface': split('surface'),
    '--preview-foreground': split('foreground'),
    '--preview-accent': split('accent'),
    '--preview-border': split('border'),
  }
}

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

function formatSessionTime(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return t('justNow')
  if (minutes < 60) return t('minutesAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('hoursAgo', { count: hours })
  return formatDateTime(value)
}

async function refreshSecurity() {
  sessionsLoading.value = true
  try {
    const [sessionRows, alertSettings] = await Promise.all([getSessions(), getLoginAlerts()])
    sessions.value = sessionRows || []
    Object.assign(loginAlerts, alertSettings || {})
  } finally {
    sessionsLoading.value = false
  }
}

async function signOutSession(session) {
  revokingSession.value = session.id
  try {
    await revokeSession(session.id)
    sessions.value = sessions.value.filter((item) => item.id !== session.id)
  } finally {
    revokingSession.value = ''
  }
}

function signOutOtherSessions() {
  ElMessageBox.confirm(t('signOutOtherDevicesConfirm'), { confirmButtonText: t('signOut'), cancelButtonText: t('cancel'), type: 'warning' }).then(async () => {
    await revokeOtherSessions()
    sessions.value = sessions.value.filter((session) => session.current)
    ElMessage({ message: t('signedOutOtherDevices'), type: 'success', plain: true })
  })
}

async function saveLoginAlerts() {
  if (loginAlertsLoading.value) return
  loginAlertsLoading.value = true
  try {
    Object.assign(loginAlerts, await updateLoginAlerts({ email: loginAlerts.email, telegram: loginAlerts.telegram }))
  } finally {
    loginAlertsLoading.value = false
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
  if (section.value === 'about' || section.value === 'home') return

  // Normalise a value persisted by an older build, then warm the sound the
  // user is most likely to audition.
  if (section.value === 'personalization') {
    settingStore.notificationSoundType = setNotificationSoundType(settingStore.notificationSoundType)
    preloadNotificationSound(settingStore.notificationSoundType)
  }

  if (section.value === 'connected') {
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
  }

  if (section.value === 'sessions') await refreshSecurity()

  if (section.value === 'personalization') {
    // Re-register a device whose endpoint rotated (or whose row was cleaned up
    // after a 404/410), then show the real state. Both are best effort.
    await syncPushSubscription()
    await refreshPushState()
  }
})

onBeforeUnmount(() => {
  stopTimeFormatClock()
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
      clearAuthenticatedSession();
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
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  height: 100%;
  overflow-y: auto;
  padding: 40px 32px;

  @media (min-width: 768px) {
    /* A tall subpage must not move the shared centered column when its
       scrollbar appears; reserve an equal gutter on both sides. */
    scrollbar-gutter: stable both-edges;
  }

  @media (max-width: 767px) {
    padding: calc(env(safe-area-inset-top, 0px) + 24px) 16px 30px;
    /* Mobile browsers already use overlay scroll indicators. Avoid a desktop
       scrollbar taking 10px from just the long subpages in narrow previews. */
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }
  }

  .settings-content {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    width: 100%;
    max-width: 1040px;
    min-width: 0;
    margin-inline: auto;
  }

  .settings-section {
    display: grid;
    align-content: start;
    gap: 12px;
    width: 100%;
    min-width: 0;
    margin: 0 0 30px;
  }

  .settings-section-title {
    margin: 0;
    color: var(--nm-text-primary);
    font-size: 16px;
    font-weight: 650;
    line-height: 1.35;
  }

  .settings-section-description {
    margin: -6px 0 0;
    color: var(--nm-text-muted);
    font-size: 13px;
    line-height: 1.45;
  }

  .settings-panel {
    width: 100%;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--nova-divider);
    border-radius: 12px;
    background: var(--nova-surface);
  }

  .settings-row {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
    min-height: 64px;
    padding: 14px 18px;
    box-sizing: border-box;
  }

  .settings-row + .settings-row { border-top: 1px solid var(--nova-divider-soft); }
  .settings-row-title { color: var(--nm-text-primary); font-size: 14px; font-weight: 500; }
  .settings-row-copy { display: grid; min-width: 0; gap: 4px; }
  .settings-row-copy small { color: var(--nm-text-muted); font-size: 13px; line-height: 1.4; }

  .settings-text-action {
    flex: 0 0 auto;
    padding: 6px 8px;
    border: 0;
    border-radius: var(--nova-button-radius);
    color: var(--nm-accent);
    background: transparent;
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .settings-text-action:hover { background: var(--nm-hover); }
  .settings-text-action:active { background: var(--nova-button-active); }
  .settings-text-action:focus-visible { outline: none; box-shadow: var(--nova-button-focus-ring); }

  .settings-home {
    display: grid;
    gap: 8px;
    width: 100%;
    max-width: 760px;
    margin-inline: auto;
  }

  .settings-directory { display: grid; gap: 8px; align-content: start; }
  .settings-directory-heading { margin: 6px 14px 3px; color: var(--nm-text-muted); font-size: 12px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
  .settings-directory-heading.security-heading { margin-top: 22px; }
  .settings-category-row.danger-entry .settings-category-icon,
  .settings-category-row.danger-entry .settings-category-copy strong { color: var(--nova-danger); }
  .settings-category-row.danger-entry .settings-category-icon { background: color-mix(in srgb, var(--nova-danger) 10%, transparent); }
  .addresses-page { flex: 1 1 auto; min-height: 0; grid-template-rows: auto minmax(320px, 1fr); }
  .addresses-panel { min-height: 0; height: 100%; }
  .addresses-panel :deep(.account-box.address-page) { border: 0 !important; background: var(--nova-surface); }
  .addresses-panel :deep(.account-box.address-page .head-opt) { max-width: none; padding-inline: 18px; }
  .addresses-panel :deep(.account-box.address-page .scrollbar) { max-width: none; }
  .addresses-panel :deep(.account-box.address-page .item) { margin-inline: 18px; }

  .settings-home-title {
    margin-bottom: 12px;
    color: var(--nm-text-primary);
    font-size: 22px;
    font-weight: 700;
  }

  .settings-category-row {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 74px;
    padding: 13px 14px;
    gap: 14px;
    border: 1px solid transparent;
    border-radius: var(--nova-button-radius);
    color: var(--nm-text-primary);
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: background-color var(--nova-motion-fast) var(--nova-motion-ease), border-color var(--nova-motion-fast) var(--nova-motion-ease);
  }

  .settings-category-row:hover,
  .settings-category-row:focus-visible {
    border-color: var(--nova-divider);
    background: var(--nm-hover);
  }

  .settings-category-row:focus-visible,
  .settings-back-button:focus-visible {
    outline: none;
    box-shadow: var(--nova-button-focus-ring);
  }

  .settings-category-icon {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
    border-radius: 12px;
    color: var(--nm-accent);
    background: var(--nm-accent-subtle);
  }

  .settings-category-copy {
    display: grid;
    min-width: 0;
    flex: 1 1 auto;
    gap: 3px;
  }

  .settings-category-copy strong { font-size: 15px; font-weight: 600; }
  .settings-category-copy small { overflow: hidden; color: var(--nm-text-muted); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
  .settings-category-chevron { flex: 0 0 auto; color: var(--nm-text-muted); }

  .settings-subpage-header {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 38px;
    margin-bottom: 28px;
  }

  .settings-subpage-header h1 { margin: 0; color: var(--nm-text-primary); font-size: 22px; line-height: 1.2; }
  .settings-back-button { display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 10px; color: var(--nm-text-secondary); background: transparent; cursor: pointer; }
  .settings-back-button:hover { color: var(--nm-text-primary); background: var(--nm-hover); }

  .about-page { display: grid; gap: 22px; color: var(--nm-text-secondary); }
  .about-brand { display: flex; align-items: center; gap: 12px; color: var(--nm-text-primary); font-size: 20px; font-weight: 700; }
  .about-brand img { width: 40px; height: 40px; border-radius: 10px; }
  .about-page p { margin: 0; color: var(--nm-text-secondary); line-height: 1.6; }
  .about-details { display: grid; gap: 0; }
  .about-details > div { justify-content: space-between; font-size: 14px; }
  .about-details > div > span:last-child,
  .about-details > div > .about-link { min-width: 0; color: var(--nm-text-primary); text-align: right; }
  .about-link { max-width: 68%; overflow: hidden; color: var(--nm-accent) !important; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; transition: color var(--nova-motion-fast) var(--nova-motion-ease), opacity var(--nova-motion-fast) var(--nova-motion-ease); }
  .about-link:hover { color: var(--nm-accent-strong, var(--nm-accent)) !important; }
  .about-link:active { opacity: .72; }
  .about-link:focus-visible { outline: none; border-radius: 4px; box-shadow: var(--nova-button-focus-ring); }

  .account-link-section {
    order: 4;
    display: grid;
    gap: 12px;
    margin-bottom: 40px;
    font-size: 14px;
  }

  .account-link-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: min(100%, 460px);
    min-height: 52px;
    padding: 9px 12px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--nova-button-radius);
    color: var(--nm-text-primary);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .account-link-row:hover { background: var(--nm-hover); }
  .account-link-row > span { display: grid; gap: 2px; }
  .account-link-row small { color: var(--nm-text-muted); font-size: 12px; }

  .update-pwd {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .title {
    font-size: 18px;
    font-weight: bold;
  }

  .profile-row {
    display: grid;
    grid-template-columns: minmax(120px, 26%) minmax(0, 1fr);
  }

  .profile-value {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 12px;
  }

  .profile-value-text {
    min-width: 0;
    overflow: hidden;
    color: var(--nm-text-secondary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-name-input { flex: 1 1 auto; min-width: 0; width: min(100%, 280px); }

  .profile-value .settings-text-action { margin-left: auto; }

  .language {
    .language-select {
      width: min(100%, 180px);
    }
  }

  .settings-control-row { justify-content: space-between; }

  .time-format-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: min(100%, 320px);
    align-self: flex-start;
    gap: 8px;
  }

  .time-format-option {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    min-width: 0;
    min-height: 58px;
    padding: 9px 12px;
    border: 1px solid var(--nm-border);
    border-radius: var(--nova-button-radius);
    color: var(--nm-text-secondary);
    background: var(--nm-surface-elevated);
    text-align: left;
    transition: border-color 140ms ease, background-color 140ms ease, color 140ms ease;
  }

  .time-format-option:hover:not(:disabled) {
    border-color: var(--nm-accent);
    color: var(--nm-text-primary);
    background: var(--nm-hover);
  }

  .time-format-option.active {
    border-color: var(--nm-accent);
    color: var(--nm-accent);
    background: var(--nm-accent-subtle);
  }

  .time-format-option:focus-visible {
    outline: none;
    box-shadow: var(--nova-button-focus-ring);
  }

  .time-format-option-label {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.3;
  }

  .time-format-option-example {
    color: var(--nm-text-muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
  }

  .connected-accounts {
    font-size: 14px;

    .connected-account-row {
      min-height: 72px;
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

  .danger-title { color: var(--nm-danger); }
  .danger-row { justify-content: space-between; }
  .danger-row :deep(.el-button) { flex: 0 0 auto; }
  .danger-row :deep(.settings-row-copy small) { color: var(--nm-text-secondary); }

  /* Account deletion is the only destructive action on this page. Its solid
     treatment is deliberately scoped so mail-toolbar danger buttons can keep
     their compact outline/hover affordance. */
  .danger-row :deep(.settings-danger-button.el-button--danger) {
    border-color: var(--nm-danger);
    color: var(--nm-danger-foreground);
    background: var(--nm-danger);
    box-shadow: 0 1px 2px color-mix(in srgb, var(--nm-danger) 28%, transparent);
    opacity: 1;
  }

  .danger-row :deep(.settings-danger-button.el-button--danger:not(.is-disabled):hover) {
    border-color: var(--nm-danger-hover);
    color: var(--nm-danger-foreground);
    background: var(--nm-danger-hover);
    box-shadow: 0 3px 8px color-mix(in srgb, var(--nm-danger) 24%, transparent);
  }

  .danger-row :deep(.settings-danger-button.el-button--danger:not(.is-disabled):active) {
    border-color: var(--nm-danger-active);
    color: var(--nm-danger-foreground);
    background: var(--nm-danger-active);
  }

  .danger-row :deep(.settings-danger-button.el-button--danger:focus-visible) {
    outline: none;
    box-shadow: 0 0 0 2px var(--nm-danger-surface), 0 0 0 4px var(--nm-danger-border);
  }

  .danger-row :deep(.settings-danger-button.el-button--danger.is-disabled),
  .danger-row :deep(.settings-danger-button.el-button--danger:disabled) {
    border-color: var(--nm-danger-border);
    color: var(--nm-text-secondary);
    background: var(--nm-danger-surface);
    box-shadow: none;
  }
}

.mail-density-setting { order: 1; }
.language { order: 2; }
.appearance { order: 3; }
.time-format { order: 4; }
.swipe-actions-setting { order: 5; }
.notification { order: 6; }

  /* ---------- Notification sound ---------- */
  .session-list { display: grid; min-height: 64px; }
  .session-row { min-height: 98px; }
  .session-icon { display: grid; place-items: center; flex: 0 0 36px; width: 36px; height: 36px; border-radius: 10px; color: var(--nm-text-secondary); background: var(--nm-accent-subtle); }
  .session-details { min-width: 0; flex: 1; }
  .session-title { color: var(--nm-text-primary); font-size: 14px; font-weight: 600; }
  .session-meta { color: var(--nm-text-muted); font-size: 12px; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .session-action { display: flex; flex: 0 0 120px; justify-content: flex-end; align-items: center; }
  .session-current { color: var(--el-color-primary); font-size: 12px; font-weight: 600; white-space: nowrap; }
  .session-empty { padding: 18px; color: var(--nm-text-muted); }
  .revoke-others-button { justify-self: start; }
  .security-setting-row { justify-content: space-between; }
  .security-setting-row small { display: block; color: var(--nm-text-muted); font-size: 12px; margin-top: 2px; }

  .swipe-action-setting-row {
    justify-content: space-between;
  }

  .swipe-action-direction {
    color: var(--nm-text-secondary);
    font-size: 14px;
    white-space: nowrap;
  }

  .swipe-action-select {
    width: 180px;
    flex: 0 1 180px;
  }

  @media (max-width: 767px) {
    .swipe-action-setting-row { gap: 10px; }
    .swipe-action-direction { font-size: 13px; }
    .swipe-action-select { width: 160px; flex-basis: 160px; }
  }

  .notification-row {
    justify-content: space-between;
  }

  .notification-toggle-row { min-height: 66px; }
  .notification-switch { flex: 0 0 auto; }

  .notification-test-row {
    display: flex;
    padding: 0 16px 12px;
    border-bottom: 1px solid var(--nova-divider);
  }

  .notification-test-row :deep(.el-button) { min-width: 0; }

  /* Status under the label: muted by default, primary once enabled. */
  .notification-status {
    display: block;
    margin-top: 2px;
    color: var(--regular-text-color);
    font-size: 12px;
  }

  .notification-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .notification-actions :deep(.el-button) {
    flex: 0 0 auto;
  }

  .notification-select { width: min(240px, 100%); flex: 1 1 180px; }

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
    .notification-sound-row { flex-wrap: wrap; }
    .notification-sound-row > .settings-row-title { flex: 1 0 100%; }
    .notification-actions { width: 100%; justify-content: space-between; }
    .notification-select { width: auto; }
  }

  /* ---------- Appearance ---------- */
  .appearance-editor {
    margin-top: 0;
  }

  .appearance-row {
    justify-content: space-between;
  }

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
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    flex: 0 1 308px;
    gap: 10px;
  }

  .theme-option {
    width: 100%;
    min-height: 78px;
    box-sizing: border-box;
    display: grid;
    grid-template-rows: 38px 15px;
    align-content: center;
    justify-items: center;
    gap: 7px;
    padding: 8px;
    border: 1px solid var(--nova-divider);
    border-radius: 9px;
    color: var(--el-text-color-primary);
    background: var(--nova-surface-muted);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    text-align: center;
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
    width: 100%;
    height: 38px;
    overflow: hidden;
    display: block;
    border: 1px solid color-mix(in srgb, var(--nova-divider) 80%, transparent);
    border-radius: 5px;
    box-sizing: border-box;
    background: var(--preview-background);
    border-color: var(--preview-border);
  }

  .theme-miniature::before {
    content: '';
    position: absolute;
    inset: 4px;
    z-index: 0;
    border-radius: 2px;
    background: var(--preview-surface);
  }

  .theme-miniature i,
  .theme-miniature b,
  .theme-miniature em {
    position: absolute;
    z-index: 1;
    left: 23px;
    right: 6px;
    height: 4px;
    display: block;
    border-radius: 2px;
    background: var(--preview-foreground);
  }

  .theme-miniature i { top: 8px; background: var(--preview-accent); }
  .theme-miniature b { top: 17px; }
  .theme-miniature em { top: 26px; right: 17px; }

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
    .settings-section { margin-bottom: 24px; }
    .settings-row { gap: 12px; min-height: 58px; padding: 12px 14px; }
    .profile-row { grid-template-columns: minmax(80px, 30%) minmax(0, 1fr); }
    .profile-value { gap: 4px; }
    .profile-value .settings-text-action { padding-inline: 4px; }
    .mail-density-setting .settings-control-row { flex-direction: column; align-items: stretch; }
    .session-row { align-items: flex-start; }
    .session-icon { flex-basis: 30px; width: 30px; height: 30px; }
    .session-action { flex-basis: 80px; min-width: 0; }
    .session-current { text-align: right; white-space: normal; }
    .session-meta { white-space: normal; overflow-wrap: anywhere; }
    .danger-row { flex-wrap: wrap; }
    .danger-row :deep(.el-button) { margin-left: auto; }
    .addresses-panel :deep(.account-box.address-page .head-opt) { padding-inline: 14px; }
    .addresses-panel :deep(.account-box.address-page .item) { margin-inline: 14px; }
    .settings-home-title { font-size: 20px; }
    .settings-category-row { min-height: 68px; padding-inline: 8px; gap: 12px; }
    .settings-category-icon { width: 36px; height: 36px; flex-basis: 36px; border-radius: 10px; }
    .settings-category-copy strong { font-size: 14px; }
    .settings-category-copy small { font-size: 12px; }
    .settings-subpage-header { margin-bottom: 22px; }
    .settings-subpage-header h1 { font-size: 20px; }
    .about-page { gap: 18px; }
    .time-format-options { width: 100%; }
    .time-format-option { padding-inline: 10px; }
    .appearance-row { gap: 12px; padding: 12px; }
    .appearance-mode-row { display: block; }
    .appearance-mode-row .appearance-label { margin-bottom: 10px; }
    .theme-options {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px;
    }

    .theme-option { width: auto; min-width: 0; min-height: 72px; grid-template-rows: 32px 15px; padding: 6px; }
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
