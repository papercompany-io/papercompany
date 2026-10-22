// 자유 입력 DM(A-139): 대표가 직접 쓴 문장의 뜻을 읽어 직원이 답하고, 뜻에 따라 효과가 납니다.
// - 뜻 읽기: OpenRouter 키가 있으면 Jev(ui/talkJev.ts, 선택지를 고르는 결정 모델)가 의도·업무·말투·주제를 고릅니다.
//   없거나 실패하면 키워드 사전(talk.json). 답 문장은 어느 쪽이든 대사 묶음으로 만듭니다(모델이 글을 쓰지 않음).
// - 효과는 언제나 게임 규칙이 정합니다(Jev는 숫자를 정하지 않음):
//   근황·칭찬·분발·휴식 = 기존 DM 버튼(dmAction)과 같은 효과·재사용 대기, 업무 변경 = 팀 지시(commandOrder, 팀이 거절할 수 있음),
//   질책 = 만족 하락, 사과 = 질책 뒤 며칠 안이면 일부 회복, 거친 말투 = 만족 하락, 따뜻한 말투 = 며칠에 한 번 조금 상승.
// - 키워드 답은 open + body + close 조각 조합(수만 가지). 같은 시드면 같은 답(rng)이라 봇·시뮬은 그대로입니다.
import talk from '../data/talk.json';
import { DATA, dept, orderDef } from './data';
import { runwayMonths } from './finance';
import { post } from './messenger';
import { orderOf } from './orders';
import { empOrderOf } from './assign';
import { DM_ACTIONS, commandOrder, dmAction, type DmAction } from './reactions';
import { pick, rand } from './rng';
import { hasTrait, isSick } from './staff';
import type { Employee, GameState } from './types';

const ME = '나(대표)';

export type Mood = 'good' | 'neutral' | 'bad';
type Pieces = { open: string[]; body: string[]; close: string[] };
export type ReplySet = Record<Mood, Pieces> & { trait?: Record<string, string[]>; again?: string[] };
type IntentDef = { id: string; dm?: string | null; keys: string[] };
export type TopicDef = { id: string; keys: string[]; lines: Record<Mood, string[]> };

export const T = talk as unknown as {
  fx: {
    scoldSat: number;
    scoldSatHothead: number;
    apologySat: number;
    apologyDays: number;
    rudeSat: number;
    warmSat: number;
    warmDays: number;
    traitChance: number;
    maxLen: number;
    personalRecentDays: number;
    personalRecentSat: number;
  };
  intents: IntentDef[];
  orderVerbs: string[];
  orderKeys: Record<string, string[]>;
  orderReplies: Record<'ok' | 'no' | 'cant' | 'same' | 'self' | 'back', string[]>;
  teamKeys: string[];
  group: Record<string, number>;
  topics: TopicDef[];
  replies: Record<string, ReplySet>;
  sick: string[];
};

// Jev가 고른 뜻(ui/talkJev.ts). intent가 null이면(확신 낮음) 키워드 규칙. tone: -2(거침) ~ 2(따뜻함)
export interface TalkRead {
  intent: string | null;
  order: string | null;
  tone: number;
  topic: string | null;
  scope?: 'self' | 'team' | null; // 업무 변경이 이 사람만인지 팀 전체인지(A-147)
}

export const INTENT_IDS = ['checkin', 'praise', 'push', 'rest', 'order', 'scold', 'apology', 'work', 'idea', 'pay', 'greet', 'bye', 'joke', 'smalltalk', 'unknown'];

