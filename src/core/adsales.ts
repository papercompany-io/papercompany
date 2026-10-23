// 광고 판매(A-182): 광고 형식 기능(배너·이미지·비디오)이 만든 광고 자리(하루 노출)를 광고주에게 팝니다.
// A-194(Startup Company 광고 계약 차용): 광고 운영팀이 있으면 광고주 제안 3개가 매일 새로 바뀌고, 채용 흥정(A-167)처럼 단가(eCPM)·기간을 흥정해 계약합니다.
// 계약마다 하루 최소·최대 노출이 있어 사용자가 늘면 최대 노출까지 더 받고, 최소에 못 미치면 그날 계약금이 20% 깎입니다.
// 한 형식의 하루 노출은 단가가 높은 계약부터 채우고(폭포), 남은 자리는 광고 네트워크가 싸게 채웁니다(시장 처리 revenuePerUser가 adPerUser로 받음).
// 계약은 자동 연장(끄기 전까지 같은 조건으로 계속), 기간 중 해지는 위약금. 광고 판매는 메신저·알림을 보내지 않습니다(사용자 요청, A-194).
import { DATA, industry, MARKET_IDS } from './data';
import { econ } from './economy';
import { spendNow } from './finance';
import { countShort, josa, won, wonShort } from './format';
import { nextId } from './ids';
import { adScale, revenuePerUser, totalUsers } from './market';
import { float, news } from './notify';
import { canCharge, fxTotals, hasMvp, quality, type FxTotals } from './product';
import { pick, randRange, weighted } from './rng';
import { orderOutputs } from './staff';
import type { AdFormatId, GameState, MarketId } from './types';

const A = DATA.adsales;
const N = A.nego;
const P = A.penalty;

export interface AdNegoMsg {
  from: 'me' | 'them';
  text: string;
  ecpm?: number;
  days?: number;
  mood?: 'happy' | 'ok' | 'angry';
  patience?: number;
}

export interface AdNego {
  log: AdNegoMsg[];
  patience: number;
  bid: number; // 광고주가 지금 내겠다는 단가(광고주가 원하는 기간 기준)
  last: number | null; // 내가 바로 앞에 부른 단가(같은 기준)
  stall: number;
  final: boolean;
  counter: { ecpm: number; days: number } | null;
}

export interface AdOffer {
  id: string;
  advertiser: string;
  tier: string;
  size?: string; // 하루 노출과 견준 크기(small·even·big, A-194). 예전 제안은 없음
  format: AdFormatId;
  min: number; // 하루 최소 노출(못 미치면 그날 계약금 20% 깎임)
  max: number; // 하루 최대 노출(사용자가 늘어도 여기까지만)
  days: number; // 광고주가 원하는 기간
  open: number; // 첫 제안 단가
  ceil: number; // 광고주가 낼 수 있는 최고 단가(숨김, 원하는 기간 기준)
  since: number; // 들어온 날
  offeredUntil: number;
  left?: boolean; // 협상이 깨져 떠남
  nego?: AdNego;
}

export interface AdDeal {
  id: string;
  advertiser: string;
  tier: string;
  format: AdFormatId;
  min: number;
  max: number;
  ecpm: number;
  days: number; // 한 번 계약 기간(자동 연장도 이 기간씩)
  startDay: number;
  endDay: number; // 지금 기간이 끝나는 날
  autoRenew: boolean;
  renewals: number;
  earned: number; // 지금까지 받은 계약금(화면용)
  shortDays: number; // 최소 노출에 못 미친 날 수(화면용)
  termShort?: number; // 이번 기간에 최소 노출에 못 미친 날 수(기간의 절반을 넘으면 광고주가 연장하지 않음)
  closed?: 'break' | 'lapse'; // 내가 해지함 · 광고주가 연장하지 않음. 끊긴 날에 자동 연장되지 않게
}

export interface AdSalesState {
  offers: AdOffer[];
  deals: AdDeal[];
  nextBatchDay: number; // 다음에 제안이 새로 바뀌는 날
  signed: number;
  optMult: number; // 남는 지면 최적화 배수(하루마다 갱신)
}

