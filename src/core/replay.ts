// 명령 기록 재실행(A-250): 서버가 제출된 셋업·명령을 같은 시드로 다시 돌려 점수를 직접 계산합니다.
// 화면의 store.ts(TICK_MS, ReplayStep)와 같은 모양을 쓰되, 여기서는 들어오는 값을 하나도 믿지 않고 전부 검증합니다.
import { DATA, industry } from './data';
import { applyCommand, type Command, type CommandType } from './commands';
import { emptyProfile, retire, mustRetire } from './career';
import { newCareer, nextCompany, validateCompanyName, specBudget, specCost, ownedSpecs, type SetupChoices } from './state';
import type { GameState, IndustryId } from './types';

// 화면 게임 루프의 고정 tick 크기(src/ui/store.ts TICK_MS)와 반드시 같아야 재실행 결과가 같습니다.
const TICK_MS = 100;
// 커리어 한 판의 실제 길이(최대 은퇴 연령까지)를 넉넉히 덮는 상한. 이보다 많은 tick을 요구하면 거부합니다.
const MAX_TICKS = 20_000_000;
// 명령 종류 하나가 한 칸에서 반복될 수 있는 최대 횟수(tick 이외에는 항상 1이어야 함)
const MAX_STEP_REPEAT = MAX_TICKS;

class ReplayError extends Error {}

function fail(msg: string): never {
  throw new ReplayError(msg);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isSafeInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && Number.isSafeInteger(v);
}

