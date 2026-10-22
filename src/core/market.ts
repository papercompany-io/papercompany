// RV·시장 시뮬레이션(Claude 제안, PD-02/04·RV-01 확장):
// 시장 수요(잠재 고객 × 도입률 × 경기) → 매력도·인지도·가격으로 나눈 점유율 → 목표 고객 수.
// 고객은 목표를 향해 획득 속도(입소문·광고·영업)만큼 늘고, 이탈률(버그·가격·고객지원·경쟁)만큼 줄어듭니다.
import { DATA, industry, market, MARKET_IDS, priceTierDef, type IndustryDef } from './data';
import { yearFrac } from './calendar';
import { econ } from './economy';
import { spendNow } from './finance';
import { mod } from './mods';
import { news, notify } from './notify';
import { appeal, canCharge, fxTotals, hasMvp, type FxTotals } from './product';
import { adDay, campaignDay, endCampaigns, fullInform, recordAdStats, recordCampaigns, setTotalAdBudget } from './ads';
import type { GameState, MarketId } from './types';

const M = DATA.markets;

export function adoption(ind: IndustryDef, day: number): number {
  const a = ind.adoption;
  const t = yearFrac(day);
  return a.a0 + (a.a1 - a.a0) / (1 + Math.exp(-a.k * (t - a.mid)));
}

// 시장 m의 전체 수요(이 제품군을 쓰려는 사람·회사 수)
export function demand(s: GameState, m: MarketId): number {
  const ind = industry(s.company.industry);
  return ind.tam * market(m).tamMult * adoption(ind, s.day) * econ(s, 'demand');
}

function weightOf(appealV: number, awareness: number, tier: string): number {
  const pt = priceTierDef(tier);
  return awareness * Math.pow(Math.max(0.1, appealV * pt.appeal), M.shareExponent);
}

// 시장 점유율(인지도·매력도·가격 반영 로짓 비슷한 비중)
export function shares(s: GameState, m: MarketId): { player: number; comps: { id: string; name: string; share: number }[] } {
  const ms = s.markets[m];
  const wp = ms.launched ? weightOf(appeal(s), ms.awareness, s.product.priceTier) : 0;
  const comp = market(m).comp;
  const cw = s.competitors
    .filter((c) => c.alive && c.markets.includes(m))
    .map((c) => {
      const boost = c.boostUntil !== null && c.boostUntil > s.day ? 1.25 : 1;
      return { id: c.id, name: c.name, w: weightOf(c.appeal * boost, Math.min(1, c.awareness * comp), c.priceTier) };
    });
  // 현지 기업·대체재 몫(A-47): 경쟁사 평균 매력도 기준, 해외일수록(comp) 큽니다. 한 회사가 시장을 다 먹지 못하게 합니다.
  const alive = s.competitors.filter((c) => c.alive);
  const ref = alive.length ? alive.reduce((a, c) => a + c.appeal, 0) / alive.length : 20;
  const outside = market(m).local * Math.pow(Math.max(10, ref), M.shareExponent);
  const total = wp + cw.reduce((a, c) => a + c.w, 0) + outside;
  return { player: wp / total, comps: cw.map((c) => ({ id: c.id, name: c.name, share: c.w / total })) };
}

export function totalUsers(s: GameState): number {
  return MARKET_IDS.reduce((a, m) => a + s.markets[m].users, 0);
}

export function launchedMarkets(s: GameState): MarketId[] {
  return MARKET_IDS.filter((m) => s.markets[m].launched);
}

// 사용자 1명(곳)당 월 매출(시장별) — 구독·광고·거래 수수료 나눠서
export function revenuePerUser(s: GameState, m: MarketId, fx: FxTotals = fxTotals(s)) {
  const ind = industry(s.company.industry);
  const pt = priceTierDef(s.product.priceTier);
  const arpuM = market(m).arpu * (1 + mod(s, 'price'));
  const payShare = Math.min(1, ind.payBase + fx.pay);
  // 결제 기능 전(A-111)에는 무료로만 쓰므로 구독·거래 수수료가 없습니다. 광고는 결제와 상관없음
  const charge = canCharge(s, fx) ? 1 : 0;
  const sub = ind.price * pt.price * (1 + fx.arpu) * payShare * arpuM * charge;
  const ad = (ind.adBase + fx.ad) * arpuM;
  const take = ind.gmv * (1 + fx.gmv) * (ind.takeBase + fx.take) * Math.sqrt(pt.price) * arpuM * charge;
  return { sub, ad, take, total: sub + ad + take, payShare };
}

