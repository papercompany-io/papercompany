// server/multiplayer.ts 시험: D1은 bun:sqlite에 마이그레이션을 그대로 적용해 흉내 내고, R2는 Map으로 둡니다.
// 실행: bun test server
import { beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BLOB_GRACE_MS, handleMultiplayer, sweepBlobs, verifyPendingRuns, weekOf, type D1Like, type D1Stmt, type MultiplayerEnv, type R2Like } from './multiplayer';
import { emptyProfile, retire } from '../src/core/career';
import { applyCommand } from '../src/core/commands';
import { defaultPicks, newCareer, type SetupChoices } from '../src/core/state';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));

function fakeD1(db: Database): D1Like {
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
    batch: async (statements: D1Stmt[]) =>
      db.transaction(() =>
        statements.map((s) => {
          const run = runners.get(s);
          if (!run) throw new Error('Unknown statement');
          return run();
        }),
      )(),
  };
}

function fakeR2(store: Map<string, string>): R2Like {
  return {
    put: async (k, v) => void store.set(k, v),
    get: async (k) => (store.has(k) ? { text: async () => store.get(k)! } : null),
    delete: async (k) => void (Array.isArray(k) ? k : [k]).forEach((x) => store.delete(x)),
  };
}

const NOW = Date.UTC(2026, 10, 4, 3, 0, 0); // 2026-11-04 12:00 KST(수)
let db: Database;
let blobs: Map<string, string>;
let env: MultiplayerEnv;

beforeEach(() => {
  db = new Database(':memory:');
  for (const m of MIGRATIONS) db.exec(m);
  blobs = new Map();
  env = { DB: fakeD1(db), SAVES: fakeR2(blobs) };
});

