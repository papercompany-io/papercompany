// 상장사 앱(Claude 제안): 주가·시가총액, 분기 실적·가이던스, 락업 뒤 창업자 지분 매각, 자사주 매입, 대표 사임(Exit)
import { useState } from 'react';
import { DATA } from '../../core/data';
import { founderPct, founderShares, totalShares } from '../../core/equity';
import { buyback, marketCap, resign, resignPreview, sellPreview, sellShares, setGuidance } from '../../core/public';
import { formatDate } from '../../core/calendar';
import { wonShort, pct } from '../../core/format';
import { act, useGame } from '../store';
import { Money } from '../common';
import { play } from '../sound';
import './apps.css';

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
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={up ? 'rgba(54,180,74,0.12)' : 'rgba(217,69,59,0.12)'} />
      <path d={d} fill="none" stroke={up ? '#36b44a' : '#d9453b'} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function StockApp() {
  const s = useGame();
  const [frac, setFrac] = useState(0.1);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const p = s.public;
  if (!p) return <div className="muted">상장사가 아닙니다. Exit 앱에서 IPO를 시도하세요.</div>;
  const locked = s.day < p.lockupUntil;
  const pv = sellPreview(s, frac);
  const rv = resignPreview(s);
  const first = p.history[0]?.price ?? p.price;
  return (
    <div className="col">
      <div className="kpi">
        <div className="stat">
          <div className="stat-label">주가 (공모가 대비)</div>
          <div className="stat-value" data-testid="stock-price">
            {Math.round(p.price).toLocaleString('ko-KR')}원 <span className="tiny" style={{ color: p.price >= first ? 'var(--green-d)' : 'var(--red)' }}>{((p.price / first - 1) * 100).toFixed(1)}%</span>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">시가총액</div>
          <div className="stat-value">
            <Money v={marketCap(s)} />
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">내 지분 · 평가액</div>
          <div className="stat-value">
            {pct(founderPct(s))} · {wonShort(founderShares(s) * p.price)}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">이미 판 돈(개인 자산)</div>
          <div className="stat-value">
            <Money v={p.founderSold} />
          </div>
        </div>
      </div>
      <div className="card">
        <div className="row">
          <b>주가(주간)</b>
          <span className="tiny muted">공정가치 {Math.round(p.fair).toLocaleString('ko-KR')}원 × 시장 심리 {p.sentiment.toFixed(2)}</span>
        </div>
        <Spark points={p.history.map((x) => x.price)} />
      </div>
      <div className="row" style={{ alignItems: 'stretch' }}>
        <div className="card col grow">
          <b>분기 실적과 가이던스</b>
          {p.lastQuarter ? (
            <div className="tiny">
              {p.lastQuarter.label}: 매출 {wonShort(p.lastQuarter.revenue)}
              {p.lastQuarter.guidance !== null && ` (가이던스 ${wonShort(p.lastQuarter.guidance)} — ${p.lastQuarter.beat ? '상회 ▲' : '하회 ▼'})`}
            </div>
          ) : (
            <div className="tiny muted">첫 분기 실적은 다음 분기 시작일에 발표됩니다.</div>
          )}
          <div className="tiny">이번 분기 가이던스: {p.guidance !== null ? wonShort(p.guidance) : '-'}</div>
          <div className="seg">
            {DATA.public.guidanceOptions.map((o) => (
              <button key={o.id} onClick={() => act((g) => setGuidance(g, o.id))} title={`지난 분기 대비 +${o.growth * 100}% 약속`}>
                {o.name} (+{o.growth * 100}%)
              </button>
            ))}
          </div>
          <div className="tiny muted">높게 약속하면 지금 주가가 오르지만, 못 지키면 크게 떨어집니다.</div>
        </div>
        <div className="card col grow">
          <b>지분 매각</b>
          {locked ? (
            <div className="warn">락업 기간입니다. {formatDate(p.lockupUntil)}부터 팔 수 있습니다.</div>
          ) : (
            <>
              <div className="row">
                <input type="range" className="grow" min={0.05} max={1} step={0.05} value={frac} onChange={(e) => setFrac(Number(e.target.value))} />
                <b>{Math.round(frac * 100)}%</b>
              </div>
              <div className="tiny">
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
        <div className="card col grow">
          <b>자사주 매입</b>
          <div className="tiny muted">회사 자금으로 주식을 사서 없애면 주당 가치가 오릅니다(보유 자금의 50%까지).</div>
          <button className="btn ghost" onClick={() => setMsg(act((g) => buyback(g, Math.floor(g.cash * 0.1))) ?? '자금 10%로 자사주를 샀습니다.')}>
            자금 10% 매입
          </button>
        </div>
      </div>
      <div className="card col">
        <b>대표에서 물러나기(Exit)</b>
        <div className="tiny">
          남은 지분 {rv.shares.toLocaleString('ko-KR')}주를 블록딜로 넘기고 이 회사를 마칩니다. 예상 수령 {wonShort(rv.proceeds)} + 이미 판 돈 {wonShort(p.founderSold)}. 주식 수 {totalShares(s.capTable).toLocaleString('ko-KR')}주.
        </div>
        {!confirm ? (
          <>
            {locked && <div className="tiny muted">락업 기간({formatDate(p.lockupUntil)}까지)에는 물러날 수 없습니다.</div>}
            <button className="btn red" disabled={locked} data-testid="resign" onClick={() => setConfirm(true)}>
              물러나기
            </button>
          </>
        ) : (
          <div className="row">
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