// ── 셋업 검증: 화면 Setup.tsx가 만들어 보내는 값과 같은 모양·같은 제약만 허용합니다 ──
function readSetup(raw: unknown, forNext: boolean): SetupChoices {
  if (!isPlainObject(raw)) fail('셋업 값이 올바르지 않습니다.');
  const allowed = ['picks', 'cofounderId', 'cofounderEquity', 'engineerId', 'companyName', 'wantsAngel', 'seed', 'industry', 'service', 'founderName', 'challenge', 'invest'];
  if (Object.keys(raw).some((k) => !allowed.includes(k))) fail('셋업에 알 수 없는 값이 있습니다.');

  if (!isSafeInt(raw.seed)) fail('셋업의 시드가 올바르지 않습니다.');

  const challenge = raw.challenge;
  if (challenge !== null && challenge !== undefined && typeof challenge !== 'string') fail('셋업의 도전 종류가 올바르지 않습니다.');
  const challengeId = (challenge ?? null) as string | null;
  if (challengeId !== null && !DATA.career.challenges.some((c) => c.id === challengeId)) fail('셋업의 도전 종류가 올바르지 않습니다.');
  const solo = challengeId === 'solo';

  if (typeof raw.industry !== 'string') fail('셋업의 산업이 올바르지 않습니다.');
  const industryId = raw.industry as IndustryId;
  const ind = DATA.industries.industries.find((x) => x.id === industryId);
  if (!ind) fail('셋업의 산업이 올바르지 않습니다.');
  // 재실행은 항상 빈 프로필(legacy={})에서 시작합니다(주간 도전 규칙). 잠긴 산업은 풀릴 수 없습니다.
  if (ind.locked) fail('아직 잠긴 산업입니다.');

  if (!isPlainObject(raw.picks)) fail('셋업의 창업자 스펙이 올바르지 않습니다.');
  const picks: Record<string, string> = {};
  for (const cat of DATA.specs.categories) {
    const v = (raw.picks as Record<string, unknown>)[cat.id];
    if (typeof v !== 'string' || !cat.items.some((i) => i.id === v)) fail(`셋업의 창업자 스펙(${cat.id})이 올바르지 않습니다.`);
    picks[cat.id] = v;
  }
  if (Object.keys(raw.picks).some((k) => !DATA.specs.categories.some((c) => c.id === k))) fail('셋업의 창업자 스펙에 알 수 없는 분류가 있습니다.');
  const budget = specBudget(forNext ? {} : {}); // 재실행 내내 legacy는 빈 값입니다
  if (specCost(picks, null) > budget) fail('창업자 스펙 비용이 예산을 넘습니다.');

  let cofounderId: string | null = null;
  if (raw.cofounderId !== null && raw.cofounderId !== undefined) {
    if (solo) fail('1인 창업 도전에는 코파운더를 둘 수 없습니다.');
    if (typeof raw.cofounderId !== 'string' || !DATA.candidates.cofounders.some((c) => c.id === raw.cofounderId)) fail('셋업의 코파운더가 올바르지 않습니다.');
    cofounderId = raw.cofounderId;
  }
  let cofounderEquity = 0;
  if (cofounderId) {
    if (!isFiniteNumber(raw.cofounderEquity)) fail('셋업의 코파운더 지분이 올바르지 않습니다.');
    cofounderEquity = raw.cofounderEquity;
    if (cofounderEquity < 0 || cofounderEquity > 1) fail('셋업의 코파운더 지분이 올바르지 않습니다.');
    const cand = DATA.candidates.cofounders.find((c) => c.id === cofounderId)!;
    if (cofounderEquity < cand.minEquity) fail('코파운더의 최소 지분 요구를 만족하지 못합니다.');
  } else if (raw.cofounderEquity !== undefined && raw.cofounderEquity !== 0) {
    fail('코파운더가 없으면 지분은 0이어야 합니다.');
  }

  let engineerId: string | null = null;
  if (raw.engineerId !== null && raw.engineerId !== undefined) {
    if (solo) fail('1인 창업 도전에는 파운딩 엔지니어를 둘 수 없습니다.');
    if (typeof raw.engineerId !== 'string' || !DATA.candidates.engineers.some((c) => c.id === raw.engineerId)) fail('셋업의 파운딩 엔지니어가 올바르지 않습니다.');
    engineerId = raw.engineerId;
  }

  if (typeof raw.companyName !== 'string') fail('셋업의 회사 이름이 올바르지 않습니다.');
  if (validateCompanyName(raw.companyName)) fail('셋업의 회사 이름이 올바르지 않습니다.');

  if (typeof raw.wantsAngel !== 'boolean') fail('셋업의 엔젤 투자 의사가 올바르지 않습니다.');

  if (!isPlainObject(raw.service)) fail('셋업의 서비스 정보가 올바르지 않습니다.');
  const svc = raw.service as Record<string, unknown>;
  if (typeof svc.field !== 'string' || typeof svc.name !== 'string' || svc.name.length < 1 || svc.name.length > 40) fail('셋업의 서비스 정보가 올바르지 않습니다.');
  if (!isPlainObject(svc.logo) || typeof (svc.logo as Record<string, unknown>).mark !== 'string' || typeof (svc.logo as Record<string, unknown>).color !== 'string') fail('셋업의 서비스 로고가 올바르지 않습니다.');

  if (typeof raw.founderName !== 'string') fail('셋업의 창업자 이름이 올바르지 않습니다.');

  let invest = 0;
  if (raw.invest !== undefined) {
    if (!isFiniteNumber(raw.invest) || raw.invest < 0) fail('셋업의 출자금이 올바르지 않습니다.');
    invest = raw.invest;
  }
  if (!forNext && invest !== 0) fail('첫 회사는 출자금을 가질 수 없습니다.');

  return {
    picks,
    cofounderId,
    cofounderEquity,
    engineerId,
    companyName: raw.companyName,
    wantsAngel: raw.wantsAngel,
    seed: raw.seed,
    industry: industryId,
    service: { field: svc.field, name: svc.name, logo: { mark: (svc.logo as Record<string, unknown>).mark as string, color: (svc.logo as Record<string, unknown>).color as string } },
    founderName: raw.founderName,
    challenge: challengeId as SetupChoices['challenge'],
    invest,
  };
}

// ── 명령 하나의 필드 검증: core 함수가 믿고 쓰는 id·숫자 범위를 여기서 거릅니다 ──
type FieldSpec =
  | { k: 'str' }
  | { k: 'strOpt' }
  | { k: 'strNull' }
  | { k: 'num' }
  | { k: 'int' }
  | { k: 'bool' }
  | { k: 'strArr' }
  | { k: 'enum'; values: readonly unknown[] }
  | { k: 'enumOpt'; values: readonly unknown[] }
  | { k: 'rot' }
  | { k: 'rotOpt' }
  | { k: 'dir' }
  | { k: 'readOpt' }; // LLM 해석 결과: 재실행은 받지 않음(store.ts와 같은 규칙)

