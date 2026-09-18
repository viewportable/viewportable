import type { ViewportableApi } from '../preload'

declare module '*.css'

declare global {
  interface Window {
    viewportable: ViewportableApi
  }
}

export {}
