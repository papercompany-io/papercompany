// 계정·로그인 API(A-249). Worker 진입점(server/worker.ts)이 /api/auth/*를 handleAuth로 넘기고,
// 다른 API는 authenticate로 사용자 id를 얻습니다. 바인딩·API 표는 server/auth/README.md.
//
// 보안 요점
// - 비밀번호 bcrypt, 세션·티켓·복구 코드·이메일 코드는 SHA-256 해시만 D1에 둡니다(DB가 새도 바로 못 씀).
// - 웹은 HttpOnly·Secure·SameSite=Lax 쿠키(__Host-pc_session). 쿠키로 바꾸는 요청은 Origin이 허용 목록이어야 합니다(CSRF).
// - 데스크톱(Electron main의 fetch, Origin 없음)은 응답 본문의 token을 받아 Authorization: Bearer로 보냅니다.
// - 요청 수 제한은 D1 고정 창(auth_rate_limits). 2단계 티켓·이메일 코드는 각자 시도 5번까지.
import type { D1Like, D1Stmt } from '../multiplayer';
import {
  checkPassword,
  DUMMY_HASH,
  hashPassword,
  matchTotp,
  newEmailCode,
  newRecoveryCode,
  newTotpSecret,
  openTotp,
  normalizeRecovery,
  PASSWORD_MAX_BYTES,
  randomToken,
  sealTotp,
  sha256Hex,
} from './crypto';

export interface EmailSender {
  send(message: { to: string; from: string | { email: string; name?: string }; subject: string; text?: string; html?: string }): Promise<unknown>;
}
export interface AuthEnv {
  DB: D1Like & { batch(statements: D1Stmt[]): Promise<{ meta: { changes: number } }[]> };
  EMAIL: EmailSender; // send_email 바인딩(Cloudflare Email Sending)
  EMAIL_FROM: string; // 인증된 보내는 도메인의 주소, 예: no-reply@example.com
  AUTH_ENCRYPTION_KEY: string; // Worker secret: 32바이트 hex, TOTP 암호화용
  ALLOWED_ORIGINS?: string; // 쉼표로 구분한 추가 허용 출처(같은 출처는 늘 허용)
}
export interface AuthOptions {
  now?: () => number; // 시험용 시계(밀리초)
  bcryptCost?: number; // 시험에서만 낮춥니다
}

export const AUTH_PREFIX = '/api/auth';
export const SESSION_COOKIE = '__Host-pc_session';
export const AUTH_LIMITS = {
  sessionMs: 30 * 86400_000,
  ticketMs: 5 * 60_000,
  emailCodeMs: 30 * 60_000,
  unverifiedMs: 24 * 3600_000, // 인증하지 않은 가입은 이 시간이 지나면 아이디·이메일을 풀어 줍니다
  codeAttempts: 5,
  recoveryCodes: 10,
  bcryptCost: 10,
  bodyBytes: 16 * 1024,
} as const;
const MIN = 60_000;
const RATE = {
  register: { limit: 5, windowMs: 60 * MIN },
  loginIp: { limit: 30, windowMs: 15 * MIN },
  loginUser: { limit: 10, windowMs: 15 * MIN },
  verifyIp: { limit: 20, windowMs: 15 * MIN },
  resendIp: { limit: 5, windowMs: 60 * MIN },
  resendEmail: { limit: 3, windowMs: 60 * MIN },
  secondFactorIp: { limit: 30, windowMs: 15 * MIN },
  totpUser: { limit: 10, windowMs: 15 * MIN },
  recoveryIp: { limit: 10, windowMs: 60 * MIN },
  recoveryUser: { limit: 10, windowMs: 60 * MIN },
} as const;

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}
const errorResponse = (e: HttpError) => json({ error: e.code, message: e.message }, e.status, e.headers);

