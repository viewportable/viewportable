import { useEffect, useMemo, useRef, useState } from 'react'
import {
  normalizeBoardDeviceIds,
  resolveBoardDevices,
  toggleBoardDevice,
} from '../core/board'
import { DEFAULT_DEVICE_IDS } from '../shared/device'
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
  const selectionRef = useRef<string[]>([...INITIAL_STATE.activeDeviceIds])
  const pendingRevealRef = useRef<string | null>(null)

  useEffect(() => {
    const unsubscribe = window.viewportable.onBrowserState((nextState) => {
      selectionRef.current = [...nextState.activeDeviceIds]
      setState(nextState)
    })
    window.viewportable.command({ type: 'sync-state' })

    const saved = readSavedDeviceIds()
    selectionRef.current = [...saved]
    window.viewportable.command({ type: 'set-devices', deviceIds: saved })

    return unsubscribe
  }, [])

  useEffect(() => {
    const deviceId = pendingRevealRef.current
    if (!deviceId || !state.activeDeviceIds.includes(deviceId)) return

    const frame = requestAnimationFrame(() => {
      const card = document.querySelector<HTMLElement>(`[data-device-card-id="${deviceId}"]`)
      card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'end' })
      pendingRevealRef.current = null
    })

    return () => cancelAnimationFrame(frame)
  }, [state.activeDeviceIds])

  const activeDevices = useMemo(
    () => resolveBoardDevices(state.activeDeviceIds),
    [state.activeDeviceIds],
  )

  function toggleDevice(deviceId: string) {
    const result = toggleBoardDevice(selectionRef.current, deviceId)
    if (!result.changed) return

    selectionRef.current = [...result.deviceIds]
    if (result.added) pendingRevealRef.current = deviceId

    localStorage.setItem(STORAGE_KEY, JSON.stringify(result.deviceIds))
    window.viewportable.command({ type: 'set-devices', deviceIds: result.deviceIds })
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

    return normalizeBoardDeviceIds(
      parsed.filter((value): value is string => typeof value === 'string'),
    )
  } catch {
    return [...DEFAULT_DEVICE_IDS]
  }
}
