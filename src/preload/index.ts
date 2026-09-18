import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type { BrowserCommand, BrowserState, ViewportBounds } from '../shared/ipc'

export type ViewportableApi = {
  command(command: BrowserCommand): void
  setViewportBounds(bounds: ViewportBounds): void
  onBrowserState(listener: (state: BrowserState) => void): () => void
}

const api: ViewportableApi = {
  command(command) {
    ipcRenderer.send(IPC.command, command)
  },
  setViewportBounds(bounds) {
    ipcRenderer.send(IPC.bounds, bounds)
  },
  onBrowserState(listener) {
    const handler = (_event: Electron.IpcRendererEvent, payload: BrowserState) => {
      listener(payload)
    }

    ipcRenderer.on(IPC.state, handler)
    return () => ipcRenderer.removeListener(IPC.state, handler)
  },
}

contextBridge.exposeInMainWorld('viewportable', api)
