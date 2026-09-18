import { useEffect, useRef, useState } from 'react'
import type { DeviceSpec } from '../../shared/device'
import { resolveFitScale } from '../../shared/scale'

type Props = {
  device: DeviceSpec
}

export function ViewportCard({ device }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const element = hostRef.current
    if (!element) return

    let frame = 0
    const sendBounds = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect()
        const nextScale = resolveFitScale(device, { width: rect.width, height: rect.height })
        setScale(nextScale)
        window.viewportable.setViewportBounds({
          viewportId: device.id,
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
        })
      })
    }

    const observer = new ResizeObserver(sendBounds)
    observer.observe(element)
    window.addEventListener('resize', sendBounds)
    sendBounds()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', sendBounds)
    }
  }, [device])

  return (
    <section className="viewport-card">
      <div className="viewport-header">
        <div>
          <strong>{device.name}</strong>
          <span>
            {device.css.width} × {device.css.height} · DPR {device.dpr}
          </span>
        </div>
        <div className="viewport-meta">
          <span>Chromium mobile emulation</span>
          <span>×{scale.toFixed(3)}</span>
        </div>
      </div>
      <div className="viewport-host" ref={hostRef} data-viewport-id={device.id} />
    </section>
  )
}
