import {
  BrowserWindow,
  WebContentsView,
  type MouseWheelInputEvent,
  type Rectangle,
} from 'electron'
import { planBoardReconcile, resolveBoardDevices } from '../core/board'
import { resolveViewportLayouts } from '../core/layout'
import {
  MOBILE_CHROMIUM_PROFILE,
  type BrowserProfile,
  type DeviceSpec,
} from '../shared/device'
import { IPC } from '../shared/ipc'
import type { ActiveScaleMode } from '../shared/scale'
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

const LAYOUT_FRAME_MS = 16
const SCALE_EPSILON = 0.000001

function sameRectangle(left: Rectangle | null, right: Rectangle): boolean {
  return (
    left !== null &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
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
  activeDeviceIds: string[]
}) => void

export class ViewportManager {
  readonly #window: BrowserWindow
  readonly #viewports = new Map<string, ManagedViewport>()
  readonly #browser: BrowserProfile
  readonly #onState: StateListener
  #viewportOrder: string[] = []
  #lastError: string | null = null
  #scaleMode: ActiveScaleMode = 'fit'
  #currentUrl = 'https://example.com'
  #layoutTimer: ReturnType<typeof setTimeout> | null = null
  #lastBoardLayoutRevision = -1

  constructor(
    window: BrowserWindow,
    devices: DeviceSpec[],
    onState: StateListener,
    browser: BrowserProfile = MOBILE_CHROMIUM_PROFILE,
  ) {
    if (devices.length === 0) throw new Error('ViewportManager requires at least one device')

    this.#window = window
    this.#browser = browser
    this.#onState = onState

    traceStartup('viewport-manager:constructor')

    for (const device of devices) {
      this.#addViewport(device)
    }

    this.#viewportOrder = devices.map((device) => device.id)
  }

  async loadInitialUrl(url: string): Promise<void> {
    await this.navigate(url)
  }

  async navigate(value: string): Promise<void> {
    const url = normalizeUrl(value)
    this.#currentUrl = url
    traceStartup(`navigate:start:${url}`)
    this.#lastError = null

    const viewports = this.#managedViewports()
    for (const managed of viewports) managed.pageReady = false

    await Promise.allSettled(viewports.map(({ view }) => view.webContents.loadURL(url)))
    traceStartup(`navigate:done:${url}`)
    this.#emitPrimaryState()
  }

  back(): void {
    for (const { view } of this.#managedViewports()) {
      if (view.webContents.navigationHistory.canGoBack()) {
        view.webContents.navigationHistory.goBack()
      }
    }
  }

  forward(): void {
    for (const { view } of this.#managedViewports()) {
      if (view.webContents.navigationHistory.canGoForward()) {
        view.webContents.navigationHistory.goForward()
      }
    }
  }

  reload(): void {
    for (const managed of this.#managedViewports()) {
      managed.pageReady = false
      managed.view.webContents.reload()
    }
  }

  async setDevices(deviceIds: readonly string[]): Promise<void> {
    const plan = planBoardReconcile(this.#viewportOrder, deviceIds)
    const devices = resolveBoardDevices(plan.deviceIds)

    for (const id of plan.removeIds) this.#removeViewport(id)

    const loads: Promise<void>[] = []
    const addIds = new Set(plan.addIds)

    for (const device of devices) {
      if (!addIds.has(device.id)) continue

      const managed = this.#addViewport(device)
      managed.pageReady = false
      loads.push(managed.view.webContents.loadURL(this.#currentUrl))
    }

    this.#viewportOrder = plan.deviceIds

    if (plan.addIds.length > 0 || plan.removeIds.length > 0) {
      this.#invalidateViewportAreas()
    } else {
      this.#scheduleLayout()
    }

    this.#emitPrimaryState()

    await Promise.allSettled(loads)
  }

  setScaleMode(mode: ActiveScaleMode): void {
    if (this.#scaleMode === mode) return

    this.#scaleMode = mode
    this.#emitPrimaryState()
    this.#scheduleLayout()
  }

  emitState(): void {
    this.#emitPrimaryState()
  }

  setBoardLayout(
    revision: number,
    viewports: readonly { viewportId: string; rect: Rectangle }[],
  ): void {
    if (revision <= this.#lastBoardLayoutRevision) return
    this.#lastBoardLayoutRevision = revision

    const areas = new Map(viewports.map(({ viewportId, rect }) => [viewportId, rect]))

    for (const managed of this.#managedViewports()) {
      managed.lastArea = areas.get(managed.id) ?? null
    }

    this.#cancelScheduledLayout()
    this.#layoutAllViewports()
    this.#emitPrimaryState()
  }

  setAvailableBounds(viewportId: string, area: Rectangle): void {
    const managed = this.#viewports.get(viewportId)
    if (!managed) return

    if (sameRectangle(managed.lastArea, area)) return

    managed.lastArea = area
    this.#scheduleLayout()
  }

  inspectLayout(): Array<{
    id: string
    visible: boolean
    area: Rectangle | null
    bounds: Rectangle
  }> {
    return this.#managedViewports().map(({ id, view, lastArea }) => ({
      id,
      visible: view.getVisible(),
      area: lastArea,
      bounds: view.getBounds(),
    }))
  }

  async inspectProfiles(): Promise<ViewportRuntimeProfile[]> {
    return Promise.all(
      this.#managedViewports().map(async ({ id, view, resolvedScale }) => {
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
    this.#cancelScheduledLayout()

    while (this.#viewportOrder.length > 0) {
      const id = this.#viewportOrder[0]
      if (!id) break
      this.#removeViewport(id)
    }

    this.#viewports.clear()
    this.#viewportOrder = []
  }

  #managedViewports(): ManagedViewport[] {
    return this.#viewportOrder
      .map((id) => this.#viewports.get(id))
      .filter((viewport): viewport is ManagedViewport => viewport !== undefined)
  }

  #primaryViewport(): ManagedViewport | undefined {
    const id = this.#viewportOrder[0]
    return id ? this.#viewports.get(id) : undefined
  }

  #addViewport(device: DeviceSpec): ManagedViewport {
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
      browser: this.#browser,
      view,
      lastArea: null,
      resolvedScale: 1,
      pageReady: false,
      emulationReady: false,
    }

    this.#viewports.set(device.id, managed)
    if (!this.#viewportOrder.includes(device.id)) this.#viewportOrder.push(device.id)

    view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    view.setVisible(false)

    traceStartup(`${device.id}:add-child:start`)
    this.#window.contentView.addChildView(view)
    traceStartup(`${device.id}:add-child:done`)

    this.#configureViewport(managed)
    return managed
  }

  #removeViewport(id: string): void {
    const managed = this.#viewports.get(id)
    if (!managed) return

    managed.view.setVisible(false)

    try {
      if (!this.#window.isDestroyed()) {
        this.#window.contentView.removeChildView(managed.view)
      }
    } catch {
      // Electron may already have destroyed the native View during app shutdown.
    }

    try {
      const contents = managed.view.webContents
      if (!contents.isDestroyed()) contents.close()
    } catch {
      // Cleanup is intentionally idempotent during app termination.
    }

    this.#viewports.delete(id)
    this.#viewportOrder = this.#viewportOrder.filter((viewportId) => viewportId !== id)
  }

