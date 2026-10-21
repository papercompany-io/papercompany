// 밸런싱용 전략 봇(G4): 코어 엔진(src/core)을 화면 없이 돌려 커리어 전체를 플레이하고 진행 속도를 잽니다.
// 실행: npm run sim -- [판 수] [시드] [전략]
import { DATA, featuresOf, stageIndex } from '../../src/core/data';
import { runDay } from '../../src/core/sim';
import { newCareer, nextCompany, defaultPicks, type SetupChoices } from '../../src/core/state';
import { addToRoadmap, availableFeatures, hasMvp, appeal, fxTotals } from '../../src/core/product';
import { createPosting, offerJob } from '../../src/core/hiring';
import { runwayMonths, lastRevenue, projectedMonthlyPayroll } from '../../src/core/finance';
import { startRound, sendLetter, requestDecision, closeForOffer, acceptOffer, activeRound, fits, decisionProbability, selectableStages } from '../../src/core/funding';
import { setOrder } from '../../src/core/orders';
import { setAdBudget, launchMarket, launchBlock, totalUsers, shares, demand, revenuePerUser } from '../../src/core/market';
import { moveOffice, moveBlock, freeSeats } from '../../src/core/office';
import { chooseModel, latestModels, setAdoption } from '../../src/core/aiadopt';
import { promoteLead, leadInfo, avgSat } from '../../src/core/staff';
import { resolveDecision } from '../../src/core/events';
import { startExit, acceptSale, declineSale, annualRevenue, exitBlocked } from '../../src/core/exit';
import { sellShares, resign } from '../../src/core/public';
import { setCeoMode, executiveBlock, setAlloc } from '../../src/core/ceo';
import { createEsop } from '../../src/core/equity';
import { emptyProfile, retire, endingFor, founderAge } from '../../src/core/career';
import { acquire, acquireBlock } from '../../src/core/competitors';
import { computeValuation } from '../../src/core/valuation';
import { formatDate, yearFrac } from '../../src/core/calendar';
import type { DeptId, GameState, IndustryId, MarketId, StageId } from '../../src/core/types';

const runs = Number(process.argv[2] ?? 3);
const seed0 = Number(process.argv[3] ?? 1);
const verbose = process.argv.includes('-v');
const oneCompany = process.argv.includes('--one');

const CAT_PRI: Record<string, number> = { core: 0, growth: 2, monetize: 2, retention: 3, infra: 4, enterprise: 3, global: 5, ai: 4, platform: 6 };

function planRoadmap(s: GameState) {
  while (s.product.roadmap.length < 4) {
    const av = availableFeatures(s);
    if (!av.length) return;
    av.sort((a, b) => {
      const pa = CAT_PRI[a.cat] + (a.cat === 'infra' && s.product.bugs > 25 ? -3 : 0) + (a.dev + a.design) / 400 + (s.product.features[a.id] ?? 0) * 1.5;
      const pb = CAT_PRI[b.cat] + (b.cat === 'infra' && s.product.bugs > 25 ? -3 : 0) + (b.dev + b.design) / 400 + (s.product.features[b.id] ?? 0) * 1.5;
      return pa - pb;
    });
    if (addToRoadmap(s, av[0].id)) return;
  }
}

function targetHeadcount(s: GameState): Partial<Record<DeptId, number>> {
  const st = s.company.stage;
  const rev = lastRevenue(s);
  const scale = Math.max(1, Math.floor(Math.max(rev / 3e7, s.cash / 3e9)));
  if (st === 0) return { dev: 2 };
  if (st === 1) return { dev: 3, design: 1, marketing: 1, sales: 1 };
  if (st === 2) return { dev: 4 + Math.min(6, scale), design: 2, marketing: 2, sales: 2, hr: 1, cs: 1 + Math.floor(scale / 3) };
  const m = Math.min(20, scale);
  return { dev: 8 + m * 2, design: 3 + Math.floor(m / 2), marketing: 3 + Math.floor(m / 2), sales: 3 + m, hr: 2 + Math.floor(m / 4), cs: 2 + m, infra: st >= 3 ? 2 + Math.floor(m / 3) : 0, finlegal: st >= 3 ? 2 : 0, ai: st >= 3 ? 2 + Math.floor(m / 4) : 0 };
}

