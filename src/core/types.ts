// 게임 상태 타입 v2. 모든 값은 JSON으로 저장 가능해야 합니다(DT-07).
// 한 저장 파일 = 창업자 한 사람의 커리어(여러 회사). 회사가 끝나면 company 부분만 새로 만듭니다.

export type DeptId = 'dev' | 'design' | 'sales' | 'marketing' | 'hr' | 'cs' | 'infra' | 'finlegal' | 'ai';
export type MarketId = 'kr' | 'jp' | 'sea' | 'us' | 'eu';
export type IndustryId = 'saas' | 'consumer' | 'commerce' | 'fintech' | 'ai';
export type ActionId = 'dev' | 'contract' | 'sales' | 'ir' | 'network' | 'enterprise' | 'approve';
export type Grade = 'S' | 'A' | 'B' | 'C';
export type StageId = 'angel' | 'preseed' | 'seed' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
export type PriceTier = 'low' | 'standard' | 'premium';
export type EconomyPhase = 'boom' | 'normal' | 'recession';
export type WorkPolicy = 'relaxed' | 'normal' | 'crunch';

export interface Employee {
  id: string;
  name: string;
  dept: DeptId;
  salary: number; // 월 원
  grade: Grade;
  years: number; // 입사 전 경력
  joinedDay: number;
  seatId: string | null;
  kind: 'cofounder' | 'engineer' | 'staff';
  traits: string[]; // EM-03
  skill: number; // 0~100 숙련
  sat: number; // 0~100 만족도(DEC-022)
  health: number; // 0~100 건강(DEC-022)
  lead: boolean; // 팀장
  options: number; // 받은 스톡옵션 주식 수(EQ-04)
  optionDay: number | null; // 옵션 받은 날(베스팅 기준)
  sickUntil: number | null; // 병가(WF-03)
  leaving: number | null; // 퇴사 예정일
  lastRaiseDay: number;
  bubble: { text: string; until: number } | null; // OF-05 머리 위 말풍선
}

export interface Seat {
  id: string;
  zone: 'desk' | 'exec' | 'ceo' | DeptId; // DeptId는 예전 저장(부서 구역 좌석)에만 있고 불러올 때 책상으로 바뀝니다
  occupant: string | null; // 직원 id, 'ceo', 'pending:지원자id', 'moving:직원id'
  bought?: boolean; // 책상·PC를 샀는지(없으면 예전 저장 = 산 것으로 봄)
  gx?: number; // 책상 위치(타일, A-80)
  gy?: number;
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
  traits: string[];
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
  traits: string[];
  startDay: number;
}

export interface Message {
  id: string;
  day: number;
  from: string;
  text: string;
  kind: 'system' | 'player' | 'npc';
  decisionId?: string; // DC-01 결정 메시지
}

export interface Channel {
  id: string;
  kind: 'all' | 'team' | 'group' | 'dm' | 'external';
  name: string;
  dept?: DeptId;
  memberIds: string[];
  messages: Message[];
  unread: number;
}

export interface LetterThread {
  investorId: string;
  interest: number;
  sent: string[];
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
  room: number;
  instrument: 'equity' | 'safe'; // FR-12
  openedDay: number;
  endDay: number;
  preValue: number;
  status: 'open' | 'offer' | 'accepted' | 'rejected' | 'failed';
  leadId: string | null;
  letters: Record<string, LetterThread>;
  offer: Offer | null;
  closedDay: number | null;
}

export interface Offer {
  preValue: number;
  postValue: number;
  room: number;
  amount: number;
  shares: { investorId: string; name: string; newShares: number; pct: number; amount: number }[];
  newShares: number;
  safeShares: number; // 이번 라운드에서 주식으로 바뀌는 SAFE 몫
  founderBefore: number;
  founderAfter: number;
  down: boolean; // 다운라운드
  instrument: 'equity' | 'safe';
  safeCap: number | null;
}

export interface Safe {
  id: string;
  holders: { investorId: string; name: string; amount: number }[];
  amount: number;
  cap: number; // 밸류 캡(포스트 기준)
  discount: number;
  day: number;
  stage: StageId;
}

export interface CapEntry {
  holderId: string;
  name: string;
  kind: 'founder' | 'cofounder' | 'investor' | 'esop' | 'employee' | 'public';
  shares: number;
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
  month: string;
  revenue: number;
  revSub: number; // 구독·유료
  revAd: number;
  revTake: number;
  revEnt: number; // 대기업 계약
  vat: number;
  salary: number;
  insurance: number;
  pension: number;
  entertainment: number;
  recruiting: number;
  ads: number;
  infra: number;
  rent: number;
  welfare: number;
  ai: number;
  other: number; // 이벤트·기타
  opex: number;
  operatingProfit: number;
  tax: number;
  netIncome: number;
  cashBefore: number;
  cashAfter: number;
  investment: number;
  usersEnd: number;
}

