import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Frontend unit tests. They run in jsdom because the mail pipeline is DOM based
// (DOMPurify, DOMParser, markdown-it output); no component needs to be mounted,
// so no Vue plugin is required here. The `test` script is separate from
// `build`, which stays untouched.
//
// The `@` alias mirrors vite.config.js so a test can import (and `vi.mock`) the
// same specifier the application code uses, instead of guessing at a relative
// path that breaks whenever a module moves.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.spec.js'],
    environment: 'jsdom',
    setupFiles: ['test/setup.js'],
  },
})
