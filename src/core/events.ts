// F11 이벤트와 결정: DC-01 선택지 제시, DC-02 확률적 결과, DC-03 질문 변형, DC-04 상태 기반 등장 조건, DC-05 늘어나는 선택지.
// 이벤트 데이터는 src/data/events-*.json(형식은 docs/CONTENT_SCHEMA.md). 판정은 알고리즘(DEC-031).
import eventsA from '../data/events-a.json';
import eventsB from '../data/events-b.json';
import storyRules from '../data/story.json';
import { dept, market } from './data';
import { yearOf } from './calendar';
import { avgAdoption } from './aiadopt';
import { book, lastRevenue, runwayMonths } from './finance';
import { revenueGrowth } from './valuation';
import { investorPct, recordEquity, totalShares } from './equity';
import { openRound } from './funding';
import { computeValuation } from './valuation';
import { nextId } from './ids';
import { addMod, clearFlag, hasFlag, setFlag } from './mods';
import { ensureNamedExternal, post } from './messenger';
import { news, notify } from './notify';
import { applyWork, hasMvp } from './product';
import { launchedMarkets, totalUsers } from './market';
import { pick, rand, weighted } from './rng';
import { avgHealth, avgSat, hasTrait, removeEmployee, rollTalent, startSkill } from './staff';
import { takeDesk } from './office';
import { onEmployeeJoined } from './messenger';
import { applyLoanChoice } from './loans';
import { DATA } from './data';
import type { DeptId, Employee, GameState, Grade, MarketId, PendingDecision } from './types';

type Cond = Record<string, unknown>;
interface Outcome {
  w: number;
  text: string;
  fx?: Record<string, unknown>;
}
interface Choice {
  label: string;
  hint?: string;
  cost?: number;
  costRev?: number;
  cond?: Cond;
  outcomes: Outcome[];
}
export interface EventDef {
  id: string;
  cat: string;
  from: string;
  outside?: boolean; // 사내 범주(office 등)라도 회사 밖 사람이 보냄 → 외부 연락처(A-150)
  weight?: number;
  cooldown?: number;
  once?: boolean;
  urgent?: boolean;
  cond?: Cond;
  target?: string;
  texts: string[];
  choices: Choice[];
  deadline?: number;
  default?: number;
}

export const EVENTS: EventDef[] = [...(eventsA as { events: EventDef[] }).events, ...(eventsB as { events: EventDef[] }).events];

export function eventDef(id: string) {
  return EVENTS.find((e) => e.id === id);
}

interface Ctx {
  target: Employee | null;
  from?: string;
  competitorId: string | null;
  market: MarketId;
}

function staffN(s: GameState) {
  return s.employees.length;
}

