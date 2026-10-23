// OF-02 책상 배치(A-80), OF-07 사무실 이전(DEC-020): 사무실 등급마다 넓이·방·월세가 다르고, 책상은 플레이어가 놓습니다.
import { DATA, officeTier, type OfficeTier } from './data';
import { spendNow, book } from './finance';
import { news, notify } from './notify';
import { nextId } from './ids';
import { floorPlan, overlaps, type Rect } from './officeLayout';
import type { GameState, PlacedItem, Rot, Seat } from './types';

// 책상(A-80): 부서 구역 없이 플레이어가 빈 바닥 아무 데나 책상을 놓습니다. 어느 직무든 빈 책상에 앉습니다.
// 처음엔 대표 책상만 있습니다. 사람을 뽑을 때 빈 책상이 없으면 빈 자리에 하나 사서 놓습니다(나중에 옮기거나 치울 수 있음).
export function buildSeats(tier: OfficeTier): Seat[] {
  return [
    { id: 'ceo', zone: 'ceo', occupant: 'ceo', bought: true },
    { id: 'exec', zone: 'exec', occupant: null, bought: false },
  ];
}

export function seatBought(seat: Seat): boolean {
  return seat.bought !== false;
}

export function desks(s: GameState): Seat[] {
  return s.seats.filter((x) => x.zone === 'desk');
}

export function deskRect(gx: number, gy: number): Rect {
  return { x0: gx, y0: gy, x1: gx + 2, y1: gy + 2 };
}

// 이 자리에 책상을 놓을 수 있는가(바닥 안, 방·가구·다른 책상과 겹치지 않게). ignore는 옮기는 중인 책상.
export function deskFits(s: GameState, gx: number, gy: number, ignore?: string, tierId = s.company.officeTier): string | null {
  const t = officeTier(tierId);
  if (!Number.isInteger(gx) || !Number.isInteger(gy)) return '칸에 맞춰 놓으세요.';
  if (gx < 0 || gy < 0 || gx + 2 > t.size.w || gy + 2 > t.size.h) return '사무실 바닥 안에 놓으세요.';
  const r = deskRect(gx, gy);
  const plan = floorPlan(tierId);
  if (plan.blocked.some((b) => overlaps(r, b))) return '방이나 가구, 출입문과 겹칩니다.';
  const ex = s.seats.find((x) => x.zone === 'exec');
  if (ex && ex.occupant !== null && overlaps(r, deskRect(t.exec.x, t.exec.y))) return '다른 책상과 겹칩니다.';
  for (const d of desks(s)) if (d.id !== ignore && d.gx !== undefined && overlaps(r, deskRect(d.gx, d.gy!))) return '다른 책상과 겹칩니다.';
  if (placedOn(s).some((p) => overlaps(r, itemRect(p)))) return '가구와 겹칩니다.';
  return null;
}

// 바닥 칸 점유표: 방·가구·출입문·다른 책상이 덮는 칸은 1. 책상(2×2)은 네 칸이 모두 비어야 놓입니다.
function occGrid(s: GameState, tierId: number) {
  const t = officeTier(tierId);
  const W = t.size.w;
  const H = t.size.h;
  const g = new Uint8Array(W * H);
  const e = 0.01;
  const mark = (r: Rect) => {
    for (let j = Math.max(0, Math.floor(r.y0 + e)); j <= Math.min(H - 1, Math.ceil(r.y1 - e) - 1); j++)
      for (let i = Math.max(0, Math.floor(r.x0 + e)); i <= Math.min(W - 1, Math.ceil(r.x1 - e) - 1); i++) g[j * W + i] = 1;
  };
  for (const b of floorPlan(tierId).blocked) mark(b);
  const ex = s.seats.find((x) => x.zone === 'exec');
  if (ex && ex.occupant !== null) mark(deskRect(t.exec.x, t.exec.y));
  for (const d of s.seats) if (d.zone === 'desk' && d.gx !== undefined) mark(deskRect(d.gx, d.gy!));
  for (const p of placedOn(s)) mark(itemRect(p));
  return { g, W, H, mark };
}

