// server/auth 시험: D1은 bun:sqlite에 두 마이그레이션을 적용해 흉내 내고, 메일은 보낸 내용을 배열에 모읍니다.
// 실행: bun test server
import { beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import type { D1Stmt } from '../multiplayer';
import { base32Decode, base32Encode, hotp, openTotp, sealTotp, totpStep } from './crypto';
import { AUTH_LIMITS, authenticate, handleAuth, sweepAuth, type AuthEnv } from './index';
import { handleRequest, type Env } from '../worker';

const MIGRATIONS = ['0001_auth.sql', '0100_multiplayer.sql'].map((f) => readFileSync(new URL(`../../migrations/${f}`, import.meta.url), 'utf8'));

function fakeD1(db: Database) {
  const runners = new Map<D1Stmt, () => { meta: { changes: number } }>();
  const stmt = (sql: string, args: unknown[]): D1Stmt => {
    const run = () => ({ meta: { changes: db.query(sql).run(...(args as never[])).changes } });
    const statement: D1Stmt = {
      bind: (...v: unknown[]) => stmt(sql, v),
      first: async <T>() => (db.query(sql).get(...(args as never[])) as T) ?? null,
      all: async <T>() => ({ results: db.query(sql).all(...(args as never[])) as T[] }),
      run: async () => run(),
    };
    runners.set(statement, run);
    return statement;
  };
  return {
    prepare: (sql: string) => stmt(sql, []),
    batch: async (statements: D1Stmt[]) => db.transaction(() => statements.map(s => {
      const run = runners.get(s);
      if (!run) throw new Error('Unknown statement');
      return run();
    }))(),
  };
}

const NOW = Date.UTC(2026, 10, 4, 3, 0, 0);
const ORIGIN = 'https://game.example';
let db: Database;
let mails: { to: string; subject: string; text?: string }[];
let env: AuthEnv;
let failMail: boolean;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const m of MIGRATIONS) db.exec(m);
  mails = [];
  failMail = false;
  env = {
    DB: fakeD1(db),
    EMAIL: {
      send: async (m) => {
        if (failMail) throw Object.assign(new Error('boom'), { code: 'E_DELIVERY_FAILED' });
        mails.push(m);
        return { messageId: 'x' };
      },
    },
    EMAIL_FROM: 'no-reply@game.example',
    AUTH_ENCRYPTION_KEY: 'ab'.repeat(32),
  };
});

