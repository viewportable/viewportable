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
          <style>body { margin: 0; font-family: system-ui; }</style>
        </head>
        <body><main>Viewportable probe</main></body>
      </html>`)
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Unable to determine test server port')
  origin = `http://127.0.0.1:${address.port}`

  const args =
    process.platform === 'linux' ? ['--disable-gpu', '--disable-dev-shm-usage', '.'] : ['.']

  app = await electron.launch({
    args,
    cwd: process.cwd(),
    env: {
      ...process.env,
      VIEWPORTABLE_DEFAULT_URL: origin,
    },
  })
})

test.afterAll(async () => {
  await app?.close()
  await new Promise<void>((resolve, reject) => {
    server?.close((error) => (error ? reject(error) : resolve()))
  })
})

test('launches the Device Board', async () => {
  const shell = await app.firstWindow()

  await expect(shell.getByLabel('Device library')).toBeVisible()
  await expect(shell.getByText('2 viewports')).toBeVisible()
  await expect(shell.getByTestId('device-card-iphone-15-pro')).toBeVisible()
  await expect(shell.getByTestId('device-card-pixel-tablet')).toBeVisible()
})

test('device can be removed and added again', async () => {
  const shell = await app.firstWindow()
  const toggle = shell.getByTestId('device-toggle-iphone-15-pro')

  await toggle.click()
  await expect(shell.getByTestId('device-card-iphone-15-pro')).toHaveCount(0)

  await toggle.click()
  await expect(shell.getByTestId('device-card-iphone-15-pro')).toBeVisible()
})
