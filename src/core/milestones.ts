// 약속(마일스톤, A-177): 대표가 회사의 개발 사이클을 날짜로 관리하게 합니다.
// 바깥이 날짜를 제안합니다 — 고객사(B2B: 기능 → 연 계약), 제휴사(B2C: 기능 → 제휴 홍보), 행사(발표일 = 기한, MVP 전엔 데모데이에서 MVP 공개),
// 투자사(라운드 뒤 다음 목표 → 투자 확률). 분기마다 대표가 스스로 목표 수준을 고릅니다(추세보다 높을수록 보상·대가가 큼, 낮게 잡기는 이득이 작음).
// 받으면 기한 안에 조건을 채워야 하고, 지키면 보상과 약속 신뢰, 늦으면 보상 일부, 크게 늦거나 포기하면 신뢰가 깎입니다.
// 늦을 것 같으면 조율: 범위 줄이기 · 기한 연장 요청 · 팀 몰아치기 · 포기. 예상 끝나는 날은 범위로(진행할수록 좁아짐)
import M from '../data/milestones.json';
import { feature, industry, investor } from './data';
import { ceoDevPerDay, ceoEnergy } from './ceo';
import { orderShare } from './assign';
import { hasActiveContract } from './contracts';
import { deptOutput } from './staff';
import { addToRoadmap, appeal, availableFeatures, coreFeatures, etaDays, featureLevel, featureLock, hasMvp, itemNeed, revealHidden, ROADMAP_MAX, upkeepShare, canCharge } from './product';
import { featureWork } from './data';
import { dayName, outingConflict, outings } from './outings';
import { lastRevenue, spendNow } from './finance';
import { totalUsers } from './market';
import { addMod } from './mods';
import { news, notify } from './notify';
import { ensureExternal, ensureNamedExternal, getChannel, post } from './messenger';
import { nextId } from './ids';
import { pick, rand, randInt, randRange } from './rng';
import { isQuarterStart, quarterLabel } from './calendar';
import type { GameState, Milestone, MilestoneKind, MilestoneState, RoadmapItem } from './types';

export const MS = M;
const OUTSIDE: MilestoneKind[] = ['customer', 'partner', 'event'];

export function msState(s: GameState): MilestoneState {
  return (s.milestones ??= { list: [], trust: M.trust.start, nextOfferDay: s.day + M.firstOfferDay, roundSeen: null, kept: 0, broken: 0 });
}

export function milestones(s: GameState): Milestone[] {
  return s.milestones?.list ?? [];
}

export function openMilestones(s: GameState): Milestone[] {
  return milestones(s).filter((m) => m.status === 'offer' || m.status === 'active');
}

function changeTrust(s: GameState, d: number) {
  const st = msState(s);
  st.trust = Math.max(0, Math.min(100, st.trust + d));
}

// 투자 결정 확률에 더하는 값(funding.ts). 약속을 한 번도 안 하면 0
export function milestoneInvestFactor(s: GameState): number {
  const t = s.milestones?.trust ?? M.trust.start;
  return Math.max(-M.trust.investCap, Math.min(M.trust.investCap, ((t - 50) / 10) * M.trust.investPer10));
}

function dealTrustMult(s: GameState): number {
  return Math.max(0.5, 1 + (((s.milestones?.trust ?? 50) - 50) / 10) * M.trust.dealPer10);
}

// ── 개발 속도(업무 창과 같은 계산) ──
export function devRates(s: GameState) {
  const ceo = ceoDevPerDay(s);
  // 기능 개발을 하는 사람 비율(개인 업무·부서 안의 팀 일 포함, A-147·A-226). 외주가 없으면 외주 맡은 사람도 기능 개발
  const devBuilding = orderShare(s, 'dev', 'dev_build') + (hasActiveContract(s) ? 0 : orderShare(s, 'dev', 'dev_contract'));
  const team = devBuilding * deptOutput(s, 'dev');
  const design = orderShare(s, 'design', 'design_build') * deptOutput(s, 'design');
  const upkeep = upkeepShare(s);
  return { ceo, team, design, dev: (ceo + team) * (1 - upkeep), upkeep };
}

function needMet(s: GameState, n: { id: string; level: number }) {
  return featureLevel(s, n.id) >= n.level;
}

// 조건 기능이 만드는 순서 몇 번째인가(없으면 -1)
function needIndex(s: GameState, n: { id: string; level: number }): number {
  return s.product.roadmap.findIndex((r) => r.id === n.id && r.level === n.level);
}

// 지금 속도로 조건 기능이 다 끝나는 날수(오늘부터). 순서에 없는 기능이 있으면 Infinity
function needsEta(s: GameState, needs: { id: string; level: number }[]): number {
  const left = needs.filter((n) => !needMet(s, n));
  if (!left.length) return 0;
  const r = devRates(s);
  const etas = etaDays(s.product.roadmap, r.dev, r.design);
  let worst = 0;
  for (const n of left) {
    const i = needIndex(s, n);
    if (i < 0) return Infinity;
    worst = Math.max(worst, etas[i]);
  }
  return worst;
}

