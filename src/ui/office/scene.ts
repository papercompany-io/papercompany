// OF-01 2.5D 아이소메트릭 픽셀 사무실 장면, OF-02 책상(빈 책상·입사 대기 상자·직원). 책상은 플레이어가 놓습니다(A-80).
// Startup Company처럼 사무실이 화면을 채우는 탑뷰입니다. 카메라(가운데 오는 월드 좌표)와 정수 배율로 화면을 정하고,
// 타일 1칸 = 가로 24 × 세로 12 아트 픽셀(2:1 아이소메트릭)을 정수배로 키워 그립니다.
import { DATA, dept, officeTier } from '../../core/data';
import { deskFits, furnitureSpotFits, itemSize, placedOn, seatGrid } from '../../core/office';
import { awayOuting } from '../../core/outings';
import { atDesk, clockHour, inNight, workingLate } from '../../core/night';
import { floorPlan, type DecorKind, type Rect } from '../../core/officeLayout';
import type { Employee, GameState, Rot, Seat } from '../../core/types';
import { Pix, hex, mix, shade, type Col, type Pt } from './pixel';
import { SPRITES, SPRITE_H, SPRITE_W, hashStr, lookFor } from './sprites';

export const TW = 24;
export const TH = 12;
// 사무실 등급(OF-07)마다 크기·방·소품 배치가 다릅니다. 그릴 때 setLayout으로 지금 등급의 배치를 고릅니다.
let FW = 24;
let FH = 18;
let TIER = 2;
const WALL_H = 44;

interface Layout {
  id: number;
  W: number;
  H: number;
  exec: Rect;
  meeting: Rect | null;
  lounge: Rect | null;
  loungeLeft: boolean;
  kitchen: Rect | null;
  doorY: number;
  board: [number, number] | null;
  winX: [number, number][];
  winY: [number, number][];
  decor: Decor[];
  glass: [number, number, number, number][];
}

let L: Layout;
const layouts = new Map<number, Layout>();

export function setLayout(tier: number) {
  if (L && L.id === tier) return;
  let lay = layouts.get(tier);
  if (!lay) {
    lay = buildLayout(tier);
    layouts.set(tier, lay);
  }
  L = lay;
  FW = lay.W;
  FH = lay.H;
  TIER = tier;
}

export function officeSize() {
  return { w: FW, h: FH };
}

export interface View {
  artW: number;
  artH: number;
  scale: number;
  ox: number;
  oy: number;
  rot?: Turn; // 돌린 가구·책상을 그릴 때만(A-128)
}

// 돌리기(A-128): 바닥 점을 (cx, cy) 둘레로 시계 방향 90°×n
interface Turn {
  cx: number;
  cy: number;
  n: Rot;
}

function turnPt(r: Turn, x: number, y: number): [number, number] {
  const dx = x - r.cx;
  const dy = y - r.cy;
  if (r.n === 1) return [r.cx - dy, r.cy + dx];
  if (r.n === 2) return [r.cx - dx, r.cy - dy];
  if (r.n === 3) return [r.cx + dy, r.cy - dx];
  return [x, y];
}

// 돌린 물건 그리기(A-128): 원래 방향에서 뒤→앞 순서로 짠 그리기 순서가 돌리면 틀어지므로, 상자마다(뒤따르는 무늬·사람 포함) 모아 두었다가
// 바닥에서 뒤에 있는 상자부터, 겹치면 낮은 상자부터 다시 그립니다.
type Box3 = [number, number, number, number, number, number]; // x0 y0 x1 y1 z0 z1
class RecPix extends Pix {
  private groups: { b: Box3; ops: ((g: Pix) => void)[] }[] = [];
  constructor() {
    super(1, 1);
  }
  group(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number) {
    this.groups.push({ b: [x0, y0, x1, y1, z0, z1], ops: [] });
  }
  private add(op: (g: Pix) => void) {
    if (!this.groups.length) this.group(0, 0, 0, 0, 0, 0);
    this.groups[this.groups.length - 1].ops.push(op);
  }
  px(x: number, y: number, c: Col) {
    this.add((g) => g.px(x, y, c));
  }
  rect(x: number, y: number, w: number, h: number, c: Col) {
    this.add((g) => g.rect(x, y, w, h, c));
  }
  poly(pts: Pt[], c: Col) {
    this.add((g) => g.poly(pts, c));
  }
  line(p: Pt, q: Pt, c: Col) {
    this.add((g) => g.line(p, q, c));
  }
  sprite(x: number, y: number, rows: string[], pal: Record<string, Col>, flip = false) {
    this.add((g) => g.sprite(x, y, rows, pal, flip));
  }
  spriteOutline(x: number, y: number, rows: string[], c: Col) {
    this.add((g) => g.spriteOutline(x, y, rows, c));
  }
  replay(g: Pix) {
    const e = 0.01;
    const before = (a: Box3, b: Box3) => {
      const overlap = a[0] < b[2] - e && b[0] < a[2] - e && a[1] < b[3] - e && b[1] < a[3] - e;
      if (overlap) return a[4] < b[4] - e || (Math.abs(a[4] - b[4]) <= e && a[5] < b[5] - e);
      const ab = a[2] <= b[0] + e || a[3] <= b[1] + e;
      const ba = b[2] <= a[0] + e || b[3] <= a[1] + e;
      if (ab && !ba) return true;
      if (ba && !ab) return false;
      return a[0] + a[2] + a[1] + a[3] < b[0] + b[2] + b[1] + b[3];
    };
    const left = [...this.groups];
    while (left.length) {
      let i = left.findIndex((x) => !left.some((y) => y !== x && before(y.b, x.b)));
      if (i < 0) i = 0; // 순환이면 남은 것 중 먼저 기록된 것
      for (const op of left[i].ops) op(g);
      left.splice(i, 1);
    }
  }
}

// 그리기 함수를 돌린 방향으로 실행: (cx, cy) 둘레로 n번 돌려 기록했다가 순서를 맞춰 그림
function drawTurned(ctx: DrawCtx, cx: number, cy: number, n: Rot, draw: (c: DrawCtx) => void) {
  if (!n) return draw(ctx);
  const rec = new RecPix();
  draw({ ...ctx, g: rec, v: { ...ctx.v, rot: { cx, cy, n } } });
  rec.replay(ctx.g);
}

// 화면 가운데에 오는 월드 좌표(아트 픽셀, 바닥 원점 기준)
export interface Camera {
  x: number;
  y: number;
}

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 6;

export function world(gx: number, gy: number, z = 0): Pt {
  return [((gx - gy) * TW) / 2, ((gx + gy) * TH) / 2 - z];
}

export function makeView(cssW: number, cssH: number, scale: number, cam: Camera): View {
  const artW = Math.ceil(cssW / scale);
  const artH = Math.ceil(cssH / scale);
  return { artW, artH, scale, ox: Math.round(artW / 2 - cam.x), oy: Math.round(artH / 2 - cam.y) };
}

// 처음에는 사무실 전체가 거의 들어오는 배율(큰 화면 3배, 작은 화면 2배). HUD(위)와 회사 카드(오른쪽)를 피해 가운데를 맞춥니다.
export function defaultZoom(cssW: number, cssH: number): number {
  // 사무실 전체(바닥 마름모)가 화면에 거의 들어오는 가장 큰 정수 배율. 작은 사무실은 3배까지.
  const artW = ((FW + FH) * TW) / 2 + 60;
  const artH = ((FW + FH) * TH) / 2 + WALL_H + 40;
  const z = Math.floor(Math.min((cssW - 80) / artW, (cssH - 120) / artH) * 1.3);
  return Math.max(ZOOM_MIN, Math.min(3, z));
}

export function defaultCamera(scale: number, reserveRight: number, reserveTop: number): Camera {
  const c = world(FW / 2, FH / 2, 20);
  return clampCamera({ x: c[0] + reserveRight / 2 / scale, y: c[1] - reserveTop / 2 / scale });
}

export function clampCamera(c: Camera): Camera {
  const minX = -FH * (TW / 2) - 40;
  const maxX = FW * (TW / 2) + 40;
  const minY = -WALL_H - 40;
  const maxY = ((FW + FH) * TH) / 2 + 40;
  return { x: Math.max(minX, Math.min(maxX, c.x)), y: Math.max(minY, Math.min(maxY, c.y)) };
}

export function P(v: View, gx: number, gy: number, z = 0): Pt {
  if (v.rot) [gx, gy] = turnPt(v.rot, gx, gy);
  return [v.ox + ((gx - gy) * TW) / 2, v.oy + ((gx + gy) * TH) / 2 - z];
}

// 좌석 위치는 저장된 좌표가 아니라 지금 배치표(office.json)에서 좌석 id로 계산합니다(배치를 바꿔도 이어하기가 맞게).
export function seatPos(seat: Seat): { gx: number; gy: number } {
  return seatGrid(officeTier(TIER), seat);
}

interface BoxCols {
  top: Col;
  left: Col; // +y 면(화면 왼쪽 아래를 봄)
  right: Col; // +x 면(화면 오른쪽 아래를 봄)
  hi?: Col; // 윗면 앞쪽 모서리 밝은 선
  line?: Col; // 바깥 윤곽선
}

