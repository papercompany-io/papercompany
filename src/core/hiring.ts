// F04 채용: HR-01 고용, HR-04 채용 공고, HR-05 지원자(EM-03 특성 포함), HR-06 채용 확정과 입사, HR-07 인사팀 위임 채용
import { DATA, dept, specEffects, trait } from './data';
import { seatsAvailable, takeDesk } from './office';
import { projectedMonthlyPayroll, spendNow } from './finance';
import { nextId } from './ids';
import { onEmployeeJoined } from './messenger';
import { econ } from './economy';
import { legacyFx } from './career';
import { deptUnlocked } from './employees';
import { float, notify } from './notify';
import { pick, poisson, rand, randInt, weighted } from './rng';
import { marketSalary, rollTalent, startSkill, welfareApply, welfareQuality } from './staff';
import type { Applicant, DeptId, Employee, GameState, Grade, NegoMsg, Posting } from './types';
import { orderShare } from './assign';

const H = DATA.hiring;

// 공고 인원·기간(A-89): 기본은 무제한(인원 0 = 무제한, 마감일 NO_END = 직접 마감할 때까지). 봇은 정해서 올릴 수 있음
export const NO_END = 999999;

export interface PostingInput {
  dept: DeptId;
  headcount?: number;
  salaryLevel?: string;
  level?: string;
  durationDays?: number;
  promo: string;
}

export function careerLevel(id: string | undefined) {
  return H.careerLevels.find((l) => l.id === id);
}

export function postingFull(p: Posting): boolean {
  return p.headcount > 0 && p.hired >= p.headcount;
}

export function postingOpenEnded(p: Posting): boolean {
  return p.endDay >= NO_END;
}

export function postingWarnings(s: GameState): string[] {
  const free = seatsAvailable(s);
  const out: string[] = [];
  if (free === 0) out.push('사무실에 책상을 더 놓을 자리가 없습니다. 상점에서 책상을 놓거나 더 큰 사무실로 옮기세요.');
  else if (free <= 2) out.push(`책상을 ${free}개 더 놓을 수 있습니다. ${free}명까지만 뽑을 수 있습니다.`);
  return out;
}

export function createPosting(s: GameState, input: PostingInput): string | null {
  if (s.ended) return '회사가 끝났습니다.';
  if (!deptUnlocked(s, input.dept)) return `${dept(input.dept).name} 부서는 회사 단계 ${dept(input.dept).stage}부터 둘 수 있습니다.`;
  if (seatsAvailable(s) === 0) return '사무실에 책상을 더 놓을 자리가 없습니다.';
  const headcount = input.headcount ?? 0;
  if (headcount < 0 || headcount > H.maxHeadcountPerPosting) return `인원은 1~${H.maxHeadcountPerPosting}명(0 = 무제한)입니다.`;
  const promo = H.promos.find((p) => p.id === input.promo);
  if (!promo) return '홍보 수준을 고르세요.';
  if (promo.cost > s.cash) return '홍보비를 낼 자금이 부족합니다.';
  if (input.durationDays !== undefined && !H.durations.includes(input.durationDays)) return '공고 기간을 고르세요.';
  const days = input.durationDays ?? 0;
    if (input.level !== undefined && !careerLevel(input.level)) return '등급을 고르세요.';
  const p: Posting = { id: nextId(s, 'p'), dept: input.dept, headcount, salaryLevel: input.salaryLevel ?? 'normal', level: input.level, durationDays: days, promo: input.promo, startDay: s.day, endDay: days ? s.day + days : NO_END, status: 'open', hired: 0 };
  s.postings.push(p);
  spendNow(s, `채용 홍보비(${dept(input.dept).name} 공고)`, promo.cost, 'recruiting');
  // 오늘 남은 시간에도 지원자가 올 수 있음(남은 시간만큼의 비율로)
  scheduleArrivals(s, p, s.msInDay);
  s.events.push({ type: 'needsTime', what: '채용 공고' }); // A-126
  return null;
}

