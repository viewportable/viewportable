import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type {
  BoardLayoutSnapshot,
  BoardScrollDelta,
  BrowserCommand,
  BrowserState,
  SaveRecordingRequest,
  SaveRecordingResult,
  ViewportBounds,
} from '../shared/ipc'

export type ViewportableApi = {
  command(command: BrowserCommand): void
  setViewportBounds(bounds: ViewportBounds): void
  setBoardLayout(layout: BoardLayoutSnapshot): void
  onBoardScroll(listener: (scroll: BoardScrollDelta) => void): () => void
  onBrowserState(listener: (state: BrowserState) => void): () => void
  saveRecording(recording: SaveRecordingRequest): Promise<SaveRecordingResult>
}

const api: ViewportableApi = {
  command(command) {
    ipcRenderer.send(IPC.command, command)
  },
  setViewportBounds(bounds) {
    ipcRenderer.send(IPC.bounds, bounds)
  },
  setBoardLayout(layout) {
    ipcRenderer.send(IPC.boardLayout, layout)
  },
  onBoardScroll(listener) {
    const handler = (_event: Electron.IpcRendererEvent, payload: BoardScrollDelta) => {
      listener(payload)
    }

    ipcRenderer.on(IPC.boardScroll, handler)
    return () => ipcRenderer.removeListener(IPC.boardScroll, handler)
  },
  saveRecording(recording) {
    return ipcRenderer.invoke(IPC.saveRecording, recording) as Promise<SaveRecordingResult>
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
