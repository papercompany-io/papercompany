// 진행 단계(0 차고 ~ 5 상장사)와 해금, 미션(튜토리얼·마일스톤), 업적. 지표 이름은 docs/CONTENT_SCHEMA.md 3절.
import { DATA, stageIndex } from './data';
import { avgAdoption } from './aiadopt';
import { careerStats, founderAge } from './career';
import { founderPct } from './equity';
import { book, lastRevenue } from './finance';
import { launchedMarkets, shares, totalUsers } from './market';
import { notify } from './notify';
import { coreFeatures, featureLevel, featuresDoneCount, hasMvp } from './product';
import { marketCap } from './public';
import { avgSat } from './staff';
import { computeValuation } from './valuation';
import type { GameState } from './types';

export const STAGE_NAMES = ['차고(창업)', 'MVP', '팀', '조직', '스케일업', '상장사'];

export const STAGE_UNLOCKS: string[][] = [
  ['대표 행동(개발·영업·투자자 미팅·네트워킹)', '제품 로드맵', '채용', '투자(엔젤~시드, SAFE)'],
  ['시장 메뉴(인지도·점유율·광고 예산)', '가격 정책', '마케팅·세일즈 지시 확장'],
  ['인사팀·고객지원팀', '복지·근무 방침', '사무실 이전', 'ESOP', '대기업 영업 지시', '기술 부채 정리'],
  ['인프라·재무법무·AI연구 부서', '대표 경영 모드', '상장 준비', '해외 진출(미국·유럽)'],
  ['경쟁사 인수(M&A)', '대형 해외 확장'],
  ['주가·분기 실적·가이던스', '지분 매각·자사주 매입', '대표 사임(Exit)'],
];

// 회사 단계: 한 번 오른 단계는 내려가지 않습니다.
export function computeStage(s: GameState): number {
  let st = 0;
  if (hasMvp(s)) st = 1;
  if (st >= 1 && s.employees.some((e) => e.kind === 'staff')) st = 2;
  if (st >= 2 && (stageIndex(s.fundingStage) >= stageIndex('B') || s.employees.length >= 20)) st = 3;
  if (st >= 3 && (stageIndex(s.fundingStage) >= stageIndex('C') || lastRevenue(s) * 12 >= 1e10)) st = 4;
  if (s.public) st = 5;
  return st;
}

export function updateStage(s: GameState) {
  const st = computeStage(s);
  if (st > s.company.stage) {
    for (let k = s.company.stage + 1; k <= st; k++) {
      notify(s, `회사 단계 ${k} "${STAGE_NAMES[k]}"에 올랐습니다! 새로 열림: ${STAGE_UNLOCKS[k].join(', ')}`, 'mission');
    }
    s.company.stage = st;
    s.events.push({ type: 'confetti' });
  }
}

