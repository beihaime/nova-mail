<template>
  <div class="email-container" :class="{ 'mobile-selecting': mobileSelecting }">
    <div v-if="type === 'email'" class="mobile-inbox-tools">
      <div class="mobile-search-row">
        <label class="mobile-search">
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
      </div>

      <div class="mobile-filter-bar">
        <div class="mobile-filters">
          <button
              v-for="filter in mobileFilters"
              :key="filter.key"
              :class="{ active: mobileFilter === filter.key }"
              @click="selectMobileFilter(filter.key)"
          >
            {{ filter.label }}
          </button>
        </div>

        <button
            class="mobile-tool-button mobile-sort"
            :aria-label="t('sortByTime')"
            @click="mobileSortClick"
        >
          <Icon icon="solar:sort-vertical-linear" width="21" height="21" />
        </button>

        <button
            class="mobile-tool-button"
            :aria-label="mobileSelecting ? t('cancel') : t('multiSelect')"
            @click="toggleMobileSelection"
        >
          <Icon icon="solar:menu-dots-bold" width="21" height="21" />
        </button>
      </div>
    </div>

    <div class="header-actions">
      <el-checkbox
          v-model="checkAll"
          :indeterminate="isIndeterminate"
          :disabled="!emailList.length || loading"
          @change="handleCheckAllChange"
      >
      </el-checkbox>
      <div class="header-left" :style="'padding-left:' + actionLeft">

        <slot name="first"></slot>
        <AppIcon class="icon reload" name="refresh" :size="18" @click="refresh"/>
        <AppIcon v-perm="'email:delete'" class="icon delete" name="delete-outline" :size="18"
              v-if="getSelectedMailsIds().length > 0"
              @click="handleDelete"/>
        <AppIcon v-perm="'email:delete'" class="icon delete" name="mail-unread" :size="20"
              v-if="getSelectedMailsIds().length > 0 && showUnread"
              @click="handleRead"/>
      </div>

      <div class="header-right">
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
            <div :class="['email-row', props.type, {
                  'right-checked': item.rightChecked,
                  'is-unread': item.unread === EmailUnreadEnum.UNREAD && showUnread
                }]"
                 :data-checked="item.checked"
                 @click="jumpDetails(item)"
                 v-if="!item.expand"
                 :key="item.emailId"
                 @contextmenu="handleContextmenu($event, item)"
                 @pointerdown="startLongPress($event, item)"
                 @pointerup="stopLongPress"
                 @pointerleave="stopLongPress"
                 @pointercancel="stopLongPress"
            >
              <el-checkbox :class=" props.type === 'all-email' ? 'all-email-checkbox' : 'checkbox'"
                           v-model="item.checked"
                           :disabled="!item.checked && isSelectMax"
                           @click.stop></el-checkbox>
              <div @click.stop="starChange(item)" class="pc-star" v-if="showStar">
                <Icon
                    :class="['inbox-star-icon', { 'is-active': item.isStar }]"
                    :icon="item.isStar ? 'solar:star-bold' : 'solar:star-linear'"
                    width="19"
                    height="19"
                />
              </div>
              <div v-if="!showStar"></div>
              <!-- Reserved unread gutter. The slot always owns its track, so a
                   read/unread flip cannot shift the avatar or the message text;
                   only the dot inside it is conditional. -->
              <span
                  v-if="type === 'email'"
                  class="mobile-unread-slot"
                  aria-hidden="true"
              >
                <span
                    v-if="item.unread === EmailUnreadEnum.UNREAD && showUnread"
                    class="mobile-unread-dot"
                />
              </span>
              <span
                  v-if="type === 'email'"
                  class="mobile-sender-avatar"
              >{{ (item.name || item.sendEmail || '?').trim().charAt(0).toUpperCase() }}</span>
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
                      <div class="unread" v-if="isMobile && (item.unread === EmailUnreadEnum.UNREAD && showUnread) "/>
                      <slot name="name" :email="item"> {{ item.name }}</slot>
                    </span>
                  </span>
                  <span class="phone-time">{{ item.formatCreateTime }}</span>
                </div>
                <div>
                  <div class="email-text">
                    <span class="email-subject" :style="(item.unread === EmailUnreadEnum.UNREAD && showUnread)  ? 'font-weight: bold' : ''">
                      <div class="unread" v-if="!isMobile && (item.unread === EmailUnreadEnum.UNREAD && showUnread) "/>
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
                <span class="email-time" :style="(item.unread === EmailUnreadEnum.UNREAD && showUnread) ? 'font-weight: bold' : ''">{{ item.formatCreateTime }}</span>
              </div>
              <!-- Fixed right-hand metadata/action column (time above star).
                   Both share one centred flex column so the star never drifts
                   with the timestamp's width. -->
              <div v-if="type === 'email'" class="mobile-row-meta">
                <span class="mobile-meta-time">{{ item.formatCreateTime }}</span>
                <button
                    v-if="showStar"
                    class="mobile-row-star"
                    :aria-label="t('star')"
                    @click.stop="starChange(item)"
                >
                  <Icon
                      :class="['inbox-star-icon', { 'is-active': item.isStar }]"
                      :icon="item.isStar ? 'solar:star-bold' : 'solar:star-linear'"
                      width="19"
                      height="19"
                  />
                </button>
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
                <Icon icon="solar:star-line-duotone" width="19" height="19"/>
                <span>{{t('star')}}</span>
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
                <Icon icon="uiw:delete" width="16" height="20" style="margin-left: 1px;margin-right: 3px" />
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
import {fromNow} from "@/utils/day.js";
import {useI18n} from "vue-i18n";
import {EmailUnreadEnum} from "@/enums/email-enum.js";
import { UseVirtualList } from '@vueuse/components'
import { useScroll } from '@vueuse/core'
import SenderAvatar from '@/components/sender-avatar/index.vue'
import { MAIL_BODY_TYPE, unwrapNestedMessage, looksLikeMarkdownDocument } from '@/utils/mail-html.js'
import { stripMarkdown } from '@/utils/quoted-text.js'

