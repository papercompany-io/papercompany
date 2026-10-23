// 직원 반응(A-94): 대표의 지시·DM에 무조건 순응하지 않고, 직원 상태(만족·건강·월급·특성)와 회사 상황(런웨이·근무 방침·잦은 지시 변경)을
// 따져 다양한 말로 답합니다. 팀 지시는 반김·수락·마지못해(만족 조금 하락)·거절(지시 안 바뀜, 같은 지시를 다시 누르면 강행 = 만족 크게 하락) 중 하나.
// DM은 근황 묻기·칭찬·분발 부탁·쉬라고 하기. 같은 말을 자주 하면 효과가 줄어듭니다.
import { dept, orderDef } from './data';
import { deptMembers } from './employees';
import { runwayMonths } from './finance';
import { post, teamChannelId } from './messenger';
import { notify } from './notify';
import { pick, rand } from './rng';
import { hasTrait, isSick, marketSalary, satTarget } from './staff';
import type { DeptId, Employee, GameState } from './types';

const ME = '나(대표)';

type Why = 'recent' | 'tired' | 'crunch' | 'lowSat' | 'underpaid' | 'runway' | 'aiSkeptic' | 'leaving';

// 한 사람이 지금 대표 말을 따를 마음(0~100)과, 가장 큰 불만 이유
function willingness(s: GameState, e: Employee, ctx: { recentDays: number | null; aiOrder: boolean }): { score: number; why: Why | null } {
  const minus: [Why, number][] = [];
  let v = e.sat * 0.55 + e.health * 0.25 + 22;
  if (s.company.workPolicy === 'crunch') minus.push(['crunch', hasTrait(e, 'principled') ? 20 : 10]);
  if (e.health < 45) minus.push(['tired', (45 - e.health) * 0.5]);
  if (e.sat < 45) minus.push(['lowSat', (45 - e.sat) * 0.4]);
  const pay = e.salary / marketSalary(s, e.dept, e.grade);
  if (pay < 0.92) minus.push(['underpaid', (0.92 - pay) * 60]);
  const rw = runwayMonths(s);
  if (rw !== null && rw < 3) minus.push(['runway', (3 - rw) * 4]);
  if (ctx.recentDays !== null && ctx.recentDays < 7) minus.push(['recent', ctx.recentDays < 3 ? 16 : 8]);
  if (ctx.aiOrder && hasTrait(e, 'ai_skeptic')) minus.push(['aiSkeptic', 14]);
  if (e.leaving !== null) minus.push(['leaving', 25]);
  for (const [, m] of minus) v -= m;
  if (hasTrait(e, 'loyal')) v += 10;
  if (hasTrait(e, 'steady')) v += 5;
  if (hasTrait(e, 'hothead')) v -= 8;
  if (e.lead) v += 4;
  minus.sort((a, b) => b[1] - a[1]);
  return { score: Math.max(0, Math.min(100, v)), why: minus[0] && minus[0][1] >= 5 ? minus[0][0] : null };
}

const WHY_LINES: Record<Why, string[]> = {
  recent: ['지난번에 바꾼 지 며칠 안 됐는데 또 바뀌나요?', '방향이 너무 자주 바뀌어서 팀이 헷갈려합니다.', '이제 막 손에 익었는데요…'],
  tired: ['다들 많이 지쳐 있어요.', '요즘 컨디션이 좋지 않은 사람이 많습니다.', '체력이 바닥이라 새 일을 받기가 버겁네요.'],
  crunch: ['야근이 계속돼서 팀이 버티기 힘들어요.', '지금 근무 강도로는 더 맡기 어렵습니다.', '야근부터 좀 줄여 주시면 좋겠어요.'],
  lowSat: ['솔직히 팀 분위기가 좋지 않습니다.', '요즘 다들 의욕이 많이 떨어져 있어요.', '일보다 먼저 이야기를 좀 나눠야 할 것 같아요.'],
  underpaid: ['처우 이야기도 한번 해 주셨으면 합니다.', '시장 월급보다 낮다는 이야기가 팀에서 계속 나와요.', '일은 늘어나는데 대우는 그대로라는 불만이 있어요.'],
  runway: ['회사 자금 사정 때문에 다들 불안해해요.', '월급날이 걱정된다는 사람이 많습니다.', '런웨이 이야기가 돌아서 집중이 잘 안 되네요.'],
  aiSkeptic: ['AI 쪽 일은 솔직히 회의적입니다.', 'AI에 힘을 싣는 게 맞는지 잘 모르겠어요.'],
  leaving: ['…저는 곧 떠날 사람이라 크게 의견은 없습니다.', '인수인계 위주로 하겠습니다.'],
};

