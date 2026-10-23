// 자유 입력 대화(A-139 → A-199): 대표가 직접 쓴 문장의 뜻을 읽어 직원이 답하고, 뜻에 따라 효과가 납니다.
// - 뜻 읽기와 답 쓰기: OpenRouter 키가 있으면 실제 LLM(core/talkPrompt.ts, ui/talkAi.ts)이 한 번의 호출로
//   해석(의도·말투·업무)과 직원 답장을 냅니다. 게임 규칙의 결과(칭찬이 반복이면 덜 와닿음, 팀이 지시를 거절함 등)는
//   보내기 전에 미리 판정해 LLM에 넘기고, 같은 판정으로 효과를 냅니다.
//   키가 없거나 실패하면 키워드 사전(talk.json)으로 읽고 대사 묶음으로 답합니다.
// - 효과는 언제나 게임 규칙이 정합니다(LLM은 숫자를 정하지 않음):
//   근황·칭찬·분발·휴식 = 기존 DM 버튼(dmAction)과 같은 효과·재사용 대기, 업무 변경 = 팀 지시(commandOrder, 팀이 거절할 수 있음),
//   질책·모욕 = 만족 하락, 사과 = 질책·모욕 뒤 며칠 안이면 일부 회복, 거친 말투 = 만족 하락, 따뜻한 말투 = 며칠에 한 번 조금 상승.
// - 키워드 답은 open + body + close 조각 조합(수만 가지). 같은 시드면 같은 답(rng)이라 봇·시뮬은 그대로입니다.
import talk from '../data/talk.json';
import { DATA, dept, orderDef } from './data';
import { runwayMonths } from './finance';
import { post } from './messenger';
import { orderOf } from './orders';
import { empOrderOf } from './assign';
import { DM_ACTIONS, commandOrder, dmAction, type DmAction, type OrderVerdict } from './reactions';
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
    insultSat: number;
    insultSatHothead: number;
    apologySat: number;
    apologyDays: number;
    rudeSat: number;
    warmSat: number;
    warmDays: number;
    traitChance: number;
    maxLen: number;
    replyMax: number;
    personalRecentDays: number;
    personalRecentSat: number;
  };
  intents: IntentDef[];
  ackExact: string[];
  orderVerbs: string[];
  orderKeys: Record<string, string[]>;
  orderReplies: Record<'ok' | 'no' | 'cant' | 'same' | 'self' | 'back', string[]>;
  teamKeys: string[];
  group: Record<string, number>;
  topics: TopicDef[];
  replies: Record<string, ReplySet>;
  sick: string[];
  style: Record<string, string>;
  voices: string[];
};

// 읽은 뜻(LLM 또는 키워드). intent가 null이면 키워드 규칙. tone: -2(막말) ~ 2(아주 따뜻함)
export interface TalkRead {
  intent: string | null;
  order: string | null; // 바꿀 일 id. 'team' = 개인 업무를 그만두고 팀 일로 돌아감
  tone: number;
  topic: string | null;
  scope?: 'self' | 'team' | null; // 업무 변경이 이 사람만인지 팀 전체인지(A-147)
  reply?: string | null; // LLM이 쓴 답(A-199). 없으면 대사 묶음
  verdicts?: Record<string, OrderVerdict>; // LLM에 넘긴 팀 지시 판정(답과 효과를 맞춤)
  gist?: string; // LLM이 이해한 뜻 한 줄(평가·디버깅용)
}

// 효과가 있는 의도: 근황·칭찬·분발·휴식(DM 버튼과 같음), 업무 변경, 질책, 모욕, 사과. 나머지는 말투 효과만
export const INTENT_IDS = ['checkin', 'praise', 'push', 'rest', 'order', 'scold', 'insult', 'apology', 'work', 'idea', 'pay', 'question', 'request', 'cheer', 'ack', 'greet', 'bye', 'joke', 'smalltalk', 'unknown'];

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

// 이 직원 부서가 지금 단계에서 맡을 수 있는 일
export function ordersForEmp(s: GameState, e: Employee) {
  return DATA.orders.orders.filter((o) => o.dept === e.dept && s.company.stage >= o.stage);
}

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

