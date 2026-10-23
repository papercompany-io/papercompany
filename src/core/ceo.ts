// CA-01 하루 행동 칸 배분, CA-02 창업자 스펙 효율, CA-03 조직이 생긴 뒤 대표 행동(대기업 영업·결재·인맥·투자자 미팅, DEC-027·DEC-033)
import { DATA, specEffects } from './data';
import { openRound } from './funding';
import { legacyFx } from './career';
import { applyWork, hasMvp } from './product';
import { hasActiveContract, workOnContract } from './contracts';
import { busyWindow, isFullDay, outingTpl, todayOutings } from './outings';
import { runwayMonths } from './finance';
import { notify } from './notify';
import { clearFlag, setFlag } from './mods';
import { trigger } from './events';
import type { ActionId, GameState } from './types';

const C = DATA.ceo;

export const FOUNDER_ACTIONS: ActionId[] = ['dev', 'contract', 'sales', 'ir', 'network'];
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
  return (1 + ((fx[key] ?? 0) + fx.allActions) / 100 + legacyFx(s, 'ceo')) * energyMult(s);
}

// ── A-146 대표 컨디션: 대표 시간은 쓰면 닳습니다 ──
const E = C.energy;

export function ceoEnergy(s: GameState): number {
  return s.ceoEnergy ?? E.start;
}

// 지친 정도 0~1: 컨디션이 lowAt 아래로 내려간 만큼(결정 카드 판단·미팅 몸짓 읽기, A-146·A-186)
export function tiredness(s: GameState): number {
  return Math.max(0, 1 - ceoEnergy(s) / E.lowAt);
}

// 컨디션이 lowAt 아래면 대표 일의 효율이 줄어듭니다(0이면 minMult)
export function energyMult(s: GameState): number {
  const e = ceoEnergy(s);
  return e >= E.lowAt ? 1 : E.minMult + (1 - E.minMult) * (e / E.lowAt);
}

function energyDay(s: GameState) {
  const before = ceoEnergy(s);
  let d = E.recover;
  const slots = DATA.time.slotsPerDay;
  for (const [a, w] of Object.entries(s.todayLog) as [ActionId, number][]) d -= ((E.drain as Record<string, number>)[a] ?? 1) * (w / slots);
  if (todayOutings(s).some((o) => !o.delegate && o.kind !== 'review')) d -= E.outingDay; // 점검 회의는 외출이 아님(A-181)
  if (s.company.workPolicy === 'crunch') d -= E.crunch;
  const rw = runwayMonths(s);
  if (!s.public && rw !== null && rw < 3) d -= E.stress;
  if (s.company.approveBalance < 0) d -= E.backlog;
  const after = Math.max(0, Math.min(100, before + d));
  s.ceoEnergy = after;
  for (const w of E.warn) if (before >= w && after < w) notify(s, w <= 20 ? '비서: 대표님, 이러다 쓰러지십니다. 외출을 줄이고 꼭 쉬어 가세요. 지금은 일의 속도도 많이 떨어졌습니다.' : '비서: 대표님 요즘 많이 지쳐 보이세요. 일이 예전만큼 손에 붙지 않습니다. 외출 일정을 줄여 보시는 건 어떨까요?', w <= 20 ? 'urgent' : 'info');
  if ((s.ceoCardDay ?? -9999) + E.cardCooldown > s.day) return;
  const card = after < E.healthAt ? 'ev_b_per_health' : after < E.burnoutAt ? 'ev_b_per_burnout' : null;
  if (!card) return;
  s.ceoCardDay = s.day;
  setFlag(s, 'ceo_tired_now');
  trigger(s, card);
  clearFlag(s, 'ceo_tired_now');
}

export function allocTotal(alloc: Record<ActionId, number>): number {
  return (Object.keys(alloc) as ActionId[]).reduce((sum, k) => sum + alloc[k], 0);
}

// 대표 하루(A-101): 칸 배분 없이 주 업무 하나를 하루 내내 합니다. 외출 날은 하루 내내 그 외출의 일(투자자 미팅·네트워킹·영업).
// (내부적으로는 하루를 시간 단위로 나눠 조금씩 실행해, 작업량이 하루 동안 고르게 쌓입니다. 화면에는 칸이 없습니다)
export function workChoices(s: GameState): ActionId[] {
  return (s.company.ceoMode === 'executive' ? C.executiveWork : C.founderWork) as ActionId[];
}

export function ceoWork(s: GameState): ActionId {
  const w = s.ceoWork;
  const choices = workChoices(s);
  return w && choices.includes(w) ? w : choices[0];
}

// 한 칸(근무 1시간)을 무엇으로 채우는가(A-127). 하루짜리 외출은 약속 시간만 그 일, 오가는 이동 시간은 아무 일도 못 하고, 나머지는 주 업무.
// w = 그 칸에서 차지하는 비율(30분 이동이면 0.5)
export interface SlotPart {
  action: ActionId;
  w: number;
  outing?: string;
}

