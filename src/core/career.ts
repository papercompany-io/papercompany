// 커리어·메타(ED-01 성장 경로, ED-02 다중 엔딩·OQ-020 은퇴, ED-03 파산 엔딩, RK-01 로컬 명예의 전당, SC-01 결과 금액)
import { DATA } from './data';
import { yearFrac } from './calendar';
import { investorPct } from './equity';
import { news } from './notify';
import { guaranteedDebt } from './finance';
import { totalUsers } from './market';
import { computeValuation } from './valuation';
import type { CompanyEndKind, CompanyResult, GameState, Profile } from './types';

const CR = DATA.career;

export function legacyFx(s: GameState, key: string): number {
  let v = 0;
  for (const l of CR.legacy) {
    const lv = s.career.legacy[l.id] ?? 0;
    const fx = l.fx as unknown as Record<string, number | string>;
    if (lv > 0 && typeof fx[key] === 'number') v += (fx[key] as number) * lv;
  }
  return v;
}

export function legacyUnlocked(legacy: Record<string, number>, industryId: string): boolean {
  return CR.legacy.some((l) => (l.fx as Record<string, unknown>).unlock === industryId && (legacy[l.id] ?? 0) > 0);
}

export function founderAge(s: GameState): number {
  return s.career.startAge + (yearFrac(s.day) - s.career.startYear);
}

export function pathOf(s: GameState): string {
  const inv = investorPct(s);
  if (s.fundingStage === null && s.safes.length === 0) return '자력형';
  if (inv >= 0.3) return '투자형';
  return '혼합형';
}

export function pathSummary(path: string): string {
  if (path === '자력형') return '투자 없이 매출로 키워 지분을 지켰습니다.';
  if (path === '투자형') return '투자를 받아 빠르게 키우는 대신 지분을 많이 나눴습니다.';
  return '투자와 매출을 함께 쓰며 균형을 잡았습니다.';
}

export function legacyEarned(kind: CompanyEndKind, amount: number, stage: number, challenge: string | null): number {
  const base = Math.round(Math.log10(Math.max(1, amount / 1e7)) * 3) + stage * 2 + (kind === 'bankrupt' ? 2 : 0) + (kind === 'ipo_exit' ? 6 : 0);
  const mult = challenge ? (CR.challenges.find((c) => c.id === challenge)?.legacyMult ?? 1) : 1;
  return Math.max(1, Math.round(base * mult));
}

// 회사 한 판 끝(EX-04 성공, FL-01 파산, 해임, 상장 후 사임)
export function finishCompany(s: GameState, kind: CompanyEndKind, amount: number, opts: { exitValue?: number; founderPct?: number; reason?: string; alreadyPaid?: number } = {}) {
  const v = computeValuation(s).value;
  const result: CompanyResult = {
    kind,
    companyName: s.company.name,
    industry: s.company.industry,
    exitValue: opts.exitValue ?? 0,
    valuation: v,
    founderPct: opts.founderPct ?? 0,
    amount: Math.round(amount),
    day: s.day,
    startDay: s.company.startDay,
    reason: opts.reason,
    path: pathOf(s),
    funded: s.fundingStage !== null,
    maxValuation: Math.max(s.company.maxValuation, v),
    peakUsers: Math.max(s.company.peakUsers, totalUsers(s)),
    peakEmployees: s.company.peakEmployees,
    rounds: s.rounds.filter((r) => r.status === 'accepted').length,
  };
  s.result = result;
  s.ended = true;
  s.speed = 0;
  s.pauseReason = null;
  s.career.wealth += Math.round(amount - (opts.alreadyPaid ?? 0));
  // A-137 대표 개인 보증: 파산하면 남은 보증 대출을 창업자 자산에서 갚습니다(모자라면 있는 만큼)
  const owed = kind === 'bankrupt' ? guaranteedDebt(s) : 0;
  if (owed > 0) {
    const paid = Math.min(owed, Math.max(0, s.career.wealth));
    s.career.wealth -= paid;
    news(s, `[개인 보증] ${s.company.name} 대표, 회사 대출 ${paid >= 1e8 ? `${(paid / 1e8).toFixed(1)}억원` : `${Math.round(paid / 1e4).toLocaleString('ko-KR')}만원`}을 개인 돈으로 갚아`, 'company');
  }
  const big = Math.log10(Math.max(1, amount / 1e8) + 1) * 8;
  let rep = 0;
  if (kind === 'sale') rep = 5 + big;
  if (kind === 'ipo_exit') rep = 15 + big;
  if (kind === 'fired') rep = -4;
  if (kind === 'bankrupt') rep = (s.career.legacy.phoenix ?? 0) > 0 ? -4 : -8;
  s.career.rep = Math.max(0, s.career.rep + rep);
  s.career.legacyEarned += legacyEarned(kind, amount, s.company.stage, s.career.challenge);
  s.career.companies.push(result);
  const label = kind === 'sale' ? '매각' : kind === 'ipo_exit' ? '상장 후 대표 사임' : kind === 'bankrupt' ? '파산' : '대표 해임';
  news(s, `[${label}] ${s.company.name} — 창업자 몫 ${Math.round(amount / 1e8).toLocaleString('ko-KR')}억원`, 'company');
  s.events.push({ type: 'companyEnded' });
  s.events.push({ type: 'autosave', reason: '회사 종료' });
}

