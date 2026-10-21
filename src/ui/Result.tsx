// SC-01 결과 금액 산정: 결과 금액 = Exit 기업가치 × 창업자 최종 지분율. 파산이면 0원(DEC-021).
import { DATA, specItem, stage } from '../core/data';
import { totalShares } from '../core/equity';
import { formatDate } from '../core/calendar';
import { pct, won, wonShort } from '../core/format';
import { clearSave } from '../platform/save';
import { useGame } from './store';
import './result.css';

export function Result({ onNewCompany }: { onNewCompany: () => void }) {
  const s = useGame();
  const r = s.result!;
  const months = Math.max(1, Math.round(r.day / 30));
  const accepted = s.rounds.filter((x) => x.status === 'accepted');
  const founderShares = s.capTable.find((c) => c.kind === 'founder')!.shares;
  const total = totalShares(s.capTable);
  const bankrupt = r.kind === 'bankrupt';
  return (
    <div className="result" data-testid="result">
      <div className="result-card">
        <div className={`result-band ${bankrupt ? 'bankrupt' : ''}`}>
          <div className="result-kind">{r.kind === 'exit' ? (r.method === 'ipo' ? 'IPO 성공' : '매각 성공') : '파산'}</div>
          <div className="result-company">{s.company.name}</div>
        </div>
        <div className="result-label">결과 금액(창업자가 받는 돈)</div>
        <div className={`result-amount ${bankrupt ? 'zero' : ''}`} data-testid="result-amount">
          {won(r.amount)}
        </div>
        <div className="result-formula" data-testid="result-formula">
          {r.kind === 'exit' ? (
            <>
              Exit 기업가치 {won(r.exitValue)} × 창업자 지분({founderShares.toLocaleString()}주 ÷ {total.toLocaleString()}주 = {pct(r.founderPct, 6)}) = {won(r.amount)}
            </>
          ) : (
            <>파산한 판의 결과 금액은 0원입니다. {r.reason}</>
          )}
        </div>
        <table className="t">
          <tbody>
            <tr>
              <th>플레이 기간</th>
              <td>
                {formatDate(0)} ~ {formatDate(r.day)} (약 {months}개월)
              </td>
            </tr>
            <tr>
              <th>창업자 스펙</th>
              <td>{DATA.specs.categories.map((c) => specItem(s.founder.picks[c.id]).name).join(' · ')}</td>
            </tr>
            <tr>
              <th>펀딩 이력</th>
              <td>
                {accepted.length === 0
                  ? '투자 없음'
                  : accepted.map((x) => `${stage(x.stage).name} ${wonShort(x.offer!.amount)}(룸 ${pct(x.room, 1)})`).join(' → ')}
              </td>
            </tr>
            {!bankrupt && (
              <tr>
                <th>Exit 방식</th>
                <td>{r.method === 'ipo' ? 'IPO(기업공개)' : '매각'}</td>
              </tr>
            )}
            <tr>
              <th>{bankrupt ? '파산 시점 기업가치(참고)' : 'Exit 시도 시 기업가치(VL-01)'}</th>
              <td>{won(r.valuation)}</td>
            </tr>
            <tr>
              <th>최종 창업자 지분</th>
              <td>
                {pct(r.founderPct, 6)} ({founderShares.toLocaleString()}주 / {total.toLocaleString()}주)
              </td>
            </tr>
          </tbody>
        </table>
        <button
          className="btn big"
          data-testid="new-company-after"
          onClick={async () => {
            await clearSave();
            onNewCompany();
          }}
        >
          새 회사 시작
        </button>
      </div>
    </div>
  );
}
