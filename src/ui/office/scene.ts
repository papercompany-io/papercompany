// OF-01 2.5D 아이소메트릭 픽셀 사무실 장면, OF-02 부서별 좌석(빈 책상·입사 대기 상자·직원).
// 타일 1칸 = 가로 24 × 세로 12 아트 픽셀(2:1 아이소메트릭). 아트 픽셀을 정수배로 키워 화면에 그립니다.
import { DATA, dept } from '../../core/data';
import type { DeptId, Employee, GameState, Seat } from '../../core/types';
import { Pix, hex, mix, shade, type Col, type Pt } from './pixel';
import { SPRITES, SPRITE_H, SPRITE_W, hashStr, lookFor } from './sprites';

export const TW = 24;
export const TH = 12;
const FW = DATA.office.size.w;
const FH = DATA.office.size.h;
const WALL_H = 44;

export interface View {
  artW: number;
  artH: number;
  scale: number;
  ox: number;
  oy: number;
}

// 화면 크기에서 정수 배율과 원점을 정합니다. reserveRight·reserveTop은 HUD·회사 카드가 가리는 CSS 픽셀.
export function makeView(cssW: number, cssH: number, reserveRight: number, reserveTop: number): View {
  const needW = ((FW + FH) * TW) / 2 + 24;
  const needH = ((FW + FH) * TH) / 2 + WALL_H + 24;
  const scale = Math.max(1, Math.min(4, Math.floor(Math.min((cssW - reserveRight) / needW, (cssH - reserveTop) / needH))));
  const artW = Math.ceil(cssW / scale);
  const artH = Math.ceil(cssH / scale);
  const availW = (cssW - reserveRight) / scale;
  const ox = Math.round(availW / 2 - ((FW - FH) * TW) / 4);
  const top = reserveTop / scale;
  const contentH = ((FW + FH) * TH) / 2 + WALL_H + 8;
  const oy = Math.round(top + (artH - top - contentH) / 2 + WALL_H);
  return { artW, artH, scale, ox, oy };
}

