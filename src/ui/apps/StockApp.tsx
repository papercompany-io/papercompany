// 상장사 앱(Claude 제안): 주가·시가총액, 분기 실적·가이던스, 락업 뒤 창업자 지분 매각, 자사주 매입, 대표 사임(Exit)
// 화면(A-179): 업무·커리어와 같은 톤 — 가운데 큰 주가, 납작한 회색 칸, 그래프 한 판, 실적·매각·자사주 카드 격자, 칸칸이 차는 신뢰 막대. 설명은 title로
import { useState } from 'react';
import { DATA } from '../../core/data';
import { founderPct, founderShares, totalShares } from '../../core/equity';
import { buyback, marketCap, resign, resignPreview, sellPreview, sellShares, setGuidance } from '../../core/public';
import { formatDate } from '../../core/calendar';
import { wonShort, pct } from '../../core/format';
import { act, useGame } from '../store';
import { Money } from '../common';
import { PxIcon } from '../icons';
import { play } from '../sound';
import './apps.css';
import './skin/StockApp.css';

export function Spark({ points, w = 600, h = 120 }: { points: number[]; w?: number; h?: number }) {
  if (points.length < 2) return <div className="tiny muted">기록이 쌓이면 그래프가 그려집니다.</div>;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const sx = (i: number) => (i / (points.length - 1)) * w;
  const sy = (v: number) => h - 6 - ((v - lo) / Math.max(1e-9, hi - lo)) * (h - 12);
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
  const up = points[points.length - 1] >= points[0];
  return (
    <svg className="spark" width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height: h }}>
      <path className={`spark-area ${up ? 'up' : 'down'}`} d={`${d} L${w},${h} L0,${h} Z`} fill={up ? 'rgba(54,180,74,0.12)' : 'rgba(217,69,59,0.12)'} />
      <path className={`spark-line ${up ? 'up' : 'down'}`} d={d} fill="none" stroke={up ? '#36b44a' : '#d9453b'} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function StockApp() {
  const s = useGame();
  const [frac, setFrac] = useState(0.1);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const p = s.public;
  if (!p)
    return (
      <div className="col st2">
        <div className="st2-head">
          <span className="st2-kicker">주식</span>
          <h2 className="st2-big">상장사가 아닙니다</h2>
          <p className="st2-lead">Exit 메뉴에서 IPO를 시도하세요.</p>
        </div>
      </div>
    );
  const locked = s.day < p.lockupUntil;
  const pv = sellPreview(s, frac);
  const rv = resignPreview(s);
  const first = p.history[0]?.price ?? p.price;
  const chg = (p.price / first - 1) * 100;
  return (
    <div className="col st2">
      <div className="st2-head">
        <span className="st2-kicker">주가 (공모가 대비)</span>
        <h2 className="st2-big" data-testid="stock-price">
          {Math.round(p.price).toLocaleString('ko-KR')}원 <span className={`st2-chg ${p.price >= first ? 'up' : 'down'}`}>{chg.toFixed(1)}%</span>
        </h2>
        <p className="st2-lead" title="주가는 공정가치에 시장 심리를 곱해 움직입니다.">
          공정가치 {Math.round(p.fair).toLocaleString('ko-KR')}원 × 시장 심리 {p.sentiment.toFixed(2)}
        </p>
      </div>
      <div className="st2-stats">
        <div>
          <PxIcon id="chart" size={20} />
          <span>시가총액</span>
          <b>
            <Money v={marketCap(s)} />
          </b>
        </div>
        <div>
          <PxIcon id="users" size={20} />
          <span>내 지분 · 평가액</span>
          <b>
            {pct(founderPct(s))} · {wonShort(founderShares(s) * p.price)}
          </b>
        </div>
        <div>
          <PxIcon id="coin" size={20} />
          <span>이미 판 돈(개인 자산)</span>
          <b>
            <Money v={p.founderSold} />
          </b>
        </div>
      </div>
      <div className="st2-card st2-chart">
        <div className="st2-card-head">
          <b>주가(주간)</b>
        </div>
        <Spark points={p.history.map((x) => x.price)} />
      </div>
      <div className="st2-grid">
        <div className="st2-card">
          <div className="st2-card-head" title="높게 약속하면 지금 주가가 오르지만, 못 지키면 크게 떨어집니다.">
            <b>분기 실적과 가이던스</b>
          </div>
          {p.lastQuarter ? (
            <div className="st2-line">
              {p.lastQuarter.label}: 매출 <b>{wonShort(p.lastQuarter.revenue)}</b>
              {p.lastQuarter.guidance !== null && (
                <>
                  {' '}
                  (가이던스 {wonShort(p.lastQuarter.guidance)} — <span className={p.lastQuarter.beat ? 'st2-up' : 'st2-down'}>{p.lastQuarter.beat ? '상회 ▲' : '하회 ▼'}</span>)
                </>
              )}
            </div>
          ) : (
            <div className="st2-line muted">첫 분기 실적은 다음 분기 시작일에 발표됩니다.</div>
          )}
          <div className="st2-line">
            이번 분기 가이던스 <b>{p.guidance !== null ? wonShort(p.guidance) : '-'}</b>
          </div>
          <div className="st2-pills">
            {DATA.public.guidanceOptions.map((o) => (
              <button key={o.id} onClick={() => act((g) => setGuidance(g, o.id))} title={`지난 분기 대비 +${o.growth * 100}% 약속`}>
                {o.name} (+{o.growth * 100}%)
              </button>
            ))}
          </div>
          {/* A-142 주주 신뢰: 가이던스를 못 지키면 떨어지고, 0이 되면 지분이 과반 아닌 대표는 해임 */}
          <div className="emp-bar stock-trust" data-testid="shareholder-trust" title="가이던스를 지키면 오르고 못 지키면 떨어집니다. 바닥이 되면 지분이 과반이 아닌 대표는 해임될 수 있습니다.">
            <span>주주 신뢰</span>
            <div className={`meter ${s.company.board < 35 ? 'bad' : s.company.board < 55 ? 'warnc' : ''}`}>
              <div style={{ width: `${s.company.board}%` }} />
            </div>
            <b>{Math.round(s.company.board)}</b>
          </div>
          {(p.missStreak ?? 0) > 0 && <div className="st2-line st2-down">가이던스를 {p.missStreak}분기 연속 지키지 못했습니다.</div>}
        </div>
        <div className="st2-card">
          <div className="st2-card-head">
            <b>지분 매각</b>
            {locked && <span className="chip amber">락업</span>}
          </div>
          {locked ? (
            <div className="st2-lock">
              <PxIcon id="lock" size={20} />
              <span>락업 기간입니다. {formatDate(p.lockupUntil)}부터 팔 수 있습니다.</span>
            </div>
          ) : (
            <>
              <div className="st2-range">
                <input type="range" min={0.05} max={1} step={0.05} value={frac} onChange={(e) => setFrac(Number(e.target.value))} />
                <b>{Math.round(frac * 100)}%</b>
              </div>
              <div className="st2-line" title={`대량 매각 할인 ${DATA.public.sellBlockDiscount * 100}%, 판 만큼 주가가 내려갑니다.`}>
                {pv.shares.toLocaleString('ko-KR')}주 → 약 <b>{wonShort(pv.proceeds)}</b> (대량 매각 할인 {DATA.public.sellBlockDiscount * 100}%, 주가 −{(pv.impact * 100).toFixed(1)}%)
              </div>
              <button
                className="btn"
                data-testid="sell-shares"
                onClick={() => {
                  const err = act((g) => sellShares(g, frac));
                  setMsg(err ?? null);
                  if (!err) play('coin');
                }}
              >
                팔기
              </button>
            </>
          )}
        </div>
        <div className="st2-card">
          <div className="st2-card-head" title="회사 자금으로 주식을 사서 없애면 주당 가치가 오릅니다(보유 자금의 50%까지).">
            <b>자사주 매입</b>
          </div>
          <div className="st2-line muted">회사 자금으로 주식을 사서 없앱니다.</div>
          <button className="btn ghost" onClick={() => setMsg(act((g) => buyback(g, Math.floor(g.cash * 0.1))) ?? '자금 10%로 자사주를 샀습니다.')}>
            자금 10% 매입
          </button>
        </div>
      </div>
      <div className="st2-card st2-resign">
        <div className="st2-card-head">
          <b>대표에서 물러나기(Exit)</b>
        </div>
        <div className="st2-line">
          남은 지분 {rv.shares.toLocaleString('ko-KR')}주를 블록딜로 넘기고 이 회사를 마칩니다. 예상 수령 <b>{wonShort(rv.proceeds)}</b> + 이미 판 돈 {wonShort(p.founderSold)}. 주식 수 {totalShares(s.capTable).toLocaleString('ko-KR')}주.
        </div>
        {!confirm ? (
          <>
            {locked && <div className="st2-line muted">락업 기간({formatDate(p.lockupUntil)}까지)에는 물러날 수 없습니다.</div>}
            <button className="btn red" disabled={locked} data-testid="resign" onClick={() => setConfirm(true)}>
              물러나기
            </button>
          </>
        ) : (
          <div className="st2-confirm">
            <span className="warn">이 회사가 끝나고 커리어 화면으로 갑니다.</span>
            <button className="btn red" data-testid="resign-confirm" onClick={() => setMsg(act((g) => resign(g)) ?? null)}>
              확정
            </button>
            <button className="btn ghost" onClick={() => setConfirm(false)}>
              취소
            </button>
          </div>
        )}
      </div>
      {msg && <div className="warn">{msg}</div>}
    </div>
  );
}