export function condOk(s: GameState, c: Cond | undefined): boolean {
  if (!c) return true;
  for (const [k, v] of Object.entries(c)) {
    switch (k) {
      case 'stageMin':
        if (s.company.stage < (v as number)) return false;
        break;
      case 'stageMax':
        if (s.company.stage > (v as number)) return false;
        break;
      case 'empMin':
        if (staffN(s) < (v as number)) return false;
        break;
      case 'empMax':
        if (staffN(s) > (v as number)) return false;
        break;
      case 'usersMin':
        if (totalUsers(s) < (v as number)) return false;
        break;
      case 'revMin':
        if (lastRevenue(s) < (v as number)) return false;
        break;
      case 'runwayMax': {
        const r = runwayMonths(s);
        if (r === null || r > (v as number)) return false;
        break;
      }
      case 'cashMin':
        if (s.cash < (v as number)) return false;
        break;
      case 'yearMin':
        if (yearOf(s.day) < (v as number)) return false;
        break;
      case 'yearMax':
        if (yearOf(s.day) > (v as number)) return false;
        break;
      case 'industry':
        if (!(v as string[]).includes(s.company.industry)) return false;
        break;
      case 'economy':
        if (s.economy.phase !== v) return false;
        break;
      case 'dept':
        if (!s.employees.some((e) => e.dept === v)) return false;
        break;
      case 'noDept':
        if (s.employees.some((e) => e.dept === v)) return false;
        break;
      case 'aiMin':
        if (avgAdoption(s) < (v as number)) return false;
        break;
      case 'satMax':
        if (!s.employees.length || avgSat(s) > (v as number)) return false;
        break;
      case 'healthMax':
        if (!s.employees.length || avgHealth(s) > (v as number)) return false;
        break;
      case 'bugsMin':
        if (s.product.bugs < (v as number)) return false;
        break;
      case 'marketsMin':
        if (launchedMarkets(s).length < (v as number)) return false;
        break;
      case 'mvp': // A-119: 만든 게 있어야 오는 일(베타 피드백 등)
        if (hasMvp(s) !== v) return false;
        break;
      case 'roundOpen': // A-121: 투자 라운드가 열려 있을 때만(계약서·텀싯)
        if (!!openRound(s) !== v) return false;
        break;
      case 'funded':
        if ((s.fundingStage !== null || s.safes.length > 0) !== v) return false;
        break;
      case 'investorPctMin':
        if (investorPct(s) < (v as number)) return false;
        break;
      case 'public':
        if (!!s.public !== v) return false;
        break;
      case 'crunch':
        if ((s.company.workPolicy === 'crunch') !== v) return false;
        break;
      case 'flag':
        if (!hasFlag(s, v as string)) return false;
        break;
      case 'noFlag':
        if (hasFlag(s, v as string)) return false;
        break;
      case 'competitor':
        if (v && !s.competitors.some((x) => x.alive)) return false;
        break;
    }
  }
  return true;
}

function pickTarget(s: GameState, how: string | undefined): Employee | null | undefined {
  if (!how) return null;
  const all = s.employees.filter((e) => e.leaving === null);
  let pool: Employee[] = [];
  switch (how) {
    case 'any':
      pool = all;
      break;
    case 'staff':
      pool = all.filter((e) => e.kind !== 'cofounder');
      break;
    case 'best':
      pool = [...all.filter((e) => e.kind !== 'cofounder')].sort((a, b) => b.skill * (b.grade === 'S' ? 1.4 : b.grade === 'A' ? 1.2 : 1) - a.skill * (a.grade === 'S' ? 1.4 : a.grade === 'A' ? 1.2 : 1)).slice(0, 1);
      break;
    case 'lowSat':
      pool = [...all].sort((a, b) => a.sat - b.sat).slice(0, 1);
      break;
    case 'lowHealth':
      pool = [...all].sort((a, b) => a.health - b.health).slice(0, 1);
      break;
    case 'lead':
      pool = all.filter((e) => e.lead);
      break;
    case 'aiSkeptic':
      pool = all.filter((e) => hasTrait(e, 'ai_skeptic'));
      break;
    default:
      pool = all.filter((e) => e.dept === how);
  }
  if (!pool.length) return undefined;
  return pick(s, pool);
}

// 이름 뒤 조사를 받침에 맞춤: "{competitor}가" → 데일리픽이 / 모먼트가
const JOSA: Record<string, [string, string]> = { 이: ['이', '가'], 가: ['이', '가'], 을: ['을', '를'], 를: ['을', '를'], 은: ['은', '는'], 는: ['은', '는'], 과: ['과', '와'], 와: ['과', '와'] };
function josa(word: string, p: string): string {
  const pair = JOSA[p];
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (!pair || code < 0 || code > 11171) return word + p;
  return word + (code % 28 ? pair[0] : pair[1]);
}

