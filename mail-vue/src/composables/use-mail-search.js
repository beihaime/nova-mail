import { computed, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEmailStore } from '@/store/email.js'

const SEARCH_DELAY = 300

export function useMailSearch() {
  const route = useRoute()
  const router = useRouter()
  const emailStore = useEmailStore()
  let timer = null

  const keyword = computed({
    get: () => emailStore.searchKeyword || String(route.query.q || ''),
    set: value => {
      emailStore.searchKeyword = String(value || '')
      schedule(value)
    }
  })

  function commit(value) {
    const normalized = String(value || '').trim()
    emailStore.searchKeyword = normalized
    const query = { ...route.query }
    if (normalized) query.q = normalized
    else delete query.q

    const same = route.name === 'email' && String(route.query.q || '') === normalized
    if (same) return

    if (route.name === 'email') {
      router.replace({ name: 'email', query })
    } else if (normalized) {
      router.push({ name: 'email', query: { q: normalized } })
    }
  }

  function schedule(value) {
    clearTimeout(timer)
    timer = setTimeout(() => commit(value), SEARCH_DELAY)
  }

  function submit() {
    clearTimeout(timer)
    commit(keyword.value)
  }

  function clear() {
    clearTimeout(timer)
    commit('')
  }

  function handleKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      submit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      clear()
    }
  }

  watch(() => route.query.q, value => {
    const normalized = String(value || '').trim()
    if (emailStore.searchKeyword !== normalized) emailStore.searchKeyword = normalized
  }, { immediate: true })

  onBeforeUnmount(() => clearTimeout(timer))

  return { keyword, submit, clear, handleKeydown }
}
