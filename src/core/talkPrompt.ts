// 자유 입력 대화를 실제 LLM에 맡기는 요청 만들기(A-199). 부작용 없음: 화면(ui/talkAi.ts)과 평가 도구(scripts/talk/eval.ts)가 같이 씁니다.
// 한 번의 호출로 ① 대표 말의 해석(의도·말투·업무·부른 사람)과 ② 직원 답장을 JSON으로 받습니다.
// 게임 규칙의 결과(칭찬이 반복이면 덜 와닿음, 팀이 지시를 거절함 등)는 보내기 전에 미리 판정해 [반응 표]로 넘기고,
// 효과는 그 판정 그대로 게임이 냅니다(LLM은 숫자를 정하지 않음). 직원 상태는 말로만 넘깁니다(만족도·월급 숫자 없음).
import { DATA, dept, feature, industry, orderDef, trait } from './data';
import { dateOf } from './calendar';
import { clockHour, shownDay } from './night';
import { runwayMonths } from './finance';
import { totalUsers } from './market';
import { getChannel } from './messenger';
import { orderOf } from './orders';
import { empOrderOf } from './assign';
import { DM_ACTIONS, WHY_NOTE, dmReaction, orderVerdict, type OrderVerdict } from './reactions';
import { INTENT_IDS, T, empOrderVerdict, moodOf, type TalkRead } from './talk';
import { channelMembers, namedIn, type ChannelRead } from './chat';
import { hasTrait, isSick, marketSalary } from './staff';
import type { DeptId, Employee, GameState } from './types';

export interface TalkRequest {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
}

export interface DmPlan {
  empId: string;
  req: TalkRequest;
  verdicts: Record<string, OrderVerdict>;
}

export interface ChannelPlan {
  chId: string;
  req: TalkRequest;
  verdicts: Record<string, OrderVerdict>;
  ids: Record<string, string>; // 답에 쓰는 이름 → 직원 id
}

