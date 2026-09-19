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
    <el-scrollbar ref="scrollRef" class="scrollbar">
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
                'is-mine': message.isMine,
                'is-new': isNewMessage(message)
              }"
          >
            <header
                class="message-head"
                :class="{ 'is-details-open': isMetadataOpen(message) }"
                @click="toggleMessage(message)"
            >
              <SenderAvatar class="message-avatar" :email="message" :size="40" />
              <div class="sender-details">
                <!-- Collapsed cards show sender name + email on ONE line; the
                     email ellipsises instead of wrapping character by character.
                     On phones the same markup is re-flowed into three grid rows
                     (see the 767px block): name | time | star, then email. -->
                <div class="sender-line">
                  <strong class="sender-name">{{ message.from.name || message.from.email || '—' }}</strong>
                  <span v-if="message.from.email" class="sender-email">&lt;{{ message.from.email }}&gt;</span>
                </div>

                <!-- Collapsed card: compact recipient line. The expanded card
                     shows the full metadata panel instead (From/To), so this is
                     hidden there to avoid repeating the same information. -->
                <div
                    v-if="!isMessageExpanded(message) && recipientLabelFor(message)"
                    class="message-recipient-preview"
                >
                  {{ $t('to') }} {{ recipientLabelFor(message) }}
                </div>

                <!-- Receiver line + header metadata only exist on the expanded
                     card: a collapsed card must not leak header metadata. -->
                <template v-if="isMessageExpanded(message)">
                  <button class="recipient-toggle" type="button" @click.stop="toggleMessageMetadata(message)">
                    {{ $t('to') }} {{ recipientLabelFor(message) }} <span aria-hidden="true">⌄</span>
                  </button>
                  <div v-if="isMetadataOpen(message)" class="message-details" @click.stop>
                    <div class="detail-row">
                      <span class="detail-label">{{ $t('from') }}</span>
                      <span class="detail-value"><span class="detail-name">{{ message.from.name || '—' }}</span> <span class="detail-email">&lt;{{ message.from.email || '—' }}&gt;</span></span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">{{ $t('recipient') }}</span>
                      <span class="detail-value"><span v-for="(address, index) in recipientPartsFor(message)" :key="index" class="detail-address">{{ address }}</span></span>
                    </div>
                    <div v-if="formatAddressList(message.cc)" class="detail-row">
                      <span class="detail-label">Cc</span>
                      <span class="detail-value"><span v-for="(address, index) in parseAddressList(message.cc)" :key="index" class="detail-address">{{ address }}</span></span>
                    </div>
                    <div v-if="formatAddressList(message.bcc)" class="detail-row">
                      <span class="detail-label">Bcc</span>
                      <span class="detail-value"><span v-for="(address, index) in parseAddressList(message.bcc)" :key="index" class="detail-address">{{ address }}</span></span>
                    </div>
                  </div>
                </template>
              </div>
              <time class="message-date">{{ messageTimeFor(message) }}</time>
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

            <!-- Collapsed body: the quote-stripped first paragraph only.
                 `message.preview` is built in utils/quoted-text.js, so quoted
                 replies, "On … wrote:" headers and forwarded history can never
                 reach this line. -->
            <button
                v-if="!isMessageExpanded(message) && collapsedPreview(message)"
                class="message-preview"
                type="button"
                @click="toggleMessage(message)"
            >
              {{ collapsedPreview(message) }}
            </button>

            <!-- Expanded body. Rendered only while the card is open, so a
                 collapsed card never contains `message.content` / quote markup. -->
            <div v-if="isMessageExpanded(message)" class="message-body">
              <el-alert v-if="message.status === 3" :closable="false" :title="toMessage(message.message)" class="email-msg" type="error" show-icon />
              <el-alert v-if="message.status === 4" :closable="false" :title="$t('complained')" class="email-msg" type="warning" show-icon />
              <el-alert v-if="message.status === 5" :closable="false" :title="$t('delayed')" class="email-msg" type="warning" show-icon />

              <el-scrollbar class="htm-scrollbar" :class="!message.attachments?.length ? 'bottom-distance' : ''">
                <!-- Remote content is opt-in. The body stays untouched until the
                     reader asks for it, so a tracking pixel never fires. -->
                <div v-if="showRemoteImagesBar(message)" class="remote-images-bar">
                  <AppIcon name="eye-off" :size="16" />
                  <span>{{ $t('imagesBlocked', { count: blockedImageCount(message) }) }}</span>
                  <button type="button" @click.stop="allowRemoteImages(message)">{{ $t('showImages') }}</button>
                </div>

                <!-- HTML path: sanitized, then rendered inside its own sandboxed
                     document. The markup never enters this DOM, so it cannot
                     reach the store, the session or LocalStorage. Quoted history
                     sits behind a collapsed Gmail-style <details> toggle. -->
                <MailHtmlFrame
                    v-if="messageBodyKind(message) === 'html'"
                    class="shadow-html"
                    :html="bodyFor(message)"
                    :allow-images="isRemoteImagesAllowed(message)"
                    :theme="uiStore.dark ? 'dark' : 'light'"
                    :title="message.subject || ''"
                    @blocked="count => setBlockedImageCount(message, count)"
                />
                <!-- Markdown path: markdown-it → sanitize → hardened links. It is
                     plain Vue markup on purpose: markdown never uses the iframe. -->
                <div v-else-if="messageBodyKind(message) === 'markdown'" class="email-text email-markdown" v-html="markdownBody(message)"></div>
                <!-- Plain-text path: same quote treatment, rendered from the parser. -->
                <div v-else-if="messageBodyKind(message) === 'plain'" class="email-text" v-html="quotedBody(message.text)"></div>
              </el-scrollbar>

              <!-- Never leave the body silently blank: show why + retry. -->
              <div v-if="messageBodyKind(message) === 'none'" class="message-empty">
                <span>{{ $t('bodyLoadFailMsg') }}</span>
                <button type="button" @click.stop="fetchPrimaryBody">{{ $t('retry') }}</button>
              </div>

              <div class="att" v-if="message.attachments?.length > 0">
                <div class="att-title">
                  <span>{{$t('attachments')}}</span>
                  <span>{{$t('attCount',{total: message.attachments.length})}}</span>
                </div>
                <div class="att-box">
                  <div class="att-item" v-for="att in message.attachments" :key="att.attId || att.key">
                    <div class="att-icon" @click="previewAttachment(att)">
                      <Icon v-bind="getIconByName(att.filename)" />
                    </div>
                    <div class="att-name" :class="{ 'is-risky': isRiskyAttachment(att) }" @click="handleAttachmentClick(att)">
                      {{ att.filename }}
                      <!-- An attachment that the OS would run is called out, not
                           silently handed over. -->
                      <span v-if="isRiskyAttachment(att)" class="att-risk" :title="attachmentRiskHint(att)">
                        ⚠ {{ attachmentRiskHint(att) }}
                      </span>
                    </div>
                    <div class="att-size">{{ formatBytes(att.size) }}</div>
                    <div class="opt-icon att-icon">
                      <Icon v-if="canPreviewAttachment(att)" icon="hugeicons:view" width="22" height="22" @click="previewAttachment(att)"/>
                      <AppIcon name="download-outline" :size="22" @click="downloadAttachment(att)" />
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
    <!-- PDF attachments: the object URL keeps the blob's application/pdf type,
         so the browser's own viewer renders it inside the frame. -->
    <el-dialog
        v-model="pdfPreview.show"
        :title="pdfPreview.name"
        class="pdf-preview-dialog"
        width="min(1040px, 94vw)"
        append-to-body
        destroy-on-close
        @closed="closePdfPreview"
    >
      <iframe
          v-if="pdfPreview.url"
          class="pdf-preview-frame"
          :src="pdfPreview.url"
          :title="pdfPreview.name"
      ></iframe>
      <template #footer>
        <a class="pdf-preview-open" :href="pdfPreview.url" target="_blank" rel="noopener">{{ $t('openInNewTab') }}</a>
        <el-button @click="closePdfPreview">{{ $t('cancel') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>
<script setup>
import MailHtmlFrame from '@/components/mail-html-frame/index.vue'
import {computed, reactive, ref, watch, nextTick, onMounted, onUnmounted} from "vue";
import {useRoute, useRouter} from 'vue-router'
import {ElMessage, ElMessageBox} from 'element-plus'
import {emailDelete, emailLatest, emailList, emailRead, emailThread} from "@/request/email.js";
import {Icon} from "@iconify/vue";
import {useEmailStore} from "@/store/email.js";
import {useAccountStore} from "@/store/account.js";
import {formatCompactDate, formatDetailDate} from "@/utils/day.js";
import {starAdd, starCancel} from "@/request/star.js";
import {getExtName, formatBytes} from "@/utils/file-utils.js";
import {fetchAttachmentBlob, fetchPrivateAttachment, resolvePrivateMailImages} from '@/utils/private-attachments.js'
import {getIconByName} from "@/utils/icon-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {allEmailDelete} from "@/request/all-email.js";
import {useUiStore} from "@/store/ui.js";
import {useI18n} from "vue-i18n";
import {EmailUnreadEnum} from "@/enums/email-enum.js";
import SenderAvatar from '@/components/sender-avatar/index.vue'
import {buildThreadMessages, threadSubjectKey} from '@/utils/mail-thread.js'
import {quotedTextToHtml, wrapHtmlQuotes} from '@/utils/quoted-text.js'
import {MAIL_BODY_TYPE, blockRemoteResources, prepareMarkdownBody} from '@/utils/mail-html.js'
import {attachmentRisk} from '@/utils/attachment-risk.js'
import {alertNewMail} from '@/utils/new-mail-alert.js'

const uiStore = useUiStore();
const settingStore = useSettingStore();
const accountStore = useAccountStore();
const emailStore = useEmailStore();
const router = useRouter()
const route = useRoute()
const email = computed(() => emailStore.contentData.email || {
  emailId: 0,
  attList: [],
  content: '',
  text: '',
  recipient: '[]',
})
const showPreview = ref(false)
const srcList = reactive([])
// PDF attachments are shown in-place, in a frame fed by an object URL.
const pdfPreview = reactive({ show: false, url: '', name: '' })
let pdfUrl = null
const scrollRef = ref(null)

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

// Label of the collapsed quoted-reply toggle (Gmail's "..." affordance).
const quoteLabel = computed(() => `… ${t('showQuotedContent')}`)

// ---------------------------------------------------------------- conversation
// The API stores one row per message and exposes no thread endpoint, so the
// conversation is assembled from every loaded message that shares a normalised
// subject, plus anything sent from this session (see the email store).
const thread = computed(() => buildThreadMessages(
    email.value,
    [...serverThread.value, ...Object.values(emailStore.detailMap)],
    emailStore.threadMessages
))

// Messages returned by `GET /email/thread`. The Inbox only carries the newest
// message of a conversation, so the reader asks the server for the whole thread
// (original + every reply, including the user's own sent replies).
const serverThread = ref([])
const threadRequesting = ref(0)

// Per-message UI state, keyed by message id.
const expandedMessages = reactive({})
const metadataMessages = reactive({})
const renderedBodies = reactive({})
// message id -> raw content the resolved body was produced from.
const resolvedSources = {}
// Fallback for a body whose async image resolution has not finished yet.
// A plain Map (not reactive) so it can be filled while rendering.
const wrappedFallback = new Map()
// message id -> true while the "just arrived" animation plays.
const arrivingIds = reactive({})

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

function isNewMessage(message) {
  return !!arrivingIds[message.id]
}

/**
 * One-line teaser shown while a message is collapsed.
 *
 * `message.preview` is produced by utils/quoted-text.js and contains the first
 * paragraph of the *new* text only: quoted replies, "On … wrote:" headers,
 * forwarded history and raw markup have already been stripped. A collapsed card
 * therefore never renders `message.content` and never shows quoted history.
 */
function collapsedPreview(message) {
  return message.preview || ''
}

// Plain-text bodies are parsed into quote-aware markup (see utils/quoted-text).
// Cached per body + label so re-renders (expand/collapse, thread updates) stay
// cheap while still following a language switch.
const quotedBodyCache = new Map()

function quotedBody(text) {
  const label = quoteLabel.value
  const key = `${label}\u0000${String(text || '')}`
  let html = quotedBodyCache.get(key)

  if (html === undefined) {
    html = quotedTextToHtml(String(text || ''), label)
    if (quotedBodyCache.size > 60) quotedBodyCache.clear()
    quotedBodyCache.set(key, html)
  }

  return html
}

/**
 * HTML rendered for a message.
 *
 * `renderedBodies` holds the image-resolved body with its quoted history moved
 * behind a collapsed `<details>` (Gmail style). Until that async pass finishes
 * the raw `content` is wrapped synchronously, so the box is never blank and
 * quotes never flash open.
 *
 * The result is handed to `MailHtmlFrame`, which sanitizes it once more and
 * renders it in a sandboxed document — it never reaches this component's DOM.
 */
function bodyFor(message) {
  const resolved = renderedBodies[message.id]
  if (resolved) return resolved

  const source = message.content || ''
  if (!source) return ''

  const label = quoteLabel.value
  const cached = wrappedFallback.get(message.id)
  if (cached && cached.source === source && cached.label === label) return cached.html

  const html = wrapHtmlQuotes(source, label)
  wrappedFallback.set(message.id, { source, label, html })
  return html
}

/**
 * Which renderer a message needs.
 *
 * `bodyType` is stored per message (see the worker's `lib/mail-body.js`); rows
 * written before that column existed have an empty value and are classified
 * from their data, where a non-empty `content` means HTML.
 *
 * @returns {'html'|'markdown'|'plain'|'none'}
 */
function messageBodyKind(message) {
  const type = message.bodyType || ''
  const hasHtml = !!String(message.content || '').trim()
  const hasText = !!String(message.text || '').trim()

  if (type === MAIL_BODY_TYPE.MARKDOWN) return hasText ? 'markdown' : 'none'
  if (type === MAIL_BODY_TYPE.PLAIN) return hasText ? 'plain' : 'none'
  if (type === MAIL_BODY_TYPE.HTML) {
    if (hasHtml) return 'html'
    return hasText ? 'plain' : 'none'
  }

  if (hasHtml) return 'html'
  if (hasText) return 'plain'
  return 'none'
}

// Markdown bodies, rendered once per body + label. A markdown body is not sent
// through the iframe; it becomes Vue-safe markup (see prepareMarkdownBody).
// A plain Map: it is filled while rendering, and the reactive inputs that make
// it stale (the quote label, the image opt-in) are read on the same path.
const markdownState = new Map()
// message id -> remote resources the sandboxed frame withheld.
const blockedImages = reactive({})
// message id -> the reader explicitly asked for remote images.
const allowedImages = reactive({})

function markdownBody(message) {
  const label = quoteLabel.value
  const source = String(message.text || '')
  const allowed = !!allowedImages[message.id]

  const cached = markdownState.get(message.id)
  if (cached && cached.label === label && cached.source === source && cached.allowed === allowed) {
    return cached.html
  }

  // Render with remote resources present, then hand them back only when the
  // reader opted in — the same contract the HTML path has inside the frame.
  const { html } = prepareMarkdownBody(source, { allowImages: true })
  const blocked = allowed ? { html, blocked: 0 } : blockRemoteResources(html)
  const state = {
    label,
    source,
    allowed,
    html: wrapHtmlQuotes(blocked.html, label),
    blocked: blocked.blocked,
  }

  markdownState.set(message.id, state)
  return state.html
}

function setBlockedImageCount(message, count) {
  blockedImages[message.id] = Number(count) || 0
}

function blockedImageCount(message) {
  return blockedImages[message.id] ?? markdownState.get(message.id)?.blocked ?? 0
}

function isRemoteImagesAllowed(message) {
  return !!allowedImages[message.id]
}

/**
 * The "show images" bar is offered only while something is actually held back.
 * HTML mail reports its own count (the sandboxed frame blocks the resources),
 * markdown is counted here; plain text has no remote content at all.
 */
function showRemoteImagesBar(message) {
  if (isRemoteImagesAllowed(message)) return false
  return blockedImageCount(message) > 0
}

function allowRemoteImages(message) {
  allowedImages[message.id] = true
}

async function resolveThreadBodies() {
  const domain = settingStore.settings.r2Domain
  const label = quoteLabel.value

  for (const message of thread.value.messages) {
    const source = message.content || ''

    // Nothing to render, or this exact content is already resolved.
    if (!source || resolvedSources[message.id] === source) continue

    resolvedSources[message.id] = source

    try {
      const resolved = await resolvePrivateMailImages(source, domain)
      renderedBodies[message.id] = wrapHtmlQuotes(resolved, label)
    } catch (error) {
      console.error(error)
      // Keep the raw content so the message still renders.
      renderedBodies[message.id] = wrapHtmlQuotes(source, label)
    }
  }
}

// A language switch changes the quote-toggle label: re-wrap every body.
watch(quoteLabel, () => {
  for (const key of Object.keys(renderedBodies)) delete renderedBodies[key]
  for (const key of Object.keys(resolvedSources)) delete resolvedSources[key]
  wrappedFallback.clear()
  quotedBodyCache.clear()
  resolveThreadBodies()
})

/**
 * Load every message of the open conversation.
 *
 * The Inbox collapses replies into their conversation, so the list no longer
 * carries the older messages. This pulls the whole thread and merges it into
 * the store; `buildThreadMessages` then renders original → reply 1 → reply 2…
 */
async function fetchThreadMessages() {
  const current = email.value
  const emailId = Number(current?.emailId) || 0

  if (!emailId) {
    serverThread.value = []
    return
  }

  threadRequesting.value = emailId

  try {
    const accountId = Number(current.accountId) || accountStore.currentAccountId
    const allReceive = accountStore.currentAccount?.allReceive
    const data = await emailThread(emailId, accountId, allReceive)

    // The reader moved to another message while this was in flight.
    if ((Number(email.value?.emailId) || 0) !== emailId) return

    const messages = Array.isArray(data?.messages) ? data.messages : []
    serverThread.value = messages

    // Adopt the server-resolved conversation key, so a message opened from a
    // list that does not carry `threadId` (e.g. starred) still groups by it.
    if (data?.threadId) {
      if (current && !current.threadId) current.threadId = data.threadId
      const stored = emailStore.detailMap[emailId]
      if (stored && !stored.threadId) stored.threadId = data.threadId
    }

    // Keep the shared caches warm so the realtime poll and other views agree.
    for (const message of messages) {
      emailStore.mergeFullEmail(message)
    }

    await nextTick()
    tryMarkRead()
  } catch (error) {
    console.error('Nova Mail: failed to load the conversation', error)
    if ((Number(email.value?.emailId) || 0) === emailId) serverThread.value = []
  } finally {
    if (threadRequesting.value === emailId) threadRequesting.value = 0
  }
}

// Opening a message (or switching conversation inside the reader) reloads the
// whole thread; the first paint uses the local pool until it arrives.
watch(
    () => Number(email.value?.emailId) || 0,
    (id, previous) => {
      if (!id || id === previous) return
      serverThread.value = []
      fetchThreadMessages()
    },
    { immediate: true }
)

/**
 * Open the conversation a system notification points at.
 *
 * A push notification carries `mail?emailId=<id>`; the reader is normally fed by
 * the Inbox (`contentData.email`), so a cold deep link has to load that message
 * itself. The thread endpoint already returns every message of the
 * conversation, so the anchor is picked out of it and the rest is merged for the
 * reader's own assembly.
 */
async function openFromNotificationLink() {
  const emailId = Number(route.query.emailId) || 0
  if (!emailId) return
  if (Number(emailStore.contentData.email?.emailId) === emailId) return

  try {
    const accountId = Number(emailStore.contentData.email?.accountId) || accountStore.currentAccountId
    const allReceive = accountStore.currentAccount?.allReceive
    const data = await emailThread(emailId, accountId, allReceive)
    const messages = Array.isArray(data?.messages) ? data.messages : []

    if (!messages.length) return

    const target = messages.find(message => Number(message.emailId) === emailId) || messages[messages.length - 1]

    for (const message of messages) {
      emailStore.mergeFullEmail(message)
    }

    // Same defaults the Inbox applies when a row is opened.
    emailStore.contentData.email = emailStore.detailMap[target.emailId] || target
    emailStore.contentData.delType = 'logic'
    emailStore.contentData.showUnread = true
    emailStore.contentData.showStar = true
    emailStore.contentData.showReply = true
  } catch (error) {
    console.error('Nova Mail: could not open the notified mail', error)
  }
}

// The reader is kept alive, so a click on another notification while it is open
// only changes the query string.
watch(() => route.query.emailId, () => openFromNotificationLink())

let lastThreadMessageId = ''

// ------------------------------------------------------- realtime thread state
// This project deploys as a Cloudflare Worker (Hono + D1) and has no Durable
// Object / WebSocket / SSE channel, so the reader uses a lightweight poll of the
// existing cursor endpoint `GET /email/latest` instead. It returns full rows
// with `emailId > cursor`; merging them into the store rebuilds `thread` and the
// new card appears without any page refresh.
const REALTIME_INTERVAL = 6000
const REALTIME_MAX_INTERVAL = 60000
const REALTIME_FIRST_DELAY = 400

let pollTimer = null
let pollDelay = REALTIME_INTERVAL
let pollCursor = 0
let pollInFlight = false
let pollStopped = true
let pollGeneration = 0

// Set right before an incoming message is merged, so the thread watcher knows
// the newest change is an arrival (and can avoid yanking the reader's scroll).
let pendingArrivalId = ''

// Dedupe sets: row id / Message-ID / timestamp signature already in the thread.
const knownIdentities = new Set()
const knownHeaderIds = new Set()

// `content` is only ever delivered by the list's background full fetch
// (`/email/list?full=1`). That request carries every email's full HTML and can
// be slow, fail, or simply not cover the opened row — in which case the reader
// used to stay blank. Fetch just the opened message on demand instead.
const bodyRequesting = ref(0)

async function fetchPrimaryBody() {
  const current = email.value
  const emailId = Number(current?.emailId) || 0

  if (!emailId) return
  if (current.content || current.text) return
  if (emailStore.detailMap[emailId]?.content) return
  if (bodyRequesting.value === emailId) return

  bodyRequesting.value = emailId

  try {
    const accountId = Number(current.accountId) || accountStore.currentAccountId
    const allReceive = accountStore.currentAccount?.allReceive
    const type = Number(current.type) || 0

    // timeSort=0 returns rows with a smaller emailId than the cursor, so
    // `emailId + 1` includes the target row itself.
    const data = await emailList(accountId, allReceive, emailId + 1, 0, 1, type, 1)
    const list = Array.isArray(data) ? data : data?.list
    const row = (list || []).find(item => Number(item.emailId) === emailId)

    if (row) {
      emailStore.mergeFullEmail(row)
    } else {
      console.warn('Nova Mail: no body returned for email', emailId)
    }
  } catch (error) {
    console.error('Nova Mail: failed to load the message body', error)
  } finally {
    bodyRequesting.value = 0
  }
}

watch(
    () => [email.value.emailId, email.value.content, email.value.text],
    () => fetchPrimaryBody(),
    { immediate: true }
)

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

      // Measured before the DOM updates: were we reading at the bottom already?
      const atBottom = isScrolledToBottom()

      // Drop state for messages that are no longer part of the thread.
      for (const key of Object.keys(metadataMessages)) {
        if (!messages.some(message => message.id === key)) delete metadataMessages[key]
      }

      // Is this change the arrival of a message we just polled in?
      const isArrival = Boolean(pendingArrivalId) && latest?.id === pendingArrivalId
      if (isArrival) pendingArrivalId = ''

      // Gmail behaviour: opening a conversation — or sending a reply — expands
      // the newest message and collapses the rest. A reply that lands while the
      // reader is up in the history is inserted without stealing the position.
      if (latest && latest.id !== lastThreadMessageId) {
        if (!isArrival || atBottom) {
          for (const key of Object.keys(expandedMessages)) delete expandedMessages[key]
          expandedMessages[latest.id] = true
        }
        lastThreadMessageId = latest.id

        // Keep the reader pinned to the bottom only when they were already there.
        if (isArrival && atBottom) nextTick(() => scrollToBottom())
      }

      resolveThreadBodies()
    },
    { immediate: true }
)

