import { useMemo, useState } from 'react'
import { DEVICE_CATALOG, type DeviceCategory } from '../../shared/device'

type Props = {
  activeDeviceIds: readonly string[]
  onToggleDevice(deviceId: string): void
}

const GROUPS: Array<{ category: DeviceCategory; label: string }> = [
  { category: 'phone', label: 'Phones' },
  { category: 'tablet', label: 'Tablets' },
]

export function DeviceSidebar({ activeDeviceIds, onToggleDevice }: Props) {
  const [query, setQuery] = useState('')
  const active = useMemo(() => new Set(activeDeviceIds), [activeDeviceIds])
  const normalizedQuery = query.trim().toLowerCase()

  return (
    <aside className="device-sidebar" aria-label="Device library">
      <div className="device-sidebar-header">
        <div>
          <p className="eyebrow">Device library</p>
          <strong>{activeDeviceIds.length} active</strong>
        </div>
      </div>

      <input
        className="device-search"
        aria-label="Search devices"
        placeholder="Search devices..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="device-groups">
        {GROUPS.map(({ category, label }) => {
          const devices = DEVICE_CATALOG.filter(
            (device) =>
              device.category === category &&
              (!normalizedQuery || device.name.toLowerCase().includes(normalizedQuery)),
          )

          if (devices.length === 0) return null

          return (
            <section className="device-group" key={category}>
              <div className="device-group-title">{label}</div>

              {devices.map((device) => {
                const selected = active.has(device.id)
                const cannotRemove = selected && activeDeviceIds.length === 1

                return (
                  <button
                    key={device.id}
                    type="button"
                    className={selected ? 'device-row active' : 'device-row'}
                    aria-pressed={selected}
                    aria-label={`${selected ? 'Remove' : 'Add'} ${device.name}`}
                    data-testid={`device-toggle-${device.id}`}
                    disabled={cannotRemove}
                    onClick={() => onToggleDevice(device.id)}
                  >
                    <span className="device-check" aria-hidden="true">
                      {selected ? '✓' : '+'}
                    </span>
                    <span className="device-row-copy">
                      <strong>{device.name}</strong>
                      <span>
                        {device.css.width} × {device.css.height} · DPR {device.dpr}
                      </span>
                    </span>
                  </button>
                )
              })}
            </section>
          )
        })}
      </div>
    </aside>
  )
}