// 지원자는 아침에 몰려오지 않고 하루 중 아무 때나 한 명씩 들어옵니다.
// 하루 몇 명 올지(포아송)와 각자의 도착 시각을 정해 공고에 줄 세웁니다. from 이후 시간만 씀(공고를 낮에 올린 경우)
function scheduleArrivals(s: GameState, p: Posting, from = 0) {
  const dayMs = DATA.time.dayMs;
  const left = Math.max(0, dayMs - from);
  const n = poisson(s, (arrivalRate(s, p) * left) / dayMs);
  const times: number[] = [];
  for (let i = 0; i < n; i++) times.push(from + rand(s) * left);
  p.incoming = times.sort((a, b) => a - b);
}

// 한 공고에 기다리는 지원자는 모집 인원 × 6 + 4명까지, 인원 무제한 공고는 10명까지(A-68): 고를 만큼은 오되 목록이 수백 명으로 쌓이지 않게
function waitingRoom(s: GameState, p: Posting): number {
  const waitingHere = s.applicants.filter((a) => a.postingId === p.id && a.status === 'waiting').length;
  const cap = p.headcount > 0 ? (p.headcount - p.hired) * 6 + 4 : 10;
  return Math.max(0, cap - waitingHere);
}

// 지금 시각(하루 안 ms)까지 도착할 차례인 지원자를 들여보냅니다. 시간이 흐를 때마다 부릅니다.
export function hiringArrivals(s: GameState, upTo: number) {
  for (const p of s.postings) {
    const q = p.incoming;
    if (!q || !q.length) continue;
    while (q.length && q[0] <= upTo) {
      q.shift();
      if (p.status !== 'open' || waitingRoom(s, p) === 0) continue;
      const a = rollApplicant(s, p.dept, p.salaryLevel, p.id, p.level);
      s.applicants.push(a);
      // 개발 공고는 지원자가 자주 몰려 알림을 보내지 않음 — 채용 앱 목록에서만 확인
      if (p.dept !== 'dev') notify(s, `채용: ${a.name}님이 ${dept(p.dept).name} 공고에 지원했습니다(능력 ${a.grade} · 경력 ${a.years}년).`, 'info', 'hiring');
    }
  }
}

export function closePosting(s: GameState, id: string) {
  const p = s.postings.find((x) => x.id === id);
  if (!p) return;
  p.status = 'closed';
  p.incoming = [];
  if (postingOpenEnded(p)) p.endDay = s.day; // 지난 공고 정리(60일 뒤) 기준
}

function makeName(s: GameState): string {
  const used = new Set([...s.employees.map((e) => e.name), ...s.applicants.filter((a) => a.status === 'waiting').map((a) => a.name)]);
  for (let i = 0; i < 20; i++) {
    const n = pick(s, DATA.names.surnames) + pick(s, DATA.names.given);
    if (!used.has(n)) return n;
  }
  return pick(s, DATA.names.surnames) + pick(s, DATA.names.given);
}

export function rollTraits(s: GameState): string[] {
  const ids = DATA.traits.traits.map((t) => t.id);
  const n = rand(s) < 0.75 ? 2 : 1;
  const out: string[] = [];
  while (out.length < n) {
    const t = pick(s, ids);
    if (out.includes(t)) continue;
    if ((t === 'ai_friendly' && out.includes('ai_skeptic')) || (t === 'ai_skeptic' && out.includes('ai_friendly'))) continue;
    out.push(t);
  }
  return out;
}

export function applicantQualityBonus(s: GameState, levelShift: number): number {
  return (specEffects(s.founder.picks).applicantQuality + levelShift * 10 + welfareQuality(s) + legacyFx(s, 'applicantQuality') + Math.min(10, s.career.rep / 5)) / 100;
}

