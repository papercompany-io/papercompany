// FN-01 다음 월급일 예상 자금(A-33): 남은 날의 대표 행동 칸 비용과 지금 하루 흐름(매출·인프라·AI·광고)까지 넣어 계산합니다.
import { DATA, MARKET_IDS } from './data';
import { daySchedule } from './ceo';
import { nextPaydayForecast } from './finance';
import { aiMonthlyCost } from './aiadopt';
import { fxTotals, hasMvp } from './product';
import { infraPerUser, revenuePerUser } from './market';
import type { ActionId, GameState } from './types';

function slotCost(s: GameState, a: ActionId | null): number {
  const C = DATA.ceo;
  if (a === 'sales') return hasMvp(s) ? C.salesEntertainment : 0;
  if (a === 'network') return C.networkEntertainment;
  if (a === 'enterprise') return C.enterpriseEntertainment;
  return 0;
}

export function dailyRates(s: GameState) {
  const fx = fxTotals(s);
  let revenue = 0;
  let users = 0;
  let ads = 0;
  for (const m of MARKET_IDS) {
    const ms = s.markets[m];
    if (!ms.launched) continue;
    revenue += (ms.users * revenuePerUser(s, m, fx).total) / 30;
    users += ms.users;
    ads += ms.adBudget / 30;
  }
  return { revenue, infra: (users * infraPerUser(s, fx)) / 30, ai: aiMonthlyCost(s) / 30, ads };
}

export function paydayForecast(s: GameState) {
  const sched = daySchedule(s).map((x) => (x.locked ? 0 : slotCost(s, x.action)));
  const perDay = sched.reduce((a, b) => a + b, 0);
  const done = s.slotsDone;
  const today = sched.slice(done).reduce((a, b) => a + b, 0);
  const rates = dailyRates(s);
  const daysLeft = nextPaydayForecast(s, rates).daysLeft;
  return nextPaydayForecast(s, rates, today + perDay * Math.max(0, daysLeft - 1));
}
