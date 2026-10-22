// 자유 입력 DM(A-139): 대표가 쓴 말을 OpenRouter Decisions의 Jev에 보내 선택지를 고르게 합니다.
// Jev는 글을 쓰지 않고 질문마다 선택지 하나를 고릅니다: 의도(intent), 바꿀 업무(order), 말투(tone 0~4), 잡담 주제(topic).
// 답 문장은 core/talk.ts가 그 결정에 맞춰 대사 묶음(talk.json)으로 만들고, 효과도 게임 규칙이 정합니다.
// Electron은 메인 프로세스(window.pcSave.jev), 웹 개발 서버는 /api/jev(vite.config.ts)가 .env의 키를 붙입니다.
// 키가 없거나 실패·시간 초과면 null → 키워드 규칙. 의도 확신이 낮으면 그 항목만 키워드 규칙을 씁니다.
import { dept, orderDef, trait } from '../core/data';
import { runwayMonths } from '../core/finance';
import { orderOf } from '../core/orders';
import { isSick } from '../core/staff';
import { moodOf, ordersForEmp, topicList, type TalkRead } from '../core/talk';
import { channelMembers, namedIn, type ChannelRead } from '../core/chat';
import { getChannel } from '../core/messenger';
import { empOrderOf } from '../core/assign';
import { DATA } from '../core/data';
import type { GameState } from '../core/types';

const TIMEOUT_MS = 10000;
const MIN_CONFIDENCE = 0.45;
const NONE = 'none';
const MOOD_WORD = { good: '기분 좋고 의욕 있음', neutral: '무난함', bad: '지치고 불만 있음' };

const INTENTS: Record<string, string> = {
  checkin: '근황·안부·고민을 물음',
  praise: '칭찬하거나 고마워함',
  push: '더 열심히, 더 빨리 하라고 요구함',
  rest: '쉬라고 하거나 일찍 들어가라고 함',
  order: '팀이 맡을 일(업무)을 바꾸거나 무엇에 집중하라고 지시함',
  scold: '질책·비난·실망을 표현함',
  apology: '대표가 사과함',
  work: '업무 진행 상황·일정을 물음',
  idea: '의견이나 아이디어를 물음',
  pay: '연봉·월급·보상·처우 이야기를 함',
  greet: '인사함',
  bye: '퇴근·작별 인사를 함',
  joke: '농담하거나 웃음',
  smalltalk: '일과 상관없는 일상 잡담',
  unknown: '무슨 뜻인지 알 수 없음',
};

function buildRequest(s: GameState, empId: string, said: string) {
  const e = s.employees.find((x) => x.id === empId);
  if (!e) return null;
  const orders = Object.fromEntries([...ordersForEmp(s, e).map((o) => [o.id, `${o.name}: ${o.desc}`]), [NONE, '업무를 바꾸라는 말이 아니거나, 이 팀 일이 아님']]);
  const topics = Object.fromEntries([...topicList().map((t) => [t.id, t.keys.slice(0, 6).join(', ')]), [NONE, '특별한 주제 없음']]);
  const rw = runwayMonths(s);
  const hist = (s.channels.find((c) => c.id === `dm-${e.id}`)?.messages ?? []).slice(-7, -1).map((m) => `${m.from}: ${m.text}`);
  return {
    questions: {
      intent: { type: 'choice', instructions: '대표(회사 대표)가 직원에게 DM으로 보낸 message의 주된 뜻은?', criteria: INTENTS },
      order: { type: 'choice', instructions: 'message가 이 직원의 팀에게 맡은 일을 바꾸라는 지시라면, 어떤 일로 바꾸라는 것인가?', criteria: orders },
      tone: { type: 'score', instructions: 'message의 말투는 직원에게 얼마나 따뜻한가?', criteria: ['모욕·막말', '무례·짜증', '보통', '친절', '아주 따뜻함'] },
      topic: { type: 'choice', instructions: 'message가 이야기하는 일상·회사 주제는?', criteria: topics },
      scope: { type: 'choice', instructions: '업무를 바꾸라는 지시라면 누구에게 하는 지시인가?', criteria: { self: '이 직원 한 명에게만(개인 업무)', team: '이 직원이 속한 팀 전체에게' } },
    },
    state: {
      message: said,
      employee: `${e.name}, ${dept(e.dept).name}팀${e.lead ? ' 팀장' : ''}, 성격: ${e.traits.map((t) => trait(t)?.name ?? t).join('·') || '보통'}, 상태: ${MOOD_WORD[moodOf(s, e)]}${isSick(s, e) ? ', 병가 중' : ''}`,
      team_current_work: orderDef(orderOf(s, e.dept))?.name ?? '없음',
      company: `${s.company.name}, 직원 ${s.employees.length}명, 자금 ${rw === null ? '여유' : rw < 3 ? '곧 바닥' : '빠듯함'}`,
      recent_conversation: hist.join('\n') || '(없음)',
    },
  };
}

type Answers = Record<string, { choice?: string; score?: number; confidence?: number } | undefined>;

