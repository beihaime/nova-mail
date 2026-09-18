<template>
  <div class="box mail-reader">
    <div class="header-actions">
      <AppIcon class="icon" name="back" :size="20" title="Back" aria-label="Back" @click="handleBack"/>
      <AppIcon v-perm="'email:delete'" class="icon" name="delete-outline" :size="18" title="Delete" aria-label="Delete email" @click="handleDelete"/>
      <span class="star" v-if="emailStore.contentData.showStar">
        <Icon
          v-if="email.isStar"
          class="icon star-active-icon"
          icon="solar:star-bold"
          width="20"
          height="20"
          title="Unstar"
          aria-label="Unstar email"
          @click="changeStar(email)"
        />
        <AppIcon class="icon" @click="changeStar(email)" v-else name="star-outline" :size="19" title="Star" aria-label="Star email"/>
      </span>
      <AppIcon class="icon" v-if="emailStore.contentData.showReply" v-perm="'email:send'"  @click="openReply" name="reply" :size="21" title="Reply" aria-label="Reply" />
      <AppIcon class="icon" v-if="emailStore.contentData.showReply" v-perm="'email:send'"  @click="openForward" name="forward" :size="20" title="Forward" aria-label="Forward" />
      <AppIcon class="icon" name="print" :size="19" title="Print" aria-label="Print email" @click="printEmail" />
    </div>
    <div></div>
    <el-scrollbar class="scrollbar">
      <div class="container">
        <div class="email-title">
          {{ thread.subject || email.subject }}
        </div>
        <div class="content thread">
          <article
              v-for="(message, index) in thread.messages"
              :key="message.id"
              class="thread-message"
              :class="{
                'is-expanded': isMessageExpanded(message),
                'is-latest': index === thread.messages.length - 1,
                'is-mine': message.isMine
              }"
          >
            <header class="message-head" @click="toggleMessage(message)">
              <SenderAvatar :email="message" :size="40" />
              <div class="sender-details">
                <div class="sender-line">
                  <strong>{{ message.from.name || message.from.email || '—' }}</strong>
                  <span v-if="message.from.email">&lt;{{ message.from.email }}&gt;</span>
                </div>
                <button class="recipient-toggle" type="button" @click.stop="toggleMessageMetadata(message)">
                  {{ $t('to') }} {{ recipientLabelFor(message) }} <span aria-hidden="true">⌄</span>
                </button>
                <div v-if="isMetadataOpen(message)" class="message-details">
                  <div><b>{{ $t('from') }}</b><span>{{ message.from.name || '—' }} &lt;{{ message.from.email || '—' }}&gt;</span></div>
                  <div><b>{{ $t('recipient') }}</b><span>{{ recipientLabelFor(message) }}</span></div>
                  <div v-if="formatAddressList(message.cc)"><b>Cc</b><span>{{ formatAddressList(message.cc) }}</span></div>
                  <div v-if="formatAddressList(message.bcc)"><b>Bcc</b><span>{{ formatAddressList(message.bcc) }}</span></div>
                </div>
              </div>
              <time class="message-date">{{ formatDetailDate(message.date) }}</time>
              <button
                  v-if="message.emailId && !message.isMine"
                  class="message-star"
                  type="button"
                  :aria-label="message.isStar ? 'Unstar' : 'Star'"
                  @click.stop="changeStar(message)"
              >
                <Icon v-if="message.isStar" class="star-active-icon" icon="solar:star-bold" width="19" height="19" />
                <AppIcon v-else name="star-outline" :size="18" />
              </button>
            </header>

            <button
                v-if="!isMessageExpanded(message) && collapsedPreview(message)"
                class="message-preview"
                type="button"
                @click="toggleMessage(message)"
            >
              {{ collapsedPreview(message) }}
            </button>

            <div class="message-collapse" :class="{ 'is-open': isMessageExpanded(message) }">
              <div class="message-collapse-inner">
                <div class="message-body">
                  <el-alert v-if="message.status === 3" :closable="false" :title="toMessage(message.message)" class="email-msg" type="error" show-icon />
                  <el-alert v-if="message.status === 4" :closable="false" :title="$t('complained')" class="email-msg" type="warning" show-icon />
                  <el-alert v-if="message.status === 5" :closable="false" :title="$t('delayed')" class="email-msg" type="warning" show-icon />

                  <el-scrollbar class="htm-scrollbar" :class="!message.attachments?.length ? 'bottom-distance' : ''">
                    <ShadowHtml v-if="bodyFor(message)" class="shadow-html" :html="bodyFor(message)" />
                    <pre v-else-if="message.text" class="email-text">{{ message.text }}</pre>
                  </el-scrollbar>

                  <div class="att" v-if="message.attachments?.length > 0">
                    <div class="att-title">
                      <span>{{$t('attachments')}}</span>
                      <span>{{$t('attCount',{total: message.attachments.length})}}</span>
                    </div>
                    <div class="att-box">
                      <div class="att-item" v-for="att in message.attachments" :key="att.attId || att.key">
                        <div class="att-icon" @click="showImage(att.key)">
                          <Icon v-bind="getIconByName(att.filename)" />
                        </div>
                        <div class="att-name" @click="showImage(att.key)">
                          {{ att.filename }}
                        </div>
                        <div class="att-size">{{ formatBytes(att.size) }}</div>
                        <div class="opt-icon att-icon">
                          <Icon v-if="isImage(att.filename)" icon="hugeicons:view" width="22" height="22" @click="showImage(att.key)"/>
                          <AppIcon name="download-outline" :size="22" @click="downloadAttachment(att)" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
        <Teleport to="body" :disabled="!isMobileReader">
          <div v-if="emailStore.contentData.showReply" class="reader-bottom-actions">
            <button v-perm="'email:send'" type="button" @click="openReply"><Icon icon="solar:reply-linear" width="18" height="18" />{{ $t('reply') }}</button>
            <button v-perm="'email:send'" type="button" @click="openForward"><Icon icon="solar:forward-linear" width="18" height="18" />{{ $t('forward') }}</button>
          </div>
        </Teleport>
      </div>
    </el-scrollbar>
    <el-image-viewer
        v-if="showPreview"
        :url-list="srcList"
        show-progress
        @close="closePreview"
    />
  </div>
