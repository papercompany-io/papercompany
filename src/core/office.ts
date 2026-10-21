// OF-02 부서별 좌석, OF-07 사무실 이전(DEC-020): 사무실 등급마다 부서 구역·좌석 수·월세·쾌적도가 다릅니다.
import { DATA, officeTier, type OfficeTier } from './data';
import { spendNow, book } from './finance';
import { news, notify } from './notify';
import type { DeptId, GameState, Seat } from './types';

export function buildSeats(tier: OfficeTier): Seat[] {
  const seats: Seat[] = [
    { id: 'ceo', zone: 'ceo', occupant: 'ceo' },
    { id: 'exec', zone: 'exec', occupant: null },
  ];
  for (const z of tier.zones) {
    const n = z.cols * z.rows;
    for (let i = 0; i < n; i++) seats.push({ id: `${z.dept}-${i}`, zone: z.dept as DeptId, occupant: null });
  }
  return seats;
}

// 좌석 위치(타일 좌표): 구역 원점에서 좌석 한 벌 2×2칸씩, cols 개씩 줄
export function seatGrid(tier: OfficeTier, seat: Seat): { gx: number; gy: number } {
  if (seat.zone === 'ceo') return { gx: tier.ceo.x, gy: tier.ceo.y };
  if (seat.zone === 'exec') return { gx: tier.exec.x, gy: tier.exec.y };
  const z = tier.zones.find((x) => x.dept === seat.zone);
  const i = Number(seat.id.split('-')[1] ?? 0);
  if (!z) return { gx: 0, gy: 0 };
  return { gx: z.x + (i % z.cols) * 2, gy: z.y + Math.floor(i / z.cols) * 2 };
}

export function seatCount(tier: OfficeTier, d: DeptId): number {
  const z = tier.zones.find((x) => x.dept === d);
  return z ? z.cols * z.rows : 0;
}

export function totalSeats(tier: OfficeTier): number {
  return tier.zones.reduce((a, z) => a + z.cols * z.rows, 0);
}

export function freeSeats(s: GameState, d: DeptId): Seat[] {
  return s.seats.filter((x) => x.zone === d && x.occupant === null);
}

export function seatsAvailable(s: GameState, d: DeptId): number {
  return freeSeats(s, d).length;
}

export function currentTier(s: GameState) {
  return officeTier(s.company.officeTier);
}

export function moveBlock(s: GameState, tierId: number): string | null {
  const t = officeTier(tierId);
  if (tierId === s.company.officeTier) return '지금 쓰는 사무실입니다.';
  if (s.company.movingUntil !== null) return '이사 중입니다.';
  // 줄여서 옮길 때는 부서별 인원이 새 좌석에 들어가야 합니다.
  for (const z of DATA.depts.departments) {
    const n = s.employees.filter((e) => e.dept === z.id && e.kind !== 'cofounder').length + s.pendingHires.filter((h) => h.dept === z.id).length;
    if (n > seatCount(t, z.id as DeptId)) return `${z.name} 인원(${n}명)이 새 사무실 좌석보다 많습니다.`;
  }
  const refund = currentTier(s).deposit;
  if (t.deposit > refund && s.cash < t.deposit - refund + t.rent) return '보증금(기존 보증금 반환 후 차액)과 첫 달 월세를 낼 자금이 부족합니다.';
  return null;
}

// 이전: 기존 보증금을 돌려받고 새 보증금을 냅니다. 3일 동안 이사(출력 감소), 끝나면 새 좌석에 재착석.
export function moveOffice(s: GameState, tierId: number): string | null {
  const err = moveBlock(s, tierId);
  if (err) return err;
  const old = currentTier(s);
  const t = officeTier(tierId);
  if (old.deposit > 0) book(s, `${old.name} 보증금 반환`, old.deposit);
  if (t.deposit > 0) spendNow(s, `${t.name} 보증금`, t.deposit, 'deposit');
  s.company.officeTier = tierId;
  s.company.movingUntil = s.day + DATA.offices.moveDays;
  // 좌석 다시 배치
  const seats = buildSeats(t);
  for (const e of s.employees) {
    e.seatId = null;
    if (e.kind === 'cofounder') {
      const ex = seats.find((x) => x.zone === 'exec' && x.occupant === null);
      if (ex) {
        ex.occupant = e.id;
        e.seatId = ex.id;
        continue;
      }
    }
    const seat = seats.find((x) => x.zone === e.dept && x.occupant === null);
    if (seat) {
      seat.occupant = e.id;
      e.seatId = seat.id;
    }
  }
  for (const h of s.pendingHires) {
    const seat = seats.find((x) => x.zone === h.dept && x.occupant === null);
    if (seat) seat.occupant = `pending:${h.applicantId}`;
  }
  s.seats = seats;
  notify(s, `${t.name}(으)로 이사를 시작합니다. ${DATA.offices.moveDays}일 동안 일이 조금 느려집니다.`, 'good', 'office');
  news(s, `[오피스] ${s.company.name}, ${t.name}(으)로 이전`, 'company');
  s.events.push({ type: 'moved' });
  return null;
}

export function officeDay(s: GameState) {
  if (s.company.movingUntil !== null && s.day >= s.company.movingUntil) {
    s.company.movingUntil = null;
    notify(s, '이사를 마쳤습니다. 새 사무실에서 일을 시작합니다.', 'good');
    s.events.push({ type: 'confetti' });
  }
  // 좌석이 모두 찼으면 이전 권유(OF-07 [CS])
}

export function isFull(s: GameState): boolean {
  return s.seats.filter((x) => x.zone !== 'ceo' && x.zone !== 'exec').every((x) => x.occupant !== null);
}
