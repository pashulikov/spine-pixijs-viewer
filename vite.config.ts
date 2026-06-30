import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// We load two Spine runtimes side by side (4.3 as the main packages, 4.2 via the
// `spine-pixi-42`/`spine-core-42` npm aliases). The 4.2 spine-pixi build and its
// spine-canvas dependency import `@esotericsoftware/spine-core` as a bare
// specifier; npm resolves those to the hoisted 4.3 copy (or a separate nested
// 4.2 copy), gluing 4.2 rendering code to a different core module than the one
// we parse skeletons with. That breaks `instanceof` checks — the Spine
// constructor throws "data cannot be null", and SpinePipe's
// `attachment instanceof RegionAttachment` gate silently drops every slot.
//
// Fix: funnel ALL core imports from the 4.2 stack to the single `spine-core-42`
// module. The 4.2 stack is (a) anything under `spine-pixi-42/`, and (b) the
// hoisted top-level `@esotericsoftware/spine-canvas` (the 4.3 canvas is nested
// under `spine-pixi-v8/`, so we exclude that path).
function isSpine42Importer(importer: string): boolean {
  if (importer.includes('spine-pixi-42')) return true
  if (importer.includes('@esotericsoftware/spine-canvas') && !importer.includes('spine-pixi-v8')) return true
  return false
}

function spine42CoreRedirect(): Plugin {
  return {
    name: 'spine42-core-redirect',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (source === '@esotericsoftware/spine-core' && importer && isSpine42Importer(importer)) {
        const resolved = await this.resolve('spine-core-42', importer, { skipSelf: true })
        if (resolved) return resolved.id
      }
      return null
    },
  }
}

export default defineConfig({
  plugins: [spine42CoreRedirect(), react()],
  // Keep the spine stacks out of esbuild prebundling so the redirect plugin above
  // governs their core resolution in dev too (esbuild optimize wouldn't honor it).
  optimizeDeps: {
    exclude: [
      '@esotericsoftware/spine-core',
      '@esotericsoftware/spine-pixi-v8',
      'spine-core-42',
      'spine-pixi-42',
    ],
  },
  server: {
    port: 3000,
  },
})