export function adSalesOn(s: GameState): boolean {
  return !!industry(s.company.industry).adDeals;
}

export function adFormatDef(id: AdFormatId) {
  return A.formats.find((f) => f.id === id)!;
}

export function adTierDef(id: string) {
  return A.tiers.find((t) => t.id === id)!;
}

const EMPTY: AdSalesState = { offers: [], deals: [], nextBatchDay: 0, signed: 0, optMult: 1 };

// 화면·계산용(읽기만). 상태를 만드는 건 하루 처리(adSalesDay)
export function adSalesOf(s: GameState): AdSalesState {
  return s.adSales ?? EMPTY;
}

export function liveAdDeals(s: GameState): AdDeal[] {
  return adSalesOf(s).deals.filter((d) => !d.closed && d.startDay <= s.day && d.endDay > s.day);
}

export function impsText(n: number): string {
  return `${countShort(n)}회`;
}

const round10 = (v: number) => Math.max(10, Math.round(v / 10) * 10);
const roundImps = (v: number) => {
  const p = Math.pow(10, Math.max(1, Math.floor(Math.log10(Math.max(1, v))) - 1));
  return Math.round(v / p) * p;
};

// 광고를 보는 사람 비율: 프리미엄 구독자는 광고를 보지 않습니다
export function adViewShare(s: GameState, fx: FxTotals = fxTotals(s)): number {
  return canCharge(s, fx) ? Math.max(0, 1 - Math.min(1, industry(s.company.industry).payBase + fx.pay)) : 1;
}

function adUsers(s: GameState): number {
  return MARKET_IDS.reduce((a, m) => a + (s.markets[m].launched ? s.markets[m].users : 0), 0);
}

export interface DealFlow {
  imps: number; // 오늘 내보내는 노출
  pay: number; // 오늘 받는 계약금(최소에 못 미치면 깎인 값)
  short: boolean; // 최소 노출에 못 미침
}

export interface FormatSales {
  id: AdFormatId;
  on: boolean;
  inv: number; // 하루 노출(재고)
  sold: number; // 계약이 가져가는 하루 노출
  soldShare: number; // 재고 중 계약 몫(0~1)
  dealDaily: number; // 계약 하루 매출
  dealMonthly: number; // 계약 매출(월, 하루 × 30)
  minSum: number; // 계약들의 하루 최소 노출 합
}

// 하루 광고 노출 나누기(A-194): 형식마다 단가가 높은 계약부터 최대 노출까지 채우고, 남은 노출은 광고 네트워크로
export function adFlow(s: GameState, fx: FxTotals = fxTotals(s)): { formats: FormatSales[]; deals: Record<string, DealFlow> } {
  const view = adViewShare(s, fx);
  const users = adUsers(s);
  const live = liveAdDeals(s);
  const deals: Record<string, DealFlow> = {};
  const formats = A.formats.map((f) => {
    const id = f.id as AdFormatId;
    const on = fx.adFormats.includes(id);
    const inv = on ? (users * f.imp * view) / 30 : 0;
    const ds = live.filter((d) => d.format === id).sort((a, b) => b.ecpm - a.ecpm || a.startDay - b.startDay);
    let left = inv;
    let sold = 0;
    let dealDaily = 0;
    for (const d of ds) {
      const imps = Math.min(left, d.max);
      left -= imps;
      sold += imps;
      const short = imps < d.min;
      const pay = ((imps * d.ecpm) / 1000) * (short ? P.shortPay : 1);
      dealDaily += pay;
      deals[d.id] = { imps, pay, short };
    }
    return { id, on, inv, sold, soldShare: inv > 0 ? sold / inv : 0, dealDaily, dealMonthly: dealDaily * 30, minSum: ds.reduce((a, d) => a + d.min, 0) };
  });
  return { formats, deals };
}

export function formatSales(s: GameState, fx: FxTotals = fxTotals(s)): FormatSales[] {
  return adFlow(s, fx).formats;
}

// 광고 운영팀이 동시에 맡을 수 있는 계약 수: "광고주 찾기" 출력 × dealsPerOutput(담당자가 있으면 최소 1)
export function adCapacity(s: GameState): number {
  const sell = orderOutputs(s)['ao_sell'] ?? 0;
  return sell > 0 ? Math.max(1, Math.round(sell * A.dealsPerOutput)) : 0;
}

