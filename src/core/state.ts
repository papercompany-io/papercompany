// F02 창업 셋업(FS-01, TM-01, TM-02, CO-01, CO-02, EQ-01)으로 새 커리어·새 회사를 만듭니다.
// 커리어의 두 번째 회사부터는 같은 상태에서 회사 부분만 새로 만들고, 날짜·명성·자산·업적은 이어집니다.
import { DATA, dept, industry } from './data';
import { dayOfYear } from './calendar';
import { seedCompetitors } from './competitors';
import { startPhase } from './economy';
import { INITIAL_SHARES, recordEquity } from './equity';
import { book, newAccrual } from './finance';
import { createWorkspace, onEmployeeJoined } from './messenger';
import { legacyFx } from './career';
import { buildSeats } from './office';
import { rollTraits } from './hiring';
import { startSkill } from './staff';
import { updateStoredValuation } from './valuation';
import type { ActionId, Career, Company, DeptId, Employee, GameState, Grade, IndustryId, MarketId, MarketState, Profile } from './types';

export interface SetupChoices {
  picks: Record<string, string>;
  cofounderId: string | null;
  cofounderEquity: number;
  engineerId: string | null;
  companyName: string;
  wantsAngel: boolean;
  seed: number;
  industry: IndustryId;
  founderName?: string;
  challenge?: string | null;
  invest?: number; // 개인 자산에서 넣는 돈(두 번째 회사부터)
}

export function specBudget(legacy: Record<string, number>): number {
  return DATA.specs.budget + (legacy.spec ?? 0) * 100;
}

export function specTotal(picks: Record<string, string>): number {
  let sum = 0;
  for (const c of DATA.specs.categories) {
    const it = c.items.find((i) => i.id === picks[c.id]);
    if (it) sum += it.price;
  }
  return sum;
}

export function defaultPicks(): Record<string, string> {
  return Object.fromEntries(DATA.specs.categories.map((c) => [c.id, c.items[0].id]));
}

export function validateCompanyName(name: string): string | null {
  const n = name.trim();
  if (n.length < 2) return '회사 이름은 2자 이상이어야 합니다.';
  if (n.length > 20) return '회사 이름은 20자 이하여야 합니다.';
  return null;
}

function emptyMarkets(): Record<MarketId, MarketState> {
  const m = {} as Record<MarketId, MarketState>;
  for (const id of DATA.markets.markets.map((x) => x.id as MarketId)) m[id] = { launched: false, launchedDay: null, users: 0, awareness: 0, adBudget: 0, peakShare: 0 };
  return m;
}

function newCompanyRecord(name: string, ind: IndustryId, day: number): Company {
  return {
    name: name.trim(),
    industry: ind,
    startDay: day,
    stage: 0,
    officeTier: 1,
    movingUntil: null,
    workPolicy: 'normal',
    welfare: [],
    orders: { ...(DATA.orders.defaults as Record<DeptId, string>) },
    autoHire: {},
    autoHireLevel: 'normal',
    ceoMode: 'founder',
    cofounderName: null,
    peakUsers: 0,
    peakEmployees: 0,
    maxValuation: 0,
    profitStreak: 0,
    enterpriseCount: 0,
    acquisitions: 0,
    decisions: 0,
    ipoReady: 0,
    board: 0,
    approveBalance: 0,
    missionsDone: [],
    raiseRate: 0.03,
    culture: 0,
  };
}

export function newCareer(c: SetupChoices, profile: Profile): GameState {
  const late = c.challenge === 'late';
  const startYear = late ? 2035 : DATA.career.startYear;
  const career: Career = {
    founderName: (c.founderName ?? '').trim() || '나',
    startYear,
    startAge: late ? 38 : DATA.career.startAge,
    wealth: 0,
    rep: DATA.career.repStart,
    legacyEarned: 0,
    companies: [],
    challenge: c.challenge ?? null,
    retired: false,
    endingId: null,
    investedInCompany: 0,
    legacy: { ...profile.legacy },
    achievements: [...profile.achievements],
    missionsTotal: 0,
    decisionsBefore: 0,
  };
  const day = dayOfYear(startYear);
  const s = {
    version: 2,
    seed: c.seed,
    rng: c.seed,
    idSeq: 0,
    day,
    msInDay: 0,
    slotsDone: 0,
    speed: 1,
    pauseReason: null,
    ended: false,
    career,
    economy: { phase: 'normal', until: day + 600, level: 1 },
    news: [],
    stats: { outages: 0, slops: 0, quits: 0, hires: 0, fired: 0 },
  } as unknown as GameState;
  if (c.challenge === 'recession') startPhase(s, 'recession', 24);
  setupCompany(s, c);
  return s;
}

// 다음 회사: 같은 커리어에서 쉬는 기간 뒤에 시작
export function nextCompany(s: GameState, c: SetupChoices): string | null {
  if (!s.ended) return '지금 회사가 아직 끝나지 않았습니다.';
  const invest = Math.max(0, Math.min(c.invest ?? 0, s.career.wealth * DATA.career.maxInvestShare, DATA.career.maxInvest));
  s.career.decisionsBefore += s.company.decisions;
  s.career.wealth -= invest;
  s.day += DATA.career.breakDays;
  s.ended = false;
  s.result = null;
  s.speed = 1;
  s.pauseReason = null;
  setupCompany(s, { ...c, invest });
  return null;
}

