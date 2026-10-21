// DT-07 렌더러에 저장 API만 노출합니다.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('pcSave', {
  read: (slot: 'main' | 'backup') => ipcRenderer.invoke('save:read', slot) as Promise<string | null>,
  write: (data: string) => ipcRenderer.invoke('save:write', data) as Promise<boolean>,
  clear: () => ipcRenderer.invoke('save:clear') as Promise<boolean>,
});
