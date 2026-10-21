// F12: EX-01 IPO, EX-02 매각, EX-03 원하는 시점에 Exit 시도, EX-04 성공·실패(DEC-021), FL-01 파산
import { DATA, stage, stageIndex } from './data';
import { founderPct } from './equity';
import { lastPL } from './finance';
import { rand, randRange } from './rng';
import { computeValuation } from './valuation';
import type { GameState } from './types';
import type { ProbFactor } from './funding';

const X = DATA.exit;

export function exitProbability(s: GameState, method: 'sale' | 'ipo'): { p: number; factors: ProbFactor[] } {
  const f: ProbFactor[] = [];
  f.push({ label: method === 'sale' ? '매각 기본 확률' : 'IPO 기본 확률', value: method === 'sale' ? X.sale.base : X.ipo.base });
  const c = Math.floor(s.customers);
  if (c >= 100) f.push({ label: '고객 100곳 이상', value: X.bonus.customers100 });
  if (c >= 300) f.push({ label: '고객 300곳 이상', value: X.bonus.customers300 });
  const last = lastPL(s);
  if (last && last.operatingProfit > 0) f.push({ label: '지난달 영업이익 흑자', value: X.bonus.profit });
  if (s.fundingStage) {
    const b = (X.bonus.stage as Record<string, number>)[s.fundingStage];
    if (b) f.push({ label: `펀딩 단계 ${stage(s.fundingStage).name}`, value: b });
  }
  if (method === 'ipo' && stageIndex(s.fundingStage) < X.ipo.needStageIndex) f.push({ label: '상장하기엔 아직 이른 단계(시리즈 B 전)', value: -X.ipo.stagePenalty });
  const p = Math.max(X.min, Math.min(X.max, f.reduce((sum, x) => sum + x.value, 0)));
  return { p, factors: f };
}

export function exitBlocked(s: GameState): string | null {
  if (s.ended) return '게임이 끝났습니다.';
  if (s.exitAttempt && (s.exitAttempt.status === 'preparing' || s.exitAttempt.status === 'offer')) return '이미 Exit을 진행 중입니다.';
  if (s.exitCooldownUntil !== null && s.day < s.exitCooldownUntil) return `Exit 실패 여파로 ${s.exitCooldownUntil - s.day}일 뒤에 다시 시도할 수 있습니다.`;
  return null;
}

// EX-03 시도: 매각은 바로 제안가, IPO는 상장 준비 기간을 거칩니다.
export function startExit(s: GameState, method: 'sale' | 'ipo'): string | null {
  const err = exitBlocked(s);
  if (err) return err;
  const v = computeValuation(s).value;
  if (method === 'sale') {
    const price = Math.round(v * randRange(s, X.sale.priceMin, X.sale.priceMax));
    s.exitAttempt = { method, startedDay: s.day, readyDay: s.day, price, valuationAtStart: v, p: exitProbability(s, 'sale').p, status: 'offer' };
    s.pauseReason = '인수 제안이 들어왔습니다';
  } else {
    s.exitAttempt = { method, startedDay: s.day, readyDay: s.day + X.ipo.prepDays, price: null, valuationAtStart: v, p: null, status: 'preparing' };
  }
  s.events.push({ type: 'autosave', reason: 'Exit 시도' });
  return null;
}

export function declineSale(s: GameState): string | null {
  if (!s.exitAttempt || s.exitAttempt.status !== 'offer') return '받은 인수 제안이 없습니다.';
  s.exitAttempt.status = 'declined';
  s.pauseReason = null;
  return null;
}

export function acceptSale(s: GameState): string | null {
  const a = s.exitAttempt;
  if (!a || a.status !== 'offer') return '받은 인수 제안이 없습니다.';
  judge(s);
  return null;
}

// EX-04 판정
function judge(s: GameState) {
  const a = s.exitAttempt!;
  const p = exitProbability(s, a.method).p;
  a.p = p;
  if (rand(s) < p) {
    a.status = 'success';
    const fp = founderPct(s);
    s.result = {
      kind: 'exit',
      method: a.method,
      exitValue: a.price!,
      valuation: a.valuationAtStart,
      founderPct: fp,
      amount: Math.round(a.price! * fp),
      day: s.day,
    };
    s.ended = true;
    s.speed = 0;
    s.pauseReason = null;
  } else {
    a.status = 'failed';
    s.valuation.penaltyUntil = s.day + X.cooldownDays;
    s.exitCooldownUntil = s.day + X.cooldownDays;
    s.pauseReason = a.method === 'sale' ? '매각이 무산되었습니다' : '상장이 무산되었습니다';
  }
  s.events.push({ type: 'exitResult', success: a.status === 'success' });
}

export function exitDayEnd(s: GameState) {
  const a = s.exitAttempt;
  if (!a || a.method !== 'ipo' || a.status !== 'preparing' || s.day < a.readyDay) return;
  a.price = Math.round(computeValuation(s).value * randRange(s, X.ipo.priceMin, X.ipo.priceMax));
  judge(s);
}

// FL-01 월급일 정산 뒤 자금이 0 이하이면 파산, 결과 0원(DEC-021)
export function checkBankruptcy(s: GameState) {
  if (s.cash > 0) return;
  s.result = {
    kind: 'bankrupt',
    exitValue: 0,
    valuation: computeValuation(s).value,
    founderPct: founderPct(s),
    amount: 0,
    day: s.day,
    reason: `월급일 정산 뒤 보유 자금이 ${s.cash.toLocaleString('ko-KR')}원으로 0 이하가 되었습니다.`,
  };
  s.ended = true;
  s.speed = 0;
  s.events.push({ type: 'bankrupt' });
}
