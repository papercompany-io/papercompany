// 광고 판매(A-182): 광고 형식 기능(배너·이미지·비디오)이 만든 광고 자리(월 노출)를 광고주에게 팝니다.
// 광고 운영팀 "광고주 찾기"가 일주일마다 광고주 제안을 받아 오고, 채용 흥정(A-167)처럼 단가(eCPM)·기간을 흥정해 계약합니다.
// 계약한 노출은 매달 정해진 매출, 계약하지 않은 자리는 광고 네트워크가 싸게 채웁니다(시장 처리 revenuePerUser가 adPerUser로 받음).
// 계약은 자동 연장(끄기 전까지 같은 조건으로 계속), 기간 중 해지·약속한 노출을 못 내보내면 위약금.
import { DATA, industry, MARKET_IDS } from './data';
import { econ } from './economy';
import { spendNow } from './finance';
import { countShort, josa, won, wonShort } from './format';
import { nextId } from './ids';
import { adScale, revenuePerUser, totalUsers } from './market';
import { post, teamChannelId } from './messenger';
import { float, news, notify } from './notify';
import { canCharge, fxTotals, hasMvp, quality, type FxTotals } from './product';
import { pick, rand, randRange, weighted } from './rng';
import { orderOutputs } from './staff';
import type { AdFormatId, GameState, MarketId } from './types';

const A = DATA.adsales;
const N = A.nego;
const P = A.penalty;

export interface AdNegoMsg {
  from: 'me' | 'them';
  text: string;
  ecpm?: number;
  months?: number;
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
  counter: { ecpm: number; months: number } | null;
}

export interface AdOffer {
  id: string;
  advertiser: string;
  tier: string;
  format: AdFormatId;
  imps: number; // 월 노출
  months: number; // 광고주가 원하는 기간
  open: number; // 첫 제안 단가
  ceil: number; // 광고주가 낼 수 있는 최고 단가(숨김, 원하는 기간 기준)
  offeredUntil: number;
  left?: boolean; // 협상이 깨져 떠남
  nego?: AdNego;
}

export interface AdDeal {
  id: string;
  advertiser: string;
  tier: string;
  format: AdFormatId;
  imps: number;
  ecpm: number;
  months: number; // 한 번 계약 기간(자동 연장도 이 기간씩)
  startDay: number;
  endDay: number; // 지금 기간이 끝나는 날
  autoRenew: boolean;
  cycleStart: number; // 노출을 세는 계약 한 달의 첫날
  short: number; // 이번 계약 한 달에 못 내보낸 노출
  renewals: number;
  closed?: 'cancel' | 'break'; // 광고주가 끊음(노출 부족)·내가 해지함. 끊긴 날에 자동 연장되지 않게
}

export interface AdSalesState {
  offers: AdOffer[];
  deals: AdDeal[];
  nextBatchDay: number;
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
  return adSalesOf(s).deals.filter((d) => d.startDay <= s.day && d.endDay > s.day);
}

export function impsText(n: number): string {
  return `${countShort(n)}회`;
}

export function dealMonthly(d: { imps: number; ecpm: number }): number {
  return (d.imps * d.ecpm) / 1000;
}

const round10 = (v: number) => Math.max(10, Math.round(v / 10) * 10);
const roundImps = (v: number) => {
  const p = Math.pow(10, Math.max(3, Math.floor(Math.log10(Math.max(1, v))) - 1));
  return Math.round(v / p) * p;
};

// 광고를 보는 사람 비율: 프리미엄 구독자는 광고를 보지 않습니다
export function adViewShare(s: GameState, fx: FxTotals = fxTotals(s)): number {
  return canCharge(s, fx) ? Math.max(0, 1 - Math.min(1, industry(s.company.industry).payBase + fx.pay)) : 1;
}

function adUsers(s: GameState): number {
  return MARKET_IDS.reduce((a, m) => a + (s.markets[m].launched ? s.markets[m].users : 0), 0);
}

export interface FormatSales {
  id: AdFormatId;
  on: boolean;
  inv: number; // 월 노출(재고)
  sold: number; // 계약한 월 노출
  soldShare: number; // 재고 중 팔린 몫(0~1)
  fill: number; // 계약한 노출 중 실제로 내보내는 몫(재고가 모자라면 1 아래)
  dealMonthly: number; // 계약 매출(월)
}

