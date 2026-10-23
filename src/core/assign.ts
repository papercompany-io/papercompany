// 개인 업무(A-147): 팀 맡은 일(company.orders)이 기본이고, 직원마다 따로 일을 정하면(Employee.order) 그 사람만 그 일을 합니다.
// 규칙 코드는 "팀이 그 일을 하느냐(켜짐/꺼짐)" 대신 "그 일을 하는 사람 비율(orderShare)"을 씁니다.
// 개인 업무가 없으면 비율은 0 또는 1이라 예전과 똑같이 동작합니다(봇·시뮬 그대로).
// 다른 core 모듈에서 순환 없이 쓰도록 data·types만 가져옵니다.
import { DATA, orderDef } from './data';
import type { DeptId, Employee, GameState } from './types';

export function teamOrder(s: GameState, d: DeptId): string {
  return s.company.orders[d] ?? (DATA.orders.defaults as Record<string, string>)[d];
}

// 이 직원이 지금 하는 일: 개인 업무가 이 부서 일이고 지금 단계에서 고를 수 있으면 그것, 아니면 팀 일
export function empOrderOf(s: GameState, e: Employee): string {
  const o = e.order ? orderDef(e.order) : undefined;
  if (o && o.dept === e.dept && s.company.stage >= o.stage) return o.id;
  return groupOrder(s, e);
}

// 이 직원이 개인 업무 없이 따르는 일(A-226): 부서 안의 팀에 맡은 일이 있으면 그것, 없으면 부서 맡은 일
export function groupOrder(s: GameState, e: Employee): string {
  const q = e.squadId ? s.company.squads?.find((x) => x.id === e.squadId) : undefined;
  const o = q && q.dept === e.dept && q.order ? orderDef(q.order) : undefined;
  if (o && o.dept === e.dept && s.company.stage >= o.stage) return o.id;
  return teamOrder(s, e.dept);
}

// 부서에서 이 일을 하는 사람 비율(0~1). 사람이 없으면 팀 일이 그것이면 1
export function orderShare(s: GameState, d: DeptId, orderId: string): number {
  const team = s.employees.filter((e) => e.dept === d);
  if (!team.length) return teamOrder(s, d) === orderId ? 1 : 0;
  return team.filter((e) => empOrderOf(s, e) === orderId).length / team.length;
}

// 이 일을 하는 사람 수
export function orderCount(s: GameState, d: DeptId, orderId: string): number {
  return s.employees.filter((e) => e.dept === d && empOrderOf(s, e) === orderId).length;
}

// 개인 업무를 가진 사람(팀 일과 다른 일을 하는 사람)
export function personalAssignees(s: GameState, d: DeptId): Employee[] {
  const t = teamOrder(s, d);
  return s.employees.filter((e) => e.dept === d && empOrderOf(s, e) !== t);
}