watch(() => accountStore.currentAccountId, () => {
  handleBack()
})

// ------------------------------------------------------------------ realtime
function normalizeHeaderId(value) {
  return String(value || '').trim().replace(/^<|>$/g, '')
}

/** Dedupe key: row id first, then Message-ID, then sender+timestamp+subject. */
function incomingIdentity(raw) {
  const id = Number(raw?.emailId ?? raw?.id) || 0
  if (id) return `e:${id}`

  const header = normalizeHeaderId(raw?.messageId)
  if (header) return `m:${header}`

  const time = String(raw?.createTime || raw?.date || '')
  return `t:${raw?.sendEmail || ''}|${time}|${threadSubjectKey(raw?.subject)}`
}

/**
 * True when a polled row belongs to the open conversation — either it shares
 * the normalised subject or it links into the reply graph (Message-ID /
 * In-Reply-To), which covers replies whose subject was edited.
 */
function isThreadRow(raw) {
  const messages = thread.value.messages
  if (!messages.length) return false

  const key = threadSubjectKey(email.value?.subject)
  if (key && threadSubjectKey(raw?.subject) === key) return true

  const header = normalizeHeaderId(raw?.messageId)
  const inReplyTo = normalizeHeaderId(raw?.inReplyTo)
  if (!header && !inReplyTo) return false

  return messages.some(message => {
    const messageHeader = normalizeHeaderId(message.messageId)
    const messageInReplyTo = normalizeHeaderId(message.inReplyTo)
    if (header && messageInReplyTo && header === messageInReplyTo) return true
    if (inReplyTo && messageHeader && inReplyTo === messageHeader) return true
    return false
  })
}