function needsProgress(s: GameState, needs: { id: string; level: number }[]): number {
  let all = 0;
  let done = 0;
  for (const n of needs) {
    const w = itemNeed({ id: n.id, level: n.level, devDone: 0, designDone: 0 });
    all += w.dev + w.design;
    if (needMet(s, n)) done += w.dev + w.design;
    else {
      const it = s.product.roadmap[needIndex(s, n)];
      if (it) done += it.devDone + it.designDone;
    }
  }
  return all ? Math.min(1, done / all) : 1;
}

// ── 지표(투자사·분기 목표) ──
export function metricValue(s: GameState, m: 'users' | 'mrr'): number {
  return m === 'users' ? totalUsers(s) : lastRevenue(s);
}

// 하루 기울기(최근 60일 사용자, 또는 최근 3개월 매출)
function metricSlope(s: GameState, m: 'users' | 'mrr'): number {
  if (m === 'users') {
    const d = s.product.daily ?? [];
    if (d.length < 2) return 0;
    const a = d[Math.max(0, d.length - 61)];
    const b = d[d.length - 1];
    return (b.users - a.users) / Math.max(1, b.day - a.day);
  }
  const h = s.plHistory;
  if (h.length < 2) return 0;
  const a = h[Math.max(0, h.length - 4)];
  const b = h[h.length - 1];
  return (b.revenue - a.revenue) / (Math.max(1, h.length - 1 - Math.max(0, h.length - 4)) * 30);
}

// 90일 추세 성장률(최소 minGrowth)
export function trendGrowth(s: GameState, m: 'users' | 'mrr'): number {
  const v = metricValue(s, m);
  return Math.max(M.goal.minGrowth, v > 0 ? (metricSlope(s, m) * 90) / v : 0);
}

function metricEta(s: GameState, ms: Milestone): number {
  const v = metricValue(s, ms.metric!);
  if (v >= ms.target!) return 0;
  const k = metricSlope(s, ms.metric!);
  return k > 0 ? Math.ceil((ms.target! - v) / k) : Infinity;
}

// ── 예상 끝나는 날(범위) ──
export interface MilestoneForecast {
  mid: number; // 오늘부터 날수(Infinity = 지금은 안 끝남)
  lo: number;
  hi: number;
  progress: number; // 0~1
  risk: 'done' | 'ok' | 'tight' | 'late';
  daysLeft: number; // 기한까지
}

export function forecast(s: GameState, m: Milestone): MilestoneForecast {
  const dl = (m.deadline ?? s.day + m.days) - s.day;
  let mid: number;
  let progress: number;
  if (m.needs) {
    const add = m.status === 'offer' ? m.needs.filter((n) => !needMet(s, n) && needIndex(s, n) < 0).map((n) => n.id) : [];
    mid = add.length ? etaIfAdded(s, add) : needsEta(s, m.needs);
    progress = needsProgress(s, m.needs);
  } else {
    const target = m.target ?? (m.targets ? m.targets[m.level ?? 1] : 0);
    const tmp = { ...m, target };
    mid = metricEta(s, tmp);
    const base = m.base ?? metricValue(s, m.metric!);
    progress = target > base ? Math.max(0, Math.min(1, (metricValue(s, m.metric!) - base) / (target - base))) : 1;
  }
  const left = 1 - progress;
  // A-181: 기능 약속은 점검 전엔 숨은 일 몫만큼 뒤로 길게, 점검하면(또는 숨은 일이 드러나면) 좁게
  const sp = !m.needs || m.kind === 'goal' || m.kind === 'investor' ? M.spread : m.checked ? M.hidden.known : M.hidden.unknown;
  const lo = isFinite(mid) ? Math.floor(mid * (1 - sp.lo * left)) : Infinity;
  const hi = isFinite(mid) ? Math.ceil(mid * (1 + sp.hi * left)) : Infinity;
  const risk = mid === 0 ? 'done' : hi <= dl ? 'ok' : lo <= dl ? 'tight' : 'late';
  return { mid, lo, hi, progress, risk, daysLeft: dl };
}

// ── 제안 ──
function postOffer(s: GameState, m: Milestone, text: string) {
  if (!m.channelId) return;
  post(s, m.channelId, m.from, text, 'npc');
  const ch = getChannel(s, m.channelId);
  const last = ch?.messages[ch.messages.length - 1];
  if (last) last.milestoneId = m.id;
}

function base(s: GameState, kind: MilestoneKind, title: string, from: string, days: number): Milestone {
  return { id: nextId(s, 'ms'), kind, title, from, status: 'offer', offeredDay: s.day, offerUntil: s.day + M.offerValidDays, days, reward: {} };
}

const clampDays = (d: number, k: { minDays: number; maxDays: number }) => Math.max(k.minDays, Math.min(k.maxDays, Math.ceil(d)));

// 조건 기능을 순서 끝에 넣었을 때 끝나는 날수
function etaIfAdded(s: GameState, ids: string[]): number {
  const r = devRates(s);
  const items: RoadmapItem[] = [...s.product.roadmap, ...ids.map((id) => ({ id, level: featureLevel(s, id) + 1, devDone: 0, designDone: 0 }))];
  const e = etaDays(items, r.dev, r.design);
  return e[e.length - 1] ?? Infinity;
}

