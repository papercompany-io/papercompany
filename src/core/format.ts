// 금액·비율 표기. 화면 숫자를 손으로 검산할 수 있게 정확한 원 단위 표기도 둡니다.

export function won(n: number): string {
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

// 짧은 표기: 1억 2,345만원
export function wonShort(n: number): string {
  const sign = n < 0 ? '-' : '';
  let v = Math.round(Math.abs(n));
  if (v < 10000) return `${sign}${v.toLocaleString('ko-KR')}원`;
  const jo = Math.floor(v / 1e12);
  v -= jo * 1e12;
  const eok = Math.floor(v / 1e8);
  v -= eok * 1e8;
  const man = Math.floor(v / 1e4);
  const parts: string[] = [];
  if (jo) parts.push(`${jo.toLocaleString('ko-KR')}조`);
  if (eok) parts.push(`${eok.toLocaleString('ko-KR')}억`);
  if (man) parts.push(`${man.toLocaleString('ko-KR')}만`);
  return `${sign}${parts.join(' ')}원`;
}

export function pct(f: number, digits = 2): string {
  return `${(f * 100).toFixed(digits)}%`;
}

// 표시용 반올림 합이 정확히 100.00%가 되도록 최대 잔여 방식으로 나눕니다.
export function pctsSumTo100(values: number[]): string[] {
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const raw = values.map((v) => (v / total) * 10000);
  const floors = raw.map((r) => Math.floor(r));
  let rest = 10000 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const o of order) {
    if (rest <= 0) break;
    floors[o.i]++;
    rest--;
  }
  return floors.map((bp) => `${(bp / 100).toFixed(2)}%`);
}
