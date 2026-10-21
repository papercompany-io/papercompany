// EM-01 직원 목록, EM-02 부서 배치(좌석은 다음 날 옮김), EM-04 해고(DEC-022: 1달치 월급)
import { DATA, DEPT_IDS, dept } from './data';
import { onDeptChanged } from './messenger';
import { freeSeats } from './office';
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
  return s.company.stage >= dept(d).stage;
}

export function moveDept(s: GameState, empId: string, to: DeptId): string | null {
  const e = employee(s, empId);
  if (!e) return '직원을 찾을 수 없습니다.';
  if (e.dept === to) return '이미 그 부서입니다.';
  if (!deptUnlocked(s, to)) return `${dept(to).name} 부서는 회사 단계 ${dept(to).stage}부터 둘 수 있습니다.`;
  const needSeat = e.kind !== 'cofounder';
  let reserved: Seat | null = null;
  if (needSeat) {
    reserved = freeSeats(s, to)[0] ?? null;
    if (!reserved) return `${dept(to).name} 구역에 빈자리가 없습니다.`;
    reserved.occupant = `moving:${e.id}`;
  }
  const from = e.dept;
  e.dept = to;
  if (e.lead) e.lead = false;
  e.skill = Math.max(10, e.skill * 0.7); // 다른 직무라 숙련이 일부 줄어듭니다.
  onDeptChanged(s, e, from);
  return null;
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