function offerFeatureDeal(s: GameState, kind: 'customer' | 'partner') {
  const k = M[kind];
  const cats = k.cats as string[];
  const cand = availableFeatures(s)
    .filter((f) => cats.includes(f.cat) && featureLevel(s, f.id) === 0 && !s.product.roadmap.some((r) => r.id === f.id))
    .sort((a, b) => a.dev + a.design - (b.dev + b.design))
    .slice(0, 5);
  const n = Math.min(cand.length, randInt(s, k.features[0], k.features[1]));
  if (!n || s.product.roadmap.length + n > ROADMAP_MAX) return;
  const picked: typeof cand = [];
  while (picked.length < n) {
    const f = pick(s, cand.filter((x) => !picked.includes(x)));
    picked.push(f);
  }
  const eta = etaIfAdded(s, picked.map((f) => f.id));
  if (!isFinite(eta) || eta > k.maxDays) return;
  const days = clampDays(eta * randRange(s, k.slack[0], k.slack[1]), k);
  const host = pick(s, k.names);
  const names = picked.map((f) => `"${f.name}"`).join(', ');
  const m = base(s, kind, kind === 'customer' ? `${names} 기능 → 연 계약` : `${names} 기능 → 제휴 홍보`, host, days);
  m.needs = picked.map((f) => ({ id: f.id, level: 1 }));
  m.channelId = ensureNamedExternal(s, host);
  if (kind === 'customer') m.reward = { months: randInt(s, M.customer.months[0], M.customer.months[1]), mult: randRange(s, M.customer.monthlyMult[0], M.customer.monthlyMult[1]) };
  msState(s).list.push(m);
  postOffer(
    s,
    m,
    kind === 'customer'
      ? `안녕하세요, ${host}입니다. 저희가 쓰려면 ${names} 기능이 꼭 필요합니다. ${days}일 안에 준비해 주시면 ${m.reward.months}개월 계약을 하고 싶습니다. 가능하실까요?`
      : `안녕하세요, ${host}입니다. ${names} 기능이 ${days}일 안에 나오면 저희 고객에게 함께 알리는 제휴를 하고 싶습니다.`,
  );
  notify(s, `약속 제안: ${host} — ${days}일 안에 ${names}`, 'info', 'schedule');
}

// 고객사 미팅 마지막 단계에서 이겼을 때(A-186): 미팅에서 약속한 기능을 기한 안에 만들면 계약하는 약속 제안.
// 만드는 순서가 꽉 찼거나 기한 안에 못 끝나면 false
export function offerCustomerPromise(s: GameState, host: string, ids: string[], reward: { months: number; mult: number }): boolean {
  const k = M.customer;
  const need = ids.filter((id) => featureLevel(s, id) === 0);
  if (!need.length || s.product.roadmap.length + need.filter((id) => !s.product.roadmap.some((r) => r.id === id)).length > ROADMAP_MAX) return false;
  const eta = etaIfAdded(s, need.filter((id) => !s.product.roadmap.some((r) => r.id === id)));
  if (!isFinite(eta)) return false;
  const days = clampDays(eta * randRange(s, k.slack[0], k.slack[1]) + 14, k);
  const names = need.map((id) => `"${feature(id).name}"`).join(', ');
  const m = base(s, 'customer', `${names} 기능 → 연 계약`, host, days);
  m.needs = need.map((id) => ({ id, level: 1 }));
  m.channelId = ensureNamedExternal(s, host);
  m.reward = reward;
  msState(s).list.push(m);
  postOffer(s, m, `미팅에서 말씀하신 ${names} 기능을 ${days}일 안에 준비해 주시면 ${reward.months}개월 계약으로 진행하겠습니다.`);
  return true;
}

function offerEvent(s: GameState) {
  const k = M.event;
  const mvp = hasMvp(s);
  let needs: { id: string; level: number }[];
  if (!mvp) needs = coreFeatures(s).filter((f) => featureLevel(s, f.id) < 1).map((f) => ({ id: f.id, level: 1 }));
  else {
    const front = s.product.roadmap[0];
    if (!front) return;
    needs = [{ id: front.id, level: front.level }];
  }
  if (!needs.length) return;
  const eta = needsEta(s, needs);
  if (!isFinite(eta) || eta > k.maxDays) return;
  const days = clampDays(eta * randRange(s, k.slack[0], k.slack[1]), k);
  const host = pick(s, k.names);
  const what = mvp ? `"${feature(needs[0].id).name}" 발표` : 'MVP 공개';
  const m = base(s, 'event', `${host}에서 ${what}`, host, days);
  m.deadline = s.day + days; // 행사 날은 정해져 있음
  m.needs = needs;
  m.channelId = ensureNamedExternal(s, host);
  msState(s).list.push(m);
  postOffer(s, m, `${host} 운영팀입니다. ${days}일 뒤 행사에서 ${mvp ? `"${feature(needs[0].id).name}" 기능을 처음 선보이는` : '서비스를 처음 공개하는'} 발표 자리를 드리고 싶습니다. 행사 날짜는 바꿀 수 없습니다.`);
  notify(s, `약속 제안: ${host} — ${days}일 뒤 ${what}`, 'info', 'schedule');
}

