// 대표 외출(A-101): 대표는 평소 주 업무(개발·외주·영업, 경영 모드는 대기업 영업·결재) 하나만 하고, 투자자 미팅·컨퍼런스·네트워킹·고객사 방문은
// 메신저(외부 연락처)로 오는 초대를 수락해 1~3일 자리를 비우고 합니다. 외출 날은 하루 내내 그 일을 하고(효율·스펙 그대로),
// 끝나는 날 보너스. 투자 라운드 중에는 투자 미팅 초대가 자주 옵니다.
// A-127: 하루짜리 외출은 약속 시각·길이가 있고, 그 시간과 오가는 이동 시간만 자리를 비웁니다(나머지는 주 업무).
// 이동 시간까지 겹치면 같은 날 두 약속을 잡을 수 없고, 기존 일정을 취소하고 새 초대를 받거나 새 초대를 거절합니다.
// A-133: 행사·모임·고객사 방문은 직원을 대신 보낼 수 있습니다. 그러면 대표 일정은 비고(다른 약속 가능), 그 직원이 그 시간 일을 못 합니다.
import { DATA } from './data';
import { ceoWork } from './ceo';
import { dateOf } from './calendar';
import { wonShort } from './format';
import { spendNow } from './finance';
import { openRound } from './funding';
import { nextId } from './ids';
import { ensureExternal, ensureNamedExternal, getChannel, post } from './messenger';
import { notify } from './notify';
import { hasMvp } from './product';
import { pick, rand, randInt, weighted } from './rng';
import { companyOf, inviteWeight } from './contacts';
import type { Employee, GameState, Outing } from './types';

const O = DATA.ceo.outings;
type Tpl = (typeof O.templates)[number] & { internal?: boolean; needsMvp?: boolean; roundChance?: number; hours?: number[]; delegate?: string[]; bonus: { ir?: number; network?: number; pipeline?: number } };
const WORK_START = DATA.time.workStartHour;
const DAY_HOURS = DATA.time.workEndHour - DATA.time.workStartHour;
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export function outingTpl(id: string): Tpl {
  return O.templates.find((t) => t.id === id) as Tpl;
}

export function outings(s: GameState): Outing[] {
  return s.outings ?? [];
}

export function dayName(day: number): string {
  const d = dateOf(day);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEK[d.getUTCDay()]})`;
}

export function hhmm(h: number): string {
  return `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;
}

export function hoursText(h: number): string {
  const whole = Math.floor(h);
  return whole === 0 ? '30분' : `${whole}시간${h % 1 ? ' 30분' : ''}`;
}

// 하루 내내 자리를 비우는 외출인가(여러 날, 또는 시각이 없는 예전 저장)
export function isFullDay(o: Outing): boolean {
  return o.days > 1 || o.startHour === undefined || o.hours === undefined;
}

// 그날 자리를 비우는 시간 [시작, 끝)(시 단위, 이동 포함). 하루 내내면 [0, 24]
export function busyWindow(o: Outing): [number, number] {
  if (isFullDay(o)) return [0, 24];
  const tr = o.travel ?? 0;
  return [o.startHour! - tr, o.startHour! + o.hours! + tr];
}

export function outingRange(o: Outing): string {
  if (o.days > 1) return `${dayName(o.startDay)}~${dayName(o.startDay + o.days - 1)} · ${o.days}일`;
  return isFullDay(o) ? `${dayName(o.startDay)} · 하루` : `${dayName(o.startDay)} ${hhmm(o.startHour!)}~${hhmm(o.startHour! + o.hours!)}`;
}

// 오가는 시간(편도). 하루 내내 외출이면 없음
export function outingTravel(o: Outing): string | null {
  return isFullDay(o) || !o.travel ? null : `이동 편도 ${hoursText(o.travel)}`;
}

function overlaps(a: Outing, b: Outing): boolean {
  if (!(a.startDay < b.startDay + b.days && b.startDay < a.startDay + a.days)) return false;
  const [a0, a1] = busyWindow(a);
  const [b0, b1] = busyWindow(b);
  return a0 < b1 && b0 < a1;
}