async function readJson(req: Request): Promise<Record<string, unknown>> {
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'Content-Type은 application/json이어야 합니다.');
  }
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > AUTH_LIMITS.bodyBytes) throw new HttpError(413, 'too_large', '요청 본문이 너무 큽니다.');
  if (!req.body) throw new HttpError(400, 'bad_request', '요청 본문이 없습니다.');
  // content-length가 없거나 틀릴 수 있으므로 읽으면서도 상한을 지킵니다
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > AUTH_LIMITS.bodyBytes) {
      await reader.cancel();
      throw new HttpError(413, 'too_large', '요청 본문이 너무 큽니다.');
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    buf.set(c, at);
    at += c.byteLength;
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new HttpError(400, 'bad_json', '본문이 올바른 JSON이 아닙니다.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'bad_request', '본문은 객체여야 합니다.');
  return body as Record<string, unknown>;
}

function str(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== 'string') throw new HttpError(400, 'bad_request', `${key} 값이 필요합니다.`);
  return v;
}

const clientIp = (req: Request) => req.headers.get('cf-connecting-ip') ?? 'unknown';

// ── 출처 확인(CSRF) ──
function allowedOrigin(req: Request, env: AuthEnv, origin: string): boolean {
  if (origin === new URL(req.url).origin) return true;
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(origin);
}
// Origin이 있으면 허용 목록이어야 합니다. 쿠키로 상태를 바꾸는 요청은 Origin이 반드시 있어야 합니다.
function checkOrigin(req: Request, env: AuthEnv, usesCookie: boolean) {
  const origin = req.headers.get('origin');
  if (origin !== null) {
    if (!allowedOrigin(req, env, origin)) throw new HttpError(403, 'bad_origin', '허용되지 않은 출처의 요청입니다.');
    return;
  }
  const unsafe = req.method !== 'GET' && req.method !== 'HEAD';
  if (usesCookie && unsafe) throw new HttpError(403, 'bad_origin', '허용되지 않은 출처의 요청입니다.');
}

// ── 요청 수 제한(고정 창) ──
async function rateLimit(env: AuthEnv, key: string, rule: { limit: number; windowMs: number }, now: number) {
  const start = Math.floor(now / rule.windowMs) * rule.windowMs;
  const row = await env.DB.prepare(
    `INSERT INTO auth_rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
       window_start = excluded.window_start
     RETURNING count`,
  )
    .bind(key, start)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > rule.limit) {
    const retry = Math.ceil((start + rule.windowMs - now) / 1000);
    throw new HttpError(429, 'rate_limited', '요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.', { 'retry-after': String(retry) });
  }
}

// ── 사용자·세션 ──
interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  email_verified_at: number | null;
  totp_secret: string | null;
  totp_pending: string | null;
  totp_last_step: number | null;
  created_at: number;
}
const USER_COLS = 'u.id, u.username, u.email, u.password_hash, u.email_verified_at, u.totp_secret, u.totp_pending, u.totp_last_step, u.created_at';
const account = (u: UserRow) => ({ username: u.username, email: u.email, emailVerified: u.email_verified_at !== null, totpEnabled: u.totp_secret !== null });

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function sessionToken(req: Request): { token: string; viaCookie: boolean } | null {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return { token: auth.slice(7).trim(), viaCookie: false };
  const c = readCookie(req, SESSION_COOKIE);
  return c ? { token: c, viaCookie: true } : null;
}

async function sessionUser(env: AuthEnv, token: string, now: number): Promise<UserRow | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return env.DB.prepare(`SELECT ${USER_COLS} FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`)
    .bind(await sha256Hex(token), now)
    .first<UserRow>();
}

const cookieHeader = (value: string, maxAgeS: number) => `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeS}`;

async function startSession(req: Request, env: AuthEnv, user: UserRow, now: number): Promise<Response> {
  const token = randomToken(32);
  await env.DB.prepare('INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), user.id, now, now + AUTH_LIMITS.sessionMs)
    .run();
  // 브라우저(Origin 있음)에는 토큰을 본문에 싣지 않아 스크립트가 읽지 못하게 합니다
  const body = req.headers.get('origin') === null ? { account: account(user), token } : { account: account(user) };
  return json(body, 200, { 'set-cookie': cookieHeader(token, AUTH_LIMITS.sessionMs / 1000) });
}

/**
 * 다른 API(/api/mp 등)에서 쓰는 사용자 확인. 로그인 안 했거나 세션이 끝났으면 userId null.
 * 쿠키 세션으로 상태를 바꾸는 요청의 출처가 틀리면 403 응답을 돌려줍니다.
 */
export async function authenticate(req: Request, env: AuthEnv, opts: AuthOptions = {}): Promise<{ userId: string | null } | Response> {
  const now = (opts.now ?? Date.now)();
  const t = sessionToken(req);
  try {
    checkOrigin(req, env, t?.viaCookie ?? false);
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e);
    throw e;
  }
  if (!t) return { userId: null };
  const user = await sessionUser(env, t.token, now);
  return { userId: user && user.email_verified_at !== null ? user.id : null };
}