export function rollApplicant(s: GameState, d: DeptId, levelId: string, postingId: string, careerId?: string): Applicant {
  const level = H.salaryLevels.find((l) => l.id === levelId) ?? H.salaryLevels[1];
  const qb = applicantQualityBonus(s, level.qualityShift);
  const career = careerLevel(careerId);
  const w = career ? career.gradeWeights : H.gradeWeights;
  const weights = [w[0] ? Math.max(1, w[0] * (1 - qb)) : 0, w[1], w[2] * (1 + 2 * qb), w[3] * (1 + 2 * qb)];
  const grade = weighted(s, H.grades as Grade[], weights);
  const [y0, y1] = (H.gradeYears as Record<Grade, number[]>)[grade];
  const years = randInt(s, y0, y1);
  // 희망 월급: 능력별 시장 월급 × 재능에 따라 0.95~1.08(재능이 높을수록 더 원함, A-92)
  const talent = rollTalent(s);
  const base = marketSalary(s, d, grade) * level.salaryMult * (0.95 + ((talent - 0.88) / 0.24) * 0.13);
  return {
    id: nextId(s, 'a'),
    postingId,
    name: makeName(s),
    dept: d,
    years,
    skill: startSkill(s, grade, years),
    talent,
    level: career?.id,
    desiredSalary: Math.round(base / 10000) * 10000,
    grade,
    traits: rollTraits(s),
    arrivedDay: s.day,
    leaveDay: s.day + H.applicantStayDays,
    status: 'waiting',
  };
}

export function addApplicants(s: GameState, p: Posting, count: number) {
  for (let i = 0; i < count; i++) s.applicants.push(rollApplicant(s, p.dept, p.salaryLevel, p.id));
}

function stageMult(s: GameState) {
  return (H.stageArrivalMult as Record<string, number>)[s.fundingStage ?? 'none'] ?? 1;
}

export function hrBoost(s: GameState): number {
  const hr = s.employees.filter((e) => e.dept === 'hr').length;
  return 1 + hr * (0.08 + 0.17 * orderShare(s, 'hr', 'hr_recruit')); // 채용 지원을 맡은 비율(A-147)
}

export function arrivalRate(s: GameState, p: Posting): number {
  const level = H.salaryLevels.find((l) => l.id === p.salaryLevel) ?? H.salaryLevels[1];
  const promo = H.promos.find((x) => x.id === p.promo) ?? H.promos[0];
  const net = 1 + Math.min(0.6, (s.networkPoints / 100) * H.networkArrivalBonusPer100); // 인맥 효과는 +60%까지(A-68)
  const brand = 1 + Math.min(1.5, s.company.peakUsers > 0 ? Math.log10(1 + s.company.peakUsers) / 6 : 0) + Math.min(0.5, s.career.rep / 100);
  return H.baseArrivalPerDay * level.arrivalMult * (careerLevel(p.level)?.arrivalMult ?? 1) * promo.arrivalMult * stageMult(s) * net * brand * (1 + welfareApply(s)) * econ(s, 'apply') * hrBoost(s);
}

export function hiringDayEnd(s: GameState) {
  // 어제 줄 서 있던 지원자 중 아직 못 들어온 사람(시간을 건너뛴 경우 등)은 모두 들여보냄
  hiringArrivals(s, Infinity);
  for (const a of s.applicants) if (a.status === 'waiting' && s.day >= a.leaveDay) a.status = 'left';
  // 오래된 지원자 기록은 정리(저장 크기)
  s.applicants = s.applicants.filter((a) => a.status === 'waiting' || s.day - a.arrivedDay < 30);
  for (const p of s.postings) {
    if (p.status !== 'open') continue;
    if (s.day >= p.endDay || postingFull(p)) {
      p.status = 'closed';
      p.incoming = [];
      continue;
    }
    scheduleArrivals(s, p);
  }
  s.postings = s.postings.filter((p) => p.status === 'open' || s.day - p.endDay < 60);
  autoHireDay(s);
}

export function hireWarning(s: GameState, salary: number): string | null {
  const need = projectedMonthlyPayroll(s, salary);
  if (s.cash < need) return `이 사람까지 뽑으면 한 달 인건비(입사 대기자 포함)가 약 ${Math.round(need / 1e4).toLocaleString('ko-KR')}만원인데, 지금 자금은 ${Math.round(s.cash / 1e4).toLocaleString('ko-KR')}만원입니다. 자금이 0 이하로 월급일을 넘기면 파산합니다.`;
  return null;
}