// LLM에게 넘기는 불만 이유(A-199, 숫자 없이)
export const WHY_NOTE: Record<Why, string> = {
  recent: '지시가 너무 자주 바뀌어 팀이 헷갈려함',
  tired: '팀원들이 많이 지쳐 있음',
  crunch: '야근이 계속돼 버티기 힘듦',
  lowSat: '팀 분위기와 의욕이 떨어져 있음',
  underpaid: '처우(월급)에 불만이 있음',
  runway: '회사 자금 사정 때문에 불안해함',
  aiSkeptic: 'AI 쪽 일에 회의적임',
  leaving: '말하는 사람이 곧 퇴사함',
};

// ── 팀 지시 ──
// 팀 지시 판정(A-199): 효과를 내기 전에 팀이 어떻게 답할지 정합니다(부작용 없음).
// 버튼은 바로 판정하고, 채팅은 LLM이 답을 쓰기 전에 미리 판정해 두었다가 같은 판정으로 효과를 냅니다.
export type OrderKind = 'same' | 'empty' | 'insist' | 'happy' | 'ok' | 'reluctant' | 'refuse';
export interface OrderVerdict {
  order: string;
  kind: OrderKind;
  speaker: string | null; // 팀에서 답하는 사람(직원 id)
  why: Why | null;
}

// noise = 그날 팀 분위기 흔들림(-8~8). speaker가 없으면 팀장, 없으면 첫 팀원
export function orderVerdict(s: GameState, d: DeptId, orderId: string, noise: number, speaker?: Employee): OrderVerdict {
  const v = (kind: OrderKind, sp: Employee | null = null, why: Why | null = null): OrderVerdict => ({ order: orderId, kind, speaker: sp?.id ?? null, why });
  if (s.company.orders[d] === orderId) return v('same');
  const team = deptMembers(s, d).filter((e) => !isSick(s, e));
  if (!team.length) return v('empty');
  const sp = speaker ?? team.find((e) => e.lead) ?? team[0];
  // 거절당한 같은 지시를 이틀 안에 다시 내리면 강행
  const pb = s.company.orderPushback;
  if (pb && pb.dept === d && pb.order === orderId && s.day - pb.day <= 2) return v('insist', sp);
  const last = s.company.orderDay?.[d];
  const ctx = { recentDays: last === undefined ? null : s.day - last, aiOrder: d === 'ai' || orderId === 'ai_tools' };
  const rs = team.map((e) => willingness(s, e, ctx));
  const avg = rs.reduce((a, r) => a + r.score, 0) / rs.length + noise;
  // 이유는 팀 전체에서 가장 많이 나온 불만(없으면 말하는 사람 것)
  const count = new Map<Why, number>();
  for (const r of rs) if (r.why) count.set(r.why, (count.get(r.why) ?? 0) + 1);
  const why = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? willingness(s, sp, ctx).why;
  return v(avg >= 74 ? 'happy' : avg >= 55 ? 'ok' : avg >= 38 ? 'reluctant' : 'refuse', sp, why);
}

