// 직원 깊이(DEC-022 만족도·건강, EM-03 특성, EM-04 퇴사·해고, WF 복지, 팀장, 근무 방침)와 직원 출력 계산.
// 출력(하루 작업량) = 등급 × 숙련 × 만족도 × 건강 × 근무 방침 × 복지 × 특성 × 팀장·관리 범위 × AI × 결재 × 기간 효과
import { DATA, dept, gradeOutput, trait, welfareItem, workPolicy } from './data';
import { yearOf } from './calendar';
import { econ } from './economy';
import { deptMembers, employee, releaseSeat, severance } from './employees';
import { book } from './finance';
import { mod, addMod } from './mods';
import { notify, float } from './notify';
import { post, teamChannelId, onEmployeeLeft } from './messenger';
import { officeComfort } from './office';
import { rand, randInt } from './rng';
import { aiMultiplier } from './aiadopt';
import { approveMultiplier } from './ceo';
import { unvestedOptions, forfeitOptions } from './equity';
import type { DeptId, Employee, GameState, Grade } from './types';

function traitFx(e: Employee, key: string): number {
  let v = 0;
  for (const t of e.traits) {
    const fx = trait(t)?.fx as Record<string, number> | undefined;
    if (fx && typeof fx[key] === 'number') v += fx[key];
  }
  return v;
}

export function hasTrait(e: Employee, id: string) {
  return e.traits.includes(id);
}

function welfareSum(s: GameState, key: string): number {
  let v = 0;
  for (const id of s.company.welfare) {
    const fx = welfareItem(id)?.fx as Record<string, number> | undefined;
    if (fx && typeof fx[key] === 'number') v += fx[key];
  }
  return v;
}

export function welfareCostPerHead(s: GameState): number {
  return s.company.welfare.reduce((a, id) => a + (welfareItem(id)?.cost ?? 0), 0);
}

export function welfareApply(s: GameState): number {
  return welfareSum(s, 'apply');
}

export function welfareQuality(s: GameState): number {
  return welfareSum(s, 'quality');
}

export function isSick(s: GameState, e: Employee) {
  return e.sickUntil !== null && e.sickUntil > s.day;
}

// 시장 월급(등급·물가 상승 반영): 직원 월급이 이보다 낮으면 만족도가 떨어집니다.
export function marketSalary(s: GameState, d: DeptId, g: Grade): number {
  const years = Math.max(0, yearOf(s.day) - 2027);
  return dept(d).baseSalary * (DATA.hiring.gradeSalary as Record<Grade, number>)[g] * Math.pow(1 + DATA.economy.salaryInflationYear, years) * econ(s, 'salary');
}

// 관리 범위: 6명 이상 부서는 10명당 팀장 1명이 필요합니다.
export function leadInfo(s: GameState, d: DeptId) {
  const ms = deptMembers(s, d);
  const n = ms.length;
  const needed = n >= 6 ? Math.ceil(n / 10) : 0;
  const leads = ms.filter((e) => e.lead);
  const have = leads.length;
  const short = needed > 0 ? Math.max(0, 1 - have / needed) : 0;
  const span = 1 - Math.min(0.4, 0.035 * Math.max(0, n - 5) * short);
  const bonus = leads.reduce((a, e) => a + 0.04 + traitFx(e, 'lead') + (e.grade === 'S' ? 0.03 : e.grade === 'A' ? 0.015 : 0), 0) / Math.max(1, needed || have || 1);
  return { n, needed, have, span, bonus: Math.min(0.25, bonus) };
}

