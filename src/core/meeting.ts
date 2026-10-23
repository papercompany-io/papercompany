// 고객사 미팅(A-186): 고객사 방문 외출에 대표가 직접 가면 약속 시각에 시계가 멈추고 회의실에 들어갑니다.
// 참석자(실무자·구매 담당·반대파·결정권자)마다 숨은 걱정과 분위기가 있고, 정해진 시간 안에 카드(질문·데모·고객 사례·가격 양보·
// 기능 약속·동행 발언·마무리 요청)를 골라 걱정을 찾아 풀어 줍니다. 분위기는 숫자 없이 몸짓으로만 보입니다.
// B2B 산업은 3단계까지 이어지고, 마지막 단계에서 이기면 대기업 계약(또는 약속한 기능을 만들면 계약하는 고객사 약속)이 생깁니다.
// 직원을 대신 보내거나 "알아서 진행"하면 지금 제품으로 풀 수 있는 걱정만큼만 자동으로 풀리고, 직접 잘한 판보다 결과가 낮습니다.
import { DATA, feature, industry } from './data';
import { tiredness } from './ceo';
import { changeBond, companyOf, contact, meetContact } from './contacts';
import { totalUsers } from './market';
import { post } from './messenger';
import { news, notify } from './notify';
import { availableFeatures, fxTotals, featureLevel } from './product';
import { enterpriseMonthly } from './orders';
import { offerCustomerPromise } from './milestones';
import { inviteFollowUp, outings, todayOutings } from './outings';
import { nextId } from './ids';
import { pick, rand, randInt, randRange } from './rng';
import type { FeatureDef } from './data';
import type { Contact, Employee, GameState, MeetAttendee, MeetResult, MeetRole, Meeting, Outing } from './types';

const MT = DATA.meetings;
export type CardId = keyof typeof MT.cards;
type ConcernDef = { name: string; cats: string[]; bugsMax?: number; caseFits?: boolean; say: string[] };
const CONCERNS = MT.concerns as Record<string, ConcernDef>;
const CARD_ORDER: CardId[] = ['ask', 'demo', 'case', 'price', 'promise', 'companion', 'close'];
const WORK_START = DATA.time.workStartHour;
const DAY_HOURS = DATA.time.workEndHour - DATA.time.workStartHour;

export function concernName(id: string): string {
  return CONCERNS[id]?.name ?? id;
}

export function roleName(r: MeetRole): string {
  return MT.roles[r].name;
}

// 이 회사가 몇 단계까지 미팅을 이어 가나(B2B만 3단계)
export function meetingStages(s: GameState): number {
  return industry(s.company.industry).entBase > 0 ? MT.stages.length : 1;
}

export function isMeetingOuting(o: Outing): boolean {
  return o.tpl === 'customer';
}

// ── 언제 시작하나 ──
// 오늘 대표가 직접 가는, 아직 하지 않은 고객사 미팅
export function pendingMeetings(s: GameState): Outing[] {
  return todayOutings(s).filter((o) => isMeetingOuting(o) && !o.result);
}

// 약속 시각(그날 근무 시간 안의 ms)
export function meetingStartMs(o: Outing): number {
  return (Math.max(0, (o.startHour ?? WORK_START) - WORK_START) / DAY_HOURS) * DATA.time.dayMs;
}

// ── 몸짓 ──
function signalIndex(mood: number): number {
  const i = MT.signals.findIndex((g) => mood >= g.min);
  return i < 0 ? MT.signals.length - 1 : i;
}

// 지친 대표(A-146)는 몸짓을 가끔 한 칸 잘못 읽음
function readSignal(s: GameState, mood: number): string {
  let i = signalIndex(mood);
  if (tiredness(s) >= MT.tired.at && rand(s) < MT.tired.misread) i = Math.max(0, Math.min(MT.signals.length - 1, i + (rand(s) < 0.5 ? -1 : 1)));
  return MT.signals[i].id;
}

export function signalText(id: string): string {
  return MT.signals.find((g) => g.id === id)?.text ?? '';
}

// ── 시작 ──
function stageDef(stage: number) {
  return MT.stages[Math.min(MT.stages.length, Math.max(1, stage)) - 1];
}

