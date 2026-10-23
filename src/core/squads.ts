// A-226 부서 안의 팀: 대표가 부서 안에 팀을 만들고 직원을 나눕니다. 팀마다 메신저 채널이 생기고,
// 팀에 맡은 일(버그 수정·외주·로드맵 기능 등)을 정하면 그 팀 사람은 부서 일 대신 그 일을 합니다(assign.groupOrder).
// 팀에 맡은 일이 없으면 부서 맡은 일을 따르므로, 팀을 만들지 않은 회사(봇 포함)는 예전과 똑같습니다.
import { DATA, dept, orderDef } from './data';
import { nextId } from './ids';
import { getChannel, post } from './messenger';
import type { DeptId, Employee, GameState, Squad } from './types';

const Q = DATA.orders.squads;

export function squadChannelId(id: string) {
  return `sq-${id}`;
}

export function squadsOf(s: GameState, d?: DeptId): Squad[] {
  const all = s.company.squads ?? [];
  return d ? all.filter((q) => q.dept === d) : all;
}

export function squad(s: GameState, id: string | null | undefined): Squad | undefined {
  return id ? s.company.squads?.find((q) => q.id === id) : undefined;
}

export function squadMembers(s: GameState, id: string): Employee[] {
  return s.employees.filter((e) => e.squadId === id);
}

function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, Q.nameMax);
}

// 반환: 새 팀 id, 또는 { err } = 못 만든 이유
export function createSquad(s: GameState, d: DeptId, raw: string): string | { err: string } {
  const name = cleanName(raw);
  if (!name) return { err: '팀 이름을 적어 주세요.' };
  const list = squadsOf(s, d);
  if (list.length >= Q.maxPerDept) return { err: `한 부서에는 팀을 ${Q.maxPerDept}개까지 만들 수 있습니다.` };
  if (list.some((q) => q.name === name)) return { err: '같은 이름의 팀이 이미 있습니다.' };
  const q: Squad = { id: nextId(s, 'sq'), dept: d, name, order: null };
  (s.company.squads ??= []).push(q);
  s.channels.push({ id: squadChannelId(q.id), kind: 'team', name: q.name, dept: d, squadId: q.id, memberIds: [], messages: [], unread: 0 });
  post(s, squadChannelId(q.id), '시스템', `${dept(d).name}팀 안에 "${q.name}" 팀을 만들었습니다. 맡은 일을 정하지 않으면 부서 일을 따릅니다.`, 'system');
  return q.id;
}

export function renameSquad(s: GameState, id: string, raw: string): string | null {
  const q = squad(s, id);
  if (!q) return '팀을 찾을 수 없습니다.';
  const name = cleanName(raw);
  if (!name) return '팀 이름을 적어 주세요.';
  if (squadsOf(s, q.dept).some((x) => x !== q && x.name === name)) return '같은 이름의 팀이 이미 있습니다.';
  q.name = name;
  const ch = getChannel(s, squadChannelId(id));
  if (ch) ch.name = name;
  return null;
}

// 팀을 없애면 팀원은 부서 바로 아래로 돌아가고(부서 일을 따름) 팀 채널도 닫힙니다
export function removeSquad(s: GameState, id: string): string | null {
  const q = squad(s, id);
  if (!q) return '팀을 찾을 수 없습니다.';
  for (const e of squadMembers(s, id)) e.squadId = null;
  s.company.squads = squadsOf(s).filter((x) => x.id !== id);
  s.channels = s.channels.filter((c) => c.id !== squadChannelId(id));
  return null;
}

// 직원의 소속 팀 바꾸기. squadId = null이면 부서 바로 아래로
export function setSquad(s: GameState, empId: string, squadId: string | null): string | null {
  const e = s.employees.find((x) => x.id === empId);
  if (!e) return '직원을 찾을 수 없습니다.';
  const q = squad(s, squadId);
  if (squadId && !q) return '팀을 찾을 수 없습니다.';
  if (q && q.dept !== e.dept) return `${dept(q.dept).name}팀 안의 팀이라 옮길 수 없습니다.`;
  if ((e.squadId ?? null) === (squadId ?? null)) return null;
  const old = getChannel(s, squadChannelId(e.squadId ?? ''));
  if (old) old.memberIds = old.memberIds.filter((x) => x !== e.id);
  e.squadId = q ? q.id : null;
  if (q) {
    const ch = getChannel(s, squadChannelId(q.id));
    if (ch && !ch.memberIds.includes(e.id)) ch.memberIds.push(e.id);
    post(s, squadChannelId(q.id), '시스템', `${e.name}님이 ${q.name}에 들어왔습니다.`, 'system');
  }
  return null;
}

// 팀 맡은 일 바꾸기(orderId = null이면 부서 일을 따름). 팀 채널에 팀원이 답함. said = false면 대표 말(이미 채팅으로 올림)은 다시 올리지 않음, quiet = 팀원 답은 LLM 답이 대신함
export function setSquadOrder(s: GameState, id: string, orderId: string | null, said = true, quiet = false): string | null {
  const q = squad(s, id);
  if (!q) return '팀을 찾을 수 없습니다.';
  const o = orderId ? orderDef(orderId) : undefined;
  if (orderId && (!o || o.dept !== q.dept)) return '이 부서의 일이 아닙니다.';
  if (o && s.company.stage < o.stage) return `회사 단계 ${o.stage}부터 맡길 수 있는 일입니다.`;
  if (q.order === (orderId ?? null)) return null;
  const members = squadMembers(s, id);
  const recent = q.orderDay !== undefined && s.day - q.orderDay < Q.recentDays;
  squadOrderCost(s, members, recent);
  q.order = orderId ?? null;
  q.orderDay = s.day;
  const ch = squadChannelId(id);
  if (said) post(s, ch, '나(대표)', o ? `[지시] ${q.name}은 앞으로 "${o.name}"에 집중해 주세요. ${o.desc}` : `[지시] ${q.name}은 다시 부서 일을 따라 주세요.`, 'player');
  const speaker = members.find((e) => e.lead) ?? members[0];
  if (speaker && !quiet) post(s, ch, speaker.name, o ? '네, 우리 팀이 맡겠습니다.' : '알겠습니다. 부서 일로 돌아가겠습니다.', 'npc');
  return null;
}

// 팀 맡은 일을 바꾸는 대가. recent = recentDays일 안에 또 바꿈
function squadOrderCost(s: GameState, members: Employee[], recent: boolean) {
  // TODO(human)
}