const SPEEDS = DATA.time.speeds as readonly number[];
const DEPTS = ['dev', 'design', 'sales', 'marketing', 'hr', 'cs', 'infra', 'finlegal', 'ai', 'adops'] as const;
const MARKETS = DATA.markets.markets.map((m: { id: string }) => m.id);
const ACTIONS = ['dev', 'contract', 'sales', 'ir', 'network', 'enterprise', 'approve'] as const;
const STAGES = ['angel', 'preseed', 'seed', 'A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
const TIERS = ['low', 'standard', 'premium'] as const;
const CARDS = ['ask', 'demo', 'case', 'price', 'promise', 'companion', 'close'] as const;
const LEAVES = ['home', 'vacation'] as const;
const DM_ACTIONS = ['checkin', 'praise', 'push', 'rest'] as const;
const WORK_POLICIES = ['relaxed', 'normal', 'crunch'] as const;

// 각 명령 타입이 가져야 하는 필드(type 제외)만 적습니다. 여기 없는 타입은 알려지지 않은 명령으로 거부됩니다.
const COMMAND_SPECS: Record<CommandType, Record<string, FieldSpec>> = {
  tick: { ms: { k: 'int' }, nightFast: { k: 'bool' } },
  setSpeed: { speed: { k: 'enum', values: SPEEDS } },
  clearPause: {},
  ackAngelOnStart: {},
  markNoticeRead: { noticeId: { k: 'str' } },
  markRead: { channelIds: { k: 'strArr' } },
  postSaid: { empId: { k: 'str' }, said: { k: 'str' } },
  answerSaid: { empId: { k: 'str' }, said: { k: 'str' }, read: { k: 'readOpt' } },
  postChannelSaid: { channelId: { k: 'str' }, said: { k: 'str' } },
  answerChannel: { channelId: { k: 'str' }, said: { k: 'str' }, read: { k: 'readOpt' } },
  dmAction: { empId: { k: 'str' }, action: { k: 'enum', values: DM_ACTIONS } },
  setEmpOrder: { empId: { k: 'str' }, orderId: { k: 'strNull' }, channelId: { k: 'strOpt' } },
  commandOrder: { dept: { k: 'enum', values: DEPTS }, orderId: { k: 'str' } },
  setSquadOrder: { squadId: { k: 'str' }, dept: { k: 'enum', values: DEPTS }, orderId: { k: 'strNull' } },
  resolveDecision: { decisionId: { k: 'str' }, choice: { k: 'int' } },
  playCard: { card: { k: 'enum', values: CARDS }, targetId: { k: 'strOpt' } },
  bringCompanion: { empId: { k: 'strNull' } },
  autoFinish: {},
  leaveMeeting: {},
  acceptOuting: { outingId: { k: 'str' }, replace: { k: 'bool' }, delegateId: { k: 'strOpt' } },
  declineOuting: { outingId: { k: 'str' } },
  cancelOuting: { outingId: { k: 'str' } },
  setCeoWork: { work: { k: 'enum', values: ACTIONS } },
  setCeoMode: { mode: { k: 'enum', values: ['founder', 'executive'] } },
  acceptMilestone: { milestoneId: { k: 'str' }, level: { k: 'int' } },
  declineMilestone: { milestoneId: { k: 'str' } },
  cutScope: { milestoneId: { k: 'str' } },
  extendDeadline: { milestoneId: { k: 'str' } },
  pushTeam: { milestoneId: { k: 'str' } },
  dropMilestone: { milestoneId: { k: 'str' } },
  createPosting: { input: { k: 'str' } }, // 아래에서 별도로 검증(object 필드)
  closePosting: { postingId: { k: 'str' } },
  rejectApplicant: { applicantId: { k: 'str' } },
  negotiate: { applicantId: { k: 'str' }, salary: { k: 'num' }, bonus: { k: 'num' } },
  acceptCounter: { applicantId: { k: 'str' } },
  setAutoHire: { dept: { k: 'enum', values: DEPTS }, target: { k: 'int' } },
  setAutoHireLevel: { level: { k: 'str' } },
  fire: { empId: { k: 'str' } },
  giveBonus: { empId: { k: 'str' } },
  giveRaise: { empId: { k: 'str' }, rate: { k: 'num' } },
  promoteLead: { empId: { k: 'str' } },
  demoteLead: { empId: { k: 'str' } },
  grantOptions: { empId: { k: 'str' }, shares: { k: 'num' } },
  sendLeave: { empId: { k: 'str' }, leave: { k: 'enum', values: LEAVES } },
  startBurning: {},
  toggleWelfare: { welfareId: { k: 'str' } },
  setWorkPolicy: { policy: { k: 'enum', values: WORK_POLICIES } },
  setRaiseRate: { rate: { k: 'num' } },
  createSquad: { name: { k: 'str' }, members: { k: 'strArr' } },
  renameSquad: { squadId: { k: 'str' }, name: { k: 'str' } },
  removeSquad: { squadId: { k: 'str' } },
  setSquad: { empId: { k: 'str' }, squadId: { k: 'strNull' } },
  addToRoadmap: { featureIds: { k: 'strArr' } },
  addGrow: { featureId: { k: 'str' } },
  removeFromRoadmap: { index: { k: 'int' } },
  moveRoadmap: { index: { k: 'int' }, dir: { k: 'dir' } },
  setPriceTier: { tier: { k: 'enum', values: TIERS } },
  launchMarket: { market: { k: 'enum', values: MARKETS } },
  setAdBudget: { market: { k: 'enum', values: MARKETS }, monthly: { k: 'num' } },
  setAdAuto: { on: { k: 'bool' } },
  setChannelBudget: { market: { k: 'enum', values: MARKETS }, channel: { k: 'str' }, monthly: { k: 'num' } },
  startCampaign: { defId: { k: 'str' }, market: { k: 'enum', values: MARKETS }, toneId: { k: 'str' } },
  acquire: { competitorId: { k: 'str' } },
  chooseModel: { modelId: { k: 'str' } },
  setAdoption: { dept: { k: 'enum', values: DEPTS }, value: { k: 'num' } },
  openAdNegotiation: { offerId: { k: 'str' } },
  negotiateAd: { offerId: { k: 'str' }, ecpm: { k: 'num' }, days: { k: 'int' } },
  acceptAdCounter: { offerId: { k: 'str' } },
  declineAdOffer: { offerId: { k: 'str' } },
  setAdAutoRenew: { dealId: { k: 'str' }, on: { k: 'bool' } },
  breakAdDeal: { dealId: { k: 'str' } },
  acceptContract: { contractId: { k: 'str' } },
  dropContract: { contractId: { k: 'str' } },
  setContractAlert: { on: { k: 'bool' } },
  setContractStaff: { contractId: { k: 'str' }, empId: { k: 'str' }, on: { k: 'bool' } },
  setContractSquad: { contractId: { k: 'str' }, squadId: { k: 'strNull' } },
  applyForLoan: { kind: { k: 'enum', values: ['policy', 'bank'] } },
  repayEarly: { loanId: { k: 'str' } },
  startRound: { stage: { k: 'enum', values: STAGES }, room: { k: 'num' }, instrument: { k: 'enum', values: ['equity', 'safe'] } },
  cancelRound: { roundId: { k: 'str' } },
  closeForOffer: { roundId: { k: 'str' } },
  acceptOffer: { roundId: { k: 'str' } },
  rejectOffer: { roundId: { k: 'str' } },
  sendLetter: { roundId: { k: 'str' }, investorId: { k: 'str' }, letterId: { k: 'str' }, askId: { k: 'strOpt' } },
  requestDecision: { roundId: { k: 'str' }, investorId: { k: 'str' } },
  askCoInvest: { roundId: { k: 'str' }, investorId: { k: 'str' } },
  topUpEsop: { pct: { k: 'num' } },
  setGuidance: { optionId: { k: 'str' } },
  sellShares: { fraction: { k: 'num' } },
  buyback: { amount: { k: 'num' } },
  resign: {},
  startExit: { method: { k: 'enum', values: ['sale', 'ipo'] } },
  acceptSale: {},
  declineSale: {},
  moveOffice: { tierId: { k: 'int' } },
  placeDesk: { gx: { k: 'int' }, gy: { k: 'int' }, rot: { k: 'rot' } },
  moveDesk: { deskId: { k: 'str' }, gx: { k: 'int' }, gy: { k: 'int' }, rot: { k: 'rotOpt' } },
  rotateDesk: { deskId: { k: 'str' } },
  removeDesk: { deskId: { k: 'str' } },
  placeFurniture: { itemId: { k: 'str' }, gx: { k: 'int' }, gy: { k: 'int' }, rot: { k: 'rot' } },
  moveFurniture: { placedId: { k: 'str' }, gx: { k: 'int' }, gy: { k: 'int' }, rot: { k: 'rotOpt' } },
  rotateFurniture: { placedId: { k: 'str' } },
  storeFurniture: { placedId: { k: 'str' } },
};

function checkField(spec: FieldSpec, v: unknown, path: string): void {
  switch (spec.k) {
    case 'str':
      if (typeof v !== 'string') fail(`${path} 값이 올바르지 않습니다.`);
      return;
    case 'strOpt':
      if (v !== undefined && typeof v !== 'string') fail(`${path} 값이 올바르지 않습니다.`);
      return;
    case 'strNull':
      if (v !== null && typeof v !== 'string') fail(`${path} 값이 올바르지 않습니다.`);
      return;
    case 'num':
      if (!isFiniteNumber(v)) fail(`${path} 값이 올바르지 않습니다.`);
      return;
    case 'int':
      if (!isSafeInt(v)) fail(`${path} 값이 올바르지 않습니다.`);
      return;
    case 'bool':
      if (typeof v !== 'boolean') fail(`${path} 값이 올바르지 않습니다.`);
      return;
    case 'strArr':
      if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) fail(`${path} 값이 올바르지 않습니다.`);
      return;
    case 'enum':
      if (!spec.values.includes(v as never)) fail(`${path} 값이 올바르지 않습니다.`);
      return;
    case 'enumOpt':
      if (v !== undefined && !spec.values.includes(v as never)) fail(`${path} 값이 올바르지 않습니다.`);
      return;
    case 'rot':
      if (v !== 0 && v !== 1 && v !== 2 && v !== 3) fail(`${path} 값이 올바르지 않습니다.`);
      return;
    case 'rotOpt':
      if (v !== undefined && v !== 0 && v !== 1 && v !== 2 && v !== 3) fail(`${path} 값이 올바르지 않습니다.`);
      return;
    case 'dir':
      if (v !== -1 && v !== 1) fail(`${path} 값이 올바르지 않습니다.`);
      return;
    case 'readOpt':
      if (v !== null) fail('메시지 해석 결과는 명령 기록에 남길 수 없습니다.');
      return;
  }
}

