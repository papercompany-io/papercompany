// CA-01 하루 행동 칸 배분, CA-02 창업자 스펙 효율, CA-03 조직이 생긴 뒤 대표 행동(대기업 영업·결재·인맥·투자자 미팅, DEC-027·DEC-033)
import { DATA, specEffects } from './data';
import { openRound } from './funding';
import { legacyFx } from './career';
import { applyWork, hasMvp } from './product';
import type { ActionId, GameState } from './types';

const C = DATA.ceo;

export const FOUNDER_ACTIONS: ActionId[] = ['dev', 'sales', 'ir', 'network'];
export const EXEC_ACTIONS: ActionId[] = ['enterprise', 'approve', 'network', 'ir'];

export function actionDef(id: ActionId) {
  return C.actions.find((a) => a.id === id)!;
}

export function modeActions(s: GameState): ActionId[] {
  return s.company.ceoMode === 'executive' ? EXEC_ACTIONS : FOUNDER_ACTIONS;
}

// CA-02 효율 = 1 + (해당 스펙 % + 모든 행동 %) / 100 + 레거시
export function efficiency(s: GameState, id: ActionId): number {
  const fx = specEffects(s.founder.picks) as unknown as Record<string, number>;
  const key = actionDef(id).specKey;
  return 1 + ((fx[key] ?? 0) + fx.allActions) / 100 + legacyFx(s, 'ceo');
}

export function allocTotal(alloc: Record<ActionId, number>): number {
  return (Object.keys(alloc) as ActionId[]).reduce((sum, k) => sum + alloc[k], 0);
}

// FR-13 라운드 중에는 앞 4칸이 투자자 미팅으로 묶입니다(A-16, DEC-041).
export function daySchedule(s: GameState): { action: ActionId | null; locked: boolean }[] {
  const n = DATA.time.slotsPerDay;
  const own: ActionId[] = [];
  for (const k of modeActions(s)) for (let i = 0; i < s.ceoAlloc[k]; i++) own.push(k);
  const out: { action: ActionId | null; locked: boolean }[] = [];
  const locked = openRound(s) ? DATA.funding.lockedSlots : 0;
  for (let i = 0; i < locked; i++) out.push({ action: 'ir', locked: true });
  for (let i = 0; out.length < n; i++) out.push({ action: own[i] ?? null, locked: false });
  return out;
}

export function setAlloc(s: GameState, id: ActionId, value: number): string | null {
  if (!modeActions(s).includes(id)) return '지금 대표 모드에서 쓸 수 없는 행동입니다.';
  const next = { ...s.ceoAlloc, [id]: Math.max(0, Math.round(value)) };
  const sum = modeActions(s).reduce((a, k) => a + next[k], 0);
  if (sum > DATA.time.slotsPerDay) return `하루 행동 칸은 ${DATA.time.slotsPerDay}칸입니다.`;
  s.ceoAlloc = next;
  return null;
}

// CA-03 전환: 시리즈 B 이상(DEC-033). 투자 없이 키운 회사는 직원 30명 이상(OQ-044 [Claude 제안] A-43)
export function executiveBlock(s: GameState): string | null {
  const b = ['B', 'C', 'D', 'E', 'F', 'G'].includes(s.fundingStage ?? '');
  if (!b && s.employees.length < 30) return '시리즈 B 이상이거나 직원 30명 이상이어야 전환할 수 있습니다.';
  return null;
}

export function setCeoMode(s: GameState, mode: 'founder' | 'executive'): string | null {
  if (mode === 'executive') {
    const err = executiveBlock(s);
    if (err) return err;
  }
  s.company.ceoMode = mode;
  const def = (mode === 'executive' ? C.executiveAlloc : C.defaultAlloc) as Record<ActionId, number>;
  s.ceoAlloc = { ...def };
  return null;
}

// 결재(CA-03, OQ-045 [Claude 제안] A-44): 직원 25명당 하루 1칸이 필요. 남으면 출력 +5%, 밀리면 최대 -20%
export function approveNeed(s: GameState): number {
  return s.company.ceoMode === 'executive' ? s.employees.length / C.approvePerEmployees : 0;
}

export function approveMultiplier(s: GameState): number {
  if (s.company.ceoMode !== 'executive') return 1;
  const b = s.company.approveBalance;
  if (b >= 0) return 1 + Math.min(C.approveBonus, b * 0.01);
  return 1 - Math.min(C.approvePenalty, -b * 0.02);
}

// 한 칸(근무 1시간) 실행
export function runSlot(s: GameState, index: number) {
  const slot = daySchedule(s)[index];
  if (!slot || !slot.action) return;
  const a = slot.action;
  const eff = efficiency(s, a);
  const per = actionDef(a).perSlot;
  switch (a) {
    case 'dev':
      applyWork(s, per * eff, 'dev', true, s.company.workPolicy === 'crunch' ? 1.3 : 1);
      break;
    case 'sales':
      if (!hasMvp(s)) return; // MVP 전에는 팔 제품이 없습니다(A-13).
      s.accrual.entertainment += C.salesEntertainment;
      break;
    case 'ir':
      s.irPoints += per * eff;
      break;
    case 'network':
      s.networkPoints += per * eff;
      s.accrual.entertainment += C.networkEntertainment;
      break;
    case 'enterprise':
      s.entPipeline += per * eff * (1 + Math.min(1, s.networkPoints / 400));
      s.accrual.entertainment += C.enterpriseEntertainment;
      break;
    case 'approve':
      s.company.approveBalance += eff;
      break;
  }
  s.todayLog[a] += 1;
}

// 하루 끝: 결재 필요량 차감, 오늘 대표 영업량(세일즈 출력에 더함)
export function ceoDayEnd(s: GameState) {
  if (s.company.ceoMode === 'executive') {
    s.company.approveBalance -= approveNeed(s);
    s.company.approveBalance = Math.max(-10, Math.min(5, s.company.approveBalance));
  } else s.company.approveBalance = 0;
}

export function ceoSalesToday(s: GameState): number {
  return s.todayLog.sales * efficiency(s, 'sales') * 0.15;
}
