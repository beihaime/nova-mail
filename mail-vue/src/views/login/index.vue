<template>
  <div id="login-box" :class="{ 'has-custom-background': !!settingStore.settings.background }" :style="background" v-loading="oauthLoading" element-loading-text="登录中...">
    <div class="login-scene" aria-hidden="true">
      <div class="login-sky-glow"></div>
    </div>
    <header class="login-brand">
      <img :src="brandMark" alt="Nova Mail" />
      <div>
        <strong>Nova Mail</strong>
        <span>{{ $t('loginTagline') }}</span>
      </div>
    </header>

    <button
        class="login-theme-toggle"
        type="button"
        :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        :title="isDark ? 'Light mode' : 'Dark mode'"
        @click="toggleLoginTheme"
    >
      <Icon
          :icon="isDark ? 'solar:sun-2-linear' : 'solar:moon-linear'"
          width="21"
          height="21"
      />
    </button>

    <div class="login-quiet-tagline">{{ $t('quietTagline') }}</div>
    <div class="form-wrapper">
      <div class="container">
        <span class="form-title">{{ show === 'login' ? $t('welcomeBack') : $t('createAccount') }}</span>
        <span class="form-desc" v-if="show === 'login'">{{ $t('loginTitle') }}</span>
        <span class="form-desc" v-else>{{ $t('regTitle') }}</span>
        <div v-show="show === 'login'">
          <el-input :class="!hideLoginDomain ? 'email-input' : ''" v-model="form.email"
                    type="text" :placeholder="$t('emailAccount')" autocomplete="off" @keyup.enter="submit">
            <template #append v-if="!hideLoginDomain">
              <div @click.stop="openSelect">
                <el-select
                    v-if="show === 'login'"
                    ref="mySelect"
                    v-model="suffix"
                    :placeholder="$t('select')"
                    class="select"
                >
                  <el-option
                      v-for="item in domainList"
                      :key="item"
                      :label="item"
                      :value="item"
                  />
                </el-select>
                <div style="color: var(--el-text-color-primary)">
                  <span>{{ suffix }}</span>
                  <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
                </div>
              </div>
            </template>
          </el-input>
          <el-input v-model="form.password" :placeholder="$t('password')" type="password" autocomplete="off" @keyup.enter="submit">
          </el-input>
          <el-button class="btn" type="primary" @click="submit" :loading="loginLoading" :disabled="loginLoading"
          >{{ $t('loginBtn') }}
          </el-button>
          <div class="oauth-divider"><span>{{ $t('orContinueWith') }}</span></div>
          <el-button class="btn github-login" @click="startGithubLogin">
            <Icon icon="codicon:github-inverted" width="18" height="18" style="margin-right: 10px" />
            {{ $t('continueWithGithub') }}
          </el-button>
          <el-button v-for="p in oauthProviders" :key="p.key" class="btn" style="margin-top: 10px" @click="oauthLogin(p.key)">
            <el-avatar v-if="p.iconType === 'image'" :src="p.icon" :size="18" style="margin-right: 10px" />
            <Icon v-else :icon="p.icon" width="18" height="18" style="margin-right: 10px" />
            {{ p.label }}
          </el-button>
        </div>
        <div v-show="show !== 'login'">
          <el-input :class="!hideLoginDomain ? 'email-input' : ''" v-model="registerForm.email" type="text" :placeholder="$t('emailAccount')"
                    autocomplete="off" @keyup.enter="submitRegister">
            <template #append v-if="!hideLoginDomain">
              <div @click.stop="openSelect">
                <el-select
                    v-if="show !== 'login'"
                    ref="mySelect"
                    v-model="suffix"
                    :placeholder="$t('select')"
                    class="select"
                >
                  <el-option
                      v-for="item in domainList"
                      :key="item"
                      :label="item"
                      :value="item"
                  />
                </el-select>
                <div>
                  <span>{{ suffix }}</span>
                  <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
                </div>
              </div>
            </template>
          </el-input>
          <el-input v-model="registerForm.password" :placeholder="$t('password')" type="password" autocomplete="off" @keyup.enter="submitRegister"/>
          <el-input v-model="registerForm.confirmPassword" :placeholder="$t('confirmPwd')" type="password"
                    autocomplete="off" @keyup.enter="submitRegister"/>
          <el-input v-if="settingStore.settings.regKey === 0" v-model="registerForm.code" :placeholder="$t('regKey')"
                    type="text" autocomplete="off" @keyup.enter="submitRegister"/>
          <el-input v-if="settingStore.settings.regKey === 2" v-model="registerForm.code"
                    :placeholder="$t('regKeyOptional')" type="text" autocomplete="off" @keyup.enter="submitRegister"/>
          <div v-show="verifyShow"
               class="register-turnstile"
               :data-sitekey="settingStore.settings.siteKey"
               data-callback="onTurnstileSuccess"
               data-error-callback="onTurnstileError"
               data-after-interactive-callback="loadAfter"
               data-before-interactive-callback="loadBefore"
          >
            <span style="font-size: 12px;color: #F56C6C" v-if="botJsError">{{ $t('verifyModuleFailed') }}</span>
          </div>
          <el-button class="btn" style="margin: 0" type="primary" @click="submitRegister" :loading="registerLoading"
          >{{ $t('regBtn') }}
          </el-button>
        </div>
        <template v-if="settingStore.settings.register === 0">
          <div class="switch" @click="show = 'register'" v-if="show === 'login'">{{ $t('noAccount') }}
            <span>{{ $t('regSwitch') }}</span></div>
          <div class="switch" @click="show = 'login'" v-else>{{ $t('hasAccount') }} <span>{{ $t('loginSwitch') }}</span>
          </div>
        </template>
      </div>
    </div>
    <el-dialog class="bind-dialog" v-model="showBindForm"  title="注册邮箱" >
      <div class="bind-container">
        <el-input :class="!hideLoginDomain ? 'email-input' : ''" v-model="bindForm.email" type="text" :placeholder="$t('emailAccount')" autocomplete="off" @keyup.enter="bind">
          <template #append v-if="!hideLoginDomain">
            <div @click.stop="openSelect">
              <el-select
                  ref="mySelect"
                  v-model="suffix"
                  :placeholder="$t('select')"
                  class="select"
              >
                <el-option
                    v-for="item in domainList"
                    :key="item"
                    :label="item"
                    :value="item"
                />
              </el-select>
              <div>
                <span>{{ suffix }}</span>
                <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
              </div>
            </div>
          </template>
        </el-input>
        <el-input v-if="settingStore.settings.regKey === 0" v-model="bindForm.code" :placeholder="$t('regKey')"
                  type="text" autocomplete="off" @keyup.enter="bind"/>
        <el-input v-if="settingStore.settings.regKey === 2" v-model="bindForm.code"
                  :placeholder="$t('regKeyOptional')" type="text" autocomplete="off" @keyup.enter="bind"/>
        <el-button class="btn" type="primary" @click="bind" :loading="bindLoading"
        >绑定
        </el-button>
      </div>
    </el-dialog>
    <footer class="login-copyright">© {{ new Date().getFullYear() }} Nova Mail</footer>
  </div>