// 사용자 1명(시장 m)당 월 광고 매출: 계약 몫(계약 매출을 노출 수대로 나눔) + 남는 자리(광고 네트워크, 시장 객단가·규모 배율)
export function adPerUser(s: GameState, m: MarketId, arpuM: number, fx: FxTotals = fxTotals(s)): number {
  const view = adViewShare(s, fx);
  const scale = adScale(s.markets[m].users);
  const opt = adSalesOf(s).optMult;
  let out = 0;
  for (const f of formatSales(s, fx)) {
    if (!f.on) continue;
    const def = adFormatDef(f.id);
    const per = def.imp * view; // 1명이 한 달에 보는 노출
    if (f.inv > 0) out += (f.dealDaily * per) / f.inv;
    out += (per * (1 - f.soldShare) * def.ecpm * A.remnant * scale * arpuM * (1 + fx.ecpm) * opt) / 1000;
  }
  return out;
}

// 이번 달 광고 매출 나눠 보기(화면): 계약·광고 네트워크(남는 자리)
export function adRevenueSplit(s: GameState, fx: FxTotals = fxTotals(s)) {
  const deals = formatSales(s, fx).reduce((a, f) => a + f.dealMonthly, 0);
  const all = MARKET_IDS.reduce((a, m) => a + (s.markets[m].launched ? s.markets[m].users * revenuePerUser(s, m, fx).ad : 0), 0);
  return { deals, network: Math.max(0, all - deals) };
}

// 기간 배율: 광고주가 원하는 기간(wanted)과 다른 기간(days)으로 계약하면 광고주가 낼 수 있는 단가가 몇 배가 되나.
// 협상은 내가 부른 단가 ÷ 이 배율을 광고주의 지금 단가와 비교하고, 광고주 역제안 단가에 이 배율을 곱합니다.
// TODO(human): 기간 배율 모양 정하기. 지금은 임시로 "원하는 기간에서 멀어질수록(짧든 길든) 똑같이 깎임"(7↔14일 0.88, 14↔90일 약 0.68)
export function termFactor(days: number, wanted: number): number {
  return Math.max(0.5, 1 - N.termDev * Math.abs(Math.log2(days / wanted)));
}

// 기간 중 해지 위약금: 남은 기간(최대 breakMaxDays일) 하루 계약금 × breakRate
export function breakPenalty(s: GameState, d: AdDeal): number {
  const daily = adFlow(s).deals[d.id]?.pay ?? (d.min * d.ecpm) / 1000;
  return Math.round(daily * Math.min(P.breakMaxDays, Math.max(0, d.endDay - s.day)) * P.breakRate);
}

type OldDeal = Partial<Omit<AdDeal, 'closed'>> & { imps?: number; months?: number; closed?: string };

function ensure(s: GameState): AdSalesState {
  s.adSales ??= { offers: [], deals: [], nextBatchDay: s.day, signed: 0, optMult: 1 };
  const st = s.adSales;
  // 광고 계약은 광고 운영팀이 받아 온 제안으로만(사용자 요청). 첫 판이 예전 저장에 넣었던 전환 계약은 없앰
  st.deals = st.deals.filter((d) => d.advertiser !== '기존 광고 대행사');
  // A-194 이전 저장: 월 노출·개월 계약을 하루 최소·최대 노출·일 계약으로(예전 약속은 90%까지 봐줬으므로 최소 = 90%)
  for (const d of st.deals as OldDeal[]) {
    if (d.max !== undefined) continue;
    d.max = roundImps((d.imps ?? 0) / 30);
    d.min = roundImps(d.max * 0.9);
    d.days = (d.months ?? 1) * 30;
    d.earned = 0;
    d.shortDays = 0;
    if (d.closed === 'cancel') d.closed = 'break';
    delete d.imps, delete d.months;
  }
  st.offers = st.offers.filter((o) => o.max !== undefined);
  return st;
}

