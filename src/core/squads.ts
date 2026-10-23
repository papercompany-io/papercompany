// 맡은 일은 부서 기준(A-237): 부서 사람은 "그 부서가 그 직무에 맡긴 일", 부서 없는 사람은 "소속 없음의 일"(company.orders), 그 위에 사람별 예외(Employee.order).
// A-237 부서(=팀): 채용하면 직무(개발자·디자이너…)만 정해지고 부서에는 들지 않습니다. 대표가 부서를 만들어 이름을 붙이고
// 직무가 섞이게 사람을 넣습니다. 부서마다 메신저 채널이 생기고, 부서가 직무별로 맡은 일(버그 수정·외주·로드맵 기능 등)을 정하면
// 그 부서의 그 직무 사람은 직무 기본 일(company.orders) 대신 그 일을 합니다(assign.groupOrder).
// 부서를 만들지 않은 회사(봇 포함)는 모두 직무 기본 일을 따르므로 예전과 똑같습니다.
import { DATA, dept, orderDef } from './data';
import { josa } from './format';
import { nextId } from './ids';
import { getChannel, post } from './messenger';
import { teamOrder } from './assign';
import type { DeptId, Employee, GameState, Squad } from './types';

const Q = DATA.orders.squads;

export function squadChannelId(id: string) {
  return `sq-${id}`;
}

export function squadsOf(s: GameState): Squad[] {
  return s.company.squads ?? [];
}

export function squad(s: GameState, id: string | null | undefined): Squad | undefined {
  return id ? s.company.squads?.find((q) => q.id === id) : undefined;
}

export function squadMembers(s: GameState, id: string): Employee[] {
  return s.employees.filter((e) => e.squadId === id);
}

// 부서에 있는 직무(직무 순서대로)
export function squadJobs(s: GameState, id: string): DeptId[] {
  const have = new Set(squadMembers(s, id).map((e) => e.dept));
  return (DATA.depts.departments.map((d) => d.id) as DeptId[]).filter((d) => have.has(d));
}

// 부서 없는 사람
export function unassigned(s: GameState): Employee[] {
  return s.employees.filter((e) => !squad(s, e.squadId));
}

function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, Q.nameMax);
}

// 반환: 새 부서 id, 또는 { err } = 못 만든 이유
export function createSquad(s: GameState, raw: string): string | { err: string } {
  const name = cleanName(raw);
  if (!name) return { err: '부서 이름을 적어 주세요.' };
  const list = squadsOf(s);
  if (list.length >= Q.max) return { err: `부서는 ${Q.max}개까지 만들 수 있습니다.` };
  if (list.some((q) => q.name === name)) return { err: '같은 이름의 부서가 이미 있습니다.' };
  const q: Squad = { id: nextId(s, 'sq'), name, orders: {} };
  (s.company.squads ??= []).push(q);
  s.channels.push({ id: squadChannelId(q.id), kind: 'team', name: q.name, squadId: q.id, memberIds: [], messages: [], unread: 0 });
  post(s, squadChannelId(q.id), '시스템', `"${q.name}" 부서를 만들었습니다. 맡은 일을 정하지 않은 직무는 직무 기본 일을 따릅니다.`, 'system');
  return q.id;
}

export function renameSquad(s: GameState, id: string, raw: string): string | null {
  const q = squad(s, id);
  if (!q) return '부서를 찾을 수 없습니다.';
  const name = cleanName(raw);
  if (!name) return '부서 이름을 적어 주세요.';
  if (squadsOf(s).some((x) => x !== q && x.name === name)) return '같은 이름의 부서가 이미 있습니다.';
  q.name = name;
  const ch = getChannel(s, squadChannelId(id));
  if (ch) ch.name = name;
  return null;
}

// 부서를 없애면 사람은 부서 없음으로 돌아가고(직무 기본 일을 따름) 부서 채널도 닫힙니다
export function removeSquad(s: GameState, id: string): string | null {
  const q = squad(s, id);
  if (!q) return '부서를 찾을 수 없습니다.';
  for (const e of squadMembers(s, id)) e.squadId = null;
  s.company.squads = squadsOf(s).filter((x) => x.id !== id);
  s.channels = s.channels.filter((c) => c.id !== squadChannelId(id));
  return null;
}

// 직원의 소속 부서 바꾸기. squadId = null이면 부서 없음
export function setSquad(s: GameState, empId: string, squadId: string | null): string | null {
  const e = s.employees.find((x) => x.id === empId);
  if (!e) return '직원을 찾을 수 없습니다.';
  const q = squad(s, squadId);
  if (squadId && !q) return '부서를 찾을 수 없습니다.';
  if ((e.squadId ?? null) === (q?.id ?? null)) return null;
  const old = getChannel(s, squadChannelId(e.squadId ?? ''));
  if (old) old.memberIds = old.memberIds.filter((x) => x !== e.id);
  e.squadId = q ? q.id : null;
  // 부서는 직무마다 늘 정해진 일이 있음(A-237): 이 직무가 처음 들어오면 지금 하던 직무 일을 그대로 이어받음
  if (q && !q.orders[e.dept]) q.orders[e.dept] = teamOrder(s, e.dept);
  if (q) {
    const ch = getChannel(s, squadChannelId(q.id));
    if (ch && !ch.memberIds.includes(e.id)) ch.memberIds.push(e.id);
    post(s, squadChannelId(q.id), '시스템', `${e.name}님(${dept(e.dept).name})이 ${q.name}에 들어왔습니다.`, 'system');
  }
  return null;
}

// 부서가 한 직무에 맡긴 일 바꾸기(orderId = null이면 직무 기본 일을 따름). 부서 채널에 그 직무 사람이 답함.
// said = false면 대표 말(이미 채팅으로 올림)은 다시 올리지 않음, quiet = 답은 LLM 답이 대신함
export function setSquadOrder(s: GameState, id: string, d: DeptId, orderId: string | null, said = true, quiet = false): string | null {
  const q = squad(s, id);
  if (!q) return '부서를 찾을 수 없습니다.';
  const o = orderId ? orderDef(orderId) : undefined;
  if (orderId && (!o || o.dept !== d)) return `${dept(d).name} 직무의 일이 아닙니다.`;
  if (o && s.company.stage < o.stage) return `회사 단계 ${o.stage}부터 맡길 수 있는 일입니다.`;
  if ((q.orders[d] ?? null) === (orderId ?? null)) return null;
  const members = squadMembers(s, id).filter((e) => e.dept === d);
  const recent = q.orderDay !== undefined && s.day - q.orderDay < Q.recentDays;
  squadOrderCost(s, members, recent);
  if (orderId) q.orders[d] = orderId;
  else delete q.orders[d];
  q.orderDay = s.day;
  const ch = squadChannelId(id);
  const who = `${q.name} ${dept(d).name}`;
  if (said) post(s, ch, '나(대표)', o ? `[지시] ${who}${josa(who, '은')} 앞으로 "${o.name}"에 집중해 주세요. ${o.desc}` : `[지시] ${who}${josa(who, '은')} 다시 직무 기본 일을 따라 주세요.`, 'player');
  const speaker = members.find((e) => e.lead) ?? members[0];
  if (speaker && !quiet) post(s, ch, speaker.name, o ? '네, 저희가 맡겠습니다.' : '알겠습니다. 기본 일로 돌아가겠습니다.', 'npc');
  return null;
}

// 부서 맡은 일을 바꾸는 대가. members = 그 일을 바꾸는 직무 사람들, recent = recentDays일 안에 또 바꿈
function squadOrderCost(s: GameState, members: Employee[], recent: boolean) {
  // TODO(human)
}
