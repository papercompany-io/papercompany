// 멀티플레이 API(비동기 경쟁): 클라우드 저장, 같은 시드 주간 도전, 도전 기록 게시판.
// 인증은 Worker 진입점이 맡습니다. 여기서는 확인된 사용자 id(또는 null)만 받습니다.
// 제출은 명령 기록만 대기열에 남깁니다. 기존 cron의 verifyPendingRuns가 전체 커리어를 다시 돌린 뒤
// 서버 점수로만 공식 순위를 갱신합니다. 클라이언트의 최종 상태·점수는 순위에 쓰지 않습니다.
import careerData from '../src/data/career.json';
import { replayCareer } from '../src/core/replay';

// ── 바인딩(필요한 메서드만 적은 구조 타입. Cloudflare의 D1Database·R2Bucket이 그대로 들어맞습니다) ──
export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface D1Like {
  prepare(sql: string): D1Stmt;
  batch(statements: D1Stmt[]): Promise<{ meta: { changes: number } }[]>;
}
export interface R2Like {
  put(key: string, value: string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  delete(keys: string | string[]): Promise<void>;
}
export interface MultiplayerEnv {
  DB: D1Like;
  SAVES: R2Like;
}
export interface MultiplayerOptions {
  now?: () => number; // 시험용 시계(밀리초)
}

export const MP_PREFIX = '/api/mp';
export const SAVE_SLOTS = ['main', 'backup', 'profile', 'slot1', 'slot2', 'slot3'] as const;
export type SaveSlot = (typeof SAVE_SLOTS)[number];
export const LIMITS = {
  saveBytes: 4 * 1024 * 1024, // 측정: 8년 판 약 535KB. 긴 커리어 여유를 두고 4MiB
  runStateBytes: 4 * 1024 * 1024,
  replayBytes: 2 * 1024 * 1024,
  replayCommands: 50_000,
  submissionsPerChallenge: 10,
  pendingSubmissions: 100,
  replayBatch: 3,
  replayAttempts: 3,
  requestBytes: 7 * 1024 * 1024, // 본문 JSON(따옴표 이스케이프 포함) 상한
  founderName: 20,
  boardPage: 100,
} as const;
const KST_MS = 9 * 3600_000;
const WEEK_MS = 7 * 86400_000;
const CHALLENGE_RULES: (string | null)[] = [null, ...careerData.challenges.map((c) => c.id)];

export function isMultiplayerPath(pathname: string): boolean {
  return pathname === MP_PREFIX || pathname.startsWith(MP_PREFIX + '/');
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

const bytes = (s: string) => new TextEncoder().encode(s).byteLength;

async function readJson(req: Request): Promise<Record<string, unknown>> {
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'Content-Type은 application/json이어야 합니다.');
  }
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > LIMITS.requestBytes) throw new HttpError(413, 'too_large', '요청 본문이 너무 큽니다.');
  if (!req.body) throw new HttpError(400, 'bad_request', '요청 본문이 없습니다.');
  // content-length가 없거나 틀릴 수 있으므로 읽으면서도 상한을 지킵니다
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > LIMITS.requestBytes) {
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

function requireUser(userId: string | null): string {
  if (!userId) throw new HttpError(401, 'unauthorized', '로그인이 필요합니다.');
  return userId;
}

function parseObject(text: string, what: string): Record<string, unknown> {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw new HttpError(422, 'invalid_data', `${what}가 올바른 JSON이 아닙니다.`);
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(422, 'invalid_data', `${what}는 객체여야 합니다.`);
  return v as Record<string, unknown>;
}

function randomId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

// ── 클라우드 저장 ──
interface SaveRow {
  slot: string;
  revision: number;
  size: number;
  r2_key: string;
  updated_at: number;
}
const saveMeta = (r: SaveRow) => ({ slot: r.slot, revision: r.revision, size: r.size, updatedAt: r.updated_at });

function slotOf(raw: string): SaveSlot {
  if (!(SAVE_SLOTS as readonly string[]).includes(raw)) throw new HttpError(404, 'unknown_slot', '없는 저장 칸입니다.');
  return raw as SaveSlot;
}

// 저장 본문은 게임이 읽을 수 있는 모양인지만 가볍게 봅니다(프로필 v1, 게임 상태 v2).
function checkSaveData(slot: SaveSlot, data: string) {
  const o = parseObject(data, '저장 데이터');
  const want = slot === 'profile' ? 1 : 2;
  if (o.version !== want) throw new HttpError(422, 'invalid_data', `저장 데이터 version은 ${want}이어야 합니다.`);
}

async function getSaveRow(env: MultiplayerEnv, userId: string, slot: string) {
  return env.DB.prepare('SELECT slot, revision, size, r2_key, updated_at FROM mp_saves WHERE user_id = ? AND slot = ?').bind(userId, slot).first<SaveRow>();
}

// R2 객체는 요청 안에서 바로 지우지 않습니다(A-248). 지울 후보를 mp_blob_gc에 먼저 적고, sweepBlobs가
// 유예 시간이 지난 뒤 D1 어디에서도 가리키지 않는 것만 지웁니다. 그래서
// - 읽기가 옛 키를 받은 직후 다른 요청이 새 판을 써도 옛 본문은 유예 시간 동안 남아 읽힙니다.
// - R2에 쓴 뒤 D1 쓰기가 실패하거나 Worker가 멈춰도 새 키는 이미 후보라 나중에 치워집니다.
// - 후보에 적혔어도 D1이 아직 가리키면 지우지 않습니다(조건부 쓰기가 실패해 옛 판이 남은 경우).
export const BLOB_GRACE_MS = 60 * 60_000; // 요청 하나의 수명(최대 수 분)보다 훨씬 길게
export const REPLAY_LEASE_MS = 20 * 60_000; // cron의 최대 실행 시간(15분)보다 길게

async function markBlobs(env: MultiplayerEnv, keys: string[], now: number) {
  for (const key of keys) {
    await env.DB.prepare('INSERT INTO mp_blob_gc (r2_key, delete_after) VALUES (?, ?) ON CONFLICT (r2_key) DO UPDATE SET delete_after = MAX(delete_after, excluded.delete_after)')
      .bind(key, now + BLOB_GRACE_MS)
      .run();
  }
}

// Worker의 scheduled(cron) 처리기에서 부릅니다. 여러 개가 겹쳐 돌아도 같은 키를 두 번 지울 뿐 안전합니다.
export async function sweepBlobs(env: MultiplayerEnv, now: number, limit = 200): Promise<{ deleted: number; kept: number; failed: number }> {
  const { results } = await env.DB.prepare('SELECT r2_key FROM mp_blob_gc WHERE delete_after <= ? ORDER BY delete_after LIMIT ?').bind(now, limit).all<{ r2_key: string }>();
  let deleted = 0;
  let kept = 0;
  let failed = 0;
  for (const { r2_key: key } of results) {
    const used = await env.DB.prepare(
      `SELECT 1 AS used FROM mp_saves WHERE r2_key = ?1
       UNION ALL SELECT 1 FROM mp_runs WHERE state_key || '/state.json' = ?1 OR state_key || '/replay' = ?1
       UNION ALL SELECT 1 FROM mp_run_submissions WHERE replay_key = ?1 AND status = 'pending'
       LIMIT 1`,
    )
      .bind(key)
      .first();
    if (!used) {
      try {
        await env.SAVES.delete(key);
      } catch (e) {
        console.error('mp: R2 delete failed, will retry', key, e);
        failed++;
        continue;
      }
      deleted++;
    } else kept++;
    await env.DB.prepare('DELETE FROM mp_blob_gc WHERE r2_key = ? AND delete_after <= ?').bind(key, now).run();
  }
  return { deleted, kept, failed };
}

async function listSaves(env: MultiplayerEnv, userId: string) {
  const { results } = await env.DB.prepare('SELECT slot, revision, size, r2_key, updated_at FROM mp_saves WHERE user_id = ? ORDER BY slot').bind(userId).all<SaveRow>();
  return json({ saves: results.map(saveMeta) });
}

async function readSave(env: MultiplayerEnv, userId: string, slot: SaveSlot) {
  const row = await getSaveRow(env, userId, slot);
  if (!row) throw new HttpError(404, 'not_found', '저장이 없습니다.');
  let obj = await env.SAVES.get(row.r2_key);
  let meta = row;
  if (!obj) {
    // 읽는 사이 새 판이 써졌거나 지워졌을 수 있어 지금 행을 한 번 더 읽습니다
    const latest = await getSaveRow(env, userId, slot);
    if (!latest) throw new HttpError(404, 'not_found', '저장이 없습니다.');
    if (latest.r2_key !== row.r2_key) obj = await env.SAVES.get(latest.r2_key);
    meta = latest;
  }
  if (!obj) throw new HttpError(500, 'storage_missing', '저장 본문을 찾지 못했습니다.');
  return json({ ...saveMeta(meta), data: await obj.text() });
}

function baseRevisionOf(body: Record<string, unknown>): number | null {
  const b = body.baseRevision;
  if (b === null) return null;
  if (typeof b === 'number' && Number.isInteger(b) && b >= 1) return b;
  throw new HttpError(400, 'bad_request', 'baseRevision은 1 이상의 정수 또는 null이어야 합니다.');
}

async function writeSave(env: MultiplayerEnv, userId: string, slot: SaveSlot, req: Request, now: number) {
  const body = await readJson(req);
  const base = baseRevisionOf(body);
  const data = body.data;
  if (typeof data !== 'string') throw new HttpError(400, 'bad_request', 'data는 문자열(저장 JSON)이어야 합니다.');
  const size = bytes(data);
  if (size > LIMITS.saveBytes) throw new HttpError(413, 'too_large', '저장 데이터가 너무 큽니다.', { limit: LIMITS.saveBytes });
  checkSaveData(slot, data);

  const cur = await getSaveRow(env, userId, slot);
  if ((cur?.revision ?? null) !== base) return json({ error: 'conflict', message: '다른 기기에서 먼저 저장했습니다.', current: cur ? saveMeta(cur) : null }, 409);

  const revision = (base ?? 0) + 1;
  // 판마다 새 키에 써서, 동시에 쓰는 두 요청이 서로의 본문을 덮지 않게 합니다
  const key = `saves/${encodeURIComponent(userId)}/${slot}/${revision}-${randomId()}.json`;
  await markBlobs(env, cur ? [key, cur.r2_key] : [key], now);
  await env.SAVES.put(key, data, { httpMetadata: { contentType: 'application/json' } });

  // D1 조건부 쓰기가 실제 충돌 판정입니다(읽은 뒤 다른 요청이 끼어든 경우)
  const res =
    base === null
      ? await env.DB.prepare('INSERT INTO mp_saves (user_id, slot, revision, size, r2_key, updated_at) VALUES (?, ?, 1, ?, ?, ?) ON CONFLICT (user_id, slot) DO NOTHING')
          .bind(userId, slot, size, key, now)
          .run()
      : await env.DB.prepare('UPDATE mp_saves SET revision = ?, size = ?, r2_key = ?, updated_at = ? WHERE user_id = ? AND slot = ? AND revision = ?')
          .bind(revision, size, key, now, userId, slot, base)
          .run();
  if (res.meta.changes !== 1) {
    const latest = await getSaveRow(env, userId, slot);
    return json({ error: 'conflict', message: '다른 기기에서 먼저 저장했습니다.', current: latest ? saveMeta(latest) : null }, 409);
  }
  return json({ slot, revision, size, updatedAt: now }, base === null ? 201 : 200);
}

async function removeSave(env: MultiplayerEnv, userId: string, slot: SaveSlot, url: URL, now: number) {
  const rev = Number(url.searchParams.get('revision'));
  if (!Number.isInteger(rev) || rev < 1) throw new HttpError(400, 'bad_request', 'revision 쿼리가 필요합니다.');
  const cur = await getSaveRow(env, userId, slot);
  if (!cur) throw new HttpError(404, 'not_found', '저장이 없습니다.');
  await markBlobs(env, [cur.r2_key], now);
  const res = await env.DB.prepare('DELETE FROM mp_saves WHERE user_id = ? AND slot = ? AND revision = ?').bind(userId, slot, rev).run();
  if (res.meta.changes !== 1) {
    const latest = await getSaveRow(env, userId, slot);
    return json({ error: 'conflict', message: '다른 기기에서 먼저 저장했습니다.', current: latest ? saveMeta(latest) : null }, 409);
  }
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}

// ── 주간 도전(같은 시드) ──
interface ChallengeRow {
  id: string;
  seed: number;
  rule: string | null;
  starts_at: number;
  ends_at: number;
}
const challengeOut = (c: ChallengeRow, now: number) => ({
  id: c.id,
  seed: c.seed,
  rule: c.rule,
  startsAt: c.starts_at,
  endsAt: c.ends_at,
  open: now >= c.starts_at && now < c.ends_at,
});

// 한국 시간 월요일 0시에 시작하는 ISO 주. id 예: 2026-W45
export function weekOf(now: number): { id: string; week: number; startsAt: number; endsAt: number } {
  const k = new Date(now + KST_MS);
  const dow = (k.getUTCDay() + 6) % 7; // 월=0
  const mondayK = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - dow);
  const thursday = new Date(mondayK + 3 * 86400_000);
  const isoYear = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(isoYear, 0, 1)) / WEEK_MS) + 1;
  const startsAt = mondayK - KST_MS;
  return { id: `${isoYear}-W${String(week).padStart(2, '0')}`, week, startsAt, endsAt: startsAt + WEEK_MS };
}