// 직원 한 명의 하루 작업량(B등급 보통 상태 = 1)
export function output(s: GameState, e: Employee, cache?: Map<DeptId, ReturnType<typeof leadInfo>>): number {
  if (isSick(s, e) || (e.leaving !== null && e.leaving <= s.day)) return 0;
  const li = cache?.get(e.dept) ?? leadInfo(s, e.dept);
  const skillF = 0.7 + (e.skill / 100) * 0.6;
  const satF = 0.75 + (e.sat / 100) * 0.4;
  const healthF = e.health < 30 ? 0.75 : e.health < 50 ? 0.9 : 1;
  const policy = workPolicy(s.company.workPolicy).output;
  const wf = 1 + welfareSum(s, 'output');
  let tf = 1 + traitFx(e, 'output');
  if ((e.dept === 'design' || e.dept === 'marketing') && hasTrait(e, 'creative')) tf += 0.2;
  if ((e.dept === 'sales' || e.dept === 'marketing') && hasTrait(e, 'social')) tf += 0.2;
  const moving = s.company.movingUntil !== null ? 0.4 : 1;
  const ai = aiMultiplier(s, e);
  return gradeOutput(e.grade) * skillF * satF * healthF * policy * wf * tf * li.span * (1 + li.bonus) * ai * approveMultiplier(s) * (1 + mod(s, 'output')) * moving;
}

export function deptOutput(s: GameState, d: DeptId): number {
  const cache = new Map<DeptId, ReturnType<typeof leadInfo>>([[d, leadInfo(s, d)]]);
  return deptMembers(s, d).reduce((a, e) => a + output(s, e, cache), 0);
}

export function allDeptOutputs(s: GameState): Record<DeptId, number> {
  const out: Record<string, number> = {};
  const cache = new Map<DeptId, ReturnType<typeof leadInfo>>();
  for (const d of DATA.depts.departments) cache.set(d.id as DeptId, leadInfo(s, d.id as DeptId));
  for (const d of DATA.depts.departments) out[d.id] = 0;
  for (const e of s.employees) out[e.dept] += output(s, e, cache);
  return out as Record<DeptId, number>;
}

// 만족도 목표와 그 이유(직원 상세에서 보여줌)
export function satTarget(s: GameState, e: Employee): { value: number; parts: { label: string; v: number }[] } {
  const parts: { label: string; v: number }[] = [];
  parts.push({ label: '기본', v: 60 });
  const ratio = e.salary / marketSalary(s, e.dept, e.grade);
  const founding = e.kind !== 'staff';
  parts.push({ label: `월급(시장 대비 ${(ratio * 100).toFixed(0)}%)`, v: Math.max(-25, Math.min(20, (ratio - 1) * (founding ? 40 : 80))) });
  if (founding) parts.push({ label: '창업 멤버(주인 의식)', v: 12 });
  const wf = welfareSum(s, 'sat');
  if (wf) parts.push({ label: '복지', v: wf });
  const comfort = officeComfort(s);
  if (comfort) parts.push({ label: '사무실 쾌적도', v: comfort });
  const pol = workPolicy(s.company.workPolicy);
  let pv = pol.sat;
  if (s.company.workPolicy === 'crunch') pv += traitFx(e, 'crunchSat');
  if (pv) parts.push({ label: `근무 방침(${pol.name})`, v: pv });
  const hist = s.plHistory;
  if (hist.length >= 3) {
    const a = hist[hist.length - 3].revenue;
    const b = hist[hist.length - 1].revenue;
    const g = a > 0 ? (b - a) / a : b > 0 ? 1 : 0;
    const v = g > 0.2 ? 6 : g > 0.05 ? 3 : g < -0.1 ? -6 : 0;
    if (v) parts.push({ label: '회사 성장세', v });
  }
  const culture = Math.round(s.company.culture);
  if (culture) parts.push({ label: '조직 문화(인사팀)', v: culture });
  if (unvestedOptions(s, e) > 0) parts.push({ label: '스톡옵션', v: 6 });
  const ts = traitFx(e, 'sat');
  if (ts) parts.push({ label: '성격', v: ts });
  let team = 0;
  for (const o of deptMembers(s, e.dept)) if (o.id !== e.id) team += traitFx(o, 'team');
  if (team) parts.push({ label: '동료', v: Math.max(-10, Math.min(8, team)) });
  const aiA = s.ai.adoption[e.dept] ?? 0;
  const aiS = traitFx(e, 'aiSat') * aiA;
  if (Math.abs(aiS) >= 0.5) parts.push({ label: 'AI 도구', v: aiS });
  if (e.lead) parts.push({ label: '팀장', v: 5 });
  const li = leadInfo(s, e.dept);
  if (li.needed > li.have && !e.lead) parts.push({ label: '팀장 없음(관리 부족)', v: -4 });
  const m = mod(s, 'sat');
  if (m) parts.push({ label: '최근 일', v: m });
  if (s.company.movingUntil === null && s.employees.length > 0) {
    // 좌석 꽉 참: 붐빔
    const zone = s.seats.filter((x) => x.zone === e.dept);
    if (zone.length > 0 && zone.every((x) => x.occupant !== null) && zone.length >= 4) parts.push({ label: '자리가 비좁음', v: -3 });
  }
  const value = Math.max(0, Math.min(100, parts.reduce((a, p) => a + p.v, 0)));
  return { value, parts };
}