export function metric(s: GameState, m: string): number {
  const cs = careerStats(s);
  switch (m) {
    case 'users':
      return totalUsers(s);
    case 'mrr':
      return lastRevenue(s);
    case 'valuation':
      return computeValuation(s).value;
    case 'employees':
      return s.employees.length;
    case 'staff':
      return s.employees.filter((e) => e.kind === 'staff').length;
    case 'cash':
      return s.cash;
    case 'featuresDone':
      return featuresDoneCount(s);
    case 'markets':
      return launchedMarkets(s).length;
    case 'stage':
      return s.company.stage;
    case 'fundingIndex':
      return stageIndex(s.fundingStage);
    case 'marketCap':
      return marketCap(s);
    case 'profitMonths':
      return s.company.profitStreak;
    case 'officeTier':
      return s.company.officeTier;
    case 'aiAdoption':
      return avgAdoption(s);
    case 'founderPct':
      return founderPct(s);
    case 'wealth':
      return s.career.wealth;
    case 'companies':
      return cs.companies;
    case 'exits':
      return cs.exits;
    case 'bankruptcies':
      return cs.bankruptcies;
    case 'ipos':
      return cs.ipos;
    case 'exitAmount':
      return cs.bestExit;
    case 'rep':
      return s.career.rep;
    case 'age':
      return founderAge(s);
    case 'acquisitions':
      return s.company.acquisitions;
    case 'share':
      return s.markets.kr.launched ? shares(s, 'kr').player : 0;
    case 'eventsDecided':
      return s.company.decisions + s.career.decisionsBefore;
    case 'bootstrapExit':
      return cs.bootstrapExits;
    case 'leads':
      return s.employees.filter((e) => e.lead).length;
    case 'enterprise':
      return s.company.enterpriseCount;
    case 'satAvg':
      return avgSat(s);
    case 'happyTeam':
      return s.employees.length >= 10 ? avgSat(s) : 0;
    case 'welfare':
      return s.company.welfare.length;
    case 'deptHr':
      return s.employees.filter((e) => e.dept === 'hr').length;
    case 'exitPct':
      return Math.max(0, ...s.career.companies.filter((c) => c.kind === 'sale' || c.kind === 'ipo_exit').map((c) => c.founderPct));
    case 'promisesKept':
      return s.milestones?.kept ?? 0; // 약속(A-177)
    case 'retired':
      return s.career.retired ? 1 : 0;
  }
  return 0;
}

function meets(v: number, c: { gte?: number; lte?: number }) {
  if (c.gte !== undefined) return v >= c.gte;
  if (c.lte !== undefined) return v <= c.lte;
  return false;
}

// 미션 진행률(0~1). MVP 미션은 핵심 기능 완성 비율로 보여 줍니다.
export function missionProgress(s: GameState, m: { metric: string; gte: number }): number {
  if (m.metric === 'stage' && m.gte === 1 && s.company.stage < 1) {
    const cores = coreFeatures(s);
    return cores.length ? (cores.filter((c) => featureLevel(s, c.id) >= 1).length / cores.length) * 0.99 : 0;
  }
  if (m.metric === 'stage') return s.company.stage >= m.gte ? 1 : s.company.stage / m.gte;
  const v = metric(s, m.metric);
  return Math.max(0, Math.min(1, m.gte > 0 ? v / m.gte : 0));
}

// 지금 보이는 미션(앞에서부터 안 깬 것 3개)
export function activeMissions(s: GameState) {
  return DATA.missions.missions.filter((m) => !s.company.missionsDone.includes(m.id)).slice(0, 3);
}

export function missionsDay(s: GameState) {
  for (const m of activeMissions(s)) {
    if (!meets(metric(s, m.metric), { gte: m.gte })) continue;
    s.company.missionsDone.push(m.id);
    s.career.missionsTotal += 1;
    const r = m.reward as { cash?: number; rep?: number; legacy?: number };
    const parts: string[] = [];
    if (r.cash) {
      book(s, `미션 보상: ${m.name}`, r.cash);
      parts.push(`자금 +${Math.round(r.cash / 1e4).toLocaleString('ko-KR')}만원`);
    }
    if (r.rep) {
      s.career.rep += r.rep;
      parts.push(`명성 +${r.rep}`);
    }
    if (r.legacy) {
      s.career.legacyEarned += r.legacy;
      parts.push(`레거시 +${r.legacy}`);
    }
    notify(s, `미션 완료: ${m.name}${parts.length ? ` (${parts.join(', ')})` : ''}`, 'mission');
  }
}

export function achievementsDay(s: GameState) {
  for (const a of DATA.achievements.achievements) {
    if (s.career.achievements.includes(a.id)) continue;
    if (!meets(metric(s, a.cond.metric), a.cond as { gte?: number; lte?: number })) continue;
    s.career.achievements.push(a.id);
    notify(s, `업적 달성: ${a.name} — ${a.desc}`, 'achievement', 'career');
  }
}