async function getChallenge(env: MultiplayerEnv, id: string) {
  return env.DB.prepare('SELECT id, seed, rule, starts_at, ends_at FROM mp_challenges WHERE id = ?').bind(id).first<ChallengeRow>();
}

// 이번 주 도전이 없으면 만듭니다. 시드는 무작위라 미리 알 수 없습니다(동시에 만들어도 먼저 들어간 하나만 남음)
async function ensureCurrent(env: MultiplayerEnv, now: number): Promise<ChallengeRow> {
  const w = weekOf(now);
  const have = await getChallenge(env, w.id);
  if (have) return have;
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1; // makeSeed()와 같은 0~2^31 범위
  const rule = CHALLENGE_RULES[w.week % CHALLENGE_RULES.length];
  await env.DB.prepare('INSERT INTO mp_challenges (id, seed, rule, starts_at, ends_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING')
    .bind(w.id, seed, rule, w.startsAt, w.endsAt)
    .run();
  const row = await getChallenge(env, w.id);
  if (!row) throw new HttpError(500, 'internal', '도전을 만들지 못했습니다.');
  return row;
}

async function challengeOr404(env: MultiplayerEnv, id: string, now: number) {
  if (id === weekOf(now).id) return ensureCurrent(env, now);
  const c = await getChallenge(env, id);
  if (!c) throw new HttpError(404, 'not_found', '없는 도전입니다.');
  return c;
}

