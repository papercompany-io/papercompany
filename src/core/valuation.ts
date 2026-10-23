// VL-01 기업가치 산정(DEC-035): 매출 전 스코어카드 → 매출 배수(산업 기준 × 성장률 × 경기) → 흑자 지속 시 이익 배수와 비교.
// 상장사는 시가총액(주가 × 주식 수)이 기업가치입니다.
import { DATA, industry, specCreditsSpent, specEffects } from './data';
import { econ } from './economy';
import { totalShares } from './equity';
import { mod } from './mods';
import { debtBalance } from './finance';
import { appeal, coreFeatures, featureLevel, hasMvp } from './product';
import { totalUsers } from './market';
import type { GameState } from './types';

const V = DATA.valuation;

const clampF = (x: number) => Math.max(V.factorMin, Math.min(V.factorMax, x));

export interface ValuationResult {
  value: number;
  business: number;
  cash: number;
  method: 'scorecard' | 'revenue' | 'profit' | 'market';
  penalty: boolean;
  detail: string[];
  multiple: number | null;
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
      fx.teamScore +
      Math.min(0.3, s.career.rep * 0.005),
  );
  const market = clampF(V.market.base + Math.sqrt(totalUsers(s)) * V.market.perCustomer);
  const cores = coreFeatures(s);
  const coreDone = cores.filter((f) => featureLevel(s, f.id) >= 1).length / Math.max(1, cores.length);
  const product = clampF(V.product.base + coreDone * 0.5 + appeal(s) * V.product.perPoint);
  const sales = clampF(V.salesFactor.base + s.networkPoints * V.salesFactor.perNetworkPoint);
  const other = 1.0;
  const w = V.weights;
  const score = team * w.team + market * w.market + product * w.product + sales * w.sales + other * w.other;
  return { team, market, product, sales, other, score };
}

// 최근 3개월 월평균 매출 성장률
export function revenueGrowth(s: GameState): number | null {
  const h = s.plHistory;
  if (h.length < 2) return null;
  const n = Math.min(3, h.length - 1);
  const a = h[h.length - 1 - n].revenue;
  const b = h[h.length - 1].revenue;
  if (a <= 0) return b > 0 ? 0.3 : null;
  return Math.pow(b / a, 1 / n) - 1;
}

// 매출 기록 기간(A-165): 첫 매출이 난 달부터 센 개월 수
export function revenueMonths(s: GameState): number {
  const i = s.plHistory.findIndex((m) => m.revenue > 0);
  return i < 0 ? 0 : s.plHistory.length - i;
}

// 매출 기록 기간 할인 계수(A-165): 첫 매출 base → months개월째 1. 매출이 막 생긴 회사는 성장률이 늘 높게 나와 배수를 과하게 받으므로 기록이 쌓일 때까지 깎음
export function trackFactor(s: GameState): number {
  const t = V.track;
  return Math.min(1, t.base + ((1 - t.base) * revenueMonths(s)) / t.months);
}

// 고객 수 규모 할인 계수(A-169): 고객 수가 ref보다 적을수록 깎음. 소수 고객의 매출을 12배 해 높은 배수를 주는 것을 막음
export function scaleFactor(users: number): number {
  const t = V.scale;
  return Math.min(1, Math.pow(Math.max(0, users) / t.ref, t.power));
}

export function revenueMultiple(s: GameState): { multiple: number; detail: string } {
  const base = industry(s.company.industry).valMult;
  const g = revenueGrowth(s);
  const gm = g === null ? 1.2 : g >= 0.15 ? 1.6 : g >= 0.08 ? 1.35 : g >= 0.03 ? 1.15 : g >= 0 ? 1.0 : 0.7;
  const e = econ(s, 'valuation');
  const tf = trackFactor(s);
  const sf = scaleFactor(totalUsers(s));
  const m = base * gm * e * tf * sf * (1 + mod(s, 'valuation'));
  return { multiple: m, detail: `매출 배수 ${m.toFixed(1)}배 = 산업 기준 ${base} × 성장(${g === null ? '첫 매출' : (g * 100).toFixed(1) + '%/월'}) ${gm} × 경기 ${e.toFixed(2)} × 매출 기록 ${tf.toFixed(2)}(${revenueMonths(s)}개월) × 규모 ${sf.toFixed(2)}` };
}

export function revenueMethod(s: GameState): { business: number; method: 'revenue' | 'profit'; detail: string[]; multiple: number } | null {
  const hist = s.plHistory;
  const last = hist[hist.length - 1];
  if (!last || last.revenue <= 0) return null;
  const rm = revenueMultiple(s);
  const detail = [rm.detail, `연 환산 매출 ${(last.revenue * 12).toLocaleString('ko-KR')}원 × ${rm.multiple.toFixed(1)}`];
  let business = last.revenue * 12 * rm.multiple;
  let method: 'revenue' | 'profit' = 'revenue';
  const uv = userValue(s);
  if (uv > business) {
    detail.push(`사용자 기반 평가 ${Math.round(uv).toLocaleString('ko-KR')}원이 더 커서 그 값을 씁니다`);
    business = uv;
  }
  const streak = hist.slice(-V.profitStreakMonths);
  if (streak.length === V.profitStreakMonths && streak.every((m) => m.operatingProfit > 0)) {
    const pm = V.profitMultiple * econ(s, 'valuation');
    const profitValue = last.operatingProfit * 12 * pm;
    detail.push(`흑자 ${V.profitStreakMonths}개월 → 연 환산 영업이익 × ${pm.toFixed(1)} = ${Math.round(profitValue).toLocaleString('ko-KR')}원`);
    if (profitValue > business) {
      business = profitValue;
      method = 'profit';
    }
  }
  return { business, method, detail, multiple: rm.multiple };
}

