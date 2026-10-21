// 개발용 상태 패널(` 또는 F9): 자금, 지분표, 손익, 기업가치, 게임 날짜를 한눈에 봅니다(A-31).
import { clockOf, formatDate } from '../core/calendar';
import { totalShares } from '../core/equity';
import { currentPL, lastPL } from '../core/finance';
import { pctsSumTo100, won } from '../core/format';
import { computeValuation } from '../core/valuation';
import { useGame } from './store';

export function DevPanel({ onClose }: { onClose: () => void }) {
  const s = useGame();
  const total = totalShares(s.capTable);
  const pcts = pctsSumTo100(s.capTable.map((c) => c.shares));
  const cur = currentPL(s);
  const last = lastPL(s);
  const v = computeValuation(s);
  const plRow = (label: string, p: typeof cur | null) =>
    p && (
      <div className="dev-block">
        <b>{label}</b>
        <div>총매출 {won(p.revenue)}</div>
        <div>− 부가세 {won(p.vat)}</div>
        <div>
          − 영업비용 {won(p.opex)} (월급 {won(p.salary)} · 4대보험 {won(p.insurance)} · 퇴직연금 {won(p.pension)} · 접대비 {won(p.entertainment)} · 채용 {won(p.recruiting)} · 광고 {won(p.ads)})
        </div>
        <div>= 영업이익 {won(p.operatingProfit)}</div>
        <div>− 법인세 {won(p.tax)}</div>
        <div>
          = 순이익 <b>{won(p.netIncome)}</b>
        </div>
      </div>
    );
  return (
    <div className="dev-panel" data-testid="dev-panel">
      <div className="row">
        <b>개발용 상태 패널</b>
        <span className="tiny">(` 또는 F9로 닫기)</span>
        <div className="grow" />
        <button className="btn small ghost" onClick={onClose}>
          닫기
        </button>
      </div>
      <div className="dev-block">
        <b>게임 날짜</b> {formatDate(s.day)} {clockOf(s.msInDay)} · 배속 {s.speed}x {s.pauseReason ? `· 일시정지(${s.pauseReason})` : ''} · 시드 {s.seed}
      </div>
      <div className="dev-block">
        <b>자금</b> <span data-testid="dev-cash">{won(s.cash)}</span>
      </div>
      <div className="dev-block">
        <b>지분표</b> (총 {total.toLocaleString()}주)
        <table className="t">
          <tbody>
            {s.capTable.map((c, i) => (
              <tr key={c.holderId}>
                <td>{c.name}</td>
                <td>{c.round ?? ''}</td>
                <td className="r">{c.shares.toLocaleString()}주</td>
                <td className="r">{pcts[i]}</td>
              </tr>
            ))}
            <tr className="total">
              <td>합계</td>
              <td />
              <td className="r">{total.toLocaleString()}주</td>
              <td className="r" data-testid="dev-cap-sum">
                {pctsSumTo100(s.capTable.map((c) => c.shares)).reduce((a, b) => a + Number(b.replace('%', '')), 0).toFixed(2)}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {plRow(`이번 달 손익(${cur.month}, 지금까지)`, cur)}
      {plRow(`지난달 손익(${last?.month ?? '-'}, 확정)`, last)}
      <div className="dev-block">
        <b>기업가치</b> 저장값 {won(s.valuation.stored)} ({formatDate(s.valuation.storedDay)} 산정) · 지금 다시 산정 {won(v.value)} [{v.method}]
        {v.detail.map((d) => (
          <div key={d} className="tiny">
            {d}
          </div>
        ))}
      </div>
    </div>
  );
}