</template>
<script setup>
import ShadowHtml from '@/components/shadow-html/index.vue'
import {computed, reactive, ref, watch, onMounted, onUnmounted} from "vue";
import {useRouter} from 'vue-router'
import {ElMessage, ElMessageBox} from 'element-plus'
import {emailDelete, emailRead} from "@/request/email.js";
import {Icon} from "@iconify/vue";
import {useEmailStore} from "@/store/email.js";
import {useAccountStore} from "@/store/account.js";
import {formatDetailDate} from "@/utils/day.js";
import {starAdd, starCancel} from "@/request/star.js";
import {getExtName, formatBytes} from "@/utils/file-utils.js";
import {fetchPrivateAttachment, resolvePrivateMailImages} from '@/utils/private-attachments.js'
import {getIconByName} from "@/utils/icon-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {allEmailDelete} from "@/request/all-email.js";
import {useUiStore} from "@/store/ui.js";
import {useI18n} from "vue-i18n";
import {EmailUnreadEnum} from "@/enums/email-enum.js";
import SenderAvatar from '@/components/sender-avatar/index.vue'
import {buildThreadMessages} from '@/utils/mail-thread.js'

const uiStore = useUiStore();
const settingStore = useSettingStore();
const accountStore = useAccountStore();
const emailStore = useEmailStore();
const router = useRouter()
const email = computed(() => emailStore.contentData.email || {
  emailId: 0,
  attList: [],
  content: '',
  text: '',
  recipient: '[]',
})
const showPreview = ref(false)
const srcList = reactive([])

// The mobile action bar is teleported to <body> so no transformed ancestor
// (`.main-view` keeps an identity transform from its enter animation) can turn
// `position: fixed` into a containing-block-relative position.
const mobileReaderQuery = window.matchMedia('(max-width: 767px)')
const isMobileReader = ref(mobileReaderQuery.matches)

function handleMobileReaderChange(event) {
  isMobileReader.value = event.matches
}

let previewUrl = null

const { t } = useI18n()

// ---------------------------------------------------------------- conversation
// The API stores one row per message and exposes no thread endpoint, so the
// conversation is assembled from every loaded message that shares a normalised
// subject, plus anything sent from this session (see the email store).
const thread = computed(() => buildThreadMessages(
    email.value,
    Object.values(emailStore.detailMap),
    emailStore.threadMessages
))