export interface MonthAccrual {
  month: string;
  revSub: number;
  revAd: number;
  revTake: number;
  revEnt: number;
  salaryUnits: number;
  entertainment: number;
  recruiting: number;
  ads: number;
  infra: number;
  welfare: number;
  ai: number;
  other: number;
  investment: number;
  cashStart: number;
  days: number;
}

export interface LedgerEntry {
  day: number;
  item: string;
  amount: number;
  balance: number;
}

export interface ExitAttempt {
  method: 'sale' | 'ipo';
  startedDay: number;
  readyDay: number;
  price: number | null;
  valuationAtStart: number;
  p: number | null;
  status: 'preparing' | 'offer' | 'success' | 'failed' | 'declined';
  inbound: boolean; // EX-05 들어온 오퍼
  buyer: string | null;
  deadline: number | null;
}

export type CompanyEndKind = 'sale' | 'ipo_exit' | 'bankrupt' | 'fired' | 'retired_ceo';

export interface CompanyResult {
  kind: CompanyEndKind;
  companyName: string;
  industry: IndustryId;
  exitValue: number;
  valuation: number;
  founderPct: number;
  amount: number; // 창업자에게 돌아온 돈(SC-01 + 상장 후 매각 대금)
  day: number;
  startDay: number;
  reason?: string;
  path: string; // ED-01 투자형·자력형·혼합형
  funded: boolean;
  maxValuation: number;
  peakUsers: number;
  peakEmployees: number;
  rounds: number;
}

// 제품(PD)
export interface RoadmapItem {
  id: string; // 기능 id
  level: number; // 만드는 레벨(1부터)
  devDone: number;
  designDone: number;
}

export interface Product {
  features: Record<string, number>; // 기능 id → 완성 레벨
  roadmap: RoadmapItem[];
  bugs: number; // 0~100
  debt: number; // 기술 부채 0~1(버그 발생 배율)
  polish: number; // 0~0.4 UX 완성도
  appealBonus: number; // 이벤트 영구 매력도
  priceTier: PriceTier;
  launchedDay: number | null; // MVP 출시일
  shipped: { id: string; level: number; day: number; result: 'full' | 'partial' | 'fail' }[];
}

export interface MarketState {
  launched: boolean;
  launchedDay: number | null;
  users: number;
  awareness: number; // 0~1
  adBudget: number; // 월 광고 예산(원)
  peakShare: number;
  // 성장 분석(시장 메뉴): 최근 약 2주 평균 하루 획득·이탈과 점유율 상한(저장에 없을 수 있음)
  flow?: { target: number; inbound: number; viral: number; sales: number; paid: number; lost: number };
}

export interface Competitor {
  id: string;
  name: string;
  appeal: number;
  awareness: number;
  markets: MarketId[];
  cash: number;
  aggression: number; // 0~1
  alive: boolean;
  priceTier: PriceTier;
  bornDay: number;
  boostUntil: number | null; // 가격 전쟁 등
  acquiredDay: number | null;
}

export interface EnterpriseDeal {
  id: string;
  name: string;
  monthly: number;
  startDay: number;
  endDay: number;
  market: MarketId;
}

export interface Modifier {
  key: string;
  value: number;
  until: number;
  label: string;
}

export interface DecisionChoice {
  label: string;
  hint: string;
  cost: number;
  enabled: boolean;
  why?: string; // 못 고르는 이유
  isNew?: boolean; // DC-05 새로 열린 선택지
}

export interface PendingDecision {
  id: string;
  eventId: string;
  day: number;
  deadline: number;
  from: string;
  text: string;
  urgent: boolean;
  targetId: string | null;
  competitorId: string | null;
  choices: DecisionChoice[];
  channelId: string;
  resolved: { choice: number; text: string; auto: boolean } | null;
}

export interface NewsItem {
  day: number;
  text: string;
  kind: 'economy' | 'competitor' | 'ai' | 'company' | 'market' | 'public';
}

export interface Notice {
  id: string;
  day: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'urgent' | 'achievement' | 'mission';
  app?: string;
  arg?: string;
  read: boolean;
}

export interface AiState {
  modelId: string | null;
  adoption: Partial<Record<DeptId, number>>; // 0~1
  adaptation: number; // 0~1
  realized: number; // 이 회사에서 실제로 나는 효과(평균 ± 분산)
  switchedDay: number | null;
  incidents: number;
}

export interface PublicState {
  ipoDay: number;
  price: number;
  fair: number;
  sentiment: number; // 배수(0.6~1.6)
  lockupUntil: number;
  history: { day: number; price: number }[];
  guidance: number | null; // 이번 분기 매출 가이던스
  quarterStartRev: number;
  lastQuarter: { label: string; revenue: number; guidance: number | null; beat: boolean | null } | null;
  founderSold: number; // 팔아서 받은 돈
  founderSoldShares: number;
  buybacks: number;
}

