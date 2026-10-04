<template>
  <div class="box">
    <div class="settings-content">
      <div class="settings-subpage-header">
        <button class="settings-back-button" type="button" :aria-label="$t('back')" @click="router.back()">
          <Icon icon="solar:arrow-left-linear" width="20" height="20" />
        </button>
        <h1>{{ $t('emailAddresses') }}</h1>
      </div>
      <account-addresses />
    </div>
  </div>
</template>

<script setup>
import {defineOptions} from 'vue'
import {Icon} from '@iconify/vue'
import {useRouter} from 'vue-router'
import AccountAddresses from '@/components/account-addresses/index.vue'

defineOptions({ name: 'addresses' })

const router = useRouter()
</script>

<style scoped lang="scss">
@use '../../styles/settings-ui' as *;

.box { @include nova-settings-page; }
.settings-content { @include nova-settings-content; }
.settings-subpage-header { @include nova-settings-subpage-header; }
.settings-back-button { @include nova-settings-back-button; }

@media (max-width: 767px) {
  .settings-subpage-header { @include nova-settings-subpage-header-mobile; }
}
</style>
