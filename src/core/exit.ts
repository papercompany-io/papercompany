// F12: EX-01 IPO, EX-02 매각, EX-03 원하는 시점에 Exit 시도, EX-04 성공·실패(DEC-021), EX-05 들어오는 인수 제안, FL-01 파산.
// IPO에 성공하면 회사는 끝나지 않고 상장사로 이어집니다(public.ts). 창업자 돈은 지분 매각·사임 때 실현됩니다.
import { DATA, stage, stageIndex } from './data';
import { founderPct, investorPct, vestAllOnExit } from './equity';
import { lastPL } from './finance';
import { finishCompany } from './career';
import { econ } from './economy';
import { goPublic } from './public';
import { news, notify } from './notify';
import { pick, rand, randRange } from './rng';
import { computeValuation } from './valuation';
import type { GameState } from './types';
import type { ProbFactor } from './funding';

const X = DATA.exit;

const BUYERS = ['한빛그룹', '대성홀딩스', '누리플랫폼', '가람테크', '은하인터랙티브', '실버라인 글로벌', '노바코퍼레이션', '크레센트 파트너스'];

export function annualRevenue(s: GameState): number {
  const h = s.plHistory.slice(-12);
  if (!h.length) return 0;
  return (h.reduce((a, m) => a + m.revenue, 0) / h.length) * 12;
}

export function exitProbability(s: GameState, method: 'sale' | 'ipo'): { p: number; factors: ProbFactor[] } {
  const f: ProbFactor[] = [];
  f.push({ label: method === 'sale' ? '매각 기본 확률' : 'IPO 기본 확률', value: method === 'sale' ? X.sale.base : X.ipo.base });
  const ar = annualRevenue(s);
  if (ar >= 1e9) f.push({ label: '연매출 10억 이상', value: X.bonus.customers30 });
  if (ar >= 1e10) f.push({ label: '연매출 100억 이상', value: X.bonus.customers100 });
  if (ar >= 1e11) f.push({ label: '연매출 1,000억 이상', value: X.bonus.customers300 });
  const last = lastPL(s);
  if (last && last.operatingProfit > 0) f.push({ label: '지난달 영업이익 흑자', value: X.bonus.profit });
  if (s.fundingStage) {
    const b = (X.bonus.stage as Record<string, number>)[s.fundingStage];
    if (b) f.push({ label: `펀딩 단계 ${stage(s.fundingStage).name}`, value: b });
  }
  const ev = econ(s, 'invest') * 1.5;
  if (Math.abs(ev) > 0.005) f.push({ label: '경기', value: ev });
  if (method === 'ipo') {
    if (stageIndex(s.fundingStage) < X.ipo.needStageIndex && s.company.stage < 4) f.push({ label: '상장하기엔 아직 이른 단계(시리즈 B 전)', value: -X.ipo.stagePenalty });
    if (ar < 3e10) f.push({ label: '연매출 300억 미만(상장 심사 기준 미달)', value: ar < 1e10 ? -0.4 : -0.2 });
    if (s.company.ipoReady > 0) f.push({ label: `상장 준비도 ${Math.round(s.company.ipoReady)}(재무법무팀)`, value: s.company.ipoReady * 0.004 });
    else f.push({ label: '상장 준비 안 됨(재무법무팀 "상장 준비" 지시)', value: -0.1 });
  }
  const p = Math.max(X.min, Math.min(X.max, f.reduce((sum, x) => sum + x.value, 0)));
  return { p, factors: f };
}

export function exitBlocked(s: GameState): string | null {
  if (s.ended) return '회사가 끝났습니다.';
  if (s.public) return '이미 상장사입니다. 주식 앱에서 지분을 팔거나 대표에서 물러날 수 있습니다.';
  if (s.exitAttempt && (s.exitAttempt.status === 'preparing' || s.exitAttempt.status === 'offer')) return '이미 Exit을 진행 중입니다.';
  if (s.exitCooldownUntil !== null && s.day < s.exitCooldownUntil) return `Exit 실패 여파로 ${s.exitCooldownUntil - s.day}일 뒤에 다시 시도할 수 있습니다.`;
  return null;
}

export function startExit(s: GameState, method: 'sale' | 'ipo'): string | null {
  const err = exitBlocked(s);
  if (err) return err;
  const cv = computeValuation(s);
  const v = cv.value;
  if (method === 'sale') {
    // 제안가 배수는 사업가치에만 붙고, 회사 현금은 그대로 더합니다(A-52).
    const price = Math.round(Math.max(0, cv.business) * randRange(s, X.sale.priceMin, X.sale.priceMax) + Math.max(0, s.cash));
    s.exitAttempt = { method, startedDay: s.day, readyDay: s.day, price, valuationAtStart: v, p: exitProbability(s, 'sale').p, status: 'offer', inbound: false, buyer: pick(s, BUYERS), deadline: s.day + 14 };
    s.pauseReason = '인수 제안이 들어왔습니다';
  } else {
    s.exitAttempt = { method, startedDay: s.day, readyDay: s.day + X.ipo.prepDays, price: null, valuationAtStart: v, p: null, status: 'preparing', inbound: false, buyer: null, deadline: null };
    notify(s, `상장 심사를 시작했습니다. ${X.ipo.prepDays}일 뒤 결과가 나옵니다.`, 'info', 'exit');
  }
  s.events.push({ type: 'autosave', reason: 'Exit 시도' });
  return null;
}

export function declineSale(s: GameState): string | null {
  if (!s.exitAttempt || s.exitAttempt.status !== 'offer') return '받은 인수 제안이 없습니다.';
  s.exitAttempt.status = 'declined';
  s.pauseReason = null;
  if (s.exitAttempt.inbound) notify(s, `${s.exitAttempt.buyer}의 인수 제안을 거절했습니다. 더 키워 봅시다.`, 'info', 'exit');
  return null;
}