function offerInvestor(s: GameState) {
  const st = msState(s);
  const r = [...s.rounds].reverse().find((x) => x.status === 'accepted' && x.closedDay !== null && x.leadId);
  if (!r || r.closedDay === null || (st.roundSeen !== null && r.closedDay <= st.roundSeen)) return;
  st.roundSeen = r.closedDay;
  if (s.public) return;
  const metric: 'users' | 'mrr' = canCharge(s) && lastRevenue(s) > 0 ? 'mrr' : 'users';
  const v = metricValue(s, metric);
  if (v < (metric === 'users' ? 20 : 1)) return;
  const inv = investor(r.leadId!);
  const target = Math.ceil(v * randRange(s, M.investor.growth[0], M.investor.growth[1]));
  const m = base(s, 'investor', metric === 'mrr' ? '월 매출 목표' : '사용자 목표', inv.name, M.investor.days);
  m.metric = metric;
  m.target = target;
  m.channelId = ensureExternal(s, inv.id);
  msState(s).list.push(m);
  postOffer(s, m, `투자 마무리 감사합니다. 다음 라운드 전에 ${M.investor.days}일 안에 ${metric === 'mrr' ? `월 매출 ${Math.round(target / 1e4).toLocaleString('ko-KR')}만원` : `사용자 ${target.toLocaleString('ko-KR')}명`}을 함께 목표로 잡으면 어떨까요? 지키시면 저희도 다음 투자에 힘을 싣겠습니다.`);
  notify(s, `약속 제안: ${inv.name} — ${M.investor.days}일 안에 ${metric === 'mrr' ? '월 매출' : '사용자'} 목표`, 'info', 'schedule');
}

function offerGoal(s: GameState) {
  if (!hasMvp(s) || s.public || !isQuarterStart(s.day)) return;
  if (milestones(s).some((m) => m.kind === 'goal' && (m.status === 'offer' || m.status === 'active'))) return;
  const metric: 'users' | 'mrr' = canCharge(s) && lastRevenue(s) > 0 ? 'mrr' : 'users';
  const v = metricValue(s, metric);
  if (v <= 0) return;
  const g = trendGrowth(s, metric);
  const m = base(s, 'goal', `${quarterLabel(s.day)} 목표`, '나(대표)', M.goal.days);
  m.offerUntil = s.day + M.goal.offerDays;
  m.deadline = s.day + M.goal.days;
  m.metric = metric;
  m.base = v;
  m.targets = M.goal.levels.map((l) => Math.ceil(v * (1 + g * l.mult)));
  msState(s).list.push(m);
  notify(s, `${quarterLabel(s.day)}입니다. 이번 분기 목표 수준을 CEO 일정에서 정하세요(${M.goal.offerDays}일 안에).`, 'info', 'schedule');
}

// 행사 참가비(회사 단계별, 받을 때 냄)
export function eventFee(s: GameState): number {
  const f = M.event.fee;
  return f[Math.min(f.length - 1, s.company.stage)];
}

// ── 숨은 일과 점검 회의(A-181) ──
// 받는 순간 조건 기능마다 숨은 일이 붙을 수 있음. 아무도 모름(화면도 "있을 수 있음"으로만)
function rollHidden(s: GameState, m: Milestone) {
  const kind = m.kind as 'customer' | 'partner' | 'event';
  m.checked = false;
  m.reviews = 0;
  m.nextReviewDay = (m.startDay ?? s.day) + Math.max(2, Math.ceil(m.days * randRange(s, M.review.firstAt[0], M.review.firstAt[1])));
  for (const n of m.needs!) {
    const it = s.product.roadmap.find((r) => r.id === n.id && r.level === n.level);
    if (!it || rand(s) >= M.hidden.chance[kind]) continue;
    const base = featureWork(feature(n.id), n.level).dev;
    it.hidden = (it.hidden ?? 0) + Math.round(base * randRange(s, M.hidden.extra[kind][0], M.hidden.extra[kind][1]));
  }
}

function needItems(s: GameState, m: Milestone) {
  return (m.needs ?? []).map((n) => s.product.roadmap.find((r) => r.id === n.id && r.level === n.level)).filter((x): x is RoadmapItem => !!x);
}

function teamChannel(s: GameState): string {
  return s.channels.some((c) => c.id === 'team-dev') ? 'team-dev' : 'all';
}