export function careerStats(s: GameState) {
  const cs = s.career.companies;
  return {
    companies: cs.length + (s.ended ? 0 : 1),
    exits: cs.filter((c) => c.kind === 'sale' || c.kind === 'ipo_exit').length,
    ipos: cs.filter((c) => c.kind === 'ipo_exit').length + (s.public && !s.ended ? 1 : 0),
    bankruptcies: cs.filter((c) => c.kind === 'bankrupt').length,
    bootstrapExits: cs.filter((c) => (c.kind === 'sale' || c.kind === 'ipo_exit') && !c.funded).length,
    maxValuation: Math.max(0, ...cs.map((c) => c.maxValuation), s.company.maxValuation),
    bestExit: Math.max(0, ...cs.map((c) => c.amount)),
  };
}

export function endingFor(s: GameState) {
  const st = careerStats(s);
  const vals: Record<string, number> = { wealth: s.career.wealth, ipos: st.ipos, exits: st.exits, bankruptcies: st.bankruptcies, bootstrapExits: st.bootstrapExits, maxValuation: st.maxValuation };
  for (const e of CR.endings) {
    const c = e.cond as Record<string, number>;
    if (Object.entries(c).every(([k, v]) => (vals[k] ?? 0) >= v)) return e;
  }
  return CR.endings[CR.endings.length - 1];
}

export function canRetire(s: GameState): boolean {
  return s.ended;
}

export function retire(s: GameState) {
  s.career.retired = true;
  s.career.endingId = endingFor(s).id;
  s.events.push({ type: 'autosave', reason: '은퇴' });
}

export function mustRetire(s: GameState): boolean {
  return founderAge(s) >= CR.retireAge;
}

// 프로필(메타): 회사가 끝날 때 레거시 점수·명예의 전당을 반영합니다.
export function emptyProfile(): Profile {
  return { version: 1, legacyPoints: 0, legacy: {}, achievements: [], hall: [], companyHall: [], careers: 0 };
}

export function recordCompanyInProfile(p: Profile, s: GameState, dateLabel: string) {
  const r = s.result;
  if (!r) return;
  p.legacyPoints += legacyEarned(r.kind, r.amount, s.company.stage, s.career.challenge);
  p.companyHall.push({ company: r.companyName, founder: s.career.founderName, kind: r.kind, amount: r.amount, date: dateLabel });
  p.companyHall.sort((a, b) => b.amount - a.amount);
  p.companyHall = p.companyHall.slice(0, 30);
}

export function recordCareerInProfile(p: Profile, s: GameState, dateLabel: string) {
  const e = endingFor(s);
  const best = [...s.career.companies].sort((a, b) => b.amount - a.amount)[0];
  p.hall.push({ name: s.career.founderName, ending: e.name, wealth: s.career.wealth, companies: s.career.companies.length, best: best ? best.companyName : '-', date: dateLabel, challenge: s.career.challenge });
  p.hall.sort((a, b) => b.wealth - a.wealth);
  p.hall = p.hall.slice(0, 30);
  p.careers += 1;
}

export function legacyCost(id: string, level: number): number | null {
  const l = CR.legacy.find((x) => x.id === id);
  if (!l || level >= l.max) return null;
  return l.cost[level];
}

export function buyLegacy(p: Profile, id: string): string | null {
  const lv = p.legacy[id] ?? 0;
  const cost = legacyCost(id, lv);
  if (cost === null) return '최대 레벨입니다.';
  if (p.legacyPoints < cost) return '레거시 점수가 부족합니다.';
  p.legacyPoints -= cost;
  p.legacy[id] = lv + 1;
  return null;
}
