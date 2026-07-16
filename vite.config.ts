import { defineConfig } from 'vitest/config'
import pkg from './package.json'

export default defineConfig({
  base: './',
  // Expose the package version to the app as a compile-time constant.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      // Split Three.js into its own long-cached vendor chunk.
      output: { manualChunks: { three: ['three'] } },
    },
  },
  test: { globals: true, environment: 'node' },
})