async function listChallenges(env: MultiplayerEnv, now: number) {
  await ensureCurrent(env, now);
  const { results } = await env.DB.prepare('SELECT id, seed, rule, starts_at, ends_at FROM mp_challenges WHERE starts_at <= ? ORDER BY starts_at DESC LIMIT 12').bind(now).all<ChallengeRow>();
  return json({ challenges: results.map((c) => challengeOut(c, now)), verifierAvailable: true });
}

// ── 도전 기록 ──
interface RunRow {
  id: string;
  user_id: string;
  founder_name: string;
  score: number;
  companies: number;
  ending_id: string;
  status: string;
  state_key: string;
  submitted_at: number;
}

// 완전 재실행으로 얻은 서버 상태에서만 게시판용 값을 읽습니다. 제출 본문에는 사용하지 않습니다.
export function readRunState(state: Record<string, unknown>, c: ChallengeRow) {
  const bad = (m: string) => new HttpError(422, 'invalid_run', m);
  if (state.version !== 2) throw bad('게임 상태 version은 2여야 합니다.');
  if (state.seed !== c.seed) throw bad('도전과 시드가 다릅니다.');
  const career = state.career as Record<string, unknown> | undefined;
  if (!career || typeof career !== 'object') throw bad('커리어 정보가 없습니다.');
  if ((career.challenge ?? null) !== c.rule) throw bad('도전 규칙이 다릅니다.');
  if (career.retired !== true || typeof career.endingId !== 'string' || !career.endingId) throw bad('은퇴로 끝난 커리어만 올릴 수 있습니다.');
  const wealth = career.wealth;
  if (typeof wealth !== 'number' || !Number.isFinite(wealth) || Math.abs(wealth) > Number.MAX_SAFE_INTEGER) throw bad('자산 값이 올바르지 않습니다.');
  const companies = Array.isArray(career.companies) ? career.companies.length : 0;
  const rawName = typeof career.founderName === 'string' ? career.founderName : '';
  const founderName = Array.from(rawName.replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, LIMITS.founderName).join('') || '익명';
  return { reportedScore: Math.round(wealth), companies, endingId: career.endingId.slice(0, 64), founderName };
}