// 반환: null = 지시가 바뀜(답은 팀 채널에), 문자열 = 바뀌지 않은 이유(UI에 표시)
// said = false: 대표가 채팅으로 직접 말해 이미 올라가 있으면 "[지시]" 말을 다시 올리지 않음(A-147)
// pre = 미리 해 둔 판정(채팅, A-199). quiet = 팀장 답을 올리지 않음(LLM이 쓴 답을 대신 올릴 때)
export function commandOrder(s: GameState, d: DeptId, orderId: string, said = true, pre?: OrderVerdict, quiet = false): string | null {
  const o = orderDef(orderId);
  if (!o || o.dept !== d) return '이 부서의 지시가 아닙니다.';
  if (s.company.stage < o.stage) return `회사 단계 ${o.stage}부터 내릴 수 있는 지시입니다.`;
  if (s.company.orders[d] === orderId) return null;
  const ch = teamChannelId(d);
  const team = deptMembers(s, d).filter((e) => !isSick(s, e));
  const apply = () => {
    s.company.orders[d] = orderId;
    (s.company.orderDay ??= {})[d] = s.day;
    s.company.orderPushback = null;
  };
  // 말하는 사람: 팀장, 없으면 팀원 중 하나
  const speaker = (pre?.speaker ? team.find((e) => e.id === pre.speaker) : undefined) ?? team.find((e) => e.lead) ?? (team.length ? pick(s, team) : undefined);
  const pb = s.company.orderPushback;
  const insist = pre ? pre.kind === 'insist' : !!pb && pb.dept === d && pb.order === orderId && s.day - pb.day <= 2;
  if (said) post(s, ch, ME, insist ? `[지시] 다시 말하지만 "${o.name}"로 갑니다. 이번엔 꼭 부탁해요.` : `[지시] 앞으로 "${o.name}"에 집중해 주세요. ${o.desc}`, 'player');
  if (!speaker) {
    apply();
    return null;
  }
  const say = (t: string) => !quiet && post(s, ch, speaker.name, t, 'npc');
  if (insist) {
    apply();
    for (const e of team) e.sat = Math.max(0, e.sat - (hasTrait(e, 'hothead') ? 7 : 4));
    say(hasTrait(speaker, 'hothead') ? pick(s, ['…정 그러시다면요. 결과는 장담 못 합니다.', '알겠습니다. 다만 이 결정은 기억해 두겠습니다.']) : pick(s, ['…알겠습니다. 해 보겠습니다.', '네, 대표님 뜻이 그렇다면 따르겠습니다.', '알겠습니다. 팀에는 제가 잘 이야기해 볼게요.']));
    return null;
  }
  const v = pre && pre.kind !== 'same' && pre.kind !== 'empty' ? pre : orderVerdict(s, d, orderId, (rand(s) - 0.5) * 16, speaker);
  const reason = v.why ? pick(s, WHY_LINES[v.why]) : '';
  if (v.kind === 'happy') {
    apply();
    const lines = hasTrait(speaker, 'ambitious')
      ? ['좋습니다! 제가 앞장서 보겠습니다.', '기다리던 일이에요. 바로 시작하죠!']
      : hasTrait(speaker, 'social')
        ? ['좋아요! 팀에도 바로 공유할게요.', '다들 좋아할 것 같아요. 바로 갑니다!']
        : ['좋습니다! 마침 그쪽이 필요하다고 생각했어요.', '네! 바로 옮기겠습니다.', '좋아요, 오늘부터 집중하겠습니다.'];
    say(pick(s, lines));
  } else if (v.kind === 'ok') {
    apply();
    say(pick(s, ['네, 알겠습니다.', '알겠습니다. 그쪽으로 옮길게요.', '확인했습니다. 진행하겠습니다.']));
  } else if (v.kind === 'reluctant') {
    apply();
    for (const e of team) e.sat = Math.max(0, e.sat - 1);
    say(`${reason ? `${reason} ` : ''}${pick(s, ['그래도 일단 해 보겠습니다.', '…알겠습니다, 따르겠습니다.', '네, 하라면 해야죠.'])}`);
  } else {
    s.company.orderPushback = { dept: d, order: orderId, day: s.day };
    say(`${reason || '지금은 어렵습니다.'} ${pick(s, ['당분간은 지금 하던 일을 계속하면 안 될까요?', '지금 바꾸는 건 무리라고 봅니다.', '조금만 시간을 주세요.'])}`);
    const msg = `${dept(d).name}팀이 "${o.name}" 지시를 거절했습니다. 같은 지시를 다시 내리면 강행합니다(팀 만족도가 떨어짐).`;
    notify(s, msg, 'bad', 'messenger', ch);
    return msg;
  }
  return null;
}