function fill(s: GameState, text: string, ctx: Ctx, amount?: number): string {
  const comp = s.competitors.find((c) => c.id === ctx.competitorId);
  const names: Record<string, string> = { target: ctx.target?.name ?? '직원', company: s.company.name, competitor: comp?.name ?? '경쟁사', market: market(ctx.market).name };
  text = text.replace(/\{(target|company|competitor|market)\}(이|가|을|를|은|는|과|와)(?![가-힣])/g, (_, k: string, p: string) => josa(names[k], p));
  return text
    .replace(/\{target\}/g, ctx.target?.name ?? '직원')
    .replace(/\{dept\}/g, ctx.target ? dept(ctx.target.dept).name : '팀')
    .replace(/\{company\}/g, s.company.name)
    .replace(/\{competitor\}/g, comp?.name ?? '경쟁사')
    .replace(/\{market\}/g, market(ctx.market).name)
    .replace(/\{amount\}/g, amount !== undefined ? fmtWon(amount) : '');
}

function fmtWon(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(n >= 1e10 ? 0 : 1)}억원`;
  return `${Math.round(n / 1e4).toLocaleString('ko-KR')}만원`;
}

// 매출 배수 비용의 기준(A-46): 매출에 그대로 비례하면 큰 회사에서 워크숍이 수백억이 되므로 0.6제곱으로 완만하게 키웁니다.
export function revBase(s: GameState) {
  const r = Math.max(1e7, lastRevenue(s));
  return 1e7 * Math.pow(r / 1e7, 0.6);
}

export function choiceCost(s: GameState, c: Choice): number {
  return Math.round((c.cost ?? 0) + (c.costRev ?? 0) * revBase(s));
}

// ── A-141 사건 스토리텔러: 무작위 추첨 대신 회사 상황과 직전 위기를 보고 고릅니다 ──
const ST = storyRules;
export type Tone = 'threat' | 'opportunity' | 'neutral';
const MOD_SIGN: Record<string, number> = { appeal: 1, acq: 1, churn: -1, output: 1, valuation: 1, invest: 1, infra: -1, outage: -1, sat: 1, price: 1 };
const cap = (v: number, c: number) => Math.max(-c, Math.min(c, v));

// 결과 하나가 회사에 좋은지(+)·나쁜지(−) 대략의 점수
function fxScore(fx: Record<string, unknown>): number {
  const n = (k: string) => (typeof fx[k] === 'number' ? (fx[k] as number) : 0);
  let v = Math.sign(n('cash')) + Math.sign(n('cashRev'));
  for (const [k, w] of [['users', 30], ['awareness', 20], ['sat', 0.2], ['satDept', 0.15], ['health', 0.15], ['rep', 0.4], ['appeal', 0.2], ['ir', 0.05], ['network', 0.05], ['board', 0.1], ['stock', 10]] as [string, number][]) v += cap(n(k) * w, 1.5);
  v -= cap(n('bugs') * 0.08, 1.5);
  if (fx.leaveTarget) v -= 1;
  if (fx.compDie || fx.hire) v += 1;
  if (Array.isArray(fx.mod)) for (const m of fx.mod as { key: string; value: number }[]) v += cap((MOD_SIGN[m.key] ?? 0) * m.value * 5, 1);
  return v;
}

const toneCache = new Map<string, Tone>();
// 사건의 성격: 아무것도 안 하면(기본 선택) 회사가 좋아지는지 나빠지는지
export function eventTone(ev: EventDef): Tone {
  const hit = toneCache.get(ev.id);
  if (hit) return hit;
  const ch = ev.choices[ev.default ?? ev.choices.length - 1] ?? ev.choices[ev.choices.length - 1];
  const tot = ch.outcomes.reduce((a, o) => a + o.w, 0) || 1;
  const v = ch.outcomes.reduce((a, o) => a + o.w * fxScore(o.fx ?? {}), 0) / tot;
  const tone: Tone = v < -ST.toneCut ? 'threat' : v > ST.toneCut ? 'opportunity' : 'neutral';
  toneCache.set(ev.id, tone);
  return tone;
}

function story(s: GameState) {
  return (s.story ??= { lastCrisisDay: s.company.startDay, restUntil: 0 });
}

// 위기가 왔다고 기록(위협 사건, 경쟁사 반격·대출 제안 같은 강제 사건): 한동안 쉬는 구간
export function noteCrisis(s: GameState) {
  const st = story(s);
  st.lastCrisisDay = s.day;
  st.restUntil = s.day + ST.restDays;
}

// 절박도 0~1: 버틸 기간이 짧거나 고객이 줄면
function desperation(s: GameState): number {
  const rw = runwayMonths(s);
  let d = rw !== null && rw < ST.desperateRunway ? (ST.desperateRunway - rw) / ST.desperateRunway : 0;
  const h = s.plHistory.slice(-4);
  if (h.length >= 4 && h[0].usersEnd > 0 && h[3].usersEnd < h[0].usersEnd * 0.95) d = Math.max(d, 0.5);
  return Math.min(1, d);
}

function thriving(s: GameState): boolean {
  const g = revenueGrowth(s);
  const rw = runwayMonths(s);
  return g !== null && g >= ST.successGrowth && (rw === null || rw >= ST.successRunway);
}

export function storyWeight(s: GameState, ev: EventDef): number {
  const tone = eventTone(ev);
  if (tone === 'neutral') return 1;
  const st = story(s);
  const des = desperation(s);
  if (tone === 'opportunity') return 1 + ST.desperateBoost * des;
  if (s.day < st.restUntil) return ST.restMult;
  const calm = s.day - st.lastCrisisDay;
  return (1 + Math.min(ST.calmCap, calm / ST.calmDays)) * (thriving(s) ? ST.successMult : 1) * (1 - ST.desperateDamp * des);
}

// 하루 한 번: 결정 기한 처리, 새 이벤트 등장 판정
export function eventsDay(s: GameState) {
  for (const d of s.decisions) if (!d.resolved && s.day >= d.deadline) resolveDecision(s, d.id, defaultIndex(d), true);
  s.decisions = s.decisions.filter((d) => !d.resolved || s.day - d.day < 60).slice(-40);
  const open = s.decisions.filter((d) => !d.resolved).length;
  if (open >= 3) return;
  const quiet = s.day - story(s).lastCrisisDay;
  const pDay = Math.min(0.12, 0.05 + 0.001 * staffN(s) + (s.company.stage >= 1 ? 0.02 : 0)) * (1 + ST.quietBoost * Math.min(1, quiet / ST.quietDays));
  if (rand(s) >= pDay) return;
  trigger(s);
}

function defaultIndex(d: PendingDecision): number {
  const def = eventDef(d.eventId);
  const i = def?.default ?? d.choices.length - 1;
  const mapped = (d as unknown as { map?: number[] }).map;
  const idx = mapped ? mapped.indexOf(i) : i;
  return idx >= 0 ? idx : d.choices.length - 1;
}

export function trigger(s: GameState, forceId?: string, opts: { competitorId?: string } = {}): PendingDecision | null {
  const cands: { ev: EventDef; target: Employee | null }[] = [];
  for (const ev of EVENTS) {
    if (forceId && ev.id !== forceId) continue;
    const seen = s.eventSeen[ev.id];
    if (!forceId) {
      if (ev.once && seen !== undefined) continue;
      if (seen !== undefined && s.day - seen < (ev.cooldown ?? 180)) continue;
      if (!condOk(s, ev.cond)) continue;
      if (s.decisions.some((d) => !d.resolved && d.eventId === ev.id)) continue;
    }
    const t = pickTarget(s, ev.target);
    if (t === undefined) continue;
    cands.push({ ev, target: t });
  }
  if (!cands.length) return null;
  const { ev, target } = weighted(
    s,
    cands,
    cands.map((c) => (c.ev.weight ?? 1) * (forceId ? 1 : storyWeight(s, c.ev))),
  );
  const alive = s.competitors.filter((c) => c.alive);
  // A-140: 반격하는 경쟁사가 직접 보낸 사건이면 그 회사 이름으로
  const ctx: Ctx = { target, competitorId: opts.competitorId ?? (alive.length ? pick(s, alive).id : null), market: pick(s, launchedMarkets(s).length ? launchedMarkets(s) : ['kr']) };
  // DC-03 질문 변형: 직전에 쓴 문장은 피합니다.
  const lastV = s.eventSeen[`${ev.id}#v`] ?? -1;
  let vi = Math.floor(rand(s) * ev.texts.length);
  if (ev.texts.length > 1 && vi === lastV) vi = (vi + 1) % ev.texts.length;
  s.eventSeen[`${ev.id}#v`] = vi;
  s.eventSeen[ev.id] = s.day;
  // DC-04/05: 조건을 만족하는 선택지만 보이고, 처음 열린 선택지는 표시
  const map: number[] = [];
  const choices = ev.choices
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => condOk(s, c.cond))
    .map(({ c, i }) => {
      map.push(i);
      const cost = choiceCost(s, c);
      const key = `${ev.id}#c${i}`;
      const isNew = !!c.cond && s.eventSeen[key] === undefined;
      if (c.cond) s.eventSeen[key] = s.day;
      return { label: c.label, hint: fill(s, c.hint ?? '', ctx, cost), cost, enabled: true, isNew, why: undefined as string | undefined };
    });
  for (const ch of choices) if (ch.cost > 0 && ch.cost > s.cash) {
    ch.enabled = false;
    ch.why = '자금 부족';
  }
  if (!choices.some((c) => c.enabled)) return null;
  const from = fill(s, ev.from, ctx);
  const channelId = target && ev.from.includes('{target}') ? `dm-${target.id}` : (ev.cat === 'staff' || ev.cat === 'office') && !ev.outside ? 'all' : ensureNamedExternal(s, from);
  const id = nextId(s, 'd');
  const d: PendingDecision & { map: number[]; ctx: Ctx } = {
    id,
    eventId: ev.id,
    day: s.day,
    deadline: s.day + (ev.deadline ?? 7),
    from,
    text: fill(s, ev.texts[vi], ctx),
    urgent: !!ev.urgent,
    targetId: target?.id ?? null,
    competitorId: ctx.competitorId,
    choices,
    channelId,
    resolved: null,
    map,
    ctx,
  };
  s.decisions.push(d);
  if (forceId || eventTone(ev) === 'threat') noteCrisis(s); // A-141
  post(s, channelId, from, d.text, 'npc', id);
  if (target) target.bubble = { text: 'talk', until: s.day + 3 };
  if (d.urgent) {
    s.pauseReason = `긴급 결정: ${d.text.slice(0, 28)}…`;
    notify(s, `긴급: ${d.text}`, 'urgent', 'messenger', channelId);
  } else notify(s, `${from}: ${d.text.slice(0, 60)}`, 'info', 'messenger', channelId);
  s.events.push({ type: 'decision', id, urgent: d.urgent });
  return d;
}