/** Seed the dedupe sets and the cursor from everything already in memory. */
function primeKnownState() {
  knownIdentities.clear()
  knownHeaderIds.clear()

  let cursor = pollCursor
  const rows = [
    ...thread.value.messages,
    ...Object.values(emailStore.detailMap),
    ...emailStore.threadMessages,
  ]

  for (const raw of rows) {
    if (!raw) continue

    knownIdentities.add(incomingIdentity(raw))

    const header = normalizeHeaderId(raw?.messageId)
    if (header) knownHeaderIds.add(header)

    const id = Number(raw?.emailId ?? raw?.id) || 0
    if (id > cursor) cursor = id
  }

  pollCursor = cursor
}

/** A reply that just landed in the open conversation is read on arrival. */
function markIncomingRead(raw) {
  const emailId = Number(raw?.emailId) || 0
  if (!emailId) return
  if (Number(raw.unread) !== EmailUnreadEnum.UNREAD) return

  raw.unread = EmailUnreadEnum.READ
  emailStore.markListRead(emailId)
  emailRead([emailId]).catch(() => {})
}

/**
 * Merge freshly polled rows into the thread.
 *
 * Duplicates are rejected on three levels — row id, `Message-ID` header and a
 * sender+timestamp+subject signature — so neither a repeated poll nor a
 * just-sent local reply can be inserted twice.
 */
