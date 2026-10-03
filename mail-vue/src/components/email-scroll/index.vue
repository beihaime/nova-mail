<template>
  <div
      class="email-container"
      :class="{
        'mobile-selecting': mobileSelecting,
        'mobile-toolbar-visible': mobileSelecting && selectedCount > 0
      }"
  >
    <div v-if="isPhone" class="mobile-inbox-tools">
      <div class="mobile-search-row">
        <label v-if="type === 'email'" class="mobile-search">
          <AppIcon name="search" :size="18" />
          <input
              v-model.trim="mobileSearchInput"
              type="search"
              :placeholder="t('searchShort')"
              :aria-label="t('searchShort')"
              @keydown.esc="mobileSearchInput = ''"
          />
          <button
              v-if="mobileSearchInput"
              class="mobile-search-clear"
              type="button"
              :aria-label="t('clearSearch')"
              @click="mobileSearchInput = ''"
          >×</button>
        </label>

        <!-- Sort + multi-select live beside the search field so the filter bar
             below can hand all four filters an equal share of the full row
             width instead of splitting it with an action group. -->
        <div class="mobile-filter-actions">
          <MailSortButton mobile :time-sort="timeSort" @toggle="mobileSortClick" />

          <button
              class="mobile-tool-button nova-mobile-icon-button"
              :aria-label="mobileSelecting ? t('cancel') : t('multiSelect')"
              @click="toggleMobileSelection"
          >
            <Icon icon="solar:menu-dots-bold" width="21" height="21" />
          </button>
        </div>
      </div>

      <div v-if="type === 'email'" class="mobile-filter-bar">
        <!-- Four equal cells that together fill the row: every chip owns the
             same width and centres its own content, so the group reads as one
             balanced segmented control rather than four ragged pills. All four
             are text-only, so no chip carries more visual weight than another. -->
        <div class="mobile-filters">
          <button
              v-for="filter in mobileFilters"
              :key="filter.key"
              class="nova-segmented-button"
              :class="{ active: mobileFilter === filter.key }"
              @click="selectMobileFilter(filter.key)"
          >
            <span class="mobile-filter-label">{{ filter.label }}</span>
          </button>
        </div>
      </div>
    </div>

    <div
        v-if="!isPhone || (mobileSelecting && selectedCount > 0)"
        class="header-actions"
    >
      <el-checkbox
          v-model="checkAll"
          class="mail-check-column"
          :indeterminate="isIndeterminate"
          :disabled="!emailList.length || loading"
          @change="handleCheckAllChange"
      >
      </el-checkbox>
      <div class="header-left" :style="'padding-left:' + actionLeft">

        <div class="selection-slot"><slot name="first"></slot></div>
        <template v-if="getSelectedMailsIds().length > 0">
          <el-tooltip v-if="selectionActions.archive" effect="dark" :content="t('archive')" :show-after="1200">
            <button
                v-perm="'email:delete'"
                class="nova-icon-button nova-toolbar-button selection-action"
                type="button"
                :aria-label="t('archive')"
                @click="handleArchive"
            >
              <AppIcon name="nova-sidebar-archive" :size="20" inline />
            </button>
          </el-tooltip>
          <el-tooltip v-if="selectionActions.trash || selectionActions.permanentDelete" v-perm="'email:delete'" effect="dark" :content="selectionActions.permanentDelete ? t('deleteForever') : t('delete')" :show-after="1200">
            <button
                class="nova-icon-button nova-toolbar-button nova-danger-button selection-action"
                type="button"
                :aria-label="t('delete')"
                @click="handleDelete"
            >
              <AppIcon name="nova-sidebar-trash" :size="20" inline />
            </button>
          </el-tooltip>
        </template>
      </div>

      <div class="header-right">
        <MailSortButton
            v-if="type === 'email' && !isPhone"
            :time-sort="timeSort"
            @toggle="mobileSortClick"
        />
        <span class="email-count" v-if="total">{{ $t('emailCount', {total: total}) }}</span>
        <AppIcon v-if="showAccountIcon" class="more-icon icon" name="more-vertical" :size="18"
              @click="changeAccountShow"/>
      </div>
    </div>

    <div ref="scroll" class="scroll">
      <div
          v-if="type === 'email' &&
                isPhone &&
                !loading &&
                emailList.length &&
                !visibleList.some(item => !item.expand)"
          class="mobile-filter-empty"
      >
        {{
          mobileFilter === 'attachments' && !attachmentDataReady
            ? $t('checkingAttachments')
            : $t('noMessagesFound')
        }}
      </div>
      <UseVirtualList ref="scrollbarRef"
                        @scroll="onScroll"
                        :list="visibleList"
                        :options="{ itemHeight: itemHeight, overscan: 15 }"
                        class="virtual"
                        style="height: 100%"
                        v-if="!loading && emailList.length > 0"
                        :key="keyCount"
        >
          <template #default="{ data: item, index }" >
            <div v-if="!item.expand"
                 :key="item.emailId"
                 class="swipe-shell"
            >
              <!-- Action layer. It sits *under* the card (the card is opaque and
                   later in the DOM), so it is only visible where the card has
                   been dragged away. Never receives pointer input itself, and is
                   only built where the gesture is actually available. -->
              <div v-if="props.type === 'email' && swipeActionsReady" class="swipe-actions" aria-hidden="true">
                <div class="swipe-action swipe-action-archive">
                  <AppIcon name="nova-sidebar-archive" :size="22" inline />
                  <span>{{ t('archive') }}</span>
                </div>
                <div class="swipe-action swipe-action-delete">
                  <AppIcon name="nova-sidebar-trash" :size="22" inline />
                  <span>{{ t('delete') }}</span>
                </div>
              </div>
              <div :class="['email-row', props.type, {
                    'keyboard-focused': keyboardFocusedId === item.emailId,
                    'right-checked': item.rightChecked,
                    'is-unread': item.unread === EmailUnreadEnum.UNREAD && showUnread
                  }]"
                   :data-checked="item.checked"
                   :data-email-id="item.emailId"
                   @click="jumpDetails(item, $event)"
                   @click.capture="onRowClickCapture"
                   @contextmenu="handleContextmenu($event, item)"
                   @pointerdown="onRowPointerDown($event, item)"
                   @pointermove="onRowPointerMove"
                   @pointerup="onRowPointerUp"
                   @pointerleave="onRowPointerLeave"
                   @pointercancel="onRowPointerCancel"
              >
              <el-checkbox :class="['mail-check-column', props.type === 'all-email' ? 'all-email-checkbox' : 'checkbox']"
                           v-model="item.checked"
                           :disabled="!item.checked && isSelectMax"
                           @click.stop></el-checkbox>
              <el-tooltip v-if="showStar" effect="dark" :content="item.isStar ? t('unstar') : t('star')" :show-after="2000">
                <button
                    class="nova-icon-button pc-star"
                    type="button"
                    :aria-label="item.isStar ? t('unstar') : t('star')"
                    @click.stop="starChange(item)"
                >
                  <Icon
                      :class="['nova-star-icon', 'inbox-star-icon', { 'is-active': item.isStar }]"
                      :icon="item.isStar ? 'solar:star-bold' : 'solar:star-linear'"
                      width="18"
                      height="18"
                  />
                </button>
              </el-tooltip>
              <div v-if="!showStar"></div>
              <SenderAvatar
                  v-if="type === 'email' && isPhone"
                  class="mobile-sender-avatar"
                  :email="item"
                  :size="40"
              />
              <div class="title" :class="accountShow ? 'title-column' : 'title-column'">

                <div class="email-sender" :style=" (showStatus ? 'gap: 10px;' : '') + ((item.unread === EmailUnreadEnum.UNREAD && showUnread)  ? 'font-weight: bold' : '')">
                  <div class="email-status" v-if="showStatus">
                    <el-tooltip effect="dark" :content="item.statusIcon.content">
                      <Icon :icon="item.statusIcon.icon" :style="`color: ${item.statusIcon.color}`" width="20" height="20"/>
                    </el-tooltip>
                    <div class="del-status" v-if="item.isDel">
                      <el-tooltip effect="dark" :content="item.isDelContent">
                        <Icon class="icon" icon="mdi:email-remove" width="20" height="20"/>
                      </el-tooltip>
                    </div>
                  </div>
                  <div v-else></div>
                  <span class="name">
                    <span>
                      <SenderAvatar v-if="!isPhone" :email="item" :size="28" />
                      <slot name="name" :email="item"> {{ item.name }}</slot>
                    </span>
                  </span>
                  <span class="phone-time">
                    <span>{{ listClock(item) }}</span>
                    <span v-if="item.unread === EmailUnreadEnum.UNREAD && showUnread" class="unread-dot" aria-label="Unread" />
                  </span>
                </div>
                <div>
                  <div class="email-text">
                    <span class="email-subject" :style="(item.unread === EmailUnreadEnum.UNREAD && showUnread)  ? 'font-weight: bold' : ''">
                      <span v-if="item.code" class="code-tag" @click.stop="copyCode(item.code)">[{{ t('codeLabel') }}{{ item.code }}]</span>
                      <span class="subject-text">
                        <slot name="subject" :email="item" >
                          {{ item.subject || '\u200B' }}
                        </slot>
                      </span>
                    </span>
                    <!-- Keep list previews sourced from the list payload only.  The
                         detail `text` field is populated when a message is opened
                         and must never leak back into a row. -->
                    <span v-if="listPreview(item)" class="email-content">{{ listPreview(item) }}</span>
                  </div>

                  <div class="user-info" v-if="showUserInfo">
                    <div class="user">
                      <span>
                        <Icon icon="mynaui:user" width="20" height="20"/>
                      </span>
                      <span>{{ item.userEmail }}</span>
                    </div>
                    <div class="account">
                      <span>
                        <Icon icon="mdi-light:email" width="20" height="20"/>
                      </span>
                      <span>{{ item.type === 0 ? item.toEmail : item.sendEmail }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="email-right" :style="showUserInfo ? 'align-self: start;':''">
                <span class="email-time-meta">
                  <span class="email-time">{{ listClock(item) }}</span>
                  <span v-if="item.unread === EmailUnreadEnum.UNREAD && showUnread" class="unread-dot" aria-label="Unread" />
                </span>
              </div>
            </div>
            </div>
            <skeletonBlock v-else-if="item.expand === 'loading'"
                           :rows="1"
                           :showStar="showStar"
                           :accountShow="accountShow"
                           :showStatus="showStatus"
                           :showUserInfo="showUserInfo"
                           :type="type"/>
            <div class="noLoading" v-else-if="item.expand === 'noMoreData'">
              <div>{{ $t('noMoreData') }}</div>
            </div>
          </template>
        </UseVirtualList>
      <skeletonBlock v-if="firstLoad && showFirstLoading"
                       :rows="20"
                       :showStar="showStar"
                       :accountShow="accountShow"
                       :showStatus="showStatus"
                       :showUserInfo="showUserInfo"
                       :type="type"/>
      <skeletonBlock v-if="loading"
                       :rows="skeletonRows"
                       :showStar="showStar"
                       :accountShow="accountShow"
                       :showStatus="showStatus"
                       :showUserInfo="showUserInfo"
                       :type="type"/>
      <div class="empty" v-if="noLoading && emailList.length === 0 && !loading">
        <el-empty :image-size="isMobile ? 120 : null" :description="$t(loadError ? 'searchFailed' : (props.searching ? 'noSearchResults' : 'noMessagesFound'))"/>
      </div>
    </div>
    <el-dropdown
        ref="dropdownRef"
        @visible-change="visibleChange"
        :virtual-ref="triggerRef"
        :show-arrow="false"
        :popper-options="{
      modifiers: [{ name: 'offset', options: { offset: [0, 0] } }],
    }"
        virtual-triggering
        trigger="contextmenu"
        placement="bottom-start"
    >
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item v-if="rightClickEmail.code" @click="copyCode(rightClickEmail.code)" >
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="fluent-color:clipboard-24" width="20" height="20" />
                <span>{{t('copyCode')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email'].includes(props.type)" @click="emailRead(rightClickEmail.emailId)" >
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="fluent:mail-read-20-regular" width="20" height="20" />
                <span>{{t('markAsRead')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','star'].includes(props.type)" @click="openReply(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="la:reply" width="20" height="20"  />
                <span>{{t('reply')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','send', 'star'].includes(props.type)" @click="openForward(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:arrow-up-right" width="19" height="19"  />
                <span>{{t('forward')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','send', 'star'].includes(props.type)" @click="starChange(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon
                    :class="['nova-star-icon', { 'is-active': rightClickEmail.isStar }]"
                    :icon="rightClickEmail.isStar ? 'solar:star-bold' : 'solar:star-linear'"
                    width="18"
                    height="18"
                />
                <span>{{ rightClickEmail.isStar ? t('unstar') : t('star') }}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'all-email'" @click="handleSearch('user', rightClickEmail.userEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:search" width="20" height="20" />
                <span>{{t('searchUser')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'all-email' " @click="handleSearch('account', rightClickEmail.toEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:search" width="20" height="20" />
                <span>{{t('searchEmail')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'all-email' " @click="handleSearch('name', rightClickEmail.name)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:search" width="20" height="20" />
                <span>{{t('searchSender')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item @click="rightDelete(rightClickEmail.emailId)">
            <template #default>
              <div class="right-dropdown-item">
                <AppIcon name="nova-sidebar-trash" :size="18" inline />
                <span>{{t('delete')}}</span>
              </div>
            </template>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup>
import {Icon} from "@iconify/vue";
import skeletonBlock from "@/components/email-scroll/skeleton/index.vue"
import {computed, onActivated, reactive, ref, watch, nextTick, onMounted, onUnmounted } from "vue";
import {useEmailStore} from "@/store/email.js";
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
import {sleep} from "@/utils/time-utils.js"
import {formatListClock} from "@/utils/day.js";
import {useI18n} from "vue-i18n";
import {EmailUnreadEnum} from "@/enums/email-enum.js";
import { UseVirtualList } from '@vueuse/components'
import { useScroll } from '@vueuse/core'
import SenderAvatar from '@/components/sender-avatar/index.vue'
import MailSortButton from '@/components/mail-sort-button/index.vue'
import { MAIL_BODY_TYPE, unwrapNestedMessage, looksLikeMarkdownDocument } from '@/utils/mail-html.js'
import { stripMarkdown } from '@/utils/quoted-text.js'
import { nextPageCursor, isLastPage, canRequestPage } from '@/utils/mail-pagination.js'
import {
  SWIPE_ACTION,
  SWIPE_AXIS,
  SWIPE_UNDO_MS,
  clampSwipeOffset,
  resolveSwipeAxis,
  resolveSwipeRelease,
  swipeActionForOffset,
  swipeCommitDistance,
} from '@/utils/swipe-actions.js'
import { showUndoSnackbar } from '@/utils/undo-snackbar.js'

const props = defineProps({
  getEmailList: Function,
  emailDelete: Function,
  emailUnread: Function,
  emailRead: Function,
  // Mobile swipe actions. Optional: without them the gesture stays disabled, so
  // the other lists (Sent, Starred, drafts) keep their current behaviour.
  emailArchive: Function,
  emailUnarchive: Function,
  emailRestore: Function,
  deleteConfirmText: {
    type: String,
    default: ''
  },
  deleteSuccessText: {
    type: String,
    default: ''
  },
  starAdd: Function,
  starCancel: Function,
  cancelSuccess: Function,
  starSuccess: Function,
  actionLeft: {
    type: String,
    default: '0'
  },
  timeSort: {
    type: Number,
    default: 0,
  },
  showStatus: {
    type: Boolean,
    default: false
  },
  showAccountIcon: {
    type: Boolean,
    default: true,
  },
  showUserInfo: {
    type: Boolean,
    default: false
  },
  showStar: {
    type: Boolean,
    default: true
  },
  allowStar: {
    type: Boolean,
    default: true
  },
  type: {
    type: String,
    default: 'email'
  },
  showFirstLoading: {
    type: Boolean,
    default: true
  },
  showUnread: {
    type: Boolean,
    default: false
  },
  searching: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'jump',
  'delete-draft',
  'right-search',
  'mobile-sort'
])
const {t} = useI18n()
const settingStore = useSettingStore()
const uiStore = useUiStore();
const emailStore = useEmailStore();
const loading = ref(false);
const loadError = ref(false);
const followLoading = ref(false);
const noLoading = ref(false);
const emailList = reactive([])
const expandList = reactive([])
const total = ref(0);
const checkAll = ref(false);
const isIndeterminate = ref(false);
const scroll = ref(null)
const firstLoad = ref(true)
let scrollTop = 0
const latestEmail = ref(null)
const scrollbarRef = ref(null)
let reqLock = false
let isMobile = ref(innerWidth < 1367)
const isPhone = ref(innerWidth < 768)

// The phone search field sits on its own row under the Inbox header and shares
// its query through the email store so the list keeps filtering here.
const mobileSearch = computed(() => emailStore.mobileSearch)
const mobileSearchInput = computed({
  get: () => emailStore.mobileSearch,
  set: value => { emailStore.mobileSearch = value }
})
const mobileFilter = ref('all')
const mobileSelecting = ref(false)
const keyboardFocusedId = ref(0)

// All list folders use this one toolbar. Delete keeps its normal-folder
// meaning (move to Trash); only the Trash folder is wired to the permanent
// delete mutation by the page that owns the list.
const selectionActions = computed(() => ({
  archive: props.type !== 'archive' && props.type !== 'trash' && typeof props.emailArchive === 'function',
  trash: props.type !== 'trash' && typeof props.emailDelete === 'function',
  permanentDelete: props.type === 'trash' && typeof props.emailDelete === 'function',
}))

const mobileFilters = computed(() => [
  { key: 'all', label: t('all') },
  { key: 'unread', label: t('unreadMail') },
  { key: 'attachments', label: t('withAttachments') },
  { key: 'starred', label: t('starred') }
])

let longPressTimer = null
let longPressTriggered = false
let skeletonRows = 0
const timePaddingRight = ref('');
const keyCount = ref(0);
const dropdownRef = ref(null);
const dropdownCloseLock = ref(false);
const dropdownShow = ref(false);
const rightClickEmail = ref({});
const MAX_SELECT_COUNT = 95;
const checkedEmailCount = ref(0);
const selectedCount = computed(() => emailList.filter(item => item.checked).length);
const isSelectMax = computed(() => checkedEmailCount.value >= MAX_SELECT_COUNT);
let timer = null
const position = ref(
    DOMRect.fromRect({
      x: 0,
      y: 0,
    })
)

const triggerRef = ref({
  getBoundingClientRect() {
    return position.value;
  }
})

const queryParam = reactive({
  size: 50
});

defineExpose({
  refreshList,
  deleteEmail,
  addItem,
  handleList,
  emailList,
  firstLoad,
  latestEmail,
  noLoading,
  total,
  getSelectedMailsIds,
  moveKeyboardSelection,
  openKeyboardSelection,
  toggleKeyboardSelection,
  starKeyboardSelection,
  archiveKeyboardSelection,
  deleteKeyboardSelection,
  markKeyboardRead,
  markKeyboardUnread
})

onActivated(() => {
  requestAnimationFrame(() => {
    const index = scrollTop / itemHeight.value
    scrollbarRef.value?.scrollTo(index);
  })
})

onMounted(() => {
  timer = setInterval(() => {
    emailList.forEach(email => {
      email.formatCreateTime = formatListClock(email.createTime);
    })
  }, 1000 * 60);
})

onUnmounted(() => {
  clearInterval(timer)
  clearTimeout(longPressTimer)
  // Match the previous per-instance ref behaviour: leaving the Inbox clears
  // the header search field.
  if (props.type === 'email') emailStore.mobileSearch = ''
})

getEmailList()

window.onresize = () => {
  isMobile.value = innerWidth < 1367
  isPhone.value = innerWidth < 768
}

function onScroll(e) {
  scrollTop = e.target.scrollTop;
}

const { arrivedState } = useScroll(scrollbarRef, {
  offset: { bottom: isMobile.value ? 2200 : 1500 }
})


const list = computed(() => {
  return [...emailList, ...expandList]
})

const attachmentDataReady = computed(() =>
  emailList.every(item => !!emailStore.detailMap[item.emailId])
)

const visibleList = computed(() => {
  if (!isPhone.value || props.type !== 'email') {
    return list.value
  }

  const query = mobileSearch.value.toLocaleLowerCase()

  return list.value.filter(item => {
    if (item.expand) return true

    const matchesFilter =
      mobileFilter.value === 'all' ||
      (mobileFilter.value === 'unread' &&
        item.unread === EmailUnreadEnum.UNREAD) ||
      (mobileFilter.value === 'attachments' &&
        !!emailStore.detailMap[item.emailId]?.attList?.length) ||
      (mobileFilter.value === 'starred' && !!item.isStar)

    const matchesSearch =
      !query ||
      [
        item.name,
        item.sendEmail,
        item.subject,
        item.listText
      ].some(value =>
        String(value || '').toLocaleLowerCase().includes(query)
      )

    return matchesFilter && matchesSearch
  })
})

function selectMobileFilter(filter) {
  mobileFilter.value = filter
}

/**
 * Right-hand list timestamp.
 *
 * A clock based on the user's 12/24-hour preference for today's mail, and a
 * short date otherwise — never relative wording, so the column stays scannable.
 */
function listClock(item) {
  return item?.createTime ? formatListClock(item.createTime) : (item?.formatCreateTime || '')
}

function mobileSortClick() {
  emit('mobile-sort')
}

function toggleMobileSelection() {
  mobileSelecting.value = !mobileSelecting.value

  if (!mobileSelecting.value) {
    handleCheckAllChange(false)
  }
}

function startLongPress(event, item) {
  if (
    !isPhone.value ||
    props.type !== 'email' ||
    event.pointerType === 'mouse'
  ) {
    return
  }

  longPressTriggered = false
  clearTimeout(longPressTimer)

  longPressTimer = setTimeout(() => {
    mobileSelecting.value = true
    item.checked = true
    longPressTriggered = true
  }, 500)
}

function stopLongPress() {
  clearTimeout(longPressTimer)
}

/* ------------------------------------------------------------ swipe actions
 *
 * Mobile-only swipe-to-commit gesture behind Inbox rows. The action layer is
 * feedback only: it never receives pointer input and a row cannot rest in a
 * revealed-action state.
 *
 * The axis/commit maths lives in `utils/swipe-actions.js` and is unit tested.
 * Everything here is deliberately imperative (direct style writes, no reactive
 * state) because a pointermove must not re-render the virtual list, and only
 * one row may be mid-gesture at a time.
 */

/** Slight overshoot so the card settles back like a spring, not a slide. */
const SWIPE_SPRING = 'transform 280ms cubic-bezier(0.22, 1.18, 0.32, 1)'
const SWIPE_SETTLE = 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 220ms cubic-bezier(0.2, 0.8, 0.2, 1)'

let swipeGesture = null

/** True while a drag is in progress, so the click that follows never opens mail. */
let swipeBlockClick = false

const swipeActionsReady = computed(() =>
  typeof props.emailDelete === 'function' &&
  typeof props.emailArchive === 'function'
)

function swipeEnabled() {
  return isPhone.value
    && props.type === 'email'
    && !mobileSelecting.value
    && swipeActionsReady.value
}

function setSwipeActionVisibility(shellEl, action) {
  const archiveEl = shellEl?.querySelector('.swipe-action-archive')
  const deleteEl = shellEl?.querySelector('.swipe-action-delete')

  // Keep the direction invariant in the DOM as well as in CSS. Inline display
  // switches synchronously, so a stale selector or a virtual-list patch cannot
  // leave the opposite action visible for a frame.
  if (archiveEl) archiveEl.style.display = action === SWIPE_ACTION.ARCHIVE ? 'flex' : 'none'
  if (deleteEl) deleteEl.style.display = action === SWIPE_ACTION.DELETE ? 'flex' : 'none'
}

function clearSwipeVisuals(gesture, { keepAction = false } = {}) {
  const { rowEl, shellEl } = gesture
  if (rowEl) {
    rowEl.style.transition = ''
    rowEl.style.transform = ''
    rowEl.style.opacity = ''
  }
  shellEl?.classList.remove('is-swiping', 'is-removing')
  setSwipeActionVisibility(shellEl, keepAction ? gesture.swipeAction : null)
  if (!keepAction) shellEl?.removeAttribute('data-swipe-action')
  if (!keepAction) shellEl?.removeAttribute('data-swipe-ready')
  if (!keepAction) shellEl?.style.removeProperty('--swipe-progress')
}

/** Snap a row that is mid-gesture back to rest before starting a new one. */
function abandonSwipe() {
  if (!swipeGesture) return
  clearSwipeVisuals(swipeGesture)
  swipeGesture = null
}

function onRowPointerDown(event, item) {
  startLongPress(event, item)

  if (!swipeEnabled() || event.pointerType === 'mouse') return

  // One mail item at a time: the previous drag snaps back immediately.
  abandonSwipe()

  const rowEl = event.currentTarget
  swipeBlockClick = false
  swipeGesture = {
    pointerId: event.pointerId,
    rowEl,
    shellEl: rowEl.closest('.swipe-shell'),
    item,
    startX: event.clientX,
    startY: event.clientY,
    dx: 0,
    dy: 0,
    axis: null,
    // Once a swipe commits, this remains authoritative until the row has
    // left the DOM. Resetting the offset first would briefly put both actions
    // back into their resting state during the exit animation.
    swipeAction: null,
  }

  rowEl.style.transition = 'none'
}

function onRowPointerMove(event) {
  const gesture = swipeGesture
  if (!gesture || event.pointerId !== gesture.pointerId) return

  gesture.dx = event.clientX - gesture.startX
  gesture.dy = event.clientY - gesture.startY

  if (!gesture.axis) {
    gesture.axis = resolveSwipeAxis({ dx: gesture.dx, dy: gesture.dy })
    if (!gesture.axis) return
  }

  // Vertical: this is the page scrolling, so let go of the gesture entirely.
  if (gesture.axis !== SWIPE_AXIS.HORIZONTAL) {
    gesture.rowEl.style.transition = ''
    swipeGesture = null
    return
  }

  // A horizontal drag is never also a long press.
  stopLongPress()

  if (!gesture.captured) {
    // Touch pointers are captured implicitly, pen pointers are not; taking the
    // capture explicitly keeps move/up coming even if the finger leaves the row.
    gesture.captured = true
    try {
      gesture.rowEl.setPointerCapture(event.pointerId)
    } catch {
      // A pointer that already went away cannot be captured; the gesture still
      // finishes through pointerup/pointercancel.
    }
  }

  // The drag owns this movement now: no text selection, no native panning.
  if (event.cancelable) event.preventDefault()

  swipeBlockClick = true

  const width = gesture.shellEl?.offsetWidth || 0
  const offset = clampSwipeOffset(gesture.dx, width)
  const threshold = swipeCommitDistance(width)
  const swipeAction = swipeActionForOffset(offset)

  gesture.rowEl.style.transform = `translate3d(${offset}px, 0, 0)`
  gesture.shellEl?.classList.add('is-swiping')
  gesture.swipeAction = swipeAction
  setSwipeActionVisibility(gesture.shellEl, swipeAction)
  gesture.shellEl?.setAttribute('data-swipe-action', swipeAction || '')
  if (Math.abs(offset) >= threshold) gesture.shellEl?.setAttribute('data-swipe-ready', 'true')
  else gesture.shellEl?.removeAttribute('data-swipe-ready')
  gesture.shellEl?.style.setProperty('--swipe-progress', String(Math.min(1, Math.abs(offset) / threshold)))
}

function onRowPointerUp(event) {
  stopLongPress()

  const gesture = swipeGesture
  if (!gesture || event.pointerId !== gesture.pointerId) return
  swipeGesture = null

  if (gesture.axis !== SWIPE_AXIS.HORIZONTAL) return

  const { action, commit } = resolveSwipeRelease({
    dx: gesture.dx,
    dy: gesture.dy,
    width: gesture.shellEl?.offsetWidth || 0,
  })

  if (commit && action) commitSwipe(gesture, action)
  else springBackSwipe(gesture)
}

function onRowPointerLeave() {
  stopLongPress()

  // Touch pointers are implicitly captured, so a locked horizontal drag keeps
  // reporting even when the finger leaves the row. Only an undecided gesture is
  // abandoned here.
  if (swipeGesture && swipeGesture.axis !== SWIPE_AXIS.HORIZONTAL) {
    swipeGesture.rowEl.style.transition = ''
    swipeGesture = null
  }
}

function onRowPointerCancel() {
  stopLongPress()

  if (!swipeGesture) return
  const gesture = swipeGesture
  swipeGesture = null
  springBackSwipe(gesture)
}

/**
 * Swallow the click a drag produces.
 *
 * Registered in the capture phase so it runs before the row's own controls: a
 * swipe that happens to end over the star or the checkbox must not toggle it.
 * `jumpDetails`'s check stays as a backstop for clicks synthesised without a
 * real pointer sequence.
 */
function onRowClickCapture(event) {
  if (!swipeBlockClick) return

  swipeBlockClick = false
  event.stopPropagation()
  event.preventDefault()
}

function springBackSwipe(gesture) {
  const { rowEl, shellEl } = gesture
  if (!rowEl) return

  rowEl.style.transition = SWIPE_SPRING
  rowEl.style.transform = 'translate3d(0, 0, 0)'

  const settle = () => {
    rowEl.style.transition = ''
    rowEl.style.transform = ''
    rowEl.removeEventListener('transitionend', settle)
  }
  rowEl.addEventListener('transitionend', settle)

  shellEl?.classList.remove('is-swiping')
  setSwipeActionVisibility(shellEl, null)
  shellEl?.removeAttribute('data-swipe-action')
  shellEl?.removeAttribute('data-swipe-ready')
  shellEl?.style.removeProperty('--swipe-progress')
}

function commitSwipe(gesture, action) {
  const { rowEl, shellEl, item } = gesture
  const width = shellEl?.offsetWidth || 0
  const direction = action === SWIPE_ACTION.ARCHIVE ? 1 : -1
  const index = emailList.findIndex(row => row.emailId === item.emailId)

  // Lock the action before starting the exit. The row must never pass through
  // the neutral state while it is still rendered.
  gesture.swipeAction = action
  setSwipeActionVisibility(shellEl, action)
  shellEl?.setAttribute('data-swipe-action', action)
  shellEl?.classList.add('is-removing')
  rowEl.style.transition = SWIPE_SETTLE
  rowEl.style.transform = `translate3d(${direction * width}px, 0, 0)`
  rowEl.style.opacity = '0'

  // Complete the visible exit first. This removes the item without waiting for
  // HTTP, then starts the request; a failed request restores its old position.
  let exitFinished = false
  const finishExit = event => {
    if (exitFinished || (event && event.target !== rowEl)) return
    exitFinished = true
    rowEl.removeEventListener('transitionend', finishExit)
    deleteEmail([item.emailId])
    // Let Vue remove the virtual-list row first. Cleaning the imperative
    // styles in the same tick could expose the neutral state for one frame.
    nextTick(() => {
      if (shellEl?.isConnected) clearSwipeVisuals(gesture)
    })

    const request = action === SWIPE_ACTION.ARCHIVE
      ? props.emailArchive([item.emailId])
      : props.emailDelete([item.emailId])

    Promise.resolve(request).then(data => {
      showSwipeOutcome({
        item,
        index,
        action,
        canUndo: action === SWIPE_ACTION.ARCHIVE || data?.soft === true,
      })
    }).catch(error => {
      console.error(error)
      restoreSwipedEmail(item, index)
      ElMessage({
        message: t('swipeActionFailMsg'),
        type: 'error',
        plain: true,
      })
    })
  }

  rowEl.addEventListener('transitionend', finishExit)
  // transitionend is not guaranteed when the browser backgrounds a tab.
  window.setTimeout(finishExit, 260)
}

function restoreSwipedEmail(item, index) {
  if (emailList.some(row => row.emailId === item.emailId)) return
  emailList.splice(Math.max(0, Math.min(index, emailList.length)), 0, item)
}

function showSwipeOutcome({ item, index, action, canUndo }) {
  const message = action === SWIPE_ACTION.ARCHIVE ? t('archiveSuccessMsg') : t('delSuccessMsg')

  if (!canUndo) {
    ElMessage({ message, type: 'success', plain: true })
    return
  }

  showUndoSnackbar({
    message,
    undoLabel: t('undo'),
    duration: SWIPE_UNDO_MS,
    onUndo: () => undoSwipedEmail({ item, index, action }),
  })
}

function undoSwipedEmail({ item, index, action }) {
  const request = action === SWIPE_ACTION.ARCHIVE
    ? props.emailUnarchive([item.emailId])
    : props.emailRestore([item.emailId])

  request.then(() => {
    // Put it back where it was; `index` may be stale if the list changed in the
    // meantime, so clamp instead of trusting it.
    restoreSwipedEmail(item, index)
  }).catch(error => {
    console.error(error)
    ElMessage({
      message: t('undoFailMsg'),
      type: 'error',
      plain: true,
    })
  })
}

const itemHeight = computed(() => {
    if (props.type === 'all-email') {
      return isMobile.value ? 132 : 65;
    } else  {
      // Phone inbox rows are 80px tall (see the .email-row.email mobile rules);
      // keep the virtual list in lock-step so rows never overlap.
      return isPhone.value && props.type === 'email'
        ? 80
        : (isMobile.value ? 83 : 48);
    }
})

watch(emailList, () => {
  updateHasScrollbar();
})

watch(scrollbarRef, () => {
  updateHasScrollbar();
})

// 强制刷新 (itemHeight 更改后虚拟滚动列表不会自己更新)
watch(itemHeight, () => {
  keyCount.value ++
})

/**
 * Row preview text, hardened on the client too.
 *
 * The Worker already flattens markdown and unwraps a body that is itself a raw
 * message when it builds `listText`, but a row stored before those rules still
 * carries its `MIME-Version:` header block or markdown syntax. Normalising here
 * means the Inbox never shows either, whatever the stored row looks like.
 */
function listPreview(item) {
  const raw = String(item?.listText || '')
  if (!raw) return ''

  const nested = unwrapNestedMessage(raw)
  if (nested) {
    const body = nested.text || ''
    return nested.bodyType === MAIL_BODY_TYPE.MARKDOWN ? stripMarkdown(body).trim() : body
  }

  // A markdown body that arrived as text/plain: flatten it for the row.
  return looksLikeMarkdownDocument(raw) ? stripMarkdown(raw).trim() : raw
}

watch(followLoading, (isFollowLoading) => {
  if (isFollowLoading) {
    expandList.push({
      emailId: 0,
      expand: 'loading'
    })
  } else {
    const index = expandList.findIndex(item => item.expand === 'loading')
    expandList.splice(index, 1);
  }
});

watch(noLoading, (isNoLoading) => {
  if (isNoLoading) {
    expandList.push({
      emailId: 0,
      expand: 'noMoreData'
    })
  } else {
    const index = expandList.findIndex(item => item.expand === 'noMoreData')
    expandList.splice(index, 1);
  }
})


// 监听是否到达底部
watch(() => arrivedState.bottom, (isBottom) => {
  if (isBottom && !loading.value) {
    loadData();
  }
});

watch(
    () => emailList.map(item => item.checked),
    () => {
      checkedEmailCount.value = emailList.length
      if (emailList.length > 0) {
        updateCheckStatus();
      }
    },
    {deep: true}
);


watch(() => emailStore.deleteIds, () => {
  if (emailStore.deleteIds) {
    deleteEmail(emailStore.deleteIds)
  }
})

watch(() => emailStore.cancelStarEmailId, () => {
  emailList.forEach(email => {
    if (email.emailId === emailStore.cancelStarEmailId) {
      email.isStar = 0
    }
  })
})

watch(() => emailStore.addStarEmailId, () => {
  emailList.forEach(email => {
    if (email.emailId === emailStore.addStarEmailId) {
      email.isStar = 1
    }
  })
})

window.addEventListener('wheel', (event) => {
  if (dropdownShow.value) {
    dropdownRef.value.handleClose();
  }
})

function openReply(email) {
  const fullEmail = emailStore.detailMap[email.emailId]
  if (!fullEmail) return
  uiStore.writerRef.openReply(fullEmail)
}

function openForward(email) {
  const fullEmail = emailStore.detailMap[email.emailId]
  if (!fullEmail) return
  uiStore.writerRef.openForward(fullEmail)
}

function visibleChange(e) {
  dropdownShow.value = e;
  dropdownCloseLock.value = true;
  setTimeout(() => {
    dropdownCloseLock.value = false;
  },1500)

  if (!e && rightClickEmail.value.rightChecked) {
    rightClickEmail.value.rightChecked = false
  }
}

const handleContextmenu = (event, email) => {

  if (props.type === 'draft') {
    return
  }

  if (rightClickEmail.value.rightChecked) {
    rightClickEmail.value.rightChecked = false
  }

  const { clientX, clientY } = event
  position.value = DOMRect.fromRect({
    x: clientX,
    y: clientY,
  })
  event.preventDefault();
  dropdownRef.value?.handleOpen();

  rightClickEmail.value = email;
  rightClickEmail.value.rightChecked = true
}

function updateHasScrollbar() {
  nextTick(() => {
    const doc = document.querySelector('.virtual');
    if (doc) {
      if (doc.scrollHeight > doc.clientHeight) {
        timePaddingRight.value = '5px';
      } else {
        timePaddingRight.value = '15px'
      }
    }
  })
}

function getSkeletonRows() {
  if (emailList.length > 20) return skeletonRows = 20
  if (emailList.length === 0) return skeletonRows = 1
  skeletonRows = emailList.length
}

const accountShow = computed(() => {
  return uiStore.accountShow && settingStore.settings.manyEmail === 0
})

function syncStarState(email, value) {
  const nextValue = value ? 1 : 0

  email.isStar = nextValue

  const detail = emailStore.detailMap[email.emailId]
  if (detail) {
    detail.isStar = nextValue
  }

  const current = emailStore.contentData.email
  if (current?.emailId === email.emailId) {
    current.isStar = nextValue
  }
}

function starChange(email) {
  if (!email.isStar) {
    if (!props.allowStar) return

    syncStarState(email, 1)

    props.starAdd(email.emailId).then(() => {
      syncStarState(email, 1)
      props.starSuccess(email)
    }).catch(e => {
      console.error(e)
      syncStarState(email, 0)
    })
  } else {
    syncStarState(email, 0)

    props.starCancel(email.emailId).then(() => {
      syncStarState(email, 0)
      props.cancelSuccess?.(email)
    }).catch(e => {
      console.error(e)
      syncStarState(email, 1)
    })
  }
}

function changeAccountShow() {
  uiStore.accountShow = !uiStore.accountShow;
}

function emailRead(emailId) {
  props.emailRead?.([emailId])
  localRead([emailId]);
}

function localRead(emailIds) {
  emailIds.forEach(emailId => {
    const index = emailList.findIndex(email => email.emailId === emailId);
    if (index > -1) {
      emailList[index].unread = EmailUnreadEnum.READ;
      emailList[index].checked = false;
    }
  })
}

function localUnread(emailIds) {
  emailIds.forEach(emailId => {
    const item = emailList.find(email => email.emailId === emailId)
    if (item) {
      item.unread = EmailUnreadEnum.UNREAD
      item.checked = false
    }
    const detail = emailStore.detailMap[emailId]
    if (detail) detail.unread = EmailUnreadEnum.UNREAD
  })
}

function keyboardTarget() {
  return emailList.find(item => item.emailId === keyboardFocusedId.value) || null
}

function setKeyboardFocus(index) {
  if (!emailList.length) return null

  const nextIndex = Math.max(0, Math.min(index, emailList.length - 1))
  const item = emailList[nextIndex]
  keyboardFocusedId.value = item.emailId

  nextTick(() => {
    const row = document.querySelector(`[data-email-id="${item.emailId}"]`)
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })

  return item
}

function moveKeyboardSelection(direction) {
  const currentIndex = emailList.findIndex(item => item.emailId === keyboardFocusedId.value)
  const nextIndex = currentIndex < 0
    ? (direction > 0 ? 0 : emailList.length - 1)
    : currentIndex + direction
  return setKeyboardFocus(nextIndex)
}

function openKeyboardSelection() {
  const item = keyboardTarget()
  if (item) jumpDetails(item, null)
}

function toggleKeyboardSelection() {
  const item = keyboardTarget()
  if (item) item.checked = !item.checked
}

function starKeyboardSelection() {
  const item = keyboardTarget()
  if (item) starChange(item)
}

function actionIdsForKeyboard() {
  return getSelectedMailsIds().length
    ? getSelectedMailsIds()
    : (keyboardTarget()?.emailId ? [keyboardTarget().emailId] : [])
}

function archiveKeyboardSelection() {
  handleArchive(actionIdsForKeyboard())
}

function deleteKeyboardSelection() {
  const ids = actionIdsForKeyboard()
  if (ids.length) handleDelete(ids)
}

function markKeyboardRead() {
  const ids = actionIdsForKeyboard()
  if (!ids.length) return
  props.emailRead?.(ids)
  localRead(ids)
}

function markKeyboardUnread() {
  const ids = actionIdsForKeyboard()
  if (!ids.length || typeof props.emailUnread !== 'function') return
  localUnread(ids)
  props.emailUnread(ids).catch(error => {
    refreshList()
    console.error(error)
  })
}

function rightDelete(emailId) {
  // Normal-folder row deletion is a reversible move to Trash. Remove first;
  // the following refresh restores authoritative state if the request fails.
  emailStore.deleteIds = [emailId];
  props.emailDelete([emailId]).then(() => {
    ElMessage({
      message: t('delSuccessMsg'),
      type: 'success',
      plain: true
    })
  }).catch(error => {
    refreshList()
    console.error(error)
  })
}

function handleArchive(ids = getSelectedMailsIds()) {
  const emailIds = ids
  if (!emailIds.length || typeof props.emailArchive !== 'function') return

  // Remove from every affected list immediately, then let the existing archive
  // mutation provide the authoritative state. A failed request restores the
  // current list from the server.
  emailStore.deleteIds = emailIds
  props.emailArchive(emailIds).then(() => {
    ElMessage({
      message: t('archiveSuccessMsg'),
      type: 'success',
      plain: true
    })
  }).catch(error => {
    refreshList()
    console.error(error)
  })
}

function handleSearch(type, value) {
  emit('right-search', type, value);
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true
    })
  } catch (err) {
    console.error(`${t('copyFailMsg')}:`, err);
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true
    })
  }
}

function handleDelete(ids = getSelectedMailsIds()) {
  const removeSelected = () => {
    if (props.type === 'draft') {
      const draftIds = getSelectedDraftsIds();
      emit('delete-draft', draftIds);
      return;
    }

    const emailIds = ids;
    const optimistic = !props.deleteConfirmText
    if (optimistic) emailStore.deleteIds = emailIds
    props.emailDelete(emailIds).then(() => {
      ElMessage({
        message: props.deleteSuccessText || t('delSuccessMsg'),
        type: 'success',
        plain: true
      })
      if (!optimistic) emailStore.deleteIds = emailIds;
    }).catch(error => {
      if (optimistic) refreshList()
      console.error(error)
    })
  }

  // Moving a mail to Trash is reversible and should be immediate.  The Trash
  // view supplies `deleteConfirmText`, making its destructive action the only
  // mail-list delete that asks for confirmation.
  if (!props.deleteConfirmText && props.type !== 'draft') {
    removeSelected()
    return
  }

  ElMessageBox.confirm(props.deleteConfirmText || t('delEmailsConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(removeSelected)
}

function deleteEmail(emailIds) {
  emailIds.forEach(emailId => {
    emailList.forEach((item, index) => {
      if (emailId === item.emailId) {
        emailList.splice(index, 1);
      }
    })
  })
  if (emailList.length < queryParam.size && !noLoading.value) {
    getEmailList()
  }
}

function addItem(email) {

  // The Inbox lists conversations, not messages: a new reply must re-order and
  // refresh its conversation row instead of adding a second inbox item.
  if (props.type === 'email' && email.threadId) {
    const threadIndex = emailList.findIndex(item => item.threadId && item.threadId === email.threadId)

    if (threadIndex > -1) {
      const previous = emailList[threadIndex]

      // Same representative message: nothing to update.
      if (previous.emailId === email.emailId) {
        return false
      }

      const merged = { ...previous, ...email }
      // Preserve row-local UI state.
      merged.checked = previous.checked
      merged.expand = previous.expand

      emailList.splice(threadIndex, 1)

      if (noLoading.value) {
        handleList([merged])
      }

      if (props.timeSort) {
        emailList.push(merged)
      } else {
        emailList.unshift(merged)
      }

      if (email.emailId > (latestEmail.value?.emailId || 0)) {
        latestEmail.value = email
      }

      return false
    }
  }

  const existIndex = emailList.findIndex(item => item.emailId === email.emailId)

  if (existIndex > -1) {
    return false;
  }

  email.formatCreateTime = formatListClock(email.createTime || email.formatCreateTime);

  if (props.timeSort) {
    if (noLoading.value) {
      handleList([email]);
      emailList.push(email);
    }

    if (email.emailId > latestEmail.value?.emailId) {
      latestEmail.value = email
    }

    total.value++
    return true;
  }


  const index = emailList.findIndex(item => item.emailId < email.emailId)

  if (index !== -1) {
    handleList([email]);
    emailList.splice(index, 0, email);
  } else {
    if (noLoading.value) {
      handleList([email]);
      emailList.push(email);
    }
  }

  if (email.emailId > latestEmail.value?.emailId) {
    latestEmail.value = email
  }

  total.value++
  return true;
}

function handleCheckAllChange(val) {
  if (val) {
    let count = 0;
    emailList.forEach(item => {
      if (count < MAX_SELECT_COUNT) {
        item.checked = true;
        count++;
      } else {
        item.checked = false;
      }
    });
  } else {
    emailList.forEach(item => item.checked = false);
  }
  isIndeterminate.value = false;
}

// 获取选中的邮件列表id
function getSelectedMailsIds() {
  return emailList.filter(item => item.checked).map(item => item.emailId);
}

function getSelectedDraftsIds() {
  return emailList.filter(item => item.checked).map(item => item.draftId);
}

function updateCheckStatus() {
  const checkedCount = emailList.filter(item => item.checked).length;
  checkedEmailCount.value = checkedCount;
  const atMax = checkedCount >= MAX_SELECT_COUNT;
  checkAll.value = emailList.length > 0 && (checkedCount === emailList.length || atMax);
  isIndeterminate.value = checkedCount > 0 && !checkAll.value;
}

function jumpDetails(email, event) {
  // A horizontal drag ends with a click too; it must never open the message.
  if (swipeBlockClick) {
    swipeBlockClick = false
    return
  }

  if (longPressTriggered) {
    longPressTriggered = false
    return
  }

  if (isPhone.value && mobileSelecting.value) {
    email.checked = !email.checked
    return
  }

  if (dropdownShow.value) {
    dropdownRef.value.handleClose();
    return;
  }

  if (!dropdownCloseLock.value) {
    const sel = window.getSelection();
    if (sel.toString().trim()) {
      return
    }
  }

  emit('jump', email)
}


function getEmailList(refresh = false) {

  if (reqLock) return;

  let emailId = nextPageCursor(emailList);

  reqLock = true

  if (!refresh) {

    if (!canRequestPage({ loading: loading.value, noLoading: noLoading.value })) {
      reqLock = false
      return
    }

  } else {
    getSkeletonRows()
    emailId = 0
    loading.value = true
    scrollTop = 0
  }

  if (emailList.length === 0) {
    loading.value = true
  } else {
    followLoading.value = !refresh;
  }
  loadError.value = false;
  let start = Date.now();

  props.getEmailList(emailId, queryParam.size).then(async data => {
    let end = Date.now();
    let duration = end - start;
    if (duration < 300 && !emailId) {
        await sleep(300 - duration)
    }
    firstLoad.value = false

    let list = data.list.map(item => ({
      ...item,
      checked: false
    }));


    if (refresh) {
      emailList.length = 0
    }

    latestEmail.value = data.latestEmail

    handleList(list);
    emailList.push(...list);
    if (refresh) scrollbarRef.value?.setScrollTop(0);

    noLoading.value = isLastPage(data.list.length, queryParam.size);
    followLoading.value = !noLoading.value;

    total.value = data.total;
  }).catch(error => {
    loadError.value = true;
    noLoading.value = true;
    console.error(error);
  }).finally(() => {
    loading.value = false
    reqLock = false
  })
}

function handleList(list) {
  list.forEach(email => {
    email.formatCreateTime = formatListClock(email.createTime);
    email.test = t('received')
    const statusIconMap = {
      0: { icon: 'ic:round-mark-email-read', color: '#51C76B', content: t('received') },
      1: { icon: 'bi:send-arrow-up-fill',  color: '#51C76B', content: t('sent') },
      2: { icon: 'bi:send-check-fill',     color: '#51C76B', content: t('delivered') },
      3: { icon: 'bi:send-x-fill',         color: '#F56C6C', content: t('bounced') },
      8: { icon: 'bi:send-x-fill',         color: '#F56C6C', content: t('bounced') },
      4: { icon: 'bi:send-exclamation-fill', color: '#FBBD08', content: t('complained') },
      5: { icon: 'bi:send-arrow-up-fill',  color: '#FBBD08', content: t('delayed') },
      7: { icon: 'ic:round-mark-email-read', color: '#FBBD08', content: t('noRecipient') },
    };

    if (email.isDel) {
      email.isDelContent = t('selectDeleted');
    }
    email.statusIcon = statusIconMap[email.status];
  })
}

function refreshList() {
  checkAll.value = false;
  isIndeterminate.value = false;
  getEmailList(true);
}

function loadData() {
  getEmailList()
}

</script>
<style lang="scss" scoped>

/* The one checkbox column, shared by the header's select-all, every message row
   and the skeleton rows (a child component, hence `:deep`). Same fixed width, no
   padding, no margin, content centred: that is what puts every checkbox on one
   vertical axis. No other rule may set a width, padding or margin here. */
:deep(.mail-check-column) {
  display: flex;
  flex: 0 0 auto;
  width: var(--mail-list-selection-column);
  min-width: var(--mail-list-selection-column);
  max-width: var(--mail-list-selection-column);
  box-sizing: border-box;
  padding: 0;
  margin: 0;
  justify-content: center;
  align-items: center;
}

.email-container {
  --mail-list-selection-column: 24px;
  --mail-list-column-gap: 8px;
  --mail-list-horizontal-padding: 14px;
  /* Where the checkbox column starts, from the container's edge. Header and
     rows must agree on this number or their checkboxes cannot share an axis;
     it mirrors the inset the rows themselves are drawn with. */
  --mail-list-checkbox-inset: var(--mail-list-horizontal-padding);
  display: grid;
  grid-template-rows: auto 1fr;
  grid-template-columns: minmax(0, 1fr);
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding: 0;
  font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  height: 100%;
}

.scroll {
  margin: 0;
  height: 100%;
  overflow: hidden;

  .virtual {
    will-change: scroll-position;
  }

  .empty {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    width: 100%;
  }

  .noLoading {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 34px;
    padding: 8px 0 0;
    color: var(--secondary-text-color);
    font-size: 11px;
    line-height: 1.2;
    opacity: .58;
    pointer-events: none;
  }

  .follow-loading {
    height: 60px;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    background: var(--loadding-background);
    height: 100%;
    width: 100%;
    position: absolute;
    z-index: 1;
    top: 0;
    left: 0;
  }

  .loading-show {
    transition: all 200ms ease 200ms;
    opacity: 1;
  }

  .loading-hide {
    pointer-events: none;
    transition: var(--loading-hide-transition);
    opacity: 0;
  }
}

:deep(.email-row) {
  display: flex;
  padding: 9px 14px;
  justify-content: space-between;
  box-shadow: none;
  cursor: pointer;
  align-items: center;
  position: relative;
  transition: background .16s ease, transform .16s ease;
  height: 76px;
  border-bottom: 1px solid var(--nova-divider);
  @media (max-width: 1366px) {
    height: 76px;
  }

  @media (pointer: coarse) {
    /* 触屏 */
    user-select: none;
  }
  &.all-email {
    height: 65px;
    @media (max-width: 1366px) {
      height: 132px;
    }
  }
  &:hover { background: var(--nova-hover); }
  &:active { background: var(--nova-selected); }
  &.keyboard-focused {
    background: var(--nova-selected);
    outline: 1px solid color-mix(in srgb, var(--el-color-primary) 42%, transparent);
    outline-offset: -1px;
  }
  .user-info {
    display: flex;
    flex-wrap: wrap;
    column-gap: 10px;
    margin-top: 5px;
    margin-bottom: 2px;
    color: var(--email-scroll-content-color);
    @media (max-width: 1366px) {
      flex-direction: column;
    }

    .user, .account {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      transition: color var(--nova-motion-base) var(--nova-motion-ease), opacity var(--nova-motion-base) var(--nova-motion-ease);
      line-height: 12px;
      max-width: 300px;
      min-width: 0;

      @media (max-width: 1223px) {
        max-width: 280px;
      }

      span:first-child {
        position: relative;
      }

      span:last-child {
        margin-left: 5px;
        position: relative;
        bottom: 5px;
      }
    }
  }

  /* Width, padding and centring come from the shared `.mail-check-column`. The
     all-mail rows are the one variant with a different height, so they keep
     their own vertical placement on very wide screens. */
  .all-email-checkbox {
    @media (min-width: 1367px) {
      height: 100%;
      align-self: start;
      padding-bottom: 30px;
    }
  }

  .title-column {
    @media (max-width: 1366px) {
      grid-template-columns: 1fr !important;
      gap: 4px !important;
    }
  }

  .title {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(130px, 36%) minmax(0, 1fr);
    @media (max-width: 1366px) {
      padding-right: 15px;
    }
    @media (max-width: 1366px) {
      grid-template-columns: 1fr;
      gap: 4px;
    }

    .email-sender {
      color: var(--el-text-color-primary);
      display: grid;
      grid-template-columns: auto 1fr auto;

      .email-status {
        display: flex;
        flex-direction: column;
        align-content: center;
        @media (max-width: 1366px) {
          flex-direction: row;
          gap: 5px;
        }
      }

      .name {
        display: grid;
        gap: 5px;
        grid-template-columns: auto 1fr;

        > span:last-child {
          display: flex;
          align-items: center;
        }

        @media (min-width: 1366px) {
          grid-template-columns: 1fr;
          > span:last-child {
            display: none;
          }
        }

        > span:first-child {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .name-skeleton {
          width: 150px;
          height: 1rem;
          @media (max-width: 767px) {
            width: 120px;
            height: .875rem;
          }
        }
      }

      .phone-time {
        font-weight: normal;
        font-size: 12px;
        @media (min-width: 1367px) {
          display: none;
        }
      }
    }

    .email-text-skeleton {
      .text-skeleton-one {
        width: 80%;
        height: 16px;
        @media (max-width: 1366px) {
          width: 40%;
        }
        @media (max-width: 767px) {
          width: 70%;
          height: 14px;
        }
      }

      .text-skeleton-two {
        width: min(300px, 100%);
        height: 16px;
        @media (min-width: 1367px) {
          display: none;
        }
        @media (max-width: 1366px) {
          width: 100%;
        }
        @media (max-width: 767px) {
          height: 14px;
        }
      }
    }

    .email-text {
      display: grid;
      grid-template-columns: auto 1fr;
      @media (max-width: 1366px) {
        grid-template-columns: 1fr;
      }

      .email-subject {
        display: flex;
        align-items: center;
        gap: 6px;
        overflow: hidden;
        white-space: nowrap;
        min-width: 0;
        @media (min-width: 1367px) {
          padding-left: 5px;
        }
      }

      .code-tag {
        flex: 0 0 auto;
        max-width: 170px;
        height: 20px;
        line-height: 20px;
        font-size: 14px;
        color: var(--el-text-color-primary);
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        cursor: pointer;
      }

      .subject-text {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        min-width: 0;
      }

      .email-content {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        padding-left: 10px;
        color: var(--regular-text-color);
        @media (max-width: 1366px) {
          padding-left: 0;
          margin-top: 0;
        }
      }
    }
  }


  .email-right {
    text-align: right;
    font-size: 11px;
    color: var(--regular-text-color);
    white-space: nowrap;
    display: flex;
    padding-left: 15px;
    align-items: center;
    @media (max-width: 1366px) {
      display: none;
    }
  }

  .email-right-skeleton {
    @media (max-width: 1366px) {
      display: none;
    }
  }

  &:hover {
    background-color: var(--nova-hover);
    z-index: 0;
  }

  &.right-checked,
  &.right-checked:hover {
    background-color: var(--email-right-click-background);
  }

  /*&[data-checked="true"] {
    background-color: #c2dbff;
  }*/
}


.phone-star {
  display: none;
}

.pc-star {
  width: var(--nova-icon-button-size);
  height: var(--nova-icon-button-size);
}

@media (max-width: 1366px) {
  .pc-star {
    display: none;
  }
  .phone-star {
    display: block;
    align-self: end;
    padding-right: 16px;
    padding-top: 8px;
  }
  .star-pd {
    padding-top: 6px !important;
  }
}

.email-time {
  padding-right: v-bind(timePaddingRight);
}

.email-time-meta {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.unread-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 50%;
  background: var(--el-color-primary);
}

:deep(.el-scrollbar__view) {
  height: 100%;
}

.header-actions {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  height: 48px;
  gap: 12px;
  padding: 0 14px;
  box-shadow: inset 0 -1px 0 var(--nova-divider);

  .header-left {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    position: relative;
    column-gap: 14px;
    row-gap: 0;
    padding-left: 2px;
    color: var(--el-text-color-primary);;
  }

  .header-right {
    display: grid;
    grid-template-columns: auto auto;
    align-items: center;
    height: 100%;
    color: var(--el-text-color-primary);;

    .email-count {
      white-space: nowrap;
      margin-top: 0;
    }
  }

  .icon {
    font-size: 18px;
    cursor: pointer;
  }

  .more-icon {
    margin-top: 8px;
    margin-left: 15px;
  }

}

.del-status {
  color: var(--el-color-info);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  bottom: 1px;
}



.right-dropdown-item {
  display: flex;
  gap: 10px;
}

:deep(.el-dropdown-menu__item:last-child) {
  padding-bottom: 10px;
}

:deep(.el-dropdown-menu__item:first-child) {
  padding-top: 10px;
}

:deep(.el-dropdown-menu__item) {
  padding-right: 14px;
  padding-left: 14px;
}

.unread {
  height: 6px;
  width: 6px;
  background: var(--el-color-primary);
  margin-bottom: 2px;
  margin-right: 5px;
  border-radius: 50%;
  display: inline-block;
  justify-content: center;
}

ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

/* Compact desktop mail rows: keep the list dense and columns stable while
   preserving the existing virtual-list item height (48px). */
@media (min-width: 768px) {
  .header-actions {
    grid-template-columns: var(--mail-list-selection-column) minmax(0, 1fr) auto;
    column-gap: var(--mail-list-column-gap);
    padding-right: var(--mail-list-horizontal-padding);
    padding-left: var(--mail-list-checkbox-inset);
  }

  :deep(.email-row:not(.all-email)) {
    display: grid;
    grid-template-columns: var(--mail-list-selection-column) var(--nova-icon-button-size) minmax(0, 1fr) 82px;
    align-items: center;
    gap: var(--mail-list-column-gap);
    height: 48px;
    min-height: 48px;
    padding: 4px var(--mail-list-horizontal-padding);
  }

  :deep(.email-row:not(.all-email) .pc-star) {
    width: var(--nova-icon-button-size);
    justify-content: center;
  }

  :deep(.email-row:not(.all-email) .title) {
    display: grid;
    grid-template-columns: minmax(130px, 30%) minmax(0, 1fr) !important;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  :deep(.email-row:not(.all-email) .email-sender) {
    min-width: 0;
  }

  :deep(.email-row:not(.all-email) .email-text) {
    min-width: 0;
    width: 100%;
    overflow: hidden;

    display: grid;
    grid-template-columns: minmax(0, 45%) minmax(0, 1fr);
    align-items: center;
  }

  :deep(.email-row:not(.all-email) .email-subject) {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;

    display: flex;
    align-items: center;
  }

  :deep(.email-row:not(.all-email) .subject-text) {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  :deep(.email-row:not(.all-email) .email-content) {
    display: block;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    padding-left: 6px;
  }

  :deep(.email-row:not(.all-email) .email-right) {
    display: block;
    padding-left: 0;
    text-align: right;
  }

  :deep(.email-row:not(.all-email) .email-time-meta) {
    width: 100%;
  }

  :deep(.email-row:not(.all-email) .email-time) {
    padding-right: 0;
  }

  :deep(.email-row:not(.all-email) .user-info) {
    display: none;
  }
}

/* Mobile rows use one stable two-column layout. The checkbox owns the first
   column; all message content stays together in the second column so the
   avatar, sender, time, subject and preview cannot drift apart. */
@media (max-width: 767px) {
  .email-container {
    /* Phone rows draw their content with an 8px inset (see `.email-row.email`)
       and a 20px selection column, so the header uses the same two numbers and
       both checkboxes stay on one axis. */
    --mail-list-selection-column: 20px;
    --mail-list-checkbox-inset: 8px;
  }

  :deep(.email-row:not(.all-email)) {
    display: grid;
    grid-template-columns: var(--mail-list-selection-column) minmax(0, 1fr);
    column-gap: 8px;
    align-items: start;
    height: 83px;
    min-height: 83px;
    padding: 8px 20px 8px 16px;
    box-sizing: border-box;
  }

  /* Horizontal placement, width and centring come from `.mail-check-column`;
     only the vertical nudge for the phone row lives here. */
  :deep(.email-row:not(.all-email) > .checkbox) {
    grid-column: 1;
    grid-row: 1;
    height: 18px;
    align-self: start;
    margin-top: 2px;
  }

  /* The desktop star column is hidden on touch layouts; the inline star in
     the sender header remains available when starring is enabled. */
  :deep(.email-row:not(.all-email) > :nth-child(2)) {
    display: none;
  }

  :deep(.email-row:not(.all-email) > .title) {
    grid-column: 2;
    grid-row: 1;
    width: 100%;
    min-width: 0;
    display: block;
    padding: 0;
  }

  :deep(.email-row:not(.all-email) .email-sender) {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    line-height: 28px;
  }

  :deep(.email-row:not(.all-email) .email-sender > div:first-child:empty) {
    display: none;
  }

  :deep(.email-row:not(.all-email) .name) {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
  }

  :deep(.email-row:not(.all-email) .name > span:first-child) {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 7px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  :deep(.email-row:not(.all-email) .name .sender-avatar) {
    width: 28px !important;
    height: 28px !important;
    flex: 0 0 28px !important;
  }

  :deep(.email-row:not(.all-email) .name > span:first-child > :last-child) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep(.email-row:not(.all-email) .phone-time) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    margin-left: auto;
    min-width: max-content;
    color: color-mix(in srgb, var(--mobile-secondary) 82%, transparent);
    font-size: 13px;
    font-weight: 400;
    line-height: 20px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  :deep(.email-row:not(.all-email) .email-text) {
    display: block;
    min-width: 0;
    width: 100%;
    margin-top: 2px;
    overflow: hidden;
  }

  :deep(.email-row:not(.all-email) .email-subject),
  :deep(.email-row:not(.all-email) .email-content) {
    display: block;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  :deep(.email-row:not(.all-email) .email-subject) {
    line-height: 20px;
  }

  :deep(.email-row:not(.all-email) .email-content) {
    margin-top: 1px;
    padding-left: 0;
    color: var(--regular-text-color);
    font-size: 13px;
    line-height: 20px;
  }

  :deep(.email-row:not(.all-email) > .email-right) {
    display: none;
  }
}



/* =========================================================
   Mobile Inbox v2
   Keep this block last so the proven desktop/stable styles
   remain authoritative outside phone layouts.
   ========================================================= */

.mobile-inbox-tools,
.mobile-sender-avatar,
.mobile-row-star,
.mobile-filter-empty,
/* Swipe actions are a phone-only affordance; the media query below lays them
   out. Without this the desktop layout would show both action panels. */
.swipe-actions {
  display: none;
}

@media (max-width: 767px) {
  .email-container {
    grid-template-rows: auto minmax(0, 1fr);
    background: var(--nova-surface);
    color: var(--mobile-primary);
  }

  .email-container.mobile-toolbar-visible {
    grid-template-rows: auto auto minmax(0, 1fr);
  }

  /* ---------- Inbox tools (search + filter rows) ---------- */

  .mobile-inbox-tools {
    display: block;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    /* 4px of air below the filter divider so it no longer touches the first
       mail row, without adding height to the Inbox header block. */
    padding: 0 0 4px;
    background: var(--nova-surface);
  }

  /* ---------- Search row ---------- */

  .mobile-search-row {
    /* Page gutter shared with the app bar and mail rows. */
    padding: 2px 12px 8px;
    box-sizing: border-box;

    /* Search field on the left, sort + multi-select on the right; the field
       keeps every pixel the two 32px tools do not need. */
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mobile-search {
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
    height: 44px;

    display: flex;
    align-items: center;
    gap: 8px;

    padding: 0 12px;
    box-sizing: border-box;

    border: 1px solid var(--nova-search-border);
    border-radius: 12px;

    /* A step above the page surface in both themes: light keeps the iOS grey,
       dark lifts off the near-black page instead of dissolving into it. */
    background: var(--nova-search-bg);
    color: var(--mobile-secondary);

    transition: border-color var(--nova-motion-fast) var(--nova-motion-ease),
                box-shadow var(--nova-motion-fast) var(--nova-motion-ease);
  }

  .mobile-search:focus-within {
    border-color: color-mix(in srgb, var(--el-color-primary) 55%, transparent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-primary) 12%, transparent);
  }

  .mobile-search .app-icon {
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    opacity: .72;
  }

  .mobile-search input {
    flex: 1 1 auto;
    width: 0;
    min-width: 0;
    height: 100%;

    border: 0;
    outline: 0;
    background: transparent;

    color: var(--mobile-primary);
    font-size: 15px;
    text-overflow: ellipsis;
  }

  .mobile-search input::placeholder {
    color: color-mix(in srgb, var(--mobile-secondary) 88%, transparent);
    opacity: 1;
  }

  .mobile-search-clear {
    flex: 0 0 auto;

    width: 24px;
    height: 24px;
    padding: 0;

    display: grid;
    place-items: center;

    border: 0;
    border-radius: 50%;
    background: transparent;

    color: var(--mobile-secondary);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
  }

  .mobile-search-clear:active {
    background: var(--nova-hover);
  }

  /* ---------- Filters ---------- */

  .mobile-filter-bar {
    /* border-box: 40 = 2 (top) + 32 (tabs) + 5 (bottom) + 1 (divider). */
    height: 40px;
    min-width: 0;

    /* Symmetric page gutter: the four chips fill the row edge to edge, so the
       group is centred in the bar instead of leaning left. */
    padding: 2px 12px 5px;

    display: flex;
    align-items: center;

    border-bottom: 1px solid var(--nova-divider-soft, color-mix(in srgb, var(--nova-divider) 55%, transparent));
  }

  .mobile-filters {
    flex: 1 1 auto;
    min-width: 0;

    /* One equal column per filter: `minmax(0, 1fr)` lets a long label shrink
       instead of pushing its neighbours out of line, so the four cells stay
       identical whether or not one of them is active. */
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    align-items: center;
    gap: 0;
  }

  .mobile-filters button {
    /* Every chip carries the same box whether or not it is active, so toggling
       a filter cannot shift its neighbours. The content is centred inside the
       cell, which keeps the labels optically on the row's centre line. */
    width: 100%;
    max-width: 100%;
    min-width: 0;
    height: 32px;
    padding: 0 4px;
    box-sizing: border-box;

    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;

    border: 0;
    border-radius: 999px;

    color: var(--mobile-secondary);
    background: transparent;

    overflow: hidden;

    font-size: clamp(10.5px, 3.15vw, 12.5px);
    cursor: pointer;
  }

  .mobile-filters button.active {
    color: var(--el-color-primary);
    background: var(--nova-selected);

    font-weight: 650;
  }

  .mobile-filter-label {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* Sort + multi-select behave as one right-aligned unit beside the search
     field (see `.mobile-search-row`). */
  .mobile-filter-actions {
    flex: 0 0 auto;

    display: flex;
    align-items: center;
    gap: 2px;
  }

  .mobile-tool-button {
    flex: 0 0 32px;

    width: 32px;
    height: 32px;
    padding: 0;

    display: grid;
    place-items: center;

    border: 0;
    background: transparent;

    color: var(--mobile-primary);
    cursor: pointer;
  }

  .mobile-tool-button .iconify {
    width: 18px !important;
    height: 18px !important;
    opacity: .72 !important;
  }

  /* ---------- Hide desktop action toolbar ---------- */

  .email-container > .header-actions {
    display: none;
  }

  .email-container.mobile-selecting > .header-actions {
    display: grid;

    /* The selection toolbar is its own full-width region. Its divider must not
       inherit the inset used by message rows. */
    grid-template-columns: var(--mail-list-selection-column) auto;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;

    height: 48px;
    min-height: 48px;
    /* Same left inset as a phone mail row, so the select-all lines up with the
       row checkboxes it controls. */
    padding: 4px 8px 4px var(--mail-list-checkbox-inset);
    column-gap: 4px;
    border-top: 1px solid var(--nova-divider);
    border-bottom: 1px solid var(--nova-divider);
    box-shadow: none;
  }

  .email-container.mobile-selecting > .header-actions .header-left {
    width: max-content;
    gap: 4px;
    padding-left: 0 !important;
  }

  .email-container.mobile-selecting > .header-actions .selection-slot,
  .email-container.mobile-selecting
    > .header-actions
    .header-right {
    display: none;
  }

  .email-container.mobile-selecting > .header-actions .selection-action {
    flex: 0 0 38px;
    width: 38px;
    height: 38px;
  }

  /* ---------- Mail row ---------- */

  :deep(.email-row.email:not(.all-email)) {
    position: relative;

    display: grid;
    /* Checkbox gutter | fixed avatar | content | fixed time. Keeping these
       tracks stable prevents sender/subject/unread changes from moving the
       avatar or timestamp horizontally. */
    grid-template-columns: 20px 80px minmax(0, 1fr) 64px;

    column-gap: 0;

    width: 100%;
    /* Keep this identical before, during and after selection. The virtual
       list uses the same value in `itemHeight` above. */
    height: 80px;
    min-height: 80px;

    padding: 10px 8px;

    box-sizing: border-box;

    align-items: start;

    border: 0;
    background: var(--nova-surface);
  }

  :deep(.virtual > div + div > .swipe-shell > .email-row.email:not(.all-email))::before {
    content: '';

    position: absolute;
    /* Only rows after the first one paint a divider. This leaves the filter
       divider as the only line above the first message and avoids a line after
       the final message/no-more-data marker. */
    left: 8px;
    right: 8px;
    top: 0;

    height: 1px;

    background: var(--nova-divider-soft, color-mix(in srgb, var(--nova-divider) 55%, transparent));
  }

  :deep(.email-row.email:active) {
    background: var(--nova-selected);
  }

  /* desktop checkbox + star are hidden normally */
  :deep(.email-row.email > .checkbox),
  :deep(.email-row.email > .pc-star),
  :deep(.email-row.email > .email-right) {
    display: none;
  }

  /* ---------- Selection mode ---------- */

  .email-container.mobile-selecting
    :deep(.email-row.email:not(.all-email)) {
    /* Selection adds its checkbox track without changing the normal row. */
    grid-template-columns: var(--mail-list-selection-column) 80px minmax(0, 1fr) 64px;
  }

  .email-container.mobile-selecting
    :deep(.email-row.email > .checkbox) {
    grid-column: 1;

    display: flex;

    /* Vertical nudge only: the column's width, padding and centring are the
       shared `.mail-check-column` ones the header select-all also uses. */
    padding: 6px 0 0;
  }

  /* ---------- Sender avatar ---------- */

  .mobile-sender-avatar {
    grid-column: 2;

    width: 56px;
    height: 56px;
    min-width: 56px;
    min-height: 56px;

    /* The track reserves 8px after the checkbox and 16px before content. */
    justify-self: start;
    align-self: center;
    margin-left: 8px;

    display: grid;
    place-items: center;

    padding: 0;
    margin: 0;

    border-radius: 50%;
    overflow: hidden;

    color: var(--el-color-primary);
    background: var(--nova-selected);

    font-size: 17px;
    font-weight: 650;
    line-height: 1;
    text-align: center;
  }

  /* stable SenderAvatar inside the sender line stays available
     for desktop, but the dedicated 40px avatar owns phone rows */
  :deep(.email-row.email .name .sender-avatar) {
    display: none;
  }

  /* ---------- Message body ---------- */

  :deep(.email-row.email > .title) {
    grid-column: 3;

    width: 100%;
    min-width: 0;
    max-width: 100%;

    display: block;

    padding: 0;

    /* Not `hidden`: the preview line below is allowed to reach into the gutter
       the timestamp leaves (see `.email-content`). Every line inside already
       clips itself with its own ellipsis, so nothing else can escape. */
    overflow: visible;
  }

  :deep(.email-row.email .title .email-sender) {
    width: 100%;
    min-width: 0;

    display: block;

    /* Sender is the strongest line: largest type, heaviest weight, primary ink. */
    line-height: 20px;
    margin-bottom: 1px;

    color: var(--mobile-primary);

    font-size: 17px;
    font-weight: 600;
  }

  :deep(.email-row.email.is-unread .title .email-sender) {
    font-weight: 700;
  }

  /* hide old status placeholder / old unread dot */
  :deep(.email-row.email .email-sender > div),
  :deep(.email-row.email .unread) {
    display: none;
  }

  :deep(.email-row.email .title .email-sender .name) {
    min-width: 0;

    display: block;

    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  :deep(.email-row.email .name > span:last-child) {
    display: none;
  }

  /* The sender-line copy of the time is hidden on phones. The dedicated
     email-right track below owns the single, aligned timestamp column. */
  :deep(.email-row.email .phone-time) {
    display: none;
  }

  :deep(.email-row.email > .email-right) {
    grid-column: 4;
    grid-row: 1;
    display: flex;
    align-self: start;
    justify-content: flex-end;
    min-width: 0;
    padding: 0;
    text-align: right;
  }

  :deep(.email-row.email > .email-right .email-time-meta) {
    width: auto;
    min-width: 0;
  }

  :deep(.email-row.email > .email-right .email-time) {
    padding-right: 0;
    color: var(--mobile-tertiary);
    font-size: 13px;
    font-weight: 400;
    line-height: 20px;
    white-space: nowrap;
  }

  :deep(.email-row.email.is-unread > .email-right .email-time) {
    color: var(--el-color-primary);
    font-weight: 600;
  }

  :deep(.email-row.email .email-text) {
    display: block;

    width: 100%;
    min-width: 0;

    padding-right: 0;
    margin-top: 1px;

    line-height: 18px;

    /* See `.title`: the snippet needs to escape this box, the subject does not
       (it owns its own ellipsis). */
    overflow: visible;
  }

  :deep(.email-row.email .email-subject) {
    display: block;

    width: 100%;
    min-width: 0;

    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;

    /* Second step: still primary ink, one size down from the sender. */
    color: var(--mobile-primary);

    font-size: 15px;
    line-height: 19px;
    font-weight: 400;
    padding-right: 0;
  }

  :deep(.email-row.email.is-unread .email-subject) {
    font-weight: 600;
  }

  :deep(.email-row.email .email-text .email-content) {
    display: block;

    width: 100%;
    max-width: 100%;

    min-width: 0;

    padding: 0;

    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;

    /* Third step: the preview drops to the weakest text tier so the eye lands
       on Sender -> Subject first. The extra .email-text step wins the cascade
       against the older `.email-row:not(.all-email) .email-content` rule. */
    color: var(--mobile-tertiary);

    font-size: 14px;
    line-height: 18px;
    font-weight: 400;
  }

  /* ---------- Mobile star ---------- */

  .mobile-row-star {
    /* A 36px tap target around an 18px glyph: still easy to hit, but light
       enough that the star stays an auxiliary action next to the timestamp. */
    width: 36px;
    height: 36px;
    flex: 0 0 auto;

    display: grid;
    place-items: center;

    padding: 0;
    margin: 0;

    border: 0;
    background: transparent;

    cursor: pointer;
  }

  .mobile-row-star .iconify {
    width: 18px !important;
    height: 18px !important;
  }

  /* Starred rows use the theme accent on the phone list (the desktop list keeps
     the global treatment). `!important` outranks the global dark icon veil. */
  /* ---------- Filtered empty ---------- */

  .scroll {
    position: relative;
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  .mobile-filter-empty {
    position: absolute;

    z-index: 2;

    left: 0;
    right: 0;
    top: 48%;

    display: block;

    text-align: center;

    color: var(--mobile-tertiary);

    font-size: 14px;

    pointer-events: none;
  }

  /* End-of-list label: give it real air below the last message instead of
     sitting flush against the final row. */
  .noLoading {
    min-height: 34px;
    padding: 12px 0 8px;
    font-size: 11px;
    opacity: .56;
  }

  /* ---------- Swipe actions ----------
   *
   * `.swipe-shell` is the virtual-list item. It clips the horizontal travel and
   * owns the axis contract: `touch-action: pan-y` keeps vertical scrolling
   * native while horizontal movement reaches the pointermove handler instead of
   * being consumed by the browser's own panning.
   *
   * The action panels sit *under* the card. The card keeps its own background
   * (`--nova-surface`, opaque) and is later in the DOM, so it hides the panels
   * at rest and uncovers them as it moves. Reusing the existing row element is
   * what leaves its radius, padding, divider and dark-mode colours untouched.
   */
  :deep(.swipe-shell) {
    position: relative;

    display: block;

    overflow: hidden;

    touch-action: pan-y;
  }

  :deep(.swipe-actions) {
    position: absolute;
    inset: 0;

    display: flex;
    align-items: stretch;
    justify-content: space-between;

    /* Below the card, and never a click target: the gesture owns this area. */
    z-index: 0;
    pointer-events: none;
    background: var(--nova-surface-muted);
  }

  :deep(.swipe-shell[data-swipe-action='archive'] .swipe-actions) {
    background: color-mix(in srgb, var(--el-color-primary) 16%, var(--nova-surface-muted));
  }

  :deep(.swipe-shell[data-swipe-action='delete'] .swipe-actions) {
    background: color-mix(in srgb, var(--el-color-danger) 18%, var(--nova-surface-muted));
  }

  :deep(.swipe-shell[data-swipe-ready='true'] .swipe-actions) {
    filter: saturate(1.25);
  }

  :deep(.swipe-action) {
    /* Both actions are absent at rest. Direction changes use display rather
       than opacity so the previous action cannot linger for a frame. */
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;

    width: 96px;
    position: absolute;
    top: 0;
    bottom: 0;

    font-size: 12px;
    font-weight: 600;
  }

  /* Archive (revealed by dragging right) and Delete (dragging left) use the
     same currentColor outline icons as the Sidebar navigation system. */
  :deep(.swipe-action-archive) {
    left: 0;
    color: var(--el-color-primary);
  }

  :deep(.swipe-action-delete) {
    right: 0;
    color: var(--el-color-danger);
  }

  /* The card paints over the panels. */
  :deep(.swipe-shell > .email-row.email) {
    position: relative;
    z-index: 1;
  }

  :deep(.swipe-shell.is-swiping > .email-row.email) {
    will-change: transform;
  }

  /* The tap highlight belongs to a tap, not to a drag. */
  :deep(.swipe-shell.is-swiping > .email-row.email:active) {
    background: var(--nova-surface);
  }

  /* Emphasise whichever action the current drag would commit to. */
  :deep(.swipe-shell[data-swipe-action='archive'] .swipe-action-archive),
  :deep(.swipe-shell[data-swipe-action='delete'] .swipe-action-delete) {
    display: flex;
    filter: brightness(1.05);
    opacity: 1;
  }
}

</style>
