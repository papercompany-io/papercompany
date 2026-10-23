// 프로필용 픽셀 얼굴(16×16). 직원 id로 얼굴형·머리 모양·눈·눈썹·입·안경·수염·옷을 고정으로 골라 칸에 그리고,
// 마지막에 빈 칸 중 그림과 맞닿은 곳에 테두리를 둘러 모양이 달라도 선이 맞게 합니다(A-151).
import { Pix, hex, mix, shade, type Col } from './pixel';

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// id 해시에서 이어지는 난수(mulberry32). 고르는 순서가 같으면 같은 얼굴입니다.
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, opts: [T, number][]): T {
  const total = opts.reduce((n, o) => n + o[1], 0);
  let x = r() * total;
  for (const [v, w] of opts) if ((x -= w) < 0) return v;
  return opts[opts.length - 1][0];
}

// 검은·갈색 머리가 대부분이고 염색은 드물게
const HAIR: [string, number][] = [
  ['#1c1c24', 8], ['#2b1d16', 8], ['#4a3020', 6], ['#7a4b2a', 3], ['#c58b3c', 1.5], ['#d9b46a', 0.8],
  ['#8e8e96', 1], ['#c9c9cf', 0.5], ['#b0452f', 1], ['#3a2a4a', 1], ['#c25a8a', 0.5], ['#3e5ea8', 0.5], ['#6b6470', 0.8],
];
const SKIN: [string, number][] = [['#f8dcc2', 3], ['#f5d0b0', 4], ['#eebe98', 4], ['#d9a27a', 2], ['#b97e57', 1], ['#8d5a3b', 0.6]];
const FRAME = ['#3a3440', '#5a3a2a', '#2a3a6a', '#6a2a34'];
const HAT = ['#d23b3b', '#3e7bd6', '#2f9e6e', '#e0a43a', '#4a4a58'];

export type HairStyle = 'crop' | 'part' | 'bangs' | 'long' | 'bob' | 'bun' | 'pony' | 'curly' | 'buzz' | 'spiky' | 'bald' | 'beanie';

export interface Face {
  hair: string;
  skin: string;
  style: HairStyle;
  shape: 'round' | 'square' | 'oval';
  eyes: 'dot' | 'apart' | 'tall' | 'lash' | 'wide' | 'happy';
  brows: 'none' | 'flat' | 'up' | 'thick';
  mouth: 'smile' | 'flat' | 'grin' | 'small' | 'smirk' | 'open';
  glasses: 'none' | 'box' | 'rim' | 'shades';
  beard: 'none' | 'stubble' | 'mustache' | 'goatee' | 'full';
  cloth: 'tee' | 'collar' | 'hoodie' | 'jacket' | 'turtle';
  tone: number; // 옷 밝기(부서 색을 조금씩 다르게)
  blush: boolean;
  nose: boolean;
  earring: boolean;
  hat: string;
  frame: string; // 안경테 색
}

// 사무실 스프라이트도 같은 머리색·피부·긴 머리 여부를 쓰도록 여기서 한 번에 고릅니다.
export function faceFor(id: string): Face {
  const r = rng(hashStr(id));
  const hair = pick(r, HAIR);
  const skin = pick(r, SKIN);
  const style = pick<HairStyle>(r, [
    ['crop', 5], ['part', 4], ['bangs', 4], ['long', 4], ['bob', 3], ['bun', 1.5], ['pony', 2],
    ['curly', 2], ['buzz', 2], ['spiky', 1.5], ['bald', 0.7], ['beanie', 0.8],
  ]);
  const longish = style === 'long' || style === 'bob' || style === 'bun' || style === 'pony';
  return {
    hair,
    skin,
    style,
    shape: pick(r, [['round', 4], ['square', 2], ['oval', 3]]),
    eyes: pick(r, [['dot', 4], ['apart', 2], ['tall', 2], ['lash', longish ? 3 : 0.5], ['wide', 1.5], ['happy', 1.5]]),
    brows: pick(r, [['none', 2], ['flat', 4], ['up', 2], ['thick', 1.5]]),
    mouth: pick(r, [['smile', 4], ['flat', 3], ['grin', 1.5], ['small', 2], ['smirk', 1.5], ['open', 1]]),
    glasses: pick(r, [['none', 16], ['box', 2], ['rim', 2], ['shades', 0.3]]),
    beard: longish ? 'none' : pick(r, [['none', 10], ['stubble', 2], ['mustache', 1], ['goatee', 1], ['full', 1]]),
    cloth: pick(r, [['tee', 3], ['collar', 3], ['hoodie', 2], ['jacket', 2], ['turtle', 1]]),
    tone: pick(r, [[0.82, 1], [1, 2], [1.18, 1]]),
    blush: r() < 0.3,
    nose: r() < 0.5,
    earring: r() < 0.15,
    hat: HAT[Math.floor(r() * HAT.length)],
    frame: FRAME[Math.floor(r() * FRAME.length)],
  };
}

