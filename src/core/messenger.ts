// MG-01 사내 메신저와 채널 구성(DEC-014): #전체, 부서 팀 채널, 그룹 메시지, DM, 외부 연락처
import { dept, investor } from './data';
import { nextId } from './ids';
import type { Channel, DeptId, Employee, GameState, Message } from './types';

export function getChannel(s: GameState, id: string): Channel | undefined {
  return s.channels.find((c) => c.id === id);
}

export function post(s: GameState, channelId: string, from: string, text: string, kind: Message['kind'] = 'npc', decisionId?: string) {
  const ch = getChannel(s, channelId) ?? getChannel(s, 'all');
  if (!ch) return;
  ch.messages.push({ id: nextId(s, 'm'), day: s.day, at: Math.round(s.msInDay), from, text, kind, decisionId });
  if (kind !== 'player') ch.unread += 1;
  if (ch.messages.length > 120) ch.messages.splice(0, ch.messages.length - 120);
}

export function markRead(s: GameState, channelId: string) {
  const ch = getChannel(s, channelId);
  if (ch) ch.unread = 0;
}

// 잡담이 오가는 채널(팀 채널·#전체). 잡담 알림을 끄면 이 채널들의 안 읽음은 뱃지에 세지 않음(A-201)
export function isChatterChannel(c: Channel): boolean {
  return c.kind === 'all' || c.kind === 'team';
}

export function unreadTotal(s: GameState, muteChatter = false): number {
  return s.channels.reduce((a, c) => a + (muteChatter && isChatterChannel(c) ? 0 : c.unread), 0);
}

export function teamChannelId(d: DeptId) {
  return `team-${d}`;
}

export function createWorkspace(s: GameState) {
  s.channels.push({ id: 'all', kind: 'all', name: '전체', memberIds: [], messages: [], unread: 0 });
  post(s, 'all', '시스템', `${s.company.name} 워크스페이스가 만들어졌습니다. 부서에 직원이 생기면 팀 채널이 열리고, 팀 채널에서 그 부서가 맡을 일을 정할 수 있습니다.`, 'system');
}

export function ensureTeamChannel(s: GameState, d: DeptId) {
  const id = teamChannelId(d);
  if (getChannel(s, id)) return;
  s.channels.push({ id, kind: 'team', name: `${dept(d).name}팀`, dept: d, memberIds: [], messages: [], unread: 0 });
  post(s, id, '시스템', `${dept(d).name}팀 채널이 만들어졌습니다. 위의 "맡은 일"에서 팀 전체가 할 일을 정하세요.`, 'system');
}

export function onEmployeeJoined(s: GameState, e: Employee) {
  getChannel(s, 'all')!.memberIds.push(e.id);
  ensureTeamChannel(s, e.dept);
  getChannel(s, teamChannelId(e.dept))!.memberIds.push(e.id);
  s.channels.push({ id: `dm-${e.id}`, kind: 'dm', name: e.name, memberIds: [e.id], messages: [], unread: 0 });
  post(s, 'all', '시스템', `${e.name}님이 ${dept(e.dept).name}팀에 합류했습니다.`, 'system');
  post(s, teamChannelId(e.dept), e.name, '안녕하세요! 오늘부터 함께하게 됐습니다. 잘 부탁드립니다.', 'npc');
}

export function onEmployeeLeft(s: GameState, e: Employee, why: 'quit' | 'fired' | 'event') {
  for (const c of s.channels) c.memberIds = c.memberIds.filter((x) => x !== e.id);
  s.channels = s.channels.filter((c) => c.id !== `dm-${e.id}`);
  const verb = why === 'fired' ? '회사를 떠났습니다(해고)' : '퇴사했습니다';
  post(s, 'all', '시스템', `${e.name}님(${dept(e.dept).name}팀)이 ${verb}.`, 'system');
}

export function onDeptChanged(s: GameState, e: Employee, from: DeptId) {
  const old = getChannel(s, teamChannelId(from));
  if (old) old.memberIds = old.memberIds.filter((id) => id !== e.id);
  ensureTeamChannel(s, e.dept);
  getChannel(s, teamChannelId(e.dept))!.memberIds.push(e.id);
  post(s, teamChannelId(e.dept), '시스템', `${e.name}님이 ${dept(from).name}팀에서 이동해 왔습니다.`, 'system');
}

export function createGroup(s: GameState, memberIds: string[]): string | null {
  if (memberIds.length < 2) return null;
  const names = memberIds.map((id) => s.employees.find((e) => e.id === id)?.name ?? '?');
  const id = nextId(s, 'grp');
  s.channels.push({ id, kind: 'group', name: names.join(', '), memberIds: [...memberIds], messages: [], unread: 0 });
  post(s, id, '시스템', `그룹 메시지를 만들었습니다: ${names.join(', ')}`, 'system');
  return id;
}

export function externalChannelId(investorId: string) {
  return `ext-${investorId}`;
}

export function ensureExternal(s: GameState, investorId: string): string {
  const id = externalChannelId(investorId);
  if (!getChannel(s, id)) s.channels.push({ id, kind: 'external', name: investor(investorId).name, memberIds: [investorId], messages: [], unread: 0 });
  return id;
}

// 이벤트 발신자(법무법인·기자 등) 외부 연락처
export function ensureNamedExternal(s: GameState, name: string): string {
  const id = `ext-n-${name}`;
  if (!getChannel(s, id)) s.channels.push({ id, kind: 'external', name, memberIds: [], messages: [], unread: 0 });
  return id;
}