function rolesFor(s: GameState, stage: number): MeetRole[] {
  return stageDef(stage).roles.map((r) => (r === 'gate' ? (pick(s, MT.gateRoles) as MeetRole) : (r as MeetRole)));
}

function startMood(c: Contact, stage: number): number {
  return stageDef(stage).start + MT.roles[c.role].start + (c.bond - MT.bond.start) * MT.bond.startMood;
}

function build(s: GameState, o: Outing): Meeting {
  const company = companyOf(o.host);
  const stage = o.stage ?? 1;
  const picked: string[] = [];
  const attendees: MeetAttendee[] = [];
  for (const role of rolesFor(s, stage)) {
    const c = meetContact(s, company, role, picked);
    picked.push(c.id);
    attendees.push({ contactId: c.id, mood: startMood(c, stage), resolved: [], signal: 'listen' });
  }
  const minutes = stageDef(stage).minutes;
  return {
    outingId: o.id,
    host: o.host,
    company,
    stage,
    minutes,
    minutesLeft: minutes,
    attendees,
    log: [],
    objection: null,
    promised: [...(o.promised ?? [])],
    discount: o.discount ?? 0,
    companionUses: 0,
    closed: false,
  };
}

// 약속 시각이 되면 sim.advance가 부릅니다. s.meeting이 있는 동안 시계가 멈춤
export function startMeeting(s: GameState, outingId: string): Meeting | null {
  const o = outings(s).find((x) => x.id === outingId);
  if (!o || o.result) return null;
  const m = build(s, o);
  for (const a of m.attendees) a.signal = readSignal(s, a.mood);
  if (tiredness(s) >= MT.tired.at) m.dropped = pick(s, ['demo', 'case', 'price', 'promise'] as CardId[]);
  m.log.push({ from: 'sys', text: `${o.host} 회의실에 들어왔습니다. ${m.minutes}분 동안 이야기할 수 있습니다.` });
  m.log.push({ from: 'me', text: pick(s, MT.lines.open) });
  if (m.dropped) m.log.push({ from: 'sys', text: `너무 지쳐서 "${MT.cards[m.dropped as CardId].name}" 이야기가 잘 떠오르지 않습니다.`, tone: 'bad' });
  s.meeting = m;
  notify(s, `고객사 미팅이 시작됐습니다: ${o.host}(${m.stage}단계)`, 'info', 'schedule');
  return m;
}

// ── 함께 간 직원 ──
export function companionCandidates(s: GameState): Employee[] {
  const depts = Object.keys(MT.companionCovers);
  return s.employees.filter((e) => depts.includes(e.dept) && (e.sickUntil === null || e.sickUntil <= s.day) && e.leaving === null);
}

// 첫 카드를 내기 전에만 고를 수 있음. 그 직원은 미팅 시간 동안 일을 못 함(outings.delegateAway)
export function bringCompanion(s: GameState, empId: string | null): string | null {
  const m = s.meeting;
  if (!m || m.result) return '진행 중인 미팅이 없습니다.';
  if (m.minutesLeft < m.minutes) return '이미 이야기를 시작했습니다.';
  const o = outings(s).find((x) => x.id === m.outingId);
  if (!empId) {
    m.companion = undefined;
    if (o) o.companion = undefined;
    return null;
  }
  const e = companionCandidates(s).find((x) => x.id === empId);
  if (!e) return '함께 갈 수 없는 직원입니다.';
  m.companion = e.id;
  if (o) o.companion = e.id;
  return null;
}

// ── 카드 ──
function built(s: GameState, cats: string[]): boolean {
  return Object.entries(s.product.features).some(([id, lv]) => lv > 0 && cats.includes(featureCat(id)));
}

function featureCat(id: string): string {
  return feature(id).cat;
}

// 데모로 풀 수 있는 걱정인가(만든 기능 중 그 분류가 있고, 안정성은 버그가 적어야)
function demoFits(s: GameState, concern: string): boolean {
  const c = CONCERNS[concern];
  if (!c || !c.cats.length) return false;
  if (c.bugsMax !== undefined && s.product.bugs > c.bugsMax) return false;
  return built(s, c.cats);
}