// 오늘 잡힌 대표 외출(하루짜리 약속이 여러 개일 수 있음). 직원을 대신 보낸 외출은 빠짐(A-133)
export function todayOutings(s: GameState): Outing[] {
  return outings(s).filter((o) => o.status === 'booked' && !o.delegate && s.day >= o.startDay && s.day < o.startDay + o.days);
}

// 대신 보낼 수 있는 직원(그 초대가 허락하는 부서, 아프거나 나가는 중이 아닌 사람)
export function delegates(s: GameState, o: Outing): Employee[] {
  const depts = outingTpl(o.tpl).delegate ?? [];
  return s.employees.filter((e) => depts.includes(e.dept) && (e.sickUntil === null || e.sickUntil <= s.day) && e.leaving === null);
}

// 이 직원이 오늘 외출로 자리를 비우는 비율(근무 시간 중). 직원 하루 출력에 씀
export function delegateAway(s: GameState, empId: string): number {
  let away = 0;
  for (const o of outings(s)) {
    if (o.status !== 'booked' || (o.delegate !== empId && o.companion !== empId) || s.day < o.startDay || s.day >= o.startDay + o.days) continue; // 미팅에 함께 간 직원도(A-186)
    if (isFullDay(o)) return 1;
    const [a, b] = busyWindow(o);
    away += Math.max(0, Math.min(DATA.time.workEndHour, b) - Math.max(WORK_START, a)) / DAY_HOURS;
  }
  return Math.min(1, away);
}

// 오늘 외출이 있는 날의 첫 일정
export function todayOuting(s: GameState): Outing | null {
  return todayOutings(s)[0] ?? null;
}

// 지금 이 시각에 자리를 비운 외출(이동 중 포함). 사무실의 대표 책상·이름표에 씀
export function awayOuting(s: GameState): Outing | null {
  const hour = WORK_START + (Math.min(1, s.msInDay / DATA.time.dayMs) * DAY_HOURS);
  return todayOutings(s).find((o) => {
    if (o.kind === 'review') return false; // 점검 회의는 사무실 안(A-181)
    const [a, b] = busyWindow(o);
    return hour >= a && hour < b;
  }) ?? null;
}

// who = 갈 사람(없으면 대표). 같은 사람의 일정끼리만 겹침을 봄
export function outingConflicts(s: GameState, o: Outing, who?: string): Outing[] {
  return outings(s).filter((x) => x.id !== o.id && x.status === 'booked' && (x.delegate ?? null) === (who ?? null) && overlaps(x, o));
}

export function outingConflict(s: GameState, o: Outing, who?: string): Outing | null {
  return outingConflicts(s, o, who)[0] ?? null;
}

// 이동 시간(편도): 회사가 작을수록 멀리 다니고 오래 걸림(A-127). 30분 단위
function travelFor(s: GameState): number {
  const list = O.travelByStage;
  const [a, b] = list[Math.min(list.length - 1, Math.max(0, s.company.stage))];
  return randInt(s, Math.round(a * 2), Math.round(b * 2)) / 2;
}

// 예상 효과(일정 화면·초대 카드용)
export function outingEffect(o: Outing): string {
  const t = outingTpl(o.tpl);
  if (o.delegate) return '직원이 대신 감 · 끝나면 성과 일부'; // A-133
  if (o.kind === 'review') return '약속한 기능에 숨은 일이 없는지 점검(사무실 안, 이동 없음)'; // A-181
  const slot = DATA.ceo.actions.find((a) => a.id === t.action)?.perSlot ?? 0;
  const hours = isFullDay(o) ? DATA.time.slotsPerDay * o.days : o.hours!; // 하루짜리 약속은 약속 시간만(A-127)
  const per = slot * hours;
  if (t.kind === 'ir') return `IR 점수 약 +${(per + (t.bonus.ir ?? 0)).toFixed(0)}${t.bonus.network ? ` · 네트워크 +${t.bonus.network}` : ''}`;
  if (t.kind === 'network') return `네트워크 점수 약 +${(per + (t.bonus.network ?? 0)).toFixed(0)}`;
  if (o.tpl === 'customer') return `고객사 미팅 ${o.stage ?? 1}단계 · 약속 시각에 회의실에 들어갑니다`; // A-186
  return `영업 ${isFullDay(o) ? `${o.days}일치` : `${o.hours}시간`}${t.bonus.pipeline ? ' · 대기업 파이프라인 +' + t.bonus.pipeline : ''}`;
}

