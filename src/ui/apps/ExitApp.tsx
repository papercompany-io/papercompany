// F12 Exit(A-215부터 투자 창의 탭): EX-03 원하는 시점에 시도, EX-01 IPO, EX-02 매각, EX-04 성공·실패(DEC-021)
// 화면(A-179): 업무·커리어와 같은 톤 — 가운데 큰 "받을 돈", 납작한 회색 칸, 제안·준비·무산은 카드 하나, 매각·IPO는 색 타일 + 흰 픽셀 그림 카드. 긴 설명은 title로
import { useState } from 'react';
import { DATA } from '../../core/data';
import { formatDate } from '../../core/calendar';
import { founderPct } from '../../core/equity';
import { acceptSale, annualRevenue, declineSale, distressMult, exitBlocked, exitProbability, saleProbability, startExit } from '../../core/exit';
import { wonShort } from '../../core/format';
import { pct } from '../../core/format';
import { computeValuation } from '../../core/valuation';
import { act, useGame } from '../store';
import { Money, chanceLabel } from '../common';
import { AppIcon, PxIcon } from '../icons';
import './apps.css';
import './skin/ExitApp.css';

export function ExitApp() {
  const s = useGame();
  const [confirm, setConfirm] = useState<'sale' | 'ipo' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const v = computeValuation(s).value;
  const fp = founderPct(s);
  const a = s.exitAttempt;
  const blocked = exitBlocked(s);
  if (s.public)
    return (
      <div className="col ex2">
        <div className="ex2-head">
          <span className="ex2-kicker">Exit</span>
          <h2 className="ex2-big">상장사입니다</h2>
          <p className="ex2-lead">주식 메뉴에서 지분을 팔거나 대표에서 물러날 수 있습니다(그때 이 회사가 끝납니다).</p>
        </div>
      </div>
    );
  const prepLeft = a?.status === 'preparing' ? a.readyDay - s.day : 0;
  const prepPct = a?.status === 'preparing' ? Math.min(100, Math.max(0, ((s.day - a.startedDay) / Math.max(1, a.readyDay - a.startedDay)) * 100)) : 0;

  return (
    <div className="col ex2">
      <div className="ex2-head">
        <span className="ex2-kicker">지금 Exit하면 받을 돈(예상)</span>
        <h2 className="ex2-big" title="기업가치 × 창업자 지분율. 실제 금액은 제안가·공모가에 따라 달라집니다.">
          <Money v={Math.round(v * fp)} />
        </h2>
        <p className="ex2-lead">기업가치 × 창업자 지분율</p>
      </div>
      <div className="ex2-stats">
        <div>
          <PxIcon id="chart" size={20} />
          <span>지금 기업가치</span>
          <b>
            <Money v={v} testId="exit-valuation" />
          </b>
        </div>
        <div>
          <PxIcon id="users" size={20} />
          <span>창업자 지분율</span>
          <b data-testid="exit-founder">{pct(fp, 2)}</b>
        </div>
        <div title="최근 12개월 매출">
          <PxIcon id="coin" size={20} />
          <span>연매출(최근 12개월)</span>
          <b>{wonShort(annualRevenue(s))}</b>
        </div>
      </div>

      {a?.status === 'offer' && (
        <div className="ex2-card ex2-offer" data-testid="sale-offer">
          <div className="ex2-card-head">
            <span className="ex2-tile" style={{ ['--tc' as string]: 'var(--positive)' }}>
              <AppIcon id="exit" />
            </span>
            <div className="ex2-card-title">
              <b>{a.buyer ?? '인수 희망 기업'}의 인수 제안</b>
              <span>{a.inbound ? '먼저 연락해 옴' : '매각 시도 결과'}</span>
            </div>
            {a.deadline !== null && (
              <span className="chip amber" title={`답변 기한 ${formatDate(a.deadline)}. 지나면 무산됩니다.`}>
                {a.deadline - s.day}일 남음
              </span>
            )}
          </div>
          <div className="ex2-rows">
            <div>
              <span>제안가(Exit 기업가치)</span>
              <b data-testid="sale-price">{wonShort(a.price!)}</b>
            </div>
            <div>
              <span>창업자 지분율</span>
              <b>{pct(fp, 6)}</b>
            </div>
            <div className="total">
              <span>받을 결과 금액 = 제안가 × 지분율</span>
              <b data-testid="sale-result">{wonShort(Math.round(a.price! * fp))}</b>
            </div>
          </div>
          {a.deadline !== null && <div className="ex2-note">답변 기한 {formatDate(a.deadline)} · 지나면 무산됩니다.</div>}
          {distressMult(s) < 1 && (
            <div className="ex2-note bad" title="자금을 확보하면 제값을 받을 수 있습니다.">
              자금난 할인: 런웨이가 짧아 인수자가 사업가치를 {Math.round((1 - distressMult(s)) * 100)}% 깎아 불렀습니다.
            </div>
          )}
          <div className="ex2-note" title="회사는 계속 운영됩니다.">
            거래 성사 가능성 {chanceLabel(saleProbability(s))} · 무산되면 {DATA.exit.cooldownDays}일 동안 기업가치가 {Math.round((1 - DATA.exit.failPenaltyFactor) * 100)}% 낮아지고 다시 시도할 수 없습니다.
          </div>
          {err && <div className="err">{err}</div>}
          <div className="ex2-btns">
            <button className="btn ghost" data-testid="sale-decline" onClick={() => setErr(act((g) => declineSale(g)) ?? null)}>
              거절하고 더 키운다
            </button>
            <button className="btn green big" data-testid="sale-accept" onClick={() => setErr(act((g) => acceptSale(g)) ?? null)}>
              매각 진행(회사 종료)
            </button>
          </div>
        </div>
      )}

      {a?.status === 'preparing' && (
        <div className="ex2-card ex2-prep" data-testid="ipo-preparing" title={`${formatDate(a.readyDay)}에 공모가가 정해지고 상장 성공 여부가 판정됩니다.`}>
          <div className="ex2-card-head">
            <span className="ex2-tile" style={{ ['--tc' as string]: 'var(--accent)' }}>
              <AppIcon id="stock" />
            </span>
            <div className="ex2-card-title">
              <b>상장 준비 중입니다</b>
              <span>{formatDate(a.readyDay)}에 공모가가 정해지고 성공 여부가 판정됩니다</span>
            </div>
            <span className="chip blue">{prepLeft}일 남음</span>
          </div>
          <div className="ex2-bar">
            <div style={{ width: `${prepPct}%` }} />
          </div>
        </div>
      )}

      {a?.status === 'failed' && (
        <div className="ex2-card ex2-failed" data-testid="exit-failed">
          <div className="ex2-card-head">
            <PxIcon id="warn" size={22} />
            <div className="ex2-card-title">
              <b>
                {a.method === 'sale' ? '매각' : '상장'}이 무산되었습니다
              </b>
              <span>성공 가능성 {Math.round((a.p ?? 0) * 100)}%였습니다</span>
            </div>
          </div>
          <div className="ex2-note">{s.exitCooldownUntil !== null && s.day < s.exitCooldownUntil ? `${formatDate(s.exitCooldownUntil)}까지 기업가치가 ${Math.round((1 - DATA.exit.failPenaltyFactor) * 100)}% 낮아지고, 그때까지 다시 시도할 수 없습니다.` : '다시 시도할 수 있습니다.'}</div>
        </div>
      )}

      {(!a || a.status === 'failed' || a.status === 'declined') && (
        <>
          <div className="ex2-sect" title="원할 때 언제든 Exit을 시도할 수 있습니다. 매각에 성공하면 이 회사가 끝나고 결과 금액이 정해집니다. IPO에 성공하면 상장사로 회사가 이어지고, 락업(180일) 뒤 지분을 팔거나 물러날 때 돈을 받습니다.">
            어떻게 Exit할까요
          </div>
          {blocked && <div className="warn">{blocked}</div>}
          <div className="ex2-choices">
            {(['sale', 'ipo'] as const).map((m) => {
              const ep = exitProbability(s, m);
              const level = ep.p >= 0.65 ? 'good' : ep.p >= 0.35 ? 'mid' : 'low';
              const desc =
                m === 'sale'
                  ? `인수 희망 기업이 기업가치의 ${DATA.exit.sale.priceMin * 100}~${DATA.exit.sale.priceMax * 100}%로 제안합니다. 제안을 보고 진행할지 정합니다.`
                  : `${DATA.exit.ipo.prepDays}일 상장 심사 뒤, 공모가가 기업가치의 ${DATA.exit.ipo.priceMin * 100}~${DATA.exit.ipo.priceMax * 100}%로 정해집니다. 성공하면 새 주식 ${DATA.public.ipoNewShares * 100}%를 팔아 회사에 자금이 들어옵니다.`;
              return (
                <div key={m} className="ex2-choice" title={desc}>
                  <div className="ex2-card-head">
                    <span className="ex2-tile" style={{ ['--tc' as string]: m === 'sale' ? 'var(--positive)' : 'var(--accent)' }}>
                      <AppIcon id={m === 'sale' ? 'exit' : 'stock'} />
                    </span>
                    <div className="ex2-card-title">
                      <b>{m === 'sale' ? '매각' : 'IPO'}</b>
                      <span>{m === 'sale' ? '기업에게 Exit · 회사 종료' : '일반인에게 Exit · 회사 계속'}</span>
                    </div>
                  </div>
                  <div className="ex2-tags">
                    {m === 'sale' ? (
                      <span>
                        제안가 기업가치의 {DATA.exit.sale.priceMin * 100}~{DATA.exit.sale.priceMax * 100}%
                      </span>
                    ) : (
                      <>
                        <span>심사 {DATA.exit.ipo.prepDays}일</span>
                        <span>
                          공모가 기업가치의 {DATA.exit.ipo.priceMin * 100}~{DATA.exit.ipo.priceMax * 100}%
                        </span>
                        <span>새 주식 {DATA.public.ipoNewShares * 100}%</span>
                      </>
                    )}
                  </div>
                  <div className={`ex2-chance ${level}`} title={ep.factors.map((f) => `${f.label} ${f.value >= 0 ? '+' : ''}${Math.round(f.value * 100)}%p`).join(' · ')}>
                    <span>성공 가능성</span>
                    <b>{chanceLabel(ep.p)}</b>
                    <div className="ex2-bar">
                      <div style={{ width: `${Math.round(ep.p * 100)}%` }} />
                    </div>
                  </div>
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
            <div className="warn">{confirm === 'sale' ? '매각에 성공하면 이 회사가 끝납니다. 결과 금액은 Exit 기업가치 × 창업자 지분율입니다.' : 'IPO에 성공하면 상장사가 되어 회사가 이어집니다. 실패하면 60일 동안 기업가치가 떨어집니다.'}</div>
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
