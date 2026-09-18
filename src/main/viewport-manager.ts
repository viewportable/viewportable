import { BrowserWindow, WebContentsView, type Rectangle } from 'electron'
import { MOBILE_CHROMIUM_PROFILE, type BrowserProfile, type DeviceSpec } from '../shared/device'
import {
  resolveFitScale,
  resolveProportionalScale,
  scaledSize,
  type ActiveScaleMode,
} from '../shared/scale'
import { normalizeUrl } from '../shared/url'

export type ManagedViewport = {
  id: string
  device: DeviceSpec
  browser: BrowserProfile
  view: WebContentsView
  lastArea: Rectangle | null
  resolvedScale: number
  pageReady: boolean
  emulationReady: boolean
}

export type ViewportRuntimeProfile = {
  id: string
  url: string
  innerWidth: number
  innerHeight: number
  devicePixelRatio: number
  maxTouchPoints: number
  pointerCoarse: boolean
  hoverNone: boolean
  userAgent: string
  resolvedScale: number
}

function traceStartup(message: string): void {
  if (process.env.VIEWPORTABLE_SELF_TEST === '1') {
    console.error(`[viewportable:startup] ${message}`)
  }
}

type StateListener = (state: {
  url: string
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
  error: string | null
  scaleMode: ActiveScaleMode
  viewportScales: Record<string, number>
}) => void

export class ViewportManager {
  readonly #window: BrowserWindow
  readonly #viewports = new Map<string, ManagedViewport>()
  readonly #primaryId: string
  readonly #onState: StateListener
  #lastError: string | null = null
  #scaleMode: ActiveScaleMode = 'fit'

  constructor(
    window: BrowserWindow,
    devices: DeviceSpec[],
    onState: StateListener,
    browser: BrowserProfile = MOBILE_CHROMIUM_PROFILE,
  ) {
    if (devices.length === 0) throw new Error('ViewportManager requires at least one device')

    this.#window = window
    this.#primaryId = devices[0]!.id
    this.#onState = onState

    traceStartup('viewport-manager:constructor')
    for (const device of devices) {
      traceStartup(`${device.id}:new-view:start`)
      const view = new WebContentsView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      })
      traceStartup(`${device.id}:new-view:done`)

      const managed: ManagedViewport = {
        id: device.id,
        device,
        browser,
        view,
        lastArea: null,
        resolvedScale: 1,
        pageReady: false,
        emulationReady: false,
      }

      this.#viewports.set(device.id, managed)

      view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      view.setVisible(false)