// Per-message UI state, keyed by message id.
const expandedMessages = reactive({})
const metadataMessages = reactive({})
const renderedBodies = reactive({})
// message id -> raw content the resolved body was produced from.
const resolvedSources = {}

function isMessageExpanded(message) {
  return !!expandedMessages[message.id]
}

function toggleMessage(message) {
  expandedMessages[message.id] = !expandedMessages[message.id]
}

function isMetadataOpen(message) {
  return !!metadataMessages[message.id]
}

function toggleMessageMetadata(message) {
  metadataMessages[message.id] = !metadataMessages[message.id]
}

function recipientLabelFor(message) {
  return formatAddressList(message.recipient) || '—'
}

/** One-line teaser shown while a message is collapsed. */
function collapsedPreview(message) {
  const text = String(message.text || '').replace(/\s+/g, ' ').trim()
  return text.length > 160 ? `${text.slice(0, 160)}…` : text
}

/**
 * HTML rendered for a message.
 *
 * Falls back to the raw `content` until the async image resolution finishes, so
 * the body is never blank while (or if) resolution is pending — the reader
 * shows `email.content` exactly like it did before the thread rewrite.
 */
function bodyFor(message) {
  return renderedBodies[message.id] || message.content || ''
}

async function resolveThreadBodies() {
  const domain = settingStore.settings.r2Domain

  for (const message of thread.value.messages) {
    const source = message.content || ''

    // Nothing to render, or this exact content is already resolved.
    if (!source || resolvedSources[message.id] === source) continue

    resolvedSources[message.id] = source

    try {
      renderedBodies[message.id] = await resolvePrivateMailImages(source, domain)
    } catch (error) {
      console.error(error)
      // Keep the raw content so the message still renders.
      renderedBodies[message.id] = source
    }
  }
}

let lastThreadMessageId = ''

watch(
    // Re-run when a message joins/leaves AND when its body arrives: the list is
    // first filled with brief rows (no content), the full rows come later with
    // the same ids.
    () => thread.value.messages
        .map(message => `${message.id}:${(message.content || '').length}:${(message.text || '').length}`)
        .join('|'),
    () => {
      const messages = thread.value.messages
      const latest = messages[messages.length - 1]

      // Drop state for messages that are no longer part of the thread.
      for (const key of Object.keys(metadataMessages)) {
        if (!messages.some(message => message.id === key)) delete metadataMessages[key]
      }

      // Gmail behaviour: when the thread changes (opening a conversation, or a
      // reply just being sent) expand the newest message and collapse the rest.
      if (latest && latest.id !== lastThreadMessageId) {
        for (const key of Object.keys(expandedMessages)) delete expandedMessages[key]
        expandedMessages[latest.id] = true
        lastThreadMessageId = latest.id
      }

      resolveThreadBodies()
    },
    { immediate: true }
)

watch(() => accountStore.currentAccountId, () => {
  handleBack()
})

let readRequesting = false

function tryMarkRead() {
  if (!emailStore.contentData.showUnread || readRequesting) return
  const current = email.value
  if (!current?.emailId || current.unread !== EmailUnreadEnum.UNREAD) return

  // 等详情数据就绪（detailMap 已写入，或正文已有内容）再标已读
  const full = emailStore.detailMap[current.emailId]
  const detailReady = !!full || !!(current.content || current.text)
  if (!detailReady) return

  readRequesting = true
  const emailId = current.emailId
  current.unread = EmailUnreadEnum.READ
  if (emailStore.detailMap[emailId]) {
    emailStore.detailMap[emailId].unread = EmailUnreadEnum.READ
  }
  emailStore.markListRead(emailId)
  emailRead([emailId]).finally(() => {
    readRequesting = false
  })
}

watch(
  () => [
    email.value?.emailId,
    email.value?.content,
    email.value?.text,
    emailStore.detailMap[email.value?.emailId]
  ],
  () => tryMarkRead(),
  { flush: 'post' }
)

onMounted(() => {
  tryMarkRead()
  window.addEventListener('keydown', handleKeyDown);
  if (mobileReaderQuery.addEventListener) {
    mobileReaderQuery.addEventListener('change', handleMobileReaderChange)
  } else {
    mobileReaderQuery.addListener(handleMobileReaderChange)
  }
})

