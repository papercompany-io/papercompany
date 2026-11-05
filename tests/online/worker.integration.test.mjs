// 실제 Worker(workerd) + 로컬 D1·R2·메일로 돕니다. 실행: node --test tests/online/*.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, statSync, rmSync, watch } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// wrangler는 설정 파일 옆 .wrangler/tmp에 메일(.eml)을 씁니다. 설정을 격리된 임시 폴더로 옮겨 그 안에만 쓰게 합니다.
const TMP = mkdtempSync(join(tmpdir(), 'pc-online-'));
const here = dirname(fileURLToPath(import.meta.url));
const conf = JSON.parse(readFileSync(join(here, 'wrangler.test.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
conf.main = join(here, conf.main);
for (const d of conf.d1_databases) d.migrations_dir = join(here, d.migrations_dir);
writeFileSync(join(TMP, 'wrangler.json'), JSON.stringify(conf));
const { createTestHarness } = await import('wrangler');
const server = createTestHarness({ workers: [{ configPath: join(TMP, 'wrangler.json') }], persist: false });

// 로컬 send_email은 본문을 .wrangler/tmp/email/**/email-text/*.txt(.eml이 있으면 그것도)로 씁니다.
function mailFiles(dir = TMP, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) mailFiles(p, out);
    else if (n.endsWith('.eml') || (p.includes('email-text') && n.endsWith('.txt'))) out.push(p);
  }
  return out;
}
// 메일은 응답 뒤 waitUntil에서 파일로 쓰입니다. 요청을 보내기 전에 감시를 걸어 두고,
// 그때 없던 메일 파일이 생기면 받습니다(최대 5초).
function watchNextMail() {
  const seen = new Set(mailFiles());
  const fresh = () => mailFiles().filter(p => !seen.has(p)).map(p => readFileSync(p, 'utf8')).join('\n');
  let w, t;
  const done = new Promise((resolve, reject) => {
    w = watch(TMP, { recursive: true }, () => { const m = fresh(); if (m) resolve(m); });
    t = setTimeout(() => { const m = fresh(); m ? resolve(m) : reject(new Error('인증 메일 파일이 5초 안에 생기지 않았습니다')); }, 5000);
  });
  return done.finally(() => { clearTimeout(t); w.close(); });
}
function codeIn(text) {
  const m = text.match(/코드[^0-9]{0,20}(\d{6,8})/) ?? text.match(/\b(\d{6,8})\b/);
  assert.ok(m, '메일에서 코드를 찾지 못했습니다');
  return m[1];
}
async function register(username, email, password) {
  const mail = watchNextMail();
  const r = await api('POST', '/api/auth/register', { username, email, password });
  if (!r.ok) { mail.catch(() => {}); assert.fail('register ' + r.status + ' ' + await r.text()); }
  return codeIn(await mail);
}
const api = (method, path, body, token) => server.fetch(path, {
  method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});
async function signUp(name) {
  const email = name + '@example.test', password = 'correct-horse-' + name;
  const code = await register(name, email, password);
  const v = await api('POST', '/api/auth/verify-email', { email, code });
  assert.ok(v.ok, 'verify ' + v.status + ' ' + await v.clone().text());
  const l = await api('POST', '/api/auth/login', { username: name, password });
  assert.equal(l.status, 200, await l.clone().text());
  const { token } = await l.json();
  assert.ok(token, '로그인 응답에 token이 없습니다(Origin 없는 클라이언트)');
  return token;
}

before(async () => {
  await server.listen();
  const { DB } = await server.getWorker('papercompany-test').getEnv();
  for (const f of readdirSync(join(here, '../../migrations')).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(here, '../../migrations', f), 'utf8').replace(/--.*$/gm, '');
    const stmts = sql.split(';').map(s => s.trim()).filter(Boolean);
    await DB.batch(stmts.map(s => DB.prepare(s)));
  }
});
after(async () => { await server.close(); rmSync(TMP, { recursive: true, force: true }); });

test('인증 전에는 로그인되지 않고, 코드 확인 후 로그인·로그아웃', async () => {
  const email = 'early@example.test';
  const real = await register('early', email, 'correct-horse-early');
  assert.notEqual((await api('POST', '/api/auth/login', { username: 'early', password: 'correct-horse-early' })).status, 200);
  const wrong = real === '0'.repeat(real.length) ? '1'.repeat(real.length) : '0'.repeat(real.length);
  assert.ok((await api('POST', '/api/auth/verify-email', { email, code: wrong })).status >= 400);
  const token = await signUp('alice');
  assert.equal((await api('GET', '/api/auth/me', undefined, token)).status, 200);
  assert.ok((await api('POST', '/api/auth/logout', {}, token)).ok);
  assert.equal((await api('GET', '/api/auth/me', undefined, token)).status, 401);
});

// 서버는 data가 version 2인 JSON 객체 문자열이어야 받습니다
const save = v => JSON.stringify({ version: 2, v });

test('저장: 인증 필요, revision 증가, 충돌 409, 다른 사용자 분리', async () => {
  assert.equal((await api('PUT', '/api/mp/saves/main', { baseRevision: null, data: save('x') })).status, 401);
  const a = await signUp('bob'), b = await signUp('carol');
  const w1 = await api('PUT', '/api/mp/saves/main', { baseRevision: null, data: save('bob-1') }, a);
  const b1 = await w1.text();
  assert.equal(w1.status, 201, b1);
  assert.equal(JSON.parse(b1).revision, 1, b1);
  const w2 = await api('PUT', '/api/mp/saves/main', { baseRevision: 1, data: save('bob-2') }, a);
  const b2 = await w2.text();
  assert.ok(w2.ok, b2);
  assert.equal(JSON.parse(b2).revision, 2, b2);
  assert.equal((await api('PUT', '/api/mp/saves/main', { baseRevision: 1, data: save('stale') }, a)).status, 409);
  const g = await (await api('GET', '/api/mp/saves/main', undefined, a)).json();
  assert.equal(g.revision, 2);
  assert.equal(g.data, save('bob-2'));
  const other = await api('GET', '/api/mp/saves/main', undefined, b);
  assert.equal(other.status, 404, 'carol에게 bob의 저장이 보이면 안 됩니다');
});

test('AI 대화 API는 인증이 필요하고 키가 없으면 외부 요청 없이 거부합니다', async () => {
  assert.equal((await api('POST', '/api/talk', {})).status, 401);
  const token = await signUp('dave');
  const response = await api('POST', '/api/talk', {}, token);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'not_configured');
});