export interface Company {
  name: string;
  industry: IndustryId;
  startDay: number;
  stage: number; // 0~5, 지금까지 도달한 최대 단계
  officeTier: number;
  movingUntil: number | null;
  workPolicy: WorkPolicy;
  welfare: string[];
  orders: Partial<Record<DeptId, string>>;
  autoHire: Partial<Record<DeptId, number>>; // HR-07 위임 채용 목표 인원
  autoHireLevel: string;
  ceoMode: 'founder' | 'executive'; // CA-03
  cofounderName: string | null;
  peakUsers: number;
  peakEmployees: number;
  maxValuation: number;
  profitStreak: number;
  enterpriseCount: number;
  acquisitions: number;
  decisions: number;
  ipoReady: number; // 0~100 상장 준비도
  board: number; // 0~100 이사회 신뢰
  approveBalance: number; // CA-03 결재 밀림
  missionsDone: string[];
  raiseRate: number; // 매년 1월 연봉 인상률
  culture: number; // 0~12 조직 문화(인사팀)
  furniture?: string[]; // 산 가구 id(A-78). 없으면 예전 저장 = 사무실 기본 가구를 다 가진 것으로 봄
}

export interface CareerCompany {
  result: CompanyResult;
}

export interface Career {
  founderName: string;
  startYear: number;
  startAge: number;
  wealth: number;
  rep: number;
  legacyEarned: number;
  companies: CompanyResult[];
  challenge: string | null;
  retired: boolean;
  endingId: string | null;
  investedInCompany: number;
  legacy: Record<string, number>; // 레거시 강화 레벨(프로필에서 복사)
  achievements: string[];
  missionsTotal: number;
  decisionsBefore: number;
}

// 커리어 바깥에 남는 메타 진행(기기 안 저장, RK-01 로컬 명예의 전당)
export interface Profile {
  version: 1;
  legacyPoints: number;
  legacy: Record<string, number>;
  achievements: string[];
  hall: { name: string; ending: string; wealth: number; companies: number; best: string; date: string; challenge: string | null }[];
  companyHall: { company: string; founder: string; kind: string; amount: number; date: string }[];
  careers: number;
}

export interface GameState {
  version: 2;
  seed: number;
  rng: number;
  idSeq: number;
  day: number; // 2027-01-01부터 지난 날 수(커리어 전체)
  msInDay: number;
  slotsDone: number;
  speed: number;
  pauseReason: string | null;
  ended: boolean; // 회사 한 판이 끝남(커리어 화면으로)
  career: Career;
  company: Company;
  founder: { picks: Record<string, string>; creditsLeft: number };
  wantsAngelOnStart: boolean;
  cash: number;
  ledger: LedgerEntry[];
  accrual: MonthAccrual;
  plHistory: MonthPL[];
  product: Product;
  markets: Record<MarketId, MarketState>;
  competitors: Competitor[];
  enterprise: EnterpriseDeal[];
  entPipeline: number;
  irPoints: number;
  networkPoints: number;
  ceoAlloc: Record<ActionId, number>;
  todayLog: Record<ActionId, number>;
  contracts?: import('./contracts').ContractState; // 외주 일감(A-79)
  valuation: { stored: number; storedDay: number; penaltyUntil: number | null; revenueStage: boolean };
  fundingStage: StageId | null;
  lastRoundDay: number | null;
  lastPostValue: number;
  rounds: Round[];
  safes: Safe[];
  capTable: CapEntry[];
  equityHistory: EquityEvent[];
  employees: Employee[];
  pendingHires: PendingHire[];
  seats: Seat[];
  postings: Posting[];
  applicants: Applicant[];
  channels: Channel[];
  ai: AiState;
  economy: { phase: EconomyPhase; until: number; level: number };
  modifiers: Modifier[];
  flags: string[];
  eventSeen: Record<string, number>;
  decisions: PendingDecision[];
  news: NewsItem[];
  notices: Notice[];
  public: PublicState | null;
  exitAttempt: ExitAttempt | null;
  exitCooldownUntil: number | null;
  result: CompanyResult | null;
  events: GameEvent[];
  stats: { outages: number; slops: number; quits: number; hires: number; fired: number };
}

export type GameEvent =
  | { type: 'autosave'; reason: string }
  | { type: 'offerReady'; roundId: string }
  | { type: 'roundFailed'; roundId: string }
  | { type: 'exitResult'; success: boolean }
  | { type: 'saleOffer' }
  | { type: 'bankrupt' }
  | { type: 'companyEnded' }
  | { type: 'monthClosed'; month: string }
  | { type: 'sfx'; sound: string }
  | { type: 'float'; text: string; kind: 'good' | 'bad' | 'money'; seat?: string }
  | { type: 'confetti' }
  | { type: 'decision'; id: string; urgent: boolean }
  | { type: 'shipped'; featureId: string }
  | { type: 'hired'; empId: string }
  | { type: 'moved' };