function box(g: Pix, v: View, x: number, y: number, z: number, w: number, d: number, h: number, c: BoxCols) {
  if (v.rot) {
    // 돌린 상자도 바닥과 나란한 상자: 돌린 두 모서리로 새 상자를 만들어 그림(보이는 면이 맞게)
    const a = turnPt(v.rot, x, y);
    const b = turnPt(v.rot, x + w, y + d);
    const x0 = Math.min(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]);
    const x1 = Math.max(a[0], b[0]);
    const y1 = Math.max(a[1], b[1]);
    if (g instanceof RecPix) g.group(x0, y0, x1, y1, z, z + h);
    return box(g, { ...v, rot: undefined }, x0, y0, z, x1 - x0, y1 - y0, h, c);
  }
  const p = (a: number, b: number, cz: number) => P(v, a, b, cz);
  g.poly([p(x, y + d, z), p(x + w, y + d, z), p(x + w, y + d, z + h), p(x, y + d, z + h)], c.left);
  g.poly([p(x + w, y, z), p(x + w, y + d, z), p(x + w, y + d, z + h), p(x + w, y, z + h)], c.right);
  g.poly([p(x, y, z + h), p(x + w, y, z + h), p(x + w, y + d, z + h), p(x, y + d, z + h)], c.top);
  if (c.hi) {
    g.line(p(x, y + d, z + h), p(x + w, y + d, z + h), c.hi);
    g.line(p(x + w, y + d, z + h), p(x + w, y, z + h), c.hi);
  }
  if (c.line) {
    const o = [p(x, y, z + h), p(x + w, y, z + h), p(x + w, y, z), p(x + w, y + d, z), p(x, y + d, z), p(x, y + d, z + h)];
    for (let i = 0; i < o.length; i++) g.line(o[i], o[(i + 1) % o.length], c.line);
  }
}

function cols(base: string, line?: string): BoxCols {
  const b = hex(base);
  return { top: shade(b, 1.12), left: b, right: shade(b, 0.8), hi: shade(b, 1.3), line: line ? hex(line) : undefined };
}

// 바닥에 평평한 사각형
function rect(g: Pix, v: View, x0: number, y0: number, x1: number, y1: number, c: Col, z = 0) {
  g.poly([P(v, x0, y0, z), P(v, x1, y0, z), P(v, x1, y1, z), P(v, x0, y1, z)], c);
}

function outline(g: Pix, v: View, x0: number, y0: number, x1: number, y1: number, c: Col, z = 0) {
  const q = [P(v, x0, y0, z), P(v, x1, y0, z), P(v, x1, y1, z), P(v, x0, y1, z)];
  for (let i = 0; i < 4; i++) g.line(q[i], q[(i + 1) % 4], c);
}

// ── 색 ──
const C = {
  asphalt: hex('#4a4c50'),
  grass: hex('#7db35f'),
  grassDark: hex('#6a9e50'),
  walk: hex('#d8d4ca'),
  walkLine: hex('#c7c2b6'),
  slabL: hex('#b9bdc6'),
  slabR: hex('#9aa0ad'),
  wood1: hex('#c8955e'),
  wood2: hex('#bf8b55'),
  seam: hex('#a87645'),
  wallA: hex('#efe6d3'),
  wallB: hex('#e2d6bd'),
  wallTop: hex('#faf6ec'),
  wallEdge: hex('#cbbd9f'),
  base: hex('#8c7a5c'),
  frame: hex('#fbfaf6'),
  ink: hex('#2a2233'),
  deskTop: hex('#f1efe9'),
  deskL: hex('#cfcabe'),
  deskR: hex('#b4ae9f'),
  monitor: hex('#2a2f3a'),
  screenOff: hex('#39414f'),
  screenBg: hex('#1b2232'),
  key: hex('#454b59'),
  glass: hex('#cdeaff', 80),
  glassR: hex('#a9d6f5', 90),
};

// 하늘색: 낮 → 오후 노을(퇴근 무렵) → 밤(A-149) → 새벽 → 아침. hour는 9~33(33 = 다음 날 9시)
export function skyColor(hour: number): Col {
  const day = hex('#93d3ff');
  const eve = hex('#ffb070');
  const night = hex('#1d2a4a');
  if (hour <= 18) {
    const t = Math.max(0, Math.min(1, (hour - 14.4) / 3.6));
    return mix(day, eve, t * t);
  }
  if (hour <= 20.5) return mix(eve, night, (hour - 18) / 2.5);
  if (hour <= 29.5) return night;
  if (hour <= 31) return mix(night, eve, (hour - 29.5) / 1.5);
  return mix(eve, day, Math.min(1, (hour - 31) / 2));
}

// 가로등·창문 불에 쓰는 하루 진행(0 출근 ~ 1 퇴근). 퇴근 뒤 밤에는 1로 둠(새벽 6시 넘으면 꺼짐)
function dayFrac(s: GameState): number {
  if (inNight(s)) return clockHour(s) < 30 ? 1 : 0.5;
  return Math.min(1, s.msInDay / DATA.time.dayMs);
}

// ── 사람(스프라이트) ──
export interface Actor {
  id: string; // 'ceo' 또는 직원 id 또는 'pending:…'
  kind: 'ceo' | 'emp' | 'pending';
  seat: Seat;
  head: Pt; // 이름표를 붙일 아트 좌표(머리 위)
  box: [number, number, number, number]; // 클릭 영역(아트 좌표)
}

function frontSeat(seat: Seat) {
  return seat.zone === 'ceo' || seat.zone === 'exec';
}

function anchor(v: View, seat: Seat): Pt {
  const { gx, gy } = seatPos(seat);
  const base = v.rot ? { ...v, rot: undefined } : v;
  if (frontSeat(seat)) {
    const a = P(base, gx + 1, gy + 0.6, 7);
    return [Math.round(a[0]), Math.round(a[1])];
  }
  // 돌린 책상(A-128): 앉은 자리도 책상 가운데 둘레로 같이 돎
  const [ax, ay] = turnPt({ cx: gx + 1, cy: gy + 1, n: seat.rot ?? 0 }, gx + 1, gy + 1.3);
  const a = P(base, ax, ay, 7);
  return [Math.round(a[0]), Math.round(a[1])];
}

export function actors(s: GameState, v: View): Actor[] {
  const out: Actor[] = [];
  for (const seat of s.seats) {
    if (!seat.occupant || seat.occupant.startsWith('moving:')) continue;
    const a = anchor(v, seat);
    const kind: Actor['kind'] = seat.occupant === 'ceo' ? 'ceo' : seat.occupant.startsWith('pending:') ? 'pending' : 'emp';
    if (kind === 'emp' && !s.employees.some((e) => e.id === seat.occupant)) continue;
    if (kind !== 'pending' && !atDesk(s, seat.occupant)) continue; // 퇴근한 사람(A-149)
    const top = kind === 'pending' ? a[1] - 12 : a[1] - 15;
    out.push({ id: seat.occupant, kind, seat, head: [a[0], top - 2], box: [a[0] - 7, top - 1, 14, kind === 'pending' ? 14 : 19] });
  }
  return out;
}

// ── 장면 그리기 ──
// 배치 모드(A-80, A-87): 놓기·옮기기·치우기. item은 놓을 물건('desk' 또는 가구 id),
// tile은 마우스가 가리키는 물건의 왼쪽 위 칸, pick은 옮기려고 집은 책상·가구.
export interface EditState {
  mode: 'place' | 'move' | 'remove' | 'rotate';
  item: string | null;
  tile: { gx: number; gy: number } | null;
  pick: { kind: 'desk' | 'furn'; id: string } | null;
  rot: Rot; // 손에 든 물건의 방향(A-128, R 키로 돌림)
}

// 지금 손에 든 물건(놓는 중이거나 집어 든 것)의 가구 id. 책상은 'desk'
export function editItem(s: GameState, e: EditState): string | null {
  if (e.mode === 'place') return e.item;
  if (e.mode === 'move' && e.pick) return e.pick.kind === 'desk' ? 'desk' : (placedOn(s).find((p) => p.id === e.pick!.id)?.item ?? null);
  return null;
}

interface DrawCtx {
  g: Pix;
  v: View;
  t: number; // ms
  s: GameState;
  hover: string | null;
  edit: EditState | null;
}

