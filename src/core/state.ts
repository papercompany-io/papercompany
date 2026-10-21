// F02 창업 셋업 결과로 새 게임 상태를 만듭니다(FS-01, TM-01, TM-02, CO-01, CO-02, EQ-01).
import { DATA, dept } from './data';
import { buildSeats } from './employees';
import { INITIAL_SHARES, recordEquity } from './equity';
import { book, newAccrual } from './finance';
import { createWorkspace, onEmployeeJoined } from './messenger';
import { updateStoredValuation } from './valuation';
import type { ActionId, Employee, GameState, Grade } from './types';

export interface SetupChoices {
  picks: Record<string, string>; // 범주 id → 항목 id
  cofounderId: string | null;
  cofounderEquity: number; // 0~1
  engineerId: string | null;
  companyName: string;
  wantsAngel: boolean;
  seed: number;
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

// CO-01 이름 규칙 [Claude 제안] 2~20자
export function validateCompanyName(name: string): string | null {
  const n = name.trim();
  if (n.length < 2) return '회사 이름은 2자 이상이어야 합니다.';
  if (n.length > 20) return '회사 이름은 20자 이하여야 합니다.';
  return null;
}

export function newGame(c: SetupChoices): GameState {
  const startCash = DATA.finance.startCash;
  const s: GameState = {
    version: 1,
    seed: c.seed,
    rng: c.seed,
    idSeq: 0,
    day: 0,
    msInDay: 0,
    slotsDone: 0,
    speed: 1,
    pauseReason: null,
    ended: false,
    company: { name: c.companyName.trim() },
    founder: { picks: { ...c.picks }, creditsLeft: DATA.specs.budget - specTotal(c.picks) },
    wantsAngelOnStart: c.wantsAngel,
    cash: 0,
    ledger: [],
    accrual: newAccrual(0, 0),
    plHistory: [],
    productPoints: 0,
    customers: 0,
    irPoints: 0,
    networkPoints: 0,
    ceoAlloc: { ...(DATA.ceo.defaultAlloc as Record<ActionId, number>) },
    todayLog: { dev: 0, sales: 0, ir: 0, network: 0 },
    valuation: { stored: 0, storedDay: 0, penaltyUntil: null, revenueStage: false },
    fundingStage: null,
    lastRoundDay: null,
    rounds: [],
    capTable: [],
    equityHistory: [],
    employees: [],
    pendingHires: [],
    seats: buildSeats(),
    postings: [],
    applicants: [],
    instructions: [],
    channels: [],
    exitAttempt: null,
    exitCooldownUntil: null,
    result: null,
    events: [],
  };
  book(s, '창업 자본금', startCash);
  s.accrual = newAccrual(0, s.cash);
  createWorkspace(s);

  // EQ-01 창업 지분
  const coShares = c.cofounderId ? Math.round(INITIAL_SHARES * c.cofounderEquity) : 0;
  s.capTable.push({ holderId: 'founder', name: '창업자(나)', kind: 'founder', shares: INITIAL_SHARES - coShares });

  if (c.cofounderId) {
    const cand = DATA.candidates.cofounders.find((x) => x.id === c.cofounderId)!;
    s.capTable.push({ holderId: 'cofounder', name: `코파운더 ${cand.name}`, kind: 'cofounder', shares: coShares });
    const e = makeEmployee(s, cand.name, cand.dept as Employee['dept'], cand.grade as Grade, cand.salary, 'cofounder', 'exec');
    e.years = 7;
  }
  if (c.engineerId) {
    const cand = DATA.candidates.engineers.find((x) => x.id === c.engineerId)!;
    const seat = s.seats.find((x) => x.zone === 'dev' && x.occupant === null)!;
    const e = makeEmployee(s, cand.name, 'dev', cand.grade as Grade, cand.salary, 'engineer', seat.id);
    e.years = 5;
  }
  recordEquity(s, '창업');
  updateStoredValuation(s);
  return s;
}

function makeEmployee(s: GameState, name: string, d: Employee['dept'], grade: Grade, salary: number, kind: Employee['kind'], seatId: string): Employee {
  s.idSeq += 1;
  const e: Employee = {
    id: `e${s.idSeq}`,
    name,
    dept: d,
    roleDept: d,
    salary,
    grade,
    years: 0,
    joinedDay: 0,
    seatId,
    kind,
    instructionId: null,
    lastResult: null,
  };
  s.employees.push(e);
  const seat = s.seats.find((x) => x.id === seatId);
  if (seat) seat.occupant = e.id;
  onEmployeeJoined(s, e);
  void dept(d);
  return e;
}
