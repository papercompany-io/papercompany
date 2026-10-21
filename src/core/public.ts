// 상장사(Claude 제안): IPO 공모, 매일 주가(공정가치 × 시장 심리 + 변동), 분기 실적과 가이던스, 락업 뒤 창업자 지분 매각, 대표 사임.
import { DATA, industry } from './data';
import { quarterLabel } from './calendar';
import { econ } from './economy';
import { founderShares, recordEquity, totalShares } from './equity';
import { book } from './finance';
import { finishCompany } from './career';
import { news, notify } from './notify';
import { rand, randRange } from './rng';
import { revenueGrowth } from './valuation';
import type { GameState } from './types';

const P = DATA.public;

function gauss(s: GameState): number {
  const u = Math.max(1e-9, rand(s));
  const v = rand(s);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function goPublic(s: GameState, ipoValue: number) {
  const existing = totalShares(s.capTable);
  const price = ipoValue / existing;
  const newShares = Math.round((existing * P.ipoNewShares) / (1 - P.ipoNewShares));
  s.capTable.push({ holderId: 'public', name: '일반 주주(공모)', kind: 'public', shares: newShares, round: 'IPO' });
  const raised = newShares * price;
  book(s, `IPO 공모 자금(수수료 ${P.ipoFee * 100}% 제외)`, Math.round(raised * (1 - P.ipoFee)));
  s.accrual.investment += raised;
  s.public = {
    ipoDay: s.day,
    price,
    fair: price,
    sentiment: 1.05,
    lockupUntil: s.day + P.lockupDays,
    history: [{ day: s.day, price }],
    guidance: null,
    quarterStartRev: 0,
    lastQuarter: null,
    founderSold: 0,
    founderSoldShares: 0,
    buybacks: 0,
  };
  s.company.stage = 5;
  recordEquity(s, 'IPO 공모');
  news(s, `[상장] ${s.company.name}, 코스닥 상장… 공모가 기준 시가총액 ${Math.round((price * (existing + newShares)) / 1e8).toLocaleString('ko-KR')}억원`, 'public');
  notify(s, `상장 성공! 공모로 ${Math.round(raised / 1e8).toLocaleString('ko-KR')}억원을 조달했습니다. ${P.lockupDays}일 락업 뒤 주식 앱에서 지분을 팔 수 있습니다.`, 'mission', 'stock');
  s.events.push({ type: 'confetti' });
  s.events.push({ type: 'autosave', reason: '상장' });
}

// 공정 주가: 연 환산 매출 × 배수(성장·경기) 또는 이익 × PER 중 큰 값 ÷ 주식 수
export function fairPrice(s: GameState): number {
  const h = s.plHistory.slice(-3);
  const rev = h.length ? (h.reduce((a, m) => a + m.revenue, 0) / h.length) * 12 : 0;
  const op = h.length ? (h.reduce((a, m) => a + m.operatingProfit, 0) / h.length) * 12 : 0;
  const g = revenueGrowth(s) ?? 0;
  const mult = industry(s.company.industry).valMult * (g >= 0.05 ? 1.6 : g >= 0.02 ? 1.25 : g >= 0 ? 1 : 0.7) * econ(s, 'valuation');
  const value = Math.max(rev * mult, op * P.peBase * econ(s, 'valuation')) + Math.max(0, s.cash);
  return Math.max(1, value / totalShares(s.capTable));
}

export function publicDay(s: GameState) {
  const p = s.public;
  if (!p) return;
  p.fair = fairPrice(s);
  p.sentiment += (1 - p.sentiment) * 0.004;
  const target = p.fair * p.sentiment;
  p.price = Math.max(1, p.price * Math.exp(gauss(s) * P.dailyVol) + (target - p.price) * P.sentimentPull);
  if (s.day % 7 === 0) {
    p.history.push({ day: s.day, price: p.price });
    if (p.history.length > P.historyCap) p.history.splice(0, p.history.length - P.historyCap);
  }
  if (s.day === p.lockupUntil) notify(s, '락업이 풀렸습니다. 이제 주식 앱에서 내 지분을 팔 수 있습니다.', 'good', 'stock');
}

// 분기 시작일: 지난 분기 실적 발표(가이던스 대비) → 주가 반응, 새 가이던스는 보통으로 자동(주식 앱에서 바꿀 수 있음)
export function publicQuarter(s: GameState) {
  const p = s.public;
  if (!p) return;
  const q = s.plHistory.slice(-3);
  const rev = q.reduce((a, m) => a + m.revenue, 0);
  let beat: boolean | null = null;
  if (p.guidance !== null && s.day - p.ipoDay > 80) {
    beat = rev >= p.guidance;
    const [lo, hi] = beat ? P.beatJump : P.missDrop;
    const move = randRange(s, lo, hi) * (beat ? 1 : -1);
    p.price *= 1 + move;
    p.sentiment = Math.max(0.5, Math.min(1.8, p.sentiment * (1 + move * 0.6)));
    news(s, `[실적] ${s.company.name} ${quarterLabel(s.day - 2)} 매출 ${Math.round(rev / 1e8).toLocaleString('ko-KR')}억원 — 가이던스 ${beat ? '상회' : '하회'}, 주가 ${beat ? '급등' : '급락'}`, 'public');
    notify(s, `분기 실적: 매출 ${Math.round(rev / 1e8).toLocaleString('ko-KR')}억원으로 가이던스(${Math.round(p.guidance / 1e8).toLocaleString('ko-KR')}억원)를 ${beat ? '넘었습니다. 주가가 올랐습니다' : '밑돌았습니다. 주가가 떨어졌습니다'}.`, beat ? 'good' : 'bad', 'stock');
  }
  p.lastQuarter = { label: quarterLabel(s.day - 2), revenue: rev, guidance: p.guidance, beat };
  p.quarterStartRev = rev;
  setGuidance(s, 'normal', true);
}

export function setGuidance(s: GameState, optId: string, auto = false): string | null {
  const p = s.public;
  if (!p) return '상장사가 아닙니다.';
  const o = P.guidanceOptions.find((x) => x.id === optId);
  if (!o) return '없는 선택지입니다.';
  const base = p.quarterStartRev || s.plHistory.slice(-3).reduce((a, m) => a + m.revenue, 0);
  p.guidance = Math.round(base * (1 + o.growth));
  if (!auto) p.sentiment = Math.max(0.5, Math.min(1.8, p.sentiment + o.sentiment));
  return null;
}

// 창업자 지분 매각(락업 뒤): 대량 매각 할인 + 매각 비율만큼 주가 하락
export function sellPreview(s: GameState, fraction: number) {
  const p = s.public!;
  const shares = Math.floor(founderShares(s) * fraction);
  const pctOfCompany = shares / totalShares(s.capTable);
  const proceeds = shares * p.price * (1 - P.sellBlockDiscount);
  const impact = pctOfCompany * 100 * P.sellPriceImpactPerPct;
  return { shares, proceeds: Math.round(proceeds), impact };
}

export function sellShares(s: GameState, fraction: number): string | null {
  const p = s.public;
  if (!p) return '상장사가 아닙니다.';
  if (s.day < p.lockupUntil) return `락업 기간입니다(${p.lockupUntil - s.day}일 남음).`;
  if (fraction <= 0 || fraction > 1) return '팔 비율을 정하세요.';
  const pv = sellPreview(s, fraction);
  if (pv.shares <= 0) return '팔 주식이 없습니다.';
  const f = s.capTable.find((c) => c.kind === 'founder')!;
  f.shares -= pv.shares;
  const pub = s.capTable.find((c) => c.kind === 'public')!;
  pub.shares += pv.shares;
  p.price *= 1 - pv.impact;
  p.sentiment = Math.max(0.5, p.sentiment - pv.impact * 0.5);
  p.founderSold += pv.proceeds;
  p.founderSoldShares += pv.shares;
  s.career.wealth += pv.proceeds;
  recordEquity(s, `창업자 지분 매각 ${pv.shares.toLocaleString('ko-KR')}주`);
  news(s, `[공시] ${s.company.name} 대표, 보유 주식 ${pv.shares.toLocaleString('ko-KR')}주 매각`, 'public');
  notify(s, `지분을 팔아 ${Math.round(pv.proceeds / 1e8).toLocaleString('ko-KR')}억원을 개인 자산으로 받았습니다.`, 'good', 'stock');
  return null;
}

// 자사주 매입: 회사 돈으로 유통 주식을 사서 소각 → 주당 가치↑
export function buyback(s: GameState, amount: number): string | null {
  const p = s.public;
  if (!p) return '상장사가 아닙니다.';
  if (amount <= 0 || amount > s.cash * 0.5) return '보유 자금의 50%까지만 쓸 수 있습니다.';
  const pub = s.capTable.find((c) => c.kind === 'public')!;
  const shares = Math.min(pub.shares, Math.floor(amount / p.price));
  if (shares <= 0) return '살 주식이 없습니다.';
  pub.shares -= shares;
  book(s, '자사주 매입', -shares * p.price);
  p.sentiment = Math.min(1.8, p.sentiment + 0.03);
  p.buybacks += shares * p.price;
  recordEquity(s, `자사주 ${shares.toLocaleString('ko-KR')}주 매입·소각`);
  return null;
}

// 대표 사임: 남은 지분을 블록딜로 넘기고 이 회사를 마칩니다.
export function resignPreview(s: GameState) {
  const p = s.public!;
  const shares = founderShares(s);
  return { shares, proceeds: Math.round(shares * p.price * (1 - P.resignDiscount)) };
}

export function resign(s: GameState): string | null {
  const p = s.public;
  if (!p) return '상장사가 아닙니다.';
  if (s.day < p.lockupUntil) return `락업 기간입니다(${p.lockupUntil - s.day}일 남음).`;
  const pv = resignPreview(s);
  const fp = pv.shares / totalShares(s.capTable);
  finishCompany(s, 'ipo_exit', p.founderSold + pv.proceeds, { exitValue: p.price * totalShares(s.capTable), founderPct: fp, alreadyPaid: p.founderSold });
  return null;
}

export function marketCap(s: GameState): number {
  return s.public ? s.public.price * totalShares(s.capTable) : 0;
}