// 띄어쓰기·문장부호를 지운 소문자. 키워드도 띄어쓰기 없이 적혀 있습니다
export function norm(text: string): string {
  return text.toLowerCase().replace(/[\s.,!?~…·"'“”‘’()\-]/g, '');
}

// 맞은 키워드 길이 합이 가장 큰 것(길수록 구체적). 같으면 JSON 순서가 앞선 것
export function best<D extends { keys: string[] }>(t: string, defs: D[]): { def: D; score: number } | null {
  let top: { def: D; score: number } | null = null;
  for (const def of defs) {
    const score = def.keys.reduce((a, k) => (t.includes(k) ? a + [...k].length : a), 0);
    if (score > 0 && (!top || score > top.score)) top = { def, score };
  }
  return top;
}

// Jev에 보여 줄 잡담 주제 목록
export function topicList(): { id: string; keys: string[] }[] {
  return T.topics.map((t) => ({ id: t.id, keys: t.keys }));
}

// 이 직원 부서가 지금 단계에서 맡을 수 있는 일
export function ordersForEmp(s: GameState, e: Employee) {
  return DATA.orders.orders.filter((o) => o.dept === e.dept && s.company.stage >= o.stage);
}

export function classify(s: GameState, e: Employee, text: string): { intent: string; dm: DmAction | null; order: string | null; topic: TopicDef | null } {
  const t = norm(text);
  // 업무 변경: 이 부서 일 이름 + "집중·맡아·바꿔" 같은 지시 말
  if (T.orderVerbs.some((v) => t.includes(v))) {
    // 이 부서 일이 먼저, 없으면 다른 부서 일(→ "우리 팀 일이 아니에요")
    const keyed = (os: { id: string }[]) => os.map((o) => ({ id: o.id, keys: T.orderKeys[o.id] ?? [] }));
    const o = best(t, keyed(ordersForEmp(s, e))) ?? best(t, keyed(DATA.orders.orders));
    if (o) return { intent: 'order', dm: null, order: o.def.id, topic: null };
  }
  const it = best(t, T.intents);
  const tp = best(t, T.topics);
  // 가벼운 말(인사·농담)이거나 주제어가 더 뚜렷하면 주제 잡담으로 답함
  const light = !it || ['greet', 'joke', 'smalltalk'].includes(it.def.id);
  if (tp && (light || tp.score > it!.score)) return { intent: it && light ? it.def.id : 'smalltalk', dm: null, order: null, topic: tp.def };
  if (!it) return { intent: 'unknown', dm: null, order: null, topic: null };
  return { intent: it.def.id, dm: asDm(it.def.dm), order: null, topic: null };
}

export function asDm(id: string | null | undefined): DmAction | null {
  return DM_ACTIONS.some((a) => a.id === id) ? (id as DmAction) : null;
}

// 직원 무드: 답의 말투(밝음·무난·건조). 버튼 답(reactions.ts 근황: 건강 40·만족 50 경계)과 분위기를 맞춤
export function moodOf(s: GameState, e: Employee): Mood {
  if (e.leaving !== null) return 'bad';
  let v = e.sat * 0.6 + e.health * 0.4;
  if (hasTrait(e, 'hothead')) v -= 8;
  if (hasTrait(e, 'steady') || hasTrait(e, 'loyal')) v += 5;
  const rw = runwayMonths(s);
  if (rw !== null && rw < 2) v -= 8;
  return v >= 68 ? 'good' : v < 45 ? 'bad' : 'neutral';
}

export function fill(s: GameState, e: Employee, text: string): string {
  const o = orderDef(empOrderOf(s, e));
  return text
    .replace(/\{order\}/g, o?.name ?? '지금 맡은 일')
    .replace(/\{dept\}/g, dept(e.dept).name)
    .replace(/\{company\}/g, s.company.name);
}

export function compose(s: GameState, e: Employee, set: ReplySet, mood: Mood, body?: string[]): string {
  const own = Object.entries(set.trait ?? {}).filter(([id]) => hasTrait(e, id)).flatMap(([, l]) => l);
  if (!body && own.length && rand(s) < T.fx.traitChance) return pick(s, own);
  const p = set[mood];
  return [pick(s, p.open), pick(s, body ?? p.body), pick(s, p.close)].filter(Boolean).join(' ');
}

// 대표 말을 먼저 올림(LLM 답을 기다리는 동안 보이게). 반환: null = 올림, 문자열 = 못 올린 이유
export function postSaid(s: GameState, empId: string, raw: string): string | null {
  const text = raw.trim().slice(0, T.fx.maxLen);
  if (!text) return '보낼 말을 입력하세요.';
  if (!s.employees.some((x) => x.id === empId)) return '직원을 찾을 수 없습니다.';
  post(s, `dm-${empId}`, ME, text, 'player');
  return null;
}

// 올라간 대표 말에 직원이 답하고 효과를 냅니다. read = Jev가 고른 뜻(null이면 키워드 규칙)
export function answerSaid(s: GameState, empId: string, raw: string, read: TalkRead | null) {
  const e = s.employees.find((x) => x.id === empId);
  if (e) respond(s, e, `dm-${e.id}`, raw, read);
}

// 한 직원이 채널 ch에서 대표 말에 답함(DM, 또는 팀·전체 채널에서 이 사람을 부른 경우)
export function respond(s: GameState, e: Employee, ch: string, raw: string, read: TalkRead | null) {
  const text = raw.trim().slice(0, T.fx.maxLen);
  const rule = classify(s, e, text);
  // Jev가 고른 의도가 있으면 그것, 없거나 확신이 낮으면 키워드 규칙
  let intent = read?.intent && INTENT_IDS.includes(read.intent) ? read.intent : rule.intent;
  // Jev가 "업무 변경"이라면서 바꿀 일을 못 고르고 키워드로도 일이 안 보이면 오판으로 보고 키워드 규칙을 따름
  if (intent === 'order' && !read?.order && !rule.order) intent = rule.intent;
  const light = ['greet', 'joke', 'smalltalk', 'unknown'].includes(intent);
  const topic = read && light ? T.topics.find((t) => t.id === read.topic) ?? rule.topic : light ? rule.topic : null;
  const say = (t: string) => post(s, ch, e.name, fill(s, e, t), 'npc');

  const dm = asDm(intent);
  if (dm) {
    dmAction(s, e.id, dm, null, ch);
    return applyTone(s, e, read, intent);
  }
  if (isSick(s, e)) return say(pick(s, T.sick));

  if (intent === 'order') {
    const target = read?.order ?? rule.order;
    // 이 사람만(기본) 또는 팀 전체("팀", "다 같이" 같은 말이 있거나 Jev가 팀이라고 고름)
    const scope = read?.scope ?? (T.teamKeys.some((k) => norm(text).includes(k)) ? 'team' : 'self');
    if (target && ordersForEmp(s, e).some((o) => o.id === target)) {
      if (scope === 'team') changeOrder(s, e, target, say);
      else setEmpOrder(s, e.id, target, ch);
      return applyTone(s, e, read, intent);
    }
    if (target && orderDef(target)) return say(pick(s, T.orderReplies.cant));
    // 알 수 없는 일: 업무 질문처럼 답함
  }

  const key = `talk-${intent}`;
  const again = e.dmDay?.[key] === s.day && !topic;
  const lastScold = e.dmDay?.['talk-scold'];
  (e.dmDay ??= {})[key] = s.day;
  const set = T.replies[intent === 'order' ? 'work' : intent] ?? T.replies.unknown;
  if (again && set.again?.length) say(pick(s, set.again));
  else {
    const mood = moodOf(s, e);
    say(compose(s, e, set, mood, topic?.lines[mood]));
  }

  if (intent === 'scold') {
    e.sat = Math.max(0, e.sat - (hasTrait(e, 'hothead') ? T.fx.scoldSatHothead : T.fx.scoldSat));
  } else if (intent === 'apology' && lastScold !== undefined && s.day - lastScold <= T.fx.apologyDays && !again) {
    // 질책 뒤 며칠 안의 사과만 일부 회복(질책 + 사과 = 손해, 공짜 이득 없음)
    e.sat = Math.min(100, e.sat + T.fx.apologySat);
    delete e.dmDay['talk-scold'];
  }
  applyTone(s, e, read, intent);
}

// 팀 업무 변경: 팀 지시와 같은 판정(팀이 거절할 수 있음). 답은 결과에 맞춰
function changeOrder(s: GameState, e: Employee, target: string, say: (t: string) => void) {
  const R = T.orderReplies;
  if (orderOf(s, e.dept) === target) return say(pick(s, R.same));
  commandOrder(s, e.dept, target);
  if (s.company.orders[e.dept] === target) say(pick(s, R.ok));
  else say(pick(s, s.company.orderPushback?.order === target ? R.no : R.cant));
}

// 개인 업무 지정(A-147). orderId = null 또는 팀 일이면 팀 일로 돌아감. ch가 있으면 그 채널에 직원이 답함.
// 며칠 안에 또 바꾸면 만족이 조금 떨어집니다(자주 바꾸는 게 공짜가 아님). 반환: null = 됨, 문자열 = 못 한 이유
export function setEmpOrder(s: GameState, empId: string, orderId: string | null, ch?: string): string | null {
  const e = s.employees.find((x) => x.id === empId);
  if (!e) return '직원을 찾을 수 없습니다.';
  const R = T.orderReplies;
  const say = (t: string) => ch && post(s, ch, e.name, fill(s, e, t), 'npc');
  const team = orderOf(s, e.dept);
  const next = orderId && orderId !== team ? orderId : null;
  if (next) {
    const o = orderDef(next);
    if (!o || o.dept !== e.dept) return say(pick(s, R.cant)), '이 직원 부서의 일이 아닙니다.';
    if (s.company.stage < o.stage) return say(pick(s, R.cant)), `회사 단계 ${o.stage}부터 맡길 수 있는 일입니다.`;
  }
  if ((e.order ?? null) === next || (!next && empOrderOf(s, e) === team)) return say(pick(s, R.same)), null;
  const last = e.dmDay?.['order'];
  if (last !== undefined && s.day - last < T.fx.personalRecentDays) e.sat = Math.max(0, e.sat - T.fx.personalRecentSat);
  (e.dmDay ??= {})['order'] = s.day;
  e.order = next;
  say(pick(s, next ? R.self : R.back));
  return null;
}

// 말투 효과: 거친 말은 만족 하락(질책은 이미 깎았으니 제외), 따뜻한 말은 며칠에 한 번만 조금(버튼 칭찬보다 작게)
function applyTone(s: GameState, e: Employee, read: TalkRead | null, intent: string) {
  if (!read) return;
  const tone = Math.max(-2, Math.min(2, Math.round(read.tone || 0)));
  if (tone < 0 && intent !== 'scold') e.sat = Math.max(0, e.sat + tone * T.fx.rudeSat);
  if (tone > 0 && !asDm(intent)) {
    const last = e.dmDay?.['talk-warm'];
    if (last === undefined || s.day - last >= T.fx.warmDays) {
      e.sat = Math.min(100, e.sat + T.fx.warmSat);
      (e.dmDay ??= {})['talk-warm'] = s.day;
    }
  }
}

// 키워드 규칙만으로 한 번에(봇·시험용)
export function freeDm(s: GameState, empId: string, raw: string): string | null {
  const err = postSaid(s, empId, raw);
  if (!err) answerSaid(s, empId, raw, null);
  return err;
}
