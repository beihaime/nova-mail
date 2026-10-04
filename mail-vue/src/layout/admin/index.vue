<template>
  <div class="admin-layout">
    <div v-if="drawerOpen" class="admin-drawer-scrim" @click="drawerOpen = false"></div>
    <aside class="admin-sidebar" :class="{ 'is-open': drawerOpen }">
      <div class="admin-brand">
        <AppIcon name="brand-app" :size="34" />
        <div><strong>Nova Mail</strong><small>{{ $t('adminConsole') }}</small></div>
      </div>
      <nav class="admin-nav" aria-label="Admin navigation">
        <div class="admin-nav-group">
          <span class="admin-nav-heading">{{ $t('adminWorkspace') }}</span>
          <RouterLink v-for="item in workspaceItems" :key="item.name" :to="item.to" class="admin-nav-item" exact-active-class="is-active" @click="drawerOpen = false">
            <Icon :icon="item.icon" width="19" height="19" />
            <span>{{ $t(item.label) }}</span>
          </RouterLink>
        </div>
        <div class="admin-nav-group">
          <span class="admin-nav-heading">{{ $t('adminSystem') }}</span>
          <RouterLink to="/admin/settings" class="admin-nav-item" exact-active-class="is-active" @click="drawerOpen = false">
            <Icon icon="solar:settings-linear" width="19" height="19" />
            <span>{{ $t('SystemSettings') }}</span>
          </RouterLink>
        </div>
      </nav>
      <button class="admin-back-button" type="button" @click="router.push('/inbox')">
        <Icon icon="solar:arrow-left-linear" width="19" height="19" />
        <span>{{ $t('backToMail') }}</span>
      </button>
    </aside>

    <main class="admin-main">
      <header class="admin-mobile-header">
        <button class="admin-menu-button" type="button" :aria-label="$t('openAdminMenu')" @click="drawerOpen = true">
          <Icon icon="solar:hamburger-menu-linear" width="22" height="22" />
        </button>
        <strong>{{ $t('adminConsole') }}</strong>
      </header>
      <div class="admin-content">
        <router-view />
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import AppIcon from '@/components/app-icon/index.vue'
import router from '@/router/index.js'

const drawerOpen = ref(false)
const workspaceItems = [
  { name: 'analytics', to: '/admin/analytics', label: 'analytics', icon: 'solar:chart-2-linear' },
  { name: 'users', to: '/admin/users', label: 'allUsers', icon: 'solar:users-group-rounded-linear' },
  { name: 'mail', to: '/admin/mail', label: 'allMail', icon: 'solar:letter-linear' },
  { name: 'roles', to: '/admin/roles', label: 'permissions', icon: 'solar:shield-user-linear' },
  { name: 'invites', to: '/admin/invite-codes', label: 'inviteCode', icon: 'solar:ticket-linear' },
]
</script>

<style scoped lang="scss">
.admin-layout {
  display: flex;
  min-height: 100dvh;
  color: var(--nm-text-primary);
  background: var(--nm-background);
}

.admin-sidebar {
  z-index: 30;
  display: flex;
  box-sizing: border-box;
  width: 244px;
  min-width: 244px;
  flex: 0 0 244px;
  min-height: 100dvh;
  flex-direction: column;
  padding: 24px 14px 18px;
  border-right: 1px solid var(--nova-divider);
  background: var(--nm-surface);
}

.admin-brand { display: flex; align-items: center; gap: 10px; padding: 0 10px 28px; }
.admin-brand > div { display: grid; gap: 2px; min-width: 0; }
.admin-brand strong { font-size: 15px; }
.admin-brand small { color: var(--nm-text-muted); font-size: 12px; }
.admin-nav { display: grid; gap: 26px; }
.admin-nav-group { display: grid; gap: 4px; }
.admin-nav-heading { padding: 0 12px 7px; color: var(--nm-text-muted); font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
.admin-nav-item,
.admin-back-button {
  display: flex;
  align-items: center;
  min-height: 42px;
  gap: 12px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--nova-button-radius);
  color: var(--nm-text-secondary);
  background: transparent;
  font: inherit;
  text-decoration: none;
  cursor: pointer;
  transition: color var(--nova-motion-fast) var(--nova-motion-ease), background-color var(--nova-motion-fast) var(--nova-motion-ease), border-color var(--nova-motion-fast) var(--nova-motion-ease);
}
.admin-nav-item:hover,
.admin-back-button:hover { color: var(--nm-text-primary); background: var(--nm-hover); }
.admin-nav-item:active,
.admin-back-button:active { background: var(--nm-active); }
.admin-nav-item.is-active { border-color: var(--nm-accent); color: var(--nm-accent); background: var(--nm-accent-subtle); font-weight: 600; }
.admin-nav-item:focus-visible,
.admin-back-button:focus-visible,
.admin-menu-button:focus-visible { outline: none; box-shadow: var(--nova-button-focus-ring); }
.admin-back-button { margin-top: auto; }
.admin-main { display: flex; min-width: 0; min-height: 100dvh; flex: 1; flex-direction: column; }
.admin-content { min-width: 0; min-height: 0; flex: 1; padding: 28px; background: var(--nm-background); }
.admin-mobile-header { display: none; }

@media (max-width: 767px) {
  .admin-sidebar { position: fixed; inset: 0 auto 0 0; width: min(286px, 86vw); min-width: 0; transform: translateX(-105%); transition: transform var(--nova-motion-base) var(--nova-motion-ease); box-shadow: 20px 0 40px color-mix(in srgb, #000 16%, transparent); }
  .admin-sidebar.is-open { transform: translateX(0); }
  .admin-drawer-scrim { position: fixed; z-index: 29; inset: 0; background: var(--nova-overlay); }
  .admin-main { min-height: 100dvh; }
  .admin-mobile-header { display: flex; align-items: center; height: calc(56px + env(safe-area-inset-top, 0px)); gap: 12px; padding: env(safe-area-inset-top, 0px) 16px 0; border-bottom: 1px solid var(--nova-divider); background: var(--nm-surface); }
  .admin-menu-button { display: grid; place-items: center; width: 38px; height: 38px; border: 0; border-radius: 10px; color: var(--nm-text-secondary); background: transparent; cursor: pointer; }
  .admin-content { padding: 18px 16px calc(24px + env(safe-area-inset-bottom, 0px)); }
}
</style>
