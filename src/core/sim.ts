// DT-05 게임 시계: 실시간 진행, 일시정지와 1x·2x·4x 배속(DEC-018). 하루와 월 단위 주기 처리.
import { DATA } from './data';
import { isFirstOfMonth } from './calendar';
import { runSlot } from './ceo';
import { applySeatMoves } from './employees';
import { checkBankruptcy, exitDayEnd } from './exit';
import { accrueDay, closeMonth } from './finance';
import { roundDayEnd } from './funding';
import { hiringDayEnd, startPendingHires } from './hiring';
import { completeInstructions } from './instructions';
import { updateStoredValuation } from './valuation';
import type { GameState } from './types';

const T = DATA.time;
const HOURS = T.workEndHour - T.workStartHour;

// k번째 칸(0부터)이 끝나는 시각: 근무 시작 후 (k+1)시간
function slotEnd(k: number): number {
  return ((k + 1) / HOURS) * T.dayMs;
}

export function setSpeed(s: GameState, speed: number) {
  if (!T.speeds.includes(speed)) return;
  s.speed = speed;
  if (speed > 0) s.pauseReason = null;
}

export function isRunning(s: GameState): boolean {
  return !s.ended && s.speed > 0 && !s.pauseReason;
}

// realMs만큼 진행합니다. 탭이 잠들었다 깨어나도 한 번에 너무 많이 가지 않게 1초로 자릅니다.
export function advance(s: GameState, realMs: number) {
  if (!isRunning(s)) return;
  let ms = Math.min(realMs, 1000) * s.speed;
  while (ms > 0 && isRunning(s)) {
    const nextSlot = s.slotsDone < T.slotsPerDay ? slotEnd(s.slotsDone) : T.dayMs;
    const target = Math.min(nextSlot, T.dayMs);
    const step = Math.min(ms, target - s.msInDay);
    s.msInDay += step;
    ms -= step;
    if (s.slotsDone < T.slotsPerDay && s.msInDay >= slotEnd(s.slotsDone) - 1e-6) {
      runSlot(s, s.slotsDone);
      s.slotsDone += 1;
    }
    if (s.msInDay >= T.dayMs - 1e-6) endDay(s);
  }
}

// 하루가 끝날 때의 처리 순서
export function endDay(s: GameState) {
  accrueDay(s);
  s.day += 1;
  s.msInDay = 0;
  s.slotsDone = 0;
  s.todayLog = { dev: 0, sales: 0, ir: 0, network: 0 };
  completeInstructions(s);
  hiringDayEnd(s);
  roundDayEnd(s);
  exitDayEnd(s);
  if (s.ended) return;
  startPendingHires(s);
  applySeatMoves(s);
  if (isFirstOfMonth(s.day)) {
    const pl = closeMonth(s);
    updateStoredValuation(s);
    s.events.push({ type: 'monthClosed', month: pl.month });
    checkBankruptcy(s);
    if (s.ended) return;
  }
  s.events.push({ type: 'autosave', reason: '날짜 변경' });
}