export function drawOffice(g: Pix, v: View, s: GameState, t: number, hover: string | null, edit: EditState | null = null) {
  setLayout(s.company.officeTier);
  const ctx: DrawCtx = { g, v, t, s, hover, edit };
  drawGround(ctx);
  drawFloor(ctx);
  if (edit) drawEditFloor(ctx, edit);
  drawWalls(ctx);
  const items: { key: number; draw: () => void }[] = [];
  const held = edit?.mode === 'move' && edit.tile ? edit.pick : null; // 집어 든 것은 원래 자리 대신 마우스 자리에 그림
  for (const seat of s.seats) {
    if (seat.bought === false && seat.occupant === null) continue; // 임원 자리처럼 아직 책상이 없는 자리는 빈 바닥
    if (held?.kind === 'desk' && held.id === seat.id) continue;
    const p = seatPos(seat);
    items.push({ key: p.gx + p.gy + 1, draw: () => drawSeat(ctx, seat, p.gx, p.gy) });
  }
  for (const p of placedOn(s)) {
    if (held?.kind === 'furn' && held.id === p.id) continue;
    items.push({ key: itemKey(p.item, p.gx!, p.gy!, p.rot ?? 0), draw: () => drawItem(ctx, p.item, p.gx!, p.gy!, p.rot ?? 0) });
  }
  const hand = edit && edit.tile ? editItem(s, edit) : null;
  if (edit && edit.tile && hand) {
    const { gx, gy } = edit.tile;
    if (hand === 'desk') {
      const ghost: Seat = held ? { ...s.seats.find((x) => x.id === held.id)!, gx, gy, rot: edit!.rot } : { id: 'ghost', zone: 'desk', occupant: null, gx, gy, rot: edit!.rot };
      items.push({ key: gx + gy + 1, draw: () => drawSeat(ctx, ghost, gx, gy) });
    } else items.push({ key: itemKey(hand, gx, gy, edit!.rot), draw: () => drawItem(ctx, hand, gx, gy, edit!.rot) });
  }
  for (const d of L.decor) items.push({ key: d.x + d.y + (d.k ?? 0), draw: () => d.draw(ctx, d.x, d.y) });
  for (const w of L.glass) {
    // 긴 유리벽은 1칸씩 잘라 앞뒤 순서를 맞춥니다.
    const len = Math.hypot(w[2] - w[0], w[3] - w[1]);
    const n = Math.max(1, Math.ceil(len));
    for (let i = 0; i < n; i++) {
      const a = [w[0] + ((w[2] - w[0]) * i) / n, w[1] + ((w[3] - w[1]) * i) / n];
      const b = [w[0] + ((w[2] - w[0]) * (i + 1)) / n, w[1] + ((w[3] - w[1]) * (i + 1)) / n];
      items.push({ key: (a[0] + b[0]) / 2 + (a[1] + b[1]) / 2 + 0.05, draw: () => glassSeg(ctx, a[0], a[1], b[0], b[1], i === 0, i === n - 1) });
    }
  }
  items.sort((a, b) => a.key - b.key);
  for (const it of items) it.draw();
  // 퇴근 뒤(A-149): 밤에는 화면 전체가 어둡고, 야근하는 사람이 없으면 사무실 불도 꺼져 더 어두움
  if (inNight(s)) {
    const h = clockHour(s);
    const dark = Math.max(0, Math.min(1, (h - 18) / 2, (33 - h) / 3));
    const lit = workingLate(s).length > 0 || atDesk(s, 'ceo');
    if (dark > 0) g.rect(0, 0, g.w, g.h, hex('#0b1430', Math.round(dark * (lit ? 70 : 130))));
  }
}

// ── 바깥 거리(A-122) ── 사무실 대지를 가운데 두고 4칸 도로로 나뉜 블록이 바둑판처럼 이어집니다.
// 뒤쪽 블록은 높은 오피스 빌딩, 앞쪽 블록은 사무실을 가리지 않게 낮은 상가·공원·주차장입니다.
const ROAD = 4;
const BLOCK = 16;
const BLOCKS = 3; // 사무실 대지 둘레로 몇 블록까지 그릴지
const FRONT_MAX_H = 26; // 앞쪽 블록 건물 높이 상한(사무실 바닥과 겹치지 않게)

// i번째 블록이 한 축에서 차지하는 범위. 0은 사무실 대지, size는 그 축의 사무실 크기
function lotSpan(i: number, size: number): [number, number] {
  if (i === 0) return [-7, size + 7];
  if (i > 0) {
    const s = size + 7 + ROAD + (i - 1) * (BLOCK + ROAD);
    return [s, s + BLOCK];
  }
  const e = -7 - ROAD + (i + 1) * (BLOCK + ROAD);
  return [e - BLOCK, e];
}

// 블록 사이 도로 가운데 좌표들
function roadCenters(size: number): number[] {
  const out: number[] = [];
  for (let i = -BLOCKS; i < BLOCKS; i++) out.push(lotSpan(i, size)[1] + ROAD / 2);
  return out;
}

// 창문 하나에 불이 켜졌는지. seed는 창문마다 고정된 0~1 값, frac은 하루 진행(0 출근 ~ 1 퇴근 무렵)
function windowLit(seed: number, frac: number): boolean {
  // TODO(human)
  return false;
}

