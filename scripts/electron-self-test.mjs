import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electronPath from 'electron'

const TIMEOUT_MS = 30_000
const POLL_INTERVAL_MS = 50
const TERMINATE_GRACE_MS = 2_000

const tempDir = await mkdtemp(join(tmpdir(), 'viewportable-self-test-'))
const resultFile = join(tempDir, 'result.json')

const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Viewportable self-test</title>
  </head>
  <body style="min-height: 5000px; margin: 0">
    <main style="height: 5000px">Viewportable self-test</main>
  </body>
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
    VIEWPORTABLE_SELF_TEST_RESULT_FILE: resultFile,
  },
})

const childExit = new Promise((resolve) => {
  child.once('exit', (code, signal) => resolve({ code, signal }))
})

let result
try {
  result = await waitForResult(resultFile, TIMEOUT_MS)
  console.log(`[electron-self-test] result:${result.status}`)
} catch (error) {
  console.error('[electron-self-test] No self-test result', error)
  await terminateElectron(child, childExit)
  await cleanup()
  process.exit(1)
}

await terminateElectron(child, childExit)
await cleanup()

if (result.status === 'pass') {
  console.log('[electron-self-test] PASS')
  process.exit(0)
}

console.error('[electron-self-test] FAIL', result.error ?? 'unknown error')
process.exit(1)

async function waitForResult(path, timeoutMs) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      return JSON.parse(await readFile(path, 'utf8'))
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }

    await delay(POLL_INTERVAL_MS)
  }

  throw new Error(`Timed out after ${timeoutMs}ms`)
}

async function terminateElectron(processHandle, exitPromise) {
  if (processHandle.exitCode !== null || processHandle.signalCode !== null) return

  processHandle.kill('SIGTERM')
  await Promise.race([exitPromise, delay(TERMINATE_GRACE_MS)])

  if (processHandle.exitCode === null && processHandle.signalCode === null) {
    processHandle.kill('SIGKILL')
    await exitPromise
  }
}

async function cleanup() {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  await rm(tempDir, { recursive: true, force: true })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
