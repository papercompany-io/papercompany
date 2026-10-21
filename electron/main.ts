// DT-01 Electron 메인 프로세스: 게임 창을 열고, DT-07 저장 파일을 사용자 데이터 폴더에 읽고 씁니다.
import { app, BrowserWindow, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// 플레이테스트에서 판마다 저장 폴더를 분리할 수 있게 환경 변수로 바꿀 수 있습니다.
if (process.env.PC_USER_DATA) app.setPath('userData', path.resolve(process.env.PC_USER_DATA));

const saveDir = () => app.getPath('userData');
const slotFile = (slot: string) => path.join(saveDir(), slot === 'backup' ? 'save.bak.json' : 'save.json');

ipcMain.handle('save:read', (_e, slot: string) => {
  try {
    return fs.readFileSync(slotFile(slot), 'utf8');
  } catch {
    return null;
  }
});

ipcMain.handle('save:write', (_e, data: string) => {
  fs.mkdirSync(saveDir(), { recursive: true });
  const main = slotFile('main');
  // 직전 저장을 백업으로 남겨, 손상되면 백업으로 복구합니다.
  if (fs.existsSync(main)) fs.copyFileSync(main, slotFile('backup'));
  const tmp = main + '.tmp';
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, main);
  return true;
});

ipcMain.handle('save:clear', () => {
  for (const slot of ['main', 'backup']) {
    try {
      fs.unlinkSync(slotFile(slot));
    } catch {
      /* 없으면 무시 */
    }
  }
  return true;
});

let win: BrowserWindow | null = null;
let allowClose = false;

// DT-07 종료 직전 저장: 창을 닫으려 하면 렌더러에 알려 저장하게 하고, 저장이 끝나면(최대 2초) 닫습니다.
ipcMain.on('app:close-ready', () => {
  allowClose = true;
  win?.close();
});

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#1d2433',
    title: '페이퍼컴퍼니',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // 플레이테스트에서 난수 시드를 고정할 수 있게 PC_SEED를 쿼리로 넘깁니다.
  const query: Record<string, string> = process.env.PC_SEED ? { seed: process.env.PC_SEED } : {};
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query });
  win.on('close', (e) => {
    if (allowClose || !win) return;
    e.preventDefault();
    win.webContents.send('app:before-close');
    setTimeout(() => {
      allowClose = true;
      win?.close();
    }, 2000);
  });
  win.on('closed', () => (win = null));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
