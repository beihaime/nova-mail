import {computed, effectScope, nextTick, reactive, ref, watch} from 'vue'
import {
  accountAdd,
  accountDelete,
  accountList,
  accountSetAllReceive,
  accountSetAsTop,
  accountSetName,
} from '@/request/account.js'
import {sleep} from '@/utils/time-utils.js'
import {isEmail} from '@/utils/verify-utils.js'
import {useSettingStore} from '@/store/setting.js'
import {useAccountStore} from '@/store/account.js'
import {useEmailStore} from '@/store/email.js'
import {useUserStore} from '@/store/user.js'
import {hasPerm} from '@/perm/perm.js'
import {registerUserScopedCacheReset} from '@/utils/user-scoped-cache.js'
import i18n from '@/i18n/index.js'
import {AccountAllReceiveEnum} from '@/enums/account-enum.js'

/**
 * Account-address state and behaviour.
 *
 * The address list is rendered in two places that must never disagree: the
 * account switcher (layout/account) and the Account addresses sub-page inside
 * Settings. The switcher is always mounted by the main layout, so it is the
 * natural owner of the add/rename dialogs; the addresses page reuses the same
 * singleton through this composable instead of duplicating the requests.
 *
 * The instance is created on first use (inside a component setup, so Pinia is
 * active) and shared from then on.
 */
let instance = null

export function useAccountAddresses() {
  if (!instance) instance = createAccountAddresses()
  return instance
}

/**
 * Drop the cached address list. Called on logout/identity change so a later
 * login in the same browser tab can never render the previous user's addresses
 * from this shared singleton.
 */
export function resetAccountAddresses() {
  instance?.reset()
}