function rnd(...n: number[]): number {
  let h = 2166136261;
  for (const k of n) h = Math.imul(h ^ Math.round(k * 16), 16777619);
  // 작은 정수 입력도 고르게 퍼지도록 섞기(murmur3 마무리)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type BldKind = 'tower' | 'mid' | 'shop';
interface Bld {
  id: number;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  kind: BldKind;
  base: string;
}

const BLD_COLS: Record<BldKind, string[]> = {
  tower: ['#7d93b3', '#6b7f99', '#8aa4c4', '#5f6f86'],
  mid: ['#cfd3da', '#d9c9ac', '#b9775c', '#e6e1d6', '#a9b3a0'],
  shop: ['#e8dcc4', '#d8c2a0', '#c9ced6', '#e3cfc6'],
};
const AWNINGS = ['#d9453b', '#3f8cff', '#2fbf71', '#f0a020'];

function drawGround({ g, v, s, t }: DrawCtx) {
  g.clear(inNight(s) ? shade(C.asphalt, 0.6) : C.asphalt);
  const frac = dayFrac(s);
  const sky = skyColor(clockHour(s));
  const cxs = roadCenters(FW);
  const cys = roadCenters(FH);
  const [ax0] = lotSpan(-BLOCKS, FW);
  const [, ax1] = lotSpan(BLOCKS, FW);
  const [ay0] = lotSpan(-BLOCKS, FH);
  const [, ay1] = lotSpan(BLOCKS, FH);

  // 차선(점선)과 교차로 횡단보도
  const lane = hex('#e9e4d4');
  for (const cy of cys) for (let k = ax0; k < ax1; k += 2) g.line(P(v, k, cy), P(v, k + 1, cy), lane);
  for (const cx of cxs) for (let k = ay0; k < ay1; k += 2) g.line(P(v, cx, k), P(v, cx, k + 1), lane);
  const zebra = hex('#e9e4d4', 220);
  for (const cx of cxs)
    for (const cy of cys) {
      rect(g, v, cx - 2, cy - 2, cx + 2, cy + 2, C.asphalt);
      for (let k = 0; k < 5; k++) {
        const o = -1.7 + k * 0.75;
        for (const side of [-1, 1]) {
          const a = side < 0 ? cx - 3.1 : cx + 2.2;
          rect(g, v, a, cy + o, a + 0.9, cy + o + 0.35, zebra);
          const b = side < 0 ? cy - 3.1 : cy + 2.2;
          rect(g, v, cx + o, b, cx + o + 0.35, b + 0.9, zebra);
        }
      }
    }

  // 블록 바닥(보도·대지)과 그 위에 세울 것(빌딩·나무·가로등) 모으기
  const things: { key: number; draw: () => void }[] = [];
  for (let i = -BLOCKS; i <= BLOCKS; i++)
    for (let j = -BLOCKS; j <= BLOCKS; j++) {
      if (i === 0 && j === 0) continue;
      const [x0, x1] = lotSpan(i, FW);
      const [y0, y1] = lotSpan(j, FH);
      // 화면 밖 블록은 건너뜀(빌딩 높이만큼 위로 여유)
      if (P(v, x0, y1)[0] > v.artW || P(v, x1, y0)[0] < 0 || P(v, x1, y1)[1] < 0 || P(v, x0, y0)[1] - 130 > v.artH) continue;
      const front = i > 0 || j > 0;
      rect(g, v, x0, y0, x1, y1, C.walk);
      outline(g, v, x0, y0, x1, y1, C.walkLine);
      const ix0 = x0 + 1.2;
      const ix1 = x1 - 1.2;
      const iy0 = y0 + 1.2;
      const iy1 = y1 - 1.2;
      const nx = Math.max(1, Math.round((ix1 - ix0) / 8));
      const ny = Math.max(1, Math.round((iy1 - iy0) / 8));
      const cw = (ix1 - ix0) / nx;
      const ch = (iy1 - iy0) / ny;
      for (let a = 0; a < nx; a++)
        for (let b = 0; b < ny; b++) {
          const lx = ix0 + a * cw;
          const ly = iy0 + b * ch;
          const r = rnd(i, j, a, b);
          const id = (i + 10) * 10007 + (j + 10) * 101 + a * 11 + b;
          const far = Math.max(Math.abs(i), Math.abs(j));
          if (r < 0.16) {
            // 작은 공원
            rect(g, v, lx + 0.2, ly + 0.2, lx + cw - 0.2, ly + ch - 0.2, C.grass);
            for (let k = 0; k < 4; k++) {
              const tx = lx + 1 + rnd(id, k, 1) * (cw - 2);
              const ty = ly + 1 + rnd(id, k, 2) * (ch - 2);
              things.push({ key: tx + ty, draw: () => drawTree(g, v, tx, ty) });
            }
            continue;
          }
          if (front && r < 0.34) {
            // 주차장
            rect(g, v, lx + 0.2, ly + 0.2, lx + cw - 0.2, ly + ch - 0.2, hex('#5a5d63'));
            for (let u = lx + 1; u < lx + cw - 0.5; u += 1.2) g.line(P(v, u, ly + 0.6), P(v, u, ly + 2.2), lane);
            continue;
          }
          rect(g, v, lx + 0.2, ly + 0.2, lx + cw - 0.2, ly + ch - 0.2, hex('#c3c6cc'));
          const kind: BldKind = front ? 'shop' : r > 0.62 ? 'tower' : 'mid';
          const pal = BLD_COLS[kind];
          const r2 = rnd(id, 7);
          const h = front
            ? 14 + Math.floor(r2 * (FRONT_MAX_H - 13))
            : kind === 'tower'
              ? 72 + Math.floor(r2 * 40) + far * 8
              : 34 + Math.floor(r2 * 30) + far * 4;
          const bld: Bld = { id, x: lx + 0.6, y: ly + 0.6, w: cw - 1.2, d: ch - 1.2, h, kind, base: pal[Math.floor(rnd(id, 3) * pal.length)] };
          // 빌딩 그림자(오른쪽 아래로)
          rect(g, v, bld.x + 0.4, bld.y + bld.d, bld.x + bld.w + 0.4, bld.y + bld.d + 0.8, hex('#000000', 40));
          things.push({ key: bld.x + bld.w / 2 + bld.y + bld.d / 2, draw: () => drawBuilding(g, v, bld, sky, frac) });
        }
      // 보도 가로수와 모퉁이 가로등
      for (let k = x0 + 1.5; k < x1 - 1; k += 3.5) {
        if (rnd(i, j, k * 10) < 0.35) continue;
        const ty = y1 - 0.6;
        things.push({ key: k + ty, draw: () => drawTree(g, v, k, ty) });
      }
      for (let k = y0 + 1.5; k < y1 - 1; k += 3.5) {
        if (rnd(j, i, k * 10) < 0.35) continue;
        const tx = x1 - 0.6;
        things.push({ key: tx + k, draw: () => drawTree(g, v, tx, k) });
      }
      things.push({ key: x1 + y1 - 1, draw: () => drawLamp(g, v, x1 - 0.5, y1 - 0.5, frac) });
    }

  // 도로를 달리는 차(두 차선, 서로 반대 방향)
  const carCols = ['#e5484d', '#3f8cff', '#f2f2ee', '#2a2f3a', '#f0a020', '#2fbf71'];
  cys.forEach((cy, r) => {
    for (const ln of [-1, 1]) {
      const sp = 1.4 + rnd(r, ln, 9);
      const span = ax1 - ax0;
      const pos = ax0 + ((((rnd(r, ln) * span + (ln * t * sp) / 1000) % span) + span) % span);
      const gy = cy + (ln < 0 ? -1.4 : 0.6);
      const col = carCols[(r * 2 + (ln > 0 ? 1 : 0)) % carCols.length];
      things.push({ key: pos + 0.8 + gy + 0.4, draw: () => drawCar(g, v, pos, gy, true, col) });
    }
  });
  cxs.forEach((cx, r) => {
    for (const ln of [-1, 1]) {
      const sp = 1.4 + rnd(r, ln, 19);
      const span = ay1 - ay0;
      const pos = ay0 + ((((rnd(r, ln, 5) * span + (ln * t * sp) / 1000) % span) + span) % span);
      const gx = cx + (ln < 0 ? 0.6 : -1.4);
      const col = carCols[(r * 2 + 3 + (ln > 0 ? 1 : 0)) % carCols.length];
      things.push({ key: gx + 0.4 + pos + 0.8, draw: () => drawCar(g, v, gx, pos, false, col) });
    }
  });

  // 사무실 대지: 보도 테두리 → 잔디
  rect(g, v, -7, -7, FW + 7, FH + 7, C.walk);
  outline(g, v, -7, -7, FW + 7, FH + 7, C.walkLine);
  rect(g, v, -5.8, -5.8, FW + 5.8, FH + 5.8, C.grass);
  for (let i = -6; i < FW + 6; i++)
    for (let j = -6; j < FH + 6; j++) {
      const h = hashStr(`${i},${j}`);
      if (h % 3 !== 0) continue;
      const p = P(v, i + ((h >>> 4) % 10) / 10, j + ((h >>> 8) % 10) / 10);
      g.px(p[0], p[1], C.grassDark);
      g.px(p[0] + 1, p[1] - 1, C.grassDark);
    }
  rect(g, v, -2.4, -2.4, FW + 2.4, FH + 2.4, C.walk);
  for (let i = -2; i <= FW + 2; i++) g.line(P(v, i, -2.4), P(v, i, FH + 2.4), C.walkLine);
  for (let j = -2; j <= FH + 2; j++) g.line(P(v, -2.4, j), P(v, FW + 2.4, j), C.walkLine);
  // 건물 그림자
  g.poly([P(v, 0.4, FH, -7), P(v, FW + 0.6, FH, -7), P(v, FW + 0.6, FH + 0.9, -7), P(v, 0.4, FH + 0.9, -7)], hex('#000000', 40));
  // 대지 모퉁이 가로수
  for (const [tx, ty] of [[-6.3, FH + 6.3], [FW + 6.3, -6.3], [FW + 6.3, FH + 6.3], [-6.3, -6.3]]) things.push({ key: tx + ty, draw: () => drawTree(g, v, tx, ty) });

  // 서 있는 것은 뒤(gx+gy 작은 쪽)부터 그려 앞이 뒤를 가립니다.
  things.sort((a, b) => a.key - b.key);
  for (const it of things) it.draw();
}

// 바깥 빌딩: 상자 + 층마다 창문 줄 + 옥상 설비. 상가는 1층에 차양
function drawBuilding(g: Pix, v: View, b: Bld, sky: Col, frac: number) {
  const c = cols(b.base);
  box(g, v, b.x, b.y, 0, b.w, b.d, b.h, { ...c, line: shade(hex(b.base), 0.55) });
  const glass = b.kind === 'tower' ? mix(sky, hex('#24324a'), 0.35) : mix(sky, hex('#3a4a63'), 0.5);
  const lit = hex('#ffd77a');
  const floor = b.kind === 'tower' ? 7 : 8;
  const ww = b.kind === 'tower' ? 0.75 : 0.5;
  const wh = b.kind === 'tower' ? 5 : 4;
  const z0 = b.kind === 'shop' ? 13 : 5;
  const faces: [(u: number, z: number) => Pt, number, number][] = [
    [(u, z) => P(v, b.x + u, b.y + b.d, z), b.w, 0], // 왼쪽 아래를 보는 면
    [(u, z) => P(v, b.x + b.w, b.y + u, z), b.d, 1], // 오른쪽 아래를 보는 면
  ];
  for (const [q, len, f] of faces) {
    let row = 0;
    for (let z = z0; z + wh <= b.h - 4; z += floor, row++)
      for (let u = 0.35, col = 0; u + ww <= len - 0.25; u += 1, col++) {
        const on = windowLit(rnd(b.id, f, row, col), frac);
        const wc = on ? lit : f ? shade(glass, 0.85) : glass;
        g.poly([q(u, z), q(u + ww, z), q(u + ww, z + wh), q(u, z + wh)], wc);
        if (!on && b.kind === 'tower') g.px(q(u + 0.1, z + wh - 1)[0], q(u + 0.1, z + wh - 1)[1], shade(glass, 1.4));
      }
    if (b.kind === 'shop') {
      // 1층 통유리와 차양
      g.poly([q(0.3, 1), q(len - 0.3, 1), q(len - 0.3, 8), q(0.3, 8)], shade(glass, f ? 0.9 : 1.05));
      const aw = hex(AWNINGS[b.id % AWNINGS.length]);
      g.poly([q(0.1, 8), q(len - 0.1, 8), q(len - 0.1, 11), q(0.1, 11)], f ? shade(aw, 0.8) : aw);
      for (let u = 0.1; u < len - 0.3; u += 0.5) g.line(q(u, 8), q(u, 10), shade(aw, 1.35));
    } else {
      // 1층 출입구
      const m = len / 2;
      g.poly([q(m - 0.5, 0), q(m + 0.5, 0), q(m + 0.5, 5), q(m - 0.5, 5)], shade(glass, 0.7));
    }
  }
  // 옥상 설비
  if (b.w > 2 && b.d > 2) box(g, v, b.x + b.w * 0.25, b.y + b.d * 0.3, b.h, 1.2, 1, b.kind === 'shop' ? 2 : 4, cols('#9aa0ad'));
  if (b.kind === 'tower') {
    const top = P(v, b.x + b.w * 0.7, b.y + b.d * 0.6, b.h);
    g.line(top, [top[0], top[1] - 12], hex('#5d6473'));
    g.px(top[0], top[1] - 13, hex('#e5484d'));
  }
}

function drawTree(g: Pix, v: View, gx: number, gy: number) {
  const p = P(v, gx, gy, 0);
  const x = Math.round(p[0]);
  const y = Math.round(p[1]);
  g.rect(x - 3, y - 1, 7, 2, hex('#000000', 45));
  g.rect(x, y - 6, 2, 6, hex('#7a5233'));
  const leaf = C.grassDark;
  const leafHi = hex('#93c76f');
  for (let dy = -5; dy <= 5; dy++)
    for (let dx = -5; dx <= 5; dx++) {
      const d = dx * dx + dy * dy * 1.2;
      if (d > 26) continue;
      g.px(x + 1 + dx, y - 11 + dy, dy < -1 && dx < 2 && d < 14 ? leafHi : dy > 2 ? shade(leaf, 0.85) : leaf);
    }
}

function drawLamp(g: Pix, v: View, gx: number, gy: number, frac: number) {
  const p = P(v, gx, gy, 0);
  const x = Math.round(p[0]);
  const y = Math.round(p[1]);
  const pole = hex('#3a3f4b');
  g.rect(x, y - 18, 1, 18, pole);
  g.rect(x - 3, y - 18, 4, 1, pole);
  const on = frac > 0.7;
  g.rect(x - 4, y - 17, 3, 1, on ? hex('#ffe9a8') : hex('#c9ccd3'));
  if (on) g.rect(x - 5, y - 16, 5, 1, hex('#ffe9a8', 90));
}

// 차: 몸체 + 지붕. alongX면 gx 방향으로 깁니다.
function drawCar(g: Pix, v: View, gx: number, gy: number, alongX: boolean, col: string) {
  const len = 1.6;
  const W = 0.8;
  const [w, d] = alongX ? [len, W] : [W, len];
  rect(g, v, gx + 0.1, gy + 0.1, gx + w + 0.2, gy + d + 0.2, hex('#000000', 60));
  box(g, v, gx, gy, 1, w, d, 4, { ...cols(col), line: hex('#22252c') });
  const [cx, cy, cw, cd] = alongX ? [gx + 0.4, gy + 0.08, 0.8, d - 0.16] : [gx + 0.08, gy + 0.4, w - 0.16, 0.8];
  box(g, v, cx, cy, 5, cw, cd, 3, { top: shade(hex(col), 1.1), left: hex('#2c3546'), right: hex('#3a465c') });
}

function drawFloor({ g, v }: DrawCtx) {
  box(g, v, 0, 0, -7, FW, FH, 7, { top: C.wood1, left: C.slabL, right: C.slabR, hi: shade(C.slabL, 1.15) });
  // 나무 마루: 반 칸 폭 널빤지 줄무늬 + 이음매
  for (let k = 0; k < FH * 2; k++) {
    const y0 = k / 2;
    const y1 = (k + 1) / 2;
    rect(g, v, 0, y0, FW, y1, k % 2 ? C.wood1 : C.wood2);
    for (let jx = ((k * 7) % 5) * 0.6 + 0.8; jx < FW; jx += 3) g.line(P(v, jx, y0), P(v, jx, y1), C.seam);
  }
  // 대표실 카펫·러그(원룸에는 없음)
  const ex = L.exec;
  if (ex.x1 > ex.x0) {
    rect(g, v, ex.x0, 0, FW, ex.y1, hex('#5b4b5f'));
    rect(g, v, ex.x0 + 0.3, 0.5, FW - 0.2, ex.y1 - 0.9, hex('#7b2f3b'));
    outline(g, v, ex.x0 + 0.5, 0.7, FW - 0.4, ex.y1 - 1.1, hex('#d6a84a'));
  }
  // 회의실 카펫
  const mt = L.meeting;
  if (mt) {
    rect(g, v, mt.x0, 0, mt.x1, mt.y1, hex('#55607a'));
    for (let i = 0; i < 10; i++) for (let j = 0; j < 12; j++) if ((i + j) % 2) rect(g, v, mt.x0 + i * 0.52, j * 0.52, mt.x0 + 0.52 + i * 0.52, (j + 1) * 0.52, hex('#5c6884'));
  }
  // 라운지 러그
  const lo = L.lounge;
  if (lo) {
    rect(g, v, lo.x0, lo.y0, lo.x1, lo.y1, hex('#d9b26a'));
    outline(g, v, lo.x0 + 0.2, lo.y0 + 0.2, lo.x1 - 0.2, lo.y1 - 0.2, hex('#b98d43'));
  }
  // 탕비실 타일
  const kt = L.kitchen;
  if (kt) for (let i = 0; i < 10; i++) for (let j = 0; j < 9; j++) rect(g, v, kt.x0 + i * 0.5, kt.y0 + j * 0.5, kt.x0 + 0.5 + i * 0.5, kt.y0 + 0.5 + j * 0.5, (i + j) % 2 ? hex('#eef0f3') : hex('#d6dae1'));
  // 출입문 앞 매트
  rect(g, v, 0.05, L.doorY - 0.1, 0.9, L.doorY + 1.1, hex('#4a3b33'));
}

// 배치 모드: 바닥 격자, 놓을 수 없는 곳은 어둡게(책상은 방도 막힘, 가구는 방 안에도 놓임), 마우스 자리에 초록(놓을 수 있음)·빨강(안 됨) 테두리
function drawEditFloor({ g, v, s, t }: DrawCtx, edit: EditState) {
  const line = hex('#ffffff', 60);
  for (let i = 0; i <= FW; i++) g.line(P(v, i, 0), P(v, i, FH), line);
  for (let j = 0; j <= FH; j++) g.line(P(v, 0, j), P(v, FW, j), line);
  const hand = editItem(s, edit);
  const plan = floorPlan(TIER);
  for (const b of hand && hand !== 'desk' ? plan.fixed : plan.blocked) {
    const x0 = Math.max(0, b.x0), y0 = Math.max(0, b.y0), x1 = Math.min(FW, b.x1), y1 = Math.min(FH, b.y1);
    if (x1 > x0 && y1 > y0) rect(g, v, x0, y0, x1, y1, hex('#1b1f2e', 70));
  }
  if (!edit.tile || !hand) return;
  const { gx, gy } = edit.tile;
  const ignore = edit.mode === 'move' ? edit.pick?.id : undefined;
  const ok = hand === 'desk' ? !deskFits(s, gx, gy, ignore) : !furnitureSpotFits(s, hand, gx, gy, ignore, TIER, edit.rot);
  const { w, h } = itemSize(hand, edit.rot);
  const c = ok ? hex('#57d391', 120) : hex('#e5484d', 120);
  rect(g, v, gx, gy, gx + w, gy + h, c);
  const blink = Math.floor(t / 250) % 2 === 0;
  outline(g, v, gx, gy, gx + w, gy + h, blink ? hex('#ffffff') : ok ? hex('#2fbf71') : hex('#e5484d'));
}

function drawWalls({ g, v, s, t }: DrawCtx) {
  const sky = skyColor(clockHour(s));
  const T = 0.34;
  // 왼쪽 뒤 벽(gx = 0)
  box(g, v, -T, -T, -7, T, FH + T, WALL_H + 7, { top: C.wallTop, left: C.wallEdge, right: C.wallB });
  // 오른쪽 뒤 벽(gy = 0)
  box(g, v, 0, -T, -7, FW, T, WALL_H + 7, { top: C.wallTop, left: C.wallA, right: C.wallEdge });
  // 걸레받이
  g.line(P(v, 0, FH, 2), P(v, 0, 0, 2), C.base);
  g.line(P(v, 0, 0, 2), P(v, FW, 0, 2), C.base);
  g.line(P(v, 0, FH, 1), P(v, 0, 0, 1), C.base);
  g.line(P(v, 0, 0, 1), P(v, FW, 0, 1), C.base);

  // 뒤 벽 통유리 창
  const winY = (x: number, z: number) => P(v, x, 0, z);
  for (const [a, b] of L.winY) drawWindow(g, winY, a, b, 12, 38, sky);
  const winX = (y: number, z: number) => P(v, 0, y, z);
  for (const [a, b] of L.winX) drawWindow(g, winX, a, b, 12, 38, sky);

  const wb = (y: number, z: number) => P(v, 0, y, z);
  // 화이트보드(왼쪽 벽)
  if (L.board) {
    const [b0, b1] = L.board;
    g.poly([wb(b0, 14), wb(b1, 14), wb(b1, 34), wb(b0, 34)], hex('#b7bcc6'));
    g.poly([wb(b0 + 0.1, 15), wb(b1 - 0.1, 15), wb(b1 - 0.1, 33), wb(b0 + 0.1, 33)], hex('#fdfdfb'));
    g.line(wb(b0 + 0.4, 18), wb(b0 + 1.0, 22), hex('#3f8cff'));
    g.line(wb(b0 + 1.0, 22), wb(b0 + 1.6, 20), hex('#3f8cff'));
    g.line(wb(b0 + 1.6, 20), wb(b0 + 2.4, 29), hex('#3f8cff'));
    g.line(wb(b0 + 0.4, 30), wb(b0 + 1.4, 30), hex('#e5484d'));
    g.line(wb(b0 + 0.4, 27), wb(b0 + 1.0, 27), C.ink);
  }

  // 출입문
  const d0 = L.doorY - 0.2;
  g.poly([wb(d0, 0), wb(d0 + 1.4, 0), wb(d0 + 1.4, 30), wb(d0, 30)], hex('#e9e2d2'));
  g.poly([wb(d0 + 0.1, 0), wb(d0 + 1.3, 0), wb(d0 + 1.3, 29), wb(d0 + 0.1, 29)], hex('#8a5a3c'));
  g.poly([wb(d0 + 0.25, 4), wb(d0 + 1.15, 4), wb(d0 + 1.15, 26), wb(d0 + 0.25, 26)], hex('#9d6a47'));
  const knob = wb(d0 + 1.05, 14);
  g.px(knob[0], knob[1], hex('#f1c453'));
  g.px(knob[0] + 1, knob[1], hex('#f1c453'));

  // 라운지 벽걸이 TV(라운지가 왼쪽 벽에 붙어 있을 때)
  if (L.lounge && L.loungeLeft) {
    const ty = L.lounge.y0 + 0.5;
    g.poly([wb(ty, 12), wb(ty + 2.7, 12), wb(ty + 2.7, 30), wb(ty, 30)], hex('#1d2130'));
    const tv = (u: number, z: number) => wb(ty + 0.2 + u, z);
    const hue = Math.floor(t / 1500) % 3;
    g.poly([tv(0, 14), tv(2.3, 14), tv(2.3, 28), tv(0, 28)], [hex('#3f8cff'), hex('#2fbf71'), hex('#f2a33a')][hue]);
    g.poly([tv(0.4, 17), tv(1.4, 17), tv(1.4, 24), tv(0.4, 24)], hex('#ffffff', 160));
  }

  // 벽시계
  const clk = P(v, (L.meeting ? L.meeting.x0 : L.exec.x0) - 0.05, 0, 30);
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (dx * dx + dy * dy <= 17) g.px(clk[0] + dx, clk[1] + dy, dx * dx + dy * dy >= 13 ? C.ink : hex('#ffffff'));
  const ang = clockHour(s) * ((Math.PI * 2) / 12);
  g.line(clk, [clk[0] + Math.sin(ang) * 2.5, clk[1] - Math.cos(ang) * 2.5], C.ink);
  g.line(clk, [clk[0], clk[1] - 3], hex('#e5484d'));
}

function drawWindow(g: Pix, q: (u: number, z: number) => Pt, a: number, b: number, z0: number, z1: number, sky: Col) {
  g.poly([q(a - 0.1, z0 - 1), q(b + 0.1, z0 - 1), q(b + 0.1, z1 + 1), q(a - 0.1, z1 + 1)], C.frame);
  const mid = z0 + (z1 - z0) * 0.45;
  g.poly([q(a, z0), q(b, z0), q(b, mid), q(a, mid)], shade(sky, 1.18));
  g.poly([q(a, mid), q(b, mid), q(b, z1), q(a, z1)], sky);
  const bld = shade(sky, 0.82);
  for (let u = a + 0.2; u < b - 0.3; u += 0.7) {
    const hgt = 5 + ((Math.floor(u * 10) * 37) % 9);
    g.poly([q(u, z0), q(u + 0.45, z0), q(u + 0.45, z0 + hgt), q(u, z0 + hgt)], bld);
  }
  g.line(q(a + 0.3, z0 + 4), q(a + 0.9, z1 - 3), shade(sky, 1.35));
  g.line(q(a + 0.5, z0 + 4), q(a + 1.1, z1 - 3), shade(sky, 1.25));
  for (let u = a + 1.4; u < b - 0.2; u += 1.4) g.line(q(u, z0), q(u, z1), C.frame);
  g.line(q(a, z0), q(b, z0), shade(C.frame, 0.8));
}

// ── 유리 칸막이(대표실·회의실) ── 배치는 buildLayout에서 만듭니다.
const GLASS_H = 24;

function glassSeg(ctx: DrawCtx, x0: number, y0: number, x1: number, y1: number, first: boolean, last: boolean) {
  const { g, v } = ctx;
  const p = (x: number, y: number, z: number) => P(v, x, y, z);
  const alongX = Math.abs(y1 - y0) < 1e-6;
  const face = alongX ? C.glass : C.glassR;
  g.poly([p(x0, y0, 2), p(x1, y1, 2), p(x1, y1, GLASS_H), p(x0, y0, GLASS_H)], face);
  // 반사 줄
  g.line(p(x0 + (x1 - x0) * 0.25, y0 + (y1 - y0) * 0.25, 6), p(x0 + (x1 - x0) * 0.45, y0 + (y1 - y0) * 0.45, GLASS_H - 4), hex('#ffffff', 120));
  // 틀
  const frame = hex('#f4f6f9');
  const dark = hex('#9aa3b2');
  g.line(p(x0, y0, GLASS_H), p(x1, y1, GLASS_H), frame);
  g.line(p(x0, y0, 1), p(x1, y1, 1), dark);
  g.line(p(x0, y0, 2), p(x1, y1, 2), dark);
  if (first) g.line(p(x0, y0, 0), p(x0, y0, GLASS_H), frame);
  if (last) g.line(p(x1, y1, 0), p(x1, y1, GLASS_H), frame);
  else g.line(p(x1, y1, 2), p(x1, y1, GLASS_H), hex('#ffffff', 150));
}

// ── 좌석 ──
function seatOccupant(s: GameState, seat: Seat): { kind: 'empty' | 'pending' | 'emp' | 'ceo'; emp?: Employee } {
  const o = seat.occupant;
  if (!o || o.startsWith('moving:')) return { kind: 'empty' };
  if (!o.startsWith('pending:') && !atDesk(s, o)) return { kind: 'empty' }; // 퇴근했으면 빈 책상(A-149)
  if (o === 'ceo') return awayOuting(s) ? { kind: 'empty' } : { kind: 'ceo' }; // 외출·이동 중이면 빈 책상(A-101, A-127)
  if (o.startsWith('pending:')) return { kind: 'pending' };
  const emp = s.employees.find((e) => e.id === o);
  return emp ? { kind: 'emp', emp } : { kind: 'empty' };
}

function drawSeat(ctx: DrawCtx, seat: Seat, x: number, y: number) {
  if (frontSeat(seat)) drawFrontSeat(ctx, seat, x, y);
  else drawTurned(ctx, x + 1, y + 1, seat.rot ?? 0, (c) => drawBackSeat(c, seat, x, y));
}

function drawBackSeat(ctx: DrawCtx, seat: Seat, x: number, y: number) {
  const { g, v, s, t } = ctx;
  const occ = seatOccupant(s, seat);
  const deskTop: BoxCols = { top: C.deskTop, left: C.deskL, right: C.deskR, hi: hex('#ffffff') };
  const legs = cols('#5b6170');
  // 책상: 다리 두 개 + 가림판 + 상판
  box(g, v, x + 0.25, y + 0.2, 0, 0.12, 0.62, 9, legs);
  box(g, v, x + 1.63, y + 0.2, 0, 0.12, 0.62, 9, legs);
  box(g, v, x + 0.37, y + 0.2, 3, 1.26, 0.06, 6, cols('#9aa1ad'));
  box(g, v, x + 0.17, y + 0.17, 9, 1.66, 0.72, 2, deskTop);
  // 모니터
  box(g, v, x + 0.96, y + 0.32, 11, 0.08, 0.08, 3, cols('#3a3f4b'));
  box(g, v, x + 0.58, y + 0.27, 13, 0.84, 0.09, 10, { top: shade(C.monitor, 1.3), left: C.monitor, right: shade(C.monitor, 0.8) });
  const sy = y + 0.36;
  const scr = (u: number, z: number) => P(v, x + u, sy, z);
  const on = occ.kind === 'emp';
  g.poly([scr(0.64, 14), scr(1.36, 14), scr(1.36, 22), scr(0.64, 22)], on ? C.screenBg : C.screenOff);
  if (on && occ.emp) {
    const dc = hex(dept(occ.emp.dept).color);
    const busy = s.speed > 0 && !s.pauseReason;
    const tick = busy && s.speed > 0 ? Math.floor(t / 260 + hashStr(occ.emp.id)) : hashStr(occ.emp.id);
    const linesC = [dc, hex('#e9edf5'), hex('#57d391'), dc];
    for (let i = 0; i < 4; i++) {
      const len = 0.15 + (((tick + i * 7) * 13) % 5) * 0.08;
      const z = 20 - i * 2;
      const ind = (i % 2) * 0.08;
      g.line(scr(0.7 + ind, z), scr(Math.min(1.3, 0.7 + ind + len), z), linesC[i]);
    }
  }
  // 키보드, 소품
  box(g, v, x + 0.74, y + 0.6, 11, 0.52, 0.16, 1, { top: C.key, left: shade(C.key, 0.8), right: shade(C.key, 0.7) });
  const hsh = hashStr(seat.id);
  if (hsh % 3 === 0) box(g, v, x + 1.45, y + 0.5, 11, 0.13, 0.13, 3, { top: hex('#6b3e26'), left: hex('#f2f2f2'), right: hex('#d8d8d8') });
  if (hsh % 3 === 1) box(g, v, x + 0.3, y + 0.45, 11, 0.24, 0.3, 1, { top: hex('#ffffff'), left: hex('#e6e6e6'), right: hex('#d0d0d0') });
  // 의자 좌판·기둥
  box(g, v, x + 0.75, y + 1.1, 0, 0.5, 0.42, 1, cols('#2e323c'));
  box(g, v, x + 0.96, y + 1.27, 1, 0.08, 0.08, 4, cols('#2e323c'));
  if (occ.kind === 'pending') {
    // 입사 대기: 자리에 이삿짐 상자(OF-02 "입사 대기" 상태)
    box(g, v, x + 0.68, y + 1.0, 0, 0.64, 0.55, 9, { top: hex('#d6a86c'), left: hex('#bd8d54'), right: hex('#a27645'), line: hex('#6e4d2a') });
    g.line(P(v, x + 1.0, y + 1.0, 9), P(v, x + 1.0, y + 1.55, 9), hex('#e8d3a8'));
    return;
  }
  box(g, v, x + 0.72, y + 1.05, 5, 0.56, 0.48, 2, cols(on ? '#3a3f4b' : '#4a505d'));
  if (on && occ.emp) drawBackPerson(ctx, seat, occ.emp);
  // 등받이
  box(g, v, x + 0.72, y + 1.5, 7, 0.56, 0.1, 4, cols('#2e323c'));
}

function drawBackPerson(ctx: DrawCtx, seat: Seat, emp: Employee) {
  const { g, v, s, t, hover } = ctx;
  const a = anchor(v, seat);
  const look = lookFor(emp.id, dept(emp.dept).color);
  const busy = !(emp.sickUntil !== null && emp.sickUntil > s.day);
  const running = s.speed > 0;
  const cyc = (t / 1000 + look.phase * 13) % 13;
  let rows: string[];
  if (running && cyc < 1.1) rows = SPRITES.STRETCH; // 가끔 기지개
  else if (busy && running) rows = Math.floor(t / 180 + look.phase * 10) % 2 ? (look.long ? SPRITES.BACK_LONG_A : SPRITES.BACK_SHORT_A) : look.long ? SPRITES.BACK_LONG_B : SPRITES.BACK_SHORT_B;
  else rows = look.long ? SPRITES.BACK_LONG_A : SPRITES.BACK_SHORT_A;
  // 돌린 책상(A-128): 1·2번 돌리면 사람이 화면 쪽을 봄(앞모습)
  const facing = seat.rot === 1 || seat.rot === 2;
  if (facing) rows = (t / 1000 + look.phase * 7) % 4.2 < 0.14 ? SPRITES.FRONT_BLINK : SPRITES.FRONT_A;
  const sx = a[0] - SPRITE_W / 2;
  const sy = a[1] - SPRITE_H + 2;
  if (hover === emp.id) g.spriteOutline(sx, sy, rows, hex('#ffffff'));
  g.sprite(sx, sy, rows, look.pal, facing ? seat.rot === 1 : (hashStr(emp.id) & 16) === 16);
}

function drawFrontSeat(ctx: DrawCtx, seat: Seat, x: number, y: number) {
  const { g, v, s, t, hover } = ctx;
  const occ = seatOccupant(s, seat);
  const isCeo = seat.zone === 'ceo';
  // 높은 등받이 의자
  const leather = cols(isCeo ? '#3b2a2a' : '#34394a');
  box(g, v, x + 0.68, y + 0.22, 7, 0.64, 0.12, isCeo ? 19 : 15, leather);
  box(g, v, x + 0.7, y + 0.34, 5, 0.6, 0.5, 2, leather);
  box(g, v, x + 0.97, y + 0.55, 0, 0.08, 0.08, 5, cols('#2e323c'));
  // 사람
  if (occ.kind === 'ceo' || occ.kind === 'emp') {
    const id = occ.kind === 'ceo' ? 'ceo' : occ.emp!.id;
    const look = lookFor(occ.kind === 'ceo' ? 'ceo-founder' : id, occ.emp ? dept(occ.emp.dept).color : '#2c3a5c', occ.kind === 'ceo');
    const blink = (t / 1000 + look.phase * 7) % 4.2 < 0.14;
    const rows = blink ? SPRITES.FRONT_BLINK : SPRITES.FRONT_A;
    const a = anchor(v, seat);
    const sx = a[0] - SPRITE_W / 2;
    const sy = a[1] - SPRITE_H + 2;
    if (hover === id) g.spriteOutline(sx, sy, rows, hex('#ffffff'));
    g.sprite(sx, sy, rows, look.pal);
  }
  // 책상(대표석은 원목 통책상)
  const desk = isCeo ? { top: hex('#9a6a46'), left: hex('#7a4f33'), right: hex('#633f29'), hi: hex('#b9875e') } : { top: C.deskTop, left: C.deskL, right: C.deskR, hi: hex('#ffffff') };
  box(g, v, x + 0.1, y + 1.0, 0, 1.8, 0.75, 11, desk);
  // 모니터 뒷면(왼쪽)
  box(g, v, x + 0.2, y + 1.08, 11, 0.5, 0.1, 9, { top: hex('#5a6070'), left: hex('#4a5060'), right: hex('#3b404d') });
  // 서류·노트북
  box(g, v, x + 1.3, y + 1.25, 11, 0.4, 0.3, 1, { top: hex('#ffffff'), left: hex('#e2e2e2'), right: hex('#cfcfcf') });
  if (isCeo) {
    // 명패
    const pl = (u: number, z: number) => P(v, x + u, y + 1.75, z);
    g.poly([pl(0.75, 5), pl(1.25, 5), pl(1.25, 8), pl(0.75, 8)], hex('#e3b341'));
    g.line(pl(0.82, 6.5), pl(1.18, 6.5), hex('#8a6a1c'));
  }
}

// ── 소품(관리형 클릭 없음, OF-04) ──
interface Decor {
  x: number;
  y: number;
  k?: number;
  draw: (ctx: DrawCtx, x: number, y: number) => void;
}

const MUG: BoxCols = { top: hex('#6b3e26'), left: hex('#ffffff'), right: hex('#dddddd') };
const PAPER: BoxCols = { top: hex('#ffffff'), left: hex('#eeeeee'), right: hex('#dddddd') };

function leaves(g: Pix, a: Pt, pat: string[], pal: Col[]) {
  for (let j = 0; j < pat.length; j++)
    for (let i = 0; i < pat[j].length; i++) {
      const ch = pat[j][i];
      if (ch !== '.') g.px(a[0] - Math.floor(pat[j].length / 2) + i, a[1] - pat.length + j + 1, pal[Number(ch)]);
    }
}

function plant(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  box(g, v, x - 0.18, y - 0.18, 0, 0.36, 0.36, 6, { top: hex('#5a3b25'), left: hex('#c0643a'), right: hex('#9c4e2c') });
  leaves(g, P(v, x, y, 6), ['...2.1....', '..1221.2..', '.212221...', '..0122102.', '.20212210.', '..021120..', '...0110...', '....00....'], [hex('#2f8f4e'), hex('#3fae5f'), hex('#5fd07c'), hex('#257840')]);
}

function bigPlant(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  box(g, v, x - 0.25, y - 0.25, 0, 0.5, 0.5, 8, cols('#e8ecf2'));
  const a = P(v, x, y, 8);
  leaves(g, a, ['....21.1....', '..2.1212..1.', '.1221222.21.', '..12212221..', '.2122122212.', '..0212221...', '.201212122..', '..02112120..', '...011210...', '....0110....', '.....00.....'], [hex('#2f8f4e'), hex('#3fae5f'), hex('#5fd07c'), hex('#257840')]);
}

function cooler(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  box(g, v, x, y, 0, 0.45, 0.45, 14, cols('#e8ecf2', '#9aa3b5'));
  box(g, v, x + 0.08, y + 0.08, 14, 0.3, 0.3, 8, { top: hex('#cfeaff'), left: hex('#8fcaf5'), right: hex('#6fb2e3') });
  const f = P(v, x + 0.22, y + 0.45, 9);
  g.px(f[0], f[1], hex('#3f8cff'));
  g.px(f[0] + 2, f[1] + 1, hex('#e5484d'));
}

function printer(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  box(g, v, x, y, 0, 0.7, 0.55, 8, cols('#d9dde5', '#8a92a3'));
  box(g, v, x + 0.05, y + 0.05, 8, 0.6, 0.45, 3, cols('#c3c9d4'));
  box(g, v, x + 0.15, y + 0.15, 11, 0.4, 0.25, 1, PAPER);
}

// 회의실: 긴 테이블과 의자, 발표 화면
function meeting(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  const chair = cols('#3a3f4b');
  for (let i = 0; i < 3; i++) box(g, v, x + 0.35 + i * 0.9, y - 0.55, 0, 0.45, 0.4, 7, chair);
  box(g, v, x, y, 0, 3.0, 1.4, 8, { top: hex('#e9e4da'), left: hex('#8a6a4f'), right: hex('#6f543e'), hi: hex('#ffffff') });
  box(g, v, x + 0.5, y + 0.4, 8, 0.5, 0.35, 1, PAPER);
  box(g, v, x + 1.8, y + 0.6, 8, 0.14, 0.14, 3, MUG);
  for (let i = 0; i < 3; i++) box(g, v, x + 0.35 + i * 0.9, y + 1.55, 0, 0.45, 0.4, 7, chair);
}

// 라운지: 벽 TV를 보는 소파와 빈백
function lounge(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  box(g, v, x - 1.1, y + 0.4, 0, 0.7, 1.2, 4, cols('#8a5a3c'));
  box(g, v, x - 1.0, y + 0.6, 4, 0.16, 0.16, 2, MUG);
  const c = cols('#4f7fbf');
  box(g, v, x, y, 0, 0.9, 2.0, 5, c);
  box(g, v, x + 0.6, y, 5, 0.3, 2.0, 8, c);
  box(g, v, x, y, 5, 0.9, 0.2, 3, c);
  box(g, v, x, y + 1.8, 5, 0.9, 0.2, 3, c);
}

function beanbag(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  const a = P(v, x, y, 0);
  const pal = [hex('#d9534f'), hex('#e57373'), hex('#b23c39')];
  leaves(g, [a[0], a[1] + 1], ['...111...', '.1111111.', '111111110', '011111110', '.0000000.'], pal);
}

// 탕비실: 조리대(커피 머신·싱크), 냉장고, 자판기, 식탁
function kitchen(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  box(g, v, x, y, 0, 3.0, 0.6, 10, { top: hex('#f2f2f2'), left: hex('#6d4a33'), right: hex('#56392a'), hi: hex('#ffffff') });
  box(g, v, x + 0.2, y + 0.08, 10, 0.45, 0.4, 8, cols('#2d3240'));
  const lamp = P(v, x + 0.35, y + 0.48, 15);
  g.px(lamp[0], lamp[1], hex('#57d391'));
  box(g, v, x + 0.9, y + 0.15, 10, 0.14, 0.14, 2, MUG);
  box(g, v, x + 1.2, y + 0.18, 10, 0.14, 0.14, 2, MUG);
  rect(g, v, x + 1.8, y + 0.1, x + 2.6, y + 0.5, hex('#aeb6c2'), 10);
  // 냉장고
  box(g, v, x + 3.2, y - 0.05, 0, 0.75, 0.65, 26, { top: hex('#ffffff'), left: hex('#e4e8ee'), right: hex('#c9cfd8'), line: hex('#8a92a3') });
  g.line(P(v, x + 3.25, y + 0.6, 15), P(v, x + 3.9, y + 0.6, 15), hex('#8a92a3'));
}

function vending(ctx: DrawCtx, x: number, y: number) {
  const { g, v, t } = ctx;
  box(g, v, x, y, 0, 0.8, 0.7, 26, { top: hex('#4a8c3f'), left: hex('#5fae4f'), right: hex('#3f7a35'), line: hex('#2d5a26') });
  const f = (u: number, z: number) => P(v, x + u, y + 0.7, z);
  g.poly([f(0.08, 8), f(0.6, 8), f(0.6, 24), f(0.08, 24)], hex('#1d2433'));
  const items = [hex('#e5484d'), hex('#f2a33a'), hex('#3f8cff'), hex('#ffffff')];
  for (let r = 0; r < 4; r++) for (let i = 0; i < 3; i++) g.line(f(0.12 + i * 0.16, 10 + r * 4), f(0.2 + i * 0.16, 10 + r * 4), items[(r + i) % 4]);
  if (Math.floor(t / 700) % 2) g.px(f(0.7, 16)[0], f(0.7, 16)[1], hex('#ff5a5a'));
}

function diningTable(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  const stool = cols('#e0a54a');
  box(g, v, x + 0.3, y - 0.45, 0, 0.35, 0.35, 5, stool);
  box(g, v, x + 1.3, y - 0.45, 0, 0.35, 0.35, 5, stool);
  box(g, v, x, y, 0, 2.2, 0.9, 7, { top: hex('#f4efe6'), left: hex('#b9a58b'), right: hex('#9a8771'), hi: hex('#ffffff') });
  box(g, v, x + 0.8, y + 0.35, 7, 0.14, 0.14, 2, MUG);
  box(g, v, x + 0.3, y + 1.05, 0, 0.35, 0.35, 5, stool);
  box(g, v, x + 1.3, y + 1.05, 0, 0.35, 0.35, 5, stool);
}

function pingpong(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  box(g, v, x, y, 0, 2.6, 1.4, 7, { top: hex('#2f8f6a'), left: hex('#3a3f4b'), right: hex('#2e323c') });
  g.line(P(v, x + 0.05, y + 0.7, 7), P(v, x + 2.55, y + 0.7, 7), hex('#ffffff'));
  outline(g, v, x + 0.05, y + 0.05, x + 2.55, y + 1.35, hex('#ffffff'), 7);
  box(g, v, x + 1.28, y, 7, 0.04, 1.4, 3, { top: hex('#ffffff'), left: hex('#dddddd'), right: hex('#cccccc') });
}

function cafeTable(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  const stool = cols('#3a3f4b');
  box(g, v, x - 0.55, y + 0.1, 0, 0.35, 0.35, 5, stool);
  box(g, v, x, y, 0, 0.7, 0.7, 7, { top: hex('#ffffff'), left: hex('#d0d4dc'), right: hex('#b8bec9'), hi: hex('#ffffff') });
  box(g, v, x + 0.25, y + 0.25, 7, 0.14, 0.14, 2, MUG);
  box(g, v, x + 0.15, y + 0.85, 0, 0.35, 0.35, 5, stool);
}

// 건물 밖: 나무·벤치·가로등
function tree(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  box(g, v, x - 0.1, y - 0.1, 0, 0.2, 0.2, 10, cols('#7a5236'));
  leaves(g, P(v, x, y, 8), ['.....1111.....', '...11222211...', '..1222222221..', '.122222222221.', '.122222222221.', '01222222222210', '01122222222110', '.011222222110.', '..0011111100..', '....000000....'], [hex('#2e7d46'), hex('#3c9a55'), hex('#56b86c')]);
}

function bench(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  box(g, v, x, y, 0, 1.6, 0.12, 4, cols('#4a505d'));
  box(g, v, x, y + 0.1, 4, 1.6, 0.45, 1, cols('#a8784f'));
  box(g, v, x, y + 0.5, 4, 1.6, 0.08, 5, cols('#a8784f'));
}

function lamp(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  box(g, v, x - 0.05, y - 0.05, 0, 0.1, 0.1, 30, cols('#3a3f4b'));
  box(g, v, x - 0.15, y - 0.15, 30, 0.3, 0.3, 3, { top: hex('#fff3c4'), left: hex('#ffe08a'), right: hex('#f0c75e') });
}

function treadmill(ctx: DrawCtx, x: number, y: number) {
  const { g, v, t } = ctx;
  box(g, v, x, y, 0, 0.7, 1.6, 2, cols('#2e323c'));
  box(g, v, x + 0.05, y + 0.1, 2, 0.6, 1.3, 1, { top: (Math.floor(t / 120) % 2 ? hex('#3a3f4b') : hex('#444a57')), left: hex('#2e323c'), right: hex('#262a33') });
  box(g, v, x + 0.05, y, 2, 0.6, 0.12, 10, cols('#9aa3b5'));
}

function weights(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  box(g, v, x, y, 0, 1.6, 0.4, 6, cols('#5b6170'));
  for (let i = 0; i < 4; i++) box(g, v, x + 0.15 + i * 0.36, y + 0.1, 6, 0.22, 0.22, 2, cols(['#e5484d', '#3f8cff', '#f2a33a', '#2fbf71'][i]));
}

function stage(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  box(g, v, x, y, 0, 4.4, 1.2, 4, cols('#6b3e26'));
  box(g, v, x + 1.6, y + 0.2, 4, 1.2, 0.12, 14, cols('#1d2130'));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) box(g, v, x + 0.2 + c * 0.85, y + 2 + r * 1.2, 0, 0.45, 0.4, 6, cols('#7b2f3b'));
}