// 형식별 재고·팔린 노출·계약 매출. 사용자가 줄어 재고보다 많이 팔렸으면 계약들이 나눠 받습니다
export function formatSales(s: GameState, fx: FxTotals = fxTotals(s)): FormatSales[] {
  const view = adViewShare(s, fx);
  const users = adUsers(s);
  const live = liveAdDeals(s);
  return A.formats.map((f) => {
    const id = f.id as AdFormatId;
    const on = fx.adFormats.includes(id);
    const inv = on ? users * f.imp * view : 0;
    const ds = live.filter((d) => d.format === id);
    const sold = ds.reduce((a, d) => a + d.imps, 0);
    const fill = sold > 0 ? Math.min(1, inv / sold) : 1;
    return { id, on, inv, sold, soldShare: inv > 0 ? Math.min(1, sold / inv) : 0, fill, dealMonthly: ds.reduce((a, d) => a + dealMonthly(d) * fill, 0) };
  });
}

// 이 형식에 더 팔 수 있는 월 노출
export function adRoom(s: GameState, f: AdFormatId, fx: FxTotals = fxTotals(s)): number {
  const x = formatSales(s, fx).find((v) => v.id === f)!;
  return Math.max(0, x.inv - x.sold);
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
    if (f.inv > 0) out += (f.dealMonthly * per) / f.inv;
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

// 기간 배율: 광고주가 원하는 기간(wanted)과 다른 기간(months)으로 계약하면 광고주가 낼 수 있는 단가가 몇 배가 되나.
// 협상은 내가 부른 단가 ÷ 이 배율을 광고주의 지금 단가와 비교하고, 광고주 역제안 단가에 이 배율을 곱합니다.
// TODO(human): 기간 배율 모양 정하기. 지금은 임시로 "원하는 기간에서 멀어질수록(짧든 길든) 똑같이 깎임"(3↔6개월 0.88, 6↔24개월 0.76)
export function monthsFactor(months: number, wanted: number): number {
  return Math.max(0.5, 1 - N.monthsDev * Math.abs(Math.log2(months / wanted)));
}

// 기간 중 해지 위약금: 남은 기간(최대 breakMaxMonths개월) 계약금 × breakRate
export function breakPenalty(s: GameState, d: AdDeal): number {
  const months = Math.min(P.breakMaxMonths, Math.max(0, d.endDay - s.day) / 30);
  return Math.round(dealMonthly(d) * months * P.breakRate);
}

function ensure(s: GameState): AdSalesState {
  s.adSales ??= { offers: [], deals: [], nextBatchDay: s.day, signed: 0, optMult: 1 };
  // 광고 계약은 광고 운영팀이 받아 온 제안으로만(사용자 요청). 첫 판이 예전 저장에 넣었던 전환 계약은 없앰
  s.adSales.deals = s.adSales.deals.filter((d) => d.advertiser !== '기존 광고 대행사');
  return s.adSales;
}

function newDeal(s: GameState, o: Pick<AdOffer, 'advertiser' | 'tier' | 'format' | 'imps'>, ecpm: number, months: number): AdDeal {
  return { id: nextId(s, 'ad'), advertiser: o.advertiser, tier: o.tier, format: o.format, imps: o.imps, ecpm, months, startDay: s.day, endDay: s.day + months * 30, autoRenew: A.renewDefault, cycleStart: s.day, short: 0, renewals: 0 };
}

function makeOffer(s: GameState, st: AdSalesState, fx: FxTotals, sales: FormatSales[]): AdOffer | null {
  const users = totalUsers(s);
  const tiers = A.tiers.filter((t) => users >= t.minUsers);
  const open = sales.filter((f) => f.on && f.inv > 0);
  if (!tiers.length || !open.length) return null;
  const tier = weighted(s, tiers, tiers.map((t) => t.w));
  // 덜 팔린 자리에 광고주가 더 붙음
  const f = weighted(s, open, open.map((x) => 0.15 + (1 - x.soldShare)));
  const taken = new Set([...st.offers.map((o) => o.advertiser), ...liveAdDeals(s).map((d) => d.advertiser)]);
  const names = tier.names.filter((n) => !taken.has(n));
  const imps = roundImps(f.inv * randRange(s, tier.share[0], tier.share[1]));
  if (!names.length || imps < 1000) return null;
  const def = adFormatDef(f.id);
  const months = pick(s, A.monthsChoices.filter((m) => m >= tier.months[0] && m <= tier.months[1]));
  const q = A.qualityMin + ((1 - A.qualityMin) * quality(s)) / 100;
  const ceil = round10(def.ecpm * adScale(users) * (1 + fx.ecpm) * tier.mult * econ(s, 'adSpend') * q * randRange(s, A.spread[0], A.spread[1]));
  return { id: nextId(s, 'ao'), advertiser: pick(s, names), tier: tier.id, format: f.id, imps, months, open: round10(ceil * randRange(s, N.openMin, N.openMax)), ceil, offeredUntil: s.day + A.offerDays };
}

// 광고주 제안 묶음: 광고 운영팀 "광고주 찾기" 출력만큼(+ 기능), 제안 목록이 가득 차면 그만
function batch(s: GameState, st: AdSalesState) {
  const fx = fxTotals(s);
  if (!hasMvp(s) || !fx.adFormats.length) return;
  const sell = orderOutputs(s)['ao_sell'] ?? 0;
  if (sell <= 0) return;
  const want = Math.min(A.batchMax, Math.floor(sell * A.perOutput + rand(s))) + Math.round(fx.adOffers);
  const sales = formatSales(s, fx);
  const got: AdOffer[] = [];
  for (let i = 0; i < want && st.offers.length < A.maxOffers; i++) {
    const o = makeOffer(s, st, fx, sales);
    if (o) st.offers.push(o), got.push(o);
  }
  if (!got.length) return;
  const who = got.map((o) => o.advertiser).join(', ');
  notify(s, `광고주 제안 ${got.length}건이 들어왔습니다(${who}). 시장·광고 창 "광고 판매" 탭에서 흥정할 수 있습니다.`, 'info', 'market', 'adsales');
  const ao = s.employees.find((e) => e.dept === 'adops' && e.lead) ?? s.employees.find((e) => e.dept === 'adops');
  if (ao && s.channels.some((c) => c.id === teamChannelId('adops'))) post(s, teamChannelId('adops'), ao.name, `대표님, 우리 앱에 광고를 넣고 싶다는 곳이 ${got.length}곳 있습니다(${who}). 광고 판매 탭에서 조건을 보시고 흥정해 주세요.`, 'npc');
}

// 하루 끝: 최적화 배수, 계약 노출 세기·위약금, 기간 끝(자동 연장), 제안 만료, 새 제안
export function adSalesDay(s: GameState) {
  if (!adSalesOn(s)) return;
  const st = ensure(s);
  const O = A.optimize;
  st.optMult = 1 + Math.min(O.max, O.per * Math.pow(orderOutputs(s)['ao_optimize'] ?? 0, O.pow));
  const sales = formatSales(s);
  for (const d of liveAdDeals(s)) {
    const f = sales.find((x) => x.id === d.format)!;
    d.short += (d.imps * (1 - f.fill)) / 30;
    if (s.day - d.cycleStart >= 30) checkDelivery(s, d);
  }
  for (const d of st.deals) {
    if (d.endDay !== s.day || d.closed) continue;
    if (d.autoRenew) {
      d.endDay = s.day + d.months * 30;
      d.renewals += 1;
      notify(s, `${d.advertiser} ${adFormatDef(d.format).name} 광고 계약이 같은 조건으로 ${d.months}개월 연장됐습니다(자동 연장).`, 'good', 'market', 'adsales');
    } else notify(s, `${d.advertiser} ${adFormatDef(d.format).name} 광고 계약이 끝났습니다. 그 자리는 새 계약을 맺을 때까지 광고 네트워크가 싸게 채웁니다.`, 'info', 'market', 'adsales');
  }
  st.deals = st.deals.filter((d) => d.endDay > s.day - 365);
  st.offers = st.offers.filter((o) => o.offeredUntil > s.day && !o.left);
  if (s.day >= st.nextBatchDay) {
    st.nextBatchDay = s.day + A.batchEveryDays;
    batch(s, st);
  }
}

// 계약 한 달마다: 약속한 노출을 못 내보냈으면 위약금, 너무 모자라면 광고주가 계약을 끊음
function checkDelivery(s: GameState, d: AdDeal) {
  const delivered = 1 - d.short / d.imps;
  const short = d.short;
  d.cycleStart = s.day;
  d.short = 0;
  if (delivered >= P.tolerance) return;
  const fee = Math.round(((short * d.ecpm) / 1000) * P.shortMult);
  spendNow(s, `광고 위약금: ${d.advertiser}(노출 부족)`, fee, 'other');
  const name = adFormatDef(d.format).name;
  if (delivered < P.cancelBelow) {
    const cut = Math.round(dealMonthly(d) * P.cancelMonths);
    spendNow(s, `광고 계약 해지 위약금: ${d.advertiser}`, cut, 'other');
    d.endDay = s.day;
    d.closed = 'cancel';
    notify(s, `${d.advertiser}${josa(d.advertiser, '이')} 약속한 ${name} 노출의 ${Math.round(delivered * 100)}%만 받아 계약을 끊었습니다. 위약금 ${wonShort(fee + cut)}을 냈습니다. 사용자가 줄면 팔아 둔 광고 자리를 다 채우지 못합니다.`, 'urgent', 'market', 'adsales');
    news(s, `[광고] ${d.advertiser}, ${s.company.name}과 광고 계약 해지… "약속한 노출 못 받아"`, 'company');
    return;
  }
  notify(s, `${d.advertiser}에 약속한 ${name} 노출의 ${Math.round(delivered * 100)}%만 내보내 위약금 ${wonShort(fee)}을 냈습니다. 사용자가 줄어 팔아 둔 광고 자리가 모자랍니다.`, 'bad', 'market', 'adsales');
}

export function setAdAutoRenew(s: GameState, dealId: string, on: boolean): string | null {
  const d = s.adSales?.deals.find((x) => x.id === dealId && x.endDay > s.day);
  if (!d) return '없는 계약입니다.';
  d.autoRenew = on;
  return null;
}

// 기간 중 해지: 위약금을 내고 바로 끝냄
export function breakAdDeal(s: GameState, dealId: string): string | null {
  const d = s.adSales?.deals.find((x) => x.id === dealId && x.endDay > s.day);
  if (!d) return '없는 계약입니다.';
  const fee = breakPenalty(s, d);
  spendNow(s, `광고 계약 해지 위약금: ${d.advertiser}`, fee, 'other');
  d.endDay = s.day;
  d.closed = 'break';
  notify(s, `${d.advertiser} ${adFormatDef(d.format).name} 광고 계약을 해지했습니다. 위약금 ${wonShort(fee)}을 냈습니다.`, 'bad', 'market', 'adsales');
  return null;
}

// ── 흥정 ──
export function adNegotiation(s: GameState, o: AdOffer): AdNego {
  return (o.nego ??= {
    log: [{ from: 'them', text: `${o.advertiser}입니다. ${adFormatDef(o.format).name} 광고 자리를 월 ${impsText(o.imps)} 노출, ${o.months}개월 동안 사고 싶습니다. 노출 1000회에 ${won(o.open)}을 생각하고 있습니다.`, ecpm: o.open, months: o.months }],
    patience: N.patience,
    bid: o.open,
    last: null,
    stall: 0,
    final: false,
    counter: { ecpm: o.open, months: o.months },
  });
}

function offerBlock(s: GameState, o: AdOffer | undefined): string | null {
  if (!o || o.left) return '이 광고주 제안은 끝났습니다.';
  const room = adRoom(s, o.format);
  if (o.imps > room + 1) return `남은 ${adFormatDef(o.format).name} 광고 자리가 모자랍니다(월 ${impsText(room)} 남음). 계약이 끝나 자리가 나거나 사용자가 늘면 맺을 수 있습니다.`;
  return null;
}

// 단가 흥정(A-182): 내가 부른 단가를 광고주가 원하는 기간 기준으로 바꿔(÷ 기간 배율) 광고주의 지금 단가와 비교.
//  광고주는 부를 때마다 내 단가 쪽으로 남은 차이의 concede만큼 올라옴(숨은 최고 단가까지만). 내리지 않고 버티면 × stallMove,
//  최고 단가보다 터무니없이 높게 부르면 × insultMove만큼만 움직임. 차이가 광고주 단가의 closeGap 안으로 좁혀지면 내 단가로 계약
//  기간만 바꾸면 들어오면 기간으로 역제안 · 그 밖엔 내 기간 기준 광고주 단가로 역제안
//  계약이 아니면 인내심이 줄고, 아주 비싸게 부르거나 이전보다 올려 부르거나 버티면 더. 0%면 떠남
export function negotiateAd(s: GameState, offerId: string, ecpm: number, months: number): { ok: boolean; signed: boolean; message: string } {
  const st = ensure(s);
  const o = st.offers.find((x) => x.id === offerId);
  const err = offerBlock(s, o);
  if (err) return { ok: false, signed: false, message: err };
  if (ecpm <= 0 || !A.monthsChoices.includes(months)) return { ok: false, signed: false, message: '단가와 기간을 정하세요.' };
  const n = adNegotiation(s, o!);
  const say = (m: AdNegoMsg) => n.log.push(m);
  say({ from: 'me', text: '', ecpm, months });
  const k = monthsFactor(months, o!.months);
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
    return { ok: true, signed: true, message: sign(s, st, o!, ecpm, months) };
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
  const fit = A.monthsChoices
    .filter((c) => c !== months && ecpm <= n.bid * monthsFactor(c, o!.months) * (1 + N.closeGap) + 1)
    .sort((x, y) => Math.abs(Math.log(x / months)) - Math.abs(Math.log(y / months)))[0];
  if (fit) {
    n.counter = { ecpm, months: fit };
    say({ from: 'them', text: `${press}단가는 그대로 좋습니다. 기간을 ${fit}개월로 해 주시면 바로 계약하겠습니다.${last}`, ecpm, months: fit, mood: n.stall ? 'angry' : 'ok', patience: dp });
    return { ok: true, signed: false, message: '' };
  }
  const ce = round10(n.bid * k);
  n.counter = { ecpm: ce, months };
  const atCeil = n.bid >= o!.ceil * 0.98;
  let text: string;
  if (raised) text = `${pick(s, ['오히려 올리셨네요? ', '아까보다 비싸졌는데요. '])}저희는 ${won(ce)}이 한계입니다.`;
  else if (atCeil) text = `${pick(s, ['여기가 저희 예산 끝입니다.', '더는 올리기 어렵습니다.'])} ${won(ce)}이면 계약하겠습니다.`;
  else if (insult) text = `${pick(s, ['너무 비싼데요.', '저희 예산과 차이가 큽니다.'])} ${won(ce)} 정도가 저희 생각입니다.`;
  else if (lowered) text = `맞춰 주셨으니 저희도 올리겠습니다. ${won(ce)}은 어떠세요?`;
  else if (n.stall) text = `${press}조금 더 올려서 ${won(ce)}까지 드리겠습니다.`;
  else text = `${pick(s, ['조금 비싸네요.', '예상보다 높네요.'])} 저희가 올려서 ${won(ce)}은 어떠세요?`;
  if (!raised && n.stall === 0 && n.final) text = press + text;
  say({ from: 'them', text: text + last, ecpm: ce, months, mood: insult || raised || n.stall ? 'angry' : 'ok', patience: dp });
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
  n.log.push({ from: 'me', text: '그 조건으로 하시죠.', ecpm: c.ecpm, months: c.months });
  n.log.push({ from: 'them', text: '감사합니다! 바로 광고를 내보내겠습니다.', mood: 'happy' });
  n.counter = null;
  return { ok: true, message: sign(s, st, o!, c.ecpm, c.months) };
}

export function declineAdOffer(s: GameState, offerId: string) {
  if (s.adSales) s.adSales.offers = s.adSales.offers.filter((o) => o.id !== offerId);
}

function sign(s: GameState, st: AdSalesState, o: AdOffer, ecpm: number, months: number): string {
  st.offers = st.offers.filter((x) => x.id !== o.id);
  const d = newDeal(s, o, ecpm, months);
  st.deals.push(d);
  st.signed += 1;
  const monthly = dealMonthly(d);
  float(s, `+광고 ${wonShort(monthly)}/월`, 'money');
  if (o.tier === 'big' || o.tier === 'global') news(s, `[광고] ${o.advertiser}, ${s.company.name}에 대형 광고 집행`, 'company');
  s.events.push({ type: 'autosave', reason: '광고 계약' });
  return `${o.advertiser}${josa(o.advertiser, '과')} ${adFormatDef(o.format).name} 광고 ${months}개월 계약을 맺었습니다. 월 ${impsText(o.imps)} 노출 × ${won(ecpm)}(1000회당) = 월 약 ${wonShort(monthly)}입니다.`;
}
