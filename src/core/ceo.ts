// CA-01 하루 행동 칸 배분, CA-02 창업자 스펙에 따른 행동 효율
import { DATA, hasMvp, isScaleUp, specEffects } from './data';
import { openRound } from './funding';
import type { ActionId, GameState } from './types';

const ORDER: ActionId[] = ['dev', 'sales', 'ir', 'network'];

export function actionDef(id: ActionId) {
  return DATA.ceo.actions.find((a) => a.id === id)!;
}

// CA-02 효율 = 1 + (해당 스펙 % + 모든 행동 %) / 100
export function efficiency(s: GameState, id: ActionId): number {
  const fx = specEffects(s.founder.picks) as unknown as Record<string, number>;
  const key = actionDef(id).specKey;
  return 1 + ((fx[key] ?? 0) + fx.allActions) / 100;
}

export function allocTotal(alloc: Record<ActionId, number>): number {
  return ORDER.reduce((sum, k) => sum + alloc[k], 0);
}

// 플레이어 배분을 8칸 순서로 펼칩니다. FR-13 라운드 중에는 앞 4칸이 투자자 미팅으로 묶입니다(A-16).
export function daySchedule(s: GameState): { action: ActionId | null; locked: boolean }[] {
  const n = DATA.time.slotsPerDay;
  const own: ActionId[] = [];
  for (const k of ORDER) for (let i = 0; i < s.ceoAlloc[k]; i++) own.push(k);
  const out: { action: ActionId | null; locked: boolean }[] = [];
  const locked = openRound(s) ? DATA.funding.lockedSlots : 0;
  for (let i = 0; i < locked; i++) out.push({ action: 'ir', locked: true });
  for (let i = 0; out.length < n; i++) out.push({ action: own[i] ?? null, locked: false });
  return out;
}

export function setAlloc(s: GameState, id: ActionId, value: number): string | null {
  const next = { ...s.ceoAlloc, [id]: Math.max(0, Math.round(value)) };
  if (allocTotal(next) > DATA.time.slotsPerDay) return `하루 행동 칸은 ${DATA.time.slotsPerDay}칸입니다.`;
  s.ceoAlloc = next;
  return null;
}

// 한 칸(근무 1시간) 실행 [Claude 제안] CA-01 처리 흐름 3·4
export function runSlot(s: GameState, index: number) {
  const slot = daySchedule(s)[index];
  if (!slot || !slot.action) return;
  const a = slot.action;
  const eff = efficiency(s, a);
  const per = actionDef(a).perSlot;
  switch (a) {
    case 'dev':
      s.productPoints += per * eff;
      break;
    case 'sales':
      // MVP 전에는 팔 제품이 없어 고객이 생기지 않습니다(A-13).
      if (!hasMvp(s)) return;
      s.customers += per * eff * (isScaleUp(s) ? DATA.product.scaleSalesMult : 1);
      s.accrual.entertainment += DATA.finance.entertainmentPerSalesSlot;
      break;
    case 'ir':
      s.irPoints += per * eff;
      break;
    case 'network':
      s.networkPoints += per * eff;
      s.accrual.entertainment += DATA.finance.businessPromotionPerNetworkSlot;
      break;
  }
  s.todayLog[a] += 1;
}
