// DT-05 게임 시계: 실시간 진행, 일시정지와 1x·2x·4x 배속(DEC-018). 하루·월·분기 단위 주기 처리.
import { DATA } from './data';
import { isFirstOfMonth, isQuarterStart, dateOf } from './calendar';
import { aiDay, aiMonth } from './aiadopt';
import { ceoDayEnd, runSlot } from './ceo';
import { chatterSlot } from './chatter';
import { competitorsMonth } from './competitors';
import { economyDay } from './economy';
import { applySeatMoves } from './employees';
import { eventsDay } from './events';
import { contractsDay } from './contracts';
import { adSalesDay } from './adsales';
import { loansDay } from './loans';
import { checkBankruptcy, checkBoard, exitDayEnd, inboundOfferMonth } from './exit';
import { accrueDay, closeMonth, settleDay } from './finance';
import { paydayForecast } from './forecast';
import { monthKey } from './calendar';
import { founderAge, finishCompany } from './career';
import { founderPct } from './equity';
import { roundDayEnd } from './funding';
import { burningDay } from './burning';
import { hiringArrivals, hiringDayEnd, startPendingHires } from './hiring';
import { outingsDay } from './outings';
import { milestonesDay } from './milestones';
import { autoMeeting, meetingStartMs, meetingsDayEnd, pendingMeetings, startMeeting } from './meeting';
import { contactsMonth } from './contacts';
import { marketDay, totalUsers } from './market';
import { marketingMonth } from './marketing';
import { pruneMods } from './mods';
import { notify } from './notify';
import { officeDay } from './office';
import { contractSlot, ordersDay } from './orders';
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
  return !s.ended && s.speed > 0 && !s.pauseReason && !s.meeting; // 고객사 미팅 중에는 시계가 멈춤(A-186)
}

// 밤 빨리 감기(A-159): 배속이 반영된 시간 1ms가 밤 시계를 몇 ms 움직일지. 1보다 작으면 안 됨(빨리 감기가 더 느려짐)
// 배속과 상관없이 밤 한 번이 실제 nightFastMs만에 지나가도록 배속만큼 나눔
function nightBoost(s: GameState): number {
  return Math.max(1, T.nightMs / (T.nightFastMs * s.speed));
}

// nightFast: 퇴근 뒤 밤만 빠르게 흘려 보냄(A-159, 위 막대·설정의 자동 빨리 감기). 아침이 되면 남은 시간은 보통 빠르기로 씀
export function advance(s: GameState, realMs: number, nightFast = false) {
  if (!isRunning(s)) return;
  let ms = Math.min(realMs, 1000) * s.speed;
  while (ms > 0 && isRunning(s)) {
    // 퇴근 뒤(A-149): 다음 날 9시까지 시계만 흐름. 야근 효과는 하루 끝(endDay)의 근무 정책이 매김
    if (s.nightMs !== undefined) {
      const boost = nightFast ? nightBoost(s) : 1;
      const step = Math.min(ms * boost, T.nightMs - s.nightMs);
      s.nightMs += step;
      ms -= step / boost;
      if (s.nightMs >= T.nightMs - 1e-6) endDay(s);
      continue;
    }
    // 고객사 미팅(A-186): 약속 시각이 되면 회의실에 들어가고 시계가 멈춤
    const meets = pendingMeetings(s);
    const due = meets.find((o) => meetingStartMs(o) <= s.msInDay + 1e-6);
    if (due) {
      startMeeting(s, due.id);
      break;
    }
    const meetAt = Math.min(Infinity, ...meets.map(meetingStartMs));
    const nextSlot = s.slotsDone < T.slotsPerDay ? slotEnd(s.slotsDone) : T.dayMs;
    const target = Math.min(nextSlot, T.dayMs, meetAt);
    const step = Math.min(ms, target - s.msInDay);
    s.msInDay += step;
    ms -= step;
    hiringArrivals(s, s.msInDay);
    if (s.slotsDone < T.slotsPerDay && s.msInDay >= slotEnd(s.slotsDone) - 1e-6) {
      runSlot(s, s.slotsDone);
      contractSlot(s); // 개발팀 외주 작업은 칸마다(A-173)
      chatterSlot(s, s.slotsDone); // 직원 잡담(A-148)
      s.slotsDone += 1;
    }
    if (s.msInDay >= T.dayMs - 1e-6) s.nightMs = 0;
  }
}