function readPostingInput(v: unknown): void {
  if (!isPlainObject(v)) fail('채용 공고 입력이 올바르지 않습니다.');
  const allowed = ['dept', 'headcount', 'salaryLevel', 'level', 'durationDays', 'promo'];
  if (Object.keys(v).some((k) => !allowed.includes(k))) fail('채용 공고 입력에 알 수 없는 값이 있습니다.');
  if (!DEPTS.includes(v.dept as never)) fail('채용 공고의 부서가 올바르지 않습니다.');
  if (v.headcount !== undefined && !isSafeInt(v.headcount)) fail('채용 공고의 인원이 올바르지 않습니다.');
  if (v.salaryLevel !== undefined && typeof v.salaryLevel !== 'string') fail('채용 공고의 급여 수준이 올바르지 않습니다.');
  if (v.level !== undefined && typeof v.level !== 'string') fail('채용 공고의 등급이 올바르지 않습니다.');
  if (v.durationDays !== undefined && !isSafeInt(v.durationDays)) fail('채용 공고의 기간이 올바르지 않습니다.');
  if (typeof v.promo !== 'string') fail('채용 공고의 홍보 문구가 올바르지 않습니다.');
}

// 명령 하나(ReplayStep)를 검증하고 core의 Command 또는 전환 타입으로 돌려줍니다.
function readStep(raw: unknown): Command | { type: 'nextCompany'; setup: SetupChoices } | { type: 'retire' } {
  if (!isPlainObject(raw) || typeof raw.type !== 'string') fail('명령 모양이 올바르지 않습니다.');
  const type = raw.type;

  if (type === 'nextCompany') {
    if (Object.keys(raw).some((k) => k !== 'type' && k !== 'setup')) fail('다음 회사 명령에 알 수 없는 값이 있습니다.');
    return { type: 'nextCompany', setup: readSetup(raw.setup, true) };
  }
  if (type === 'retire') {
    if (Object.keys(raw).length !== 1) fail('은퇴 명령에 알 수 없는 값이 있습니다.');
    return { type: 'retire' };
  }

  const spec = COMMAND_SPECS[type as CommandType];
  if (!spec) fail(`알 수 없는 명령입니다: ${type}`);
  const keys = Object.keys(spec);
  if (Object.keys(raw).some((k) => k !== 'type' && !keys.includes(k))) fail(`명령(${type})에 알 수 없는 값이 있습니다.`);
  for (const k of keys) {
    const fs = spec[k];
    const optional = fs.k === 'strOpt' || fs.k === 'enumOpt' || fs.k === 'rotOpt';
    if (!(k in raw) && !optional) fail(`명령(${type})의 ${k} 값이 없습니다.`);
    checkField(fs, (raw as Record<string, unknown>)[k], `명령(${type})의 ${k}`);
  }
  if (type === 'createPosting') readPostingInput((raw as Record<string, unknown>).input);

  return raw as unknown as Command;
}

