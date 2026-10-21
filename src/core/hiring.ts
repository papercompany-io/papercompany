// F04 채용: HR-01 고용, HR-04 채용 공고, HR-05 지원자, HR-06 채용 확정과 입사 처리
import { DATA, dept, specEffects } from './data';
import { seatsAvailable, freeSeats } from './employees';
import { projectedMonthlyPayroll, spendNow } from './finance';
import { nextId } from './ids';
import { onEmployeeJoined } from './messenger';
import { pick, poisson, rand, randInt, weighted } from './rng';
import type { Applicant, DeptId, Employee, GameState, Grade, Posting } from './types';

const H = DATA.hiring;

export interface PostingInput {
  dept: DeptId;
  headcount: number;
  salaryLevel: string;
  durationDays: number;
  promo: string;
}

// HR-04 예외: 빈 좌석이 인원보다 적으면 경고, 좌석이 모두 찼으면 공고 불가(DEC-020)
export function postingWarnings(s: GameState, d: DeptId, headcount: number): string[] {
  const free = seatsAvailable(s, d);
  const out: string[] = [];
  if (free === 0) out.push(`${dept(d).name} 구역 좌석이 모두 찼습니다. 공고를 올릴 수 없습니다.`);
  else if (free < headcount) out.push(`${dept(d).name} 구역 빈자리가 ${free}석뿐입니다. ${free}명까지만 뽑을 수 있습니다.`);
  return out;
}

export function createPosting(s: GameState, input: PostingInput): string | null {
  if (s.ended) return '게임이 끝났습니다.';
  if (seatsAvailable(s, input.dept) === 0) return `${dept(input.dept).name} 구역 좌석이 모두 찼습니다.`;
  if (input.headcount < 1 || input.headcount > H.maxHeadcountPerPosting) return `인원은 1~${H.maxHeadcountPerPosting}명입니다.`;
  const promo = H.promos.find((p) => p.id === input.promo);
  if (!promo) return '홍보 수준을 고르세요.';
  if (promo.cost > s.cash) return '홍보비를 낼 자금이 부족합니다.';
  if (!H.durations.includes(input.durationDays)) return '공고 기간을 고르세요.';
  const p: Posting = {
    id: nextId(s, 'p'),
    dept: input.dept,
    headcount: input.headcount,
    salaryLevel: input.salaryLevel,
    durationDays: input.durationDays,
    promo: input.promo,
    startDay: s.day,
    endDay: s.day + input.durationDays,
    status: 'open',
    hired: 0,
  };
  s.postings.push(p);
  spendNow(s, `채용 홍보비(${dept(input.dept).name} 공고)`, promo.cost, 'recruiting');
  return null;
}

function makeName(s: GameState): string {
  const used = new Set([...s.employees.map((e) => e.name), ...s.applicants.map((a) => a.name)]);
  for (let i = 0; i < 20; i++) {
    const n = pick(s, DATA.names.surnames) + pick(s, DATA.names.given);
    if (!used.has(n)) return n;
  }
  return pick(s, DATA.names.surnames) + pick(s, DATA.names.given);
}

// HR-05 지원자 생성: 수는 홍보·연봉·회사 단계·네트워크, 질은 연봉·창업자 스펙(FS-03 지원자 질)
export function addApplicants(s: GameState, p: Posting, count: number) {
  const level = H.salaryLevels.find((l) => l.id === p.salaryLevel) ?? H.salaryLevels[1];
  const qb = (specEffects(s.founder.picks).applicantQuality + level.qualityShift * 10) / 100;
  const w = H.gradeWeights;
  const weights = [Math.max(1, w[0] * (1 - qb)), w[1], w[2] * (1 + 2 * qb), w[3] * (1 + 2 * qb)];
  for (let i = 0; i < count; i++) {
    const grade = weighted(s, H.grades as Grade[], weights);
    const [y0, y1] = (H.gradeYears as Record<Grade, number[]>)[grade];
    const base = dept(p.dept).baseSalary * (H.gradeSalary as Record<Grade, number>)[grade] * level.salaryMult;
    const a: Applicant = {
      id: nextId(s, 'a'),
      postingId: p.id,
      name: makeName(s),
      dept: p.dept,
      years: randInt(s, y0, y1),
      desiredSalary: Math.round(base / 10000) * 10000,
      grade,
      arrivedDay: s.day,
      leaveDay: s.day + H.applicantStayDays,
      status: 'waiting',
    };
    s.applicants.push(a);
  }
}