function caseReady(s: GameState): boolean {
  return s.company.enterpriseCount > 0 || totalUsers(s) >= MT.cards.case.needUsers;
}

function companionCovers(s: GameState, m: Meeting): string[] {
  const e = m.companion ? s.employees.find((x) => x.id === m.companion) : undefined;
  return e ? ((MT.companionCovers as Record<string, string[]>)[e.dept] ?? []) : [];
}

// 이 카드가 이 걱정을 풀 수 있나(봇이 고를 때 씀. 사람은 만든 기능을 보고 짐작함)
export function cardFits(s: GameState, m: Meeting, card: CardId, concern: string): boolean {
  switch (card) {
    case 'demo':
      return demoFits(s, concern);
    case 'case':
      return !!CONCERNS[concern]?.caseFits && caseReady(s);
    case 'price':
      return concern === 'price';
    case 'companion':
      return companionCovers(s, m).includes(concern);
    default:
      return false;
  }
}

function unresolved(m: Meeting, a: MeetAttendee, c: Contact): string[] {
  return c.concerns.filter((x) => !a.resolved.includes(x));
}

function promisedCount(m: Meeting): number {
  return m.promised.length;
}

// 이 사람의 걱정을 풀어 줄 수 있는, 아직 없는 기능(가장 가벼운 것). 이의를 낸 걱정 → 알아낸 걱정 → 나머지 순
export function promiseFor(s: GameState, m: Meeting, contactId: string): FeatureDef | null {
  const a = m.attendees.find((x) => x.contactId === contactId);
  const c = contact(s, contactId);
  if (!a || !c) return null;
  const open = unresolved(m, a, c);
  const order = [...open.filter((x) => m.objection?.contactId === contactId && m.objection.concern === x), ...open.filter((x) => c.known.includes(x)), ...open];
  const avail = availableFeatures(s);
  for (const k of order) {
    const cats = CONCERNS[k]?.cats ?? [];
    const f = avail
      .filter((x) => cats.includes(x.cat) && featureLevel(s, x.id) === 0 && !m.promised.includes(x.id))
      .sort((x, y) => x.dev + x.design - (y.dev + y.design))[0];
    if (f) return f;
  }
  return null;
}

export interface HandCard {
  id: CardId;
  name: string;
  desc: string;
  minutes: number;
  target: boolean; // 대상(참석자)을 골라야 함
  ok: boolean;
  why?: string;
}

export function meetingHand(s: GameState): HandCard[] {
  const m = s.meeting;
  if (!m) return [];
  const out: HandCard[] = [];
  for (const id of CARD_ORDER) {
    const d = MT.cards[id];
    let ok = true;
    let why: string | undefined;
    if (m.dropped === id) [ok, why] = [false, '지쳐서 떠오르지 않습니다'];
    else if (id === 'case' && !caseReady(s)) [ok, why] = [false, '내세울 고객이 아직 없습니다'];
    else if (id === 'price' && m.discount >= MT.cards.price.maxDiscount - 1e-9) [ok, why] = [false, '더 깎아 줄 수 없습니다'];
    else if (id === 'promise' && promisedCount(m) >= MT.cards.promise.max) [ok, why] = [false, '약속을 더 늘리기 어렵습니다'];
    else if (id === 'companion' && !m.companion) [ok, why] = [false, '함께 온 직원이 없습니다'];
    else if (id === 'companion' && m.companionUses >= MT.cards.companion.uses) [ok, why] = [false, '이미 충분히 이야기했습니다'];
    if (ok && d.minutes > m.minutesLeft) [ok, why] = [false, '시간이 모자랍니다'];
    if (m.result) ok = false;
    out.push({ id, name: d.name, desc: d.desc, minutes: d.minutes, target: id !== 'close', ok, why });
  }
  return out;
}

function say(m: Meeting, who: string, text: string, tone?: 'good' | 'bad') {
  m.log.push({ from: 'them', who, text, tone });
}

function nudge(a: MeetAttendee, d: number) {
  a.mood = Math.max(-100, Math.min(100, a.mood + d));
}

