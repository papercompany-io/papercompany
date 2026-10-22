// 출시 직후 홍보 없이 사용자가 얼마나 들어오는지 잽니다(밸런싱 확인용).
// 실행: npx esbuild scripts/sim/launch.ts --bundle --platform=node --outfile=.sim/launch.cjs --log-level=warning && node .sim/launch.cjs
import { newCareer, defaultPicks } from '../../src/core/state';
import { emptyProfile } from '../../src/core/career';
import { runDay } from '../../src/core/sim';
import { hasMvp } from '../../src/core/product';
import { totalUsers } from '../../src/core/market';
import type { IndustryId } from '../../src/core/types';

const promo = process.argv.includes('--promo');
for (const industry of ['saas', 'consumer', 'commerce', 'fintech', 'ai'] as IndustryId[]) {
  const s = newCareer({ picks: defaultPicks(), cofounderId: null, cofounderEquity: 0, engineerId: null, companyName: '측정', wantsAngel: false, seed: 7, industry }, emptyProfile());
  s.cash = 1e12; // 자금 걱정 없이 출시까지
  s.networkPoints = Number(process.env.NET ?? 300); // 출시까지 대표 네트워킹 2칸/일 ≈ 300점
  for (const it of s.product.roadmap) {
    it.devDone = 1e6;
    it.designDone = 1e6;
  }
  let guard = 0;
  while (!hasMvp(s) && guard++ < 10) runDay(s);
  if (promo) s.markets.kr.adBudget = 3_000_000;
  const row: string[] = [];
  for (let d = 1; d <= 180; d++) {
    runDay(s);
    if ([1, 7, 30, 90, 180].includes(d)) row.push(`D${d}:${Math.round(totalUsers(s))}`);
  }
  console.log(industry.padEnd(9), row.join('  '), `aw ${(s.markets.kr.awareness * 100).toFixed(2)}%`);
}