function hireBlock(s: GameState, a: Applicant | undefined): string | null {
  if (!a || a.status !== 'waiting') return '지원자를 찾을 수 없습니다.';
  const p = s.postings.find((x) => x.id === a.postingId);
  if (p && postingFull(p)) return '이 공고의 모집 인원을 모두 채웠습니다.';
  if (seatsAvailable(s) === 0) return '사무실에 책상을 더 놓을 자리가 없습니다.';
  return null;
}

// 채용 확정: 공고 채용 수 +1, 사이닝 보너스는 바로 지급, 내일 출근
function hire(s: GameState, a: Applicant, salary: number, bonus: number): string {
  const p = s.postings.find((x) => x.id === a.postingId);
  a.status = 'hired';
  if (p) {
    p.hired += 1;
    if (postingFull(p)) p.status = 'closed';
  }
  if (bonus > 0) spendNow(s, `사이닝 보너스(${a.name})`, bonus, 'recruiting');
  reserve(s, a, salary);
  return `${a.name}님이 월급 ${man(salary)}${bonus ? `·보너스 ${man(bonus)}` : ''}에 입사를 수락했습니다. 내일 출근합니다.`;
}

const man = (v: number) => `${Math.round(v / 1e4).toLocaleString('ko-KR')}만원`;
const round10 = (v: number) => Math.max(10e4, Math.round(v / 1e5) * 1e5);

// 희망 월급 그대로 바로 채용(봇·자동 플레이용). lowball이면 10% 낮게 제안하고 일정 확률로 거절
export function offerJob(s: GameState, applicantId: string, lowball: boolean): { ok: boolean; message: string } {
  const a = s.applicants.find((x) => x.id === applicantId);
  const err = hireBlock(s, a);
  if (err) return { ok: false, message: err };
  const salary = lowball ? Math.round((a!.desiredSalary * H.lowballRate) / 10000) * 10000 : a!.desiredSalary;
  if (lowball && rand(s) < H.lowballRejectChance) {
    a!.status = 'rejected';
    return { ok: false, message: `${a!.name}님이 월급 ${man(salary)} 제안을 거절했습니다.` };
  }
  return { ok: true, message: hire(s, a!, salary, 0) };
}

// 협상 시작 상태: 인내심, 숨은 최저선. 첫 제안을 기다리는 말 한마디
export function negotiation(s: GameState, a: Applicant) {
  const N = H.nego;
  return (a.nego ??= {
    log: [{ from: 'them', text: `${a.name}님이 첫 제안을 기다립니다.` }],
    patience: N.patience,
    floor: N.floorMin + rand(s) * (N.floorMax - N.floorMin),
    revealed: false,
    counter: null,
  });
}