// 하루 끝: 끝난 외출 보너스, 지난 초대 만료, 새 초대
export function outingsDay(s: GameState) {
  const list = (s.outings ??= []);
  for (const o of list) {
    if (o.status === 'offer' && s.day >= o.startDay) o.status = 'expired';
    if (o.status === 'booked' && s.day >= o.startDay + o.days) {
      o.status = 'done';
      const b = outingTpl(o.tpl).bonus;
      const k = o.delegate ? O.delegateRate : 1; // 대신 간 직원은 보너스 일부만(A-133)
      if (b.ir) s.irPoints += b.ir * k;
      if (b.network) s.networkPoints += b.network * k;
      if (b.pipeline && !o.result) s.entPipeline += b.pipeline * k; // 고객사 미팅은 결과로 이미 받음(A-186)
      const emp = o.delegate ? s.employees.find((e) => e.id === o.delegate) : undefined;
      if (o.kind === 'review') continue; // 점검 결과는 milestones.ts가 알림(A-181)
      if (o.delegate) notify(s, `${emp?.name ?? '직원'}님이 ${o.title}에 다녀왔습니다.`, 'good', 'schedule');
      else notify(s, `외출에서 돌아왔습니다: ${o.title}. 오늘부터 다시 ${workName(s)}에 집중합니다.`, 'good', 'schedule');
    }
    if (o.status === 'booked' && o.kind === 'review' && s.day === o.startDay) {
      notify(s, `오늘 ${hhmm(o.startHour!)} ${o.title}(${o.host}). 그 한 시간은 회의를 합니다.`, 'info', 'schedule');
    } else if (o.status === 'booked' && o.delegate && s.day === o.startDay) {
      const emp = s.employees.find((e) => e.id === o.delegate);
      notify(s, `오늘 ${emp?.name ?? '직원'}님이 대표 대신 ${o.title}(${o.host})에 갑니다.`, 'info', 'schedule');
    } else if (o.status === 'booked' && s.day === o.startDay)
      notify(
        s,
        isFullDay(o)
          ? `오늘${o.days > 1 ? `부터 ${o.days}일` : ''} 외출: ${o.title}(${o.host}). 그동안 ${workName(s)}은 쉽니다.`
          : `오늘 ${hhmm(o.startHour!)}~${hhmm(o.startHour! + o.hours!)} 외출: ${o.title}(${o.host}). 오가는 시간 포함 그 시간에만 ${workName(s)}을 쉽니다.`,
        'info',
        'schedule',
      );
  }
  s.outings = list.filter((o) => o.status === 'offer' || o.status === 'booked' || s.day - o.startDay < 30);
  if (s.outings.filter((o) => o.status === 'offer').length >= O.maxOffers) return;
  const round = !!openRound(s);
  for (const t of O.templates as Tpl[]) {
    if (t.internal) continue; // 점검 회의는 약속에서만 생김(A-181). rand를 쓰기 전에 건너뛰어 다른 초대 흐름을 바꾸지 않음
    if (t.needsMvp && !hasMvp(s)) continue;
    const p = round && t.roundChance !== undefined ? t.roundChance : t.chance;
    if (rand(s) >= p) continue;
    invite(s, t);
    break; // 하루에 초대는 하나까지
  }
}

function workName(s: GameState): string {
  return DATA.ceo.actions.find((a) => a.id === ceoWork(s))?.name ?? '업무';
}

