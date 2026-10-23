// AT-01~07 AI 도입: 공급사·모델 선택(효과 평균·분산·부작용 확률), 부서별 적용률, 적응 기간, 공급사 교체, AI 슬롭 부작용.
import { DATA, aiModel, aiVendor, dept, trait } from './data';
import { dayOfMonthKey } from './calendar';
import { news, notify, float } from './notify';
import { post, teamChannelId } from './messenger';
import { rand, randRange } from './rng';
import type { DeptId, Employee, GameState } from './types';
import { orderShare } from './assign';

const A = DATA.ai;

export function releasedModels(s: GameState) {
  return A.models.filter((m) => dayOfMonthKey(m.release) <= s.day);
}

export function latestModels(s: GameState) {
  const rel = releasedModels(s);
  return A.vendors.map((v) => rel.filter((m) => m.vendor === v.id).pop()).filter(Boolean) as typeof A.models;
}

export function avgAdoption(s: GameState): number {
  if (!s.employees.length) return 0;
  return s.employees.reduce((a, e) => a + (s.ai.adoption[e.dept] ?? 0), 0) / s.employees.length;
}

function traitAi(e: Employee): number {
  let v = 0;
  for (const t of e.traits) v += ((trait(t)?.fx as unknown as Record<string, number>)?.ai ?? 0) as number;
  return v;
}

// 직원 한 명의 AI 출력 배율
export function aiMultiplier(s: GameState, e: Employee): number {
  if (!s.ai.modelId) return 1;
  const ad = s.ai.adoption[e.dept] ?? 0;
  if (ad <= 0) return 1;
  const fit = (A.deptFit as Record<string, number>)[e.dept] ?? 1;
  return Math.max(0.85, 1 + ad * s.ai.realized * s.ai.adaptation * fit * (1 + traitAi(e)));
}

// 모델 고르기(공급사 교체 시 적응도 일부만 유지, AT-07)
export function chooseModel(s: GameState, modelId: string): string | null {
  const m = aiModel(modelId);
  if (!m || !releasedModels(s).some((x) => x.id === modelId)) return '아직 출시되지 않은 모델입니다.';
  if (s.ai.modelId === modelId) return '이미 쓰는 모델입니다.';
  const prev = s.ai.modelId ? aiModel(s.ai.modelId) : null;
  const sameVendor = prev && prev.vendor === m.vendor;
  s.ai.adaptation = prev ? s.ai.adaptation * (sameVendor ? 0.85 : A.switchKeep) : 0;
  s.ai.modelId = modelId;
  s.ai.switchedDay = s.day;
  s.ai.realized = Math.max(0.02, m.mean + (rand(s) * 2 - 1) * m.var);
  notify(s, `AI 모델을 ${aiVendor(m.vendor).name} ${m.name}(으)로 ${prev ? '바꿨습니다' : '도입했습니다'}. 적응하는 동안 효과가 서서히 오릅니다.`, 'info', 'ai');
  return null;
}

export function setAdoption(s: GameState, d: DeptId, v: number): string | null {
  if (!s.ai.modelId) return '먼저 AI 모델을 고르세요.';
  s.ai.adoption[d] = Math.max(0, Math.min(1, Math.round(v * 20) / 20));
  return null;
}

// 월 구독료: 적용 직원 수 × 적용률 × 좌석당 요금
export function aiMonthlyCost(s: GameState): number {
  if (!s.ai.modelId) return 0;
  const m = aiModel(s.ai.modelId)!;
  return s.employees.reduce((a, e) => a + (s.ai.adoption[e.dept] ?? 0) * m.cost, 0);
}

// 하루: 적응도 상승, AI 슬롭 부작용(AT-03)
export function aiDay(s: GameState) {
  if (!s.ai.modelId) return;
  const m = aiModel(s.ai.modelId)!;
  const ax = s.company.welfare.includes('ax') ? 0.6 : 0;
  const tools = 0.8 * orderShare(s, 'ai', 'ai_tools'); // A-147
  s.ai.adaptation = Math.min(1, s.ai.adaptation + (1 + ax + tools) / A.adaptDays);
  s.accrual.ai += aiMonthlyCost(s) / 30;
  const adoptedDepts = (Object.keys(s.ai.adoption) as DeptId[]).filter((d) => (s.ai.adoption[d] ?? 0) > 0 && s.employees.some((e) => e.dept === d));
  for (const d of adoptedDepts) {
    const p = ((s.ai.adoption[d] ?? 0) * m.slop * (1 - tools * 0.5)) / 30;
    if (rand(s) < p) slop(s, d);
  }
}

function slop(s: GameState, d: DeptId) {
  s.ai.incidents += 1;
  s.stats.slops += 1;
  const name = dept(d).name;
  if (d === 'dev' || d === 'ai' || d === 'infra') {
    s.product.bugs = Math.min(100, s.product.bugs + A.slopBugs * randRange(s, 0.6, 1.4));
    notify(s, `AI 슬롭: ${name}팀이 AI가 만든 코드를 검토 없이 올려 버그가 늘었습니다.`, 'bad', 'ai');
  } else if (d === 'marketing' || d === 'design') {
    for (const m of Object.values(s.markets)) if (m.launched) m.awareness = Math.max(0, m.awareness * 0.95);
    notify(s, `AI 슬롭: ${name}팀 AI 콘텐츠가 어색하다는 비판을 받아 인지도가 조금 떨어졌습니다.`, 'bad', 'ai');
  } else if (d === 'cs') {
    s.modifiers.push({ key: 'churn', value: 0.1, until: s.day + 20, label: 'AI 상담 오답' });
    notify(s, 'AI 슬롭: AI 상담봇이 엉뚱한 답을 해 고객 불만이 늘었습니다(20일 동안 이탈↑).', 'bad', 'ai');
  } else {
    s.modifiers.push({ key: 'output', value: -0.03, until: s.day + 14, label: 'AI 실수 수습' });
    notify(s, `AI 슬롭: ${name}팀이 AI 실수를 수습하느라 2주간 일이 느려집니다.`, 'bad', 'ai');
  }
  post(s, teamChannelId(d), '시스템', 'AI 부작용(슬롭)이 발생했습니다. 직원 관리 창 AI 도입 탭에서 적용률을 조정하거나 AI연구팀의 "사내 AI 도구 고도화"로 줄일 수 있습니다.', 'system');
  float(s, 'AI 슬롭', 'bad');
}

// 새 모델 출시 소식(AT-07): 달이 바뀔 때 확인
export function aiMonth(s: GameState) {
  for (const m of A.models) {
    const d = dayOfMonthKey(m.release);
    if (d > s.day - 31 && d <= s.day) {
      news(s, `[AI] ${aiVendor(m.vendor).name}, 새 모델 ${m.name} 공개`, 'ai');
      if (s.company.stage >= 1) notify(s, `새 AI 모델 ${aiVendor(m.vendor).name} ${m.name}이(가) 나왔습니다. 직원 관리 창 AI 도입 탭에서 바꿀 수 있습니다.`, 'info', 'ai');
    }
  }
  // 쓰는 모델 업데이트로 효과가 조금 흔들립니다(분산).
  if (s.ai.modelId) {
    const m = aiModel(s.ai.modelId)!;
    s.ai.realized = Math.max(0.02, s.ai.realized + (rand(s) * 2 - 1) * m.var * 0.15 + (m.mean - s.ai.realized) * 0.1);
  }
}