// 평면(core/officeLayout)의 소품(건물 밖 나무·벤치·가로등)을 그리기 함수로 바꿉니다.
const DRAW: Record<DecorKind, Decor['draw']> = {
  plant, bigPlant, cooler, printer, meeting: (c, x, y) => meeting2(c, x, y), lounge: (c, x, y) => lounge2(c, x, y), beanbag, cafeTable, pingpong,
  kitchen: (c, x, y) => kitchen2(c, x, y), diningTable, vending, treadmill, weights, stage, tree, bench, lamp,
};

// 가구(A-87): 놓은 칸(왼쪽 위 gx·gy, 크기는 furniture.json size) 안에 소품을 그리는 위치. [그리기, 칸 안 x, 칸 안 y]
type Piece = [Decor['draw'], number, number];
const PIECES: Record<string, Piece[]> = {
  plant: [[bigPlant, 0.5, 0.5]],
  cooler: [[cooler, 0.27, 0.27]],
  printer: [[printer, 0.15, 0.2]],
  vending: [[vending, 0.1, 0.15]],
  cafe: [[cafeTable, 0.92, 0.38]],
  lounge: [[(c, x, y) => lounge2(c, x, y), 1.1, 0]],
  meeting: [[(c, x, y) => meeting2(c, x, y), 0, 0.8]],
  pingpong: [[pingpong, 0.2, 0.3]],
  kitchen: [[(c, x, y) => kitchen2(c, x, y), 0.02, 0.2]],
  gym: [[treadmill, 0.15, 0.2], [treadmill, 1.05, 0.2], [weights, 2.2, 0.8]],
  stage: [[stage, 0.3, 0.2]],
};

