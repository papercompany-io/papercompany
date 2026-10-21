// MG-03 부서 단위 업무 지시(DEC-026, 선택지 DEC-032), MG-04 지시 해석과 실행 판정(알고리즘 DEC-031)
import { DATA, dept, gradeOutput, hasMvp, instructionOption, isScaleUp } from './data';
import { deptMembers } from './employees';
import { spendNow } from './finance';
import { addApplicants } from './hiring';
import { nextId } from './ids';
import { post, teamChannelId } from './messenger';
import { rand } from './rng';
import { formatDate } from './calendar';
import type { DeptId, Employee, GameState } from './types';

const I = DATA.instructions;

export function optionsFor(d: DeptId) {
  return I.options.filter((o) => o.dept === d);
}

export function runningInstruction(s: GameState, d: DeptId) {
  return s.instructions.find((x) => x.dept === d && x.status === 'running');
}

export function successProbability(members: Employee[], baseP: number): number {
  if (members.length === 0) return 0;
  const gb = I.gradeBonus as Record<string, number>;
  const avgGrade = members.reduce((sum, m) => sum + gb[m.grade], 0) / members.length;
  const p = baseP + I.memberBonus * (members.length - 1) + avgGrade;
  return Math.max(I.pMin, Math.min(I.pMax, p));
}

export function cannotInstruct(s: GameState, d: DeptId, optionId: string): string | null {
  const o = instructionOption(optionId);
  if (deptMembers(s, d).length === 0) return '팀원이 없습니다.';
  if (runningInstruction(s, d)) return '이 팀은 이미 지시를 수행 중입니다.';
  if ((o as { requiresMvp?: boolean }).requiresMvp && !hasMvp(s)) return 'MVP가 없어 고객이 생기지 않습니다. 먼저 제품을 만드세요.';
  const cost = (o as { cost?: number }).cost ?? 0;
  if (cost > s.cash) return '비용을 낼 자금이 부족합니다.';
  return null;
}

export function issueInstruction(s: GameState, d: DeptId, optionId: string, repeat = false): string | null {
  const err = cannotInstruct(s, d, optionId);
  if (err) return err;
  const o = instructionOption(optionId);
  const members = deptMembers(s, d);
  const id = nextId(s, 'i');
  const p = successProbability(members, o.baseP);
  s.instructions.push({ id, dept: d, optionId, startDay: s.day, endDay: s.day + o.days, assigneeIds: members.map((m) => m.id), status: 'running', p, repeat, result: null, effectValue: null });
  for (const m of members) m.instructionId = id;
  const cost = (o as { cost?: number }).cost ?? 0;
  if (cost > 0) spendNow(s, `광고비(${o.name})`, cost, 'ads');
  post(s, teamChannelId(d), '나(대표)', `[지시] ${o.name} — ${o.desc}${repeat ? ' (끝나면 반복)' : ''}`, 'player');
  post(s, teamChannelId(d), '시스템', `지시 접수: 담당 ${members.map((m) => m.name).join(', ')} · ${o.days}일 뒤(${formatDate(s.day + o.days)}) 완료 예정`, 'system');
  return null;
}

// MG-04 판정: 완전 수행 / 부분 수행 / 실패
export function completeInstructions(s: GameState) {
  for (const ins of s.instructions) {
    if (ins.status !== 'running' || s.day < ins.endDay) continue;
    const o = instructionOption(ins.optionId);
    const members = ins.assigneeIds.map((id) => s.employees.find((e) => e.id === id)).filter(Boolean) as Employee[];
    const r = rand(s);
    const result = r < ins.p ? 'full' : r < ins.p + (1 - ins.p) * I.partialShare ? 'partial' : 'fail';
    const mult = result === 'full' ? 1 : result === 'partial' ? I.partialMult : 0;
    const outputSum = members.reduce((sum, m) => sum + gradeOutput(m.grade), 0);
    let value = o.effect.perMemberDay * o.days * outputSum * mult;
    let summary = '';
    switch (o.effect.type) {
      case 'product':
        s.productPoints += value;
        summary = `제품 점수 +${value.toFixed(1)}`;
        break;
      case 'customers':
        value *= isScaleUp(s) ? DATA.product.scaleSalesMult : 1;
        s.customers += value;
        summary = `고객 +${value.toFixed(1)}곳`;
        break;
      case 'network':
        s.networkPoints += value;
        summary = `네트워크 점수 +${value.toFixed(1)}`;
        break;
      case 'applicants': {
        const n = Math.round(value);
        const open = s.postings.filter((p) => p.status === 'open');
        for (const p of open) addApplicants(s, p, n);
        summary = open.length ? `열린 공고마다 지원자 +${n}명` : '열린 공고가 없어 지원자가 늘지 않았습니다';
        break;
      }
    }
    ins.status = 'done';
    ins.result = result;
    ins.effectValue = value;
    const label = result === 'full' ? '완전 수행' : result === 'partial' ? '부분 수행' : '실패';
    const text = `[결과] ${o.name} — ${label}${result === 'fail' ? '' : `: ${summary}`} (성공 확률 ${(ins.p * 100).toFixed(0)}%)`;
    for (const m of members) {
      m.instructionId = null;
      m.lastResult = text;
    }
    post(s, teamChannelId(ins.dept), members[0]?.name ?? `${dept(ins.dept).name}팀`, text, 'npc');
    if (ins.repeat) {
      const err = issueInstruction(s, ins.dept, ins.optionId, true);
      if (err) post(s, teamChannelId(ins.dept), '시스템', `반복 지시를 이어가지 못했습니다: ${err}`, 'system');
    }
  }
}

export function setRepeat(s: GameState, d: DeptId, on: boolean) {
  const r = runningInstruction(s, d);
  if (r) r.repeat = on;
}
