// 외주 일감(A-79): 혼자 시작한 창업 초기에 남의 일을 해 주고 돈을 법니다. 대표 "외주" 칸과 개발팀 "외주 작업" 지시가 작업량을 넣습니다.
// 제품(MVP)에 쓸 시간을 떼어 내는 대신 런웨이를 늘리는 선택입니다.
import { book } from './finance';
import { nextId } from './ids';
import { notify } from './notify';
import { pick, randInt, randRange } from './rng';
import type { GameState } from './types';
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
}

export interface ContractState {
  offers: Contract[];
  active: Contract | null;
  nextOfferDay: number;
  completed: number;
}

export function contractsOpen(s: GameState): boolean {
  return !s.public && s.company.stage <= K.maxStage;
}

function ensure(s: GameState): ContractState {
  return (s.contracts ??= { offers: [], active: null, nextOfferDay: s.day, completed: 0 });
}

function makeOffer(s: GameState): Contract {
  const job = pick(s, K.jobs);
  const work = Math.round(randRange(s, job.work[0], job.work[1]) * 2) / 2;
  const pay = Math.round((work * K.ratePerWork * randRange(s, 0.8, 1.3)) / 100000) * 100000;
  // 대표 혼자 하루 평균 4칸쯤 쓴다고 보고 마감을 잡고 여유를 조금 더 줍니다.
  const days = Math.ceil(work / 0.5) + randInt(s, 3, 10);
  return { id: nextId(s, 'ct'), client: pick(s, K.clients), title: job.title, work, done: 0, pay, days, deadline: null, offeredUntil: s.day + K.offerEveryDays };
}

// 하루 끝: 제안 갱신, 진행 중 일감 마감 확인
export function contractsDay(s: GameState) {
  const c = ensure(s);
  c.offers = c.offers.filter((o) => o.offeredUntil > s.day);
  if (contractsOpen(s) && s.day >= c.nextOfferDay) {
    c.offers = Array.from({ length: K.offers }, () => makeOffer(s));
    c.nextOfferDay = s.day + K.offerEveryDays;
  }
  if (!contractsOpen(s)) c.offers = [];
  const a = c.active;
  if (a && a.deadline !== null && s.day > a.deadline + a.days) {
    c.active = null;
    s.career.rep = Math.max(0, s.career.rep - 2);
    notify(s, `외주 "${a.title}"(${a.client})가 마감을 크게 넘겨 취소됐습니다. 대금을 받지 못했고 명성이 떨어졌습니다.`, 'bad', 'schedule');
  }
}

export function acceptContract(s: GameState, id: string): string | null {
  const c = ensure(s);
  if (c.active) return '이미 진행 중인 외주가 있습니다. 끝내고 받으세요.';
  const o = c.offers.find((x) => x.id === id);
  if (!o) return '없는 일감입니다.';
  o.deadline = s.day + o.days;
  c.active = o;
  c.offers = c.offers.filter((x) => x.id !== id);
  notify(s, `외주 "${o.title}"(${o.client})를 받았습니다. 일정 메뉴에서 대표 "외주" 칸을 넣거나 개발팀에 "외주 작업"을 맡기세요.`, 'info', 'schedule');
  return null;
}

export function dropContract(s: GameState): string | null {
  const c = ensure(s);
  if (!c.active) return '진행 중인 외주가 없습니다.';
  const a = c.active;
  c.active = null;
  s.career.rep = Math.max(0, s.career.rep - 1);
  notify(s, `외주 "${a.title}"를 포기했습니다. 명성이 조금 떨어졌습니다.`, 'bad', 'schedule');
  return null;
}

export function hasActiveContract(s: GameState): boolean {
  return !!s.contracts?.active;
}

// 작업량 넣기(대표 칸·개발팀). 다 하면 대금을 받습니다. 넣고 남은 작업량을 돌려줍니다.
export function workOnContract(s: GameState, amount: number): number {
  const a = s.contracts?.active;
  if (!a || amount <= 0) return amount;
  const put = Math.min(amount, a.work - a.done);
  a.done += put;
  if (a.done >= a.work - 1e-6) finish(s);
  return amount - put;
}

function finish(s: GameState) {
  const c = ensure(s);
  const a = c.active!;
  c.active = null;
  c.completed += 1;
  const late = a.deadline !== null && s.day > a.deadline;
  const pay = Math.round(a.pay * (late ? K.latePayMult : 1));
  book(s, `외주 대금: ${a.title}(${a.client})`, pay);
  if (late) {
    s.career.rep = Math.max(0, s.career.rep - 1);
    notify(s, `외주 "${a.title}"를 늦게 끝내 대금을 ${Math.round(K.latePayMult * 100)}%만 받았습니다: ${Math.round(pay / 1e4).toLocaleString('ko-KR')}만원`, 'bad', 'schedule');
  } else {
    s.career.rep += 0.5;
    s.networkPoints += 2;
    notify(s, `외주 "${a.title}" 완료! 대금 ${Math.round(pay / 1e4).toLocaleString('ko-KR')}만원이 들어왔습니다.`, 'good', 'schedule');
    s.events.push({ type: 'float', text: `+${Math.round(pay / 1e4).toLocaleString('ko-KR')}만`, kind: 'money', seat: 'ceo' });
  }
}
