// FN-01 보유 자금, FN-02 비용, FN-03 손익, HR-02 인건비. 매출·비용은 하루씩 쌓고 월급일(매월 1일)에 손익을 마감합니다(A-12).
// A-184 Startup Company처럼 매출과 고정비(월급·보험·월세·복지·인프라·AI·접대비)는 하루치씩 자금에 바로 반영하고, 법인세·대출 이자·원금만 월급일에 나갑니다.
// 바로 나가는 돈(채용 홍보비·광고비·이벤트 비용·진출 비용)은 그날 자금에서 빠지고, 손익에는 그 달 비용으로 들어갑니다.
import { DATA } from './data';
import { daysInMonthOf, monthKey } from './calendar';
import type { GameState, MonthAccrual, MonthPL } from './types';
import { orderCount } from './assign';

const F = DATA.finance;

export type CostBucket = 'recruiting' | 'ads' | 'other' | 'entertainment';

export function newAccrual(day: number, cash: number): MonthAccrual {
  return { month: monthKey(day), revSub: 0, revAd: 0, revTake: 0, revEnt: 0, salaryUnits: 0, entertainment: 0, recruiting: 0, ads: 0, infra: 0, welfare: 0, ai: 0, other: 0, investment: 0, cashStart: cash, days: 0 };
}

export function book(s: GameState, item: string, amount: number) {
  s.cash += amount;
  if (!item) return;
  s.ledger.push({ day: s.day, item, amount: Math.round(amount), balance: Math.round(s.cash) });
  if (s.ledger.length > 300) s.ledger.splice(0, s.ledger.length - 300);
}

// 바로 빠지는 비용. bucket 'deposit'은 보증금(자산)이라 손익에 넣지 않습니다. silent면 거래 기록을 남기지 않습니다(매일 나가는 광고비).
export function spendNow(s: GameState, item: string, amount: number, bucket: CostBucket | 'deposit', silent = false) {
  if (amount <= 0) return;
  book(s, silent ? '' : item, -amount);
  if (bucket !== 'deposit') s.accrual[bucket] += amount;
}

export function monthlySalary(s: GameState): number {
  return s.employees.reduce((sum, e) => sum + e.salary, 0);
}

export function payrollWithBenefits(salary: number) {
  const insurance = Math.round(salary * F.insuranceRate);
  const pension = Math.round(salary * F.pensionRate);
  return { salary, insurance, pension, total: salary + insurance + pension };
}

export function welfareMonthly(s: GameState): number {
  const per = s.company.welfare.reduce((a, id) => a + (DATA.welfare.items.find((w) => w.id === id)?.cost ?? 0), 0);
  return per * s.employees.length;
}

export function rentMonthly(s: GameState): number {
  return DATA.offices.tiers.find((t) => t.id === s.company.officeTier)!.rent;
}

export function enterpriseMonthly(s: GameState): number {
  return s.enterprise.filter((d) => d.startDay <= s.day && d.endDay > s.day).reduce((a, d) => a + d.monthly, 0);
}

// 하루치 누적: 월급·복지비·대기업 계약 매출(사용자 매출·인프라비는 시장 처리에서, AI 비용은 AI 처리에서 쌓음)
export function accrueDay(s: GameState) {
  const dim = daysInMonthOf(s.day);
  s.accrual.salaryUnits += monthlySalary(s);
  s.accrual.welfare += welfareMonthly(s) / dim;
  s.accrual.revEnt += enterpriseMonthly(s) / dim;
  s.accrual.days += 1;
}

// A-184 지금까지 쌓인 매출 − 부가세 − 고정비(쓰는 날 바로 빠진 홍보비·광고비·기타는 뺌)
function dueSoFar(pl: Omit<MonthPL, 'cashAfter'>): number {
  return pl.revenue - pl.vat - (pl.salary + pl.insurance + pl.pension + pl.entertainment + pl.infra + pl.rent + pl.welfare + pl.ai);
}

// A-184 하루 끝: 오늘 쌓인 만큼만 자금에 반영(거래 내역에는 월급일에 항목별로 한 줄씩 남김)
export function settleDay(s: GameState, dim = daysInMonthOf(s.day)) {
  const due = dueSoFar(computePL(s, s.accrual, dim));
  const delta = due - (s.accrual.settled ?? 0);
  if (delta) book(s, '', delta);
  s.accrual.settled = due;
}

// 거래 내역에만 남기는 줄(돈은 이미 하루씩 오감)
function note(s: GameState, item: string, amount: number) {
  if (!amount) return;
  s.ledger.push({ day: s.day, item, amount: Math.round(amount), balance: Math.round(s.cash) });
  if (s.ledger.length > 300) s.ledger.splice(0, s.ledger.length - 300);
}

