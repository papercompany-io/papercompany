// F09 업무 창(A-136, 예전 제품 창 · Startup Company식): 위 제품 띠(로고·순위·품질·사용자) + 탭(상태·기능·마케팅·만드는 순서·외주·출시 기록)
// 화면(A-179): 출시 뒤 상태 대시보드와 출시 기록 표를 MVP 전 화면(A-171)과 같은 톤으로 — 가운데 큰 사용자 수, 납작한 회색 요약 칸, 1px 테두리 카드, 칸칸이 막대, 설명은 title
//  A-158: 상태 탭을 SC 제품 창 Stats 짜임으로, 마케팅 탭(광고 판)을 제품 창 안에, 기능은 분류별 묶음
//  상태: MVP 전에는 출시까지 공정(진행률·남은 날·누가 만드나), 출시 후에는 지금 사용자·어제 매출·품질 계기판·추이 그래프
//  기능: 위 요약(잠재 고객·사용자·매력도 구성 팝업 / 다음 출시·작업량) + 기능 카드 줄(그림·레벨·업그레이드)
//  만드는 순서(로드맵) · 출시 기록
//  A-171: MVP 전에 보이는 화면(상태·기능·만드는 순서·출시 기록)을 커리어·랭킹과 같은 톤으로 — 가운데 큰 숫자, 색 타일 + 흰 픽셀 표식 길, 칸칸이 차는 막대, 납작한 회색 칸, 설명 글은 줄이고 마우스를 올리면(title)
// 오른쪽 위 제품 카드(ProductCard)도 여기서 내보냅니다.
import { ContractsCard } from './ScheduleApp';
import { devRates, forecast, promiseFor } from '../../core/milestones';
import { CycleStrip, itemSpans, weekStartOf } from './CycleStrip';
import { Ads } from './AdsPanel';
import { activeCampaigns } from '../../core/ads';
import { contractsOpen } from '../../core/contracts';
import { Fragment, useEffect, useState } from 'react';
import { DATA, feature, gradeOutput, industry, featuresOf, featureWork, priceTierDef, type FeatureDef, type FeatureFx } from '../../core/data';
import { addGrow, addToRoadmap, appeal, appealBreakdown, canCharge, coreFeatures, etaDays, featureLevel, featureLock, growCap, growLevel, growPlan, growTarget, hasMvp, insightCost, insightHave, itemName, itemNeed, moveRoadmap, quality, removeFromRoadmap, ROADMAP_MAX } from '../../core/product';
import { orderOf } from '../../core/orders';
import { formatDate, formatMonth } from '../../core/calendar';
import { launchedMarkets, liveUsers, revenuePerUser, totalUsers, unitWord } from '../../core/market';
import { AxisChart, FlowBars, flowAll, RoomNote, ScaleLadder } from './CustomerFlow';
import { computeValuation } from '../../core/valuation';
import { countShort, josa, wonCompact, wonShort } from '../../core/format';
import { commandOrder } from '../../core/reactions';
import { act, useGame } from '../store';
import { Tabs, Help, useTween } from '../common';
import { ServiceLogo } from '../logo';
import { PxIcon } from '../icons';
import { PixelCheck, PixelFlag } from '../pixelMarks';
import { play } from '../sound';
import type { GameState, PriceTier } from '../../core/types';
import './apps.css';
import './skin/ProductLive.css';

// 분류가 하는 일(A-158, 기능 탭 묶음 머리): 효과 숫자 대신 역할만
const CAT_ROLE: Record<string, string> = {
  core: '제품의 뼈대입니다. 다 있어야 출시합니다',
  growth: '더 많이 데려옵니다',
  monetize: '돈을 법니다',
  retention: '덜 떠나게 합니다',
  infra: '안정과 서버 비용',
  enterprise: '큰 회사와 계약을 맺게 합니다',
  global: '다른 나라에 나갈 수 있게 합니다',
  ai: '새 기술로 매력을 더합니다',
  platform: '다른 서비스와 이어 판을 키웁니다',
};
const CAT_ORDER = ['core', 'growth', 'monetize', 'retention', 'infra', 'enterprise', 'global', 'ai', 'platform'];

const CAT_NAME: Record<string, string> = {
  core: '핵심',
  growth: '성장',
  monetize: '수익화',
  retention: '리텐션',
  infra: '인프라',
  enterprise: '대기업',
  global: '해외',
  ai: 'AI',
  platform: '플랫폼',
};

export function fxText(fx: FeatureFx): string {
  const p: string[] = [];
  if (fx.appeal) p.push(`매력도 +${fx.appeal}`);
  if (fx.conv) p.push(`고객 유입 +${Math.round(fx.conv * 100)}%`);
  if (fx.churn) p.push(`떠나는 고객 ${Math.round(fx.churn * 100)}%`);
  if (fx.pay) p.push(`유료 전환 +${(fx.pay * 100).toFixed(1)}%p`);
  if (fx.arpu) p.push(`고객당 매출 +${Math.round(fx.arpu * 100)}%`);
  if (fx.ad) p.push(`광고 수익 +${fx.ad}원/명`);
  if (fx.take) p.push(`수수료 +${(fx.take * 100).toFixed(1)}%p`);
  if (fx.gmv) p.push(`거래액 +${Math.round(fx.gmv * 100)}%`);
  if (fx.viral) p.push(`입소문 +${(fx.viral * 100).toFixed(1)}`);
  if (fx.infra) p.push(`서버비 ${Math.round(fx.infra * 100)}%`);
  if (fx.stability) p.push(`안정성 +${Math.round(fx.stability * 100)}`);
  if (fx.enterprise) p.push('대기업 계약 가능');
  if (fx.market) p.push(`${DATA.markets.markets.find((m) => m.id === fx.market)!.name} 진출 가능`);
  if (fx.ai) p.push('AI 기능');
  if (fx.bugs) p.push(`버그 조금 생김`);
  return p.join(' · ');
}

function dayText(d: number): string {
  if (!isFinite(d)) return '멈춤';
  return d <= 0 ? '오늘' : `약 ${d}일`;
}

function num(n: number): string {
  return Math.round(n).toLocaleString('ko-KR');
}

// 돈 버는 방법: 결제 기능(A-111)이 있어야 기본 요금을 받고, 수익화 기능이 더해집니다.
function billingFeatureName(s: GameState): string {
  return featuresOf(s.company.industry).find((f) => f.fx.billing)?.name ?? '결제';
}

function MoneyNote({ s }: { s: GameState }) {
  const ind = industry(s.company.industry);
  const r = revenuePerUser(s, 'kr');
  const parts: string[] = [];
  if (r.sub > 0) parts.push(`구독 ${wonShort(r.sub)}${r.payShare < 1 ? `(유료 전환 ${(r.payShare * 100).toFixed(1)}%)` : ''}`);
  if (r.ad > 0) parts.push(`광고 ${wonShort(r.ad)}`);
  if (r.take > 0) parts.push(`거래 수수료 ${wonShort(r.take)}`);
  return (
    <div className="pd-money">
      <div className="pd-kv">
        <span>
          {ind.unit} 1{ind.unit === '고객사' ? '곳' : '명'}당 한 달 매출
        </span>
        <b>{wonShort(r.total)}</b>
      </div>
      {canCharge(s) ? (
        <div className="pl-parts" title="수익화 기능을 만들면 더 받습니다.">
          {parts.join(' + ')}
        </div>
      ) : (
        <div className="pl-alert">아직 결제 기능이 없어 무료로만 씁니다. 기능 탭에서 "{billingFeatureName(s)}" 기능을 만들어야 돈이 들어옵니다.</div>
      )}
    </div>
  );
}

