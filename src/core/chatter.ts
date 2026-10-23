// 직원 잡담(A-148): 일하는 시간 칸마다 가끔 직원 두 사람(가끔 셋)이 팀 채널이나 #전체에서 2~4줄 대화를 나눕니다.
// 주제는 일상(점심·주말…)·일(버그·회의…)·회사 상황(야근·자금·장애·출시·새 동료·성장)이고, 답하는 사람의 무드(talk.ts moodOf)에 따라 말투가 다릅니다.
// 게임 난수(s.rng)와 따로 도는 난수를 써서 효과·봇·시뮬 결과에 영향이 없고, 안 읽음 수도 올리지 않습니다(분위기만).
import chatter from '../data/chatter.json';
import { orderDef } from './data';
import { empOrderOf } from './assign';
import { runwayMonths } from './finance';
import { getChannel, teamChannelId } from './messenger';
import { isSick } from './staff';
import { moodOf, type Mood } from './talk';
import type { Employee, GameState } from './types';

// 대화 묶음(A-211): 같은 질문을 조금씩 다르게 쓴 ask와 그 질문에 맞는 답·마무리(B의 무드별)·거들기를 한데 묶음.
// 예전엔 주제 안에서 질문·답을 따로 뽑아 "영화 보셨어요?" → "요리 배우는 게 즐거워요"처럼 어긋났음
type Thread = { ask: string[]; answer: Record<Mood, string[]>; follow: Record<Mood, string[]>; chime: string[] };
type Topic = { id: string; when: string | null; threads: Thread[] };
const C = chatter as unknown as {
  fx: { slotChance: number; perEmployee: number; maxChance: number; teamShare: number; followChance: number; chimeChance: number; recentDays: number; newHireDays: number; growth: number; situationWeight: number };
  topics: Topic[];
};

// 날·칸·회사로 정해지는 따로 도는 난수(mulberry32)
function localRng(s: GameState, slot: number) {
  let h = 2166136261;
  for (const ch of `${s.company.name}|${s.day}|${slot}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 지금 맞는 회사 상황
function situations(s: GameState): Set<string> {
  const F = C.fx;
  const out = new Set<string>();
  if (s.company.workPolicy === 'crunch') out.add('crunch');
  const rw = runwayMonths(s);
  if (rw !== null && rw < 3) out.add('runwayLow');
  if (s.lastMajorOutage !== undefined && s.day - s.lastMajorOutage <= F.recentDays) out.add('outage');
  if (s.product.shipped.some((x) => s.day - x.day <= F.recentDays)) out.add('launch');
  if (s.employees.some((e) => s.day - e.joinedDay <= F.newHireDays)) out.add('newHire');
  const d = s.product.daily ?? [];
  if (d.length >= 30 && d[d.length - 30].users > 0 && d[d.length - 1].users / d[d.length - 30].users - 1 >= F.growth) out.add('growing');
  return out;
}

export function chatterSlot(s: GameState, slot: number) {
  const F = C.fx;
  const awake = s.employees.filter((e) => !isSick(s, e) && e.leaving === null);
  if (awake.length < 2) return;
  const r = localRng(s, slot);
  if (r() >= Math.min(F.maxChance, F.slotChance + F.perEmployee * awake.length)) return;
  const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)];

  // 채널: 두 사람 이상인 팀 채널, 아니면 #전체
  const teams = [...new Set(awake.map((e) => e.dept))].filter((d) => awake.filter((e) => e.dept === d).length >= 2 && getChannel(s, teamChannelId(d)));
  const inTeam = teams.length > 0 && r() < F.teamShare;
  const dept = inTeam ? pick(teams) : null;
  const pool = dept ? awake.filter((e) => e.dept === dept) : awake;
  const chId = dept ? teamChannelId(dept) : 'all';
  if (!getChannel(s, chId)) return;

  // 주제: 조건이 맞는 상황 주제는 더 자주, 조건이 안 맞으면 빠짐
  const sit = situations(s);
  const usable = C.topics.filter((t) => !t.when || sit.has(t.when));
  const weights = usable.map((t) => (t.when ? F.situationWeight : 1));
  let x = r() * weights.reduce((a, b) => a + b, 0);
  const topic = usable.find((_, i) => (x -= weights[i]) < 0) ?? usable[0];

  const a = pick(pool);
  const b = pick(pool.filter((e) => e.id !== a.id));
  const newbie = [...s.employees].sort((p, q) => q.joinedDay - p.joinedDay)[0];
  const fill = (t: string, who: Employee) =>
    t
      .replace(/\{a\}/g, a.name)
      .replace(/\{b\}/g, b.name)
      .replace(/\{newbie\}/g, newbie && newbie.id !== who.id ? newbie.name : b.name)
      .replace(/\{order\}/g, orderDef(empOrderOf(s, who))?.name ?? '지금 맡은 일')
      .replace(/\{company\}/g, s.company.name);
  // messenger.post 대신 직접 넣음: 공용 id 번호(idSeq)를 쓰면 뒤에 생기는 사건·사람 id가 밀려 게임 결과가 달라지고, 안 읽음도 올리지 않음
  const ch = getChannel(s, chId)!;
  let n = 0;
  const say = (who: Employee, t: string) => {
    ch.messages.push({ id: `chat-${s.day}-${slot}-${n++}`, day: s.day, at: Math.round(s.msInDay), from: who.name, text: fill(t, who), kind: 'npc' });
    if (ch.messages.length > 120) ch.messages.splice(0, ch.messages.length - 120);
  };
  // 묶음 하나 안에서만 뽑음: 질문 → 그 질문에 맞는 B의 답(무드) → 같은 무드의 A 마무리 → C 거들기
  const th = pick(topic.threads);
  const mood = moodOf(s, b);
  say(a, pick(th.ask));
  say(b, pick(th.answer[mood]));
  if (r() < F.followChance) say(a, pick(th.follow[mood]));
  const rest = pool.filter((e) => e.id !== a.id && e.id !== b.id);
  if (rest.length && th.chime.length && r() < F.chimeChance) say(pick(rest), pick(th.chime));
}
