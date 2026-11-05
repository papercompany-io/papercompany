// 명령 기록 재실행 시험(A-250): 같은 시작 설정 + 같은 명령 순서면 같은 결과인지 봅니다.
// 실행: npm run test:replay
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, type Command } from '../../src/core/commands';
import { defaultPicks, newCareer, type SetupChoices } from '../../src/core/state';
import { emptyProfile } from '../../src/core/career';
import { isRunning } from '../../src/core/sim';
import type { GameState } from '../../src/core/types';

const TICK = 50;

function start(setup: SetupChoices): GameState {
  return newCareer(structuredClone(setup), emptyProfile());
}

// 화면 대신 명령만 보내는 간단한 플레이어. 결정은 첫 선택지, 멈추면 다시 4배속
function play(setup: SetupChoices, days: number): { log: Command[]; end: GameState } {
  const s = start(setup);
  const log: Command[] = [];
  const send = (c: Command) => {
    log.push(structuredClone(c));
    applyCommand(s, c);
  };
  send({ type: 'setSpeed', speed: 4 });
  let guard = 0;
  while (s.day < days && !s.ended && guard++ < 2_000_000) {
    const open = s.decisions.find((d) => !d.resolved);
    if (open) send({ type: 'resolveDecision', decisionId: open.id, choice: 0 });
    if (s.pauseReason) send({ type: 'clearPause' });
    if (!isRunning(s)) send({ type: 'setSpeed', speed: 4 });
    send({ type: 'tick', ms: TICK, nightFast: true });
  }
  return { log, end: s };
}

function replay(setup: SetupChoices, log: Command[]): GameState {
  const s = start(setup);
  for (const c of JSON.parse(JSON.stringify(log)) as Command[]) applyCommand(s, c);
  return s;
}

const snap = (s: GameState) => JSON.stringify({ ...s, events: [] });

for (const industry of ['saas', 'commerce'] as const) {
  test(`${industry}: 기록을 다시 돌리면 상태가 같습니다`, () => {
    const setup: SetupChoices = { picks: defaultPicks(), cofounderId: null, cofounderEquity: 0, engineerId: null, companyName: '재실행', wantsAngel: false, seed: 4242, industry };
    const { log, end } = play(setup, 120);
    assert.ok(end.day >= 60, `게임 시간이 충분히 흘러야 합니다(지금 ${end.day}일)`);
    assert.ok(log.some((c) => c.type === 'resolveDecision'), '결정 명령이 하나 이상 기록되어야 합니다');
    assert.equal(snap(replay(setup, log)), snap(end));
  });
}

test('명령 하나를 바꾸면 결과가 달라집니다', () => {
  const setup: SetupChoices = { picks: defaultPicks(), cofounderId: null, cofounderEquity: 0, engineerId: null, companyName: '재실행', wantsAngel: false, seed: 4242, industry: 'saas' };
  const { log, end } = play(setup, 60);
  const i = log.findIndex((c) => c.type === 'resolveDecision');
  assert.ok(i >= 0);
  const forged = structuredClone(log);
  const d = forged[i] as Extract<Command, { type: 'resolveDecision' }>;
  d.choice = 1;
  assert.notEqual(snap(replay(setup, forged)), snap(end));
});