// 제품 화면 공통 계산: 하루 작업량(대표 + 로드맵을 맡은 팀), 항목별 남은 날, MVP 진행률
export function productView(s: GameState) {
  const rate = devRates(s); // 약속 예상과 같은 계산(A-177)
  const etas = etaDays(s.product.roadmap, rate.dev, rate.design);
  const cores = coreFeatures(s);
  // MVP 진행률: 핵심 기능 전체 작업량 중 끝낸 몫
  let need = 0;
  let done = 0;
  for (const c of cores) {
    const w = featureWork(c, 1);
    need += w.dev + w.design;
    if (featureLevel(s, c.id) >= 1) done += w.dev + w.design;
    else {
      const it = s.product.roadmap.find((r) => r.id === c.id);
      if (it) done += it.devDone + it.designDone;
    }
  }
  const coreIdx = s.product.roadmap.map((r, i) => (feature(r.id).cat === 'core' ? i : -1)).filter((i) => i >= 0);
  const coresQueued = cores.every((c) => featureLevel(s, c.id) >= 1 || s.product.roadmap.some((r) => r.id === c.id));
  const mvpEta = coresQueued && coreIdx.length ? etas[coreIdx[coreIdx.length - 1]] : null;
  return { rate, etas, cores, mvpProgress: need ? done / need : 0, mvpEta };
}

// 오른쪽 위 제품 카드(누르면 제품 창)
export function ProductCard({ onOpen }: { onOpen: () => void }) {
  const s = useGame();
  const v = productView(s);
  const mvp = hasMvp(s);
  const cur = s.product.roadmap[0];
  const users = useTween(liveUsers(s));
  const d = s.product.daily ?? [];
  const delta = d.length >= 2 ? d[d.length - 1].users - d[d.length - 2].users : 0;
  const justShipped = s.product.shipped.length > 0 && s.day - s.product.shipped[s.product.shipped.length - 1].day <= 1;
  const name = s.company.service?.name ?? s.company.name;
  return (
    <button className={`pc-card ${justShipped ? 'shipped' : ''}`} data-testid="product-card" onClick={onOpen}>
      <div className="pc-name">
        <ServiceLogo service={s.company.service} fallback={name} size={18} />
        <b>{name}</b>
        {justShipped && <span className="pc-new">출시!</span>}
      </div>
      {!mvp ? (
        <>
          <div className="pc-sub">MVP 만드는 중 · {Math.round(v.mvpProgress * 100)}%</div>
          <span className="ms-meter">
            <i style={{ width: `${v.mvpProgress * 100}%` }} />
          </span>
          <div className="pc-foot">{v.mvpEta === null ? '핵심 기능을 만드는 순서에 넣으세요' : isFinite(v.mvpEta) ? `출시까지 ${dayText(v.mvpEta)}` : '개발이 멈춰 있습니다'}</div>
        </>
      ) : (
        <>
          <div className="pc-tiles">
            <span className="pc-tile" title="품질(버그가 적을수록 높음)">
              <PxIcon id="check" size={14} />
              {quality(s)}%
            </span>
            <span className="pc-tile" title={`사용자 ${num(users)}`}>
              <PxIcon id="users" size={14} />
              {users >= 1e5 ? countShort(users) : num(users)}
            </span>
            <span className={`pc-tile ${delta < 0 ? 'down' : 'up'}`} title="어제보다 늘어난 사용자">
              <PxIcon id="chart" size={14} />
              {delta >= 0 ? '+' : ''}
              {Math.abs(delta) >= 1e5 ? countShort(delta) : num(delta)}
            </span>
          </div>
          <div className="pc-foot">{cur ? `만드는 중: ${itemName(cur)} · ${dayText(v.etas[0])}` : '만들 기능이 없습니다'}</div>
        </>
      )}
    </button>
  );
}

type ProductTab = 'status' | 'features' | 'marketing' | 'roadmap' | 'contract' | 'log';

