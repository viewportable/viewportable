import { createServer, type Server } from 'node:http'
import { test, expect } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'

let server: Server
let origin: string
let app: ElectronApplication

test.beforeAll(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            body { margin: 0; font-family: system-ui; }
            .probe { width: 100vw; min-height: 100vh; }
          </style>
        </head>
        <body><main class="probe">Viewportable probe</main></body>
      </html>`)
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Unable to determine test server port')
  origin = `http://127.0.0.1:${address.port}`

  app = await electron.launch({
    args: ['--disable-gpu', '--disable-dev-shm-usage', '.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      VIEWPORTABLE_DEFAULT_URL: origin,
    },
  })

  app.process().on('exit', (code, signal) => {
    console.error(`[e2e] Electron exited: code=${String(code)} signal=${String(signal)}`)
  })
})

test.afterAll(async () => {
  await app?.close()
  await new Promise<void>((resolve, reject) => {
    server?.close((error) => (error ? reject(error) : resolve()))
  })
})

test('opens the shell and renders two independently emulated viewports', async () => {
  const shell = await app.firstWindow()
  await expect(shell.getByText('Two real Chromium viewports')).toBeVisible()
  await expect(shell.getByText('iPhone 15 Pro')).toBeVisible()
  await expect(shell.getByText('Pixel Tablet')).toBeVisible()

  await expect.poll(async () => getViewportProfiles()).toHaveLength(2)

  const profiles = await getViewportProfiles()
  expect(profiles.map((profile) => profile.innerWidth).sort((a, b) => a - b)).toEqual([393, 800])
  expect(profiles.map((profile) => profile.devicePixelRatio).sort((a, b) => a - b)).toEqual([2, 3])

  for (const profile of profiles) {
    expect(profile.maxTouchPoints).toBeGreaterThan(0)
    expect(profile.pointerCoarse).toBe(true)
    expect(profile.hoverNone).toBe(true)
    expect(profile.userAgent).toContain('Chrome/152')
  }
})

test('resizing the app changes fit scale without changing logical layout widths', async () => {
  const before = await getViewportProfiles()

  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window?.setSize(1000, 680)
  })

  await new Promise((resolve) => setTimeout(resolve, 250))
  const after = await getViewportProfiles()

  expect(after.map((profile) => profile.innerWidth).sort((a, b) => a - b)).toEqual(
    before.map((profile) => profile.innerWidth).sort((a, b) => a - b),
  )
})

async function getViewportProfiles() {
  return app.evaluate(async ({ webContents }, expectedOrigin) => {
    const pages = webContents
      .getAllWebContents()
      .filter((contents) => contents.getURL().startsWith(expectedOrigin))

    return Promise.all(
      pages.map(async (contents) =>
        contents.executeJavaScript(`({
          innerWidth: window.innerWidth,
          devicePixelRatio: window.devicePixelRatio,
          maxTouchPoints: navigator.maxTouchPoints,
          pointerCoarse: matchMedia('(pointer: coarse)').matches,
          hoverNone: matchMedia('(hover: none)').matches,
          userAgent: navigator.userAgent
        })`),
      ),
    )
  }, origin)
}
