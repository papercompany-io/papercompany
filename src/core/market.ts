// RV·시장 시뮬레이션(Claude 제안, PD-02/04·RV-01 확장):
// 시장 수요(잠재 고객 × 도입률 × 경기) → 매력도·인지도·가격으로 나눈 점유율 → 목표 고객 수.
// 고객은 목표를 향해 획득 속도(입소문·광고·영업)만큼 늘고, 이탈률(버그·가격·고객지원·경쟁)만큼 줄어듭니다.
import { DATA, industry, market, MARKET_IDS, priceTierDef, tamMultOf, type IndustryDef } from './data';
import { yearFrac } from './calendar';
import { econ } from './economy';
import { spendNow } from './finance';
import { mod } from './mods';
import { news, notify } from './notify';
import { appeal, canCharge, fxTotals, hasMvp, type FxTotals } from './product';
import { adDay, audience, campaignDay, endCampaigns, fullInform, opensAt, recordAdStats, recordCampaigns, setTotalAdBudget } from './ads';
import { countShort } from './format';
import type { CustMonth, GameState, MarketId } from './types';
import { orderShare } from './assign';

const M = DATA.markets;

export function adoption(ind: IndustryDef, day: number): number {
  const a = ind.adoption;
  const t = yearFrac(day);
  return a.a0 + (a.a1 - a.a0) / (1 + Math.exp(-a.k * (t - a.mid)));
}