// 사용자 1명(곳)당 월 인프라 비용
export function infraPerUser(s: GameState, fx: FxTotals = fxTotals(s)): number {
  const ind = industry(s.company.industry);
  const dept = deptCoverage(s, 'infra');
  const opt = s.company.orders.infra === 'infra_cost' ? 0.3 * dept : 0.12 * dept;
  return ind.infra * Math.max(0.25, 1 + fx.infra) * (1 - opt) * (1 + mod(s, 'infra'));
}

// 고객지원·인프라처럼 사용자 수에 비례해 사람이 필요한 부서의 충족도(0~1)
export function deptCoverage(s: GameState, d: 'cs' | 'infra'): number {
  const cap = DATA.depts.departments.find((x) => x.id === d)!.cap as Record<string, number>;
  const users = totalUsers(s);
  if (users <= 0) return 1;
  const out = s.employees.filter((e) => e.dept === d && !isAbsent(s, e.id)).length;
  const need = users / cap[s.company.industry];
  return Math.min(1, out / Math.max(0.5, need));
}

function isAbsent(s: GameState, id: string) {
  const e = s.employees.find((x) => x.id === id);
  return !!e && e.sickUntil !== null && e.sickUntil > s.day;
}

export interface DayPush {
  salesPush: number; // 세일즈 출력(직원+대표)
  mktOutput: number; // 마케팅팀 출력
  retention: number; // 리텐션 캠페인 출력
  contentAwareness: number; // 콘텐츠·브랜드로 오르는 인지도(하루)
}

