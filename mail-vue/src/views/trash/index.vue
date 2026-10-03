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
        <el-tooltip effect="dark" :content="t('emptyTrash')" :show-after="2000">
          <button class="nova-icon-button nova-toolbar-button nova-danger-button" type="button" :disabled="!hasMail" :aria-label="t('emptyTrash')" @click="emptyTrashSelected">
            <Icon icon="solar:trash-bin-trash-linear" width="20" height="20" />
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
import { ElMessageBox } from 'element-plus'
import { useAccountStore } from '@/store/account.js'
import { useEmailStore } from '@/store/email.js'
import emailScroll from '@/components/email-scroll/index.vue'
import { emailDeleteForever, emailList, emailRead } from '@/request/email.js'
import { restoreMessages, emptyTrash } from '@/utils/mail-mutations.js'
import router from '@/router/index.js'

defineOptions({ name: 'trash' })

const { t } = useI18n()
const scroll = ref(null)
const emailStore = useEmailStore()
const accountStore = useAccountStore()
const selectedIds = computed(() => scroll.value?.getSelectedMailsIds?.() || [])
const hasMail = computed(() => (scroll.value?.emailList?.length || 0) > 0)

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
  restoreMessages(ids)
}

function emptyTrashSelected() {
  if (!hasMail.value) return

  ElMessageBox.confirm(t('emptyTrashConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    // The list clears and the counter drops to zero immediately; the backend
    // operation runs in the background and rolls the snapshot back on failure.
    emptyTrash(accountStore.currentAccountId)
  })
}

</script>

<style scoped>
.mail-list-page { height: 100%; min-height: 0; }
</style>
