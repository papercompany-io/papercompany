// 온라인 계정·클라우드 저장 클라이언트(A-247). 서버로 가는 호출은 모두 이 파일에만 둡니다.
// 서버 계약이 확정되면 이 파일만 맞추면 됩니다.
//
// 엔드포인트(모두 JSON, 실패 시 4xx/5xx + { error: string, message: string }, 요청 초과는 429 + Retry-After)
//   POST   /auth/register         { username, email, password }        -> 201 { ok: true, recoveryCodes: string[] }  (인증 메일 발송, 코드는 이때 한 번만)
//   POST   /auth/verify-email     { email, code }                      -> { ok: true }
//   POST   /auth/verify-email/resend { email }                         -> { ok: true }
//   POST   /auth/recovery/reset   { username, code, password }         -> { ok: true }  (기존 세션·TOTP 해제)
//   POST   /auth/login            { username, password }               -> Session | { needTotp: true, ticket }
//   POST   /auth/login/totp       { ticket, code }                     -> Session
//   POST   /auth/login/recovery   { ticket, code }                     -> Session
//   POST   /auth/logout           {}                                   -> { ok: true }
//   GET    /auth/me                                                    -> Account (로그아웃이면 401)
//   POST   /auth/totp/setup       {}                                   -> { secret, otpauthUri }
//   POST   /auth/totp/enable      { code }                             -> { recoveryCodes: string[] }
//   POST   /auth/totp/disable     { code }                             -> { ok: true }
//   POST   /auth/recovery/regenerate { code }(TOTP 켜짐) 또는 { password }(꺼짐) -> { recoveryCodes: string[] }  (이전 묶음 무효)
//   GET    /mp/saves                                                   -> { saves: CloudSaveMeta[] }
//   GET    /mp/saves/:slot                                             -> CloudSaveMeta & { data: string }  (저장 JSON 문자열)
//   PUT    /mp/saves/:slot        { data: string, baseRevision: number|null } -> CloudSaveMeta  (새 칸은 null, 다르면 409 'conflict' + current)
//   DELETE /mp/saves/:slot?revision=N                                  -> 204  (다르면 409)
// server/auth/index.ts·server/multiplayer.ts의 계약입니다. 실패는 { error: 코드, message: 문구 }입니다.
// 인증: 웹(같은 출처)은 HttpOnly 쿠키. Electron은 Session.token을 main 프로세스 safeStorage에 맡기고 Bearer로 보냅니다.
// 보안: 서버 주소는 https만(개발용 localhost·127.0.0.1은 http 허용). 토큰은 받은 서버 출처에만 보냅니다.
import { isElectron } from './save';

export interface Account { username: string; email: string; emailVerified: boolean; totpEnabled: boolean }
export interface Session { account: Account; token?: string }
export interface LoginNeedTotp { needTotp: true; ticket: string }
export type SaveSlot = 'main' | 'backup' | 'profile' | 'slot1' | 'slot2' | 'slot3';
export interface CloudSaveMeta { slot: SaveSlot; revision: number; size: number; updatedAt: number }
export interface WeeklyChallenge {
  readonly id: string;
  readonly seed: number;
  readonly rule: string | null;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly open: boolean;
}
export type BoardStatus = 'verified' | 'unverified';
export interface ChallengeRun {
  readonly rank: number;
  readonly founderName: string;
  readonly reportedScore: number;
  readonly companies: number;
  readonly endingId: string;
  readonly status: BoardStatus | 'rejected';
  readonly submittedAt: number;
  readonly mine: boolean;
}
// 최근 제출의 서버 검증 상태. score는 검증된 뒤에만 채워집니다
export interface RunSubmission {
  readonly runId: string;
  readonly status: 'pending' | 'verified' | 'rejected';
  readonly score: number | null;
  readonly rejectionCode: string | null;
  readonly submittedAt: number;
  readonly completedAt: number | null;
}
export interface ChallengeBoard {
  readonly challenge: WeeklyChallenge;
  readonly status: BoardStatus;
  readonly verifierAvailable: boolean;
  readonly entries: ChallengeRun[];
  readonly me: ChallengeRun | null;
}
export type MeResult = { state: 'in'; account: Account } | { state: 'out' } | { state: 'offline' } | { state: 'error'; message: string };
export class OnlineError extends Error {
  constructor(message: string, public code?: string, public status = 0) { super(message); }
}

const K_URL = 'pc-online-url';
const DEFAULT_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';
export const isElectronUrlEditable = () => isElectron();

// 온라인 모드(이 기기에서 지금 커리어를 클라우드와 자동으로 맞출지). 로그인 상태와는 별개 스위치입니다.
// 로그아웃하면 자동으로 꺼집니다(로컬 데이터는 남습니다).
const K_ONLINE_MODE = 'pc-online-mode';
export function isOnlineMode(): boolean {
  try {
    return localStorage.getItem(K_ONLINE_MODE) === '1';
  } catch {
    return false;
  }
}
export function setOnlineMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(K_ONLINE_MODE, '1');
    else localStorage.removeItem(K_ONLINE_MODE);
  } catch {
    /* 무시 */
  }
}