// 하루 시장 처리: 인지도, 획득, 이탈, 매출 누적
export function marketDay(s: GameState, push: DayPush) {
  if (!hasMvp(s)) return;
  endCampaigns(s);
  const ind = industry(s.company.industry);
  const fx = fxTotals(s);
  const pt = priceTierDef(s.product.priceTier);
  const csCov = deptCoverage(s, 'cs');
  const csFocus = s.company.orders.cs === 'cs_support' ? 1 : 0.6;
  const userCount = totalUsers(s);
  // 고객지원이 모자라면 사용자가 많을수록 이탈이 늘어납니다.
  const csFx = userCount < 50 ? 0 : -0.3 * csCov * csFocus + 0.8 * (1 - csCov) * Math.min(1, userCount / 2000);
  const mktEff = 1 + 0.25 * Math.pow(push.mktOutput, 0.75);
  for (const m of MARKET_IDS) {
    const ms = s.markets[m];
    if (!ms.launched) continue;
    const md = market(m);
    const D = demand(s, m);
    // 광고(A-116): 채널별 예산·캠페인 → 알리기 몫은 인지도, 바로 데려오기 몫은 광고 고객
    const ad = adDay(s, m);
    const cp = campaignDay(s, m);
    const full = fullInform(s, m);
    const awAd = ((ad.aware * mktEff) / full) * (1 - ms.awareness);
    const awCp = (cp.aware / full) * (1 - ms.awareness);
    ms.awareness += awAd + awCp;
    let gotAd = 0;
    let gotCp = 0;
    const word = ind.viral * (1 + fx.viral * 10) * Math.sqrt(Math.min(1, ms.users / Math.max(1, D))) * 0.02;
    ms.awareness += (push.contentAwareness / Math.sqrt(md.tamMult) + word) * (1 - ms.awareness);
    ms.awareness -= ms.awareness * M.awarenessDecayPerDay;
    // 쓰는 사람은 이미 알고, 주변에도 말합니다(A-95): 인지도는 사용자 비중의 일정 배수 아래로 내려가지 않습니다.
    ms.awareness = Math.max(0, Math.min(1, Math.max(ms.awareness, (ms.users / Math.max(1, D)) * M.userAwareness)));
    const sh = shares(s, m).player;
    ms.peakShare = Math.max(ms.peakShare, sh);
    const target = D * sh;
    const day = { inbound: 0, viral: 0, sales: 0, paid: 0, lost: 0 };
    // 획득(A-48): 스스로 찾아오는 고객 + 입소문 + 세일즈 계약 + 광고로 산 고객(CAC). 목표(점유율 × 수요)까지만.
    if (target > ms.users) {
      const gap = target - ms.users;
      const acqM = econ(s, 'acq') * (1 + mod(s, 'acq'));
      const foreign = m === 'kr' ? 1 : M.foreign;
      // 아무도 모르는 서비스는 검색되지 않습니다(A-95). 인지도가 오르거나, 쓰는 사람이 쌓여 순위·검색에 걸리면 스스로 찾아옵니다.
      const found = Math.min(1, Math.max(ms.awareness / M.discoveryAwareness, Math.sqrt(ms.users / M.discoveryUsers)));
      const inbound = gap * ind.baseAcq * (1 + fx.conv) * foreign * found;
      const viral = ((ms.users * ind.viral * (1 + fx.viral * 10)) / 30) * Math.min(1, gap / Math.max(1, D)) * foreign;
      const sales = push.salesPush * ind.salesPer * (m === 'kr' ? 1 : 0.6) * Math.min(2, Math.max(0.3, appeal(s) / 25));
      const cac = ind.cac * md.arpu * (1 + 3 * sh) / Math.min(2.5, mktEff);
      // 광고로 사는 고객은 하루 수요의 0.1%에서 포화(돈을 더 써도 덜 늘어남)
      const cap = D * 0.001;
      const paidAd = ad.direct > 0 ? cap * (1 - Math.exp(-ad.direct / cac / Math.max(1, cap))) : 0;
      // 캠페인은 짧게 몰아서: 상한을 두 배로
      const paidCp = cp.direct > 0 ? 2 * cap * (1 - Math.exp(-cp.direct / cac / Math.max(1, 2 * cap))) : 0;
      const paid = paidAd + paidCp;
      const raw = (inbound + viral + sales + paid) * acqM;
      const got = Math.min(gap * 0.05, raw);
      const k = raw > 0 ? got / raw : 0;
      Object.assign(day, { inbound: inbound * acqM * k, viral: viral * acqM * k, sales: sales * acqM * k, paid: paid * acqM * k });
      ms.users += got;
      gotAd = paidAd * acqM * k;
      gotCp = paidCp * acqM * k;
    }
    recordAdStats(s, m, ad.parts, gotAd, awAd);
    recordCampaigns(cp.list, gotCp, awCp);
    // 이탈
    const bugF = 1 + s.product.bugs / 45;
    const churnM = ind.churnM * pt.churn * Math.max(0.3, 1 + fx.churn + csFx + mod(s, 'churn') - 0.04 * Math.pow(push.retention, 0.6)) * bugF * econ(s, 'churn');
    let lost = ms.users * (churnM / 30);
    if (ms.users > target) lost += (ms.users - target) * 0.012;
    ms.users = Math.max(0, ms.users - lost);
    day.lost = lost;
    // 성장 분석용 이동 평균(약 2주)
    const f = ms.flow ?? { target, ...day };
    const a = 1 / 14;
    ms.flow = {
      target,
      inbound: f.inbound + (day.inbound - f.inbound) * a,
      viral: f.viral + (day.viral - f.viral) * a,
      sales: f.sales + (day.sales - f.sales) * a,
      paid: f.paid + (day.paid - f.paid) * a,
      lost: f.lost + (day.lost - f.lost) * a,
    };
    // 매출 누적(일할)
    const rpu = revenuePerUser(s, m, fx);
    s.accrual.revSub += (ms.users * rpu.sub) / 30;
    s.accrual.revAd += (ms.users * rpu.ad) / 30;
    s.accrual.revTake += (ms.users * rpu.take) / 30;
    s.accrual.infra += (ms.users * infraPerUser(s, fx)) / 30;
  }
  const u = totalUsers(s);
  s.company.peakUsers = Math.max(s.company.peakUsers, u);
}

// 해외 진출(시장 메뉴): 현지화 기능 + 진출 비용
export function launchBlock(s: GameState, m: MarketId): string | null {
  if (s.markets[m].launched) return '이미 진출했습니다.';
  if (!hasMvp(s)) return 'MVP가 먼저 필요합니다.';
  if (!fxTotals(s).markets.includes(m)) return '이 시장용 현지화 기능을 먼저 만들어야 합니다(제품 메뉴).';
  if (s.cash < market(m).entry) return '진출 비용이 부족합니다.';
  return null;
}

export function launchMarket(s: GameState, m: MarketId): string | null {
  const err = launchBlock(s, m);
  if (err) return err;
  const md = market(m);
  spendNow(s, `${md.name} 진출 비용(현지 법인·마케팅)`, md.entry, 'other');
  s.markets[m].launched = true;
  s.markets[m].launchedDay = s.day;
  s.markets[m].awareness = 0.02;
  notify(s, `${md.flag} ${md.name} 시장에 진출했습니다!`, 'mission', 'market');
  news(s, `[해외] ${s.company.name}, ${md.name} 시장 진출`, 'company');
  s.events.push({ type: 'confetti' });
  return null;
}

// 총예산 한 번에(봇·예전 호출): 채널 비율대로 나눔(A-116)
export function setAdBudget(s: GameState, m: MarketId, monthly: number) {
  setTotalAdBudget(s, m, monthly);
}