export function resolveDecision(s: GameState, id: string, idx: number, auto = false): string | null {
  const d = s.decisions.find((x) => x.id === id) as (PendingDecision & { map?: number[]; ctx?: Ctx }) | undefined;
  if (!d || d.resolved) return '이미 끝난 결정입니다.';
  const ch = d.choices[idx];
  if (!ch) return '없는 선택지입니다.';
  if (!ch.enabled && !auto) return ch.why ?? '고를 수 없습니다.';
  const ev = eventDef(d.eventId);
  if (!ev) return '이벤트 정의가 없습니다.';
  const orig = ev.choices[d.map ? d.map[idx] : idx];
  const ctx: Ctx = d.ctx ?? { target: null, competitorId: d.competitorId, market: 'kr' };
  ctx.target = d.targetId ? (s.employees.find((e) => e.id === d.targetId) ?? null) : null;
  const cost = Math.min(ch.cost, Math.max(0, s.cash));
  if (cost > 0) {
    book(s, `결정 비용: ${ch.label}`, -cost);
    s.accrual.other += cost;
  }
  // A-146 지친 대표는 판단이 흐려짐: 컨디션이 낮으면 나쁜 결과가 더 잘 나옴
  const tired = Math.max(0, 1 - (s.ceoEnergy ?? DATA.ceo.energy.start) / DATA.ceo.energy.lowAt);
  const oc = weighted(
    s,
    orig.outcomes,
    orig.outcomes.map((o) => o.w * (tired > 0 && fxScore(o.fx ?? {}) < 0 ? 1 + DATA.ceo.energy.judgeBad * tired : 1)),
  );
  const text = fill(s, oc.text, ctx);
  applyFx(s, oc.fx ?? {}, { ...ctx, from: d.from });
  d.resolved = { choice: idx, text, auto };
  s.company.decisions += 1;
  post(s, d.channelId, '나(대표)', `${auto ? '(답이 없어 기본 선택) ' : ''}→ ${ch.label}`, 'player');
  post(s, d.channelId, '시스템', `[결과] ${text}`, 'system');
  if (d.urgent && s.pauseReason?.startsWith('긴급 결정')) s.pauseReason = null;
  notify(s, `결과: ${text}`, auto ? 'info' : 'info', 'messenger', d.channelId);
  return null;
}