function newDeal(s: GameState, o: AdOffer, ecpm: number, days: number): AdDeal {
  return { id: nextId(s, 'ad'), advertiser: o.advertiser, tier: o.tier, format: o.format, min: o.min, max: o.max, ecpm, days, startDay: s.day, endDay: s.day + days, autoRenew: A.renewDefault, renewals: 0, earned: 0, shortDays: 0 };
}

export function adSizeDef(id: string | undefined) {
  return A.sizes.list.find((x) => x.id === id);
}

// 제안 하나: 크기(size)는 그 형식의 지금 하루 노출과 견준 몫 — 작은 계약은 단가가 조금 높고 큰 계약은 대량 할인
function makeOffer(s: GameState, st: AdSalesState, fx: FxTotals, sales: FormatSales[], size: (typeof A.sizes.list)[number]): AdOffer | null {
  const users = totalUsers(s);
  const tiers = A.tiers.filter((t) => users >= t.minUsers);
  const open = sales.filter((f) => f.on && f.inv > 0);
  if (!tiers.length || !open.length) return null;
  const tier = weighted(s, tiers, tiers.map((t) => t.w));
  // 덜 팔린 자리에 광고주가 더 붙음
  const f = weighted(s, open, open.map((x) => 0.15 + (1 - x.soldShare)));
  const taken = new Set([...st.offers.map((o) => o.advertiser), ...liveAdDeals(s).map((d) => d.advertiser)]);
  const names = tier.names.filter((n) => !taken.has(n));
  const max = roundImps(f.inv * randRange(s, size.max[0], size.max[1]));
  if (!names.length || max < 10) return null;
  const min = roundImps(Math.min(max * randRange(s, A.minShare[0], A.minShare[1]), f.inv * A.sizes.minCap));
  const def = adFormatDef(f.id);
  const days = pick(s, A.daysChoices.filter((d) => d >= tier.days[0] && d <= tier.days[1]));
  const q = A.qualityMin + ((1 - A.qualityMin) * quality(s)) / 100;
  const ceil = round10(def.ecpm * adScale(users) * (1 + fx.ecpm) * tier.mult * size.ecpm * econ(s, 'adSpend') * q * randRange(s, A.spread[0], A.spread[1]));
  return { id: nextId(s, 'ao'), advertiser: pick(s, names), tier: tier.id, size: size.id, format: f.id, min, max, days, open: round10(ceil * randRange(s, N.openMin, N.openMax)), ceil, since: s.day, offeredUntil: s.day + 1 };
}

// 광고주 제안이 오지 않는 까닭(화면용, 오면 null). 계약이 돌고 있어도 제안은 매일 옴 — 맡을 칸이 가득 차면 흥정만 막힘
export function offerWait(s: GameState): string | null {
  const fx = fxTotals(s);
  if (!hasMvp(s) || !fx.adFormats.length) return '광고 자리가 없어 광고주가 오지 않습니다. 업무 창에서 광고 기능을 만드세요.';
  if (!s.employees.some((e) => e.dept === 'adops')) return '광고 운영 담당자를 뽑으면 매일 광고주 제안이 들어옵니다.';
  if (adCapacity(s) <= 0) return '광고 운영팀에 "광고주 찾기"를 하는 사람이 없어 제안이 오지 않습니다. 직원 관리 창 팀 탭에서 한 명 이상에게 "광고주 찾기"를 맡기세요.';
  const need = Math.min(...A.tiers.map((t) => t.minUsers));
  if (totalUsers(s) < need) return `사용자가 ${need.toLocaleString('ko-KR')}명을 넘으면 광고주가 찾아옵니다.`;
  return null;
}

// 제안 새로 바꾸기(A-194): 흥정을 시작한 제안만 남기고, 하루 offersPerDay개(+ 기능)를 새로 받아 옴 — 하루 노출보다 작은·비슷한·큰 제안을 하나씩. 광고 운영 담당자가 있어야 옴
function refreshOffers(s: GameState, st: AdSalesState) {
  st.offers = st.offers.filter((o) => !o.left && o.nego && o.offeredUntil > s.day);
  const fx = fxTotals(s);
  if (!hasMvp(s) || !fx.adFormats.length || adCapacity(s) <= 0) return;
  const want = A.offersPerDay + Math.round(fx.adOffers);
  const sales = formatSales(s, fx);
  for (let i = 0; i < want && st.offers.length < A.maxOffers; i++) {
    const o = makeOffer(s, st, fx, sales, A.sizes.list[i % A.sizes.list.length]);
    if (o) st.offers.push(o);
  }
}

