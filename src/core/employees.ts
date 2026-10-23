// EM-01 직원 목록, EM-02 부서 배치(채용 때 정함, 부서 이동 없음 A-220), EM-04 해고(DEC-022: 1달치 월급)
import { DATA, DEPT_IDS, dept } from './data';
import type { DeptId, Employee, GameState, Seat } from './types';

export function deptMembers(s: GameState, d: DeptId): Employee[] {
  return s.employees.filter((e) => e.dept === d);
}

export function headcountByDept(s: GameState): Record<DeptId, number> {
  const out = Object.fromEntries(DEPT_IDS.map((d) => [d, 0])) as Record<DeptId, number>;
  for (const e of s.employees) out[e.dept]++;
  return out;
}

export function employee(s: GameState, id: string): Employee | undefined {
  return s.employees.find((e) => e.id === id);
}

export function staffCount(s: GameState): number {
  return s.employees.length;
}

export function deptUnlocked(s: GameState, d: DeptId): boolean {
  return deptInIndustry(s, d) && s.company.stage >= dept(d).stage;
}

// 이 산업에 있는 부서인지(A-182 광고 운영은 광고 판매 산업만). 없는 부서는 목록에서도 숨김
export function deptInIndustry(s: GameState, d: DeptId): boolean {
  const only = dept(d).industries;
  return !only || only.includes(s.company.industry);
}

export function applySeatMoves(s: GameState) {
  for (const seat of s.seats) {
    if (seat.occupant && seat.occupant.startsWith('moving:')) {
      const id = seat.occupant.slice(7);
      const e = employee(s, id);
      if (!e) {
        seat.occupant = null;
        continue;
      }
      const old = s.seats.find((x) => x.id === e.seatId);
      if (old && old !== seat) old.occupant = null;
      seat.occupant = e.id;
      e.seatId = seat.id;
    }
  }
}

export function releaseSeat(s: GameState, e: Employee) {
  for (const seat of s.seats) if (seat.occupant === e.id || seat.occupant === `moving:${e.id}`) seat.occupant = null;
  e.seatId = null;
}

export function severance(e: Employee): number {
  return e.salary * DATA.finance.severanceMonths;
}