function hireStep(s: GameState) {
  const rw = runwayMonths(s);
  const rich = rw === null || rw > 10;
  if (!rich && s.cash < projectedMonthlyPayroll(s) * 8) return;
  const tgt = targetHeadcount(s);
  for (const [d, n] of Object.entries(tgt) as [DeptId, number][]) {
    const have = s.employees.filter((e) => e.dept === d).length + s.pendingHires.filter((h) => h.dept === d).length;
    if (have >= n || freeSeats(s, d).length === 0) continue;
    if (s.company.stage < (DATA.depts.departments.find((x) => x.id === d)!.stage)) continue;
    const open = s.postings.find((p) => p.dept === d && p.status === 'open');
    if (!open) createPosting(s, { dept: d, headcount: Math.min(4, n - have), salaryLevel: 'normal', durationDays: 14, promo: s.cash > 3e8 ? 'normal' : 'none' });
    const apps = s.applicants.filter((a) => a.status === 'waiting' && a.dept === d).sort((a, b) => 'SABC'.indexOf(a.grade) - 'SABC'.indexOf(b.grade));
    for (const a of apps.slice(0, Math.max(0, n - have))) {
      if (a.grade === 'C' && s.company.stage >= 2) continue;
      offerJob(s, a.id, false);
    }
  }
}

function nextStage(s: GameState): StageId | null {
  const sel = selectableStages(s);
  const cur = stageIndex(s.fundingStage);
  const want = sel.find((x) => stageIndex(x) > cur);
  return want ?? null;
}

function fundStep(s: GameState) {
  if (s.career.challenge === 'bootstrap' || s.public) return;
  const r = activeRound(s);
  if (r) {
    if (r.status === 'offer') {
      acceptOffer(s, r.id);
      return;
    }
    const invs = DATA.investors.investors.filter((i) => fits(i.id, r.stage));
    for (const inv of invs.slice(0, 4)) {
      for (const l of ['intro', 'proposal', 'material', 'club']) sendLetter(s, r.id, inv.id, l, 'as_is');
    }
    if (!r.leadId && s.day - r.openedDay >= 6) {
      const best = invs.map((i) => ({ i, p: r.letters[i.id] && !r.letters[i.id].decision ? decisionProbability(s, r, i.id).p : -1 })).sort((a, b) => b.p - a.p)[0];
      if (best && best.p > 0) requestDecision(s, r.id, best.i.id);
    }
    if (r.leadId) closeForOffer(s, r.id);
    return;
  }
  const rw = runwayMonths(s);
  const st = nextStage(s);
  if (!st) return;
  const need = rw !== null && rw < 10;
  const growthReady = (st === 'seed' && hasMvp(s)) || (stageIndex(st) >= stageIndex('A') && lastRevenue(s) >= ((DATA.funding.stages.find((x) => x.id === st) as { needRevenue?: number }).needRevenue ?? 0));
  const early = stageIndex(st) <= stageIndex('preseed') && s.day - s.company.startDay < 400;
  if ((need || growthReady || early) && (s.lastRoundDay === null || s.day - s.lastRoundDay >= 120)) {
    const room = stageIndex(st) <= 2 ? 0.12 : 0.15;
    startRound(s, st, room, stageIndex(st) <= 1 ? 'safe' : 'equity');
  }
}