export const FACE_W = 16;

type Grid = string[][];

function put(g: Grid, x: number, y: number, k: string) {
  if (y >= 0 && y < FACE_W && x >= 0 && x < FACE_W) g[y][x] = k;
}
function row(g: Grid, y: number, x0: number, x1: number, k: string) {
  for (let x = x0; x <= x1; x++) put(g, x, y, k);
}
function col(g: Grid, x: number, y0: number, y1: number, k: string) {
  for (let y = y0; y <= y1; y++) put(g, x, y, k);
}
const at = (g: Grid, x: number, y: number) => (y >= 0 && y < FACE_W && x >= 0 && x < FACE_W ? g[y][x] : '.');

// 머리는 4~11열, 4~11행. 눈 8행, 입 10행. 몸은 12행부터.
function drawHair(g: Grid, f: Face) {
  const h = 'h';
  switch (f.style) {
    case 'crop':
      row(g, 3, 5, 10, h); row(g, 4, 4, 11, h); row(g, 5, 4, 11, h); col(g, 4, 6, 7, h); col(g, 11, 6, 7, h);
      break;
    case 'part':
      row(g, 3, 4, 11, h); row(g, 4, 3, 12, h); row(g, 5, 4, 11, h); row(g, 6, 4, 7, h); col(g, 11, 6, 7, h);
      break;
    case 'bangs':
      row(g, 3, 5, 10, h); row(g, 4, 4, 11, h); row(g, 5, 4, 11, h); row(g, 6, 4, 11, h); put(g, 6, 6, 's'); put(g, 9, 6, 's');
      col(g, 4, 7, 8, h); col(g, 11, 7, 8, h);
      break;
    case 'long':
      row(g, 3, 5, 10, h); row(g, 4, 4, 11, h); row(g, 5, 4, 11, h); row(g, 6, 4, 6, h); put(g, 11, 6, h);
      col(g, 3, 5, 14, h); col(g, 12, 5, 14, h); col(g, 4, 7, 12, h); col(g, 11, 7, 12, h);
      break;
    case 'bob':
      row(g, 3, 5, 10, h); row(g, 4, 4, 11, h); row(g, 5, 4, 11, h); row(g, 6, 7, 11, h);
      col(g, 3, 5, 11, h); col(g, 12, 5, 11, h); col(g, 4, 7, 10, h); col(g, 11, 7, 10, h);
      break;
    case 'bun':
      row(g, 1, 7, 8, h); row(g, 2, 6, 9, h); row(g, 3, 5, 10, h); row(g, 4, 4, 11, h); row(g, 5, 4, 11, h); col(g, 4, 6, 7, h); col(g, 11, 6, 7, h);
      break;
    case 'pony':
      row(g, 3, 5, 10, h); row(g, 4, 4, 11, h); row(g, 5, 4, 11, h); col(g, 4, 6, 7, h); col(g, 11, 6, 7, h);
      put(g, 12, 4, 'k'); col(g, 12, 5, 10, h); col(g, 13, 6, 9, h);
      break;
    case 'curly':
      for (const x of [4, 5, 7, 8, 10, 11]) put(g, x, 2, h);
      row(g, 3, 3, 12, h); row(g, 4, 3, 12, h); row(g, 5, 3, 12, h); row(g, 6, 4, 11, h); put(g, 6, 6, 's'); put(g, 9, 6, 's');
      col(g, 3, 6, 9, h); col(g, 12, 6, 9, h); put(g, 2, 5, h); put(g, 13, 5, h);
      break;
    case 'buzz':
      row(g, 4, 5, 10, 'z'); row(g, 5, 4, 11, 'z'); put(g, 4, 6, 'z'); put(g, 11, 6, 'z');
      break;
    case 'spiky':
      for (const x of [4, 6, 8, 10]) put(g, x, 2, h);
      row(g, 3, 4, 11, h); row(g, 4, 4, 11, h); row(g, 5, 4, 11, h); for (const x of [5, 7, 10]) put(g, x, 6, h); col(g, 4, 6, 7, h); col(g, 11, 6, 7, h);
      break;
    case 'bald':
      col(g, 4, 6, 8, h); col(g, 11, 6, 8, h);
      break;
    case 'beanie':
      row(g, 2, 6, 9, 'k'); row(g, 3, 4, 11, 'k'); row(g, 4, 3, 12, 'k'); row(g, 5, 3, 12, 'K'); col(g, 4, 6, 7, h); col(g, 11, 6, 7, h);
      break;
  }
}

