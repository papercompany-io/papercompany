// src/data/*.json 접근 함수. 수치는 모두 JSON에 있고 [예시값]입니다.
import specs from '../data/founderSpecs.json';
import depts from '../data/departments.json';
import candidates from '../data/candidates.json';
import names from '../data/names.json';
import hiring from '../data/hiring.json';
import instructions from '../data/instructions.json';
import finance from '../data/finance.json';
import time from '../data/time.json';
import ceo from '../data/ceo.json';
import product from '../data/product.json';
import valuation from '../data/valuation.json';
import funding from '../data/funding.json';
import investors from '../data/investors.json';
import exitData from '../data/exit.json';
import office from '../data/office.json';
import type { DeptId, GameState, Grade, StageId } from './types';

export const DATA = { specs, depts, candidates, names, hiring, instructions, finance, time, ceo, product, valuation, funding, investors, exit: exitData, office };

export type SpecEffects = {
  investorMeeting: number;
  applicantQuality: number;
  sales: number;
  dev: number;
  enterpriseSales: number;
  networking: number;
  allActions: number;
  teamScore: number;
  earlyRound: 'hard' | 'ok' | 'big';
};

export function specItem(id: string) {
  for (const c of specs.categories) {
    const it = c.items.find((i) => i.id === id);
    if (it) return it;
  }
  throw new Error('unknown spec ' + id);
}

// FS-03 스펙 효과 합산
export function specEffects(picks: Record<string, string>): SpecEffects {
  const e: SpecEffects = { investorMeeting: 0, applicantQuality: 0, sales: 0, dev: 0, enterpriseSales: 0, networking: 0, allActions: 0, teamScore: 0, earlyRound: 'hard' };
  for (const id of Object.values(picks)) {
    const fx = specItem(id).effects as Record<string, number | string>;
    for (const [k, v] of Object.entries(fx)) {
      if (k === 'earlyRound') e.earlyRound = v as SpecEffects['earlyRound'];
      else (e as unknown as Record<string, number>)[k] += v as number;
    }
  }
  return e;
}

export function specCreditsSpent(picks: Record<string, string>): number {
  return Object.values(picks).reduce((sum, id) => sum + specItem(id).price, 0);
}

export function dept(id: DeptId) {
  const d = depts.departments.find((x) => x.id === id);
  if (!d) throw new Error('unknown dept ' + id);
  return d;
}

export const DEPT_IDS = depts.departments.map((d) => d.id) as DeptId[];

export function stage(id: StageId) {
  const st = funding.stages.find((x) => x.id === id);
  if (!st) throw new Error('unknown stage ' + id);
  return st;
}

export function stageIndex(id: StageId | null): number {
  return id === null ? -1 : funding.stages.findIndex((x) => x.id === id);
}

export function investor(id: string) {
  const inv = investors.investors.find((x) => x.id === id);
  if (!inv) throw new Error('unknown investor ' + id);
  return inv;
}

export function instructionOption(id: string) {
  const o = instructions.options.find((x) => x.id === id);
  if (!o) throw new Error('unknown instruction ' + id);
  return o;
}

export function gradeOutput(g: Grade): number {
  return (hiring.gradeOutput as Record<Grade, number>)[g];
}

export function productStage(points: number) {
  let cur = product.stages[0];
  for (const st of product.stages) if (points >= st.min) cur = st;
  return cur;
}

export function hasMvp(s: GameState): boolean {
  return s.productPoints >= product.stages.find((x) => x.id === 'mvp')!.min;
}

export function isScaleUp(s: GameState): boolean {
  return s.productPoints >= product.stages.find((x) => x.id === 'scale')!.min;
}