// 키워드 규칙(LLM이 없을 때)
export function classify(s: GameState, e: Employee, text: string): { intent: string; dm: DmAction | null; order: string | null; topic: TopicDef | null } {
  const t = norm(text);
  const none = { dm: null, order: null, topic: null };
  // 업무 변경: 이 부서 일 이름 + "집중·맡아·바꿔" 같은 지시 말
  if (T.orderVerbs.some((v) => t.includes(v))) {
    // 이 부서 일이 먼저, 없으면 다른 부서 일(→ "우리 팀 일이 아니에요")
    const keyed = (os: { id: string }[]) => os.map((o) => ({ id: o.id, keys: T.orderKeys[o.id] ?? [] }));
    const o = best(t, keyed(ordersForEmp(s, e))) ?? best(t, keyed(DATA.orders.orders));
    if (o) return { intent: 'order', dm: null, order: o.def.id, topic: null };
  }
  // 메시지 전체가 짧은 맞장구거나 이모지뿐이면 맞장구
  if (T.ackExact.includes(t) || (text.trim() && !text.replace(EMOJI, '').trim())) return { intent: 'ack', ...none };
  // 욕설이 하나라도 있으면 모욕(질책·농담 키워드보다 먼저)
  if (hasSlur(text)) return { intent: 'insult', ...none };
  const it = best(t, T.intents);
  const tp = best(t, T.topics);
  // 가벼운 말(인사·농담)이거나 주제어가 더 뚜렷하면 주제 잡담으로 답함. 물음은 주제 잡담으로 돌리지 않음(엉뚱한 답 방지)
  const asked = /[?？]/.test(text);
  const light = !it || ['greet', 'joke', 'smalltalk'].includes(it.def.id);
  if (tp && !asked && (light || tp.score > it!.score)) return { intent: it && light ? it.def.id : 'smalltalk', dm: null, order: null, topic: tp.def };
  if (!it) return { intent: asked ? 'question' : 'unknown', ...none };
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

// 답에 섞이면 안 되는 욕설(대표 말을 따라 하는 경우 등). 키워드 사전의 모욕 말과 같음
function hasSlur(text: string): boolean {
  const t = norm(text);
  return T.intents.find((i) => i.id === 'insult')!.keys.some((k) => t.includes(k));
}

// LLM 답 다듬기(A-199): 이모지·따옴표·마크다운·"이름:" 머리말을 지우고 길이를 자름. 쓸 수 없으면 null(대사 묶음으로)
export function cleanReply(raw: string | null | undefined, name?: string): string | null {
  if (typeof raw !== 'string') return null;
  let x = raw
    .replace(EMOJI, '')
    .replace(/[*_`#>]/g, '')
    .replace(/(^|\s)[:;][-']?[)(DPp](?=\s|$)/g, '$1') // :) ;D 같은 서양식 이모티콘
    .replace(/습니다요(?=[\s.!?~…]|$)/g, '습니다') // 어미 겹침
    .replace(/([가-힣])요요(?=[\s.!?~…]|$)/g, '$1요')
    .replace(/\s+/g, ' ')
    .trim();
  if (name && x.startsWith(name)) x = x.slice(name.length).replace(/^\s*(님)?\s*[:：]\s*/, '');
  x = x.replace(/^["“”'‘’]+|["“”'‘’]+$/g, '').trim();
  if (x.length > T.fx.replyMax) {
    const cut = x.slice(0, T.fx.replyMax);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('요 '));
    x = end > 20 ? cut.slice(0, end + 1).trim() : cut.trim() + '…';
  }
  if (!x || hasSlur(x)) return null;
  return x;
}

function sickLine(t: string): string {
  return t.startsWith('(병가 중)') ? t : `(병가 중) ${t}`;
}

// 대표 말을 먼저 올림(LLM 답을 기다리는 동안 보이게). 반환: null = 올림, 문자열 = 못 올린 이유
export function postSaid(s: GameState, empId: string, raw: string): string | null {
  const text = raw.trim().slice(0, T.fx.maxLen);
  if (!text) return '보낼 말을 입력하세요.';
  if (!s.employees.some((x) => x.id === empId)) return '직원을 찾을 수 없습니다.';
  post(s, `dm-${empId}`, ME, text, 'player');
  return null;
}

// 올라간 대표 말에 직원이 답하고 효과를 냅니다. read = LLM이 읽은 뜻과 답(null이면 키워드 규칙)
export function answerSaid(s: GameState, empId: string, raw: string, read: TalkRead | null) {
  const e = s.employees.find((x) => x.id === empId);
  if (e) respond(s, e, `dm-${e.id}`, raw, read);
}

// 한 직원이 채널 ch에서 대표 말에 답함(DM, 또는 팀·전체 채널에서 이 사람을 부른 경우)
export function respond(s: GameState, e: Employee, ch: string, raw: string, read: TalkRead | null) {
  const text = raw.trim().slice(0, T.fx.maxLen);
  // LLM이 읽었으면 그 해석을 통째로 따름(키워드와 섞지 않음). 없으면 키워드 규칙
  const rule = read ? null : classify(s, e, text);
  let intent = read ? (read.intent && INTENT_IDS.includes(read.intent) ? read.intent : 'unknown') : rule!.intent;
  const target = read ? read.order : rule!.order;
  // "업무 변경"인데 바꿀 일을 못 골랐으면 업무 이야기로 답함
  if (intent === 'order' && !target) intent = 'work';
  const llm = read ? cleanReply(read.reply, e.name) : null;
  const say = (t: string) => post(s, ch, e.name, fill(s, e, t), 'npc');
  const sick = isSick(s, e);

  const dm = asDm(intent);
  if (dm) {
    dmAction(s, e.id, dm, null, ch, llm && (sick ? sickLine(llm) : llm));
    return applyTone(s, e, read, intent);
  }
  if (sick) return say(llm ? sickLine(llm) : pick(s, T.sick));

  if (intent === 'order') {
    if (target === 'team') {
      setEmpOrder(s, e.id, null, ch, !!llm);
      if (llm) say(llm);
      return applyTone(s, e, read, intent);
    }
    // 이 사람만(기본) 또는 팀 전체("팀", "다 같이" 같은 말이 있거나 LLM이 팀이라고 고름)
    const scope = read ? read.scope ?? 'self' : T.teamKeys.some((k) => norm(text).includes(k)) ? 'team' : 'self';
    if (target && ordersForEmp(s, e).some((o) => o.id === target)) {
      if (scope === 'team') changeOrder(s, e, target, say, llm, read?.verdicts?.[target]);
      else {
        setEmpOrder(s, e.id, target, ch, !!llm);
        if (llm) say(llm);
      }
      return applyTone(s, e, read, intent);
    }
    // 다른 팀 일이거나 아직 못 맡는 일
    say(llm ?? pick(s, T.orderReplies.cant));
    return applyTone(s, e, read, intent);
  }

  const key = `talk-${intent}`;
  const light = ['greet', 'joke', 'smalltalk', 'unknown'].includes(intent);
  const topic = light && rule ? rule.topic : null;
  const again = e.dmDay?.[key] === s.day && !topic;
  const lastScold = e.dmDay?.['talk-scold'];
  (e.dmDay ??= {})[key] = s.day;
  if (llm) say(llm);
  else {
    const set = T.replies[intent] ?? T.replies.unknown;
    if (again && set.again?.length) say(pick(s, set.again));
    else {
      const mood = moodOf(s, e);
      say(compose(s, e, set, mood, topic?.lines[mood]));
    }
  }

  if (intent === 'scold' || intent === 'insult') {
    // 모욕은 질책보다 크게 깎임. 둘 다 며칠 안의 사과로 일부만 회복(질책 + 사과 = 손해, 공짜 이득 없음)
    const hot = hasTrait(e, 'hothead');
    const loss = intent === 'insult' ? (hot ? T.fx.insultSatHothead : T.fx.insultSat) : hot ? T.fx.scoldSatHothead : T.fx.scoldSat;
    e.sat = Math.max(0, e.sat - loss);
    e.dmDay['talk-scold'] = s.day;
  } else if (intent === 'apology' && lastScold !== undefined && s.day - lastScold <= T.fx.apologyDays && !again) {
    e.sat = Math.min(100, e.sat + T.fx.apologySat);
    delete e.dmDay['talk-scold'];
  }
  applyTone(s, e, read, intent);
}

// 팀 업무 변경: 팀 지시와 같은 판정(팀이 거절할 수 있음). 답은 결과에 맞춰(LLM 답은 미리 해 둔 판정에 맞춰 써 있음)
function changeOrder(s: GameState, e: Employee, target: string, say: (t: string) => void, reply: string | null, pre?: OrderVerdict) {
  const R = T.orderReplies;
  if (orderOf(s, e.dept) === target) return say(reply ?? pick(s, R.same));
  commandOrder(s, e.dept, target, true, pre);
  if (s.company.orders[e.dept] === target) say(reply ?? pick(s, R.ok));
  else say(reply ?? pick(s, s.company.orderPushback?.order === target ? R.no : R.cant));
}

// 개인 업무 판정(A-147, A-199): 효과 전에 결과를 정함(부작용 없음). LLM에 넘기는 반응과 실제 효과가 같은 판정을 씀
export type EmpOrderKind = 'other' | 'early' | 'same' | 'self' | 'back';
export function empOrderVerdict(s: GameState, e: Employee, orderId: string | null): { kind: EmpOrderKind; next: string | null; recent: boolean } {
  const team = orderOf(s, e.dept);
  const next = orderId && orderId !== team ? orderId : null;
  if (next) {
    const o = orderDef(next);
    if (!o || o.dept !== e.dept) return { kind: 'other', next, recent: false };
    if (s.company.stage < o.stage) return { kind: 'early', next, recent: false };
  }
  if ((e.order ?? null) === next || (!next && empOrderOf(s, e) === team)) return { kind: 'same', next, recent: false };
  const last = e.dmDay?.['order'];
  return { kind: next ? 'self' : 'back', next, recent: last !== undefined && s.day - last < T.fx.personalRecentDays };
}

// 개인 업무 지정(A-147). orderId = null 또는 팀 일이면 팀 일로 돌아감. ch가 있으면 그 채널에 직원이 답함(quiet = 답은 부른 쪽이 올림, A-199).
// 며칠 안에 또 바꾸면 만족이 조금 떨어집니다(자주 바꾸는 게 공짜가 아님). 반환: null = 됨, 문자열 = 못 한 이유
export function setEmpOrder(s: GameState, empId: string, orderId: string | null, ch?: string, quiet = false): string | null {
  const e = s.employees.find((x) => x.id === empId);
  if (!e) return '직원을 찾을 수 없습니다.';
  const R = T.orderReplies;
  const say = (t: string) => ch && !quiet && post(s, ch, e.name, fill(s, e, t), 'npc');
  const v = empOrderVerdict(s, e, orderId);
  if (v.kind === 'other') return say(pick(s, R.cant)), '이 직원 부서의 일이 아닙니다.';
  if (v.kind === 'early') return say(pick(s, R.cant)), `회사 단계 ${orderDef(v.next!)!.stage}부터 맡길 수 있는 일입니다.`;
  // 이미 그 일을 하고 있어도 숨은 개인 업무(팀 일과 같아진 것)는 지움: 안 지우면 팀 일이 바뀔 때 혼자 옛 일로 돌아감(A-200)
  if (v.kind === 'same') return (e.order = v.next), say(pick(s, R.same)), null;
  if (v.recent) e.sat = Math.max(0, e.sat - T.fx.personalRecentSat);
  (e.dmDay ??= {})['order'] = s.day;
  e.order = v.next;
  say(pick(s, v.next ? R.self : R.back));
  return null;
}

// 말투 효과: 거친 말은 만족 하락(질책·모욕은 이미 깎았으니 제외), 따뜻한 말은 며칠에 한 번만 조금(버튼 칭찬보다 작게)
function applyTone(s: GameState, e: Employee, read: TalkRead | null, intent: string) {
  if (!read) return;
  const tone = Math.max(-2, Math.min(2, Math.round(read.tone || 0)));
  if (tone < 0 && intent !== 'scold' && intent !== 'insult') e.sat = Math.max(0, e.sat + tone * T.fx.rudeSat);
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
