<template>
  <div class="mail-list-page">
    <emailScroll
        ref="scroll"
        type="trash"
        :get-email-list="getEmailList"
        :email-delete="emailDeleteForever"
        :email-read="emailRead"
        :show-star="false"
        :delete-confirm-text="t('deleteForeverConfirm')"
        :delete-success-text="t('delSuccessMsg')"
        :show-account-icon="false"
        action-left="4px"
        @jump="jumpContent"
    >
      <template #first>
        <el-tooltip effect="dark" :content="t('restoreFromTrash')" :show-after="2000">
          <button class="nova-icon-button nova-toolbar-button" type="button" :disabled="!selectedIds.length" :aria-label="t('restoreFromTrash')" @click="restoreSelected">
            <Icon icon="solar:restart-linear" width="20" height="20" />
          </button>
        </el-tooltip>
      </template>
    </emailScroll>
  </div>
</template>

<script setup>
import { computed, defineOptions, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import { useAccountStore } from '@/store/account.js'
import { useEmailStore } from '@/store/email.js'
import emailScroll from '@/components/email-scroll/index.vue'
import { emailDeleteForever, emailList, emailRead, emailRestore } from '@/request/email.js'
import { runOptimisticMailMutation } from '@/utils/optimistic-mail-mutation.js'
import router from '@/router/index.js'

defineOptions({ name: 'trash' })

const { t } = useI18n()
const scroll = ref(null)
const emailStore = useEmailStore()
const accountStore = useAccountStore()
const selectedIds = computed(() => scroll.value?.getSelectedMailsIds?.() || [])

onMounted(() => { emailStore.trashScroll = scroll })

function getEmailList(emailId, size) {
  const accountId = accountStore.currentAccountId
  const allReceive = accountStore.currentAccount.allReceive
  return emailStore.fetchList(full => emailList(accountId, allReceive, emailId, 0, size, 'all', full, '', 0, 1))
}

function jumpContent(row) {
  emailStore.contentData.email = emailStore.toContentEmail(row)
  emailStore.contentData.delType = 'trash'
  // Trash takes precedence over normal folder controls.  A trashed message
  // keeps its stored star for Restore, but cannot be newly starred here.
  emailStore.contentData.showStar = false
  emailStore.contentData.showReply = true
  router.push('/mail')
}

function restoreSelected() {
  const ids = selectedIds.value
  if (!ids.length) return
  let snapshot = []

  // Restoring from Trash follows the same immediate mutation contract as
  // Archive/Trash: the list changes now, persistence is reconciled later.
  const mutation = runOptimisticMailMutation({
    ids,
    apply: () => { snapshot = scroll.value?.removeEmailsOptimistically?.(ids) || [] },
    persist: () => emailRestore(ids),
    rollback: () => scroll.value?.restoreEmailsOptimistically?.(snapshot),
    onPersistError: error => {
      console.error(error)
      ElMessage({ message: t('reqFailErrorMsg'), type: 'error', plain: true })
    },
  })
  if (mutation && snapshot.length) {
    ElMessage({ message: t('restoreSuccessMsg'), type: 'success', plain: true })
  }
}

</script>

<style scoped>
.mail-list-page { height: 100%; min-height: 0; }
</style>