async function requireSession(req: Request, env: AuthEnv, now: number): Promise<{ user: UserRow; tokenHash: string }> {
  const t = sessionToken(req);
  const user = t ? await sessionUser(env, t.token, now) : null;
  if (!t || !user) throw new HttpError(401, 'unauthorized', '로그인이 필요합니다.');
  return { user, tokenHash: await sha256Hex(t.token) };
}

// ── 이메일 인증 ──
async function sendVerification(env: AuthEnv, user: { id: string; username: string; email: string }, now: number) {
  if (!env.EMAIL_FROM) throw new HttpError(500, 'config', '메일 보내는 주소가 설정되지 않았습니다.');
  const code = newEmailCode();
  await env.DB.prepare(
    `INSERT INTO auth_email_codes (user_id, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)
     ON CONFLICT (user_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0`,
  )
    .bind(user.id, await sha256Hex(code), now + AUTH_LIMITS.emailCodeMs)
    .run();
  const minutes = AUTH_LIMITS.emailCodeMs / MIN;
  await env.EMAIL.send({
    to: user.email,
    from: { email: env.EMAIL_FROM, name: '페이퍼컴퍼니' },
    subject: `[페이퍼컴퍼니] 이메일 인증 코드 ${code}`,
    text: `${user.username}님, 페이퍼컴퍼니 가입을 마치려면 인증 코드 ${code}를 입력해 주세요.\n코드는 ${minutes}분 동안 쓸 수 있습니다. 직접 가입하지 않았다면 이 메일을 무시하셔도 됩니다.`,
    html: `<p>${user.username}님, 페이퍼컴퍼니 가입을 마치려면 아래 인증 코드를 입력해 주세요.</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>코드는 ${minutes}분 동안 쓸 수 있습니다. 직접 가입하지 않았다면 이 메일을 무시하셔도 됩니다.</p>`,
  });
}

