<template>
  <div
      class="email-container"
      :class="{
        'mobile-selecting': mobileSelecting,
        'density-compact': settingStore.mailListDensity === 'compact'
      }"
      :style="{
        '--mail-row-height-desktop': `${densityGeometry.desktop}px`,
        '--mail-row-height-phone': `${densityGeometry.phone}px`,
        '--mail-row-height-phone-other': `${densityGeometry.phoneOther}px`
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

        <!-- The sort control stays at the far edge while the search field takes
             all remaining room in this row. -->
        <div class="mobile-filter-actions">
          <MailSortButton mobile :time-sort="timeSort" @toggle="mobileSortClick" />
        </div>
      </div>

    </div>

    <div
        class="mail-list-secondary-toolbar"
        :class="{ 'has-secondary-toolbar': selectedCount > 0 }"
    >
      <Transition name="secondary-toolbar-fade" mode="out-in">
      <div
          v-if="!isPhone || selectedCount > 0"
          key="selection-toolbar"
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
                @click="handleArchive()"
            >
              <AppIcon name="nova-sidebar-archive" :size="20" inline />
            </button>
          </el-tooltip>
          <el-tooltip v-if="selectionActions.unarchive" effect="dark" :content="t('unarchive')" :show-after="1200">
            <button
                v-perm="'email:delete'"
                class="nova-icon-button nova-toolbar-button selection-action"
                type="button"
                :aria-label="t('unarchive')"
                @click="handleUnarchive()"
            >
              <AppIcon name="nova-sidebar-inbox" :size="20" inline />
            </button>
          </el-tooltip>
          <el-tooltip v-if="selectionActions.trash || selectionActions.permanentDelete" v-perm="'email:delete'" effect="dark" :content="selectionActions.permanentDelete ? t('deleteForever') : t('delete')" :show-after="1200">
            <button
                class="nova-icon-button nova-toolbar-button nova-danger-button selection-action"
                type="button"
                :aria-label="t('delete')"
                @click="handleDelete()"
            >
              <AppIcon name="nova-sidebar-trash" :size="20" inline />
            </button>
          </el-tooltip>
        </template>
      </div>

      <div class="header-right" :class="{ 'desktop-sort-group': type === 'email' && !isPhone }">
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
      </Transition>
    </div>

    <div ref="scroll" class="scroll">
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
                <div
                    v-for="slot in swipeActionSlots"
                    :key="slot.direction"
                    class="swipe-action"
                    :class="`swipe-action-${slot.direction}`"
                    :data-action="slot.action"
                >
                  <AppIcon
                      v-if="slot.config.icon"
                      :name="slot.config.icon"
                      :size="22"
                      :inline="slot.config.icon.startsWith('nova-sidebar-')"
                  />
                  <span>{{ t(slot.config.labelKey) }}</span>
                </div>
              </div>
              <div :class="['email-row', props.type, {
                    'keyboard-focused': keyboardFocusedId === item.emailId,
                    'right-checked': item.rightChecked,
                    'is-last-mail': index === lastVisibleMailIndex,
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
              <el-checkbox
                  v-if="!isPhone"
                  class="mail-check-column desktop-row-checkbox"
                  :model-value="item.checked"
                  :disabled="!item.checked && isSelectMax"
                  :aria-label="item.checked ? t('cancel') : t('multiSelect')"
                  @click.stop
                  @change="toggleRowSelection(item)"
              />
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
              <div v-if="!showStar" class="pc-star-placeholder"></div>
              <span v-if="!isPhone" class="desktop-unread-indicator">
                <span v-if="item.unread === EmailUnreadEnum.UNREAD && showUnread" class="unread-dot" aria-label="Unread" />
              </span>
              <div
                  v-if="isPhone"
                  class="row-avatar"
                  :class="{ 'is-selected': item.checked }"
                  role="button"
                  tabindex="0"
                  :aria-label="item.checked ? t('cancel') : t('multiSelect')"
                  :aria-pressed="item.checked"
                  @click.stop="toggleRowSelection(item)"
                  @keydown.enter.stop.prevent="toggleRowSelection(item)"
                  @keydown.space.stop.prevent="toggleRowSelection(item)"
              >
                <Transition name="avatar-selection" mode="out-in">
                  <div v-if="item.checked" key="selected" class="selection-indicator" aria-hidden="true">
                    <Icon icon="mdi:check" width="22" height="22" />
                  </div>
                  <SenderAvatar v-else key="avatar" :email="item" :size="46" />
                </Transition>
              </div>
              <div v-else class="row-avatar" aria-hidden="true">
                <SenderAvatar :email="item" :size="settingStore.mailListDensity === 'compact' ? 26 : 28" />
              </div>
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
                    <!-- Empty previews still occupy the third line on phones. -->
                    <span v-if="listPreview(item)" class="email-content">{{ listPreview(item) }}</span>
                    <span v-else-if="isPhone" class="email-content" aria-hidden="true">&#8203;</span>
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
                  <span v-if="isPhone && item.unread === EmailUnreadEnum.UNREAD && showUnread" class="unread-dot" aria-label="Unread" />
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
          <el-dropdown-item v-if="props.type === 'archive'" @click="handleUnarchive([rightClickEmail.emailId])">
            <template #default>
              <div class="right-dropdown-item">
                <AppIcon name="nova-sidebar-inbox" :size="18" inline />
                <span>{{t('unarchive')}}</span>
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
  SWIPE_ACTIONS,
  SWIPE_AXIS,
  clampSwipeOffset,
  normalizeSwipeAction,
  resolveSwipeAxis,
  resolveSwipeRelease,
  swipeCommitDistance,
} from '@/utils/swipe-actions.js'
import { MAIL_DENSITY_GEOMETRY, normalizeMailDensity } from '@/utils/mail-density.js'
import {
  archiveMessages,
  trashMessages,
  unarchiveMessages,
  permanentlyDeleteMessages,
  registerMailListController,
  unregisterMailListController,
  setMailClearStarHook,
} from '@/utils/mail-mutations.js'

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
const densityGeometry = computed(() => MAIL_DENSITY_GEOMETRY[normalizeMailDensity(settingStore.mailListDensity)])
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
const mobileSelecting = ref(false)
const keyboardFocusedId = ref(0)