// rot(A-128): 돌린 크기의 칸(gx·gy가 왼쪽 위) 가운데를 기준으로, 원래 방향 그림을 돌려 그림
function drawItem(ctx: DrawCtx, item: string, gx: number, gy: number, rot: Rot = 0) {
  const R = itemSize(item, rot);
  const { w, h } = itemSize(item);
  const cx = gx + R.w / 2;
  const cy = gy + R.h / 2;
  const ox = cx - w / 2;
  const oy = cy - h / 2;
  drawTurned(ctx, cx, cy, rot, (c) => {
    for (const [draw, dx, dy] of PIECES[item] ?? []) draw(c, ox + dx, oy + dy);
  });
}

// 상점 그림(A-87): 사무실에 그려지는 그대로의 픽셀 가구(또는 책상)를 투명 바탕 작은 그림으로. 가구마다 한 번만 그림
const thumbs = new Map<string, string>();
export function itemThumb(s: GameState, item: string): string {
  const hit = thumbs.get(item);
  if (hit) return hit;
  const { w, h } = itemSize(item);
  const pad = 4;
  const tall = 44; // 가장 높은 소품(냉장고·자판기·무대 화면)이 들어가는 높이
  const artW = ((w + h) * TW) / 2 + pad * 2;
  const artH = ((w + h) * TH) / 2 + tall + pad;
  const v: View = { artW, artH, scale: 1, ox: (h * TW) / 2 + pad, oy: tall };
  const g = new Pix(artW, artH);
  const ctx: DrawCtx = { g, v, t: 0, s, hover: null, edit: null };
  if (item === 'desk') drawSeat(ctx, { id: 'thumb', zone: 'desk', occupant: null, gx: 0, gy: 0 }, 0, 0);
  else drawItem(ctx, item, 0, 0);
  const cv = document.createElement('canvas');
  cv.width = artW;
  cv.height = artH;
  cv.getContext('2d')!.putImageData(g.img, 0, 0);
  const url = cv.toDataURL();
  thumbs.set(item, url);
  return url;
}

// 앞뒤 순서: 물건 가운데 칸 기준(책상 2×2가 gx+gy+1인 것과 맞춤)
function itemKey(item: string, gx: number, gy: number, rot: Rot = 0): number {
  const { w, h } = itemSize(item, rot);
  return gx + gy + (w + h) / 2 - 1;
}

function buildLayout(tierId: number): Layout {
  const f = floorPlan(tierId);
  const none: Rect = { x0: f.W, y0: 0, x1: f.W, y1: 0 };
  const decor: Decor[] = f.decor.map((d) => ({ x: d.x, y: d.y, k: d.k, draw: DRAW[d.kind] }));
  return { id: tierId, W: f.W, H: f.H, exec: f.exec ?? none, meeting: f.meeting, lounge: f.lounge, loungeLeft: f.loungeLeft, kitchen: f.kitchen, doorY: f.doorY, board: f.board, winX: f.winX, winY: f.winY, decor, glass: f.glass };
}

// 이름이 같은 그리기 함수(회의실·라운지·탕비실)를 배치에서 쓰기 위한 별칭
const meeting2 = meeting;
const lounge2 = lounge;
const kitchen2 = kitchen;