function spotIn(o: ReturnType<typeof occGrid>): { gx: number; gy: number } | null {
  const { g, W, H } = o;
  for (let gy = 0; gy + 2 <= H; gy++)
    for (let gx = 0; gx + 2 <= W; gx++) if (!g[gy * W + gx] && !g[gy * W + gx + 1] && !g[(gy + 1) * W + gx] && !g[(gy + 1) * W + gx + 1]) return { gx, gy };
  return null;
}

// 빈 자리 찾기(위쪽·왼쪽부터). 플레이어가 고르지 않을 때(채용·이사·자동 플레이) 씁니다.
export function findDeskSpot(s: GameState, tierId = s.company.officeTier): { gx: number; gy: number } | null {
  return spotIn(occGrid(s, tierId));
}

// 자리 몇 개를 더 놓을 수 있는가(최대 limit). 배치가 같으면 다시 세지 않습니다.
const roomCache = new Map<string, number>();
function roomLeft(s: GameState, tierId: number, limit: number): number {
  if (limit <= 0) return 0;
  const key = `${tierId}|${limit}|${s.seats.map((d) => (d.zone === 'desk' ? `${d.gx},${d.gy}` : d.zone === 'exec' && d.occupant ? 'x' : '')).join(';')}|${placedOn(s).map((p) => `${p.item}${p.gx},${p.gy}`).join(';')}`;
  const hit = roomCache.get(key);
  if (hit !== undefined) return hit;
  const o = occGrid(s, tierId);
  let n = 0;
  while (n < limit) {
    const p = spotIn(o);
    if (!p) break;
    o.mark(deskRect(p.gx, p.gy));
    n++;
  }
  if (roomCache.size > 200) roomCache.clear();
  roomCache.set(key, n);
  return n;
}

// 빈 사무실에 책상을 최대 몇 개 놓을 수 있는가(수용 인원과 바닥 넓이 중 작은 쪽)
export function deskCapacity(tierId: number): number {
  const t = officeTier(tierId);
  const empty = { company: { officeTier: tierId }, seats: [] as Seat[] } as unknown as GameState;
  return roomLeft(empty, tierId, t.maxDesks);
}

export function freeDesks(s: GameState): Seat[] {
  return desks(s).filter((x) => x.occupant === null);
}

// 지금 더 앉힐 수 있는 사람 수 = 빈 책상 + 책상을 더 놓을 수 있는 자리(수용 인원 안에서)
export function seatsAvailable(s: GameState): number {
  return freeDesks(s).length + roomLeft(s, s.company.officeTier, currentTier(s).maxDesks - desks(s).length);
}

function newDesk(s: GameState, gx: number, gy: number, rot: Rot = 0): Seat {
  const seat: Seat = { id: nextId(s, 'desk'), zone: 'desk', occupant: null, bought: true, gx, gy, ...(rot ? { rot } : {}) };
  s.seats.push(seat);
  return seat;
}

// 사람 앉힐 책상: 빈 책상, 없으면 빈 자리에 하나 사서 놓음. 공간이 없으면 null.
export function takeDesk(s: GameState): Seat | null {
  const free = freeDesks(s)[0];
  if (free) return free;
  if (desks(s).length >= currentTier(s).maxDesks) return null;
  const p = findDeskSpot(s);
  if (!p) return null;
  spendNow(s, '책상·PC 구입', DATA.furniture.deskPrice, 'other');
  return newDesk(s, p.gx, p.gy);
}

// 플레이어 배치: 책상 사서 놓기, 옮기기(앉은 사람도 같이), 빈 책상 치우기(절반 값에 처분)
export function placeDesk(s: GameState, gx: number, gy: number, rot: Rot = 0): string | null {
  if (s.company.movingUntil !== null) return '이사 중에는 배치를 바꿀 수 없습니다.';
  const err = deskFits(s, gx, gy);
  if (err) return err;
  if (desks(s).length >= currentTier(s).maxDesks) return `이 사무실에는 책상을 ${currentTier(s).maxDesks}개까지만 놓을 수 있습니다. 더 큰 사무실로 옮기세요.`;
  if (s.cash < DATA.furniture.deskPrice) return '자금이 부족합니다.';
  spendNow(s, '책상·PC 구입', DATA.furniture.deskPrice, 'other');
  newDesk(s, gx, gy, rot);
  s.events.push({ type: 'sfx', sound: 'coin' });
  return null;
}