// All list folders use this one toolbar. Delete keeps its normal-folder
// meaning (move to Trash); only the Trash folder is wired to the permanent
// delete mutation by the page that owns the list.
const selectionActions = computed(() => ({
  archive: props.type !== 'archive' && props.type !== 'trash' && typeof props.emailArchive === 'function',
  unarchive: props.type === 'archive' && typeof props.emailUnarchive === 'function',
  trash: props.type !== 'trash' && typeof props.emailDelete === 'function',
  permanentDelete: props.type === 'trash' && typeof props.emailDelete === 'function',
}))

let longPressTimer = null
let longPressTriggered = false
let longPressStartX = 0
let longPressStartY = 0
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
const selectionMode = computed(() => mobileSelecting.value || selectedCount.value > 0)
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
  removeEmailsOptimistically,
  restoreEmailsOptimistically,
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

// The capability surface the shared mutation layer drives. It owns nothing but
// the local list: remove/restore rows, clear/restore the whole list for Empty
// Trash, and reconcile with a refetch when a mutation asks for it.
const mailListController = {
  remove: ids => removeEmailsOptimistically(ids),
  restore: snapshot => restoreEmailsOptimistically(snapshot),
  clearAll: () => clearAllOptimistically(),
  restoreAll: snapshot => restoreAllOptimistically(snapshot),
  reconcile: () => refreshList(),
}

onMounted(() => {
  registerMailListController(props.type, mailListController)
  // Archive/trash unstar a row on the server; mirror that across every list.
  setMailClearStarHook(ids => emailStore.clearStarForEmailIds(ids))
  timer = setInterval(() => {
    emailList.forEach(email => {
      email.formatCreateTime = formatListClock(email.createTime);
    })
  }, 1000 * 60);
})