function ingestIncoming(rows) {
  if (!rows?.length) return

  let newestId = 0
  // Email ids of everything new to this client, in this conversation or not.
  const freshIds = []

  for (const raw of rows) {
    if (!raw) continue

    const emailId = Number(raw?.emailId) || 0
    if (emailId > pollCursor) pollCursor = emailId

    const identity = incomingIdentity(raw)
    const header = normalizeHeaderId(raw?.messageId)

    if (knownIdentities.has(identity)) continue
    if (header && knownHeaderIds.has(header)) continue

    knownIdentities.add(identity)
    if (header) knownHeaderIds.add(header)

    if (emailId) freshIds.push(emailId)

    // Rows from other conversations are ignored: merging them would only bloat
    // the in-memory detail cache without ever joining this thread.
    if (!isThreadRow(raw)) continue

    emailStore.mergeFullEmail(raw)
    markIncomingRead(raw)

    const messageId = String(raw.emailId ?? raw.id)
    arrivingIds[messageId] = true
    setTimeout(() => { delete arrivingIds[messageId] }, 2600)

    if (emailId > newestId) newestId = emailId
  }

  // Announce the newest arrival to the thread watcher (auto-expand + scroll).
  if (newestId) {
    pendingArrivalId = String(newestId)
  }

  // Ring for any new mail. The reader is the only detector while a conversation
  // is open (the desktop reading pane replaces the Inbox), so limiting this to
  // the open thread would swallow every other conversation's notification.
  // Opening a conversation never reaches here: the cursor is primed to the
  // newest known message, so the first poll has nothing to ingest.
  alertNewMail(freshIds)
}