// 시장 m의 전체 수요(이 제품군을 쓰려는 사람·회사 수)
export function demand(s: GameState, m: MarketId): number {
  const ind = industry(s.company.industry);
  return ind.tam * tamMultOf(ind.id, m) * adoption(ind, s.day) * econ(s, 'demand');
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
      const boost = c.boostUntil !== null && c.boostUntil > s.day ? M.rivalry.priceBoost : 1; // 가격 인하 반격(A-140)
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

// 광고 단가 배율(A-138): 사용자가 적으면 광고주가 적어 싸고, 많아질수록 비싸집니다. 소비자 앱이 "커야 사는" 이유
export function adScale(users: number): number {
  const A = M.adScale;
  return Math.max(A.min, Math.min(A.max, 1 + A.perDecade * Math.log10(Math.max(1, users) / A.ref)));
}

// 광고주가 붙는 문턱(A-138)을 처음 넘으면 알립니다. 배율 숫자는 숨기고 "단가가 오른다"는 말로만
function adMilestone(s: GameState, m: MarketId, ind: IndustryDef) {
  if (ind.adBase <= 0) return;
  const users = s.markets[m].users;
  for (const n of M.adScale.milestones) {
    const key = `adtier-${m}-${n}`;
    if (users < n || s.flags.includes(key)) continue;
    s.flags.push(key);
    const who = `${market(m).name} 사용자 ${n >= 1e6 ? `${n / 1e6}00만` : `${n / 1e4}만`} 명`;
    news(s, `[광고] ${s.company.name}, ${who} 돌파 — 광고주 문의 늘어`, 'company');
    notify(s, `${who}을 넘었습니다. 광고주가 늘어 앞으로 광고 단가가 오릅니다(사용자가 많을수록 사용자 한 명당 광고 매출이 커집니다).`, 'good', 'market');
  }
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
  const ad = (ind.adBase + fx.ad) * arpuM * adScale(s.markets[m].users);
  const take = ind.gmv * (1 + fx.gmv) * (ind.takeBase + fx.take) * Math.sqrt(pt.price) * arpuM * charge;
  return { sub, ad, take, total: sub + ad + take, payShare };
}

// 사용자 1명(곳)당 월 인프라 비용
export function infraPerUser(s: GameState, fx: FxTotals = fxTotals(s)): number {
  const ind = industry(s.company.industry);
  const dept = deptCoverage(s, 'infra');
  const opt = (0.12 + 0.18 * orderShare(s, 'infra', 'infra_cost')) * dept; // A-147
  return ind.infra * Math.max(0.25, 1 + fx.infra) * (1 - opt) * (1 + mod(s, 'infra'));
}

// 고객지원·인프라처럼 사용자 수에 비례해 사람이 필요한 부서의 충족도(0~1)
export function deptCoverage(s: GameState, d: 'cs' | 'infra'): number {
  const cap = DATA.depts.departments.find((x) => x.id === d)!.cap as Record<string, number>;
  const users = totalUsers(s);
  if (users <= 0) return 1;
  const out = s.employees.filter((e) => e.dept === d && !isAbsent(s, e.id)).length;
  return Math.min(1, out / Math.max(0.5, deptNeed(s, users / cap[s.company.industry])));
}

// 필요 인원(A-156 규모의 경제, B2C만): from명까지는 사용자에 비례, 그 뒤로는 사용자 10배마다 perDecade명씩
export function deptNeed(s: GameState, linear: number): number {
  const k = (DATA.depts.capScale as Partial<Record<'b2c' | 'b2b', { from: number; perDecade: number }>>)[audience(s)];
  return !k || linear <= k.from ? linear : k.from + k.perDecade * Math.log10(linear / k.from);
}

function isAbsent(s: GameState, id: string) {
  const e = s.employees.find((x) => x.id === id);
  return !!e && e.sickUntil !== null && e.sickUntil > s.day;
}

// 목표(점유율 × 수요)를 넘은 고객이 하루에 떠나는 비율(A-147). 영업·광고로 데려온 고객이 제품이 별로면 빨리 샙니다
export function excessChurn(s: GameState, m: MarketId): number {
  const base = M.outbound.excessChurn;
  const rivals = s.competitors.filter((c) => c.alive && c.markets.includes(m));
  const ref = rivals.length ? rivals.reduce((a, c) => a + c.appeal, 0) / rivals.length : 20;
  const ratio = appeal(s) / Math.max(1, ref); // 1 = 경쟁사 평균만큼 매력 있음
  // TODO(human): ratio에 따라 base를 늘리거나 줄여 돌려주기
  return base;
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
  const csFocus = 0.6 + 0.4 * orderShare(s, 'cs', 'cs_support'); // A-147
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
    const viralM = 1 + mod(s, 'viral'); // 친구 초대 보상 같은 캠페인(A-157)
    const word = ind.viral * (1 + fx.viral * 10) * viralM * Math.sqrt(Math.min(1, ms.users / Math.max(1, D))) * 0.02;
    ms.awareness += (push.contentAwareness / Math.sqrt(tamMultOf(ind.id, m)) + word) * (1 - ms.awareness);
    ms.awareness -= ms.awareness * M.awarenessDecayPerDay;
    // 쓰는 사람은 이미 알고, 주변에도 말합니다(A-95): 인지도는 사용자 비중의 일정 배수 아래로 내려가지 않습니다.
    ms.awareness = Math.max(0, Math.min(1, Math.max(ms.awareness, (ms.users / Math.max(1, D)) * M.userAwareness)));
    const sh = shares(s, m).player;
    ms.peakShare = Math.max(ms.peakShare, sh);
    const target = D * sh;
    const day = { inbound: 0, viral: 0, sales: 0, paid: 0, lost: 0 };
    // 획득(A-48): 스스로 찾아오는 고객 + 입소문 + 세일즈 계약 + 광고로 산 고객(CAC).
    // 스스로 오는 몫만 목표(점유율 × 수요)까지. 영업·광고는 우리가 직접 찾아가 데려오므로 목표에 막히지 않습니다(A-147)
    const acqM = econ(s, 'acq') * (1 + mod(s, 'acq'));
    const foreign = m === 'kr' ? 1 : M.foreign;
    const gap = Math.max(0, target - ms.users);
    let organic = 0;
    if (gap > 0) {
      // 아무도 모르는 서비스는 검색되지 않습니다(A-95). 인지도가 오르거나, 쓰는 사람이 쌓여 순위·검색에 걸리면 스스로 찾아옵니다.
      const found = Math.min(1, Math.max(ms.awareness / M.discoveryAwareness, Math.sqrt(ms.users / M.discoveryUsers)));
      const inbound = gap * ind.baseAcq * (1 + fx.conv) * foreign * found;
      const viral = ((ms.users * ind.viral * (1 + fx.viral * 10) * viralM) / 30) * Math.min(1, gap / Math.max(1, D)) * foreign;
      const raw = (inbound + viral) * acqM;
      organic = Math.min(gap * M.outbound.gapRate, raw);
      const k = raw > 0 ? organic / raw : 0;
      Object.assign(day, { inbound: inbound * acqM * k, viral: viral * acqM * k });
    }
    const sales = push.salesPush * ind.salesPer * (m === 'kr' ? 1 : 0.6) * Math.min(2, Math.max(0.3, appeal(s) / 25));
    const cac = ind.cac * md.arpu * (1 + 3 * sh) / Math.min(2.5, mktEff);
    // 광고로 사는 고객은 하루 수요의 0.1%에서 포화(돈을 더 써도 덜 늘어남)
    const cap = D * 0.001;
    const paidAd = ad.direct > 0 ? cap * (1 - Math.exp(-ad.direct / cac / Math.max(1, cap))) : 0;
    // 캠페인은 짧게 몰아서: 상한을 두 배로
    const paidCp = cp.direct > 0 ? 2 * cap * (1 - Math.exp(-cp.direct / cac / Math.max(1, 2 * cap))) : 0;
    gotAd = paidAd * acqM;
    gotCp = paidCp * acqM;
    Object.assign(day, { sales: sales * acqM, paid: gotAd + gotCp });
    const got = organic + day.sales + day.paid;
    if (got > 0) {
      ms.users += got;
      adMilestone(s, m, ind);
    }
    recordAdStats(s, m, ad.parts, gotAd, awAd);
    recordCampaigns(cp.list, gotCp, awCp);
    // 이탈
    const bugF = 1 + s.product.bugs / 45;
    const ret = 0.04 * Math.pow(push.retention, 0.6);
    const churnM = ind.churnM * pt.churn * Math.max(0.3, 1 + fx.churn + csFx + mod(s, 'churn') - ret) * bugF * econ(s, 'churn');
    let lost = ms.users * (churnM / 30);
    const why = lossWhy(s, ms.users, { ind: ind.churnM, price: pt.churn, bugF, econ: econ(s, 'churn'), features: fx.churn, cs: csFx, ret });
    if (ms.users > target) {
      const ex = (ms.users - target) * excessChurn(s, m);
      lost += ex;
      why.excess = ex;
    }
    ms.users = Math.max(0, ms.users - lost);
    day.lost = lost;
    // 성장 분석용 이동 평균(약 2주)
    const f = ms.flow ?? { target, ...day };
    const a = 1 / 14;
    const fw = f.why ?? {};
    const keys = new Set([...Object.keys(fw), ...Object.keys(why)]);
    ms.flow = {
      target,
      inbound: f.inbound + (day.inbound - f.inbound) * a,
      viral: f.viral + (day.viral - f.viral) * a,
      sales: f.sales + (day.sales - f.sales) * a,
      paid: f.paid + (day.paid - f.paid) * a,
      lost: f.lost + (day.lost - f.lost) * a,
      why: Object.fromEntries([...keys].map((k) => [k, (fw[k] ?? 0) + ((why[k] ?? 0) - (fw[k] ?? 0)) * a]).filter(([, v]) => (v as number) > 1e-4)),
    };
    // 이번 달 고객 리포트(A-157)
    const cm = custMonthOf(s);
    const add = (o: Partial<Record<string, number>>, k: string, v: number) => v > 0 && (o[k] = (o[k] ?? 0) + v);
    add(cm.gain, 'inbound', day.inbound);
    add(cm.gain, 'viral', day.viral);
    add(cm.gain, 'sales', day.sales);
    add(cm.gain, 'ads', gotAd);
    add(cm.gain, 'campaign', gotCp);
    for (const [k, v] of Object.entries(why)) add(cm.lost, k, v);
    // 매출 누적(일할)
    const rpu = revenuePerUser(s, m, fx);
    s.accrual.revSub += (ms.users * rpu.sub) / 30;
    s.accrual.revAd += (ms.users * rpu.ad) / 30;
    s.accrual.revTake += (ms.users * rpu.take) / 30;
    s.accrual.infra += (ms.users * infraPerUser(s, fx)) / 30;
  }
  const u = totalUsers(s);
  s.company.peakUsers = Math.max(s.company.peakUsers, u);
  scaleMilestone(s, u);
}