function resolve(a: MeetAttendee, concern: string, c: Contact) {
  if (!a.resolved.includes(concern)) a.resolved.push(concern);
  if (!c.known.includes(concern)) c.known.push(concern);
}

// 카드 한 장. 성공하면 null, 못 내면 이유
export function playCard(s: GameState, card: CardId, targetId?: string): string | null {
  const m = s.meeting;
  if (!m || m.result) return '진행 중인 미팅이 없습니다.';
  const h = meetingHand(s).find((x) => x.id === card);
  if (!h || !h.ok) return h?.why ?? '낼 수 없는 카드입니다.';
  const a = targetId ? m.attendees.find((x) => x.contactId === targetId) : undefined;
  const c = a ? contact(s, a.contactId) : undefined;
  if (h.target && (!a || !c)) return '누구에게 할지 고르세요.';
  const D = MT.cards;
  const before = a ? [...a.resolved] : [];
  const lines = MT.lines;
  switch (card) {
    case 'ask': {
      m.log.push({ from: 'me', text: `${c!.name} ${c!.title}님, ${pick(s, lines.ask)}` });
      const hidden = c!.concerns.filter((x) => !c!.known.includes(x));
      if (hidden.length) {
        const k = pick(s, hidden);
        c!.known.push(k);
        nudge(a!, D.ask.listen);
        say(m, c!.id, pick(s, CONCERNS[k].say));
      } else {
        nudge(a!, D.ask.repeat);
        say(m, c!.id, pick(s, lines.askRepeat));
      }
      break;
    }
    case 'demo': {
      m.log.push({ from: 'me', text: `${c!.name} ${c!.title}님께 화면을 직접 보여 드립니다.` });
      if (rand(s) < s.product.bugs * D.demo.glitchPerBug) {
        for (const x of m.attendees) nudge(x, D.demo.glitch);
        m.log.push({ from: 'sys', text: '데모 중에 화면이 버벅였습니다.', tone: 'bad' });
        say(m, c!.id, pick(s, lines.glitch), 'bad');
        break;
      }
      const fits = unresolved(m, a!, c!).filter((k) => demoFits(s, k));
      if (fits.length) {
        for (const k of fits) resolve(a!, k, c!);
        nudge(a!, D.demo.match * fits.length);
        say(m, c!.id, pick(s, lines.demoMatch), 'good');
      } else if (unresolved(m, a!, c!).length) {
        nudge(a!, D.demo.miss);
        say(m, c!.id, pick(s, lines.demoMiss));
      } else {
        nudge(a!, D.demo.plain);
        say(m, c!.id, pick(s, lines.demoPlain));
      }
      break;
    }
    case 'case': {
      m.log.push({ from: 'me', text: s.company.enterpriseCount > 0 ? '이미 저희 서비스를 쓰고 있는 기업 고객 이야기를 들려 드립니다.' : '지금 저희 서비스를 쓰는 고객들 이야기를 들려 드립니다.' });
      const open = unresolved(m, a!, c!);
      const fit = open.filter((k) => CONCERNS[k]?.caseFits);
      if (fit.length) {
        for (const k of fit) resolve(a!, k, c!);
        nudge(a!, D.case.match);
        say(m, c!.id, pick(s, lines.caseMatch), 'good');
      } else if (open.includes('stability')) {
        nudge(a!, D.case.partial);
        say(m, c!.id, pick(s, lines.casePlain));
      } else {
        nudge(a!, D.case.plain);
        say(m, c!.id, pick(s, lines.casePlain));
      }
      break;
    }
    case 'price': {
      m.discount = Math.min(D.price.maxDiscount, m.discount + D.price.discount);
      m.log.push({ from: 'me', text: '처음 도입하시는 만큼 가격은 저희가 더 맞춰 드리겠습니다.' });
      const open = unresolved(m, a!, c!);
      let d = c!.role === 'buyer' ? D.price.buyer : 0;
      if (open.includes('price')) {
        resolve(a!, 'price', c!);
        d += D.price.match;
        say(m, c!.id, pick(s, lines.priceMatch), 'good');
      } else {
        d += D.price.plain;
        say(m, c!.id, pick(s, lines.pricePlain));
      }
      nudge(a!, d);
      break;
    }
    case 'promise': {
      const f = promiseFor(s, m, c!.id);
      if (!f) return '이 사람에게 약속할 만한 기능이 없습니다.';
      const k = unresolved(m, a!, c!).find((x) => CONCERNS[x]?.cats.includes(f.cat));
      m.promised.push(f.id);
      m.log.push({ from: 'me', text: `"${f.name}" 기능을 만들어 드리겠습니다.` });
      if (k) resolve(a!, k, c!);
      nudge(a!, D.promise.match);
      say(m, c!.id, pick(s, lines.promiseMatch), 'good');
      break;
    }
    case 'companion': {
      const e = s.employees.find((x) => x.id === m.companion)!;
      m.companionUses += 1;
      m.log.push({ from: 'mate', who: e.id, text: `${e.name}입니다. 실제로 어떻게 쓰시게 되는지 제가 설명드리겠습니다.` });
      const fit = unresolved(m, a!, c!).filter((k) => companionCovers(s, m).includes(k));
      const skill = 0.8 + e.skill * D.companion.skillK;
      if (fit.length) {
        resolve(a!, fit[0], c!);
        nudge(a!, D.companion.match * skill);
        say(m, c!.id, pick(s, lines.companionMatch), 'good');
      } else {
        nudge(a!, D.companion.plain);
        say(m, c!.id, pick(s, lines.companionPlain));
      }
      break;
    }
    case 'close': {
      m.closed = true;
      m.log.push({ from: 'me', text: '오늘 말씀 나눈 내용으로 다음 단계를 진행해 보면 어떨까요?' });
      break;
    }
  }
  // 이의 제기 처리: 바로 다음 카드로 그 걱정을 풀었나
  const ob = m.objection;
  if (ob && card !== 'close') {
    const oa = m.attendees.find((x) => x.contactId === ob.contactId)!;
    const solved = a?.contactId === ob.contactId && !before.includes(ob.concern) && a.resolved.includes(ob.concern);
    if (solved) nudge(oa, MT.objection.win);
    else {
      nudge(oa, MT.objection.lose);
      say(m, ob.contactId, pick(s, lines.objectionLose), 'bad');
    }
    m.objection = null;
  }
  m.minutesLeft = Math.max(0, m.minutesLeft - h.minutes);
  for (const x of m.attendees) x.signal = readSignal(s, x.mood);
  if (m.closed) return finishMeeting(s, 'close');
  if (m.minutesLeft < 10) return finishMeeting(s, 'time');
  rollObjection(s, m);
  return null;
}