type Opts = { now?: number; origin?: string | null; cookie?: string; bearer?: string; ip?: string };
async function call(method: string, path: string, body?: unknown, o: Opts = {}) {
  const headers: Record<string, string> = { 'cf-connecting-ip': o.ip ?? '203.0.113.1' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (o.origin !== null) headers.origin = o.origin ?? ORIGIN;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.bearer) headers.authorization = `Bearer ${o.bearer}`;
  const req = new Request(`${ORIGIN}/api/auth${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await handleAuth(req, env, { now: () => o.now ?? NOW, bcryptCost: 4 });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, cookie: res.headers.get('set-cookie') };
}

const lastCode = () => /(\d{6})/.exec(mails.at(-1)!.subject)![1];
const cookieOf = (setCookie: string | null) => setCookie!.split(';')[0];

async function verifiedUser(username = 'alice', email = 'alice@example.com', password = 'correct horse') {
  expect((await call('POST', '/register', { username, email, password })).status).toBe(201);
  expect((await call('POST', '/verify-email', { email, code: lastCode() })).status).toBe(200);
}

async function totpNow(secret: string, now = NOW) {
  return hotp(base32Decode(secret), totpStep(now));
}

describe('crypto', () => {
  test('RFC 6238 SHA-1 test vector', async () => {
    const secret = new TextEncoder().encode('12345678901234567890');
    expect(await hotp(secret, Math.floor(59 / 30), 8)).toBe('94287082');
    expect(await hotp(secret, Math.floor(1111111109 / 30), 8)).toBe('07081804');
  });
  test('base32 round trip', () => {
    const b = new Uint8Array([0, 1, 2, 250, 255, 7, 9]);
    expect(base32Decode(base32Encode(b))).toEqual(b);
    expect(base32Encode(new TextEncoder().encode('foobar'))).toBe('MZXW6YTBOI');
  });
  test('TOTP encryption rejects changed ciphertext, key, or user', async () => {
    const sealed = await sealTotp('JBSWY3DPEHPK3PXP', env.AUTH_ENCRYPTION_KEY, 'alice');
    expect(await openTotp(sealed, env.AUTH_ENCRYPTION_KEY, 'alice')).toBe('JBSWY3DPEHPK3PXP');
    const changed = sealed.slice(0, -1) + (sealed.endsWith('0') ? '1' : '0');
    await expect(openTotp(changed, env.AUTH_ENCRYPTION_KEY, 'alice')).rejects.toThrow();
    await expect(openTotp(sealed, 'cd'.repeat(32), 'alice')).rejects.toThrow();
    await expect(openTotp(sealed, env.AUTH_ENCRYPTION_KEY, 'bob')).rejects.toThrow();
  });
});

describe('register and email verification', () => {
  test('stores bcrypt hash, sends code, blocks login until verified', async () => {
    const r = await call('POST', '/register', { username: 'alice', email: 'Alice@Example.com', password: 'correct horse' });
    expect(r.status).toBe(201);
    const row = db.query('SELECT email, password_hash FROM auth_users').get() as { email: string; password_hash: string };
    expect(row.email).toBe('alice@example.com');
    expect(row.password_hash.startsWith('$2b$04$')).toBe(true);
    expect(mails[0].to).toBe('alice@example.com');
    expect((db.query('SELECT code_hash FROM auth_email_codes').get() as { code_hash: string }).code_hash).not.toBe(lastCode());

    expect((await call('POST', '/login', { username: 'alice', password: 'correct horse' })).body.error).toBe('email_not_verified');
    expect((await call('POST', '/verify-email', { email: 'alice@example.com', code: lastCode() })).status).toBe(200);
    expect((await call('POST', '/login', { username: 'alice', password: 'correct horse' })).status).toBe(200);
  });

  test('rejects duplicates, bad input, and frees stale unverified names', async () => {
    let n = 0;
    const reg = (body: object, now = NOW) => call('POST', '/register', body, { now, ip: `192.0.2.${n++}` });
    await reg({ username: 'alice', email: 'a@example.com', password: 'correct horse' });
    expect((await reg({ username: 'ALICE', email: 'b@example.com', password: 'correct horse' })).body.error).toBe('username_taken');
    expect((await reg({ username: 'bob', email: 'A@example.com', password: 'correct horse' })).body.error).toBe('email_taken');
    expect((await reg({ username: 'b!', email: 'c@example.com', password: 'correct horse' })).body.error).toBe('bad_username');
    expect((await reg({ username: 'carol', email: 'c@example.com', password: 'short' })).body.error).toBe('bad_password');
    expect((await reg({ username: 'carol', email: 'c@example.com', password: 'x'.repeat(73) })).body.error).toBe('bad_password');
    expect((await reg({ username: 'alice', email: 'a@example.com', password: 'correct horse' }, NOW + AUTH_LIMITS.unverifiedMs + 1)).status).toBe(201);
  });

  test('signup is rate limited per IP', async () => {
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await call('POST', '/register', { username: `user${i}`, email: `u${i}@example.com`, password: 'correct horse' })).status;
    expect(last).toBe(429);
  });

  test('wrong code counts attempts and locks after the limit', async () => {
    await call('POST', '/register', { username: 'alice', email: 'a@example.com', password: 'correct horse' });
    const good = lastCode();
    const bad = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < AUTH_LIMITS.codeAttempts; i++) expect((await call('POST', '/verify-email', { email: 'a@example.com', code: bad })).status).toBe(400);
    expect((await call('POST', '/verify-email', { email: 'a@example.com', code: good })).status).toBe(400);
  });

  test('expired code fails; resend issues a new one without revealing accounts', async () => {
    await call('POST', '/register', { username: 'alice', email: 'a@example.com', password: 'correct horse' });
    const late = NOW + AUTH_LIMITS.emailCodeMs + 1;
    expect((await call('POST', '/verify-email', { email: 'a@example.com', code: lastCode() }, { now: late })).status).toBe(400);
    expect((await call('POST', '/verify-email/resend', { email: 'nobody@example.com' }, { now: late })).body).toEqual({ ok: true });
    expect(mails.length).toBe(1);
    expect((await call('POST', '/verify-email/resend', { email: 'a@example.com' }, { now: late })).body).toEqual({ ok: true });
    expect(mails.length).toBe(2);
    expect((await call('POST', '/verify-email', { email: 'a@example.com', code: lastCode() }, { now: late })).status).toBe(200);
  });

  test('mail failure rolls back the account', async () => {
    failMail = true;
    expect((await call('POST', '/register', { username: 'alice', email: 'a@example.com', password: 'correct horse' })).body.error).toBe('email_failed');
    expect(db.query('SELECT COUNT(*) AS n FROM auth_users').get()).toEqual({ n: 0 });
  });
  test('signup codes recover a password without TOTP and cannot be reused', async () => {
    const registered = await call('POST', '/register', { username: 'alice', email: 'alice@example.com', password: 'correct horse' });
    expect(registered.body.recoveryCodes).toHaveLength(10);
    await call('POST', '/verify-email', { email: 'alice@example.com', code: lastCode() });
    const token = (await call('POST', '/login', { username: 'alice', password: 'correct horse' }, { origin: null })).body.token;
    const reset = { username: 'alice', code: registered.body.recoveryCodes[0], password: 'replacement horse' };
    expect((await call('POST', '/recovery/reset', { ...reset, code: 'not-a-code' })).status).toBe(401);
    expect((await call('POST', '/recovery/reset', reset)).status).toBe(200);
    expect((await call('GET', '/me', undefined, { origin: null, bearer: token })).status).toBe(401);
    expect((await call('POST', '/recovery/reset', reset)).status).toBe(401);
    expect((await call('POST', '/login', { username: 'alice', password: 'correct horse' })).status).toBe(401);
    expect((await call('POST', '/login', { username: 'alice', password: 'replacement horse' })).status).toBe(200);
  });
});

describe('login and sessions', () => {
  test('browser gets HttpOnly cookie only; desktop (no Origin) gets token in body', async () => {
    await verifiedUser();
    const web = await call('POST', '/login', { username: 'alice', password: 'correct horse' });
    expect(web.body.token).toBeUndefined();
    expect(web.body.account).toEqual({ username: 'alice', email: 'alice@example.com', emailVerified: true, totpEnabled: false });
    expect(web.cookie).toContain('__Host-pc_session=');
    expect(web.cookie).toContain('HttpOnly');
    expect(web.cookie).toContain('Secure');
    expect(web.cookie).toContain('SameSite=Lax');
    expect((await call('GET', '/me', undefined, { cookie: cookieOf(web.cookie) })).body.username).toBe('alice');

    const desk = await call('POST', '/login', { username: 'alice', password: 'correct horse' }, { origin: null });
    expect(desk.body.token).toMatch(/^[0-9a-f]{64}$/);
    const stored = db.query('SELECT token_hash FROM auth_sessions').all() as { token_hash: string }[];
    expect(stored.some((s) => s.token_hash === desk.body.token)).toBe(false);
    expect((await call('GET', '/me', undefined, { bearer: desk.body.token, origin: null })).status).toBe(200);

    expect((await call('POST', '/logout', {}, { bearer: desk.body.token, origin: null })).status).toBe(200);
    expect((await call('GET', '/me', undefined, { bearer: desk.body.token, origin: null })).status).toBe(401);
  });

  test('wrong password and unknown user give the same error', async () => {
    await verifiedUser();
    const a = await call('POST', '/login', { username: 'alice', password: 'wrong pass' });
    const b = await call('POST', '/login', { username: 'nobody', password: 'wrong pass' });
    expect([a.status, a.body.error]).toEqual([401, 'invalid_credentials']);
    expect(b.body).toEqual(a.body);
  });

  test('session expires', async () => {
    await verifiedUser();
    const s = await call('POST', '/login', { username: 'alice', password: 'correct horse' }, { origin: null });
    expect((await call('GET', '/me', undefined, { bearer: s.body.token, origin: null, now: NOW + AUTH_LIMITS.sessionMs })).status).toBe(401);
  });

  test('login is rate limited per user', async () => {
    await verifiedUser();
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await call('POST', '/login', { username: 'alice', password: 'wrong pass' }, { ip: `198.51.100.${i}` })).status;
    expect(last).toBe(429);
  });

  test('cookie requests need an allowed Origin (CSRF)', async () => {
    await verifiedUser();
    const web = await call('POST', '/login', { username: 'alice', password: 'correct horse' });
    const c = cookieOf(web.cookie);
    expect((await call('POST', '/totp/setup', {}, { cookie: c, origin: 'https://evil.example' })).status).toBe(403);
    expect((await call('POST', '/totp/setup', {}, { cookie: c, origin: null })).status).toBe(403);
    expect((await call('POST', '/totp/setup', {}, { cookie: c })).status).toBe(200);
    env.ALLOWED_ORIGINS = 'https://other.example';
    expect((await call('POST', '/totp/setup', {}, { cookie: c, origin: 'https://other.example' })).status).toBe(200);
  });
});

describe('TOTP and recovery codes', () => {
  async function enableTotp() {
    await verifiedUser();
    const token = (await call('POST', '/login', { username: 'alice', password: 'correct horse' }, { origin: null })).body.token as string;
    const setup = await call('POST', '/totp/setup', {}, { bearer: token, origin: null });
    expect(setup.body.otpauthUri).toContain(`secret=${setup.body.secret}`);
    const en = await call('POST', '/totp/enable', { code: await totpNow(setup.body.secret) }, { bearer: token, origin: null });
    expect(en.status).toBe(200);
    expect(en.body.recoveryCodes).toHaveLength(AUTH_LIMITS.recoveryCodes);
    return { token, secret: setup.body.secret as string, recovery: en.body.recoveryCodes as string[] };
  }

  test('login needs a second step; codes are not reusable', async () => {
    const { secret } = await enableTotp();
    const first = await call('POST', '/login', { username: 'alice', password: 'correct horse' });
    expect(first.body.needTotp).toBe(true);
    expect(first.cookie).toBeNull();
    // 켤 때 쓴 코드와 같은 시간 칸이라 다시 쓸 수 없습니다
    expect((await call('POST', '/login/totp', { ticket: first.body.ticket, code: await totpNow(secret) })).status).toBe(401);
    const later = NOW + 30_000;
    const ok = await call('POST', '/login/totp', { ticket: first.body.ticket, code: await totpNow(secret, later) }, { now: later });
    expect(ok.status).toBe(200);
    expect(ok.body.account.totpEnabled).toBe(true);
    expect((await call('POST', '/login/totp', { ticket: first.body.ticket, code: await totpNow(secret, later) }, { now: later })).body.error).toBe('invalid_ticket');
  });

  test('ticket allows limited attempts and expires', async () => {
    const { secret } = await enableTotp();
    const t = (await call('POST', '/login', { username: 'alice', password: 'correct horse' })).body.ticket;
    for (let i = 0; i < AUTH_LIMITS.codeAttempts; i++) await call('POST', '/login/totp', { ticket: t, code: 'invalid' });
    const later = NOW + 60_000;
    expect((await call('POST', '/login/totp', { ticket: t, code: await totpNow(secret, later) }, { now: later })).body.error).toBe('invalid_ticket');
    const t2 = (await call('POST', '/login', { username: 'alice', password: 'correct horse' })).body.ticket;
    const late = NOW + AUTH_LIMITS.ticketMs + 1;
    expect((await call('POST', '/login/totp', { ticket: t2, code: await totpNow(secret, late) }, { now: late })).body.error).toBe('invalid_ticket');
  });

  test('recovery code works once, any case or dashes', async () => {
    const { recovery } = await enableTotp();
    const t = (await call('POST', '/login', { username: 'alice', password: 'correct horse' })).body.ticket;
    expect((await call('POST', '/login/recovery', { ticket: t, code: recovery[0].toUpperCase().replace('-', '') })).status).toBe(200);
    const t2 = (await call('POST', '/login', { username: 'alice', password: 'correct horse' })).body.ticket;
    expect((await call('POST', '/login/recovery', { ticket: t2, code: recovery[0] })).status).toBe(401);
    expect((await call('POST', '/login/recovery', { ticket: t2, code: recovery[1] })).status).toBe(200);
  });

  test('regenerate replaces codes; disable turns TOTP off', async () => {
    const { token, secret, recovery } = await enableTotp();
    const t1 = NOW + 30_000;
    const regen = await call('POST', '/recovery/regenerate', { code: await totpNow(secret, t1) }, { bearer: token, origin: null, now: t1 });
    expect(regen.body.recoveryCodes).toHaveLength(AUTH_LIMITS.recoveryCodes);
    const ticket = (await call('POST', '/login', { username: 'alice', password: 'correct horse' })).body.ticket;
    expect((await call('POST', '/login/recovery', { ticket, code: recovery[0] })).status).toBe(401);
    const t2 = NOW + 60_000;
    expect((await call('POST', '/totp/disable', { code: 'invalid' }, { bearer: token, origin: null, now: t2 })).status).toBe(400);
    expect((await call('POST', '/totp/disable', { code: await totpNow(secret, t2) }, { bearer: token, origin: null, now: t2 })).status).toBe(200);
    const plain = await call('POST', '/login', { username: 'alice', password: 'correct horse' }, { now: t2 });
    expect(plain.body.needTotp).toBeUndefined();
    expect(plain.body.account.totpEnabled).toBe(false);
  });
  test('recovery resets a lost password and TOTP, revoking sessions and tickets', async () => {
    const { token, recovery } = await enableTotp();
    const ticket = (await call('POST', '/login', { username: 'alice', password: 'correct horse' })).body.ticket;
    const reset = { username: 'alice', code: recovery[0], password: 'replacement horse' };
    const concurrent = await Promise.all([call('POST', '/recovery/reset', reset), call('POST', '/recovery/reset', reset)]);
    expect(concurrent.map(r => r.status).sort()).toEqual([200, 401]);
    expect((await call('GET', '/me', undefined, { bearer: token, origin: null })).status).toBe(401);
    expect((await call('POST', '/login/recovery', { ticket, code: recovery[1] })).body.error).toBe('invalid_ticket');
    const login = await call('POST', '/login', { username: 'alice', password: 'replacement horse' });
    expect(login.status).toBe(200);
    expect(login.body.account.totpEnabled).toBe(false);
  });
  test('recovery requests are limited per account across IP addresses', async () => {
    await verifiedUser();
    let last;
    for (let i = 0; i < 11; i++) last = await call('POST', '/recovery/reset', { username: 'alice', code: 'wrong', password: 'replacement horse' }, { ip: `192.0.2.${i}` });
    expect(last?.status).toBe(429);
  });
});

describe('worker wiring', () => {
  test('/api/mp gets the session user; logged-out saves are 401', async () => {
    await verifiedUser();
    const token = (await call('POST', '/login', { username: 'alice', password: 'correct horse' }, { origin: null })).body.token as string;
    const blobs = new Map<string, string>();
    const full: Env = {
      ...env,
      SAVES: {
        put: async (k, v) => void blobs.set(k, v),
        get: async (k) => (blobs.has(k) ? { text: async () => blobs.get(k)! } : null),
        delete: async () => undefined,
      },
    };
    const anon = await handleRequest(new Request(`${ORIGIN}/api/mp/saves`), full);
    expect(anon.status).toBe(401);
    const put = await handleRequest(
      new Request(`${ORIGIN}/api/mp/saves/main`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ data: '{"version":2}', baseRevision: null }) }),
      full,
    );
    expect(put.status).toBe(201);
    const userId = (db.query('SELECT id FROM auth_users').get() as { id: string }).id;
    expect(db.query('SELECT user_id FROM mp_saves').get()).toEqual({ user_id: userId });
  });

  test('authenticate rejects cookie writes from foreign origins', async () => {
    await verifiedUser();
    const c = cookieOf((await call('POST', '/login', { username: 'alice', password: 'correct horse' })).cookie);
    const res = await authenticate(new Request(`${ORIGIN}/api/mp/saves/main`, { method: 'PUT', headers: { cookie: c, origin: 'https://evil.example' } }), env, { now: () => NOW });
    expect(res instanceof Response && res.status).toBe(403);
    const ok = await authenticate(new Request(`${ORIGIN}/api/mp/saves`, { headers: { cookie: c } }), env, { now: () => NOW });
    expect(ok instanceof Response ? null : typeof ok.userId).toBe('string');
  });

  test('sweepAuth removes expired rows and stale signups', async () => {
    await verifiedUser();
    await call('POST', '/login', { username: 'alice', password: 'correct horse' });
    await call('POST', '/register', { username: 'bob', email: 'b@example.com', password: 'correct horse' });
    await sweepAuth(env, NOW + AUTH_LIMITS.sessionMs + 1);
    expect(db.query('SELECT COUNT(*) AS n FROM auth_sessions').get()).toEqual({ n: 0 });
    expect(db.query('SELECT username FROM auth_users').all()).toEqual([{ username: 'alice' }]);
  });
});