async function pollOnce() {
  if (pollStopped || pollInFlight || document.hidden) return

  const current = email.value
  if (!current?.emailId) return

  const generation = pollGeneration
  pollInFlight = true

  try {
    const accountId = Number(current.accountId) || accountStore.currentAccountId
    const allReceive = accountStore.currentAccount?.allReceive

    const data = await emailLatest(pollCursor, accountId, allReceive)

    // The view moved on (unmounted or switched account) while we were waiting.
    if (generation !== pollGeneration || pollStopped) return

    pollDelay = REALTIME_INTERVAL
    ingestIncoming(Array.isArray(data) ? data : data?.list)
  } catch (error) {
    if (error?.code === 401 || error?.code === 403) {
      stopRealtime()
      return
    }
    // Back off instead of hammering the Worker on a flaky connection.
    pollDelay = Math.min(pollDelay * 2, REALTIME_MAX_INTERVAL)
    console.error('Nova Mail: realtime thread poll failed', error)
  } finally {
    pollInFlight = false
  }
}

function schedulePoll(delay = pollDelay) {
  if (pollStopped) return
  if (pollTimer) clearTimeout(pollTimer)

  pollTimer = setTimeout(() => {
    pollTimer = null
    pollOnce().finally(() => schedulePoll())
  }, delay)
}

/** Start polling for the open conversation. */
function startRealtime() {
  if (!pollStopped) return
  pollStopped = false
  pollDelay = REALTIME_INTERVAL
  primeKnownState()
  schedulePoll(REALTIME_FIRST_DELAY)
}