export function getServerUrl(): string {
  return localStorage.getItem(K_URL) ?? (isElectron() ? '' : DEFAULT_BASE);
}
// 틀린 주소면 이유 문구, 맞으면 null
export function checkServerUrl(url: string): string | null {
  if (url.startsWith('/')) return isElectron() ? '데스크톱판은 전체 주소(https://...)를 넣어 주세요.' : null;
  let u: URL;
  try { u = new URL(url); } catch { return '주소 형식이 맞지 않습니다.'; }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol === 'https:' || (u.protocol === 'http:' && local)) return null;
  return '보안을 위해 https 주소만 쓸 수 있습니다.';
}
export async function setServerUrl(url: string): Promise<string | null> {
  const clean = url.trim().replace(/\/+$/, '');
  const bad = checkServerUrl(clean);
  if (bad) return bad;
  if (clean !== getServerUrl()) await window.pcSave?.clearOnlineSession?.();
  localStorage.setItem(K_URL, clean);
  return null;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const base = getServerUrl();
  if (!base) throw new OnlineError('서버 주소가 없습니다.', 'no_server');
  const bad = checkServerUrl(base);
  if (bad) throw new OnlineError(bad, 'bad_server');
  if (isElectron()) {
    if (!window.pcSave?.onlineRequest) throw new OnlineError('온라인 연결을 사용할 수 없습니다.', 'offline');
    let result: { status: number; ok: boolean; body: unknown };
    try {
      result = await window.pcSave.onlineRequest({ base, path, method, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new OnlineError('서버에 연결하지 못했습니다.', 'offline');
    }
    const json = result.body as { error?: string; message?: string } | null;
    if (!result.ok) throw new OnlineError(json?.message ?? `요청에 실패했습니다(${result.status}).`, json?.error, result.status);
    return result.body as T;
  }
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(base + path, { method, headers, credentials: 'include', body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new OnlineError('서버에 연결하지 못했습니다.', 'offline');
  }
  // API가 없는 정적 서버(개발 서버의 SPA 대체 응답 등)는 200 + HTML을 줍니다. 서버 없음으로 봅니다.
  if (res.ok && res.status !== 204 && !(res.headers.get('content-type') ?? '').includes('application/json')) throw new OnlineError('서버에 연결하지 못했습니다.', 'offline');
  const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new OnlineError(json.message ?? `요청에 실패했습니다(${res.status}).`, json.error, res.status);
  return json as T;
}

export const online = {
  register: (username: string, email: string, password: string) => call<{ ok: true; recoveryCodes: string[] }>('POST', '/auth/register', { username, email, password }),
  verifyEmail: (email: string, code: string) => call<{ ok: true }>('POST', '/auth/verify-email', { email, code }),
  resendVerification: (email: string) => call<{ ok: true }>('POST', '/auth/verify-email/resend', { email }),
  resetRecovery: async (username: string, code: string, password: string) => {
    await call<{ ok: true }>('POST', '/auth/recovery/reset', { username, code, password });
    await window.pcSave?.clearOnlineSession?.();
  },
  login: async (username: string, password: string) => {
    const r = await call<Session | LoginNeedTotp>('POST', '/auth/login', { username, password });
    return r;
  },
  loginTotp: (ticket: string, code: string) => call<Session>('POST', '/auth/login/totp', { ticket, code }),
  loginRecovery: (ticket: string, code: string) => call<Session>('POST', '/auth/login/recovery', { ticket, code }),
  logout: async () => {
    try { await call('POST', '/auth/logout', {}); } finally { setOnlineMode(false); await window.pcSave?.clearOnlineSession?.(); }
  },
  me: async (): Promise<MeResult> => {
    if (!getServerUrl()) return { state: 'offline' };
    try {
      return { state: 'in', account: await call<Account>('GET', '/auth/me') };
    } catch (e) {
      const err = e as OnlineError;
      if (err.status === 401) return { state: 'out' };
      if (err.code === 'offline' || err.code === 'no_server') return { state: 'offline' };
      return { state: 'error', message: err.message };
    }
  },
  totpSetup: () => call<{ secret: string; otpauthUri: string }>('POST', '/auth/totp/setup', {}),
  totpEnable: (code: string) => call<{ recoveryCodes: string[] }>('POST', '/auth/totp/enable', { code }),
  totpDisable: (code: string) => call<{ ok: true }>('POST', '/auth/totp/disable', { code }),
  regenerateRecovery: (credential: { code: string } | { password: string }) => call<{ recoveryCodes: string[] }>('POST', '/auth/recovery/regenerate', credential),
  listSaves: async () => (await call<{ saves: CloudSaveMeta[] }>('GET', '/mp/saves')).saves,
  getSave: (slot: SaveSlot) => call<CloudSaveMeta & { data: string }>('GET', `/mp/saves/${slot}`),
  putSave: (slot: SaveSlot, data: string, baseRevision: number | null) => call<CloudSaveMeta>('PUT', `/mp/saves/${slot}`, { data, baseRevision }),
  deleteSave: (slot: SaveSlot, revision: number) => call<unknown>('DELETE', `/mp/saves/${slot}?revision=${revision}`),
  listChallenges: () => call<{ challenges: WeeklyChallenge[]; verifierAvailable: boolean }>('GET', '/mp/challenges'),
  getChallenge: (id = 'current') => call<{ challenge: WeeklyChallenge; verifierAvailable: boolean }>('GET', `/mp/challenges/${encodeURIComponent(id)}`),
  getLeaderboard: (id: string, status: BoardStatus, offset = 0) => call<ChallengeBoard>('GET', `/mp/challenges/${encodeURIComponent(id)}/leaderboard?status=${status}&limit=50&offset=${offset}`),
  getMyRun: (id: string) => call<{ run: ChallengeRun | null; submission: RunSubmission | null; verifierAvailable: boolean }>('GET', `/mp/challenges/${encodeURIComponent(id)}/runs/me`),
  // 명령 기록만 보냅니다. 점수는 서버가 다시 돌려 정하고, 검증 전까지 pending입니다
  submitRun: (id: string, replay: string) => call<{ runId: string; status: 'pending' }>('POST', `/mp/challenges/${encodeURIComponent(id)}/runs`, { replay }),
};
