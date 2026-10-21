// OF-01 2.5D 아이소메트릭 픽셀 사무실 장면, OF-02 부서별 좌석(빈 책상·입사 대기 상자·직원).
// Startup Company처럼 사무실이 화면을 채우는 탑뷰입니다. 카메라(가운데 오는 월드 좌표)와 정수 배율로 화면을 정하고,
// 타일 1칸 = 가로 24 × 세로 12 아트 픽셀(2:1 아이소메트릭)을 정수배로 키워 그립니다.
import { DATA, dept, officeTier } from '../../core/data';
import { seatGrid } from '../../core/office';
import type { DeptId, Employee, GameState, Seat } from '../../core/types';
import { Pix, hex, mix, shade, type Col, type Pt } from './pixel';
import { SPRITES, SPRITE_H, SPRITE_W, hashStr, lookFor } from './sprites';

export const TW = 24;
export const TH = 12;
// 사무실 등급(OF-07)마다 크기·방·소품 배치가 다릅니다. 그릴 때 setLayout으로 지금 등급의 배치를 고릅니다.
let FW = 24;
let FH = 18;
let TIER = 2;
const WALL_H = 44;

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Layout {
  id: number;
  W: number;
  H: number;
  zones: { dept: DeptId; x: number; y: number; cols: number; rows: number }[];
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
}

// 화면 가운데에 오는 월드 좌표(아트 픽셀, 바닥 원점 기준)
export interface Camera {
  x: number;
  y: number;
}

export const ZOOM_MIN = 2;
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
  return cssW >= 1200 && cssH >= 720 ? 3 : 2;
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
  asphalt: hex('#5d6473'),
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

export function skyColor(frac: number): Col {
  const day = hex('#93d3ff');
  const eve = hex('#ffb070');
  const t = Math.max(0, Math.min(1, (frac - 0.6) / 0.4));
  return mix(day, eve, t * t);
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
  const a = frontSeat(seat) ? P(v, gx + 1, gy + 0.6, 7) : P(v, gx + 1, gy + 1.3, 7);
  return [Math.round(a[0]), Math.round(a[1])];
}

export function actors(s: GameState, v: View): Actor[] {
  const out: Actor[] = [];
  for (const seat of s.seats) {
    if (!seat.occupant || seat.occupant.startsWith('moving:')) continue;
    const a = anchor(v, seat);
    const kind: Actor['kind'] = seat.occupant === 'ceo' ? 'ceo' : seat.occupant.startsWith('pending:') ? 'pending' : 'emp';
    if (kind === 'emp' && !s.employees.some((e) => e.id === seat.occupant)) continue;
    const top = kind === 'pending' ? a[1] - 12 : a[1] - 15;
    out.push({ id: seat.occupant, kind, seat, head: [a[0], top - 2], box: [a[0] - 7, top - 1, 14, kind === 'pending' ? 14 : 19] });
  }
  return out;
}

// ── 장면 그리기 ──
interface DrawCtx {
  g: Pix;
  v: View;
  t: number; // ms
  s: GameState;
  hover: string | null;
  hoverZone: DeptId | null;
}