export function custMonthOf(s: GameState): CustMonth {
  return (s.company.custMonth ??= { start: totalUsers(s), gain: {}, lost: {} });
}

// 하루 이탈을 이유별로 나눕니다(A-157 고객 리포트). 좋은 요인(기능·리텐션·고객지원·좋은 기간 효과)만 있을 때 떠났을 몫이 "원래 떠나는 고객",
// 그 위로 더 떠난 몫을 나쁜 요인마다 크기(로그) 비율로 나눕니다. 곱해지는 요인끼리 겹치는 몫도 한쪽에 몰리지 않습니다.
function lossWhy(s: GameState, users: number, k: { ind: number; price: number; bugF: number; econ: number; features: number; cs: number; ret: number }): Record<string, number> {
  const mods = s.modifiers.filter((x) => x.key === 'churn' && x.until > s.day);
  const goodAdd = Math.min(0, k.features) + Math.min(0, k.cs) - k.ret + mods.reduce((a, x) => a + Math.min(0, x.value), 0);
  const badAdd: [string, number][] = [['cs', Math.max(0, k.cs)], ['natural', Math.max(0, k.features)]];
  for (const x of mods) if (x.value > 0) badAdd.push([`mod:${x.label}`, x.value]);
  const addSum = badAdd.reduce((a, [, v]) => a + v, 0);
  const innerGood = Math.max(0.3, 1 + goodAdd);
  const innerAll = Math.max(0.3, 1 + goodAdd + addSum);
  const goodRate = k.ind * Math.min(1, k.price) * innerGood * Math.min(1, k.econ);
  const allRate = k.ind * k.price * innerAll * k.bugF * k.econ;
  const out: Record<string, number> = { natural: (users * goodRate) / 30 };
  const extra = (users * Math.max(0, allRate - goodRate)) / 30;
  const logs: [string, number][] = [
    ['price', Math.log(Math.max(1, k.price))],
    ['bugs', Math.log(k.bugF)],
    ['natural', Math.log(Math.max(1, k.econ))], // 경기 탓은 화면·메신저에서 말하지 않음(경기 문구는 뉴스로만) — 원래 떠나는 고객에 넣음
  ];
  for (const [key, v] of badAdd) logs.push([key, addSum > 0 ? (Math.log(innerAll / innerGood) * v) / addSum : 0]);
  const L = logs.reduce((a, [, v]) => a + Math.max(0, v), 0);
  if (extra > 0 && L > 0) for (const [key, v] of logs) if (v > 0) out[key] = (out[key] ?? 0) + (extra * v) / L;
  return out;
}

