// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ViewportCard } from '../../src/renderer/components/ViewportCard'
import { cleanup } from '@testing-library/react'
import { getDeviceById } from '../../src/shared/device'

const device = getDeviceById('iphone-15-pro')!

afterEach(() => {
  cleanup()
})

describe('ViewportCard scroll zone', () => {
  it('proxies a vertical gutter wheel gesture into the viewport', () => {
    const onScroll = vi.fn()

    render(
      <ViewportCard
        device={device}
        scale={0.8}
        removable
        clipped={false}
        onScroll={onScroll}
        onRemove={() => {}}
      />,
    )

    fireEvent.wheel(screen.getByTestId('viewport-scroll-zone-iphone-15-pro'), {
      deltaX: 3,
      deltaY: 48,
      deltaMode: 0,
    })

    expect(onScroll).toHaveBeenCalledWith(48)
  })

  it('leaves horizontal gestures for the board scroller', () => {
    const onScroll = vi.fn()

    render(
      <ViewportCard
        device={device}
        scale={0.8}
        removable
        clipped={false}
        onScroll={onScroll}
        onRemove={() => {}}
      />,
    )

    fireEvent.wheel(screen.getByTestId('viewport-scroll-zone-iphone-15-pro'), {
      deltaX: 60,
      deltaY: 8,
      deltaMode: 0,
    })

    expect(onScroll).not.toHaveBeenCalled()
  })
})
