import { contextBridge, ipcRenderer } from 'electron'
import {
  BrowserCommandSchema,
  BrowserStateSchema,
  IPC,
  ViewportBoundsSchema,
  type BrowserCommand,
  type BrowserState,
  type ViewportBounds,
} from '../shared/ipc'

export type ViewportableApi = {
  command(command: BrowserCommand): void
  setViewportBounds(bounds: ViewportBounds): void
  onBrowserState(listener: (state: BrowserState) => void): () => void
}

const api: ViewportableApi = {
  command(command) {
    ipcRenderer.send(IPC.command, BrowserCommandSchema.parse(command))
  },
  setViewportBounds(bounds) {
    ipcRenderer.send(IPC.bounds, ViewportBoundsSchema.parse(bounds))
  },
  onBrowserState(listener) {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      listener(BrowserStateSchema.parse(payload))
    }

    ipcRenderer.on(IPC.state, handler)
    return () => ipcRenderer.removeListener(IPC.state, handler)
  },
}

contextBridge.exposeInMainWorld('viewportable', api)
