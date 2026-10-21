// 웹 미리보기(Artifact 페이지) 한 장 확인용: node playtest/look-web.mjs <html> <png>
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const p = await b.newPage({ viewport: { width: 1000, height: 680 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('file://' + process.argv[2]);
await p.waitForTimeout(2500);
await p.mouse.click(500, 340);
await p.waitForTimeout(600);
await p.screenshot({ path: process.argv[3] });
console.log('errors:', errs);
await b.close();
