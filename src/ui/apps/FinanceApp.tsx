// F10 재무 메뉴: FN-01 보유 자금·장부, FN-02 비용, FN-03 손익(DEC-030 순서), VL-01 기업가치
import { paydayForecast } from '../../core/forecast';
import { useState } from 'react';
import { formatDate, formatMonth } from '../../core/calendar';
import { currentPL, runwayMonths } from '../../core/finance';
import { wonShort } from '../../core/format';
import { computeValuation } from '../../core/valuation';
import { useGame } from '../store';
import { Money, Tabs, Help } from '../common';
import type { MonthPL } from '../../core/types';
import { Spark } from './StockApp';
import './apps.css';

export function FinanceApp() {
  const s = useGame();
  const [tab, setTab] = useState<'pl' | 'cash' | 'value'>('pl');
  const rw = runwayMonths(s);
  const fc = paydayForecast(s);
  return (
    <div className="col">
      <div className="stats">
        <div className="stat">
          <div className="stat-label">보유 자금</div>
          <div className="stat-value">
            <Money v={s.cash} testId="fin-cash" />
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">런웨이(최근 소진 기준)</div>
          <div className="stat-value">{rw === null ? '흑자' : rw > 120 ? '10년 이상' : `${rw.toFixed(1)}개월`}</div>
        </div>
        <div className="stat">
          <div className="stat-label">기업가치(지금 산정, 투자·Exit 기준)</div>
          <div className="stat-value">
            <Money v={computeValuation(s).value} />
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">다음 월급일(매월 1일) 정산 뒤 예상 자금</div>
          <div className="stat-value">
            <Money v={fc.cashAfter} testId="fin-forecast" />
          </div>
          <div className="tiny muted">자금 0 이하로 월급일을 넘기면 파산합니다</div>
        </div>
      </div>
      <Tabs
        tabs={[
          { id: 'pl', label: '손익' },
          { id: 'cash', label: '자금 장부' },
          { id: 'value', label: '기업가치' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'pl' && <PLTable />}
      {tab === 'cash' && (
        <table className="t">
          <thead>
            <tr>
              <th>날짜</th>
              <th>항목</th>
              <th className="r">금액</th>
              <th className="r">잔액</th>
            </tr>
          </thead>
          <tbody>
            {s.ledger
              .slice(-40)
              .reverse()
              .map((l, i) => (
                <tr key={i}>
                  <td>{formatDate(l.day)}</td>
                  <td>{l.item}</td>
                  <td className="r">
                    <Money v={l.amount} />
                  </td>
                  <td className="r num">{wonShort(l.balance)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
      {tab === 'value' && <ValueView />}
    </div>
  );
}

function PLTable() {
  const s = useGame();
  const cur = currentPL(s);
  const months: (Omit<MonthPL, 'cashAfter'> & { cashAfter?: number; partial?: boolean })[] = [...s.plHistory.slice(-5), { ...cur, partial: true }];
  const [chart, setChart] = useState(false);
  const rows: [string, (m: (typeof months)[number]) => number, string?][] = [
    ['총매출', (m) => m.revenue, 'strong'],
    ['  구독·유료', (m) => m.revSub],
    ['  광고', (m) => m.revAd],
    ['  거래 수수료', (m) => m.revTake],
    ['  대기업 계약', (m) => m.revEnt],
    ['− 부가가치세', (m) => -m.vat],
    ['− 월급', (m) => -m.salary],
    ['− 4대보험(회사 부담)', (m) => -m.insurance],
    ['− 퇴직연금(회사 부담)', (m) => -m.pension],
    ['− 접대비·업무추진비', (m) => -m.entertainment],
    ['− 채용 홍보비', (m) => -m.recruiting],
    ['− 광고비', (m) => -m.ads],
    ['− 인프라(클라우드)', (m) => -m.infra],
    ['− 월세', (m) => -m.rent],
    ['− 복지비', (m) => -m.welfare],
    ['− AI 도구 구독', (m) => -m.ai],
    ['− 기타(이벤트·진출·인수·위로금)', (m) => -m.other],
    ['영업비용 합계', (m) => -m.opex, 'sub'],
    ['= 영업이익', (m) => m.operatingProfit, 'strong'],
    ['− 법인세', (m) => -m.tax],
    ['= 순이익(손익)', (m) => m.netIncome, 'total'],
    ['투자금 유입', (m) => m.investment],
    ['월초 자금', (m) => m.cashBefore],
  ];
  return (
    <div className="col">
      <div className="row">
        <Help text="손익 = 총매출 − 부가가치세 − 영업비용 − 법인세. 매월 1일(월급일)에 지난달을 정산합니다. 홍보비·광고비·이벤트 비용은 쓰는 날 바로 빠지고, 나머지는 정산일에 빠집니다." />
        <button className="btn small ghost" onClick={() => setChart((c) => !c)}>
          {chart ? '표 보기' : '추이 그래프'}
        </button>
      </div>
      {chart && (
        <div className="card col">
          <b className="tiny">월 매출(최근 {Math.min(36, s.plHistory.length)}개월)</b>
          <Spark points={s.plHistory.slice(-36).map((m) => m.revenue)} h={90} />
          <b className="tiny">월 순이익</b>
          <Spark points={s.plHistory.slice(-36).map((m) => m.netIncome)} h={90} />
          <b className="tiny">월말 자금</b>
          <Spark points={s.plHistory.slice(-36).map((m) => m.cashAfter)} h={90} />
        </div>
      )}
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
    </div>
  );
}

function ValueView() {
  const s = useGame();
  const v = computeValuation(s);
  const methodName = { scorecard: '매출 전: 스코어카드(또는 사용자 기반)', revenue: '매출 발생 뒤: 연 환산 매출 × 매출 배수(또는 사용자 기반)', profit: '흑자 지속: 영업이익 × 이익 배수', market: '상장사: 시가총액' }[v.method];
  return (
    <div className="card col">
      <div className="row">
        <b>지금 산정한 기업가치</b>
        <Money v={v.value} testId="value-now" />
      </div>
      <div className="tiny">계산법: {methodName}</div>
      <table className="t">
        <tbody>
          <tr>
            <th>사업가치</th>
            <td className="r num">{wonShort(v.business)}</td>
          </tr>
          <tr>
            <th>+ 보유 자금</th>
            <td className="r num">{wonShort(v.cash)}</td>
          </tr>
          {v.penalty && (
            <tr>
              <th>× Exit 실패 여파</th>
              <td className="r">0.8</td>
            </tr>
          )}
          <tr className="total">
            <th>기업가치</th>
            <td className="r num">{wonShort(v.value)}</td>
          </tr>
        </tbody>
      </table>
      {v.detail.map((d) => (
        <div key={d} className="tiny muted">
          {d}
        </div>
      ))}
      <Help text="HUD의 기업가치는 매월 1일 정산과 투자 수락 때 갱신한 값이고, 투자 라운드와 Exit은 이 화면처럼 그때그때 다시 산정합니다." />
    </div>
  );
}

// 손익표는 만원 단위(표가 덜 빽빽하게)
function man(v: number): string {
  return Math.round(v / 1e4).toLocaleString('ko-KR');
}