const SYSTEM = `너는 한국 스타트업 경영 게임 "페이퍼컴퍼니"에서 사내 메신저 대화를 맡는다. 플레이어는 회사 대표("나(대표)")다.
대표가 방금 보낸 메시지를 읽고 정해진 JSON 하나만 낸다.
- understanding: 대표가 무슨 뜻으로 말했는지 짧은 한 줄(40자 안팎, 앞 대화 흐름까지 반영).
- 해석(intent, tone, 업무 필드): 게임은 이 해석대로 직원 기분과 업무를 바꾼다. 메시지에 실제로 있는 뜻만 고른다.
- reaction: 답장을 쓰기 전에, 고른 해석에 해당하는 [반응 표] 줄을 키까지 그대로 옮겨 적는다(예: "order·team·dev_stabilize: 팀이 거절하고…"). 효과가 있는 의도(checkin, praise, push, rest, scold, insult, apology, order)는 표에 줄이 반드시 있으니 찾아서 적는다. 그 밖의 의도면 "없음".
- 답장: 직원이 메신저에 실제로 보낼 말. reaction과 어긋나면 안 된다(거절이면 받아들인다고 쓰지 않는다).

## intent (하나만)
게임 효과가 있는 것
- order: 팀이나 특정 사람이 앞으로 맡을 일을 정하거나 바꾸라는 지시. [맡을 수 있는 일] 가운데 하나를 하라는 말이어야 한다. "팀 일로 돌아가라"도 order.
- insult: 욕설·비속어·혐오 표현·성적인 말·외모 평가·인신공격. 사람을 깎아내리는 호칭("게이야", "병신아", "~련아", "~새끼야")만 던져도 insult. 일 이야기가 섞여 있어도 욕이 들어가면 insult.
- scold: 일에 대한 질책·실망·꾸중·비꼼·위협("왜 이렇게 늦어요?", "실망이에요", "못 맞추면 각오하세요", "와 일 진짜 잘하시네요^^ 이걸 이제야 하다니").
- apology: 대표가 사과함.
- push: 더 열심히·더 빨리 하라고 압박하거나 조름("속도 좀 내 주세요", "조금만 더 힘내 줍시다", "좀 집중해요").
- rest: 쉬라고 하거나 일찍 들어가라고 함.
- praise: 칭찬하거나 고마워함("잘했어요", "고마워요", "덕분에 잘 끝났어요", "수고 많았어요").
- checkin: 직원의 근황·기분·고민을 물음("요즘 어때요?", "힘든 거 없어요?", "팀 분위기 어때요?", "이직 생각 있어요?").
게임 효과가 없는 것
- work: 업무 진행·일정·결과를 물음("어디까지 됐어요?", "오늘까지 되나요?", "외주 일감 있어요?", "다음 기능 뭐예요?").
- idea: 의견·아이디어를 물음.
- pay: 연봉·월급·보상·처우 이야기(약속 포함).
- request: 맡은 일을 바꾸지 않는 작은 부탁이나 공지("이 문서 검토해 줄래요?", "자료 보내 주세요", "회의 10분 뒤에 해요").
- question: 위에 없는 사실·일정·개인적인 질문("내일 출근하세요?", "점심 뭐 드셨어요?", "주말에 뭐 했어요?").
- cheer: 응원·격려("화이팅!", "오늘도 힘내요", "잘될 거예요").
- ack: 짧은 맞장구·확인·이모티콘("네", "넵", "ㅇㅋ", "굿", "^^b", "👍").
- greet: 인사. bye: 퇴근·작별 인사. joke: 농담·웃음. smalltalk: 일과 상관없는 잡담·대표의 넋두리.
- unknown: 정말로 뜻을 짐작할 수 없을 때만. 오타·줄임말·이모티콘이 있어도 뜻을 짐작할 수 있으면 짐작한다.

헷갈리기 쉬운 것
- 일 이름이 나와도 그 일을 하라는 말이 없으면 order가 아니다. "외주 일감 들어온 거 있어요?"는 work, "버그가 왜 이렇게 많아요?"는 scold.
- 뜻이 여러 개면 게임 효과가 큰 쪽: order > insult > scold > apology > push > rest > praise > checkin > 나머지.
  "늦게 죄송한데 내일부터 로드맵 기능 개발해 주세요"는 order, "잘했는데 다음엔 더 빨리요"는 push.
- tone: -2 욕설·모욕, -1 무례·짜증·비꼼·압박, 0 보통, 1 친절·밝음, 2 아주 따뜻함(진심 어린 칭찬·위로).

## 답장
- 직원은 실제 사람이다. 대표의 말 내용에 바로 답한다. 질문엔 답하고, 부탁엔 할지 말지, 지시엔 받아들이는지 말한다.
  말에 섞인 다른 부분(늦은 시간 사과, 인사 등)도 자연스러우면 짧게 받아 준다.
  [회사]·[대화 상대]·[최근 대화]에 있는 사실로 답하고, 모르는 사실은 지어내지 말고 확인해 보겠다고 한다. 시간·장소·숫자를 새로 정하지 않는다.
- [반응 표]가 있으면 고른 해석에 맞는 반응을 그대로 따른다(거절이면 거절, 못 맡는 일이면 못 한다고, 덤덤하면 덤덤하게). 표에 없는 약속(월급 인상, 휴가 확정 등)은 하지 않는다.
- 한국 회사 메신저 말투. 대표에게 존댓말. 1~2문장, 보통 20~60자, 길어도 90자. 맞장구(ack)에는 아주 짧게 답한다.
- 성격·말버릇·기분을 드러낸다. 기분이 나쁘거나 지쳤으면 짧고 건조하게, 좋으면 밝게.
  [대화 상대]·[반응 표]의 설명 말("의욕 있음", "그럭저럭 무난하다고 답함")을 그대로 옮기지 말고 자기 말로 한다. 자기 이름을 3인칭으로 부르지 않는다.
- 기분이 "지치고 불만 있음"인 사람, 최근 질책·막말을 들은 사람, 지시를 마지못해 따르는 사람은 밝은 말투("~", "!", "ㅎㅎ", "화이팅")를 쓰지 않는다.
- 대표가 보낸 이모티콘("^^b", "^^&")을 따라 쓰지 않는다.
- 욕설·성희롱·모욕을 들으면 굽실거리며 사과하거나 웃어넘기지 않는다. 당황하거나 불쾌함을 분명히 하고 선을 긋는다. 욕을 따라 쓰지 않는다.
- 매번 "네, 대표님"이나 "대표님,"으로 시작하지 않는다. "필요한 거 있으면 말씀해 주세요" 같은 상투적인 마무리를 붙이지 않는다. 앞 대화에서 자기가 한 말을 되풀이하지 않는다.
- 숫자로 된 상태(만족도·확률·금액)나 "게임", "효과", "반응 표" 같은 말을 쓰지 않는다. 회사 사실(투자 금액, 경쟁사 이름, 날짜 약속)을 지어내지 않는다.
- 이모지·마크다운·따옴표 금지. "ㅎㅎ", "ㅠㅠ", "…", "^^"는 성격·말버릇에 맞을 때만. "~습니다요"처럼 어미를 겹치지 않는다.
- 이 회사는 날마다 출근한다(주말·휴일 이야기를 먼저 꺼내지 않는다). 아픈 사람(병가 중)은 집에서 짧게 답한다.
- [대화 상대]·[사람들]의 "지금 말투"를 지킨다.`;

