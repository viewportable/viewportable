// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ViewportableApi } from '../../src/preload'
import type { BrowserState } from '../../src/shared/ipc'
import { Toolbar } from '../../src/renderer/components/Toolbar'

afterEach(() => {
  cleanup()
})

describe('Toolbar', () => {
  it('sends the selected scale mode through the preload API', async () => {
    const command = vi.fn()
    const api: ViewportableApi = {
      command,
      setViewportBounds() {},
      onBrowserState() {
        return () => {}
      },
    }

    Object.defineProperty(window, 'viewportable', {
      configurable: true,
      value: api,
    })

    const state: BrowserState = {
      url: 'https://example.com',
      canGoBack: false,
      canGoForward: false,
      isLoading: false,
      error: null,
      scaleMode: 'fit',
      viewportScales: {},
      activeDeviceIds: ['iphone-15-pro'],
    }

    render(<Toolbar state={state} />)

    await userEvent.click(screen.getByRole('button', { name: 'Proportional' }))

    expect(command).toHaveBeenCalledWith({
      type: 'set-scale-mode',
      mode: 'proportional',
    })
  })
})
