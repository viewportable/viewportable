import assert from 'node:assert/strict'
import type { BrowserWindow } from 'electron'
import { DEVICES } from '../shared/device'
import type { ViewportManager, ViewportRuntimeProfile } from './viewport-manager'

const POLL_INTERVAL_MS = 100
const TIMEOUT_MS = 10_000

export async function runElectronSelfTest(
  window: BrowserWindow,
  manager: ViewportManager,
  expectedUrlPrefix: string,
): Promise<void> {
  await waitForShell(window)

  const before = await waitForExpectedProfiles(manager, expectedUrlPrefix)
  const layout = manager.inspectLayout()

  assert.equal(layout.length, DEVICES.length)
  for (const viewport of layout) {
    assert.ok(viewport.area, `${viewport.id}: React did not report placeholder bounds`)
    assert.equal(viewport.visible, true, `${viewport.id}: native viewport is not visible`)
    assert.ok(viewport.bounds.width > 0, `${viewport.id}: native viewport width is zero`)
    assert.ok(viewport.bounds.height > 0, `${viewport.id}: native viewport height is zero`)
    assert.ok(viewport.bounds.y > 50, `${viewport.id}: native viewport overlaps app toolbar`)
  }

  const expectedWidths = DEVICES.map((device) => device.css.width).sort((a, b) => a - b)
  const expectedDprs = DEVICES.map((device) => device.dpr).sort((a, b) => a - b)

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
      text: document.body.innerText,
      hasApi: typeof window.viewportable === 'object'
    })`)) as { text: string; hasApi: boolean }

    if (shell.text.includes('Two real Chromium viewports') && shell.hasApi) return
    await delay(POLL_INTERVAL_MS)
  }

  throw new Error('Timed out waiting for the React shell and preload API')
}

async function waitForExpectedProfiles(
  manager: ViewportManager,
  expectedUrlPrefix: string,
): Promise<ViewportRuntimeProfile[]> {
  const deadline = Date.now() + TIMEOUT_MS
  let lastProfiles: ViewportRuntimeProfile[] = []

  while (Date.now() < deadline) {
    lastProfiles = await manager.inspectProfiles()

    const ready =
      lastProfiles.length === DEVICES.length &&
      lastProfiles.every(
        (profile) =>
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
