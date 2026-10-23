// MG-01 사내 메신저와 채널 구성(DEC-014): #전체, 대표가 만든 부서 채널(A-237, squads.ts), DM, 외부 연락처. 그룹 메시지(A-226)·직무 채널(#개발팀 등, A-237)은 없앰
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

// 잡담이 오가는 채널(부서 채널·#전체). 잡담 알림을 끄면 이 채널들의 안 읽음은 뱃지에 세지 않음(A-201)
export function isChatterChannel(c: Channel): boolean {
  return c.kind === 'all' || c.kind === 'team';
}

export function unreadTotal(s: GameState, muteChatter = false): number {
  return s.channels.reduce((a, c) => a + (muteChatter && isChatterChannel(c) ? 0 : c.unread), 0);
}

export function createWorkspace(s: GameState) {
  s.channels.push({ id: 'all', kind: 'all', name: '전체', memberIds: [], messages: [], unread: 0 });
  post(s, 'all', '시스템', `${s.company.name} 워크스페이스가 만들어졌습니다. 직원 관리의 부서 탭에서 부서를 만들면 부서마다 채널이 열리고, 그 채널에서 부서가 맡을 일을 정할 수 있습니다.`, 'system');
}

export function onEmployeeJoined(s: GameState, e: Employee) {
  getChannel(s, 'all')!.memberIds.push(e.id);
  s.channels.push({ id: `dm-${e.id}`, kind: 'dm', name: e.name, memberIds: [e.id], messages: [], unread: 0 });
  post(s, 'all', '시스템', `${e.name}님(${dept(e.dept).name})이 합류했습니다.`, 'system');
  post(s, 'all', e.name, '안녕하세요! 오늘부터 함께하게 됐습니다. 잘 부탁드립니다.', 'npc');
}

export function onEmployeeLeft(s: GameState, e: Employee, why: 'quit' | 'fired' | 'event') {
  for (const c of s.channels) c.memberIds = c.memberIds.filter((x) => x !== e.id);
  s.channels = s.channels.filter((c) => c.id !== `dm-${e.id}`);
  const verb = why === 'fired' ? '회사를 떠났습니다(해고)' : '퇴사했습니다';
  post(s, 'all', '시스템', `${e.name}님(${dept(e.dept).name})이 ${verb}.`, 'system');
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
