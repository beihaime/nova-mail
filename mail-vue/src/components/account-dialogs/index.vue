<template>
  <!-- A real wrapper (not a fragment) so the scoped `:deep()` dialog rules below
       have an ancestor to match: an `el-dialog` root is a Teleport node, which
       does not receive the component scope id. -->
  <div class="account-dialogs">
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
import {Icon} from '@iconify/vue'
import {useSettingStore} from '@/store/setting.js'
import {useAccountAddresses} from '@/composables/use-account-addresses.js'

defineOptions({name: 'AccountDialogs'})

const settingStore = useSettingStore()

// The add-address and rename dialogs are owned by the shared address composable
// but mounted here, at the top of the authenticated layout. The account switcher
// itself lives in a container the main layout hides (opacity/transform) on every
// route, and an in-place `el-dialog` inside it would be invisible.
const {
  showAdd,
  addForm,
  addLoading,
  addRef,
  mySelect,
  openSelect,
  submit,
  verifyShow,
  botJsError,
  domainList,
  setNameShow,
  setNameLoading,
  accountName,
  setName,
} = useAccountAddresses()
</script>

<style scoped lang="scss">
.btn {
  width: 100%;
  margin-top: 15px;
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
