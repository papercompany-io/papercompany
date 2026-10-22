// 밸런싱용 전략 봇(G4): 코어 엔진(src/core)을 화면 없이 돌려 커리어 전체를 플레이하고 진행 속도를 잽니다.
// 실행: npm run sim -- [판 수] [시드] [전략]
import fs from 'fs';
import { DATA, featuresOf, stageIndex } from '../../src/core/data';
import { runDay } from '../../src/core/sim';
import { newCareer, nextCompany, defaultPicks, ownedSpecs, type SetupChoices } from '../../src/core/state';
import { addToRoadmap, availableFeatures, hasMvp, appeal, fxTotals, canCharge } from '../../src/core/product';
import { createPosting, offerJob } from '../../src/core/hiring';
import { runwayMonths, lastRevenue, projectedMonthlyPayroll, debtBalance } from '../../src/core/finance';
import { startRound, sendLetter, requestDecision, closeForOffer, acceptOffer, activeRound, fits, decisionProbability, selectableStages } from '../../src/core/funding';
import { setOrder } from '../../src/core/orders';
import { audience, campaignBlock, campaignCost, campaignDef, startCampaign } from '../../src/core/ads';
import { setAdBudget, launchMarket, launchBlock, totalUsers, shares, demand, revenuePerUser } from '../../src/core/market';
import { moveOffice, moveBlock, seatsAvailable, furnitureItems, buyFurniture, buyFurnitureBlock } from '../../src/core/office';
import { chooseModel, latestModels, setAdoption } from '../../src/core/aiadopt';
import { promoteLead, leadInfo, avgSat, marketSalary } from '../../src/core/staff';
import { resolveDecision } from '../../src/core/events';
import { LOAN_EVENT, policyApproval } from '../../src/core/loans';
import { startExit, acceptSale, declineSale, annualRevenue, exitBlocked } from '../../src/core/exit';
import { sellShares, resign, setGuidance } from '../../src/core/public';

const guidanceSet = new Map<string, string>();
import { setCeoMode, executiveBlock, setCeoWork } from '../../src/core/ceo';
import { acceptOuting, outings } from '../../src/core/outings';
import { acceptContract } from '../../src/core/contracts';
import { createEsop } from '../../src/core/equity';
import { emptyProfile, retire, endingFor, founderAge } from '../../src/core/career';
import { acquire, acquireBlock } from '../../src/core/competitors';
import { computeValuation } from '../../src/core/valuation';
import { formatDate, yearFrac } from '../../src/core/calendar';
import { Meter, summarize, type CompanyMetrics } from './metrics';
import type { DeptId, GameState, IndustryId, MarketId, StageId } from '../../src/core/types';

// 실험용(계측 도구): OVR='{"industries.consumer.adBase":600}'처럼 데이터 값을 이 실행에서만 바꿉니다. 배열은 id로 찾습니다
if (process.env.OVR) {
  for (const [path, v] of Object.entries(JSON.parse(process.env.OVR) as Record<string, unknown>)) {
    const keys = path.split('.');
    let o: unknown = DATA;
    for (const k of keys.slice(0, -1)) o = Array.isArray(o) ? o.find((x: { id?: string }) => x.id === k) : (o as Record<string, unknown>)[k];
    (o as Record<string, unknown>)[keys[keys.length - 1]] = v;
  }
}
const runs = Number(process.argv[2] ?? 3);
const seed0 = Number(process.argv[3] ?? 1);
const verbose = process.argv.includes('-v');
const oneCompany = process.argv.includes('--one');
// STRAT=novice: 보통 플레이어 흉내 — 5일마다 들여다보고, 런웨이를 덜 따지고 뽑고, 광고는 LTV·CAC 대신 고정 예산, 버그는 늦게 잡고, 결정은 절반만 직접 고름
const NOVICE = process.env.STRAT === 'novice';

const CAT_PRI: Record<string, number> = { core: 0, growth: 2, monetize: 2, retention: 3, infra: 4, enterprise: 3, global: 5, ai: 4, platform: 6 };