async function register(req: Request, env: AuthEnv, now: number, cost: number) {
  await rateLimit(env, `register-ip:${clientIp(req)}`, RATE.register, now);
  const body = await readJson(req);
  const username = str(body, 'username').trim();
  const email = str(body, 'email').trim().toLowerCase();
  const password = str(body, 'password');
  if (!USERNAME_RE.test(username)) throw new HttpError(400, 'bad_username', '아이디는 영문·숫자·밑줄 3~20자입니다.');
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new HttpError(400, 'bad_email', '이메일 주소 형식이 맞지 않습니다.');
  const pwBytes = new TextEncoder().encode(password).byteLength;
  if (password.length < 8 || pwBytes > PASSWORD_MAX_BYTES) throw new HttpError(400, 'bad_password', '비밀번호는 8자 이상, 72바이트 이하입니다.');

  // 인증하지 않은 채 오래된 가입은 자리를 풀어 줍니다
  await env.DB.prepare('DELETE FROM auth_users WHERE email_verified_at IS NULL AND created_at < ? AND (username = ? OR email = ?)')
    .bind(now - AUTH_LIMITS.unverifiedMs, username, email)
    .run();
  const taken = await env.DB.prepare('SELECT username, email FROM auth_users WHERE username = ? OR email = ?').bind(username, email).first<{ username: string; email: string }>();
  if (taken) {
    if (taken.username.toLowerCase() === username.toLowerCase()) throw new HttpError(409, 'username_taken', '이미 쓰는 아이디입니다.');
    throw new HttpError(409, 'email_taken', '이미 가입된 이메일입니다.');
  }

  const id = randomToken(16);
  const hash = await hashPassword(password, cost);
  const res = await env.DB.prepare('INSERT INTO auth_users (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING')
    .bind(id, username, email, hash, now)
    .run();
  if (res.meta.changes !== 1) throw new HttpError(409, 'username_taken', '이미 쓰는 아이디입니다.');
  let recoveryCodes: string[];
  try {
    recoveryCodes = await newRecoveryCodes(env, id);
    await sendVerification(env, { id, username, email }, now);
  } catch (e) {
    await env.DB.prepare('DELETE FROM auth_email_codes WHERE user_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM auth_users WHERE id = ?').bind(id).run();
    if (e instanceof HttpError) throw e;
    console.error('auth: verification email failed', (e as { code?: string }).code, e);
    throw new HttpError(502, 'email_failed', '인증 메일을 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
  }
  return json({ ok: true, recoveryCodes }, 201);
}

async function verifyEmail(req: Request, env: AuthEnv, now: number) {
  await rateLimit(env, `verify-ip:${clientIp(req)}`, RATE.verifyIp, now);
  const body = await readJson(req);
  const email = str(body, 'email').trim().toLowerCase();
  const code = str(body, 'code').trim();
  const bad = new HttpError(400, 'invalid_code', '인증 코드가 맞지 않거나 시간이 지났습니다.');
  const row = await env.DB.prepare(
    `SELECT c.user_id, c.code_hash, c.expires_at, c.attempts FROM auth_email_codes c JOIN auth_users u ON u.id = c.user_id
     WHERE u.email = ? AND u.email_verified_at IS NULL`,
  )
    .bind(email)
    .first<{ user_id: string; code_hash: string; expires_at: number; attempts: number }>();
  if (!row || row.expires_at <= now || row.attempts >= AUTH_LIMITS.codeAttempts) throw bad;
  // 시도 횟수를 먼저 올려 동시에 여러 번 넣어도 상한을 넘지 못하게 합니다
  const counted = await env.DB.prepare('UPDATE auth_email_codes SET attempts = attempts + 1 WHERE user_id = ? AND attempts < ?').bind(row.user_id, AUTH_LIMITS.codeAttempts).run();
  if (counted.meta.changes !== 1 || (await sha256Hex(code)) !== row.code_hash) throw bad;
  await env.DB.prepare('UPDATE auth_users SET email_verified_at = ? WHERE id = ? AND email_verified_at IS NULL').bind(now, row.user_id).run();
  await env.DB.prepare('DELETE FROM auth_email_codes WHERE user_id = ?').bind(row.user_id).run();
  return json({ ok: true });
}

// 계정이 있는지 알려 주지 않도록 결과와 무관하게 { ok: true }
async function resendVerification(req: Request, env: AuthEnv, now: number) {
  await rateLimit(env, `resend-ip:${clientIp(req)}`, RATE.resendIp, now);
  const email = str(await readJson(req), 'email').trim().toLowerCase();
  await rateLimit(env, `resend-email:${email}`, RATE.resendEmail, now);
  const user = await env.DB.prepare('SELECT id, username, email FROM auth_users WHERE email = ? AND email_verified_at IS NULL AND created_at >= ?')
    .bind(email, now - AUTH_LIMITS.unverifiedMs)
    .first<{ id: string; username: string; email: string }>();
  if (user) {
    try {
      await sendVerification(env, user, now);
    } catch (e) {
      if (e instanceof HttpError) throw e;
      console.error('auth: verification email failed', (e as { code?: string }).code, e);
      throw new HttpError(502, 'email_failed', '인증 메일을 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
    }
  }
  return json({ ok: true });
}

// ── 로그인 ──
async function login(req: Request, env: AuthEnv, now: number) {
  await rateLimit(env, `login-ip:${clientIp(req)}`, RATE.loginIp, now);
  const body = await readJson(req);
  const username = str(body, 'username').trim();
  const password = str(body, 'password');
  await rateLimit(env, `login-user:${username.toLowerCase()}`, RATE.loginUser, now);
  const user = await env.DB.prepare(`SELECT ${USER_COLS} FROM auth_users u WHERE u.username = ?`).bind(username).first<UserRow>();
  const okPassword = new TextEncoder().encode(password).byteLength <= PASSWORD_MAX_BYTES && (await checkPassword(password, user?.password_hash ?? DUMMY_HASH));
  if (!user || !okPassword) throw new HttpError(401, 'invalid_credentials', '아이디 또는 비밀번호가 맞지 않습니다.');
  if (user.email_verified_at === null) throw new HttpError(403, 'email_not_verified', '이메일 인증을 먼저 마쳐 주세요.');
  if (user.totp_secret) {
    const ticket = randomToken(32);
    await env.DB.prepare('INSERT INTO auth_login_tickets (ticket_hash, user_id, expires_at, attempts) VALUES (?, ?, ?, 0)')
      .bind(await sha256Hex(ticket), user.id, now + AUTH_LIMITS.ticketMs)
      .run();
    return json({ needTotp: true, ticket });
  }
  return startSession(req, env, user, now);
}

// 2단계 티켓을 한 번 시도로 셉니다. 횟수를 넘겼거나 시간이 지난 티켓은 401
async function useTicket(env: AuthEnv, ticket: string, now: number): Promise<{ user: UserRow; ticketHash: string }> {
  const bad = new HttpError(401, 'invalid_ticket', '로그인을 처음부터 다시 해 주세요.');
  if (!/^[0-9a-f]{64}$/.test(ticket)) throw bad;
  const ticketHash = await sha256Hex(ticket);
  const counted = await env.DB.prepare('UPDATE auth_login_tickets SET attempts = attempts + 1 WHERE ticket_hash = ? AND expires_at > ? AND attempts < ?')
    .bind(ticketHash, now, AUTH_LIMITS.codeAttempts)
    .run();
  if (counted.meta.changes !== 1) throw bad;
  const user = await env.DB.prepare(`SELECT ${USER_COLS} FROM auth_login_tickets t JOIN auth_users u ON u.id = t.user_id WHERE t.ticket_hash = ?`).bind(ticketHash).first<UserRow>();
  if (!user || !user.totp_secret) throw bad;
  return { user, ticketHash };
}

// 맞는 TOTP이고 이전에 쓴 시간 칸보다 뒤일 때만 받아들입니다(같은 코드 재사용 막기)
async function acceptTotp(env: AuthEnv, user: UserRow, secret: string, code: string, now: number): Promise<boolean> {
  const step = await matchTotp(await openTotp(secret, env.AUTH_ENCRYPTION_KEY, user.id), code.trim(), now);
  if (step === null) return false;
  const res = await env.DB.prepare('UPDATE auth_users SET totp_last_step = ? WHERE id = ? AND (totp_last_step IS NULL OR totp_last_step < ?)').bind(step, user.id, step).run();
  return res.meta.changes === 1;
}

async function loginSecondFactor(req: Request, env: AuthEnv, now: number, kind: 'totp' | 'recovery') {
  await rateLimit(env, `second-ip:${clientIp(req)}`, RATE.secondFactorIp, now);
  const body = await readJson(req);
  const { user, ticketHash } = await useTicket(env, str(body, 'ticket'), now);
  const code = str(body, 'code');
  let ok: boolean;
  if (kind === 'totp') ok = await acceptTotp(env, user, user.totp_secret!, code, now);
  else {
    const res = await env.DB.prepare('UPDATE auth_recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL')
      .bind(now, user.id, await sha256Hex(normalizeRecovery(code)))
      .run();
    ok = res.meta.changes === 1;
  }
  if (!ok) throw new HttpError(401, 'invalid_code', kind === 'totp' ? '인증 코드가 맞지 않습니다.' : '복구 코드가 맞지 않거나 이미 쓴 코드입니다.');
  await env.DB.prepare('DELETE FROM auth_login_tickets WHERE ticket_hash = ?').bind(ticketHash).run();
  return startSession(req, env, user, now);
}

async function logout(req: Request, env: AuthEnv) {
  const t = sessionToken(req);
  if (t) await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(await sha256Hex(t.token)).run();
  return json({ ok: true }, 200, { 'set-cookie': cookieHeader('', 0) });
}

// 코드 사용·비밀번호 변경·세션 무효화를 D1의 같은 트랜잭션으로 처리합니다.
async function resetRecovery(req: Request, env: AuthEnv, now: number, cost: number) {
  await rateLimit(env, `recovery-ip:${clientIp(req)}`, RATE.recoveryIp, now);
  const body = await readJson(req);
  const username = str(body, 'username').trim().toLowerCase();
  await rateLimit(env, `recovery-user:${username}`, RATE.recoveryUser, now);
  const codeHash = await sha256Hex(normalizeRecovery(str(body, 'code')));
  const password = str(body, 'password');
  if (password.length < 8 || new TextEncoder().encode(password).byteLength > PASSWORD_MAX_BYTES) {
    throw new HttpError(400, 'bad_password', '비밀번호는 8자 이상, 72바이트 이하입니다.');
  }
  const user = await env.DB.prepare('SELECT id FROM auth_users WHERE username = ? AND email_verified_at IS NOT NULL')
    .bind(username).first<{ id: string }>();
  const bad = new HttpError(401, 'invalid_code', '아이디 또는 복구 코드가 맞지 않습니다.');
  if (!user) throw bad;
  const available = 'EXISTS (SELECT 1 FROM auth_recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL)';
  const hashed = await hashPassword(password, cost);
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE auth_users SET password_hash = ?, totp_secret = NULL, totp_pending = NULL, totp_last_step = NULL WHERE id = ? AND ${available}`)
      .bind(hashed, user.id, user.id, codeHash),
    env.DB.prepare(`DELETE FROM auth_sessions WHERE user_id = ? AND ${available}`).bind(user.id, user.id, codeHash),
    env.DB.prepare(`DELETE FROM auth_login_tickets WHERE user_id = ? AND ${available}`).bind(user.id, user.id, codeHash),
    env.DB.prepare('UPDATE auth_recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL')
      .bind(now, user.id, codeHash),
  ]);
  if (results[0]?.meta.changes !== 1) throw bad;
  return json({ ok: true }, 200, { 'set-cookie': cookieHeader('', 0) });
}

// ── 2단계 인증 관리 ──
async function newRecoveryCodes(env: AuthEnv, userId: string): Promise<string[]> {
  const codes = Array.from({ length: AUTH_LIMITS.recoveryCodes }, newRecoveryCode);
  const inserts = await Promise.all(codes.map(async c =>
    env.DB.prepare('INSERT INTO auth_recovery_codes (user_id, code_hash) VALUES (?, ?)').bind(userId, await sha256Hex(normalizeRecovery(c))),
  ));
  await env.DB.batch([env.DB.prepare('DELETE FROM auth_recovery_codes WHERE user_id = ?').bind(userId), ...inserts]);
  return codes;
}

async function totpSetup(env: AuthEnv, user: UserRow) {
  if (user.totp_secret) throw new HttpError(409, 'totp_enabled', '2단계 인증이 이미 켜져 있습니다.');
  const secret = newTotpSecret();
  await env.DB.prepare('UPDATE auth_users SET totp_pending = ? WHERE id = ?').bind(await sealTotp(secret, env.AUTH_ENCRYPTION_KEY, user.id), user.id).run();
  const label = encodeURIComponent(`페이퍼컴퍼니:${user.username}`);
  const issuer = encodeURIComponent('페이퍼컴퍼니');
  return json({ secret, otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30` });
}

