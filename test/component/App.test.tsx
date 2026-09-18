// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ViewportableApi } from '../../src/preload'
import { DEFAULT_DEVICE_IDS } from '../../src/shared/device'
import type { BrowserCommand, BrowserState } from '../../src/shared/ipc'
import { App } from '../../src/renderer/App'

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('Device Board', () => {
  beforeEach(() => {
    localStorage.clear()

    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})

    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('can remove a device and add the same device again', async () => {
    const user = userEvent.setup()
    installViewportableMock()

    render(<App />)

    const toggle = await screen.findByTestId('device-toggle-iphone-15-pro')
    expect(screen.queryByTestId('device-card-iphone-15-pro')).not.toBeNull()

    await user.click(toggle)

    await waitFor(() => {
      expect(screen.queryByTestId('device-card-iphone-15-pro')).toBeNull()
    })

    await user.click(screen.getByTestId('device-toggle-iphone-15-pro'))

    await waitFor(() => {
      expect(screen.queryByTestId('device-card-iphone-15-pro')).not.toBeNull()
    })

    expect(JSON.parse(localStorage.getItem('viewportable.activeDeviceIds.v1') ?? '[]')).toContain(
      'iphone-15-pro',
    )
  })
})

function installViewportableMock(): void {
  let listener: ((state: BrowserState) => void) | null = null
  let state: BrowserState = {
    url: 'https://example.com',
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
    error: null,
    scaleMode: 'fit',
    viewportScales: {},
    activeDeviceIds: [...DEFAULT_DEVICE_IDS],
  }

  const emit = () => listener?.(state)

  const api: ViewportableApi = {
    command(command: BrowserCommand) {
      if (command.type === 'sync-state') {
        emit()
        return
      }

      if (command.type === 'set-devices') {
        state = {
          ...state,
          activeDeviceIds: [...command.deviceIds],
        }
        emit()
        return
      }

      if (command.type === 'set-scale-mode') {
        state = {
          ...state,
          scaleMode: command.mode,
        }
        emit()
      }
    },
    setViewportBounds() {},
    onBrowserState(nextListener) {
      listener = nextListener
      return () => {
        if (listener === nextListener) listener = null
      }
    },
  }

  Object.defineProperty(window, 'viewportable', {
    configurable: true,
    value: api,
  })
}
