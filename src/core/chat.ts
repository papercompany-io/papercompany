// 팀·전체 채널에 대표가 직접 쓴 말(A-147). LLM(A-199, core/talkPrompt.ts) 또는 키워드 규칙으로 읽어:
// - 사람별 업무 지정: "민수님은 버그 잡고 지영님은 기능 개발해 주세요"처럼 한 문장에 여러 사람·여러 일 → 개인 업무(setEmpOrder)
// - 팀 업무 변경: "개발팀은 안정화에 집중합시다" → 팀 지시(commandOrder, 거절 가능). 한 문장에 여러 팀도 됨. "다 같이·모두"면 개인 업무도 팀 일로 되돌림
// - 사람을 부른 말: 그 사람이 DM처럼 답하고 같은 효과(공개 칭찬·질책 포함, 재사용 대기도 DM과 같음)
// - 모두에게 한 말: 한 사람이 대표로 답하고 가끔 다른 사람이 거듦. 효과는 사람마다 DM보다 약하게, DM과 같은 재사용 대기를 씀
//   (모두 칭찬은 +2지만 그 주에는 DM 칭찬이 "또"가 되어 약해짐 → 넓게 약하게 vs 좁게 세게 고르는 선택)
// LLM이 읽었으면 답도 LLM이 쓴 말(미리 해 둔 판정에 맞춤)을 올리고, 없으면 대사 묶음으로 답합니다.
import { DATA, orderDef } from './data';
import { teamOrder } from './assign';
import { setSquadOrder, squad } from './squads';
import { getChannel, post } from './messenger';
import { commandOrder, type OrderVerdict } from './reactions';
import { pick, rand } from './rng';
import { hasTrait, isSick } from './staff';
import { INTENT_IDS, T, best, classify, cleanReply, compose, fill, moodOf, norm, ordersForEmp, respond, setEmpOrder, type Mood, type TalkRead } from './talk';
import type { DeptId, Employee, GameState } from './types';

const ME = '나(대표)';

// 채널 말의 뜻(LLM 또는 키워드)
export interface ChannelRead {
  intent: string | null;
  tone: number;
  topic: string | null;
  teamOrders: string[]; // 팀 단위로 바꿀 일(팀마다 하나)
  everyone: boolean; // 개인 업무를 가진 사람까지 모두 팀 일로
  speaker: string | null; // 부른 사람(직원 id)
  assigns: Record<string, string>; // 직원 id → 일 id 또는 'team'(팀 일로 돌아감)
  replies?: { from: string; text: string }[]; // LLM이 쓴 답(직원 id, 말, A-199)
  verdicts?: Record<string, OrderVerdict>; // LLM에 넘긴 팀 지시 판정
  gist?: string;
}

type GroupLines = Record<string, Record<Mood, string[]>>;
const G = (T as unknown as { groupReplies: GroupLines }).groupReplies;

export function channelMembers(s: GameState, chId: string): Employee[] {
  const ch = getChannel(s, chId);
  if (!ch) return [];
  if (ch.kind === 'all') return s.employees.filter((e) => e.leaving === null || e.leaving > s.day);
  if (ch.kind === 'team' && ch.squadId) return s.employees.filter((e) => e.squadId === ch.squadId); // 부서 안의 팀(A-226)
  if (ch.kind === 'team' && ch.dept) return s.employees.filter((e) => e.dept === ch.dept);
  return s.employees.filter((e) => ch.memberIds.includes(e.id));
}

// 문장에서 부른 사람: 전체 이름 또는 세 글자 이름의 뒤 두 글자("하늘님"). 나온 순서대로
export function namedIn(members: Employee[], text: string): { e: Employee; at: number }[] {
  const out: { e: Employee; at: number }[] = [];
  for (const e of members) {
    const ch = [...e.name];
    const keys = ch.length === 3 ? [e.name, ch.slice(1).join('')] : [e.name];
    const at = Math.min(...keys.map((k) => text.indexOf(k)).filter((i) => i >= 0), Infinity);
    if (at !== Infinity) out.push({ e, at });
  }
  return out.sort((a, b) => a.at - b.at);
}

export function postChannelSaid(s: GameState, chId: string, raw: string): string | null {
  const text = raw.trim().slice(0, T.fx.maxLen);
  if (!text) return '보낼 말을 입력하세요.';
  if (!getChannel(s, chId)) return '채널을 찾을 수 없습니다.';
  post(s, chId, ME, text, 'player');
  return null;
}