export function moveDesk(s: GameState, id: string, gx: number, gy: number, rot?: Rot): string | null {
  const d = desks(s).find((x) => x.id === id);
  if (!d) return '책상을 찾을 수 없습니다.';
  const err = deskFits(s, gx, gy, id);
  if (err) return err;
  d.gx = gx;
  d.gy = gy;
  if (rot !== undefined) d.rot = rot;
  return null;
}

// 돌리기(A-128): 시계 방향 90°. 책상은 2×2라 자리가 그대로이고, 앉은 사람이 보는 방향만 바뀝니다.
// 가구는 가로·세로가 바뀌므로 같은 왼쪽 위 칸에서 돌린 크기가 들어가야 합니다.
export function nextRot(r: Rot | undefined): Rot {
  return (((r ?? 0) + 1) % 4) as Rot;
}

export function rotateDesk(s: GameState, id: string): string | null {
  if (s.company.movingUntil !== null) return '이사 중에는 배치를 바꿀 수 없습니다.';
  const d = desks(s).find((x) => x.id === id);
  if (!d) return '돌릴 수 있는 책상이 아닙니다.';
  d.rot = nextRot(d.rot);
  return null;
}

export function rotateFurniture(s: GameState, placedId: string): string | null {
  if (s.company.movingUntil !== null) return '이사 중에는 배치를 바꿀 수 없습니다.';
  const p = placedItems(s).find((x) => x.id === placedId);
  if (!p || p.gx === null || p.gy === null) return '가구를 찾을 수 없습니다.';
  const rot = nextRot(p.rot);
  const err = furnitureSpotFits(s, p.item, p.gx, p.gy, p.id, s.company.officeTier, rot);
  if (err) return `돌리면 자리가 모자랍니다. ${err} 옮긴 뒤 돌려 보세요.`;
  p.rot = rot;
  return null;
}

export function removeDesk(s: GameState, id: string): string | null {
  const d = desks(s).find((x) => x.id === id);
  if (!d) return '책상을 찾을 수 없습니다.';
  if (d.occupant !== null) return '직원이 앉은 책상은 치울 수 없습니다. 옮길 수는 있습니다.';
  s.seats = s.seats.filter((x) => x.id !== id);
  book(s, '책상 처분', Math.round(DATA.furniture.deskPrice / 2));
  return null;
}

export function deskAt(s: GameState, x: number, y: number): Seat | null {
  return desks(s).find((d) => d.gx !== undefined && x >= d.gx && x < d.gx + 2 && y >= d.gy! && y < d.gy! + 2) ?? null;
}

// 예전 저장(부서 구역 좌석) → 책상: 산 자리·앉은 자리만 책상으로 옮겨 빈 곳에 차례로 놓습니다.
export function migrateSeats(s: GameState) {
  if (!s.seats.some((x) => x.zone !== 'ceo' && x.zone !== 'exec' && x.zone !== 'desk')) return;
  const keep = s.seats.filter((x) => x.zone === 'ceo' || x.zone === 'exec');
  const old = s.seats.filter((x) => x.zone !== 'ceo' && x.zone !== 'exec' && (x.occupant !== null || seatBought(x)));
  s.seats = keep;
  for (const o of old) {
    const p = findDeskSpot(s);
    if (!p) {
      if (o.occupant === null) continue;
      s.seats.push({ ...o, zone: 'desk', bought: true, gx: 0, gy: 0 });
      continue;
    }
    s.seats.push({ ...o, zone: 'desk', bought: true, gx: p.gx, gy: p.gy });
  }
}

type FurnitureItem = (typeof DATA.furniture.items)[number] & { room?: string; minTier?: number; size: number[] };

export function furnitureItems(): FurnitureItem[] {
  return DATA.furniture.items as FurnitureItem[];
}

