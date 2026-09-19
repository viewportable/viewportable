import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
} from 'electron'
import { writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DEFAULT_DEVICES } from '../shared/device'
import {
  BoardLayoutSnapshotSchema,
  BrowserCommandSchema,
  BrowserStateSchema,
  IPC,
  SaveRecordingRequestSchema,
  ViewportBoundsSchema,
} from '../shared/ipc'
import { runElectronSelfTest } from './self-test'
import { ViewportManager } from './viewport-manager'

let mainWindow: BrowserWindow | null = null
let viewportManager: ViewportManager | null = null

app.setName('Viewportable')

function installApplicationMenu(): void {
  if (process.platform !== 'darwin') return

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Viewportable',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function installDisplayMediaHandler(window: BrowserWindow): void {
  window.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    const isShellRequest =
      request.videoRequested &&
      request.frame !== null &&
      request.frame === window.webContents.mainFrame

    if (!isShellRequest) {
      callback({})
      return
    }

    void desktopCapturer
      .getSources({
        types: ['window'],
        thumbnailSize: { width: 0, height: 0 },
        fetchWindowIcons: false,
      })
      .then((sources) => {
        const title = window.getTitle()
        const source =
          sources.find((candidate) => candidate.name === title && candidate.id.endsWith(':1')) ??
          sources.find((candidate) => candidate.name === title) ??
          sources.find((candidate) => candidate.id.endsWith(':1'))

        callback(source ? { video: source } : {})
      })
      .catch((error: unknown) => {
        console.error('[viewportable] Unable to resolve recording source', error)
        callback({})
      })
  })
}

function traceStartup(message: string): void {
  if (process.env.VIEWPORTABLE_SELF_TEST === '1') {
    console.error(`[viewportable:startup] ${message}`)
  }
}

function reportSelfTest(status: 'pass' | 'fail', error?: unknown): void {
  const resultFile = process.env.VIEWPORTABLE_SELF_TEST_RESULT_FILE
  const payload = {
    status,
    error: error instanceof Error ? error.stack ?? error.message : error ? String(error) : null,
  }

  if (resultFile) {
    writeFileSync(resultFile, JSON.stringify(payload), 'utf8')
  }

  console.error(`[viewportable:self-test] result:${status}`)
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
  installDisplayMediaHandler(window)
  window.webContents.setZoomFactor(1)
  window.webContents.on('before-input-event', (event, input) => {
    const modifier = process.platform === 'darwin' ? input.meta : input.control
    if (modifier && ['+', '=', '-', '0'].includes(input.key)) event.preventDefault()
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[viewportable] preload error', preloadPath, error)
  })
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    console.error('[viewportable] shell load failed', errorCode, errorDescription, validatedUrl)
  })

  traceStartup('viewport-manager:create:start')
  const manager = new ViewportManager(window, DEFAULT_DEVICES, (state) => {
    if (!window.isDestroyed()) window.webContents.send(IPC.state, BrowserStateSchema.parse(state))
  })

  traceStartup('viewport-manager:create:done')

  viewportManager = manager
  mainWindow = window

  const initialUrl = process.env.VIEWPORTABLE_DEFAULT_URL ?? 'https://example.com'

  if (process.env.VIEWPORTABLE_SELF_TEST === '1') {
    window.webContents.once('did-finish-load', () => {
      void runElectronSelfTest(window, manager, initialUrl)
        .then(() => reportSelfTest('pass'))
        .catch((error: unknown) => {
          console.error('[viewportable:self-test] FAIL', error)
          reportSelfTest('fail', error)
        })
    })
  }

  window.once('ready-to-show', () => window.show())
  window.once('close', () => {
    manager.destroy()
  })
  window.on('closed', () => {
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
    case 'set-scale-mode':
      manager.setScaleMode(command.mode)
      break
    case 'set-sync-scroll':
      manager.setSyncScrollEnabled(command.enabled)
      break
    case 'scroll-viewport':
      void manager.scrollViewportByDelta(command.viewportId, command.deltaY)
      break
    case 'scroll-all-viewports':
      manager.handleSynchronizedScroll(command.deltaY)
      break
    case 'set-devices':
      void manager.setDevices(command.deviceIds)
      break
  }
})

ipcMain.handle(IPC.saveRecording, async (event, payload: unknown) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || window !== mainWindow) throw new Error('Recording save request is not from the shell')

  const recording = SaveRecordingRequestSchema.parse(payload)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const defaultPath = `viewportable-recording-${timestamp}.${recording.extension}`

  const result = await dialog.showSaveDialog(window, {
    title: 'Save Viewportable recording',
    defaultPath,
    filters: [
      {
        name: recording.extension === 'mp4' ? 'MP4 Video' : 'WebM Video',
        extensions: [recording.extension],
      },
    ],
  })

  if (result.canceled || !result.filePath) return { status: 'cancelled' } as const

  await writeFile(result.filePath, Buffer.from(recording.bytes))
  return { status: 'saved' } as const
})

ipcMain.on(IPC.boardLayout, (_event, payload: unknown) => {
  const manager = viewportManager
  if (!manager) return

  const snapshot = BoardLayoutSnapshotSchema.parse(payload)
  manager.setBoardLayout(
    snapshot.revision,
    snapshot.viewports.map(({ viewportId, rect }) => ({
      viewportId,
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    })),
  )
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
  installApplicationMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
