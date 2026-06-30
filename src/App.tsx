import { useState, useCallback, useRef } from 'react'
import { DropZone } from './components/DropZone'
import { SpineCanvas } from './components/SpineCanvas'
import type { SpineCanvasControls } from './components/SpineCanvas'
import { loadSpineData } from './utils/spineLoader'
import type { SpineFiles, LoadedSpineData } from './utils/spineLoader'

export default function App() {
  const [skeletonData, setSkeletonData] = useState<any | null>(null)
  const [spineInfo, setSpineInfo] = useState<LoadedSpineData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedAnimation, setSelectedAnimation] = useState<string>('')
  const [selectedSkin, setSelectedSkin] = useState<string>('')
  const [loop, setLoop] = useState(true)
  const [timeScale, setTimeScale] = useState(1)
  const [bgColor, setBgColor] = useState('#1a1a2e')

  const controlsRef = useRef<SpineCanvasControls | null>(null)

  const handleFilesReady = useCallback(async (files: SpineFiles) => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await loadSpineData(files)
      setSpineInfo(data)
      setSkeletonData(data.skeletonData)
      setSelectedAnimation(data.animations[0] ?? '')
      setSelectedSkin(data.skins[0] ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleCanvasReady = useCallback((controls: SpineCanvasControls) => {
    controlsRef.current = controls
    controls.setTimeScale(timeScale)
  }, [timeScale])

  const handleAnimationChange = useCallback((name: string) => {
    setSelectedAnimation(name)
    controlsRef.current?.setAnimation(name, loop)
  }, [loop])

  const handleSkinChange = useCallback((name: string) => {
    setSelectedSkin(name)
    controlsRef.current?.setSkin(name)
  }, [])

  const handleLoopChange = useCallback((val: boolean) => {
    setLoop(val)
    if (selectedAnimation) {
      controlsRef.current?.setAnimation(selectedAnimation, val)
    }
  }, [selectedAnimation])

  const handleTimeScaleChange = useCallback((val: number) => {
    setTimeScale(val)
    controlsRef.current?.setTimeScale(val)
  }, [])

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-logo">◈</span>
          <span className="sidebar-title">Spine PixiJS Viewer</span>
        </div>

        <section className="sidebar-section">
          <div className="section-label">Files</div>
          <DropZone onFilesReady={handleFilesReady} isLoading={isLoading} />
        </section>

        {error && (
          <div className="error-box">
            <strong>Error:</strong> {error}
          </div>
        )}

        {spineInfo && (
          <>
            <section className="sidebar-section">
              <div className="section-label">Animation</div>
              <div className="anim-select-row">
                <select
                  className="select"
                  value={selectedAnimation}
                  onChange={e => handleAnimationChange(e.target.value)}
                >
                  {spineInfo.animations.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <button
                  className="play-btn"
                  title="Play animation from start"
                  onClick={() => {
                    if (selectedAnimation) controlsRef.current?.setAnimation(selectedAnimation, loop)
                  }}
                >
                  ▶
                </button>
              </div>

              <div className="control-row">
                <label className="control-label">Loop</label>
                <button
                  className={`toggle-btn ${loop ? 'active' : ''}`}
                  onClick={() => handleLoopChange(!loop)}
                >
                  {loop ? 'On' : 'Off'}
                </button>
              </div>

              <div className="control-row">
                <label className="control-label">Speed {timeScale.toFixed(2)}x</label>
              </div>
              <input
                type="range"
                className="slider"
                min="0.05"
                max="3"
                step="0.05"
                value={timeScale}
                onChange={e => handleTimeScaleChange(parseFloat(e.target.value))}
              />
              <div className="speed-presets">
                {[0.25, 0.5, 1, 1.5, 2].map(s => (
                  <button
                    key={s}
                    className={`preset-btn ${timeScale === s ? 'active' : ''}`}
                    onClick={() => handleTimeScaleChange(s)}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </section>

            {spineInfo.skins.length > 1 && (
              <section className="sidebar-section">
                <div className="section-label">Skin</div>
                <select
                  className="select"
                  value={selectedSkin}
                  onChange={e => handleSkinChange(e.target.value)}
                >
                  {spineInfo.skins.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </section>
            )}

            <section className="sidebar-section">
              <div className="section-label">Viewport</div>
              <div className="control-row">
                <label className="control-label">Background</label>
                <input
                  type="color"
                  className="color-input"
                  value={bgColor}
                  onChange={e => setBgColor(e.target.value)}
                />
              </div>
              <button
                className="btn btn-ghost full-width"
                onClick={() => controlsRef.current?.resetTransform()}
              >
                Reset View
              </button>
            </section>

            <section className="sidebar-section info-section">
              <div className="section-label">Info</div>
              <div className="info-row">
                <span>Animations</span>
                <span className="info-value">{spineInfo.animations.length}</span>
              </div>
              <div className="info-row">
                <span>Skins</span>
                <span className="info-value">{spineInfo.skins.length}</span>
              </div>
              <div className="info-row">
                <span>Editor version</span>
                <span className="info-value">{spineInfo.fileVersion || spineInfo.skeletonData.version || '—'}</span>
              </div>
              <div className="info-row">
                <span>Runtime used</span>
                <span className="info-value">{spineInfo.runtimeVersion}.x</span>
              </div>
            </section>
          </>
        )}
      </aside>

      <main className="canvas-area">
        <SpineCanvas
          skeletonData={skeletonData}
          runtimeVersion={spineInfo?.runtimeVersion ?? null}
          bgColor={bgColor}
          onReady={handleCanvasReady}
        />
      </main>
    </div>
  )
}