const props = defineProps({
  getEmailList: Function,
  emailDelete: Function,
  emailRead: Function,
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
  'refresh-before',
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

const mobileFilters = computed(() => [
  { key: 'all', label: t('all') },
  { key: 'unread', label: t('unreadMail') },
  { key: 'attachments', label: t('withAttachments') },
  { key: 'star', label: t('starred') }
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
  total
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
      email.formatCreateTime = fromNow(email.createTime);
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
      (mobileFilter.value === 'star' && !!item.isStar)

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

const handleRead = () => {
  const emailIds = getSelectedMailsIds();
  props.emailRead(emailIds);
  localRead(emailIds);
}

function emailRead(emailId) {
  props.emailRead([emailId])
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

function rightDelete(emailId) {

  if (props.type === 'all-email') {
    ElMessageBox.confirm(t('delOneEmailConfirm'), {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      type: 'warning'
    }).then(() => {
      props.emailDelete([emailId]).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true
        })
        emailStore.deleteIds = [emailId];
      })
    })
    return;
  }
  props.emailDelete([emailId]).then(() => {
    ElMessage({
      message: t('delSuccessMsg'),
      type: 'success',
      plain: true
    })
    emailStore.deleteIds = [emailId];
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

function handleDelete() {
  ElMessageBox.confirm(t('delEmailsConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {

    if (props.type === 'draft') {
      const draftIds = getSelectedDraftsIds();
      emit('delete-draft', draftIds);
      return;
    }

    const emailIds = getSelectedMailsIds();
    props.emailDelete(emailIds).then(() => {
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true
      })
      emailStore.deleteIds = emailIds;
    })
  })
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

  email.formatCreateTime = fromNow(email.formatCreateTime);

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

function jumpDetails(email) {
  if (longPressTriggered) {
    longPressTriggered = false
    return
  }

  if (isPhone.value && mobileSelecting.value && props.type === 'email') {
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

  let emailId = emailList.length > 0 ? emailList.at(-1).emailId : 0;

  reqLock = true

  if (!refresh) {

    if (loading.value || noLoading.value) {
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

    noLoading.value = data.list.length < queryParam.size;
    followLoading.value = data.list.length >= queryParam.size;

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
    email.formatCreateTime = fromNow(email.createTime);
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

function refresh() {
  emit('refresh-before')
  if (props.skeleton) {
    scrollbarRef.value.setScrollTop(0)
  }
  refreshList()
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

.email-container {
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
    padding: 15px 0 0 0;
    color: var(--secondary-text-color);
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

  .checkbox {
    display: flex;
    padding-left: 2px;
    padding-right: 12px;
    justify-content: center;
  }

  .all-email-checkbox {
    display: flex;
    padding-left: 15px;
    padding-right: 20px;
    justify-content: center;
    @media (min-width: 1367px) {
      justify-content: start;
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
  display: flex;
  width: 40px;
}

.inbox-star-icon {
  color: var(--regular-text-color);
  opacity: .9;
}

.inbox-star-icon.is-active {
  color: var(--el-color-primary);
  opacity: 1;
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

:deep(.el-scrollbar__view) {
  height: 100%;
}

.header-actions {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  min-height: 48px;
  gap: 12px;
  padding: 7px 14px;
  box-shadow: inset 0 -1px 0 var(--nova-divider);

  .header-left {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    position: relative;
    column-gap: 14px;
    row-gap: 8px;
    padding-left: 2px;
    color: var(--el-text-color-primary);;
  }

  .header-right {
    display: grid;
    grid-template-columns: auto auto;
    align-items: start;
    height: 100%;
    color: var(--el-text-color-primary);;

    .email-count {
      white-space: nowrap;
      margin-top: 6px;
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
  :deep(.email-row:not(.all-email)) {
    display: grid;
    grid-template-columns: 24px 30px minmax(0, 1fr) 82px;
    align-items: center;
    gap: 8px;
    height: 48px;
    min-height: 48px;
    padding: 4px 14px;
  }

  :deep(.email-row:not(.all-email) .checkbox) {
    padding: 0;
  }

  :deep(.email-row:not(.all-email) .pc-star) {
    width: 30px;
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
  :deep(.email-row:not(.all-email)) {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    column-gap: 8px;
    align-items: start;
    height: 83px;
    min-height: 83px;
    padding: 8px 12px;
    box-sizing: border-box;
  }

  :deep(.email-row:not(.all-email) > .checkbox) {
    grid-column: 1;
    grid-row: 1;
    width: 18px;
    height: 18px;
    align-self: start;
    justify-content: flex-start;
    padding: 0;
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
    min-width: max-content;
    padding: 0;
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 28px;
    white-space: nowrap;
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
.mobile-unread-slot,
.mobile-sender-avatar,
.mobile-row-meta,
.mobile-row-star,
.mobile-filter-empty {
  display: none;
}

@media (max-width: 767px) {
  .email-container {
    grid-template-rows: auto minmax(0, 1fr);
    background: var(--nova-surface);
    color: var(--mobile-primary);
  }

  .email-container.mobile-selecting {
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
  }

  .mobile-search {
    width: 100%;
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

    /* Tight sides so tabs + sort/more read as one continuous toolbar. */
    padding: 2px 4px 5px 8px;

    display: flex;
    align-items: center;

    border-bottom: 1px solid var(--nova-divider-soft, color-mix(in srgb, var(--nova-divider) 55%, transparent));
  }

  .mobile-filters {
    flex: 1;
    min-width: 0;

    display: grid;
    grid-template-columns: 0.7fr 0.95fr 1.45fr 0.9fr;
    align-items: center;
    gap: 2px;

    overflow: hidden;
    white-space: nowrap;
  }

  .mobile-filters button {
    /* Content-sized pills: the active background hugs the label instead of
       filling the whole grid track. */
    width: auto;
    max-width: 100%;
    justify-self: center;
    min-width: 0;
    height: 32px;
    padding: 0 4px;
    box-sizing: border-box;

    border: 0;
    border-radius: 999px;

    color: var(--mobile-secondary);
    background: transparent;

    overflow: hidden;
    white-space: nowrap;
    text-overflow: clip;

    font-size: clamp(11.5px, 3.1vw, 13px);
    cursor: pointer;
  }

  .mobile-filters button.active {
    padding-inline: 8px;

    color: var(--el-color-primary);
    background: var(--nova-selected);

    font-weight: 650;
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

    grid-template-columns: 32px 1fr auto;

    min-height: 48px;
    padding: 5px 16px;
  }

  .email-container.mobile-selecting > .header-actions .header-left {
    gap: 12px;
  }

  .email-container.mobile-selecting
    > .header-actions
    .header-left
    > :first-child,
  .email-container.mobile-selecting
    > .header-actions
    .reload,
  .email-container.mobile-selecting
    > .header-actions
    .header-right {
    display: none;
  }

  /* ---------- Mail row ---------- */

  :deep(.email-row.email) {
    position: relative;

    display: grid;
    /* Unread gutter | avatar | message body | fixed metadata/action column.
       Every track except the message body is fixed width, so a read/unread
       flip or a long sender can never move the avatar, the time or the star. */
    grid-template-columns: 16px 44px minmax(0, 1fr) 62px;

    /* 8px between tracks; the tighter left inset pulls the whole row in. */
    column-gap: 8px;

    width: 100%;
    height: 80px;
    min-height: 80px;

    padding: 10px 12px 10px 8px;

    box-sizing: border-box;

    align-items: start;

    border: 0;
    background: var(--nova-surface);
  }

  :deep(.email-row.email)::after {
    content: '';

    position: absolute;
    /* Starts under the message body: padding-left + gutter + avatar + gaps. */
    left: 84px;
    right: 0;
    bottom: 0;

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
    :deep(.email-row.email) {
    /* The checkbox replaces the unread gutter in the first track. */
    grid-template-columns: 20px 44px minmax(0, 1fr) 62px;
  }

  .email-container.mobile-selecting
    :deep(.email-row.email > .checkbox) {
    grid-column: 1;

    display: flex;

    width: 20px;
    padding: 6px 0 0;
    margin: 0;
  }

  .email-container.mobile-selecting
    .mobile-unread-slot {
    display: none;
  }

  /* ---------- Unread gutter ---------- */

  /* A permanent 16px track left of the avatar. Read rows keep the empty slot so
     toggling read/unread never changes the row's horizontal geometry. */
  .mobile-unread-slot {
    grid-column: 1;

    /* Match the avatar's box so the dot lines up with the avatar's centre even
       though the row aligns its items to the top. */
    align-self: start;

    width: 100%;
    height: 44px;

    display: grid;
    place-items: center;
  }

  .mobile-unread-dot {
    width: 8px;
    height: 8px;

    border-radius: 999px;

    /* Hugs the avatar side of the gutter instead of the screen edge. */
    justify-self: end;

    background: var(--el-color-primary);
  }

  /* ---------- Sender avatar ---------- */

  .mobile-sender-avatar {
    grid-column: 2;

    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;

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

    overflow: hidden;
  }

  :deep(.email-row.email .title .email-sender) {
    width: 100%;
    min-width: 0;

    display: flex;
    align-items: baseline;

    gap: 4px;

    /* Sender is the strongest line: largest type, heaviest weight, primary ink. */
    line-height: 20px;
    margin-bottom: 1px;

    /* Overflow lives in the row's own meta column now. */
    padding-right: 0;

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
    flex: 1;
    min-width: 0;

    display: block;

    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  :deep(.email-row.email .name > span:last-child) {
    display: none;
  }

  /* The timestamp moved to the row's metadata column; the inline copy would
     duplicate it. */
  :deep(.email-row.email .phone-time) {
    display: none;
  }

  :deep(.email-row.email .email-text) {
    display: block;

    width: 100%;
    min-width: 0;

    padding-right: 0;
    margin-top: 1px;

    line-height: 18px;

    overflow: hidden;
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
  }

  :deep(.email-row.email.is-unread .email-subject) {
    font-weight: 600;
  }

  :deep(.email-row.email .email-text .email-content) {
    display: block;

    width: 100%;
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

  /* ---------- Unread blue dot ----------
     The dot itself lives in the reserved `.mobile-unread-slot` track (see
     above); no absolutely-positioned pseudo-element pins it to the edge. */

  /* ---------- Metadata column (time above star) ---------- */

  .mobile-row-meta {
    grid-column: 4;

    align-self: start;

    width: 62px;
    min-width: 62px;

    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;

    gap: 3px;

    padding-top: 1px;
  }

  .mobile-meta-time {
    display: block;

    max-width: 100%;

    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: center;

    /* Tabular digits keep the label from twitching as the value changes. */
    font-variant-numeric: tabular-nums;

    /* Metadata, not message: the dimmest ink in the row. */
    color: color-mix(in srgb, var(--mobile-tertiary) 82%, transparent);

    font-size: 12.5px;
    line-height: 18px;
    font-weight: 400;
  }

  /* ---------- Mobile star ---------- */

  .mobile-row-star {
    /* Auxiliary row action: a 36px tap target around a 19px glyph, no plate. */
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
    width: 19px !important;
    height: 19px !important;
  }

  /* Starred rows use the theme accent on the phone list (the desktop list keeps
     the global treatment). `!important` outranks the global dark icon veil. */
  .mobile-row-star .inbox-star-icon.is-active {
    color: var(--el-color-primary) !important;
    opacity: 1 !important;
  }

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
    padding: 20px 0 14px;
    font-size: 13px;
  }
}

</style>
