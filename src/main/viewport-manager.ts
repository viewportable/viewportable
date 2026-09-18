import { BrowserWindow, WebContentsView, type Rectangle } from 'electron'
import { MOBILE_CHROMIUM_PROFILE, type BrowserProfile, type DeviceSpec } from '../shared/device'
import { resolveFitScale, scaledSize } from '../shared/scale'
import { normalizeUrl } from '../shared/url'

export type ManagedViewport = {
  id: string
  device: DeviceSpec
  browser: BrowserProfile
  view: WebContentsView
  lastArea: Rectangle | null
  resolvedScale: number
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
}) => void

export class ViewportManager {
  readonly #window: BrowserWindow
  readonly #viewports = new Map<string, ManagedViewport>()
  readonly #primaryId: string
  readonly #onState: StateListener
  #lastError: string | null = null

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
      }

      this.#viewports.set(device.id, managed)
      traceStartup(`${device.id}:add-child:start`)
      window.contentView.addChildView(view)
      traceStartup(`${device.id}:add-child:done`)
      traceStartup(`${device.id}:configure:start`)
      this.#configureViewport(managed)
      traceStartup(`${device.id}:configure:done`)
    }
  }

  async loadInitialUrl(url: string): Promise<void> {
    await this.navigate(url)
  }

  async navigate(value: string): Promise<void> {
    const url = normalizeUrl(value)
    traceStartup(`navigate:start:${url}`)
    this.#lastError = null
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
    for (const { view } of this.#viewports.values()) view.webContents.reload()
  }

  emitState(): void {
    this.#emitPrimaryState()
  }

  setAvailableBounds(viewportId: string, area: Rectangle): void {
    const managed = this.#viewports.get(viewportId)
    if (!managed) return

    managed.lastArea = area

    if (area.width <= 0 || area.height <= 0) {
      managed.view.setVisible(false)
      return
    }

    const scale = resolveFitScale(managed.device, area)
    const size = scaledSize(managed.device, scale)
    const x = Math.round(area.x + Math.max(0, (area.width - size.width) / 2))
    const y = Math.round(area.y + Math.max(0, (area.height - size.height) / 2))

    managed.resolvedScale = scale
    managed.view.webContents.enableDeviceEmulation({
      screenPosition: 'mobile',
      screenSize: managed.device.css,
      viewSize: managed.device.css,
      viewPosition: { x: 0, y: 0 },
      deviceScaleFactor: managed.device.dpr,
      scale,
    })
    managed.view.setBounds({ x, y, width: size.width, height: size.height })
    managed.view.setVisible(true)
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
      this.#window.contentView.removeChildView(view)
      view.webContents.close()
    }
    this.#viewports.clear()
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
    traceStartup(`${device.id}:device-emulation:start`)
    contents.enableDeviceEmulation({
      screenPosition: 'mobile',
      screenSize: device.css,
      viewSize: device.css,
      viewPosition: { x: 0, y: 0 },
      deviceScaleFactor: device.dpr,
      scale: 1,
    })
    traceStartup(`${device.id}:device-emulation:done`)

    if (process.env.VIEWPORTABLE_DISABLE_CDP_EMULATION !== '1') {
      traceStartup(`${device.id}:cdp:start`)
      this.#enableTouchEmulation(managed).catch((error: unknown) => {
        console.warn(`[viewportable] Touch emulation unavailable for ${device.name}`, error)
      })
    }

    traceStartup(`${device.id}:handlers:start`)
    contents.setWindowOpenHandler(({ url }) => {
      void this.navigate(url)
      return { action: 'deny' }
    })

    const emit = () => {
      if (managed.id === this.#primaryId) this.#emitPrimaryState()
    }

    contents.on('did-start-loading', emit)
    contents.on('did-stop-loading', emit)
    contents.on('did-navigate', emit)
    contents.on('did-navigate-in-page', emit)
    contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return
      if (managed.id === this.#primaryId) {
        this.#lastError = `${errorDescription} (${errorCode}) - ${validatedUrl}`
        this.#emitPrimaryState()
      }
    })
    traceStartup(`${device.id}:handlers:done`)
  }

  async #enableTouchEmulation(managed: ManagedViewport): Promise<void> {
    if (!managed.browser.touch) return

    const debuggerApi = managed.view.webContents.debugger
    if (!debuggerApi.isAttached()) debuggerApi.attach('1.3')
    traceStartup(`${managed.id}:cdp:attached`)

    await debuggerApi.sendCommand('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: managed.browser.maxTouchPoints,
    })
    traceStartup(`${managed.id}:cdp:touch:done`)
    await debuggerApi.sendCommand('Emulation.setEmulatedMedia', {
      features: [
        { name: 'pointer', value: 'coarse' },
        { name: 'any-pointer', value: 'coarse' },
        { name: 'hover', value: 'none' },
        { name: 'any-hover', value: 'none' },
      ],
    })
    traceStartup(`${managed.id}:cdp:media:done`)
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
    })
  }
}
