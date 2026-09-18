import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { DEVICES } from '../shared/device'
import { BrowserCommandSchema, BrowserStateSchema, IPC, ViewportBoundsSchema } from '../shared/ipc'
import { runElectronSelfTest } from './self-test'
import { ViewportManager } from './viewport-manager'

let mainWindow: BrowserWindow | null = null
let viewportManager: ViewportManager | null = null

function traceStartup(message: string): void {
  if (process.env.VIEWPORTABLE_SELF_TEST === '1') {
    console.error(`[viewportable:startup] ${message}`)
  }
}

function exitSelfTest(code: number): never {
  console.error(`[viewportable:self-test] exiting with code ${code}`)
  process.exit(code)
}

function createWindow(): BrowserWindow {
  traceStartup('browser-window:create:start')
  const window = new BrowserWindow({
    title: 'Viewportable',
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#0b0d10',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      zoomFactor: 1,
    },
  })

  traceStartup('browser-window:create:done')
  window.webContents.setZoomFactor(1)
  window.webContents.on('before-input-event', (event, input) => {
    const modifier = process.platform === 'darwin' ? input.meta : input.control
    if (modifier && ['+', '=', '-', '0'].includes(input.key)) event.preventDefault()
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  traceStartup('viewport-manager:create:start')
  const manager = new ViewportManager(window, DEVICES, (state) => {
    if (!window.isDestroyed()) window.webContents.send(IPC.state, BrowserStateSchema.parse(state))
  })

  traceStartup('viewport-manager:create:done')
  viewportManager = manager
  mainWindow = window

  const initialUrl = process.env.VIEWPORTABLE_DEFAULT_URL ?? 'https://example.com'

  if (process.env.VIEWPORTABLE_SELF_TEST === '1') {
    window.webContents.once('did-finish-load', () => {
      void runElectronSelfTest(window, manager, initialUrl)
        .then(() => exitSelfTest(0))
        .catch((error: unknown) => {
          console.error('[viewportable:self-test] FAIL', error)
          exitSelfTest(1)
        })
    })
  }

  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    manager.destroy()
    if (mainWindow === window) mainWindow = null
    if (viewportManager === manager) viewportManager = null
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    traceStartup('shell:load-url')
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    traceStartup('shell:load-file')
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  traceStartup('viewports:load-initial-url')
  void manager.loadInitialUrl(initialUrl)

  return window
}

ipcMain.on(IPC.command, (_event, payload: unknown) => {
  const manager = viewportManager
  if (!manager) return

  const command = BrowserCommandSchema.parse(payload)
  switch (command.type) {
    case 'navigate':
      void manager.navigate(command.url)
      break
    case 'back':
      manager.back()
      break
    case 'forward':
      manager.forward()
      break
    case 'reload':
      manager.reload()
      break
    case 'sync-state':
      manager.emitState()
      break
  }
})

ipcMain.on(IPC.bounds, (_event, payload: unknown) => {
  const manager = viewportManager
  if (!manager) return

  const { viewportId, rect } = ViewportBoundsSchema.parse(payload)
  manager.setAvailableBounds(viewportId, {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  })
})

app.whenReady().then(() => {
  traceStartup('app:ready')
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
