// 시장 메뉴(RV-01·PD-02 확장): 시장별 점유율·고객 흐름·광고 예산, 해외 진출, 경쟁사와 인수(M&A), 대기업 계약
// 화면(A-179): 업무·커리어와 같은 톤 — 알약 탭, 칸칸이 차는 점유율·진행 막대, 색 타일 국기, 설명 문장은 title로(skin/MarketApp.css)
// 화면(A-212): 이름 "시장·광고" → "시장". 위 요약·팀 지시를 빼고 왼쪽 시장 줄 + 오른쪽 고른 시장 하나(점유율 · 고객 흐름 · 광고 예산)
import { useState } from 'react';
import { industry, market, MARKET_IDS } from '../../core/data';
import { adSalesOn } from '../../core/adsales';
import { launchBlock, roomState, shares } from '../../core/market';
import { ROOM_LINE } from '../../core/marketing';
import { LossBars } from './CustomerFlow';
import { acquireBlock, acquisitionPrice, competitorUsers } from '../../core/competitors';
import { appeal, fxTotals } from '../../core/product';
import { enterpriseThreshold } from '../../core/orders';
import { formatDate } from '../../core/calendar';
import { wonShort } from '../../core/format';
import { dispatch, useGame } from '../store';
import { Tabs, Help } from '../common';
import { play } from '../sound';
import type { MarketId, MarketState } from '../../core/types';
import './apps.css';
import './skin/MarketApp.css';

const SHARE_COLORS = ['#e5484d', '#f0a020', '#8b63e8', '#11a3a6', '#7a8597', '#c46be0', '#b5651d', '#5c6bc0'];

function n(v: number): string {
  return Math.round(v).toLocaleString('ko-KR');
}

type MarketTab = 'markets' | 'comp' | 'ent';

// A-210: 광고 판매는 팀 앱 광고 운영팀 화면 하나로, "고객 한 명의 값" 탭·위 요약은 뺌
export function MarketApp(_: { initialTab?: string }) {
  const s = useGame();
  const sells = adSalesOn(s);
  const [tab, setTab] = useState<MarketTab>('markets');
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="col mkt mk2">
      <Tabs
        tabs={[
          { id: 'markets', label: '시장' },
          { id: 'comp', label: `경쟁사 ${s.competitors.filter((c) => c.alive).length}` },
          // A-182 광고 판매 산업은 대기업 계약 대신 광고 판매(팀 앱 광고 운영팀)
          ...(sells ? [] : [{ id: 'ent' as const, label: `대기업 계약 ${s.enterprise.filter((d) => d.endDay > s.day).length}` }]),
        ]}
        value={tab}
        onChange={setTab}
      />
      {msg && <div className="warn">{msg}</div>}
      {tab === 'markets' && <Markets setMsg={setMsg} />}
      {tab === 'comp' && <Competitors setMsg={setMsg} />}
      {tab === 'ent' && <Enterprise />}
    </div>
  );
}