function planRoadmap(s: GameState) {
  while (s.product.roadmap.length < 4) {
    const av = availableFeatures(s);
    if (!av.length) return;
    av.sort((a, b) => {
      // 결제 기능(A-111)은 MVP 바로 다음: 이게 없으면 매출이 0
      const pa = CAT_PRI[a.cat] + (a.fx.billing ? -1.5 : 0) + (a.cat === 'infra' && s.product.bugs > 25 ? -3 : 0) + (a.dev + a.design) / 400 + (s.product.features[a.id] ?? 0) * 1.5;
      const pb = CAT_PRI[b.cat] + (b.fx.billing ? -1.5 : 0) + (b.cat === 'infra' && s.product.bugs > 25 ? -3 : 0) + (b.dev + b.design) / 400 + (s.product.features[b.id] ?? 0) * 1.5;
      return pa - pb;
    });
    if (addToRoadmap(s, av[0].id)) return;
  }
}

// 매출과 자금 여유에 맞춘 목표 인원(유능한 플레이어 흉내)
function targetHeadcount(s: GameState): Partial<Record<DeptId, number>> {
  const st = s.company.stage;
  const rev = lastRevenue(s);
  const burn = Math.max(1, monthlyBurn(s));
  const cushion = s.cash / burn; // 개월
  // 인원 계획은 지금 시장 월급으로(연도에 따라 오름). 예전 상수 600만원은 2050년대에 실제의 절반 아래라 과채용으로 파산했음
  const pay = marketSalary(s, 'dev', 'B') * 1.2;
  const total = Math.floor(3 + rev / (pay * 2) + (cushion > 18 ? Math.min(60, s.cash / (pay * 24)) : 0));
  if (st === 0) return { dev: Math.min(2, total) };
  const n = Math.max(3, total);
  const share = (f: number) => Math.max(1, Math.round(n * f));
  const out: Partial<Record<DeptId, number>> = { dev: share(0.4), design: share(0.1), sales: share(0.15), marketing: share(0.1) };
  if (st >= 2) Object.assign(out, { hr: n >= 12 ? share(0.04) : 0, cs: share(0.1) });
  if (st >= 3) Object.assign(out, { infra: share(0.05), finlegal: Math.max(1, share(0.03)), ai: share(0.05) });
  return out;
}

function monthlyBurn(s: GameState): number {
  const h = s.plHistory.slice(-3);
  const net = h.length ? h.reduce((a, m) => a + m.netIncome + m.other, 0) / h.length : -projectedMonthlyPayroll(s);
  return Math.max(0, -net);
}

