// F10 재무 메뉴: FN-01 보유 자금·장부, FN-02 비용, FN-03 손익(DEC-030 순서), VL-01 기업가치
// 화면 짜임은 채용 메뉴(A-88)를 따름: 왼쪽 회색 판(이번 달·요약 줄·막대), 오른쪽 카드 목록(월별 기록)
// 화면(A-179): 업무·커리어와 같은 톤 — 가운데 큰 손익·기업가치, 알약 탭·거르기, 돈 두 판은 납작한 옅은 면, 작은 라벨은 픽셀 글꼴(skin/FinanceApp.css)
import { useState } from 'react';
import { daysInMonthOf, formatDate, formatMonth } from '../../core/calendar';
import { currentPL, debtBalance, loanInterestDue, loanPrincipalDue, runwayMonths } from '../../core/finance';
import { wonShort } from '../../core/format';
import { monthPlan } from '../../core/forecast';
import { computeValuation } from '../../core/valuation';
import { applyForLoan, earlyRepayCost, loanBlock, loanHint, repayEarly } from '../../core/loans';
import { act, useGame } from '../store';
import { Money, Tabs, Help } from '../common';
import type { MonthPL } from '../../core/types';
import './apps.css';
import './skin/FinanceApp.css';

type PLMonth = Omit<MonthPL, 'cashAfter'> & { cashAfter?: number; partial?: boolean };
type Line = [string, (m: PLMonth) => number];

const REVENUES: Line[] = [
  ['구독·유료', (m) => m.revSub],
  ['광고', (m) => m.revAd],
  ['거래 수수료', (m) => m.revTake],
  ['대기업 계약', (m) => m.revEnt],
];

const COSTS: Line[] = [
  ['부가가치세', (m) => m.vat],
  ['월급', (m) => m.salary],
  ['4대보험', (m) => m.insurance],
  ['퇴직연금', (m) => m.pension],
  ['접대비·업무추진비', (m) => m.entertainment],
  ['채용 홍보비', (m) => m.recruiting],
  ['광고비', (m) => m.ads],
  ['인프라(클라우드)', (m) => m.infra],
  ['월세', (m) => m.rent],
  ['복지비', (m) => m.welfare],
  ['AI 도구 구독', (m) => m.ai],
  ['기타(이벤트·진출·인수·위로금)', (m) => m.other],
  ['법인세', (m) => m.tax],
  ['대출 이자', (m) => m.interest ?? 0], // A-137
];

// 비용 막대를 몇 갈래로 묶어 보여 줄지. 13줄을 다 그리면 왼쪽 판이 표처럼 빽빽해짐
function costGroups(m: PLMonth): { label: string; v: number }[] {
  // TODO(human)
  return COSTS.map(([label, f]) => ({ label, v: f(m) }));
}

