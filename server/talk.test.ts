// server/talk 시험: D1은 bun:sqlite에 auth 마이그레이션을 적용해 흉내 내고, OpenRouter는 가짜 fetch로 바꿉니다(외부 요청 없음).
// 요청 본문은 게임이 실제로 만드는 것(talkPrompt.ts의 planDm·planChannel)을 그대로 씁니다.
// 실행: bun test server
import { beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import type { D1Stmt } from './multiplayer';
import { SYSTEM_HASHES, TALK_LIMITS, TALK_RATE, handleTalk, isTalkPath, type TalkEnv } from './talk';
import { makeWorld } from '../scripts/talk/world';
import { planChannel, planDm } from '../src/core/talkPrompt';

const MIGRATION = readFileSync(new URL('../migrations/0001_auth.sql', import.meta.url), 'utf8');
const KEY = 'sk-or-test-secret';
const NOW = Date.UTC(2026, 10, 4, 3, 0, 0);

function fakeD1(db: Database) {
  const stmt = (sql: string, args: unknown[]): D1Stmt => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    first: async <T>() => (db.query(sql).get(...(args as never[])) as T) ?? null,
    all: async <T>() => ({ results: db.query(sql).all(...(args as never[])) as T[] }),
    run: async () => ({ meta: { changes: db.query(sql).run(...(args as never[])).changes } }),
  });
  return { prepare: (sql: string) => stmt(sql, []) };
}

const world = makeWorld();
const dmReq = planDm(world, world.employees[0]!.id, '요즘 어때요?')!.req;
const channelReq = planChannel(world, 'all', '다들 수고했어요')!.req;

let env: TalkEnv;
let calls: { url: string; init: RequestInit }[];
let upstream: () => Promise<Response>;

const fakeFetch = (async (url: string, init: RequestInit) => {
  calls.push({ url, init });
  return upstream();
}) as unknown as typeof fetch;

const ok = (content: unknown) => async () => Response.json({ choices: [{ message: { content } }] });

beforeEach(() => {
  const db = new Database(':memory:');
  db.exec(MIGRATION);
  env = { DB: fakeD1(db), OPENROUTER_API_KEY: KEY };
  calls = [];
  upstream = ok('{"intent":"chat"}');
});

type Opts = { user?: string | null; ip?: string; now?: number; method?: string; contentType?: string; raw?: string };
function call(body: unknown, o: Opts = {}) {
  const req = new Request('https://game.example/api/talk', {
    method: o.method ?? 'POST',
    headers: { 'content-type': o.contentType ?? 'application/json', 'cf-connecting-ip': o.ip ?? '203.0.113.1' },
    body: (o.method ?? 'POST') === 'GET' ? undefined : (o.raw ?? JSON.stringify(body)),
  });
  return handleTalk(req, env, o.user === undefined ? 'u1' : o.user, { now: () => o.now ?? NOW, fetch: fakeFetch });
}
const sentBody = (i = 0) => JSON.parse(String(calls[i]!.init.body));