export function acceptSale(s: GameState): string | null {
  const a = s.exitAttempt;
  if (!a || a.status !== 'offer') return '받은 인수 제안이 없습니다.';
  judge(s);
  return null;
}

// 들어온 오퍼는 실사만 통과하면 되므로 성공 확률이 높습니다(EX-05 [Claude 제안]).
export function saleProbability(s: GameState): number {
  const a = s.exitAttempt;
  const p = exitProbability(s, 'sale').p;
  return a?.inbound ? Math.max(0.8, p) : p;
}

function judge(s: GameState) {
  const a = s.exitAttempt!;
  const p = a.method === 'sale' ? saleProbability(s) : exitProbability(s, 'ipo').p;
  a.p = p;
  s.pauseReason = null;
  if (rand(s) < p) {
    a.status = 'success';
    s.events.push({ type: 'exitResult', success: true });
    if (a.method === 'sale') {
      vestAllOnExit(s);
      const fp = founderPct(s);
      finishCompany(s, 'sale', Math.round(a.price! * fp), { exitValue: a.price!, founderPct: fp });
    } else goPublic(s, a.price!);
  } else {
    a.status = 'failed';
    s.valuation.penaltyUntil = s.day + X.cooldownDays;
    s.exitCooldownUntil = s.day + X.cooldownDays;
    s.pauseReason = a.method === 'sale' ? '매각이 무산되었습니다' : '상장이 무산되었습니다';
    notify(s, a.method === 'sale' ? '실사 끝에 매각이 무산됐습니다. 기업가치가 잠시 떨어지고 60일 동안 다시 시도할 수 없습니다.' : '상장 심사에서 떨어졌습니다. 기업가치가 잠시 떨어지고 60일 동안 다시 시도할 수 없습니다.', 'bad', 'exit');
    s.events.push({ type: 'exitResult', success: false });
  }
}

export function exitDayEnd(s: GameState) {
  const a = s.exitAttempt;
  if (!a) return;
  if (a.status === 'offer' && a.deadline !== null && s.day >= a.deadline) {
    a.status = 'declined';
    notify(s, `${a.buyer}의 인수 제안 기한이 지나 무산됐습니다.`, 'info', 'exit');
    if (s.pauseReason === '인수 제안이 들어왔습니다') s.pauseReason = null;
  }
  if (a.method !== 'ipo' || a.status !== 'preparing' || s.day < a.readyDay) return;
  const cv = computeValuation(s);
  a.price = Math.round(Math.max(0, cv.business) * randRange(s, X.ipo.priceMin, X.ipo.priceMax) + Math.max(0, s.cash));
  judge(s);
}

// EX-05 인수 제안(매달 판정)
export function inboundOfferMonth(s: GameState) {
  if (s.public || s.ended || s.company.stage < 2 || exitBlocked(s)) return;
  const p = 0.02 + 0.015 * s.company.stage + (s.economy.phase === 'boom' ? 0.03 : 0);
  if (rand(s) >= p) return;
  const cv = computeValuation(s);
  const v = cv.value;
  const price = Math.round(Math.max(0, cv.business) * randRange(s, 0.9, 1.5) + Math.max(0, s.cash));
  const buyer = pick(s, BUYERS);
  s.exitAttempt = { method: 'sale', startedDay: s.day, readyDay: s.day, price, valuationAtStart: v, p: null, status: 'offer', inbound: true, buyer, deadline: s.day + 14 };
  s.pauseReason = '인수 제안이 들어왔습니다';
  notify(s, `${buyer}이(가) ${s.company.name} 인수를 제안했습니다: ${Math.round(price / 1e8).toLocaleString('ko-KR')}억원. 내 몫 약 ${Math.round((price * founderPct(s)) / 1e8).toLocaleString('ko-KR')}억원. 14일 안에 답하세요(Exit 앱).`, 'urgent', 'exit');
}

// FL-01 월급일 정산 뒤 자금이 0 이하이면 파산(DEC-021)
export function checkBankruptcy(s: GameState) {
  if (s.cash > 0) return;
  finishCompany(s, 'bankrupt', 0, { reason: `월급일 정산 뒤 보유 자금이 ${Math.round(s.cash).toLocaleString('ko-KR')}원으로 0 이하가 되었습니다.` });
  s.events.push({ type: 'bankrupt' });
}

// 이사회 해임: 투자자 지분이 과반이고 이사회 신뢰가 바닥이면(Claude 제안)
export function checkBoard(s: GameState) {
  if (investorPct(s) < 0.5 || s.public) {
    if (s.company.board < 70) s.company.board = Math.min(70, s.company.board + 1);
    return;
  }
  const last = lastPL(s);
  const prev = s.plHistory[s.plHistory.length - 4];
  if (last && prev) {
    if (last.revenue < prev.revenue * 0.95) s.company.board -= 6;
    else if (last.revenue > prev.revenue * 1.15) s.company.board += 3;
  }
  s.company.board = Math.max(0, Math.min(100, s.company.board));
  if (s.company.board < 30 && s.company.board > 0) notify(s, `이사회 신뢰도가 ${Math.round(s.company.board)}까지 떨어졌습니다. 0이 되면 대표에서 해임됩니다. 매출을 늘리세요.`, 'urgent', 'invest');
  if (s.company.board <= 0) {
    const fp = founderPct(s);
    const v = computeValuation(s).value;
    finishCompany(s, 'fired', Math.round(v * fp * 0.5), { exitValue: v, founderPct: fp, reason: '이사회가 대표를 해임했습니다. 지분은 남았지만 헐값에 넘겼습니다.' });
  }
}