// 하루 끝: 최적화 배수, 계약 노출·계약금 기록, 기간 끝(자동 연장), 제안 새로 바꾸기. 알림은 보내지 않음
export function adSalesDay(s: GameState) {
  if (!adSalesOn(s)) return;
  const st = ensure(s);
  const O = A.optimize;
  st.optMult = 1 + Math.min(O.max, O.per * Math.pow(orderOutputs(s)['ao_optimize'] ?? 0, O.pow));
  const flow = adFlow(s).deals;
  for (const d of liveAdDeals(s)) {
    const x = flow[d.id];
    if (!x) continue;
    d.earned += x.pay;
    if (x.short) (d.shortDays += 1), (d.termShort = (d.termShort ?? 0) + 1);
  }
  for (const d of st.deals) {
    if (d.endDay !== s.day || d.closed || !d.autoRenew) continue;
    // 기간의 절반 넘게 최소 노출을 못 받은 광고주는 연장하지 않음(단가가 낮아 뒤로 밀린 계약이 끝없이 이어지지 않게)
    if ((d.termShort ?? 0) * 2 > d.days) {
      d.closed = 'lapse';
      continue;
    }
    d.endDay = s.day + d.days;
    d.renewals += 1;
    d.termShort = 0;
  }
  st.deals = st.deals.filter((d) => d.endDay > s.day - 365);
  if (s.day >= st.nextBatchDay) {
    st.nextBatchDay = s.day + 1;
    refreshOffers(s, st);
  }
}

export function setAdAutoRenew(s: GameState, dealId: string, on: boolean): string | null {
  const d = s.adSales?.deals.find((x) => x.id === dealId && !x.closed && x.endDay > s.day);
  if (!d) return '없는 계약입니다.';
  d.autoRenew = on;
  return null;
}

// 기간 중 해지: 위약금을 내고 바로 끝냄
export function breakAdDeal(s: GameState, dealId: string): string | null {
  const d = s.adSales?.deals.find((x) => x.id === dealId && !x.closed && x.endDay > s.day);
  if (!d) return '없는 계약입니다.';
  const fee = breakPenalty(s, d);
  spendNow(s, `광고 계약 해지 위약금: ${d.advertiser}`, fee, 'other');
  d.endDay = s.day;
  d.closed = 'break';
  return null;
}

// ── 흥정 ──
export function adNegotiation(s: GameState, o: AdOffer): AdNego {
  return (o.nego ??= {
    log: [{ from: 'them', text: `${o.advertiser}입니다. ${adFormatDef(o.format).name} 광고 자리를 하루 최소 ${impsText(o.min)}, 최대 ${impsText(o.max)} 노출로 ${o.days}일 동안 사고 싶습니다. 노출 1000회에 ${won(o.open)}을 생각하고 있습니다.`, ecpm: o.open, days: o.days }],
    patience: N.patience,
    bid: o.open,
    last: null,
    stall: 0,
    final: false,
    counter: { ecpm: o.open, days: o.days },
  });
}

function offerBlock(s: GameState, o: AdOffer | undefined): string | null {
  if (!o || o.left) return '이 광고주 제안은 끝났습니다.';
  const cap = adCapacity(s);
  if (liveAdDeals(s).length >= cap) return cap ? `광고 운영팀이 맡을 수 있는 계약(${cap}건)이 가득 찼습니다. 담당자를 더 뽑거나 계약을 끝내야 새로 맺을 수 있습니다.` : '광고 운영 담당자가 없어 계약을 맺을 수 없습니다.';
  return null;
}

// 흥정을 시작하면 그 제안은 며칠 더 남음(매일 바뀌는 제안에서 빠짐)
function keep(s: GameState, o: AdOffer) {
  o.offeredUntil = Math.max(o.offeredUntil, s.day + A.offerKeepDays);
}