function readReplay(text: string, c: ChallengeRow) {
  const replay = parseObject(text, '명령 기록');
  if (Object.keys(replay).some((k) => !['version', 'seed', 'rule', 'setup', 'commands'].includes(k)) || replay.version !== 1) {
    throw new HttpError(422, 'invalid_replay', '명령 기록 version은 1이어야 하며 셋업과 명령만 담습니다.');
  }
  if (('seed' in replay && replay.seed !== c.seed) || ('rule' in replay && replay.rule !== c.rule)) {
    throw new HttpError(422, 'invalid_replay', '명령 기록의 시드나 규칙이 도전과 다릅니다.');
  }
  if (!replay.setup || typeof replay.setup !== 'object' || Array.isArray(replay.setup) || !Array.isArray(replay.commands)) {
    throw new HttpError(422, 'invalid_replay', '명령 기록에는 셋업 객체와 명령 배열이 필요합니다.');
  }
  if (replay.commands.length > LIMITS.replayCommands) throw new HttpError(413, 'too_large', '명령이 너무 많습니다.');
  // {c, n} 로그의 명령별 값·반복 횟수·전체 실행량은 replayCareer가 전부 검증합니다.
  return { seed: c.seed, rule: c.rule, setup: replay.setup, commands: replay.commands };
}

