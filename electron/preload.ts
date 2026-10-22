// DT-07 렌더러에 저장 API만 노출합니다. 창을 닫기 전에 렌더러가 저장할 수 있게 닫힘 신호도 전달합니다.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('pcSave', {
  read: (slot: 'main' | 'backup') => ipcRenderer.invoke('save:read', slot) as Promise<string | null>,
  write: (data: string) => ipcRenderer.invoke('save:write', data) as Promise<boolean>,
  clear: () => ipcRenderer.invoke('save:clear') as Promise<boolean>,
  onBeforeClose: (cb: () => void) => {
    ipcRenderer.on('app:before-close', () => cb());
  },
  closeReady: () => ipcRenderer.send('app:close-ready'),
  readProfile: () => ipcRenderer.invoke('profile:read') as Promise<string | null>,
  writeProfile: (data: string) => ipcRenderer.invoke('profile:write', data) as Promise<boolean>,
  toggleFullscreen: () => ipcRenderer.send('app:toggle-fullscreen'),
  quit: () => ipcRenderer.send('app:quit'),
  jev: (req: { questions: unknown; state: unknown }) => ipcRenderer.invoke('jev:decide', req) as Promise<unknown>,
});
