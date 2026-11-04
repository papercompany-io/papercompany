// 자유 입력 대화 API(A-199, Worker판). 웹 게임(src/ui/talkAi.ts)이 POST /api/talk로 {system, user, schema, maxTokens}를 보내면
// OpenRouter에 넘기고 {content}를 돌려줍니다. electron/openrouter.ts와 같은 호출이고, 모델·토큰 상한·공급자 선택은 서버가 정합니다.
//
// 바인딩(wrangler.jsonc / wrangler secret)
// - OPENROUTER_API_KEY: Worker secret. 이 파일만 읽고 응답·로그에 넣지 않습니다. 없으면 503.
// - OPENROUTER_TALK_MODEL: 선택 var. 없으면 TALK_MODEL.
// - TALK_DAILY_LIMIT: 선택 var. 서비스 전체 하루 호출 상한(기본 TALK_RATE.globalDay.limit). 비용 상한의 마지막 방어선입니다.
// - DB: D1. 요청 수는 auth 마이그레이션(0001_auth.sql)의 auth_rate_limits에 'talk-' 키로 셉니다. 하루 지난 줄은 sweepAuth가 지웁니다.
//
// 연결(server/worker.ts에서): 인증은 부르는 쪽이 맡습니다. authenticate가 쿠키 요청의 Origin을 확인한 뒤 사용자 id를 넘깁니다.
//   if (isTalkPath(pathname)) { const who = await authenticate(request, env); if (who instanceof Response) return who; return handleTalk(request, env, who.userId); }
//
// 비용 남용 막기
// - 로그인(이메일 인증까지 끝난) 사용자만. userId가 null이면 401.
// - 사용자별·IP별 분당·하루 상한과 전체 하루 상한(고정 창, 429 + retry-after).
// - system은 게임이 쓰는 문구(talkPrompt.ts의 DM·채널 두 가지)만 받습니다. SHA-256 허용 목록과 비교하므로
//   클라이언트가 임의의 긴 지시문을 넣을 수 없습니다. talkPrompt.ts의 문구를 바꾸면 talk.test.ts가 실패하니 SYSTEM_HASHES를 갱신하세요.
// - 본문·user·schema 크기 상한, 알 수 없는 필드 거절, 출력 토큰은 TALK_LIMITS.maxOutputTokens를 넘지 않습니다.
import { TALK_MODEL } from '../electron/openrouter';
import type { D1Like } from './multiplayer';

export const TALK_PATH = '/api/talk';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface TalkEnv {
  DB: D1Like;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_TALK_MODEL?: string;
  TALK_DAILY_LIMIT?: string;
}
export interface TalkOptions {
  now?: () => number; // 시험용 시계(밀리초)
  fetch?: typeof fetch; // 시험용(실제 외부 요청 없이)
}

// 게임이 실제로 보내는 크기: system 3.5~4.2천 자, user 1~3.6천 자, schema 1.3~1.6KB, 본문 12~18KB(직원 7명 기준)
export const TALK_LIMITS = {
  bodyBytes: 48 * 1024,
  userChars: 12000,
  schemaBytes: 8 * 1024,
  maxOutputTokens: 500, // talkPrompt: DM 350, 채널 500
  upstreamMs: 12000, // 게임 쪽도 12초 뒤 포기합니다(talkAi.ts TIMEOUT_MS)
} as const;

const MIN = 60_000;
const DAY = 86400_000;
export const TALK_RATE = {
  userMinute: { limit: 12, windowMs: MIN },
  userDay: { limit: 300, windowMs: DAY },
  ipMinute: { limit: 30, windowMs: MIN },
  ipDay: { limit: 1000, windowMs: DAY },
  globalDay: { limit: 5000, windowMs: DAY },
} as const;

// talkPrompt.ts의 SYSTEM(DM)과 SYSTEM + SYSTEM_CHANNEL(채널) SHA-256
export const SYSTEM_HASHES: ReadonlySet<string> = new Set([
  'b3103132092616c19f99a5934b69503868b80d11c28b7e36eeecf14b0bb6de67',
  '09eb2f84e1db94cde359405cf9f7f68ca1439f6b10ec4032c6104ef0ea0f0df4',
]);

export const isTalkPath = (pathname: string) => pathname === TALK_PATH;

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

const clientIp = (req: Request) => req.headers.get('cf-connecting-ip') ?? 'unknown';
const byteLength = (s: string) => new TextEncoder().encode(s).byteLength;

async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function readJson(req: Request): Promise<unknown> {
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'Content-Type은 application/json이어야 합니다.');
  }
  if (Number(req.headers.get('content-length') ?? '0') > TALK_LIMITS.bodyBytes) throw new HttpError(413, 'too_large', '요청 본문이 너무 큽니다.');
  if (!req.body) throw new HttpError(400, 'bad_request', '요청 본문이 없습니다.');
  // content-length가 없거나 틀릴 수 있으므로 읽으면서도 상한을 지킵니다
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > TALK_LIMITS.bodyBytes) {
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
  try {
    return JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new HttpError(400, 'bad_json', 'JSON 형식이 아닙니다.');
  }
}