onUnmounted(() => {
  closePreview()
  emailStore.contentData.showUnread = false;
  readRequesting = false
  window.removeEventListener('keydown', handleKeyDown);
  if (mobileReaderQuery.removeEventListener) {
    mobileReaderQuery.removeEventListener('change', handleMobileReaderChange)
  } else {
    mobileReaderQuery.removeListener(handleMobileReaderChange)
  }
})

function handleKeyDown(event) {
  if (event.key !== 'Escape') return;
  if (showPreview.value) return;
  if (document.querySelector('.el-message-box')) return;
  const writeBox = document.querySelector('.write-box');
  if (writeBox && writeBox.offsetParent !== null) return;
  handleBack();
}

function openReply() {
  uiStore.writerRef.openReply(email.value)
}

function openForward() {
  uiStore.writerRef.openForward(email.value)
}

function printEmail() {
  const cleanup = () => document.body.classList.remove('nova-mail-printing')
  document.body.classList.add('nova-mail-printing')
  window.addEventListener('afterprint', cleanup, { once: true })
  window.print()
}

function toMessage(message) {
  return  message ? JSON.parse(message).message : '';
}

async function showImage(key) {
  if (!isImage(key)) return;
  try {
    const blob = await fetchPrivateAttachment(key)
    closePreview()
    previewUrl = URL.createObjectURL(blob)
    srcList.push(previewUrl)
    showPreview.value = true
  } catch {
    ElMessage.error(t('reqFailErrorMsg'))
  }
}

function closePreview() {
  showPreview.value = false
  srcList.length = 0
  if (previewUrl) URL.revokeObjectURL(previewUrl)
  previewUrl = null
}

async function downloadAttachment(att) {
  try {
    const blob = await fetchPrivateAttachment(att.key, false)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = att.filename || 'attachment'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch {
    ElMessage.error(t('reqFailErrorMsg'))
  }
}

function isImage(filename) {
  return ['png', 'jpg', 'jpeg', 'bmp', 'gif','jfif'].includes(getExtName(filename))
}

function formateReceive(recipient) {
  return formatAddressList(recipient)
}

function formatAddressList(value) {
  if (!value) return ''
  let addresses = value
  if (typeof value === 'string') {
    try { addresses = JSON.parse(value) } catch { return value }
  }
  if (!Array.isArray(addresses)) return String(addresses)
  return addresses.map(item => {
    if (typeof item === 'string') return item
    return item.name ? `${item.name} <${item.address}>` : item.address
  }).filter(Boolean).join(', ')
}

function setMessageStarState(message, value) {
  const nextValue = value ? 1 : 0
  const emailId = message.emailId

  message.isStar = nextValue

  if (emailStore.detailMap[emailId]) {
    emailStore.detailMap[emailId].isStar = nextValue
  }

  if (email.value.emailId === emailId) {
    email.value.isStar = nextValue
  }
}

function changeStar(message) {
  const target = message?.emailId ? message : email.value
  const emailId = target.emailId

  if (!emailId) return

  if (target.isStar) {
    setMessageStarState(target, 0)

    starCancel(emailId).then(() => {
      setMessageStarState(target, 0)
      emailStore.cancelStarEmailId = emailId
      setTimeout(() => {
        if (emailStore.cancelStarEmailId === emailId) {
          emailStore.cancelStarEmailId = 0
        }
      })
      emailStore.starScroll?.deleteEmail([emailId])
    }).catch((e) => {
      console.error(e)
      setMessageStarState(target, 1)
    })
  } else {
    setMessageStarState(target, 1)

    starAdd(emailId).then(() => {
      setMessageStarState(target, 1)
      emailStore.addStarEmailId = emailId
      setTimeout(() => {
        if (emailStore.addStarEmailId === emailId) {
          emailStore.addStarEmailId = 0
        }
      })
      emailStore.starScroll?.addItem(email.value.emailId === emailId ? email.value : target)
    }).catch((e) => {
      console.error(e)
      setMessageStarState(target, 0)
    })
  }
}

const handleBack = () => {
  router.back()
}

const handleDelete = () => {
  ElMessageBox.confirm(t('delEmailConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    if (emailStore.contentData.delType === 'logic') {
      emailDelete(email.value.emailId).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true,
        })
        emailStore.deleteIds = [email.value.emailId]
      })
    } else  {

      allEmailDelete(email.value.emailId).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true,
        })
        emailStore.deleteIds = [email.value.emailId]
      })
    }

    router.back()
  })
}
</script>
<style scoped lang="scss">
.box {
  height: 100%;
  overflow: hidden;
  position: relative;
  animation: nova-view-in var(--nova-motion-base) var(--nova-motion-ease) both;
}