export function slotParts(s: GameState, index: number): SlotPart[] {
  const work = ceoWork(s);
  const list = todayOutings(s);
  if (!list.length) return [{ action: work, w: 1 }];
  const full = list.find(isFullDay);
  if (full) return [{ action: outingTpl(full.tpl).action as ActionId, w: 1, outing: full.title }];
  const h0 = DATA.time.workStartHour + index;
  const cover = (a: number, b: number) => Math.max(0, Math.min(h0 + 1, b) - Math.max(h0, a));
  const parts: SlotPart[] = [];
  let away = 0;
  for (const o of list) {
    const meet = cover(o.startHour!, o.startHour! + o.hours!);
    if (meet > 0) parts.push({ action: outingTpl(o.tpl).action as ActionId, w: meet, outing: o.title });
    away += cover(...busyWindow(o));
  }
  // 약속 있는 날은 남은 책상 시간도 집중이 깨짐(A-129). 사내 점검 회의만 있는 날은 그대로(A-181)
  const focus = list.some((o) => o.kind !== 'review') ? DATA.ceo.outings.meetingDayFocus : 1;
  if (away < 1) parts.push({ action: work, w: (1 - away) * focus });
  return parts;
}

// 하루 칸 목록(화면용): 칸마다 가장 많이 차지하는 일
export function daySchedule(s: GameState): { action: ActionId | null; locked: boolean; outing?: string }[] {
  return Array.from({ length: DATA.time.slotsPerDay }, (_, i) => {
    const parts = slotParts(s, i);
    const top = parts.reduce<SlotPart | null>((a, b) => (!a || b.w > a.w ? b : a), null);
    const used = parts.reduce((a, p) => a + p.w, 0);
    if (!top || used < 0.5) return { action: null, locked: true }; // 이동 중
    return { action: top.action, locked: !!top.outing, outing: top.outing };
  });
}

export function setCeoWork(s: GameState, w: ActionId): string | null {
  if (!workChoices(s).includes(w)) return '지금 모드에서 고를 수 있는 일이 아닙니다.';
  if (w === 'sales' && !hasMvp(s)) return 'MVP 전에는 팔 제품이 없습니다.';
  s.ceoWork = w;
  return null;
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
  s.ceoWork = workChoices(s)[0];
  return null;
}

// 결재(CA-03, OQ-045 [Claude 제안] A-44): 직원이 많을수록 결재가 쌓임(25명당 하루 1시간어치). 대표가 결재를 주 업무로 하면 줄고, 남으면 출력 +5%, 밀리면 최대 -20%
export function approveNeed(s: GameState): number {
  return s.company.ceoMode === 'executive' ? s.employees.length / C.approvePerEmployees : 0;
}

export function approveMultiplier(s: GameState): number {
  if (s.company.ceoMode !== 'executive') return 1;
  const b = s.company.approveBalance;
  if (b >= 0) return 1 + Math.min(C.approveBonus, b * 0.01);
  return 1 - Math.min(C.approvePenalty, -b * 0.02);
}

// 한 칸(근무 1시간) 실행: 칸 안의 일마다 차지한 비율만큼(A-127)
export function runSlot(s: GameState, index: number) {
  for (const p of slotParts(s, index)) runAction(s, p.action, p.w);
}

function runAction(s: GameState, a: ActionId, w: number) {
  const eff = efficiency(s, a);
  const per = actionDef(a).perSlot * w;
  switch (a) {
    case 'dev':
      applyWork(s, per * eff, 'dev', true, s.company.workPolicy === 'crunch' ? 1.3 : 1);
      break;
    case 'contract':
      // 외주가 없으면 그 칸은 제품 개발로 돌립니다.
      if (hasActiveContract(s)) workOnContract(s, per * eff);
      else applyWork(s, per * eff, 'dev', true, 1);
      break;
    case 'sales':
      if (!hasMvp(s)) return; // MVP 전에는 팔 제품이 없습니다(A-13).
      s.accrual.entertainment += C.salesEntertainment * w;
      break;
    case 'ir':
      s.irPoints += per * eff;
      break;
    case 'network':
      s.networkPoints += per * eff;
      s.accrual.entertainment += C.networkEntertainment * w;
      break;
    case 'enterprise':
      s.entPipeline += per * eff * (1 + Math.min(1, s.networkPoints / 400));
      s.accrual.entertainment += C.enterpriseEntertainment * w;
      break;
    case 'approve':
      s.company.approveBalance += eff * w;
      break;
  }
  s.todayLog[a] += w;
}

// 대표가 하루에 제품에 넣는 개발 작업량(개발 칸 + 외주가 없을 때의 외주 칸). 제품 화면의 예상 일수에 씁니다.
export function ceoDevPerDay(s: GameState): number {
  let slots = 0;
  for (let i = 0; i < DATA.time.slotsPerDay; i++)
    for (const p of slotParts(s, i)) if (p.action === 'dev' || (p.action === 'contract' && !hasActiveContract(s))) slots += p.w;
  return slots * actionDef('dev').perSlot * efficiency(s, 'dev');
}

// 하루 끝: 결재 필요량 차감, 오늘 대표 영업량(세일즈 출력에 더함)
export function ceoDayEnd(s: GameState) {
  energyDay(s);
  if (s.company.ceoMode === 'executive') {
    s.company.approveBalance -= approveNeed(s);
    s.company.approveBalance = Math.max(-10, Math.min(5, s.company.approveBalance));
  } else s.company.approveBalance = 0;
}

export function ceoSalesToday(s: GameState): number {
  return s.todayLog.sales * efficiency(s, 'sales') * 0.15;
}