export function drawOffice(g: Pix, v: View, s: GameState, t: number, hover: string | null, hoverZone: DeptId | null = null) {
  setLayout(s.company.officeTier);
  const ctx: DrawCtx = { g, v, t, s, hover, hoverZone };
  drawGround(ctx);
  drawFloor(ctx);
  drawWalls(ctx);
  const items: { key: number; draw: () => void }[] = [];
  for (const seat of s.seats) {
    const p = seatPos(seat);
    items.push({ key: p.gx + p.gy + 1, draw: () => drawSeat(ctx, seat, p.gx, p.gy) });
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
}

// 건물 밖: 도로 → 잔디 → 보도 → 건물 바닥(빈 하늘색 배경 대신 Startup Company처럼 주변을 채웁니다)
function drawGround({ g, v }: DrawCtx) {
  g.clear(C.asphalt);
  // 차선
  const lane = hex('#e9e4d4');
  for (let k = -10; k < FW + 16; k += 2) g.line(P(v, k, FH + 9), P(v, k + 1, FH + 9), lane);
  for (let k = -10; k < FH + 16; k += 2) g.line(P(v, FW + 9, k), P(v, FW + 9, k + 1), lane);
  rect(g, v, -7, -7, FW + 7, FH + 7, C.grass);
  for (let i = -7; i < FW + 7; i++)
    for (let j = -7; j < FH + 7; j++) {
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
}

function drawFloor({ g, v, hoverZone, t }: DrawCtx) {
  box(g, v, 0, 0, -7, FW, FH, 7, { top: C.wood1, left: C.slabL, right: C.slabR, hi: shade(C.slabL, 1.15) });
  // 나무 마루: 반 칸 폭 널빤지 줄무늬 + 이음매
  for (let k = 0; k < FH * 2; k++) {
    const y0 = k / 2;
    const y1 = (k + 1) / 2;
    rect(g, v, 0, y0, FW, y1, k % 2 ? C.wood1 : C.wood2);
    for (let jx = ((k * 7) % 5) * 0.6 + 0.8; jx < FW; jx += 3) g.line(P(v, jx, y0), P(v, jx, y1), C.seam);
  }
  // 대표실 카펫·러그
  const ex = L.exec;
  rect(g, v, ex.x0, 0, FW, ex.y1, hex('#5b4b5f'));
  rect(g, v, ex.x0 + 0.3, 0.5, FW - 0.2, ex.y1 - 0.9, hex('#7b2f3b'));
  outline(g, v, ex.x0 + 0.5, 0.7, FW - 0.4, ex.y1 - 1.1, hex('#d6a84a'));
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
  // 부서 구역 카펫(OF-02 부서별 좌석 구역)
  for (const z of L.zones) {
    const dc = hex(dept(z.dept as DeptId).color);
    const base = mix(hex('#6a7184'), dc, 0.3);
    const x0 = Math.max(0, z.x - 0.25);
    const y0 = Math.max(0, z.y - 0.25);
    const x1 = Math.min(FW, z.x + z.cols * 2 + 0.25);
    const y1 = Math.min(FH, z.y + z.rows * 2 - 0.15);
    for (let i = Math.floor(x0 * 2); i < Math.ceil(x1 * 2); i++) {
      for (let j = Math.floor(y0 * 2); j < Math.ceil(y1 * 2); j++) {
        rect(g, v, Math.max(x0, i / 2), Math.max(y0, j / 2), Math.min(x1, (i + 1) / 2), Math.min(y1, (j + 1) / 2), (i + j) % 2 ? base : shade(base, 0.93));
      }
    }
    const lit = hoverZone === z.dept && Math.floor(t / 300) % 2 === 0;
    outline(g, v, x0, y0, x1, y1, lit ? hex('#ffffff') : shade(dc, 0.85));
  }
  // 출입문 앞 매트
  rect(g, v, 0.05, L.doorY - 0.1, 0.9, L.doorY + 1.1, hex('#4a3b33'));
}

function drawWalls({ g, v, s, t }: DrawCtx) {
  const sky = skyColor(Math.min(1, s.msInDay / DATA.time.dayMs));
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
  const ang = (Math.min(1, s.msInDay / DATA.time.dayMs) * 9 + 9) * ((Math.PI * 2) / 12);
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
  if (o === 'ceo') return { kind: 'ceo' };
  if (o.startsWith('pending:')) return { kind: 'pending' };
  const emp = s.employees.find((e) => e.id === o);
  return emp ? { kind: 'emp', emp } : { kind: 'empty' };
}

function drawSeat(ctx: DrawCtx, seat: Seat, x: number, y: number) {
  if (frontSeat(seat)) drawFrontSeat(ctx, seat, x, y);
  else drawBackSeat(ctx, seat, x, y);
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
  const sx = a[0] - SPRITE_W / 2;
  const sy = a[1] - SPRITE_H + 2;
  if (hover === emp.id) g.spriteOutline(sx, sy, rows, hex('#ffffff'));
  g.sprite(sx, sy, rows, look.pal, (hashStr(emp.id) & 16) === 16);
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

function buildLayout(tierId: number): Layout {
  const t = officeTier(tierId);
  const W = t.size.w;
  const H = t.size.h;
  const has = (r: string) => t.rooms.includes(r);
  const exec: Rect = { x0: W - 5.4, y0: 0, x1: W, y1: 4.8 };
  const meeting: Rect | null = has('meeting') ? { x0: W - 10.6, y0: 0, x1: W - 5.4, y1: 6.2 } : null;
  const loungeLeft = has('lounge');
  const lounge: Rect | null = loungeLeft ? { x0: 1, y0: H - 4.6, x1: 6.8, y1: H - 0.6 } : has('lounge_small') ? { x0: W - 5.6, y0: H - 4, x1: W - 0.6, y1: H - 0.4 } : null;
  const kitchen: Rect | null = has('kitchen') ? { x0: W - 10, y0: H - 4.5, x1: W - 5, y1: H } : null;
  const doorY = Math.round(H * 0.6);
  const board: [number, number] | null = doorY - 3.6 >= 4 ? [doorY - 3.6, doorY - 0.8] : null;
  const winY: [number, number][] = [];
  for (let a = 0.6; a + 2.8 <= W - 0.5; a += 3.4) winY.push([a, a + 2.8]);
  const winX: [number, number][] = [];
  const winEnd = board ? board[0] - 0.4 : doorY - 0.6;
  for (let a = 0.6; a + 2.8 <= winEnd; a += 3.4) winX.push([a, a + 2.8]);
  const glass: [number, number, number, number][] = [
    [exec.x0, 0, exec.x0, exec.y1],
    [exec.x0, exec.y1, exec.x0 + 1.7, exec.y1],
    [exec.x0 + 2.9, exec.y1, W, exec.y1],
  ];
  if (meeting) glass.push([meeting.x0, 0, meeting.x0, meeting.y1], [meeting.x0, meeting.y1, meeting.x0 + 1.8, meeting.y1], [meeting.x0 + 3.0, meeting.y1, meeting.x1, meeting.y1], [meeting.x1, exec.y1, meeting.x1, meeting.y1]);
  const decor: Decor[] = [];
  const add = (x: number, y: number, draw: Decor['draw'], k?: number) => decor.push({ x, y, k, draw });
  if (meeting) {
    add(meeting.x0 + 1.6, 2.4, meeting2, 1.2);
    add(meeting.x0 + 0.6, 5.6, plant);
  }
  add(W - 0.6, 4.2, plant);
  add(0.5, 0.5, plant);
  add(0.7, doorY + 1.8, plant);
  if (board) add(0.2, board[0] - 0.5, cooler);
  // 오른쪽 열린 공간
  const openTop = Math.max(exec.y1, meeting ? 0 : 0) + 0.8;
  add(W - 4.6, openTop, cooler);
  add(W - 3.6, openTop, printer);
  add(W - 1.4, openTop + 0.4, bigPlant);
  const rightBottom = H - (lounge && !loungeLeft ? 4.8 : 5);
  const aud = has('auditorium');
  const gym = has('gym');
  let ry = openTop + 3.2;
  if (aud && ry + 6 < rightBottom) {
    add(W - 5.0, ry, stage, 2);
    ry += 6.4;
  }
  if (gym && ry + 3 < rightBottom) {
    add(W - 4.6, ry, treadmill, 1);
    add(W - 3.4, ry, treadmill, 1);
    add(W - 2.0, ry + 0.4, weights, 1);
    ry += 3.4;
  }
  for (; ry + 1 < rightBottom; ry += 3.2) {
    add(W - 4, ry, cafeTable);
    add(W - 1.4, ry, cafeTable);
  }
  if (loungeLeft && lounge) {
    add(2.6, lounge.y0 + 0.9, lounge2, 1);
    add(5.0, lounge.y0 + 0.6, beanbag);
    add(5.4, lounge.y0 + 2.9, beanbag);
    add(6.6, H - 0.6, bigPlant);
  } else if (lounge) {
    add(lounge.x0 + 1.2, lounge.y0 + 0.6, lounge2, 1);
    add(lounge.x1 - 1.0, lounge.y0 + 1.0, beanbag);
    add(lounge.x1 - 0.8, lounge.y1 - 0.6, beanbag);
  }
  if (!lounge || loungeLeft) {
    add(W - 0.6, H - 1.2, bigPlant);
    add(W - 4.4, H - 1.2, plant);
  }
  if (has('pingpong')) add(W / 2 - 3.1, H - 3.8, pingpong, 1.4);
  if (kitchen) {
    add(kitchen.x0 - 2, kitchen.y0 - 0.1, vending, 0.5);
    add(kitchen.x0 + 0.4, kitchen.y0 + 0.1, kitchen2, 1.5);
    add(kitchen.x0 + 1.0, kitchen.y0 + 2.1, diningTable, 1);
  }
  // 건물 밖(앞쪽 두 면)
  for (let x = 2; x < W; x += 7) add(x, H + 4.2, tree);
  for (let y = 3; y < H; y += 7) add(W + 4.2, y, tree);
  for (let x = 5; x < W - 2; x += 7.5) add(x, H + 1.3, bench);
  for (let x = 0.5; x < W; x += 7.5) add(x, H + 1.6, lamp);
  for (let y = 6; y < H; y += 7.5) add(W + 1.6, y, lamp);
  const zones = t.zones.map((z) => ({ dept: z.dept as DeptId, x: z.x, y: z.y, cols: z.cols, rows: z.rows }));
  return { id: tierId, W, H, zones, exec, meeting, lounge, loungeLeft, kitchen, doorY, board, winX, winY, decor, glass };
}

// 이름이 같은 그리기 함수(회의실·라운지·탕비실)를 배치에서 쓰기 위한 별칭
const meeting2 = meeting;
const lounge2 = lounge;
const kitchen2 = kitchen;