export function healthTarget(s: GameState, e: Employee): number {
  return Math.max(5, Math.min(100, 78 + welfareSum(s, 'health') + workPolicy(s.company.workPolicy).health + traitFx(e, 'health') + officeComfort(s) / 2));
}

// 하루 처리: 만족도·건강·숙련이 목표를 따라가고, 병가가 생기고, 퇴사 예정자가 떠납니다.
export function staffDay(s: GameState) {
  const train = (s.company.orders.hr === 'hr_training' ? 0.6 : 0) + welfareSum(s, 'skill');
  for (const e of [...s.employees]) {
    if (e.leaving !== null && s.day >= e.leaving) {
      removeEmployee(s, e, 'quit');
      continue;
    }
    const st = satTarget(s, e).value;
    e.sat += (st - e.sat) * 0.035;
    const ht = healthTarget(s, e);
    e.health += (ht - e.health) * 0.03;
    const mentor = deptMembers(s, e.dept).some((o) => o.id !== e.id && hasTrait(o, 'mentor')) ? 0.5 : 0;
    e.skill = Math.min(100, e.skill + 0.035 * (1 + train + mentor + traitFx(e, 'skill')) * (1 - e.skill / 105));
    if (e.sickUntil !== null && e.sickUntil <= s.day) e.sickUntil = null;
    if (e.sickUntil === null && e.health < 35 && rand(s) < (35 - e.health) / 600) {
      const fast = s.company.welfare.includes('medical');
      e.sickUntil = s.day + randInt(s, fast ? 2 : 4, fast ? 5 : 10);
      e.bubble = { text: '🤒', until: e.sickUntil };
      notify(s, `${e.name}님이 건강이 나빠져 병가를 냈습니다.`, 'bad', 'employees');
    }
    if (e.bubble && e.bubble.until <= s.day) e.bubble = null;
    if (!e.bubble && e.sat < 30 && rand(s) < 0.02) e.bubble = { text: '😠', until: s.day + 3 };
  }
}

// 달마다: 퇴사 판정(EM-04), 1월 연봉 인상
export function staffMonth(s: GameState, january: boolean) {
  const econQuit = s.economy.phase === 'boom' ? 1.3 : s.economy.phase === 'recession' ? 0.7 : 1;
  for (const e of s.employees) {
    if (e.leaving !== null) continue;
    let p = 0.006 + Math.max(0, (55 - e.sat) / 100) * 0.3;
    p *= Math.max(0.2, 1 + traitFx(e, 'quit')) * econQuit;
    if (unvestedOptions(s, e) > 0) p *= 0.6;
    if (e.kind === 'cofounder') p *= 0.25;
    if (hasTrait(e, 'ambitious') && !e.lead && s.day - e.joinedDay > 540) p += 0.02;
    if (rand(s) < p) {
      e.leaving = s.day + 14;
      e.bubble = { text: '📦', until: e.leaving };
      notify(s, `${e.name}님이 퇴사 의사를 밝혔습니다(2주 뒤). 만족도 ${Math.round(e.sat)}.`, 'bad', 'employees');
      post(s, teamChannelId(e.dept), e.name, '대표님, 고민 끝에 회사를 떠나기로 했습니다. 2주 동안 인수인계하겠습니다.', 'npc');
    }
  }
  if (january && s.company.raiseRate > 0) {
    for (const e of s.employees) e.salary = Math.round((e.salary * (1 + s.company.raiseRate)) / 10000) * 10000;
    notify(s, `새해 연봉 인상 ${Math.round(s.company.raiseRate * 100)}%를 적용했습니다.`, 'info', 'employees');
  }
}

