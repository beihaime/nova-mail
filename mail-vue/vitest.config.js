import { defineConfig } from 'vitest/config'

// Frontend unit tests. They run in jsdom because the mail pipeline is DOM based
// (DOMPurify, DOMParser, markdown-it output); no component needs to be mounted,
// so no Vue plugin is required here. The `test` script is separate from
// `build`, which stays untouched.
export default defineConfig({
  test: {
    include: ['test/**/*.spec.js'],
    environment: 'jsdom',
  },
})