const call = (method: string, path: string, user: string | null, body?: unknown, now = NOW) =>
  handleMultiplayer(
    new Request('https://x.test' + path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    user,
    { now: () => now },
  );

const game = (extra: Record<string, unknown> = {}) => JSON.stringify({ version: 2, day: 10, ...extra });

describe('클라우드 저장', () => {
  test('로그인 없이는 401', async () => {
    expect((await call('GET', '/api/mp/saves', null)).status).toBe(401);
    expect((await call('PUT', '/api/mp/saves/main', null, { baseRevision: null, data: game() })).status).toBe(401);
  });

  test('처음 저장 → 읽기 → revision으로 덮어쓰기', async () => {
    const a = await call('PUT', '/api/mp/saves/main', 'u1', { baseRevision: null, data: game() });
    expect(a.status).toBe(201);
    expect(await a.json()).toMatchObject({ slot: 'main', revision: 1 });
    const b = await call('PUT', '/api/mp/saves/main', 'u1', { baseRevision: 1, data: game({ day: 11 }) });
    expect(b.status).toBe(200);
    expect((await b.json()).revision).toBe(2);
    const g = (await (await call('GET', '/api/mp/saves/main', 'u1')).json()) as { revision: number; data: string };
    expect(g.revision).toBe(2);
    expect(JSON.parse(g.data).day).toBe(11);
    expect(blobs.size).toBe(2); // 예전 판 본문은 유예 시간 동안 남음
    expect(await sweepBlobs(env, NOW + BLOB_GRACE_MS)).toEqual({ deleted: 1, kept: 1, failed: 0 });
    expect(blobs.size).toBe(1);
    expect(JSON.parse([...blobs.values()][0]).day).toBe(11);
    const list = (await (await call('GET', '/api/mp/saves', 'u1')).json()) as { saves: unknown[] };
    expect(list.saves).toHaveLength(1);
  });

  test('오래된 revision으로 쓰면 409와 현재 정보', async () => {
    await call('PUT', '/api/mp/saves/main', 'u1', { baseRevision: null, data: game() });
    await call('PUT', '/api/mp/saves/main', 'u1', { baseRevision: 1, data: game() });
    const r = await call('PUT', '/api/mp/saves/main', 'u1', { baseRevision: 1, data: game() });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: 'conflict', current: { revision: 2 } });
    const again = await call('PUT', '/api/mp/saves/main', 'u1', { baseRevision: null, data: game() });
    expect(again.status).toBe(409);
  });

  test('동시에 같은 revision으로 쓰면 하나만 성공', async () => {
    await call('PUT', '/api/mp/saves/main', 'u1', { baseRevision: null, data: game() });
    const rs = await Promise.all([1, 2, 3].map((d) => call('PUT', '/api/mp/saves/main', 'u1', { baseRevision: 1, data: game({ day: d }) })));
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    await sweepBlobs(env, NOW + BLOB_GRACE_MS);
    expect(blobs.size).toBe(1);
    const kept = (await (await call('GET', '/api/mp/saves/main', 'u1')).json()) as { revision: number };
    expect(kept.revision).toBe(2);
  });

  test('읽기가 옛 키를 받은 뒤 새 판이 써져도 옛 본문을 읽음', async () => {
    await call('PUT', '/api/mp/saves/main', 'u1', { baseRevision: null, data: game({ day: 1 }) });
    const get = env.SAVES.get.bind(env.SAVES);
    env.SAVES.get = async (k) => {
      env.SAVES.get = get;
      expect((await call('PUT', '/api/mp/saves/main', 'u1', { baseRevision: 1, data: game({ day: 2 }) })).status).toBe(200);
      expect((await call('DELETE', '/api/mp/saves/main?revision=2', 'u1')).status).toBe(204);
      return get(k);
    };
    const r = await call('GET', '/api/mp/saves/main', 'u1');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ revision: 1 });
    await sweepBlobs(env, NOW + BLOB_GRACE_MS);
    expect(blobs.size).toBe(0);
  });

  test('R2에 쓴 뒤 D1 쓰기가 실패하면 예전 판이 남고, 고아 객체는 정리에서 지움', async () => {
    await call('PUT', '/api/mp/saves/main', 'u1', { baseRevision: null, data: game({ day: 1 }) });
    const prepare = env.DB.prepare.bind(env.DB);
    env.DB = { prepare: (sql) => (sql.startsWith('UPDATE mp_saves') ? { ...prepare(sql), bind: () => ({ ...prepare(sql), run: async () => { throw new Error('D1 down'); } }) } : prepare(sql)) } as D1Like;
    expect((await call('PUT', '/api/mp/saves/main', 'u1', { baseRevision: 1, data: game({ day: 2 }) })).status).toBe(500);
    env.DB = { prepare };
    expect(blobs.size).toBe(2);
    expect(await sweepBlobs(env, NOW + BLOB_GRACE_MS - 1)).toEqual({ deleted: 0, kept: 0, failed: 0 });
    expect(await sweepBlobs(env, NOW + BLOB_GRACE_MS)).toEqual({ deleted: 1, kept: 1, failed: 0 });
    const g = (await (await call('GET', '/api/mp/saves/main', 'u1')).json()) as { revision: number; data: string };
    expect(g.revision).toBe(1);
    expect(JSON.parse(g.data).day).toBe(1);
  });

  test('R2 삭제가 실패하면 후보를 남겨 다음에 다시 지움', async () => {
    await call('PUT', '/api/mp/saves/main', 'u1', { baseRevision: null, data: game() });
    await call('DELETE', '/api/mp/saves/main?revision=1', 'u1');
    const del = env.SAVES.delete.bind(env.SAVES);
    env.SAVES.delete = async () => { throw new Error('R2 down'); };
    expect(await sweepBlobs(env, NOW + BLOB_GRACE_MS)).toEqual({ deleted: 0, kept: 0, failed: 1 });
    env.SAVES.delete = del;
    expect(await sweepBlobs(env, NOW + BLOB_GRACE_MS)).toEqual({ deleted: 1, kept: 0, failed: 0 });
    expect(blobs.size).toBe(0);
  });

  test('본문을 못 찾으면 지금 행을 다시 읽어 새 키로 가져옴', async () => {
    await call('PUT', '/api/mp/saves/main', 'u1', { baseRevision: null, data: game({ day: 1 }) });
    const [oldKey] = [...blobs.keys()];
    const get = env.SAVES.get.bind(env.SAVES);
    env.SAVES.get = async (k) => {
      env.SAVES.get = get;
      await call('PUT', '/api/mp/saves/main', 'u1', { baseRevision: 1, data: game({ day: 2 }) });
      blobs.delete(oldKey);
      return get(k);
    };
    const r = await call('GET', '/api/mp/saves/main', 'u1');
    expect(r.status).toBe(200);
    const g = (await r.json()) as { revision: number; data: string };
    expect(g.revision).toBe(2);
    expect(JSON.parse(g.data).day).toBe(2);
  });

  test('잘못된 퍼센트 인코딩 주소는 400', async () => {
    const r = await call('GET', '/api/mp/challenges/%E0%A4%A', null);
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error: 'bad_request' });
  });

  test('다른 사람의 저장은 보이지 않음', async () => {
    await call('PUT', '/api/mp/saves/main', 'u1', { baseRevision: null, data: game() });
    expect((await call('GET', '/api/mp/saves/main', 'u2')).status).toBe(404);
    expect((await call('PUT', '/api/mp/saves/main', 'u2', { baseRevision: 1, data: game() })).status).toBe(409);
    expect((await call('DELETE', '/api/mp/saves/main?revision=1', 'u2')).status).toBe(404);
  });

  test('칸·형식·크기 검사', async () => {
    expect((await call('PUT', '/api/mp/saves/../x', 'u1', { baseRevision: null, data: game() })).status).toBe(404);
    expect((await call('PUT', '/api/mp/saves/main', 'u1', { baseRevision: null, data: '{"version":1}' })).status).toBe(422);
    expect((await call('PUT', '/api/mp/saves/profile', 'u1', { baseRevision: null, data: '{"version":1}' })).status).toBe(201);
    expect((await call('PUT', '/api/mp/saves/main', 'u1', { baseRevision: 0, data: game() })).status).toBe(400);
    const big = game({ pad: 'x'.repeat(4 * 1024 * 1024) });
    expect((await call('PUT', '/api/mp/saves/main', 'u1', { baseRevision: null, data: big })).status).toBe(413);
    const noType = await handleMultiplayer(new Request('https://x.test/api/mp/saves/main', { method: 'PUT', body: '{}' }), env, 'u1');
    expect(noType.status).toBe(415);
  });

  test('삭제는 현재 revision일 때만', async () => {
    await call('PUT', '/api/mp/saves/main', 'u1', { baseRevision: null, data: game() });
    expect((await call('DELETE', '/api/mp/saves/main?revision=2', 'u1')).status).toBe(409);
    expect((await call('DELETE', '/api/mp/saves/main?revision=1', 'u1')).status).toBe(204);
    await sweepBlobs(env, NOW + BLOB_GRACE_MS);
    expect(blobs.size).toBe(0);
    expect((await call('GET', '/api/mp/saves/main', 'u1')).status).toBe(404);
  });
});