function rollObjection(s: GameState, m: Meeting) {
  const open = m.attendees.filter((a) => {
    const c = contact(s, a.contactId);
    return c && unresolved(m, a, c).length > 0;
  });
  if (!open.length || rand(s) >= MT.objection.chance) return;
  const a = pick(s, open);
  const c = contact(s, a.contactId)!;
  const k = pick(s, unresolved(m, a, c));
  if (!c.known.includes(k)) c.known.push(k);
  m.objection = { contactId: c.id, concern: k };
  say(m, c.id, pick(s, CONCERNS[k].say), 'bad');
}

// ── 결과 ──
// 참석자 분위기 → 결과. 결정권자는 역할 weight가 큼(meetings.json roles), 마무리 요청은 outcome.closeReady 기준으로 덤 또는 역효과
// 점수 = 참석자 분위기를 역할 weight로 가중 평균(-100~100)
export function meetingScore(s: GameState, m: Meeting): number {
  let sum = 0;
  let w = 0;
  for (const a of m.attendees) {
    const c = contact(s, a.contactId);
    const k = c ? MT.roles[c.role].weight : 1;
    sum += a.mood * k;
    w += k;
  }
  return w ? sum / w : 0;
}

// 마무리 요청은 점수에 덤(무르익었을 때) 또는 역효과(이를 때). 크게 화난 결정권자가 있으면 평균이 높아도 won은 막히고 warm까지.
// 시간이 다 돼 끝난 판은 마무리 요청을 한 판보다 문턱이 높음(won + closeBonus) — 앉아만 있으면 손해, 마무리 카드가 한 수가 되게
export function meetingOutcome(s: GameState, m: Meeting): MeetResult {
  const O = MT.outcome;
  let score = meetingScore(s, m);
  if (m.closed) score += m.closedEarly ? O.closeEarly : O.closeBonus;
  const veto = m.attendees.some((a) => contact(s, a.contactId)?.role === 'decider' && a.mood < O.veto);
  const wonAt = m.closed ? O.won : O.won + O.closeBonus;
  if (score >= wonAt && !veto) return 'won';
  if (score >= O.warm) return 'warm';
  return score >= O.cold ? 'cold' : 'lost';
}