function opsStep(s: GameState) {
  // 지시
  if (s.product.bugs > 35) setOrder(s, 'dev', 'dev_stabilize');
  else if (s.product.bugs < 15) setOrder(s, 'dev', 'dev_build');
  if (s.company.stage >= 2 && fxTotals(s).enterprise && s.day % 60 < 30) setOrder(s, 'sales', 'sales_enterprise');
  else if (s.company.stage >= 1) setOrder(s, 'sales', 'sales_direct');
  if (s.company.stage >= 1) setOrder(s, 'marketing', s.markets.kr.adBudget > 0 ? 'mkt_perf' : 'mkt_content');
  if (s.company.stage >= 3) setOrder(s, 'finlegal', 'fl_ipo');
  if (s.company.stage >= 3) setOrder(s, 'ai', 'ai_research');
  if (s.company.stage >= 2) setOrder(s, 'hr', avgSat(s) < 55 ? 'hr_culture' : 'hr_recruit');
  // 광고
  if (hasMvp(s)) {
    const rev = lastRevenue(s);
    const rw = runwayMonths(s);
    for (const m of Object.keys(s.markets) as (keyof GameState['markets'])[]) {
      if (!s.markets[m].launched) continue;
      // LTV가 CAC보다 넉넉히 크면 광고를 더 씁니다.
      const ind = DATA.industries.industries.find((x) => x.id === s.company.industry)!;
      const ltv = revenuePerUser(s, m).total / ind.churnM;
      const good = ltv > ind.cac * 1.5;
      const b = rw !== null && rw < 4 ? 0 : Math.max(s.cash > 1e8 ? 3e6 : 0, rev * (good ? 0.25 : 0.1), good ? Math.min(s.cash / 30, 5e8) : 0);
      setAdBudget(s, m, m === 'kr' ? b : b * 0.5);
    }
  }
  // 해외 진출
  for (const m of ['jp', 'sea', 'us', 'eu'] as const) if (!launchBlock(s, m) && s.cash > DATA.markets.markets.find((x) => x.id === m)!.entry * 4) launchMarket(s, m);
  // 사무실
  const full = s.seats.filter((x) => x.zone !== 'ceo' && x.zone !== 'exec').filter((x) => x.occupant === null).length <= 1;
  if (full && s.company.officeTier < 5) {
    const t = s.company.officeTier + 1;
    const dep = DATA.offices.tiers.find((x) => x.id === t)!.deposit;
    if (!moveBlock(s, t) && s.cash > dep * 3 + 2e8) moveOffice(s, t);
  }
  // 복지
  const wf: [number, string][] = [[4, 'meal'], [8, 'gym'], [14, 'medical'], [20, 'flex'], [30, 'gear'], [60, 'edu']];
  for (const [n, id] of wf) if (s.employees.length >= n && !s.company.welfare.includes(id) && (runwayMonths(s) ?? 99) > 8) s.company.welfare.push(id);
  // AI
  const latest = latestModels(s).find((m) => m.vendor === 'neural');
  if (latest && s.company.stage >= 1 && s.ai.modelId !== latest.id) {
    chooseModel(s, latest.id);
    for (const d of ['dev', 'cs', 'design', 'marketing'] as DeptId[]) setAdoption(s, d, 0.5);
  }
  if (s.ai.modelId && !s.company.welfare.includes('ax') && s.employees.length >= 10) s.company.welfare.push('ax');
  // 팀장
  for (const d of DATA.depts.departments.map((x) => x.id as DeptId)) {
    const li = leadInfo(s, d);
    if (li.needed > li.have) {
      const c = s.employees.filter((e) => e.dept === d && !e.lead).sort((a, b) => b.skill - a.skill)[0];
      if (c) promoteLead(s, c.id);
    }
  }
  // 대표 모드
  if (s.company.ceoMode === 'founder' && !executiveBlock(s) && s.employees.length >= 25) setCeoMode(s, 'executive');
  else if (s.company.ceoMode === 'founder') {
    if (!hasMvp(s)) {
      setAlloc(s, 'sales', 0);
      setAlloc(s, 'ir', 1);
      setAlloc(s, 'network', 1);
      setAlloc(s, 'dev', 6);
    } else {
      setAlloc(s, 'dev', 2);
      setAlloc(s, 'sales', 4);
    }
  } else {
    const need = Math.ceil(s.employees.length / DATA.ceo.approvePerEmployees);
    setAlloc(s, 'enterprise', 0);
    setAlloc(s, 'approve', Math.min(6, need + 1));
    setAlloc(s, 'enterprise', Math.max(0, 8 - Math.min(6, need + 1) - 2));
  }
  // ESOP
  if (s.company.stage >= 2 && !s.flags.includes('esop') && s.fundingStage && stageIndex(s.fundingStage) >= stageIndex('A')) createEsop(s, 0.08);
  // M&A
  if (s.company.stage >= 4) for (const c of s.competitors) if (c.alive && !acquireBlock(s, c) && s.cash > 5e10) acquire(s, c.id);
}

function decide(s: GameState) {
  for (const d of s.decisions) {
    if (d.resolved) continue;
    const opts = d.choices.map((c, i) => ({ c, i })).filter((x) => x.c.enabled);
    if (!opts.length) continue;
    // 돈이 넉넉하면 비싼 선택(보통 좋은 결과)도, 아니면 싼 것
    const rich = s.cash > 5e8;
    opts.sort((a, b) => (rich ? 0 : a.c.cost - b.c.cost));
    const pick = opts[Math.floor(((s.day * 7 + d.id.length) % 10) / 10 * Math.min(2, opts.length))];
    resolveDecision(s, d.id, pick.i);
  }
}

