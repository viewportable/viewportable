import assert from 'node:assert/strict'
import type { BrowserWindow } from 'electron'
import {
  DEFAULT_DEVICE_IDS,
  DEFAULT_DEVICES,
  resolveDeviceSelection,
  type DeviceSpec,
} from '../shared/device'
import type { ViewportManager, ViewportRuntimeProfile } from './viewport-manager'

const POLL_INTERVAL_MS = 100
const TIMEOUT_MS = 10_000

export async function runElectronSelfTest(
  window: BrowserWindow,
  manager: ViewportManager,
  expectedUrlPrefix: string,
): Promise<void> {
  await waitForShell(window)

  const before = await waitForExpectedProfiles(manager, expectedUrlPrefix, DEFAULT_DEVICES)
  const layout = manager.inspectLayout()

  assert.equal(layout.length, DEFAULT_DEVICES.length)
  for (const viewport of layout) {
    assert.ok(viewport.area, `${viewport.id}: React did not report placeholder bounds`)
    assert.equal(viewport.visible, true, `${viewport.id}: native viewport is not visible`)
    assert.ok(viewport.bounds.width > 0, `${viewport.id}: native viewport width is zero`)
    assert.ok(viewport.bounds.height > 0, `${viewport.id}: native viewport height is zero`)
    assert.ok(viewport.bounds.y > 50, `${viewport.id}: native viewport overlaps app toolbar`)
  }

  const expectedWidths = DEFAULT_DEVICES.map((device) => device.css.width).sort((a, b) => a - b)
  const expectedDprs = DEFAULT_DEVICES.map((device) => device.dpr).sort((a, b) => a - b)

  assert.deepEqual(
    before.map((profile) => profile.innerWidth).sort((a, b) => a - b),
    expectedWidths,
  )
  assert.deepEqual(
    before.map((profile) => profile.devicePixelRatio).sort((a, b) => a - b),
    expectedDprs,
  )

  for (const profile of before) {
    assert.ok(profile.maxTouchPoints > 0, `${profile.id}: touch emulation is not active`)
    assert.equal(profile.pointerCoarse, true, `${profile.id}: pointer is not coarse`)
    assert.equal(profile.hoverNone, true, `${profile.id}: hover is not none`)
    assert.match(profile.userAgent, /Chrome\/152/, `${profile.id}: unexpected user agent`)
  }

  manager.setScaleMode('proportional')
  await delay(250)

  const proportional = await manager.inspectProfiles()
  const proportionalScales = proportional.map((profile) => profile.resolvedScale)
  assert.ok(
    Math.max(...proportionalScales) - Math.min(...proportionalScales) < 0.001,
    `Proportional mode must use one shared scale: ${JSON.stringify(proportionalScales)}`,
  )
  assert.deepEqual(
    proportional.map((profile) => profile.innerWidth).sort((a, b) => a - b),
    expectedWidths,
    'Proportional mode changed logical viewport widths',
  )

  const expandedIds = [...DEFAULT_DEVICE_IDS, 'compact-phone']
  const expandedDevices = resolveDeviceSelection(expandedIds)
  await manager.setDevices(expandedIds)

  const expanded = await waitForExpectedProfiles(manager, expectedUrlPrefix, expandedDevices)
  assert.equal(expanded.length, 3, 'Dynamic device add did not create a third viewport')
  assert.ok(
    expanded.some((profile) => profile.id === 'compact-phone' && profile.innerWidth === 360),
    'Compact Phone runtime profile is missing',
  )

  await manager.setDevices(DEFAULT_DEVICE_IDS)
  await waitForExpectedProfiles(manager, expectedUrlPrefix, DEFAULT_DEVICES)
  assert.equal(manager.inspectLayout().length, DEFAULT_DEVICES.length, 'Dynamic device remove failed')

  await manager.setDevices(expandedIds)
  const readded = await waitForExpectedProfiles(manager, expectedUrlPrefix, expandedDevices)
  assert.ok(
    readded.some((profile) => profile.id === 'compact-phone' && profile.innerWidth === 360),
    'Removed device did not reappear after being added again',
  )

  await manager.setDevices(DEFAULT_DEVICE_IDS)
  await waitForExpectedProfiles(manager, expectedUrlPrefix, DEFAULT_DEVICES)

  window.setSize(1000, 680)
  await delay(400)

  const after = await manager.inspectProfiles()
  assert.deepEqual(
    after.map((profile) => profile.innerWidth).sort((a, b) => a - b),
    expectedWidths,
    'Logical viewport widths changed after window resize',
  )

  console.log('[viewportable:self-test] profiles', JSON.stringify(before))
  console.log('[viewportable:self-test] PASS')
}

async function waitForShell(window: BrowserWindow): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS

  while (Date.now() < deadline) {
    const shell = (await window.webContents.executeJavaScript(`({
      hasAppShell: document.querySelector('.app-shell') !== null,
      hasScaleControl: document.querySelector('[aria-label="Viewport scale mode"]') !== null,
      hasDeviceSidebar: document.querySelector('.device-sidebar') !== null,
      hasBoard: document.querySelector('.viewport-board-scroll') !== null,
      hasApi: typeof window.viewportable === 'object'
    })`)) as {
      hasAppShell: boolean
      hasScaleControl: boolean
      hasDeviceSidebar: boolean
      hasBoard: boolean
      hasApi: boolean
    }

    if (
      shell.hasAppShell &&
      shell.hasScaleControl &&
      shell.hasDeviceSidebar &&
      shell.hasBoard &&
      shell.hasApi
    ) {
      return
    }

    await delay(POLL_INTERVAL_MS)
  }

  throw new Error('Timed out waiting for the Device Board shell and preload API')
}

async function waitForExpectedProfiles(
  manager: ViewportManager,
  expectedUrlPrefix: string,
  devices: readonly DeviceSpec[],
): Promise<ViewportRuntimeProfile[]> {
  const deadline = Date.now() + TIMEOUT_MS
  let lastProfiles: ViewportRuntimeProfile[] = []
  const expectedIds = new Set(devices.map((device) => device.id))

  while (Date.now() < deadline) {
    try {
      lastProfiles = await manager.inspectProfiles()
    } catch {
      await delay(POLL_INTERVAL_MS)
      continue
    }

    const ready =
      lastProfiles.length === devices.length &&
      lastProfiles.every(
        (profile) =>
          expectedIds.has(profile.id) &&
          profile.url.startsWith(expectedUrlPrefix) &&
          profile.innerWidth > 0 &&
          profile.devicePixelRatio > 0 &&
          profile.maxTouchPoints > 0 &&
          profile.pointerCoarse &&
          profile.hoverNone,
      )

    if (ready) return lastProfiles
    await delay(POLL_INTERVAL_MS)
  }

  throw new Error(
    `Timed out waiting for emulated viewports. Last profiles: ${JSON.stringify(lastProfiles)}`,
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
