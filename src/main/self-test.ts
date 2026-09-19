import assert from 'node:assert/strict'
import type { BrowserWindow } from 'electron'
import { resolveBoardDevices } from '../core/board'
import { DEFAULT_DEVICE_IDS, DEFAULT_DEVICES, type DeviceSpec } from '../shared/device'
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
  const layout = await waitForReportedLayout(manager, DEFAULT_DEVICES.length)

  assert.equal(layout.length, DEFAULT_DEVICES.length)

  const visibleViewports = layout.filter(
    (viewport) => viewport.area && viewport.area.width > 0 && viewport.area.height > 0,
  )
  assert.ok(visibleViewports.length > 0, 'At least one native viewport must be visible')

  for (const viewport of layout) {
    assert.ok(viewport.area, `${viewport.id}: React did not report placeholder bounds`)

    if (viewport.area.width <= 0 || viewport.area.height <= 0) {
      assert.equal(
        viewport.visible,
        false,
        `${viewport.id}: clipped viewport should be hidden outside the board`,
      )
      continue
    }

    assert.equal(viewport.visible, true, `${viewport.id}: in-view native viewport is not visible`)
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

  const scrollFixture = '.scrollable:not([style*="display: none"])'

  manager.setSyncScrollEnabled(true)

  for (const deviceId of DEFAULT_DEVICE_IDS) {
    await manager.scrollViewportToProgress(deviceId, 0.2, scrollFixture)
  }
  await delay(150)

  await manager.scrollViewportToProgress(DEFAULT_DEVICE_IDS[0], 0.35, scrollFixture)
  await delay(200)

  const localOnlyProgress = await manager.inspectScrollProgress(scrollFixture)
  assert.ok(
    Math.abs((localOnlyProgress[DEFAULT_DEVICE_IDS[0]] ?? 0) - 0.35) < 0.03,
    'Local viewport scroll did not move the source viewport',
  )
  assert.ok(
    Math.abs((localOnlyProgress[DEFAULT_DEVICE_IDS[1]] ?? 0) - 0.2) < 0.03,
    'Local viewport scroll leaked into another viewport while Sync Scroll was enabled',
  )

  for (const deviceId of DEFAULT_DEVICE_IDS) {
    await manager.scrollViewportToProgress(deviceId, 0.5, scrollFixture)
  }

  window.show()
  window.focus()
  await delay(150)

  for (let index = 0; index < 20; index += 1) {
    window.webContents.sendInputEvent({
      type: 'mouseWheel',
      x: 40,
      y: 40,
      deltaX: 0,
      deltaY: 30,
      canScroll: true,
      hasPreciseScrollingDeltas: true,
    })
    await delay(8)
  }
  await delay(450)

  const globalProgress = await manager.inspectScrollProgress(scrollFixture)
  const globalSourceProgress = globalProgress[DEFAULT_DEVICE_IDS[0]]
  assert.ok(
    globalSourceProgress !== null &&
      globalSourceProgress !== undefined &&
      Math.abs(globalSourceProgress - 0.5) > 0.08,
    `Global wheel burst stalled after the first impulses: ${JSON.stringify(globalProgress)}`,
  )
  await waitForSyncedScroll(
    manager,
    DEFAULT_DEVICE_IDS,
    globalSourceProgress,
    scrollFixture,
  )

  manager.setSyncScrollEnabled(false)

  window.webContents.sendInputEvent({
    type: 'mouseWheel',
    x: 40,
    y: 40,
    deltaX: 0,
    deltaY: 400,
    canScroll: true,
    hasPreciseScrollingDeltas: true,
  })
  await delay(180)

  const disabledShellWheelProgress = await manager.inspectScrollProgress(scrollFixture)
  for (const deviceId of DEFAULT_DEVICE_IDS) {
    assert.ok(
      Math.abs((disabledShellWheelProgress[deviceId] ?? 0) - globalSourceProgress) < 0.03,
      `${deviceId}: shell wheel moved viewport while Sync Scroll was disabled`,
    )
  }

  manager.setSyncScrollEnabled(true)

  DEFAULT_DEVICES.forEach((device, index) => {
    manager.setAvailableBounds(device.id, {
      x: 260 + index * 520,
      y: 120,
      width: 500,
      height: 650,
    })
  })

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
  const expandedDevices = resolveBoardDevices(expandedIds)
  await manager.setDevices(expandedIds)

  const expanded = await waitForExpectedProfiles(manager, expectedUrlPrefix, expandedDevices)
  await waitForReportedLayout(manager, expandedDevices.length)
  assert.equal(expanded.length, 3, 'Dynamic device add did not create a third viewport')
  assert.ok(
    expanded.some((profile) => profile.id === 'compact-phone' && profile.innerWidth === 360),
    'Compact Phone runtime profile is missing',
  )

  await manager.setDevices(DEFAULT_DEVICE_IDS)
  await waitForExpectedProfiles(manager, expectedUrlPrefix, DEFAULT_DEVICES)
  await waitForReportedLayout(manager, DEFAULT_DEVICES.length)
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
      hasSyncScroll: document.querySelector('[aria-label="Sync scroll"]') !== null,
      hasDeviceSidebar: document.querySelector('.device-sidebar') !== null,
      hasBoard: document.querySelector('.viewport-board-scroll') !== null,
      hasApi: typeof window.viewportable === 'object'
    })`)) as {
      hasAppShell: boolean
      hasScaleControl: boolean
      hasSyncScroll: boolean
      hasDeviceSidebar: boolean
      hasBoard: boolean
      hasApi: boolean
    }

    if (
      shell.hasAppShell &&
      shell.hasScaleControl &&
      shell.hasSyncScroll &&
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

async function waitForReportedLayout(
  manager: ViewportManager,
  expectedCount: number,
): Promise<ReturnType<ViewportManager['inspectLayout']>> {
  const deadline = Date.now() + TIMEOUT_MS
  let lastLayout = manager.inspectLayout()

  while (Date.now() < deadline) {
    lastLayout = manager.inspectLayout()

    const hasReportedAreas =
      lastLayout.length === expectedCount &&
      lastLayout.every((viewport) => viewport.area !== null)

    const hasVisibleViewport = lastLayout.some(
      (viewport) =>
        viewport.area !== null &&
        viewport.area.width > 0 &&
        viewport.area.height > 0 &&
        viewport.visible &&
        viewport.bounds.width > 0 &&
        viewport.bounds.height > 0,
    )

    if (hasReportedAreas && hasVisibleViewport) return lastLayout
    await delay(POLL_INTERVAL_MS)
  }

  throw new Error(
    `Timed out waiting for reported viewport layout. Last layout: ${JSON.stringify(lastLayout)}`,
  )
}

async function waitForSyncedScroll(
  manager: ViewportManager,
  deviceIds: readonly string[],
  expectedProgress: number,
  selector?: string,
): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS
  let lastProgress: Record<string, number | null> = {}

  while (Date.now() < deadline) {
    lastProgress = await manager.inspectScrollProgress(selector)

    const synced = deviceIds.every((deviceId) => {
      const progress = lastProgress[deviceId]
      return progress !== null && progress !== undefined && Math.abs(progress - expectedProgress) < 0.03
    })

    if (synced) return
    await delay(POLL_INTERVAL_MS)
  }

  throw new Error(
    `Timed out waiting for synchronized scroll. Last progress: ${JSON.stringify(lastProgress)}`,
  )
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