// 단가 흥정(A-182): 내가 부른 단가를 광고주가 원하는 기간 기준으로 바꿔(÷ 기간 배율) 광고주의 지금 단가와 비교.
//  광고주는 부를 때마다 내 단가 쪽으로 남은 차이의 concede만큼 올라옴(숨은 최고 단가까지만). 내리지 않고 버티면 × stallMove,
//  최고 단가보다 터무니없이 높게 부르면 × insultMove만큼만 움직임. 차이가 광고주 단가의 closeGap 안으로 좁혀지면 내 단가로 계약
//  기간만 바꾸면 들어오면 기간으로 역제안 · 그 밖엔 내 기간 기준 광고주 단가로 역제안
//  계약이 아니면 인내심이 줄고, 아주 비싸게 부르거나 이전보다 올려 부르거나 버티면 더. 0%면 떠남
export function negotiateAd(s: GameState, offerId: string, ecpm: number, days: number): { ok: boolean; signed: boolean; message: string } {
  const st = ensure(s);
  const o = st.offers.find((x) => x.id === offerId);
  const err = offerBlock(s, o);
  if (err) return { ok: false, signed: false, message: err };
  if (ecpm <= 0 || !A.daysChoices.includes(days)) return { ok: false, signed: false, message: '단가와 기간을 정하세요.' };
  const n = adNegotiation(s, o!);
  keep(s, o!);
  const say = (m: AdNegoMsg) => n.log.push(m);
  say({ from: 'me', text: '', ecpm, days });
  const k = termFactor(days, o!.days);
  const ask = ecpm / k;
  const prev = n.last;
  const lowered = prev !== null && ask < prev - 1;
  const raised = prev !== null && ask > prev + 1;
  const stalled = prev !== null && !lowered;
  const insult = ask > o!.ceil * N.insult;
  const before = n.bid;
  const pace = N.concede * (stalled ? N.stallMove : 1) * (insult ? N.insultMove : 1);
  n.bid = Math.max(n.bid, n.bid + (Math.min(ask, o!.ceil) - n.bid) * pace);
  n.stall = stalled ? n.stall + 1 : 0;
  n.last = ask;
  const came = n.bid - before;
  if (ask <= n.bid * (1 + N.closeGap) + 1) {
    say({ from: 'them', text: came > 0 ? `${pick(s, ['서로 조금씩 맞췄네요.', '그 정도면 맞춰 보겠습니다.'])} 그 조건으로 계약하겠습니다!` : '좋습니다, 그 조건으로 계약하겠습니다!', mood: 'happy' });
    return { ok: true, signed: true, message: sign(s, st, o!, ecpm, days) };
  }
  let drop = N.dropBase;
  if (insult) drop += N.insultDrop;
  if (raised) drop += N.raisePenalty;
  drop += n.stall * N.stallDrop;
  const pBefore = n.patience;
  n.patience = Math.max(0, Math.round(n.patience - drop));
  const dp = n.patience - pBefore;
  if (n.patience <= 0 || n.final) {
    o!.left = true;
    n.counter = null;
    say({ from: 'them', text: n.final ? '마지막이라고 말씀드렸는데요. 이번 예산은 다른 매체에 쓰겠습니다.' : '조건 차이가 너무 크네요. 이번에는 다른 매체를 알아보겠습니다.', mood: 'angry', patience: dp });
    return { ok: true, signed: false, message: `${o!.advertiser}${josa(o!.advertiser, '이')} 협상을 끝내고 떠났습니다.` };
  }
  n.final = n.stall >= N.finalStall || n.patience <= N.finalPatience;
  const press = n.final
    ? pick(s, ['다른 매체 견적도 받아 둔 상태입니다. ', '이번 주 안에 예산을 정해야 합니다. '])
    : n.stall >= 2
      ? '계속 같은 조건이시네요. '
      : n.stall === 1 && !raised
        ? '아까와 같은 조건이네요. '
        : '';
  const last = n.final ? ' 이번이 마지막 제안입니다.' : '';
  // 기간만 바꾸면 내 단가가 들어오면: 단가는 두고 기간으로 역제안(내 기간과 가까운 것부터)
  const fit = A.daysChoices
    .filter((c) => c !== days && ecpm <= n.bid * termFactor(c, o!.days) * (1 + N.closeGap) + 1)
    .sort((x, y) => Math.abs(Math.log(x / days)) - Math.abs(Math.log(y / days)))[0];
  if (fit) {
    n.counter = { ecpm, days: fit };
    say({ from: 'them', text: `${press}단가는 그대로 좋습니다. 기간을 ${fit}일로 해 주시면 바로 계약하겠습니다.${last}`, ecpm, days: fit, mood: n.stall ? 'angry' : 'ok', patience: dp });
    return { ok: true, signed: false, message: '' };
  }
  const ce = round10(n.bid * k);
  n.counter = { ecpm: ce, days };
  const atCeil = n.bid >= o!.ceil * 0.98;
  let text: string;
  if (raised) text = `${pick(s, ['오히려 올리셨네요? ', '아까보다 비싸졌는데요. '])}저희는 ${won(ce)}이 한계입니다.`;
  else if (atCeil) text = `${pick(s, ['여기가 저희 예산 끝입니다.', '더는 올리기 어렵습니다.'])} ${won(ce)}이면 계약하겠습니다.`;
  else if (insult) text = `${pick(s, ['너무 비싼데요.', '저희 예산과 차이가 큽니다.'])} ${won(ce)} 정도가 저희 생각입니다.`;
  else if (lowered) text = `맞춰 주셨으니 저희도 올리겠습니다. ${won(ce)}은 어떠세요?`;
  else if (n.stall) text = `${press}조금 더 올려서 ${won(ce)}까지 드리겠습니다.`;
  else text = `${pick(s, ['조금 비싸네요.', '예상보다 높네요.'])} 저희가 올려서 ${won(ce)}은 어떠세요?`;
  if (!raised && n.stall === 0 && n.final) text = press + text;
  say({ from: 'them', text: text + last, ecpm: ce, days, mood: insult || raised || n.stall ? 'angry' : 'ok', patience: dp });
  return { ok: true, signed: false, message: '' };
}

