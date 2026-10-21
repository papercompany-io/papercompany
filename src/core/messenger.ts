// MG-01 사내 메신저와 채널 구성(DEC-014): #전체, 부서 팀 채널, 그룹 메시지, DM, 외부 연락처
import { dept, investor } from './data';
import { nextId } from './ids';
import type { Channel, DeptId, Employee, GameState, Message } from './types';

export function getChannel(s: GameState, id: string): Channel | undefined {
  return s.channels.find((c) => c.id === id);
}

export function post(s: GameState, channelId: string, from: string, text: string, kind: Message['kind'] = 'npc') {
  const ch = getChannel(s, channelId);
  if (!ch) return;
  ch.messages.push({ id: nextId(s, 'm'), day: s.day, from, text, kind });
  if (ch.messages.length > 200) ch.messages.splice(0, ch.messages.length - 200);
}

export function teamChannelId(d: DeptId) {
  return `team-${d}`;
}

export function createWorkspace(s: GameState) {
  s.channels.push({
    id: 'all',
    kind: 'all',
    name: '전체',
    memberIds: [],
    messages: [],
  });
  post(s, 'all', '시스템', `${s.company.name} 워크스페이스가 만들어졌습니다. 부서에 직원이 생기면 팀 채널이 열리고, 팀 채널에서 부서 단위로 지시를 내릴 수 있습니다.`, 'system');
}

// MG-01 처리 흐름 2: 부서에 첫 직원이 생기면 팀 채널을 만듭니다.
export function ensureTeamChannel(s: GameState, d: DeptId) {
  const id = teamChannelId(d);
  if (getChannel(s, id)) return;
  s.channels.push({ id, kind: 'team', name: `${dept(d).name}팀`, dept: d, memberIds: [], messages: [] });
  post(s, id, '시스템', `${dept(d).name}팀 채널이 만들어졌습니다. 아래 지시 버튼으로 팀 전체에 일을 맡길 수 있습니다.`, 'system');
}

// MG-01 처리 흐름 3: 입사한 직원은 #전체와 소속 팀 채널에 자동으로 들어옵니다.
export function onEmployeeJoined(s: GameState, e: Employee) {
  getChannel(s, 'all')!.memberIds.push(e.id);
  ensureTeamChannel(s, e.dept);
  getChannel(s, teamChannelId(e.dept))!.memberIds.push(e.id);
  s.channels.push({ id: `dm-${e.id}`, kind: 'dm', name: e.name, memberIds: [e.id], messages: [] });
  post(s, 'all', '시스템', `${e.name}님이 ${dept(e.dept).name}팀에 합류했습니다.`, 'system');
}

// EM-02 부서가 바뀌면 팀 채널 구성원도 바뀝니다.
export function onDeptChanged(s: GameState, e: Employee, from: DeptId) {
  const old = getChannel(s, teamChannelId(from));
  if (old) old.memberIds = old.memberIds.filter((id) => id !== e.id);
  ensureTeamChannel(s, e.dept);
  getChannel(s, teamChannelId(e.dept))!.memberIds.push(e.id);
  post(s, teamChannelId(e.dept), '시스템', `${e.name}님이 ${dept(from).name}팀에서 이동해 왔습니다.`, 'system');
}

// MG-01.R2 그룹 메시지 [Claude 제안]
export function createGroup(s: GameState, memberIds: string[]): string | null {
  if (memberIds.length < 2) return null;
  const names = memberIds.map((id) => s.employees.find((e) => e.id === id)?.name ?? '?');
  const id = nextId(s, 'grp');
  s.channels.push({ id, kind: 'group', name: names.join(', '), memberIds: [...memberIds], messages: [] });
  post(s, id, '시스템', `그룹 메시지를 만들었습니다: ${names.join(', ')}`, 'system');
  return id;
}

// 외부 연락처: 레터를 주고받은 투자사(FR-10)
export function externalChannelId(investorId: string) {
  return `ext-${investorId}`;
}

export function ensureExternal(s: GameState, investorId: string): string {
  const id = externalChannelId(investorId);
  if (!getChannel(s, id)) {
    s.channels.push({ id, kind: 'external', name: investor(investorId).name, memberIds: [investorId], messages: [] });
  }
  return id;
}
