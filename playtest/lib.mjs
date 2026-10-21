// 플레이테스트 도우미: 실제 Electron 앱을 띄우고, 한 동작마다 스크린샷을 남깁니다.
// 판정(assert)은 하지 않습니다. 스크린샷을 사람이(Claude가) 직접 열어 보고 판단합니다.
import { _electron as electron } from 'playwright';
import fs from 'fs';
import path from 'path';

export async function launch({ userData, seed } = {}) {
  const env = { ...process.env };
  if (userData) env.PC_USER_DATA = userData;
  if (seed !== undefined) env.PC_SEED = String(seed);
  const app = await electron.launch({ args: ['--no-sandbox', '.'], env, cwd: process.cwd() });
  const page = await app.firstWindow();
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
  return { app, page };
}

export function shooter(dir) {
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  return async (page, label) => {
    n++;
    const file = path.join(dir, `${String(n).padStart(2, '0')}-${label}.png`);
    await page.screenshot({ path: file });
    console.log('shot', file);
    return file;
  };
}
