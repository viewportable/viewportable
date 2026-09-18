import { describe, expect, it } from 'vitest'
import {
  MAX_ACTIVE_DEVICES,
  normalizeBoardDeviceIds,
  planBoardReconcile,
  resolveBoardDevices,
  toggleBoardDevice,
} from '../../src/core/board'
import { DEFAULT_DEVICE_IDS, DEVICE_CATALOG } from '../../src/shared/device'

describe('board core', () => {
  it('falls back to the default board for an invalid persisted selection', () => {
    expect(normalizeBoardDeviceIds(['missing-device'])).toEqual([...DEFAULT_DEVICE_IDS])
  })

  it('deduplicates while preserving order', () => {
    expect(
      normalizeBoardDeviceIds(['pixel-tablet', 'iphone-15-pro', 'pixel-tablet']),
    ).toEqual(['pixel-tablet', 'iphone-15-pro'])
  })

  it('caps a board at the product limit', () => {
    const ids = DEVICE_CATALOG.map((device) => device.id)
    expect(normalizeBoardDeviceIds(ids)).toHaveLength(MAX_ACTIVE_DEVICES)
  })

  it('resolves normalized ids to device specs', () => {
    expect(resolveBoardDevices(['compact-phone']).map((device) => device.id)).toEqual([
      'compact-phone',
    ])
  })

  it('does not allow removing the last device', () => {
    expect(toggleBoardDevice(['compact-phone'], 'compact-phone')).toEqual({
      deviceIds: ['compact-phone'],
      changed: false,
      added: false,
    })
  })

  it('supports remove and re-add as reversible state transitions', () => {
    const removed = toggleBoardDevice(['iphone-15-pro', 'pixel-tablet'], 'iphone-15-pro')
    expect(removed.deviceIds).toEqual(['pixel-tablet'])

    const readded = toggleBoardDevice(removed.deviceIds, 'iphone-15-pro')
    expect(readded).toEqual({
      deviceIds: ['pixel-tablet', 'iphone-15-pro'],
      changed: true,
      added: true,
    })
  })

  it('produces a deterministic reconcile plan for adapters', () => {
    expect(
      planBoardReconcile(
        ['iphone-15-pro', 'pixel-tablet'],
        ['pixel-tablet', 'compact-phone'],
      ),
    ).toEqual({
      deviceIds: ['pixel-tablet', 'compact-phone'],
      removeIds: ['iphone-15-pro'],
      addIds: ['compact-phone'],
    })
  })
})
