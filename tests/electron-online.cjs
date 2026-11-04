// Electron의 실제 preload와 IPC를 거쳐 토큰이 렌더러 밖에 남는지 확인합니다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');

test('Electron 온라인 요청은 로그인 토큰을 감추고 같은 서버에만 전송합니다', async () => {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ url: req.url, authorization: req.headers.authorization });
    if (req.url === '/api/auth/login') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ account: { username: 'test' }, token: 'private-test-token' }));
    } else if (req.url === '/api/mp/saves') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ saves: [] }));
    } else if (req.url === '/api/auth/logout') {
      res.writeHead(302, { location: '/api/mp/saves' });
      res.end();
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const otherRequests = [];
  const otherServer = http.createServer((req, res) => {
    otherRequests.push(req.headers.authorization);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  });
  await new Promise((resolve) => otherServer.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const otherAddress = otherServer.address();
  assert.ok(address && typeof address !== 'string');
  assert.ok(otherAddress && typeof otherAddress !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  const otherBase = `http://127.0.0.1:${otherAddress.port}/api`;
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'papercompany-electron-test-'));
  let app;
  try {
    app = await electron.launch({
      args: [path.resolve('dist-electron/main.js')],
      env: { ...process.env, PC_USER_DATA: userData },
    });
    const page = await app.firstWindow();
    const login = await page.evaluate(async (url) => window.pcSave.onlineRequest({
      base: url, path: '/auth/login', method: 'POST', body: JSON.stringify({ username: 'test', password: 'test' }),
    }), base);
    assert.equal(login.status, 200);
    assert.deepEqual(login.body, { account: { username: 'test' } });
    assert.equal(await page.evaluate(() => typeof window.pcSave.getToken), 'undefined');

    const saves = await page.evaluate(async (url) => window.pcSave.onlineRequest({
      base: url, path: '/mp/saves', method: 'GET',
    }), base);
    assert.equal(saves.status, 200);
    assert.equal(requests.at(-1).authorization, 'Bearer private-test-token');
    await page.evaluate(async (url) => window.pcSave.onlineRequest({
      base: url, path: '/mp/saves', method: 'GET',
    }), otherBase);
    assert.equal(otherRequests.at(-1), undefined);

    const redirected = await page.evaluate(async (url) => {
      try {
        await window.pcSave.onlineRequest({ base: url, path: '/auth/logout', method: 'POST' });
        return false;
      } catch {
        return true;
      }
    }, base);
    assert.equal(redirected, true);
    assert.equal(requests.at(-1).url, '/api/auth/logout');

    await page.evaluate(() => window.pcSave.clearOnlineSession());
    await page.evaluate(async (url) => window.pcSave.onlineRequest({
      base: url, path: '/mp/saves', method: 'GET',
    }), base);
    assert.equal(requests.at(-1).authorization, undefined);
  } finally {
    if (app) await app.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await new Promise((resolve, reject) => otherServer.close((error) => error ? reject(error) : resolve()));
    await fs.rm(userData, { recursive: true, force: true });
  }
});