</template>

<script setup>
import router from "@/router";
import {useRoute} from "vue-router";
import {computed, nextTick, reactive, ref} from "vue";
import {login} from "@/request/login.js";
import {register} from "@/request/login.js";
import {websiteConfig} from "@/request/setting.js";
import {isEmail} from "@/utils/verify-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {useUserStore} from "@/store/user.js";
import {useUiStore} from "@/store/ui.js";
import {Icon} from "@iconify/vue";
import {cvtR2Url} from "@/utils/convert.js";
import {loginUserInfo} from "@/request/my.js";
import {permsToRouter} from "@/perm/perm.js";
import {useI18n} from "vue-i18n";
import {githubOauthComplete, googleOauthComplete, oauthBindUser, oauthLinuxDoLogin} from "@/request/ouath.js";
import brandMark from '@/icons/svg/brand-mark.svg'

const {t} = useI18n();
const accountStore = useAccountStore();
const userStore = useUserStore();
const uiStore = useUiStore();
const settingStore = useSettingStore();
const route = useRoute();
const isDark = computed(() => {
  if (uiStore.themeMode === 'dark') {
    return true
  }

  if (uiStore.themeMode === 'system') {
    return window.matchMedia(
        '(prefers-color-scheme: dark)'
    ).matches
  }

  return false
})

