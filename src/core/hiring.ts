// F04 채용: HR-01 고용, HR-04 채용 공고, HR-05 지원자(EM-03 특성 포함), HR-06 채용 확정과 입사, HR-07 인사팀 위임 채용
import { DATA, dept, specEffects, trait } from './data';
import { seatsAvailable, freeSeats } from './office';
import { projectedMonthlyPayroll, spendNow } from './finance';
import { nextId } from './ids';
import { onEmployeeJoined } from './messenger';
import { econ } from './economy';
import { legacyFx } from './career';
import { deptUnlocked } from './employees';
import { float, notify } from './notify';
import { pick, poisson, rand, randInt, weighted } from './rng';
import { marketSalary, startSkill, welfareApply, welfareQuality } from './staff';
import type { Applicant, DeptId, Employee, GameState, Grade, Posting } from './types';

const H = DATA.hiring;

export interface PostingInput {
  dept: DeptId;
  headcount: number;
  salaryLevel: string;
  durationDays: number;
  promo: string;
}

export function postingWarnings(s: GameState, d: DeptId, headcount: number): string[] {
  const free = seatsAvailable(s, d);
  const out: string[] = [];
  if (free === 0) out.push(`${dept(d).name} 구역 좌석이 모두 찼습니다. 더 큰 사무실로 옮기거나(부동산 앱) 다른 부서로 공고하세요.`);
  else if (free < headcount) out.push(`${dept(d).name} 구역 빈자리가 ${free}석뿐입니다. ${free}명까지만 뽑을 수 있습니다.`);
  return out;
}

export function createPosting(s: GameState, input: PostingInput): string | null {
  if (s.ended) return '회사가 끝났습니다.';
  if (!deptUnlocked(s, input.dept)) return `${dept(input.dept).name} 부서는 회사 단계 ${dept(input.dept).stage}부터 둘 수 있습니다.`;
  if (seatsAvailable(s, input.dept) === 0) return `${dept(input.dept).name} 구역 좌석이 모두 찼습니다.`;
  if (input.headcount < 1 || input.headcount > H.maxHeadcountPerPosting) return `인원은 1~${H.maxHeadcountPerPosting}명입니다.`;
  const promo = H.promos.find((p) => p.id === input.promo);
  if (!promo) return '홍보 수준을 고르세요.';
  if (promo.cost > s.cash) return '홍보비를 낼 자금이 부족합니다.';
  if (!H.durations.includes(input.durationDays)) return '공고 기간을 고르세요.';
  const p: Posting = { id: nextId(s, 'p'), dept: input.dept, headcount: input.headcount, salaryLevel: input.salaryLevel, durationDays: input.durationDays, promo: input.promo, startDay: s.day, endDay: s.day + input.durationDays, status: 'open', hired: 0 };
  s.postings.push(p);
  spendNow(s, `채용 홍보비(${dept(input.dept).name} 공고)`, promo.cost, 'recruiting');
  return null;
}

export function closePosting(s: GameState, id: string) {
  const p = s.postings.find((x) => x.id === id);
  if (p) p.status = 'closed';
}

function makeName(s: GameState): string {
  const used = new Set([...s.employees.map((e) => e.name), ...s.applicants.filter((a) => a.status === 'waiting').map((a) => a.name)]);
  for (let i = 0; i < 20; i++) {
    const n = pick(s, DATA.names.surnames) + pick(s, DATA.names.given);
    if (!used.has(n)) return n;
  }
  return pick(s, DATA.names.surnames) + pick(s, DATA.names.given);
}

export function rollTraits(s: GameState): string[] {
  const ids = DATA.traits.traits.map((t) => t.id);
  const n = rand(s) < 0.75 ? 2 : 1;
  const out: string[] = [];
  while (out.length < n) {
    const t = pick(s, ids);
    if (out.includes(t)) continue;
    if ((t === 'ai_friendly' && out.includes('ai_skeptic')) || (t === 'ai_skeptic' && out.includes('ai_friendly'))) continue;
    out.push(t);
  }
  return out;
}

export function applicantQualityBonus(s: GameState, levelShift: number): number {
  return (specEffects(s.founder.picks).applicantQuality + levelShift * 10 + welfareQuality(s) + legacyFx(s, 'applicantQuality') + Math.min(10, s.career.rep / 5)) / 100;
}

