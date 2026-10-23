// DT-01 Electron 메인 프로세스: 게임 창을 열고, DT-07 저장 파일을 사용자 데이터 폴더에 읽고 씁니다.
import { app, BrowserWindow, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { talkChat, type TalkChatRequest } from './openrouter';

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

// 메타 진행(레거시·업적·명예의 전당)은 판 저장과 따로 둡니다.
const profileFile = () => path.join(saveDir(), 'profile.json');
ipcMain.handle('profile:read', () => {
  try {
    return fs.readFileSync(profileFile(), 'utf8');
  } catch {
    return null;
  }
});
ipcMain.handle('profile:write', (_e, data: string) => {
  fs.mkdirSync(saveDir(), { recursive: true });
  const tmp = profileFile() + '.tmp';
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, profileFile());
  return true;
});

// 자유 입력 대화(A-139 → A-199): OpenRouter 호출은 키가 렌더러에 닿지 않게 메인 프로세스에서 합니다.
// 실제 LLM(openrouter.ts)이 대표 말의 해석과 직원 답장을 한 번에 냅니다. 효과는 게임 규칙이 정합니다.
// 키는 사용자 데이터 폴더의 .env, 없으면 실행 폴더의 .env(OPENROUTER_API_KEY, OPENROUTER_TALK_MODEL). 없으면 null → 게임은 키워드 규칙으로 답합니다.
function readEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of [path.join(process.cwd(), '.env'), path.join(saveDir(), '.env')]) {
    try {
      for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch {
      /* 없으면 무시 */
    }
  }
  return { ...out, ...(process.env.OPENROUTER_API_KEY ? { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY } : {}) };
}

ipcMain.handle('talk:chat', async (_e, req: TalkChatRequest) => {
  try {
    return await talkChat(readEnv(), req);
  } catch {
    return null;
  }
});

ipcMain.on('app:toggle-fullscreen', () => win?.setFullScreen(!win.isFullScreen()));
ipcMain.on('app:quit', () => win?.close());

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