async function call(req: { questions: unknown; state: unknown }): Promise<Answers | null> {
  if (window.pcSave?.jev) return (await window.pcSave.jev(req)) as Answers | null;
  const r = await fetch('/api/jev', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
  if (!r.ok) return null;
  return ((await r.json()) as { answers: Answers | null }).answers;
}

function toRead(a: Answers | null): TalkRead | null {
  if (!a?.intent?.choice) return null;
  const pickOf = (k: string) => (a[k]?.choice && a[k]!.choice !== NONE ? a[k]!.choice! : null);
  return {
    intent: (a.intent.confidence ?? 1) >= MIN_CONFIDENCE ? a.intent.choice : null,
    order: pickOf('order'),
    tone: typeof a.tone?.score === 'number' ? a.tone.score - 2 : 0,
    topic: pickOf('topic'),
    scope: a.scope?.choice === 'team' ? 'team' : a.scope?.choice === 'self' ? 'self' : null,
  };
}

export async function readTalk(s: GameState, empId: string, said: string): Promise<TalkRead | null> {
  const req = buildRequest(s, empId, said);
  if (!req) return null;
  try {
    return toRead(await Promise.race([call(req), new Promise<null>((r) => setTimeout(() => r(null), TIMEOUT_MS))]));
  } catch {
    return null;
  }
}

// ── 팀·전체 채널(A-147) ──
// 질문: 의도, 말투, 주제, 팀 단위로 바꿀 일, 모두(개인 업무까지)인지, 부른 사람, 그리고 문장에 이름이 나온 사람마다 맡길 일
function buildChannelRequest(s: GameState, chId: string, said: string) {
  const ch = getChannel(s, chId);
  const members = channelMembers(s, chId);
  if (!ch || !members.length) return null;
  const pool = DATA.orders.orders.filter((o) => s.company.stage >= o.stage && (ch.kind !== 'team' || o.dept === ch.dept));
  const teamOrders = Object.fromEntries([...pool.map((o) => [o.id, `${dept(o.dept as never).name}팀: ${o.name}`]), [NONE, '팀 업무를 바꾸라는 말이 아님']]);
  const named = namedIn(members, said);
  const assignQs = Object.fromEntries(
    named.map(({ e }) => [
      `assign_${e.id}`,
      {
        type: 'choice',
        instructions: `message에서 ${e.name}(${dept(e.dept).name}팀)에게 따로 맡기라고 한 일은?`,
        criteria: Object.fromEntries([...ordersForEmp(s, e).map((o) => [o.id, `${o.name}: ${o.desc}`]), ['team', '팀 일로 돌아가라고 함'], [NONE, `${e.name}에게 따로 일을 맡기는 말이 아님`]]),
      },
    ]),
  );
  const speakers = members.length <= 15 ? Object.fromEntries([...members.map((e) => [e.id, `${e.name}(${dept(e.dept).name}팀)`]), [NONE, '특정한 사람을 부르지 않음(모두에게)']]) : null;
  const hist = ch.messages.slice(-7, -1).map((m) => `${m.from}: ${m.text}`);
  return {
    named,
    req: {
      questions: {
        intent: { type: 'choice', instructions: `대표가 ${ch.kind === 'all' ? '회사 전체 채널' : `${ch.name} 채널`}에 쓴 message의 주된 뜻은?`, criteria: INTENTS },
        tone: { type: 'score', instructions: 'message의 말투는 얼마나 따뜻한가?', criteria: ['모욕·막말', '무례·짜증', '보통', '친절', '아주 따뜻함'] },
        topic: { type: 'choice', instructions: 'message가 이야기하는 일상·회사 주제는?', criteria: Object.fromEntries([...topicList().map((t) => [t.id, t.keys.slice(0, 6).join(', ')]), [NONE, '특별한 주제 없음']]) },
        team_order: { type: 'choice', instructions: 'message가 팀 전체가 맡을 일을 바꾸라는 지시라면 어떤 일인가?', criteria: teamOrders },
        everyone: { type: 'noul', instructions: '따로 다른 일을 하던 사람까지 모두 같은 일을 하라는 말인가?', criteria: { true: '모두·다 같이·전원', false: '그런 말 없음' } },
        ...(speakers ? { speaker: { type: 'choice', instructions: 'message가 특정한 한 사람에게 하는 말이라면 누구인가?', criteria: speakers } } : {}),
        ...assignQs,
      },
      state: {
        message: said,
        channel: ch.kind === 'all' ? '회사 전체 채널' : ch.name,
        members: members.map((e) => `${e.name}(${dept(e.dept).name}팀${e.lead ? ' 팀장' : ''}, 지금 하는 일: ${orderDef(empOrderOf(s, e))?.name ?? '없음'})`).join(', '),
        company: s.company.name,
        recent_conversation: hist.join('\n') || '(없음)',
      },
    },
  };
}

type NoulAns = { noul?: number };

export async function readChannel(s: GameState, chId: string, said: string): Promise<ChannelRead | null> {
  const built = buildChannelRequest(s, chId, said);
  if (!built) return null;
  try {
    const a = await Promise.race([call(built.req), new Promise<null>((r) => setTimeout(() => r(null), TIMEOUT_MS))]);
    if (!a?.intent?.choice) return null;
    const pickOf = (k: string) => (a[k]?.choice && a[k]!.choice !== NONE ? a[k]!.choice! : null);
    const assigns: Record<string, string> = {};
    for (const { e } of built.named) {
      const o = pickOf(`assign_${e.id}`);
      if (o) assigns[e.id] = o;
    }
    return {
      intent: (a.intent.confidence ?? 1) >= MIN_CONFIDENCE ? a.intent.choice : null,
      tone: typeof a.tone?.score === 'number' ? a.tone.score - 2 : 0,
      topic: pickOf('topic'),
      teamOrder: pickOf('team_order'),
      everyone: ((a.everyone as NoulAns | undefined)?.noul ?? 0) >= 0.5,
      speaker: pickOf('speaker'),
      assigns,
    };
  } catch {
    return null;
  }
}
