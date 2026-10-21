// OF-02 부서별 좌석, OF-07 사무실 이전(DEC-020): 사무실 등급마다 부서 구역·좌석 수·월세·쾌적도가 다릅니다.
import { DATA, officeTier, type OfficeTier } from './data';
import { spendNow, book } from './finance';
import { news, notify } from './notify';
import type { DeptId, GameState, Seat } from './types';

// 좌석은 처음엔 비어 있고(책상 없음), 사람이 앉을 때 책상·PC를 삽니다(A-78). 대표 책상만 처음부터 있습니다.
export function buildSeats(tier: OfficeTier): Seat[] {
  const seats: Seat[] = [
    { id: 'ceo', zone: 'ceo', occupant: 'ceo', bought: true },
    { id: 'exec', zone: 'exec', occupant: null, bought: false },
  ];
  for (const z of tier.zones) {
    const n = z.cols * z.rows;
    for (let i = 0; i < n; i++) seats.push({ id: `${z.dept}-${i}`, zone: z.dept as DeptId, occupant: null, bought: false });
  }
  return seats;
}

export function seatBought(seat: Seat): boolean {
  return seat.bought !== false;
}

// 하루 끝: 새로 사람이 앉은(입사 대기 포함) 책상 없는 자리에 책상·PC를 사 둡니다.
export function buyDesksForOccupied(s: GameState) {
  const fresh = s.seats.filter((x) => x.occupant !== null && x.bought === false);
  if (!fresh.length) return;
  for (const x of fresh) x.bought = true;
  spendNow(s, `책상·PC ${fresh.length}개 구입`, fresh.length * DATA.furniture.deskPrice, 'other');
}

type FurnitureItem = (typeof DATA.furniture.items)[number] & { room?: string; minTier?: number };

export function furnitureItems(): FurnitureItem[] {
  return DATA.furniture.items as FurnitureItem[];
}

// 이 사무실에 놓을 자리가 있는가(라운지·회의실·탕비실 등은 그 공간이 있는 사무실에서만)
export function furnitureFits(s: GameState, it: FurnitureItem): boolean {
  const t = currentTier(s);
  if (it.minTier !== undefined && t.id < it.minTier) return false;
  if (!it.room) return true;
  if (it.room === 'lounge') return t.rooms.includes('lounge') || t.rooms.includes('lounge_small');
  return t.rooms.includes(it.room);
}

export function ownsFurniture(s: GameState, id: string): boolean {
  return s.company.furniture ? s.company.furniture.includes(id) : true;
}

export function buyFurnitureBlock(s: GameState, id: string): string | null {
  const it = furnitureItems().find((x) => x.id === id);
  if (!it) return '없는 가구입니다.';
  if (ownsFurniture(s, id)) return '이미 있습니다.';
  if (!furnitureFits(s, it)) return '지금 사무실에는 놓을 공간이 없습니다. 더 큰 사무실로 옮기세요.';
  if (s.cash < it.price) return '자금이 부족합니다.';
  return null;
}

export function buyFurniture(s: GameState, id: string): string | null {
  const err = buyFurnitureBlock(s, id);
  if (err) return err;
  const it = furnitureItems().find((x) => x.id === id)!;
  spendNow(s, `가구 구입: ${it.name}`, it.price, 'other');
  (s.company.furniture ??= []).push(id);
  notify(s, `${it.name}을(를) 들여놓았습니다. 사무실 쾌적도 +${it.comfort}`, 'good', 'office');
  s.events.push({ type: 'sfx', sound: 'coin' });
  return null;
}

// 사무실 쾌적도: 산 가구 중 지금 사무실에 놓인 것의 합(예전 저장은 사무실 등급 기본값)
export function officeComfort(s: GameState): number {
  if (!s.company.furniture) return currentTier(s).comfort;
  return furnitureItems()
    .filter((it) => s.company.furniture!.includes(it.id) && furnitureFits(s, it))
    .reduce((a, it) => a + it.comfort, 0);
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
  // 산 책상은 들고 갑니다: 부서마다 산 개수만큼 새 사무실에서도 책상이 있는 자리(자리가 모자라면 남는 책상은 처분)
  for (const z of DATA.depts.departments) {
    let n = s.seats.filter((x) => x.zone === z.id && seatBought(x)).length;
    for (const x of seats) if (x.zone === z.id && x.occupant !== null) (x.bought = true), n--;
    for (const x of seats) if (n > 0 && x.zone === z.id && !x.bought) (x.bought = true), n--;
  }
  for (const x of seats) if (x.zone === 'exec' && x.occupant !== null) x.bought = true;
  s.seats = seats;
  notify(s, `${t.name}(으)로 이사를 시작합니다. ${DATA.offices.moveDays}일 동안 일이 조금 느려집니다.`, 'good', 'office');
  news(s, `[오피스] ${s.company.name}, ${t.name}(으)로 이전`, 'company');
  s.events.push({ type: 'moved' });
  return null;
}

export function officeDay(s: GameState) {
  buyDesksForOccupied(s);
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
