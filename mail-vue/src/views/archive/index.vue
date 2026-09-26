<template>
  <div class="mail-list-page">
    <emailScroll ref="scroll"
                 :cancel-success="cancelStar"
                 :star-success="addStar"
                 :getEmailList="getEmailList"
                 :emailDelete="emailDelete"
                 :email-read="emailRead"
                 :star-add="starAdd"
                 :star-cancel="starCancel"
                 :show-account-icon="false"
                 actionLeft="4px"
                 @jump="jumpContent"
    />
  </div>
</template>

<script setup>
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import emailScroll from "@/components/email-scroll/index.vue"
import {emailList, emailDelete, emailRead} from "@/request/email.js";
import {starAdd, starCancel} from "@/request/star.js";
import {defineOptions, onMounted, ref} from "vue";
import router from "@/router/index.js";

/**
 * Archived mail.
 *
 * The Inbox drops a message the moment it is archived (`archived = 1`), so this
 * view is the only place a user can find it again. It reuses the Inbox row
 * layout and the same list component, and differs only in the query it sends.
 *
 * Swipe actions are deliberately not wired up here: the swipe gesture is the
 * Inbox's archive/delete shortcut, and this folder would need an "unarchive"
 * gesture to be useful, which is a separate decision.
 */
defineOptions({
  name: 'archive'
})

const scroll = ref({})
const emailStore = useEmailStore();
const accountStore = useAccountStore();

onMounted(() => {
  emailStore.archiveScroll = scroll;
})

function jumpContent(email) {
  emailStore.contentData.email = emailStore.toContentEmail(email)
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  router.push('/mail')
}

function getEmailList(emailId, size) {
  const accountId = accountStore.currentAccountId;
  const allReceive = accountStore.currentAccount.allReceive;
  // `archived = 1`: the one query difference from the Inbox.
  return emailStore.fetchList(full =>
    emailList(accountId, allReceive, emailId, 0, size, 0, full, '', 1)
  ).then(data => {
    data.latestEmail.reqAccountId = accountId;
    data.latestEmail.allReceive = allReceive;
    return data;
  })
}

function addStar(email) {
  emailStore.starScroll?.addItem(email)
}

function cancelStar(email) {
  emailStore.starScroll?.deleteEmail([email.emailId])
}
</script>

<style scoped>
.mail-list-page {
  height: 100%;
  min-height: 0;
}
</style>
