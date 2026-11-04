// 재실행 검증기 테스트: 실제 게임 함수로 명령 기록을 만들고(화면 쪽 dispatch 흉내), replayCareer가 같은 결과를 내는지와
// 조작된 입력을 거부하는지 확인합니다. 파산까지 가는 빠른 경로(현금을 마이너스로 만들고 일시정지를 계속 풀어 줌)로
// 몇천 tick 안에 은퇴(파산 처리)까지 다다르게 합니다. 느린 자연 플레이로는 테스트 예산 안에 끝나지 않습니다.
import { describe, expect, test } from 'bun:test';
import { emptyProfile, retire } from '../core/career';
import { defaultPicks, newCareer, nextCompany, type SetupChoices } from '../core/state';
import { applyCommand, type Command } from '../core/commands';
import { replayCareer } from './replay';

const SEED = 7;
const TICK_MS = 100;

function baseSetup(seed: number, companyName = '테스트'): SetupChoices {
  return {
    picks: defaultPicks(),
    cofounderId: null,
    cofounderEquity: 0,
    engineerId: null,
    companyName,
    wantsAngel: false,
    seed,
    industry: 'saas',
    service: { field: '생산성', name: companyName, logo: { mark: 'T', color: '#4f46e5' } },
    founderName: '창업자',
    invest: 0,
  };
}

type Entry = { c: Command | { type: 'nextCompany'; setup: SetupChoices } | { type: 'retire' }; n: number };

// 파산까지 가는 진짜 게임 진행(예산 없는 솔로 창업, 수익 없이 가만두면 고정비로 파산합니다): tick을 반복하다 멈추면 clearPause, 끝나면 retire.
function playToBankruptcy(s: ReturnType<typeof newCareer>, log: Entry[]) {
  let ticksInRun = 0;
  const flushTicks = () => {
    if (ticksInRun > 0) {
      log.push({ c: { type: 'tick', ms: TICK_MS, nightFast: true }, n: ticksInRun });
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
    applyCommand(s, { type: 'tick', ms: TICK_MS, nightFast: true });
    s.events = [];
    ticksInRun++;
  }
  flushTicks();
  if (!s.ended) throw new Error('테스트 전제가 깨졌습니다: 파산까지 도달하지 못했습니다.');
}

describe('replayCareer', () => {
  test('직접 돌린 상태와 재실행 결과의 최종 자산·엔딩이 같습니다', () => {
    const setup = baseSetup(SEED);
    const direct = newCareer(setup, emptyProfile());
    const log: Entry[] = [];
    playToBankruptcy(direct, log);
    retire(direct);
    log.push({ c: { type: 'retire' }, n: 1 });

    const result = replayCareer({ seed: SEED, rule: null, setup, commands: log });

    expect(result.state.career.retired).toBe(true);
    expect(result.state.career.endingId).toBe(direct.career.endingId);
    expect(result.score).toBe(Math.round(direct.career.wealth));
    expect(result.score).toBe(Math.round(result.state.career.wealth));
  });

  test('회사 전환(nextCompany)을 포함한 기록도 같은 결과로 다시 돌립니다', () => {
    const setup = baseSetup(SEED);
    const s = newCareer(setup, emptyProfile());
    const log: Entry[] = [];
    playToBankruptcy(s, log);

    const secondSetup = baseSetup(SEED, '테스트투');
    const err = nextCompany(s, secondSetup);
    expect(err).toBeNull();
    log.push({ c: { type: 'nextCompany', setup: secondSetup }, n: 1 });

    playToBankruptcy(s, log);
    retire(s);
    log.push({ c: { type: 'retire' }, n: 1 });

    const result = replayCareer({ seed: SEED, rule: null, setup, commands: log });
    expect(result.state.career.companies.length).toBe(2);
    expect(result.score).toBe(Math.round(s.career.wealth));
  });

  test('모르는 종류의 명령은 거부합니다', () => {
    const setup = baseSetup(SEED);
    expect(() =>
      replayCareer({
        seed: SEED,
        rule: null,
        setup,
        commands: [{ c: { type: 'tick', ms: TICK_MS, nightFast: false }, n: 1 }, { c: { type: 'teleportToSuccess' }, n: 1 }],
      }),
    ).toThrow();
  });

  test('범위를 벗어난 숫자 필드는 거부합니다', () => {
    const setup = baseSetup(SEED);
    expect(() =>
      replayCareer({
        seed: SEED,
        rule: null,
        setup,
        commands: [{ c: { type: 'tick', ms: TICK_MS, nightFast: false }, n: 1 }, { c: { type: 'sellShares', fraction: Number.POSITIVE_INFINITY }, n: 1 }],
      }),
    ).toThrow();
  });

  test('LLM 해석 결과(read)가 null이 아니면 거부합니다', () => {
    const setup = baseSetup(SEED);
    expect(() =>
      replayCareer({
        seed: SEED,
        rule: null,
        setup,
        commands: [
          { c: { type: 'tick', ms: TICK_MS, nightFast: false }, n: 1 },
          { c: { type: 'answerSaid', empId: 'e1', said: '안녕', read: { intent: 'checkin', order: null, tone: 0, topic: null } }, n: 1 },
        ],
      }),
    ).toThrow();
  });

  test('고정 tick 크기가 아니면 거부합니다', () => {
    const setup = baseSetup(SEED);
    expect(() =>
      replayCareer({
        seed: SEED,
        rule: null,
        setup,
        commands: [{ c: { type: 'tick', ms: TICK_MS * 3, nightFast: false }, n: 1 }],
      }),
    ).toThrow(/tick/);
  });

  test('setup 안의 시드가 도전 시드와 다르면 거부합니다(클라이언트가 시드를 고를 수 없음)', () => {
    const forged = baseSetup(999999);
    const log: Entry[] = [];
    const direct = newCareer(baseSetup(SEED), emptyProfile());
    playToBankruptcy(direct, log);
    retire(direct);
    log.push({ c: { type: 'retire' }, n: 1 });
    expect(() => replayCareer({ seed: SEED, rule: null, setup: forged, commands: log })).toThrow(/시드/);
  });

  test('은퇴로 끝나지 않은 기록은 거부합니다(중간에 끊긴 판)', () => {
    const setup = baseSetup(SEED);
    expect(() =>
      replayCareer({
        seed: SEED,
        rule: null,
        setup,
        commands: [{ c: { type: 'tick', ms: TICK_MS, nightFast: false }, n: 5 }],
      }),
    ).toThrow(/은퇴/);
  });
});
