import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  syncScrollEnabled: true,
  viewportScales: {},
  activeDeviceIds: [...DEFAULT_DEVICE_IDS],
}

export function App() {
  const [state, setState] = useState<BrowserState>(INITIAL_STATE)
  const selectionRef = useRef<string[]>([...INITIAL_STATE.activeDeviceIds])
  const pendingRevealRef = useRef<string | null>(null)
  const boardScrollRef = useRef<HTMLDivElement>(null)
  const layoutRevisionRef = useRef(0)
  const [clippedDeviceIds, setClippedDeviceIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    const unsubscribeState = window.viewportable.onBrowserState((nextState) => {
      selectionRef.current = [...nextState.activeDeviceIds]
      setState(nextState)
    })
    window.viewportable.command({ type: 'sync-state' })

    const saved = readSavedDeviceIds()
    selectionRef.current = [...saved]
    window.viewportable.command({ type: 'set-devices', deviceIds: saved })

    const unsubscribeBoardScroll = window.viewportable.onBoardScroll(({ deltaX }) => {
      const scrollContainer = boardScrollRef.current
      if (!scrollContainer) return

      scrollContainer.scrollBy({
        left: deltaX,
        behavior: 'auto',
      })
    })

    return () => {
      unsubscribeState()
      unsubscribeBoardScroll()
    }
  }, [])

  const activeDevices = useMemo(
    () => resolveBoardDevices(state.activeDeviceIds),
    [state.activeDeviceIds],
  )
  const boardLayoutKey = state.activeDeviceIds.join('|')

  useLayoutEffect(() => {
    const scrollContainer = boardScrollRef.current
    if (!scrollContainer) return

    const deviceIds = boardLayoutKey ? boardLayoutKey.split('|') : []

    const pendingDeviceId = pendingRevealRef.current
    if (pendingDeviceId && deviceIds.includes(pendingDeviceId)) {
      const card = scrollContainer.querySelector<HTMLElement>(
        `[data-device-card-id="${pendingDeviceId}"]`,
      )
      card?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' })
      pendingRevealRef.current = null
    }

    const hosts = deviceIds
      .map((deviceId) =>
        scrollContainer.querySelector<HTMLElement>(`[data-viewport-id="${deviceId}"]`),
      )
      .filter((host): host is HTMLElement => host !== null)

    if (hosts.length === 0) return

    let frame = 0

    const measureAndSend = () => {
      const clip = scrollContainer.getBoundingClientRect()
      const clipped = new Set<string>()

      const viewports = hosts.map((host) => {
        const rect = host.getBoundingClientRect()
        const viewportId = host.dataset.viewportId!
        const fullyVisible =
          rect.left >= clip.left - 1 &&
          rect.right <= clip.right + 1 &&
          rect.top >= clip.top - 1 &&
          rect.bottom <= clip.bottom + 1

        if (!fullyVisible) clipped.add(viewportId)

        return {
          viewportId,
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
        }
      })

      setClippedDeviceIds((current) => (sameStringSet(current, clipped) ? current : clipped))

      window.viewportable.setBoardLayout({
        revision: ++layoutRevisionRef.current,
        viewports,
      })
    }

    const scheduleMeasure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measureAndSend)
    }

    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(scrollContainer)
    hosts.forEach((host) => observer.observe(host))

    window.addEventListener('resize', scheduleMeasure)
    scrollContainer.addEventListener('scroll', scheduleMeasure, { passive: true })
    scheduleMeasure()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', scheduleMeasure)
      scrollContainer.removeEventListener('scroll', scheduleMeasure)
    }
  }, [boardLayoutKey])

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

          <div className="viewport-board-scroll" ref={boardScrollRef}>
            <div className="viewport-board">
              {activeDevices.map((device) => (
                <ViewportCard
                  key={device.id}
                  device={device}
                  scale={state.viewportScales[device.id] ?? 1}
                  removable={activeDevices.length > 1}
                  clipped={clippedDeviceIds.has(device.id)}
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


function sameStringSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false
  for (const value of left) {
    if (!right.has(value)) return false
  }
  return true
}