const SYSTEM_CHANNEL = `

## 채널(여러 사람이 있는 방)
- addressed: 대표가 특정한 한 사람에게 하는 말이면 그 사람(이름을 부르거나, 앞 대화에서 그 사람이 한 말에 대한 반응). 여러 사람이나 모두에게 하는 말이면 none.
- team_orders: 팀 전체가 맡을 일을 바꾸라는 지시면 그 일(팀마다 하나, 여러 팀 가능). 이름을 불러 사람별로 맡기면 assigns에만 적는다. order가 아니면 빈 목록.
- assigns: 이름을 불러 그 사람에게 따로 일을 맡기거나 팀 일로 돌아가라고 하면 [{person, order}](order가 team이면 팀 일로 돌아감). 아니면 빈 목록.
- everyone: "다 같이·모두·전원"이라는 말로 따로 하던 사람까지 모두 팀 일을 하라고 할 때만 true. 그런 말이 없으면 false.
- replies: 답하는 사람(from = [사람들]의 이름 그대로)과 말. 보통 1개, 자연스러우면 2개(사람별 지시는 맡은 사람마다 하나씩, 최대 3개).
  addressed가 있으면 그 사람이 먼저 답한다. 팀 업무 지시는 그 팀 팀장(없으면 팀원)이 답한다.
  모두에게 한 말이면 한 사람(보통 팀장이나 성격상 먼저 말할 사람)이 답한다. 다른 한 사람은 앞사람과 다른 내용(자기 생각·덧붙일 사실)이 있을 때만 짧게 거든다. 같은 뜻을 되풀이할 거면 한 명만 답한다.
  병가 중인 사람은 답하지 않는다.`;

const WEEK = '일월화수목금토';
const MOOD_WORD = { good: '좋음, 의욕 있음', neutral: '무난함', bad: '지치고 불만 있음' };
const POLICY_WORD: Record<string, string> = { relaxed: '여유롭게(칼퇴)', normal: '보통', crunch: '야근이 잦음' };

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

// 팀 지시 판정의 그날 흔들림(-8~8). 난수 대신 같은 날·같은 말이면 같은 값(게임 난수 순서를 건드리지 않음)
function noise(s: GameState, key: string): number {
  return ((hash(`${s.day}|${s.idSeq}|${key}`) % 10000) / 10000 - 0.5) * 16;
}

