// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ViewportableApi } from '../../src/preload'
import { RecordingControl } from '../../src/renderer/components/RecordingControl'

const saveRecording = vi.fn(async () => ({ status: 'saved' as const }))

class FakeMediaRecorder {
  static isTypeSupported = vi.fn((mimeType: string) => mimeType.startsWith('video/webm'))

  state: RecordingState = 'inactive'
  mimeType: string
  ondataavailable: ((event: BlobEvent) => void) | null = null
  onerror: (() => void) | null = null
  onstop: (() => void) | null = null

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? 'video/webm'
  }

  start(): void {
    this.state = 'recording'
  }

  stop(): void {
    this.state = 'inactive'
    this.ondataavailable?.({
      data: new Blob(['viewportable-video'], { type: this.mimeType }),
    } as BlobEvent)
    this.onstop?.()
  }
}

describe('RecordingControl', () => {
  const stopTrack = vi.fn()
  const videoTrack = {
    stop: stopTrack,
    addEventListener: vi.fn(),
  } as unknown as MediaStreamTrack

  const stream = {
    getVideoTracks: () => [videoTrack],
    getTracks: () => [videoTrack],
  } as unknown as MediaStream

  beforeEach(() => {
    saveRecording.mockClear()
    stopTrack.mockClear()

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getDisplayMedia: vi.fn(async () => stream),
      },
    })

    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)

    const api: ViewportableApi = {
      command() {},
      setViewportBounds() {},
      onBrowserState() {
        return () => {}
      },
      saveRecording,
    }

    Object.defineProperty(window, 'viewportable', {
      configurable: true,
      value: api,
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('records the app window and saves the captured bytes', async () => {
    const user = userEvent.setup()
    render(<RecordingControl />)

    await user.click(screen.getByRole('button', { name: 'Record Viewportable window' }))
    expect(screen.getByRole('button', { name: 'Stop recording' })).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Stop recording' }))

    await waitFor(() => {
      expect(saveRecording).toHaveBeenCalledTimes(1)
    })

    const request = saveRecording.mock.calls[0]?.[0]
    expect(request?.extension).toBe('webm')
    expect(request?.mimeType).toContain('video/webm')
    expect(request?.bytes.byteLength).toBeGreaterThan(0)
    expect(stopTrack).toHaveBeenCalled()
  })
})
