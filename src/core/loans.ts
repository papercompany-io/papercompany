// A-137 버티는 수단(돈): 런웨이가 짧아지면 정책자금·은행 대출을 메신저로 제안합니다.
// 정책자금 = 이자 낮음·한도 작음·심사(거절될 수 있음)·거치 기간, 은행 = 바로 실행·이자 높음·대표 개인 보증(파산하면 남은 빚을 창업자 자산에서).
// 빚은 기업가치에서 빠지고(valuation.ts), 이자는 손익, 원금은 월급일 현금에서 나갑니다(finance.ts).
import { DATA } from './data';
import { yearOf } from './calendar';
import { lastRevenue, runwayMonths, book, spendNow } from './finance';
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
      ch.hint = loanHint(s, 'policy');
    } else if (ch.label.startsWith('은행')) {
      if (!bankOpen(s)) {
        ch.enabled = false;
        ch.why = '이미 받은 대출이 있음';
      }
      ch.hint = loanHint(s, 'bank');
    }
  }
}

// 선택지·재무 화면이 같이 쓰는 조건 설명(심사 확률·이자율 숫자는 보여 주지 않음)
export function loanHint(s: GameState, kind: 'policy' | 'bank'): string {
  return kind === 'policy'
    ? `최대 ${fmt(loanLimit(s, 'policy'))}, 심사 2~3주, 이자 낮음, ${L.policy.graceMonths}개월은 이자만`
    : `최대 ${fmt(loanLimit(s, 'bank'))} 바로 입금, 이자 높음, 대표 개인 보증(파산하면 남은 빚을 대표가 갚음)`;
}

// A-185 재무 화면에서 직접 신청: 메신저 제안과 같은 조건(제품 출시 뒤, 버틸 기간이 offerRunway개월 아래). 막히면 이유를 말로
export function loanBlock(s: GameState, kind: 'policy' | 'bank'): string | null {
  if (s.public) return '상장한 회사는 신청할 수 없습니다';
  if (!hasMvp(s)) return '제품을 내놓은 뒤에 신청할 수 있습니다';
  if (kind === 'policy') {
    if (s.loanApp) return '심사 중입니다';
    if ((s.loans ?? []).some((l) => l.kind === 'policy')) return '이미 받은 정책자금이 있습니다';
    if (!policyOpen(s)) return `창업 ${L.policy.maxAgeYears}년이 지나 신청할 수 없습니다`;
  } else if (!bankOpen(s)) return '이미 받은 은행 대출이 있습니다';
  const rw = runwayMonths(s);
  if (rw === null || rw >= L.offerRunway) return `버틸 기간이 ${L.offerRunway}개월 아래로 줄면 신청할 수 있습니다`;
  return null;
}

export function applyForLoan(s: GameState, kind: 'policy' | 'bank') {
  if (loanBlock(s, kind)) return;
  applyLoanChoice(s, kind);
}

// A-185 미리 갚기: 남은 원금 + 중도상환수수료(earlyFee, 기타 비용)를 한 번에. 다 갚으면 같은 곳에서 다시 빌릴 수 있음
export function earlyRepayCost(s: GameState, loan: Loan): { principal: number; fee: number } {
  const principal = Math.round(loan.balance);
  return { principal, fee: Math.round(principal * L[loan.kind].earlyFee) };
}

export function repayEarly(s: GameState, id: string): boolean {
  const loan = (s.loans ?? []).find((l) => l.id === id);
  if (!loan) return false;
  const { principal, fee } = earlyRepayCost(s, loan);
  if (s.cash < principal + fee) return false;
  book(s, `${loan.lender} 대출 미리 상환`, -principal);
  spendNow(s, `${loan.lender} 중도상환수수료`, fee, 'other');
  s.loans = (s.loans ?? []).filter((l) => l.id !== id);
  return true;
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
