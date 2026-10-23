// 외주 일감(A-79): 혼자 시작한 창업 초기에 남의 일을 해 주고 돈을 법니다. 대표 "외주" 칸과 개발팀 "외주 작업" 지시가 작업량을 넣습니다.
// 제품(MVP)에 쓸 시간을 떼어 내는 대신 런웨이를 늘리는 선택입니다.
// A-238: 외주를 동시에 여러 개(maxActive) 진행하고, 외주마다 사람·부서를 배치(staff·squadId). 배치된 사람은 끝날 때까지 그 외주만 함(assign.contractOf).
// A-144: 외주 평판(trust) — 제때 끝내면 오르고, 늦거나 포기하면 깎임. 단계가 오르면 큰 일감이 섞이고 대금 단가가 오릅니다.
import { book } from './finance';
import { contractOf } from './assign';
import { nextId } from './ids';
import { notify } from './notify';
import { pick, randInt, randRange } from './rng';
import type { Employee, GameState } from './types';
import contractsData from '../data/contracts.json';

const K = contractsData;

export interface Contract {
  id: string;
  client: string;
  title: string;
  work: number;
  done: number;
  pay: number;
  days: number; // 받은 날부터 마감까지
  deadline: number | null; // 받으면 정해짐
  offeredUntil: number;
  tier?: number; // A-144: 일감 단계(0~3). 예전 저장은 없음 = 0
  staff?: string[]; // A-238: 배치한 직원 id
  squadId?: string | null; // A-238: 배치한 부서
}

export interface ContractState {
  offers: Contract[];
  actives?: Contract[]; // A-238 진행 중인 외주들(마감 가까운 순이 아님, 받은 순)
  active?: Contract | null; // 예전 저장(한 개만). 불러오면 actives로 옮김
  nextOfferDay: number;
  completed: number;
  trust?: number; // A-144: 외주 평판. 예전 저장은 없음 = 0
  alert?: boolean; // A-208: 제안 목록이 새로 바뀌면 알림. 플레이어가 외주 창에서 켬(기본 끔)
}

export type ContractOutcome = 'early' | 'onTime' | 'late' | 'drop' | 'cancel';

// A-144: 외주 평판 단계. 화면에는 이름과 다음 단계까지 남은 정도만 보여 줍니다(단가 배율은 숨김).
export function trustLevel(s: GameState) {
  const trust = s.contracts?.trust ?? 0;
  const levels = K.trust.levels;
  let i = 0;
  while (i + 1 < levels.length && trust >= levels[i + 1].min) i++;
  const next = levels[i + 1] ?? null;
  const progress = next ? Math.max(0, Math.min(1, (trust - levels[i].min) / (next.min - levels[i].min))) : 1;
  return { index: i, name: levels[i].name, rateMult: levels[i].rateMult, next: next?.name ?? null, progress, trust };
}

// A-144: 끝난 모양(일찍·제때·늦게·포기·취소)과 일감 크기로 평판이 얼마나 바뀌나
// A-172: 비어 있어 늘 0이던 것을 채움. 큰 일감일수록 많이 오르고 많이 깎임
export function trustDelta(outcome: ContractOutcome, a: Contract): number {
  const T = K.trust;
  const tier = Math.max(0, Math.min(T.gain.length - 1, a.tier ?? 0));
  if (outcome === 'early') return T.gain[tier] * T.earlyMult;
  if (outcome === 'onTime') return T.gain[tier];
  return -(T.loss[outcome] + T.lossPerTier * tier);
}

function changeTrust(s: GameState, outcome: ContractOutcome, a: Contract) {
  const c = ensure(s);
  const before = trustLevel(s).index;
  c.trust = Math.max(0, (c.trust ?? 0) + trustDelta(outcome, a));
  const after = trustLevel(s);
  if (after.index > before) notify(s, `외주 평판이 올라 "${after.name}"가 됐습니다. 고객사 사이에 소문이 나서 더 큰 일감이 들어옵니다.`, 'good', 'contract');
  else if (after.index < before) notify(s, `외주 평판이 떨어져 "${after.name}"로 내려갔습니다. 큰 일감 제안이 줄어듭니다.`, 'bad', 'contract');
}

export function contractsOpen(s: GameState): boolean {
  return !s.public && s.company.stage <= K.maxStage;
}

