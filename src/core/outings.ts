// 대표 외출(A-101): 대표는 평소 주 업무(개발·외주·영업, 경영 모드는 대기업 영업·결재) 하나만 하고, 투자자 미팅·컨퍼런스·네트워킹·고객사 방문은
// 메신저(외부 연락처)로 오는 초대를 수락해 1~3일 자리를 비우고 합니다. 외출 날은 하루 내내 그 일을 하고(효율·스펙 그대로),
// 끝나는 날 보너스. 투자 라운드 중에는 투자 미팅 초대가 자주 옵니다.
// A-127: 하루짜리 외출은 약속 시각·길이가 있고, 그 시간과 오가는 이동 시간만 자리를 비웁니다(나머지는 주 업무).
// 이동 시간까지 겹치면 같은 날 두 약속을 잡을 수 없고, 기존 일정을 취소하고 새 초대를 받거나 새 초대를 거절합니다.
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
import { pick, rand, randInt } from './rng';
import type { GameState, Outing } from './types';

const O = DATA.ceo.outings;
type Tpl = (typeof O.templates)[number] & { needsMvp?: boolean; roundChance?: number; hours?: number[]; bonus: { ir?: number; network?: number; pipeline?: number } };
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

// 오늘 잡힌 외출(하루짜리 약속이 여러 개일 수 있음)
export function todayOutings(s: GameState): Outing[] {
  return outings(s).filter((o) => o.status === 'booked' && s.day >= o.startDay && s.day < o.startDay + o.days);
}

// 오늘 외출이 있는 날의 첫 일정
export function todayOuting(s: GameState): Outing | null {
  return todayOutings(s)[0] ?? null;
}

// 지금 이 시각에 자리를 비운 외출(이동 중 포함). 사무실의 대표 책상·이름표에 씀
export function awayOuting(s: GameState): Outing | null {
  const hour = WORK_START + (Math.min(1, s.msInDay / DATA.time.dayMs) * DAY_HOURS);
  return todayOutings(s).find((o) => {
    const [a, b] = busyWindow(o);
    return hour >= a && hour < b;
  }) ?? null;
}

export function outingConflicts(s: GameState, o: Outing): Outing[] {
  return outings(s).filter((x) => x.id !== o.id && x.status === 'booked' && overlaps(x, o));
}

export function outingConflict(s: GameState, o: Outing): Outing | null {
  return outingConflicts(s, o)[0] ?? null;
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
  const slot = DATA.ceo.actions.find((a) => a.id === t.action)?.perSlot ?? 0;
  const hours = isFullDay(o) ? DATA.time.slotsPerDay * o.days : o.hours!; // 하루짜리 약속은 약속 시간만(A-127)
  const per = slot * hours;
  if (t.kind === 'ir') return `IR 점수 약 +${(per + (t.bonus.ir ?? 0)).toFixed(0)}${t.bonus.network ? ` · 네트워크 +${t.bonus.network}` : ''}`;
  if (t.kind === 'network') return `네트워크 점수 약 +${(per + (t.bonus.network ?? 0)).toFixed(0)}`;
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
      if (b.ir) s.irPoints += b.ir;
      if (b.network) s.networkPoints += b.network;
      if (b.pipeline) s.entPipeline += b.pipeline;
      notify(s, `외출에서 돌아왔습니다: ${o.title}. 오늘부터 다시 ${workName(s)}에 집중합니다.`, 'good', 'schedule');
    }
    if (o.status === 'booked' && s.day === o.startDay)
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
    host = pick(s, ['한빛상사 구매팀', '오름물산 IT팀', '새솔유통 운영팀', '다온테크 기획팀']);
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
export function acceptOuting(s: GameState, id: string, replace = false): string | null {
  const o = outings(s).find((x) => x.id === id);
  if (!o || o.status !== 'offer') return '이미 지난 초대입니다.';
  const cs = outingConflicts(s, o);
  if (cs.length && !replace) return `${outingRange(cs[0])} "${cs[0].title}" 일정과 겹칩니다(이동 시간 포함). 기존 일정을 취소하고 받거나 거절하세요.`;
  if (cs.some((c) => s.day >= c.startDay)) return '이미 시작한 일정과 겹쳐 바꿀 수 없습니다.';
  if (o.cost > s.cash) return '비용을 낼 자금이 부족합니다.';
  for (const c of cs) cancelOuting(s, c.id);
  if (o.cost) spendNow(s, `${o.title}(${o.host})`, o.cost, 'other');
  o.status = 'booked';
  post(s, o.channelId, '나(대표)', `좋습니다. ${outingRange(o)} 뵙겠습니다.`, 'player');
  post(s, o.channelId, o.host, pick(s, ['감사합니다! 그날 뵙겠습니다.', '좋습니다. 일정 잡아 두겠습니다.', '네, 기대하겠습니다.']), 'npc');
  return null;
}

export function declineOuting(s: GameState, id: string): string | null {
  const o = outings(s).find((x) => x.id === id);
  if (!o || o.status !== 'offer') return '이미 지난 초대입니다.';
  o.status = 'declined';
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
  else s.networkPoints = Math.max(0, s.networkPoints - 1);
  return null;
}

