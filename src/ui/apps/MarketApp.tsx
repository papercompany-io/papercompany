// 시장 앱(RV-01·PD-02 확장): 시장별 수요·점유율·인지도·광고 예산, 해외 진출, 경쟁사와 인수(M&A), 대기업 계약, 수익 구조(LTV·CAC)
import { useState } from 'react';
import { DATA, industry, market, MARKET_IDS } from '../../core/data';
import { demand, infraPerUser, launchBlock, launchMarket, revenuePerUser, setAdBudget, shares, totalUsers, deptCoverage } from '../../core/market';
import { acquire, acquireBlock, acquisitionPrice, competitorUsers } from '../../core/competitors';
import { appeal, fxTotals } from '../../core/product';
import { enterpriseThreshold, orderOf, setOrder } from '../../core/orders';
import { formatDate } from '../../core/calendar';
import { wonShort } from '../../core/format';
import { act, useGame } from '../store';
import { Money, Tabs } from '../common';
import { play } from '../sound';
import type { DeptId, MarketId } from '../../core/types';
import './apps.css';

const SHARE_COLORS = ['#e5484d', '#f0a020', '#8b63e8', '#11a3a6', '#7a8597', '#c46be0', '#b5651d', '#5c6bc0'];

export function MarketApp() {
  const s = useGame();
  const [tab, setTab] = useState<'markets' | 'comp' | 'ent' | 'econ'>('markets');
  const [sel, setSel] = useState<MarketId>('kr');
  const [msg, setMsg] = useState<string | null>(null);
  const ind = industry(s.company.industry);
  const ms = s.markets[sel];
  const sh = shares(s, sel);
  const D = demand(s, sel);
  return (
    <div className="col">
      <div className="row tiny">
        <span className="muted">{ind.name} · 전체 {ind.unit}</span>
        <b>{Math.round(totalUsers(s)).toLocaleString('ko-KR')}</b>
        <span className="grow" />
        {(['marketing', 'sales', 'cs'] as DeptId[])
          .filter((d) => s.employees.some((e) => e.dept === d))
          .map((d) => (
            <label key={d} className="row tiny" style={{ gap: 4 }}>
              <span className="muted">{DATA.depts.departments.find((x) => x.id === d)!.name}팀</span>
              <select value={orderOf(s, d)} onChange={(e) => act((g) => setOrder(g, d, e.target.value))}>
                {DATA.orders.orders
                  .filter((o) => o.dept === d)
                  .map((o) => (
                    <option key={o.id} value={o.id} disabled={s.company.stage < o.stage}>
                      {o.name}
                    </option>
                  ))}
              </select>
            </label>
          ))}
      </div>
      <Tabs
        tabs={[
          { id: 'markets', label: '시장' },
          { id: 'comp', label: `경쟁사 ${s.competitors.filter((c) => c.alive).length}` },
          { id: 'ent', label: `대기업 계약 ${s.enterprise.filter((d) => d.endDay > s.day).length}` },
          { id: 'econ', label: '수익 구조' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {msg && <div className="warn">{msg}</div>}
      {tab === 'markets' && (
        <>
          <div className="mk-grid">
            {MARKET_IDS.map((m) => {
              const st = s.markets[m];
              const md = market(m);
              const block = launchBlock(s, m);
              return (
                <div key={m} className={`mk ${st.launched ? '' : 'off'} ${sel === m ? 'sel' : ''}`} onClick={() => setSel(m)} style={sel === m ? { borderColor: 'var(--blue)' } : undefined} data-testid={`market-${m}`}>
                  <div className="row">
                    <span className="mk-flag">{md.flag}</span>
                    <b>{md.name}</b>
                  </div>
                  {st.launched ? (
                    <>
                      <div className="tiny">
                        {ind.unit} <b>{Math.round(st.users).toLocaleString('ko-KR')}</b>
                      </div>
                      <div className="tiny">점유율 {(shares(s, m).player * 100).toFixed(1)}%</div>
                      <div className="tiny">인지도 {(st.awareness * 100).toFixed(0)}%</div>
                      <div className="tiny">광고 {wonShort(st.adBudget)}/월</div>
                    </>
                  ) : (
                    <>
                      <div className="tiny muted">수요 {Math.round(demand(s, m)).toLocaleString('ko-KR')} · 객단가 ×{md.arpu}</div>
                      <div className="tiny muted">진출 비용 {wonShort(md.entry)}</div>
                      <button
                        className="btn small"
                        data-testid={`launch-${m}`}
                        disabled={!!block}
                        title={block ?? ''}
                        onClick={(e) => {
                          e.stopPropagation();
                          const err = act((g) => launchMarket(g, m));
                          setMsg(err ?? null);
                        }}
                      >
                        진출
                      </button>
                      {block && <div className="tiny muted">{block}</div>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="card col">
            <div className="row">
              <b>
                {market(sel).flag} {market(sel).name} 시장
              </b>
              <span className="tiny muted">
                전체 수요 {Math.round(D).toLocaleString('ko-KR')} {ind.unit} (도입률 × 잠재 고객 × 경기)
              </span>
            </div>
            <div className="share-bar" title="점유율">
              <div style={{ width: `${sh.player * 100}%`, background: 'var(--blue)' }} />
              {sh.comps.map((c, i) => (
                <div key={c.id} style={{ width: `${c.share * 100}%`, background: SHARE_COLORS[i % SHARE_COLORS.length] }} title={`${c.name} ${(c.share * 100).toFixed(1)}%`} />
              ))}
            </div>
            <div className="row tiny" style={{ flexWrap: 'wrap' }}>
              <span>
                <b style={{ color: 'var(--blue)' }}>■</b> 우리 {(sh.player * 100).toFixed(1)}%
              </span>
              {sh.comps.map((c, i) => (
                <span key={c.id}>
                  <b style={{ color: SHARE_COLORS[i % SHARE_COLORS.length] }}>■</b> {c.name} {(c.share * 100).toFixed(1)}%
                </span>
              ))}
              <span className="muted">나머지: 현지 기업·대체재·아직 고르지 않은 고객</span>
            </div>
            {ms.launched && (
              <>
                <div className="row">
                  <span className="tiny" style={{ width: 120 }}>
                    월 광고 예산
                  </span>
                  <input
                    type="range"
                    className="grow"
                    data-testid={`ad-${sel}`}
                    min={0}
                    max={Math.max(2e7, Math.min(2e10, Math.ceil((s.cash / 6) / 1e6) * 1e6))}
                    step={Math.max(1e5, Math.round(Math.max(2e7, s.cash / 6) / 200 / 1e5) * 1e5)}
                    value={ms.adBudget}
                    onChange={(e) => act((g) => setAdBudget(g, sel, Number(e.target.value)))}
                  />
                  <b style={{ width: 110, textAlign: 'right' }}>
                    <Money v={ms.adBudget} />
                  </b>
                </div>
                <div className="tiny muted">
                  광고는 인지도(브랜드)를 올리고 고객을 직접 데려옵니다(CAC). 점유율이 높아질수록 고객 한 명 데려오는 비용이 비싸집니다. 마케팅팀이 "퍼포먼스 광고 운영"을 하면 효율이 오릅니다. 매일 예산의 1/30씩 나갑니다.
                </div>
              </>
            )}
          </div>
        </>
      )}
      {tab === 'comp' && (
        <>
          <div className="tiny muted">
            우리 매력도 {appeal(s).toFixed(1)}. 경쟁사는 매달 기능을 내고 투자를 받으며 우리를 따라옵니다. 단계 4부터 경쟁사를 인수해 고객의 60%와 기술을 흡수할 수 있습니다.
          </div>
          <table className="t">
            <thead>
              <tr>
                <th>회사</th>
                <th className="r">매력도</th>
                <th className="r">인지도</th>
                <th>시장</th>
                <th className="r">추정 고객</th>
                <th>성향</th>
                <th className="r">인수가</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {s.competitors
                .filter((c) => c.alive || c.acquiredDay !== null)
                .map((c) => {
                  const block = acquireBlock(s, c);
                  return (
                    <tr key={c.id} style={{ opacity: c.alive ? 1 : 0.5 }}>
                      <td>
                        <b>{c.name}</b> {c.boostUntil && c.boostUntil > s.day && <span className="chip red">가격 인하</span>}
                        {!c.alive && <span className="chip">{c.acquiredDay ? '인수됨' : '폐업'}</span>}
                      </td>
                      <td className="r">{c.appeal.toFixed(1)}</td>
                      <td className="r">{(c.awareness * 100).toFixed(0)}%</td>
                      <td>{c.markets.map((m) => market(m).flag).join(' ')}</td>
                      <td className="r">{c.alive ? Math.round(competitorUsers(s, c)).toLocaleString('ko-KR') : '-'}</td>
                      <td>{c.aggression > 0.66 ? '공격적' : c.aggression > 0.33 ? '보통' : '신중'}</td>
                      <td className="r">{c.alive ? wonShort(acquisitionPrice(s, c)) : '-'}</td>
                      <td>
                        {c.alive && (
                          <button
                            className="btn small"
                            data-testid={`acquire-${c.id}`}
                            disabled={!!block}
                            title={block ?? ''}
                            onClick={() => {
                              const err = act((g) => acquire(g, c.id));
                              setMsg(err ?? null);
                              if (!err) play('success');
                            }}
                          >
                            인수
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </>
      )}
      {tab === 'ent' && (
        <>
          <div className="card col">
            <div className="row">
              <b>대기업 파이프라인</b>
              <div className="bar">
                <div style={{ width: `${Math.min(100, (s.entPipeline / enterpriseThreshold(s)) * 100)}%` }} />
              </div>
              <span className="tiny">
                {s.entPipeline.toFixed(1)} / {enterpriseThreshold(s).toFixed(1)}
              </span>
            </div>
            <div className="tiny muted">
              {fxTotals(s).enterprise
                ? '파이프라인이 다 차면 대기업 계약이 하나 성사됩니다. 대표의 "대기업 영업"(경영 모드)과 세일즈팀 "대기업 영업" 지시가 채웁니다.'
                : '대기업용 기능(SSO·보안 등)이 없어서 계약이 성사되지 않습니다. 제품 앱에서 대기업 기능을 만드세요.'}
              {industry(s.company.industry).entBase <= 0 ? ' 이 산업은 대기업 계약이 거의 없습니다.' : ''}
            </div>
          </div>
          <table className="t">
            <thead>
              <tr>
                <th>고객사</th>
                <th>시장</th>
                <th className="r">월 계약액</th>
                <th>기간</th>
              </tr>
            </thead>
            <tbody>
              {s.enterprise.map((d) => (
                <tr key={d.id} style={{ opacity: d.endDay > s.day ? 1 : 0.5 }}>
                  <td>{d.name}</td>
                  <td>{market(d.market).flag}</td>
                  <td className="r">
                    <Money v={d.monthly} />
                  </td>
                  <td>
                    {formatDate(d.startDay)} ~ {formatDate(d.endDay)}
                    {d.endDay <= s.day ? ' (종료)' : ''}
                  </td>
                </tr>
              ))}
              {s.enterprise.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    아직 대기업 계약이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
      {tab === 'econ' && <Econ />}
    </div>
  );

  function Econ() {
    const rows = MARKET_IDS.filter((m) => s.markets[m].launched);
    const infra = infraPerUser(s);
    return (
      <div className="col">
        <div className="tiny muted">
          {ind.name}: {ind.desc}
        </div>
        <table className="t">
          <thead>
            <tr>
              <th>시장</th>
              <th className="r">유료 비율</th>
              <th className="r">구독 매출/명</th>
              <th className="r">광고/명</th>
              <th className="r">수수료/명</th>
              <th className="r">합계/명·월</th>
              <th className="r">인프라/명</th>
              <th className="r">고객 생애 가치(LTV)</th>
              <th className="r">광고 CAC(기준)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const r = revenuePerUser(s, m);
              const churn = ind.churnM;
              return (
                <tr key={m}>
                  <td>
                    {market(m).flag} {market(m).name}
                  </td>
                  <td className="r">{(r.payShare * 100).toFixed(1)}%</td>
                  <td className="r">{Math.round(r.sub).toLocaleString('ko-KR')}원</td>
                  <td className="r">{Math.round(r.ad).toLocaleString('ko-KR')}원</td>
                  <td className="r">{Math.round(r.take).toLocaleString('ko-KR')}원</td>
                  <td className="r">
                    <b>{Math.round(r.total).toLocaleString('ko-KR')}원</b>
                  </td>
                  <td className="r">{Math.round(infra).toLocaleString('ko-KR')}원</td>
                  <td className="r">{wonShort((r.total - infra) / churn)}</td>
                  <td className="r">{wonShort(ind.cac * market(m).arpu * (1 + 3 * shares(s, m).player))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="tiny muted">
          LTV는 (객단가 − 인프라비) ÷ 기본 이탈률로 어림한 값입니다. LTV가 CAC보다 넉넉히 크면 광고를 늘릴수록 남는 장사입니다. 고객지원팀 충족도 {Math.round(deptCoverage(s, 'cs') * 100)}%, 인프라팀 충족도 {Math.round(deptCoverage(s, 'infra') * 100)}% (사용자가 늘면 사람이 더 필요합니다).
        </div>
      </div>
    );
  }
}