// ── DM ──
export type DmAction = 'checkin' | 'praise' | 'push' | 'rest';

export const DM_ACTIONS: { id: DmAction; label: string; say: string; cool: number }[] = [
  { id: 'checkin', label: '근황 묻기', say: '요즘 어때요? 힘든 건 없어요?', cool: 3 },
  { id: 'praise', label: '칭찬하기', say: '요즘 정말 잘해 주고 있어요. 고마워요.', cool: 7 },
  { id: 'push', label: '분발 부탁', say: '요즘 중요한 시기라 조금만 더 힘내 줄 수 있을까요?', cool: 5 },
  { id: 'rest', label: '쉬라고 하기', say: '무리하지 말고 좀 쉬어요. 건강이 먼저예요.', cool: 10 },
];

// 근황: 만족도 이유 중 가장 나쁜 것을 털어놓음. note = LLM에게 넘기는 설명(A-199)
function worstGripe(s: GameState, e: Employee): { line: string; note: string } | null {
  const parts = satTarget(s, e).parts.filter((p) => p.v < -2).sort((a, b) => a.v - b.v);
  const p = parts[0];
  if (!p) return null;
  if (p.label.startsWith('월급')) return { line: '솔직히 월급이 시장보다 낮아서 고민이 좀 됩니다.', note: '월급이 시장보다 낮아 고민이라고 털어놓음' };
  if (p.label.includes('근무') || p.label.includes('야근')) return { line: '근무 시간이 길어서 좀 버겁습니다.', note: '근무 시간이 길어 버겁다고 털어놓음' };
  if (p.label.includes('AI')) return { line: 'AI 도입 방향이 저랑은 잘 안 맞는 것 같아요.', note: '회사의 AI 도입 방향이 자기와 안 맞는다고 털어놓음' };
  return { line: `${p.label} 쪽이 좀 아쉽습니다.`, note: `${p.label} 쪽이 아쉽다고 털어놓음` };
}

// DM 행동에 이 직원이 어떻게 반응할지(A-94). 부작용 없음(A-199): 버튼 답, 자유 입력 LLM 답의 근거(note), 효과가 같은 판정을 씁니다.
// lines = 대사 묶음 후보, note = LLM에게 넘기는 반응 설명(숫자 없음), sat·health = 바뀌는 양
export interface DmReaction {
  again: boolean;
  lines: string[];
  note: string;
  sat: number;
  health: number;
}

