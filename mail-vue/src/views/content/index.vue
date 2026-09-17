<template>
  <div class="box mail-reader">
    <div class="header-actions">
      <AppIcon class="icon" name="back" :size="20" @click="handleBack"/>
      <AppIcon v-perm="'email:delete'" class="icon" name="delete-outline" :size="18" @click="handleDelete"/>
      <span class="star" v-if="emailStore.contentData.showStar">
        <AppIcon class="icon" @click="changeStar" v-if="email.isStar" name="star-filled" :size="20"/>
        <AppIcon class="icon" @click="changeStar" v-else name="star-outline" :size="19"/>
      </span>
      <AppIcon class="icon" v-if="emailStore.contentData.showReply" v-perm="'email:send'"  @click="openReply" name="reply" :size="21" />
      <AppIcon class="icon" v-if="emailStore.contentData.showReply" v-perm="'email:send'"  @click="openForward" name="forward" :size="20" />
      <AppIcon class="icon" name="print" :size="19" title="Print" aria-label="Print email" @click="printEmail" />
    </div>
    <div></div>
    <el-scrollbar class="scrollbar">
      <div class="container">
        <div class="email-title">
          {{ email.subject }}
        </div>
        <div class="content">
          <div class="email-info">
            <div>
              <div class="send"><span class="send-source">{{$t('from')}}</span>
                <div class="send-name">
                  <span class="send-name-title">{{ email.name }}</span>
                  <span><{{ email.sendEmail }}></span>
                </div>
              </div>
              <div class="receive"><span class="source">{{$t('recipient')}}</span><span class="receive-email">{{  formateReceive(email.recipient) }}</span></div>
              <div class="date">
                <div>{{ formatDetailDate(email.createTime) }}</div>
              </div>
            </div>
            <el-alert v-if="email.status === 3" :closable="false" :title="toMessage(email.message)" class="email-msg" type="error" show-icon />
            <el-alert v-if="email.status === 4" :closable="false" :title="$t('complained')" class="email-msg" type="warning" show-icon />
            <el-alert v-if="email.status === 5" :closable="false" :title="$t('delayed')" class="email-msg" type="warning" show-icon />
          </div>
          <el-scrollbar class="htm-scrollbar" :class="!email.attList?.length ? 'bottom-distance' : ''">
            <ShadowHtml class="shadow-html" :html="formatImage(email.content)" v-if="email.content" />
            <pre v-else class="email-text" >{{email.text}}</pre>
          </el-scrollbar>
          <div class="att" v-if="email.attList?.length > 0">
            <div class="att-title">
              <span>{{$t('attachments')}}</span>
              <span>{{$t('attCount',{total: email.attList.length})}}</span>
            </div>
            <div class="att-box">

              <div class="att-item" v-for="att in email.attList" :key="att.attId">
                <div class="att-icon" @click="showImage(att.key)">
                  <Icon v-bind="getIconByName(att.filename)" />
                </div>
                <div class="att-name" @click="showImage(att.key)">
                  {{ att.filename }}
                </div>
                <div class="att-size">{{ formatBytes(att.size) }}</div>
                <div class="opt-icon att-icon">
                  <Icon v-if="isImage(att.filename)" icon="hugeicons:view" width="22" height="22" @click="showImage(att.key)"/>
                  <a :href="cvtR2Url(att.key)" download>
                    <AppIcon name="download-outline" :size="22" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-scrollbar>
    <div v-if="emailStore.contentData.showReply" class="mobile-message-actions">
      <button v-perm="'email:send'" @click="openReply"><AppIcon name="reply" :size="18" />{{ $t('reply') }}</button>
      <button v-perm="'email:send'" @click="openForward"><AppIcon name="forward" :size="18" />{{ $t('forward') }}</button>
    </div>
    <el-image-viewer
        v-if="showPreview"
        :url-list="srcList"
        show-progress
        @close="showPreview = false"
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
import {cvtR2Url,toOssDomain} from "@/utils/convert.js";
import {getIconByName} from "@/utils/icon-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {allEmailDelete} from "@/request/all-email.js";
import {useUiStore} from "@/store/ui.js";
import {useI18n} from "vue-i18n";
import {EmailUnreadEnum} from "@/enums/email-enum.js";

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

const { t } = useI18n()
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
})

onUnmounted(() => {
  emailStore.contentData.showUnread = false;
  readRequesting = false
  window.removeEventListener('keydown', handleKeyDown);
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

function formatImage(content) {
  content = content || '';
  const domain = settingStore.settings.r2Domain;
  return  content.replace(/{{domain}}/g, toOssDomain(domain) + '/');
}

function showImage(key) {
  if (!isImage(key)) return;
  const url = cvtR2Url(key)
  srcList.length = 0
  srcList.push(url)
  showPreview.value = true
}

function isImage(filename) {
  return ['png', 'jpg', 'jpeg', 'bmp', 'gif','jfif'].includes(getExtName(filename))
}

function formateReceive(recipient) {
  if (!recipient) return ''
  recipient = JSON.parse(recipient)
  return recipient.map(item => item.address).join(', ')
}

function changeStar() {
  if (email.value.isStar) {
    email.value.isStar = 0;
    starCancel(email.value.emailId).then(() => {
      email.value.isStar = 0;
      emailStore.cancelStarEmailId = email.value.emailId
      setTimeout(() => emailStore.cancelStarEmailId = 0)
      emailStore.starScroll?.deleteEmail([email.value.emailId])
    }).catch((e) => {
      console.error(e)
      email.value.isStar = 1;
    })
  } else {
    email.value.isStar = 1;
    starAdd(email.value.emailId).then(() => {
      email.value.isStar = 1;
      emailStore.addStarEmailId = email.value.emailId
      setTimeout(() => emailStore.addStarEmailId = 0)
      emailStore.starScroll?.addItem(email.value)
    }).catch((e) => {
      console.error(e)
      email.value.isStar = 0;
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
    &:hover { background: var(--base-fill); }
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
    margin-bottom: 18px;
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
  .mobile-message-actions { position: absolute; z-index: 2; left: 0; right: 0; bottom: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 10px 14px max(12px, env(safe-area-inset-bottom)); background: color-mix(in srgb, var(--el-bg-color) 94%, transparent); border-top: 1px solid var(--light-border-color); backdrop-filter: blur(16px); }
  .mobile-message-actions button { height: 36px; display: inline-flex; gap: 7px; align-items: center; justify-content: center; color: var(--el-text-color-primary); border: 1px solid var(--light-border); border-radius: 10px; font-weight: 600; cursor: pointer; }
  .mobile-message-actions img { width: 17px; height: 17px; }
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
  body.nova-mail-printing .mail-reader .mobile-message-actions,
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
  body.nova-mail-printing .mail-reader .shadow-html { zoom: 1 !important; }
  body.nova-mail-printing .mail-reader .att .opt-icon { display: none !important; }
}
</style>