async function submitRun(env: MultiplayerEnv, userId: string, c: ChallengeRow, req: Request, now: number) {
  if (!(now >= c.starts_at && now < c.ends_at)) throw new HttpError(409, 'challenge_closed', '기록을 받는 기간이 아닙니다.');
  const body = await readJson(req);
  if (Object.keys(body).some((k) => k !== 'replay' && k !== 'state')) {
    throw new HttpError(400, 'bad_request', '명령 기록만 보냅니다. 점수와 사용자 정보는 서버가 정합니다.');
  }
  // 예전 클라이언트의 state는 크기만 제한하고 버립니다. 점수·이름·회사 수의 근거가 아닙니다.
  if (body.state !== undefined && typeof body.state !== 'string') throw new HttpError(400, 'bad_request', 'state는 문자열이어야 합니다.');
  if (typeof body.state === 'string' && bytes(body.state) > LIMITS.runStateBytes) throw new HttpError(413, 'too_large', '게임 상태가 너무 큽니다.', { limit: LIMITS.runStateBytes });
  if (typeof body.replay !== 'string') throw new HttpError(400, 'bad_request', 'replay는 셋업과 명령을 담은 JSON 문자열이어야 합니다.');
  if (bytes(body.replay) > LIMITS.replayBytes) throw new HttpError(413, 'too_large', '명령 기록이 너무 큽니다.', { limit: LIMITS.replayBytes });
  readReplay(body.replay, c);

  const room = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM mp_run_submissions WHERE challenge_id = ?1 AND user_id = ?2) AS attempts,
       (SELECT COUNT(*) FROM mp_run_submissions WHERE user_id = ?2 AND status = 'pending') AS pending,
       (SELECT COUNT(*) FROM mp_run_submissions WHERE status = 'pending') AS total`,
  ).bind(c.id, userId).first<{ attempts: number; pending: number; total: number }>();
  if (room && (room.attempts >= LIMITS.submissionsPerChallenge || room.pending > 0 || room.total >= LIMITS.pendingSubmissions)) {
    throw new HttpError(429, 'submission_limit', '검증 대기 중이거나 제출 한도에 도달했습니다.');
  }

  const runId = randomId();
  const key = `runs/${encodeURIComponent(c.id)}/${encodeURIComponent(userId)}/${runId}`;
  await markBlobs(env, [`${key}/replay`], now);
  await env.SAVES.put(`${key}/replay`, body.replay, { httpMetadata: { contentType: 'application/json' } });
  // 읽은 뒤 동시에 제출해도 한도와 사용자별 대기 1건을 같은 쓰기에서 지킵니다.
  const res = await env.DB.prepare(
    `INSERT INTO mp_run_submissions (id, challenge_id, user_id, replay_key, submitted_at)
     SELECT ?1, ?2, ?3, ?4, ?5
     WHERE (SELECT COUNT(*) FROM mp_run_submissions WHERE challenge_id = ?2 AND user_id = ?3) < ?6
       AND NOT EXISTS (SELECT 1 FROM mp_run_submissions WHERE user_id = ?3 AND status = 'pending')
       AND (SELECT COUNT(*) FROM mp_run_submissions WHERE status = 'pending') < ?7`,
  )
    .bind(runId, c.id, userId, `${key}/replay`, now, LIMITS.submissionsPerChallenge, LIMITS.pendingSubmissions)
    .run();
  if (res.meta.changes !== 1) throw new HttpError(429, 'submission_limit', '검증 대기 중이거나 제출 한도에 도달했습니다.');
  return json({ runId, status: 'pending' }, 202);
}

interface PendingRun extends ChallengeRow {
  readonly submission_id: string;
  readonly user_id: string;
  readonly replay_key: string;
  readonly submitted_at: number;
  readonly attempts: number;
}

// Worker의 기존 scheduled 처리기에서 sweepBlobs와 함께 부릅니다. 유료 Queue는 쓰지 않습니다.
// 중단되면 lease 만료 뒤 다시 시도하며, 오래 실행되다 돌아온 cron은 새 lease의 결과를 덮지 못합니다.
export async function verifyPendingRuns(env: MultiplayerEnv, now: number, limit = LIMITS.replayBatch) {
  const batchSize = Number.isSafeInteger(limit) ? Math.min(LIMITS.replayBatch, Math.max(0, limit)) : LIMITS.replayBatch;
  const { results } = await env.DB.prepare(
    `SELECT c.*, s.id AS submission_id, s.user_id, s.replay_key, s.submitted_at, s.attempts
     FROM mp_run_submissions s JOIN mp_challenges c ON c.id = s.challenge_id
     WHERE s.status = 'pending' AND s.lease_until <= ? ORDER BY s.submitted_at, s.id LIMIT ?`,
  ).bind(now, batchSize).all<PendingRun>();
  let verified = 0;
  let rejected = 0;
  let failed = 0;
  for (const row of results) {
    const leaseId = randomId();
    const claim = await env.DB.prepare(
      `UPDATE mp_run_submissions SET lease_id = ?, lease_until = ?, attempts = attempts + 1
       WHERE id = ? AND status = 'pending' AND lease_until <= ?`,
    ).bind(leaseId, now + REPLAY_LEASE_MS, row.submission_id, now).run();
    if (claim.meta.changes !== 1) continue;
    try {
      let rejection: string | null = row.attempts >= LIMITS.replayAttempts ? 'verification_failed' : null;
      let result: ReturnType<typeof replayCareer> | null = null;
      if (!rejection) {
        const object = await env.SAVES.get(row.replay_key);
        if (!object) {
          rejection = 'replay_missing';
        } else {
          const replay = await object.text();
          if (bytes(replay) > LIMITS.replayBytes) {
            rejection = 'replay_too_large';
          } else {
            try {
              result = replayCareer(readReplay(replay, row));
              // 코어가 끝까지 실행한 결과인지 서버 경계에서도 확인합니다. 부분 실행은 순위에 올리지 않습니다.
              readRunState({ version: result.state.version, seed: result.state.seed, career: result.state.career }, row);
              if (!Number.isSafeInteger(result.score) || result.score !== Math.round(result.state.career.wealth)) {
                rejection = 'invalid_score';
                result = null;
              }
            } catch (error) {
              if (!(error instanceof Error)) throw error;
              rejection = 'invalid_replay';
              result = null;
            }
          }
        }
      }
      await markBlobs(env, [row.replay_key], now);
      if (!result) {
        const done = await env.DB.prepare(
          `UPDATE mp_run_submissions SET status = 'rejected', rejection_code = ?, completed_at = ?, lease_id = NULL, lease_until = 0
           WHERE id = ? AND status = 'pending' AND lease_id = ?`,
        ).bind(rejection, now, row.submission_id, leaseId).run();
        rejected += done.meta.changes;
        continue;
      }
      const info = readRunState({ version: result.state.version, seed: result.state.seed, career: result.state.career }, row);
      const previous = await env.DB.prepare('SELECT state_key FROM mp_runs WHERE challenge_id = ? AND user_id = ?')
        .bind(row.id, row.user_id).first<{ state_key: string }>();
      if (previous) await markBlobs(env, [`${previous.state_key}/state.json`, `${previous.state_key}/replay`], now);
      const key = row.replay_key.slice(0, -'/replay'.length);
      // 최고 기록 갱신과 제출 완료를 한 트랜잭션으로 묶습니다. 두 쓰기 모두 현재 lease만 허용합니다.
      const published = await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO mp_runs (id, challenge_id, user_id, founder_name, score, companies, ending_id, status, state_key, submitted_at)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'verified', ?8, ?9
           WHERE EXISTS (SELECT 1 FROM mp_run_submissions WHERE id = ?1 AND status = 'pending' AND lease_id = ?10)
           ON CONFLICT (challenge_id, user_id) DO UPDATE SET
             id = excluded.id, founder_name = excluded.founder_name, score = excluded.score, companies = excluded.companies,
             ending_id = excluded.ending_id, status = 'verified', state_key = excluded.state_key, submitted_at = excluded.submitted_at
           WHERE mp_runs.status <> 'verified' OR excluded.score > mp_runs.score`,
        ).bind(row.submission_id, row.id, row.user_id, info.founderName, result.score, info.companies, info.endingId, key, row.submitted_at, leaseId),
        env.DB.prepare(
          `UPDATE mp_run_submissions SET status = 'verified', score = ?, completed_at = ?, lease_id = NULL, lease_until = 0
           WHERE id = ? AND status = 'pending' AND lease_id = ?`,
        ).bind(result.score, now, row.submission_id, leaseId),
      ]);
      verified += published[1].meta.changes;
    } catch (error) {
      // 저장소 장애는 잘못된 플레이로 확정하지 않습니다. 다음 cron이 lease 만료 뒤 다시 시도합니다.
      console.error('mp: replay verification failed, will retry', row.submission_id, error);
      failed++;
    }
  }
  return { verified, rejected, failed };
}