.header-actions {
  min-height: 48px;
  padding: 7px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--nova-divider);
  font-size: 18px;
  .star {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 21px;
  }
  .icon {
    cursor: pointer;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    padding: 7px;
    transition: background-color .15s ease, transform .15s ease;
    &:hover { background: var(--base-fill); }
    &:active { transform: scale(.94); }
  }

}


.scrollbar {
  height: calc(100% - 38px);
  width: 100%;
}

.container {
  font-size: 14px;
  max-width: 1180px;
  margin: 0 auto;
  padding: 26px clamp(24px, 4vw, 54px) 44px;
  @media (max-width: 1023px) {
    padding: 20px 18px 32px;
  }

  .email-title {
    font-size: clamp(22px, 2vw, 28px);
    line-height: 1.28;
    font-weight: 700;
    letter-spacing: -.02em;
    max-width: 1100px;
    margin-bottom: 24px;
  }

  .htm-scrollbar {
  }

  .content {
    display: flex;
    flex-direction: column;

    .att {
      margin-top: 30px;
      margin-bottom: 30px;
      border: 1px solid var(--light-border-color);
      padding: 14px;
      border-radius: 10px;
      width: fit-content;
      .att-box {
        min-width: min(410px,calc(100vw - 60px));
        max-width: 600px;
        display: grid;
        gap: 12px;
        grid-template-rows: 1fr;
      }

      .att-title {
        margin-bottom: 8px;
        display: flex;
        justify-content: space-between;
        span:first-child {
          font-weight: bold;
        }
      }

      .att-item {
        cursor: pointer;
        div {
          align-self: center;
        }
        background: var(--light-ill);
        padding: 5px 7px;
        border-radius: 4px;
        align-self: start;
        display: grid;
        grid-template-columns: auto 1fr auto auto;
        .att-icon {
          display: grid;
        }

        .att-size {
          color: var(--secondary-text-color);
        }

        .att-name {
          margin-left: 8px;
          margin-right: 8px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          word-break: break-all;
        }

        .att-image {
          width: 60px;
          height: 60px;
          object-fit: contain;
        }

        .opt-icon {
          padding-left: 10px;
          color: var(--secondary-text-color);
          align-items: center;
          display: flex;
          gap: 8px;
          cursor: pointer;
          a {
            color: var(--secondary-text-color);
            align-items: center;
            display: flex;
          }
        }
      }
    }

    .email-info {
      border: 0;
      border-radius: 0;
      background: transparent;
      margin-bottom: 22px;
      padding: 0;
      @media (max-width: 1024px) {
        margin-bottom: 15px;
      }
      .date {
        color: var(--regular-text-color);
        margin: 3px 0 8px;
      }

      .email-msg {
        max-width: 400px;
        width: fit-content;
        margin-bottom: 15px;
      }

      .send {
        display: flex;
        margin-bottom: 5px;

        .send-name {
          color: var(--regular-text-color);
          display: flex;
          flex-wrap: wrap;
        }

        .send-name-title {
          padding-right: 5px;
        }
      }

      .receive {
        margin-bottom: 6px;
        display: flex;
        .receive-email {
          max-width: 700px;
          word-break: break-word;
        }
        span:nth-child(2) {
          color: var(--regular-text-color);
        }
      }

      .send-source {
        white-space: nowrap;
        font-weight: bold;
        padding-right: 10px;
      }

      .source {
        white-space: nowrap;
        font-weight: bold;
        padding-right: 10px;
      }
    }
  }
}

.message-meta {
  max-width: 1100px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 26px;
}

.sender-avatar {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
  color: var(--el-color-primary);
  background: var(--nova-selected);
  font-size: 16px;
  font-weight: 700;
  img { width: 100%; height: 100%; object-fit: cover; }
}

