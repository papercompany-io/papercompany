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
  talent?: number; // 개인 재능 배율(A-89, 0.88~1.12). 속도 %가 사람마다 1% 단위로 다름. 없으면 1(예전 저장)
  sat: number; // 0~100 만족도(DEC-022)
  health: number; // 0~100 건강(DEC-022)
  lead: boolean; // 팀장
  options: number; // 받은 스톡옵션 주식 수(EQ-04)
  optionDay: number | null; // 옵션 받은 날(베스팅 기준)
  sickUntil: number | null; // 병가(WF-03)
  leaving: number | null; // 퇴사 예정일
  lastRaiseDay: number;
  bubble: { text: string; until: number } | null; // OF-05 머리 위 말풍선
  dmDay?: Partial<Record<string, number>>; // DM 행동별 마지막 날(A-94: 자주 하면 효과 줄어듦)
}

export interface Seat {
  id: string;
  zone: 'desk' | 'exec' | 'ceo' | DeptId; // DeptId는 예전 저장(부서 구역 좌석)에만 있고 불러올 때 책상으로 바뀝니다
  occupant: string | null; // 직원 id, 'ceo', 'pending:지원자id', 'moving:직원id'
  bought?: boolean; // 책상·PC를 샀는지(없으면 예전 저장 = 산 것으로 봄)
  gx?: number; // 책상 위치(타일, A-80)
  gy?: number;
  rot?: Rot; // 책상 방향(A-128). 없으면 0
}

// 가구·책상 방향(A-128): 0 = 기본, 1·2·3 = 시계 방향 90°씩. 홀수면 가로·세로 크기가 바뀜
export type Rot = 0 | 1 | 2 | 3;

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
  level?: string; // 공고 등급(A-91: junior·mid·senior). 없으면 예전 공고(월급 수준만)
  incoming?: number[]; // 오늘 지원자가 들어올 시각(하루 안 ms, 오름차순). 시간이 그 시각을 지나면 한 명씩 들어옴
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
  skill?: number; // 0~100 숙련(A-89: 지원 때 정해 두고 입사 후 그대로). 없으면 예전 저장
  talent?: number; // 개인 재능 배율(A-89)
  level?: string; // 지원한 공고 등급(A-91)
  nego?: Negotiation;
}

// 연봉 협상(A-89): 제안 → 지원자 반응(수락·역제안·거절). 희망 월급은 첫 제안 뒤에 드러남
export interface NegoMsg {
  from: 'me' | 'them';
  text: string;
  salary?: number;
  bonus?: number;
  mood?: 'happy' | 'ok' | 'angry';
  patience?: number; // 이 답에서 바뀐 인내심(%p, A-130)
}

export interface Negotiation {
  log: NegoMsg[];
  patience: number; // 0~100%
  floor: number; // 역제안해 줄 최저 비율(숨김)
  revealed: boolean; // 희망 월급을 알게 됨
  counter: { salary: number; bonus: number } | null; // 지원자의 마지막 역제안(받아들이면 채용)
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
  skill?: number;
  talent?: number;
}

export interface Message {
  id: string;
  day: number;
  from: string;
  text: string;
  kind: 'system' | 'player' | 'npc';
  decisionId?: string; // DC-01 결정 메시지
  at?: number; // 보낸 시각(그날 ms, A-93). 없으면 예전 저장
  outingId?: string; // 대표 외출 초대(A-101)
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
  decision: 'committed' | 'declined' | 'pending' | null; // pending = 결정 요청 후 답을 기다리는 중(A-125)
  decisionP: number | null;
  decisionDue?: number; // pending일 때 답이 오는 날
  decisionYes?: boolean; // pending일 때 정해진 답(요청한 날의 확률로 굴림)
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
  interest?: number; // 대출 이자(A-137, 영업 밖 비용)
  loanPaid?: number; // 대출 원금 상환(손익 아님, 현금만)
  opex: number;
  operatingProfit: number;
  tax: number;
  netIncome: number;
  cashBefore: number;
  cashAfter: number;
  investment: number;
  usersEnd: number;
}

// A-137 대출: 남은 원금(balance)에 매달 이자, 거치 기간(graceUntil 전)엔 이자만, 그 뒤 매달 principalPay씩 원금
export interface Loan {
  id: string;
  kind: 'policy' | 'bank';
  lender: string;
  principal: number;
  balance: number;
  rate: number; // 연 이자율
  startDay: number;
  graceUntil: number;
  principalPay: number;
  guaranteed: boolean; // 대표 개인 보증
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
  interest?: number; // A-137
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
  insight?: number; // 고객 인사이트(A-115, 기능 착수에 씀). 예전 저장엔 없음
  payInsight?: number; // 지불 의사 인사이트(A-115, 수익화 기능 착수에 씀)
  priceTier: PriceTier;
  launchedDay: number | null; // MVP 출시일
  shipped: { id: string; level: number; day: number; result: 'full' | 'partial' | 'fail' }[];
  daily?: { day: number; users: number; rev: number }[]; // 최근 하루 기록(제품 상태 그래프, 예전 저장엔 없음)
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
  // 광고 채널(A-116): 채널별 월 예산(합은 adBudget), 피로 0~1, 성과(하루 평균, 약 30일 이동 평균). 없으면 예전 저장
  ads?: Partial<Record<string, number>>;
  adFatigue?: Partial<Record<string, number>>;
  adStats?: Partial<Record<string, { spent: number; got: number; aware: number }>>;
}