  #invalidateViewportAreas(): void {
    this.#cancelScheduledLayout()

    const hiddenBounds = { x: 0, y: 0, width: 0, height: 0 }

    for (const managed of this.#managedViewports()) {
      managed.lastArea = null

      if (managed.view.getVisible()) managed.view.setVisible(false)
      if (!sameRectangle(managed.view.getBounds(), hiddenBounds)) {
        managed.view.setBounds(hiddenBounds)
      }
    }
  }

  #scheduleLayout(): void {
    if (this.#layoutTimer !== null) return

    this.#layoutTimer = setTimeout(() => {
      this.#layoutTimer = null
      if (this.#window.isDestroyed()) return

      this.#layoutAllViewports()
      this.#emitPrimaryState()
    }, LAYOUT_FRAME_MS)
  }

  #cancelScheduledLayout(): void {
    if (this.#layoutTimer === null) return

    clearTimeout(this.#layoutTimer)
    this.#layoutTimer = null
  }

  #layoutAllViewports(): void {
    const managedViewports = this.#managedViewports()
    const layouts = resolveViewportLayouts(
      managedViewports.map(({ id, device, lastArea }) => ({
        id,
        device,
        area: lastArea,
      })),
      this.#scaleMode,
    )

    for (const layout of layouts) {
      const managed = this.#viewports.get(layout.id)
      if (!managed) continue

      if (!layout.visible || !layout.bounds || layout.scale === null) {
        if (managed.view.getVisible()) managed.view.setVisible(false)
        continue
      }

      const scaleChanged = Math.abs(managed.resolvedScale - layout.scale) > SCALE_EPSILON
      const boundsChanged = !sameRectangle(managed.view.getBounds(), layout.bounds)

      managed.resolvedScale = layout.scale

      if (boundsChanged) managed.view.setBounds(layout.bounds)
      if (!managed.view.getVisible()) managed.view.setVisible(true)

      if (managed.emulationReady && scaleChanged) {
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

    contents.on('before-mouse-event', (event, mouse) => {
      if (mouse.type !== 'mouseWheel') return

      const wheel = mouse as MouseWheelInputEvent
      const deltaX = wheel.deltaX ?? 0
      const deltaY = wheel.deltaY ?? 0
      const shift = wheel.modifiers?.includes('shift') ?? false
      const horizontalGesture = shift || Math.abs(deltaX) > Math.abs(deltaY)
      if (!horizontalGesture) return

      const routedDelta = shift && Math.abs(deltaX) <= Math.abs(deltaY) ? deltaY : deltaX
      if (Math.abs(routedDelta) < 0.01) return

      event.preventDefault()

      if (!this.#window.isDestroyed()) {
        this.#window.webContents.send(IPC.boardScroll, { deltaX: routedDelta })
      }
    })

    contents.setWindowOpenHandler(({ url }) => {
      void this.navigate(url)
      return { action: 'deny' }
    })

    const emit = () => {
      if (managed.id === this.#viewportOrder[0]) this.#emitPrimaryState()
    }

    contents.on('did-start-loading', () => {
      managed.pageReady = false
      emit()
    })
    contents.on('did-stop-loading', emit)
    contents.on('did-navigate', () => {
      emit()
      if (managed.id === this.#viewportOrder[0] && contents.getURL()) {
        this.#currentUrl = contents.getURL()
      }
    })
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
      if (managed.id === this.#viewportOrder[0]) {
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
    const primary = this.#primaryViewport()
    if (!primary || primary.view.webContents.isDestroyed()) return

    const contents = primary.view.webContents
    const url = contents.getURL()
    if (url) this.#currentUrl = url

    this.#onState({
      url,
      canGoBack: contents.navigationHistory.canGoBack(),
      canGoForward: contents.navigationHistory.canGoForward(),
      isLoading: contents.isLoading(),
      error: this.#lastError,
      scaleMode: this.#scaleMode,
      viewportScales: Object.fromEntries(
        this.#managedViewports().map(({ id, resolvedScale }) => [id, resolvedScale]),
      ),
      activeDeviceIds: [...this.#viewportOrder],
    })
  }
}