// 광고주의 마지막 역제안(처음엔 첫 제안)을 그대로 받아 계약
export function acceptAdCounter(s: GameState, offerId: string): { ok: boolean; message: string } {
  const st = ensure(s);
  const o = st.offers.find((x) => x.id === offerId);
  const err = offerBlock(s, o);
  if (err) return { ok: false, message: err };
  const n = adNegotiation(s, o!);
  const c = n.counter;
  if (!c) return { ok: false, message: '받아들일 제안이 없습니다.' };
  n.log.push({ from: 'me', text: '그 조건으로 하시죠.', ecpm: c.ecpm, days: c.days });
  n.log.push({ from: 'them', text: '감사합니다! 바로 광고를 내보내겠습니다.', mood: 'happy' });
  n.counter = null;
  return { ok: true, message: sign(s, st, o!, c.ecpm, c.days) };
}

export function declineAdOffer(s: GameState, offerId: string) {
  if (s.adSales) s.adSales.offers = s.adSales.offers.filter((o) => o.id !== offerId);
}

function sign(s: GameState, st: AdSalesState, o: AdOffer, ecpm: number, days: number): string {
  st.offers = st.offers.filter((x) => x.id !== o.id);
  const d = newDeal(s, o, ecpm, days);
  st.deals.push(d);
  st.signed += 1;
  const daily = adFlow(s).deals[d.id]?.pay ?? 0;
  float(s, `+광고 ${wonShort(daily)}/일`, 'money');
  if (o.tier === 'big' || o.tier === 'global') news(s, `[광고] ${o.advertiser}, ${s.company.name}에 대형 광고 집행`, 'company');
  s.events.push({ type: 'autosave', reason: '광고 계약' });
  return `${o.advertiser}${josa(o.advertiser, '과')} ${adFormatDef(o.format).name} 광고 ${days}일 계약을 맺었습니다. 하루 ${impsText(o.min)}~${impsText(o.max)} 노출 × ${won(ecpm)}(1000회당), 오늘은 ${wonShort(daily)}을 받습니다.`;
}