// 연봉 협상(A-89): 제안 가치 = 월급 + 보너스/12를 희망 월급과 비교.
//  ≥ 희망: 수락 · ≥ 최저선: 차이를 조금 줄인 역제안 · 그 아래: 기대치를 밝힘(아주 낮으면 화냄)
//  수락이 아니면 인내심(%)이 기대와의 차이만큼 줄고, 이전보다 낮게 부르면 더. 0%면 떠남
export function negotiate(s: GameState, applicantId: string, salary: number, bonus: number): { ok: boolean; hired: boolean; message: string } {
  const a = s.applicants.find((x) => x.id === applicantId);
  const err = hireBlock(s, a);
  if (err) return { ok: false, hired: false, message: err };
  if (salary <= 0) return { ok: false, hired: false, message: '월급을 정하세요.' };
  if (bonus > s.cash) return { ok: false, hired: false, message: '사이닝 보너스를 낼 자금이 부족합니다.' };
  const N = H.nego;
  const n = negotiation(s, a!);
  const say = (m: NegoMsg) => n.log.push(m);
  const value = salary + bonus / N.bonusMonths;
  const want = a!.desiredSalary;
  const prev = [...n.log].reverse().find((m) => m.from === 'me');
  say({ from: 'me', text: '', salary, bonus });
  n.revealed = true;
  if (value >= want) {
    say({ from: 'them', text: '좋아요, 함께하겠습니다!', mood: 'happy' });
    return { ok: true, hired: true, message: hire(s, a!, salary, bonus) };
  }
  const ratio = value / want;
  // 인내심(%): 기대와 멀수록 많이 깎임. 이전보다 낮게 부르면 더
  // A-130: 이전보다 올려 부르면 덜 깎이고, 답마다 바뀐 인내심을 채팅에 같이 보여 줌
  let drop = N.dropBase + (1 - ratio) * N.dropPerGap;
  const prevValue = prev ? (prev.salary ?? 0) + (prev.bonus ?? 0) / N.bonusMonths : null;
  if (prevValue !== null && value < prevValue) drop += N.lowerPenalty;
  if (prevValue !== null && value > prevValue) drop *= N.raiseKeep;
  const before = n.patience;
  n.patience = Math.max(0, Math.round(n.patience - drop));
  const dp = n.patience - before;
  if (n.patience <= 0) {
    a!.status = 'rejected';
    n.counter = null;
    say({ from: 'them', text: '더 이야기해도 맞지 않을 것 같네요. 다른 곳을 알아보겠습니다.', mood: 'angry', patience: dp });
    return { ok: true, hired: false, message: `${a!.name}님이 협상을 끝내고 떠났습니다.` };
  }
  // 역제안: 보너스는 그대로 두고 월급으로 맞춤
  const target = ratio >= n.floor ? want - (want - value) * (1 - N.counterKeep) : want;
  const cs = round10(target - bonus / N.bonusMonths);
  n.counter = { salary: cs, bonus };
  const raised = prevValue !== null && value > prevValue;
  const lead = raised ? pick(s, ['올려 주셔서 감사해요. ', '신경 써 주신 건 알겠어요. ']) : prevValue !== null && value < prevValue ? pick(s, ['오히려 내려가네요? ', '아까보다 낮아졌는데요. ']) : '';
  if (ratio >= n.floor) say({ from: 'them', text: `${lead}${pick(s, ['조금만 더 맞춰 주시면 좋겠어요.', '거의 다 왔어요.', '한 걸음만 더 와 주시면요.'])} 월 ${man(cs)}이면 함께하고 싶어요.`, salary: cs, bonus, mood: 'ok', patience: dp });
  else if (ratio >= N.insult) say({ from: 'them', text: `${lead}${pick(s, ['기대보다 낮네요.', '생각한 것과 차이가 있네요.'])} 월 ${man(cs)}은 받아야 합니다.`, salary: cs, bonus, mood: 'ok', patience: dp });
  else say({ from: 'them', text: `${lead}${pick(s, ['너무 낮은 제안이에요.', '이 조건은 좀 실망스럽네요.'])} 적어도 월 ${man(cs)}은 생각하고 왔습니다.`, salary: cs, bonus, mood: 'angry', patience: dp });
  return { ok: true, hired: false, message: '' };
}

// 지원자의 마지막 역제안을 그대로 받아들여 채용
export function acceptCounter(s: GameState, applicantId: string): { ok: boolean; message: string } {
  const a = s.applicants.find((x) => x.id === applicantId);
  const err = hireBlock(s, a);
  if (err) return { ok: false, message: err };
  const c = a!.nego?.counter;
  if (!c) return { ok: false, message: '받아들일 역제안이 없습니다.' };
  if (c.bonus > s.cash) return { ok: false, message: '사이닝 보너스를 낼 자금이 부족합니다.' };
  a!.nego!.log.push({ from: 'me', text: '그 조건으로 하시죠.', salary: c.salary, bonus: c.bonus });
  a!.nego!.log.push({ from: 'them', text: '감사합니다! 내일부터 출근하겠습니다.', mood: 'happy' });
  a!.nego!.counter = null;
  return { ok: true, message: hire(s, a!, c.salary, c.bonus) };
}