// 남은 칸을 모두 실행하고 하루를 끝냅니다(봇·시뮬레이터용).
export function runDay(s: GameState) {
  for (const o of pendingMeetings(s)) autoMeeting(s, o); // 봇이 직접 하지 않은 미팅은 알아서 진행(A-186)
  while (s.slotsDone < T.slotsPerDay) {
    runSlot(s, s.slotsDone);
    contractSlot(s);
    chatterSlot(s, s.slotsDone);
    s.slotsDone += 1;
  }
  endDay(s);
}

export function endDay(s: GameState) {
  meetingsDayEnd(s); // 직원이 대신 간 고객사 미팅(A-186)
  const revBefore = revenueSoFar(s);
  const push = ordersDay(s);
  marketDay(s, push);
  accrueDay(s);
  logDaily(s, revenueSoFar(s) - revBefore);
  aiDay(s);
  ceoDayEnd(s);
  settleDay(s); // A-184 매출·고정비 하루치를 자금에 바로 반영
  s.day += 1;
  s.msInDay = 0;
  s.nightMs = undefined;
  s.slotsDone = 0;
  s.todayLog = { dev: 0, contract: 0, sales: 0, ir: 0, network: 0, enterprise: 0, approve: 0 };
  staffDay(s);
  burningDay(s);
  hiringDayEnd(s);
  outingsDay(s);
  roundDayEnd(s);
  exitDayEnd(s);
  if (s.ended) return;
  startPendingHires(s);
  applySeatMoves(s);
  officeDay(s);
  eventsDay(s);
  contractsDay(s);
  adSalesDay(s); // 광고 판매(A-182)
  loansDay(s);
  bankruptcyWarning(s);
  economyDay(s);
  publicDay(s);
  updateStage(s);
  missionsDay(s);
  milestonesDay(s); // 약속(A-173)
  if (s.day % 3 === 0) achievementsDay(s);
  pruneMods(s);
  if (isFirstOfMonth(s.day)) {
    const pl = closeMonth(s, totalUsers(s));
    s.company.profitStreak = pl.operatingProfit > 0 ? s.company.profitStreak + 1 : 0;
    competitorsMonth(s);
    contactsMonth(s); // 오래 안 만난 연락처는 친밀도가 식음(A-186)
    marketingMonth(s); // 월초 고객 리포트·광고 맡기기(A-157)
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

function revenueSoFar(s: GameState): number {
  const a = s.accrual;
  return a.revSub + a.revAd + a.revTake + a.revEnt;
}

// 제품 상태 그래프용 하루 기록(사용자·매출), 최근 90일만
function logDaily(s: GameState, rev: number) {
  const d = (s.product.daily ??= []);
  d.push({ day: s.day, users: Math.round(totalUsers(s)), rev: Math.round(rev) });
  if (d.length > 90) d.splice(0, d.length - 90);
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

// FL-01 파산 경고(A-69): 이대로면 다음 월급일에 자금이 0 이하가 될 때, 월급일 10일 전과 3일 전에 한 번씩 멈추고 알립니다.
function bankruptcyWarning(s: GameState) {
  if (s.public) return;
  const fc = paydayForecast(s);
  if (fc.cashAfter > 0 || (fc.daysLeft !== 10 && fc.daysLeft !== 3)) return;
  const key = `bkwarn-${monthKey(s.day)}-${fc.daysLeft}`;
  if (s.flags.includes(key)) return;
  s.flags = s.flags.filter((f) => !f.startsWith('bkwarn-')).concat(key);
  const gap = Math.round(-fc.cashAfter / 1e4).toLocaleString('ko-KR');
  notify(s, `파산 경고: 이대로면 ${fc.daysLeft}일 뒤 월급일에 자금이 약 ${gap}만원 모자랍니다. 투자를 받거나(투자 메뉴) 광고비·인원을 줄이세요.`, 'urgent', 'finance');
  s.pauseReason = `파산 경고 — ${fc.daysLeft}일 뒤 월급일에 약 ${gap}만원 부족`;
}

