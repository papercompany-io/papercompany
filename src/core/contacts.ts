// 연락처(A-186): 고객사 미팅에서 만난 사람. 이름·회사·직함과 숨은 걱정·친밀도를 가지고 커리어 내내 남습니다.
// 이미 아는 사람은 알아낸 걱정이 그대로 보이고, 친할수록 미팅을 좋은 분위기로 시작합니다. 오래 안 만나면 친밀도가 식습니다.
import { DATA } from './data';
import { nextId } from './ids';
import { pick, randInt } from './rng';
import type { Contact, GameState, MeetRole } from './types';

const B = DATA.meetings.bond;

export function contactsOf(s: GameState): Contact[] {
  return s.contacts ?? [];
}

export function contact(s: GameState, id: string): Contact | undefined {
  return contactsOf(s).find((c) => c.id === id);
}

// 초대한 쪽 이름(예: "한빛상사 구매팀")에서 회사 이름만
export function companyOf(host: string): string {
  return host.replace(/ [^ ]*팀$/, '');
}

// 친밀도를 화면 말로(숫자는 숨김)
export function bondLabel(c: Contact): string {
  let label = B.labels[0][1] as string;
  for (const [min, text] of B.labels as [number, string][]) if (c.bond >= min) label = text;
  return label;
}

function makeName(s: GameState): string {
  const used = new Set([...contactsOf(s).map((c) => c.name), ...s.employees.map((e) => e.name)]);
  for (let i = 0; i < 20; i++) {
    const n = pick(s, DATA.names.surnames) + pick(s, DATA.names.given);
    if (!used.has(n)) return n;
  }
  return pick(s, DATA.names.surnames) + pick(s, DATA.names.given);
}

// 그 회사에서 이 역할을 맡은 사람. 이미 알면 그 사람, 아니면 새로 만남(skip = 이번 미팅에 이미 뽑힌 사람)
export function meetContact(s: GameState, company: string, role: MeetRole, skip: string[] = []): Contact {
  const known = contactsOf(s).find((c) => c.company === company && c.role === role && !skip.includes(c.id));
  if (known) return known;
  const r = DATA.meetings.roles[role];
  const pool = [...r.concerns];
  const n = Math.min(pool.length, randInt(s, DATA.meetings.concernsPer[0], DATA.meetings.concernsPer[1]));
  const concerns: string[] = [];
  while (concerns.length < n) {
    const c = pick(s, pool.filter((x) => !concerns.includes(x)));
    concerns.push(c);
  }
  const c: Contact = { id: nextId(s, 'ct'), name: makeName(s), company, role, title: pick(s, r.titles), concerns, known: [], bond: B.start, metDay: s.day, meetings: 0 };
  (s.contacts ??= []).push(c);
  return c;
}

export function changeBond(c: Contact, d: number) {
  c.bond = Math.max(0, Math.min(100, c.bond + d));
}

// 매달 첫날: 오래 안 만난 사람은 친밀도가 조금씩 식음
export function contactsMonth(s: GameState) {
  for (const c of contactsOf(s)) if (s.day - c.metDay > B.decayAfter) changeBond(c, -B.decayPerMonth);
}

// 고객사 방문 초대를 보낼 회사의 가중치(친한 사람이 있으면 자주 옴)
export function inviteWeight(s: GameState, company: string): number {
  return contactsOf(s).some((c) => c.company === company && c.bond >= DATA.meetings.inviteBond) ? DATA.meetings.inviteWeight : 1;
}