describe('주간 도전', () => {
  test('주 계산(한국 시간 월요일 0시 시작)', () => {
    const w = weekOf(NOW);
    expect(w.id).toBe('2026-W45');
    expect(w.startsAt).toBe(Date.UTC(2026, 10, 1, 15)); // 11-02 00:00 KST
    expect(weekOf(w.startsAt - 1).id).toBe('2026-W44');
    expect(weekOf(Date.UTC(2027, 0, 1, 3)).id).toBe('2026-W53');
  });

  const current = async () =>
    ((await (await call('GET', '/api/mp/challenges/current', null)).json()) as { challenge: { id: string; seed: number; rule: string | null } }).challenge;

  // 실제 게임 함수로 파산까지 돌려 진짜 재실행 payload를 만듭니다(조작이 아니라 도전 시드로 진짜 플레이한 것과 같은 모양).
  const replayPayload = (c: { seed: number; rule: string | null }, companyName = '테스트') => {
    const setup: SetupChoices = {
      picks: defaultPicks(),
      cofounderId: null,
      cofounderEquity: 0,
      engineerId: null,
      companyName,
      wantsAngel: false,
      seed: c.seed,
      industry: 'saas',
      service: { field: '생산성', name: companyName, logo: { mark: 'T', color: '#4f46e5' } },
      founderName: '창업자',
      challenge: c.rule ?? undefined,
      invest: 0,
    };
    const s = newCareer(setup, emptyProfile());
    const log: { c: unknown; n: number }[] = [];
    let ticksInRun = 0;
    const flushTicks = () => {
      if (ticksInRun > 0) {
        log.push({ c: { type: 'tick', ms: 100, nightFast: true }, n: ticksInRun });
        ticksInRun = 0;
      }
    };
    let guard = 0;
    while (!s.ended && guard < 2_000_000) {
      guard++;
      if (s.pauseReason !== null) {
        flushTicks();
        s.pauseReason = null;
        log.push({ c: { type: 'clearPause' }, n: 1 });
        continue;
      }
      applyCommand(s, { type: 'tick', ms: 100, nightFast: true });
      s.events = [];
      ticksInRun++;
    }
    flushTicks();
    if (!s.ended) throw new Error('테스트 전제가 깨졌습니다: 파산까지 도달하지 못했습니다.');
    retire(s);
    log.push({ c: { type: 'retire' }, n: 1 });
    return JSON.stringify({ version: 1, setup, commands: log });
  };

  test('이번 주 도전은 한 번만 만들어지고 로그인 없이 볼 수 있음', async () => {
    const a = await current();
    const b = await current();
    expect(a).toEqual(b);
    expect(a.id).toBe('2026-W45');
    expect(Number.isInteger(a.seed) && a.seed >= 0 && a.seed < 2 ** 31).toBe(true);
  });

  test('검증된 제출은 verifyPendingRuns로 verified가 되고, 게시판에 나타납니다', async () => {
    const c = await current();
    const r = await call('POST', `/api/mp/challenges/${c.id}/runs`, 'u1', { replay: replayPayload(c) });
    expect(r.status).toBe(202);
    const posted = (await r.json()) as { runId: string; status: string };
    expect(posted.status).toBe('pending');
    const stats = await verifyPendingRuns(env, NOW);
    expect(stats).toMatchObject({ verified: 1, rejected: 0, failed: 0 });
    const v = (await (await call('GET', `/api/mp/challenges/${c.id}/leaderboard`, null)).json()) as { status: string; verifierAvailable: boolean; entries: Record<string, unknown>[] };
    expect(v).toMatchObject({ status: 'verified', verifierAvailable: true });
    expect(v.entries).toHaveLength(1);
    expect(v.entries[0]).toMatchObject({ rank: 1, founderName: '창업자', status: 'verified' });
    expect(v.entries[0]).not.toHaveProperty('userId');
    const me = (await (await call('GET', `/api/mp/challenges/${c.id}/runs/me`, 'u1')).json()) as { run: { status: string } | null };
    expect(me.run).toMatchObject({ status: 'verified' });
  });

  test('점수를 직접 보내거나 state만 보내면 거절', async () => {
    const c = await current();
    const r = await call('POST', `/api/mp/challenges/${c.id}/runs`, 'u1', { state: '{}', score: 999 });
    expect(r.status).toBe(400);
    const r2 = await call('POST', `/api/mp/challenges/${c.id}/runs`, 'u1', { state: '{}' });
    expect(r2.status).toBe(400);
  });

  test('도전과 시드가 다른 명령 기록은 제출 때 거절, 로그인 없으면 401', async () => {
    const c = await current();
    const path = `/api/mp/challenges/${c.id}/runs`;
    const forged = JSON.parse(replayPayload(c)) as { seed: number };
    forged.seed = c.seed + 1;
    expect((await call('POST', path, 'u1', { replay: JSON.stringify(forged) })).status).toBe(422);
    expect((await call('POST', path, null, { replay: replayPayload(c) })).status).toBe(401);
  });

  test('한 사람은 가장 높은 기록 하나만, 순위는 검증된 점수 순', async () => {
    const c = await current();
    const path = `/api/mp/challenges/${c.id}/runs`;
    expect((await call('POST', path, 'u1', { replay: replayPayload(c, '구멀점A') })).status).toBe(202);
    expect((await call('POST', path, 'u2', { replay: replayPayload(c, '구멀점B') })).status).toBe(202);
    const stats = await verifyPendingRuns(env, NOW, 10);
    expect(stats.verified).toBe(2);
    const v = (await (await call('GET', `/api/mp/challenges/${c.id}/leaderboard`, null)).json()) as { entries: { founderName: string; status: string }[] };
    expect(v.entries).toHaveLength(2);
    expect(v.entries.every((e) => e.status === 'verified')).toBe(true);
  });

  test('기간이 끝난 도전에는 올릴 수 없음', async () => {
    const c = await current();
    const later = NOW + 8 * 86400_000;
    const r = await call('POST', `/api/mp/challenges/${c.id}/runs`, 'u1', { replay: replayPayload(c) }, later);
    expect(r.status).toBe(409);
    expect((await call('GET', '/api/mp/challenges/2020-W01', null)).status).toBe(404);
  });
});