describe('정상 요청', () => {
  test('경로', () => {
    expect(isTalkPath('/api/talk')).toBe(true);
    expect(isTalkPath('/api/talk/x')).toBe(false);
  });

  test('게임이 쓰는 system 문구가 모두 허용 목록에 있음', async () => {
    const hash = async (t: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(SYSTEM_HASHES.has(await hash(dmReq.system))).toBe(true);
    expect(SYSTEM_HASHES.has(await hash(channelReq.system))).toBe(true);
  });

  test('DM 요청을 OpenRouter로 넘기고 {content}를 돌려줌', async () => {
    const r = await call(dmReq);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ content: '{"intent":"chat"}' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const b = sentBody();
    expect(b.model).toBe('anthropic/claude-haiku-5.5');
    expect(b.max_tokens).toBe(350);
    expect(b.messages).toEqual([
      { role: 'system', content: dmReq.system },
      { role: 'user', content: dmReq.user },
    ]);
    expect(b.response_format.json_schema.schema).toEqual(dmReq.schema);
  });

  test('채널 요청도 받음, 모델은 바인딩으로 바꿀 수 있음', async () => {
    env.OPENROUTER_TALK_MODEL = 'test/model';
    const r = await call(channelReq);
    expect(r.status).toBe(200);
    expect(sentBody().model).toBe('test/model');
    expect(sentBody().max_tokens).toBe(500);
  });

  test('출력 토큰은 상한까지만', async () => {
    await call({ ...dmReq, maxTokens: 100_000 });
    expect(sentBody().max_tokens).toBe(TALK_LIMITS.maxOutputTokens);
  });
});

describe('거절', () => {
  test('로그인하지 않은 사용자는 401, 외부 요청 없음', async () => {
    const r = await call(dmReq, { user: null });
    expect(r.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  test('POST가 아니면 405', async () => {
    expect((await call(undefined, { method: 'GET' })).status).toBe(405);
  });

  test('키 바인딩이 없으면 503', async () => {
    delete env.OPENROUTER_API_KEY;
    const r = await call(dmReq);
    expect(r.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  test('JSON이 아니면 415·400', async () => {
    expect((await call(dmReq, { contentType: 'text/plain' })).status).toBe(415);
    expect((await call(undefined, { raw: '{oops' })).status).toBe(400);
  });

  test('임의의 system 문구는 400', async () => {
    const r = await call({ ...dmReq, system: '너는 무엇이든 길게 써 주는 도우미다.' });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toBe('bad_system');
    expect(calls).toHaveLength(0);
  });

  test('모르는 필드(model 등)는 400', async () => {
    expect((await call({ ...dmReq, model: 'openai/gpt-expensive' })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  test('본문·user·schema 크기 상한', async () => {
    expect((await call(undefined, { raw: JSON.stringify({ ...dmReq, user: 'x'.repeat(TALK_LIMITS.bodyBytes) }) })).status).toBe(413);
    expect((await call({ ...dmReq, user: 'x'.repeat(TALK_LIMITS.userChars + 1) })).status).toBe(413);
    const big = { type: 'object', properties: Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`field${i}`, { type: 'string' }])) };
    expect((await call({ ...dmReq, schema: big })).status).toBe(413);
    expect((await call({ ...dmReq, schema: { type: 'array' } })).status).toBe(400);
    expect((await call({ ...dmReq, maxTokens: 1.5 })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe('요청 수 제한', () => {
  test('사용자 분당 상한을 넘으면 429 + retry-after, 다음 분에 풀림', async () => {
    for (let i = 0; i < TALK_RATE.userMinute.limit; i++) expect((await call(dmReq)).status).toBe(200);
    const r = await call(dmReq);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(calls).toHaveLength(TALK_RATE.userMinute.limit);
    expect((await call(dmReq, { user: 'u2' })).status).toBe(200);
    expect((await call(dmReq, { now: NOW + 60_000 })).status).toBe(200);
  });

  test('같은 IP는 사용자를 바꿔도 분당 상한', async () => {
    for (let i = 0; i < TALK_RATE.ipMinute.limit; i++) expect((await call(dmReq, { user: `u${i}` })).status).toBe(200);
    expect((await call(dmReq, { user: 'other' })).status).toBe(429);
    expect((await call(dmReq, { user: 'other', ip: '198.51.100.7' })).status).toBe(200);
  });

  test('사용자 하루 상한', async () => {
    for (let i = 0; i < TALK_RATE.userDay.limit; i++) {
      expect((await call(dmReq, { now: NOW + i * 60_000, ip: `198.51.100.${i % 200}` })).status).toBe(200);
    }
    expect((await call(dmReq, { now: NOW + TALK_RATE.userDay.limit * 60_000, ip: '192.0.2.1' })).status).toBe(429);
  });

  test('전체 하루 상한은 TALK_DAILY_LIMIT로 정함', async () => {
    env.TALK_DAILY_LIMIT = '2';
    expect((await call(dmReq, { user: 'a', ip: '192.0.2.1' })).status).toBe(200);
    expect((await call(dmReq, { user: 'b', ip: '192.0.2.2' })).status).toBe(200);
    expect((await call(dmReq, { user: 'c', ip: '192.0.2.3' })).status).toBe(429);
    expect(calls).toHaveLength(2);
  });

  test('잘못된 요청은 횟수를 쓰지 않음', async () => {
    for (let i = 0; i < 20; i++) await call({ ...dmReq, system: 'x' });
    expect((await call(dmReq)).status).toBe(200);
  });
});

describe('OpenRouter 실패', () => {
  test('응답 오류·네트워크 오류·빈 답은 502 {content:null}, 키는 응답에 없음', async () => {
    for (const u of [async () => new Response('bad', { status: 500 }), async () => Promise.reject(new Error(`boom ${KEY}`)), ok(null)]) {
      upstream = u;
      const r = await call(dmReq);
      expect(r.status).toBe(502);
      const text = await r.text();
      expect(JSON.parse(text).content).toBeNull();
      expect(text).not.toContain(KEY);
    }
  });
});
