// F12 Exit 앱: EX-03 원하는 시점에 시도, EX-01 IPO, EX-02 매각, EX-04 성공·실패(DEC-021)
import { useState } from 'react';
import { DATA } from '../../core/data';
import { formatDate } from '../../core/calendar';
import { founderPct } from '../../core/equity';
import { acceptSale, declineSale, exitBlocked, exitProbability, startExit } from '../../core/exit';
import { pct, won } from '../../core/format';
import { computeValuation } from '../../core/valuation';
import { act, useGame } from '../store';
import { Money, chanceLabel } from '../common';
import './apps.css';

export function ExitApp() {
  const s = useGame();
  const [confirm, setConfirm] = useState<'sale' | 'ipo' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const v = computeValuation(s).value;
  const fp = founderPct(s);
  const a = s.exitAttempt;
  const blocked = exitBlocked(s);

  return (
    <div className="col">
      <div className="stats">
        <div className="stat">
          <div className="stat-label">지금 기업가치(VL-01)</div>
          <div className="stat-value">
            <Money v={v} full testId="exit-valuation" />
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">창업자 지분율</div>
          <div className="stat-value" data-testid="exit-founder">
            {pct(fp, 2)}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">지금 Exit하면 받을 결과 금액(예상)</div>
          <div className="stat-value">
            <Money v={Math.round(v * fp)} full />
          </div>
          <div className="tiny muted">기업가치 × 창업자 지분율. 실제 금액은 제안가·공모가에 따라 달라집니다.</div>
        </div>
      </div>

      {a?.status === 'offer' && (
        <div className="card col offer" data-testid="sale-offer">
          <b style={{ fontSize: 18 }}>인수 제안이 들어왔습니다</b>
          <table className="t">
            <tbody>
              <tr>
                <th>제안가(Exit 기업가치)</th>
                <td className="r" data-testid="sale-price">
                  {won(a.price!)}
                </td>
              </tr>
              <tr>
                <th>창업자 지분율</th>
                <td className="r">{pct(fp, 4)}</td>
              </tr>
              <tr className="total">
                <th>받을 결과 금액 = 제안가 × 지분율</th>
                <td className="r" data-testid="sale-result">
                  {won(Math.round(a.price! * fp))}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="tiny">거래 성사 가능성 {chanceLabel(exitProbability(s, 'sale').p)} · 무산되면 {DATA.exit.cooldownDays}일 동안 기업가치가 {Math.round((1 - DATA.exit.failPenaltyFactor) * 100)}% 낮아지고 다시 시도할 수 없습니다. 회사는 계속 운영됩니다.</div>
          {err && <div className="err">{err}</div>}
          <div className="row">
            <button className="btn ghost" data-testid="sale-decline" onClick={() => setErr(act((g) => declineSale(g)) ?? null)}>
              거절하고 더 키운다
            </button>
            <div className="grow" />
            <button className="btn green big" data-testid="sale-accept" onClick={() => setErr(act((g) => acceptSale(g)) ?? null)}>
              매각 진행(판 종료)
            </button>
          </div>
        </div>
      )}

      {a?.status === 'preparing' && (
        <div className="card ok" data-testid="ipo-preparing">
          상장 준비 중입니다. {formatDate(a.readyDay)}에 공모가가 정해지고 상장 성공 여부가 판정됩니다({a.readyDay - s.day}일 남음).
        </div>
      )}

      {a?.status === 'failed' && (
        <div className="card err" data-testid="exit-failed">
          {a.method === 'sale' ? '매각' : '상장'}이 무산되었습니다(성공 가능성 {Math.round((a.p ?? 0) * 100)}%). {s.exitCooldownUntil !== null && s.day < s.exitCooldownUntil ? `${formatDate(s.exitCooldownUntil)}까지 기업가치가 ${Math.round((1 - DATA.exit.failPenaltyFactor) * 100)}% 낮아지고, 그때까지 다시 시도할 수 없습니다.` : '다시 시도할 수 있습니다.'}
        </div>
      )}

      {(!a || a.status === 'failed' || a.status === 'declined') && (
        <>
          <div className="tiny muted">원할 때 언제든 Exit을 시도할 수 있습니다. 성공하면 판이 끝나고 결과 금액이 정해집니다.</div>
          {blocked && <div className="warn">{blocked}</div>}
          <div className="exit-choices">
            {(['sale', 'ipo'] as const).map((m) => {
              const ep = exitProbability(s, m);
              return (
                <div key={m} className="card col">
                  <b>{m === 'sale' ? '매각(기업에게 Exit)' : 'IPO(일반인에게 Exit)'}</b>
                  <div className="tiny">
                    {m === 'sale'
                      ? `인수 희망 기업이 기업가치의 ${DATA.exit.sale.priceMin * 100}~${DATA.exit.sale.priceMax * 100}%로 제안합니다. 제안을 보고 진행할지 정합니다.`
                      : `${DATA.exit.ipo.prepDays}일 상장 준비 뒤, 공모가가 기업가치의 ${DATA.exit.ipo.priceMin * 100}~${DATA.exit.ipo.priceMax * 100}%로 정해지고 바로 판정합니다.`}
                  </div>
                  <div className="tiny">
                    성공 가능성 <b>{chanceLabel(ep.p)}</b>
                  </div>
                  <div className="tiny muted">{ep.factors.map((f) => `${f.label} ${f.value >= 0 ? '+' : ''}${Math.round(f.value * 100)}%p`).join(' · ')}</div>
                  <button className="btn" data-testid={`exit-${m}`} disabled={!!blocked} onClick={() => setConfirm(m)}>
                    {m === 'sale' ? '매각 시도' : 'IPO 시도'}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {confirm && (
        <div className="modal-bg" onClick={() => setConfirm(null)}>
          <div className="modal" data-testid="exit-confirm" onClick={(e) => e.stopPropagation()}>
            <b>{confirm === 'sale' ? '매각을 시도할까요?' : 'IPO를 시도할까요?'}</b>
            <div className="warn">Exit에 성공하면 이 판이 끝납니다. 결과 금액은 Exit 기업가치 × 창업자 지분율입니다.</div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setConfirm(null)}>
                취소
              </button>
              <button
                className="btn"
                data-testid="exit-confirm-yes"
                onClick={() => {
                  setErr(act((g) => startExit(g, confirm)) ?? null);
                  setConfirm(null);
                }}
              >
                시도하기
              </button>
            </div>
          </div>
        </div>
      )}
      {err && <div className="err">{err}</div>}
    </div>
  );
}