export function FinanceApp() {
  const [tab, setTab] = useState<'pl' | 'cash' | 'value'>('pl');
  return (
    <div className="col fin fn2">
      <Tabs
        tabs={[
          { id: 'pl', label: '이번 달' },
          { id: 'cash', label: '거래 내역' },
          { id: 'value', label: '기업가치' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'pl' && <PLView />}
      {tab === 'cash' && <LedgerView />}
      {tab === 'value' && <ValueView />}
    </div>
  );
}

// Startup Company 예산 화면처럼: 왼쪽 빨간 판(나가는 돈), 오른쪽 초록 판(들어오는 돈), 아래 회색 판(통장)
// A-184 기간 고르기 없이 이번 달 한 달치를 한꺼번에 보여 줌. 돈은 하루에 1/30씩 실제로 오가고, 지난 달은 아래 손익표
function PLView() {
  const s = useGame();
  const cur: PLMonth = { ...currentPL(s), partial: true };
  const months: PLMonth[] = [...s.plHistory.slice(-5), cur];
  const plan: PLMonth = monthPlan(s);
  const [table, setTable] = useState(false);
  const rw = runwayMonths(s);
  const spent = plan.revenue - plan.netIncome;
  const perDay = (spent - plan.tax - (plan.interest ?? 0)) / daysInMonthOf(s.day); // 날마다 나눠 빠지는 몫(광고비 포함, 한 번 낸 돈은 plan에 없음 A-195)
  const debt = debtBalance(s);
  const lenders = [...new Set((s.loans ?? []).map((l) => l.lender))].join(', ');
  const monthName = formatMonth(plan.month);
  return (
    <div className="col">
      <div className={`fn2-head ${plan.netIncome < 0 ? 'bad' : ''}`}>
        <span className="fn2-kicker">
          {monthName} 한 달 {plan.netIncome < 0 ? '적자' : '흑자'}
        </span>
        <h2 className={`fn2-big ${plan.netIncome < 0 ? 'fin-bad' : 'fin-good'}`}>
          {plan.netIncome > 0 ? '+' : ''}
          {man(plan.netIncome)}만원
        </h2>
        <p className="fn2-sub">
          하루에 {man(perDay)}만원씩 나갑니다
          <Help text="한 달에 들어오고 나가는 돈입니다. 월급·월세·복지비 같은 돈은 월급일에 한꺼번에 빠지지 않고 날마다 한 달치를 나눠 빠지고, 매출도 날마다 들어옵니다. 들어오는 돈은 지금 고객 수가 이어진다고 본 값입니다. 법인세·대출 이자·원금은 매월 1일에 나갑니다. 채용 홍보비·광고 캠페인·이벤트·진출 비용처럼 한 번 낸 돈은 여기 넣지 않습니다. 그런 돈은 거래 내역과 아래 손익표에서 봅니다." />
        </p>
      </div>
      <div className="fin-budget">
        <MoneyList tone="out" title={`나가는 돈 · ${monthName}`} items={costGroups(plan)} total={spent} empty="나가는 돈이 없습니다" />
        <MoneyList tone="in" title={`들어오는 돈 · ${monthName}`} items={REVENUES.map(([label, f]) => ({ label, v: f(plan) }))} total={plan.revenue} empty="아직 버는 돈이 없습니다" />
      </div>
      <div className="fin-bank">
        <div className="fb-row">
          <span>통장 잔고</span>
          <b>
            <Money v={s.cash} testId="fin-cash" />
          </b>
        </div>
        {debt > 0 && (
          // A-137 빚이 있을 때만: 누구에게 얼마를 갚아야 하고 다음 월급일에 얼마가 나가는지
          <div className="fb-row" data-testid="fin-debt">
            <span className="fb-stack">
              갚을 대출
              <small>
                {lenders} · 다음 월급일에 이자 {man(loanInterestDue(s))}만원{loanPrincipalDue(s) > 0 ? ` + 원금 ${man(loanPrincipalDue(s))}만원` : ''}
              </small>
            </span>
            <b>
              <Money v={debt} />
            </b>
          </div>
        )}
        <div className="fb-row" title="최근 3개월 동안 돈이 줄어든 속도로 계산합니다">
          <span>이대로 버틸 수 있는 기간</span>
          <b className={rw !== null && rw < 3 ? 'fin-bad' : ''}>{rw === null ? '계속(흑자)' : rw > 120 ? '10년 넘게' : `${rw.toFixed(1)}개월`}</b>
        </div>
      </div>
      {!s.public && <LoanDesk />}
      <button className="btn small ghost fin-more" onClick={() => setTable((t) => !t)}>
        {table ? '지난 달 손익표 접기' : '지난 달 손익표 보기'}
      </button>
      {table && <PLTable months={months} />}
    </div>
  );
}

// A-185 대출 판: 받은 대출은 미리 갚기, 받을 수 있는 곳은 신청(버틸 기간이 짧을 때만, 막히면 이유를 말로)
function LoanDesk() {
  const s = useGame();
  const loans = s.loans ?? [];
  const [sure, setSure] = useState<string | null>(null); // 미리 갚기는 한 번 더 눌러야 실행
  const offers = (['policy', 'bank'] as const).filter((k) => !loans.some((l) => l.kind === k));
  return (
    <section className="fin-bank fin-loans" data-testid="fin-loans">
      <div className="fb-head">대출</div>
      {loans.map((l) => {
        const { principal, fee } = earlyRepayCost(s, l);
        const short = s.cash < principal + fee;
        return (
          <div key={l.id} className="fb-row">
            <span className="fb-stack">
              {l.lender}
              <small>
                남은 원금 {man(principal)}만원{fee > 0 ? ` · 미리 갚으면 수수료 ${man(fee)}만원` : ' · 미리 갚아도 수수료 없음'}
              </small>
            </span>
            <button
              className={`btn small ${sure === l.id ? 'red' : 'ghost'}`}
              data-testid={`loan-repay-${l.kind}`}
              disabled={short}
              title={short ? '통장 잔고가 모자랍니다' : undefined}
              onClick={() => {
                if (sure !== l.id) return setSure(l.id);
                act((g) => repayEarly(g, l.id));
                setSure(null);
              }}
            >
              {sure === l.id ? `${man(principal + fee)}만원 갚기` : '미리 갚기'}
            </button>
          </div>
        );
      })}
      {offers.map((k) => {
        const why = loanBlock(s, k);
        return (
          <div key={k} className="fb-row">
            <span className="fb-stack">
              {k === 'policy' ? '정책자금' : '은행 대출'}
              <small>{why ?? loanHint(s, k)}</small>
            </span>
            <button className="btn small" data-testid={`loan-apply-${k}`} disabled={!!why} onClick={() => act((g) => applyForLoan(g, k))}>
              {k === 'policy' ? '신청' : '빌리기'}
            </button>
          </div>
        );
      })}
    </section>
  );
}

// 금액 목록 판: 이름 왼쪽·금액 오른쪽, 0원 줄은 빼고 맨 아래 합계
function MoneyList({ tone, title, items, total, empty }: { tone: 'in' | 'out'; title: string; items: { label: string; v: number }[]; total: number; empty: string }) {
  const shown = items.filter((x) => Math.round(x.v / 1e4) !== 0);
  return (
    <section className={`fb-panel ${tone}`}>
      <div className="fb-head">{title}</div>
      <div className="fb-lines">
        {shown.length === 0 && <div className="fb-empty">{empty}</div>}
        {shown.map((x) => (
          <div key={x.label} className="fb-line">
            <span>{x.label}</span>
            <b>{man(x.v)}만원</b>
          </div>
        ))}
      </div>
      <div className="fb-line fb-total">
        <span>합계</span>
        <b>{man(total)}만원</b>
      </div>
    </section>
  );
}

function PLTable({ months }: { months: PLMonth[] }) {
  const rows: [string, (m: PLMonth) => number, string?][] = [
    ['총매출', (m) => m.revenue, 'strong'],
    ...REVENUES.map(([l, f]): [string, (m: PLMonth) => number] => [`  ${l}`, f]),
    ...COSTS.filter(([l]) => l !== '법인세' && l !== '대출 이자').map(([l, f]): [string, (m: PLMonth) => number] => [`− ${l}`, (m) => -f(m)]),
    ['영업비용 합계', (m) => -m.opex, 'sub'],
    ['= 영업이익', (m) => m.operatingProfit, 'strong'],
    ['− 법인세', (m) => -m.tax],
    ...(months.some((m) => m.interest) ? [['− 대출 이자', (m: PLMonth) => -(m.interest ?? 0)] as [string, (m: PLMonth) => number]] : []),
    ['= 순이익(손익)', (m) => m.netIncome, 'total'],
    ['투자금 유입', (m) => m.investment],
    ['월초 자금', (m) => m.cashBefore],
  ];
  return (
    <table className="t pl" data-testid="pl-table">
      <thead>
        <tr>
          <th className="muted">단위: 만원</th>
          {months.map((m) => (
            <th key={m.month} className="r">
              {formatMonth(m.month)}
              {m.partial ? ' (진행 중)' : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.filter(([, f, cls]) => cls === 'strong' || cls === 'total' || months.some((m) => Math.round(f(m) || 0) !== 0)).map(([label, f, cls]) => (
          <tr key={label} className={cls === 'total' ? 'total' : ''}>
            <td className={cls === 'strong' || cls === 'total' ? 'b' : cls === 'sub' ? 'muted' : ''}>{label}</td>
            {months.map((m) => (
              <td key={m.month} className="r num">
                {man(f(m) || 0)}
              </td>
            ))}
          </tr>
        ))}
        <tr>
          <td>월말 자금(정산 후)</td>
          {months.map((m) => (
            <td key={m.month} className="r num">
              {m.cashAfter !== undefined ? man(m.cashAfter) : '-'}
            </td>
          ))}
        </tr>
        <tr>
          <td>월말 고객 수</td>
          {months.map((m) => (
            <td key={m.month} className="r num">
              {m.partial ? '-' : m.usersEnd.toLocaleString('ko-KR')}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

// 자금 장부: 채용 지원자 거르기처럼 버튼 묶음으로 들어온 돈·나간 돈 거르기
function LedgerView() {
  const s = useGame();
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const recent = s.ledger.slice(-40).reverse();
  const shown = filter === 'all' ? recent : recent.filter((l) => (filter === 'in' ? l.amount > 0 : l.amount < 0));
  return (
    <div className="col">
      <div className="seg applicant-filter">
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
          전체 {recent.length}
        </button>
        <button className={filter === 'in' ? 'on' : ''} onClick={() => setFilter('in')}>
          들어온 돈 {recent.filter((l) => l.amount > 0).length}
        </button>
        <button className={filter === 'out' ? 'on' : ''} onClick={() => setFilter('out')}>
          나간 돈 {recent.filter((l) => l.amount < 0).length}
        </button>
      </div>
      {shown.length === 0 ? (
        <div className="empty-note">아직 기록이 없습니다.</div>
      ) : (
        <table className="t fin-ledger">
          <thead>
            <tr>
              <th>날짜</th>
              <th>항목</th>
              <th className="r">금액</th>
              <th className="r">잔액</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l, i) => (
              <tr key={i}>
                <td className="muted">{formatDate(l.day)}</td>
                <td>
                  <span className={`fin-dot ${l.amount < 0 ? 'out' : 'in'}`} />
                  {l.item}
                </td>
                <td className={`r num ${l.amount < 0 ? 'fin-bad' : 'fin-good'}`}>
                  {l.amount > 0 ? '+' : ''}
                  {wonShort(l.amount)}
                </td>
                <td className="r num">{wonShort(l.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ValueView() {
  const s = useGame();
  const v = computeValuation(s);
  const methodName = { scorecard: '매출 전: 스코어카드(또는 사용자 기반)', revenue: '매출 발생 뒤: 연 환산 매출 × 매출 배수(또는 사용자 기반)', profit: '흑자 지속: 영업이익 × 이익 배수', market: '상장사: 시가총액' }[v.method];
  return (
    <section className="hire-form fn2-value">
      <div className="fn2-head">
        <span className="fn2-kicker">지금 산정한 기업가치</span>
        <h2 className="fn2-big fin-big">
          <Money v={v.value} testId="value-now" />
        </h2>
        <p className="fn2-sub">
          {methodName.split(':')[0]} 기준
          <Help text={`계산법: ${methodName}. HUD의 기업가치는 매월 1일 정산과 투자 수락 때 갱신한 값이고, 투자 라운드와 Exit은 이 화면처럼 그때그때 다시 산정합니다.`} />
        </p>
      </div>
      <div className="hf-summary">
        <div className="hf-sum">
          <span>사업가치</span>
          <b>{wonShort(v.business)}</b>
        </div>
        <span className="fin-op">+</span>
        <div className="hf-sum">
          <span>보유 자금</span>
          <b>{wonShort(v.cash)}</b>
        </div>
        {v.penalty && (
          <>
            <span className="fin-op">×</span>
            <div className="hf-sum">
              <span>Exit 실패 여파</span>
              <b className="fin-bad">0.8</b>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// 손익은 만원 단위(표가 덜 빽빽하게)
function man(v: number): string {
  return Math.round(v / 1e4).toLocaleString('ko-KR');
}
