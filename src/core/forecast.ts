// FN-01 다음 월급일 예상 자금(A-33): 남은 날의 대표 행동 칸 비용까지 넣어 계산합니다.
import { DATA, hasMvp } from './data';
import { daySchedule } from './ceo';
import { nextPaydayForecast } from './finance';
import type { ActionId, GameState } from './types';

function slotCost(s: GameState, a: ActionId | null): number {
  if (a === 'sales') return hasMvp(s) ? DATA.finance.entertainmentPerSalesSlot : 0;
  if (a === 'network') return DATA.finance.businessPromotionPerNetworkSlot;
  return 0;
}

export function paydayForecast(s: GameState) {
  const sched = daySchedule(s).map((x) => (x.locked ? 0 : slotCost(s, x.action)));
  const perDay = sched.reduce((a, b) => a + b, 0);
  const done = Object.values(s.todayLog).reduce((a, b) => a + b, 0);
  const today = sched.slice(done).reduce((a, b) => a + b, 0);
  const daysLeft = nextPaydayForecast(s).daysLeft;
  return nextPaydayForecast(s, today + perDay * Math.max(0, daysLeft - 1));
}