export function dmReaction(s: GameState, e: Employee, action: DmAction): DmReaction {
  const def = DM_ACTIONS.find((a) => a.id === action)!;
  const last = e.dmDay?.[action];
  const again = last !== undefined && s.day - last < def.cool;
  const r = (lines: string[], note: string, sat = 0, health = 0): DmReaction => ({ again, lines, note, sat, health });
  const pay = e.salary / marketSalary(s, e.dept, e.grade);
  const rw = runwayMonths(s);

  if (action === 'checkin') {
    const up = again ? 0 : 1;
    if (e.leaving !== null) return r(['…사실 이직을 준비하고 있습니다. 미리 말씀 못 드려 죄송해요.', '이미 마음이 정해졌습니다. 남은 기간 인수인계는 확실히 할게요.'], '이미 이직을 준비 중이라고 털어놓음(마음이 정해짐)', up);
    if (again) return r(['어제도 물어보셨잖아요 ㅎㅎ 별일 없어요.', '아까랑 똑같아요. 신경 써 주셔서 감사해요.'], '최근에도 같은 걸 물어봐서 별일 없다고 가볍게 답함');
    if (e.health < 40) return r(['요즘 좀 피곤해요. 잠을 제대로 못 자고 있어요.', '체력이 많이 떨어졌어요. 쉬고 싶다는 생각이 자주 들어요.'], '요즘 많이 피곤하고 잠을 잘 못 잔다고 말함', up);
    if (e.sat < 50) {
      const g = worstGripe(s, e);
      return r(g ? [g.line] : ['요즘은 그냥… 의욕이 좀 안 나네요.', '딱히 뭐라 말하긴 어려운데 힘이 좀 빠져요.'], g?.note ?? '요즘 의욕이 좀 없다고 말함', up);
    }
    if (rw !== null && rw < 3) return r(['저는 괜찮은데, 회사 자금 사정이 좀 걱정돼요.', '다음 투자는 잘 되고 있나요? 팀에서 걱정들 하더라고요.'], '자기는 괜찮지만 회사 자금 사정이 걱정된다고 말함', up);
    if (e.sat >= 75)
      return hasTrait(e, 'ambitious') ? r(['재밌어요! 더 큰 일도 맡아 보고 싶어요.'], '일이 재밌고 더 큰 일을 맡아 보고 싶다고 함', up) : r(['요즘 일이 재밌어요. 팀 분위기도 좋고요.', '잘 지내요! 배우는 게 많아서 좋습니다.'], '요즘 일이 재밌고 팀 분위기도 좋다고 함', up);
    return r(['그럭저럭 괜찮아요. 하던 대로 하고 있습니다.', '무난합니다. 특별히 힘든 건 없어요.'], '그럭저럭 무난하다고 답함', up);
  }
  if (action === 'praise') {
    if (again) return r(['감사합니다… 근데 아까도 하셨어요 ㅎㅎ', '말씀은 감사한데, 자주 들으니 좀 덜 와닿네요.'], '최근에 이미 칭찬을 들어서 고맙지만 덜 와닿아 함');
    if (pay < 0.9) return r(['감사합니다. 다만 말보다 처우로 보여 주시면 더 좋겠어요.', '고맙습니다. …연봉 이야기도 한번 해 주셨으면 해요.'], '고맙지만 말보다 처우(연봉)로 보여 주면 좋겠다고 함', 1);
    if (hasTrait(e, 'perceptive')) return r(['감사합니다! 혹시 뭔가 부탁하실 일이 있으신 거죠? ㅎㅎ'], '기뻐하면서도 혹시 부탁할 일이 있는지 눈치챔', 4);
    if (hasTrait(e, 'social')) return r(['와, 감사해요! 팀에도 자랑해야겠어요.'], '아주 기뻐하며 팀에도 자랑하겠다고 함', 4);
    return r(['감사합니다! 더 열심히 하겠습니다.', '그렇게 말씀해 주시니 힘이 나네요.'], '기뻐하며 힘이 난다고 함', 4);
  }
  if (action === 'push') {
    if (hasTrait(e, 'workaholic') && e.health >= 40) return r(['맡겨 주세요! 오늘 밤새서라도 끝내 보겠습니다.', '좋아요, 저 원래 이럴 때 힘이 납니다.'], '의욕이 넘쳐 밤새서라도 하겠다고 함', 0, -4);
    if (e.sat >= 65 && e.health >= 60 && !again) return r(['알겠습니다. 조금 더 속도를 내 볼게요.', '네, 중요한 시기라는 거 알아요. 힘내 보겠습니다.'], '중요한 시기인 걸 알고 속도를 더 내겠다고 함', -1, -2);
    if (hasTrait(e, 'hothead')) return r(['지금도 최선을 다하고 있는데요. 뭘 더 하라는 건지 모르겠네요.', '그런 말은 좀 서운합니다.'], '지금도 최선이라며 서운해하고 발끈함', -7);
    if (hasTrait(e, 'principled') && s.company.workPolicy === 'crunch') return r(['지금 근무 강도로는 더는 어렵습니다. 원칙적으로 무리라고 생각해요.'], '지금 근무 강도로는 원칙적으로 더 못 한다고 선을 그음', -5);
    if (e.health < 45) return r(['…솔직히 지금도 한계예요. 몸이 좀 버티질 못하네요.', '노력은 해 볼게요. 다만 체력이 많이 떨어졌어요.'], '지금도 한계라며 몸이 버티지 못한다고 함', -4);
    if (again) return r(['며칠 전에도 말씀하셨잖아요. 저도 나름 열심히 하고 있습니다.'], '며칠 전에도 들은 말이라 서운해하며 나름 열심히 하고 있다고 함', -4);
    return r(['…알겠습니다. 노력해 볼게요.', '네, 해 보겠습니다. 다만 저도 좀 지쳐 있긴 해요.'], '마지못해 노력해 보겠다고 함(자기도 지쳐 있음)', -4);
  }
  if (hasTrait(e, 'workaholic') && e.health >= 40) return r(['괜찮아요! 일하는 게 오히려 편해요.', '쉬면 더 불안해서요. 마저 하겠습니다.'], '일하는 게 오히려 편하다며 쉬지 않겠다고 함');
  if (again) return r(['지난번에 쉬라고 해 주셔서 괜찮아요. 감사합니다.'], '지난번에 쉬어서 괜찮다고 고마워함');
  return e.health < 50
    ? r(['정말요? 감사합니다… 오늘은 일찍 들어가서 푹 쉴게요.', '안 그래도 힘들었는데 감사합니다. 충전하고 올게요!'], '안 그래도 힘들었다며 고마워하고 일찍 들어가 푹 쉬겠다고 함', 2, 10)
    : r(['감사합니다! 그래도 할 일은 마무리하고 쉴게요.', '배려해 주셔서 감사해요.'], '고마워하며 하던 일은 마무리하고 쉬겠다고 함', 2, 10);
}