.sender-details { min-width: 0; flex: 1; text-align: left; }
.sender-line { display: flex; align-items: baseline; flex-wrap: wrap; gap: 5px; min-width: 0; line-height: 1.35; }
.sender-line strong { color: var(--el-text-color-primary); font-size: 15px; font-weight: 680; }
.sender-line span { color: var(--regular-text-color); font-size: 13px; overflow-wrap: anywhere; }
.recipient-toggle { display: inline-flex; align-items: center; gap: 5px; margin-top: 4px; padding: 0; color: var(--regular-text-color); font-size: 12px; cursor: pointer; text-align: left; }
.recipient-toggle:hover { color: var(--el-color-primary); }
.message-date { flex: 0 0 auto; padding-top: 2px; color: var(--regular-text-color); font-size: 12px; white-space: nowrap; }
.message-details { display: grid; gap: 4px; margin-top: 9px; padding: 9px 11px; border: 1px solid var(--nova-divider); border-radius: 8px; color: var(--regular-text-color); font-size: 12px; }
.message-details div { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 8px; }
.message-details b { color: var(--el-text-color-primary); font-weight: 600; }
.message-details span { overflow-wrap: anywhere; }

/* Conversation thread (Gmail-style message cards) -------------------------- */
.thread {
  max-width: 1100px;
  gap: 12px;
}

.thread-message {
  border: 1px solid var(--nova-divider);
  border-radius: 14px;
  background: var(--nova-surface-muted);
  overflow: hidden;
  transition:
    background-color var(--nova-motion-base) var(--nova-motion-ease),
    border-color var(--nova-motion-base) var(--nova-motion-ease);
}

.thread-message.is-expanded {
  background: var(--el-bg-color);
  border-color: var(--light-border);
}

.thread-message.is-mine.is-expanded {
  border-color: color-mix(in srgb, var(--el-color-primary) 34%, var(--nova-divider));
}

/* Newest message stands out even while collapsed. */
.thread-message.is-latest:not(.is-expanded) {
  border-color: var(--light-border);
  background: var(--el-bg-color);
}

.message-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  cursor: pointer;
  user-select: none;
}

.thread-message:not(.is-expanded) .message-head:hover {
  background: var(--nova-hover);
}

.message-head .sender-details {
  min-width: 0;
  flex: 1;
}

.message-star {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  margin-left: 2px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  opacity: .7;
  transition:
    opacity var(--nova-motion-fast) var(--nova-motion-ease),
    background-color var(--nova-motion-fast) var(--nova-motion-ease);
}

.message-star:hover {
  opacity: 1;
  background: var(--base-fill);
}

.message-star .star-active-icon {
  color: var(--el-color-primary);
}

.message-preview {
  display: block;
  width: 100%;
  padding: 0 16px 14px;
  border: 0;
  background: transparent;
  color: var(--regular-text-color);
  font-size: 13px;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Expand/collapse.
   Plain CSS `grid-template-rows: 0fr -> 1fr` instead of ElCollapseTransition:
   that component clamps the body with an inline `max-height: 0` measured from
   `scrollHeight`, which is 0 while collapsed (`.el-scrollbar` is height:100%),
   so it never animated and never cleared the clamp — leaving the body blank.
   The body is always laid out here, just clipped, so it can never get stuck. */
.message-collapse {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--nova-motion-base) var(--nova-motion-ease);
}

.message-collapse.is-open {
  grid-template-rows: 1fr;
}

.message-collapse-inner {
  overflow: hidden;
  min-height: 0;
}

.message-body {
  padding: 0 16px 18px;
}

.message-body .email-msg {
  max-width: 400px;
  width: fit-content;
  margin-bottom: 15px;
}

.message-body .att {
  margin-top: 18px;
  margin-bottom: 0;
}

/* Beat `.container .content .att`'s 30px margins inside a card. */
.thread-message .message-body .att {
  margin-top: 18px;
  margin-bottom: 0;
}

.htm-scrollbar { max-width: 1100px; overflow-x: auto; }
.email-text { max-width: 100%; overflow-wrap: anywhere; line-height: 1.65; }
.reader-bottom-actions { display: flex; gap: 10px; max-width: 1100px; padding: 28px 0 18px; }
.reader-bottom-actions button { min-height: 34px; display: inline-flex; align-items: center; gap: 7px; padding: 0 14px; color: var(--el-text-color-primary); border: 1px solid var(--light-border); border-radius: 9px; background: transparent; cursor: pointer; font-size: 13px; font-weight: 600; }
.reader-bottom-actions button:hover { background: var(--base-fill); border-color: var(--el-color-primary); }