function exitStep(s: GameState, log: (m: string) => void) {
  const a = s.exitAttempt;
  if (a && a.status === 'offer') {
    if (a.inbound && (a.price ?? 0) > 3e11 && s.company.stage < 4) acceptSale(s);
    else if (!a.inbound) acceptSale(s);
    else declineSale(s);
    return;
  }
  if (s.public) {
    const p = s.public;
    if (s.day >= p.lockupUntil && s.day % 365 === p.lockupUntil % 365) sellShares(s, 0.15);
    if (s.day - p.ipoDay > 365 * 4) {
      log(`  상장 4년 → 사임`);
      resign(s);
    }
    return;
  }
  if (!exitBlocked(s) && s.company.stage >= 4 && annualRevenue(s) >= 3e10 && s.company.ipoReady >= 50) startExit(s, 'ipo');
}

interface Milestones {
  [k: string]: number | null;
}

function playCompany(s: GameState, log: (m: string) => void) {
  const start = s.day;
  const ms: Milestones = { mvp: null, rev1: null, staff5: null, seed: null, A: null, B: null, C: null, stage3: null, stage4: null, ipo: null };
  let guard = 0;
  while (!s.ended && guard++ < 365 * 40) {
    s.pauseReason = null;
    planRoadmap(s);
    if (s.day % 2 === 0) hireStep(s);
    fundStep(s);
    if (s.day % 7 === 0) opsStep(s);
    decide(s);
    exitStep(s, log);
    if (s.ended) break;
    runDay(s);
    s.events.length = 0;
    const d = s.day - start;
    if (ms.mvp === null && hasMvp(s)) ms.mvp = d;
    if (ms.rev1 === null && lastRevenue(s) > 0) ms.rev1 = d;
    if (ms.staff5 === null && s.employees.length >= 5) ms.staff5 = d;
    for (const k of ['seed', 'A', 'B', 'C'] as StageId[]) if (ms[k] === null && stageIndex(s.fundingStage) >= stageIndex(k)) ms[k] = d;
    if (ms.stage3 === null && s.company.stage >= 3) ms.stage3 = d;
    if (ms.stage4 === null && s.company.stage >= 4) ms.stage4 = d;
    if (ms.ipo === null && s.public) ms.ipo = d;
    if (process.argv.includes('--pl') && s.plHistory.length && s.accrual.days === 0) {
      const m = s.plHistory[s.plHistory.length - 1];
      log(`   PL ${m.month} 매출 ${(m.revenue / 1e6).toFixed(1)} (구독 ${(m.revSub / 1e6).toFixed(1)} 광고 ${(m.revAd / 1e6).toFixed(1)} 수수료 ${(m.revTake / 1e6).toFixed(1)} 대기업 ${(m.revEnt / 1e6).toFixed(1)}) 월급 ${(m.salary / 1e6).toFixed(1)} 광고비 ${(m.ads / 1e6).toFixed(1)} 인프라 ${(m.infra / 1e6).toFixed(1)} 월세 ${(m.rent / 1e6).toFixed(1)} 복지 ${(m.welfare / 1e6).toFixed(1)} AI ${(m.ai / 1e6).toFixed(1)} 기타 ${(m.other / 1e6).toFixed(1)} 채용 ${(m.recruiting / 1e6).toFixed(1)} 접대 ${(m.entertainment / 1e6).toFixed(1)} 순익 ${(m.netIncome / 1e6).toFixed(1)} 자금 ${(m.cashAfter / 1e6).toFixed(0)} 고객 ${m.usersEnd} 인지도 ${s.markets.kr.awareness.toFixed(3)} 점유 ${(shares(s, 'kr').player * 100).toFixed(1)}% 매력 ${appeal(s).toFixed(0)} 직원 ${s.employees.length} 만족 ${avgSat(s).toFixed(0)}`);
    }
    if (process.argv.includes('--mk') && s.accrual.days === 0 && s.plHistory.length % 6 === 0) {
      const parts = (Object.keys(s.markets) as MarketId[]).filter((m) => s.markets[m].launched).map((m) => `${m}:${Math.round(s.markets[m].users)}/${Math.round(demand(s, m))} sh${(shares(s, m).player * 100).toFixed(0)}% aw${s.markets[m].awareness.toFixed(2)} ad${(s.markets[m].adBudget / 1e6).toFixed(0)}`);
      log(`   ${formatDate(s.day)} 매력 ${appeal(s).toFixed(0)} 경쟁 ${s.competitors.filter((c) => c.alive).map((c) => c.appeal.toFixed(0) + '/' + c.awareness.toFixed(2)).join(' ')} | ${parts.join(' | ')} rpu ${Math.round(revenuePerUser(s, 'kr').total)}`);
    }
    if (process.argv.includes('--big')) for (const l of s.ledger) if (l.day === s.day - 1 && l.amount < -Math.max(5e8, lastRevenue(s) * 0.3)) log(`   큰 지출 ${formatDate(l.day)} ${l.item} ${(l.amount / 1e8).toFixed(1)}억`);
    if (verbose && s.day % 180 === 0) {
      log(`  ${formatDate(s.day)} 단계${s.company.stage} 자금 ${(s.cash / 1e8).toFixed(1)}억 매출 ${(lastRevenue(s) / 1e6).toFixed(1)}백만 고객 ${Math.round(totalUsers(s))} 점유 ${(shares(s, 'kr').player * 100).toFixed(1)}% 직원 ${s.employees.length} 버그 ${s.product.bugs.toFixed(0)} 가치 ${(computeValuation(s).value / 1e8).toFixed(0)}억 ${s.fundingStage ?? '-'} 만족 ${avgSat(s).toFixed(0)}`);
    }
  }
  return { ms, days: s.day - start };
}

