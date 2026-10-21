// 패키징한 앱(release/linux-unpacked)을 직접 띄워 첫 화면 스크린샷을 남깁니다. 판정은 스크린샷을 열어 봅니다.
import fs from 'fs';
import path from 'path';
import { _electron as electron } from 'playwright';

const out = path.resolve('playtest/shots/package');
fs.mkdirSync(out, { recursive: true });
const userData = path.resolve('playtest/userdata-package');
fs.rmSync(userData, { recursive: true, force: true });
const app = await electron.launch({
  executablePath: path.resolve('release/linux-unpacked/papercompany'),
  args: ['--no-sandbox'],
  env: { ...process.env, PC_USER_DATA: userData },
});
const page = await app.firstWindow();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('[console.error]', m.text()));
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(out, '001-패키지_부팅.png') });
await page.waitForTimeout(2200);
await page.screenshot({ path: path.join(out, '002-패키지_부팅끝.png') });
console.log('title:', await page.title());
await app.close();