// 점검 회의 요청: 개발팀이 있고, 아직 점검 안 한 기능 약속이고, 걸린 회의가 없을 때
function requestReview(s: GameState, m: Milestone) {
  const devs = s.employees.filter((e) => e.dept === 'dev' && e.leaving === null);
  if (!devs.length) return;
  if (outings(s).some((o) => o.milestoneId === m.id && (o.status === 'offer' || o.status === 'booked'))) return;
  const R = M.review;
  const lead = devs.find((e) => e.lead) ?? pick(s, devs);
  const startDay = s.day + randInt(s, R.lead[0], R.lead[1]);
  if (startDay > (m.deadline ?? s.day)) return;
  const o = { id: nextId(s, 'out'), tpl: 'review', kind: 'review' as const, title: '점검 회의', host: lead.name, channelId: teamChannel(s), startDay, days: 1, startHour: randInt(s, R.startHour[0], R.startHour[1]), hours: 1, travel: 0, cost: 0, status: 'offer' as const, milestoneId: m.id };
  (s.outings ??= []).push(o);
  post(s, o.channelId, lead.name, `대표님, ${m.from}와 약속한 기능 진행을 ${dayName(startDay)} ${o.startHour}시에 한 시간만 같이 점검하실 수 있을까요? 생각보다 손이 많이 갈 수도 있어서요.`, 'npc');
  const ch = getChannel(s, o.channelId);
  const last = ch?.messages[ch.messages.length - 1];
  if (last) last.outingId = o.id;
  notify(s, `점검 회의 요청: ${lead.name} — ${m.from} 약속(${dayName(startDay)} ${o.startHour}시)`, 'info', 'schedule');
}

// 다녀온 점검 회의: 그 약속 기능의 숨은 일을 모두 드러내고 예상을 좁힘
function finishReview(s: GameState, m: Milestone, o: { host: string; channelId: string }) {
  let found = 0;
  for (const it of needItems(s, m)) found += revealHidden(s, it, 'review');
  m.checked = true;
  m.reviews = (m.reviews ?? 0) + 1;
  m.warned = false;
  const st = msState(s);
  st.reviewsDone = (st.reviewsDone ?? 0) + 1;
  if (found > 0) st.foundEarly = (st.foundEarly ?? 0) + 1;
  const f = forecast(s, m);
  const late = f.risk === 'late' || f.risk === 'tight';
  post(
    s,
    o.channelId,
    o.host,
    found > 0
      ? `점검 결과: 생각보다 일이 더 있습니다. 지금 속도면 ${isFinite(f.mid) ? `${f.mid}일쯤` : '한참'} 걸립니다.${late ? ' 기한이 빠듯해서 지금 조율하는 게 좋겠습니다.' : ' 그래도 기한 안에는 됩니다.'}`
      : '점검 결과: 숨은 일은 없습니다. 지금 계획대로 가면 됩니다.',
    'npc',
  );
  notify(s, found > 0 ? `점검 회의: ${m.from} 약속에 숨은 일이 있었습니다. 일찍 알아 조율할 시간이 있습니다.` : `점검 회의: ${m.from} 약속은 계획대로입니다.`, found > 0 && late ? 'urgent' : 'info', 'schedule');
}

function reviewsDay(s: GameState, m: Milestone) {
  if (!m.needs || m.status !== 'active' || (m.kind !== 'customer' && m.kind !== 'partner' && m.kind !== 'event')) return;
  // 다녀온 회의 처리
  for (const o of outings(s)) {
    if (o.milestoneId !== m.id || o.status !== 'done' || o.reviewed) continue;
    o.reviewed = true;
    finishReview(s, m, o);
  }
  // 늦은 발견: 진행이 autoAt을 넘으면 만드는 사람이 알아챔(출시 직전 발견은 product.ts)
  for (const it of needItems(s, m)) {
    if (!it.hidden) continue;
    const need = itemNeed(it);
    if ((it.devDone + it.designDone) / (need.dev + need.design) >= M.hidden.autoAt) revealHidden(s, it, 'late');
  }
  if (!m.checked && needItems(s, m).some((it) => it.found === 'late')) {
    m.checked = true;
    msState(s).foundLate = (msState(s).foundLate ?? 0) + 1;
    m.warned = false;
    notify(s, `${m.from} 약속: 마무리 무렵에야 숨은 일이 드러났습니다. 점검했다면 더 일찍 알았을 겁니다.`, forecast(s, m).risk === 'late' ? 'urgent' : 'bad', 'schedule');
  }
  // 새 요청(아직 점검 안 했고 기한 전)
  if (!m.checked && s.day >= (m.nextReviewDay ?? Infinity)) {
    m.nextReviewDay = s.day + randInt(s, M.review.every[0], M.review.every[1]);
    requestReview(s, m);
  }
}

// 이 약속에 걸린 점검 회의(답할 것 또는 잡힌 것)
export function pendingReview(s: GameState, m: Milestone) {
  return outings(s).find((o) => o.milestoneId === m.id && (o.status === 'offer' || o.status === 'booked'));
}

export function reviewConflict(s: GameState, m: Milestone) {
  const o = pendingReview(s, m);
  return o && o.status === 'offer' ? outingConflict(s, o) : null;
}

