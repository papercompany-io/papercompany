// 시장 랭킹(A-120): 시장별·전체 고객 수 순위. 우리와 살아 있는 경쟁사만 줄 세웁니다.
// 고객 수는 우리 = 실제, 경쟁사 = 점유율 × 수요 추정(competitorUsers와 같은 식). 순위만 보여 주고 시장 크기는 보여 주지 않습니다(SCREEN_GUIDE 3절).
import { MARKET_IDS } from './data';
import { demand, shares } from './market';
import type { GameState, MarketId } from './types';

export interface RankRow {
  id: string; // 우리는 'me'
  name: string;
  users: number;
  share: number; // 이 목록 안에서의 고객 비중(0~1)
  rank: number;
  me: boolean;
}

function build(rows: { id: string; name: string; users: number; me: boolean }[]): RankRow[] {
  const sorted = [...rows].sort((a, b) => b.users - a.users || Number(b.me) - Number(a.me));
  const total = sorted.reduce((a, r) => a + r.users, 0);
  return sorted.map((r, i) => ({ ...r, rank: i + 1, share: total > 0 ? r.users / total : 0 }));
}

// 한 시장 랭킹: 그 시장에 들어와 있는 회사만
export function marketRanking(s: GameState, m: MarketId): RankRow[] {
  const sh = shares(s, m);
  const D = demand(s, m);
  const rows = sh.comps.map((c) => ({ id: c.id, name: c.name, users: c.share * D, me: false }));
  if (s.markets[m].launched) rows.push({ id: 'me', name: s.company.service?.name ?? s.company.name, users: s.markets[m].users, me: true });
  return build(rows);
}

// 전체 랭킹: 모든 시장 고객 합
export function overallRanking(s: GameState): RankRow[] {
  const sum = new Map<string, { name: string; users: number; me: boolean }>();
  for (const m of MARKET_IDS) {
    for (const r of marketRanking(s, m)) {
      const cur = sum.get(r.id) ?? { name: r.name, users: 0, me: r.me };
      cur.users += r.users;
      sum.set(r.id, cur);
    }
  }
  return build([...sum.entries()].map(([id, v]) => ({ id, ...v })));
}

export function myRank(rows: RankRow[]): RankRow | undefined {
  return rows.find((r) => r.me);
}
