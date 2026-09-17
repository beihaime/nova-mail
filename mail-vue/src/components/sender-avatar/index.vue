<template>
  <div class="sender-avatar" :style="avatarStyle" aria-hidden="true">
    <img v-if="logoUrl && !failed" :class="{ loaded: logoLoaded }" :src="logoUrl" alt="" loading="lazy" @load="logoLoaded = true" @error="failed = true" />
    <span v-if="!logoUrl || failed || !logoLoaded">{{ initial }}</span>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  email: { type: Object, default: () => ({}) },
  size: { type: [Number, String], default: 40 }
})

const failed = ref(false)
const logoLoaded = ref(false)
const avatarStyle = computed(() => ({ width: `${props.size}px`, height: `${props.size}px`, flex: `0 0 ${props.size}px` }))
const initial = computed(() => (props.email?.name || props.email?.sendEmail || '?').trim().charAt(0).toUpperCase())
const logoUrl = computed(() => {
  const id = Number(props.email?.emailId)
  return Number.isSafeInteger(id) && id > 0 ? `/api/email/brand-avatar?emailId=${encodeURIComponent(id)}` : ''
})

watch(() => props.email?.emailId, () => { failed.value = false; logoLoaded.value = false })
</script>

<style scoped>
.sender-avatar {
  display: grid;
  place-items: center;
  position: relative;
  overflow: hidden;
  border-radius: 50%;
  color: var(--el-color-primary);
  background: var(--nova-selected);
  font-size: 0.78em;
  font-weight: 700;
}
.sender-avatar img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity var(--nova-motion-base) var(--nova-motion-ease); }
.sender-avatar img.loaded { opacity: 1; }
</style>
