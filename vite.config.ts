import { defineConfig } from 'vitest/config'
import pkg from './package.json'

export default defineConfig({
  base: './',
  // Expose the package version to the app as a compile-time constant.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    {
      // Emit the deployed version so a running tab can poll for updates.
      name: 'emit-version-json',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: pkg.version }) })
      },
    },
  ],
  build: {
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      // Split Three.js into its own long-cached vendor chunk.
      output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules[\/]three[\/]/ }] } },
    },
  },
  test: { globals: true, environment: 'node' },
})