async function totpEnable(req: Request, env: AuthEnv, user: UserRow, now: number) {
  const code = str(await readJson(req), 'code');
  if (user.totp_secret) throw new HttpError(409, 'totp_enabled', '2단계 인증이 이미 켜져 있습니다.');
  if (!user.totp_pending) throw new HttpError(409, 'totp_not_setup', '2단계 인증 설정을 먼저 시작해 주세요.');
  if (!(await acceptTotp(env, user, user.totp_pending, code, now))) throw new HttpError(400, 'invalid_code', '인증 코드가 맞지 않습니다.');
  const res = await env.DB.prepare('UPDATE auth_users SET totp_secret = totp_pending, totp_pending = NULL WHERE id = ? AND totp_pending = ? AND totp_secret IS NULL')
    .bind(user.id, user.totp_pending)
    .run();
  if (res.meta.changes !== 1) throw new HttpError(409, 'conflict', '다른 곳에서 설정이 바뀌었습니다. 다시 시도해 주세요.');
  return json({ recoveryCodes: await newRecoveryCodes(env, user.id) });
}

async function requireTotpCode(req: Request, env: AuthEnv, user: UserRow, now: number) {
  const code = str(await readJson(req), 'code');
  if (!user.totp_secret) throw new HttpError(409, 'totp_disabled', '2단계 인증이 꺼져 있습니다.');
  if (!(await acceptTotp(env, user, user.totp_secret, code, now))) throw new HttpError(400, 'invalid_code', '인증 코드가 맞지 않습니다.');
}