// 키워드 규칙으로 읽기(LLM이 없을 때)
export function ruleRead(s: GameState, chId: string, members: Employee[], text: string): ChannelRead {
  const t = norm(text);
  const ch = getChannel(s, chId)!;
  const ref = members.find((e) => e.lead) ?? members[0];
  const c = ref ? classify(s, ref, text) : null;
  const named = namedIn(members, text);
  const verb = T.orderVerbs.some((v) => t.includes(v));
  const keyed = (os: { id: string }[]) => os.map((o) => ({ id: o.id, keys: T.orderKeys[o.id] ?? [] }));
  const assigns: Record<string, string> = {};
  // 사람마다 이름 뒤부터 다음 이름 앞까지에서 그 사람 부서의 일을 찾음
  if (verb)
    named.forEach((n, i) => {
      const seg = norm(text.slice(n.at, named[i + 1]?.at ?? text.length));
      const o = best(seg, keyed(ordersForEmp(s, n.e)));
      if (o) assigns[n.e.id] = o.def.id;
      else if (['원래', '팀일로', '팀이랑같이'].some((k) => seg.includes(k))) assigns[n.e.id] = 'team';
    });
  let tOrd: string | null = null;
  if (verb && !Object.keys(assigns).length) {
    const pool = DATA.orders.orders.filter((o) => s.company.stage >= o.stage && (ch.kind !== 'team' || o.dept === ch.dept));
    tOrd = best(t, keyed(pool))?.def.id ?? null;
  }
  return {
    intent: tOrd || Object.keys(assigns).length ? 'order' : c?.intent ?? 'unknown',
    tone: 0,
    topic: c?.topic?.id ?? null,
    teamOrders: tOrd ? [tOrd] : [],
    everyone: T.teamKeys.some((k) => t.includes(k)),
    speaker: named.length === 1 ? named[0].e.id : null,
    assigns,
  };
}

// 올라간 대표 말에 채널 사람들이 답하고 효과를 냅니다. read = LLM이 읽은 뜻과 답(null이면 키워드 규칙)
export function answerChannel(s: GameState, chId: string, raw: string, read: ChannelRead | null) {
  const text = raw.trim().slice(0, T.fx.maxLen);
  const ch = getChannel(s, chId);
  const members = channelMembers(s, chId);
  if (!ch || !members.length) return;
  // LLM이 읽었으면 그 해석을 통째로 따름(키워드와 섞지 않음)
  const rd = read ?? ruleRead(s, chId, members, text);
  const byId = (id: string | null) => (id ? members.find((e) => e.id === id) ?? null : null);
  const intent: string = rd.intent && INTENT_IDS.includes(rd.intent) ? rd.intent : 'unknown';
  const tone = read ? read.tone : 0;
  // LLM 답: 이 채널 사람만, 병가 중이면 빼고, 최대 3개
  const replies = (read?.replies ?? [])
    .map((r) => ({ e: byId(r.from), text: r.text }))
    .filter((r): r is { e: Employee; text: string } => !!r.e && !isSick(s, r.e))
    .map((r) => ({ e: r.e, text: cleanReply(r.text, r.e.name) }))
    .filter((r): r is { e: Employee; text: string } => !!r.text)
    .slice(0, 3);
  const quiet = replies.length > 0;
  const speak = (rs: typeof replies) => rs.forEach((r) => post(s, chId, r.e.name, fill(s, r.e, r.text), 'npc'));

  // 1) 사람별 업무
  let handled = false;
  for (const [id, o] of Object.entries(rd.assigns)) {
    if (!byId(id)) continue;
    setEmpOrder(s, id, o === 'team' ? null : o, chId, quiet);
    handled = true;
  }
  // 2) 팀 업무(팀마다 하나)
  const tOrds = handled ? [] : rd.teamOrders.filter((id, i, a) => a.findIndex((x) => orderDef(x)?.dept === orderDef(id)?.dept) === i);
  for (const id of tOrds) {
    const od = orderDef(id);
    if (!od) continue;
    const d = od.dept as DeptId;
    const inTeam = ch.kind === 'team' && ch.dept === d;
    const lead = s.employees.find((e) => e.dept === d && e.lead) ?? s.employees.find((e) => e.dept === d);
    const R = T.orderReplies;
    handled = true;
    // 아직 못 맡는 일: 효과 없이 "아직 어렵다"
    if (s.company.stage < od.stage) {
      if (!quiet && lead) post(s, chId, lead.name, fill(s, lead, pick(s, R.cant)), 'npc');
      continue;
    }
    // 부서 안의 팀 채널에서 그 부서 일을 말하면 그 팀의 맡은 일만 바꿈(A-226)
    if (ch.squadId && ch.dept === d) {
      const q = squad(s, ch.squadId);
      const who = members.find((e) => e.lead) ?? members[0];
      if (q && q.order === od.id) {
        if (!quiet && who) post(s, chId, who.name, fill(s, who, pick(s, R.same)), 'npc');
      } else setSquadOrder(s, ch.squadId, od.id, false, quiet);
      continue;
    }
    const already = teamOrder(s, d) === od.id;
    // 팀 채널이면 LLM 답이 팀장 답을 대신함. #전체에서 내린 지시는 그 팀 채널에 팀장 답이 따로 남음
    if (!already) commandOrder(s, d, od.id, !inTeam, read?.verdicts?.[od.id], quiet && inTeam);
    const applied = teamOrder(s, d) === od.id;
    const everyone = applied && rd.everyone;
    const cleared = everyone ? s.employees.filter((e) => e.dept === d && e.order) : [];
    for (const e of cleared) e.order = null;
    // 전체 채널에서 내린 지시는 그 팀 사람이 여기서도 답함(팀 채널에는 commandOrder가 답함).
    // 이미 팀 일이었으면 commandOrder가 말하지 않으니 여기서 답함(따로 하던 사람이 돌아오면 "돌아감")
    if (!quiet && lead && (!inTeam || already)) post(s, chId, lead.name, fill(s, lead, pick(s, already ? (cleared.length ? R.back : R.same) : applied ? R.ok : R.no)), 'npc');
  }
  if (handled) {
    speak(replies);
    return groupTone(s, members, tone, intent);
  }

  // 3) 사람을 부른 말: 그 사람이 DM처럼 답함(다른 사람이 거든 말은 그 뒤에)
  const target = byId(rd.speaker);
  if (target) {
    const own = replies.find((r) => r.e.id === target.id);
    const r: TalkRead | null = read ? { intent, order: null, tone, topic: read.topic, scope: 'team', reply: own?.text ?? null } : null;
    respond(s, target, chId, text, r);
    return speak(replies.filter((x) => x !== own));
  }

  // 4) 모두에게 한 말
  groupEffect(s, members, intent);
  groupTone(s, members, tone, intent);
  if (quiet) return speak(replies);
  const awake = members.filter((e) => !isSick(s, e));
  if (!awake.length) return;
  const first = (ch.kind === 'team' ? awake.find((e) => e.lead) : null) ?? pickTalker(s, awake);
  groupSay(s, chId, first, intent, rd.topic);
  const others = awake.filter((e) => e.id !== first.id);
  if (others.length && rand(s) < T.group.chimeChance) groupSay(s, chId, pickTalker(s, others), intent, rd.topic);
}

