// 시장 메뉴(RV-01·PD-02 확장): 시장별 수요·점유율·인지도·광고 예산, 해외 진출, 경쟁사와 인수(M&A), 대기업 계약, 수익 구조(LTV·CAC)
// 화면 짜임(A-113): 채용처럼 왼쪽 회색 판(고른 시장 · 고객이 들고 나는 줄 · 광고 · 팀 지시) + 오른쪽 시장 카드. 공식 대신 쉬운 말
// 화면(A-179): 업무·커리어와 같은 톤 — 가운데 큰 고객 수 + 납작한 회색 칸 요약, 알약 탭, 칸칸이 차는 점유율·진행 막대, 색 타일 국기, 설명 문장은 title로(skin/MarketApp.css)
import { useState } from 'react';
import { DATA, industry, market, MARKET_IDS } from '../../core/data';
import { activeCampaigns } from '../../core/ads';
import { Ads } from './AdsPanel';
import { AdSales } from './AdSalesPanel';
import { adSalesOf, adSalesOn, liveAdDeals } from '../../core/adsales';
import { infraPerUser, launchBlock, launchMarket, revenuePerUser, roomState, setAdBudget, shares, totalUsers, deptCoverage } from '../../core/market';
import { ROOM_LINE } from '../../core/marketing';
import { LossBars } from './CustomerFlow';
import { acquire, acquireBlock, acquisitionPrice, competitorUsers } from '../../core/competitors';
import { appeal, fxTotals } from '../../core/product';
import { enterpriseThreshold, orderOf } from '../../core/orders';
import { formatDate } from '../../core/calendar';
import { wonShort } from '../../core/format';
import { commandOrder } from '../../core/reactions';
import { act, useGame } from '../store';
import { Tabs, Help } from '../common';
import { play } from '../sound';
import type { DeptId, GameState, MarketId, MarketState } from '../../core/types';
import './apps.css';
import './skin/MarketApp.css';

const SHARE_COLORS = ['#e5484d', '#f0a020', '#8b63e8', '#11a3a6', '#7a8597', '#c46be0', '#b5651d', '#5c6bc0'];

function n(v: number): string {
  return Math.round(v).toLocaleString('ko-KR');
}

type MarketTab = 'markets' | 'ads' | 'adsales' | 'comp' | 'ent' | 'econ';