export function removeEmployee(s: GameState, e: Employee, why: 'quit' | 'fired' | 'event') {
  releaseSeat(s, e);
  forfeitOptions(s, e);
  s.employees = s.employees.filter((x) => x.id !== e.id);
  onEmployeeLeft(s, e, why);
  if (why === 'fired') s.stats.fired++;
  else s.stats.quits++;
  // 남은 동료 분위기
  addMod(s, 'sat', why === 'fired' ? -3 : -1, 30, why === 'fired' ? '동료 해고' : '동료 퇴사');
}

// EM-04 해고: 1달치 월급, 팀 분위기 하락
export function fire(s: GameState, empId: string): string | null {
  const e = employee(s, empId);
  if (!e) return '직원을 찾을 수 없습니다.';
  if (e.kind === 'cofounder') return '코파운더는 해고할 수 없습니다.';
  book(s, `${e.name} 해고 위로금(1개월분)`, -severance(e));
  s.accrual.other += severance(e);
  float(s, '해고', 'bad', e.seatId ?? undefined);
  removeEmployee(s, e, 'fired');
  return null;
}

export function promoteLead(s: GameState, empId: string): string | null {
  const e = employee(s, empId);
  if (!e) return '직원을 찾을 수 없습니다.';
  if (e.lead) return '이미 팀장입니다.';
  const li = leadInfo(s, e.dept);
  if (li.n < 4) return '부서 인원이 4명 이상일 때 팀장을 세울 수 있습니다.';
  if (li.have >= Math.max(1, li.needed)) return `이 부서 팀장 자리(${Math.max(1, li.needed)}명)가 다 찼습니다.`;
  e.lead = true;
  e.salary = Math.round((e.salary * 1.15) / 10000) * 10000;
  e.sat = Math.min(100, e.sat + 12);
  e.bubble = { text: '⭐', until: s.day + 5 };
  post(s, teamChannelId(e.dept), '시스템', `${e.name}님이 ${dept(e.dept).name}팀 팀장이 되었습니다(월급 15% 인상).`, 'system');
  return null;
}

export function demoteLead(s: GameState, empId: string): string | null {
  const e = employee(s, empId);
  if (!e || !e.lead) return '팀장이 아닙니다.';
  e.lead = false;
  e.sat = Math.max(0, e.sat - 15);
  return null;
}

export function giveRaise(s: GameState, empId: string, rate: number): string | null {
  const e = employee(s, empId);
  if (!e) return '직원을 찾을 수 없습니다.';
  if (s.day - e.lastRaiseDay < 90) return '최근 90일 안에 이미 올려 주었습니다.';
  e.salary = Math.round((e.salary * (1 + rate)) / 10000) * 10000;
  e.lastRaiseDay = s.day;
  e.sat = Math.min(100, e.sat + rate * 60);
  e.bubble = { text: '💰', until: s.day + 3 };
  return null;
}

export function avgSat(s: GameState): number {
  return s.employees.length ? s.employees.reduce((a, e) => a + e.sat, 0) / s.employees.length : 70;
}

export function avgHealth(s: GameState): number {
  return s.employees.length ? s.employees.reduce((a, e) => a + e.health, 0) / s.employees.length : 80;
}

export function startSkill(s: GameState, g: Grade, years: number): number {
  const base = { C: 25, B: 40, A: 55, S: 70 }[g];
  return Math.min(95, base + Math.min(15, years * 1.5) + randInt(s, 0, 8));
}
