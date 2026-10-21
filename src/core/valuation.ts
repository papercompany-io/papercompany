// VL-01 기업가치 산정(DEC-035): 매출 전 스코어카드 → 매출 배수 → 흑자 지속 시 이익 배수와 비교
import { DATA, specCreditsSpent, specEffects } from './data';
import type { GameState } from './types';

const V = DATA.valuation;

const clampF = (x: number) => Math.max(V.factorMin, Math.min(V.factorMax, x));

export interface ValuationResult {
  value: number; // 기업가치 = 사업가치 + 보유 자금
  business: number;
  cash: number;
  method: 'scorecard' | 'revenue' | 'profit';
  penalty: boolean;
  detail: string[];
}

export function scorecard(s: GameState) {
  const fx = specEffects(s.founder.picks);
  const staff = s.employees.filter((e) => e.kind === 'staff').length;
  const t = V.team;
  const team = clampF(
    t.base +
      specCreditsSpent(s.founder.picks) * t.perSpecCredit +
      (s.employees.some((e) => e.kind === 'cofounder') ? t.cofounder : 0) +
      (s.employees.some((e) => e.kind === 'engineer') ? t.engineer : 0) +
      Math.min(t.employeeCap, staff * t.perEmployee) +
      fx.teamScore,
  );
  const market = clampF(V.market.base + Math.floor(s.customers) * V.market.perCustomer);
  const product = clampF(V.product.base + s.productPoints * V.product.perPoint);
  const sales = clampF(V.salesFactor.base + s.networkPoints * V.salesFactor.perNetworkPoint);
  const other = 1.0;
  const w = V.weights;
  const score = team * w.team + market * w.market + product * w.product + sales * w.sales + other * w.other;
  return { team, market, product, sales, other, score };
}

// 매출 배수 방식(매출 발생 뒤)과 이익 배수 비교(흑자 지속 뒤)
export function revenueMethod(s: GameState): { business: number; method: 'revenue' | 'profit'; detail: string[] } | null {
  const hist = s.plHistory;
  const last = hist[hist.length - 1];
  if (!last || last.revenue <= 0) return null;
  const detail: string[] = [];
  const prev = hist.length >= 2 ? hist[hist.length - 2].revenue : 0;
  let multiple: number;
  if (prev <= 0) {
    multiple = V.firstRevenueMultiple;
    detail.push(`첫 매출 달 → 매출 배수 ${multiple}배`);
  } else {
    const growth = (last.revenue - prev) / prev;
    multiple = V.growthTiers.find((g) => growth >= g.minGrowth)!.multiple;
    detail.push(`전월 대비 성장률 ${(growth * 100).toFixed(1)}% → 매출 배수 ${multiple}배`);
  }
  const revValue = last.revenue * 12 * multiple;
  detail.push(`연 환산 매출 ${(last.revenue * 12).toLocaleString('ko-KR')}원 × ${multiple}`);
  let business = revValue;
  let method: 'revenue' | 'profit' = 'revenue';
  const streak = hist.slice(-V.profitStreakMonths);
  if (streak.length === V.profitStreakMonths && streak.every((m) => m.operatingProfit > 0)) {
    const profitValue = last.operatingProfit * 12 * V.profitMultiple;
    detail.push(`흑자 ${V.profitStreakMonths}개월 → 연 환산 영업이익 × ${V.profitMultiple} = ${profitValue.toLocaleString('ko-KR')}원`);
    if (profitValue > revValue) {
      business = profitValue;
      method = 'profit';
    }
  }
  return { business, method, detail };
}

export function scorecardValue(s: GameState): { business: number; detail: string[] } {
  const sc = scorecard(s);
  return {
    business: V.baseValue * sc.score,
    detail: [
      `스코어카드 점수 ${sc.score.toFixed(3)} (팀 ${sc.team.toFixed(2)}, 시장 ${sc.market.toFixed(2)}, 제품 ${sc.product.toFixed(2)}, 영업 ${sc.sales.toFixed(2)}, 기타 ${sc.other.toFixed(2)}) × 기준 ${(V.baseValue / 1e8).toFixed(0)}억원`,
    ],
  };
}

export function computeValuation(s: GameState): ValuationResult {
  let business: number;
  let method: ValuationResult['method'];
  let detail: string[];
  const rev = s.valuation.revenueStage ? revenueMethod(s) : null;
  if (rev) {
    ({ business, method, detail } = rev);
  } else {
    ({ business, detail } = scorecardValue(s));
    method = 'scorecard';
  }
  detail = [...detail, `+ 보유 자금 ${s.cash.toLocaleString('ko-KR')}원`];
  let value = business + s.cash;
  const penalty = s.valuation.penaltyUntil !== null && s.day < s.valuation.penaltyUntil;
  if (penalty) {
    value *= DATA.exit.failPenaltyFactor;
    detail.push(`Exit 실패 여파 × ${DATA.exit.failPenaltyFactor}`);
  }
  value = Math.max(0, Math.round(value));
  return { value, business: Math.round(business), cash: s.cash, method, penalty, detail };
}

// 월 정산 때 갱신. "매출 발생 뒤" 단계는 매출 배수 값이 스코어카드 값에 처음 닿는 정산부터 적용(A-14).
export function updateStoredValuation(s: GameState) {
  if (!s.valuation.revenueStage) {
    const rev = revenueMethod(s);
    if (rev && rev.business >= scorecardValue(s).business) s.valuation.revenueStage = true;
  }
  s.valuation.stored = computeValuation(s).value;
  s.valuation.storedDay = s.day;
}
