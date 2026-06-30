import { Texture, ImageSource } from 'pixi.js'
import { RUNTIMES, RUNTIME_VERSIONS } from './runtimes'
import type { RuntimeVersion, SpineRuntime } from './runtimes'

export interface SpineFiles {
  skeleton: File
  atlas: File
  textures: File[]
}

export interface LoadedSpineData {
  skeletonData: any
  animations: string[]
  skins: string[]
  /** Spine editor version the file was exported with (from the file header) */
  fileVersion: string | null
  /** Which bundled runtime actually parsed the file */
  runtimeVersion: RuntimeVersion
}

function majorMinor(version: string | null): string | null {
  if (!version) return null
  const m = version.match(/^(\d+)\.(\d+)/)
  return m ? `${m[1]}.${m[2]}` : null
}

/**
 * Read the editor version string from a binary .skel header without fully parsing it.
 * Layout: int32 lowHash, int32 highHash, then a varint-length-prefixed UTF-8 string.
 * Returns null if it can't be read.
 */
function readSkelVersion(buffer: ArrayBuffer): string | null {
  try {
    const view = new DataView(buffer)
    let index = 8 // skip the two int32 hash words

    // varint (optimizePositive), matching BinaryInput.readInt(true)
    let byteCount = 0
    let shift = 0
    for (let i = 0; i < 5; i++) {
      const b = view.getUint8(index++)
      byteCount |= (b & 0x7f) << shift
      if ((b & 0x80) === 0) break
      shift += 7
    }
    if (byteCount <= 1) return null // 0 = null, 1 = empty string
    byteCount-- // stored length is +1

    const bytes = new Uint8Array(buffer, index, byteCount)
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return null
  }
}

/** Read the editor version from a JSON skeleton (skeleton.spine field). */
function readJsonVersion(json: unknown): string | null {
  if (json && typeof json === 'object') {
    const skel = (json as Record<string, unknown>).skeleton
    if (skel && typeof skel === 'object') {
      const spine = (skel as Record<string, unknown>).spine
      if (typeof spine === 'string') return spine
    }
  }
  return null
}

/** Build a clear, human-readable error after every bundled runtime failed to parse the file. */
function allRuntimesFailedMessage(fileVersion: string | null, lastError: unknown): string {
  const orig = lastError instanceof Error ? lastError.message : String(lastError)
  const available = RUNTIME_VERSIONS.map(v => `${v}.x`).join(' and ')

  if (fileVersion) {
    return (
      `Couldn't parse this skeleton (exported by Spine editor ${fileVersion}). ` +
      `The viewer bundles runtimes ${available}, and none could read it ` +
      `(last error: "${orig}"). The editor version is likely outside the supported ` +
      `range — re-export from Spine ${RUNTIME_VERSIONS.join(' or ')}.`
    )
  }

  return (
    `Failed to parse the skeleton ("${orig}"). The export version couldn't be read ` +
    `from the file header, and none of the bundled runtimes (${available}) could ` +
    `read it — the file may be corrupt or not a valid Spine export.`
  )
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

/** Load image file → PIXI Texture without using Assets loader (blob URLs have no extension) */
function loadTextureFromFile(file: File): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(blobUrl)
      const source = new ImageSource({ resource: img })
      resolve(new Texture({ source }))
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(blobUrl)
      reject(new Error(`Failed to load image: ${file.name} — ${String(e)}`))
    }
    img.src = blobUrl
  })
}

/** Thrown when a required texture file is missing — not a version problem, so it must not trigger runtime fallback. */
class TextureMissingError extends Error {}

/** Parse the skeleton with a single runtime; throws if that runtime can't read it. */
function parseWithRuntime(
  rt: SpineRuntime,
  atlasText: string,
  sourceForPage: (pageName: string) => Promise<any>,
  isBinary: boolean,
  skelBuffer: ArrayBuffer | null,
  skelParsed: unknown,
): Promise<any> {
  return (async () => {
    const atlas = new rt.TextureAtlas(atlasText)
    for (const page of atlas.pages) {
      page.setTexture(rt.SpineTexture.from(await sourceForPage(page.name)))
    }
    const attachmentLoader = new rt.AtlasAttachmentLoader(atlas)
    if (isBinary) {
      const binary = new rt.SkeletonBinary(attachmentLoader)
      return binary.readSkeletonData(new Uint8Array(skelBuffer!))
    }
    const json = new rt.SkeletonJson(attachmentLoader)
    return json.readSkeletonData(skelParsed)
  })()
}

export async function loadSpineData(files: SpineFiles): Promise<LoadedSpineData> {
  const atlasText = await readFileAsText(files.atlas)
  const isBinary = files.skeleton.name.endsWith('.skel')

  // Read the skeleton once and detect the editor version up front.
  let skelBuffer: ArrayBuffer | null = null
  let skelParsed: unknown = null
  let fileVersion: string | null = null
  if (isBinary) {
    skelBuffer = await readFileAsArrayBuffer(files.skeleton)
    fileVersion = readSkelVersion(skelBuffer)
  } else {
    skelParsed = JSON.parse(await readFileAsText(files.skeleton))
    fileVersion = readJsonVersion(skelParsed)
  }

  // Decode each PIXI texture source once and share it across runtime attempts —
  // SpineTexture wraps the same underlying pixi source regardless of runtime version.
  const textureFileMap = new Map(files.textures.map(f => [f.name.toLowerCase(), f]))
  const sourceCache = new Map<string, any>()
  const sourceForPage = async (pageName: string) => {
    const key = pageName.toLowerCase()
    const cached = sourceCache.get(key)
    if (cached) return cached
    const file = textureFileMap.get(key)
    if (!file) {
      throw new TextureMissingError(
        `Texture "${pageName}" not found. Upload the corresponding image file.`
      )
    }
    const source = (await loadTextureFromFile(file)).source
    sourceCache.set(key, source)
    return source
  }

  // Try the runtime matching the file version first, then fall back to the others.
  const matched = majorMinor(fileVersion) as RuntimeVersion | null
  const order = matched && RUNTIMES[matched]
    ? [matched, ...RUNTIME_VERSIONS.filter(v => v !== matched)]
    : [...RUNTIME_VERSIONS]

  let lastError: unknown
  for (const version of order) {
    try {
      const skeletonData = await parseWithRuntime(
        RUNTIMES[version], atlasText, sourceForPage, isBinary, skelBuffer, skelParsed
      )
      return {
        skeletonData,
        animations: skeletonData.animations.map((a: any) => a.name),
        skins: skeletonData.skins.map((s: any) => s.name),
        fileVersion,
        runtimeVersion: version,
      }
    } catch (e) {
      if (e instanceof TextureMissingError) throw e // not a version issue — don't retry
      lastError = e
    }
  }

  throw new Error(allRuntimesFailedMessage(fileVersion, lastError))
}