interface TalkBody {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
}

const ALLOWED_KEYS = new Set(['system', 'user', 'schema', 'maxTokens']);

async function parseBody(raw: unknown): Promise<TalkBody> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'bad_request', '요청 형식이 잘못되었습니다.');
  const b = raw as Record<string, unknown>;
  for (const k of Object.keys(b)) if (!ALLOWED_KEYS.has(k)) throw new HttpError(400, 'bad_request', `알 수 없는 필드입니다: ${k}`);
  const { system, user, schema, maxTokens } = b;
  if (typeof system !== 'string' || !SYSTEM_HASHES.has(await sha256Hex(system))) throw new HttpError(400, 'bad_system', '허용되지 않은 system 문구입니다.');
  if (typeof user !== 'string' || !user.trim()) throw new HttpError(400, 'bad_request', 'user 값이 필요합니다.');
  if (user.length > TALK_LIMITS.userChars) throw new HttpError(413, 'too_large', 'user 값이 너무 깁니다.');
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) || (schema as Record<string, unknown>).type !== 'object') {
    throw new HttpError(400, 'bad_request', 'schema는 type이 object인 JSON 스키마여야 합니다.');
  }
  if (byteLength(JSON.stringify(schema)) > TALK_LIMITS.schemaBytes) throw new HttpError(413, 'too_large', 'schema가 너무 큽니다.');
  if (maxTokens !== undefined && (typeof maxTokens !== 'number' || !Number.isInteger(maxTokens) || maxTokens < 1)) {
    throw new HttpError(400, 'bad_request', 'maxTokens는 1 이상의 정수여야 합니다.');
  }
  return { system, user, schema: schema as Record<string, unknown>, maxTokens: Math.min(TALK_LIMITS.maxOutputTokens, (maxTokens as number | undefined) ?? 400) };
}

// 고정 창 요청 수 세기(auth/index.ts와 같은 방식, 같은 표)
async function rateLimit(env: TalkEnv, key: string, rule: { limit: number; windowMs: number }, now: number) {
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

function dailyLimit(env: TalkEnv): number {
  const n = Number(env.TALK_DAILY_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : TALK_RATE.globalDay.limit;
}

export async function handleTalk(request: Request, env: TalkEnv, userId: string | null, opts: TalkOptions = {}): Promise<Response> {
  const now = (opts.now ?? Date.now)();
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'POST만 받습니다.', { allow: 'POST' });
    if (!userId) throw new HttpError(401, 'unauthorized', '로그인이 필요합니다.');
    if (!env.OPENROUTER_API_KEY) throw new HttpError(503, 'not_configured', '대화 기능이 설정되지 않았습니다.');
    const body = await parseBody(await readJson(request));
    const ip = clientIp(request);
    await rateLimit(env, `talk-user-min:${userId}`, TALK_RATE.userMinute, now);
    await rateLimit(env, `talk-user-day:${userId}`, TALK_RATE.userDay, now);
    await rateLimit(env, `talk-ip-min:${ip}`, TALK_RATE.ipMinute, now);
    await rateLimit(env, `talk-ip-day:${ip}`, TALK_RATE.ipDay, now);
    await rateLimit(env, 'talk-global-day', { limit: dailyLimit(env), windowMs: DAY }, now);
    const content = await callOpenRouter(env, body, opts.fetch ?? fetch);
    if (content === null) return json({ content: null, error: 'upstream_failed' }, 502);
    return json({ content });
  } catch (e) {
    if (e instanceof HttpError) return json({ content: null, error: e.code, message: e.message }, e.status, e.headers);
    throw e;
  }
}

async function callOpenRouter(env: TalkEnv, body: TalkBody, doFetch: typeof fetch): Promise<string | null> {
  let r: Response;
  try {
    r = await doFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'PaperCompany' },
      signal: AbortSignal.timeout(TALK_LIMITS.upstreamMs),
      body: JSON.stringify({
        model: env.OPENROUTER_TALK_MODEL || TALK_MODEL,
        max_tokens: body.maxTokens,
        temperature: 0.7,
        // electron/openrouter.ts와 같음: 생각을 켜면 출력 한도를 생각에 다 써서 답이 빕니다
        reasoning: { effort: 'none' },
        provider: { sort: 'latency' },
        messages: [
          { role: 'system', content: body.system },
          { role: 'user', content: body.user },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'talk', strict: true, schema: body.schema } },
      }),
    });
  } catch (e) {
    console.error('talk: upstream request failed', e instanceof Error ? e.name : 'unknown');
    return null;
  }
  if (!r.ok) {
    console.error('talk: upstream status', r.status);
    return null;
  }
  const j = (await r.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null;
  const c = j?.choices?.[0]?.message?.content;
  return typeof c === 'string' ? c : null;
}
