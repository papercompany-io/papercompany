// 직접 조작 플레이테스트 드라이버.
// 실제 Electron 앱을 띄워 두고, playtest/do.mjs로 한 동작씩 명령을 보냅니다.
// 동작마다 스크린샷을 남기고 파일 경로를 돌려줍니다. 판정(assert)은 하지 않습니다.
//   node playtest/driver.mjs <회차 이름> [시드]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { _electron as electron } from 'playwright';

const run = process.argv[2] || 'run';
const seed = process.argv[3];
const dir = path.resolve('playtest/shots', run);
const userData = path.resolve('playtest', `userdata-${run}`);
fs.mkdirSync(dir, { recursive: true });
let n = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).length;
let app;
let page;

async function launch() {
  const env = { ...process.env, PC_USER_DATA: userData };
  if (seed) env.PC_SEED = seed;
  app = await electron.launch({ args: ['--no-sandbox', '.'], env, cwd: process.cwd() });
  page = await app.firstWindow();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('[console.error]', m.text()));
  await page.waitForLoadState('domcontentloaded');
}

const sel = (s) => (s.startsWith('t:') ? `[data-testid="${s.slice(2)}"]` : s);

async function shot(label) {
  n++;
  const file = path.join(dir, `${String(n).padStart(3, '0')}-${label.replace(/[^\w가-힣-]+/g, '_').slice(0, 50)}.png`);
  await page.screenshot({ path: file });
  return file;
}

async function exec(c) {
  const out = {};
  switch (c.action) {
    case 'click':
      await page.click(sel(c.target), { timeout: 5000 });
      break;
    case 'clickxy':
      await page.mouse.click(c.x, c.y);
      break;
    case 'fill':
      await page.fill(sel(c.target), c.value, { timeout: 5000 });
      break;
    case 'select':
      await page.selectOption(sel(c.target), c.value, { timeout: 5000 });
      break;
    case 'range':
      await page.$eval(sel(c.target), (el, v) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, String(c.value));
      break;
    case 'key':
      await page.keyboard.press(c.key);
      break;
    case 'wait':
      break;
    case 'drag': {
      const [x1, y1, x2, y2] = c.pts;
      await page.mouse.move(x1, y1);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(x1 + ((x2 - x1) * i) / 8, y1 + ((y2 - y1) * i) / 8);
      await page.mouse.up();
      break;
    }
    case 'wheel':
      await page.mouse.move(c.x, c.y);
      await page.mouse.wheel(0, c.dy);
      break;
    case 'hover':
      await page.hover(sel(c.target), { timeout: 5000 });
      break;
    case 'eval':
      out.value = await page.evaluate(c.target);
      break;
    case 'text':
      out.text = await page.innerText(sel(c.target), { timeout: 5000 });
      break;
    case 'restart':
      await app.close();
      await launch();
      break;
    case 'quit':
      await app.close();
      setTimeout(() => process.exit(0), 100);
      return { ok: true };
  }
  if (c.wait) await page.waitForTimeout(c.wait);
  out.file = await shot(c.label || c.action);
  return out;
}

await launch();
let queue = Promise.resolve();
http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      queue = queue.then(async () => {
        try {
          const r = await exec(JSON.parse(body));
          res.end(JSON.stringify({ ok: true, ...r }));
        } catch (e) {
          let file;
          try {
            file = await shot('error');
          } catch {}
          res.end(JSON.stringify({ ok: false, error: String(e.message || e).split('\n')[0], file }));
        }
      });
    });
  })
  .listen(7777, () => console.log('driver ready', run));