export function arrivalRate(s: GameState, p: Posting): number {
  const level = H.salaryLevels.find((l) => l.id === p.salaryLevel) ?? H.salaryLevels[1];
  const promo = H.promos.find((x) => x.id === p.promo) ?? H.promos[0];
  const stageMult = (H.stageArrivalMult as Record<string, number>)[s.fundingStage ?? 'none'] ?? 1;
  const net = 1 + (s.networkPoints / 100) * H.networkArrivalBonusPer100;
  return H.baseArrivalPerDay * level.arrivalMult * promo.arrivalMult * stageMult * net;
}

export function hiringDayEnd(s: GameState) {
  for (const a of s.applicants) {
    if (a.status === 'waiting' && s.day >= a.leaveDay) a.status = 'left';
  }
  for (const p of s.postings) {
    if (p.status !== 'open') continue;
    if (s.day >= p.endDay || p.hired >= p.headcount) {
      p.status = 'closed';
      continue;
    }
    addApplicants(s, p, poisson(s, arrivalRate(s, p)));
  }
}

// HR-06 예외: 다음 달 월급을 낼 자금이 없을 것으로 보이면 확정 전에 경고(FN-01)
export function hireWarning(s: GameState, salary: number): string | null {
  const need = projectedMonthlyPayroll(s, salary);
  if (s.cash < need)
    return `이 사람까지 뽑으면 한 달 인건비(입사 대기자 포함)가 약 ${Math.round(need / 1e4).toLocaleString('ko-KR')}만원인데, 지금 자금은 ${Math.round(s.cash / 1e4).toLocaleString('ko-KR')}만원입니다. 자금이 0 이하로 월급일을 넘기면 파산합니다.`;
  return null;
}

// HR-06 채용 제안: 희망 연봉 그대로 또는 10% 낮게(거절 확률)
export function offerJob(s: GameState, applicantId: string, lowball: boolean): { ok: boolean; message: string } {
  const a = s.applicants.find((x) => x.id === applicantId);
  if (!a || a.status !== 'waiting') return { ok: false, message: '지원자를 찾을 수 없습니다.' };
  const p = s.postings.find((x) => x.id === a.postingId)!;
  if (p.hired >= p.headcount) return { ok: false, message: '이 공고의 모집 인원을 모두 채웠습니다.' };
  if (freeSeats(s, a.dept).length === 0) return { ok: false, message: `${dept(a.dept).name} 구역에 빈자리가 없습니다.` };
  const salary = lowball ? Math.round((a.desiredSalary * H.lowballRate) / 10000) * 10000 : a.desiredSalary;
  if (lowball && rand(s) < H.lowballRejectChance) {
    a.status = 'rejected';
    return { ok: false, message: `${a.name}님이 월급 ${(salary / 1e4).toLocaleString('ko-KR')}만원 제안을 거절했습니다.` };
  }
  a.status = 'hired';
  p.hired += 1;
  if (p.hired >= p.headcount) p.status = 'closed';
  const seat = freeSeats(s, a.dept)[0];
  seat.occupant = `pending:${a.id}`;
  s.pendingHires.push({ applicantId: a.id, name: a.name, dept: a.dept, grade: a.grade, years: a.years, salary, startDay: s.day + 1 });
  s.events.push({ type: 'autosave', reason: '채용 확정' });
  return { ok: true, message: `${a.name}님이 월급 ${(salary / 1e4).toLocaleString('ko-KR')}만원에 입사를 수락했습니다. 내일 출근합니다.` };
}

// HR-06 입사일: 직원 목록·부서·좌석·인건비·메신저에 반영
export function startPendingHires(s: GameState) {
  const due = s.pendingHires.filter((h) => h.startDay <= s.day);
  s.pendingHires = s.pendingHires.filter((h) => h.startDay > s.day);
  for (const h of due) {
    const seat = s.seats.find((x) => x.occupant === `pending:${h.applicantId}`) ?? null;
    const e: Employee = {
      id: nextId(s, 'e'),
      name: h.name,
      dept: h.dept,
      roleDept: h.dept,
      salary: h.salary,
      grade: h.grade,
      years: h.years,
      joinedDay: s.day,
      seatId: seat ? seat.id : null,
      kind: 'staff',
      instructionId: null,
      lastResult: null,
    };
    if (seat) seat.occupant = e.id;
    s.employees.push(e);
    onEmployeeJoined(s, e);
  }
}