export function rollApplicant(s: GameState, d: DeptId, levelId: string, postingId: string): Applicant {
  const level = H.salaryLevels.find((l) => l.id === levelId) ?? H.salaryLevels[1];
  const qb = applicantQualityBonus(s, level.qualityShift);
  const w = H.gradeWeights;
  const weights = [Math.max(1, w[0] * (1 - qb)), w[1], w[2] * (1 + 2 * qb), w[3] * (1 + 2 * qb)];
  const grade = weighted(s, H.grades as Grade[], weights);
  const [y0, y1] = (H.gradeYears as Record<Grade, number[]>)[grade];
  const base = marketSalary(s, d, grade) * level.salaryMult;
  return {
    id: nextId(s, 'a'),
    postingId,
    name: makeName(s),
    dept: d,
    years: randInt(s, y0, y1),
    desiredSalary: Math.round(base / 10000) * 10000,
    grade,
    traits: rollTraits(s),
    arrivedDay: s.day,
    leaveDay: s.day + H.applicantStayDays,
    status: 'waiting',
  };
}

export function addApplicants(s: GameState, p: Posting, count: number) {
  for (let i = 0; i < count; i++) s.applicants.push(rollApplicant(s, p.dept, p.salaryLevel, p.id));
}

function stageMult(s: GameState) {
  return (H.stageArrivalMult as Record<string, number>)[s.fundingStage ?? 'none'] ?? 1;
}

export function hrBoost(s: GameState): number {
  const hr = s.employees.filter((e) => e.dept === 'hr').length;
  return s.company.orders.hr === 'hr_recruit' || !s.company.orders.hr ? 1 + 0.25 * hr : 1 + 0.08 * hr;
}

export function arrivalRate(s: GameState, p: Posting): number {
  const level = H.salaryLevels.find((l) => l.id === p.salaryLevel) ?? H.salaryLevels[1];
  const promo = H.promos.find((x) => x.id === p.promo) ?? H.promos[0];
  const net = 1 + Math.min(0.6, (s.networkPoints / 100) * H.networkArrivalBonusPer100); // 인맥 효과는 +60%까지(A-68)
  const brand = 1 + Math.min(1.5, s.company.peakUsers > 0 ? Math.log10(1 + s.company.peakUsers) / 6 : 0) + Math.min(0.5, s.career.rep / 100);
  return H.baseArrivalPerDay * level.arrivalMult * promo.arrivalMult * stageMult(s) * net * brand * (1 + welfareApply(s)) * econ(s, 'apply') * hrBoost(s);
}

export function hiringDayEnd(s: GameState) {
  for (const a of s.applicants) if (a.status === 'waiting' && s.day >= a.leaveDay) a.status = 'left';
  // 오래된 지원자 기록은 정리(저장 크기)
  s.applicants = s.applicants.filter((a) => a.status === 'waiting' || s.day - a.arrivedDay < 30);
  for (const p of s.postings) {
    if (p.status !== 'open') continue;
    if (s.day >= p.endDay || p.hired >= p.headcount) {
      p.status = 'closed';
      continue;
    }
    // 한 공고에 기다리는 지원자는 모집 인원 × 6 + 4명까지(A-68): 고를 만큼은 오되 목록이 수백 명으로 쌓이지 않게
    const waitingHere = s.applicants.filter((a) => a.postingId === p.id && a.status === 'waiting').length;
    const room = Math.max(0, (p.headcount - p.hired) * 6 + 4 - waitingHere);
    const n = Math.min(room, poisson(s, arrivalRate(s, p)));
    if (n > 0) {
      addApplicants(s, p, n);
      notify(s, `채용: ${dept(p.dept).name} 공고에 지원자 ${n}명이 들어왔습니다(${H.applicantStayDays}일 동안 기다림).`, 'info', 'hiring');
    }
  }
  s.postings = s.postings.filter((p) => p.status === 'open' || s.day - p.endDay < 60);
  autoHireDay(s);
}

export function hireWarning(s: GameState, salary: number): string | null {
  const need = projectedMonthlyPayroll(s, salary);
  if (s.cash < need) return `이 사람까지 뽑으면 한 달 인건비(입사 대기자 포함)가 약 ${Math.round(need / 1e4).toLocaleString('ko-KR')}만원인데, 지금 자금은 ${Math.round(s.cash / 1e4).toLocaleString('ko-KR')}만원입니다. 자금이 0 이하로 월급일을 넘기면 파산합니다.`;
  return null;
}

export function offerJob(s: GameState, applicantId: string, lowball: boolean): { ok: boolean; message: string } {
  const a = s.applicants.find((x) => x.id === applicantId);
  if (!a || a.status !== 'waiting') return { ok: false, message: '지원자를 찾을 수 없습니다.' };
  const p = s.postings.find((x) => x.id === a.postingId);
  if (p && p.hired >= p.headcount) return { ok: false, message: '이 공고의 모집 인원을 모두 채웠습니다.' };
  if (freeSeats(s, a.dept).length === 0) return { ok: false, message: `${dept(a.dept).name} 구역에 빈자리가 없습니다.` };
  const salary = lowball ? Math.round((a.desiredSalary * H.lowballRate) / 10000) * 10000 : a.desiredSalary;
  if (lowball && rand(s) < H.lowballRejectChance) {
    a.status = 'rejected';
    return { ok: false, message: `${a.name}님이 월급 ${(salary / 1e4).toLocaleString('ko-KR')}만원 제안을 거절했습니다.` };
  }
  a.status = 'hired';
  if (p) {
    p.hired += 1;
    if (p.hired >= p.headcount) p.status = 'closed';
  }
  reserve(s, a, salary);
  return { ok: true, message: `${a.name}님이 월급 ${(salary / 1e4).toLocaleString('ko-KR')}만원에 입사를 수락했습니다. 내일 출근합니다.` };
}

