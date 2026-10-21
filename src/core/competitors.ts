// 경쟁사(Claude 제안): 산업마다 가상 경쟁사가 매달 성장·투자 유치·가격 전쟁·폐업하고, 몇 년마다 새로 들어옵니다.
// 4단계부터 경쟁사 인수(M&A)로 고객과 매력도를 흡수할 수 있습니다.
import { industry, market, MARKET_IDS } from './data';
import { yearOf } from './calendar';
import { demand, revenuePerUser, shares } from './market';
import { spendNow } from './finance';
import { nextId } from './ids';
import { news, notify } from './notify';
import { appeal } from './product';
import { pick, rand, randRange } from './rng';
import type { Competitor, GameState, MarketId, PriceTier } from './types';

export function makeCompetitor(s: GameState, strength: number): Competitor | null {
  const ind = industry(s.company.industry);
  const used = new Set(s.competitors.map((c) => c.name));
  const free = ind.competitorNames.filter((n) => !used.has(n));
  if (!free.length) return null;
  const tiers: PriceTier[] = ['low', 'standard', 'standard', 'premium'];
  const markets: MarketId[] = ['kr'];
  for (const m of MARKET_IDS) if (m !== 'kr' && rand(s) < 0.25 * strength) markets.push(m);
  return {
    id: nextId(s, 'c'),
    name: pick(s, free),
    appeal: randRange(s, 14, 24) * strength,
    awareness: Math.min(0.8, randRange(s, 0.12, 0.35) * Math.min(2.2, strength)),
    markets,
    cash: randRange(s, 5e8, 3e9) * strength,
    aggression: rand(s),
    alive: true,
    priceTier: pick(s, tiers),
    bornDay: s.day,
    boostUntil: null,
    acquiredDay: null,
  };
}

// 시장이 성숙할수록(늦게 창업할수록) 기존 강자가 강합니다(A-53).
export function marketMaturity(s: GameState): number {
  return 1 + Math.min(1, 0.07 * Math.max(0, yearOf(s.day) - 2027)); // 연 7%, 최대 2배(A-70)
}

export function seedCompetitors(s: GameState, extra = 0, strength = 1) {
  const n = industry(s.company.industry).startCompetitors + extra + Math.min(2, Math.floor((yearOf(s.day) - 2027) / 8));
  for (let i = 0; i < n; i++) {
    const c = makeCompetitor(s, strength * marketMaturity(s) * randRange(s, 0.8, 1.15));
    if (c) s.competitors.push(c);
  }
}

// 경쟁사 고객 수 추정(점유율 × 수요)
export function competitorUsers(s: GameState, c: Competitor): number {
  let u = 0;
  for (const m of c.markets) {
    const sh = shares(s, m).comps.find((x) => x.id === c.id)?.share ?? 0;
    u += sh * demand(s, m);
  }
  return u;
}

// 인수 가격: 고객 × 사용자당 연매출 × 4배 + 기본 5억(Claude 제안)
export function acquisitionPrice(s: GameState, c: Competitor): number {
  const users = competitorUsers(s, c);
  const rpu = revenuePerUser(s, 'kr').total;
  return Math.round(3e9 + users * rpu * 12 * 6 + Math.max(0, c.cash) + c.appeal * 2e8);
}

export function acquireBlock(s: GameState, c: Competitor): string | null {
  if (!c.alive) return '이미 사라진 회사입니다.';
  if (s.company.stage < 4) return '회사 단계 4(스케일업)부터 인수할 수 있습니다.';
  if (s.cash < acquisitionPrice(s, c)) return '인수 자금이 부족합니다.';
  return null;
}

export function acquire(s: GameState, id: string): string | null {
  const c = s.competitors.find((x) => x.id === id);
  if (!c) return '없는 회사입니다.';
  const err = acquireBlock(s, c);
  if (err) return err;
  const price = acquisitionPrice(s, c);
  // 고객 60%를 흡수(그 시장에 진출해 있을 때)
  for (const m of c.markets) {
    if (!s.markets[m].launched) continue;
    const sh = shares(s, m).comps.find((x) => x.id === c.id)?.share ?? 0;
    s.markets[m].users += sh * demand(s, m) * 0.6;
    s.markets[m].awareness = Math.min(1, s.markets[m].awareness + c.awareness * 0.3);
  }
  s.product.appealBonus += c.appeal * 0.12;
  spendNow(s, `${c.name} 인수`, price, 'other');
  c.alive = false;
  c.acquiredDay = s.day;
  s.company.acquisitions += 1;
  notify(s, `${c.name}을(를) 인수했습니다. 고객과 기술을 흡수합니다.`, 'mission', 'market');
  news(s, `[M&A] ${s.company.name}, 경쟁사 ${c.name} 인수`, 'company');
  s.events.push({ type: 'confetti' });
  return null;
}

