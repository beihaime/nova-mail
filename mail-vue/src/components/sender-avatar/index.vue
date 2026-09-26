<template>
  <div
      class="sender-avatar"
      :class="[`source-${avatar.source}`, { 'is-verified': avatar.verified }]"
      :style="avatarStyle"
      aria-hidden="true"
  >
    <!-- The initial is always present, so an avatar that loads late (or fails)
         never changes the row's size and the circle is never blank. It fades
         out under the image so a transparent logo has nothing behind it. -->
    <span class="sender-avatar-initial" :class="{ hidden: imageLoaded }">{{ initials }}</span>
    <img
        v-if="imageUrl"
        :key="imageUrl"
        class="sender-avatar-image"
        :class="{ loaded: imageLoaded }"
        :src="imageUrl"
        alt=""
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
        @load="handleLoad"
        @error="handleError"
    />
    <span v-if="showVerified" class="sender-avatar-verified" aria-hidden="true">
      <svg viewBox="0 0 12 12" width="8" height="8" focusable="false">
        <path d="M2 6.4 4.6 9 10 3.2" fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  initialsForSender,
  inlineSenderAvatar,
  normalizeSenderAvatar,
  resolveSenderAvatar,
  senderAddress,
  senderEmailId,
  senderName
} from '@/utils/sender-avatar.js'

const props = defineProps({
  // A list row (`sendEmail` / `name` / `avatar`) or a thread message
  // (`from.email` / `avatar`) — both shapes are understood here, once.
  email: { type: Object, default: () => ({}) },
  size: { type: [Number, String], default: 40 },
  preferLogo: { type: Boolean, default: true }
})

const avatar = ref(normalizeSenderAvatar(null))
const imageLoaded = ref(false)
const imageFailed = ref(false)
const triedSources = ref(new Set())

const address = computed(() => senderAddress(props.email))
const name = computed(() => senderName(props.email))
const emailId = computed(() => senderEmailId(props.email))
const initials = computed(() => initialsForSender(name.value, address.value))
const avatarStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  flex: `0 0 ${props.size}px`
}))

const imageUrl = computed(() => {
  if (!props.preferLogo || imageFailed.value) return ''
  return avatar.value.url || ''
})

const showVerified = computed(() => props.preferLogo && avatar.value.verified === true)

let requestToken = 0

/**
 * Render the best thing we already have immediately, then let the server finish
 * the chain in the background when the list only had the cheap path.
 */
async function load(exclude = []) {
  const token = ++requestToken
  imageFailed.value = false
  imageLoaded.value = false

  const inline = exclude.length ? null : inlineSenderAvatar(props.email)
  if (inline && !inline.pending) {
    avatar.value = inline
    return
  }

  avatar.value = normalizeSenderAvatar(inline ? { ...inline, url: null } : null)

  if (!props.preferLogo || !address.value) {
    avatar.value = normalizeSenderAvatar(null)
    return
  }

  const resolved = await resolveSenderAvatar({
    email: address.value,
    emailId: emailId.value,
    exclude
  })

  // A newer render (or a newer fallback attempt) has taken over.
  if (token !== requestToken) return
  avatar.value = resolved
}

function handleLoad() {
  imageLoaded.value = true
}

/** The proxied image can still 404 (expired asset); drop to the next source. */
function handleError() {
  const source = avatar.value.source
  if (triedSources.value.has(source)) {
    imageFailed.value = true
    return
  }
  triedSources.value = new Set([...triedSources.value, source])
  load([...triedSources.value])
}

watch(
  () => [address.value, emailId.value],
  () => {
    triedSources.value = new Set()
    load()
  },
  { immediate: true }
)
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

.sender-avatar-initial {
  /* Behind the image and never removed: keeps the circle stable while loading. */
  position: relative;
  z-index: 0;
  line-height: 1;
  opacity: 1;
  transition: opacity var(--nova-motion-base) var(--nova-motion-ease);
}

.sender-avatar-initial.hidden {
  opacity: 0;
}

.sender-avatar-image {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity var(--nova-motion-base) var(--nova-motion-ease);
}

.sender-avatar-image.loaded {
  opacity: 1;
}

.sender-avatar-verified {
  position: absolute;
  right: -1px;
  bottom: -1px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  color: #fff;
  background: var(--el-color-primary);
  /* Ring in the row background so the badge reads on either theme. */
  box-shadow: 0 0 0 2px var(--nova-surface, #fff);
}

/* Remote brand logos are usually drawn for light backgrounds; in dark mode a
   faint light plate keeps dark marks legible without resizing the circle. */
:global(html.dark) .sender-avatar-image {
  background: rgba(255, 255, 255, 0.08);
}
</style>
