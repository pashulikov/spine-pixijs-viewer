import { useCallback, useState } from 'react'
import type { SpineFiles } from '../utils/spineLoader'

interface DropZoneProps {
  onFilesReady: (files: SpineFiles) => void
  isLoading: boolean
}

interface FileState {
  skeleton: File | null
  atlas: File | null
  textures: File[]
}

const SKELETON_EXTS = ['.json', '.skel']
const ATLAS_EXTS = ['.atlas']
const TEXTURE_EXTS = ['.png', '.jpg', '.jpeg', '.webp']

function classifyFiles(files: File[]): FileState {
  const state: FileState = { skeleton: null, atlas: null, textures: [] }
  for (const f of files) {
    const lower = f.name.toLowerCase()
    if (SKELETON_EXTS.some(e => lower.endsWith(e))) state.skeleton = f
    else if (ATLAS_EXTS.some(e => lower.endsWith(e))) state.atlas = f
    else if (TEXTURE_EXTS.some(e => lower.endsWith(e))) state.textures.push(f)
  }
  return state
}

export function DropZone({ onFilesReady, isLoading }: DropZoneProps) {
  const [files, setFiles] = useState<FileState>({ skeleton: null, atlas: null, textures: [] })
  const [isDragging, setIsDragging] = useState(false)

  const processFiles = useCallback((incoming: File[]) => {
    setFiles(prev => {
      const classified = classifyFiles(incoming)
      const next: FileState = {
        skeleton: classified.skeleton ?? prev.skeleton,
        atlas: classified.atlas ?? prev.atlas,
        textures: classified.textures.length > 0
          ? [...prev.textures.filter(p => !classified.textures.find(n => n.name === p.name)), ...classified.textures]
          : prev.textures,
      }
      return next
    })
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
    processFiles(dropped)
  }, [processFiles])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    processFiles(selected)
    e.target.value = ''
  }, [processFiles])

  const handleLoad = useCallback(() => {
    if (files.skeleton && files.atlas && files.textures.length > 0) {
      onFilesReady(files as SpineFiles)
    }
  }, [files, onFilesReady])

  const clearAll = useCallback(() => {
    setFiles({ skeleton: null, atlas: null, textures: [] })
  }, [])

  const isReady = files.skeleton && files.atlas && files.textures.length > 0

  return (
    <div className="dropzone-section">
      <div
        className={`dropzone ${isDragging ? 'dragging' : ''}`}
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          multiple
          accept=".json,.skel,.atlas,.png,.jpg,.jpeg,.webp"
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
        <div className="dropzone-icon">↓</div>
        <div className="dropzone-text">
          {isDragging ? 'Drop files here' : 'Drop spine files or click to select'}
        </div>
        <div className="dropzone-hint">.json / .skel + .atlas + .png</div>
      </div>

      <div className="file-list">
        <FileRow label="Skeleton" file={files.skeleton} required />
        <FileRow label="Atlas" file={files.atlas} required />
        <div className="file-row">
          <span className="file-label">Textures</span>
          <span className={`file-name ${files.textures.length > 0 ? 'ok' : 'missing'}`}>
            {files.textures.length > 0
              ? files.textures.map(f => f.name).join(', ')
              : 'missing'}
          </span>
        </div>
      </div>

      <div className="dropzone-actions">
        <button
          className="btn btn-primary"
          onClick={handleLoad}
          disabled={!isReady || isLoading}
        >
          {isLoading ? 'Loading...' : 'Load Spine'}
        </button>
        <button className="btn btn-ghost" onClick={clearAll}>
          Clear
        </button>
      </div>
    </div>
  )
}

function FileRow({ label, file, required }: { label: string; file: File | null; required?: boolean }) {
  return (
    <div className="file-row">
      <span className="file-label">{label}{required && ' *'}</span>
      <span className={`file-name ${file ? 'ok' : 'missing'}`}>
        {file ? file.name : 'missing'}
      </span>
    </div>
  )
}
