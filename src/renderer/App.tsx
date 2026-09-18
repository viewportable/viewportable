import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_DEVICE_IDS,
  getDeviceById,
  resolveDeviceSelection,
  type DeviceSpec,
} from '../shared/device'
import type { BrowserState } from '../shared/ipc'
import { DeviceSidebar } from './components/DeviceSidebar'
import { Toolbar } from './components/Toolbar'
import { ViewportCard } from './components/ViewportCard'

const STORAGE_KEY = 'viewportable.activeDeviceIds.v1'

const INITIAL_STATE: BrowserState = {
  url: 'https://example.com',
  canGoBack: false,
  canGoForward: false,
  isLoading: true,
  error: null,
  scaleMode: 'fit',
  viewportScales: {},
  activeDeviceIds: [...DEFAULT_DEVICE_IDS],
}

export function App() {
  const [state, setState] = useState<BrowserState>(INITIAL_STATE)

  useEffect(() => {
    const unsubscribe = window.viewportable.onBrowserState(setState)
    window.viewportable.command({ type: 'sync-state' })

    const saved = readSavedDeviceIds()
    window.viewportable.command({ type: 'set-devices', deviceIds: saved })

    return unsubscribe
  }, [])

  const activeDevices = useMemo(
    () =>
      state.activeDeviceIds
        .map((id) => getDeviceById(id))
        .filter((device): device is DeviceSpec => device !== undefined),
    [state.activeDeviceIds],
  )

  function toggleDevice(deviceId: string) {
    const isActive = state.activeDeviceIds.includes(deviceId)

    if (isActive && state.activeDeviceIds.length === 1) return

    const next = isActive
      ? state.activeDeviceIds.filter((id) => id !== deviceId)
      : [...state.activeDeviceIds, deviceId]

    const resolved = resolveDeviceSelection(next).map((device) => device.id).slice(0, 6)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(resolved))
    window.viewportable.command({ type: 'set-devices', deviceIds: resolved })
  }

  return (
    <main className="app-shell">
      <Toolbar state={state} />

      {state.error ? (
        <div className="error-banner" role="alert">
          {state.error}
        </div>
      ) : null}

      <div className="workspace">
        <DeviceSidebar
          activeDeviceIds={state.activeDeviceIds}
          onToggleDevice={toggleDevice}
        />

        <section className="board-area">
          <div className="workspace-heading">
            <div>
              <p className="eyebrow">Responsive browser</p>
              <h1>{activeDevices.length} viewports</h1>
            </div>
            <p className="workspace-note">
              {state.scaleMode === 'fit'
                ? 'Fit scales each viewport independently to use its available space.'
                : 'Proportional applies one shared scale so relative device sizes stay truthful.'}
            </p>
          </div>

          <div className="viewport-board-scroll">
            <div className="viewport-board">
              {activeDevices.map((device) => (
                <ViewportCard
                  key={device.id}
                  device={device}
                  scale={state.viewportScales[device.id] ?? 1}
                  removable={activeDevices.length > 1}
                  onRemove={() => toggleDevice(device.id)}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function readSavedDeviceIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [...DEFAULT_DEVICE_IDS]

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...DEFAULT_DEVICE_IDS]

    return resolveDeviceSelection(parsed.filter((value): value is string => typeof value === 'string'))
      .map((device) => device.id)
      .slice(0, 6)
  } catch {
    return [...DEFAULT_DEVICE_IDS]
  }
}