export function ProductApp({ initialTab, openSchedule, openHiring }: { initialTab?: string; openSchedule?: () => void; openHiring?: () => void }) {
  const s = useGame();
  const mvp = hasMvp(s);
  const [tab, setTab] = useState<ProductTab>((initialTab as ProductTab) ?? 'status');
  const [msg, setMsg] = useState<string | null>(null);
  // 알림 카드(외주 진행, A-144)에서 열면 창이 이미 떠 있어도 그 탭으로
  useEffect(() => {
    if (initialTab) setTab(initialTab as ProductTab);
  }, [initialTab]);
  const showContract = !!s.contracts?.active || contractsOpen(s); // 외주 일감(A-133). A-136: 제안이 없어도 외주를 받을 수 있는 동안은 탭을 늘 보여 줌
  const v = productView(s);
  const live = liveUsers(s);
  const name = s.company.service?.name ?? s.company.name;
  const all = featuresOf(s.company.industry);
  return (
    <div className="col wk">
      <div className="pd-band">
        <ServiceLogo service={s.company.service} fallback={name} size={36} />
        <div className="col" style={{ gap: 2 }}>
          <b className="pd-title">{name}</b>
          <span className="tiny muted">
            {mvp
              ? `출시 ${s.day - (s.product.launchedDay ?? s.day)}일째 · 기능 ${Object.keys(s.product.features).length}/${all.length}개`
              : `MVP 준비 중 · 핵심 기능 ${v.cores.filter((c) => featureLevel(s, c.id) >= 1).length}/${v.cores.length}`}
          </span>
        </div>
        <span className="grow" />
        <span className="pd-pill" title="매력도">
          <PxIcon id="star" size={16} />
          {appeal(s).toFixed(1)}
        </span>
        <span className="pd-pill" title="품질">
          <PxIcon id="check" size={16} />
          {quality(s)}%
        </span>
        <span className="pd-pill" title={`사용자 ${num(live)}`}>
          <PxIcon id="users" size={16} />
          {live >= 1e5 ? countShort(live) : num(live)}
        </span>
      </div>
      {/* 탭(A-158, Startup Company 제품 창처럼 아이콘 + 이름). 마케팅 탭은 시장·광고 창의 광고 탭과 같은 판 */}
      <Tabs
        tabs={[
          { id: 'status', label: '상태', icon: 'chart' },
          { id: 'features', label: '기능', icon: 'star' },
          ...(mvp
            ? [
                {
                  id: 'marketing' as const,
                  label: `마케팅${activeCampaigns(s).length ? ` · 캠페인 ${activeCampaigns(s).length}` : ''}`,
                  icon: 'talk' as const,
                },
              ]
            : []),
          {
            id: 'roadmap',
            label: `개발 일정 ${s.product.roadmap.length}/${ROADMAP_MAX}`, // A-183: 만드는 순서 → 일정으로 관리
            icon: 'clock',
          },
          ...(showContract
            ? [
                {
                  id: 'contract' as const,
                  label: `외주${s.contracts?.active ? ' · 진행 중' : s.contracts?.offers.length ? ` ${s.contracts.offers.length}` : ''}`,
                  icon: 'case' as const,
                },
              ]
            : []),
          { id: 'log', label: '출시 기록', icon: 'check' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {msg && <div className="warn">{msg}</div>}
      {/* A-183 개발 사이클 띠: 마케팅·외주 탭 말고는 늘 위에 */}
      {tab !== 'marketing' && tab !== 'contract' && <CycleStrip s={s} v={v} onOpen={() => setTab('roadmap')} />}
      {tab === 'status' && (mvp ? <LiveStatus s={s} v={v} openSchedule={openSchedule} /> : <MvpStatus s={s} v={v} openSchedule={openSchedule} openHiring={openHiring} />)}
      {tab === 'features' && <Features s={s} v={v} />}
      {tab === 'marketing' && <Ads setMsg={setMsg} />}
      {tab === 'roadmap' && <Roadmap s={s} v={v} openSchedule={openSchedule} goFeatures={() => setTab('features')} />}
      {tab === 'contract' && <ContractsCard />}
      {tab === 'log' && <ShipLog s={s} />}
    </div>
  );
}

type View = ReturnType<typeof productView>;

// 누가 만드나(하루 작업량)
function Builders({ s, v, openSchedule }: { s: GameState; v: View; openSchedule?: () => void }) {
  const devCount = s.employees.filter((e) => e.dept === 'dev').length;
  const designCount = s.employees.filter((e) => e.dept === 'design').length;
  const nobody = v.rate.dev + v.rate.design <= 0;
  return (
    <div className="pd-who">
      <h3 className="wk-sect">누가 만드나</h3>
      <div className="pd-who-row">
        <span>대표(나)</span>
        <b>{v.rate.ceo > 0 ? `개발 ${v.rate.ceo.toFixed(2)}` : '안 함'}</b>
      </div>
      <div className="pd-who-row">
        <span>개발자 {devCount}명</span>
        <b>{v.rate.team > 0 ? `개발 ${v.rate.team.toFixed(1)}` : devCount ? '다른 일' : '-'}</b>
      </div>
      <div className="pd-who-row" title={designCount ? undefined : '디자이너가 없으면 개발하는 사람이 디자인도 절반 속도로 합니다.'}>
        <span>디자이너 {designCount}명</span>
        <b>{v.rate.design > 0 ? `디자인 ${v.rate.design.toFixed(1)}` : designCount ? '다른 일' : '-'}</b>
      </div>
      {nobody ? <div className="wk-alert">아무도 개발하지 않습니다</div> : null}
      {devCount > 0 && (
        <label className="pd-who-row">
          <span>개발팀이 하는 일</span>
          <select data-testid="dev-order" value={orderOf(s, 'dev')} onChange={(e) => act((g) => commandOrder(g, 'dev', e.target.value))}>
            {DATA.orders.orders
              .filter((o) => o.dept === 'dev')
              .map((o) => (
                <option key={o.id} value={o.id} disabled={s.company.stage < o.stage}>
                  {o.name}
                  {s.company.stage < o.stage ? ` (단계 ${o.stage})` : ''}
                </option>
              ))}
          </select>
        </label>
      )}
      {designCount > 0 && (
        <label className="pd-who-row">
          <span>디자인팀이 하는 일</span>
          <select data-testid="design-order" value={orderOf(s, 'design')} onChange={(e) => act((g) => commandOrder(g, 'design', e.target.value))}>
            {DATA.orders.orders
              .filter((o) => o.dept === 'design')
              .map((o) => (
                <option key={o.id} value={o.id} disabled={s.company.stage < o.stage}>
                  {o.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {openSchedule && (
        <button className="btn small ghost" data-testid="open-schedule" onClick={openSchedule}>
          대표 하루 일정 바꾸기
        </button>
      )}
    </div>
  );
}

// MVP 전 상태(A-171): 가운데 큰 D-day + 칸칸이 차는 진행 막대 → 핵심 기능 길(색 타일 + 흰 픽셀 표식) → 만드는 사람 줄
function MvpStatus({ s, v, openSchedule, openHiring }: { s: GameState; v: View; openSchedule?: () => void; openHiring?: () => void }) {
  const p = useTween(v.mvpProgress * 100);
  const missing = v.cores.filter((c) => featureLevel(s, c.id) < 1 && !s.product.roadmap.some((r) => r.id === c.id));
  const stalled = v.mvpEta !== null && !isFinite(v.mvpEta);
  // 개발자(B급) 1명을 더 뽑으면 MVP가 언제 나오나
  const coreIdx = s.product.roadmap.map((x, i) => (feature(x.id).cat === 'core' ? i : -1)).filter((i) => i >= 0);
  const withDev = coreIdx.length ? etaDays(s.product.roadmap, v.rate.dev + gradeOutput('B'), v.rate.design)[coreIdx[coreIdx.length - 1]] : null;
  const devCount = s.employees.filter((e) => e.dept === 'dev').length;
  const designCount = s.employees.filter((e) => e.dept === 'design').length;
  const maxRate = Math.max(0.5, v.rate.ceo, v.rate.team, v.rate.design);
  const fillCores = () => {
    act((g) => missing.forEach((c) => addToRoadmap(g, c.id)));
    play('click');
  };
  const people = [
    {
      key: 'me',
      av: '나',
      name: '대표',
      rate: v.rate.ceo,
      text: v.rate.ceo > 0 ? `하루 ${v.rate.ceo.toFixed(2)}` : '개발 안 함',
      empty: false,
      tip: undefined,
    },
    {
      key: 'dev',
      av: '개',
      name: `개발자 ${devCount}명`,
      rate: v.rate.team,
      text: v.rate.team > 0 ? `하루 ${v.rate.team.toFixed(1)}` : devCount ? '다른 일 중' : '없음',
      empty: !devCount,
      tip: undefined,
    },
    {
      key: 'design',
      av: '디',
      name: `디자이너 ${designCount}명`,
      rate: v.rate.design,
      text: v.rate.design > 0 ? `하루 ${v.rate.design.toFixed(1)}` : designCount ? '다른 일 중' : '없음',
      empty: !designCount,
      tip: designCount ? undefined : '디자이너가 없으면 개발하는 사람이 디자인도 절반 속도로 합니다.',
    },
  ];
  return (
    <div className="wk-mvp">
      <section className={`wk-hero ${stalled || missing.length ? 'bad' : ''}`} data-testid="product-status">
        <span className="wk-kicker">MVP 출시까지</span>
        <h2 className="wk-count">{missing.length ? '준비 필요' : stalled ? '멈춤' : v.mvpEta !== null ? `D-${Math.max(0, v.mvpEta)}` : '-'}</h2>
        <p className="wk-sub" title={!missing.length && !stalled && v.mvpEta !== null ? '핵심 기능을 다 만들면 자동으로 국내에 출시됩니다.' : undefined}>
          {missing.length ? `핵심 기능 ${missing.length}개가 만드는 순서에 없습니다` : stalled ? '아무도 개발하지 않습니다' : v.mvpEta !== null ? `${formatDate(s.day + v.mvpEta)} 출시 예정` : ''}
        </p>
        <div className="wk-prog">
          <div className="ms-bar">
            <div style={{ width: `${p}%` }} />
          </div>
          <b>{Math.round(p)}%</b>
        </div>
      </section>
      <ol className="wk-path">
        {v.cores.map((c, i) => {
          const done = featureLevel(s, c.id) >= 1;
          const qi = s.product.roadmap.findIndex((x) => x.id === c.id);
          const it = qi >= 0 ? s.product.roadmap[qi] : null;
          const need = it ? itemNeed(it) : null;
          const pct = it && need ? ((it.devDone + it.designDone) / (need.dev + need.design)) * 100 : 0;
          const state = done ? 'done' : qi === 0 ? 'now' : it ? 'wait' : 'missing';
          return (
            <li key={c.id} className={`wk-node ${state}`}>
              <span className="wk-dot">{done ? <PixelCheck /> : state === 'now' ? <PixelFlag /> : state === 'missing' ? '+' : i + 1}</span>
              <b>{c.name}</b>
              <span>{done ? '완료' : state === 'now' ? `만드는 중 ${Math.round(pct)}%` : it ? `${dayText(v.etas[qi])} 뒤` : '순서에 없음'}</span>
            </li>
          );
        })}
        <li className="wk-node goal">
          <span className="wk-dot">
            <PxIcon id="star" size={20} />
          </span>
          <b>국내 출시</b>
          <span>고객·매출 시작</span>
        </li>
      </ol>
      {missing.length > 0 && (
        <button className="btn mvp-fix" data-testid="fill-cores" onClick={fillCores}>
          핵심 기능 {missing.length}개 모두 만드는 순서에 넣기
        </button>
      )}
      <section className="wk-team">
        <h3 className="wk-sect">만드는 사람</h3>
        {people.map((x) => (
          <div key={x.key} className={`wk-person ${x.empty ? 'empty' : ''}`} title={x.tip}>
            <span className={`wk-av ${x.key}`}>{x.av}</span>
            <b>{x.name}</b>
            <span className={`ms-bar ${x.key === 'design' ? 'design' : ''}`}>
              <div style={{ width: `${(x.rate / maxRate) * 100}%` }} />
            </span>
            <em>{x.text}</em>
          </div>
        ))}
        {withDev !== null && v.mvpEta !== null && isFinite(withDev) && (!isFinite(v.mvpEta) || withDev < v.mvpEta) && (
          <p className="wk-tip">
            개발자 1명을 뽑으면 출시가 <b>D-{withDev}</b>로 당겨집니다
            {isFinite(v.mvpEta) ? ` (${v.mvpEta - withDev}일 빨라짐)` : ''}.
          </p>
        )}
        <div className="wk-btns">
          {openHiring && (
            <button className="btn small" onClick={openHiring}>
              개발자 뽑기
            </button>
          )}
          {openSchedule && (
            <button className="btn small ghost" data-testid="open-schedule" onClick={openSchedule}>
              대표 일정 바꾸기
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

// 반원 계기판(품질). 화면(A-179): 칸칸이 끊긴 호(.wk .pd-gauge), 색은 토큰
function Gauge({ value, label }: { value: number; label: string }) {
  const t = useTween(value);
  const a = Math.PI * (1 - Math.max(0, Math.min(100, t)) / 100);
  const x = 60 + 48 * Math.cos(a);
  const y = 60 - 48 * Math.sin(a);
  const color = t >= 75 ? 'var(--positive)' : t >= 50 ? 'var(--caution)' : 'var(--negative)';
  return (
    <svg viewBox="0 0 120 70" className="pd-gauge" aria-label={`${label} ${Math.round(t)}%`}>
      <path d="M12 60 A48 48 0 0 1 108 60" fill="none" stroke="var(--surface-tile)" strokeWidth="12" />
      <path d={`M12 60 A48 48 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`} fill="none" stroke={color} strokeWidth="12" />
      <text x="60" y="56" textAnchor="middle" className="pd-gauge-num">
        {Math.round(t)}%
      </text>
    </svg>
  );
}

// 출시 후 상태 = 대시보드(A-158, Startup Company 제품 창 Stats 탭 짜임). 받쳐 주는 고객 수(SC의 잠재 사용자)는 규모 사다리와 말로만
// 화면(A-179): MVP 전 화면(A-171)과 같은 톤 — 가운데 큰 사용자 수 + 규모 사다리 → 납작한 회색 요약 칸(매출·가치·매력도·광고비) → 돈 버는 법·품질 카드 둘
// → 그래프 둘 → 고객이 들고 나는 길 → 시장별 → 지금 만드는 기능(강조 카드) + 누가 만드나. 긴 설명은 title로
function LiveStatus({ s, v, openSchedule }: { s: GameState; v: View; openSchedule?: () => void }) {
  const d = s.product.daily ?? [];
  const last = d[d.length - 1];
  const prev = d[d.length - 2];
  const users = useTween(liveUsers(s));
  const delta = last && prev ? last.users - prev.users : 0;
  const cur = s.product.roadmap[0];
  const curF = cur ? feature(cur.id) : null;
  const need = cur ? itemNeed(cur) : null;
  const ind = industry(s.company.industry);
  const w = unitWord(s);
  const f = flowAll(s);
  const newToday = f ? f.inbound + f.viral + f.sales + f.paid : 0;
  const ads = launchedMarkets(s).reduce((a, m) => a + s.markets[m].adBudget, 0);
  const months = s.plHistory.filter((m) => m.usersEnd > 0).slice(-24);
  const monthly = months.length >= 3;
  const big = (x: number) => (Math.abs(x) >= 1e4 ? countShort(x) : num(x));
  const q = quality(s);
  const curPct = cur && need ? ((cur.devDone + cur.designDone) / (need.dev + need.design)) * 100 : 0;
  return (
    <div className="pl" data-testid="product-status">
      <section className="pl-hero">
        <span className="wk-kicker">
          <span className="pd-live" /> 지금 {ind.unit}
        </span>
        <h2 className="wk-count" title={`${num(users)}${w}`}>
          {countShort(users)}
          <small>{w}</small>
        </h2>
        <p className="wk-sub">
          어제보다{' '}
          <b className={delta < 0 ? 'neg' : 'pos'}>
            {delta >= 0 ? '+' : ''}
            {big(delta)}
          </b>
          <span className="pl-dot">·</span>오늘 새로 온 {ind.unit} <b>{big(newToday)}</b>
        </p>
        <div className="pl-scale">
          <ScaleLadder s={s} />
          <RoomNote s={s} />
        </div>
      </section>
      <div className="wk-stats pl-stats">
        <div className="wk-stat pl-rev">
          <span>어제 매출</span>
          <b>{wonShort(last?.rev ?? 0)}</b>
          <em>한 달이면 약 {wonCompact((last?.rev ?? 0) * 30)}</em>
        </div>
        <div className="wk-stat">
          <span>회사 가치</span>
          <b>{wonCompact(computeValuation(s).value)}</b>
        </div>
        <div className="wk-stat">
          <span>매력도</span>
          <b>{appeal(s).toFixed(1)}</b>
        </div>
        <div className="wk-stat">
          <span>한 달 광고비</span>
          <b>{wonShort(ads)}</b>
        </div>
      </div>
      <div className="pl-two">
        <section className="pl-card">
          <h3 className="pl-head">돈 버는 법</h3>
          <MoneyNote s={s} />
          <div className="pl-price" title="싸게 팔면 고객이 많이 오고, 비싸게 팔면 고객당 매출이 큽니다.">
            <span className="pl-lab">가격</span>
            <div className="seg">
              {(['low', 'standard', 'premium'] as PriceTier[]).map((t) => (
                <button key={t} className={s.product.priceTier === t ? 'on' : ''} data-testid={`price-${t}`} title={priceTierDef(t).desc} onClick={() => act((g) => (g.product.priceTier = t))}>
                  {priceTierDef(t).name}
                </button>
              ))}
            </div>
          </div>
        </section>
        <section className="pl-card">
          <h3 className="pl-head" title="버그가 적을수록 높습니다. 새 기능을 만들 때마다 버그가 생기고, 품질이 낮으면 고객이 떠나고 장애가 납니다. 개발팀에 '안정화·버그 수정'을 맡기면 오릅니다.">
            품질
          </h3>
          <div className="pd-qrow">
            <Gauge value={q} label="품질" />
            <Stability q={q} />
          </div>
          <div className="pl-rows">
            <div className="pd-kv" title="급하게(야근) 만든 코드가 쌓인 정도입니다. 높을수록 새 기능에 버그가 더 생깁니다. '기술 부채 정리'로 줄입니다.">
              <span>기술 부채</span>
              <b>{Math.round(s.product.debt * 100)}%</b>
            </div>
            <div className="pd-kv" title="디자인팀이 'UX 다듬기'를 하면 오르고 매력도에 곱해집니다. 새 기능을 낼 때마다 조금씩 내려갑니다.">
              <span>UX 완성도</span>
              <b>+{Math.round(s.product.polish * 100)}%</b>
            </div>
            <div className="pd-kv">
              <span>지금까지 장애</span>
              <b className={s.stats.outages ? 'neg' : ''}>{s.stats.outages}번</b>
            </div>
          </div>
        </section>
      </div>
      <div className="pl-two">
        <section className="pl-card">
          <h3 className="pl-head">
            {ind.unit}
            <em>{monthly ? '월말' : `최근 ${d.length}일`}</em>
          </h3>
          {monthly ? (
            <AxisChart points={months.map((m) => m.usersEnd)} from={formatMonth(months[0].month)} to={formatMonth(months[months.length - 1].month)} fmt={(x) => countShort(x)} />
          ) : (
            <AxisChart points={d.map((x) => x.users)} from={d.length ? formatDate(d[0].day) : ''} to={d.length ? formatDate(d[d.length - 1].day) : ''} fmt={(x) => countShort(x)} />
          )}
        </section>
        <section className="pl-card">
          <h3 className="pl-head">
            하루 매출<em>최근 {d.length}일</em>
          </h3>
          <AxisChart points={d.map((x) => x.rev)} from={d.length ? formatDate(d[0].day) : ''} to={d.length ? formatDate(d[d.length - 1].day) : ''} fmt={(x) => wonCompact(x)} />
        </section>
      </div>
      <Inflow s={s} />
      <MarketUsers s={s} />
      <div className="pl-build">
        <section className={`pl-card pl-now ${cur ? '' : 'empty'}`}>
          <span className="wk-kicker">지금 만드는 기능</span>
          {cur && curF && need ? (
            <>
              <div className="pl-now-head">
                <span className="pl-tile">
                  <PixelFlag />
                </span>
                <b title={curF.desc}>{itemName(cur)}</b>
                <span className="pl-chip">{isFinite(v.etas[0]) ? `${dayText(v.etas[0])} 뒤 출시` : '멈춤'}</span>
              </div>
              <div className="pl-now-prog">
                <div className="pbar" title={`개발 ${Math.floor(cur.devDone)}/${need.dev} · 디자인 ${Math.floor(cur.designDone)}/${need.design}`}>
                  <div className="dev" style={{ width: `${(cur.devDone / (need.dev + need.design)) * 100}%` }} />
                  <div className="design" style={{ width: `${(cur.designDone / (need.dev + need.design)) * 100}%` }} />
                </div>
                <b>{Math.round(curPct)}%</b>
              </div>
            </>
          ) : (
            <div className="wk-empty small">
              <PxIcon id="box" size={20} />
              만들 기능이 없습니다. 기능 탭에서 다음 기능을 고르세요.
            </div>
          )}
        </section>
        <Builders s={s} v={v} openSchedule={openSchedule} />
      </div>
    </div>
  );
}

// 안정 · 불안정 · 위험 세로 막대(SC 호스팅 탭의 응답 시간 막대처럼). 품질로 화살표 위치
function Stability({ q }: { q: number }) {
  const state = q >= 75 ? 'ok' : q >= 50 ? 'mid' : 'bad';
  return (
    <div className="pd-stab" title="품질이 낮을수록 장애가 잦고 고객이 떠납니다">
      <div className="pd-stab-bar">
        <i style={{ bottom: `${Math.max(2, Math.min(98, q))}%` }} />
      </div>
      <div className="pd-stab-lab">
        <span className={state === 'bad' ? 'st-bad' : ''}>위험</span>
        <span className={state === 'mid' ? 'st-mid' : ''}>불안정</span>
        <span className={state === 'ok' ? 'st-ok' : ''}>안정</span>
      </div>
    </div>
  );
}

// 고객 흐름(모든 시장, 최근 2주를 한 달로 환산): 들어오는 길 · 떠나는 이유(A-158)
function Inflow({ s }: { s: GameState }) {
  const f = flowAll(s);
  const ind = industry(s.company.industry);
  const ads = launchedMarkets(s).reduce((a, m) => a + s.markets[m].adBudget, 0);
  return (
    <section className="pl-card" data-testid="inflow">
      <h3 className="pl-head" title="최근 2주 평균을 한 달로 바꾼 값입니다. 홍보를 하지 않으면 출시 날 들어온 대표의 지인 말고는 거의 들어오지 않습니다. 떠나는 이유는 매달 초 고객 리포트(메신저)로도 받습니다.">
        {ind.unit}
        {josa(ind.unit, '이')} 들고 나는 길<em>한 달 환산</em>
      </h3>
      {f ? <FlowBars flow={f} unit={ind.unit} /> : <div className="wk-empty small">하루가 지나면 쌓입니다.</div>}
      <div className="pl-tags">
        <span>국내 인지도 {(s.markets.kr.awareness * 100).toFixed(2)}%</span>
        <span>광고 예산 월 {wonShort(ads)}</span>
      </div>
    </section>
  );
}

// 시장별 우리 사용자(진출한 시장이 둘 이상일 때)
function MarketUsers({ s }: { s: GameState }) {
  const ms = launchedMarkets(s);
  if (ms.length < 2) return null;
  const total = Math.max(1, totalUsers(s));
  return (
    <section className="pl-card">
      <h3 className="pl-head">시장별 {industry(s.company.industry).unit}</h3>
      <div className="cf-list">
        {[...ms]
          .sort((a, b) => s.markets[b].users - s.markets[a].users)
          .map((m) => (
            <div key={m} className="cf-row cf-mkt">
              <span>
                <span className="mk-flag">{DATA.markets.markets.find((x) => x.id === m)!.flag}</span> {DATA.markets.markets.find((x) => x.id === m)!.name}
              </span>
              <span className="cf-bar">
                <i style={{ width: `${(s.markets[m].users / total) * 100}%` }} />
              </span>
              <b>{countShort(s.markets[m].users)}</b>
            </div>
          ))}
      </div>
    </section>
  );
}

// 기능 그림(카테고리별 앱 화면 미리보기, assets/features/*.png)
const FEAT_ART = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../../assets/features/*.png', {
      eager: true,
      import: 'default',
    }),
  ).map(([path, url]) => [path.split('/').pop()!.replace('.png', ''), url]),
);

// 기능 탭(Startup Company식): 위 요약(사용자·매력도 구성 / 다음 출시·작업량·기능 수) + 제품이 받쳐 주는 고객(A-196) + 기능 카드 줄(그림·레벨·레벨업·버전)
function Features({ s, v }: { s: GameState; v: View }) {
  const all = featuresOf(s.company.industry);
  const [msg, setMsg] = useState<string | null>(null);
  const [showLocked, setShowLocked] = useState(false);
  const ind = industry(s.company.industry);
  const bd = appealBreakdown(s);
  const alive = s.competitors.filter((c) => c.alive);
  const compAvg = alive.length ? alive.reduce((a, c) => a + c.appeal, 0) / alive.length : 0;
  const queuedOf = (f: FeatureDef) => s.product.roadmap.filter((r) => r.id === f.id && !r.grow).length;
  const mine = all.filter((f) => featureLevel(s, f.id) > 0 || queuedOf(f) > 0);
  const can = all.filter((f) => !mine.includes(f) && !featureLock(s, f));
  const locked = all.filter((f) => !mine.includes(f) && featureLock(s, f));
  const builtCount = Object.keys(s.product.features).length;
  const cap = growCap(s);
  const featPts = bd.parts.reduce((a, x) => a + x.pts, 0) + bd.bonus;
  const pctOf = (x: number) => (featPts > 0 ? `${Math.round((x / featPts) * 100)}%` : '-');
  const signed = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`;
  const face = !hasMvp(s) ? 'empty' : bd.total >= compAvg ? 'star' : bd.total >= compAvg * 0.7 ? 'check' : 'warn';

  const add = (f: FeatureDef) => {
    const err = act((g) => addToRoadmap(g, f.id));
    setMsg(err ?? null);
    if (!err) play('click');
  };
  const grow = (f: FeatureDef) => {
    const err = act((g) => addGrow(g, f.id));
    setMsg(err ?? null);
    if (!err) play('click');
  };

  const card = (f: FeatureDef) => {
    const lv = featureLevel(s, f.id);
    const q = queuedOf(f);
    const lock = featureLock(s, f);
    const next = Math.min(f.levels, lv + q + 1);
    const days = etaDays([{ id: f.id, level: next, devDone: 0, designDone: 0 }], v.rate.dev, v.rate.design)[0];
    const cost = insightCost(f, next);
    const costName = cost.kind === 'pay' ? '지불 의사' : '인사이트';
    const qi = s.product.roadmap.findIndex((r) => r.id === f.id);
    const art = FEAT_ART[f.cat];
    const nowIt = qi === 0 ? s.product.roadmap[0] : null;
    const nowNeed = nowIt ? itemNeed(nowIt) : null;
    const nowPct = nowIt && nowNeed ? ((nowIt.devDone + nowIt.designDone) / (nowNeed.dev + nowNeed.design)) * 100 : 0;
    // A-196 기능 레벨: 만든 기능만. 지금 레벨 / 일정에 잡힌 목표 / 회사 단계 상한
    const gl = growLevel(s, f.id);
    const gt = growTarget(s, f.id);
    const gp = lv > 0 ? growPlan(s, f.id) : null;
    const growDays = gp && !gp.block ? etaDays([{ id: f.id, level: 0, grow: { from: gp.from, to: gp.to }, devDone: 0, designDone: 0 }], v.rate.dev, v.rate.design)[0] : 0;
    const nextVer = !lock && lv > 0 && f.levels > lv + q;
    return (
      <div key={f.id} className={`fc ${lv > 0 ? 'own' : ''} ${qi === 0 ? 'now' : q > 0 ? 'queued' : ''} ${lock && !lv && !q ? 'locked' : ''}`} data-testid={`feat-${f.id}`}>
        <div className="fc-art">{art ? <img src={art} alt="" draggable={false} /> : <span className={`cat ${f.cat}`}>{CAT_NAME[f.cat]}</span>}</div>
        <div className="fc-body">
          <div className="fc-top">
            <b className="fc-name">{f.name}</b>
            {lv > 0 && (
              <span className="fc-lv" data-testid={`feat-lv-${f.id}`} title={`기능 레벨 ${gl} / 지금 상한 ${cap}`}>
                Lv {gl}
              </span>
            )}
            {q > 0 && <span className="fc-q">{qi === 0 ? '만드는 중' : `순서 ${qi + 1}번`}</span>}
          </div>
          {lv > 0 && (
            <span className="fc-gline" title={`기능 레벨 ${gl} / 지금 상한 ${cap}(회사 단계가 오르면 커짐)${gt > gl ? ` · Lv ${gt}까지 개발 일정에 있음` : ''}`}>
              <span className="fc-gbar">
                <i className="q" style={{ width: `${Math.min(100, (gt / cap) * 100)}%` }} />
                <i style={{ width: `${Math.min(100, (gl / cap) * 100)}%` }} />
              </span>
              <em>
                {gl}/{cap}
              </em>
            </span>
          )}
          {f.levels > 1 && (
            <span className="pd-dots" title={`버전 ${lv}/${f.levels}: 새 버전은 기능에 새 내용이 붙습니다`}>
              {Array.from({ length: f.levels }, (_, i) => (
                <i key={i} className={i < lv ? 'on' : i < lv + q ? 'q' : ''} />
              ))}
            </span>
          )}
          <div className="fc-fx">{f.desc}</div>
          {qi === 0 && (
            <div className="fc-prog">
              <span className="ms-bar">
                <div style={{ width: `${nowPct}%` }} />
              </span>
              <b>{Math.round(nowPct)}%</b>
            </div>
          )}
        </div>
        {gp ? (
          <div className="fc-foot">
            <span className="tiny muted grow" data-testid={`feat-grow-note-${f.id}`}>
              {gp.block ?? `Lv ${gp.to}까지 ${dayText(growDays)}${gp.insight > 0 ? ` · 인사이트 ${num(gp.insight)}` : ''}`}
            </span>
            {nextVer && (
              <button className="btn small ghost" title={`버전 ${lv + q + 1}: 기능에 새 내용이 붙습니다. ${dayText(days)}${cost.n > 0 ? ` · ${costName} ${num(cost.n)}` : ''}`} onClick={() => add(f)}>
                v{lv + q + 1}
              </button>
            )}
            {!gp.block && (
              <button className="btn small" data-testid={`feat-grow-${f.id}`} onClick={() => grow(f)}>
                레벨업
              </button>
            )}
          </div>
        ) : (
          !(lock && q > 0) && (
            <div className="fc-foot">
              {lock ? (
                <span className="tiny muted" data-testid={`feat-lock-${f.id}`}>
                  {lv + q >= f.levels ? (f.levels > 1 ? '최고 버전까지 순서에 있음' : '만드는 순서에 있음') : cost.n > insightHave(s, cost.kind) && lock.endsWith('부족') ? `${costName} ${num(cost.n)} 필요 · 지금 ${num(insightHave(s, cost.kind))}` : lock}
                </span>
              ) : (
                <>
                  <span className="tiny muted grow">
                    {dayText(days)}
                    {cost.n > 0 && ` · ${costName} ${num(cost.n)}`}
                  </span>
                  <button className="btn small" onClick={() => add(f)}>
                    {lv + q === 0 ? '만들기' : `v${next}`}
                  </button>
                </>
              )}
            </div>
          )
        )}
      </div>
    );
  };

  // 분류별 묶음: 머리(분류 · 하는 일 · 개수) + 카드 줄
  const groups = (list: FeatureDef[]) =>
    CAT_ORDER.filter((c) => list.some((f) => f.cat === c)).map((c) => {
      const fs = list.filter((f) => f.cat === c);
      return (
        <div key={c} className="fc-group">
          <div className="fc-group-head" title={CAT_ROLE[c]}>
            <span className={`cat ${c}`}>{CAT_NAME[c]}</span>
            <b>{fs.length}개</b>
          </div>
          <div className="fc-row">{fs.map(card)}</div>
        </div>
      );
    });

  return (
    <div className="col">
      <div className="wk-stats">
        <div className="wk-stat">
          <span>지금 {ind.unit}</span>
          <b title={num(liveUsers(s))}>{liveUsers(s) >= 1e5 ? countShort(liveUsers(s)) : num(liveUsers(s))}</b>
        </div>
        <div className="wk-stat fs-appeal" tabIndex={0}>
          <span>매력도</span>
          <b className="row" style={{ gap: 6 }}>
            {face !== 'empty' && <PxIcon id={face} size={16} />}
            {hasMvp(s) ? bd.total.toFixed(1) : '출시 전'}
          </b>
          <div className="fs-pop" data-testid="appeal-breakdown">
            <div className="fs-pop-title">매력도는 어디서 오나</div>
            {bd.parts.length === 0 && <div className="tiny muted">아직 만든 기능이 없습니다.</div>}
            {bd.parts.map((x) => (
              <div key={x.id} className="pd-kv">
                <span>{x.name}</span>
                <b>{pctOf(x.pts)}</b>
              </div>
            ))}
            {bd.bonus !== 0 && (
              <div className="pd-kv">
                <span>사건·평판</span>
                <b>{pctOf(bd.bonus)}</b>
              </div>
            )}
            <div className="pd-kv">
              <span>UX 완성도</span>
              <b className="pos">{signed(bd.polish)}</b>
            </div>
            <div className="pd-kv">
              <span>버그(품질 {quality(s)}점)</span>
              <b className={bd.quality < 1 ? 'neg' : ''}>{signed(bd.quality - 1)}</b>
            </div>
            {bd.complexity < 1 && (
              <div className="pd-kv">
                <span>기능이 너무 많아 복잡함</span>
                <b className="neg">{signed(bd.complexity - 1)}</b>
              </div>
            )}
            {bd.other !== 0 && (
              <div className="pd-kv">
                <span>기간 효과</span>
                <b className={bd.other < 0 ? 'neg' : 'pos'}>{signed(bd.other)}</b>
              </div>
            )}
            <div className="pd-kv fs-sum">
              <span>합계</span>
              <b>{bd.total.toFixed(1)}</b>
            </div>
          </div>
        </div>
        <div className="wk-stat">
          <span>다음 기능 출시까지</span>
          <b>{s.product.roadmap.length ? dayText(v.etas[0]) : '-'}</b>
        </div>
        <div className="wk-stat" title="하루 작업량(개발 / 디자인)">
          <span>하루 작업량</span>
          <b>
            {v.rate.dev.toFixed(2)} / {v.rate.design.toFixed(1)}
          </b>
        </div>
        <div className="wk-stat" data-testid="insight" title="고객 인사이트 · 지불 의사">
          <span>인사이트 · 지불 의사</span>
          <b>
            {num(insightHave(s, 'insight'))} · {num(insightHave(s, 'pay'))}
          </b>
        </div>
        {v.rate.upkeep >= 0.05 && (
          <div className="wk-stat">
            <span>유지보수로 빠지는 개발</span>
            <b className="neg">{Math.round(v.rate.upkeep * 100)}%</b>
          </div>
        )}
        <div className="wk-stat" data-testid="grow-cap" title="기능 레벨을 올릴 수 있는 한계입니다. 회사 단계가 오르면 커집니다(MVP·팀 Lv 100, 조직 Lv 200, 스케일업부터 Lv 600).">
          <span>만든 기능 · 레벨 상한</span>
          <b>
            {builtCount}개 · Lv {cap}
          </b>
        </div>
      </div>
      {hasMvp(s) && (
        <div className="fs-cats" data-testid="feature-cats">
          {CAT_ORDER.filter((c) => all.some((f) => f.cat === c)).map((c) => {
            const n = all.filter((f) => f.cat === c && featureLevel(s, f.id) > 0).length;
            return (
              <span key={c} className={`fs-cat ${n ? 'on' : ''}`} title={CAT_ROLE[c]}>
                <span className={`cat ${c}`}>{CAT_NAME[c]}</span>
                <b>{n}</b>/{all.filter((f) => f.cat === c).length}
              </span>
            );
          })}
        </div>
      )}
      {hasMvp(s) && <RoomNote s={s} />}
      {msg && <div className="warn">{msg}</div>}
      <h3 className="wk-sect">
        우리 제품 기능 <em>{mine.length}</em>
      </h3>
      {mine.length ? groups(mine) : <div className="wk-empty small">아직 없습니다</div>}
      <h3 className="wk-sect">
        새로 만들 수 있는 기능 <em>{can.length}</em>
      </h3>
      {can.length ? groups(can) : <div className="wk-empty small">지금 더 만들 수 있는 기능이 없습니다</div>}
      {locked.length > 0 && (
        <button className="wk-fold" onClick={() => setShowLocked((x) => !x)}>
          {showLocked ? '나중에 열리는 기능 접기' : `나중에 열리는 기능 ${locked.length}개 보기`}
        </button>
      )}
      {showLocked && <div className="fc-row">{locked.map(card)}</div>}
    </div>
  );
}

// A-183 개발 일정: 끝나는 날로 주 단위 묶음(이번 주·다음 주·2주 뒤·3~4주 뒤·그 뒤·멈춤)
const shortDate = (day: number) => formatDate(day).slice(5).replace('.', '/');

function sprintOf(s: GameState, to: number | null): { key: string; name: string; range: string } {
  if (to === null) return { key: 'stall', name: '멈춤', range: '만드는 사람이 없어 끝나지 않습니다' };
  const w0 = weekStartOf(s.day);
  const w = Math.floor((to - w0) / 7);
  const range = (a: number, b: number) => `${shortDate(w0 + a * 7)} ~ ${shortDate(w0 + b * 7 + 6)}`;
  if (w <= 0) return { key: 'w0', name: '이번 주 출시', range: range(0, 0) };
  if (w === 1) return { key: 'w1', name: '다음 주 출시', range: range(1, 1) };
  if (w === 2) return { key: 'w2', name: '2주 뒤', range: range(2, 2) };
  if (w <= 4) return { key: 'w4', name: '3~4주 뒤', range: range(3, 4) };
  if (w <= 8) return { key: 'w8', name: '두 달 안', range: range(5, 8) };
  return { key: 'later', name: '그 뒤', range: `${shortDate(w0 + 63)}부터` };
}

// 개발 일정 맨 위 요약: 이번 주 출시 수 · 다음 출시 · 약속 기한 여유
function SprintSummary({ s, v }: { s: GameState; v: View }) {
  const spans = itemSpans(s, v.etas);
  const w0 = weekStartOf(s.day);
  const thisWeek = spans.filter((x) => x.to !== null && x.to < w0 + 7).length;
  const last = spans[spans.length - 1]?.to ?? null;
  const promises = s.milestones?.list.filter((m) => m.status === 'active' && m.needs && m.deadline !== undefined) ?? [];
  const worst = promises.map((m) => ({ m, f: forecast(s, m) })).sort((a, b) => a.f.daysLeft - a.f.mid - (b.f.daysLeft - b.f.mid))[0];
  return (
    <div className="rm-summary" data-testid="sprint-summary">
      <div>
        <span>이번 주 출시</span>
        <b>{thisWeek}개</b>
      </div>
      <div>
        <span>순서를 다 끝내는 날</span>
        <b>{last === null ? '멈춤' : shortDate(last)}</b>
      </div>
      <div>
        <span>약속 기한 여유</span>
        <b className={worst ? (worst.f.risk === 'late' ? 'fin-bad' : worst.f.risk === 'tight' ? '' : 'fin-good') : 'muted'}>
          {worst ? (isFinite(worst.f.mid) ? `${worst.f.daysLeft - worst.f.mid >= 0 ? '' : '−'}${Math.abs(worst.f.daysLeft - worst.f.mid)}일 · ${worst.m.from}` : `멈춤 · ${worst.m.from}`) : '약속 없음'}
        </b>
      </div>
    </div>
  );
}

export function Roadmap({ s, v, openSchedule, goFeatures }: { s: GameState; v: View; openSchedule?: () => void; goFeatures: () => void }) {
  const spans = itemSpans(s, v.etas);
  return (
    <div className="wk-road">
      <div className="col grow">
        {s.product.roadmap.length === 0 && (
          <div className="wk-empty">
            <PxIcon id="box" size={32} />
            <b>만들 기능이 없습니다</b>
            <button className="btn small" onClick={goFeatures}>
              기능 고르기
            </button>
          </div>
        )}
        {s.product.roadmap.length > 0 && <SprintSummary s={s} v={v} />}
        {s.product.roadmap.map((it, i) => {
          const f = feature(it.id);
          const need = itemNeed(it);
          const tot = need.dev + need.design;
          // A-183 주 단위 묶음: 끝나는 주가 바뀌는 곳에 묶음 머리
          const span = spans[i];
          const sprint = sprintOf(s, span.to);
          const head = i === 0 || sprintOf(s, spans[i - 1].to).key !== sprint.key;
          return (
            <Fragment key={`${it.id}-${it.level}`}>
            {head && (
              <div className={`rm-sprint ${sprint.key}`}>
                <b>{sprint.name}</b>
                <span>{sprint.range}</span>
              </div>
            )}
            <div className={`rm-item ${i === 0 ? 'first' : ''}`} data-testid={`roadmap-${i}`}>
              <div className="row">
                <span className="pd-order">{i + 1}</span>
                <span className={`cat ${f.cat}`}>{CAT_NAME[f.cat]}</span>
                <b className="grow">{itemName(it)}</b>
                {(() => {
                  // 약속(A-177): 이 기능을 조건으로 쥔 약속과 기한. 기한보다 늦게 끝나면 빨강
                  const pm = promiseFor(s, it.id, it.level);
                  if (!pm) return null;
                  const late = !isFinite(v.etas[i]) || s.day + v.etas[i] > pm.deadline!;
                  return (
                    <span className={`chip ${late ? 'red' : 'blue'}`} data-testid={`roadmap-promise-${i}`} title={`${pm.from}와 약속한 기능입니다. 빼거나 뒤로 미루면 약속을 지키기 어렵습니다.`}>
                      약속 · {formatDate(pm.deadline!).slice(5)}까지
                    </span>
                  );
                })()}
                {/* A-183 숨은 일(A-181): 점검으로 찾음 / 늦게 드러남 / 약속 기능인데 아직 점검 전 */}
                {it.found === 'review' && <span className="chip amber" title="점검 회의에서 찾은 숨은 일이 더해졌습니다">점검으로 찾은 일 +</span>}
                {it.found === 'late' && <span className="chip red" title="마무리 무렵에야 드러난 숨은 일이 더해졌습니다">늦게 드러난 일 +</span>}
                {!it.found && promiseFor(s, it.id, it.level) && !promiseFor(s, it.id, it.level)!.checked && <span className="chip" title="약속 기능은 숨은 일이 있을 수 있습니다. 점검 회의에서 확인합니다">점검 전</span>}
                <button className="btn small ghost" disabled={i === 0} onClick={() => act((g) => moveRoadmap(g, i, -1))}>
                  ▲
                </button>
                <button className="btn small ghost" disabled={i === s.product.roadmap.length - 1} onClick={() => act((g) => moveRoadmap(g, i, 1))}>
                  ▼
                </button>
                <button className="btn small ghost" data-testid={`roadmap-remove-${i}`} onClick={() => act((g) => removeFromRoadmap(g, i))}>
                  ✕
                </button>
              </div>
              <div className="pbar" title={`개발 ${Math.floor(it.devDone)}/${need.dev} · 디자인 ${Math.floor(it.designDone)}/${need.design}`}>
                <div className="dev" style={{ width: `${(it.devDone / tot) * 100}%` }} />
                <div className="design" style={{ width: `${(it.designDone / tot) * 100}%` }} />
              </div>
              <div className="row tiny">
                <span className="muted grow">
                  {i === 0 ? '만드는 중' : '대기'} · {Math.round(((it.devDone + it.designDone) / tot) * 100)}%
                </span>
                <span className="rm-dates" title={isFinite(v.etas[i]) ? `${dayText(v.etas[i])} 뒤 출시 (${formatDate(s.day + v.etas[i])})` : '만드는 사람이 없어 멈춤'}>
                  {isFinite(span.from) ? shortDate(span.from) : '-'} → <b>{span.to === null ? '멈춤' : shortDate(span.to)}</b>
                  {span.to !== null && isFinite(span.from) ? ` · ${Math.max(1, span.to - Math.max(s.day, span.from))}일` : ''}
                </span>
              </div>
            </div>
            </Fragment>
          );
        })}
        <Help text="맨 위 기능부터 하나씩 만듭니다. 끝나는 주로 묶어 보여 줍니다. ▲▼로 순서를 바꾸면 날짜가 바로 바뀝니다. 약속한 기능은 기한 칩이 붙고, 기한보다 늦게 끝나면 빨강입니다. 파란 막대는 개발, 보라 막대는 디자인 진행입니다." />
      </div>
      <Builders s={s} v={v} openSchedule={openSchedule} />
    </div>
  );
}

// 출시 기록. 화면(A-179): 표 → 가운데 큰 개수 + 판정 칩 요약 + 납작한 줄(판정 색 타일 · 이름 · 날짜 · 판정 칩)
function ShipLog({ s }: { s: GameState }) {
  if (s.product.shipped.length === 0)
    return (
      <div className="wk-empty">
        <PxIcon id="box" size={32} />
        <b>아직 출시한 기능이 없습니다</b>
      </div>
    );
  const list = s.product.shipped;
  const full = list.filter((x) => x.result === 'full').length;
  const partial = list.filter((x) => x.result === 'partial').length;
  return (
    <div className="pl pl-log">
      <section className="pl-hero">
        <span className="wk-kicker">출시 기록</span>
        <h2 className="wk-count">
          {list.length}
          <small>번</small>
        </h2>
        <div className="pl-tags">
          <span className="ok">완전 수행 {full}</span>
          <span className="mid">부분 수행 {partial}</span>
          <span className="bad">버그 많음 {list.length - full - partial}</span>
        </div>
      </section>
      <ol className="pl-ships">
        {[...list].reverse().map((x, i) => {
          const f = feature(x.id);
          const st = x.result === 'full' ? 'ok' : x.result === 'partial' ? 'mid' : 'bad';
          return (
            <li key={i} className={`pl-ship ${st}`}>
              <span className="pl-tile">{st === 'ok' ? <PixelCheck /> : <PxIcon id={st === 'mid' ? 'warn' : 'siren'} size={18} />}</span>
              <b>
                {f.name}
                {f.levels > 1 ? ` v${x.level}` : ''}
              </b>
              <time>{formatDate(x.day)}</time>
              {x.result === 'full' ? <span className="chip green">완전 수행</span> : x.result === 'partial' ? <span className="chip amber">부분 수행(버그 조금)</span> : <span className="chip red">버그 많음</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