function ensure(s: GameState): ContractState {
  const c = (s.contracts ??= { offers: [], actives: [], nextOfferDay: s.day, completed: 0 });
  c.trust ??= 0;
  if (!c.actives) {
    c.actives = c.active ? [c.active] : [];
    delete c.active;
  }
  return c;
}

const ST = K.staffing;

// 진행 중인 외주들(A-238)
export function activeContracts(s: GameState): Contract[] {
  return s.contracts ? ensure(s).actives! : [];
}

// 마감이 가장 가까운 외주(대표 칸·배치 없는 "외주 작업"이 들어감)
export function nearestContract(s: GameState): Contract | undefined {
  return [...activeContracts(s)].sort((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0))[0];
}

export function canStaff(e: Employee): boolean {
  return (ST.staffDepts as string[]).includes(e.dept) && e.leaving === null;
}

// 이 외주에 배치된 사람(사람 배치가 부서 배치보다 먼저: 다른 외주에 따로 배치된 사람은 빠짐)
export function contractWorkers(s: GameState, a: Contract): Employee[] {
  return s.employees.filter((e) => canStaff(e) && staffedOn(s, e)?.id === a.id);
}

// 이 사람이 배치된 외주
export function staffedOn(s: GameState, e: Employee): Contract | undefined {
  const hit = contractOf(s, e);
  return hit ? activeContracts(s).find((a) => a.id === hit.id) : undefined;
}

// 사람 배치 켜기·끄기. 한 사람은 외주 하나에만
export function setContractStaff(s: GameState, ctId: string, empId: string, on: boolean): string | null {
  const a = activeContracts(s).find((x) => x.id === ctId);
  const e = s.employees.find((x) => x.id === empId);
  if (!a || !e) return '외주나 직원을 찾을 수 없습니다.';
  if (on && !canStaff(e)) return '개발·디자인 직원만 외주에 배치할 수 있습니다.';
  for (const x of activeContracts(s)) x.staff = (x.staff ?? []).filter((id) => id !== empId);
  if (on) a.staff!.push(empId);
  return null;
}

// 부서 배치(null이면 뺌). 한 부서는 외주 하나에만
export function setContractSquad(s: GameState, ctId: string, squadId: string | null): string | null {
  const a = activeContracts(s).find((x) => x.id === ctId);
  if (!a) return '외주를 찾을 수 없습니다.';
  if (squadId) for (const x of activeContracts(s)) if (x.squadId === squadId) x.squadId = null;
  a.squadId = squadId;
  return null;
}

function makeOffer(s: GameState, tier: number): Contract {
  const job = pick(s, K.jobs.filter((j) => j.tier === tier));
  const work = Math.round(randRange(s, job.work[0], job.work[1]) * 2) / 2;
  const pay = Math.round((work * K.ratePerWork * trustLevel(s).rateMult * randRange(s, 0.8, 1.3)) / 100000) * 100000;
  // 대표 혼자 하루 평균 4칸쯤 쓴다고 보고 마감을 잡고 여유를 조금 더 줍니다.
  const days = Math.ceil(work / 0.5) + randInt(s, 3, 10);
  const client = pick(s, tier >= 2 ? K.bigClients : K.clients);
  return { id: nextId(s, 'ct'), client, title: job.title, work, done: 0, pay, days, deadline: null, offeredUntil: s.day + K.offerEveryDays, tier };
}

// 하루 끝: 제안 갱신, 진행 중 일감 마감 확인
export function contractsDay(s: GameState) {
  const c = ensure(s);
  c.offers = c.offers.filter((o) => o.offeredUntil > s.day);
  if (contractsOpen(s) && s.day >= c.nextOfferDay) {
    // A-144: 첫 제안은 지금 평판 단계의 일감, 나머지는 그 아래 단계에서 섞음
    const lv = trustLevel(s).index;
    c.offers = Array.from({ length: K.offers }, (_, i) => makeOffer(s, i === 0 ? lv : randInt(s, 0, lv)));
    c.nextOfferDay = s.day + K.offerEveryDays;
    if (c.alert) notify(s, `새 외주 제안 ${c.offers.length}건이 들어왔습니다.`, 'info', 'contract'); // A-208
  }
  if (!contractsOpen(s)) c.offers = [];
  for (const a of [...c.actives!]) {
    if (a.deadline === null || s.day <= a.deadline + a.days) continue;
    c.actives = c.actives!.filter((x) => x !== a);
    s.career.rep = Math.max(0, s.career.rep - 2);
    notify(s, `외주 "${a.title}"(${a.client})가 마감을 크게 넘겨 취소됐습니다. 대금을 받지 못했고 명성이 떨어졌습니다.`, 'bad', 'contract');
    changeTrust(s, 'cancel', a);
  }
}