const runOut = (r: RunRow, rank: number, userId: string | null) => ({
  rank,
  founderName: r.founder_name,
  score: r.status === 'verified' ? r.score : null,
  reportedScore: r.score,
  companies: r.companies,
  endingId: r.ending_id,
  status: r.status,
  submittedAt: r.submitted_at,
  mine: userId !== null && r.user_id === userId,
});

async function rankOf(env: MultiplayerEnv, c: ChallengeRow, status: string, r: RunRow) {
  const above = await env.DB.prepare('SELECT COUNT(*) AS n FROM mp_runs WHERE challenge_id = ? AND status = ? AND (score > ? OR (score = ? AND (submitted_at < ? OR (submitted_at = ? AND id < ?))))')
    .bind(c.id, status, r.score, r.score, r.submitted_at, r.submitted_at, r.id)
    .first<{ n: number }>();
  return (above?.n ?? 0) + 1;
}

async function myRun(env: MultiplayerEnv, userId: string, c: ChallengeRow) {
  const r = await env.DB.prepare('SELECT * FROM mp_runs WHERE challenge_id = ? AND user_id = ?').bind(c.id, userId).first<RunRow>();
  const submission = await env.DB.prepare(
    `SELECT id AS runId, status, score, rejection_code AS rejectionCode, submitted_at AS submittedAt, completed_at AS completedAt
     FROM mp_run_submissions WHERE challenge_id = ? AND user_id = ? ORDER BY submitted_at DESC, id DESC LIMIT 1`,
  ).bind(c.id, userId).first();
  return json({ run: r ? runOut(r, await rankOf(env, c, r.status, r), userId) : null, submission, verifierAvailable: true });
}

