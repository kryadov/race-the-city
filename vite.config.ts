import { defineConfig } from 'vitest/config'
import pkg from './package.json'

export default defineConfig({
  base: './',
  // Expose the package version to the app as a compile-time constant.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: { globals: true, environment: 'node' },
})
