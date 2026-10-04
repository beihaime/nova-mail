<template>
  <section class="settings-section addresses-section">
    <h2 class="settings-section-title">{{ $t('managedAddresses') }}</h2>

    <button v-perm="'account:add'" class="settings-category-row addresses-add-row" type="button" @click="add">
      <span class="settings-category-icon">
        <Icon icon="solar:add-circle-linear" width="22" height="22" />
      </span>
      <span class="settings-category-copy"><strong>{{ $t('addEmailAddress') }}</strong></span>
      <Icon class="settings-category-chevron" icon="solar:alt-arrow-right-linear" width="18" height="18" />
    </button>

    <div
      class="settings-panel addresses-list"
      v-infinite-scroll="getAccountList"
      :infinite-scroll-distance="600"
      :infinite-scroll-immediate="false"
    >
      <div
        v-for="(item, index) in accounts"
        :key="item.accountId"
        class="settings-row address-row"
        :class="{ 'is-current': item.accountId === accountStore.currentAccountId }"
        role="button"
        tabindex="0"
        @click="changeAccount(item)"
        @keydown.enter="changeAccount(item)"
        @keydown.space.prevent="changeAccount(item)"
      >
        <span class="address-leading" :class="{ 'is-accent': isAccent(item) }">
          <Icon :icon="isChecked(item) ? 'mdi:check' : 'solar:letter-linear'" width="20" height="20" />
        </span>
        <span class="settings-row-title address-email" :title="item.email">{{ item.email }}</span>
        <span v-if="item.email === primaryAddress" class="address-primary-badge">{{ $t('primary') }}</span>
        <span class="address-actions" @click.stop>
          <el-tooltip :content="$t('receiveEmail')" placement="top">
            <button
              class="nova-icon-button address-action"
              :class="{ 'is-active': item.allReceive === AccountAllReceiveEnum.ENABLED }"
              type="button"
              :aria-label="$t('receiveEmail')"
              :aria-pressed="item.allReceive === AccountAllReceiveEnum.ENABLED"
              @click="setAllReceive(item)"
            >
              <Icon icon="solar:inbox-linear" width="18" height="18" />
            </button>
          </el-tooltip>
          <el-tooltip :content="$t('copy')" placement="top">
            <button
              class="nova-icon-button address-action address-copy-action"
              type="button"
              :aria-label="$t('copy')"
              @click="copyAccount(item.email)"
            >
              <Icon icon="solar:copy-linear" width="18" height="18" />
            </button>
          </el-tooltip>
          <el-dropdown v-if="hasAddressMenu(item)" trigger="click" @click.stop>
            <button class="nova-icon-button address-action" type="button" :aria-label="$t('settings')" @click.stop>
              <Icon icon="solar:menu-dots-linear" width="18" height="18" />
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="copyAccount(item.email)">{{ $t('copy') }}</el-dropdown-item>
                <el-dropdown-item v-if="hasPerm('email:send')" @click="openSetName(item)">{{ $t('rename') }}</el-dropdown-item>
                <el-dropdown-item v-if="item.accountId !== userStore.user.account.accountId" @click="setAsTop(item, index)">{{ $t('pin') }}</el-dropdown-item>
                <el-dropdown-item v-if="item.accountId !== userStore.user.account.accountId && hasPerm('account:delete')" @click="remove(item)">{{ $t('delete') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </span>
      </div>

      <template v-if="loading">
        <div v-for="i in skeletonRows" :key="i" class="settings-row address-row address-skeleton-row" aria-hidden="true">
          <el-skeleton-item variant="circle" class="address-skeleton-icon" />
          <el-skeleton-item variant="text" class="address-skeleton-text" />
        </div>
      </template>
      <template v-if="accounts.length > 0 && !noLoading">
        <div class="settings-row address-row address-skeleton-row" aria-hidden="true">
          <el-skeleton-item variant="circle" class="address-skeleton-icon" />
          <el-skeleton-item variant="text" class="address-skeleton-text" />
        </div>
      </template>
      <div v-if="noLoading && accounts.length > 0" class="addresses-list-end">{{ $t('noMoreData') }}</div>
      <div v-if="noLoading && accounts.length === 0" class="addresses-empty">
        <el-empty :description="$t('noManagedAddresses')" />
      </div>
    </div>
  </section>
</template>

<script setup>
import {Icon} from '@iconify/vue'
import {hasPerm} from '@/perm/perm.js'
import {useAccountStore} from '@/store/account.js'
import {useUserStore} from '@/store/user.js'
import {AccountAllReceiveEnum} from '@/enums/account-enum.js'
import {useAccountAddresses} from '@/composables/use-account-addresses.js'

defineOptions({name: 'AccountAddresses'})

const accountStore = useAccountStore()
const userStore = useUserStore()

const {
  accounts,
  primaryAddress,
  loading,
  noLoading,
  skeletonRows,
  getAccountList,
  changeAccount,
  add,
  setAllReceive,
  copyAccount,
  openSetName,
  setAsTop,
  remove,
  hasAddressMenu,
} = useAccountAddresses()

const isChecked = (item) => item.accountId === accountStore.currentAccountId
const isAccent = (item) => isChecked(item) || item.email === primaryAddress.value
</script>

<style scoped lang="scss">
@use '../../styles/settings-ui' as *;

/* The Account addresses body is built from the same primitives as the rest of
   Account & Security; the mixins keep a single definition of each one. */
.settings-section { @include nova-settings-section; }
.settings-section-title { @include nova-settings-section-title; }
.settings-panel { @include nova-settings-panel; }
.settings-row { @include nova-settings-row; }
@include nova-settings-row-divider;
.settings-row-title { @include nova-settings-row-title; }
.settings-category-row { @include nova-settings-category-row; }
.settings-category-icon { @include nova-settings-category-icon; }
.settings-category-copy { @include nova-settings-category-copy; }
.settings-category-chevron { @include nova-settings-category-chevron; }

.addresses-list { position: relative; }

/* The add action is a Settings navigation row, so it keeps the same hover
   surface and adds the pressed state the brief calls for. */
.addresses-add-row:active { background: var(--nova-button-active); }

/* Leading mail/check mark: the compact list icon, tinted for
   the primary address and for the currently selected one. */
.address-leading { @include nova-settings-list-icon; }
.address-leading.is-accent { color: var(--nm-accent); }

.address-row {
  cursor: pointer;
  transition: background-color var(--nova-motion-fast) var(--nova-motion-ease);
}

.address-row:hover { background: var(--nm-hover); }
.address-row:active { background: var(--nova-button-active); }
.address-row:focus-visible { outline: none; box-shadow: inset var(--nova-button-focus-ring); }
.address-row.is-current { background: color-mix(in srgb, var(--nm-accent-subtle) 60%, transparent); }
.address-row.is-current:hover { background: var(--nm-accent-subtle); }

.address-email {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Small, low-weight theme-aware pill — never a full-row highlight. */
.address-primary-badge {
  flex: 0 0 auto;
  padding: 2px 8px;
  border-radius: 999px;
  color: var(--nm-accent);
  background: var(--nm-accent-subtle);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
}

.address-actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 2px;
  margin-left: 2px;
}

.address-action.is-active { color: var(--nm-accent); background: var(--nm-accent-subtle); }

.address-skeleton-row { cursor: default; }
.address-skeleton-icon { width: 36px; height: 36px; flex: 0 0 36px; }
.address-skeleton-text { width: min(52%, 320px); height: 14px; }
.addresses-list-end { padding: 12px 18px; border-top: 1px solid var(--nova-divider-soft); color: var(--nm-text-muted); font-size: 12px; text-align: center; }
.addresses-empty { min-height: 180px; display: grid; place-items: center; }

@media (max-width: 767px) {
  .settings-section { @include nova-settings-section-mobile; }
  .settings-row { @include nova-settings-row-mobile; }
  .settings-category-row { @include nova-settings-category-row-mobile; }
  .settings-category-icon { @include nova-settings-category-icon-mobile; }
  .settings-category-copy { @include nova-settings-category-copy-mobile; }
  .address-leading { @include nova-settings-list-icon-mobile; }
  .address-skeleton-icon { width: 30px; height: 30px; flex-basis: 30px; }
  .address-actions { gap: 0; }
  .address-action { --nova-icon-button-size: 30px; }
  .address-primary-badge { padding-inline: 6px; font-size: 10px; }

  /* A phone row cannot hold three 34px targets plus a long address without
     squeezing the address; copy moves into the overflow menu there. */
  .address-copy-action { display: none; }
}
</style>