function reserve(s: GameState, a: Applicant, salary: number) {
  const seat = takeDesk(s)!;
  seat.occupant = `pending:${a.id}`;
  s.pendingHires.push({ applicantId: a.id, name: a.name, dept: a.dept, grade: a.grade, years: a.years, salary, traits: a.traits, startDay: s.day + 1, skill: a.skill, talent: a.talent });
  s.events.push({ type: 'autosave', reason: '채용 확정' });
}

export function rejectApplicant(s: GameState, id: string) {
  const a = s.applicants.find((x) => x.id === id);
  if (a && a.status === 'waiting') a.status = 'rejected';
}

export function startPendingHires(s: GameState) {
  const due = s.pendingHires.filter((h) => h.startDay <= s.day);
  s.pendingHires = s.pendingHires.filter((h) => h.startDay > s.day);
  for (const h of due) {
    const seat = s.seats.find((x) => x.occupant === `pending:${h.applicantId}`) ?? null;
    const e: Employee = {
      id: nextId(s, 'e'),
      name: h.name,
      dept: h.dept,
      salary: h.salary,
      grade: h.grade,
      years: h.years,
      joinedDay: s.day,
      seatId: seat ? seat.id : null,
      kind: 'staff',
      traits: h.traits,
      skill: h.skill ?? startSkill(s, h.grade, h.years),
      talent: h.talent,
      sat: 72,
      health: 85,
      lead: false,
      options: 0,
      optionDay: null,
      sickUntil: null,
      leaving: null,
      lastRaiseDay: s.day,
      bubble: { text: 'box', until: s.day + 2 },
    };
    if (seat) seat.occupant = e.id;
    s.employees.push(e);
    s.stats.hires += 1;
    onEmployeeJoined(s, e);
    s.events.push({ type: 'hired', empId: e.id });
    float(s, `+${dept(h.dept).name}`, 'good', seat?.id);
  }
  s.company.peakEmployees = Math.max(s.company.peakEmployees, s.employees.length);
}

// HR-07 인사팀 위임 채용: 부서별 목표 인원까지 인사팀이 알아서 뽑습니다(인사팀 인원이 많을수록 빠름).
export function setAutoHire(s: GameState, d: DeptId, target: number): string | null {
  if (!s.employees.some((e) => e.dept === 'hr')) return '인사팀이 있어야 채용을 맡길 수 있습니다.';
  s.company.autoHire[d] = Math.max(0, Math.round(target));
  return null;
}

function autoHireDay(s: GameState) {
  const hr = s.employees.filter((e) => e.dept === 'hr' && !(e.sickUntil && e.sickUntil > s.day)).length;
  if (!hr) return;
  const speed = 0.12 * hr * (1 + 0.6 * orderShare(s, 'hr', 'hr_recruit')) * econ(s, 'apply');
  for (const [d, target] of Object.entries(s.company.autoHire) as [DeptId, number][]) {
    if (!target) continue;
    const have = s.employees.filter((e) => e.dept === d && e.leaving === null).length + s.pendingHires.filter((h) => h.dept === d).length;
    if (have >= target || seatsAvailable(s) === 0) continue;
    if (rand(s) >= Math.min(0.9, speed)) continue;
    const a = rollApplicant(s, d, s.company.autoHireLevel, 'auto');
    // 인사팀은 C등급을 한 번 걸러 냅니다.
    if (a.grade === 'C' && rand(s) < 0.5) continue;
    if (s.cash < projectedMonthlyPayroll(s, a.desiredSalary) * 1.2) {
      notify(s, '위임 채용: 자금이 넉넉하지 않아 인사팀이 채용을 잠시 멈췄습니다.', 'bad', 'hiring');
      s.company.autoHire = {};
      return;
    }
    spendNow(s, `위임 채용 수수료(${dept(d).name})`, Math.round(a.desiredSalary * 0.3), 'recruiting');
    a.status = 'hired';
    s.applicants.push(a);
    reserve(s, a, a.desiredSalary);
  }
}

export function traitNames(ids: string[]): string {
  return ids.map((t) => trait(t)?.name ?? t).join(' · ');
}
