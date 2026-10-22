// 버닝(A-131): 전 직원에게 작은 보너스를 주고 며칠 동안 일을 몰아서 빨리 진행합니다(빠르게 감기).
// 대가: 보너스 돈, 끝난 뒤 피로(만족도↓), 한동안 다시 못 함. 수치는 welfare.json burning
import { DATA } from './data';
import { spendNow } from './finance';
import { addMod } from './mods';
import { post } from './messenger';
import { notify } from './notify';
import type { GameState } from './types';

const B = DATA.welfare.burning;

export function burningCost(s: GameState): number {
  return Math.round(s.employees.reduce((a, e) => a + e.salary * B.bonusRate, 0) / 1e4) * 1e4;
}

export function burningActive(s: GameState): boolean {
  const b = s.company.burning;
  return !!b && s.day < b.until;
}

// 버닝을 못 하는 이유(없으면 null)
export function burningBlock(s: GameState): string | null {
  if (!s.employees.length) return '함께 달릴 직원이 없습니다.';
  const b = s.company.burning;
  if (b && s.day < b.until) return `버닝 중입니다(${b.until - s.day}일 남음).`;
  if (b && s.day < b.ready) return `팀이 아직 지쳐 있습니다. ${b.ready - s.day}일 뒤에 다시 할 수 있습니다.`;
  if (s.cash < burningCost(s)) return '보너스를 줄 자금이 부족합니다.';
  return null;
}

export function startBurning(s: GameState): string | null {
  const err = burningBlock(s);
  if (err) return err;
  const cost = burningCost(s);
  spendNow(s, `버닝 보너스(${s.employees.length}명)`, cost, 'other');
  const until = s.day + B.days;
  s.company.burning = { until, ready: until + B.cooldownDays, tired: false };
  addMod(s, 'output', B.output, B.days, '버닝');
  post(s, 'all', '나(대표)', `이번 ${B.days}일은 버닝입니다. 다 같이 조금만 더 달려 봅시다. 작은 보너스도 드립니다.`, 'player');
  notify(s, `버닝 시작: ${B.days}일 동안 팀이 더 빨리 일합니다. 끝나면 며칠 지칩니다.`, 'good', 'employees');
  return null;
}

// 하루 끝: 버닝이 끝나면 피로
export function burningDay(s: GameState) {
  const b = s.company.burning;
  if (!b || b.tired || s.day < b.until) return;
  b.tired = true;
  addMod(s, 'sat', B.afterSat, B.afterDays, '버닝 뒤 피로');
  notify(s, `버닝이 끝났습니다. 팀이 지쳐 ${B.afterDays}일쯤 만족도가 떨어집니다.`, 'info', 'employees');
}