const INDS: IndustryId[] = (process.env.IND ? [process.env.IND] : ["saas", "consumer", "commerce"]) as IndustryId[];
const out: string[] = [];
for (let r = 0; r < runs; r++) {
  const seed = seed0 + r;
  const profile = emptyProfile();
  const picks = defaultPicks();
  picks.career = 'car_startup';
  picks.edu = 'edu_univ';
  const base: SetupChoices = { picks, cofounderId: 'cf_jiwoo', cofounderEquity: 0.2, engineerId: 'fe_hana', companyName: '봇컴퍼니', wantsAngel: false, seed, industry: INDS[r % INDS.length] };
  const s = newCareer(base, profile);
  const log = (m: string) => out.push(m);
  let k = 0;
  let decisions = 0;
  while (!s.career.retired) {
    k++;
    const t0 = s.day;
    log(`[판 ${r + 1} 회사 ${k}] ${s.company.industry} 시작 ${formatDate(s.day)} 나이 ${founderAge(s).toFixed(1)}`);
    const { ms, days } = playCompany(s, log);
    decisions += s.company.decisions;
    const res = s.result!;
    log(`  끝: ${res.kind} ${formatDate(s.day)} (${(days / 365).toFixed(1)}년) 창업자 몫 ${(res.amount / 1e8).toFixed(1)}억 최대가치 ${(res.maxValuation / 1e8).toFixed(0)}억 최대고객 ${Math.round(res.peakUsers)} 최대직원 ${res.peakEmployees} 결정 ${s.company.decisions} 출시 ${s.product.shipped.length} 장애 ${s.stats.outages} 퇴사 ${s.stats.quits}`);
    log(`  마일스톤(일): ${Object.entries(ms).map(([a, b]) => `${a}=${b ?? '-'}`).join(' ')}`);
    void t0;
    if (oneCompany || founderAge(s) >= 63 || k >= 8) {
      retire(s);
      break;
    }
    nextCompany(s, { ...base, companyName: `봇컴퍼니${k + 1}`, industry: INDS[(r + k) % INDS.length], invest: s.career.wealth * 0.2 });
  }
  const years = yearFrac(s.day) - s.career.startYear;
  log(`[판 ${r + 1}] 은퇴 나이 ${founderAge(s).toFixed(1)} 회사 ${s.career.companies.length} 자산 ${(s.career.wealth / 1e8).toFixed(1)}억 명성 ${s.career.rep.toFixed(0)} 엔딩 ${endingFor(s).name} 업적 ${s.career.achievements.length} 결정 ${decisions} 게임 ${years.toFixed(1)}년 = 1배속 ${((years * 365 * DATA.time.dayMs) / 3600000).toFixed(1)}시간`);
  void featuresOf;
}
console.log(out.join('\n'));
