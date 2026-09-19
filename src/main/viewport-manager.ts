import {
  BrowserWindow,
  WebContentsView,
  type MouseWheelInputEvent,
  type Rectangle,
} from 'electron'
import { planBoardReconcile, resolveBoardDevices } from '../core/board'
import { resolveBoardScrollDelta, resolveSynchronizedScrollDelta } from '../core/board-scroll'
import { resolveViewportLayouts } from '../core/layout'
import { normalizeScrollProgress } from '../core/sync'
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
  scrollSyncBridgeReady: boolean
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
const SCROLL_SYNC_BINDING = '__viewportableReportScroll'
const SCROLL_SYNC_INSTALL_SCRIPT = `
(() => {
  if (window.top !== window || window.__viewportableSyncScrollInstalled) return

  window.__viewportableSyncScrollInstalled = true
  let frame = 0
  let pendingTarget = null
  let suppressUntil = 0

  const isDocumentTarget = (target) =>
    target === null ||
    target === window ||
    target === document ||
    target === document.documentElement ||
    target === document.body

  const isScrollableElement = (element) => {
    if (!(element instanceof Element)) return false

    const style = getComputedStyle(element)
    const overflowY = style.overflowY
    const allowsScroll =
      overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'

    return allowsScroll && element.clientHeight > 0 && element.scrollHeight - element.clientHeight > 1
  }

  const visibleArea = (element) => {
    const rect = element.getBoundingClientRect()
    const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0))
    const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0))
    return width * height
  }

  const primaryScrollableElement = () => {
    let best = null
    let bestArea = 0

    for (const element of document.querySelectorAll('*')) {
      if (!isScrollableElement(element)) continue

      const area = visibleArea(element)
      if (area > bestArea) {
        best = element
        bestArea = area
      }
    }

    return best
  }

  const selectorFor = (element) => {
    if (!(element instanceof Element)) return null

    if (element.id) return '#' + CSS.escape(element.id)

    const testId = element.getAttribute('data-testid')
    if (testId) {
      return '[data-testid="' + CSS.escape(testId) + '"]'
    }

    const parts = []
    let current = element

    while (current && current !== document.body && parts.length < 8) {
      const parent = current.parentElement
      if (!parent) break

      let part = current.localName
      const siblings = Array.from(parent.children).filter(
        (candidate) => candidate.localName === current.localName,
      )

      if (siblings.length > 1) {
        part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')'
      }

      parts.unshift(part)
      current = parent
    }

    return parts.length > 0 ? 'body > ' + parts.join(' > ') : null
  }

  const documentMetrics = () => {
    const root = document.scrollingElement || document.documentElement
    return {
      current: window.scrollY,
      max: Math.max(0, root.scrollHeight - window.innerHeight),
      selector: null,
      kind: 'document',
      element: null,
    }
  }

  const elementMetrics = (element) => {
    if (!(element instanceof Element) || !isScrollableElement(element)) return null

    return {
      current: element.scrollTop,
      max: Math.max(0, element.scrollHeight - element.clientHeight),
      selector: selectorFor(element),
      kind: 'element',
      element,
    }
  }

  const metricsFor = (target) => {
    if (isDocumentTarget(target)) return documentMetrics()
    return elementMetrics(target)
  }

  const fallbackMetrics = (kind) => {
    if (kind === 'element') {
      const primary = primaryScrollableElement()
      const metrics = elementMetrics(primary)
      if (metrics) return metrics
    }

    const documentTarget = documentMetrics()
    if (documentTarget.max > 0) return documentTarget

    const primary = primaryScrollableElement()
    return elementMetrics(primary)
  }

  const report = () => {
    frame = 0
    if (performance.now() < suppressUntil) return

    const metrics = metricsFor(pendingTarget)
    pendingTarget = null
    if (!metrics || metrics.max <= 0) return

    const reportScroll = window.${SCROLL_SYNC_BINDING}
    if (typeof reportScroll !== 'function') return

    const progress = Math.min(1, Math.max(0, metrics.current / metrics.max))
    reportScroll(
      JSON.stringify({
        progress,
        target: metrics.selector,
        kind: metrics.kind,
      }),
    )
  }

  const onScroll = (event) => {
    pendingTarget = event.target
    if (frame === 0) frame = requestAnimationFrame(report)
  }

  document.addEventListener('scroll', onScroll, { capture: true, passive: true })
  window.addEventListener('scroll', onScroll, { passive: true })

  window.__viewportableScrollByDelta = (deltaY) => {
    const delta = Number(deltaY)
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.01) return null

    let metrics = documentMetrics()
    if (metrics.max <= 0) metrics = fallbackMetrics('element')
    if (!metrics || metrics.max <= 0) return null

    suppressUntil = performance.now() + 160

    if (metrics.kind === 'element' && metrics.element instanceof Element) {
      metrics.element.scrollBy({
        top: delta,
        left: 0,
        behavior: 'auto',
      })

      const updated = elementMetrics(metrics.element)
      if (!updated || updated.max <= 0) return null

      return {
        progress: Math.min(1, Math.max(0, updated.current / updated.max)),
        target: updated.selector,
        kind: updated.kind,
      }
    }

    window.scrollBy({
      top: delta,
      left: 0,
      behavior: 'auto',
    })

    const updated = documentMetrics()
    if (updated.max <= 0) return null

    return {
      progress: Math.min(1, Math.max(0, updated.current / updated.max)),
      target: null,
      kind: 'document',
    }
  }

  window.__viewportableApplySyncedScroll = (payload) => {
    const progress = Math.min(1, Math.max(0, Number(payload?.progress) || 0))
    const selector = typeof payload?.target === 'string' ? payload.target : null
    const kind = payload?.kind === 'element' ? 'element' : 'document'

    let metrics = null

    if (selector) {
      try {
        metrics = elementMetrics(document.querySelector(selector))
      } catch {
        metrics = null
      }
    }

    if (!metrics || metrics.max <= 0) {
      metrics = fallbackMetrics(kind)
    }

    if (!metrics || metrics.max <= 0) return

    suppressUntil = performance.now() + 160

    if (metrics.kind === 'element' && metrics.element instanceof Element) {
      metrics.element.scrollTo({
        top: metrics.max * progress,
        left: metrics.element.scrollLeft,
        behavior: 'auto',
      })
      return
    }

    window.scrollTo({
      top: metrics.max * progress,
      left: window.scrollX,
      behavior: 'auto',
    })
  }
})()
`

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
  syncScrollEnabled: boolean
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
  #syncScrollEnabled = true
  #currentUrl = 'https://example.com'
  #layoutTimer: ReturnType<typeof setTimeout> | null = null
  #scrollSyncTimer: ReturnType<typeof setTimeout> | null = null
  #hostScrollTimer: ReturnType<typeof setTimeout> | null = null
  #pendingHostScrollDelta = 0
  #pendingHostScrollSourceId: string | null = null
  #hostScrollChain: Promise<void> = Promise.resolve()
  #pendingScrollSync: {
    sourceId: string
    progress: number
    target: string | null
    kind: 'document' | 'element'
  } | null = null
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

  setSyncScrollEnabled(enabled: boolean): void {
    if (this.#syncScrollEnabled === enabled) return

    this.#syncScrollEnabled = enabled
    if (!enabled) {
      this.#cancelScrollSync()
      this.#cancelHostScroll()
    }
    this.#emitPrimaryState()
  }

  handleSynchronizedScroll(deltaY: number, preferredSourceId?: string): boolean {
    if (!this.#syncScrollEnabled || !Number.isFinite(deltaY) || Math.abs(deltaY) < 0.01) {
      return false
    }

    this.#pendingHostScrollDelta += deltaY
    if (preferredSourceId) this.#pendingHostScrollSourceId = preferredSourceId

    if (this.#hostScrollTimer === null) {
      this.#hostScrollTimer = setTimeout(() => {
        this.#hostScrollTimer = null

        const delta = this.#pendingHostScrollDelta
        const sourceId = this.#pendingHostScrollSourceId
        this.#pendingHostScrollDelta = 0
        this.#pendingHostScrollSourceId = null

        this.#hostScrollChain = this.#hostScrollChain
          .then(() => this.#performSynchronizedScroll(delta, sourceId))
          .catch((error: unknown) => {
            console.warn('[viewportable] Host-driven scroll sync failed', error)
          })
      }, LAYOUT_FRAME_MS)
    }

    return true
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

  async inspectScrollProgress(selector?: string): Promise<Record<string, number | null>> {
    const selectorLiteral = JSON.stringify(selector ?? null)
    const entries = await Promise.all(
      this.#managedViewports().map(async ({ id, view }) => {
        const progress = (await view.webContents.executeJavaScript(`
          (() => {
            const selector = ${selectorLiteral}
            const target = selector
              ? Array.from(document.querySelectorAll(selector)).find(
                  (element) =>
                    element.clientHeight > 0 &&
                    element.scrollHeight - element.clientHeight > 1,
                ) ?? null
              : null

            if (target instanceof Element) {
              const maxScrollY = Math.max(0, target.scrollHeight - target.clientHeight)
              return maxScrollY > 0 ? target.scrollTop / maxScrollY : null
            }

            const root = document.scrollingElement || document.documentElement
            const maxScrollY = Math.max(0, root.scrollHeight - window.innerHeight)
            return maxScrollY > 0 ? window.scrollY / maxScrollY : null
          })()
        `)) as number | null

        return [id, progress] as const
      }),
    )

    return Object.fromEntries(entries)
  }

  async scrollViewportToProgress(
    viewportId: string,
    progress: number,
    selector?: string,
  ): Promise<void> {
    const managed = this.#viewports.get(viewportId)
    if (!managed) throw new Error(`Unknown viewport: ${viewportId}`)

    const normalized = normalizeScrollProgress(progress)
    const selectorLiteral = JSON.stringify(selector ?? null)

    await managed.view.webContents.executeJavaScript(`
      (() => {
        const selector = ${selectorLiteral}
        const target = selector
          ? Array.from(document.querySelectorAll(selector)).find(
              (element) =>
                element.clientHeight > 0 &&
                element.scrollHeight - element.clientHeight > 1,
            ) ?? null
          : null

        if (target instanceof Element) {
          const maxScrollY = Math.max(0, target.scrollHeight - target.clientHeight)
          target.scrollTo({ top: maxScrollY * ${normalized}, left: target.scrollLeft, behavior: 'auto' })
          return
        }

        const root = document.scrollingElement || document.documentElement
        const maxScrollY = Math.max(0, root.scrollHeight - window.innerHeight)
        window.scrollTo({ top: maxScrollY * ${normalized}, left: window.scrollX, behavior: 'auto' })
      })()
    `)
  }

  async scrollViewportByDelta(viewportId: string, deltaY: number): Promise<void> {
    const managed = this.#viewports.get(viewportId)
    if (!managed || !managed.pageReady) return

    await this.#scrollManagedByDelta(managed, deltaY)
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
    this.#cancelScrollSync()
    this.#cancelHostScroll()

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
      scrollSyncBridgeReady: false,
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

    contents.debugger.on('message', (_event, method, params) => {
      if (method !== 'Runtime.bindingCalled') return

      const binding = params as { name?: unknown; payload?: unknown }
      if (binding.name !== SCROLL_SYNC_BINDING || typeof binding.payload !== 'string') return

      try {
        const payload = JSON.parse(binding.payload) as {
          progress?: unknown
          target?: unknown
          kind?: unknown
        }
        if (typeof payload.progress !== 'number') return

        this.#queueScrollSync(
          managed.id,
          payload.progress,
          typeof payload.target === 'string' ? payload.target : null,
          payload.kind === 'element' ? 'element' : 'document',
        )
      } catch {
        // Ignore malformed page-to-host scroll payloads.
      }
    })

    contents.on('before-mouse-event', (event, mouse) => {
      if (mouse.type !== 'mouseWheel') return

      const wheel = mouse as MouseWheelInputEvent
      const gesture = {
        deltaX: wheel.deltaX ?? 0,
        deltaY: wheel.deltaY ?? 0,
        shift: wheel.modifiers?.includes('shift') ?? false,
      }
      const routedDelta = resolveBoardScrollDelta(gesture)

      if (routedDelta !== null) {
        event.preventDefault()

        if (!this.#window.isDestroyed()) {
          this.#window.webContents.send(IPC.boardScroll, { deltaX: routedDelta })
        }
        return
      }

      const synchronizedDelta = resolveSynchronizedScrollDelta(gesture)
      if (
        synchronizedDelta !== null &&
        this.handleSynchronizedScroll(synchronizedDelta, managed.id)
      ) {
        event.preventDefault()
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

    await this.#installScrollSyncBridge(managed)
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

  async #installScrollSyncBridge(managed: ManagedViewport): Promise<void> {
    const debuggerApi = managed.view.webContents.debugger
    if (!debuggerApi.isAttached()) return

    if (!managed.scrollSyncBridgeReady) {
      await debuggerApi.sendCommand('Page.enable')
      await debuggerApi.sendCommand('Runtime.addBinding', { name: SCROLL_SYNC_BINDING })
      await debuggerApi.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
        source: SCROLL_SYNC_INSTALL_SCRIPT,
      })
      managed.scrollSyncBridgeReady = true
    }

    await debuggerApi.sendCommand('Runtime.evaluate', {
      expression: SCROLL_SYNC_INSTALL_SCRIPT,
    })
  }

  #cancelHostScroll(): void {
    if (this.#hostScrollTimer !== null) {
      clearTimeout(this.#hostScrollTimer)
      this.#hostScrollTimer = null
    }

    this.#pendingHostScrollDelta = 0
    this.#pendingHostScrollSourceId = null
  }

  async #performSynchronizedScroll(deltaY: number, preferredSourceId: string | null): Promise<void> {
    const ordered = this.#managedViewports()
    const candidates = preferredSourceId
      ? [
          ...ordered.filter(({ id }) => id === preferredSourceId),
          ...ordered.filter(({ id }) => id !== preferredSourceId),
        ]
      : ordered

    for (const managed of candidates) {
      if (!managed.pageReady || !managed.scrollSyncBridgeReady) continue

      const payload = await this.#scrollManagedByDelta(managed, deltaY)
      if (!payload) continue

      this.#applyScrollSync(managed.id, payload.progress, payload.target, payload.kind)
      return
    }
  }

  async #scrollManagedByDelta(
    managed: ManagedViewport,
    deltaY: number,
  ): Promise<{
    progress: number
    target: string | null
    kind: 'document' | 'element'
  } | null> {
    if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 0.01) return null

    const result = (await managed.view.webContents.executeJavaScript(
      `window.__viewportableScrollByDelta?.(${deltaY}) ?? null`,
    )) as {
      progress?: unknown
      target?: unknown
      kind?: unknown
    } | null

    if (!result || typeof result.progress !== 'number') return null

    return {
      progress: normalizeScrollProgress(result.progress),
      target: typeof result.target === 'string' ? result.target : null,
      kind: result.kind === 'element' ? 'element' : 'document',
    }
  }

  #queueScrollSync(
    sourceId: string,
    progress: number,
    target: string | null,
    kind: 'document' | 'element',
  ): void {
    if (!this.#syncScrollEnabled) return

    this.#pendingScrollSync = {
      sourceId,
      progress: normalizeScrollProgress(progress),
      target,
      kind,
    }

    if (this.#scrollSyncTimer !== null) return

    this.#scrollSyncTimer = setTimeout(() => {
      this.#scrollSyncTimer = null
      const pending = this.#pendingScrollSync
      this.#pendingScrollSync = null
      if (!pending || !this.#syncScrollEnabled) return

      this.#applyScrollSync(pending.sourceId, pending.progress, pending.target, pending.kind)
    }, LAYOUT_FRAME_MS)
  }

  #cancelScrollSync(): void {
    if (this.#scrollSyncTimer !== null) {
      clearTimeout(this.#scrollSyncTimer)
      this.#scrollSyncTimer = null
    }

    this.#pendingScrollSync = null
  }

  #applyScrollSync(
    sourceId: string,
    progress: number,
    target: string | null,
    kind: 'document' | 'element',
  ): void {
    const payload = JSON.stringify({ progress, target, kind })
    const expression = `window.__viewportableApplySyncedScroll?.(${payload})`

    for (const managed of this.#managedViewports()) {
      if (managed.id === sourceId || !managed.pageReady) continue

      const debuggerApi = managed.view.webContents.debugger
      if (!debuggerApi.isAttached()) continue

      void debuggerApi
        .sendCommand('Runtime.evaluate', { expression })
        .catch((error: unknown) => {
          console.warn(`[viewportable] Scroll sync failed for ${managed.device.name}`, error)
        })
    }
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
      syncScrollEnabled: this.#syncScrollEnabled,
      viewportScales: Object.fromEntries(
        this.#managedViewports().map(({ id, resolvedScale }) => [id, resolvedScale]),
      ),
      activeDeviceIds: [...this.#viewportOrder],
    })
  }
}
