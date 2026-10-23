// 대화 평가용 시험 회사(scripts/talk/eval.ts): 단계 1 SaaS, 개발팀 4명·마케팅팀 2명·디자인팀 1명. 개발팀은 외주 작업 중
import cases from './cases.json';
import { defaultPicks, newCareer } from '../../src/core/state';
import { emptyProfile } from '../../src/core/career';
import { nextId } from '../../src/core/ids';
import { getChannel, onEmployeeJoined, post } from '../../src/core/messenger';
import type { DeptId, Employee, GameState } from '../../src/core/types';

export type Case = {
  id: string;
  ch: 'dm' | 'team' | 'all';
  to?: string;
  msg: string;
  prev?: [string, string][];
  expect: {
    intent: string | string[];
    tone?: 'neg' | 'insult' | 'pos' | 'calm';
    addressed?: string | null | (string | null)[];
    order?: string | null | (string | null)[];
    scope?: 'self' | 'team';
    back?: boolean;
    teamOrders?: string[];
    assigns?: Record<string, string>;
    everyone?: boolean;
    noOrder?: boolean;
    empOrders?: Record<string, string>; // 답한 뒤 사람마다 하는 일(해석 모양 대신 실제 결과)
  };
};

export type Step = Omit<Case, 'id' | 'prev'> & { day?: number; after?: { order?: string; sat?: Record<string, [number, number]> } };
export type Scenario = {
  id: string;
  note?: string;
  setup?: { emp?: Record<string, { sat?: number; health?: number; traits?: string[]; sick?: number; leaving?: number; order?: string }>; orderDayAgo?: Partial<Record<DeptId, number>> };
  steps: Step[];
};

export function loadCases(): Case[] {
  return (cases as unknown as { cases: Case[] }).cases;
}

export function loadScenarios(): Scenario[] {
  return (cases as unknown as { scenarios: Scenario[] }).scenarios;
}

export function setupWorld(s: GameState, sc: Scenario) {
  for (const [name, v] of Object.entries(sc.setup?.emp ?? {})) {
    const e = empByName(s, name)!;
    if (v.sat !== undefined) e.sat = v.sat;
    if (v.health !== undefined) e.health = v.health;
    if (v.traits) e.traits = v.traits;
    if (v.sick) e.sickUntil = s.day + v.sick;
    if (v.leaving) e.leaving = s.day + v.leaving;
    if (v.order) e.order = v.order;
  }
  for (const [d, ago] of Object.entries(sc.setup?.orderDayAgo ?? {})) (s.company.orderDay ??= {})[d as DeptId] = s.day - (ago ?? 0);
}

function hire(s: GameState, name: string, d: DeptId, lead = false, traits: string[] = [], sat = 70, health = 80) {
  const e = { id: nextId(s, 'e'), name, dept: d, salary: 4200000, grade: 'B', years: 3, joinedDay: s.day - 30, seatId: null, kind: 'staff', traits, skill: 55, talent: 1, sat, health, lead, options: 0, optionDay: null, sickUntil: null, leaving: null, lastRaiseDay: s.day, bubble: null } as Employee;
  s.employees.push(e);
  onEmployeeJoined(s, e);
  return e;
}

export function makeWorld(): GameState {
  const s = newCareer({ picks: defaultPicks(), cofounderId: null, cofounderEquity: 0, engineerId: null, companyName: '페이퍼랩', wantsAngel: false, seed: 11, industry: 'saas' }, emptyProfile());
  s.company.stage = 1;
  s.cash = Math.max(s.cash, 300000000);
  hire(s, '최유찬', 'dev');
  hire(s, '조다은', 'dev', false, ['social']);
  hire(s, '오가은', 'dev');
  hire(s, '송우진', 'dev', true, ['steady']);
  hire(s, '한지민', 'marketing', true);
  hire(s, '박서준', 'marketing');
  hire(s, '윤하늘', 'design', true);
  s.company.orders.dev = 'dev_contract';
  s.msInDay = 14000;
  return s;
}

export function empByName(s: GameState, name: string) {
  return s.employees.find((e) => e.name === name);
}

// 케이스의 채널 id(DM은 상대 이름으로)와 앞 대화를 깔아 둠
export function stage(s: GameState, c: Case): string {
  const chId = c.ch === 'dm' ? `dm-${empByName(s, c.to!)!.id}` : c.ch === 'team' ? 'team-dev' : 'all';
  const ch = getChannel(s, chId)!;
  for (const [from, text] of c.prev ?? []) post(s, chId, from, text, from === '나(대표)' ? 'player' : 'npc');
  ch.unread = 0;
  return chId;
}
