// 게임 상태 타입. 모든 값은 JSON으로 저장 가능해야 합니다(DT-07).

export type DeptId = 'dev' | 'design' | 'sales' | 'marketing' | 'hr';
export type ActionId = 'dev' | 'sales' | 'ir' | 'network';
export type Grade = 'S' | 'A' | 'B' | 'C';
export type StageId = 'angel' | 'preseed' | 'seed' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export interface Employee {
  id: string;
  name: string;
  dept: DeptId; // EM-02 소속 부서(직군과 같게 시작)
  roleDept: DeptId; // 직군
  salary: number; // 월 원
  grade: Grade;
  years: number;
  joinedDay: number;
  seatId: string | null;
  kind: 'cofounder' | 'engineer' | 'staff';
  instructionId: string | null; // MG-03 맡은 지시
  lastResult: string | null;
}

export interface Seat {
  id: string;
  zone: DeptId | 'exec' | 'ceo';
  gx: number;
  gy: number;
  occupant: string | null; // 직원 id, 대표석은 'ceo'
}

export interface Posting {
  id: string;
  dept: DeptId;
  headcount: number;
  salaryLevel: string;
  durationDays: number;
  promo: string;
  startDay: number;
  endDay: number;
  status: 'open' | 'closed';
  hired: number;
}

export interface Applicant {
  id: string;
  postingId: string;
  name: string;
  dept: DeptId;
  years: number;
  desiredSalary: number;
  grade: Grade;
  arrivedDay: number;
  leaveDay: number;
  status: 'waiting' | 'hired' | 'rejected' | 'left';
}

export interface PendingHire {
  applicantId: string;
  name: string;
  dept: DeptId;
  grade: Grade;
  years: number;
  salary: number;
  startDay: number;
}

export interface Instruction {
  id: string;
  dept: DeptId;
  optionId: string;
  startDay: number;
  endDay: number;
  assigneeIds: string[];
  status: 'running' | 'done';
  p: number; // MG-04 성공 확률
  result: 'full' | 'partial' | 'fail' | null;
  effectValue: number | null;
}

export interface Message {
  id: string;
  day: number;
  from: string;
  text: string;
  kind: 'system' | 'player' | 'npc';
}

export interface Channel {
  id: string;
  kind: 'all' | 'team' | 'group' | 'dm' | 'external';
  name: string;
  dept?: DeptId;
  memberIds: string[]; // 직원 id (외부 연락처면 투자사 id 하나)
  messages: Message[];
}

export interface LetterThread {
  investorId: string;
  interest: number;
  sent: string[]; // 보낸 레터 선택지 id
  valuationAsk: string | null;
  decision: 'committed' | 'declined' | null;
  decisionP: number | null;
  coInvest: 'joined' | 'declined' | null;
  coInvestP: number | null;
  pendingReplies: { day: number; text: string }[];
}

export interface Round {
  id: string;
  stage: StageId;
  room: number; // 0~1, FR-11
  openedDay: number;
  endDay: number;
  preValue: number; // 라운드를 열 때 VL-01 산정값
  status: 'open' | 'offer' | 'accepted' | 'rejected' | 'failed';
  leadId: string | null;
  letters: Record<string, LetterThread>;
  offer: Offer | null;
  closedDay: number | null;
}

export interface Offer {
  preValue: number; // 협상 반영 프리밸류
  postValue: number;
  room: number;
  amount: number; // 투자금 = 포스트밸류 × 룸
  shares: { investorId: string; name: string; newShares: number; pct: number; amount: number }[];
  newShares: number;
  founderBefore: number;
  founderAfter: number;
}

export interface CapEntry {
  holderId: string; // 'founder' | 'cofounder' | 투자사 id + 라운드
  name: string;
  kind: 'founder' | 'cofounder' | 'investor';
  shares: number; // 주식 수(EQ-02 신주 발행으로 희석)
  round?: string;
}

export interface EquityEvent {
  day: number;
  label: string;
  founderPct: number;
  totalShares: number;
  table: CapEntry[];
}

export interface MonthPL {
  month: string; // YYYY-MM
  revenue: number;
  vat: number;
  salary: number;
  insurance: number;
  pension: number;
  entertainment: number;
  recruiting: number;
  ads: number;
  opex: number;
  operatingProfit: number;
  tax: number;
  netIncome: number;
  cashBefore: number;
  cashAfter: number;
  investment: number;
  customersEnd: number;
}

export interface MonthAccrual {
  month: string;
  customerDays: number; // 날마다 유료 고객 수를 더한 값(매출 = 고객일 × 단가 ÷ 그 달 일수)
  salaryUnits: number; // 날마다 월급 합계를 더한 값(인건비 = 합 ÷ 그 달 일수)
  entertainment: number;
  recruiting: number;
  ads: number;
  investment: number;
  cashStart: number;
}

export interface LedgerEntry {
  day: number;
  item: string;
  amount: number; // +유입 / -유출
  balance: number;
}

export interface ExitAttempt {
  method: 'sale' | 'ipo';
  startedDay: number;
  readyDay: number; // IPO 준비 끝나는 날(매각은 시작일)
  price: number | null; // 매각 제안가 또는 공모 가치
  valuationAtStart: number;
  p: number | null;
  status: 'preparing' | 'offer' | 'success' | 'failed' | 'declined';
}

export interface GameResult {
  kind: 'exit' | 'bankrupt';
  method?: 'sale' | 'ipo';
  exitValue: number;
  valuation: number;
  founderPct: number;
  amount: number; // SC-01 결과 금액
  day: number;
  reason?: string;
}

export interface GameState {
  version: 1;
  seed: number;
  rng: number; // PRNG 내부 상태
  idSeq: number;
  day: number; // 시작일(0)부터 지난 날 수
  msInDay: number; // 오늘 진행한 시간(1x 기준 ms)
  slotsDone: number; // 오늘 실행한 행동 칸 수
  speed: number; // 0 = 일시정지
  pauseReason: string | null;
  ended: boolean;
  company: { name: string };
  founder: { picks: Record<string, string>; creditsLeft: number };
  wantsAngelOnStart: boolean; // CO-02
  cash: number;
  ledger: LedgerEntry[];
  accrual: MonthAccrual;
  plHistory: MonthPL[];
  productPoints: number;
  customers: number;
  irPoints: number;
  networkPoints: number;
  ceoAlloc: Record<ActionId, number>;
  todayLog: Record<ActionId, number>; // 오늘 실행한 행동 칸
  valuation: { stored: number; storedDay: number; penaltyUntil: number | null };
  fundingStage: StageId | null;
  lastRoundDay: number | null;
  rounds: Round[];
  capTable: CapEntry[];
  equityHistory: EquityEvent[];
  employees: Employee[];
  pendingHires: PendingHire[];
  seats: Seat[];
  postings: Posting[];
  applicants: Applicant[];
  instructions: Instruction[];
  channels: Channel[];
  exitAttempt: ExitAttempt | null;
  exitCooldownUntil: number | null;
  result: GameResult | null;
  events: GameEvent[]; // UI가 소비하는 일회성 이벤트
}

export type GameEvent =
  | { type: 'autosave'; reason: string }
  | { type: 'offerReady'; roundId: string }
  | { type: 'roundFailed'; roundId: string }
  | { type: 'exitResult'; success: boolean }
  | { type: 'saleOffer' }
  | { type: 'bankrupt' }
  | { type: 'monthClosed'; month: string };