// 알아서 진행·위임: 남은 걱정을 지금 제품으로 풀 수 있는 만큼만 풀고, 남은 시간 비율만큼 반영
function autoPlay(s: GameState, m: Meeting, mult: number, share: number) {
  const A = MT.auto;
  for (const a of m.attendees) {
    const c = contact(s, a.contactId);
    if (!c) continue;
    for (const k of unresolved(m, a, c)) {
      const can = demoFits(s, k) || (!!CONCERNS[k]?.caseFits && caseReady(s));
      if (can) a.resolved.push(k);
      nudge(a, (can ? A.fitPer * mult : A.miss) * share);
    }
    nudge(a, randRange(s, -A.noise, A.noise) * share);
  }
}

// 진행 중인 미팅을 남은 시간만큼 알아서 마무리(화면의 "알아서 진행")
export function autoFinish(s: GameState): string | null {
  const m = s.meeting;
  if (!m || m.result) return '진행 중인 미팅이 없습니다.';
  autoPlay(s, m, MT.auto.mult, m.minutesLeft / m.minutes);
  m.auto = true;
  m.log.push({ from: 'sys', text: '남은 시간은 준비한 자료대로 진행했습니다.' });
  return finishMeeting(s, 'time');
}

// 대표가 가지 않은 미팅(직원 위임·봇·지난 저장): 화면 없이 바로 결과
export function autoMeeting(s: GameState, o: Outing) {
  if (o.result) return;
  const m = build(s, o);
  const emp = o.delegate ? s.employees.find((e) => e.id === o.delegate) : undefined;
  const mult = MT.auto.mult * (emp ? MT.auto.delegateBase + (emp.skill / 100) * MT.auto.delegateSkill : 1);
  autoPlay(s, m, mult, 1);
  m.auto = true;
  settle(s, o, m, meetingOutcome(s, m));
}

function finishMeeting(s: GameState, why: 'close' | 'time'): null {
  const m = s.meeting!;
  const o = outings(s).find((x) => x.id === m.outingId);
  if (why === 'time' && !m.closed) say(m, m.attendees[0].contactId, pick(s, MT.lines.timeUp));
  m.closedEarly = m.closed && meetingScore(s, m) < MT.outcome.closeReady;
  const r = meetingOutcome(s, m);
  if (m.closed) say(m, m.attendees[0].contactId, pick(s, m.closedEarly ? MT.lines.closeEarly : MT.lines.closeReady), m.closedEarly ? 'bad' : 'good');
  m.result = r;
  if (o) settle(s, o, m, r);
  return null;
}

// 결과 화면을 닫고 시계를 다시 움직임
export function leaveMeeting(s: GameState) {
  if (s.meeting?.result) s.meeting = null;
}

export function resultText(r: MeetResult): string {
  return r === 'won' ? '분위기가 아주 좋았습니다' : r === 'warm' ? '좋게 봐 준 것 같습니다' : r === 'cold' ? '반응이 미지근했습니다' : '분위기가 좋지 않았습니다';
}

