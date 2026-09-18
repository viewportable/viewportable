import { useEffect, useState } from 'react'
import { DEVICES } from '../shared/device'
import type { BrowserState } from '../shared/ipc'
import { Toolbar } from './components/Toolbar'
import { ViewportCard } from './components/ViewportCard'

const INITIAL_STATE: BrowserState = {
  url: 'https://example.com',
  canGoBack: false,
  canGoForward: false,
  isLoading: true,
  error: null,
}

export function App() {
  const [state, setState] = useState<BrowserState>(INITIAL_STATE)

  useEffect(() => {
    const unsubscribe = window.viewportable.onBrowserState(setState)
    window.viewportable.command({ type: 'sync-state' })
    return unsubscribe
  }, [])

  return (
    <main className="app-shell">
      <Toolbar state={state} />

      {state.error ? (
        <div className="error-banner" role="alert">
          {state.error}
        </div>
      ) : null}

      <div className="workspace">
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">Responsive browser</p>
            <h1>Two real Chromium viewports</h1>
          </div>
          <p className="workspace-note">
            Logical layout stays fixed while Fit mode changes only the rendered scale.
          </p>
        </div>

        <div className="viewport-grid">
          {DEVICES.map((device) => (
            <ViewportCard key={device.id} device={device} />
          ))}
        </div>
      </div>
    </main>
  )
}