const loginLoading = ref(false)
const bindLoading = ref(false)
const oauthLoading = ref(false);
const showBindForm = ref(false);
const show = ref('login')

function toggleLoginTheme() {
  uiStore.setThemeMode(
      isDark.value ? 'light' : 'dark'
  )
}
const oauthKeys = ['linuxdo', 'google']

const oauthProvider = computed(() => {
  const fromState = route.query.state
  if (oauthKeys.includes(fromState)) return fromState
  const fromStore = sessionStorage.getItem('oauthProvider')
  return oauthKeys.includes(fromStore) ? fromStore : null
})

const oauthProviders = computed(() => {
  const allProviders = [
    { key: 'google', label: t('continueWithGoogle'), icon: 'devicon:google', iconType: 'iconify' },
    { key: 'linuxdo', label: 'LinuxDo', icon: '/image/linuxdo.webp', iconType: 'image' },
  ]
  return allProviders.filter(p => settingStore.settings[p.key + 'Switch'] === 0)
})

const bindForm = reactive({
  email: '',
  bindToken: '',
  code: ''
})

const form = reactive({
  email: '',
  password: '',

});
const mySelect = ref()
const suffix = ref('')
const registerForm = reactive({
  email: '',
  password: '',
  confirmPassword: '',
  code: null
})
const domainList = settingStore.domainList;
const registerLoading = ref(false)
suffix.value = domainList[0]
const verifyShow = ref(false)
let verifyToken = ''
let turnstileId = null
let botJsError = ref(false)
let verifyErrorCount = 0

window.onTurnstileSuccess = (token) => {
  verifyToken = token;
};

window.onTurnstileError = (e) => {
  if (verifyErrorCount >= 4) {
    return
  }
  verifyErrorCount++
  console.warn('人机验加载失败', e)
  setTimeout(() => {
    nextTick(() => {
      if (!turnstileId) {
        turnstileId = window.turnstile.render('.register-turnstile')
      } else {
        window.turnstile.reset(turnstileId);
      }
    })
  }, 1500)
};

window.loadAfter = (e) => {
  console.log('loadAfter')
}

window.loadBefore = (e) => {
  console.log('loadBefore')
}

const loginOpacity = computed(() => {
  const opacity = settingStore.settings.loginOpacity

  return isDark.value
      ? `rgba(0,0,0,${opacity})`
      : `rgba(255,255,255,${opacity})`
})

const hideLoginDomain = computed(() => settingStore.settings.loginDomain === 1)

const background = computed(() => {

  // 用户自定义背景优先
  if (settingStore.settings.background) {
    return {
      'background-image':
          `url(${cvtR2Url(settingStore.settings.background)})`,
      'background-repeat': 'no-repeat',
      'background-size': 'cover',
      'background-position': 'center'
    }
  }


  // 深色登录背景
  if (isDark.value) {
    return {
      'background-image':
          "url('/image/login-dark.png')",
      'background-repeat': 'no-repeat',
      'background-size': 'cover',
      'background-position': 'center center'
    }
  }


  return {}
})

const openSelect = () => {
  mySelect.value.toggleMenu()
}

const getFullEmail = (email) => {
  return hideLoginDomain.value ? email : email + suffix.value
}

const getEmailName = (email) => {
  return email.split('@')[0]
}

