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

// ── 팀 지시 ──
// 반환: null = 지시가 바뀜(답은 팀 채널에), 문자열 = 바뀌지 않은 이유(UI에 표시)
export function commandOrder(s: GameState, d: DeptId, orderId: string): string | null {
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
  // 거절당한 같은 지시를 이틀 안에 다시 내리면 강행
  const pb = s.company.orderPushback;
  const insist = !!pb && pb.dept === d && pb.order === orderId && s.day - pb.day <= 2;
  post(s, ch, ME, insist ? `[지시] 다시 말하지만 "${o.name}"로 갑니다. 이번엔 꼭 부탁해요.` : `[지시] 앞으로 "${o.name}"에 집중해 주세요. ${o.desc}`, 'player');
  if (!team.length) {
    apply();
    return null;
  }
  // 말하는 사람: 팀장, 없으면 팀원 중 하나
  const speaker = team.find((e) => e.lead) ?? pick(s, team);
  if (insist) {
    apply();
    for (const e of team) e.sat = Math.max(0, e.sat - (hasTrait(e, 'hothead') ? 7 : 4));
    post(s, ch, speaker.name, hasTrait(speaker, 'hothead') ? pick(s, ['…정 그러시다면요. 결과는 장담 못 합니다.', '알겠습니다. 다만 이 결정은 기억해 두겠습니다.']) : pick(s, ['…알겠습니다. 해 보겠습니다.', '네, 대표님 뜻이 그렇다면 따르겠습니다.', '알겠습니다. 팀에는 제가 잘 이야기해 볼게요.']), 'npc');
    return null;
  }
  const last = s.company.orderDay?.[d];
  const ctx = { recentDays: last === undefined ? null : s.day - last, aiOrder: d === 'ai' || orderId === 'ai_tools' };
  const rs = team.map((e) => willingness(s, e, ctx));
  const avg = rs.reduce((a, r) => a + r.score, 0) / rs.length + (rand(s) - 0.5) * 16;
  const mine = willingness(s, speaker, ctx);
  // 이유는 팀 전체에서 가장 많이 나온 불만(없으면 말하는 사람 것)
  const count = new Map<Why, number>();
  for (const r of rs) if (r.why) count.set(r.why, (count.get(r.why) ?? 0) + 1);
  const why = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? mine.why;
  const reason = why ? pick(s, WHY_LINES[why]) : '';
  if (avg >= 74) {
    apply();
    const lines = hasTrait(speaker, 'ambitious')
      ? ['좋습니다! 제가 앞장서 보겠습니다.', '기다리던 일이에요. 바로 시작하죠!']
      : hasTrait(speaker, 'social')
        ? ['좋아요! 팀에도 바로 공유할게요.', '다들 좋아할 것 같아요. 바로 갑니다!']
        : ['좋습니다! 마침 그쪽이 필요하다고 생각했어요.', '네! 바로 옮기겠습니다.', '좋아요, 오늘부터 집중하겠습니다.'];
    post(s, ch, speaker.name, pick(s, lines), 'npc');
  } else if (avg >= 55) {
    apply();
    post(s, ch, speaker.name, pick(s, ['네, 알겠습니다.', '알겠습니다. 그쪽으로 옮길게요.', '확인했습니다. 진행하겠습니다.']), 'npc');
  } else if (avg >= 38) {
    apply();
    for (const e of team) e.sat = Math.max(0, e.sat - 1);
    post(s, ch, speaker.name, `${reason ? `${reason} ` : ''}${pick(s, ['그래도 일단 해 보겠습니다.', '…알겠습니다, 따르겠습니다.', '네, 하라면 해야죠.'])}`, 'npc');
  } else {
    s.company.orderPushback = { dept: d, order: orderId, day: s.day };
    post(s, ch, speaker.name, `${reason || '지금은 어렵습니다.'} ${pick(s, ['당분간은 지금 하던 일을 계속하면 안 될까요?', '지금 바꾸는 건 무리라고 봅니다.', '조금만 시간을 주세요.'])}`, 'npc');
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

// 근황: 만족도 이유 중 가장 나쁜 것을 털어놓음
function worstGripe(s: GameState, e: Employee): string | null {
  const parts = satTarget(s, e).parts.filter((p) => p.v < -2).sort((a, b) => a.v - b.v);
  const p = parts[0];
  if (!p) return null;
  if (p.label.startsWith('월급')) return '솔직히 월급이 시장보다 낮아서 고민이 좀 됩니다.';
  if (p.label.includes('근무') || p.label.includes('야근')) return '근무 시간이 길어서 좀 버겁습니다.';
  if (p.label.includes('AI')) return 'AI 도입 방향이 저랑은 잘 안 맞는 것 같아요.';
  return `${p.label} 쪽이 좀 아쉽습니다.`;
}

export function dmAction(s: GameState, empId: string, action: DmAction): string | null {
  const e = s.employees.find((x) => x.id === empId);
  if (!e) return '직원을 찾을 수 없습니다.';
  const def = DM_ACTIONS.find((a) => a.id === action)!;
  const ch = `dm-${e.id}`;
  post(s, ch, ME, def.say, 'player');
  const say = (t: string) => post(s, ch, e.name, t, 'npc');
  const last = e.dmDay?.[action];
  const again = last !== undefined && s.day - last < def.cool;
  (e.dmDay ??= {})[action] = s.day;
  if (isSick(s, e)) {
    say(pick(s, ['(병가 중) …죄송해요, 몸이 안 좋아서 나중에 답할게요.', '(병가 중) 감사합니다. 빨리 나아서 돌아갈게요.']));
    return null;
  }
  const pay = e.salary / marketSalary(s, e.dept, e.grade);
  const rw = runwayMonths(s);

  if (action === 'checkin') {
    if (e.leaving !== null) say(pick(s, ['…사실 이직을 준비하고 있습니다. 미리 말씀 못 드려 죄송해요.', '이미 마음이 정해졌습니다. 남은 기간 인수인계는 확실히 할게요.']));
    else if (again) say(pick(s, ['어제도 물어보셨잖아요 ㅎㅎ 별일 없어요.', '아까랑 똑같아요. 신경 써 주셔서 감사해요.']));
    else if (e.health < 40) say(pick(s, ['요즘 좀 피곤해요. 잠을 제대로 못 자고 있어요.', '체력이 많이 떨어졌어요. 쉬고 싶다는 생각이 자주 들어요.']));
    else if (e.sat < 50) say(worstGripe(s, e) ?? pick(s, ['요즘은 그냥… 의욕이 좀 안 나네요.', '딱히 뭐라 말하긴 어려운데 힘이 좀 빠져요.']));
    else if (rw !== null && rw < 3) say(pick(s, ['저는 괜찮은데, 회사 자금 사정이 좀 걱정돼요.', '다음 투자는 잘 되고 있나요? 팀에서 걱정들 하더라고요.']));
    else if (e.sat >= 75) say(hasTrait(e, 'ambitious') ? '재밌어요! 더 큰 일도 맡아 보고 싶어요.' : pick(s, ['요즘 일이 재밌어요. 팀 분위기도 좋고요.', '잘 지내요! 배우는 게 많아서 좋습니다.']));
    else say(pick(s, ['그럭저럭 괜찮아요. 하던 대로 하고 있습니다.', '무난합니다. 특별히 힘든 건 없어요.']));
    if (!again) e.sat = Math.min(100, e.sat + 1);
  } else if (action === 'praise') {
    if (again) say(pick(s, ['감사합니다… 근데 아까도 하셨어요 ㅎㅎ', '말씀은 감사한데, 자주 들으니 좀 덜 와닿네요.']));
    else if (pay < 0.9) {
      say(pick(s, ['감사합니다. 다만 말보다 처우로 보여 주시면 더 좋겠어요.', '고맙습니다. …연봉 이야기도 한번 해 주셨으면 해요.']));
      e.sat = Math.min(100, e.sat + 1);
    } else {
      say(hasTrait(e, 'perceptive') ? '감사합니다! 혹시 뭔가 부탁하실 일이 있으신 거죠? ㅎㅎ' : hasTrait(e, 'social') ? '와, 감사해요! 팀에도 자랑해야겠어요.' : pick(s, ['감사합니다! 더 열심히 하겠습니다.', '그렇게 말씀해 주시니 힘이 나네요.']));
      e.sat = Math.min(100, e.sat + 4);
    }
  } else if (action === 'push') {
    if (hasTrait(e, 'workaholic') && e.health >= 40) {
      say(pick(s, ['맡겨 주세요! 오늘 밤새서라도 끝내 보겠습니다.', '좋아요, 저 원래 이럴 때 힘이 납니다.']));
      e.health = Math.max(0, e.health - 4);
    } else if (e.sat >= 65 && e.health >= 60 && !again) {
      say(pick(s, ['알겠습니다. 조금 더 속도를 내 볼게요.', '네, 중요한 시기라는 거 알아요. 힘내 보겠습니다.']));
      e.sat = Math.max(0, e.sat - 1);
      e.health = Math.max(0, e.health - 2);
    } else if (hasTrait(e, 'hothead')) {
      say(pick(s, ['지금도 최선을 다하고 있는데요. 뭘 더 하라는 건지 모르겠네요.', '그런 말은 좀 서운합니다.']));
      e.sat = Math.max(0, e.sat - 7);
    } else if (hasTrait(e, 'principled') && s.company.workPolicy === 'crunch') {
      say('지금 근무 강도로는 더는 어렵습니다. 원칙적으로 무리라고 생각해요.');
      e.sat = Math.max(0, e.sat - 5);
    } else {
      say(e.health < 45 ? pick(s, ['…솔직히 지금도 한계예요. 몸이 좀 버티질 못하네요.', '노력은 해 볼게요. 다만 체력이 많이 떨어졌어요.']) : again ? '며칠 전에도 말씀하셨잖아요. 저도 나름 열심히 하고 있습니다.' : pick(s, ['…알겠습니다. 노력해 볼게요.', '네, 해 보겠습니다. 다만 저도 좀 지쳐 있긴 해요.']));
      e.sat = Math.max(0, e.sat - 4);
    }
  } else if (action === 'rest') {
    if (hasTrait(e, 'workaholic') && e.health >= 40) say(pick(s, ['괜찮아요! 일하는 게 오히려 편해요.', '쉬면 더 불안해서요. 마저 하겠습니다.']));
    else if (again) say('지난번에 쉬라고 해 주셔서 괜찮아요. 감사합니다.');
    else {
      say(e.health < 50 ? pick(s, ['정말요? 감사합니다… 오늘은 일찍 들어가서 푹 쉴게요.', '안 그래도 힘들었는데 감사합니다. 충전하고 올게요!']) : pick(s, ['감사합니다! 그래도 할 일은 마무리하고 쉴게요.', '배려해 주셔서 감사해요.']));
      e.health = Math.min(100, e.health + 10);
      e.sat = Math.min(100, e.sat + 2);
    }
  }
  return null;
}
