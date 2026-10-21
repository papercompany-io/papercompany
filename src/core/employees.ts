// EM-01 직원 목록과 상세, EM-02 부서 배치, OF-02 부서별 좌석 점유
import { DATA, DEPT_IDS, dept } from './data';
import { onDeptChanged } from './messenger';
import type { DeptId, Employee, GameState, Seat } from './types';

export function buildSeats(): Seat[] {
  const o = DATA.office;
  const seats: Seat[] = [
    { id: 'ceo', zone: 'ceo', gx: o.ceoSeat.x, gy: o.ceoSeat.y, occupant: 'ceo' },
    { id: 'exec', zone: 'exec', gx: o.execSeat.x, gy: o.execSeat.y, occupant: null },
  ];
  for (const z of o.zones) {
    const n = dept(z.dept as DeptId).seats;
    for (let i = 0; i < n; i++) {
      seats.push({ id: `${z.dept}-${i}`, zone: z.dept as DeptId, gx: z.x + (i % 2) * 2, gy: z.y + Math.floor(i / 2) * 2, occupant: null });
    }
  }
  return seats;
}

export function freeSeats(s: GameState, d: DeptId): Seat[] {
  return s.seats.filter((x) => x.zone === d && x.occupant === null);
}

// 입사 예정자(다음 날 입사)도 좌석을 미리 잡습니다.
export function seatsAvailable(s: GameState, d: DeptId): number {
  return freeSeats(s, d).length;
}

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

// EM-02 부서 이동: 새 부서 구역에 빈자리가 있어야 하고, 좌석은 다음 게임 날 옮깁니다.
export function moveDept(s: GameState, empId: string, to: DeptId): string | null {
  const e = employee(s, empId);
  if (!e) return '직원을 찾을 수 없습니다.';
  if (e.dept === to) return '이미 그 부서입니다.';
  if (e.instructionId) return '진행 중인 지시가 끝난 뒤 옮길 수 있습니다.';
  const needSeat = e.kind !== 'cofounder';
  let reserved: Seat | null = null;
  if (needSeat) {
    reserved = freeSeats(s, to)[0] ?? null;
    if (!reserved) return `${dept(to).name} 구역에 빈자리가 없습니다.`;
    reserved.occupant = `moving:${e.id}`;
  }
  const from = e.dept;
  e.dept = to;
  onDeptChanged(s, e, from);
  return null;
}

// 다음 날: 예약된 좌석으로 실제 이동
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
      if (old) old.occupant = null;
      seat.occupant = e.id;
      e.seatId = seat.id;
    }
  }
}