onUnmounted(() => {
  unregisterMailListController(props.type, mailListController)
  clearInterval(timer)
  stopLongPress()
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

const visibleList = computed(() => {
  if (!isPhone.value || props.type !== 'email') {
    return list.value
  }

  const query = mobileSearch.value.toLocaleLowerCase()

  return list.value.filter(item => {
    if (item.expand) return true

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

    return matchesSearch
  })
})

const lastVisibleMailIndex = computed(() => {
  for (let index = visibleList.value.length - 1; index >= 0; index -= 1) {
    if (!visibleList.value[index].expand) return index
  }
  return -1
})

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

function toggleRowSelection(item) {
  if (!item.checked && isSelectMax.value) return
  if (isPhone.value) mobileSelecting.value = true
  item.checked = !item.checked
}

function startLongPress(event, item) {
  if (!isPhone.value || event.pointerType === 'mouse' || longPressTimer) return
  if (!item.checked && isSelectMax.value) return

  longPressStartX = event.clientX
  longPressStartY = event.clientY
  longPressTriggered = false
  longPressTimer = setTimeout(() => {
    longPressTimer = null
    mobileSelecting.value = true
    item.checked = true
    longPressTriggered = true
  }, 500)
}

function stopLongPress() {
  if (longPressTimer) clearTimeout(longPressTimer)
  longPressTimer = null
}

function cancelLongPressOnMove(event) {
  if (!longPressTimer) return
  const dx = event.clientX - longPressStartX
  const dy = event.clientY - longPressStartY
  if (Math.hypot(dx, dy) > 10) stopLongPress()
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
  typeof props.emailArchive === 'function' &&
  swipeActionSlots.value.length > 0
)

const swipeActionSlots = computed(() => [
  { direction: 'left', action: normalizeSwipeAction(settingStore.swipeLeftAction, 'trash') },
  { direction: 'right', action: normalizeSwipeAction(settingStore.swipeRightAction, 'archive') },
].map(slot => ({ ...slot, config: SWIPE_ACTIONS[slot.action] }))
  .filter(slot => slot.action !== SWIPE_ACTIONS.none.id && canRunSwipeAction(slot.action)))

function canRunSwipeAction(action) {
  return {
    archive: typeof props.emailArchive === 'function',
    trash: typeof props.emailDelete === 'function',
    read: typeof props.emailRead === 'function',
    unread: typeof props.emailUnread === 'function',
    star: typeof props.starAdd === 'function' && typeof props.starCancel === 'function',
  }[action] === true
}

function configuredSwipeActionForOffset(offset) {
  if (offset > 0) return swipeActionSlots.value.find(slot => slot.direction === 'right')?.action || null
  if (offset < 0) return swipeActionSlots.value.find(slot => slot.direction === 'left')?.action || null
  return null
}

function swipeEnabled() {
  return isPhone.value
    && props.type === 'email'
    && !mobileSelecting.value
    && swipeActionsReady.value
}

function setSwipeActionVisibility(shellEl, action) {
  shellEl?.querySelectorAll('.swipe-action').forEach(element => {
    element.style.display = element.dataset.action === action ? 'flex' : 'none'
  })
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
  cancelLongPressOnMove(event)

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
  const swipeAction = configuredSwipeActionForOffset(offset)

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

  if (gesture.axis !== SWIPE_AXIS.HORIZONTAL) {
    gesture.rowEl.style.transition = ''
    return
  }

  const { commit } = resolveSwipeRelease({
    dx: gesture.dx,
    dy: gesture.dy,
    width: gesture.shellEl?.offsetWidth || 0,
  })

  // The release action must be the *configured* swipe action (Archive / Move to
  // Trash / …), not the raw left/right direction. `resolveSwipeRelease` reports
  // a generic "delete" direction that has no configured-action entry, so using
  // its action here silently dropped left-swipe Delete.
  const action = gesture.swipeAction || configuredSwipeActionForOffset(gesture.dx)

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
  if (longPressTriggered) {
    longPressTriggered = false
    event.stopPropagation()
    event.preventDefault()
    return
  }

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

function performSwipeAction(item, action) {
  if (action === 'read') {
    localRead([item.emailId])
    return props.emailRead([item.emailId])
  }

  if (action === 'unread') {
    localUnread([item.emailId])
    return props.emailUnread([item.emailId])
  }

  if (action === 'star') {
    return starChange(item, { rethrow: true })
  }

  return Promise.resolve()
}

function commitSwipe(gesture, action) {
  const { rowEl, shellEl, item } = gesture
  const width = shellEl?.offsetWidth || 0
  const direction = gesture.dx > 0 ? 1 : -1

  if (!SWIPE_ACTIONS[action]) return

  if (!SWIPE_ACTIONS[action].removable) {
    const request = performSwipeAction(item, action)
    springBackSwipe(gesture)
    Promise.resolve(request).then(() => {
      showSwipeOutcome(action)
    }).catch(error => {
      console.error(error)
      refreshList()
      ElMessage({ message: t('swipeActionFailMsg'), type: 'error', plain: true })
    })
    return
  }

  // Lock the action before starting the exit. The row must never pass through
  // the neutral state while it is still rendered.
  gesture.swipeAction = action
  setSwipeActionVisibility(shellEl, action)
  shellEl?.setAttribute('data-swipe-action', action)
  shellEl?.classList.add('is-removing')
  rowEl.style.transition = SWIPE_SETTLE
  rowEl.style.transform = `translate3d(${direction * width}px, 0, 0)`
  rowEl.style.opacity = '0'

  // Complete the visible exit first, then hand the row to the shared mutation
  // pipeline — it removes the row, starts the request and offers Undo without
  // waiting for HTTP. A failed request restores the row to its old position.
  let exitFinished = false
  const finishExit = event => {
    if (exitFinished || (event && event.target !== rowEl)) return
    exitFinished = true
    rowEl.removeEventListener('transitionend', finishExit)

    const message = t(SWIPE_ACTIONS[action]?.labelKey || 'swipeActionNone')
    if (action === 'archive') {
      archiveMessages([item.emailId], {
        persist: props.emailArchive,
        undoPersist: props.emailUnarchive,
        message,
      })
    } else {
      trashMessages([item.emailId], {
        persist: props.emailDelete,
        undoPersist: props.emailRestore,
        undoable: typeof props.emailRestore === 'function',
        message,
      })
    }

    // Let Vue remove the virtual-list row first. Cleaning the imperative
    // styles in the same tick could expose the neutral state for one frame.
    nextTick(() => {
      if (shellEl?.isConnected) clearSwipeVisuals(gesture)
    })
  }

  rowEl.addEventListener('transitionend', finishExit)
  // transitionend is not guaranteed when the browser backgrounds a tab.
  window.setTimeout(finishExit, 260)
}

function showSwipeOutcome(action) {
  ElMessage({ message: t(SWIPE_ACTIONS[action]?.labelKey || 'swipeActionNone'), type: 'success', plain: true })
}

const itemHeight = computed(() => {
    if (props.type === 'all-email') {
      return isMobile.value ? 132 : 65;
    }
    // CSS and the virtual list consume the same geometry, including the
    // 768–1366px range that uses the desktop row layout.
    return isPhone.value
      ? (props.type === 'email' ? densityGeometry.value.phone : densityGeometry.value.phoneOther)
      : densityGeometry.value.desktop;
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

watch(selectedCount, (count) => {
  if (count === 0) mobileSelecting.value = false
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

  // The mail list has no long-press action menu on phones. Detail views keep
  // their own context actions because this guard is scoped to this list.
  if (isPhone.value) {
    event.preventDefault()
    event.stopPropagation()
    return
  }

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

function starChange(email, { rethrow = false } = {}) {
  if (!email.isStar) {
    if (!props.allowStar) return Promise.reject(new Error('Star action is disabled'))

    syncStarState(email, 1)

    return props.starAdd(email.emailId).then(() => {
      syncStarState(email, 1)
      props.starSuccess(email)
    }).catch(e => {
      console.error(e)
      syncStarState(email, 0)
      if (rethrow) throw e
    })
  } else {
    syncStarState(email, 0)

    return props.starCancel(email.emailId).then(() => {
      syncStarState(email, 0)
      props.cancelSuccess?.(email)
    }).catch(e => {
      console.error(e)
      syncStarState(email, 1)
      if (rethrow) throw e
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
  // Same pipeline as the toolbar, including the Trash view's permanent-delete
  // confirmation: a right-clicked Trash row must never bypass confirmation.
  handleDelete([emailId])
}

function handleArchive(ids = getSelectedMailsIds()) {
  archiveMessages(ids, {
    persist: props.emailArchive,
    undoPersist: props.emailUnarchive,
  })
}

function handleUnarchive(ids = getSelectedMailsIds()) {
  unarchiveMessages(ids, { persist: props.emailUnarchive })
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

    const permanent = Boolean(props.deleteConfirmText)
    if (permanent) {
      permanentlyDeleteMessages(ids, { persist: props.emailDelete })
    } else {
      // Undo is only offered when the folder owns a restore path. The admin
      // All Mail list moves a row to the owner's Trash but cannot restore it.
      trashMessages(ids, {
        persist: props.emailDelete,
        undoPersist: props.emailRestore,
        undoable: typeof props.emailRestore === 'function',
      })
    }
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
  removeEmailsOptimistically(emailIds)
}

function captureEmailSnapshot(ids) {
  const idSet = new Set((ids || []).map(Number))
  return emailList
    .map((item, index) => ({ item, index, isStar: item.isStar, checked: item.checked }))
    .filter(entry => idSet.has(Number(entry.item.emailId)))
}

/** Remove all rows as one transaction — never sequentially per message. */
function removeEmailsOptimistically(ids, snapshot = captureEmailSnapshot(ids)) {
  const idSet = new Set((ids || []).map(Number))
  const rows = snapshot.length ? snapshot : captureEmailSnapshot(ids)
  if (!rows.length) return rows

  for (const entry of [...rows].sort((a, b) => b.index - a.index)) {
    const index = emailList.findIndex(item => Number(item.emailId) === Number(entry.item.emailId))
    if (index >= 0) emailList.splice(index, 1)
  }
  rows.forEach(({ item }) => { item.checked = false })
  total.value = Math.max(0, Number(total.value || 0) - rows.length)
  checkAll.value = false
  isIndeterminate.value = false
  return rows
}

function restoreEmailsOptimistically(snapshot) {
  if (!snapshot?.length) return
  for (const entry of [...snapshot].sort((a, b) => a.index - b.index)) {
    if (emailList.some(item => Number(item.emailId) === Number(entry.item.emailId))) continue
    entry.item.checked = entry.checked
    entry.item.isStar = entry.isStar
    emailList.splice(Math.max(0, Math.min(entry.index, emailList.length)), 0, entry.item)
    syncStarState(entry.item, entry.isStar)
    total.value += 1
  }
}

function clearAllOptimistically() {
  const snapshot = emailList.map((item, index) => ({
    item,
    index,
    isStar: item.isStar,
    checked: item.checked,
  }))
  emailList.length = 0
  total.value = 0
  checkAll.value = false
  isIndeterminate.value = false
  mobileSelecting.value = false
  return snapshot
}

function restoreAllOptimistically(snapshot) {
  if (!snapshot?.length) return
  for (const entry of [...snapshot].sort((a, b) => a.index - b.index)) {
    if (emailList.some(item => Number(item.emailId) === Number(entry.item.emailId))) continue
    entry.item.checked = entry.checked
    entry.item.isStar = entry.isStar
    emailList.splice(Math.max(0, Math.min(entry.index, emailList.length)), 0, entry.item)
    syncStarState(entry.item, entry.isStar)
  }
  total.value = snapshot.length
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

  if (selectionMode.value) {
    toggleRowSelection(email)
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

:deep(.row-avatar) {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--mail-list-avatar-column);
  height: var(--mail-list-avatar-column);
  flex: 0 0 var(--mail-list-avatar-column);
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  transition: background-color 140ms ease, transform 140ms ease;
}

:deep(.row-avatar .sender-avatar) {
  transition: opacity 140ms ease, transform 140ms ease;
}

:deep(.selection-indicator) {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  color: var(--el-color-white, #fff);
  background: var(--el-color-primary);
  transition: opacity 140ms ease, transform 140ms ease;
}

:deep(.selection-indicator .iconify) {
  color: inherit;
}

.avatar-selection-enter-active,
.avatar-selection-leave-active {
  transition: opacity 140ms ease, transform 140ms ease;
}

.avatar-selection-enter-from,
.avatar-selection-leave-to {
  opacity: 0;
  transform: scale(.86);
}

.email-container {
  --mail-list-selection-column: 24px;
  --mail-list-unread-column: 10px;
  --mail-list-avatar-column: 28px;
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

.mail-list-secondary-toolbar {
  width: 100%;
  min-width: 0;
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
  min-height: 48px;
  gap: 12px;
  padding: 0 14px;
  box-shadow: inset 0 -1px 0 var(--nova-divider);

  .header-left {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    min-width: 0;
    position: relative;
    column-gap: 14px;
    row-gap: 0;
    padding-left: 2px;
    color: var(--el-text-color-primary);;
  }

  /* Slot content comes from several mail views. It must occupy the flexible
     grid track instead of preserving a max-content width and colliding with
     the checkbox or right-hand controls. */
  .selection-slot {
    display: flex;
    align-items: center;
    min-width: 0;
    flex: 1 1 auto;
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

/* Desktop rows and the selection header share the exact checkbox column.
   Density only changes vertical geometry and the image inside the avatar slot. */
@media (min-width: 768px) {
  .header-actions {
    grid-template-columns: var(--mail-list-selection-column) minmax(0, 1fr) auto;
    column-gap: var(--mail-list-column-gap);
    height: auto;
    padding-right: var(--mail-list-horizontal-padding);
    padding-left: var(--mail-list-checkbox-inset);
  }

  .header-right.desktop-sort-group {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    padding-right: 2px;
  }

  :deep(.email-row:not(.all-email)) {
    display: grid;
    grid-template-columns: var(--mail-list-selection-column) var(--nova-icon-button-size) var(--mail-list-unread-column) var(--mail-list-avatar-column) minmax(0, 1fr) 82px;
    align-items: center;
    gap: var(--mail-list-column-gap);
    height: var(--mail-row-height-desktop);
    min-height: var(--mail-row-height-desktop);
    padding: 4px var(--mail-list-horizontal-padding);
    box-sizing: border-box;
  }

  :deep(.email-row:not(.all-email) > .desktop-row-checkbox) {
    grid-column: 1;
  }

  :deep(.email-row > .pc-star),
  :deep(.email-row > .pc-star-placeholder) {
    display: flex;
    flex: 0 0 var(--nova-icon-button-size);
    width: var(--nova-icon-button-size);
    justify-content: center;
  }

  :deep(.email-row:not(.all-email) > .pc-star),
  :deep(.email-row:not(.all-email) > .pc-star-placeholder) {
    grid-column: 2;
  }

  :deep(.email-row > .desktop-unread-indicator) {
    display: grid;
    place-items: center;
    flex: 0 0 var(--mail-list-unread-column);
    width: var(--mail-list-unread-column);
    height: var(--mail-list-unread-column);
  }

  :deep(.email-row:not(.all-email) > .desktop-unread-indicator) {
    grid-column: 3;
  }

  :deep(.email-row:not(.all-email) > .row-avatar),
  :deep(.email-row:not(.all-email) > .desktop-avatar-skeleton) {
    grid-column: 4;
  }

  :deep(.email-row > .row-avatar) {
    pointer-events: none;
    cursor: inherit;
  }

  /* The narrow-layout inline meta/action must not duplicate the desktop
     Star and Time columns between the mobile and wide-screen breakpoints. */
  :deep(.email-row:not(.all-email) .phone-star),
  :deep(.email-row:not(.all-email) .phone-time) {
    display: none;
  }

  :deep(.email-row:not(.all-email) .title) {
    grid-column: 5;
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
    grid-template-columns: minmax(0, 55%) minmax(0, 1fr);
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

  :deep(.email-row:not(.all-email) > .email-right),
  :deep(.email-row:not(.all-email) > .email-right-skeleton) {
    grid-column: 6;
    display: block;
    min-width: 0;
    overflow: hidden;
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

  :deep(.email-row[data-checked="true"]),
  :deep(.email-row[data-checked="true"]:hover) {
    background: var(--nova-selected);
  }
}

/* Mobile rows use one stable avatar/content/time layout so the avatar,
   sender, time, subject and preview cannot drift apart. */
@media (max-width: 767px) {
  .email-container {
    --mail-list-avatar-column: 46px;
    /* The three direct children are search, the (normally zero-height)
       selection toolbar, and the scrollable list. Keep all three tracks
       explicit: otherwise the list becomes an implicit row after the flexible
       toolbar track and is bottom-aligned when a mailbox has few messages. */
    grid-template-rows: auto auto minmax(0, 1fr);
  }

  .mail-list-secondary-toolbar {
    min-width: 0;
    height: 0;
    min-height: 0;
    overflow: hidden;
  }

  .mail-list-secondary-toolbar.has-secondary-toolbar {
    height: 48px;
    min-height: 48px;
  }

  .secondary-toolbar-fade-enter-active,
  .secondary-toolbar-fade-leave-active {
    transition: opacity 140ms ease;
  }

  .secondary-toolbar-fade-enter-from,
  .secondary-toolbar-fade-leave-to {
    opacity: 0;
  }

  :deep(.email-row:not(.all-email)) {
    display: grid;
    grid-template-columns: var(--mail-list-avatar-column) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    column-gap: 8px;
    align-items: start;
    height: var(--mail-row-height-phone-other);
    min-height: var(--mail-row-height-phone-other);
    padding: 8px 20px 8px 16px;
    box-sizing: border-box;
    overflow: hidden;
  }

  /* Desktop-only controls do not consume a mobile grid track. */
  :deep(.email-row > .desktop-row-checkbox),
  :deep(.email-row > .pc-star-placeholder),
  :deep(.email-row > .desktop-unread-indicator) {
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
    height: 24px;
    line-height: 24px;
    overflow: hidden;
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
    height: 41px;
    margin-top: 0;
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
    height: 20px;
    line-height: 20px;
  }

  :deep(.email-row:not(.all-email) .email-content) {
    height: 20px;
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
.mobile-row-star,
/* Swipe actions are a phone-only affordance; the media query below lays them
   out. Without this the desktop layout would show both action panels. */
.swipe-actions {
  display: none;
}

@media (max-width: 767px) {
  .email-container {
    grid-template-rows: auto auto minmax(0, 1fr);
    background: var(--nova-surface);
    color: var(--mobile-primary);
  }

  /* ---------- Inbox tools ---------- */

  .mobile-inbox-tools {
    display: block;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    padding: 0;
    background: var(--nova-surface);
  }

  /* Shared mailbox boundary: it uses the same horizontal inset as each mail
     row's divider, so Inbox, Unread and every other list begin consistently. */
  .mobile-inbox-tools::after {
    content: '';
    display: block;
    height: 1px;
    /* The divider is the list's top edge. The first row begins immediately
       after it and supplies its own existing 10px content inset. */
    margin: 0 16px;
    background: var(--nova-divider-soft, color-mix(in srgb, var(--nova-divider) 55%, transparent));
  }

  /* ---------- Search row ---------- */

  .mobile-search-row {
    /* Page gutter shared with the app bar and mail rows. */
    /* Keep a compact 11px lead-in before the shared list divider. */
    padding: 2px 12px 11px;
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

  /* Keep sorting at the right edge while the search field owns the remaining
     width (see `.mobile-search-row`). */
  .mobile-filter-actions {
    flex: 0 0 auto;

    display: flex;
    align-items: center;
  }

  /* Preserve the existing glyph size while giving the sort action a reliable
     phone-sized touch target. */
  .mobile-filter-actions .mobile-sort {
    flex: 0 0 44px;
    width: 44px;
    height: 44px;
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

  /* ---------- Shared secondary toolbar ---------- */

  .mail-list-secondary-toolbar > .header-actions {
    display: grid;

    /* The selection toolbar is its own full-width region. Its divider must not
       inherit the inset used by message rows. */
    grid-template-columns: var(--mail-list-selection-column) auto;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;

    height: 48px;
    min-height: 48px;
    padding: 4px 8px;
    column-gap: 4px;
    border-bottom: 1px solid var(--nova-divider);
    box-shadow: none;
  }

  .mail-list-secondary-toolbar > .header-actions .header-left {
    width: max-content;
    gap: 4px;
    padding-left: 0 !important;
  }

  .mail-list-secondary-toolbar > .header-actions .selection-slot,
  .mail-list-secondary-toolbar > .header-actions .header-right {
    display: none;
  }

  .mail-list-secondary-toolbar > .header-actions .selection-action {
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
    /* Safe edge | avatar slot | fixed gap | content | time. The avatar is
       also the selection control, so both states share this exact geometry. */
    grid-template-columns: 46px 12px minmax(0, 1fr) 64px;

    column-gap: 0;

    width: 100%;
    /* Normal: 10px top + 60px text track + 10px bottom = 80px. The filter
       separator stays outside this row; every mail divider is inside it.
       The virtual list uses the same value in `itemHeight` above. */
    height: var(--mail-row-height-phone);
    min-height: var(--mail-row-height-phone);

    /* Keep the avatar naturally inset from the screen while tightening the
       leading edge. The same slot is used by the selected check indicator. */
    padding: 10px 16px;

    box-sizing: border-box;

    align-items: start;

    border: 0;
    background: var(--nova-surface);
  }

  :deep(.virtual > div > div > .swipe-shell > .email-row.email:not(.all-email))::after {
    content: '';

    position: absolute;
    /* Each row owns the divider below it. Keeping it inside the row avoids
       changing the virtual list's fixed 80px item height. */
    left: 16px;
    right: 16px;
    bottom: 0;

    height: 1px;

    background: var(--nova-divider-soft, color-mix(in srgb, var(--nova-divider) 55%, transparent));
    pointer-events: none;
  }

  :deep(.email-row.email:active) {
    background: var(--nova-selected);
  }

  /* The desktop star column is hidden on touch layouts. */
  :deep(.email-row.email > .pc-star),
  :deep(.email-row.email > .email-right) {
    display: none;
  }

  /* ---------- Sender avatar ---------- */

  :deep(.email-row.email > .row-avatar) {
    grid-column: 1;

    width: 46px;
    height: 46px;
    min-width: 46px;
    min-height: 46px;
    flex: 0 0 46px;
    flex-shrink: 0;

    /* The fixed avatar track keeps the message text aligned in every state. */
    justify-self: start;
    align-self: center;

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

  :deep(.row-avatar .sender-avatar-image) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* ---------- Message body ---------- */

  :deep(.email-row.email > .title) {
    /* Let the body span through the former time column. Only the sender line
       reserves room for the separately positioned time meta below. */
    grid-column: 3 / 5;

    width: 100%;
    min-width: 0;
    max-width: 100%;

    display: flex;
    flex-direction: column;

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

    padding-right: 64px;

    /* Sender is the strongest line: largest type, heaviest weight, primary ink. */
    height: 20px;
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
    position: absolute;
    top: 10px;
    right: 16px;
    width: 64px;
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
    height: 38px;

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
    height: 19px;
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
    height: 18px;
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

  .scroll {
    position: relative;
    width: 100%;
    max-width: 100%;
    min-width: 0;
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

  :deep(.swipe-shell[data-swipe-action='archive'] .swipe-actions),
  :deep(.swipe-shell[data-swipe-action='read'] .swipe-actions),
  :deep(.swipe-shell[data-swipe-action='unread'] .swipe-actions),
  :deep(.swipe-shell[data-swipe-action='star'] .swipe-actions) {
    background: color-mix(in srgb, var(--el-color-primary) 16%, var(--nova-surface-muted));
  }

  :deep(.swipe-shell[data-swipe-action='trash'] .swipe-actions) {
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

  /* The action on the right is revealed by dragging right; the action on the
     left is revealed by dragging left. */
  :deep(.swipe-action-right) {
    left: 0;
  }

  :deep(.swipe-action-left) {
    right: 0;
  }

  :deep(.swipe-action[data-action='trash']) {
    color: var(--el-color-danger);
  }

  :deep(.swipe-action[data-action='archive']),
  :deep(.swipe-action[data-action='read']),
  :deep(.swipe-action[data-action='unread']),
  :deep(.swipe-action[data-action='star']) {
    color: var(--el-color-primary);
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

  /* Inline visibility is switched by the gesture so an old action cannot
     flash while a virtual-list row is being reused. */
  :deep(.swipe-shell[data-swipe-action] .swipe-action[style*="display: flex"]) {
    filter: brightness(1.05);
    opacity: 1;
  }
}

/* Density changes vertical geometry only. The avatar column, text start,
   timestamp column and horizontal safe-area insets stay identical. */
@media (min-width: 768px) {
  .email-container.density-compact :deep(.email-row:not(.all-email)) {
    padding-top: 3px;
    padding-bottom: 3px;
  }
}

@media (max-width: 767px) {
  .email-container.density-compact :deep(.email-row:not(.all-email):not(.email)) {
    padding-top: 5px;
    padding-bottom: 5px;
  }

  .email-container.density-compact :deep(.email-row:not(.all-email):not(.email) .email-text) {
    height: 36px;
    margin-top: 0;
  }

  .email-container.density-compact :deep(.email-row:not(.all-email):not(.email) .email-subject),
  .email-container.density-compact :deep(.email-row:not(.all-email):not(.email) .email-content) {
    height: 18px;
    line-height: 18px;
  }

  .email-container.density-compact :deep(.email-row:not(.all-email):not(.email) .email-content) {
    margin-top: 0;
  }

  .email-container.density-compact :deep(.email-row.email:not(.all-email)) {
    /* Compact: 8px top + 52px text track + 8px bottom = 68px. */
    padding-top: 8px;
    padding-bottom: 8px;
  }

  .email-container.density-compact :deep(.email-row.email .title .email-sender) {
    height: 18px;
    line-height: 18px;
    margin-bottom: 0;
  }

  .email-container.density-compact :deep(.email-row.email .email-text) {
    height: 34px;
    margin-top: 0;
  }

  .email-container.density-compact :deep(.email-row.email .email-subject),
  .email-container.density-compact :deep(.email-row.email .email-text .email-content) {
    height: 17px;
    line-height: 17px;
  }

  .email-container.density-compact :deep(.email-row.email .email-text .email-content) {
    margin-top: 0;
  }

  .email-container.density-compact :deep(.email-row.email > .email-right) {
    top: 8px;
  }
}

</style>