function itemDef(id: string): FurnitureItem | undefined {
  return furnitureItems().find((x) => x.id === id);
}

// 가구가 차지하는 칸(가로×세로). 책상은 2×2. 홀수 번 돌리면 가로·세로가 바뀜(A-128)
export function itemSize(id: string, rot: Rot = 0): { w: number; h: number } {
  if (id === 'desk') return { w: 2, h: 2 };
  const sz = itemDef(id)?.size ?? [1, 1];
  return rot % 2 ? { w: sz[1], h: sz[0] } : { w: sz[0], h: sz[1] };
}

export function itemRect(p: { item: string; gx: number | null; gy: number | null; rot?: Rot }): Rect {
  const { w, h } = itemSize(p.item, p.rot ?? 0);
  return { x0: p.gx!, y0: p.gy!, x1: p.gx! + w, y1: p.gy! + h };
}

// 이 사무실에서 살 수 있는가(라운지·회의실·탕비실 등은 그 공간이 있는 사무실에서만, 카페 테이블 등은 일정 넓이부터)
export function furnitureFits(s: GameState, it: FurnitureItem): boolean {
  const t = currentTier(s);
  if (it.minTier !== undefined && t.id < it.minTier) return false;
  if (!it.room) return true;
  if (it.room === 'lounge') return t.rooms.includes('lounge') || t.rooms.includes('lounge_small');
  return t.rooms.includes(it.room);
}

export function placedItems(s: GameState): PlacedItem[] {
  return s.company.placed ?? [];
}

// 지금 사무실 바닥에 놓인 가구
export function placedOn(s: GameState): PlacedItem[] {
  return placedItems(s).filter((p) => p.gx !== null && p.gy !== null);
}

export function ownsFurniture(s: GameState, id: string): boolean {
  return placedItems(s).some((p) => p.item === id);
}

// 이 칸(왼쪽 위)에 가구를 놓을 수 있는가: 바닥 안, 출입문·대표 자리·유리벽·책상·다른 가구와 겹치지 않게. ignore는 옮기는 중인 가구
export function furnitureSpotFits(s: GameState, item: string, gx: number, gy: number, ignore?: string, tierId = s.company.officeTier, rot: Rot = 0): string | null {
  const t = officeTier(tierId);
  const { w, h } = itemSize(item, rot);
  if (!Number.isInteger(gx) || !Number.isInteger(gy)) return '칸에 맞춰 놓으세요.';
  if (gx < 0 || gy < 0 || gx + w > t.size.w || gy + h > t.size.h) return '사무실 바닥 안에 놓으세요.';
  const r: Rect = { x0: gx, y0: gy, x1: gx + w, y1: gy + h };
  if (floorPlan(tierId).fixed.some((b) => overlaps(r, b))) return '출입문·대표 자리·벽과 겹칩니다.';
  const ex = s.seats.find((x) => x.zone === 'exec');
  if (ex && ex.occupant !== null && overlaps(r, deskRect(t.exec.x, t.exec.y))) return '책상과 겹칩니다.';
  for (const d of desks(s)) if (d.gx !== undefined && overlaps(r, deskRect(d.gx, d.gy!))) return '책상과 겹칩니다.';
  for (const p of placedOn(s)) if (p.id !== ignore && overlaps(r, itemRect(p))) return '다른 가구와 겹칩니다.';
  return null;
}

// 가구 놓을 빈 칸 찾기: 이 사무실의 기본 자리 먼저, 없으면 위쪽·왼쪽부터
export function findFurnitureSpot(s: GameState, item: string, tierId = s.company.officeTier): { gx: number; gy: number } | null {
  const def = floorPlan(tierId).defaults.find((d) => d.item === item);
  if (def && !furnitureSpotFits(s, item, def.x, def.y, undefined, tierId)) return { gx: def.x, gy: def.y };
  const t = officeTier(tierId);
  for (let gy = 0; gy < t.size.h; gy++) for (let gx = 0; gx < t.size.w; gx++) if (!furnitureSpotFits(s, item, gx, gy, undefined, tierId)) return { gx, gy };
  return null;
}

