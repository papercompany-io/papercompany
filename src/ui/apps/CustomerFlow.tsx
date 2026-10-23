// 고객 흐름 부품(A-158): 규모 사다리, 제품이 받쳐 주는 고객(A-196, Startup Company의 잠재 사용자 — 숫자 + 막대), 들어오는 길·떠나는 이유 막대.
// 업무 창 대시보드와 시장 창이 같이 씁니다.
import { growthRoom, launchedMarkets, scaleSteps, totalUsers, unitWord } from '../../core/market';
import { CLOSED_LINE, lossName, ROOM_LINE } from '../../core/marketing';
import { industry } from '../../core/data';
import { countShort } from '../../core/format';
import type { GameState, MarketState } from '../../core/types';

type Flow = NonNullable<MarketState['flow']>;

// 진출한 시장의 흐름(최근 2주 하루 평균)을 모두 더함
export function flowAll(s: GameState): Flow | null {
  const list = launchedMarkets(s)
    .map((m) => s.markets[m].flow)
    .filter((f): f is Flow => !!f);
  if (!list.length) return null;
  const why: Record<string, number> = {};
  for (const f of list) for (const [k, v] of Object.entries(f.why ?? {})) why[k] = (why[k] ?? 0) + (v ?? 0);
  const add = (k: 'target' | 'inbound' | 'viral' | 'sales' | 'paid' | 'lost') => list.reduce((a, f) => a + f[k], 0);
  return { target: add('target'), inbound: add('inbound'), viral: add('viral'), sales: add('sales'), paid: add('paid'), lost: add('lost'), why };
}

// 1만 → 10만 → … 사다리: 넘은 단계는 꽉, 지금 단계는 로그 눈금으로 얼마나 왔는지
export function ScaleLadder({ s }: { s: GameState }) {
  const steps = scaleSteps(s);
  const u = Math.max(1, totalUsers(s));
  const idx = steps.filter((n) => u >= n).length;
  const lo = Math.log10(idx ? steps[idx - 1] : steps[0] / 10);
  const hi = idx < steps.length ? Math.log10(steps[idx]) : lo + 1;
  const p = Math.max(0, Math.min(1, (Math.log10(u) - lo) / (hi - lo)));
  return (
      <div className="sc-next" data-testid="scale-ladder" title={`${countShort(u)}${unitWord(s)}`}>
        <span>{idx ? countShort(steps[idx - 1]) : 0}</span>
        <span className="sc-bar">
          <i style={{ width: `${idx < steps.length ? p * 100 : 100}%` }} />
        </span>
        <b>{idx < steps.length ? countShort(steps[idx]) : '최고 단계'}</b>
      </div>
    );
  return (
    <div className="sc-ladder" data-testid="scale-ladder" title={`${countShort(u)}${unitWord(s)}`}>
      {steps.map((n, i) => (
        <div key={n} className={`sc-step ${i < idx ? 'done' : i === idx ? 'now' : ''}`}>
          <span className="sc-bar">
            <i style={{ width: `${i < idx ? 100 : i === idx ? p * 100 : 0}%` }} />
          </span>
          <b>{countShort(n)}</b>
        </div>
      ))}
    </div>
  );
}

// 제품이 받쳐 주는 고객(A-196): 숫자 + 지금 사용자가 얼마나 찼는지 막대 + 할 일 한 줄(더 알리면 더 옴 / 거의 참 — 기능 레벨·새 시장 / 너무 많이 데려옴)
export function RoomNote({ s }: { s: GameState }) {
  const r = growthRoom(s);
  const w = unitWord(s);
  const fill = r.target > 0 ? r.users / r.target : 0;
  return (
    <div className={`sc-cap ${r.state}`} data-testid="growth-room">
      <div className="sc-cap-head" title="매력도(기능·기능 레벨·UX·품질)와 인지도가 오르면 커집니다. 해외 시장에 나가면 그 시장 몫이 더해집니다. 이를 넘는 고객은 이탈합니다.">
        <span>제품이 받쳐 주는 {industry(s.company.industry).unit}</span>
        <b data-testid="growth-cap">
          약 {countShort(r.target)}
          <small>{w}</small>
        </b>
        <em>{Math.round(fill * 100)}% 찼음</em>
      </div>
      <span className="sc-cap-bar">
        <i style={{ width: `${Math.min(100, fill * 100)}%` }} />
      </span>
      <div className={`sc-room ${r.state}`}>
        {ROOM_LINE[r.state]}
        {r.state === 'full' && r.closed.length > 0 ? CLOSED_LINE : ''}
      </div>
    </div>
  );
}