function invite(s: GameState, t: Tpl) {
  const startDay = s.day + randInt(s, O.leadDays[0], O.leadDays[1]);
  const days = randInt(s, t.days[0], t.days[1]);
  // 하루짜리 약속: 시각·길이·이동 시간(A-127)
  let time: Pick<Outing, 'startHour' | 'hours' | 'travel'> = {};
  if (days === 1 && t.hours) {
    const hours = randInt(s, t.hours[0], t.hours[1]);
    const [m0, m1] = O.meetingStart;
    time = { hours, startHour: randInt(s, m0, Math.max(m0, Math.min(m1, DATA.time.workEndHour - hours))), travel: travelFor(s) };
  }
  let host = t.host;
  let channelId: string;
  if (t.host === 'investor') {
    const inv = pick(s, DATA.investors.investors);
    host = inv.name;
    channelId = ensureExternal(s, inv.id);
  } else if (t.host === 'customer') {
    const hosts = ['한빛상사 구매팀', '오름물산 IT팀', '새솔유통 운영팀', '다온테크 기획팀'];
    host = weighted(s, hosts, hosts.map((h) => inviteWeight(s, companyOf(h)))); // 친한 연락처가 있는 회사가 자주 부름(A-186)
    channelId = ensureNamedExternal(s, host);
  } else channelId = ensureNamedExternal(s, host);
  const o: Outing = { id: nextId(s, 'out'), tpl: t.id, kind: t.kind as Outing['kind'], title: t.title, host, channelId, startDay, days, ...time, cost: t.cost, status: 'offer' };
  (s.outings ??= []).push(o);
  const text = t.text.replace('{date}', time.startHour !== undefined ? `${dayName(startDay)} ${time.startHour}시` : dayName(startDay)).replace('{days}', String(days)).replace('{cost}', t.cost ? wonShort(t.cost) : '무료');
  post(s, channelId, host, text, 'npc');
  const ch = getChannel(s, channelId);
  const m = ch?.messages[ch.messages.length - 1];
  if (m) m.outingId = o.id;
  notify(s, `초대: ${host} — ${t.title}(${outingRange(o)})`, 'info', 'messenger', channelId);
}

// 수락. 겹치는 일정이 있으면 거절하거나(replace 없이 부르면 안내만), replace면 겹치는 기존 일정을 취소하고 받습니다(A-127)
// delegateId(A-133): 대표 대신 보낼 직원
export function acceptOuting(s: GameState, id: string, replace = false, delegateId?: string): string | null {
  const o = outings(s).find((x) => x.id === id);
  if (!o || o.status !== 'offer') return '이미 지난 초대입니다.';
  const emp = delegateId ? delegates(s, o).find((e) => e.id === delegateId) : undefined;
  if (delegateId && !emp) return '이 일정에 보낼 수 없는 직원입니다.';
  const cs = outingConflicts(s, o, delegateId);
  const whose = emp ? `${emp.name}님의 ` : '';
  if (cs.length && !replace) return `${whose}${outingRange(cs[0])} "${cs[0].title}" 일정과 겹칩니다(이동 시간 포함). 기존 일정을 취소하고 받거나 거절하세요.`;
  if (cs.some((c) => s.day >= c.startDay)) return '이미 시작한 일정과 겹쳐 바꿀 수 없습니다.';
  if (o.cost > s.cash) return '비용을 낼 자금이 부족합니다.';
  for (const c of cs) cancelOuting(s, c.id);
  if (o.cost) spendNow(s, `${o.title}(${o.host})`, o.cost, 'other');
  o.status = 'booked';
  if (emp) {
    o.delegate = emp.id;
    post(s, o.channelId, '나(대표)', `감사합니다. 이번에는 저희 ${emp.name}님이 ${outingRange(o)} 찾아뵙겠습니다.`, 'player');
    post(s, o.channelId, o.host, pick(s, ['네, 그날 뵙겠습니다.', '알겠습니다. 잘 부탁드립니다.']), 'npc');
    return null;
  }
  if (o.kind === 'review') {
    post(s, o.channelId, '나(대표)', `좋습니다. ${outingRange(o)}에 봅시다.`, 'player');
    post(s, o.channelId, o.host, '네, 자료 준비해 두겠습니다.', 'npc');
    return null;
  }
  post(s, o.channelId, '나(대표)', `좋습니다. ${outingRange(o)} 뵙겠습니다.`, 'player');
  post(s, o.channelId, o.host, pick(s, ['감사합니다! 그날 뵙겠습니다.', '좋습니다. 일정 잡아 두겠습니다.', '네, 기대하겠습니다.']), 'npc');
  return null;
}