// 광고 캠페인(A-116): 기간이 정해진 한 번짜리 광고
export interface Campaign {
  id: string;
  def: string;
  market: MarketId;
  tone: string;
  startDay: number;
  endDay: number;
  cost: number;
  mult: number; // 결과 배율(문구 궁합 × 운)
  risk: boolean; // 인플루언서 논란
  got: number; // 데려온 고객
  aware: number; // 올린 인지도(0~1)
  done: boolean;
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
  style?: RivalStyle; // 성격(A-140). 없으면 예전 저장(aggression으로 정함)
  plan?: { kind: RivalStyle; startDay: number } | null; // 예고한 반격
  attack?: { kind: RivalStyle; until: number } | null; // 진행 중인 반격
  nextAttackDay?: number; // 이 날 전에는 반격하지 않음
}

export type RivalStyle = 'price' | 'feature' | 'marketing';

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
  missStreak?: number; // 가이던스 연속 미달(A-142)
  ipoPrice?: number; // 공모가(A-142)
}

// 플레이어가 정한 서비스(산업 단계): 분야·이름은 직접 입력, 로고는 심볼 + 배경색
export interface ServiceInfo {
  field: string;
  name: string;
  logo: { mark: string; color: string };
}

export interface Company {
  name: string;
  service?: ServiceInfo; // 없으면 예전 저장 = 회사 이름 첫 글자 로고
  industry: IndustryId;
  startDay: number;
  stage: number; // 0~5, 지금까지 도달한 최대 단계
  officeTier: number;
  movingUntil: number | null;
  workPolicy: WorkPolicy;
  burning?: { until: number; ready: number; tired: boolean }; // 버닝(A-131): until까지 가속, ready부터 다시 가능, tired = 끝난 뒤 피로를 줬는지
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
  furniture?: string[]; // 예전 저장(A-78)의 산 가구 id. 불러올 때 placed로 옮깁니다
  placed?: PlacedItem[]; // 산 가구(A-87). gx·gy가 null이면 보관 중
  orderDay?: Partial<Record<DeptId, number>>; // 부서 지시를 마지막으로 바꾼 날(A-94: 잦은 변경은 반발)
  orderPushback?: { dept: DeptId; order: string; day: number } | null; // 팀이 거절한 지시(이틀 안에 다시 내리면 강행)
}

// 사무실에 놓은(또는 보관 중인) 가구 하나. gx·gy = 차지하는 칸의 왼쪽 위
export interface PlacedItem {
  id: string;
  item: string;
  gx: number | null;
  gy: number | null;
  rot?: Rot; // 방향(A-128)
}

// 대표 외출(A-101): 초대 → 수락하면 startDay부터 days일 동안 자리를 비우고 그 일만 함
export interface Outing {
  id: string;
  tpl: string;
  kind: 'ir' | 'network' | 'sales';
  title: string;
  host: string;
  channelId: string;
  startDay: number;
  days: number;
  startHour?: number; // 하루짜리 외출의 약속 시각(A-127). 없으면(예전 저장·여러 날) 하루 내내
  hours?: number; // 약속 길이(시간)
  travel?: number; // 편도 이동 시간(시간, 30분 단위)
  delegate?: string; // 대신 보낸 직원 id(A-133). 있으면 대표 일정이 아님
  cost: number;
  status: 'offer' | 'booked' | 'done' | 'declined' | 'expired';
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
  ceoAlloc: Record<ActionId, number>; // 예전 칸 배분(A-101부터 쓰지 않음, 저장 호환용)
  ceoWork?: ActionId; // 대표 주 업무(A-101: 실무 모드 개발·외주·영업, 경영 모드 대기업 영업·결재). 없으면 첫 번째
  outings?: Outing[];
  todayLog: Record<ActionId, number>;
  contracts?: import('./contracts').ContractState; // 외주 일감(A-79)
  loans?: Loan[]; // 대출(A-137)
  loanApp?: { kind: 'policy'; amount: number; decideDay: number; p: number } | null; // 정책자금 심사 중
  loanOfferDay?: number; // 마지막 대출 제안 날
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
  campaigns?: Campaign[]; // A-116 광고 캠페인(없으면 예전 저장)
  flags: string[];
  eventSeen: Record<string, number>;
  story?: { lastCrisisDay: number; restUntil: number }; // 사건 스토리텔러(A-141): 마지막 위기, 쉬는 구간 끝
  lastMajorOutage?: number; // 마지막 큰 장애 날(A-143) — 투자사가 기억함
  ceoEnergy?: number; // 대표 컨디션 0~100(A-146). 없으면 예전 저장(시작값)
  ceoCardDay?: number; // 마지막 컨디션 카드 날(A-146)
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
  | { type: 'moved' }
  | { type: 'needsTime'; what: string }; // 시간이 흘러야 진행되는 일을 시작함(A-126: 멈춰 있으면 화면이 알려 줌)
