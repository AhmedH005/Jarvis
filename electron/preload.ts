/**
 * Preload script — the secure bridge between Electron main and the React renderer.
 * Only explicitly exposed methods are accessible from the renderer.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { StreamChunk } from './openclaw'

// Type-safe API exposed to window.jarvis in the renderer
const jarvisAPI = {
  // ── Window controls ──────────────────────────────────────────────────────────
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close:    () => ipcRenderer.invoke('window:close'),
  },

  // ── OpenClaw ─────────────────────────────────────────────────────────────────
  openclaw: {
    /** Send a message; chunks arrive via onChunk listener */
    send: (message: string, conversationId?: string) =>
      ipcRenderer.invoke('openclaw:send', { message, conversationId }),

    /** Register a listener for streaming chunks */
    onChunk: (cb: (chunk: StreamChunk) => void) => {
      const handler = (_: Electron.IpcRendererEvent, chunk: StreamChunk) => cb(chunk)
      ipcRenderer.on('openclaw:chunk', handler)
      return () => ipcRenderer.removeListener('openclaw:chunk', handler)
    },

    /** Register a listener for stream completion */
    onDone: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('openclaw:done', handler)
      return () => ipcRenderer.removeListener('openclaw:done', handler)
    },

    /** Register a listener for stream errors */
    onError: (cb: (msg: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, msg: string) => cb(msg)
      ipcRenderer.on('openclaw:error', handler)
      return () => ipcRenderer.removeListener('openclaw:error', handler)
    },

    /** Get OpenClaw gateway status */
    status: () => ipcRenderer.invoke('openclaw:status'),

    /** List enabled skills */
    skills: () => ipcRenderer.invoke('openclaw:skills'),
  },

  // ── Shell ────────────────────────────────────────────────────────────────────
  shell: {
    open: (url: string) => ipcRenderer.invoke('shell:open', url),
  },
}

contextBridge.exposeInMainWorld('jarvis', jarvisAPI)

// ── Type declaration (consumed by renderer TypeScript) ─────────────────────────
export type JarvisAPI = typeof jarvisAPI
