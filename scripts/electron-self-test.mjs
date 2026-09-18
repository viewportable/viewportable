import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import electronPath from 'electron'

const TIMEOUT_MS = 30_000

const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Viewportable self-test</title>
  </head>
  <body>Viewportable self-test</body>
</html>`)
})

await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})

const address = server.address()
if (!address || typeof address === 'string') {
  throw new Error('Unable to determine self-test server port')
}

const origin = `http://127.0.0.1:${address.port}`
const child = spawn(electronPath, ['.'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: {
    ...process.env,
    VIEWPORTABLE_DEFAULT_URL: origin,
    VIEWPORTABLE_SELF_TEST: '1',
  },
})

const watchdog = setTimeout(() => {
  console.error(`[electron-self-test] Timed out after ${TIMEOUT_MS}ms; killing Electron`)
  child.kill('SIGKILL')
}, TIMEOUT_MS)

const result = await new Promise((resolve) => {
  child.once('exit', (code, signal) => resolve({ code, signal }))
})

clearTimeout(watchdog)

await new Promise((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()))
})

if (result.signal) {
  console.error(`[electron-self-test] Electron exited with signal ${result.signal}`)
  process.exit(1)
}

process.exit(result.code ?? 1)