function createAccountAddresses() {
  const t = i18n.global.t
  const userStore = useUserStore()
  const accountStore = useAccountStore()
  const settingStore = useSettingStore()
  const emailStore = useEmailStore()

  const primaryAddress = computed(() => userStore.user.email || '')
  const domainList = computed(() => settingStore.domainList)

  const accounts = reactive([])
  const noLoading = ref(false)
  const loading = ref(false)
  const followLoading = ref(false)
  const skeletonRows = ref(10)
  const queryParams = {
    size: 30
  }

  const showAdd = ref(false)
  const addLoading = ref(false)
  const addRef = ref({})
  const mySelect = ref({})
  const scrollbarRef = ref({})
  const setNameShow = ref(false)
  const setNameLoading = ref(false)
  const accountName = ref(null)
  const verifyShow = ref(false)
  const botJsError = ref(false)

  const addForm = reactive({
    email: '',
    suffix: settingStore.domainList[0]
  })

  let renameTarget = null
  let turnstileId = null
  let verifyToken = ''
  let verifyErrorCount = 0

  function getSkeletonRows() {
    if (accounts.length > 20) return skeletonRows.value = 20
    if (accounts.length === 0) return skeletonRows.value = 1
    skeletonRows.value = accounts.length
  }

  function changeAccount(account) {
    accountStore.currentAccountId = account.accountId
    accountStore.currentAccount = account
  }

  function itemBg(accountId) {
    return accountStore.currentAccountId === accountId ? 'item-choose' : ''
  }

  function getAccountList() {
    if (loading.value || followLoading.value || noLoading.value) return

    if (accounts.length === 0) {
      loading.value = true
    } else {
      followLoading.value = true
    }

    const start = Date.now()
    const accountId = accounts.length > 0 ? accounts.at(-1).accountId : 0
    const lastSort = accounts.length > 0 ? accounts.at(-1).sort : null

    accountList(accountId, queryParams.size, lastSort).then(async list => {
      const duration = Date.now() - start
      if (duration < 300) {
        await sleep(300 - duration)
      }

      if (list.length < queryParams.size) {
        noLoading.value = true
      }
      if (accounts.length === 0) {
        accountStore.currentAccount = list[0]
      }

      accounts.push(...list)
      accountStore.addresses = [...accounts]

      loading.value = false
      followLoading.value = false
    }).catch(() => {
      loading.value = false
      followLoading.value = false
    })
  }

  function refresh() {
    if (loading.value) return
    loading.value = false
    followLoading.value = false
    noLoading.value = false
    getSkeletonRows()
    scrollbarRef.value?.setScrollTop?.(0)
    accounts.splice(0, accounts.length)
    getAccountList()
  }

  /**
   * Discard every address cached in memory and reset the pagination/dialog
   * state. It must not issue a request: on logout there is no authenticated
   * identity to load for.
   */
  function reset() {
    accounts.splice(0, accounts.length)
    accountStore.addresses = []
    loading.value = false
    followLoading.value = false
    noLoading.value = false
    renameTarget = null
    accountName.value = null
    setNameShow.value = false
    showAdd.value = false
  }

  function canQueryAddresses() {
    const permKeys = userStore.user?.permKeys
    return Array.isArray(permKeys) && (permKeys.includes('*') || permKeys.includes('account:query'))
  }

  function add() {
    addForm.suffix = addForm.suffix || settingStore.domainList[0]
    showAdd.value = true
    setTimeout(() => {
      addRef.value?.focus?.()
    }, 100)
  }

  function openSelect() {
    mySelect.value?.toggleMenu?.()
  }

  function submit() {
    if (addLoading.value) return

    if (!addForm.email) {
      ElMessage({message: t('emptyEmailMsg'), type: 'error', plain: true})
      return
    }

    if (addForm.email.length < settingStore.settings.minEmailPrefix) {
      ElMessage({message: t('minEmailPrefix', {msg: settingStore.settings.minEmailPrefix}), type: 'error', plain: true})
      return
    }

    if (!isEmail(addForm.email + addForm.suffix)) {
      ElMessage({message: t('notEmailMsg'), type: 'error', plain: true})
      return
    }

    if (!verifyToken && (settingStore.settings.addEmailVerify === 0 || (settingStore.settings.addEmailVerify === 2 && settingStore.settings.addVerifyOpen))) {
      if (!verifyShow.value) {
        verifyShow.value = true
        nextTick(() => {
          if (!turnstileId) {
            try {
              turnstileId = window.turnstile.render('.add-email-turnstile')
            } catch (e) {
              botJsError.value = true
              console.log('人机验证js加载失败')
            }
          } else {
            window.turnstile.reset('.add-email-turnstile')
          }
        })
      } else if (!botJsError.value) {
        ElMessage({message: t('botVerifyMsg'), type: 'error', plain: true})
      }
      return
    }

    addLoading.value = true
    accountAdd(addForm.email + addForm.suffix, verifyToken).then(account => {
      addLoading.value = false
      addForm.email = ''
      accounts.push(account)
      verifyToken = ''
      settingStore.settings.addVerifyOpen = account.addVerifyOpen
      ElMessage({message: t('addSuccessMsg'), type: 'success', plain: true})
      verifyShow.value = false
      showAdd.value = false
      userStore.refreshUserInfo()
    }).catch(res => {
      if (res.code === 400) {
        verifyToken = ''
        if (turnstileId) {
          window.turnstile.reset(turnstileId)
        } else {
          nextTick(() => {
            turnstileId = window.turnstile.render('.add-email-turnstile')
          })
        }
        verifyShow.value = true
      }
      addLoading.value = false
    })
  }

  function openSetName(accountItem) {
    accountName.value = accountItem.name
    renameTarget = accountItem
    setNameShow.value = true
  }

  function setName() {
    if (setNameLoading.value) return

    const name = accountName.value

    if (name === renameTarget.name) {
      setNameShow.value = false
      return
    }

    if (!name) {
      ElMessage({message: t('emptyUserNameMsg'), type: 'error', plain: true})
      return
    }

    setNameLoading.value = true
    accountSetName(renameTarget.accountId, name).then(() => {
      renameTarget.name = name
      setNameShow.value = false

      if (renameTarget.accountId === userStore.user.account.accountId) {
        userStore.user.name = name
      }

      ElMessage({message: t('saveSuccessMsg'), type: 'success', plain: true})
    }).finally(() => {
      setNameLoading.value = false
    })
  }

  function setAllReceive(account) {
    const allReceiveAccount = accounts.find(entry => entry.allReceive === AccountAllReceiveEnum.ENABLED)
    if (allReceiveAccount && allReceiveAccount.accountId !== account.accountId) allReceiveAccount.allReceive = AccountAllReceiveEnum.DISABLED
    account.allReceive = account.allReceive === AccountAllReceiveEnum.DISABLED ? AccountAllReceiveEnum.ENABLED : AccountAllReceiveEnum.DISABLED
    accountSetAllReceive(account.accountId).catch(() => {
      account.allReceive = account.allReceive === AccountAllReceiveEnum.DISABLED ? AccountAllReceiveEnum.ENABLED : AccountAllReceiveEnum.DISABLED
      if (allReceiveAccount) allReceiveAccount.allReceive = AccountAllReceiveEnum.ENABLED
    }).then(() => {
      if (account.allReceive === AccountAllReceiveEnum.ENABLED) {
        ElMessage({message: t('setSuccess'), type: 'success', plain: true})
      }
      changeAccount(account)
      emailStore.emailScroll?.refreshList()
      emailStore.sendScroll?.refreshList()
    })
  }

  function showNullSetting(item) {
    return !hasPerm('email:send') && !(item.accountId !== userStore.user.account.accountId && hasPerm('account:delete'))
  }

  function hasAddressMenu(item) {
    return !showNullSetting(item)
  }

  function remove(account) {
    ElMessageBox.confirm(t('delConfirm', {msg: account.email}), {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      type: 'warning'
    }).then(() => {
      accountDelete(account.accountId).then(() => {
        const index = accounts.findIndex(item => item.accountId === account.accountId)
        accounts.splice(index, 1)
        if (accounts.length < queryParams.size) {
          getAccountList()
        }
        ElMessage({message: t('delSuccessMsg'), type: 'success', plain: true})
      })
    })
  }

  function setAsTop(account, index) {
    accountSetAsTop(account.accountId).then(() => {
      ElMessage({message: t('setSuccess'), type: 'success', plain: true})
      const [item] = accounts.splice(index, 1)
      accounts.splice(1, 0, item)
    })
  }

  async function copyAccount(address) {
    try {
      await navigator.clipboard.writeText(address)
      ElMessage({message: t('copySuccessMsg'), type: 'success', plain: true})
    } catch (err) {
      console.error(`${t('copyFailMsg')}:`, err)
      ElMessage({message: t('copyFailMsg'), type: 'error', plain: true})
    }
  }

  watch(() => accountStore.changeUserAccountName, () => {
    if (accounts[0]) accounts[0].name = accountStore.changeUserAccountName
  })

  watch(() => settingStore.domainList, (list) => {
    if (!addForm.suffix && list.length > 0) {
      addForm.suffix = list[0]
    }
  }, {immediate: true})

  window.onTurnstileError = (e) => {
    if (verifyErrorCount >= 4) return
    verifyErrorCount++
    console.warn('人机验加载失败', e)
    setTimeout(() => {
      nextTick(() => {
        if (!turnstileId) {
          turnstileId = window.turnstile.render('.add-email-turnstile')
        } else {
          window.turnstile.reset(turnstileId)
        }
      })
    }, 1500)
  }

  window.onTurnstileSuccess = (token) => {
    verifyToken = token
  }

  // This singleton outlives a logout/login in the same tab, so it is reset both
  // by clearUserScopedState() and by watching the authenticated identity. The
  // detached scope keeps the watcher alive after the component that first
  // created the singleton unmounts.
  registerUserScopedCacheReset(reset)
  effectScope(true).run(() => {
    watch(() => userStore.user?.userId, (userId, previousUserId) => {
      if (userId === previousUserId) return
      reset()
      if (canQueryAddresses()) getAccountList()
    })
  })

  if (canQueryAddresses()) {
    getAccountList()
  }

  return {
    // data
    accounts,
    primaryAddress,
    domainList,
    loading,
    noLoading,
    followLoading,
    skeletonRows,
    showAdd,
    addLoading,
    addForm,
    addRef,
    mySelect,
    scrollbarRef,
    verifyShow,
    botJsError,
    setNameShow,
    setNameLoading,
    accountName,
    // actions
    getAccountList,
    refresh,
    reset,
    changeAccount,
    itemBg,
    add,
    openSelect,
    submit,
    openSetName,
    setName,
    setAllReceive,
    showNullSetting,
    hasAddressMenu,
    remove,
    setAsTop,
    copyAccount,
  }
}