function reserve(s: GameState, a: Applicant, salary: number) {
  const seat = freeSeats(s, a.dept)[0];
  seat.occupant = `pending:${a.id}`;
  s.pendingHires.push({ applicantId: a.id, name: a.name, dept: a.dept, grade: a.grade, years: a.years, salary, traits: a.traits, startDay: s.day + 1 });
  s.events.push({ type: 'autosave', reason: '채용 확정' });
}

export function rejectApplicant(s: GameState, id: string) {
  const a = s.applicants.find((x) => x.id === id);
  if (a && a.status === 'waiting') a.status = 'rejected';
}

export function startPendingHires(s: GameState) {
  const due = s.pendingHires.filter((h) => h.startDay <= s.day);
  s.pendingHires = s.pendingHires.filter((h) => h.startDay > s.day);
  for (const h of due) {
    const seat = s.seats.find((x) => x.occupant === `pending:${h.applicantId}`) ?? null;
    const e: Employee = {
      id: nextId(s, 'e'),
      name: h.name,
      dept: h.dept,
      salary: h.salary,
      grade: h.grade,
      years: h.years,
      joinedDay: s.day,
      seatId: seat ? seat.id : null,
      kind: 'staff',
      traits: h.traits,
      skill: startSkill(s, h.grade, h.years),
      sat: 72,
      health: 85,
      lead: false,
      options: 0,
      optionDay: null,
      sickUntil: null,
      leaving: null,
      lastRaiseDay: s.day,
      bubble: { text: '📦', until: s.day + 2 },
    };
    if (seat) seat.occupant = e.id;
    s.employees.push(e);
    s.stats.hires += 1;
    onEmployeeJoined(s, e);
    s.events.push({ type: 'hired', empId: e.id });
    float(s, `+${dept(h.dept).name}`, 'good', seat?.id);
  }
  s.company.peakEmployees = Math.max(s.company.peakEmployees, s.employees.length);
}

// HR-07 인사팀 위임 채용: 부서별 목표 인원까지 인사팀이 알아서 뽑습니다(인사팀 인원이 많을수록 빠름).
export function setAutoHire(s: GameState, d: DeptId, target: number): string | null {
  if (!s.employees.some((e) => e.dept === 'hr')) return '인사팀이 있어야 채용을 맡길 수 있습니다.';
  s.company.autoHire[d] = Math.max(0, Math.round(target));
  return null;
}

function autoHireDay(s: GameState) {
  const hr = s.employees.filter((e) => e.dept === 'hr' && !(e.sickUntil && e.sickUntil > s.day)).length;
  if (!hr) return;
  const speed = 0.12 * hr * (s.company.orders.hr === 'hr_recruit' ? 1.6 : 1) * econ(s, 'apply');
  for (const [d, target] of Object.entries(s.company.autoHire) as [DeptId, number][]) {
    if (!target) continue;
    const have = s.employees.filter((e) => e.dept === d && e.leaving === null).length + s.pendingHires.filter((h) => h.dept === d).length;
    if (have >= target || freeSeats(s, d).length === 0) continue;
    if (rand(s) >= Math.min(0.9, speed)) continue;
    const a = rollApplicant(s, d, s.company.autoHireLevel, 'auto');
    // 인사팀은 C등급을 한 번 걸러 냅니다.
    if (a.grade === 'C' && rand(s) < 0.5) continue;
    if (s.cash < projectedMonthlyPayroll(s, a.desiredSalary) * 1.2) {
      notify(s, '위임 채용: 자금이 넉넉하지 않아 인사팀이 채용을 잠시 멈췄습니다.', 'bad', 'hiring');
      s.company.autoHire = {};
      return;
    }
    spendNow(s, `위임 채용 수수료(${dept(d).name})`, Math.round(a.desiredSalary * 0.3), 'recruiting');
    a.status = 'hired';
    s.applicants.push(a);
    reserve(s, a, a.desiredSalary);
  }
}

export function traitNames(ids: string[]): string {
  return ids.map((t) => trait(t)?.name ?? t).join(' · ');
}
