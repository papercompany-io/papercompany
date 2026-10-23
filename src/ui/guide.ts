// 상황 안내(A-244): tutorial.json guides의 when·done 조건을 지금 게임 상태로 풉니다. 새 상태 없이 있는 데이터에서만 계산.
// 조건 글자: 이름 하나("mvp", 앞에 !면 반대) 또는 지표 비교("staff>=1", "days>=3"). 지표는 progress.ts metric + 아래 NUMS
import { hasMvp, canCharge } from '../core/product';
import { activeRound, openRound } from '../core/funding';
import { contractsOpen, hasActiveContract } from '../core/contracts';
import { milestones } from '../core/milestones';
import { inNight } from '../core/night';
import { isFull } from '../core/office';
import { runwayMonths } from '../core/finance';
import { adSalesOn } from '../core/adsales';
import { metric } from '../core/progress';
import DATA from '../data/tutorial.json';
import type { GameState } from '../core/types';

export interface GuideDef {
  id: string;
  when: string[];
  done?: string[];
  targets: string[]; // 앞일수록 정확한 자리(창 안 버튼), 마지막은 늘 보이는 곳(왼쪽 메뉴 등)
  title: string;
  text: string;
}
export const GUIDES = DATA.guides as GuideDef[];

const FLAGS: Record<string, (s: GameState) => boolean> = {
  mvp: hasMvp,
  charge: (s) => canCharge(s),
  round: (s) => !!activeRound(s),
  roundNoLetters: (s) => {
    const r = openRound(s);
    return !!r && Object.keys(r.letters).length === 0;
  },
  roundNoLead: (s) => {
    const r = openRound(s);
    return !!r && !r.leadId;
  },
  roundOffer: (s) => activeRound(s)?.status === 'offer',
  applicants: (s) => s.applicants.some((a) => a.status === 'waiting'),
  decisions: (s) => s.decisions.some((d) => !d.resolved),
  contractsOpen,
  contractActive: hasActiveContract,
  milestoneOffer: (s) => milestones(s).some((m) => m.status === 'offer'),
  night: inNight,
  officeFull: (s) => isFull(s) && s.company.officeTier < 5,
  runwayLow: (s) => {
    const rw = runwayMonths(s);
    return !s.public && rw !== null && rw < 4;
  },
  adSales: adSalesOn,
  public: (s) => !!s.public,
};

const NUMS: Record<string, (s: GameState) => number> = {
  days: (s) => s.day - s.company.startDay, // 창업하고 지난 날
  months: (s) => s.plHistory.length, // 마감한 달 수
  missions: (s) => s.company.missionsDone.length,
};

function test(s: GameState, cond: string): boolean {
  const m = /^(\w+)(>=|<=|>|<|=)(-?[\d.]+)$/.exec(cond);
  if (m) {
    const v = (NUMS[m[1]] ?? ((g: GameState) => metric(g, m[1])))(s);
    const n = Number(m[3]);
    return m[2] === '>=' ? v >= n : m[2] === '<=' ? v <= n : m[2] === '>' ? v > n : m[2] === '<' ? v < n : v === n;
  }
  const not = cond.startsWith('!');
  const f = FLAGS[not ? cond.slice(1) : cond];
  if (!f) throw new Error(`tutorial.json: 모르는 조건 "${cond}"`);
  return f(s) !== not;
}

export const allTrue = (s: GameState, conds: string[] | undefined) => !!conds && conds.every((c) => test(s, c));