function hireStep(s: GameState) {
  const tgt = targetHeadcount(s);
  let burn = monthlyBurn(s) + s.pendingHires.reduce((a, h) => a + h.salary * 1.2, 0);
  for (const [d, n] of Object.entries(tgt) as [DeptId, number][]) {
    const have = s.employees.filter((e) => e.dept === d).length + s.pendingHires.filter((h) => h.dept === d).length;
    if (have >= n || seatsAvailable(s) === 0) continue;
    if (s.company.stage < DATA.depts.departments.find((x) => x.id === d)!.stage) continue;
    const open = s.postings.find((p) => p.dept === d && p.status === 'open');
    if (!open) createPosting(s, { dept: d, headcount: Math.min(4, n - have), salaryLevel: 'normal', durationDays: 14, promo: s.cash > 3e8 ? 'normal' : 'none' });
    const apps = s.applicants.filter((a) => a.status === 'waiting' && a.dept === d).sort((a, b) => 'SABC'.indexOf(a.grade) - 'SABC'.indexOf(b.grade));
    for (const a of apps.slice(0, Math.max(0, n - have))) {
      if (a.grade === 'C' && s.company.stage >= 2) continue;
      // 신중한 채용: 이 사람까지 더해도 런웨이 12개월 이상
      // 빌린 돈(A-137)은 여유 자금이 아님: 전략 봇은 남은 빚을 빼고 셈
      const free = NOVICE ? s.cash : s.cash - debtBalance(s);
      if (free / (burn + a.desiredSalary * 1.2) < (NOVICE ? 5 : 12)) return;
      if (offerJob(s, a.id, false).ok) burn += a.desiredSalary * 1.2;
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
  const need = rw !== null && rw < 12;
  const growthReady = (st === 'seed' && hasMvp(s)) || (stageIndex(st) >= stageIndex('A') && lastRevenue(s) >= ((DATA.funding.stages.find((x) => x.id === st) as { needRevenue?: number }).needRevenue ?? 0));
  const early = stageIndex(st) <= stageIndex('preseed') && s.day - s.company.startDay < 400;
  if ((need || growthReady || early) && (s.lastRoundDay === null || s.day - s.lastRoundDay >= 120)) {
    const room = stageIndex(st) <= 2 ? 0.12 : 0.15;
    startRound(s, st, room, stageIndex(st) <= 1 ? 'safe' : 'equity');
  }
}

function opsStep(s: GameState) {
  // 지시
  if (s.product.bugs > (NOVICE ? 60 : 35)) setOrder(s, 'dev', 'dev_stabilize');
  else if (s.product.bugs < (NOVICE ? 25 : 15)) setOrder(s, 'dev', 'dev_build');
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
      const b = NOVICE ? (rw !== null && rw < 3 ? 0 : Math.min(1e7, s.cash / 20)) : rw !== null && rw < 6 ? 0 : good ? Math.min(s.cash / 18, Math.max(3e6, rev * 0.5)) : Math.min(rev * 0.08, s.cash / 30);
      setAdBudget(s, m, m === 'kr' ? b : b * 0.5);
      // 광고 캠페인(A-116): 출시 기념 한 번(돈이 넉넉할 때), 광고가 지치면 새 소재로
      if (!NOVICE && !campaignBlock(s, 'launch', m) && s.cash > campaignCost(s, campaignDef('launch')!, m) * 6) startCampaign(s, 'launch', m, audience(s) === 'b2b' ? 'feature' : 'story');
      const fat = Object.values(s.markets[m].adFatigue ?? {});
      if (!NOVICE && fat.length && Math.max(...fat.map((x) => x ?? 0)) > 0.5 && !campaignBlock(s, 'refresh', m)) startCampaign(s, 'refresh', m, 'feature');
    }
  }
  // 해외 진출
  for (const m of ['jp', 'sea', 'us', 'eu'] as const) if (!launchBlock(s, m) && s.cash > DATA.markets.markets.find((x) => x.id === m)!.entry * 4) launchMarket(s, m);
  // 사무실
  const full = seatsAvailable(s) <= 1;
  if (full && s.company.officeTier < 5) {
    const t = s.company.officeTier + 1;
    const dep = DATA.offices.tiers.find((x) => x.id === t)!.deposit;
    if (!moveBlock(s, t) && s.cash > dep * 3 + 2e8) moveOffice(s, t);
  }
  // 가구: 자금의 5% 안쪽이면 놓을 수 있는 가구를 삽니다
  for (const it of furnitureItems()) if (!buyFurnitureBlock(s, it.id) && it.price * 20 < s.cash) buyFurniture(s, it.id);
  // 복지
  const wf: [number, string][] = [[4, 'meal'], [8, 'gym'], [14, 'medical'], [20, 'flex'], [30, 'gear'], [60, 'edu']];
  for (const [n, id] of wf) if (s.employees.length >= n && !s.company.welfare.includes(id) && (runwayMonths(s) ?? 99) > 8) s.company.welfare.push(id);
  // AI
  const latest = latestModels(s).find((m) => m.vendor === 'neural');
  if (!NOVICE && latest && s.company.stage >= 1 && s.ai.modelId !== latest.id) {
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
    // 외주(A-79): 돈이 빠듯하면 가장 짧은 일감을 받아 2칸을 씁니다.
    const ct = s.contracts;
    if (ct && !ct.active && ct.offers.length && s.cash < 25000000) acceptContract(s, [...ct.offers].sort((a, b) => a.work - b.work)[0].id);
    // 실무 모드(A-101): 기본 업무 하나 + 초대받은 외출(투자 미팅·네트워킹·고객사 방문)은 겹치지 않고 돈이 되면 수락
    // 결제 기능(A-111)이 없으면 영업해 봐야 매출이 없으므로, 개발자가 없을 땐 결제까지 대표가 직접 만듭니다(유능한 플레이어)
    const devNeeded = !hasMvp(s) || (!NOVICE && !canCharge(s) && !s.employees.some((e) => e.dept === 'dev'));
    setCeoWork(s, s.contracts?.active && s.cash < 25000000 ? 'contract' : devNeeded ? 'dev' : 'sales');
    for (const o of outings(s).filter((x) => x.status === 'offer')) if (o.cost * 20 < s.cash) acceptOuting(s, o.id);
  } else {
    // 경영 모드(A-101): 결재가 밀리면 결재, 아니면 대기업 영업. 외출 초대는 실무 모드와 같이 수락
    setCeoWork(s, s.company.approveBalance < 0 ? 'approve' : 'enterprise');
    for (const o of outings(s).filter((x) => x.status === 'offer')) if (o.cost * 20 < s.cash) acceptOuting(s, o.id);
  }
  // ESOP
  if (!NOVICE && s.company.stage >= 2 && !s.flags.includes('esop') && s.fundingStage && stageIndex(s.fundingStage) >= stageIndex('A')) createEsop(s, 0.08);
  // M&A
  if (s.company.stage >= 4) for (const c of s.competitors) if (c.alive && !acquireBlock(s, c) && s.cash > 5e10) acquire(s, c.id);
}

