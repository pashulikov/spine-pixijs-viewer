import { useEffect, useRef } from 'react'
import { Application, Container } from 'pixi.js'
import { Spine } from '@esotericsoftware/spine-pixi-v8'
import type { SkeletonData } from '@esotericsoftware/spine-core'

export interface SpineCanvasControls {
  setAnimation: (name: string, loop: boolean) => void
  setSkin: (name: string) => void
  setTimeScale: (scale: number) => void
  resetTransform: () => void
}

interface SpineCanvasProps {
  skeletonData: SkeletonData | null
  bgColor: string
  onReady: (controls: SpineCanvasControls) => void
}

export function SpineCanvas({ skeletonData, bgColor, onReady }: SpineCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // appRef is set only AFTER init completes
  const appRef = useRef<Application | null>(null)
  const spineRef = useRef<Spine | null>(null)
  const worldContainerRef = useRef<Container | null>(null)
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, originX: 0, originY: 0 })
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  // Keep bgColor accessible inside async init callback
  const bgColorRef = useRef(bgColor)
  bgColorRef.current = bgColor

  // Init PixiJS once — guard against StrictMode double-invoke and async cleanup race
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false
    let roCleanup: (() => void) | null = null
    const app = new Application()

    app.init({
      // Don't use resizeTo — it sets up _cancelResize internally which breaks
      // if destroy() is called before init resolves. Use ResizeObserver manually.
      width: container.clientWidth || 800,
      height: container.clientHeight || 600,
      background: parseInt(bgColorRef.current.replace('#', ''), 16),
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    }).then(() => {
      if (cancelled) {
        app.destroy(true)
        return
      }

      // App is ready — assign ref so other effects can use it
      appRef.current = app
      container.appendChild(app.canvas)
      app.canvas.style.display = 'block'

      // Manual resize observer instead of resizeTo
      const ro = new ResizeObserver(() => {
        app.renderer.resize(container.clientWidth, container.clientHeight)
        app.stage.hitArea = app.screen
      })
      ro.observe(container)
      roCleanup = () => ro.disconnect()

      // World container for pan/zoom
      const worldContainer = new Container()
      app.stage.addChild(worldContainer)
      worldContainerRef.current = worldContainer

      // Drag
      app.stage.eventMode = 'static'
      app.stage.hitArea = app.screen

      app.stage.on('pointerdown', (e) => {
        dragRef.current = {
          isDragging: true,
          startX: e.global.x,
          startY: e.global.y,
          originX: worldContainer.x,
          originY: worldContainer.y,
        }
      })
      app.stage.on('pointermove', (e) => {
        const d = dragRef.current
        if (!d.isDragging) return
        worldContainer.x = d.originX + (e.global.x - d.startX)
        worldContainer.y = d.originY + (e.global.y - d.startY)
      })
      app.stage.on('pointerup', () => { dragRef.current.isDragging = false })
      app.stage.on('pointerupoutside', () => { dragRef.current.isDragging = false })

      // Wheel zoom toward cursor — normalize deltaY across trackpad/mouse/modes
      app.canvas.addEventListener('wheel', (e) => {
        e.preventDefault()
        // Normalize to pixel units so trackpad (mode=0, small values) and
        // mouse wheel (mode=1, line units) feel proportional
        let delta = e.deltaY
        if (e.deltaMode === 1) delta *= 20   // line → px
        else if (e.deltaMode === 2) delta *= 300 // page → px

        const factor = Math.pow(0.998, delta)
        const rect = app.canvas.getBoundingClientRect()
        const lx = e.clientX - rect.left
        const ly = e.clientY - rect.top
        worldContainer.x = lx + (worldContainer.x - lx) * factor
        worldContainer.y = ly + (worldContainer.y - ly) * factor
        worldContainer.scale.x *= factor
        worldContainer.scale.y *= factor
      }, { passive: false })
    })

    return () => {
      cancelled = true
      roCleanup?.()
      // Only destroy if init has completed (appRef is set)
      if (appRef.current) {
        appRef.current.destroy(true)
        appRef.current = null
      }
      worldContainerRef.current = null
      spineRef.current = null
    }
  }, [])

  // Update background color — only runs when app is already initialized
  useEffect(() => {
    const app = appRef.current
    if (!app) return
    app.renderer.background.color = parseInt(bgColor.replace('#', ''), 16)
  }, [bgColor])

  // Load / replace spine when skeletonData changes
  useEffect(() => {
    const app = appRef.current
    const worldContainer = worldContainerRef.current
    if (!app || !worldContainer) return

    // Destroy previous spine
    if (spineRef.current) {
      worldContainer.removeChild(spineRef.current)
      spineRef.current.destroy()
      spineRef.current = null
    }

    if (!skeletonData) return

    const spine = new Spine(skeletonData)
    spineRef.current = spine
    worldContainer.addChild(spine)

    const resetTransform = () => {
      const w = app.renderer.width
      const h = app.renderer.height
      worldContainer.x = w / 2
      worldContainer.y = h * 0.8
      worldContainer.scale.set(1)
    }
    resetTransform()

    if (skeletonData.animations.length > 0) {
      spine.state.setAnimation(0, skeletonData.animations[0].name, true)
    }

    onReadyRef.current({
      setAnimation: (name, loop) => spineRef.current?.state.setAnimation(0, name, loop),
      setSkin: (name) => {
        const s = spineRef.current
        if (!s) return
        s.skeleton.setSkinByName(name)
        s.skeleton.setToSetupPose()
      },
      setTimeScale: (scale) => {
        if (spineRef.current) spineRef.current.state.timeScale = scale
      },
      resetTransform,
    })
  }, [skeletonData])

  return (
    <div
      ref={containerRef}
      className="spine-canvas-container"
      style={{ cursor: skeletonData ? 'grab' : 'default' }}
    >
      {!skeletonData && (
        <div className="canvas-empty-state">
          <div className="canvas-empty-icon">🦴</div>
          <div className="canvas-empty-text">Load a spine to preview it here</div>
          <div className="canvas-empty-hint">Drag to move · Scroll to zoom</div>
        </div>
      )}
    </div>
  )
}
