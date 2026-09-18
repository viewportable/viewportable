import { type FormEvent, useEffect, useState } from 'react'
import type { BrowserState } from '../../shared/ipc'

const INITIAL_STATE: BrowserState = {
  url: 'https://example.com',
  canGoBack: false,
  canGoForward: false,
  isLoading: true,
  error: null,
}

type Props = {
  state: BrowserState
}

export function Toolbar({ state }: Props) {
  const [value, setValue] = useState(state.url || INITIAL_STATE.url)

  useEffect(() => {
    if (state.url) setValue(state.url)
  }, [state.url])

  function submit(event: FormEvent) {
    event.preventDefault()
    window.viewportable.command({ type: 'navigate', url: value })
  }

  return (
    <header className="toolbar">
      <div className="brand" aria-label="Viewportable">
        <span className="brand-mark" aria-hidden="true">◩</span>
        <span>Viewportable</span>
      </div>

      <nav className="navigation" aria-label="Browser navigation">
        <button
          type="button"
          className="icon-button"
          aria-label="Back"
          disabled={!state.canGoBack}
          onClick={() => window.viewportable.command({ type: 'back' })}
        >
          ←
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Forward"
          disabled={!state.canGoForward}
          onClick={() => window.viewportable.command({ type: 'forward' })}
        >
          →
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Reload"
          onClick={() => window.viewportable.command({ type: 'reload' })}
        >
          {state.isLoading ? '×' : '↻'}
        </button>
      </nav>

      <form className="address-form" onSubmit={submit}>
        <span className="secure-dot" aria-hidden="true" />
        <input
          aria-label="Address"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
        />
      </form>

      <div className="toolbar-meta">
        <span className="mode-pill">Fit</span>
        <span className="engine-pill">Chromium</span>
      </div>
    </header>
  )
}