      traceStartup(`${device.id}:add-child:start`)
      window.contentView.addChildView(view)
      traceStartup(`${device.id}:add-child:done`)
      this.#configureViewport(managed)
    }
  }

  async loadInitialUrl(url: string): Promise<void> {
    await this.navigate(url)
  }

  async navigate(value: string): Promise<void> {
    const url = normalizeUrl(value)
    traceStartup(`navigate:start:${url}`)
    this.#lastError = null

    for (const managed of this.#viewports.values()) managed.pageReady = false

    await Promise.allSettled([...this.#viewports.values()].map(({ view }) => view.webContents.loadURL(url)))
    traceStartup(`navigate:done:${url}`)
    this.#emitPrimaryState()
  }

  back(): void {
    for (const { view } of this.#viewports.values()) {
      if (view.webContents.navigationHistory.canGoBack()) {
        view.webContents.navigationHistory.goBack()
      }
    }
  }

  forward(): void {
    for (const { view } of this.#viewports.values()) {
      if (view.webContents.navigationHistory.canGoForward()) {
        view.webContents.navigationHistory.goForward()
      }
    }
  }

  reload(): void {
    for (const managed of this.#viewports.values()) {
      managed.pageReady = false
      managed.view.webContents.reload()
    }
  }

  setScaleMode(mode: ActiveScaleMode): void {
    if (this.#scaleMode === mode) return

    this.#scaleMode = mode
    this.#layoutAllViewports()
    this.#emitPrimaryState()
  }

  emitState(): void {
    this.#emitPrimaryState()
  }

  setAvailableBounds(viewportId: string, area: Rectangle): void {
    const managed = this.#viewports.get(viewportId)
    if (!managed) return

    managed.lastArea = area
    this.#layoutAllViewports()
    this.#emitPrimaryState()
  }

  inspectLayout(): Array<{
    id: string
    visible: boolean
    area: Rectangle | null
    bounds: Rectangle
  }> {
    return [...this.#viewports.values()].map(({ id, view, lastArea }) => ({
      id,
      visible: view.getVisible(),
      area: lastArea,
      bounds: view.getBounds(),
    }))
  }

  async inspectProfiles(): Promise<ViewportRuntimeProfile[]> {
    return Promise.all(
      [...this.#viewports.values()].map(async ({ id, view, resolvedScale }) => {
        const runtime = (await view.webContents.executeJavaScript(`({
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
          maxTouchPoints: navigator.maxTouchPoints,
          pointerCoarse: matchMedia('(pointer: coarse)').matches,
          hoverNone: matchMedia('(hover: none)').matches,
          userAgent: navigator.userAgent
        })`)) as Omit<ViewportRuntimeProfile, 'id' | 'url' | 'resolvedScale'>

        return {
          id,
          url: view.webContents.getURL(),
          resolvedScale,
          ...runtime,
        }
      }),
    )
  }

  destroy(): void {
    for (const { view } of this.#viewports.values()) {
      try {
        if (!this.#window.isDestroyed()) {
          this.#window.contentView.removeChildView(view)
        }
      } catch {
        // Electron may already have destroyed the native View during app shutdown.
      }

      try {
        const contents = view.webContents
        if (!contents.isDestroyed()) contents.close()
      } catch {
        // Cleanup is intentionally idempotent during Ctrl-C / app termination.
      }
    }

    this.#viewports.clear()
  }

  #layoutAllViewports(): void {
    const candidates = [...this.#viewports.values()]
      .filter(({ lastArea }) => lastArea && lastArea.width > 0 && lastArea.height > 0)
      .map(({ device, lastArea }) => ({
        device,
        area: { width: lastArea!.width, height: lastArea!.height },
      }))

    const proportionalScale =
      this.#scaleMode === 'proportional' ? resolveProportionalScale(candidates) : 0

    for (const managed of this.#viewports.values()) {
      const area = managed.lastArea

      if (!area || area.width <= 0 || area.height <= 0) {
        managed.view.setVisible(false)
        continue
      }

      const scale =
        this.#scaleMode === 'proportional'
          ? proportionalScale
          : resolveFitScale(managed.device, area)

      if (scale <= 0) {
        managed.view.setVisible(false)
        continue
      }

      const size = scaledSize(managed.device, scale)
      const x = Math.round(area.x + Math.max(0, (area.width - size.width) / 2))
      const y = Math.round(area.y + Math.max(0, (area.height - size.height) / 2))

      managed.resolvedScale = scale
      managed.view.setBounds({ x, y, width: size.width, height: size.height })
      managed.view.setVisible(true)

      if (managed.emulationReady) {
        void this.#applyDeviceMetrics(managed).catch((error: unknown) => {
          console.warn(`[viewportable] Metrics update failed for ${managed.device.name}`, error)
        })
      }
    }
  }

  #configureViewport(managed: ManagedViewport): void {
    const { view, browser, device } = managed
    const contents = view.webContents

    contents.setUserAgent(browser.userAgent)
    traceStartup(`${device.id}:user-agent:done`)

    contents.on('before-input-event', (event, input) => {
      const modifier = process.platform === 'darwin' ? input.meta : input.control
      if (modifier && ['+', '=', '-', '0'].includes(input.key)) event.preventDefault()
    })

    contents.setWindowOpenHandler(({ url }) => {
      void this.navigate(url)
      return { action: 'deny' }
    })

    const emit = () => {
      if (managed.id === this.#primaryId) this.#emitPrimaryState()
    }

    contents.on('did-start-loading', () => {
      managed.pageReady = false
      emit()
    })
    contents.on('did-stop-loading', emit)
    contents.on('did-navigate', emit)
    contents.on('did-navigate-in-page', emit)
    contents.on('did-finish-load', () => {
      managed.pageReady = true
      traceStartup(`${device.id}:did-finish-load`)

      void this.#applyFullEmulation(managed).catch((error: unknown) => {
        managed.emulationReady = false
        console.error(`[viewportable] Emulation failed for ${device.name}`, error)
      })
    })
    contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return
      if (managed.id === this.#primaryId) {
        this.#lastError = `${errorDescription} (${errorCode}) - ${validatedUrl}`
        this.#emitPrimaryState()
      }
    })

    traceStartup(`${device.id}:configure:done`)
  }

  async #applyFullEmulation(managed: ManagedViewport): Promise<void> {
    const debuggerApi = managed.view.webContents.debugger

    traceStartup(`${managed.id}:cdp:attach:start`)
    if (!debuggerApi.isAttached()) debuggerApi.attach('1.3')
    traceStartup(`${managed.id}:cdp:attach:done`)

    await this.#applyDeviceMetrics(managed)

    if (managed.browser.touch) {
      await debuggerApi.sendCommand('Emulation.setTouchEmulationEnabled', {
        enabled: true,
        maxTouchPoints: managed.browser.maxTouchPoints,
      })
      traceStartup(`${managed.id}:cdp:touch:done`)
    }

    await debuggerApi.sendCommand('Emulation.setEmulatedMedia', {
      features: [
        { name: 'pointer', value: 'coarse' },
        { name: 'any-pointer', value: 'coarse' },
        { name: 'hover', value: 'none' },
        { name: 'any-hover', value: 'none' },
      ],
    })
    traceStartup(`${managed.id}:cdp:media:done`)

    managed.emulationReady = true
  }

  async #applyDeviceMetrics(managed: ManagedViewport): Promise<void> {
    const debuggerApi = managed.view.webContents.debugger
    if (!debuggerApi.isAttached()) return

    traceStartup(`${managed.id}:cdp:metrics:start:${managed.resolvedScale}`)
    await debuggerApi.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: managed.device.css.width,
      height: managed.device.css.height,
      deviceScaleFactor: managed.device.dpr,
      mobile: true,
      scale: managed.resolvedScale,
      screenWidth: managed.device.css.width,
      screenHeight: managed.device.css.height,
      positionX: 0,
      positionY: 0,
    })
    traceStartup(`${managed.id}:cdp:metrics:done:${managed.resolvedScale}`)
  }

  #emitPrimaryState(): void {
    const primary = this.#viewports.get(this.#primaryId)
    if (!primary || primary.view.webContents.isDestroyed()) return

    const contents = primary.view.webContents
    this.#onState({
      url: contents.getURL(),
      canGoBack: contents.navigationHistory.canGoBack(),
      canGoForward: contents.navigationHistory.canGoForward(),
      isLoading: contents.isLoading(),
      error: this.#lastError,
      scaleMode: this.#scaleMode,
      viewportScales: Object.fromEntries(
        [...this.#viewports.values()].map(({ id, resolvedScale }) => [id, resolvedScale]),
      ),
    })
  }
}