function setupCompany(s: GameState, c: SetupChoices) {
  const ind = industry(c.industry);
  const legacy = s.career.legacy;
  const specLeft = specBudget(legacy) - specTotal(c.picks);
  const solo = s.career.challenge === 'solo';
  Object.assign(s, {
    msInDay: 0,
    slotsDone: 0,
    company: newCompanyRecord(c.companyName, ind.id, s.day),
    founder: { picks: { ...c.picks }, creditsLeft: specLeft },
    wantsAngelOnStart: c.wantsAngel,
    cash: 0,
    ledger: [],
    accrual: newAccrual(s.day, 0),
    plHistory: [],
    product: { features: {}, roadmap: [], bugs: 0, debt: 0, polish: 0, appealBonus: 0, priceTier: 'standard', launchedDay: null, shipped: [] },
    markets: emptyMarkets(),
    competitors: [],
    enterprise: [],
    entPipeline: 0,
    irPoints: 0,
    networkPoints: legacyFx(s, 'network'),
    ceoAlloc: { ...(DATA.ceo.defaultAlloc as Record<ActionId, number>) },
    todayLog: { dev: 0, sales: 0, ir: 0, network: 0, enterprise: 0, approve: 0 },
    valuation: { stored: 0, storedDay: s.day, penaltyUntil: null, revenueStage: false },
    fundingStage: null,
    lastRoundDay: null,
    lastPostValue: 0,
    rounds: [],
    safes: [],
    capTable: [],
    equityHistory: [],
    employees: [],
    pendingHires: [],
    seats: buildSeats(DATA.offices.tiers[0]),
    postings: [],
    applicants: [],
    channels: [],
    ai: { modelId: null, adoption: {}, adaptation: 0, realized: 0, switchedDay: null, incidents: 0 },
    modifiers: [],
    flags: [],
    eventSeen: {},
    decisions: [],
    notices: [],
    public: null,
    exitAttempt: null,
    exitCooldownUntil: null,
    result: null,
    events: [],
  } as Partial<GameState>);
  const startCash = DATA.finance.startCash + legacyFx(s, 'startCash') + (c.invest ?? 0);
  book(s, '창업 자본금', DATA.finance.startCash + legacyFx(s, 'startCash'));
  if (c.invest) book(s, '창업자 개인 출자', c.invest);
  s.career.investedInCompany = c.invest ?? 0;
  s.accrual = newAccrual(s.day, startCash);
  createWorkspace(s);
  // 창업자 명성·레거시 → 시작 인지도
  const aw = legacyFx(s, 'awareness') + Math.min(0.05, s.career.rep / 1000);
  s.markets.kr.awareness = aw;
  seedCompetitors(s, s.career.challenge === 'rivals' ? 2 : 0, s.career.challenge === 'rivals' ? 1.3 : 1);

  // EQ-01 창업 지분
  const coShares = c.cofounderId && !solo ? Math.round(INITIAL_SHARES * c.cofounderEquity) : 0;
  s.capTable.push({ holderId: 'founder', name: `창업자(${s.career.founderName})`, kind: 'founder', shares: INITIAL_SHARES - coShares });
  if (c.cofounderId && !solo) {
    const cand = DATA.candidates.cofounders.find((x) => x.id === c.cofounderId)!;
    s.capTable.push({ holderId: 'cofounder', name: `코파운더 ${cand.name}`, kind: 'cofounder', shares: coShares });
    const e = makeEmployee(s, cand.name, cand.dept as DeptId, cand.grade as Grade, cand.salary, 'cofounder', 'exec', 7);
    s.company.cofounderName = e.name;
  }
  if (c.engineerId && !solo) {
    const cand = DATA.candidates.engineers.find((x) => x.id === c.engineerId)!;
    const seat = s.seats.find((x) => x.zone === 'dev' && x.occupant === null)!;
    makeEmployee(s, cand.name, 'dev', cand.grade as Grade, cand.salary, 'engineer', seat.id, 5);
  }
  s.company.peakEmployees = s.employees.length;
  recordEquity(s, '창업');
  updateStoredValuation(s);
}

function makeEmployee(s: GameState, name: string, d: DeptId, grade: Grade, salary: number, kind: Employee['kind'], seatId: string, years: number): Employee {
  s.idSeq += 1;
  const e: Employee = {
    id: `e${s.idSeq}`,
    name,
    dept: d,
    salary,
    grade,
    years,
    joinedDay: s.day,
    seatId,
    kind,
    traits: rollTraits(s).filter((t) => t !== 'hothead'),
    skill: startSkill(s, grade, years),
    sat: 82,
    health: 88,
    lead: false,
    options: 0,
    optionDay: null,
    sickUntil: null,
    leaving: null,
    lastRaiseDay: s.day,
    bubble: null,
  };
  s.employees.push(e);
  const seat = s.seats.find((x) => x.id === seatId);
  if (seat) seat.occupant = e.id;
  onEmployeeJoined(s, e);
  void dept(d);
  return e;
}