export function declineOuting(s: GameState, id: string): string | null {
  const o = outings(s).find((x) => x.id === id);
  if (!o || o.status !== 'offer') return '이미 지난 초대입니다.';
  o.status = 'declined';
  if (o.kind === 'review') {
    post(s, o.channelId, '나(대표)', '이번 점검은 건너뛰죠. 하던 일 계속해 주세요.', 'player');
    post(s, o.channelId, o.host, '알겠습니다.', 'npc');
    return null;
  }
  post(s, o.channelId, '나(대표)', '죄송하지만 이번에는 어렵겠습니다. 다음에 꼭 뵙죠.', 'player');
  post(s, o.channelId, o.host, pick(s, ['아쉽네요. 다음 기회에 뵙겠습니다.', '알겠습니다. 다음에 다시 연락드릴게요.']), 'npc');
  return null;
}

// 잡아 둔 외출 취소(비용은 돌려받지 못함, 상대가 서운해함)
export function cancelOuting(s: GameState, id: string): string | null {
  const o = outings(s).find((x) => x.id === id);
  if (!o || o.status !== 'booked') return '취소할 일정이 없습니다.';
  if (s.day >= o.startDay) return '이미 시작한 일정은 취소할 수 없습니다.';
  o.status = 'declined';
  post(s, o.channelId, '나(대표)', '정말 죄송합니다. 사정이 생겨 일정을 취소해야 할 것 같습니다.', 'player');
  post(s, o.channelId, o.host, '…알겠습니다. 갑작스럽네요.', 'npc');
  if (o.kind === 'ir') s.irPoints = Math.max(0, s.irPoints - 1);
  else if (o.kind !== 'review') s.networkPoints = Math.max(0, s.networkPoints - 1);
  return null;
}


// 고객사 미팅에서 이겼을 때 다음 단계 미팅 초대(A-186): 같은 회사·같은 채널, followLead일 뒤
export function inviteFollowUp(s: GameState, prev: Outing, carry: Pick<Outing, 'stage' | 'promised' | 'discount'>): Outing | null {
  const t = outingTpl(prev.tpl);
  if (!t) return null;
  const L = DATA.meetings.followLead;
  const startDay = s.day + randInt(s, L[0], L[1]);
  const hours = t.hours ? randInt(s, t.hours[0], t.hours[1]) : 2;
  const [m0, m1] = O.meetingStart;
  const startHour = randInt(s, m0, Math.max(m0, Math.min(m1, DATA.time.workEndHour - hours)));
  const o: Outing = { id: nextId(s, 'out'), tpl: t.id, kind: t.kind as Outing['kind'], title: `${t.title} ${carry.stage}단계`, host: prev.host, channelId: prev.channelId, startDay, days: 1, startHour, hours, travel: prev.travel ?? travelFor(s), cost: t.cost, status: 'offer', ...carry };
  (s.outings ??= []).push(o);
  post(s, o.channelId, o.host, `${dayName(startDay)} ${startHour}시에 ${carry.stage === DATA.meetings.stages.length ? '결정권자분들과 최종' : '담당 임원도 함께'} 미팅을 하면 어떨까요?`, 'npc');
  const ch = getChannel(s, o.channelId);
  const m = ch?.messages[ch.messages.length - 1];
  if (m) m.outingId = o.id;
  notify(s, `초대: ${o.host} — ${o.title}(${outingRange(o)})`, 'info', 'messenger', o.channelId);
  return o;
}