function decide(s: GameState) {
  for (const d of s.decisions) {
    if (d.resolved) continue;
    const opts = d.choices.map((c, i) => ({ c, i })).filter((x) => x.c.enabled);
    if (!opts.length) continue;
    if (NOVICE && (d.id.charCodeAt(d.id.length - 1) % 2 === 0) && s.day < d.deadline) continue; // 절반은 기한까지 두어 기본 선택
    // 대출 제안(A-137): 정책자금이 붙을 만하면 정책자금, 곧 바닥이면 은행, 아니면 빚 없이
    if (!NOVICE && d.eventId === LOAN_EVENT) {
      const rw = runwayMonths(s) ?? 99;
      const pol = d.choices.findIndex((c) => c.label.startsWith('정책자금') && c.enabled);
      const bank = d.choices.findIndex((c) => c.label.startsWith('은행') && c.enabled);
      const pick = rw < 1.5 && bank >= 0 ? bank : pol >= 0 && policyApproval(s).p >= 0.5 ? pol : bank >= 0 && rw < 2.5 ? bank : d.choices.length - 1;
      resolveDecision(s, d.id, pick);
      continue;
    }
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
    // 가이던스(A-142): 분기마다 한 번, 지난 두 분기 성장에 맞춰 지킬 수 있는 만큼(전략 봇만, 보통 봇은 자동 '보통')
    if (!NOVICE && p.lastQuarter && guidanceSet.get(s.company.name) !== p.lastQuarter.label) {
      guidanceSet.set(s.company.name, p.lastQuarter.label);
      const h = s.plHistory.slice(-6);
      const q1 = h.slice(0, 3).reduce((a, m) => a + m.revenue, 0);
      const q2 = h.slice(3).reduce((a, m) => a + m.revenue, 0);
      const g = q1 > 0 ? q2 / q1 - 1 : 0;
      setGuidance(s, g >= 0.2 ? 'bold' : g >= 0.1 ? 'normal' : 'safe');
    }
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

const dumped = new Set<string>();

function playCompany(s: GameState, log: (m: string) => void) {
  const start = s.day;
  const ms: Milestones = { mvp: null, rev1: null, staff5: null, seed: null, A: null, B: null, C: null, stage3: null, stage4: null, ipo: null };
  let guard = 0;
  const meter = new Meter(s);
  while (!s.ended && guard++ < 365 * 40) {
    s.pauseReason = null;
    const look = !NOVICE || s.day % 5 === 0;
    if (look) planRoadmap(s);
    if (look && s.day % 2 === 0) hireStep(s);
    if (look) fundStep(s);
    if (s.day % 7 === 0) opsStep(s);
    decide(s);
    exitStep(s, log);
    if (s.ended) break;
    if (process.argv.includes('--rounds')) for (const r of s.rounds) {
      const key = r.id + r.status + (r.leadId ?? '');
      if (!dumped.has(key)) {
        dumped.add(key);
        const ps = Object.entries(r.letters).map(([k, l]) => `${k}:${l.interest.toFixed(0)}${l.decision ? '/' + l.decision : ''}${l.decisionP !== null ? '(' + (l.decisionP * 100).toFixed(0) + '%)' : ''}`).join(' ');
        log(`   라운드 ${formatDate(s.day)} ${r.stage} ${r.status} 리드 ${r.leadId ?? '-'} 프리 ${(r.preValue / 1e8).toFixed(1)}억 | ${ps}`);
      }
    }
    runDay(s);
    meter.day(s);
    // --nan: 기업가치·주식 수가 처음 NaN이 되는 날을 남깁니다(계산 버그 찾기)
    if (process.argv.includes('--nan') && !dumped.has('nv') && (Number.isNaN(computeValuation(s).value) || s.capTable.some((c) => Number.isNaN(c.shares)))) { dumped.add('nv'); const cv = computeValuation(s); log(`   NV ${formatDate(s.day)} cash=${s.cash} b=${cv.business} loans=${JSON.stringify(s.loans)} cap=${JSON.stringify(s.capTable.slice(-3))} ledger=${JSON.stringify(s.ledger.slice(-4))}`); }
    s.events.length = 0;
    const d = s.day - start;
    if (ms.mvp === null && hasMvp(s)) ms.mvp = d;
    if (ms.rev1 === null && lastRevenue(s) > 0) ms.rev1 = d;
    if (ms.staff5 === null && s.employees.length >= 5) ms.staff5 = d;
    for (const k of ['seed', 'A', 'B', 'C'] as StageId[]) if (ms[k] === null && stageIndex(s.fundingStage) >= stageIndex(k)) ms[k] = d;
    if (ms.stage3 === null && s.company.stage >= 3) ms.stage3 = d;
    if (ms.stage4 === null && s.company.stage >= 4) ms.stage4 = d;
    if (ms.ipo === null && s.public) ms.ipo = d;
    const dumpDir = process.argv.find((a) => a.startsWith('--dump='))?.slice(7);
    if (dumpDir) {
      const key = `stage${s.company.stage}`;
      if (!dumped.has(key)) {
        dumped.add(key);
        fs.mkdirSync(dumpDir, { recursive: true });
        fs.writeFileSync(`${dumpDir}/${s.company.industry}-${key}.json`, JSON.stringify({ ...s, events: [], speed: 1, pauseReason: '저장한 회사를 불러왔습니다' }));
      }
    }
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
  return { ms, days: s.day - start, m: meter.result() };
}

const INDS: IndustryId[] = (process.env.IND ? [process.env.IND] : ["saas", "consumer", "commerce"]) as IndustryId[];
const out: string[] = [];
const allM: { m: CompanyMetrics; kind: string; maxVal: number; ind: string; ms: Record<string, number | null> }[] = [];
for (let r = 0; r < runs; r++) {
  const seed = seed0 + r;
  const profile = emptyProfile();
  const picks = defaultPicks();
  picks.career = 'car_startup';
  picks.edu = 'edu_univ';
  const base: SetupChoices = { picks, cofounderId: null, cofounderEquity: 0, engineerId: null, companyName: '봇컴퍼니', wantsAngel: false, seed, industry: INDS[r % INDS.length] };
  const s = newCareer(base, profile);
  const log = (m: string) => out.push(m);
  let k = 0;
  let decisions = 0;
  while (!s.career.retired) {
    k++;
    const t0 = s.day;
    log(`[판 ${r + 1} 회사 ${k}] ${s.company.industry} 시작 ${formatDate(s.day)} 나이 ${founderAge(s).toFixed(1)}`);
    const { ms, days, m } = playCompany(s, log);
    decisions += s.company.decisions;
    const res = s.result!;
    allM.push({ m, kind: res.kind, maxVal: res.maxValuation, ind: s.company.industry, ms });
    log(`  끝: ${res.kind} ${formatDate(s.day)} (${(days / 365).toFixed(1)}년) 창업자 몫 ${(res.amount / 1e8).toFixed(1)}억 최대가치 ${(res.maxValuation / 1e8).toFixed(0)}억 최대고객 ${Math.round(res.peakUsers)} 최대직원 ${res.peakEmployees} 결정 ${s.company.decisions} 출시 ${s.product.shipped.length} 장애 ${s.stats.outages} 퇴사 ${s.stats.quits} 외주 ${s.contracts?.completed ?? 0}`);
    log(`  마일스톤(일): ${Object.entries(ms).map(([a, b]) => `${a}=${b ?? '-'}`).join(' ')}`);
    void t0;
    if (oneCompany || founderAge(s) >= 63 || k >= 8) {
      retire(s);
      break;
    }
    nextCompany(s, { ...base, picks: ownedSpecs(s) ?? picks, companyName: `봇컴퍼니${k + 1}`, industry: INDS[(r + k) % INDS.length], invest: s.career.wealth * 0.2 });
  }
  const years = yearFrac(s.day) - s.career.startYear;
  log(`[판 ${r + 1}] 은퇴 나이 ${founderAge(s).toFixed(1)} 회사 ${s.career.companies.length} 자산 ${(s.career.wealth / 1e8).toFixed(1)}억 명성 ${s.career.rep.toFixed(0)} 엔딩 ${endingFor(s).name} 업적 ${s.career.achievements.length} 결정 ${decisions} 게임 ${years.toFixed(1)}년 = 1배속 ${((years * 365 * DATA.time.dayMs) / 3600000).toFixed(1)}시간`);
  void featuresOf;
}
out.push(...summarize(allM));
console.log(out.join('\n'));