function taxOf(s: GameState, op: number): number {
  if (op <= 0) return 0;
  const hi = F.corpTaxHighFrom / 12;
  const raw = Math.min(op, hi) * F.corpTaxRate + Math.max(0, op - hi) * F.corpTaxHighRate;
  const fl = Math.min(0.2, orderCount(s, 'finlegal', 'fl_tax') * 0.04); // 세무 최적화를 맡은 사람 수(A-147)
  return Math.round(raw * (1 - fl));
}

export function computePL(s: GameState, a: MonthAccrual, dim: number): Omit<MonthPL, 'cashAfter'> {
  const revSub = Math.round(a.revSub);
  const revAd = Math.round(a.revAd);
  const revTake = Math.round(a.revTake);
  const revEnt = Math.round(a.revEnt);
  const revenue = revSub + revAd + revTake + revEnt;
  const vat = Math.round(revenue * F.vatRate);
  const pay = payrollWithBenefits(Math.round(a.salaryUnits / dim));
  const rent = Math.round((rentMonthly(s) * Math.min(dim, a.days)) / dim);
  const infra = Math.round(a.infra);
  const welfare = Math.round(a.welfare);
  const ai = Math.round(a.ai);
  const opex = pay.total + a.entertainment + a.recruiting + a.ads + infra + rent + welfare + ai + a.other;
  const operatingProfit = revenue - vat - opex;
  const tax = taxOf(s, operatingProfit);
  const interest = Math.round(a.interest ?? 0);
  return {
    month: a.month,
    revenue,
    revSub,
    revAd,
    revTake,
    revEnt,
    vat,
    salary: pay.salary,
    insurance: pay.insurance,
    pension: pay.pension,
    entertainment: Math.round(a.entertainment),
    recruiting: Math.round(a.recruiting),
    ads: Math.round(a.ads),
    infra,
    rent,
    welfare,
    ai,
    other: Math.round(a.other),
    opex: Math.round(opex),
    operatingProfit: Math.round(operatingProfit),
    tax,
    interest,
    netIncome: Math.round(operatingProfit - tax - interest),
    cashBefore: Math.round(a.cashStart),
    investment: a.investment,
    usersEnd: 0,
  };
}

// 월급일 마감: 매출·고정비는 하루씩 이미 오갔으므로(A-184) 남은 끝전만 맞추고, 법인세·대출 이자·원금이 나갑니다.
export function closeMonth(s: GameState, usersEnd: number): MonthPL {
  const dim = daysInMonthOf(s.day - 1);
  settleDay(s, dim);
  s.accrual.interest = loanInterestDue(s); // A-137 지난달 이자
  const pl = computePL(s, s.accrual, dim);
  pl.usersEnd = Math.floor(usersEnd);
  const label = pl.month.replace('-', '년 ') + '월';
  note(s, `${label} 매출(매일 들어옴)`, pl.revenue);
  note(s, `${label} 부가가치세(매일 나감)`, -pl.vat);
  note(s, `${label} 월급·4대보험·퇴직연금(매일 나감)`, -(pl.salary + pl.insurance + pl.pension));
  note(s, `${label} 접대비·업무추진비(매일 나감)`, -pl.entertainment);
  note(s, `${label} 인프라(클라우드)(매일 나감)`, -pl.infra);
  note(s, `${label} 월세(매일 나감)`, -pl.rent);
  note(s, `${label} 복지비(매일 나감)`, -pl.welfare);
  note(s, `${label} AI 도구 구독(매일 나감)`, -pl.ai);
  if (pl.tax > 0) book(s, `${label} 법인세`, -pl.tax);
  if (pl.interest) book(s, `${label} 대출 이자`, -pl.interest);
  const paid = repayLoans(s, label);
  if (paid) pl.loanPaid = paid;
  const full: MonthPL = { ...pl, cashAfter: Math.round(s.cash) };
  s.plHistory.push(full);
  if (s.plHistory.length > 480) s.plHistory.splice(0, s.plHistory.length - 480);
  s.accrual = newAccrual(s.day, s.cash);
  return full;
}

export function currentPL(s: GameState) {
  return computePL(s, s.accrual, daysInMonthOf(s.day));
}

export function lastPL(s: GameState): MonthPL | null {
  return s.plHistory.length ? s.plHistory[s.plHistory.length - 1] : null;
}

export function lastRevenue(s: GameState): number {
  return lastPL(s)?.revenue ?? 0;
}

export function pendingSalary(s: GameState): number {
  return s.pendingHires.reduce((sum, h) => sum + h.salary, 0);
}

export function projectedMonthlyPayroll(s: GameState, extraSalary = 0): number {
  return payrollWithBenefits(monthlySalary(s) + pendingSalary(s) + extraSalary).total;
}

// 하루 흐름(지금 상태가 그대로 간다고 볼 때): 정산 때 들어오고 나갈 돈
export interface DailyRates {
  revenue: number;
  infra: number;
  ai: number;
  ads: number;
}