export interface ReplayInput {
  seed: number;
  rule: string | null;
  setup: unknown;
  commands: unknown;
}

export interface ReplayResult {
  state: GameState;
  score: number;
}

// 서버가 저장소에서 읽은 명령 기록을 다시 돌립니다. 실패하면 Error(ReplayError)를 던집니다.
export function replayCareer(input: ReplayInput): ReplayResult {
  if (!isSafeInt(input.seed)) fail('도전 시드가 올바르지 않습니다.');
  if (input.rule !== null && typeof input.rule !== 'string') fail('도전 규칙이 올바르지 않습니다.');
  if (!Array.isArray(input.commands)) fail('명령 배열이 없습니다.');

  const setup = readSetup(input.setup, false);
  if (setup.seed !== input.seed) fail('셋업의 시드가 도전 시드와 다릅니다.');
  if ((setup.challenge ?? null) !== input.rule) fail('셋업의 도전 규칙이 도전과 다릅니다.');
  if (setup.invest !== 0) fail('첫 회사는 출자금을 가질 수 없습니다.');

  let s: GameState = newCareer(setup, emptyProfile());
  let retired = false;
  let totalTicks = 0;

  for (const entry of input.commands) {
    if (!isPlainObject(entry)) fail('명령 기록 칸의 모양이 올바르지 않습니다.');
    if (Object.keys(entry).some((k) => k !== 'c' && k !== 'n')) fail('명령 기록 칸에 알 수 없는 값이 있습니다.');
    if (!isSafeInt(entry.n) || entry.n < 1 || entry.n > MAX_STEP_REPEAT) fail('명령 반복 횟수가 올바르지 않습니다.');
    const step = readStep(entry.c);
    if (step.type !== 'tick' && entry.n !== 1) fail('tick이 아닌 명령은 반복 횟수가 1이어야 합니다.');

    if (retired) fail('은퇴한 뒤에는 추가 명령을 받을 수 없습니다.');

    if (step.type === 'tick') {
      if (step.ms !== TICK_MS) fail('tick 시간 단위가 올바르지 않습니다.');
      totalTicks += entry.n;
      if (totalTicks > MAX_TICKS) fail('tick 총량이 너무 많습니다.');
      for (let i = 0; i < entry.n; i++) {
        applyCommand(s, step);
        s.events = [];
      }
      continue;
    }

    if (step.type === 'nextCompany') {
      if (!s.ended) fail('아직 끝나지 않은 회사에서 다음 회사로 넘어갈 수 없습니다.');
      if (mustRetire(s)) fail('강제 은퇴 연령을 넘어 다음 회사를 시작할 수 없습니다.');
      if ((step.setup.challenge ?? null) !== (s.career.challenge ?? null)) fail('다음 회사의 도전 규칙이 커리어와 다릅니다.');
      s.career.legacy = {};
      const err = nextCompany(s, step.setup);
      if (err) fail(err);
      continue;
    }

    if (step.type === 'retire') {
      if (!s.ended) fail('아직 끝나지 않은 회사로는 은퇴할 수 없습니다.');
      retire(s);
      retired = true;
      continue;
    }

    applyCommand(s, step);
    s.events = [];
  }

  if (!retired || !s.career.retired) fail('은퇴로 끝나지 않은 커리어는 제출할 수 없습니다.');
  const score = Math.round(s.career.wealth);
  if (!Number.isSafeInteger(score)) fail('최종 자산 값이 올바르지 않습니다.');
  return { state: s, score };
}