// 떠나는 이유 막대(전체 떠남 대비 몫). 이유가 하나뿐이면(원래 떠나는 만큼) 한 줄
export function LossBars({ why, lost }: { why: Partial<Record<string, number>>; lost: number }) {
  const rows = Object.entries(why)
    .map(([k, v]) => [k, v ?? 0] as const)
    .filter(([, v]) => lost > 0 && v / lost >= 0.03)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (!rows.length) return <div className="tiny muted">아직 이탈 고객이 거의 없습니다.</div>;
  return (
    <div className="cf-list" data-testid="loss-why">
      {rows.map(([k, v]) => (
        <div key={k} className={`cf-row loss ${k === 'natural' ? 'calm' : ''}`}>
          <span title={lossName(k)}>{lossName(k)}</span>
          <span className="cf-bar">
            <i style={{ width: `${Math.min(100, (v / lost) * 100)}%` }} />
          </span>
          <b>{Math.round((v / lost) * 100)}%</b>
        </div>
      ))}
    </div>
  );
}

// 들어오는 길 막대(한 달 환산 명 수) + 떠나는 이유 막대, 두 칸
// A-202 simple: 막대 없이 세 줄 — 한 달 순증감 · 가장 큰 들어오는 길 · 가장 큰 떠나는 이유
export function FlowBars({ flow, unit, simple }: { flow: Flow; unit: string; simple?: boolean }) {
  const gains: [string, number][] = [
    ['스스로 찾아옴', flow.inbound],
    ['입소문', flow.viral],
    ['영업', flow.sales],
    ['광고·캠페인', flow.paid],
  ];
  const gTotal = gains.reduce((a, [, v]) => a + v, 0);
  const net = (gTotal - flow.lost) * 30;
  const fmt = (v: number) => (v * 30 >= 10 ? countShort(v * 30) : (v * 30).toFixed(1));
  if (simple) {
    const topIn = [...gains].sort((x, y) => y[1] - x[1])[0];
    const topLoss = Object.entries(flow.why ?? {}).sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0))[0];
    const netText = `${net >= 0 ? '+' : '−'}${Math.abs(net) >= 10 ? countShort(Math.abs(net)) : Math.abs(net).toFixed(1)}`;
    return (
      <div className="cf-simple">
        <div className={`cf-net-big ${net >= 0 ? 'fin-good' : 'fin-bad'}`}>
          월 {unit} 순증감 <b>{netText}</b>
        </div>
        <div className="cf-line">
          <span>유입</span>
          <b className="fin-good">+{fmt(gTotal)}</b>
          <em>{gTotal > 0 ? `${topIn[0]} 비중 높음` : '-'}</em>
        </div>
        <div className="cf-line">
          <span>이탈</span>
          <b className="fin-bad">−{fmt(flow.lost)}</b>
          <em>{topLoss && flow.lost > 0 ? `${lossName(topLoss[0])} 비중 높음` : '-'}</em>
        </div>
      </div>
    );
  }
  return (
    <div className="cf-cols">
      <div className="col" style={{ gap: 4 }}>
        <div className="cf-head">
          <span>유입</span>
          <b className="fin-good">+{fmt(gTotal)}</b>
        </div>
        <div className="cf-list">
          {gains.map(([name, v]) => (
            <div key={name} className="cf-row">
              <span>{name}</span>
              <span className="cf-bar">
                <i style={{ width: `${gTotal > 0 ? (v / gTotal) * 100 : 0}%` }} />
              </span>
              <b>+{fmt(v)}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="col" style={{ gap: 4 }}>
        <div className="cf-head">
          <span>이탈 이유</span>
          <b className="fin-bad">−{fmt(flow.lost)}</b>
        </div>
        <LossBars why={flow.why ?? {}} lost={flow.lost} />
        <div className={`cf-net ${net >= 0 ? 'fin-good' : 'fin-bad'}`}>
          월 {unit} 순증감 {net >= 0 ? '+' : ''}
          {Math.abs(net) >= 10 ? countShort(net) : net.toFixed(1)}
        </div>
      </div>
    </div>
  );
}

// 눈금 그래프(A-158, Startup Company 제품 창의 접속자·가입자 그래프처럼): 왼쪽 세로 눈금 3개, 아래 처음·끝 날짜
export function AxisChart({ points, from, to, fmt, h = 120 }: { points: number[]; from: string; to: string; fmt: (v: number) => string; h?: number }) {
  if (points.length < 2) return <div className="tiny muted">기록이 쌓이면 그래프가 그려집니다.</div>;
  const W = 600;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = Math.max(1e-9, hi - lo);
  const sx = (i: number) => (i / (points.length - 1)) * W;
  const sy = (v: number) => h - 4 - ((v - lo) / span) * (h - 10);
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
  const up = points[points.length - 1] >= points[0];
  return (
    <div className={`ax-chart ${up ? 'up' : 'down'}`}>
      <div className="ax-y" style={{ height: h }}>
        <span>{fmt(hi)}</span>
        <span>{fmt((hi + lo) / 2)}</span>
        <span>{fmt(lo)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" style={{ height: h }}>
        {[sy(hi), sy((hi + lo) / 2), sy(lo)].map((y, i) => (
          <line key={i} x1={0} x2={W} y1={y} y2={y} className="ax-grid" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={`${d} L${W},${h} L0,${h} Z`} className="ax-area" />
        <path d={d} className="ax-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <div />
      <div className="ax-x">
        <span>{from}</span>
        <span>{to}</span>
      </div>
    </div>
  );
}