export function P(v: View, gx: number, gy: number, z = 0): Pt {
  return [v.ox + ((gx - gy) * TW) / 2, v.oy + ((gx + gy) * TH) / 2 - z];
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

// ── 색 ──
const C = {
  bgTop: hex('#2f3a58'),
  bgBottom: hex('#1a2034'),
  slabL: hex('#9aa3b5'),
  slabR: hex('#7c8598'),
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
  leg: hex('#5b6170'),
  chair: hex('#3a3f4b'),
  monitor: hex('#2a2f3a'),
  screenOff: hex('#39414f'),
  screenBg: hex('#1b2232'),
  key: hex('#454b59'),
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
  const a = frontSeat(seat) ? P(v, seat.gx + 1, seat.gy + 0.6, 7) : P(v, seat.gx + 1, seat.gy + 1.3, 7);
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
  const ctx: DrawCtx = { g, v, t, s, hover, hoverZone };
  drawBackground(ctx);
  drawFloor(ctx);
  drawWalls(ctx);
  const items: { key: number; draw: () => void }[] = [];
  for (const seat of s.seats) items.push({ key: seat.gx + seat.gy + 1, draw: () => drawSeat(ctx, seat) });
  for (const d of DECOR) items.push({ key: d.x + d.y + (d.k ?? 0), draw: () => d.draw(ctx, d.x, d.y) });
  items.sort((a, b) => a.key - b.key);
  for (const it of items) it.draw();
}

function drawBackground({ g, v }: DrawCtx) {
  const bands = 10;
  for (let i = 0; i < bands; i++) {
    const c = mix(C.bgTop, C.bgBottom, i / (bands - 1));
    g.rect(0, Math.floor((g.h * i) / bands), g.w, Math.ceil(g.h / bands) + 1, c);
  }
  // 바닥 아래 그림자
  const sh = hex('#10131f', 110);
  g.poly([P(v, 0.5, 0.5, -14), P(v, FW + 1.2, 0.5, -14), P(v, FW + 1.2, FH + 1.2, -14), P(v, 0.5, FH + 1.2, -14)], sh);
}

function drawFloor({ g, v, hoverZone, t }: DrawCtx) {
  box(g, v, 0, 0, -7, FW, FH, 7, { top: C.wood1, left: C.slabL, right: C.slabR, hi: shade(C.slabL, 1.2) });
  // 나무 마루: 반 칸 폭 널빤지 줄무늬 + 이음매
  for (let k = 0; k < FH * 2; k++) {
    const y0 = k / 2;
    const y1 = (k + 1) / 2;
    g.poly([P(v, 0, y0), P(v, FW, y0), P(v, FW, y1), P(v, 0, y1)], k % 2 ? C.wood1 : C.wood2);
    for (let jx = ((k * 7) % 5) * 0.6 + 0.8; jx < FW; jx += 3) g.line(P(v, jx, y0), P(v, jx, y1), C.seam);
  }
  // 부서 구역 카펫(OF-02 부서별 좌석 구역)
  for (const z of DATA.office.zones) {
    const dc = hex(dept(z.dept as DeptId).color);
    const base = mix(hex('#6a7184'), dc, 0.3);
    const x0 = Math.max(0, z.x - 0.25);
    const y0 = Math.max(0, z.y - 0.25);
    const x1 = Math.min(FW, z.x + 4.25);
    const y1 = Math.min(FH, z.y + 3.85);
    for (let i = Math.floor(x0 * 2); i < Math.ceil(x1 * 2); i++) {
      for (let j = Math.floor(y0 * 2); j < Math.ceil(y1 * 2); j++) {
        const a = Math.max(x0, i / 2);
        const b = Math.min(x1, (i + 1) / 2);
        const c = Math.max(y0, j / 2);
        const d = Math.min(y1, (j + 1) / 2);
        g.poly([P(v, a, c), P(v, b, c), P(v, b, d), P(v, a, d)], (i + j) % 2 ? base : shade(base, 0.93));
      }
    }
    const lit = hoverZone === z.dept && Math.floor(t / 300) % 2 === 0;
    const edge = lit ? hex('#ffffff') : shade(dc, 0.85);
    const q = [P(v, x0, y0), P(v, x1, y0), P(v, x1, y1), P(v, x0, y1)];
    for (let i = 0; i < 4; i++) g.line(q[i], q[(i + 1) % 4], edge);
  }
  // 대표석 러그
  const cs = DATA.office.ceoSeat;
  const rug = [P(v, cs.x - 0.3, cs.y - 0.3), P(v, cs.x + 2.3, cs.y - 0.3), P(v, cs.x + 2.3, cs.y + 2.2), P(v, cs.x - 0.3, cs.y + 2.2)];
  g.poly(rug, hex('#7b2f3b'));
  const inner = [P(v, cs.x - 0.1, cs.y - 0.1), P(v, cs.x + 2.1, cs.y - 0.1), P(v, cs.x + 2.1, cs.y + 2.0), P(v, cs.x - 0.1, cs.y + 2.0)];
  for (let i = 0; i < 4; i++) g.line(inner[i], inner[(i + 1) % 4], hex('#d6a84a'));
}

function drawWalls({ g, v, s }: DrawCtx) {
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

  // 오른쪽 벽 큰 창(통유리)
  const winY = (x: number, z: number) => P(v, x, 0, z);
  const winsR: [number, number][] = [
    [0.6, 3.4],
    [4.0, 6.8],
    [7.4, 10.2],
    [10.8, 13.6],
  ];
  for (const [a, b] of winsR) drawWindow(g, (x, z) => winY(x, z), a, b, 12, 38, sky);
  // 왼쪽 벽 창
  const winX = (y: number, z: number) => P(v, 0, y, z);
  drawWindow(g, (y, z) => winX(y, z), 0.6, 2.8, 12, 38, sky);

  // 화이트보드(왼쪽 벽)
  const wb = (y: number, z: number) => P(v, 0, y, z);
  g.poly([wb(6.4, 14), wb(9.2, 14), wb(9.2, 34), wb(6.4, 34)], hex('#b7bcc6'));
  g.poly([wb(6.5, 15), wb(9.1, 15), wb(9.1, 33), wb(6.5, 33)], hex('#fdfdfb'));
  // 간단한 그래프 낙서
  g.line(wb(6.8, 18), wb(7.4, 22), hex('#3f8cff'));
  g.line(wb(7.4, 22), wb(8.0, 20), hex('#3f8cff'));
  g.line(wb(8.0, 20), wb(8.8, 29), hex('#3f8cff'));
  g.line(wb(6.8, 30), wb(7.8, 30), hex('#e5484d'));
  g.line(wb(6.8, 27), wb(7.4, 27), hex('#2a2233'));
  g.line(wb(6.5, 14), wb(9.1, 14), hex('#8b909b'));

  // 출입문(왼쪽 벽 앞쪽)
  const dr = (y: number, z: number) => P(v, 0, y, z);
  g.poly([dr(10.0, 0), dr(11.4, 0), dr(11.4, 30), dr(10.0, 30)], hex('#e9e2d2'));
  g.poly([dr(10.1, 0), dr(11.3, 0), dr(11.3, 29), dr(10.1, 29)], hex('#8a5a3c'));
  g.poly([dr(10.25, 4), dr(11.15, 4), dr(11.15, 26), dr(10.25, 26)], hex('#9d6a47'));
  const knob = dr(11.05, 14);
  g.px(knob[0], knob[1], hex('#f1c453'));
  g.px(knob[0] + 1, knob[1], hex('#f1c453'));

  // 벽시계(오른쪽 벽)
  const clk = P(v, 14.6, 0, 30);
  const cc = hex('#ffffff');
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (dx * dx + dy * dy <= 17) g.px(clk[0] + dx, clk[1] + dy, dx * dx + dy * dy >= 13 ? C.ink : cc);
  const ang = (Math.min(1, s.msInDay / DATA.time.dayMs) * 9 + 9) * ((Math.PI * 2) / 12);
  g.line(clk, [clk[0] + Math.sin(ang) * 2.5, clk[1] - Math.cos(ang) * 2.5], C.ink);
  g.line(clk, [clk[0], clk[1] - 3], hex('#e5484d'));
}

function drawWindow(g: Pix, q: (u: number, z: number) => Pt, a: number, b: number, z0: number, z1: number, sky: Col) {
  g.poly([q(a - 0.1, z0 - 1), q(b + 0.1, z0 - 1), q(b + 0.1, z1 + 1), q(a - 0.1, z1 + 1)], C.frame);
  const mid = z0 + (z1 - z0) * 0.45;
  g.poly([q(a, z0), q(b, z0), q(b, mid), q(a, mid)], shade(sky, 1.18));
  g.poly([q(a, mid), q(b, mid), q(b, z1), q(a, z1)], sky);
  // 먼 빌딩 실루엣
  const bld = shade(sky, 0.82);
  for (let u = a + 0.2; u < b - 0.3; u += 0.7) {
    const hgt = 5 + ((Math.floor(u * 10) * 37) % 9);
    g.poly([q(u, z0), q(u + 0.45, z0), q(u + 0.45, z0 + hgt), q(u, z0 + hgt)], bld);
  }
  // 반사광
  g.line(q(a + 0.3, z0 + 4), q(a + 0.9, z1 - 3), shade(sky, 1.35));
  g.line(q(a + 0.5, z0 + 4), q(a + 1.1, z1 - 3), shade(sky, 1.25));
  // 창살
  for (let u = a + 1.4; u < b - 0.2; u += 1.4) g.line(q(u, z0), q(u, z1), C.frame);
  g.line(q(a, z0), q(b, z0), shade(C.frame, 0.8));
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

function drawSeat(ctx: DrawCtx, seat: Seat) {
  if (frontSeat(seat)) drawFrontSeat(ctx, seat);
  else drawBackSeat(ctx, seat);
}

function drawBackSeat(ctx: DrawCtx, seat: Seat) {
  const { g, v, s, t } = ctx;
  const x = seat.gx;
  const y = seat.gy;
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
    const busy = s.instructions.some((xx) => xx.status === 'running' && xx.dept === occ.emp!.dept);
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
  const busy = s.instructions.some((x) => x.status === 'running' && x.dept === emp.dept);
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

function drawFrontSeat(ctx: DrawCtx, seat: Seat) {
  const { g, v, s, t, hover } = ctx;
  const x = seat.gx;
  const y = seat.gy;
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
    const blink = ((t / 1000 + look.phase * 7) % 4.2) < 0.14;
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

function plant(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  box(g, v, x - 0.18, y - 0.18, 0, 0.36, 0.36, 6, { top: hex('#5a3b25'), left: hex('#c0643a'), right: hex('#9c4e2c') });
  const a = P(v, x, y, 6);
  const leaf = [hex('#2f8f4e'), hex('#3fae5f'), hex('#5fd07c'), hex('#257840')];
  const pat = ['...2.1....', '..1221.2..', '.212221...', '..0122102.', '.20212210.', '..021120..', '...0110...', '....00....'];
  for (let j = 0; j < pat.length; j++)
    for (let i = 0; i < pat[j].length; i++) {
      const ch = pat[j][i];
      if (ch !== '.') g.px(a[0] - 5 + i, a[1] - pat.length + j + 1, leaf[Number(ch)]);
    }
}

function cooler(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  box(g, v, x, y, 0, 0.45, 0.45, 14, cols('#e8ecf2', '#9aa3b5'));
  box(g, v, x + 0.08, y + 0.08, 14, 0.3, 0.3, 8, { top: hex('#cfeaff'), left: hex('#8fcaf5'), right: hex('#6fb2e3') });
  const f = P(v, x + 0.22, y + 0.45, 9);
  g.px(f[0], f[1], hex('#3f8cff'));
  g.px(f[0] + 2, f[1] + 1, hex('#e5484d'));
}

function coffee(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  box(g, v, x, y, 0, 1.6, 0.5, 10, cols('#6d4a33', '#3e2a1d'));
  box(g, v, x + 0.15, y + 0.05, 10, 0.45, 0.35, 8, cols('#2d3240'));
  const lamp = P(v, x + 0.3, y + 0.4, 15);
  g.px(lamp[0], lamp[1], hex('#57d391'));
  box(g, v, x + 0.8, y + 0.1, 10, 0.14, 0.14, 2, { top: hex('#6b3e26'), left: hex('#ffffff'), right: hex('#dddddd') });
  box(g, v, x + 1.05, y + 0.12, 10, 0.14, 0.14, 2, { top: hex('#6b3e26'), left: hex('#ffffff'), right: hex('#dddddd') });
  box(g, v, x + 1.25, y + 0.05, 10, 0.25, 0.35, 5, cols('#d9534f'));
}

function sofa(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  const c = cols('#4f7fbf');
  box(g, v, x, y, 0, 0.9, 2.0, 5, c);
  box(g, v, x, y, 5, 0.3, 2.0, 7, c);
  box(g, v, x, y, 5, 0.9, 0.2, 3, c);
  box(g, v, x, y + 1.8, 5, 0.9, 0.2, 3, c);
  box(g, v, x + 0.35, y + 0.35, 5, 0.5, 0.6, 1, cols('#6a97d6'));
  box(g, v, x + 0.35, y + 1.05, 5, 0.5, 0.6, 1, cols('#6a97d6'));
  // 낮은 탁자
  box(g, v, x + 0.95, y + 0.5, 0, 0.45, 1.0, 4, cols('#8a5a3c'));
  box(g, v, x + 1.08, y + 0.8, 4, 0.18, 0.18, 2, { top: hex('#6b3e26'), left: hex('#ffffff'), right: hex('#dddddd') });
}

function shelf(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  box(g, v, x, y, 0, 0.4, 2.2, 30, cols('#a8784f', '#5e3f26'));
  const books = ['#e5484d', '#3f8cff', '#f2a33a', '#2fbf71', '#8e6bff', '#f1efe9'];
  for (let shelfZ = 4; shelfZ < 30; shelfZ += 8) {
    for (let i = 0; i < 9; i++) {
      const u = y + 0.15 + i * 0.22;
      const c = hex(books[(i + shelfZ) % books.length]);
      const hgt = 5 + ((i * 3 + shelfZ) % 3);
      g.poly([P(v, x + 0.4, u, shelfZ), P(v, x + 0.4, u + 0.16, shelfZ), P(v, x + 0.4, u + 0.16, shelfZ + hgt), P(v, x + 0.4, u, shelfZ + hgt)], c);
    }
    g.line(P(v, x + 0.4, y, shelfZ - 1), P(v, x + 0.4, y + 2.2, shelfZ - 1), hex('#5e3f26'));
  }
}

function printer(ctx: DrawCtx, x: number, y: number) {
  const { g, v } = ctx;
  box(g, v, x, y, 0, 0.7, 0.55, 8, cols('#d9dde5', '#8a92a3'));
  box(g, v, x + 0.05, y + 0.05, 8, 0.6, 0.45, 3, cols('#c3c9d4'));
  box(g, v, x + 0.15, y + 0.15, 11, 0.4, 0.25, 1, { top: hex('#ffffff'), left: hex('#eeeeee'), right: hex('#dddddd') });
}

const DECOR: Decor[] = [
  { x: 0.5, y: 0.5, draw: plant },
  { x: 6.5, y: 0.35, draw: cooler },
  { x: 8.0, y: 0.15, k: 0.5, draw: coffee },
  { x: 11.6, y: 0.5, draw: plant },
  { x: 15.5, y: 0.5, draw: plant },
  { x: 0.1, y: 3.2, k: 1, draw: shelf },
  { x: 0.3, y: 7.0, k: 1, draw: sofa },
  { x: 15.5, y: 4.6, draw: plant },
  { x: 11.7, y: 6.4, draw: printer },
  { x: 6.6, y: 6.6, draw: plant },
  { x: 11.6, y: 11.6, draw: plant },
];