function when(s: GameState): string {
  const d = dateOf(shownDay(s));
  const h = clockHour(s) % 24;
  const part = h < 6 ? '새벽' : h < 9 ? '이른 아침' : h < 12 ? '오전' : h < 14 ? '점심 무렵' : h < 18 ? '오후' : h < 21 ? '퇴근 뒤 저녁' : '밤';
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${WEEK[d.getUTCDay()]}요일 ${part}(${Math.floor(h)}시쯤)`;
}

function companyBlock(s: GameState): string {
  const rw = runwayMonths(s);
  const money = rw === null ? '여유 있음' : rw < 3 ? '곧 바닥남(다들 불안해함)' : rw < 6 ? '빠듯함' : '괜찮음';
  const svc = s.company.service?.name;
  const p = s.product;
  const users = totalUsers(s);
  const userWord = p.launchedDay === null ? '아직 출시 전' : users < 100 ? '사용자 아직 거의 없음' : users < 5000 ? '사용자가 조금씩 느는 중' : users < 100000 ? '사용자 꽤 많음' : '사용자 아주 많음';
  const last = p.shipped[p.shipped.length - 1];
  const next = p.roadmap.slice(0, 2).map((r) => feature(r.id).name);
  const bugs = p.bugs < 15 ? '거의 없음' : p.bugs < 40 ? '조금 있음' : '많음';
  const cs = s.contracts?.actives ?? [];
  const offers = s.contracts?.offers.length ?? 0;
  return [
    `[회사] ${s.company.name}(${industry(s.company.industry).name}${svc ? `, 서비스 "${svc}"` : ''}), 직원 ${s.employees.length}명, 자금 사정 ${money}, 근무 방침 ${POLICY_WORD[s.company.workPolicy] ?? '보통'}.`,
    `[제품] ${userWord}. ${last ? `최근 출시: "${feature(last.id).name}". ` : ''}다음에 만들 기능: ${next.length ? next.map((n) => `"${n}"`).join(', ') : '정해지지 않음'}. 버그: ${bugs}.`,
    `[외주] ${cs.length ? `${cs.map((c) => `"${c.title}"(${c.client})`).join(', ')} 진행 중` : '진행 중인 일감 없음'}${offers ? `, 새로 들어온 제안 ${offers}건` : ''}.`,
  ].join('\n');
}

function person(s: GameState, e: Employee): string {
  const days = s.day - e.joinedDay;
  const tenure = days < 14 ? '입사한 지 며칠 안 됨' : days < 60 ? '입사 한두 달째' : days < 365 ? `입사 ${Math.round(days / 30)}개월째` : `${Math.floor(days / 365)}년 넘게 일함`;
  const traits = e.traits.map((t) => `${trait(t)?.name ?? t}(${T.style[t] ?? ''})`).join(', ') || '무난함';
  const health = e.health >= 70 ? '좋음' : e.health >= 45 ? '조금 피곤함' : '많이 지침';
  const pay = e.salary / marketSalary(s, e.dept, e.grade);
  const payWord = pay >= 0.98 ? '불만 없음' : pay >= 0.9 ? '조금 아쉬움' : '시장보다 낮아 불만';
  const scolded = e.dmDay?.['talk-scold'];
  const hurt = scolded !== undefined && s.day - scolded <= T.fx.apologyDays;
  const mood = moodOf(s, e);
  const flags = [isSick(s, e) && '지금 병가 중(아파서 집에 있음)', e.leaving !== null && '곧 퇴사함(이미 마음이 떠남)', hurt && '최근 대표에게 질책이나 막말을 들음'].filter(Boolean);
  // 지금 말투: 설명을 읽고도 밝게 쓰는 일이 많아 직접 적어 줌
  const tone = hurt ? '대표에게 서운해서 짧고 건조하게, 밝은 말투 없이' : e.leaving !== null || mood === 'bad' ? '지쳐 있어 짧고 건조하게' : mood === 'good' ? '밝게' : '차분하게';
  const work = `${orderDef(empOrderOf(s, e))?.name ?? '없음'}${e.order ? '(혼자 따로 맡은 일)' : '(팀 일)'}`;
  return `${e.name} — ${dept(e.dept).name}팀 ${e.lead ? '팀장' : '팀원'}, ${tenure}. 성격: ${traits}. 말버릇: ${T.voices[hash(e.id) % T.voices.length]}. 기분: ${MOOD_WORD[mood]}. 컨디션: ${health}. 처우: ${payWord}. 지금 하는 일: ${work}.${flags.length ? ` ${flags.join(', ')}.` : ''} 지금 말투: ${tone}.`;
}

// 최근 대화(위가 먼저). 방금 올린 대표 말은 빼고 따로 줌(답을 기다리는 동안 보낸 말이면 다른 답보다 위에 있을 수 있음).
// 오늘이 아닌 말에는 며칠 전인지 붙임
function history(s: GameState, chId: string, said: string, n = 10): string {
  const ms = [...(getChannel(s, chId)?.messages ?? [])];
  const text = said.trim().slice(0, T.fx.maxLen);
  const at = ms.map((m) => m.kind === 'player' && m.text === text).lastIndexOf(true);
  if (at >= 0 && at >= ms.length - 4) ms.splice(at, 1);
  const ago = (day: number) => (day === s.day ? '' : day === s.day - 1 ? '[어제] ' : `[${s.day - day}일 전] `);
  return ms.slice(-n).map((m) => `${ago(m.day)}${m.kind === 'system' ? '(알림)' : m.from}: ${m.text.slice(0, 160)}`).join('\n') || '(없음)';
}

function orderLine(s: GameState, id: string): string {
  const o = orderDef(id)!;
  return `- ${o.id}: ${o.name} — ${o.desc}${s.company.stage < o.stage ? ' [회사가 더 커야 맡을 수 있음]' : ''}`;
}

function depts(s: GameState): DeptId[] {
  return [...new Set(s.employees.map((e) => e.dept))];
}

function ordersBlock(s: GameState, ds: DeptId[]): string {
  return ds.map((d) => [`${dept(d).name}팀(지금 팀 일: ${orderDef(orderOf(s, d))?.name ?? '없음'})`, ...DATA.orders.orders.filter((o) => o.dept === d).map((o) => orderLine(s, o.id))].join('\n')).join('\n');
}

const KIND_NOTE: Record<string, string> = {
  same: '이미 하고 있는 일이라고 함',
  empty: '받아들임',
  insist: '앞서 거절했지만 다시 지시해서 마지못해 따름(팀 기분이 상함)',
  happy: '기꺼이 받아들임',
  ok: '받아들임',
};

function verdictNote(s: GameState, v: OrderVerdict): string {
  const who = v.speaker ? s.employees.find((e) => e.id === v.speaker)?.name : null;
  const by = who ? `팀(답하는 사람 ${who})` : '팀';
  if (v.kind === 'reluctant') return `${by}이 불만은 있지만 따름(${v.why ? WHY_NOTE[v.why] : '내키지 않아 함'})`;
  if (v.kind === 'refuse') return `${by}이 거절하고 지금 하던 일을 계속하겠다고 함(${v.why ? WHY_NOTE[v.why] : '지금은 어렵다고 함'})`;
  return `${by}이 ${KIND_NOTE[v.kind]}`;
}

// 팀 지시 판정을 미리 해 둠(맡을 수 있는 일마다)
function teamVerdicts(s: GameState, ds: DeptId[], said: string): Record<string, OrderVerdict> {
  const out: Record<string, OrderVerdict> = {};
  for (const d of ds) for (const o of DATA.orders.orders) if (o.dept === d && s.company.stage >= o.stage) out[o.id] = orderVerdict(s, d, o.id, noise(s, `${d}|${said}`));
  return out;
}

// [반응 표]는 한 줄에 하나씩 "키: 반응". LLM은 고른 해석의 줄을 reaction 필드에 그대로 옮겨 적고 그대로 답함(A-199)
// 팀 업무 반응: 맡을 수 있는 일은 판정대로, 아직 못 하는 일은 "회사가 더 커야 한다"(효과 없음)
function teamNotes(s: GameState, ds: DeptId[], verdicts: Record<string, OrderVerdict>, key: string): string[] {
  return DATA.orders.orders
    .filter((o) => ds.includes(o.dept as DeptId))
    .map((o) => `${key}·${o.id}: ${verdicts[o.id] ? verdictNote(s, verdicts[o.id]) : '회사가 아직 작아 팀이 그 일은 못 맡는다고 함(업무 그대로)'}`);
}

function selfOrderNotes(s: GameState, e: Employee, key: string): string[] {
  return [...DATA.orders.orders.filter((o) => o.dept === e.dept).map((o) => o.id), 'team'].map((id) => {
    const v = empOrderVerdict(s, e, id === 'team' ? null : id);
    const note =
      v.kind === 'early'
        ? '회사가 아직 작아 그 일은 못 맡는다고 함(업무 그대로)'
        : v.kind === 'same'
          ? id === 'team'
            ? '이미 팀 일을 하고 있다고 함'
            : '이미 그 일을 하고 있다고 함'
          : v.kind === 'back'
            ? '따로 하던 일을 정리하고 팀 일로 돌아가겠다고 함'
            : `자기가 따로 맡겠다고 받아들임${v.recent ? '(며칠 전에도 일이 바뀌어 살짝 지친 티를 냄)' : ''}`;
    return `${key}·${id}: ${note}`;
  });
}

function talkNotes(s: GameState, e: Employee, key: string): string[] {
  const hot = hasTrait(e, 'hothead');
  const scolded = e.dmDay?.['talk-scold'];
  const recent = scolded !== undefined && s.day - scolded <= T.fx.apologyDays;
  const sick = isSick(s, e);
  return [
    // 병가 중이면 근황·칭찬·분발·휴식 효과가 없음(dmAction과 같음)
    ...DM_ACTIONS.map((a) => `${key}${a.id}: ${sick ? '아파서 집에서 쉬는 중이라 짧게 답함' : dmReaction(s, e, a.id).note}`),
    `${key}scold: ${hot ? '발끈하며 서운함을 드러냄' : '기분이 상해 시무룩해지지만 받아들임'}`,
    `${key}insult: 크게 불쾌해하고 상처받음${hot ? '(참지 않고 맞받아침)' : '(선을 그음)'}`,
    `${key}apology: ${recent ? '사과를 받아 주지만 마음이 다 풀리진 않음' : '괜찮다며 사과를 가볍게 받아 줌'}`,
  ];
}

const schemaBase = {
  understanding: { type: 'string', description: '대표 말의 뜻 한 줄' },
  intent: { type: 'string', enum: INTENT_IDS },
  tone: { type: 'integer', description: '-2(욕설·모욕) ~ 2(아주 따뜻함)' },
};
const REACTION = { type: 'string', description: '답장이 따를 [반응 표] 줄을 키까지 그대로 옮겨 적음(여러 줄이면 " / "로). 해당 줄이 없으면 "없음"' };

// DM: 대표와 직원 한 명의 대화
export function planDm(s: GameState, empId: string, said: string): DmPlan | null {
  const e = s.employees.find((x) => x.id === empId);
  if (!e) return null;
  const verdicts = teamVerdicts(s, [e.dept], said);
  const others = DATA.orders.orders.filter((o) => o.dept !== e.dept && depts(s).includes(o.dept as DeptId));
  const user = [
    `[지금] ${when(s)}`,
    companyBlock(s),
    `[대화 상대] ${person(s, e)}`,
    `[맡을 수 있는 일]\n${ordersBlock(s, [e.dept])}${others.length ? `\n다른 팀 일(이 사람에게 맡기면 자기 팀 일이 아니라고 함): ${others.map((o) => `${o.id} ${o.name}`).join(', ')}` : ''}`,
    `[반응 표] 대표의 말을 이 뜻으로 읽었다면 ${e.name}은(는) 이렇게 반응한다. 게임 규칙이라 답장은 반드시 이 반응을 따른다.\n${[
      ...talkNotes(s, e, ''),
      ...selfOrderNotes(s, e, 'order·self'),
      ...teamNotes(s, [e.dept], verdicts, 'order·team'),
      ...(others.length ? ['order·self·다른 팀 일(order에는 그 일의 id를 적음): 자기 팀 일이 아니라서 못 맡는다고 함(업무 그대로)'] : []),
    ].join('\n')}\n그 밖의 뜻: 표 없음(성격·기분대로 자연스럽게)`,
    `[최근 대화] (위가 먼저)\n${history(s, `dm-${e.id}`, said)}`,
    `[대표의 메시지]\n${said.trim().slice(0, T.fx.maxLen)}`,
  ].join('\n\n');
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['understanding', 'intent', 'tone', 'order', 'scope', 'reaction', 'reply'],
    properties: {
      ...schemaBase,
      order: {
        type: 'string',
        enum: [...DATA.orders.orders.map((o) => o.id), 'team', 'none'],
        description: 'intent가 order일 때 맡길 일의 id(다른 팀 일이어도 그 일의 id). team은 따로 하던 일을 그만두고 "팀 일로 돌아가라"는 말일 때만. order가 아니면 none',
      },
      scope: { type: 'string', enum: ['self', 'team'], description: 'order일 때 이 사람만(self) 또는 팀 전체(team)' },
      reaction: REACTION,
      reply: { type: 'string', description: `${e.name}이(가) 보낼 답장(reaction대로)` },
    },
  };
  return { empId, verdicts, req: { system: SYSTEM, user, schema, maxTokens: 350 } };
}

// 팀·전체 채널
export function planChannel(s: GameState, chId: string, said: string): ChannelPlan | null {
  const ch = getChannel(s, chId);
  const members = channelMembers(s, chId);
  if (!ch || !members.length) return null;
  // 답에 쓰는 이름(같은 이름이 있으면 팀 이름을 붙임)
  const label = (e: Employee) => (members.filter((x) => x.name === e.name).length > 1 ? `${e.name}(${dept(e.dept).name})` : e.name);
  const ids = Object.fromEntries(members.map((e) => [label(e), e.id]));
  const ds = ch.kind === 'team' && ch.dept ? [ch.dept] : depts(s).filter((d) => members.some((e) => e.dept === d));
  const verdicts = teamVerdicts(s, ds, said);
  // 자세한 소개는 이름이 나온 사람·팀장·나머지 순으로 최대 10명
  const named = namedIn(members, said).map((n) => n.e);
  const detail = [...new Set([...named, ...members.filter((e) => e.lead), ...members])].slice(0, 10);
  const rest = members.filter((e) => !detail.includes(e));
  // 한 사람에게 한 말의 반응 줄: 이름이 나온 사람, 방금 말한 사람(맞장구·막말의 상대일 수 있음), 팀장 순으로 최대 4명
  const lastNpc = [...(ch.messages ?? [])].reverse().find((m) => m.kind === 'npc');
  const lastSpeaker = members.find((e) => e.name === lastNpc?.from);
  const close = [...new Set([...named, ...(lastSpeaker ? [lastSpeaker] : []), ...members.filter((e) => e.lead)])].slice(0, 4);
  const g = T.group;
  const cooled = (key: string, days: number) => members.filter((e) => e.dmDay?.[key] !== undefined && s.day - e.dmDay[key]! < days).length > members.length / 2;
  const tired = members.filter((e) => moodOf(s, e) === 'bad').length > members.length / 2;
  const scolded = members.some((e) => e.dmDay?.['talk-scold'] !== undefined && s.day - e.dmDay['talk-scold']! <= T.fx.apologyDays);
  const reactions = [
    `모두·praise: ${cooled('praise', g.praiseCool) ? '최근에 이미 칭찬을 들어 다들 덤덤함' : '다들 기뻐함'}`,
    `모두·push: ${tired ? '다들 지쳐 있어 반응이 싸늘함' : '알겠다며 힘내 보겠다고 함(조금 부담스러워함)'}`,
    `모두·rest: ${cooled('rest', g.restCool) ? '지난번에 쉬어서 괜찮다고 함' : '다들 고마워함'}`,
    '모두·scold: 분위기가 가라앉고 다들 위축됨',
    '모두·insult: 다들 크게 불쾌해하고 분위기가 얼어붙음',
    `모두·apology: ${scolded ? '사과를 받아들이지만 분위기가 아직 어색함' : '괜찮다며 가볍게 받아 줌'}`,
    ...teamNotes(s, ds, verdicts, '팀일'),
    ...close.flatMap((e) => talkNotes(s, e, `${label(e)}·`)),
    ...named.flatMap((e) => selfOrderNotes(s, e, `${label(e)}·맡김`)),
  ];
  const where = ch.kind === 'all' ? '#전체(회사 전체 채널)' : ch.kind === 'team' ? `#${ch.name}(${ch.name} 채널)` : `${ch.name}(그룹 대화)`;
  const user = [
    `[지금] ${when(s)}`,
    companyBlock(s),
    `[채널] ${where}`,
    `[사람들]\n${detail.map((e) => `- ${label(e)}: ${person(s, e).replace(`${e.name} — `, '')}`).join('\n')}${rest.length ? `\n그 밖에: ${rest.map((e) => `${label(e)}(${dept(e.dept).name}팀)`).join(', ')}` : ''}`,
    `[맡을 수 있는 일]\n${ordersBlock(s, ds)}`,
    `[반응 표] 대표의 말을 이 뜻으로 읽었다면 이렇게 반응한다. 게임 규칙이라 답장은 반드시 이 반응을 따른다.\n${reactions.join('\n')}\n그 밖의 뜻: 표 없음(성격·기분대로 자연스럽게)`,
    `[최근 대화] (위가 먼저)\n${history(s, chId, said)}`,
    `[대표의 메시지]\n${said.trim().slice(0, T.fx.maxLen)}`,
  ].join('\n\n');
  const names = Object.keys(ids);
  const orderIds = DATA.orders.orders.filter((o) => ds.includes(o.dept as DeptId)).map((o) => o.id);
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['understanding', 'intent', 'tone', 'addressed', 'team_orders', 'everyone', 'assigns', 'reaction', 'replies'],
    properties: {
      ...schemaBase,
      addressed: { type: 'string', enum: [...names, 'none'] },
      team_orders: { type: 'array', items: { type: 'string', enum: orderIds } },
      everyone: { type: 'boolean' },
      assigns: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['person', 'order'], properties: { person: { type: 'string', enum: names }, order: { type: 'string', enum: [...orderIds, 'team'] } } },
      },
      reaction: REACTION,
      replies: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['from', 'text'], properties: { from: { type: 'string', enum: names }, text: { type: 'string' } } },
      },
    },
  };
  return { chId, verdicts, ids, req: { system: SYSTEM + SYSTEM_CHANNEL, user, schema, maxTokens: 500 } };
}