function Markets({ setMsg }: { setMsg: (m: string | null) => void }) {
  const s = useGame();
  const [sel, setSel] = useState<MarketId>('kr');
  const ind = industry(s.company.industry);
  const ms = s.markets[sel];
  const md = market(sel);
  const sh = shares(s, sel);
  const block = launchBlock(s, sel);
  return (
    <div className="mk2-split">
      <nav className="mk2-list">
        {MARKET_IDS.map((m) => {
          const st = s.markets[m];
          return (
            <button key={m} className={`mk2-row ${sel === m ? 'on' : ''} ${st.launched ? '' : 'closed'}`} onClick={() => setSel(m)} data-testid={`market-${m}`}>
              <span className="mk-flag">{market(m).flag}</span>
              <b>{market(m).name}</b>
              <span className="mk2-row-val">{st.launched ? n(st.users) : '진출 전'}</span>
            </button>
          );
        })}
      </nav>

      <section className="mk2-detail">
        <div className="mk2-title">
          <span className="mk-flag">{md.flag}</span>
          <h3>{md.name}</h3>
          {ms.launched && (
            <span className="mk2-users">
              {ind.unit} <b>{n(ms.users)}</b>
            </span>
          )}
        </div>

        {!ms.launched && (
          <div className="mk2-closed">
            {block ? (
              <div className="ew-note">{block}</div>
            ) : (
              <button
                className="btn big"
                data-testid={`launch-${sel}`}
                onClick={() => {
                  const err = dispatch({ type: 'launchMarket', market: sel }) as string | null | undefined;
                  setMsg(err ?? null);
                }}
              >
                {wonShort(md.entry)} 들여 진출
              </button>
            )}
          </div>
        )}

        {ms.launched && (
          <>
            <div className="mk2-block">
              <div className="inv-capbar" title="점유율">
                <div style={{ flex: Math.max(0.001, sh.player), background: 'var(--accent)' }} />
                {sh.comps.map((c, i) => (
                  <div key={c.id} style={{ flex: c.share, background: SHARE_COLORS[i % SHARE_COLORS.length] }} title={`${c.name} ${(c.share * 100).toFixed(1)}%`} />
                ))}
                <div style={{ flex: Math.max(0, 1 - sh.player - sh.comps.reduce((a, c) => a + c.share, 0)), background: 'var(--surface-tile)' }} title="아직 아무것도 안 쓰는 고객" />
              </div>
              <div className="mkt-legend">
                <span>
                  <i style={{ background: 'var(--accent)' }} />
                  <b>우리 {(sh.player * 100).toFixed(1)}%</b>
                </span>
                {sh.comps.map((c, i) => (
                  <span key={c.id}>
                    <i style={{ background: SHARE_COLORS[i % SHARE_COLORS.length] }} />
                    {c.name} {(c.share * 100).toFixed(1)}%
                  </span>
                ))}
              </div>
            </div>

            {ms.flow && <GrowthPanel flow={ms.flow} users={ms.users} unit={ind.unit} />}

            <div className="mk2-block">
              <div className="mk2-label">
                <span>월 광고 예산</span>
                <b>{wonShort(ms.adBudget)}</b>
                <Help text="광고는 인지도를 올리고 고객을 직접 데려옵니다. 고객이 많아질수록 한 명을 데려오는 비용이 오릅니다. 마케팅팀이 '퍼포먼스 광고 운영'을 하면 효율이 오르고, 마케터가 많을수록 채널을 더 돌립니다. 매일 예산의 1/30씩 나갑니다." />
              </div>
              <input
                type="range"
                className="inv-range"
                data-testid={`ad-${sel}`}
                min={0}
                max={Math.max(2e7, Math.min(2e10, Math.ceil(s.cash / 6 / 1e6) * 1e6))}
                step={Math.max(1e5, Math.round(Math.max(2e7, s.cash / 6) / 200 / 1e5) * 1e5)}
                value={ms.adBudget}
                onChange={(e) => dispatch({ type: 'setAdBudget', market: sel, monthly: Number(e.target.value) })}
              />
              <div className="ew-note">
                인지도 <b>{(ms.awareness * 100).toFixed(1)}%</b>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// 고객이 들고 나는 줄(최근 2주 평균, 한 달 환산): 들어옴·떠남·합계 세 칸 + 떠나는 이유 막대 + 받쳐 주는 고객(A-196, 제품 여유 한 줄은 A-158)
function GrowthPanel({ flow, users, unit }: { flow: NonNullable<MarketState['flow']>; users: number; unit: string }) {
  const gain = flow.inbound + flow.viral + flow.sales + flow.paid;
  const net = gain - flow.lost;
  const m = (v: number) => (v * 30 >= 100 ? n(v * 30) : (v * 30).toFixed(1));
  const why = ROOM_LINE[roomState(users, flow.target)] + (net <= 0 ? ' 지금은 유입보다 이탈이 많습니다.' : '');
  const fill = Math.min(100, (users / Math.max(1, flow.target)) * 100);
  return (
    <div className="mk2-block" data-testid="growth-panel">
      <div className="mk2-label">월 {unit} 유입·이탈</div>
      <div className="mk2-trio">
        <div title={`스스로 찾아옴 +${m(flow.inbound)} · 입소문 +${m(flow.viral)} · 영업 +${m(flow.sales)} · 광고 +${m(flow.paid)}`}>
          <span>유입</span>
          <b className="fin-good">+{m(gain)}</b>
        </div>
        <div>
          <span>이탈</span>
          <b className="fin-bad">−{m(flow.lost)}</b>
        </div>
        <div>
          <span>순증감</span>
          <b className={net >= 0 ? 'fin-good' : 'fin-bad'}>
            {net >= 0 ? '+' : ''}
            {m(net)}
          </b>
        </div>
      </div>
      {flow.why && flow.lost > 0 && <LossBars why={flow.why} lost={flow.lost} />}
      <div className="mk2-cap" data-testid="market-cap" title="이 시장에서 지금 제품이 받쳐 주는 고객입니다(A-196). 매력도(기능·기능 레벨)와 인지도가 오르면 커집니다.">
        <div className="mk2-label">
          <span>제품이 받쳐 주는 {unit}</span>
          <b>
            약 {n(flow.target)} · {Math.round(fill)}% 찼음
          </b>
        </div>
        <div className="mk2-bar">
          <div style={{ width: `${fill}%` }} />
        </div>
      </div>
      <div className="ew-note">{why}</div>
    </div>
  );
}

// 경쟁사: 공고 카드처럼. 매력도 숫자 대신 "우리보다 강함/비슷/약함"
function strength(ours: number, theirs: number): { text: string; tone: string } {
  const r = theirs / Math.max(1, ours);
  return r > 1.15 ? { text: '우리보다 강함', tone: 'red' } : r < 0.85 ? { text: '우리보다 약함', tone: 'green' } : { text: '비슷함', tone: '' };
}

function Competitors({ setMsg }: { setMsg: (m: string | null) => void }) {
  const s = useGame();
  const ours = appeal(s);
  const list = s.competitors.filter((c) => c.alive || c.acquiredDay !== null);
  return (
    <div className="col">
      <div className="mk2-sect" title="경쟁사는 매달 기능을 출시하고 투자를 받으며 따라옵니다. 회사 단계 4부터 경쟁사를 인수해 고객의 60%와 기술을 가져올 수 있습니다.">
        경쟁사 <em>회사 단계 4부터 인수할 수 있습니다</em>
      </div>
      {list.length === 0 && <div className="empty-note">아직 경쟁사가 없습니다.</div>}
      <div className="emp-depts">
        {list.map((c, i) => {
          const block = acquireBlock(s, c);
          const st = strength(ours, c.appeal);
          return (
            <div key={c.id} className={`post-card ${c.alive ? '' : 'closed'}`} style={{ ['--dc' as string]: SHARE_COLORS[i % SHARE_COLORS.length] }}>
              <div className="pc-head">
                <span className="pc-dot" />
                <b>{c.name}</b>
                {c.alive ? <span className={`chip ${st.tone}`}>{st.text}</span> : <span className="chip">{c.acquiredDay ? '인수됨' : '폐업'}</span>}
                {c.alive && c.boostUntil && c.boostUntil > s.day && <span className="chip red">가격 인하 중</span>}
              </div>
              {c.alive && (
                <>
                  <div className="pc-stats">
                    <span>
                      고객 약 <b>{n(competitorUsers(s, c))}</b>
                    </span>
                    <span>
                      성향 <b>{c.aggression > 0.66 ? '공격적' : c.aggression > 0.33 ? '보통' : '신중'}</b>
                    </span>
                    <span>{c.markets.map((m) => market(m).flag).join(' ')}</span>
                  </div>
                  <div className="row">
                    <span className="pc-foot grow">
                      <span>인수가 {wonShort(acquisitionPrice(s, c))}</span>
                    </span>
                    <button
                      className="btn small"
                      data-testid={`acquire-${c.id}`}
                      disabled={!!block}
                      title={block ?? ''}
                      onClick={() => {
                        const err = dispatch({ type: 'acquire', competitorId: c.id }) as string | null | undefined;
                        setMsg(err ?? null);
                        if (!err) play('success');
                      }}
                    >
                      인수
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Enterprise() {
  const s = useGame();
  const need = enterpriseThreshold(s);
  const ready = fxTotals(s).enterprise;
  const live = s.enterprise.filter((d) => d.endDay > s.day);
  return (
    <div className="hire-layout">
      <section className="hire-form">
        <div className="mk2-ent" title={'막대가 다 차면 대기업 계약이 하나 성사됩니다. 대표의 "대기업 영업"(경영 모드)과 세일즈팀 "대기업 영업" 지시가 채웁니다.'}>
          <span className="mk2-kicker">다음 대기업 계약까지</span>
          <b className="mk2-pct">{Math.min(100, Math.round((s.entPipeline / need) * 100))}%</b>
          <div className="mk2-bar">
            <div style={{ width: `${Math.min(100, (s.entPipeline / need) * 100)}%` }} />
          </div>
          {ready && <span className="mk2-hint">대기업 영업으로 채웁니다</span>}
        </div>
        {!ready && <div className="warn">대기업용 기능(SSO·보안 등)이 없어서 계약이 성사되지 않습니다. 제품 메뉴에서 대기업 기능을 만드세요.</div>}
        {industry(s.company.industry).entBase <= 0 && <div className="ew-note">이 산업은 대기업 계약이 거의 없습니다.</div>}
        {live.length > 0 && (
          <div className="fb-row big">
            <span>대기업 매출</span>
            <b className="fin-good">월 {wonShort(live.reduce((a, d) => a + d.monthly, 0))}</b>
          </div>
        )}
      </section>
      <section className="post-list">
        <div className="hf-title">계약</div>
        {s.enterprise.length === 0 && <div className="empty-note">아직 대기업 계약이 없습니다.</div>}
        {s.enterprise
          .slice()
          .reverse()
          .map((d) => (
            <div key={d.id} className={`post-card ${d.endDay > s.day ? '' : 'closed'}`} style={{ ['--dc' as string]: 'var(--positive)' }}>
              <div className="pc-head">
                <span className="pc-dot" />
                <b>{d.name}</b>
                <span className="mk-flag">{market(d.market).flag}</span>
                <span className="pc-hired">월 {wonShort(d.monthly)}</span>
              </div>
              <div className="pc-foot">
                <span>
                  {formatDate(d.startDay)} ~ {formatDate(d.endDay)}
                </span>
                <span>{d.endDay <= s.day ? '종료' : `${d.endDay - s.day}일 남음`}</span>
              </div>
            </div>
          ))}
      </section>
    </div>
  );
}
