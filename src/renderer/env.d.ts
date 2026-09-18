import type { ViewportableApi } from '../preload'

declare global {
  interface Window {
    viewportable: ViewportableApi
  }
}

export {}