// 보상·친밀도·다음 단계
function settle(s: GameState, o: Outing, m: Meeting, r: MeetResult) {
  o.result = r;
  m.result = r;
  const last = m.stage >= meetingStages(s);
  for (const a of m.attendees) {
    const c = contact(s, a.contactId);
    if (!c) continue;
    changeBond(c, a.mood * MT.bond.perMood + (r === 'lost' ? MT.bond.lost : 0));
    c.metDay = s.day;
    c.meetings += 1;
  }
  const who = o.delegate ? (s.employees.find((e) => e.id === o.delegate)?.name ?? '직원') + '님이 다녀온 ' : '';
  if (r === 'won' && last && meetingStages(s) > 1) {
    closeDeal(s, o, m);
    return;
  }
  s.entPipeline += (MT.reward.pipeline as Record<MeetResult, number>)[r];
  if (r === 'won' && !last) {
    const next = inviteFollowUp(s, o, { stage: m.stage + 1, promised: m.promised, discount: m.discount });
    post(s, o.channelId, o.host, `오늘 감사했습니다. 내부에 공유했더니 다음 단계로 더 이야기해 보자고 합니다. ${next ? '일정 제안드립니다.' : ''}`, 'npc');
    notify(s, `${who}${o.host} 미팅: ${resultText(r)}. 다음 단계 미팅 제안이 왔습니다.`, 'good', 'schedule');
    return;
  }
  const line = r === 'warm' ? '오늘 감사했습니다. 내부에서 검토해 보고 다시 연락드리겠습니다.' : r === 'cold' ? '오늘 설명 감사했습니다. 필요하면 연락드리겠습니다.' : '검토해 봤는데 이번에는 어려울 것 같습니다.';
  post(s, o.channelId, o.host, line, 'npc');
  notify(s, `${who}${o.host} 미팅: ${resultText(r)}.`, r === 'lost' ? 'bad' : 'info', 'schedule');
}

// 마지막 단계에서 이김: 약속한 기능이 있거나 대기업 기능이 없으면 고객사 약속(A-177), 아니면 바로 대기업 계약
function closeDeal(s: GameState, o: Outing, m: Meeting) {
  const R = MT.reward;
  const needs = [...m.promised];
  if (!needs.length && !fxTotals(s).enterprise) {
    const f = availableFeatures(s)
      .filter((x) => x.cat === 'enterprise' && featureLevel(s, x.id) === 0)
      .sort((x, y) => x.dev + x.design - (y.dev + y.design))[0];
    if (f) needs.push(f.id);
  }
  if (needs.length) {
    const ok = offerCustomerPromise(s, o.host, needs, {
      months: randInt(s, R.promiseMonths[0], R.promiseMonths[1]),
      mult: randRange(s, R.promiseMult[0], R.promiseMult[1]) * (1 - m.discount),
    });
    if (ok) {
      notify(s, `${o.host}: 계약하겠다고 합니다. 약속한 기능을 기한 안에 만들면 계약이 시작됩니다.`, 'good', 'schedule');
      return;
    }
    s.entPipeline += R.pipeline.won; // 지금 만드는 순서로는 약속을 못 받음
    notify(s, `${o.host}: 계약 의사는 있지만 약속한 기능을 지금 일정에 넣을 수 없어 미뤄졌습니다.`, 'info', 'schedule');
    return;
  }
  const monthly = enterpriseMonthly(s, randRange(s, R.dealMult[0], R.dealMult[1]) * (1 - m.discount), 'kr');
  const months = randInt(s, R.dealMonths[0], R.dealMonths[1]);
  s.enterprise.push({ id: nextId(s, 'ent'), name: m.company, monthly, startDay: s.day, endDay: s.day + months * 30, market: 'kr' });
  s.company.enterpriseCount += 1;
  post(s, o.channelId, o.host, `최종 승인이 났습니다. ${months}개월 계약으로 진행하시죠.`, 'npc');
  notify(s, `대기업 계약! ${m.company} — 월 ${Math.round(monthly / 1e4).toLocaleString('ko-KR')}만원, ${months}개월`, 'good', 'market');
  news(s, `[계약] ${s.company.name}, ${m.company}와 공급 계약`, 'company');
}

// 하루 끝: 오늘 하지 못한(직원 위임·지난 저장) 고객사 미팅을 정리
export function meetingsDayEnd(s: GameState) {
  for (const o of outings(s)) {
    if (!isMeetingOuting(o) || o.status !== 'booked' || o.result) continue;
    if (s.day < o.startDay || s.day >= o.startDay + o.days) continue;
    autoMeeting(s, o);
  }
}
