<template>
  <div id="login-box" :style=" background ? 'background: var(--el-bg-color)' : ''" v-loading="oauthLoading" element-loading-text="登录中...">
    <div id="background-wrap" class="login-background" v-if="!settingStore.settings.background">
      <div class="x1 cloud"></div>
      <div class="x2 cloud"></div>
      <div class="x3 cloud"></div>
      <div class="x4 cloud"></div>
      <div class="x5 cloud"></div>
    </div>
    <div v-else class="login-background" :style="background"></div>
    <button class="login-theme-toggle" type="button" :aria-label="uiStore.dark ? $t('lightMode') : $t('darkMode')" @click="toggleTheme">
      <Icon :icon="uiStore.dark ? 'mingcute:sun-fill' : 'solar:moon-linear'" width="21" height="21" />
    </button>
    <div class="form-wrapper">
      <div class="login-brand">
        <AppIcon name="brand-mark" :size="56" />
        <div>
          <strong>{{ settingStore.settings.title || 'Nova Mail' }}</strong>
          <span>{{ $t('loginSlogan') }}</span>
        </div>
      </div>
      <div class="container">
        <span class="form-title">
          <span class="desktop-form-title">{{ settingStore.settings.title }}</span>
          <span class="mobile-form-title">{{ show === 'login' ? $t('welcomeBack') : $t('createAccount') }}</span>
        </span>
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
          <div
              v-if="settingStore.settings.siteKey"
              ref="loginTurnstileRef"
              class="login-turnstile"
          ></div>
          <div v-else class="turnstile-unavailable">{{ $t('verifyModuleFailed') }}</div>
          <el-button class="btn" type="primary" @click="submit" :loading="loginLoading" :disabled="!loginVerifyToken || loginLoading"
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
        <template v-if="settingStore.settings.register === 0">
          <div class="switch" @click="show = 'register'" v-if="show === 'login'">{{ $t('noAccount') }}
            <span>{{ $t('regSwitch') }}</span></div>
          <div class="switch" @click="show = 'login'" v-else>{{ $t('hasAccount') }} <span>{{ $t('loginSwitch') }}</span>
          </div>
        </template>
      </div>
    </div>
    <footer class="login-footer">© 2026 {{ settingStore.settings.title || 'Nova Mail' }}</footer>
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
    <a v-show="settingStore.settings.projectLink" class="github" href="https://github.com/beihaime/nova-mail">
      <Icon icon="mingcute:github-line" color="#1890ff" width="20" height="20" />
    </a>
  </div>
</template>

<script setup>
import router from "@/router";
import {useRoute} from "vue-router";
import {computed, nextTick, onMounted, reactive, ref, watch} from "vue";
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
import {githubOauthComplete, oauthBindUser, oauthLinuxDoLogin, oauthGoogleLogin} from "@/request/ouath.js";

const {t} = useI18n();
const accountStore = useAccountStore();
const userStore = useUserStore();
const uiStore = useUiStore();
const settingStore = useSettingStore();
const route = useRoute();
const loginLoading = ref(false)
const bindLoading = ref(false)
const oauthLoading = ref(false);
const showBindForm = ref(false);
const show = ref('login')

const oauthKeys = ['linuxdo', 'google']

const oauthProvider = computed(() => {
  const fromState = route.query.state
  if (oauthKeys.includes(fromState)) return fromState
  const fromStore = sessionStorage.getItem('oauthProvider')
  return oauthKeys.includes(fromStore) ? fromStore : null
})