const SICK_DM = ['(병가 중) …죄송해요, 몸이 안 좋아서 나중에 답할게요.', '(병가 중) 감사합니다. 빨리 나아서 돌아갈게요.'];

// DM 행동의 효과를 내고(재사용 대기 기록 포함) 판정을 돌려줌. 병가 중이면 효과 없이 null
export function applyDm(s: GameState, e: Employee, action: DmAction): DmReaction | null {
  const r = dmReaction(s, e, action);
  (e.dmDay ??= {})[action] = s.day;
  if (isSick(s, e)) return null;
  e.sat = Math.max(0, Math.min(100, e.sat + r.sat));
  e.health = Math.max(0, Math.min(100, e.health + r.health));
  return r;
}

// 자유 입력 DM(A-139): said = 대표가 직접 쓴 말(없으면 기본 문장, null이면 이미 올라가 있어 다시 올리지 않음). 효과·재사용 대기는 버튼과 같습니다
// channelId: 팀·전체 채널에서 공개로 말한 경우 그 채널에 답함(A-147). 효과·재사용 대기는 DM과 같음
// reply: LLM이 쓴 답(A-199). 있으면 대사 묶음 대신 그 말을 올림
export function dmAction(s: GameState, empId: string, action: DmAction, said?: string | null, channelId?: string, reply?: string | null): string | null {
  const e = s.employees.find((x) => x.id === empId);
  if (!e) return '직원을 찾을 수 없습니다.';
  const def = DM_ACTIONS.find((a) => a.id === action)!;
  const ch = channelId ?? `dm-${e.id}`;
  if (said !== null) post(s, ch, ME, said ?? def.say, 'player');
  const r = applyDm(s, e, action);
  const lines = r?.lines ?? SICK_DM;
  post(s, ch, e.name, reply ?? (lines.length === 1 ? lines[0] : pick(s, lines)), 'npc');
  return null;
}