// 사교적인 사람이 먼저 말할 확률이 높음
function pickTalker(s: GameState, es: Employee[]): Employee {
  const social = es.filter((e) => hasTrait(e, 'social'));
  return social.length && rand(s) < 0.5 ? pick(s, social) : pick(s, es);
}

function groupSay(s: GameState, chId: string, e: Employee, intent: string, topicId: string | null) {
  const mood = moodOf(s, e);
  const g = G[intent];
  let text: string;
  if (g) text = pick(s, g[mood]);
  else {
    const set = T.replies[intent === 'order' ? 'work' : intent] ?? T.replies.unknown;
    const light = ['greet', 'joke', 'smalltalk', 'unknown'].includes(intent);
    const topic = light && topicId ? T.topics.find((t) => t.id === topicId) : undefined;
    text = compose(s, e, set, mood, topic?.lines[mood]);
  }
  post(s, chId, e.name, fill(s, e, text), 'npc');
}

// 모두에게 한 말의 효과: DM보다 약하고, 사람마다 DM과 같은 재사용 대기(자기 대기 중인 사람은 효과 없음)
function groupEffect(s: GameState, members: Employee[], intent: string) {
  const g = T.group;
  const cool = (e: Employee, key: string, days: number) => {
    const last = e.dmDay?.[key];
    if (last !== undefined && s.day - last < days) return false;
    (e.dmDay ??= {})[key] = s.day;
    return true;
  };
  for (const e of members) {
    if (intent === 'praise' && cool(e, 'praise', g.praiseCool)) e.sat = Math.min(100, e.sat + g.praiseSat);
    else if (intent === 'push' && cool(e, 'push', g.pushCool)) {
      e.sat = Math.max(0, e.sat - g.pushSat);
      e.health = Math.max(0, e.health - g.pushHealth);
    } else if (intent === 'rest' && cool(e, 'rest', g.restCool)) {
      e.health = Math.min(100, e.health + g.restHealth);
      e.sat = Math.min(100, e.sat + g.restSat);
    } else if (intent === 'scold' || intent === 'insult') {
      // 모두에게 한 모욕은 질책보다 크게(A-199)
      const hot = hasTrait(e, 'hothead');
      e.sat = Math.max(0, e.sat - (intent === 'insult' ? (hot ? g.insultSatHothead : g.insultSat) : hot ? g.scoldSatHothead : g.scoldSat));
      (e.dmDay ??= {})['talk-scold'] = s.day;
    } else if (intent === 'apology') {
      const last = e.dmDay?.['talk-scold'];
      if (last !== undefined && s.day - last <= T.fx.apologyDays) {
        e.sat = Math.min(100, e.sat + g.apologySat);
        delete e.dmDay!['talk-scold'];
      }
    }
  }
}

// 거친 말투는 모두의 만족을 조금 깎음(질책·모욕은 이미 깎았으니 제외). 따뜻한 말투는 모두에게는 효과 없음
function groupTone(s: GameState, members: Employee[], tone: number, intent: string) {
  const t = Math.max(-2, Math.min(2, Math.round(tone || 0)));
  if (t >= 0 || intent === 'scold' || intent === 'insult') return;
  for (const e of members) e.sat = Math.max(0, e.sat + t * T.group.rudeSat);
}

// 키워드 규칙만으로 한 번에(시험용)
export function freeChannel(s: GameState, chId: string, raw: string): string | null {
  const err = postChannelSaid(s, chId, raw);
  if (!err) answerChannel(s, chId, raw, null);
  return err;
}