const oauthProviders = computed(() => {
  const allProviders = [
    { key: 'google', label: 'Google', icon: 'devicon:google', iconType: 'iconify' },
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
const loginVerifyToken = ref('')
const loginTurnstileRef = ref(null)
let loginTurnstileId = null
suffix.value = domainList[0]
const verifyShow = ref(false)
let verifyToken = ''
let turnstileId = null
let botJsError = ref(false)
let verifyErrorCount = 0

window.onTurnstileSuccess = (token) => {
  verifyToken = token;
};

window.onLoginTurnstileSuccess = (token) => {
  loginVerifyToken.value = token
}

window.onLoginTurnstileExpired = () => {
  loginVerifyToken.value = ''
}

window.onLoginTurnstileError = () => {
  loginVerifyToken.value = ''
}

watch(() => uiStore.dark, () => {
  loginVerifyToken.value = ''
  if (!loginTurnstileId || !window.turnstile) return
  window.turnstile.remove(loginTurnstileId)
  loginTurnstileId = null
  nextTick(renderLoginTurnstile)
})

watch(() => settingStore.settings.siteKey, () => {
  nextTick(renderLoginTurnstile)
})

onMounted(() => {
  const waitForTurnstile = () => {
    renderLoginTurnstile()
    if (!loginTurnstileId && !window.turnstile) {
      window.setTimeout(waitForTurnstile, 120)
    }
  }
  waitForTurnstile()
})

function renderLoginTurnstile() {
  if (!loginTurnstileRef.value || !window.turnstile || loginTurnstileId || !settingStore.settings.siteKey) return
  try {
    loginTurnstileId = window.turnstile.render(loginTurnstileRef.value, {
      sitekey: settingStore.settings.siteKey,
      theme: uiStore.dark ? 'dark' : 'light',
      callback: window.onLoginTurnstileSuccess,
      'expired-callback': window.onLoginTurnstileExpired,
      'error-callback': window.onLoginTurnstileError,
    })
  } catch (error) {
    // The explicit API should not race Vue. Keep the failure recoverable in
    // case the script was blocked or the browser restored an old DOM node.
    console.warn('Turnstile render failed', error)
  }
}

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
  return uiStore.dark ? `rgba(0, 0, 0, ${opacity})` : `rgba(255, 255, 255, ${opacity})`
})

const hideLoginDomain = computed(() => settingStore.settings.loginDomain === 1)

const background = computed(() => {

  return settingStore.settings.background ? {
    'background-image': `url(${cvtR2Url(settingStore.settings.background)})`,
    'background-repeat': 'no-repeat',
    'background-size': 'cover',
    'background-position': 'center'
  } : ''
})

function toggleTheme() {
  const nextIsDark = !uiStore.dark
  document.documentElement.setAttribute('class', nextIsDark ? 'dark' : '')
  document.getElementById('theme-color-meta')?.setAttribute('content', nextIsDark ? '#111111' : '#FFFFFF')
  uiStore.dark = nextIsDark
}

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
  google: oauthGoogleLogin,
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

  if (!loginVerifyToken.value) {
    ElMessage({ message: t('botVerifyMsg'), type: 'error', plain: true })
    renderLoginTurnstile()
    return
  }

  // Turnstile tokens are single-use. Consume it before the request so a
  // second click or a delayed retry can never submit the same token twice.
  const verificationToken = loginVerifyToken.value
  loginVerifyToken.value = ''
  loginLoading.value = true
  login(email, form.password, verificationToken).then(async data => {
    await saveToken(data.token)
  }).catch(() => {
    loginVerifyToken.value = ''
    window.turnstile?.reset(loginTurnstileId)
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

@media (max-width: 767px) {
  html.dark #login-box { background: linear-gradient(155deg, #071c3e 0%, #102c59 48%, #08192f 100%); }
  html.dark #login-box::after { background: linear-gradient(180deg, rgba(2, 12, 29, .48), rgba(3, 14, 31, .65)); }
  html.dark #background-wrap { opacity: .22; filter: saturate(.75) brightness(.65); }
  html.dark .container { background: color-mix(in srgb, #131b2a 78%, transparent); border-color: rgba(255, 255, 255, .13); box-shadow: 0 15px 38px rgba(0, 0, 0, .28); }
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
  right: 0;
  height: 100%;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
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
  width: 450px;
  height: 100%;
  border-left: 1px solid var(--login-border);
  box-shadow: var(--el-box-shadow-light);
  @media (max-width: 1024px) {
    padding: 20px 18px;
    width: 384px;
    margin-left: 18px;
  }
  @media (max-width: 767px) {
    border: 1px solid var(--login-border);
    padding: 20px 18px;
    border-radius: 6px;
    height: fit-content;
    width: 100%;
    margin-right: 18px;
    margin-left: 18px;
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


#login-box {
  background: linear-gradient(to bottom, #2980b9, #6dd5fa, #fff);
  font: 100% Arial, sans-serif;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow-x: hidden;
  display: grid;
  grid-template-columns: 1fr;
}

.login-brand,
.login-footer,
.login-theme-toggle,
.mobile-form-title { display: none; }


#background-wrap {
  height: 100%;
  z-index: 0;
}

.login-background {
  position: fixed;
  inset: 0;
  z-index: 0;
  background-position: center center !important;
  background-size: cover !important;
}

@media (max-width: 767px) {
  #login-box {
    min-height: 100dvh;
    height: auto;
    display: flex;
    flex-direction: column;
    overflow-x: clip;
    background: linear-gradient(155deg, #dcecff 0%, #eff7ff 48%, #d7e8fc 100%);
  }

  #login-box::after {
    content: '';
    position: fixed;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background: linear-gradient(180deg, rgba(247, 251, 255, .46), rgba(237, 246, 255, .2));
  }

  .login-theme-toggle {
    position: fixed;
    z-index: 12;
    top: calc(14px + env(safe-area-inset-top, 0px));
    right: 16px;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    color: var(--el-text-color-primary);
    border: 1px solid color-mix(in srgb, var(--el-text-color-primary) 14%, transparent);
    border-radius: 50%;
    background: color-mix(in srgb, var(--el-bg-color) 54%, transparent);
    backdrop-filter: blur(14px);
    cursor: pointer;
  }

  .form-wrapper {
    position: relative;
    z-index: 2;
    width: 100%;
    min-height: 0;
    height: auto;
    display: block;
    padding: clamp(32px, 6dvh, 64px) 16px 0;
  }

  .login-brand {
    max-width: 420px;
    margin: 0 auto 26px;
    padding: 0 8px;
    display: flex;
    align-items: center;
    gap: 13px;
    color: var(--el-text-color-primary);
  }
  .login-brand :deep(.app-icon) { filter: drop-shadow(0 4px 10px color-mix(in srgb, var(--el-color-primary) 25%, transparent)); }
  .login-brand strong, .login-brand span { display: block; }
  .login-brand strong { font-size: 30px; line-height: 1.1; font-weight: 650; letter-spacing: -.035em; }
  .login-brand span { margin-top: 4px; color: var(--form-desc-color); font-size: 16px; }

  .container {
    width: 100%;
    max-width: 420px;
    height: auto;
    min-height: 0;
    margin: 0 auto;
    padding: 24px;
    border: 1px solid color-mix(in srgb, var(--el-text-color-primary) 13%, transparent);
    border-radius: 28px;
    background: color-mix(in srgb, var(--el-bg-color) 76%, transparent);
    box-shadow: 0 12px 34px color-mix(in srgb, #14213d 16%, transparent);
    backdrop-filter: blur(20px) saturate(1.05);
  }
  .container .form-title { font-size: 23px !important; font-weight: 650; letter-spacing: -.02em; }
  .container .desktop-form-title { display: none; }
  .container .mobile-form-title { display: inline; }
  .container .form-desc { margin: 6px 0 20px; font-size: 14px; line-height: 1.4; }
  .container .el-input { height: 54px; margin-bottom: 12px; }
  .container .el-input :deep(.el-input__wrapper),
  .container .email-input :deep(.el-input__wrapper) { height: 54px; border-radius: 14px; background: color-mix(in srgb, var(--el-bg-color) 78%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--el-text-color-primary) 11%, transparent) inset !important; }
  .container .email-input :deep(.el-input__wrapper) { border-radius: 14px 0 0 14px; }
  .container :deep(.el-input-group__append) { height: 54px; border-radius: 0 14px 14px 0; background: color-mix(in srgb, var(--el-bg-color) 78%, transparent); }
  .container .btn { height: 54px; border-radius: 14px; font-weight: 600; }
  .container .login-turnstile { min-height: 65px; margin: 2px 0 12px; }
  .container .turnstile-unavailable { margin: 2px 0 12px; }
  .container .oauth-divider { margin: 18px 0 14px; }
  .container .github-login { margin: 0; }
  .container .switch { margin-top: 18px; font-size: 14px; }

  .login-footer {
    position: relative;
    z-index: 2;
    display: block;
    margin-top: auto;
    padding: 18px 16px calc(16px + env(safe-area-inset-bottom, 0px));
    color: color-mix(in srgb, var(--el-text-color-primary) 58%, transparent);
    text-align: center;
    font-size: 12px;
  }
}

@media (max-width: 767px) and (max-height: 780px) {
  .form-wrapper { padding-top: calc(22px + env(safe-area-inset-top, 0px)); }
  .login-brand { margin-bottom: 18px; }
  .login-brand :deep(.app-icon) { width: 48px; height: 48px; }
  .login-brand strong { font-size: 27px; }
  .login-brand span { display: none; }
  .container { padding: 20px; border-radius: 24px; }
  .container .form-desc { margin-bottom: 16px; }
  .container .el-input { height: 52px; margin-bottom: 10px; }
  .container .el-input :deep(.el-input__wrapper),
  .container .email-input :deep(.el-input__wrapper),
  .container :deep(.el-input-group__append),
  .container .btn { height: 52px; }
  .container .oauth-divider { margin: 14px 0 10px; }
  .container .switch { margin-top: 14px; }
  .login-footer { padding-top: 12px; }
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

</style>