async function totpDisable(req: Request, env: AuthEnv, user: UserRow, now: number) {
  await requireTotpCode(req, env, user, now);
  await env.DB.prepare('UPDATE auth_users SET totp_secret = NULL, totp_pending = NULL WHERE id = ?').bind(user.id).run();
  await env.DB.prepare('DELETE FROM auth_login_tickets WHERE user_id = ?').bind(user.id).run();
  return json({ ok: true });
}

async function regenerateRecovery(req: Request, env: AuthEnv, user: UserRow, now: number) {
  if (user.totp_secret) await requireTotpCode(req, env, user, now);
  else {
    const password = str(await readJson(req), 'password');
    if (new TextEncoder().encode(password).byteLength > PASSWORD_MAX_BYTES || !(await checkPassword(password, user.password_hash))) {
      throw new HttpError(401, 'invalid_credentials', '비밀번호가 맞지 않습니다.');
    }
  }
  return json({ recoveryCodes: await newRecoveryCodes(env, user.id) });
}

// ── 라우터 ──
export function isAuthPath(pathname: string): boolean {
  return pathname === AUTH_PREFIX || pathname.startsWith(AUTH_PREFIX + '/');
}

export async function handleAuth(req: Request, env: AuthEnv, opts: AuthOptions = {}): Promise<Response> {
  const now = (opts.now ?? Date.now)();
  const cost = opts.bcryptCost ?? AUTH_LIMITS.bcryptCost;
  const path = new URL(req.url).pathname.slice(AUTH_PREFIX.length);
  const route = `${req.method} ${path}`;
  try {
    checkOrigin(req, env, sessionToken(req)?.viaCookie ?? false);
    switch (route) {
      case 'POST /register':
        return await register(req, env, now, cost);
      case 'POST /verify-email':
        return await verifyEmail(req, env, now);
      case 'POST /verify-email/resend':
        return await resendVerification(req, env, now);
      case 'POST /login':
        return await login(req, env, now);
      case 'POST /login/totp':
        return await loginSecondFactor(req, env, now, 'totp');
      case 'POST /login/recovery':
        return await loginSecondFactor(req, env, now, 'recovery');
      case 'POST /recovery/reset':
        return await resetRecovery(req, env, now, cost);
      case 'POST /logout':
        return await logout(req, env);
      case 'GET /me': {
        const { user } = await requireSession(req, env, now);
        return json(account(user));
      }
    }
    const manage: Record<string, (user: UserRow) => Promise<Response>> = {
      'POST /totp/setup': (u) => totpSetup(env, u),
      'POST /totp/enable': (u) => totpEnable(req, env, u, now),
      'POST /totp/disable': (u) => totpDisable(req, env, u, now),
      'POST /recovery/regenerate': (u) => regenerateRecovery(req, env, u, now),
    };
    const fn = manage[route];
    if (!fn) throw new HttpError(404, 'not_found', '없는 주소입니다.');
    const { user } = await requireSession(req, env, now);
    await rateLimit(env, `totp-user:${user.id}`, RATE.totpUser, now);
    return await fn(user);
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e);
    console.error('auth: unhandled', e);
    return json({ error: 'internal', message: '서버 오류가 났습니다.' }, 500);
  }
}

// cron에서 부릅니다. 끝난 세션·티켓·코드, 인증 없이 오래된 가입, 지난 요청 수 기록을 지웁니다.
export async function sweepAuth(env: AuthEnv, now: number) {
  await env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').bind(now).run();
  await env.DB.prepare('DELETE FROM auth_login_tickets WHERE expires_at <= ?').bind(now).run();
  await env.DB.prepare('DELETE FROM auth_email_codes WHERE expires_at <= ?').bind(now).run();
  await env.DB.prepare('DELETE FROM auth_users WHERE email_verified_at IS NULL AND created_at < ?').bind(now - AUTH_LIMITS.unverifiedMs).run();
  await env.DB.prepare('DELETE FROM auth_rate_limits WHERE window_start < ?').bind(now - 86400_000).run();
}