// A-184 이번 달 한 달치 손익: 고정비는 한 달치 전부, 매출·인프라·AI·광고는 지금 하루 흐름이 남은 날에도 이어진다고 봅니다.
// recurringOnly(A-195): 한 번 낸 돈(채용 홍보비·기타·광고 캠페인)은 빼고 달마다 오가는 돈만
export function monthOutlook(s: GameState, rates: DailyRates, futureEntertainment = 0, recurringOnly = false): Omit<MonthPL, 'cashAfter'> {
  const dim = daysInMonthOf(s.day);
  const left = dim - s.accrual.days;
  const a = recurringOnly ? { ...s.accrual, recruiting: 0, other: 0, ads: s.accrual.ads - (s.accrual.adsOnce ?? 0) } : s.accrual;
  const pendingUnits = s.pendingHires.reduce((sum, h) => sum + h.salary * Math.max(0, left - Math.max(0, h.startDay - s.day)), 0);
  const full: MonthAccrual = {
    ...a,
    salaryUnits: a.salaryUnits + monthlySalary(s) * left + pendingUnits,
    revSub: a.revSub + rates.revenue * left, // 남은 날 사용자 매출은 갈래를 나누지 않고 구독·유료에 모음
    revEnt: a.revEnt + (enterpriseMonthly(s) / dim) * left,
    entertainment: a.entertainment + futureEntertainment,
    infra: a.infra + rates.infra * left,
    welfare: a.welfare + (welfareMonthly(s) / dim) * left,
    ai: a.ai + rates.ai * left,
    ads: a.ads + rates.ads * left,
    days: dim,
    interest: loanInterestDue(s),
  };
  return computePL(s, full, dim);
}

// FN-01 다음 월급일 예상 자금. 남은 날은 지금 하루 흐름이 이어진다고 봅니다.
export function nextPaydayForecast(s: GameState, rates: DailyRates, futureEntertainment = 0) {
  const left = daysInMonthOf(s.day) - s.accrual.days;
  const pl = monthOutlook(s, rates, futureEntertainment);
  const adsLeft = pl.ads - s.accrual.ads; // 광고비는 매일 나가므로 남은 날만
  const cashAfter = s.cash - adsLeft + dueSoFar(pl) - (s.accrual.settled ?? 0) - pl.tax - (pl.interest ?? 0) - loanPrincipalDue(s); // A-184 이미 하루씩 오간 돈은 빼고 남은 날 몫만
  return { cashAfter: Math.round(cashAfter), salaryOut: pl.salary + pl.insurance + pl.pension, revenue: pl.revenue, daysLeft: left };
}

// FN-01 런웨이(개월): 최근 월 순손실 기준 [Claude 제안]
// 최근 3개월 평균, 일회성 비용(이벤트·진출·인수)은 뺍니다.
export function runwayMonths(s: GameState): number | null {
  const h = s.plHistory.slice(-3);
  const avgNet = h.length ? h.reduce((a, m) => a + m.netIncome + m.other, 0) / h.length : 0;
  const lastRev = h.length ? h[h.length - 1].revenue - h[h.length - 1].vat : 0;
  const fixed = projectedMonthlyPayroll(s) + rentMonthly(s) + welfareMonthly(s) + loanPrincipalDue(s);
  const burn = Math.max(-avgNet, fixed - lastRev);
  if (burn <= 0) return null;
  return Math.max(0, s.cash) / burn;
}

// ── A-137 대출: 남은 빚, 이번 달 이자·원금, 월급일 상환 ──
export function debtBalance(s: GameState): number {
  return (s.loans ?? []).reduce((a, l) => a + l.balance, 0);
}

export function guaranteedDebt(s: GameState): number {
  return (s.loans ?? []).filter((l) => l.guaranteed).reduce((a, l) => a + l.balance, 0);
}

export function loanInterestDue(s: GameState): number {
  return Math.round((s.loans ?? []).reduce((a, l) => a + (l.balance * l.rate) / 12, 0));
}

export function loanPrincipalDue(s: GameState): number {
  return Math.round((s.loans ?? []).reduce((a, l) => a + (s.day >= l.graceUntil ? Math.min(l.balance, l.principalPay) : 0), 0));
}

// 월급일: 거치 기간이 끝난 대출의 원금을 갚습니다(손익이 아니라 현금만 줄어듦). 다 갚은 대출은 지웁니다.
function repayLoans(s: GameState, label: string): number {
  let paid = 0;
  for (const l of s.loans ?? []) {
    if (s.day < l.graceUntil) continue;
    const p = Math.min(l.balance, l.principalPay);
    if (p <= 0) continue;
    l.balance -= p;
    paid += p;
    book(s, `${label} ${l.lender} 원금 상환`, -p);
  }
  if (s.loans) s.loans = s.loans.filter((l) => l.balance > 0.5);
  return Math.round(paid);
}
