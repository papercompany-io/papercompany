import { launch, shooter } from './lib.mjs';
const shot = shooter(process.argv[2] || 'playtest/shots/smoke');
const { app, page } = await launch({ userData: 'playtest/userdata-smoke' });
await page.waitForTimeout(1500);
await shot(page, 'first-screen');
await app.close();
