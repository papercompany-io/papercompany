// 픽셀 아트용 소프트웨어 래스터라이저. 안티앨리어싱 없이 정수 픽셀만 칠해서 캔버스를 키워도 또렷한 픽셀로 보입니다(OF-01).
export type Col = number; // ImageData용 0xAABBGGRR

export function hex(h: string, a = 255): Col {
  const n = parseInt(h.slice(1), 16);
  return ((a << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255)) >>> 0;
}

function parts(c: Col): [number, number, number, number] {
  return [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, c >>> 24];
}

function pack(r: number, g: number, b: number, a = 255): Col {
  const k = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return ((k(a) << 24) | (k(b) << 16) | (k(g) << 8) | k(r)) >>> 0;
}

// f < 1이면 어둡게, f > 1이면 흰색 쪽으로 밝게
export function shade(c: Col, f: number): Col {
  const [r, g, b, a] = parts(c);
  if (f <= 1) return pack(r * f, g * f, b * f, a);
  const t = f - 1;
  return pack(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t, a);
}

export function mix(x: Col, y: Col, t: number): Col {
  const [r1, g1, b1, a1] = parts(x);
  const [r2, g2, b2, a2] = parts(y);
  return pack(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t, a1 + (a2 - a1) * t);
}

export type Pt = [number, number];

export class Pix {
  readonly w: number;
  readonly h: number;
  readonly img: ImageData;
  readonly data: Uint32Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.img = new ImageData(w, h);
    this.data = new Uint32Array(this.img.data.buffer);
  }

  clear(c: Col) {
    this.data.fill(c);
  }

  px(x: number, y: number, c: Col) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const a = c >>> 24;
    if (a === 255) this.data[y * this.w + x] = c;
    else if (a > 0) this.data[y * this.w + x] = mix(this.data[y * this.w + x], c | 0xff000000, a / 255);
  }

  rect(x: number, y: number, w: number, h: number, c: Col) {
    for (let j = Math.floor(y); j < Math.floor(y + h); j++) for (let i = Math.floor(x); i < Math.floor(x + w); i++) this.px(i, j, c);
  }

  // 픽셀 중심 기준 스캔라인 채우기(볼록·오목 모두)
  poly(pts: Pt[], c: Col) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
    const y0 = Math.max(0, Math.ceil(minY - 0.5));
    const y1 = Math.min(this.h - 1, Math.floor(maxY - 0.5));
    const xs: number[] = [];
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      xs.length = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if ((a[1] <= yc && yc < b[1]) || (b[1] <= yc && yc < a[1])) xs.push(a[0] + ((yc - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k] - 0.5));
        const xb = Math.min(this.w - 1, Math.floor(xs[k + 1] - 0.5));
        for (let x = xa; x <= xb; x++) this.px(x, y, c);
      }
    }
  }

  line(p: Pt, q: Pt, c: Col) {
    let x0 = Math.round(p[0]);
    let y0 = Math.round(p[1]);
    const x1 = Math.round(q[0]);
    const y1 = Math.round(q[1]);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  // 문자열 그림을 팔레트로 찍습니다. '.'은 투명. (x, y)는 왼쪽 위.
  sprite(x: number, y: number, rows: string[], pal: Record<string, Col>, flip = false) {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const ch = row[flip ? row.length - 1 - i : i];
        if (ch === '.') continue;
        const c = pal[ch];
        if (c !== undefined) this.px(x + i, y + j, c);
      }
    }
  }

  // 스프라이트 둘레에 1픽셀 테두리(선택 표시)
  spriteOutline(x: number, y: number, rows: string[], c: Col) {
    const filled = (i: number, j: number) => j >= 0 && j < rows.length && i >= 0 && i < rows[j].length && rows[j][i] !== '.';
    for (let j = -1; j <= rows.length; j++) {
      const len = Math.max(...rows.map((r) => r.length));
      for (let i = -1; i <= len; i++) {
        if (filled(i, j)) continue;
        if (filled(i - 1, j) || filled(i + 1, j) || filled(i, j - 1) || filled(i, j + 1)) this.px(x + i, y + j, c);
      }
    }
  }
}