// 결과 효과 적용(docs/CONTENT_SCHEMA.md fx 표)
export function applyFx(s: GameState, fx: Record<string, unknown>, ctx: Ctx) {
  const t = ctx.target;
  const num = (k: string) => (typeof fx[k] === 'number' ? (fx[k] as number) : 0);
  let inflow = 0;
  const label = fx.equity ? `이벤트 투자금(${ctx.from ?? '투자자'})` : '이벤트 수입';
  if (num('cash')) {
    book(s, num('cash') > 0 ? label : '이벤트 지출', num('cash'));
    if (num('cash') < 0) s.accrual.other += -num('cash');
    else inflow += num('cash');
  }
  if (num('cashRev')) {
    const v = Math.round(num('cashRev') * revBase(s));
    book(s, v > 0 ? label : '이벤트 지출', v);
    if (v < 0) s.accrual.other += -v;
    else inflow += v;
  }
  // 투자 이벤트(A-67): 들어온 돈만큼 신주를 발행합니다. equity 값은 지금 기업가치에 곱하는 배율(다운라운드면 1보다 작음).
  if (fx.equity && inflow > 0 && !s.public) {
    const mult = typeof fx.equity === 'number' ? (fx.equity as number) : 1;
    const pre = Math.max(5e8, computeValuation(s).value * mult);
    const shares = Math.round((totalShares(s.capTable) * inflow) / pre);
    s.capTable.push({ holderId: nextId(s, 'evinv'), name: ctx.from ?? '이벤트 투자자', kind: 'investor', shares, round: '이벤트' });
    recordEquity(s, `${ctx.from ?? '투자자'} 투자(기업가치 ${Math.round(pre / 1e8)}억)`);
  }
  if (num('sat')) for (const e of s.employees) e.sat = clamp(e.sat + num('sat'));
  if (num('satDept') && t) for (const e of s.employees) if (e.dept === t.dept) e.sat = clamp(e.sat + num('satDept'));
  if (num('health')) for (const e of s.employees) e.health = clamp(e.health + num('health'));
  if (t) {
    if (num('satTarget')) t.sat = clamp(t.sat + num('satTarget'));
    if (num('healthTarget')) t.health = clamp(t.health + num('healthTarget'));
    if (num('raiseTarget')) {
      t.salary = Math.round((t.salary * (1 + num('raiseTarget'))) / 10000) * 10000;
      t.lastRaiseDay = s.day;
    }
    if (num('skillTarget')) t.skill = clamp(t.skill + num('skillTarget'));
    if (fx.promoteTarget) {
      t.lead = true;
      t.salary = Math.round((t.salary * 1.15) / 10000) * 10000;
    }
    if (fx.leaveTarget && s.employees.includes(t)) removeEmployee(s, t, 'event');
  }
  // 인지도: 오르는 효과는 절대값, 깎이는 효과는 지금 인지도의 비율(−0.04 → 20% 감소, A-71). 작은 회사의 인지도가 통째로 사라지지 않게
  if (num('awareness'))
    for (const m of Object.values(s.markets))
      if (m.launched) m.awareness = num('awareness') > 0 ? Math.min(1, m.awareness + num('awareness')) : m.awareness * (1 - Math.min(0.5, -num('awareness') * 5));
  if (num('users')) for (const m of Object.values(s.markets)) m.users = Math.max(0, m.users * (1 + num('users')));
  if (num('bugs')) s.product.bugs = Math.max(0, Math.min(100, s.product.bugs + num('bugs')));
  if (num('appeal')) s.product.appealBonus += num('appeal');
  if (num('rep')) s.career.rep = Math.max(0, s.career.rep + num('rep'));
  if (num('ir')) s.irPoints = Math.max(0, s.irPoints + num('ir'));
  if (num('network')) s.networkPoints = Math.max(0, s.networkPoints + num('network'));
  if (num('work')) {
    if (num('work') > 0) applyWork(s, num('work'), 'dev', true);
    else {
      const it = s.product.roadmap[0];
      if (it) it.devDone = Math.max(0, it.devDone + num('work'));
    }
  }
  if (num('ai')) s.ai.adaptation = Math.max(0, Math.min(1, s.ai.adaptation + num('ai')));
  if (num('board')) s.company.board = Math.max(0, Math.min(100, s.company.board + num('board')));
  if (num('stock') && s.public) {
    s.public.sentiment = Math.max(0.4, Math.min(2, s.public.sentiment * (1 + num('stock'))));
    s.public.price *= 1 + num('stock');
  }
  if (typeof fx.loan === 'string') applyLoanChoice(s, fx.loan); // A-137 대출 제안
  if (num('ceoEnergy')) s.ceoEnergy = Math.max(0, Math.min(100, (s.ceoEnergy ?? DATA.ceo.energy.start) + num('ceoEnergy'))); // A-146 대표 컨디션
  if (typeof fx.flag === 'string') setFlag(s, fx.flag);
  if (typeof fx.unflag === 'string') clearFlag(s, fx.unflag);
  const comp = s.competitors.find((c) => c.id === ctx.competitorId);
  if (comp) {
    if (num('compAppeal')) comp.appeal *= 1 + num('compAppeal');
    if (fx.compDie && comp.alive) {
      comp.alive = false;
      news(s, `[폐업] ${comp.name}, 사업 정리`, 'competitor');
    }
  }
  if (Array.isArray(fx.mod)) for (const m of fx.mod as { key: string; value: number; days: number }[]) addMod(s, m.key, m.value, m.days, '이벤트');
  if (fx.hire && typeof fx.hire === 'object') hireSpecial(s, fx.hire as { name: string; dept: DeptId; grade: Grade; salary: number; trait?: string });
  if (typeof fx.news === 'string') news(s, fill(s, fx.news, ctx), 'company');
}

function clamp(v: number) {
  return Math.max(0, Math.min(100, v));
}

function hireSpecial(s: GameState, h: { name: string; dept: DeptId; grade: Grade; salary: number; trait?: string }) {
  const seat = takeDesk(s);
  if (!seat) {
    notify(s, `${h.name}님이 합류하려 했지만 사무실에 책상을 놓을 자리가 없어 무산됐습니다.`, 'bad', 'office');
    return;
  }
  const e: Employee = {
    id: nextId(s, 'e'),
    name: h.name,
    dept: h.dept,
    salary: h.salary,
    grade: h.grade,
    years: 8,
    joinedDay: s.day,
    seatId: seat.id,
    kind: 'staff',
    traits: h.trait ? [h.trait] : [],
    skill: startSkill(s, h.grade, 8),
    talent: rollTalent(s),
    sat: 75,
    health: 80,
    lead: false,
    options: 0,
    optionDay: null,
    sickUntil: null,
    leaving: null,
    lastRaiseDay: s.day,
    bubble: { text: 'box', until: s.day + 3 },
  };
  seat.occupant = e.id;
  s.employees.push(e);
  onEmployeeJoined(s, e);
  s.events.push({ type: 'hired', empId: e.id });
  void DATA;
}
