// 사무실 평면(OF-01/02): 방(대표실·회의실·라운지·탕비실), 책상·가구를 놓을 수 없는 곳, 가구 기본 자리.
// 화면(scene.ts)과 배치 규칙(office.ts)이 같은 평면을 씁니다.
// 가구는 플레이어가 상점에서 사서 직접 놓습니다(A-87). 평면의 가구 자리(defaults)는 예전 저장 이전·사무실 이사 때 처음 놓을 자리로만 씁니다.
import { officeTier } from './data';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type DecorKind =
  | 'plant' | 'bigPlant' | 'cooler' | 'printer' | 'meeting' | 'lounge' | 'beanbag' | 'cafeTable' | 'pingpong'
  | 'kitchen' | 'diningTable' | 'vending' | 'treadmill' | 'weights' | 'stage' | 'tree' | 'bench' | 'lamp';

export interface DecorSpot {
  x: number;
  y: number;
  k?: number; // 그리는 순서 보정
  kind: DecorKind;
}

export interface FloorPlan {
  id: number;
  W: number;
  H: number;
  home: boolean;
  exec: Rect | null;
  meeting: Rect | null;
  lounge: Rect | null;
  loungeLeft: boolean;
  kitchen: Rect | null;
  doorY: number;
  board: [number, number] | null;
  winX: [number, number][];
  winY: [number, number][];
  decor: DecorSpot[]; // 늘 그리는 소품(건물 밖 나무·벤치·가로등)
  defaults: { item: string; x: number; y: number }[]; // 가구 기본 자리(타일 왼쪽 위). 이전·이사 때만 씀
  glass: [number, number, number, number][];
  fixed: Rect[]; // 무엇도 놓을 수 없는 곳(출입문 앞·대표 책상·대표실·유리벽)
  blocked: Rect[]; // 책상을 놓을 수 없는 곳 = fixed + 방(회의실·라운지·탕비실은 가구 자리)
}

// 가구(furniture.json id) → 그 가구를 그리는 소품. 예전 평면의 가구 자리를 가구로 바꿀 때 씁니다.
export const KIND_ITEM: Partial<Record<DecorKind, string>> = {
  plant: 'plant', bigPlant: 'plant', cooler: 'cooler', printer: 'printer', meeting: 'meeting', lounge: 'lounge',
  cafeTable: 'cafe', pingpong: 'pingpong', kitchen: 'kitchen', vending: 'vending', treadmill: 'gym', stage: 'stage',
};

// 가구 자리가 차지하는 바닥(타일). 건물 밖(나무·벤치·가로등)은 바닥 밖이라 없습니다.
const FOOT: Partial<Record<DecorKind, [number, number, number, number]>> = {
  plant: [-0.3, -0.3, 0.3, 0.3],
  bigPlant: [-0.35, -0.35, 0.35, 0.35],
  cooler: [0, 0, 0.5, 0.5],
  printer: [0, 0, 0.75, 0.6],
  meeting: [0, -0.6, 3, 2],
  lounge: [-1.1, 0, 0.9, 2],
  beanbag: [-0.5, -0.3, 0.5, 0.3],
  cafeTable: [-0.6, 0, 0.75, 1.25],
  pingpong: [-0.2, -0.2, 2.8, 1.6],
  kitchen: [0, -0.05, 3.95, 0.65],
  diningTable: [0, -0.5, 2.2, 1.45],
  vending: [0, 0, 0.8, 0.7],
  treadmill: [0, 0, 0.7, 1.6],
  weights: [0, 0, 1.6, 0.4],
  stage: [0, 0, 4.4, 5.6],
};

const plans = new Map<number, FloorPlan>();

export function floorPlan(tierId: number): FloorPlan {
  let p = plans.get(tierId);
  if (!p) {
    p = build(tierId);
    plans.set(tierId, p);
  }
  return p;
}