function oauthLogin(provider) {
  if (provider === 'google') {
    const apiBase = (import.meta.env.VITE_BASE_URL || '/api').replace(/\/$/, '')
    window.location.assign(`${apiBase}/oauth/google/login`)
    return
  }
  const clientId = settingStore.settings[provider + 'ClientId']
  const redirectUri = encodeURIComponent(window.location.origin + '/login')
  sessionStorage.setItem('oauthProvider', provider)
  const authorizeUrls = {
    linuxdo: `https://connect.linux.do/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email&state=${provider}`,
    google: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email&state=${provider}`,
  }
  window.location.href = authorizeUrls[provider]
}

const loginFns = {
  linuxdo: oauthLinuxDoLogin,
}

oauthGetUser();

async function oauthGetUser() {

  const params = new URLSearchParams(window.location.search)
  const githubStatus = params.get('github')
  const grant = params.get('grant')
  if (githubStatus) {
    window.history.replaceState({}, '', window.location.origin + window.location.pathname)
    if (githubStatus === 'complete' && grant) {
      oauthLoading.value = true
      try {
        const data = await githubOauthComplete(grant)
        await saveToken(data.token)
      } catch {
        oauthLoading.value = false
      }
      return
    }
    const messageKey = githubStatus === 'unlinked' ? 'githubNotLinked' : 'githubLoginFailed'
    ElMessage({ message: t(messageKey), type: 'warning', plain: true })
    return
  }
  const googleStatus = params.get('google')
  if (googleStatus) {
    window.history.replaceState({}, '', window.location.origin + window.location.pathname)
    if (googleStatus === 'complete' && grant) {
      oauthLoading.value = true
      try {
        const data = await googleOauthComplete(grant)
        await saveToken(data.token)
      } catch {
        oauthLoading.value = false
      }
      return
    }
    const messageKey = googleStatus === 'unlinked' ? 'googleNotLinked' : googleStatus === 'denied' ? 'googleAuthorizationCancelled' : 'googleLoginFailed'
    ElMessage({ message: t(messageKey), type: 'warning', plain: true })
    return
  }
  const code = params.get('code')
  if (!code || !oauthProvider.value) return

  const provider = oauthProvider.value
  oauthLoading.value = true
  sessionStorage.removeItem('oauthProvider')
  window.history.replaceState({}, '', window.location.origin + window.location.pathname)

  loginFns[provider](code, window.location.origin + '/login').then(data => {

    bindForm.bindToken = data.bindToken;

    if (!data.token) {
      showBindForm.value = true
      oauthLoading.value = false
      ElMessage({
        message: '请注册绑定一个邮箱',
        type: 'warning',
        duration: 4000,
        plain: true,
      })
      return;
    }

    saveToken(data.token);
  }).catch(() => {
    oauthLoading.value = false
  })
}

function startGithubLogin() {
  const apiBase = (import.meta.env.VITE_BASE_URL || '/api').replace(/\/$/, '')
  window.location.assign(`${apiBase}/oauth/github/login`)
}

function bind() {

  if (bindLoading.value) return

  if (!bindForm.email) {
    ElMessage({
      message: t('emptyEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }


  if (getEmailName(bindForm.email).length < settingStore.settings.minEmailPrefix) {
    ElMessage({
      message: t('minEmailPrefix', {msg: settingStore.settings.minEmailPrefix}),
      type: 'error',
      plain: true,
    })
    return
  }

  let email = getFullEmail(bindForm.email);


  if (!isEmail(email)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (settingStore.settings.regKey === 0) {

    if (!bindForm.code) {

      ElMessage({
        message: t('emptyRegKeyMsg'),
        type: 'error',
        plain: true,
      })
      return
    }

  }

  const form = {email, bindToken: bindForm.bindToken, code: bindForm.code}

  bindLoading.value = true
  oauthBindUser(form).then(data => {
    saveToken(data.token)
  }).catch(() => {
    bindLoading.value = false
  })
}

const submit = () => {

  if (loginLoading.value) return

  if (!form.email) {
    ElMessage({
      message: t('emptyEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  let email = getFullEmail(form.email);

  if (!isEmail(email)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (!form.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  loginLoading.value = true
  login(email, form.password).then(async data => {
    await saveToken(data.token)
  }).catch(() => {
  }).finally(() => {
    loginLoading.value = false
  })
}

async function saveToken(token) {
  localStorage.setItem('token', token)
  refreshWebsiteConfig()
  const user = await loginUserInfo();
  accountStore.currentAccountId = user.account.accountId;
  accountStore.currentAccount = user.account;
  userStore.user = user;
  const routers = permsToRouter(user.permKeys);
  routers.forEach(routerData => {
    router.addRoute('layout', routerData);
  });
  await router.replace({name: 'layout'})
  uiStore.showNotice()
  oauthLoading.value = false;
  bindLoading.value = false;
}

function refreshWebsiteConfig() {
  websiteConfig().then(setting => {
    settingStore.settings = setting
    settingStore.domainList = setting.domainList
    if (!suffix.value && setting.domainList.length > 0) {
      suffix.value = setting.domainList[0]
    }
    document.title = setting.title
  }).catch(e => {
    console.error(e)
  })
}


function submitRegister() {

  if (registerLoading.value) return

  if (!registerForm.email) {
    ElMessage({
      message: t('emptyEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  console.log(registerForm.email)

  if (getEmailName(registerForm.email).length < settingStore.settings.minEmailPrefix) {
    ElMessage({
      message: t('minEmailPrefix', {msg: settingStore.settings.minEmailPrefix}),
      type: 'error',
      plain: true,
    })
    return
  }

  const email = getFullEmail(registerForm.email);

  if (!isEmail(email)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (!registerForm.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (registerForm.password.length < 6) {
    ElMessage({
      message: t('pwdLengthMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (registerForm.password !== registerForm.confirmPassword) {

    ElMessage({
      message: t('confirmPwdFailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (settingStore.settings.regKey === 0) {

    if (!registerForm.code) {

      ElMessage({
        message: t('emptyRegKeyMsg'),
        type: 'error',
        plain: true,
      })
      return
    }

  }

  if (!verifyToken && (settingStore.settings.registerVerify === 0 || (settingStore.settings.registerVerify === 2 && settingStore.settings.regVerifyOpen))) {
    if (!verifyShow.value) {
      verifyShow.value = true
      nextTick(() => {
        if (!turnstileId) {
          try {
            turnstileId = window.turnstile.render('.register-turnstile')
          } catch (e) {
            botJsError.value = true
            console.log('人机验证js加载失败')
          }
        } else {
          window.turnstile.reset('.register-turnstile')
        }
      })
    } else if (!botJsError.value) {
      ElMessage({
        message: t('botVerifyMsg'),
        type: "error",
        plain: true
      })
    }
    return;
  }

  registerLoading.value = true

  const form = {
    email,
    password: registerForm.password,
    token: verifyToken,
    code: registerForm.code
  }

  register(form).then(({regVerifyOpen}) => {
    show.value = 'login'
    registerForm.email = ''
    registerForm.password = ''
    registerForm.confirmPassword = ''
    registerForm.code = ''
    registerLoading.value = false
    verifyToken = ''
    settingStore.settings.regVerifyOpen = regVerifyOpen
    verifyShow.value = false
    ElMessage({
      message: t('regSuccessMsg'),
      type: 'success',
      plain: true,
    })
  }).catch(res => {

    registerLoading.value = false

    if (res.code === 400) {
      verifyToken = ''
      settingStore.settings.regVerifyOpen = true
      if (turnstileId) {
        window.turnstile.reset(turnstileId)
      } else {
        nextTick(() => {
          turnstileId = window.turnstile.render('.register-turnstile')
        })
      }
      verifyShow.value = true

    }
  });
}

</script>


<style>
.el-select-dropdown__item {
  padding: 0 15px;
}

.no-autofill-pwd {
  .el-input__inner {
    -webkit-text-security: disc !important;
  }
}
</style>

<style lang="scss" scoped>

.form-wrapper {
  position: fixed;
  z-index: 10;
  top: 24px;
  right: 24px;
  bottom: 24px;
  width: clamp(390px, 30vw, 460px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: nova-login-card-in 300ms var(--nova-motion-ease) 60ms both;
  @media (max-width: 767px) {
    width: 100%;
  }
}

.container {
  background: v-bind(loginOpacity);
  padding-left: 40px;
  padding-right: 40px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 100%;
  height: 100%;
  border: 1px solid var(--login-border);
  border-radius: 28px;
  box-shadow: var(--el-box-shadow-light);
  backdrop-filter: blur(20px);
  @media (max-width: 1024px) {
    padding: 20px 18px;
    width: 100%;
    margin-left: 0;
  }
  @media (max-width: 767px) {
    border: 1px solid var(--login-border);
    padding: 20px 18px;
    border-radius: 22px;
    height: fit-content;
    width: 100%;
    margin-right: 0;
    margin-left: 0;
  }

  .btn {
    height: 36px;
    width: 100%;
    border-radius: 6px;
  }

  .form-desc {
    margin-top: 5px;
    margin-bottom: 18px;
    color: var(--form-desc-color);
  }

  .form-title {
    font-weight: bold;
    font-size: 22px !important;
  }

  .switch {
    margin-top: 20px;
    text-align: center;

    span {
      color: var(--login-switch-color);
      cursor: pointer;
    }
  }

  :deep(.el-input__wrapper) {
    border-radius: 6px;
    background: var(--el-bg-color);
  }

  .email-input :deep(.el-input__wrapper) {
    border-radius: 6px 0 0 6px;
    background: var(--el-bg-color);
  }

  .el-input {
    height: 38px;
    width: 100%;
    margin-bottom: 18px;

    :deep(.el-input__inner) {
      height: 36px;
    }
  }
}

:deep(.el-select-dropdown__item) {
  padding: 0 10px;
}

:deep(.bind-dialog) {
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.bind-container {
  display: grid;
  grid-template-columns: 1fr;
  gap: 15px;
}

.setting-icon {
  position: relative;
  top: 6px;
}

.github {
  position: fixed;
  width: 35px;
  height: 35px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
  background: var(--el-bg-color);
  bottom: 10px;
  right: 10px;
  z-index: 1000;
  border: 1px solid var(--el-border-color-light);
  box-shadow: var(--el-box-shadow-light);
  cursor: pointer;
}

:deep(.el-input-group__append) {
  padding: 0 !important;
  padding-left: 8px !important;
  padding-right: 4px !important;
  background: var(--el-bg-color);
  border-radius: 0 8px 8px 0;
}

:deep(.el-button+.el-button) {
  margin: 0;
}

.register-turnstile {
  margin-bottom: 18px;
}

.login-turnstile {
  min-height: 65px;
  margin: 4px 0 14px;
}

.turnstile-unavailable {
  margin: 4px 0 14px;
  color: var(--el-color-danger);
  font-size: 12px;
}

.oauth-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 14px 0 10px;
  color: var(--el-text-color-secondary);
  font-size: 12px;

  &::before,
  &::after {
    content: '';
    height: 1px;
    flex: 1;
    background: var(--el-border-color-lighter);
  }
}

.github-login {
  margin: 0;
  border-color: var(--el-border-color);
}

.select {
  position: absolute;
  right: 30px;
  width: 100px;
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}

.custom-style {
  margin-bottom: 10px;
}

.custom-style .el-segmented {
  --el-border-radius-base: 6px;
  width: 180px;
}

:global(html.dark) #login-box:not(.has-custom-background) .login-scene {
  background:none;
}
:global(html.dark) #login-box:not(.has-custom-background) .login-sky-glow,
:global(html.dark) #login-box:not(.has-custom-background) .login-mountain {
  display:none;
}
#login-box {
  position: relative;
  min-height:100%;
  background:#dbeafe;
}

.login-scene {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  background: radial-gradient(circle at 22% 18%, rgba(255,255,255,.72), transparent 34%), linear-gradient(160deg, rgba(255,255,255,.18), rgba(15,23,42,.22));
}

.login-sky-glow {
  position: absolute;
  inset: -20%;
  background: radial-gradient(ellipse at 30% 18%, rgba(255,255,255,.55), transparent 42%);
}

.login-mountain {
  position: absolute;
  left: -8%;
  right: 28%;
  bottom: -18%;
  height: 62%;
  transform: skewX(-12deg) rotate(-4deg);
  background: linear-gradient(145deg, rgba(30,64,175,.35), rgba(15,23,42,.82));
}

.login-mountain-far { opacity: .48; bottom: -8%; transform: skewX(-18deg) rotate(8deg); background: linear-gradient(145deg, rgba(96,165,250,.7), rgba(30,41,59,.72)); }
.login-mountain-near { opacity: .72; left: 16%; right: -14%; bottom: -28%; height: 54%; transform: skewX(14deg) rotate(-8deg); background: linear-gradient(145deg, rgba(15,23,42,.42), rgba(2,6,23,.92)); }

.login-brand {
  position: fixed;
  z-index: 5;
  top: 30px;
  left: 34px;
  display: flex;
  align-items: center;
  gap: 12px;
  animation: nova-login-brand-in 300ms var(--nova-motion-ease) both;

  color: #334155;
  text-shadow: none;

  img {
    width: 38px;
    height: 38px;
    object-fit: contain;
  }

  strong {
    display: block;
    font-size: 18px;
    letter-spacing: -.02em;
    color: #334155;
  }

  span {
    display: block;
    margin-top: 3px;
    font-size: 12px;
    color: #64748b;
    opacity: 1;
  }
}

@keyframes nova-login-brand-in {
  from { opacity: 0; transform: translate3d(0, -4px, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}

@keyframes nova-login-card-in {
  from { opacity: 0; transform: translate3d(0, 10px, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}

.login-copyright { position: fixed; z-index: 5; left: 34px; bottom: 24px; color: rgba(255,255,255,.72); font-size: 12px; }
.login-quiet-tagline {
  position: fixed;
  z-index: 5;
  left: 34px;
  top: 150px;
  color: #475569;
  font-size: 14px;
  letter-spacing: .12em;
}

@media (max-width: 767px) {
  #login-box { min-height: 100dvh; height: auto; overflow-y: auto; padding: 126px 16px 56px; box-sizing: border-box; }
  .login-brand { top: 22px; left: 22px; }
  .login-copyright { left: 22px; bottom: 14px; }
  .login-quiet-tagline { left: 24px; top: 94px; font-size: 12px; letter-spacing: .1em; }
  .form-wrapper { position: relative; top: auto; right: auto; bottom: auto; left: auto; width: 100%; max-width: 420px; margin: 0 auto; }
  .login-scene { opacity: .72; }
  .container { width: 100%; padding: 24px; height: auto; min-height: 0; border-radius: 28px; background: rgba(232,243,255,.78); box-shadow: 0 18px 50px rgba(30,80,140,.16); }
  :global(.dark) .container { background: rgba(20,28,43,.82); }
  .form-title { font-size: 24px !important; line-height: 1.2; letter-spacing: -.02em; }
  .form-desc { margin-top: 4px; margin-bottom: 18px; font-size: 14px; line-height: 1.4; }
  .container .el-input { width: 100%; min-width: 0; height: 50px; margin-bottom: 14px; font-size: 16px; }
  .container .el-input :deep(.el-input__wrapper) { min-width: 0; width: 100%; }
  .container .el-input :deep(.el-input__inner) { min-width: 0; width: 100%; height: 48px; font-size: 16px; }
  .container .email-input :deep(.el-input__wrapper) { min-width: 0; }
  .container :deep(.el-input-group__append) { flex: 0 0 auto; min-width: 116px; max-width: 45%; padding-left: 6px !important; padding-right: 4px !important; white-space: nowrap; }
  .container .btn { width: 100%; min-width: 0; height: 50px; border-radius: 11px; font-size: 15px; }
  .oauth-divider { margin: 16px 0 12px; }
  .switch { margin-top: 18px; }
}


#background-wrap {
  height: 100%;
  z-index: 0;
}

@keyframes animateCloud {
  0% {
    margin-left: -500px;
  }

  100% {
    margin-left: 100%;
  }
}

.x1 {
  animation: animateCloud 30s linear infinite;
  transform: scale(0.65);
}

.x2 {
  animation: animateCloud 15s linear infinite;
  transform: scale(0.3);
}

.x3 {
  animation: animateCloud 25s linear infinite;
  transform: scale(0.5);
}

.x4 {
  animation: animateCloud 13s linear infinite;
  transform: scale(0.4);
}

.x5 {
  animation: animateCloud 20s linear infinite;
  transform: scale(0.55);
}

.cloud {
  background: linear-gradient(to bottom, #fff 5%, #f1f1f1 100%);
  border-radius: 100px;
  box-shadow: 0 8px 5px rgba(0, 0, 0, 0.1);
  height: 120px;
  width: 350px;
  position: relative;
}

.cloud:after,
.cloud:before {
  content: "";
  position: absolute;
  background: #fff;
  z-index: -1;
}

.cloud:after {
  border-radius: 100px;
  height: 100px;
  left: 50px;
  top: -50px;
  width: 100px;
}

.cloud:before {
  border-radius: 200px;
  height: 180px;
  width: 180px;
  right: 50px;
  top: -90px;
}


/* Login theme toggle */
.login-theme-toggle {
  position: fixed;
  z-index: 30;
  top: max(24px, env(safe-area-inset-top));
  right: 28px;

  width: 42px;
  height: 42px;

  display: grid;
  place-items: center;

  padding: 0;
  border: 1px solid rgba(255, 255, 255, .30);
  border-radius: 50%;

  color: #1c1c1e;
  background: rgba(255, 255, 255, .72);

  backdrop-filter: blur(16px) saturate(1.1);
  box-shadow: 0 6px 20px rgba(15, 23, 42, .12);

  cursor: pointer;

  transition:
    background-color .18s ease,
    border-color .18s ease,
    color .18s ease,
    transform .18s ease;
}

.login-theme-toggle:hover {
  transform: translateY(-1px);
}

.login-theme-toggle:active {
  transform: scale(.96);
}

:global(html.dark) .login-theme-toggle {
  color: #f2f2f7;
  background: rgba(28, 28, 30, .66);
  border-color: rgba(255, 255, 255, .12);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .24);
}

@media (max-width: 767px) {
  .login-theme-toggle {
    top: calc(16px + env(safe-area-inset-top, 0px));
    right: 16px;
    width: 40px;
    height: 40px;
  }
}

/* Dark login scene tuning */

:global(html.dark) #login-box:not(.has-custom-background) .login-scene {
  background:
    linear-gradient(
      rgba(4, 12, 28, .10),
      rgba(4, 12, 28, .20)
    );
}

:global(html.dark) #login-box:not(.has-custom-background) .login-sky-glow,
:global(html.dark) #login-box:not(.has-custom-background) .login-mountain {
  opacity: 0;
}

:global(html.dark) .container {
  background: rgba(16, 23, 35, .76);
  border-color: rgba(255, 255, 255, .10);
  box-shadow: 0 20px 55px rgba(0, 0, 0, .24);
  backdrop-filter: blur(20px) saturate(1.08);
}

:global(html.dark) .login-brand,
:global(html.dark) .login-quiet-tagline,
:global(html.dark) .login-copyright {
  color: rgba(242, 242, 247, .94);
}

</style>
:global(html.dark) .login-brand strong {
color:#f2f2f7;
}

:global(html.dark) .login-brand span {
color:#a1a1aa;
}

:global(html.dark) .login-quiet-tagline {
color:#d1d5db;
}