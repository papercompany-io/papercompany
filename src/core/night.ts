// A-149 퇴근 뒤 시간(Startup Company식): 18시에 근무가 끝나도 시계는 다음 날 9시까지 흐르고, 야근하는 사람만 자리에 남습니다.
// 야근의 출력·건강·만족도 효과는 예전처럼 근무 정책(welfare.json workPolicies)이 하루 단위로 매기므로, 밤을 빨리 감아도 잃는 것이 없습니다.
import { DATA } from './data';
import type { Employee, GameState } from './types';

const T = DATA.time;
const DAY_HOURS = T.workEndHour - T.workStartHour;
export const NIGHT_HOURS = 24 - DAY_HOURS; // 18시 → 다음 날 9시

export type AutoSkip = 'off' | 'quiet' | 'always';

export function inNight(s: GameState): boolean {
  return s.nightMs !== undefined;
}

// 지금 시각(소수 시). 9 = 출근, 18 = 퇴근, 24 넘으면 다음 날 새벽(33 = 다음 날 9시)
export function clockHour(s: GameState): number {
  if (s.nightMs !== undefined) return T.workEndHour + Math.min(1, s.nightMs / T.nightMs) * NIGHT_HOURS;
  return T.workStartHour + Math.min(1, s.msInDay / T.dayMs) * DAY_HOURS;
}

// 게임 하루(다음 날 9시까지 한 바퀴)에서 지금까지 지난 몫(0~1). 하루 끝에 한꺼번에 바뀌는 값을 화면에서 시간에 따라 보여 줄 때 씁니다(A-174).
export function dayProgress(s: GameState): number {
  const worked = Math.min(1, s.msInDay / T.dayMs) * DAY_HOURS;
  const night = s.nightMs !== undefined ? Math.min(1, s.nightMs / T.nightMs) * NIGHT_HOURS : 0;
  return Math.min(1, (worked + night) / 24);
}

// 10분 단위 "HH:MM"(24시 넘으면 새벽 시각으로)
export function clockText(s: GameState): string {
  const total = Math.floor(clockHour(s) * 6) * 10;
  const h = Math.floor(total / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// 시계로 보이는 날짜(자정을 넘기면 다음 날). 게임 규칙의 날짜(s.day)는 다음 날 9시에 바뀝니다.
export function shownDay(s: GameState): number {
  return clockHour(s) >= 24 ? s.day + 1 : s.day;
}

// 직원 e가 오늘 퇴근하는 시각(18 = 정시). 근무 정책과 성향으로 정합니다.
export function overtimeUntil(s: GameState, e: Employee): number {
  if (e.sickUntil !== null && e.sickUntil > s.day) return T.workEndHour;
  const policy = s.company.workPolicy;
  // TODO(human)
  return policy === 'crunch' ? 22 : T.workEndHour;
}

// 대표가 퇴근하는 시각: 야근 정책이면 팀과 같이 22시까지(A-146 컨디션 −crunch와 같은 뜻)
export function ceoUntil(s: GameState): number {
  return s.company.workPolicy === 'crunch' ? 22 : T.workEndHour;
}

// 지금 자리에 남아 야근 중인 직원
export function workingLate(s: GameState): Employee[] {
  if (!inNight(s)) return [];
  const h = clockHour(s);
  return s.employees.filter((e) => e.seatId && overtimeUntil(s, e) > h);
}

// 사무실에 이 사람이 지금 있는지(근무 시간이면 늘 있음)
export function atDesk(s: GameState, id: string): boolean {
  if (!inNight(s)) return true;
  const h = clockHour(s);
  if (id === 'ceo') return ceoUntil(s) > h;
  const e = s.employees.find((x) => x.id === id);
  return !!e && overtimeUntil(s, e) > h;
}

// 자동 빨리 감기(A-159, 예전엔 한 번에 건너뛰기): 'always'는 퇴근하자마자, 'quiet'는 야근하던 사람(대표 포함)이 모두 퇴근하면
export function autoSkipDue(s: GameState, mode: AutoSkip): boolean {
  if (!inNight(s) || mode === 'off') return false;
  if (mode === 'always') return true;
  return workingLate(s).length === 0 && !atDesk(s, 'ceo');
}
