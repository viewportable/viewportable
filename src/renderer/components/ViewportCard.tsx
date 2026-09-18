import type { DeviceSpec } from '../../shared/device'

type Props = {
  device: DeviceSpec
  scale: number
  removable: boolean
  clipped: boolean
  onRemove(): void
}

export function ViewportCard({ device, scale, removable, clipped, onRemove }: Props) {
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

      <div className="viewport-host" data-viewport-id={device.id}>
        {clipped ? (
          <span className="viewport-clipped-hint">Scroll to reveal viewport</span>
        ) : null}
      </div>
    </section>
  )
}
