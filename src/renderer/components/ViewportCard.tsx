import { useLayoutEffect, useRef, useState } from 'react'
import type { DeviceSpec } from '../../shared/device'

type Props = {
  device: DeviceSpec
  scale: number
  removable: boolean
  layoutRevision: string
  onRemove(): void
}

export function ViewportCard({
  device,
  scale,
  removable,
  layoutRevision,
  onRemove,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [visibility, setVisibility] = useState<'unknown' | 'visible' | 'clipped'>('unknown')

  useLayoutEffect(() => {
    const element = hostRef.current
    if (!element) return

    const scrollContainer = element.closest('.viewport-board-scroll') as HTMLElement | null
    let frame = 0

    const measureAndSend = () => {
      const rect = element.getBoundingClientRect()
      const clip = scrollContainer?.getBoundingClientRect()

      const fullyVisible =
        !clip ||
        (rect.left >= clip.left &&
          rect.right <= clip.right &&
          rect.top >= clip.top &&
          rect.bottom <= clip.bottom)

      setVisibility(fullyVisible ? 'visible' : 'clipped')

      window.viewportable.setViewportBounds({
        viewportId: device.id,
        rect: fullyVisible
          ? {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            }
          : {
              x: rect.x,
              y: rect.y,
              width: 0,
              height: 0,
            },
      })
    }

    const sendBounds = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measureAndSend)
    }

    const observer = new ResizeObserver(sendBounds)
    observer.observe(element)
    if (scrollContainer) observer.observe(scrollContainer)

    window.addEventListener('resize', sendBounds)
    scrollContainer?.addEventListener('scroll', sendBounds, { passive: true })
    measureAndSend()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', sendBounds)
      scrollContainer?.removeEventListener('scroll', sendBounds)
    }
  }, [device.id, layoutRevision])

  return (
    <section
      className="viewport-card"
      data-device-card-id={device.id}
      data-testid={`device-card-${device.id}`}
    >
      <div className="viewport-header">
        <div>
          <strong>{device.name}</strong>
          <span>
            {device.css.width} × {device.css.height} · DPR {device.dpr}
          </span>
        </div>

        <div className="viewport-header-actions">
          <div className="viewport-meta">
            <span>Chromium mobile emulation</span>
            <span>×{scale.toFixed(3)}</span>
          </div>

          <button
            type="button"
            className="viewport-remove"
            aria-label={`Remove ${device.name}`}
            disabled={!removable}
            onClick={onRemove}
          >
            ×
          </button>
        </div>
      </div>

      <div className="viewport-host" ref={hostRef} data-viewport-id={device.id}>
        {visibility === 'clipped' ? (
          <span className="viewport-clipped-hint">Scroll to reveal viewport</span>
        ) : null}
      </div>
    </section>
  )
}