export function buyFurnitureBlock(s: GameState, id: string): string | null {
  const it = itemDef(id);
  if (!it) return '없는 가구입니다.';
  if (ownsFurniture(s, id)) return '이미 있습니다.';
  if (!furnitureFits(s, it)) return '지금 사무실에서는 살 수 없습니다. 더 큰 사무실로 옮기세요.';
  if (s.cash < it.price) return '자금이 부족합니다.';
  return null;
}

// 상점에서 고른 칸에 놓기: 아직 없으면 사서 놓고, 보관 중이면 꺼내 놓습니다.
export function placeFurniture(s: GameState, id: string, gx: number, gy: number, rot: Rot = 0): string | null {
  if (s.company.movingUntil !== null) return '이사 중에는 배치를 바꿀 수 없습니다.';
  const stored = placedItems(s).find((p) => p.item === id && p.gx === null);
  if (!stored) {
    const err = buyFurnitureBlock(s, id);
    if (err) return err;
  }
  const fit = furnitureSpotFits(s, id, gx, gy, undefined, s.company.officeTier, rot);
  if (fit) return fit;
  if (stored) {
    stored.gx = gx;
    stored.gy = gy;
    stored.rot = rot;
    return null;
  }
  const it = itemDef(id)!;
  spendNow(s, `가구 구입: ${it.name}`, it.price, 'other');
  (s.company.placed ??= []).push({ id: nextId(s, 'furn'), item: id, gx, gy, ...(rot ? { rot } : {}) });
  notify(s, `${it.name}을(를) 들여놓았습니다. 사무실 쾌적도 +${it.comfort}`, 'good', 'shop');
  s.events.push({ type: 'sfx', sound: 'coin' });
  return null;
}

// 자동으로 사서 빈 자리에 놓기(자동 플레이·시뮬레이션용)
export function buyFurniture(s: GameState, id: string): string | null {
  const err = buyFurnitureBlock(s, id);
  if (err) return err;
  const p = findFurnitureSpot(s, id);
  if (!p) return '놓을 빈 바닥이 없습니다.';
  return placeFurniture(s, id, p.gx, p.gy);
}

export function moveFurniture(s: GameState, placedId: string, gx: number, gy: number, rot?: Rot): string | null {
  if (s.company.movingUntil !== null) return '이사 중에는 배치를 바꿀 수 없습니다.';
  const p = placedItems(s).find((x) => x.id === placedId);
  if (!p) return '가구를 찾을 수 없습니다.';
  const r = rot ?? p.rot ?? 0;
  const err = furnitureSpotFits(s, p.item, gx, gy, p.id, s.company.officeTier, r);
  if (err) return err;
  p.gx = gx;
  p.gy = gy;
  p.rot = r;
  return null;
}

// 치우기: 가구는 보관함으로(값은 그대로, 나중에 상점에서 다시 놓음)
export function storeFurniture(s: GameState, placedId: string): string | null {
  const p = placedItems(s).find((x) => x.id === placedId);
  if (!p) return '가구를 찾을 수 없습니다.';
  p.gx = null;
  p.gy = null;
  return null;
}

export function furnitureAt(s: GameState, x: number, y: number): PlacedItem | null {
  return placedOn(s).find((p) => {
    const r = itemRect(p);
    return x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
  }) ?? null;
}

// 사무실 쾌적도: 지금 사무실 바닥에 놓인 가구의 합(그 사무실에서 쓸 수 있는 것만)
export function officeComfort(s: GameState): number {
  if (!s.company.placed) return currentTier(s).comfort;
  return placedOn(s).reduce((a, p) => {
    const it = itemDef(p.item);
    return a + (it && furnitureFits(s, it) ? it.comfort : 0);
  }, 0);
}

