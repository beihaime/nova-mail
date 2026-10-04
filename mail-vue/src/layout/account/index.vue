<template>
  <div class="account-box">
    <div class="account-switcher-identity">
      <div class="account-switcher-avatar">{{ primaryAddress?.[0]?.toUpperCase() }}</div>
      <div><strong>{{ userStore.user.name || primaryAddress }}</strong><span>{{ $t('accountLabel') }}</span></div>
      <small>{{ $t('primaryAddress') }} · {{ primaryAddress }}</small>
    </div>
    <div class="head-opt">
      <AppIcon v-perm="'account:add'" class="icon add" name="add" :size="21" @click="add"/>
      <AppIcon class="icon refresh" name="refresh" :size="18" @click="refresh"/>
    </div>
    <el-scrollbar class="scrollbar" ref="scrollbarRef">
      <div v-infinite-scroll="getAccountList" :infinite-scroll-distance="600" :infinite-scroll-immediate="false">
        <el-card class="item" :class="itemBg(item.accountId)" v-for="(item, index) in accounts" :key="item.accountId"
                 @click="changeAccount(item)">
          <div class="account">
            <AppIcon v-if="item.accountId === accountStore.currentAccountId" name="checkbox-checked" :size="16" />
            <span class="account-email">{{ item.email }}</span>
            <small v-if="item.email === primaryAddress" class="primary-badge">{{ $t('primary') }}</small>
          </div>
          <div class="opt">
            <div class="send-email" @click.stop>
              <button class="account-action-button" type="button" :class="{ 'is-active': item.allReceive === AccountAllReceiveEnum.ENABLED }"
                      :aria-label="$t('receiveEmail')" :aria-pressed="item.allReceive === AccountAllReceiveEnum.ENABLED"
                      @click="setAllReceive(item)">
                <Icon :icon="item.allReceive === AccountAllReceiveEnum.ENABLED ? 'solar:inbox-linear' : 'solar:letter-linear'" width="19" height="19" />
              </button>
            </div>
            <div class="settings" @click.stop>
              <button class="account-action-button" type="button" :aria-label="$t('copy')" @click="copyAccount(item.email)">
                <Icon icon="solar:copy-linear" width="19" height="19" />
              </button>
              <el-dropdown v-if="hasAddressMenu(item)" trigger="click" @click.stop>
                <button class="account-action-button" type="button" :aria-label="$t('settings')" @click.stop>
                  <Icon icon="solar:menu-dots-linear" width="19" height="19" />
                </button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="hasPerm('email:send')" @click="openSetName(item)">{{ $t('rename') }}</el-dropdown-item>
                    <el-dropdown-item v-if="item.accountId !== userStore.user.account.accountId" @click="setAsTop(item, index)">{{ $t('pin') }}</el-dropdown-item>
                    <el-dropdown-item v-if="item.accountId !== userStore.user.account.accountId && hasPerm('account:delete')"
                                      @click="remove(item)">{{ $t('delete') }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <span v-else class="account-action-button is-muted" aria-hidden="true">
                <Icon icon="solar:settings-linear" width="19" height="19" />
              </span>
            </div>
          </div>
        </el-card>

        <!-- Initial Loading Skeleton -->
        <template v-if="loading">
          <el-skeleton v-for="i in skeletonRows" :key="i" animated>
            <template #template>
              <el-card class="item">
                <el-skeleton-item variant="p" style="width: 70%; height: 20px; margin-bottom: 25px"/>
                <div style="display: flex; justify-content: space-between">
                  <el-skeleton-item variant="text" style="width: 20px"/>
                  <el-skeleton-item variant="text" style="width: 20px"/>
                </div>
              </el-card>
            </template>
          </el-skeleton>
        </template>

        <!-- Follow Loading Skeleton -->
        <template v-if="accounts.length > 0 && !noLoading">
          <el-skeleton animated>
            <template #template>
              <el-card class="item">
                <el-skeleton-item variant="p" style="width: 70%; height: 20px; margin-bottom: 20px"/>
                <div style="display: flex; justify-content: space-between">
                  <el-skeleton-item variant="text" style="width: 20px"/>
                  <el-skeleton-item variant="text" style="width: 20px"/>
                </div>
              </el-card>
            </template>
          </el-skeleton>
        </template>

        <div class="noLoading" v-if="noLoading && accounts.length > 0">
          <div>{{ $t('noMoreData') }}</div>
        </div>
        <div class="empty" v-if="noLoading && accounts.length === 0">
          <el-empty :description="$t('noMessagesFound')"/>
        </div>
      </div>
    </el-scrollbar>

    <el-dialog v-model="showAdd" :title="$t('addAccount')">
      <div class="container">
        <el-input v-model="addForm.email" ref="addRef" type="text" :placeholder="$t('emailAccount')" autocomplete="off" @keyup.enter="submit">
          <template #append>
            <div @click.stop="openSelect">
              <el-select
                  ref="mySelect"
                  v-model="addForm.suffix"
                  :placeholder="$t('select')"
                  class="select"
              >
                <el-option
                    v-for="item in domainList"
                    :key="item"
                    :label="item"
                    :value="item"
                />
              </el-select>
              <div>
                <span>{{ addForm.suffix }}</span>
                <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
              </div>
            </div>
          </template>
        </el-input>
        <el-button class="btn" type="primary" @click="submit" :loading="addLoading"
        >{{ $t('add') }}
        </el-button>
      </div>
      <div
          class="add-email-turnstile"
          :class="verifyShow ? 'turnstile-show' : 'turnstile-hide'"
          :data-sitekey="settingStore.settings.siteKey"
          data-callback="onTurnstileSuccess"
          data-error-callback="onTurnstileError"
      >
        <span v-if="botJsError" class="add-email-turnstile-error">{{ $t('verifyModuleFailed') }}</span>
      </div>
    </el-dialog>
    <el-dialog v-model="setNameShow" :title="$t('changeUserName')">
      <div class="container">
        <el-input v-model="accountName" type="text" :placeholder="$t('username')" autocomplete="off" @keyup.enter="setName">
        </el-input>
        <el-button class="btn" type="primary" @click="setName" :loading="setNameLoading"
        >{{ $t('save') }}
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>
<script setup>
import {Icon} from "@iconify/vue";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {useUserStore} from "@/store/user.js";
import {hasPerm} from "@/perm/perm.js"
import {AccountAllReceiveEnum} from "@/enums/account-enum.js";
import {useAccountAddresses} from "@/composables/use-account-addresses.js";

defineOptions({name: 'AccountSwitcher'})

const userStore = useUserStore();
const accountStore = useAccountStore();
const settingStore = useSettingStore();

// Address state and every address action live in one shared composable so the
// Settings sub-page renders the same data without duplicating a request layer.
const {
  accounts,
  primaryAddress,
  domainList,
  loading,
  noLoading,
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
  getAccountList,
  refresh,
  changeAccount,
  itemBg,
  add,
  openSelect,
  submit,
  openSetName,
  setName,
  setAllReceive,
  hasAddressMenu,
  remove,
  setAsTop,
  copyAccount,
} = useAccountAddresses();
</script>
<style>
path[fill="#ffdda1"] {
  fill: #ffdd7d;
}
</style>
<style scoped lang="scss">
.account-box {

  border-right: 1px solid var(--el-border-color) !important;
  background-color: var(--el-bg-color);
  height: 100%;
  overflow: hidden;

  .account-switcher-identity {
    display: none;
    @media (max-width: 767px) {
      display: grid;
      grid-template-columns: 34px 1fr;
      gap: 0 9px;
      align-items: center;
      padding: 16px 14px 10px;
      border-bottom: 1px solid var(--nova-divider);
      .account-switcher-avatar { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: var(--nova-selected); color: var(--el-color-primary); font-weight: 700; }
      strong { font-size: 14px; }
      span, small { color: var(--regular-text-color); font-size: 12px; }
      small { grid-column: 1 / -1; padding-top: 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    }
  }

  .head-opt {
    display: flex;
    align-items: center;
    height: 38px;
    box-shadow: var(--header-actions-border);
    padding-left: 10px;
    padding-right: 10px;

    .icon {
      cursor: pointer;
    }

    .refresh {
      margin-left: 10px;
    }

    .add {
      margin-left: 2px;
    }

    .head-opt:not(.add) .refresh {
      margin-left: 5px;
    }
  }

  .scrollbar {
    width: 100%;
    height: calc(100% - 38px);
    overflow: auto;
    @media (max-width: 767px) {
      height: calc(100% - 158px);
    }

    .empty {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
    }

    .noLoading {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 10px 0;
      color: var(--secondary-text-color);
    }
  }

  .btn {
    width: 100%;
    margin-top: 15px;
  }

  .item {
    background-color: var(--el-bg-color);
    border-radius: 8px;
    padding: 10px;
    margin-bottom: 11px;
    margin-left: 10px;
    margin-right: 10px;
    cursor: pointer;

    .account {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
      font-size: 15px;
      margin-bottom: 20px;
      .account-email { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      .primary-badge { margin-left: auto; padding: 2px 6px; border-radius: 5px; color: var(--el-color-primary); background: var(--nova-selected); font-size: 10px; }
    }

    .opt {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: var(--nm-text-muted);

      .settings {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .send-email {
        display: flex;
        align-items: center;
      }
    }

    :deep(.el-card__body) {
      padding: 0;
    }
  }

  .item:first-child {
    margin-top: 10px;
  }

  .item-choose {
    background: var(--choose-account-background);
  }
}

/* The switcher's per-account actions follow the same icon-button language as
   the rest of Settings instead of the old multicolour bitmap glyphs. */
.account-action-button {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  color: var(--nm-text-secondary);
  background: transparent;
  cursor: pointer;

  &:hover { color: var(--nm-accent); background: var(--nm-hover); }
  &:active { background: var(--nova-button-active); }
  &:focus-visible { outline: none; box-shadow: var(--nova-button-focus-ring); }
  &.is-active { color: var(--nm-accent); background: var(--nm-accent-subtle); }
  &.is-muted { color: var(--nm-text-muted); cursor: default; }
}

.setting-icon {
  position: relative;
  top: 6px;
}

:deep(.el-input-group__append) {
  padding: 0 !important;
  padding-left: 8px !important;
  background: var(--el-bg-color);
}

:deep(.el-dialog) {
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.select {
  position: absolute;
  right: 30px;
  width: 100px;
  opacity: 0;
  pointer-events: none;
}

:deep(.el-pagination .el-select) {
  width: 100px;
  background: var(--el-bg-color);
}

.add-email-turnstile {
  margin-top: 15px;
}

.add-email-turnstile-error {
  color: var(--nova-danger);
  font-size: 12px;
}

.turnstile-show {
  opacity: 1;
}

.turnstile-hide {
  opacity: 0;
  pointer-events: none;
  position: fixed;
}

</style>