export function acceptContract(s: GameState, id: string): string | null {
  const c = ensure(s);
  if (c.actives!.length >= ST.maxActive) return `외주는 동시에 ${ST.maxActive}개까지 진행할 수 있습니다. 하나를 끝내고 받으세요.`;
  const o = c.offers.find((x) => x.id === id);
  if (!o) return '없는 일감입니다.';
  o.deadline = s.day + o.days;
  o.staff = [];
  o.squadId = null;
  c.actives!.push(o);
  c.offers = c.offers.filter((x) => x.id !== id);
  notify(s, `외주 "${o.title}"(${o.client})를 받았습니다. 외주 창에서 사람이나 부서를 배치하거나, 대표 주 업무를 "외주"로 바꾸세요.`, 'info', 'contract');
  return null;
}

export function dropContract(s: GameState, id?: string): string | null {
  const c = ensure(s);
  const a = id ? c.actives!.find((x) => x.id === id) : c.actives![0];
  if (!a) return '진행 중인 외주가 없습니다.';
  c.actives = c.actives!.filter((x) => x !== a);
  s.career.rep = Math.max(0, s.career.rep - 1);
  notify(s, `외주 "${a.title}"를 포기했습니다. 명성이 조금 떨어졌습니다.`, 'bad', 'contract');
  changeTrust(s, 'drop', a);
  return null;
}

// A-208: 외주 창 왼쪽 아래 "새 제안 알림 받기"
export function setContractAlert(s: GameState, on: boolean) {
  ensure(s).alert = on;
}

export function hasActiveContract(s: GameState): boolean {
  return activeContracts(s).length > 0;
}

// 작업량 넣기. id가 없으면 마감이 가장 가까운 외주(대표 칸·배치 없는 "외주 작업"). 다 하면 대금을 받습니다. 넣고 남은 작업량을 돌려줍니다.
export function workOnContract(s: GameState, amount: number, id?: string): number {
  const a = id ? activeContracts(s).find((x) => x.id === id) : nearestContract(s);
  if (!a || amount <= 0) return amount;
  const put = Math.min(amount, a.work - a.done);
  a.done += put;
  if (a.done >= a.work - 1e-6) finish(s, a);
  return amount - put;
}

function finish(s: GameState, a: Contract) {
  const c = ensure(s);
  c.actives = c.actives!.filter((x) => x !== a);
  c.completed += 1;
  const late = a.deadline !== null && s.day > a.deadline;
  const pay = Math.round(a.pay * (late ? K.latePayMult : 1));
  book(s, `외주 대금: ${a.title}(${a.client})`, pay);
  if (late) {
    s.career.rep = Math.max(0, s.career.rep - 1);
    notify(s, `외주 "${a.title}"를 늦게 끝내 대금을 ${Math.round(K.latePayMult * 100)}%만 받았습니다: ${Math.round(pay / 1e4).toLocaleString('ko-KR')}만원`, 'bad', 'contract');
  } else {
    s.career.rep += 0.5;
    s.networkPoints += 2;
    notify(s, `외주 "${a.title}" 완료. 대금 ${Math.round(pay / 1e4).toLocaleString('ko-KR')}만원이 들어왔습니다.${a.staff?.length || a.squadId ? ' 배치했던 사람은 원래 부서 일로 돌아갑니다.' : ''}`, 'good', 'contract');
    s.events.push({ type: 'float', text: `+${Math.round(pay / 1e4).toLocaleString('ko-KR')}만`, kind: 'money', seat: 'ceo' });
  }
  // 마감까지 기간의 30% 이상 남기고 끝내면 "일찍"
  const early = !late && a.deadline !== null && a.deadline - s.day >= a.days * 0.3;
  changeTrust(s, late ? 'late' : early ? 'early' : 'onTime', a);
}