// ── 받기·거절 ──
export function acceptMilestone(s: GameState, id: string, level?: number): string | null {
  const m = milestones(s).find((x) => x.id === id);
  if (!m || m.status !== 'offer') return '이미 지난 제안입니다.';
  if (m.kind === 'goal') {
    if (level === undefined || !M.goal.levels[level]) return '목표 수준을 고르세요.';
    m.level = level;
    m.target = m.targets![level];
  } else if (m.needs && m.kind !== 'event') {
    const add = m.needs.filter((n) => !needMet(s, n) && needIndex(s, n) < 0);
    if (s.product.roadmap.length + add.length > ROADMAP_MAX) return `만드는 순서가 꽉 찼습니다(${ROADMAP_MAX}개). 하나를 빼고 받으세요.`;
    for (const n of add) {
      const lock = featureLock(s, feature(n.id));
      if (lock) return `"${feature(n.id).name}": ${lock}`;
    }
    for (const n of add) addToRoadmap(s, n.id);
  }
  if (m.kind === 'event') {
    const fee = eventFee(s);
    if (fee > s.cash) return '참가비를 낼 자금이 부족합니다.';
    if (fee) spendNow(s, `행사 참가비(${m.from})`, fee, 'other');
  }
  if (m.kind === 'investor') m.base = metricValue(s, m.metric!);
  m.status = 'active';
  m.startDay = s.day;
  m.deadline ??= s.day + m.days;
  if (m.needs && (m.kind === 'customer' || m.kind === 'partner' || m.kind === 'event')) rollHidden(s, m);
  if (m.channelId) {
    post(s, m.channelId, '나(대표)', '좋습니다. 그 날짜에 맞추겠습니다.', 'player');
    post(s, m.channelId, m.from, pick(s, ['감사합니다. 기대하겠습니다.', '좋습니다. 날짜 잡아 두겠습니다.']), 'npc');
  }
  return null;
}

export function declineMilestone(s: GameState, id: string): string | null {
  const m = milestones(s).find((x) => x.id === id);
  if (!m || m.status !== 'offer') return '이미 지난 제안입니다.';
  m.status = 'declined';
  m.endDay = s.day;
  if (m.channelId) {
    post(s, m.channelId, '나(대표)', '지금은 그 날짜를 약속드리기 어렵습니다. 죄송합니다.', 'player');
    post(s, m.channelId, m.from, '알겠습니다. 다음에 다시 이야기하죠.', 'npc');
  }
  return null;
}

// ── 조율 ──
export function canCut(m: Milestone): boolean {
  return m.status === 'active' && (m.kind === 'customer' || m.kind === 'partner') && !m.cut && (m.needs?.length ?? 0) > 1;
}

export function canExtend(s: GameState, m: Milestone): boolean {
  // 막판 부탁은 안 통함(A-181): 기한까지 기간의 extendMinLeft 이상 남았을 때만
  return m.status === 'active' && (m.kind === 'customer' || m.kind === 'partner' || m.kind === 'investor') && !m.extended && (m.deadline ?? 0) - s.day >= m.days * M.extendMinLeft;
}

export function canPush(s: GameState, m: Milestone): boolean {
  return m.status === 'active' && !m.pushed && !!m.needs && s.employees.some((e) => e.dept === 'dev');
}

export function cutScope(s: GameState, id: string): string | null {
  const m = milestones(s).find((x) => x.id === id);
  if (!m || !canCut(m)) return '범위를 줄일 수 없는 약속입니다.';
  const i = [...m.needs!.keys()].reverse().find((k) => !needMet(s, m.needs![k])) ?? m.needs!.length - 1;
  const gone = m.needs!.splice(i, 1)[0];
  m.cut = true;
  m.warned = false;
  changeTrust(s, M.trust.cut);
  if (m.channelId) {
    post(s, m.channelId, '나(대표)', `"${feature(gone.id).name}"은 이번에 빼고, 나머지를 날짜에 맞춰 드려도 될까요?`, 'player');
    post(s, m.channelId, m.from, '아쉽지만 알겠습니다. 계약 조건은 그만큼 줄이겠습니다.', 'npc');
  }
  return null;
}

export function extendDeadline(s: GameState, id: string): string | null {
  const m = milestones(s).find((x) => x.id === id);
  if (!m || !canExtend(s, m)) return '기한을 미룰 수 없는 약속입니다.';
  const add = Math.ceil(m.days * M.extendFrac);
  m.deadline! += add;
  m.extended = true;
  m.warned = false;
  changeTrust(s, M.trust.extend);
  if (m.channelId) {
    post(s, m.channelId, '나(대표)', `죄송합니다. ${add}일만 더 주실 수 있을까요?`, 'player');
    post(s, m.channelId, m.from, '…이번 한 번만입니다.', 'npc');
  }
  return null;
}

export function pushTeam(s: GameState, id: string): string | null {
  const m = milestones(s).find((x) => x.id === id);
  if (!m || !canPush(s, m)) return '몰아칠 수 없습니다(개발자가 있어야 하고, 약속 하나에 한 번).';
  const P = M.push;
  addMod(s, 'output', P.output, P.days, `약속 몰아치기: ${m.from}`);
  addMod(s, 'sat', P.sat, P.days, '약속 때문에 몰아침');
  s.ceoEnergy = Math.max(0, ceoEnergy(s) - P.energy);
  s.product.bugs = Math.min(100, s.product.bugs + P.bugs);
  m.pushed = true;
  m.warned = false;
  post(s, s.channels.some((c) => c.id === 'team-dev') ? 'team-dev' : 'all', '나(대표)', `${m.from}와 약속한 날짜가 빠듯합니다. ${P.days}일만 다 같이 몰아칩시다.`, 'player');
  return null;
}

