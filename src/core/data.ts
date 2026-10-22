// src/data/*.json 접근 함수. 수치는 모두 JSON에 있고 [예시값]입니다.
import specs from '../data/founderSpecs.json';
import depts from '../data/departments.json';
import candidates from '../data/candidates.json';
import names from '../data/names.json';
import hiring from '../data/hiring.json';
import finance from '../data/finance.json';
import time from '../data/time.json';
import ceo from '../data/ceo.json';
import valuation from '../data/valuation.json';
import funding from '../data/funding.json';
import investors from '../data/investors.json';
import exitData from '../data/exit.json';
import industries from '../data/industries.json';
import markets from '../data/markets.json';
import featuresData from '../data/features.json';
import orders from '../data/orders.json';
import offices from '../data/offices.json';
import furniture from '../data/furniture.json';
import welfare from '../data/welfare.json';
import traits from '../data/traits.json';
import ai from '../data/ai.json';
import economy from '../data/economy.json';
import career from '../data/career.json';
import missions from '../data/missions.json';
import achievements from '../data/achievements.json';
import publicData from '../data/public.json';
import ads from '../data/ads.json';
import type { DeptId, Grade, IndustryId, MarketId, StageId } from './types';

export const DATA = {
  specs,
  depts,
  candidates,
  names,
  hiring,
  finance,
  time,
  ceo,
  valuation,
  funding,
  investors,
  exit: exitData,
  industries,
  markets,
  orders,
  offices,
  furniture,
  welfare,
  traits,
  ai,
  economy,
  career,
  missions,
  achievements,
  public: publicData,
  ads,
};

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
      if (k === 'earlyRound') {
        const rank = { hard: 0, ok: 1, big: 2 };
        if (rank[v as SpecEffects['earlyRound']] > rank[e.earlyRound]) e.earlyRound = v as SpecEffects['earlyRound'];
      } else (e as unknown as Record<string, number>)[k] += v as number;
    }
  }
  return e;
}

export function specCreditsSpent(picks: Record<string, string>): number {
  return Object.values(picks).reduce((sum, id) => sum + specItem(id).price, 0);
}

export interface DeptDef {
  id: DeptId;
  name: string;
  role: string;
  color: string;
  baseSalary: number;
  stage: number;
  cap?: Record<string, number>;
}

export const DEPTS = depts.departments as DeptDef[];
export const DEPT_IDS = DEPTS.map((d) => d.id);

export function dept(id: DeptId): DeptDef {
  const d = DEPTS.find((x) => x.id === id);
  if (!d) throw new Error('unknown dept ' + id);
  return d;
}

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

export function gradeOutput(g: Grade): number {
  return (hiring.gradeOutput as Record<Grade, number>)[g];
}

// ── 산업·시장 ──
export interface IndustryDef {
  id: IndustryId;
  name: string;
  unit: string;
  desc: string;
  friends: number;
  friendsPerNet: number;
  needsBilling?: boolean; // 결제 기능을 만들어야 구독·거래 매출이 생김(A-111)
  tam: number;
  adoption: { a0: number; a1: number; mid: number; k: number };
  price: number;
  payBase: number;
  adBase: number;
  gmv: number;
  takeBase: number;
  churnM: number;
  infra: number;
  viral: number;
  baseAcq: number;
  salesAcq: number;
  valMult: number;
  entBase: number;
  adCost: number;
  cac: number;
  salesPer: number;
  userValue: number;
  locked: boolean;
  startCompetitors: number;
  competitorNames: string[];
}

export const INDUSTRIES = industries.industries as IndustryDef[];

export function industry(id: IndustryId): IndustryDef {
  return INDUSTRIES.find((x) => x.id === id)!;
}

export interface MarketDef {
  id: MarketId;
  name: string;
  flag: string;
  tamMult: number;
  arpu: number;
  entry: number;
  comp: number;
  adCost: number;
  local: number;
}

export const MARKETS = markets.markets as MarketDef[];
export const MARKET_IDS = MARKETS.map((m) => m.id);

export function market(id: MarketId): MarketDef {
  return MARKETS.find((x) => x.id === id)!;
}

// ── 기능 ──
export interface FeatureFx {
  appeal?: number;
  conv?: number;
  churn?: number;
  pay?: number;
  arpu?: number;
  ad?: number;
  take?: number;
  gmv?: number;
  viral?: number;
  infra?: number;
  stability?: number;
  enterprise?: boolean;
  billing?: boolean; // 결제 기능(A-111): needsBilling 산업은 이게 있어야 돈을 받음
  market?: MarketId;
  bugs?: number;
  ai?: boolean;
}

export interface FeatureDef {
  id: string;
  name: string;
  desc: string;
  cat: string;
  dev: number;
  design: number;
  levels: number;
  req: string[];
  year: number;
  stage: number;
  fx: FeatureFx;
}

const FEATURES = featuresData.industries as unknown as Record<IndustryId, FeatureDef[]>;
// A-115 기능 착수 조건(고객 인사이트)·유지보수·복잡도 수치
export const FEATURE_RULES = featuresData.rules;

export function featuresOf(ind: IndustryId): FeatureDef[] {
  return FEATURES[ind];
}

const featureIndex = new Map<string, FeatureDef>();
for (const list of Object.values(FEATURES)) for (const f of list) featureIndex.set(f.id, f);

export function feature(id: string): FeatureDef {
  const f = featureIndex.get(id);
  if (!f) throw new Error('unknown feature ' + id);
  return f;
}

// 레벨 L(1부터)을 만드는 작업량: 레벨마다 ×1.8. 밸런싱 배수: 핵심 기능 ×1.4, 나머지 ×2.2(G4 봇 측정으로 조정, A-45)
export const WORK_MULT = { core: 1.4, other: 3.0 };
export function featureWork(f: FeatureDef, level: number) {
  const m = Math.pow(1.8, level - 1) * (f.cat === 'core' ? WORK_MULT.core : WORK_MULT.other);
  return { dev: Math.round(f.dev * m), design: Math.round(f.design * m) };
}

export function orderDef(id: string) {
  return orders.orders.find((o) => o.id === id);
}

export function ordersFor(d: DeptId) {
  return orders.orders.filter((o) => o.dept === d);
}

export interface OfficeTier {
  id: number;
  name: string;
  desc: string;
  deposit: number;
  rent: number;
  comfort: number;
  size: { w: number; h: number };
  ceo: { x: number; y: number };
  exec: { x: number; y: number };
  rooms: string[];
  home?: boolean; // 원룸 작업실(유리 대표실·라운지 없음)
  maxDesks: number; // 수용 인원: 놓을 수 있는 책상 최대 개수(A-80)
}

export const OFFICE_TIERS = offices.tiers as OfficeTier[];

export function officeTier(id: number): OfficeTier {
  return OFFICE_TIERS.find((t) => t.id === id) ?? OFFICE_TIERS[0];
}

export function trait(id: string) {
  return traits.traits.find((t) => t.id === id);
}

export function welfareItem(id: string) {
  return welfare.items.find((w) => w.id === id);
}

export function workPolicy(id: string) {
  return welfare.workPolicies.find((w) => w.id === id) ?? welfare.workPolicies[1];
}

export function aiModel(id: string) {
  return ai.models.find((m) => m.id === id);
}

export function aiVendor(id: string) {
  return ai.vendors.find((v) => v.id === id)!;
}

export function priceTierDef(id: string) {
  return industries.priceTiers.find((p) => p.id === id) ?? industries.priceTiers[1];
}