// 예전 저장(A-78: 산 가구 id만 있고 자리는 평면이 정함) → 가구를 평면의 기본 자리에 놓습니다.
// furniture가 아예 없는 더 예전 저장은 그 사무실에서 살 수 있는 가구를 다 가진 것으로 봅니다.
export function migrateFurniture(s: GameState) {
  if (s.company.placed) return;
  const owned = s.company.furniture ?? furnitureItems().filter((it) => furnitureFits(s, it)).map((it) => it.id);
  s.company.placed = [];
  for (const id of owned) {
    if (!itemDef(id)) continue;
    const p = findFurnitureSpot(s, id);
    s.company.placed.push({ id: nextId(s, 'furn'), item: id, gx: p?.gx ?? null, gy: p?.gy ?? null });
  }
  delete s.company.furniture;
}

// 좌석 위치(타일 좌표): 대표·임원 자리는 사무실마다 정해져 있고, 책상은 놓은 곳
export function seatGrid(tier: OfficeTier, seat: Seat): { gx: number; gy: number } {
  if (seat.zone === 'ceo') return { gx: tier.ceo.x, gy: tier.ceo.y };
  if (seat.zone === 'exec') return { gx: tier.exec.x, gy: tier.exec.y };
  return { gx: seat.gx ?? 0, gy: seat.gy ?? 0 };
}

export function currentTier(s: GameState) {
  return officeTier(s.company.officeTier);
}

export function moveBlock(s: GameState, tierId: number): string | null {
  const t = officeTier(tierId);
  if (tierId === s.company.officeTier) return '지금 쓰는 사무실입니다.';
  if (s.company.movingUntil !== null) return '이사 중입니다.';
  // 줄여서 옮길 때는 모든 인원이 새 사무실 책상에 앉을 수 있어야 합니다.
  const n = s.employees.filter((e) => e.kind !== 'cofounder').length + s.pendingHires.length;
  if (n > deskCapacity(tierId)) return `인원(${n}명)이 새 사무실에 놓을 수 있는 책상(${deskCapacity(tierId)}개)보다 많습니다.`;
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
  // 책상을 들고 가서 새 사무실 빈 자리에 차례로 놓습니다(놓을 곳이 모자라면 남는 빈 책상은 처분). 배치는 나중에 바꿀 수 있습니다.
  const oldDesks = desks(s);
  s.seats = buildSeats(t);
  const ex = s.seats.find((x) => x.zone === 'exec')!;
  for (const e of s.employees) e.seatId = null;
  const cof = s.employees.find((e) => e.kind === 'cofounder');
  if (cof) {
    ex.occupant = cof.id;
    ex.bought = true;
    cof.seatId = ex.id;
  }
  // 가구는 책상을 다 놓은 뒤에 놓습니다(옛 사무실 좌표가 새 책상 자리를 막지 않게 먼저 비움)
  const items = placedItems(s);
  for (const p of items) {
    p.gx = null;
    p.gy = null;
    p.rot = undefined; // 새 사무실에서는 기본 방향으로 다시 놓음(A-128)
  }
  const order = [...oldDesks.filter((d) => d.occupant !== null), ...oldDesks.filter((d) => d.occupant === null)];
  let sold = 0;
  for (const d of order) {
    const p = desks(s).length < t.maxDesks ? findDeskSpot(s) : null;
    if (!p) {
      sold++;
      continue;
    }
    s.seats.push({ ...d, gx: p.gx, gy: p.gy });
    const e = s.employees.find((x) => x.id === d.occupant);
    if (e) e.seatId = d.id;
  }
  if (sold) book(s, `남는 책상 ${sold}개 처분`, Math.round((sold * DATA.furniture.deskPrice) / 2));
  // 가구도 들고 가서 새 사무실 기본 자리(없으면 빈 바닥)에 놓습니다. 놓을 곳이 없으면 보관함으로.
  for (const p of items) {
    const it = itemDef(p.item);
    if (!it || !furnitureFits(s, it)) continue;
    const spot = findFurnitureSpot(s, p.item);
    if (spot) {
      p.gx = spot.gx;
      p.gy = spot.gy;
    }
  }
  notify(s, `${t.name}(으)로 이사를 시작합니다. ${DATA.offices.moveDays}일 동안 일이 조금 느려집니다.`, 'good', 'office');
  news(s, `[사무실] ${s.company.name}, ${t.name}(으)로 이전`, 'company');
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
  return seatsAvailable(s) === 0;
}