function drawFace(g: Grid, f: Face) {
  // 얼굴형
  for (let y = 4; y <= 11; y++) row(g, y, 4, 11, 's');
  if (f.shape === 'round') for (const [x, y] of [[4, 4], [11, 4], [4, 11], [11, 11]]) put(g, x, y, '.');
  if (f.shape === 'oval') { put(g, 4, 4, '.'); put(g, 11, 4, '.'); row(g, 11, 4, 5, '.'); row(g, 11, 10, 11, '.'); put(g, 4, 10, '.'); put(g, 11, 10, '.'); }
  col(g, 3, 8, 9, 's'); col(g, 12, 8, 9, 's');
  if (f.earring) put(g, 3, 10, 'y');

  // 눈썹은 눈과 한 칸 띄운 6행(앞머리에 가리면 안 그림). 큰 눈은 7행까지 올라와 생략
  const by = 6;
  const brow = (x: number, y: number) => { if (at(g, x, y) === 's' && f.eyes !== 'tall') put(g, x, y, 'b'); };
  if (f.brows === 'flat') { brow(5, by); brow(6, by); brow(9, by); brow(10, by); }
  if (f.brows === 'up') { brow(5, by); brow(6, by - 1); brow(9, by - 1); brow(10, by); }
  if (f.brows === 'thick') { for (const x of [4, 5, 6]) brow(x, by); for (const x of [9, 10, 11]) brow(x, by); }

  // 눈
  const eyes = f.glasses === 'none' ? f.eyes : 'apart'; // 안경 안쪽에 피부 한 칸이 남게
  if (eyes === 'dot') { put(g, 6, 8, 'e'); put(g, 9, 8, 'e'); }
  if (eyes === 'apart') { put(g, 5, 8, 'e'); put(g, 10, 8, 'e'); }
  if (eyes === 'tall') { col(g, 6, 7, 8, 'e'); col(g, 9, 7, 8, 'e'); put(g, 6, 7, 'w'); put(g, 9, 7, 'w'); }
  if (eyes === 'lash') { put(g, 6, 8, 'e'); put(g, 9, 8, 'e'); put(g, 5, 7, 'e'); put(g, 10, 7, 'e'); }
  if (eyes === 'wide') { row(g, 8, 5, 6, 'e'); row(g, 8, 9, 10, 'e'); }
  if (eyes === 'happy') { put(g, 5, 8, 'e'); put(g, 6, 7, 'e'); put(g, 7, 8, 'e'); put(g, 8, 8, 'e'); put(g, 9, 7, 'e'); put(g, 10, 8, 'e'); }

  if (f.nose) put(g, 8, 9, 'S');
  if (f.blush && f.glasses === 'none') { put(g, 5, 9, 'r'); put(g, 10, 9, 'r'); }

  // 입
  const m = f.beard === 'mustache' && f.mouth === 'smile' ? 'flat' : f.mouth;
  if (m === 'smile') { put(g, 6, 9, 'm'); put(g, 9, 9, 'm'); row(g, 10, 7, 8, 'm'); }
  if (m === 'flat') row(g, 10, 7, 8, 'm');
  if (m === 'grin') { put(g, 6, 10, 'm'); row(g, 10, 7, 8, 'w'); put(g, 9, 10, 'm'); }
  if (m === 'small') put(g, 7, 10, 'm');
  if (m === 'smirk') { row(g, 10, 7, 8, 'm'); put(g, 9, 9, 'm'); }
  if (m === 'open') { row(g, 10, 7, 8, 'm'); row(g, 11, 7, 8, 'M'); }

  // 수염
  const mouthCell = (x: number, y: number) => 'mMw'.includes(at(g, x, y));
  const beardAt = (x: number, y: number, k: string) => { if (at(g, x, y) !== '.' && !mouthCell(x, y)) put(g, x, y, k); };
  if (f.beard === 'stubble') for (let y = 10; y <= 11; y++) for (let x = 4; x <= 11; x++) beardAt(x, y, 'u');
  if (f.beard === 'mustache') row(g, 9, 6, 9, 'b');
  if (f.beard === 'goatee') { row(g, 9, 6, 9, 'b'); beardAt(6, 11, 'b'); beardAt(9, 11, 'b'); row(g, 12, 7, 8, 'b'); }
  if (f.beard === 'full') { for (let y = 9; y <= 11; y++) for (let x = 4; x <= 11; x++) if (y > 9 || x === 4 || x === 11) beardAt(x, y, 'b'); row(g, 12, 6, 9, 'b'); }

  // 안경
  if (f.glasses === 'box' || f.glasses === 'rim' || f.glasses === 'shades') {
    for (const x0 of [4, 8]) {
      row(g, 7, x0, x0 + 3, 'g');
      put(g, x0, 8, 'g'); put(g, x0 + 3, 8, 'g');
      if (f.glasses === 'box') row(g, 9, x0 + 1, x0 + 2, 'g');
      if (f.glasses === 'shades') row(g, 8, x0, x0 + 3, 'g');
    }
  }
}

