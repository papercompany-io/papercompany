// F10 재무 메뉴: FN-01 보유 자금·장부, FN-02 비용, FN-03 손익(DEC-030 순서), VL-01 기업가치
// 화면 짜임은 채용 메뉴(A-88)를 따름: 왼쪽 회색 판(이번 달·요약 줄·막대), 오른쪽 카드 목록(월별 기록)
import { useState } from 'react';
import { formatDate, formatMonth } from '../../core/calendar';
import { currentPL, debtBalance, loanInterestDue, loanPrincipalDue, runwayMonths } from '../../core/finance';
import { wonShort } from '../../core/format';
import { computeValuation } from '../../core/valuation';
import { useGame } from '../store';
import { Money, Tabs, Help } from '../common';
import type { MonthPL } from '../../core/types';
import './apps.css';

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
    <div className="col fin">
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

// Startup Company 예산 화면처럼: 위 달 고르기, 왼쪽 빨간 판(나가는 돈), 오른쪽 초록 판(들어오는 돈), 아래 회색 판(통장)
// 이번 달은 지금까지 실제로 들어오고 나간 돈이 쌓이고, 지난 달은 정산된 값(A-153)
function PLView() {
  const s = useGame();
  const cur: PLMonth = { ...currentPL(s), partial: true };
  const months: PLMonth[] = [...s.plHistory.slice(-5), cur];
  const all: PLMonth[] = [...s.plHistory, cur]; // 달 고르기에는 지난 달 전부
  const [table, setTable] = useState(false);
  const [pick, setPick] = useState<string | null>(null); // A-153 고른 달. 없으면 이번 달
  const shownM = all.find((m) => m.month === pick) ?? cur;
  const monthName = `${formatMonth(shownM.month)}${shownM.partial ? ' (진행 중)' : ''}`;
  const rw = runwayMonths(s);
  const spent = shownM.revenue - shownM.netIncome;
  const debt = debtBalance(s);
  const lenders = [...new Set((s.loans ?? []).map((l) => l.lender))].join(', ');
  return (
    <div className="col">
      <label className="fin-months">
        <span>기간</span>
        <select data-testid="fin-month" value={shownM.partial ? '' : shownM.month} onChange={(e) => setPick(e.target.value || null)}>
          {[...all].reverse().map((m) => (
            <option key={m.month} value={m.partial ? '' : m.month}>
              {m.partial ? `이번 달 (${formatMonth(m.month)})` : formatMonth(m.month)}
            </option>
          ))}
        </select>
      </label>
      <div className="fin-budget">
        <MoneyList tone="out" title={`나가는 돈 · ${monthName}`} items={costGroups(shownM)} total={spent} empty={shownM.partial ? '아직 나간 돈이 없습니다' : '나간 돈이 없습니다'} />
        <MoneyList tone="in" title={`들어오는 돈 · ${monthName}`} items={REVENUES.map(([label, f]) => ({ label, v: f(shownM) }))} total={shownM.revenue} empty={shownM.partial ? '아직 번 돈이 없습니다' : '들어온 돈이 없습니다'} />
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
        <div className="fb-row big">
          <span>
            {shownM.partial ? '이번 달' : formatMonth(shownM.month)} {shownM.netIncome < 0 ? '적자' : '흑자'}
            <Help text="손익 = 들어오는 돈 − 나가는 돈. 이번 달은 지금까지 실제로 쌓인 돈이고, 위 기간에서 지난 달을 고르면 정산된 결과를 봅니다. 매월 1일(월급일)에 지난달을 정산합니다. 홍보비·광고비·이벤트 비용은 쓰는 날 바로 빠지고, 나머지는 정산일에 빠집니다." />
          </span>
          <b className={shownM.netIncome < 0 ? 'fin-bad' : 'fin-good'}>
            {shownM.netIncome > 0 ? '+' : ''}
            {man(shownM.netIncome)}만원
          </b>
        </div>
      </div>
      <button className="btn small ghost fin-more" onClick={() => setTable((t) => !t)}>
        {table ? '지난 달 손익표 접기' : '지난 달 손익표 보기'}
      </button>
      {table && <PLTable months={months} />}
    </div>
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
    <section className="hire-form">
      <div className="hf-title">
        지금 산정한 기업가치
        <Help text={`계산법: ${methodName}. HUD의 기업가치는 매월 1일 정산과 투자 수락 때 갱신한 값이고, 투자 라운드와 Exit은 이 화면처럼 그때그때 다시 산정합니다.`} />
      </div>
      <div className="fin-big">
        <Money v={v.value} testId="value-now" />
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
