import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {}

const cat = {
  onBounce: (cb) => ipcRenderer.on('cat-bounce', (_e, strength) => cb(strength)),
  onIntroDone: (cb) => ipcRenderer.once('cat-intro-done', () => cb()),
  setMood: (mood) => ipcRenderer.send('cat-mood', mood)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('cat', cat)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
  window.cat = cat
}