function build(tierId: number): FloorPlan {
  const t = officeTier(tierId);
  const W = t.size.w;
  const H = t.size.h;
  const has = (r: string) => t.rooms.includes(r);
  const home = !!t.home;
  const doorY = Math.round(H * 0.6);
  const board: [number, number] | null = doorY - 3.6 >= 4 ? [doorY - 3.6, doorY - 0.8] : null;
  const winY: [number, number][] = [];
  for (let a = 0.6; a + 2.8 <= W - 0.5; a += 3.4) winY.push([a, a + 2.8]);
  const winX: [number, number][] = [];
  const winEnd = board ? board[0] - 0.4 : doorY - 0.6;
  for (let a = 0.6; a + 2.8 <= winEnd; a += 3.4) winX.push([a, a + 2.8]);
  const decor: DecorSpot[] = [];
  const add = (x: number, y: number, kind: DecorKind, k?: number) => decor.push({ x, y, k, kind });
  const blocked: Rect[] = [];
  // 출입문 앞과 대표 책상
  blocked.push({ x0: 0, y0: doorY - 0.6, x1: 2, y1: doorY + 1.6 });
  blocked.push({ x0: t.ceo.x, y0: t.ceo.y, x1: t.ceo.x + 2, y1: t.ceo.y + 2 });

  if (home) {
    add(0.5, 0.5, 'plant');
    add(W - 0.6, H - 1.2, 'bigPlant');
    add(0.6, doorY + 1.6, 'cooler');
    add(W - 2.2, 0.6, 'printer');
    outside(add, W, H, false);
    return finish({ id: tierId, W, H, home, exec: null, meeting: null, lounge: null, loungeLeft: false, kitchen: null, doorY, board, winX, winY, decor, defaults: [], glass: [], fixed: [...blocked], blocked });
  }

  const exec: Rect = { x0: W - 5.4, y0: 0, x1: W, y1: 4.8 };
  const meeting: Rect | null = has('meeting') ? { x0: W - 10.6, y0: 0, x1: W - 5.4, y1: 6.2 } : null;
  const loungeLeft = has('lounge');
  const lounge: Rect | null = loungeLeft ? { x0: 1, y0: H - 4.6, x1: 6.8, y1: H - 0.6 } : has('lounge_small') ? { x0: W - 5.6, y0: H - 4, x1: W - 0.6, y1: H - 0.4 } : null;
  const kitchen: Rect | null = has('kitchen') ? { x0: W - 10, y0: H - 4.5, x1: W - 5, y1: H } : null;
  const glass: [number, number, number, number][] = [
    [exec.x0, 0, exec.x0, exec.y1],
    [exec.x0, exec.y1, exec.x0 + 1.7, exec.y1],
    [exec.x0 + 2.9, exec.y1, W, exec.y1],
  ];
  if (meeting) glass.push([meeting.x0, 0, meeting.x0, meeting.y1], [meeting.x0, meeting.y1, meeting.x0 + 1.8, meeting.y1], [meeting.x0 + 3.0, meeting.y1, meeting.x1, meeting.y1], [meeting.x1, exec.y1, meeting.x1, meeting.y1]);
  blocked.push({ ...exec, y1: exec.y1 + 0.8 });
  // 유리벽은 얇은 막대로 막습니다(가구가 벽을 뚫고 놓이지 않게)
  for (const [x0, y0, x1, y1] of glass) blocked.push({ x0: Math.min(x0, x1) - 0.15, y0: Math.min(y0, y1) - 0.15, x1: Math.max(x0, x1) + 0.15, y1: Math.max(y0, y1) + 0.15 });
  const fixed = [...blocked];
  if (meeting) blocked.push({ ...meeting, y1: meeting.y1 + 0.8 });
  if (lounge) blocked.push(lounge);
  if (kitchen) blocked.push(kitchen);

  if (meeting) {
    add(meeting.x0 + 1.6, 2.4, 'meeting', 1.2);
    add(meeting.x0 + 0.6, 5.6, 'plant');
  }
  add(W - 0.6, 4.2, 'plant');
  add(0.5, 0.5, 'plant');
  add(0.7, doorY + 1.8, 'plant');
  if (board) add(0.2, board[0] - 0.5, 'cooler');
  const openTop = exec.y1 + 0.8;
  add(W - 4.6, openTop, 'cooler');
  add(W - 3.6, openTop, 'printer');
  add(W - 1.4, openTop + 0.4, 'bigPlant');
  const rightBottom = H - (lounge && !loungeLeft ? 4.8 : 5);
  let ry = openTop + 3.2;
  if (has('auditorium') && ry + 6 < rightBottom) {
    add(W - 5.0, ry, 'stage', 2);
    ry += 6.4;
  }
  if (has('gym') && ry + 3 < rightBottom) {
    add(W - 4.6, ry, 'treadmill', 1);
    add(W - 3.4, ry, 'treadmill', 1);
    add(W - 2.0, ry + 0.4, 'weights', 1);
    ry += 3.4;
  }
  for (; ry + 1 < rightBottom; ry += 3.2) {
    add(W - 4, ry, 'cafeTable');
    add(W - 1.4, ry, 'cafeTable');
  }
  if (loungeLeft && lounge) {
    add(2.6, lounge.y0 + 0.9, 'lounge', 1);
    add(5.0, lounge.y0 + 0.6, 'beanbag');
    add(5.4, lounge.y0 + 2.9, 'beanbag');
    add(6.6, H - 0.6, 'bigPlant');
  } else if (lounge) {
    add(lounge.x0 + 1.2, lounge.y0 + 0.6, 'lounge', 1);
    add(lounge.x1 - 1.0, lounge.y0 + 1.0, 'beanbag');
    add(lounge.x1 - 0.8, lounge.y1 - 0.6, 'beanbag');
  }
  if (!lounge || loungeLeft) {
    add(W - 0.6, H - 1.2, 'bigPlant');
    add(W - 4.4, H - 1.2, 'plant');
  }
  if (has('pingpong')) add(W / 2 - 3.1, H - 3.8, 'pingpong', 1.4);
  if (kitchen) {
    add(kitchen.x0 - 2, kitchen.y0 - 0.1, 'vending', 0.5);
    add(kitchen.x0 + 0.4, kitchen.y0 + 0.1, 'kitchen', 1.5);
    add(kitchen.x0 + 1.0, kitchen.y0 + 2.1, 'diningTable', 1);
  }
  outside(add, W, H, true);
  return finish({ id: tierId, W, H, home, exec, meeting, lounge, loungeLeft, kitchen, doorY, board, winX, winY, decor, defaults: [], glass, fixed, blocked });
}