// 매달: 경쟁사 성장, 투자 유치, 가격 전쟁, 폐업, 신규 진입
export function competitorsMonth(s: GameState) {
  const mine = appeal(s);
  for (const c of s.competitors) {
    if (!c.alive) continue;
    // 매력도: 스스로 조금씩 크고, 시장 선두(플레이어)를 베끼며 따라옵니다(실력 quality만큼).
    const q = 0.8 + c.aggression * 0.3;
    const g = randRange(s, 0.002, 0.014) + c.aggression * 0.003;
    c.appeal *= 1 + g;
    if (mine * q > c.appeal) c.appeal += (mine * q - c.appeal) * 0.1;
    // 인지도: 점유율이 클수록 높아집니다.
    let sh = 0;
    for (const m of c.markets) sh = Math.max(sh, shares(s, m).comps.find((x) => x.id === c.id)?.share ?? 0);
    const aw = Math.min(0.9, 0.18 + sh * 1.2);
    c.awareness += (aw - c.awareness) * 0.05 + randRange(s, -0.005, 0.008);
    c.awareness = Math.max(0.03, Math.min(0.95, c.awareness));
    c.cash -= randRange(s, 0.3e8, 1.2e8) * (1 + c.aggression);
    // 투자 유치
    if (c.cash < 3e8 && rand(s) < (s.economy.phase === 'recession' ? 0.3 : 0.65)) {
      const amt = randRange(s, 1e9, 1e10) * (s.economy.phase === 'boom' ? 1.5 : s.economy.phase === 'recession' ? 0.5 : 1);
      c.cash += amt;
      c.awareness = Math.min(0.9, c.awareness + 0.03);
      news(s, `[투자] ${c.name}, ${Math.round(amt / 1e8)}억원 투자 유치`, 'competitor');
    }
    // 폐업
    if (c.cash < 0 && rand(s) < (s.economy.phase === 'recession' ? 0.35 : 0.12)) {
      c.alive = false;
      news(s, `[폐업] ${c.name}, 자금난으로 서비스 종료`, 'competitor');
      notify(s, `경쟁사 ${c.name}이(가) 문을 닫았습니다. 그 고객이 시장에 풀립니다.`, 'good', 'market');
      continue;
    }
    // 해외 진출
    if (rand(s) < 0.03 + c.aggression * 0.03) {
      const next = MARKET_IDS.find((m) => !c.markets.includes(m));
      if (next) {
        c.markets.push(next);
        news(s, `[해외] ${c.name}, ${market(next).name} 진출`, 'competitor');
      }
    }
    // 가격 전쟁(공격적인 곳)
    if (rand(s) < 0.04 * c.aggression && c.boostUntil === null) {
      c.boostUntil = s.day + 60;
      c.priceTier = 'low';
      news(s, `[경쟁] ${c.name}, 대대적인 가격 인하 발표`, 'competitor');
      notify(s, `${c.name}이(가) 가격을 크게 내렸습니다. 두 달 동안 그쪽 매력도가 올라갑니다.`, 'bad', 'market');
    }
    if (c.boostUntil !== null && c.boostUntil <= s.day) c.boostUntil = null;
  }
  // 신규 진입: 시장이 커질수록 새 경쟁사가 들어옵니다.
  const alive = s.competitors.filter((c) => c.alive).length;
  // 시장이 크고 우리 점유율이 높을수록 새 경쟁자가 노리고 들어옵니다.
  const lead = s.markets.kr.launched ? shares(s, 'kr').player : 0;
  if (alive < 7 && rand(s) < 0.03 + lead * 0.12) {
    const c = makeCompetitor(s, Math.max(1, mine / 20) * randRange(s, 0.7, 1.1));
    if (c) {
      s.competitors.push(c);
      news(s, `[신규] ${c.name}, 시장 진출 선언`, 'competitor');
    }
  }
}