// 사용자 기반 평가(A-49): 아직 매출이 작은 성장 기업은 사용자 수 × 사용자당 가치 × 성장으로도 봅니다.
export function userValue(s: GameState): number {
  const g = revenueGrowth(s);
  const gm = g === null ? 1 : g >= 0.1 ? 1.5 : g >= 0.03 ? 1.15 : g >= 0 ? 0.9 : 0.6;
  return totalUsers(s) * industry(s.company.industry).userValue * gm * econ(s, 'valuation') * trackFactor(s);
}

// 매출 전 실체 계수(A-81): 아이디어만 있는 회사는 가치가 거의 없고, 핵심 기능·MVP·팀·사용자가 생길수록 스코어카드 가치를 인정받습니다.
export function proofFactor(s: GameState): number {
  const p = V.proof;
  const cores = coreFeatures(s);
  const coreDone = cores.filter((f) => featureLevel(s, f.id) >= 1).length / Math.max(1, cores.length);
  const staff = s.employees.length;
  const v = p.base + coreDone * p.core + (hasMvp(s) ? p.mvp : 0) + Math.min(p.staffCap, staff * p.perStaff) + Math.min(p.userCap, Math.sqrt(totalUsers(s)) * p.perSqrtUser);
  return Math.min(1, v);
}

export function scorecardValue(s: GameState): { business: number; detail: string[] } {
  const sc = scorecard(s);
  const uv = userValue(s);
  const pf = proofFactor(s);
  const sv = V.baseValue * sc.score * pf * econ(s, 'valuation');
  if (uv > sv)
    return { business: uv, detail: [`사용자 기반 평가: 사용자 ${Math.round(totalUsers(s)).toLocaleString('ko-KR')} × ${industry(s.company.industry).userValue.toLocaleString('ko-KR')}원 × 성장·경기`] };
  return {
    business: sv,
    detail: [
      `스코어카드 점수 ${sc.score.toFixed(3)} (팀 ${sc.team.toFixed(2)}, 시장 ${sc.market.toFixed(2)}, 제품 ${sc.product.toFixed(2)}, 영업 ${sc.sales.toFixed(2)}) × 기준 ${(V.baseValue / 1e8).toFixed(0)}억원 × 실체 ${(pf * 100).toFixed(0)}% × 경기`,
      '실체: 핵심 기능·MVP 출시·팀·사용자가 생길수록 오릅니다',
    ],
  };
}

export function computeValuation(s: GameState): ValuationResult {
  if (s.public) {
    const cap = s.public.price * totalShares(s.capTable);
    return { value: Math.round(cap), business: Math.round(cap - s.cash), cash: s.cash, method: 'market', penalty: false, detail: [`시가총액 = 주가 ${Math.round(s.public.price).toLocaleString('ko-KR')}원 × ${totalShares(s.capTable).toLocaleString('ko-KR')}주`], multiple: null };
  }
  let business: number;
  let method: ValuationResult['method'];
  let detail: string[];
  let multiple: number | null = null;
  const rev = s.valuation.revenueStage && hasMvp(s) ? revenueMethod(s) : null;
  if (rev) {
    ({ business, method, detail, multiple } = rev);
  } else {
    ({ business, detail } = scorecardValue(s));
    method = 'scorecard';
  }
  detail = [...detail, `+ 보유 자금 ${Math.round(s.cash).toLocaleString('ko-KR')}원`];
  let value = business + Math.max(0, s.cash);
  // A-137 남은 대출은 회사가 갚아야 할 돈이라 가치에서 뺍니다
  const debt = debtBalance(s);
  if (debt > 0) {
    // 빚이 커도 사업 자체의 가치는 남습니다(사업가치 × valueFloor 아래로는 안 내려감). 0이 되면 주당 가격이 0이라 라운드 주식 수가 깨짐
    value = Math.max(business * DATA.finance.loan.valueFloor, value - debt);
    detail.push(`− 갚을 대출 ${Math.round(debt).toLocaleString('ko-KR')}원`);
  }
  const penalty = s.valuation.penaltyUntil !== null && s.day < s.valuation.penaltyUntil;
  if (penalty) {
    value *= DATA.exit.failPenaltyFactor;
    detail.push(`Exit 실패 여파 × ${DATA.exit.failPenaltyFactor}`);
  }
  value = Math.max(0, Math.round(value));
  return { value, business: Math.round(business), cash: s.cash, method, penalty, detail, multiple };
}

export function updateStoredValuation(s: GameState) {
  if (!s.valuation.revenueStage) {
    const rev = revenueMethod(s);
    if (rev && rev.business >= scorecardValue(s).business) s.valuation.revenueStage = true;
  }
  s.valuation.stored = computeValuation(s).value;
  s.valuation.storedDay = s.day;
  s.company.maxValuation = Math.max(s.company.maxValuation, s.valuation.stored);
}