export function MarketApp({ initialTab }: { initialTab?: string }) {
  const s = useGame();
  const sells = adSalesOn(s);
  const [tab, setTab] = useState<MarketTab>(initialTab === 'adsales' && sells ? 'adsales' : 'markets');
  const [msg, setMsg] = useState<string | null>(null);
  const ind = industry(s.company.industry);
  const launched = MARKET_IDS.filter((m) => s.markets[m].launched);
  const ads = launched.reduce((a, m) => a + s.markets[m].adBudget, 0);
  const net = launched.reduce((a, m) => {
    const f = s.markets[m].flow;
    return f ? a + (f.inbound + f.viral + f.sales + f.paid - f.lost) * 30 : a;
  }, 0);
  return (
    <div className="col mkt mk2">
      <div className={`mk2-head ${tab === 'ads' ? 'slim' : ''}`}>
        <span className="mk2-kicker">전체 {ind.unit}</span>
        <h2 className="mk2-big">{n(totalUsers(s))}</h2>
      </div>
      <div className="mk2-stats">
        <div className="mk2-stat" title="최근 2주 평균을 한 달로 환산">
          <span>한 달에 늘어나는 {ind.unit}</span>
          <b className={net < 0 ? 'fin-bad' : net > 0 ? 'fin-good' : ''}>
            {net > 0 ? '+' : ''}
            {n(net)}
          </b>
        </div>
        <div className="mk2-stat">
          <span>진출한 시장</span>
          <b>{launched.length}곳</b>
        </div>
        <div className="mk2-stat">
          <span>한 달 광고비</span>
          <b>{wonShort(ads)}</b>
        </div>
      </div>
      <Tabs
        tabs={[
          { id: 'markets', label: '시장' },
          { id: 'ads', label: `광고${activeCampaigns(s).length ? ` · 캠페인 ${activeCampaigns(s).length}` : ''}` },
          // A-182 광고 판매 산업은 대기업 계약 대신 광고 판매(광고주 제안·계약)
          ...(sells
            ? [{ id: 'adsales' as const, label: `광고 판매 ${liveAdDeals(s).length}${adSalesOf(s).offers.some((o) => !o.left) ? ` · 제안 ${adSalesOf(s).offers.filter((o) => !o.left).length}` : ''}` }]
            : []),
          { id: 'comp', label: `경쟁사 ${s.competitors.filter((c) => c.alive).length}` },
          ...(sells ? [] : [{ id: 'ent' as const, label: `대기업 계약 ${s.enterprise.filter((d) => d.endDay > s.day).length}` }]),
          { id: 'econ', label: '고객 한 명의 값' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {msg && <div className="warn">{msg}</div>}
      {tab === 'markets' && <Markets setMsg={setMsg} goAds={() => setTab('ads')} />}
      {tab === 'ads' && <Ads setMsg={setMsg} />}
      {tab === 'adsales' && <AdSales setMsg={setMsg} />}
      {tab === 'comp' && <Competitors setMsg={setMsg} />}
      {tab === 'ent' && <Enterprise />}
      {tab === 'econ' && <Econ />}
    </div>
  );
}

function Markets({ setMsg, goAds }: { setMsg: (m: string | null) => void; goAds: () => void }) {
  const s = useGame();
  const [sel, setSel] = useState<MarketId>('kr');
  const ind = industry(s.company.industry);
  const ms = s.markets[sel];
  const md = market(sel);
  const sh = shares(s, sel);
  return (
    <div className="hire-layout">
      <section className="hire-form">
        <div className="hf-title inv-title">
          <span className="mk-flag">{md.flag}</span>
          {md.name} 시장
          {!ms.launched && <span className="chip">아직 진출 전</span>}
        </div>
        <div className="hf-label">누가 고객을 갖고 있나</div>
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
          <span className="muted">
            <i style={{ background: 'var(--surface-tile)' }} />
            아직 안 쓰는 {ind.unit}
          </span>
        </div>

        {ms.launched && ms.flow && <GrowthPanel flow={ms.flow} users={ms.users} unit={ind.unit} />}

        {ms.launched && (
          <div className="hf-field">
            <div className="hf-label inv-room-label">
              <span>한 달 광고 예산</span>
              <b>{wonShort(ms.adBudget)}</b>
              <Help text="광고는 우리를 아는 사람을 늘리고, 고객을 직접 데려옵니다. 고객이 많아질수록 한 명 데려오는 값이 비싸집니다. 마케팅팀이 '퍼포먼스 광고 운영'을 하면 효율이 오르고, 마케터가 많을수록 채널을 더 돌립니다. 매일 예산의 1/30씩 나갑니다." />
            </div>
            <input
              type="range"
              className="inv-range"
              data-testid={`ad-${sel}`}
              min={0}
              max={Math.max(2e7, Math.min(2e10, Math.ceil(s.cash / 6 / 1e6) * 1e6))}
              step={Math.max(1e5, Math.round(Math.max(2e7, s.cash / 6) / 200 / 1e5) * 1e5)}
              value={ms.adBudget}
              onChange={(e) => act((g) => setAdBudget(g, sel, Number(e.target.value)))}
            />
            <div className="ew-note mk2-aware" title="예산은 지금 비율대로 채널에 나눠 씁니다">
              우리를 아는 사람 <b>{(ms.awareness * 100).toFixed(1)}%</b>{' '}
              <button className="pc-link" onClick={goAds}>
                채널별로 나누기 ›
              </button>
            </div>
          </div>
        )}
        <TeamOrders />
      </section>

      <section className="post-list">
        <div className="hf-title">시장</div>
        {MARKET_IDS.map((m) => {
          const st = s.markets[m];
          const mdef = market(m);
          const block = launchBlock(s, m);
          return (
            <div
              key={m}
              className={`post-card mkt-card ${sel === m ? 'on' : ''} ${st.launched ? '' : 'closed'}`}
              style={{ ['--dc' as string]: st.launched ? 'var(--positive)' : 'var(--c-gray-400)' }}
              onClick={() => setSel(m)}
              data-testid={`market-${m}`}
            >
              <div className="pc-head">
                <span className="mk-flag">{mdef.flag}</span>
                <b>{mdef.name}</b>
                <span className="pc-hired">{st.launched ? `${ind.unit} ${n(st.users)}` : wonShort(mdef.entry)}</span>
              </div>
              {st.launched ? (
                <div className="pc-stats">
                  <span>
                    점유율 <b>{(shares(s, m).player * 100).toFixed(1)}%</b>
                  </span>
                  <span>
                    광고 <b>{st.adBudget ? `월 ${wonShort(st.adBudget)}` : '없음'}</b>
                  </span>
                </div>
              ) : block ? (
                <div className="pc-foot">
                  <span>{block}</span>
                </div>
              ) : (
                <button
                  className="btn small"
                  data-testid={`launch-${m}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const err = act((g) => launchMarket(g, m));
                    setMsg(err ?? null);
                  }}
                >
                  {wonShort(mdef.entry)} 들여 진출하기
                </button>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

// 시장에 영향을 주는 팀 지시(마케팅·세일즈·고객지원): 그 팀에 사람이 있을 때만
function TeamOrders() {
  const s = useGame();
  const teams = (['marketing', 'sales', 'cs'] as DeptId[]).filter((d) => s.employees.some((e) => e.dept === d));
  if (!teams.length) return null;
  return (
    <>
      <div className="hf-label">팀이 맡은 일</div>
      {teams.map((d) => (
        <div key={d} className="fb-row">
          <span>{DATA.depts.departments.find((x) => x.id === d)!.name}팀</span>
          <select value={orderOf(s, d)} onChange={(e) => act((g) => commandOrder(g, d, e.target.value))}>
            {DATA.orders.orders
              .filter((o) => o.dept === d)
              .map((o) => (
                <option key={o.id} value={o.id} disabled={s.company.stage < o.stage}>
                  {o.name}
                </option>
              ))}
          </select>
        </div>
      ))}
    </>
  );
}

// 고객이 들고 나는 줄(최근 2주 평균, 한 달 환산): 재무 판처럼 들어옴/나감 + 떠나는 이유 막대 + 받쳐 주는 고객(A-196) + 제품 여유 한 줄(A-158)
function GrowthPanel({ flow, users, unit }: { flow: NonNullable<MarketState['flow']>; users: number; unit: string }) {
  const gain = flow.inbound + flow.viral + flow.sales + flow.paid;
  const net = gain - flow.lost;
  const m = (v: number) => (v * 30 >= 100 ? n(v * 30) : (v * 30).toFixed(1));
  const why = ROOM_LINE[roomState(users, flow.target)] + (net <= 0 ? ' 지금은 들어오는 고객보다 떠나는 고객이 많습니다.' : '');
  return (
    <div className="mkt-flow" data-testid="growth-panel">
      <div className="hf-label">한 달에 들고 나는 {unit}(최근 2주 기준)</div>
      <div className="fb-line">
        <span>스스로 찾아옴</span>
        <b>+{m(flow.inbound)}</b>
      </div>
      <div className="fb-line">
        <span>입소문</span>
        <b>+{m(flow.viral)}</b>
      </div>
      <div className="fb-line">
        <span>영업</span>
        <b>+{m(flow.sales)}</b>
      </div>
      <div className="fb-line">
        <span>광고</span>
        <b>+{m(flow.paid)}</b>
      </div>
      <div className="fb-line">
        <span>떠남</span>
        <b className="fin-bad">−{m(flow.lost)}</b>
      </div>
      <div className="fb-line fb-total">
        <span>합계</span>
        <b className={net >= 0 ? 'fin-good' : 'fin-bad'}>
          {net >= 0 ? '+' : ''}
          {m(net)}
        </b>
      </div>
      {flow.why && flow.lost > 0 && (
        <>
          <div className="hf-label">떠나는 이유</div>
          <LossBars why={flow.why} lost={flow.lost} />
        </>
      )}
      <div className="fb-line fb-total" data-testid="market-cap" title="이 시장에서 지금 제품이 받쳐 주는 고객입니다(A-196). 매력도(기능·기능 레벨)와 인지도가 오르면 커집니다.">
        <span>제품이 받쳐 주는 {unit}</span>
        <b>
          약 {n(flow.target)} · {Math.round((users / Math.max(1, flow.target)) * 100)}% 찼음
        </b>
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
      <div className="mk2-sect" title="경쟁사는 매달 기능을 내고 투자를 받으며 따라옵니다. 회사 단계 4부터 경쟁사를 사들여 고객의 60%와 기술을 가져올 수 있습니다.">
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
                {c.alive ? <span className={`chip ${st.tone}`}>{st.text}</span> : <span className="chip">{c.acquiredDay ? '인수함' : '문 닫음'}</span>}
                {c.alive && c.boostUntil && c.boostUntil > s.day && <span className="chip red">가격 내리는 중</span>}
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
                      <span>사들이려면 {wonShort(acquisitionPrice(s, c))}</span>
                    </span>
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
            <span>대기업에서 받는 돈</span>
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
                <span>{d.endDay <= s.day ? '끝남' : `${d.endDay - s.day}일 남음`}</span>
              </div>
            </div>
          ))}
      </section>
    </div>
  );
}

// 고객 한 명의 값: 표 대신 시장마다 카드. "한 명이 한 달에 내는 돈 → 오래 쓰면 남는 돈 vs 광고로 데려오는 값"
function Econ() {
  const s = useGame();
  const ind = industry(s.company.industry);
  const rows = MARKET_IDS.filter((m) => s.markets[m].launched);
  const infra = infraPerUser(s);
  if (!rows.length) return <div className="empty-note">출시하면 고객 한 명이 얼마를 벌어 주는지 볼 수 있습니다.</div>;
  return (
    <div className="col">
      <div className="mk2-sect" title={`${ind.name}: ${ind.desc}`}>
        시장마다 <em>{ind.name}</em>
      </div>
      <div className="emp-depts">
        {rows.map((m) => (
          <EconCard key={m} s={s} m={m} infra={infra} />
        ))}
      </div>
      <div className="mk2-stats" title="고객이 늘면 사람이 더 필요합니다">
        <div className="mk2-stat">
          <span>고객지원팀이 채운 정도</span>
          <b>{Math.round(deptCoverage(s, 'cs') * 100)}%</b>
        </div>
        <div className="mk2-stat">
          <span>인프라팀이 채운 정도</span>
          <b>{Math.round(deptCoverage(s, 'infra') * 100)}%</b>
        </div>
      </div>
    </div>
  );
}

function EconCard({ s, m, infra }: { s: GameState; m: MarketId; infra: number }) {
  const ind = industry(s.company.industry);
  const r = revenuePerUser(s, m);
  const ltv = (r.total - infra) / ind.churnM;
  const cac = ind.cac * market(m).arpu * (1 + 3 * shares(s, m).player);
  const good = ltv > cac * 1.5;
  return (
    <div className="post-card" style={{ ['--dc' as string]: good ? 'var(--positive)' : 'var(--caution)' }}>
      <div className="pc-head">
        <span className="mk-flag">{market(m).flag}</span>
        <b>{market(m).name}</b>
        <span className={`chip ${good ? 'green' : 'amber'}`}>{good ? '광고할수록 남음' : '광고는 아껴서'}</span>
      </div>
      <div className="fb-line">
        <span>한 명이 한 달에 내는 돈</span>
        <b>{wonShort(r.total)}</b>
      </div>
      <div className="fb-line">
        <span>한 명당 서버비</span>
        <b>{wonShort(infra)}</b>
      </div>
      <div className="fb-line" title="(한 달에 내는 돈 − 서버비) ÷ 한 달에 떠나는 비율">
        <span>쓰는 동안 남겨 주는 돈</span>
        <b>{wonShort(ltv)}</b>
      </div>
      <div className="fb-line">
        <span>광고로 한 명 데려오는 값</span>
        <b>{wonShort(cac)}</b>
      </div>
    </div>
  );
}
