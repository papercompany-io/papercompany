// 시장 랭킹(A-120, A-161): 시장별·전체 고객 수 순위. 우리·살아 있는 경쟁사·이름 있는 현지 회사(field.ts)를 줄 세워 시장마다 30곳 안팎.
// 고객 수는 우리 = 실제, 경쟁사 = 점유율 × 수요 추정(competitorUsers와 같은 식), 현지 회사 = 현지·대체재 몫을 나눈 값. 시장 크기는 보여 주지 않습니다(SCREEN_GUIDE 3절).
// 회사마다 기업가치(상장사는 시가총액)와 주가를 붙입니다(A-161, 사용자 요청).
import { DATA, market, MARKET_IDS } from './data';
import { demand, shares } from './market';
import { fieldUsers, fieldValue, rivalValue, type FieldCo, type Valued } from './field';
import { computeValuation } from './valuation';
import type { GameState, MarketId } from './types';

export type { Quote } from './field';

export interface RankRow extends Valued {
  id: string; // 우리는 'me'
  name: string;
  users: number;
  share: number; // 이 목록 안에서의 고객 비중(0~1)
  rank: number;
  me: boolean;
  home: MarketId; // 본사가 있는 시장(우리·경쟁사는 국내)
}

type Entry = Omit<RankRow, 'share' | 'rank'>;

function build(rows: Entry[]): RankRow[] {
  const sorted = [...rows].sort((a, b) => b.users - a.users || Number(b.me) - Number(a.me));
  const total = sorted.reduce((a, r) => a + r.users, 0);
  return sorted.map((r, i) => ({ ...r, rank: i + 1, share: total > 0 ? r.users / total : 0 }));
}

export interface Rankings {
  overall: RankRow[];
  markets: Record<MarketId, RankRow[]>;
}

// 우리 회사: 화면 위 막대와 같은 회사 가치, 상장했으면 주가
function ours(s: GameState): Valued {
  const p = s.public;
  return { value: computeValuation(s).value, quote: p ? { price: p.price, change: p.prev ? p.price / p.prev - 1 : 0 } : null };
}

// 모든 시장 순위를 한 번에 만듭니다. 경쟁사 기업가치는 모든 시장 고객을 합쳐 매기므로 시장 하나만 따로 셀 수 없습니다.
export function rankings(s: GameState): Rankings {
  type Raw = { id: string; name: string; users: number; me: boolean; home: MarketId };
  const per = {} as Record<MarketId, Raw[]>;
  const worth = new Map<string, number>(); // 회사별 고객 수 × 시장 객단가 배수 합
  const field = new Map<string, FieldCo>();
  for (const m of MARKET_IDS) {
    const sh = shares(s, m);
    const D = demand(s, m);
    const rows: Raw[] = sh.comps.map((c) => ({ id: c.id, name: c.name, users: c.share * D, me: false, home: 'kr' }));
    if (s.markets[m].launched) rows.push({ id: 'me', name: s.company.service?.name ?? s.company.name, users: s.markets[m].users, me: true, home: 'kr' });
    const others = Math.max(0, 1 - sh.player - sh.comps.reduce((a, c) => a + c.share, 0)) * D;
    for (const f of fieldUsers(s, m, others, DATA.markets.field.size - rows.length)) {
      rows.push({ id: f.co.id, name: f.co.name, users: f.users, me: false, home: m });
      field.set(f.co.id, f.co);
    }
    for (const r of rows) worth.set(r.id, (worth.get(r.id) ?? 0) + r.users * market(m).arpu);
    per[m] = rows;
  }
  const valued = new Map<string, Valued>();
  for (const [id, w] of worth) {
    const f = field.get(id);
    const c = s.competitors.find((x) => x.id === id);
    valued.set(id, id === 'me' ? ours(s) : f ? fieldValue(s, f, w) : c ? rivalValue(s, c, w) : { value: 0, quote: null });
  }
  const withValue = (r: Raw): Entry => ({ ...r, ...valued.get(r.id)! });
  const markets = {} as Record<MarketId, RankRow[]>;
  const sum = new Map<string, Entry>();
  for (const m of MARKET_IDS) {
    markets[m] = build(per[m].map(withValue));
    for (const r of per[m]) {
      const cur = sum.get(r.id);
      if (cur) cur.users += r.users;
      else sum.set(r.id, withValue(r));
    }
  }
  return { overall: build([...sum.values()]), markets };
}

// 한 시장 랭킹: 그 시장에 들어와 있는 회사만
export function marketRanking(s: GameState, m: MarketId): RankRow[] {
  return rankings(s).markets[m];
}

// 전체 랭킹: 모든 시장 고객 합
export function overallRanking(s: GameState): RankRow[] {
  return rankings(s).overall;
}

export function myRank(rows: RankRow[]): RankRow | undefined {
  return rows.find((r) => r.me);
}
