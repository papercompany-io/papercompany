// A-137 버티는 수단(돈): 런웨이가 짧아지면 정책자금·은행 대출을 메신저로 제안합니다.
// 정책자금 = 이자 낮음·한도 작음·심사(거절될 수 있음)·거치 기간, 은행 = 바로 실행·이자 높음·대표 개인 보증(파산하면 남은 빚을 창업자 자산에서).
// 빚은 기업가치에서 빠지고(valuation.ts), 이자는 손익, 원금은 월급일 현금에서 나갑니다(finance.ts).
import { DATA } from './data';
import { yearOf } from './calendar';
import { lastRevenue, runwayMonths, book } from './finance';
import { trigger } from './events';
import { hasMvp } from './product';
import { clearFlag, hasFlag, setFlag } from './mods';
import { ensureNamedExternal, post } from './messenger';
import { notify } from './notify';
import { rand } from './rng';
import { nextId } from './ids';
import type { GameState, Loan } from './types';

const L = DATA.finance.loan;
export const LOAN_EVENT = 'ev_b_fin_loan_offer';
const POLICY_LENDER = '창업진흥공단';
const BANK_LENDER = '한빛저축은행';

export function loanLimit(s: GameState, kind: 'policy' | 'bank'): number {
  const c = L[kind];
  return Math.round(Math.min(c.cap, c.base + c.revMult * lastRevenue(s)) / 1e6) * 1e6;
}

// 정책자금 심사 확률과 이유(숫자 없이 말로). 매출이 있고 제품 품질이 좋을수록, 창업자 명성이 높을수록 잘 됩니다.
export function policyApproval(s: GameState): { p: number; good: string[]; bad: string[] } {
  const c = L.policy;
  const good: string[] = [];
  const bad: string[] = [];
  let p = c.pBase;
  if (lastRevenue(s) > 0) {
    p += c.pRevenue;
    good.push('매출이 나고 있음');
  } else bad.push('아직 매출이 없음');
  const q = 1 - s.product.bugs / 100;
  p += c.pQuality * q;
  if (s.product.bugs > 50) bad.push('제품 오류가 많음');
  else if (s.product.bugs < 20) good.push('제품이 안정적임');
  const rp = Math.min(c.pRepCap, s.career.rep * c.pRep);
  p += rp;
  if (rp >= c.pRepCap * 0.5) good.push('대표의 이력');
  return { p: Math.max(0.1, Math.min(0.9, p)), good, bad };
}

function policyOpen(s: GameState): boolean {
  return !s.public && yearOf(s.day) - yearOf(s.company.startDay) < L.policy.maxAgeYears && !s.loanApp && !(s.loans ?? []).some((l) => l.kind === 'policy');
}

function bankOpen(s: GameState): boolean {
  return !s.public && !(s.loans ?? []).some((l) => l.kind === 'bank');
}

// 하루 한 번: 예전 저장의 가짜 대출 이전, 정책자금 심사 결과, 런웨이가 짧아지면 제안
export function loansDay(s: GameState) {
  if (hasFlag(s, 'bank_loan') && !(s.loans ?? []).length) {
    clearFlag(s, 'bank_loan');
    addLoan(s, 'bank', 30000000, false);
  }
  const app = s.loanApp;
  if (app && s.day >= app.decideDay) {
    s.loanApp = null;
    const ch = ensureNamedExternal(s, POLICY_LENDER);
    if (rand(s) < app.p) {
      addLoan(s, 'policy', app.amount, true);
      post(s, ch, POLICY_LENDER, `정책자금 심사를 통과했습니다. ${fmt(app.amount)}을 보내 드렸습니다. ${L.policy.graceMonths}개월 동안은 이자만 내시고, 그 뒤 ${L.policy.termMonths}개월에 걸쳐 나눠 갚으시면 됩니다.`, 'npc');
      notify(s, `정책자금 ${fmt(app.amount)}이 들어왔습니다.`, 'good', 'finance');
    } else {
      const why = policyApproval(s).bad;
      post(s, ch, POLICY_LENDER, `이번 정책자금 심사에서는 지원이 어렵게 됐습니다.${why.length ? ` 심사위원 의견: ${why.join(', ')}.` : ''} 상황이 나아지면 다시 신청해 주세요.`, 'npc');
      notify(s, '정책자금 심사에서 떨어졌습니다.', 'bad', 'messenger', ch);
    }
  }
  if (!hasMvp(s) || s.public) return;
  if (s.loanOfferDay !== undefined && s.day - s.loanOfferDay < L.offerCooldown) return;
  if (!policyOpen(s) && !bankOpen(s)) return;
  const rw = runwayMonths(s);
  if (rw === null || rw >= L.offerRunway) return;
  offerLoan(s);
}

function offerLoan(s: GameState) {
  s.loanOfferDay = s.day;
  setFlag(s, 'loan_offer_now');
  const d = trigger(s, LOAN_EVENT);
  clearFlag(s, 'loan_offer_now');
  if (!d) return;
  // 선택지 설명에 지금 한도를 넣습니다(심사 확률·이자 계산은 보여 주지 않음)
  for (const ch of d.choices) {
    if (ch.label.startsWith('정책자금')) {
      if (!policyOpen(s)) {
        ch.enabled = false;
        ch.why = '이미 받았거나 심사 중';
      }
      ch.hint = `최대 ${fmt(loanLimit(s, 'policy'))}, 심사 2~3주, 이자 낮음, ${L.policy.graceMonths}개월은 이자만`;
    } else if (ch.label.startsWith('은행')) {
      if (!bankOpen(s)) {
        ch.enabled = false;
        ch.why = '이미 받은 대출이 있음';
      }
      ch.hint = `최대 ${fmt(loanLimit(s, 'bank'))} 바로 입금, 이자 높음, 대표 개인 보증(파산하면 남은 빚을 대표가 갚음)`;
    }
  }
}

// 결정 결과(events.ts applyFx의 fx.loan)
export function applyLoanChoice(s: GameState, kind: string) {
  if (kind === 'policy' && policyOpen(s)) {
    const amount = loanLimit(s, 'policy');
    const ap = policyApproval(s);
    s.loanApp = { kind: 'policy', amount, decideDay: s.day + L.policy.reviewDays + Math.floor(rand(s) * 5), p: ap.p };
    post(s, ensureNamedExternal(s, POLICY_LENDER), POLICY_LENDER, `신청서를 받았습니다. 2~3주 안에 심사 결과를 알려 드리겠습니다.`, 'npc');
  } else if (kind === 'bank' && bankOpen(s)) {
    addLoan(s, 'bank', loanLimit(s, 'bank'), true);
  }
}

function addLoan(s: GameState, kind: 'policy' | 'bank', amount: number, announce: boolean) {
  const c = L[kind];
  const loan: Loan = {
    id: nextId(s, 'loan'),
    kind,
    lender: kind === 'policy' ? POLICY_LENDER : BANK_LENDER,
    principal: amount,
    balance: amount,
    rate: c.rate,
    startDay: s.day,
    graceUntil: s.day + c.graceMonths * 30,
    principalPay: Math.ceil(amount / c.termMonths),
    guaranteed: kind === 'bank',
  };
  (s.loans ??= []).push(loan);
  book(s, `${loan.lender} 대출`, amount);
  if (announce && kind === 'bank') notify(s, `${BANK_LENDER} 대출 ${fmt(amount)}이 들어왔습니다. 다음 달부터 원금과 이자를 갚습니다.`, 'info', 'finance');
}

function fmt(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억원`;
  return `${Math.round(n / 1e4).toLocaleString('ko-KR')}만원`;
}