/** Stop polling — called on unmount and on auth failure. */
function stopRealtime() {
  pollStopped = true
  pollGeneration++
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

function handleVisibilityChange() {
  if (pollStopped) return

  if (document.hidden) {
    // No point polling a background tab; resume on return.
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
    return
  }

  pollOnce().finally(() => schedulePoll(REALTIME_INTERVAL))
}

// Switching conversation inside the reader: reset per-thread arrival state but
// keep the global cursor so older mail is never re-fetched.
watch(() => Number(email.value?.emailId) || 0, (id, previous) => {
  if (!id || id === previous) return

  pendingArrivalId = ''
  for (const key of Object.keys(arrivingIds)) delete arrivingIds[key]

  primeKnownState()
  if (!pollStopped) schedulePoll(REALTIME_FIRST_DELAY)
})

function isScrolledToBottom() {
  const wrap = scrollRef.value?.wrapRef
  if (!wrap) return true
  return wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 96
}

function scrollToBottom() {
  const wrap = scrollRef.value?.wrapRef
  if (!wrap) return

  if (typeof scrollRef.value?.setScrollTop === 'function') {
    scrollRef.value.setScrollTop(wrap.scrollHeight, 280)
  } else {
    wrap.scrollTop = wrap.scrollHeight
  }
}

let readRequesting = false

function tryMarkRead() {
  if (!emailStore.contentData.showUnread || readRequesting) return
  const current = email.value
  if (!current?.emailId) return

  // Reading a conversation reads all of it, not just the newest message.
  const messages = thread.value.messages
  const unread = messages.filter(
      message => message.emailId && Number(message.unread) === EmailUnreadEnum.UNREAD
  )

  if (!unread.length) return

  // 等详情数据就绪（detailMap 已写入，或正文已有内容）再标已读
  const full = emailStore.detailMap[current.emailId]
  const detailReady = !!full || !!(current.content || current.text)
  if (!detailReady) return

  readRequesting = true

  const unreadIds = []

  for (const message of messages) {
    if (Number(message.unread) !== EmailUnreadEnum.UNREAD) continue

    const emailId = Number(message.emailId) || 0
    if (!emailId) continue

    unreadIds.push(emailId)
    message.unread = EmailUnreadEnum.READ
    if (emailStore.detailMap[emailId]) {
      emailStore.detailMap[emailId].unread = EmailUnreadEnum.READ
    }
    // The Inbox row is the conversation's newest message.
    emailStore.markListRead(emailId)
  }

  if (!unreadIds.length) {
    readRequesting = false
    return
  }

  emailRead(unreadIds).finally(() => {
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
  // A notification click lands straight on /mail?emailId=… with nothing in the
  // store yet; load it before anything tries to mark it read.
  openFromNotificationLink()
  tryMarkRead()
  startRealtime()
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('keydown', handleKeyDown);
  if (mobileReaderQuery.addEventListener) {
    mobileReaderQuery.addEventListener('change', handleMobileReaderChange)
  } else {
    mobileReaderQuery.addListener(handleMobileReaderChange)
  }
})

onUnmounted(() => {
  closePreview()
  closePdfPreview()
  stopRealtime()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
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
  // The PDF viewer is its own layer: Escape closes it, it must not also leave
  // the reader.
  if (pdfPreview.show) return;
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

function isPdf(att) {
  const type = String(att?.mimeType || '').toLowerCase()
  const name = String(att?.filename || '').toLowerCase()
  return type.includes('pdf') || name.endsWith('.pdf')
}

/** Images and PDFs can be shown in place; anything else downloads. */
function canPreviewAttachment(att) {
  return isImage(att?.filename) || isPdf(att)
}

/**
 * The reader's warning copy for an attachment the OS would execute.
 *
 * The reason comes from `utils/attachment-risk.js`, which looks through double
 * extensions (`invoice.pdf.exe`) — the classic way a dangerous file is made to
 * look harmless.
 */
function attachmentRiskHint(att) {
  const { reason, extension } = attachmentRisk(att)

  if (reason === 'double-extension') return t('attachmentRiskDouble', { ext: extension })
  if (reason === 'active-content') return t('attachmentRiskActive', { ext: extension })
  if (reason === 'macro') return t('attachmentRiskMacro', { ext: extension })

  return t('attachmentRiskExecutable', { ext: extension })
}

function isRiskyAttachment(att) {
  return attachmentRisk(att).risky
}

/** The attachment name opens a preview when there is one, and downloads otherwise. */
function handleAttachmentClick(att) {
  if (canPreviewAttachment(att)) {
    previewAttachment(att)
    return
  }

  downloadAttachment(att)
}

/**
 * Download one attachment, after confirming a type the OS would run.
 *
 * The confirmation is deliberately a hard stop rather than a silent download:
 * "invoice.pdf.exe" arrives from strangers and is only dangerous once opened.
 */
async function downloadAttachment(att) {
  if (isRiskyAttachment(att)) {
    try {
      await ElMessageBox.confirm(
        `${attachmentRiskHint(att)}\n${att.filename || ''}`,
        t('attachmentRiskTitle'),
        {
          type: 'warning',
          confirmButtonText: t('download'),
          cancelButtonText: t('cancel'),
          customClass: 'attachment-risk-confirm'
        }
      )
    } catch {
      return
    }
  }

  try {
    const blob = await fetchAttachmentBlob(att.attId)
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

/**
 * Preview one attachment.
 *
 * Reads the bytes from `GET /api/attachments/<attId>` (the server returns the
 * real content type), turns them into an object URL and then either hands it to
 * the existing image viewer or to the PDF frame. The attachment list markup is
 * unchanged.
 */
async function previewAttachment(att) {
  const attId = Number(att?.attId) || 0
  if (!attId || !canPreviewAttachment(att)) return

  try {
    const blob = await fetchAttachmentBlob(attId)

    if (isPdf(att)) {
      openPdfPreview(URL.createObjectURL(blob), att.filename)
      return
    }

    closePreview()
    previewUrl = URL.createObjectURL(blob)
    srcList.push(previewUrl)
    showPreview.value = true
  } catch (error) {
    console.error('Nova Mail: attachment preview failed', error)
    ElMessage.error(t('reqFailErrorMsg'))
  }
}

function openPdfPreview(url, filename) {
  closePdfPreview()
  pdfUrl = url
  pdfPreview.url = url
  pdfPreview.name = filename || 'PDF'
  pdfPreview.show = true
}

function closePdfPreview() {
  pdfPreview.show = false
  pdfPreview.url = ''
  if (pdfUrl) URL.revokeObjectURL(pdfUrl)
  pdfUrl = null
}

function isImage(filename) {
  return ['png', 'jpg', 'jpeg', 'bmp', 'gif','jfif'].includes(getExtName(filename))
}

function formateReceive(recipient) {
  return formatAddressList(recipient)
}

/**
 * Parse a recipient/cc/bcc field into display strings.
 *
 * Presentation-only helper around the same parsing `formatAddressList` always
 * did; the metadata rows need the individual addresses so each one can stay on
 * a single line (nowrap + ellipsis) instead of breaking apart.
 */
function parseAddressList(value) {
  if (!value) return []
  let addresses = value
  if (typeof value === 'string') {
    try { addresses = JSON.parse(value) } catch { return [value] }
  }
  if (!Array.isArray(addresses)) return [String(addresses)]
  return addresses.map(item => {
    if (typeof item === 'string') return item
    return item.name ? `${item.name} <${item.address}>` : item.address
  }).filter(Boolean)
}

function formatAddressList(value) {
  return parseAddressList(value).join(', ')
}

/** Address parts for the metadata "To" row, keeping the `—` empty fallback. */
function recipientPartsFor(message) {
  const parts = parseAddressList(message?.recipient)
  return parts.length ? parts : ['—']
}

/**
 * Header timestamp. Phones get the compact clock/date ("7:37 AM" / "Sep 19");
 * desktop keeps the full `formatDetailDate` string untouched.
 */
function messageTimeFor(message) {
  return isMobileReader.value
      ? formatCompactDate(message.date)
      : formatDetailDate(message.date)
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

/* Sender block. The avatar must never be compressed and the sender name +
   email must stay on ONE line, ellipsising instead of wrapping the address
   character by character on a narrow phone. */
.sender-details {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-align: left;
}

.sender-line {
  display: flex;
  align-items: baseline;
  flex-wrap: nowrap;
  gap: 5px;
  min-width: 0;
  line-height: 1.35;
}

.sender-line .sender-name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--el-text-color-primary);
  font-size: 15px;
  font-weight: 680;
}

.sender-line .sender-email {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--regular-text-color);
  font-size: 13px;
}

/* Collapsed-card recipient line ("To …"). Hidden once the card is expanded,
   where the metadata panel owns From/To. */
.message-recipient-preview {
  margin-top: 6px;
  min-width: 0;
  max-width: 100%;
  color: var(--secondary-text-color);
  font-size: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recipient-toggle { display: inline-flex; align-items: center; gap: 5px; margin-top: 4px; padding: 0; color: var(--regular-text-color); font-size: 12px; cursor: pointer; text-align: left; min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recipient-toggle:hover { color: var(--el-color-primary); }
.message-date { flex: 0 0 auto; margin-left: auto; padding-top: 2px; color: var(--regular-text-color); font-size: 12px; white-space: nowrap; }

/* Expanded header metadata: fixed label column, adaptive value column.
   `overflow-wrap: anywhere` lets a long address break inside itself instead of
   collapsing to one character per line; `min-width: 0` on every level keeps the
   value column from being pushed out by the label. */
.message-details {
  display: grid;
  gap: 4px;
  width: 100%;
  min-width: 0;
  margin-top: 9px;
  padding: 9px 11px;
  border: 1px solid var(--nova-divider);
  border-radius: 8px;
  color: var(--regular-text-color);
  font-size: 12px;
  box-sizing: border-box;
}

.message-details .detail-row {
  display: grid;
  grid-template-columns: 56px minmax(120px, 1fr);
  gap: 8px;
  align-items: baseline;
  min-width: 0;
}

.message-details .detail-label {
  color: var(--el-text-color-primary);
  font-weight: 600;
  white-space: nowrap;
}

.message-details .detail-value {
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* Address lists are rendered one <span> per recipient so each address can be
   kept on a single line on phones. The separator reproduces the exact
   `a, b` text the joined string used to render. */
.message-details .detail-address:not(:last-child)::after {
  content: ', ';
}

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
  min-width: 0;
}

/* The avatar is a fixed-size flex item: it must never be squeezed by a long
   address next to it. */
.message-head .message-avatar {
  flex: 0 0 auto;
  align-self: flex-start;
}

.thread-message:not(.is-expanded) .message-head:hover {
  background: var(--nova-hover);
}

.message-head .sender-details {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
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

/* Collapsed cards render NO body markup at all (`v-if`), so there is nothing to
   clip or animate shut; only the opening gets a short entrance. This is what
   keeps quoted replies and raw HTML out of the collapsed DOM. */
.message-body {
  padding: 0 16px 18px;
  animation: nova-message-open var(--nova-motion-base) var(--nova-motion-ease) both;
}

@keyframes nova-message-open {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* A message that arrived through realtime polling fades in with a soft ring,
   then settles into the normal card. */
.thread-message.is-new {
  animation: nova-message-arrive 2.4s var(--nova-motion-ease) both;
}

@keyframes nova-message-arrive {
  0% {
    opacity: 0;
    transform: translateY(-8px);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--el-color-primary) 45%, transparent);
    background: color-mix(in srgb, var(--el-color-primary) 10%, var(--el-bg-color));
  }
  18% {
    opacity: 1;
    transform: translateY(0);
  }
  70% {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--el-color-primary) 22%, transparent);
    background: color-mix(in srgb, var(--el-color-primary) 5%, var(--el-bg-color));
  }
  100% {
    box-shadow: none;
    background: var(--el-bg-color);
  }
}

@media (prefers-reduced-motion: reduce) {
  .message-body,
  .thread-message.is-new {
    animation: none;
  }
}

/* Body failed / not returned: explain + retry instead of a blank area. */
.message-empty {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 0 2px;
  color: var(--regular-text-color);
  font-size: 13px;
}

.message-empty button {
  padding: 4px 12px;
  border: 1px solid var(--light-border);
  border-radius: 999px;
  background: var(--nova-surface-muted);
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.message-empty button:hover {
  background: var(--nova-hover);
  border-color: var(--el-color-primary);
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

/* Remote content is held back until the reader asks for it, so a tracking pixel
   never fires just because a message was opened. */
.remote-images-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  max-width: 1100px;
  margin: 0 0 14px;
  padding: 8px 12px;
  border: 1px solid var(--light-border);
  border-radius: 10px;
  background: var(--base-fill);
  color: var(--regular-text-color);
  font-size: 13px;
}

.remote-images-bar button {
  min-height: 28px;
  padding: 0 12px;
  margin-left: auto;
  color: var(--el-color-primary);
  border: 1px solid var(--light-border);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

.remote-images-bar button:hover {
  border-color: var(--el-color-primary);
}

/* An attachment the operating system would run is marked in the list, not only
   in the download confirmation. */
.att-name.is-risky {
  color: var(--el-color-warning);
}

.att-risk {
  display: block;
  margin-top: 2px;
  color: var(--el-color-warning);
  font-size: 12px;
  line-height: 1.35;
}

.email-text {
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

/* Markdown renders real block markup, so its own source newlines must collapse
   instead of turning into blank lines the way the plain-text path needs. */
.email-text.email-markdown {
  white-space: normal;
  line-height: 1.65;
}

.email-text.email-markdown :deep(table) {
  border-collapse: collapse;
  max-width: 100%;
}

.email-text.email-markdown :deep(th),
.email-text.email-markdown :deep(td) {
  border: 1px solid var(--light-border);
  padding: 4px 8px;
}

.email-text.email-markdown :deep(pre) {
  max-width: 100%;
  padding: 10px 12px;
  overflow-x: auto;
  border-radius: 8px;
  background: var(--base-fill);
  white-space: pre;
}

.email-text.email-markdown :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
}

.email-text.email-markdown :deep(img) {
  max-width: 100%;
  height: auto;
}

.email-text.email-markdown :deep(a) {
  color: var(--el-color-primary);
  word-break: break-all;
}

.email-text.email-markdown :deep(blockquote) {
  margin: 6px 0 0 8px;
  padding-left: 12px;
  border-left: 2px solid var(--nova-quote-line);
  color: var(--regular-text-color);
}

/* Gmail-style quoted-reply hierarchy for plain-text bodies. Same idea as the
   `blockquote` rules in the HTML (ShadowHtml) path: every level owns its line,
   nesting accumulates on its own, and the line spans that level's content.
   `:deep()` is required because this markup comes from `v-html`. */
.email-text :deep(.quote-block) {
  margin: 6px 0 0 8px;
  padding-left: 12px;
  border-left: 2px solid var(--nova-quote-line);
}

.email-text :deep(.quote-header) {
  color: var(--regular-text-color);
}

/* Quoted history collapsed by default: "... 显示引用内容", click to expand. */
.email-text :deep(.quote-toggle) {
  margin-top: 10px;
}

.email-text :deep(.quote-toggle-summary) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  color: var(--regular-text-color);
  font-size: 13px;
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.email-text :deep(.quote-toggle-summary)::-webkit-details-marker {
  display: none;
}

.email-text :deep(.quote-toggle-summary)::marker {
  content: '';
}

.email-text :deep(.quote-toggle-summary:hover) {
  color: var(--el-color-primary);
}

.email-text :deep(.quote-toggle[open] > .quote-toggle-summary) {
  margin-bottom: 6px;
}

.email-text :deep(.quote-content) {
  display: block;
}

@media (max-width: 767px) {
  .email-text :deep(.quote-block) {
    margin-left: 4px;
    padding-left: 8px;
  }
}

.bottom-distance {
  margin-bottom: 30px;
}

.mobile-message-actions { display: none; }

@media (max-width: 767px) {
  .scrollbar { height: calc(100% - 112px); }
  .message-meta { gap: 10px; margin-bottom: 20px; }
  .sender-avatar { width: 36px; height: 36px; flex-basis: 36px; font-size: 14px; }

  /* ---- Message header: Gmail-style rows ----------------------------------
     Row 1: avatar | sender name | compact time | star
     Row 2:          | sender address
     Row 3:          | "To …" line (or the metadata box when it is open)

     The address no longer competes with the name for the first row, so the
     name gets every pixel the time and star do not need.

     `display: contents` drops the desktop wrappers (`.sender-details`,
     `.sender-line`) out of the box tree so their children become grid items.
     It is scoped to this media query: desktop keeps its flex layout. */
  .message-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    column-gap: 10px;
    row-gap: 2px;
    align-items: center;
    padding: 12px;
  }

  .message-head .message-avatar {
    grid-column: 1;
    grid-row: 1 / span 2;
    align-self: start;
    justify-self: start;
  }

  .message-head .sender-details,
  .message-head .sender-line {
    display: contents;
  }

  .message-head .sender-name {
    grid-column: 2;
    grid-row: 1;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 14px;
  }

  .message-head .message-date {
    grid-column: 3;
    grid-row: 1;
    margin-left: 0;
    padding-top: 0;
    font-size: 12px;
    white-space: nowrap;
  }

  .message-head .message-star {
    grid-column: 4;
    grid-row: 1;
    margin-left: 0;
  }

  .message-head .sender-email {
    grid-column: 2 / 5;
    grid-row: 2;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 12px;
  }

  .message-head .recipient-toggle {
    grid-column: 2 / 5;
    grid-row: 3;
    margin-top: 4px;
    max-width: 100%;
  }

  /* Row 3 while collapsed. The expanded card swaps in the recipient-toggle /
     metadata panel, which occupy the same grid cell. */
  .message-head .message-recipient-preview {
    grid-column: 2 / 5;
    grid-row: 3;
    margin-top: 4px;
    font-size: 12px;
  }

  .message-head .message-details {
    grid-column: 2 / 5;
    grid-row: 3;
    margin-top: 8px;
  }

  /* Once the details box is open it owns From/To, so the header's duplicate
     "To …" line is hidden. Class-only: the rule lives in this media query, so
     desktop markup/behaviour is untouched. */
  .message-head.is-details-open .recipient-toggle {
    display: none;
  }

  /* ---- Metadata box: fixed label column, adaptive value column ----------
     `normal` wrapping keeps addresses intact; each address is nowrap with an
     ellipsis, so nothing is ever split one or two characters per line. */
  .message-details {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    padding: 8px 9px;
  }

  .message-details .detail-row {
    grid-template-columns: 54px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
  }

  .message-details .detail-label {
    white-space: nowrap;
  }

  .message-details .detail-value {
    min-width: 0;
    word-break: normal;
    overflow-wrap: normal;
  }

  .message-details .detail-name,
  .message-details .detail-email,
  .message-details .detail-address {
    display: inline-block;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ---- Body spacing: never glued to the header --------------------------
     The expanded header drops its bottom padding so `margin-top: 16px` is the
     real gap between the To line / metadata box and the body. */
  .thread-message.is-expanded .message-head {
    padding-bottom: 0;
  }

  .message-body {
    margin-top: 16px;
    padding: 0 12px 16px;
  }

  /* Conversation cards tighten up on phones. */
  .thread { gap: 10px; }
  .thread-message { border-radius: 12px; }
  .message-preview { padding: 0 12px 12px; }

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

/* PDF attachment preview: the object URL carries the blob's application/pdf
   type, so the browser's built-in viewer fills the frame. */
.pdf-preview-frame {
  width: 100%;
  height: min(70vh, 720px);
  border: 0;
  background: var(--el-bg-color);
}

.pdf-preview-open {
  margin-right: 12px;
  color: var(--el-color-primary);
  font-size: 13px;
  text-decoration: none;
}

.pdf-preview-open:hover {
  text-decoration: underline;
}

@media (max-width: 767px) {
  .pdf-preview-frame { height: 68vh; }
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
  /* The body lives in a sandboxed iframe now: it is a pane of its own, so it
     must be allowed to print at its full measured height. */
  body.nova-mail-printing .mail-reader .shadow-html { overflow: visible !important; }
  body.nova-mail-printing .mail-reader .att .opt-icon { display: none !important; }
}
</style>
