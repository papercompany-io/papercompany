// 시장 랭킹 그림(A-162): 받침대의 픽셀 등수(1·2·3 + 등)와 회사 동그라미 아바타. 순위 화면 말고는 쓰지 않습니다.
import type { CSSProperties } from 'react';
import type { ServiceInfo } from '../../core/types';
import { LOGO_COLORS, LOGO_MARKS, ServiceLogo } from '../logo';

// 숫자 하나 = 7×9 칸 격자. '#'이 칠한 칸. 획은 두 칸 굵기로 두어 작게 줄여도 뭉개지지 않게 합니다.
const DIGITS: Record<1 | 2 | 3, string[]> = {
  1: ['...##..', '..###..', '.####..', '...##..', '...##..', '...##..', '...##..', '#######', '#######'],
  2: ['.#####.', '##...##', '.....##', '....##.', '...##..', '..##...', '.##....', '#######', '#######'],
  3: ['.#####.', '##...##', '.....##', '..####.', '.....##', '.....##', '.....##', '##...##', '.#####.'],
};

interface Cell {
  x: number;
  y: number;
}

// 칠한 칸(위 가장자리 = 밝게, 아래 가장자리 = 어둡게) + 바깥 한 칸 윤곽선 + 아래·오른쪽으로 떨어지는 그림자를 칸 단위로 계산
function layers(rows: string[]) {
  const on = (x: number, y: number) => rows[y]?.[x] === '#';
  const fill: (Cell & { t: 'f' | 'h' | 'l' })[] = [];
  const edge = new Map<string, Cell>();
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== '#') return;
      fill.push({ x, y, t: !on(x, y - 1) ? 'h' : !on(x, y + 1) ? 'l' : 'f' });
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!on(x + dx, y + dy)) edge.set(`${x + dx},${y + dy}`, { x: x + dx, y: y + dy });
    }),
  );
  const outline = [...edge.values()];
  const shade = new Map<string, Cell>();
  for (const c of [...outline, ...fill]) shade.set(`${c.x + 1},${c.y + 2}`, { x: c.x + 1, y: c.y + 2 });
  return { fill, outline, shade: [...shade.values()] };
}

const GLYPH = { 1: layers(DIGITS[1]), 2: layers(DIGITS[2]), 3: layers(DIGITS[3]) };

// 1등·2등·3등 받침대 글자. 색(금·은·동)과 칸 크기(--u)는 .rk-slot.rN이 정합니다. 숫자는 SVG 칸 그림, "등"은 픽셀 글꼴(Galmuri)로 같은 윤곽선을 둘렀습니다.
export function PixelRank({ rank }: { rank: 1 | 2 | 3 }) {
  const g = GLYPH[rank];
  return (
    <span className="rk-px" role="img" aria-label={`${rank}등`}>
      <svg viewBox="-1 -1 10 13" shapeRendering="crispEdges" aria-hidden>
        {g.shade.map((c) => (
          <rect key={`s${c.x},${c.y}`} className="s" x={c.x} y={c.y} width={1} height={1} />
        ))}
        {g.outline.map((c) => (
          <rect key={`o${c.x},${c.y}`} className="o" x={c.x} y={c.y} width={1} height={1} />
        ))}
        {g.fill.map((c) => (
          <rect key={`f${c.x},${c.y}`} className={c.t} x={c.x} y={c.y} width={1} height={1} />
        ))}
      </svg>
      <span className="rk-px-ko" aria-hidden>
        등
      </span>
    </span>
  );
}

function hashOf(s: string): number {
  let h = 5381;
  for (const ch of s) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

// 회사 아바타: 회사를 세울 때 고르는 서비스 로고(ServiceLogo)를 그대로 씁니다. 우리는 직접 고른 로고, 다른 회사는 id로 정한 심볼·색(늘 같음).
// 크기를 안 주면 둘러싼 칸의 --s(포디움은 창 너비에 따라 달라짐)를 따릅니다.
export function RankAvatar({ id, name, logo, size }: { id: string; name: string; logo?: ServiceInfo['logo']; size?: number }) {
  const mark = logo?.mark ?? LOGO_MARKS[hashOf(id) % LOGO_MARKS.length] ?? '';
  const color = logo?.color ?? LOGO_COLORS[hashOf(`${id}#`) % LOGO_COLORS.length];
  const style = (size ? { '--s': `${size}px` } : undefined) as CSSProperties | undefined;
  return (
    <span className="rk-av" style={style} aria-hidden>
      <ServiceLogo service={{ field: '', name, logo: { mark, color } }} fallback={name} />
    </span>
  );
}