async function leaderboard(env: MultiplayerEnv, userId: string | null, c: ChallengeRow, url: URL, now: number) {
  const status = url.searchParams.get('status') ?? 'verified';
  if (status !== 'verified' && status !== 'unverified') throw new HttpError(400, 'bad_request', 'status는 verified 또는 unverified입니다.');
  const limit = Math.min(LIMITS.boardPage, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
  const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  const { results } = await env.DB.prepare('SELECT * FROM mp_runs WHERE challenge_id = ? AND status = ? ORDER BY score DESC, submitted_at ASC, id ASC LIMIT ? OFFSET ?')
    .bind(c.id, status, limit, offset)
    .all<RunRow>();
  let me = null;
  if (userId) {
    const r = await env.DB.prepare('SELECT * FROM mp_runs WHERE challenge_id = ? AND user_id = ? AND status = ?').bind(c.id, userId, status).first<RunRow>();
    if (r) me = runOut(r, await rankOf(env, c, status, r), userId);
  }
  return json({
    challenge: challengeOut(c, now),
    status,
    verifierAvailable: true,
    entries: results.map((r, i) => runOut(r, offset + i + 1, userId)),
    me,
  });
}

// ── 라우터 ──
export async function handleMultiplayer(request: Request, env: MultiplayerEnv, userId: string | null, opts: MultiplayerOptions = {}): Promise<Response> {
  const now = (opts.now ?? Date.now)();
  const url = new URL(request.url);
  if (!isMultiplayerPath(url.pathname)) return json({ error: 'not_found', message: '없는 주소입니다.' }, 404);
  const m = request.method.toUpperCase();
  const methodNotAllowed = () => new HttpError(405, 'method_not_allowed', '지원하지 않는 방식입니다.');
  try {
    let parts: string[];
    try {
      parts = url.pathname.slice(MP_PREFIX.length).split('/').filter(Boolean).map(decodeURIComponent);
    } catch {
      throw new HttpError(400, 'bad_request', '주소 형식이 맞지 않습니다.');
    }
    if (parts[0] === 'saves') {
      const uid = requireUser(userId);
      if (parts.length === 1) {
        if (m !== 'GET') throw methodNotAllowed();
        return await listSaves(env, uid);
      }
      if (parts.length === 2) {
        const slot = slotOf(parts[1]);
        if (m === 'GET') return await readSave(env, uid, slot);
        if (m === 'PUT') return await writeSave(env, uid, slot, request, now);
        if (m === 'DELETE') return await removeSave(env, uid, slot, url, now);
        throw methodNotAllowed();
      }
    }
    if (parts[0] === 'challenges') {
      if (parts.length === 1) {
        if (m !== 'GET') throw methodNotAllowed();
        return await listChallenges(env, now);
      }
      const c = parts[1] === 'current' ? await ensureCurrent(env, now) : await challengeOr404(env, parts[1], now);
      if (parts.length === 2) {
        if (m !== 'GET') throw methodNotAllowed();
        return json({ challenge: challengeOut(c, now), verifierAvailable: true });
      }
      if (parts.length === 3 && parts[2] === 'runs') {
        if (m !== 'POST') throw methodNotAllowed();
        return await submitRun(env, requireUser(userId), c, request, now);
      }
      if (parts.length === 4 && parts[2] === 'runs' && parts[3] === 'me') {
        if (m !== 'GET') throw methodNotAllowed();
        return await myRun(env, requireUser(userId), c);
      }
      if (parts.length === 3 && parts[2] === 'leaderboard') {
        if (m !== 'GET') throw methodNotAllowed();
        return await leaderboard(env, userId, c, url, now);
      }
    }
    return json({ error: 'not_found', message: '없는 주소입니다.' }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.code, message: e.message, ...e.extra }, e.status);
    console.error('mp: unhandled', e);
    return json({ error: 'internal', message: '서버 오류입니다.' }, 500);
  }
}
