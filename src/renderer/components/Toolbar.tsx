import { type FormEvent, useEffect, useState } from 'react'
import type { BrowserState } from '../../shared/ipc'

type Props = {
  state: BrowserState
}

export function Toolbar({ state }: Props) {
  const [value, setValue] = useState(state.url || 'https://example.com')

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
        <div className="scale-control" aria-label="Viewport scale mode">
          <button
            type="button"
            className={state.scaleMode === 'fit' ? 'scale-option active' : 'scale-option'}
            aria-pressed={state.scaleMode === 'fit'}
            onClick={() => window.viewportable.command({ type: 'set-scale-mode', mode: 'fit' })}
          >
            Fit
          </button>
          <button
            type="button"
            className={state.scaleMode === 'proportional' ? 'scale-option active' : 'scale-option'}
            aria-pressed={state.scaleMode === 'proportional'}
            onClick={() =>
              window.viewportable.command({ type: 'set-scale-mode', mode: 'proportional' })
            }
          >
            Proportional
          </button>
        </div>
        <span className="engine-pill">Chromium</span>
      </div>
    </header>
  )
}