export function dropMilestone(s: GameState, id: string): string | null {
  const m = milestones(s).find((x) => x.id === id);
  if (!m || m.status !== 'active') return '진행 중인 약속이 아닙니다.';
  fail(s, m, true);
  return null;
}

// ── 결과 ──
function trustFor(m: Milestone, outcome: 'early' | 'onTime' | 'late'): number {
  if (m.kind === 'goal') return M.goal.levels[m.level ?? 0].trust * (outcome === 'late' ? 0 : 1);
  return M.trust[outcome];
}

function complete(s: GameState, m: Milestone) {
  const dl = m.deadline!;
  const outcome = s.day > dl ? 'late' : s.day <= dl - m.days * M.earlyFrac ? 'early' : 'onTime';
  m.status = outcome === 'late' ? 'late' : 'done';
  m.endDay = s.day;
  const k = (outcome === 'late' ? M.lateReward : 1) * (m.cut ? (m.kind === 'partner' ? M.partner.cutReward : M.customer.cutReward) : 1);
  changeTrust(s, trustFor(m, outcome));
  msState(s).kept += 1;
  const when = outcome === 'early' ? '기한보다 일찍' : outcome === 'onTime' ? '기한 안에' : '기한을 넘겨';
  switch (m.kind) {
    case 'customer': {
      const ind = industry(s.company.industry);
      const monthly = Math.round((ind.entBase * (1 + appeal(s) / 250) * (m.reward.mult ?? 1) * dealTrustMult(s) * k) / 1e5) * 1e5;
      const months = m.reward.months ?? 12;
      s.enterprise.push({ id: nextId(s, 'ent'), name: m.from.replace(/ (구매|IT|운영|기획|전산)팀$/, ''), monthly, startDay: s.day, endDay: s.day + months * 30, market: 'kr' });
      s.company.enterpriseCount += 1;
      notify(s, `약속을 지켰습니다(${when}): ${m.from}와 ${months}개월 계약 — 월 ${Math.round(monthly / 1e4).toLocaleString('ko-KR')}만원`, 'good', 'schedule');
      news(s, `[계약] ${s.company.name}, 약속한 기능 내놓고 ${m.from.replace(/ .*$/, '')}과 공급 계약`, 'company');
      break;
    }
    case 'partner':
    case 'event': {
      const aw = m.kind === 'partner' ? M.partner.awareness : M.event.awareness;
      const kr = s.markets.kr;
      if (kr.launched) {
        kr.awareness = Math.min(1, kr.awareness + aw * k);
        if (m.kind === 'partner') kr.users *= 1 + M.partner.users * k;
      }
      if (m.kind === 'event') {
        if (!s.public) s.irPoints += M.event.ir * k;
        s.career.rep += M.event.rep;
        news(s, `[행사] ${s.company.name}, ${m.from}에서 ${hasMvp(s) && m.needs?.length === 1 ? '새 기능' : '서비스'} 첫 공개`, 'company');
      }
      notify(s, `약속을 지켰습니다(${when}): ${m.title}. 회사를 알릴 기회가 됐습니다.`, 'good', 'schedule');
      break;
    }
    case 'investor':
      addMod(s, 'invest', M.investor.investBonus * k, M.investor.investBonusDays, `${m.from}와의 약속을 지킴`);
      notify(s, `약속을 지켰습니다(${when}): ${m.from}와 잡은 목표를 넘었습니다. 다음 투자 때 힘이 됩니다.`, 'good', 'schedule');
      break;
    case 'goal': {
      const lv = M.goal.levels[m.level ?? 0];
      addMod(s, 'sat', lv.sat * k, M.goal.satDays, `${m.title} 달성`);
      notify(s, `${m.title}(${lv.name})를 이뤘습니다. 팀 분위기가 좋아졌습니다.`, 'good', 'schedule');
      break;
    }
  }
  if (m.channelId) post(s, m.channelId, m.from, outcome === 'late' ? '늦었지만 받았습니다. 다음엔 날짜를 꼭 지켜 주세요.' : '약속을 지켜 주셔서 감사합니다!', 'npc');
}

function fail(s: GameState, m: Milestone, dropped = false) {
  m.status = 'failed';
  m.endDay = s.day;
  msState(s).broken += 1;
  if (m.kind === 'goal') {
    const lv = M.goal.levels[m.level ?? 0];
    changeTrust(s, lv.missTrust);
    if (lv.missSat) addMod(s, 'sat', lv.missSat, M.goal.satDays, `${m.title} 못 이룸`);
    notify(s, `${m.title}(${lv.name})를 이루지 못했습니다.`, 'bad', 'schedule');
    return;
  }
  changeTrust(s, dropped ? M.trust.drop : M.trust.fail);
  // 못 지킨 대가(A-177): 약속마다 상대가 쥔 것을 잃음
  const kr = s.markets.kr;
  if (m.kind === 'customer') {
    s.career.rep = Math.max(0, s.career.rep - M.customer.failRep);
    s.entPipeline *= 1 - M.customer.failPipeline;
  } else if (m.kind === 'partner') kr.awareness = Math.max(0, kr.awareness - M.partner.failAwareness);
  else if (m.kind === 'event') {
    s.career.rep = Math.max(0, s.career.rep - M.event.missRep);
    s.irPoints = Math.max(0, s.irPoints - M.event.missIr);
    if (kr.launched) kr.awareness = Math.max(0, kr.awareness - M.event.missAwareness);
    news(s, `[행사] ${s.company.name}, ${m.from} 발표 직전 취소… "준비가 덜 됐다"`, 'company');
  } else if (m.kind === 'investor') addMod(s, 'invest', -M.investor.investPenalty, M.investor.investBonusDays, `${m.from}와의 약속을 못 지킴`);
  notify(s, `약속을 ${dropped ? '포기했습니다' : '지키지 못했습니다'}: ${m.title}(${m.from}). 약속 신뢰가 떨어졌습니다.`, 'bad', 'schedule');
  if (m.channelId) post(s, m.channelId, m.from, dropped ? '…알겠습니다. 이번 일은 없던 걸로 하죠.' : '약속한 날이 지났네요. 이번 일은 없던 걸로 하겠습니다.', 'npc');
}

