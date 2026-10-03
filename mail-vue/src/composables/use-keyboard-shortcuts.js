import { onBeforeUnmount, onMounted, ref } from 'vue'
import router from '@/router/index.js'
import { useEmailStore } from '@/store/email.js'
import { useUiStore } from '@/store/ui.js'
import { hasPerm } from '@/perm/perm.js'

function unwrap(value) {
  return value?.value ?? value
}

function isTypingTarget(target) {
  if (!target) return false
  return target.matches?.('input, textarea, select, [contenteditable="true"]')
    || target.closest?.('input, textarea, select, [contenteditable="true"]')
}

function activeList(emailStore, routeName) {
  const refs = {
    email: emailStore.emailScroll,
    send: emailStore.sendScroll,
    draft: emailStore.draftScroll,
    archive: emailStore.archiveScroll,
    star: emailStore.starScroll,
    trash: emailStore.trashScroll,
  }
  return unwrap(refs[routeName])
}

export function useKeyboardShortcuts(showHelp) {
  const emailStore = useEmailStore()
  const uiStore = useUiStore()
  let sequence = ''
  let sequenceTimer = null

  function clearSequence() {
    sequence = ''
    if (sequenceTimer) clearTimeout(sequenceTimer)
    sequenceTimer = null
  }

  function startSequence() {
    clearSequence()
    sequence = 'g'
    sequenceTimer = setTimeout(clearSequence, 1000)
  }

  function isDesktop() {
    return window.innerWidth >= 1024
  }

  function writer() {
    return unwrap(uiStore.writerRef)
  }

  function reader() {
    return unwrap(uiStore.readerRef)
  }

  function composeIsOpen() {
    const instance = writer()
    const shell = document.querySelector('.send')
    return Boolean(instance?.isOpen?.() || (shell && shell.offsetParent !== null))
  }

  function closeProfile() {
    uiStore.headerRef && unwrap(uiStore.headerRef)?.closeProfilePopup?.()
    uiStore.accountShow = false
  }

  function focusSearch() {
    const input = document.querySelector('.desktop-search-only input')
    if (input && input.offsetParent !== null) {
      input.focus()
      input.select?.()
    }
  }

  function navigate(target) {
    clearSequence()
    router.push({ name: target })
  }

  function handleEscape(event) {
    if (showHelp.value) {
      showHelp.value = false
      event.preventDefault()
      return true
    }

    if (composeIsOpen()) {
      writer()?.close?.()
      event.preventDefault()
      return true
    }

    if (document.querySelector('.el-message-box')) return true

    const active = document.activeElement
    if (active?.matches?.('.desktop-search-only input')) {
      active.blur()
      event.preventDefault()
      return true
    }

    if (uiStore.accountShow || document.querySelector('.mobile-profile-sheet-backdrop')) {
      closeProfile()
      event.preventDefault()
      return true
    }

    if (router.currentRoute.value.name === 'content') {
      reader()?.handleEscape?.()
      event.preventDefault()
      return true
    }

    return false
  }

  function handleComposeShortcut(event) {
    const key = event.key.toLowerCase()
    if ((event.ctrlKey || event.metaKey) && !event.altKey && key === 'enter') {
      writer()?.sendEmail?.()
      event.preventDefault()
      return true
    }
    if (key === 'escape' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      handleEscape(event)
      return true
    }
    return false
  }

  function handleNavigation(key) {
    const destinations = { i: 'email', s: 'send', d: 'draft', a: 'archive', t: 'trash' }
    if (sequence === 'g') {
      clearSequence()
      if (destinations[key]) navigate(destinations[key])
      return true
    }
    if (key === 'g') {
      startSequence()
      return true
    }
    return false
  }

  function handleReader(key) {
    const current = reader()
    if (!current) return false

    const actions = {
      r: current.openReply,
      a: current.openReplyAll,
      f: current.openForward,
      e: current.archiveCurrent,
      s: () => current.changeStar?.(),
      j: () => current.adjacentMessage?.(1),
      k: () => current.adjacentMessage?.(-1),
    }
    if (actions[key]) {
      actions[key]()
      return true
    }
    if (key === '#' || key === 'delete') {
      current.handleDelete?.()
      return true
    }
    return false
  }

  function handleList(key, event) {
    const routeName = router.currentRoute.value.name
    const list = activeList(emailStore, routeName)
    if (!list) return false

    const actions = {
      j: () => list.moveKeyboardSelection?.(1),
      arrowdown: () => list.moveKeyboardSelection?.(1),
      k: () => list.moveKeyboardSelection?.(-1),
      arrowup: () => list.moveKeyboardSelection?.(-1),
      enter: () => list.openKeyboardSelection?.(),
      o: () => list.openKeyboardSelection?.(),
      x: () => list.toggleKeyboardSelection?.(),
      s: () => list.starKeyboardSelection?.(),
      e: () => list.archiveKeyboardSelection?.(),
    }
    if (key === 'i' && event.shiftKey) actions.i = () => list.markKeyboardRead?.()
    if (key === 'u' && event.shiftKey) actions.u = () => list.markKeyboardUnread?.()
    if (actions[key]) {
      actions[key]()
      return true
    }
    if (key === '#' || key === 'delete') {
      list.deleteKeyboardSelection?.()
      return true
    }
    return false
  }

  function handleKeydown(event) {
    if (!isDesktop()) return

    const key = event.key.toLowerCase()
    const composeOpen = composeIsOpen()

    if (composeOpen) {
      handleComposeShortcut(event)
      return
    }

    if (showHelp.value && key !== 'escape') return

    if (key === 'escape') {
      handleEscape(event)
      return
    }

    // Never compete with browser/OS shortcuts. Shift is allowed only for the
    // explicitly documented I/U and punctuation shortcuts below.
    if (event.ctrlKey || event.metaKey || event.altKey) return

    if (sequence && !['g', 'i', 's', 'd', 'a', 't'].includes(key)) {
      clearSequence()
    }

    if (isTypingTarget(event.target)) return

    if (key === '?' && event.shiftKey) {
      showHelp.value = true
      event.preventDefault()
      return
    }

    if (key === '/' && !event.shiftKey) {
      focusSearch()
      event.preventDefault()
      return
    }

    if (handleNavigation(key)) {
      event.preventDefault()
      return
    }

    if (key === 'c' && hasPerm('email:send')) {
      writer()?.open?.()
      event.preventDefault()
      return
    }

    const handled = router.currentRoute.value.name === 'content'
      ? handleReader(key)
      : handleList(key, event)

    if (handled) event.preventDefault()
  }

  function handleComposeSendEvent() {
    if (isDesktop() && composeIsOpen()) writer()?.sendEmail?.()
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
    window.addEventListener('nova-compose-send', handleComposeSendEvent)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeydown)
    window.removeEventListener('nova-compose-send', handleComposeSendEvent)
    clearSequence()
  })
}