.shadow-html::after  {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--message-block-color); /* 半透明黑色蒙层 */
  pointer-events: none; /* 不影响点击 */
}

.email-text {
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.bottom-distance {
  margin-bottom: 30px;
}

.mobile-message-actions { display: none; }

@media (max-width: 767px) {
  .scrollbar { height: calc(100% - 112px); }
  .message-meta { gap: 10px; margin-bottom: 20px; }
  .sender-avatar { width: 36px; height: 36px; flex-basis: 36px; font-size: 14px; }
  .sender-line strong { font-size: 14px; }
  .sender-line span { font-size: 12px; }
  .message-date { font-size: 11px; }

  /* Conversation cards tighten up on phones. */
  .thread { gap: 10px; }
  .thread-message { border-radius: 12px; }
  .message-head { gap: 10px; padding: 12px; }
  .message-preview { padding: 0 12px 12px; }
  .message-body { padding: 0 12px 16px; }

  /* Reserve room so the fixed action bar never covers the last lines. */
  .container { padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px)); }

  /* Gmail-style floating action bar, pinned to the viewport bottom.
     Teleported to <body>: `.main-view` keeps an identity transform from its
     enter animation, which would otherwise turn `fixed` into an ancestor-
     relative position. */
  .reader-bottom-actions {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 30;

    max-width: none;
    margin: 0;
    padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
    gap: 10px;

    background: color-mix(in srgb, var(--nova-surface) 88%, transparent);
    border-top: 1px solid var(--nova-divider);
    box-shadow: 0 -10px 28px rgba(15, 23, 42, .10);

    backdrop-filter: blur(18px) saturate(1.4);
    -webkit-backdrop-filter: blur(18px) saturate(1.4);

    animation: nova-action-bar-in var(--nova-motion-base) var(--nova-motion-ease) both;
  }

  .reader-bottom-actions button {
    flex: 1;
    justify-content: center;
    min-height: 44px;
    padding: 0 18px;
    border-radius: 999px;
    border-color: var(--nova-divider);
    background: var(--nova-surface-muted);
    font-size: 14px;
  }

  .reader-bottom-actions button:hover { background: var(--nova-hover); }
  .reader-bottom-actions button:active { transform: scale(.97); }

  :global(.dark .reader-bottom-actions) {
    box-shadow: 0 -10px 28px rgba(0, 0, 0, .34);
  }
}

@keyframes nova-action-bar-in {
  from { opacity: 0; transform: translate3d(0, 100%, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}



/* Nova reader active star */
.header-actions .star-active-icon {
  color: var(--el-color-primary) !important;
}

</style>

<style lang="scss">
@media print {
  @page { margin: 16mm; }

  body.nova-mail-printing,
  body.nova-mail-printing #app,
  body.nova-mail-printing .layout,
  body.nova-mail-printing .main-container,
  body.nova-mail-printing .el-main,
  body.nova-mail-printing .main-box-hide,
  body.nova-mail-printing .mail-reader {
    width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    background: #fff !important;
  }

  body.nova-mail-printing .aside,
  body.nova-mail-printing .el-header,
  body.nova-mail-printing .mobile-nav,
  body.nova-mail-printing .mail-reader > .header-actions,
  body.nova-mail-printing .mail-reader .reader-bottom-actions,
  body.nova-mail-printing .reader-bottom-actions,
  body.nova-mail-printing .el-image-viewer {
    display: none !important;
  }

  body.nova-mail-printing .mail-reader .el-scrollbar,
  body.nova-mail-printing .mail-reader .el-scrollbar__wrap,
  body.nova-mail-printing .mail-reader .el-scrollbar__view,
  body.nova-mail-printing .mail-reader .htm-scrollbar,
  body.nova-mail-printing .mail-reader .content-box,
  body.nova-mail-printing .mail-reader .content-html {
    width: 100% !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
  }

  body.nova-mail-printing .mail-reader .container {
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
    color: #111 !important;
  }

  body.nova-mail-printing .mail-reader .email-title { color: #111 !important; }
  body.nova-mail-printing .mail-reader .message-details { display: grid !important; color: #111 !important; }
  body.nova-mail-printing .mail-reader .recipient-toggle { display: none !important; }
  body.nova-mail-printing .mail-reader .shadow-html { zoom: 1 !important; }
  body.nova-mail-printing .mail-reader .att .opt-icon { display: none !important; }
}
</style>
