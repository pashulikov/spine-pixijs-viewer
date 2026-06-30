// Two Spine runtimes loaded side by side so the viewer can open both 4.2 and 4.3
// exports. They don't share global state, so coexisting in one session is safe;
// the only shared dependency is pixi.js, which both peer-depend on (^8.16).
import { extensions } from 'pixi.js'
// Source EVERY class (including the spine-core classes) from the spine-pixi
// namespace of each version — spine-pixi re-exports its own spine-core via
// `export * from '@esotericsoftware/spine-core'`. This guarantees the classes we
// parse with come from the exact same core module the Spine constructor checks
// `instanceof` against, so there's no chance of a duplicate-core mismatch.
// (The 4.2 build's core resolution is steered to 4.2 by the redirect plugin in
// vite.config.ts; without it, spine-pixi-42 would pick up the hoisted 4.3 core.)
import * as pixi43 from '@esotericsoftware/spine-pixi-v8'
import * as pixi42 from 'spine-pixi-42'

// Each spine-pixi build registers a render pipe named 'spine' and ships a Spine
// class whose renderPipeId is 'spine'. pixi keeps ONE pipe per name (first
// registration wins, later ones are silently dropped), so with both runtimes
// loaded, one version's Spine objects would be drawn by the other version's
// pipe. Give each runtime's pipe a unique name; the matching renderPipeId is set
// per-instance in newSpine() below (renderPipeId is an instance field, so a
// prototype override would just be overwritten by the constructor).
function isolateRenderPipe(ns: { SpinePipe: any }, pipeName: string): void {
  extensions.remove(ns.SpinePipe) // drop the registration under the original 'spine' name
  ns.SpinePipe.extension = { ...ns.SpinePipe.extension, name: pipeName }
  extensions.add(ns.SpinePipe) // re-register under the unique name
}
const PIPE_NAME: Record<RuntimeVersion, string> = { '4.3': 'spine-v43', '4.2': 'spine-v42' }
isolateRenderPipe(pixi43, PIPE_NAME['4.3'])
isolateRenderPipe(pixi42, PIPE_NAME['4.2'])

export type RuntimeVersion = '4.2' | '4.3'

/**
 * Bundle of the classes we need from a single runtime version. Typed loosely:
 * the 4.2 and 4.3 class shapes differ (private members, renamed methods), so we
 * keep them as `any` at the boundary and rely on the invariant that a skeleton
 * built by one runtime is only ever handed to the same runtime's Spine class.
 */
export interface SpineRuntime {
  version: RuntimeVersion
  TextureAtlas: any
  AtlasAttachmentLoader: any
  SkeletonJson: any
  SkeletonBinary: any
  SpineTexture: any
  Spine: any
}

export const RUNTIMES: Record<RuntimeVersion, SpineRuntime> = {
  '4.3': {
    version: '4.3',
    TextureAtlas: pixi43.TextureAtlas,
    AtlasAttachmentLoader: pixi43.AtlasAttachmentLoader,
    SkeletonJson: pixi43.SkeletonJson,
    SkeletonBinary: pixi43.SkeletonBinary,
    SpineTexture: pixi43.SpineTexture,
    Spine: pixi43.Spine,
  },
  '4.2': {
    version: '4.2',
    TextureAtlas: pixi42.TextureAtlas,
    AtlasAttachmentLoader: pixi42.AtlasAttachmentLoader,
    SkeletonJson: pixi42.SkeletonJson,
    SkeletonBinary: pixi42.SkeletonBinary,
    SpineTexture: pixi42.SpineTexture,
    Spine: pixi42.Spine,
  },
}

/** Versions we ship, newest first. */
export const RUNTIME_VERSIONS: RuntimeVersion[] = ['4.3', '4.2']

/**
 * Create a Spine display object with the right runtime and point it at that
 * runtime's isolated render pipe. renderPipeId is an instance field, so it must
 * be set on the instance (not the prototype) to override the constructor default.
 */
export function newSpine(version: RuntimeVersion, skeletonData: any): any {
  const spine = new RUNTIMES[version].Spine(skeletonData)
  spine.renderPipeId = PIPE_NAME[version]
  return spine
}

/**
 * Set a skin and reset to the setup pose, papering over the 4.2→4.3 rename:
 * 4.2 has setSkinByName()/setToSetupPose(), 4.3 has public setSkin()/setupPose().
 */
export function applySkin(skeleton: any, skinName: string): void {
  if (typeof skeleton.setupPose === 'function') {
    // 4.3
    skeleton.setSkin(skinName)
    skeleton.setupPose()
  } else {
    // 4.2
    skeleton.setSkinByName(skinName)
    skeleton.setToSetupPose()
  }
}
