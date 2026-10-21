// DT-05 게임 시계: 실시간 진행, 일시정지와 1x·2x·4x 배속(DEC-018). 하루·월·분기 단위 주기 처리.
import { DATA } from './data';
import { isFirstOfMonth, isQuarterStart, dateOf } from './calendar';
import { aiDay, aiMonth } from './aiadopt';
import { ceoDayEnd, runSlot } from './ceo';
import { competitorsMonth } from './competitors';
import { economyDay } from './economy';
import { applySeatMoves } from './employees';
import { eventsDay } from './events';
import { checkBankruptcy, checkBoard, exitDayEnd, inboundOfferMonth } from './exit';
import { accrueDay, closeMonth } from './finance';
import { founderAge, finishCompany } from './career';
import { founderPct } from './equity';
import { roundDayEnd } from './funding';
import { hiringDayEnd, startPendingHires } from './hiring';
import { marketDay, totalUsers } from './market';
import { pruneMods } from './mods';
import { notify } from './notify';
import { officeDay } from './office';
import { ordersDay } from './orders';
import { achievementsDay, missionsDay, updateStage } from './progress';
import { publicDay, publicQuarter, resignPreview } from './public';
import { staffDay, staffMonth } from './staff';
import { computeValuation, updateStoredValuation } from './valuation';
import type { GameState } from './types';

const T = DATA.time;
const HOURS = T.workEndHour - T.workStartHour;

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

// 남은 칸을 모두 실행하고 하루를 끝냅니다(봇·시뮬레이터용).
export function runDay(s: GameState) {
  while (s.slotsDone < T.slotsPerDay) {
    runSlot(s, s.slotsDone);
    s.slotsDone += 1;
  }
  endDay(s);
}

export function endDay(s: GameState) {
  const push = ordersDay(s);
  marketDay(s, push);
  accrueDay(s);
  aiDay(s);
  ceoDayEnd(s);
  s.day += 1;
  s.msInDay = 0;
  s.slotsDone = 0;
  s.todayLog = { dev: 0, sales: 0, ir: 0, network: 0, enterprise: 0, approve: 0 };
  staffDay(s);
  hiringDayEnd(s);
  roundDayEnd(s);
  exitDayEnd(s);
  if (s.ended) return;
  startPendingHires(s);
  applySeatMoves(s);
  officeDay(s);
  eventsDay(s);
  economyDay(s);
  publicDay(s);
  updateStage(s);
  missionsDay(s);
  if (s.day % 3 === 0) achievementsDay(s);
  pruneMods(s);
  if (isFirstOfMonth(s.day)) {
    const pl = closeMonth(s, totalUsers(s));
    s.company.profitStreak = pl.operatingProfit > 0 ? s.company.profitStreak + 1 : 0;
    competitorsMonth(s);
    staffMonth(s, dateOf(s.day).getUTCMonth() === 0);
    aiMonth(s);
    inboundOfferMonth(s);
    checkBoard(s);
    if (s.ended) return;
    if (isQuarterStart(s.day)) publicQuarter(s);
    updateStoredValuation(s);
    s.events.push({ type: 'monthClosed', month: pl.month });
    checkBankruptcy(s);
    if (s.ended) return;
    retirementCheck(s);
    if (s.ended) return;
  }
  s.events.push({ type: 'autosave', reason: '날짜 변경' });
}

// 은퇴 나이(65세): 회사를 정리합니다(상장사는 사임, 비상장은 지분을 넘김).
function retirementCheck(s: GameState) {
  const age = founderAge(s);
  if (age >= DATA.career.retireAge - 1 && age < DATA.career.retireAge - 1 + 1 / 12) notify(s, '1년 뒤 은퇴 나이(65세)입니다. 그 전에 Exit을 준비하세요.', 'urgent');
  if (age < DATA.career.retireAge) return;
  if (s.public) {
    const pv = resignPreview(s);
    finishCompany(s, 'ipo_exit', s.public.founderSold + pv.proceeds, { founderPct: founderPct(s), alreadyPaid: s.public.founderSold, reason: '은퇴 나이가 되어 대표에서 물러났습니다.' });
  } else {
    const v = computeValuation(s).value;
    finishCompany(s, 'retired_ceo', Math.round(v * founderPct(s) * 0.7), { exitValue: v, founderPct: founderPct(s), reason: '은퇴 나이가 되어 지분을 넘기고 물러났습니다(기업가치의 70%로 정산).' });
  }
}