// 가구 자리였던 소품은 평면에서 빼고, 가구마다 첫 자리를 기본 자리(그 가구 크기의 왼쪽 위 칸)로 남깁니다.
function finish(p: FloorPlan): FloorPlan {
  const keep: DecorSpot[] = [];
  for (const d of p.decor) {
    const item = KIND_ITEM[d.kind];
    if (!item) {
      if (!(d.kind in FOOT)) keep.push(d); // 건물 밖 소품만 남김(빈백·식탁·덤벨은 가구의 일부라 버림)
      continue;
    }
    if (p.defaults.some((x) => x.item === item)) continue;
    const f = FOOT[d.kind]!;
    p.defaults.push({ item, x: Math.max(0, Math.floor(d.x + f[0] + 0.01)), y: Math.max(0, Math.floor(d.y + f[1] + 0.01)) });
  }
  p.decor = keep;
  return p;
}

function outside(add: (x: number, y: number, kind: DecorKind) => void, W: number, H: number, full: boolean) {
  for (let x = 2; x < W; x += 7) add(x, H + 4.2, 'tree');
  for (let y = 3; y < H; y += 7) add(W + 4.2, y, 'tree');
  for (let x = 0.5; x < W; x += 7.5) add(x, H + 1.6, 'lamp');
  if (!full) return;
  for (let x = 5; x < W - 2; x += 7.5) add(x, H + 1.3, 'bench');
  for (let y = 6; y < H; y += 7.5) add(W + 1.6, y, 'lamp');
}

export function overlaps(a: Rect, b: Rect): boolean {
  const e = 0.01;
  return a.x0 < b.x1 - e && b.x0 < a.x1 - e && a.y0 < b.y1 - e && b.y0 < a.y1 - e;
}