function drawBody(g: Grid, f: Face) {
  if (at(g, 7, 12) === '.') row(g, 12, 7, 8, 'S');
  row(g, 13, 3, 12, 'c'); row(g, 14, 1, 14, 'c'); row(g, 15, 1, 14, 'c');
  col(g, 3, 14, 15, 'C'); col(g, 12, 14, 15, 'C');
  if (f.cloth === 'tee') { row(g, 13, 6, 9, 's'); row(g, 14, 7, 8, 's'); }
  if (f.cloth === 'collar') { row(g, 13, 7, 8, 's'); put(g, 5, 13, 'w'); put(g, 6, 13, 'w'); put(g, 6, 14, 'w'); put(g, 9, 13, 'w'); put(g, 10, 13, 'w'); put(g, 9, 14, 'w'); col(g, 7, 15, 15, 'C'); }
  if (f.cloth === 'hoodie') { row(g, 13, 4, 11, 'C'); row(g, 13, 7, 8, 's'); col(g, 6, 14, 15, 'w'); col(g, 9, 14, 15, 'w'); }
  if (f.cloth === 'jacket') { row(g, 13, 6, 9, 'i'); for (let y = 14; y <= 15; y++) row(g, y, 6, 9, 'i'); col(g, 5, 13, 15, 'C'); col(g, 10, 13, 15, 'C'); }
  if (f.cloth === 'turtle') { row(g, 12, 6, 9, 'C'); }
  if (f.style === 'long') { put(g, 3, 13, 'h'); put(g, 12, 13, 'h'); }
}

function drawSuit(g: Grid) {
  if (at(g, 7, 12) === '.') row(g, 12, 7, 8, 'S');
  row(g, 13, 3, 12, 'c'); row(g, 14, 1, 14, 'c'); row(g, 15, 1, 14, 'c');
  row(g, 13, 6, 9, 'w'); row(g, 14, 6, 9, 'w'); row(g, 15, 7, 8, 'w');
  col(g, 7, 13, 15, 't'); col(g, 8, 13, 15, 't');
  col(g, 5, 14, 15, 'C'); col(g, 10, 14, 15, 'C');
}

// 표정 덮어쓰기(A-186 고객사 미팅의 몸짓: 끄덕임·팔짱·시계 봄)
export type FaceExpr = Partial<Pick<Face, 'eyes' | 'brows' | 'mouth'>>;

export function drawFaceTo(pix: Pix, id: string, shirt: string, suit = false, expr?: FaceExpr) {
  const f = { ...faceFor(id), ...expr };
  const g: Grid = Array.from({ length: FACE_W }, () => Array<string>(FACE_W).fill('.'));
  drawFace(g, f);
  if (suit) drawSuit(g);
  else drawBody(g, f);
  drawHair(g, f);

  // 그늘: 머리 오른쪽, 머리카락 바로 아래 이마
  for (let y = 0; y < FACE_W; y++)
    for (let x = 0; x < FACE_W; x++) {
      if (g[y][x] === 'h' && x >= 10) g[y][x] = 'H';
      if (g[y][x] === 's' && 'hHkKz'.includes(at(g, x, y - 1))) g[y][x] = 'S';
    }
  // 테두리: 빈 칸이 그림과 상하좌우로 맞닿으면 선
  const filled = (x: number, y: number) => { const k = at(g, x, y); return k !== '.' && k !== 'o'; };
  for (let y = 0; y < FACE_W; y++)
    for (let x = 0; x < FACE_W; x++)
      if (g[y][x] === '.' && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) g[y][x] = 'o';

  const hair = hex(f.hair);
  const skin = hex(f.skin);
  const cloth = suit ? hex('#2c3a5c') : shade(hex(shirt), f.tone);
  const hat = hex(f.hat);
  const pal: Record<string, Col> = {
    o: hex('#2a2233'),
    h: hair,
    H: shade(hair, 0.72),
    z: mix(hair, skin, 0.45),
    b: shade(hair, 0.85),
    u: mix(skin, hair, 0.35),
    s: skin,
    S: shade(skin, 0.86),
    e: hex('#2a2233'),
    w: hex('#f4f4f4'),
    m: hex('#b5525a'),
    M: hex('#5a2430'),
    r: mix(skin, hex('#ff7a7a'), 0.45),
    g: f.glasses === 'shades' ? hex('#2a2233') : hex(f.frame),
    y: hex('#f2c94c'),
    k: hat,
    K: shade(hat, 0.75),
    c: cloth,
    C: shade(cloth, 0.78),
    i: hex(f.tone > 1 ? '#3a3a48' : '#f4f4f4'),
    t: hex('#d23b3b'),
  };
  pix.sprite(0, 0, g.map((r) => r.join('')), pal);
}
