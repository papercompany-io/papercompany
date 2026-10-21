// FN-01 보유 자금, FN-02 비용, FN-03 손익, HR-02 인건비 지출
import { DATA } from './data';
import { daysInMonthOf, monthKey } from './calendar';
import type { GameState, MonthAccrual, MonthPL } from './types';

const F = DATA.finance;

export function newAccrual(day: number, cash: number): MonthAccrual {
  return { month: monthKey(day), customerDays: 0, salaryUnits: 0, entertainment: 0, recruiting: 0, ads: 0, investment: 0, cashStart: cash };
}

// FN-01 거래 기록
export function book(s: GameState, item: string, amount: number) {
  s.cash += amount;
  s.ledger.push({ day: s.day, item, amount, balance: s.cash });
  if (s.ledger.length > 300) s.ledger.splice(0, s.ledger.length - 300);
}

// 바로 빠지는 비용(채용 홍보비 HR-04, 광고비)
export function spendNow(s: GameState, item: string, amount: number, bucket: 'recruiting' | 'ads') {
  if (amount <= 0) return;
  book(s, item, -amount);
  s.accrual[bucket] += amount;
}

export function monthlySalary(s: GameState): number {
  return s.employees.reduce((sum, e) => sum + e.salary, 0);
}

// HR-02 인건비(월급 + 4대보험 + 퇴직연금 회사 부담분)
export function payrollWithBenefits(salary: number) {
  const insurance = Math.round(salary * F.insuranceRate);
  const pension = Math.round(salary * F.pensionRate);
  return { salary, insurance, pension, total: salary + insurance + pension };
}

// 하루치 누적: 고객일, 월급
export function accrueDay(s: GameState) {
  s.accrual.customerDays += Math.floor(s.customers);
  s.accrual.salaryUnits += monthlySalary(s);
}

// 진행 중인 달의 손익(지금까지 누적분 기준). 정산과 같은 식을 씁니다.
export function computePL(a: MonthAccrual, dim: number, s: GameState): Omit<MonthPL, 'cashAfter'> {
  const revenue = Math.round((a.customerDays * F.pricePerCustomer) / dim);
  const vat = Math.round(revenue * F.vatRate);
  const pay = payrollWithBenefits(Math.round(a.salaryUnits / dim));
  const opex = pay.salary + pay.insurance + pay.pension + a.entertainment + a.recruiting + a.ads;
  const operatingProfit = revenue - vat - opex;
  const tax = operatingProfit > 0 ? Math.round(operatingProfit * F.corpTaxRate) : 0;
  return {
    month: a.month,
    revenue,
    vat,
    salary: pay.salary,
    insurance: pay.insurance,
    pension: pay.pension,
    entertainment: a.entertainment,
    recruiting: a.recruiting,
    ads: a.ads,
    opex,
    operatingProfit,
    tax,
    netIncome: operatingProfit - tax,
    cashBefore: a.cashStart,
    investment: a.investment,
    customersEnd: Math.floor(s.customers),
  };
}

// 월급일(매월 1일) 정산: 지난달 손익을 확정하고 아직 안 낸 돈을 주고받습니다(A-12).
export function closeMonth(s: GameState): MonthPL {
  const dim = daysInMonthOf(s.day - 1);
  const pl = computePL(s.accrual, dim, s);
  const label = pl.month.replace('-', '년 ') + '월';
  if (pl.revenue > 0) book(s, `${label} 매출`, pl.revenue);
  if (pl.vat > 0) book(s, `${label} 부가가치세`, -pl.vat);
  if (pl.salary > 0) book(s, `${label} 월급`, -pl.salary);
  if (pl.insurance > 0) book(s, `${label} 4대보험(회사)`, -pl.insurance);
  if (pl.pension > 0) book(s, `${label} 퇴직연금(회사)`, -pl.pension);
  if (pl.entertainment > 0) book(s, `${label} 접대비·업무추진비`, -pl.entertainment);
  if (pl.tax > 0) book(s, `${label} 법인세`, -pl.tax);
  const full: MonthPL = { ...pl, cashAfter: s.cash };
  s.plHistory.push(full);
  s.accrual = newAccrual(s.day, s.cash);
  return full;
}

export function currentPL(s: GameState) {
  return computePL(s.accrual, daysInMonthOf(s.day), s);
}

export function lastPL(s: GameState): MonthPL | null {
  return s.plHistory.length ? s.plHistory[s.plHistory.length - 1] : null;
}

// 다음 월급일에 낼 고정비 예상(인건비)
export function projectedMonthlyPayroll(s: GameState, extraSalary = 0): number {
  return payrollWithBenefits(monthlySalary(s) + extraSalary).total;
}

// FN-01 런웨이(개월): 최근 월 소진액 기준 [Claude 제안]
export function runwayMonths(s: GameState): number | null {
  const last = lastPL(s);
  const burn = last ? -(last.netIncome) : projectedMonthlyPayroll(s);
  if (burn <= 0) return null;
  return s.cash / burn;
}