// 규모 사다리(A-156): 1만 → 10만 → … → 10억(B2B는 고객사 10 → 10만)
export function scaleSteps(s: GameState): number[] {
  return DATA.markets.scale[audience(s)];
}

export function unitWord(s: GameState): string {
  return industry(s.company.industry).unit === '고객사' ? '곳' : '명';
}

// 처음 넘은 단계는 뉴스·알림(그 단계에서 새로 열린 광고 채널·캠페인도 같이). 예전 저장이 한꺼번에 여러 단계를 넘으면 가장 높은 것만 알림
function scaleMilestone(s: GameState, u: number) {
  const crossed = scaleSteps(s).filter((n) => u >= n && !s.flags.includes(`scale-${n}`));
  if (!crossed.length) return;
  for (const n of crossed) s.flags.push(`scale-${n}`);
  const n = crossed[crossed.length - 1];
  const unit = industry(s.company.industry).unit;
  const who = `${unit} ${countShort(n)}${unitWord(s)}`;
  news(s, `[성장] ${s.company.name}, ${who} 돌파`, 'company');
  const opened = opensAt(s, n);
  notify(s, `${who}을 넘었습니다.${opened.length ? ` 이제 ${opened.map((x) => `"${x}"`).join(', ')}을(를) 할 수 있습니다(시장·광고).` : ''}`, 'mission', 'market');
  if (n >= scaleSteps(s)[Math.max(0, scaleSteps(s).length - 2)]) s.events.push({ type: 'confetti' });
}

// 제품 여유(A-156, SC의 잠재 사용자를 말로): 지금 사용자 ÷ 지금 제품이 받쳐 주는 고객 수(잠재 고객 × 점유율, 화면에 숫자로 안 보임)
export type RoomState = 'room' | 'near' | 'full' | 'over';
export function roomState(users: number, target: number): RoomState {
  const R = DATA.markets.scale.room;
  const r = target > 0 ? users / target : 0;
  return r > R.over ? 'over' : r >= R.full ? 'full' : r >= R.near ? 'near' : 'room';
}

export function growthRoom(s: GameState): { state: RoomState; closed: MarketId[] } {
  let users = 0;
  let target = 0;
  for (const m of launchedMarkets(s)) {
    users += s.markets[m].users;
    target += demand(s, m) * shares(s, m).player;
  }
  return { state: roomState(users, target), closed: MARKET_IDS.filter((m) => !s.markets[m].launched) };
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