function met(s: GameState, m: Milestone): boolean {
  if (m.needs) return m.needs.every((n) => needMet(s, n));
  return metricValue(s, m.metric!) >= m.target!;
}

// 마감 뒤 늦어도 받아 주는 기간(고객사·제휴사만). 행사·투자사·분기 목표는 기한이 끝
function graceDays(m: Milestone): number {
  return m.kind === 'customer' || m.kind === 'partner' ? Math.ceil(m.days * M.grace) : 0;
}

// 하루 끝(sim.ts)
export function milestonesDay(s: GameState) {
  const st = msState(s);
  st.trust += ((50 - st.trust) * M.trust.decay) / 30;
  for (const m of st.list) {
    if (m.status === 'offer' && s.day > m.offerUntil) {
      m.status = 'expired';
      m.endDay = s.day;
      continue;
    }
    if (m.status !== 'active') continue;
    reviewsDay(s, m); // A-181
    const dl = m.deadline!;
    if (met(s, m)) {
      complete(s, m);
      continue;
    }
    if (s.day > dl + graceDays(m)) {
      fail(s, m);
      continue;
    }
    if (s.day === dl + 1 && graceDays(m) > 0) notify(s, `약속한 날이 지났습니다: ${m.title}(${m.from}). ${graceDays(m)}일 안에 끝내면 조건을 줄여 받아 줍니다.`, 'urgent', 'schedule');
    const f = forecast(s, m);
    if (!m.warned && f.risk === 'late' && s.day <= dl) {
      m.warned = true;
      notify(s, `약속이 늦을 것 같습니다: ${m.title}(${m.from}, 기한 ${f.daysLeft}일 남음). CEO 일정에서 조율하세요.`, 'urgent', 'schedule');
    }
  }
  // 끝난 약속에 걸린 점검 회의 요청은 없앰(A-181)
  for (const o of outings(s)) if (o.kind === 'review' && o.status === 'offer' && st.list.find((m) => m.id === o.milestoneId)?.status !== 'active') o.status = 'expired';
  // 오래된 기록 정리(끝난 지 180일)
  st.list = st.list.filter((m) => m.status === 'offer' || m.status === 'active' || s.day - (m.endDay ?? s.day) < 180);
  offerInvestor(s);
  offerGoal(s);
  if (s.day < st.nextOfferDay || s.public) return;
  st.nextOfferDay = s.day + randInt(s, M.offerEveryDays[0], M.offerEveryDays[1]);
  if (openMilestones(s).filter((m) => OUTSIDE.includes(m.kind)).length >= M.maxOpen) return;
  if (devRates(s).dev <= 0) return;
  if (!hasMvp(s)) {
    if (!milestones(s).some((m) => m.kind === 'event' && m.status !== 'declined' && m.status !== 'expired')) offerEvent(s);
    return;
  }
  const b2b = industry(s.company.industry).entBase > 0;
  if (rand(s) < 0.6) offerFeatureDeal(s, b2b ? 'customer' : 'partner');
  else offerEvent(s);
}

// 화면용 짧은 이름
export const KIND_NAME: Record<MilestoneKind, string> = { customer: '고객사', partner: '제휴사', event: '행사', investor: '투자사', goal: '분기 목표' };

// 약속 신뢰를 말로(숫자는 숨김)
export function trustWord(s: GameState): { word: string; tone: 'good' | 'mid' | 'low' } {
  const t = s.milestones?.trust ?? M.trust.start;
  if (t >= 70) return { word: '믿을 만한 회사', tone: 'good' };
  if (t >= 56) return { word: '대체로 지킴', tone: 'good' };
  if (t >= 45) return { word: '아직 모름', tone: 'mid' };
  if (t >= 30) return { word: '자주 늦음', tone: 'low' };
  return { word: '믿기 어려움', tone: 'low' };
}

// 만드는 순서 항목을 조건으로 쥔 진행 중인 약속(업무 창 표시용)
export function promiseFor(s: GameState, id: string, level: number): Milestone | undefined {
  return milestones(s).find((m) => m.status === 'active' && m.needs?.some((n) => n.id === id && n.level === level));
}
