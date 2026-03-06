import { Texture, ImageSource } from 'pixi.js'
import { AtlasAttachmentLoader, SkeletonJson, SkeletonBinary, SkeletonData, TextureAtlas } from '@esotericsoftware/spine-core'
import { SpineTexture } from '@esotericsoftware/spine-pixi-v8'

export interface SpineFiles {
  skeleton: File
  atlas: File
  textures: File[]
}

export interface LoadedSpineData {
  skeletonData: SkeletonData
  animations: string[]
  skins: string[]
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

export async function loadSpineData(files: SpineFiles): Promise<LoadedSpineData> {
  const atlasText = await readFileAsText(files.atlas)

  // Parse atlas (text only, no textures yet)
  const atlas = new TextureAtlas(atlasText)

  // filename (lowercase) → File lookup
  const textureFileMap = new Map(files.textures.map(f => [f.name.toLowerCase(), f]))

  // Load a PIXI texture for each atlas page and assign it
  for (const page of atlas.pages) {
    const matchingFile = textureFileMap.get(page.name.toLowerCase())

    if (!matchingFile) {
      throw new Error(
        `Texture "${page.name}" not found. Upload the corresponding image file.`
      )
    }

    const pixiTexture = await loadTextureFromFile(matchingFile)
    page.setTexture(SpineTexture.from(pixiTexture.source))
  }

  const attachmentLoader = new AtlasAttachmentLoader(atlas)

  let skeletonData: SkeletonData
  if (files.skeleton.name.endsWith('.skel')) {
    const buffer = await readFileAsArrayBuffer(files.skeleton)
    const binary = new SkeletonBinary(attachmentLoader)
    skeletonData = binary.readSkeletonData(new Uint8Array(buffer))
  } else {
    const jsonText = await readFileAsText(files.skeleton)
    const json = new SkeletonJson(attachmentLoader)
    skeletonData = json.readSkeletonData(JSON.parse(jsonText))
  }

  return {
    skeletonData,
    animations: skeletonData.animations.map(a => a.name),
    skins: skeletonData.skins.map(s => s.name),
  }
}