// ── 답 읽기 ──
function json(content: string): Record<string, unknown> | null {
  const t = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  for (const x of [t, t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)]) {
    try {
      const j = JSON.parse(x);
      if (j && typeof j === 'object' && !Array.isArray(j)) return j as Record<string, unknown>;
    } catch {
      /* 다음 방법 */
    }
  }
  return null;
}

const toneOf = (v: unknown) => (typeof v === 'number' && isFinite(v) ? Math.max(-2, Math.min(2, Math.round(v))) : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const list = (v: unknown) => (Array.isArray(v) ? v : []);

export function parseDm(plan: DmPlan, content: string): TalkRead | null {
  const j = json(content);
  const intent = str(j?.intent);
  if (!j || !intent || !INTENT_IDS.includes(intent)) return null;
  const order = str(j.order);
  return {
    intent,
    order: intent === 'order' && order && (order === 'team' || orderDef(order)) ? order : null,
    tone: toneOf(j.tone),
    topic: null,
    scope: j.scope === 'team' ? 'team' : 'self',
    reply: str(j.reply) ?? null,
    verdicts: plan.verdicts,
    gist: [str(j.understanding), str(j.reaction)].filter(Boolean).join(" → 반응 "),
  };
}

export function parseChannel(plan: ChannelPlan, content: string): ChannelRead | null {
  const j = json(content);
  const intent = str(j?.intent);
  if (!j || !intent || !INTENT_IDS.includes(intent)) return null;
  const id = (v: unknown) => (typeof v === 'string' ? plan.ids[v] ?? null : null);
  const ordering = intent === 'order';
  const assigns: Record<string, string> = {};
  for (const a of list(j.assigns) as { person?: unknown; order?: unknown }[]) {
    const p = id(a?.person);
    const o = str(a?.order);
    if (ordering && p && o && (o === 'team' || orderDef(o))) assigns[p] = o;
  }
  return {
    intent,
    tone: toneOf(j.tone),
    topic: null,
    teamOrders: ordering ? list(j.team_orders).filter((o): o is string => typeof o === 'string' && !!orderDef(o)) : [],
    everyone: j.everyone === true,
    speaker: id(j.addressed),
    assigns,
    replies: (list(j.replies) as { from?: unknown; text?: unknown }[]).map((r) => ({ from: id(r?.from) ?? '', text: str(r?.text) ?? '' })).filter((r) => r.from && r.text),
    verdicts: plan.verdicts,
    gist: [str(j.understanding), str(j.reaction)].filter(Boolean).join(" → 반응 "),
  };
}
