// F09 업무 창(A-136, 예전 제품 창 · Startup Company식): 위 제품 띠(로고·순위·품질·사용자) + 탭(상태·기능·만드는 순서·외주·출시 기록)
//  상태: MVP 전에는 출시까지 공정(진행률·남은 날·누가 만드나), 출시 후에는 지금 사용자·어제 매출·품질 계기판·추이 그래프
//  기능: 위 요약(잠재 고객·사용자·매력도 구성 팝업 / 다음 출시·작업량) + 기능 카드 줄(그림·레벨·업그레이드)
//  만드는 순서(로드맵) · 출시 기록
// 오른쪽 위 제품 카드(ProductCard)도 여기서 내보냅니다.
import { ContractsCard } from './ScheduleApp';
import { contractsOpen } from '../../core/contracts';
import { useEffect, useState } from 'react';
import { DATA, feature, gradeOutput, industry, featuresOf, featureWork, priceTierDef, type FeatureDef, type FeatureFx } from '../../core/data';
import { addToRoadmap, appeal, appealBreakdown, canCharge, coreFeatures, etaDays, featureLevel, featureLock, hasMvp, insightCost, insightHave, itemNeed, moveRoadmap, quality, removeFromRoadmap, ROADMAP_MAX, upkeepShare } from '../../core/product';
import { ceoDevPerDay } from '../../core/ceo';
import { hasActiveContract } from '../../core/contracts';
import { deptOutput } from '../../core/staff';
import { orderOf } from '../../core/orders';
import { formatDate } from '../../core/calendar';
import { revenuePerUser, totalUsers } from '../../core/market';
import { wonShort } from '../../core/format';
import { commandOrder } from '../../core/reactions';
import { act, useGame } from '../store';
import { Tabs, Help, useTween } from '../common';
import { ServiceLogo } from '../logo';
import { PxIcon } from '../icons';
import { Spark } from './StockApp';
import { play } from '../sound';
import type { GameState, PriceTier } from '../../core/types';
import './apps.css';

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
      <div className="tiny muted">{canCharge(s) ? `${parts.join(' + ')}. 수익화 기능을 만들면 더 받습니다.` : `아직 결제 기능이 없어 무료로만 씁니다. 기능 탭에서 "${billingFeatureName(s)}" 기능을 만들어야 돈이 들어옵니다.`}</div>
    </div>
  );
}

// 제품 화면 공통 계산: 하루 작업량(대표 + 로드맵을 맡은 팀), 항목별 남은 날, MVP 진행률
export function productView(s: GameState) {
  const ceo = ceoDevPerDay(s);
  const devBuilding = orderOf(s, 'dev') === 'dev_build' || (orderOf(s, 'dev') === 'dev_contract' && !hasActiveContract(s));
  const team = devBuilding ? deptOutput(s, 'dev') : 0;
  const design = orderOf(s, 'design') === 'design_build' ? deptOutput(s, 'design') : 0;
  // 유지보수(A-115)로 빠지는 몫을 뺀 실제 개발 속도
  const upkeep = upkeepShare(s);
  const rate = { ceo, team, design, dev: (ceo + team) * (1 - upkeep), upkeep };
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
  const users = useTween(totalUsers(s));
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
            <span className="pc-tile" title="사용자">
              <PxIcon id="users" size={14} />
              {num(users)}
            </span>
            <span className={`pc-tile ${delta < 0 ? 'down' : 'up'}`} title="어제보다 늘어난 사용자">
              <PxIcon id="chart" size={14} />
              {delta >= 0 ? '+' : ''}
              {num(delta)}
            </span>
          </div>
          <div className="pc-foot">{cur ? `만드는 중: ${feature(cur.id).name}${feature(cur.id).levels > 1 ? ` Lv${cur.level}` : ''} · ${dayText(v.etas[0])}` : '만들 기능이 없습니다'}</div>
        </>
      )}
    </button>
  );
}

type ProductTab = 'status' | 'features' | 'roadmap' | 'contract' | 'log';

export function ProductApp({ initialTab, openSchedule, openHiring }: { initialTab?: string; openSchedule?: () => void; openHiring?: () => void }) {
  const s = useGame();
  const mvp = hasMvp(s);
  const [tab, setTab] = useState<ProductTab>((initialTab as ProductTab) ?? 'status');
  // 알림 카드(외주 진행, A-144)에서 열면 창이 이미 떠 있어도 그 탭으로
  useEffect(() => {
    if (initialTab) setTab(initialTab as ProductTab);
  }, [initialTab]);
  const showContract = !!s.contracts?.active || contractsOpen(s); // 외주 일감(A-133). A-136: 제안이 없어도 외주를 받을 수 있는 동안은 탭을 늘 보여 줌
  const v = productView(s);
  const name = s.company.service?.name ?? s.company.name;
  const all = featuresOf(s.company.industry);
  return (
    <div className="col">
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
        <span className="pd-pill" title="사용자">
          <PxIcon id="users" size={16} />
          {num(totalUsers(s))}
        </span>
      </div>
      <Tabs
        tabs={[
          { id: 'status', label: '상태' },
          { id: 'features', label: '기능' },
          {
            id: 'roadmap',
            label: `만드는 순서 ${s.product.roadmap.length}/${ROADMAP_MAX}`,
          },
          ...(showContract ? [{ id: 'contract' as const, label: `외주${s.contracts?.active ? ' · 진행 중' : s.contracts?.offers.length ? ` ${s.contracts.offers.length}` : ''}` }] : []),
          { id: 'log', label: '출시 기록' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'status' && (mvp ? <LiveStatus s={s} v={v} openSchedule={openSchedule} /> : <MvpStatus s={s} v={v} openSchedule={openSchedule} openHiring={openHiring} />)}
      {tab === 'features' && <Features s={s} v={v} />}
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
      <div className="pd-who-title">누가 만드나(하루 작업량)</div>
      <div className="pd-who-row">
        <span>대표(나)</span>
        <b>{v.rate.ceo > 0 ? `개발 ${v.rate.ceo.toFixed(2)}` : '안 함'}</b>
      </div>
      <div className="pd-who-row">
        <span>개발자 {devCount}명</span>
        <b>{v.rate.team > 0 ? `개발 ${v.rate.team.toFixed(1)}` : devCount ? '다른 일' : '-'}</b>
      </div>
      <div className="pd-who-row">
        <span>디자이너 {designCount}명</span>
        <b>{v.rate.design > 0 ? `디자인 ${v.rate.design.toFixed(1)}` : designCount ? '다른 일' : '-'}</b>
      </div>
      {nobody ? (
        <div className="tiny" style={{ color: 'var(--red)' }}>
          아무도 개발하지 않습니다.
        </div>
      ) : (
        designCount === 0 && <div className="tiny muted">디자이너가 없으면 개발하는 사람이 디자인도 절반 속도로 합니다.</div>
      )}
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

// MVP 전 상태: D-day 카운트다운 + 핵심 기능 → 출시 단계 + 만드는 사람(개발자 1명 뽑으면 얼마나 당겨지나)
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
  return (
    <div className="col">
      <div className="mvp-wrap">
        <div className={`mvp ${stalled || missing.length ? 'bad' : ''}`} data-testid="product-status">
          <div className="mvp-top">
            <div className="col" style={{ gap: 2 }}>
              <span className="mvp-kicker">MVP 출시까지</span>
              <span className="mvp-count">{missing.length ? '준비 필요' : stalled ? '멈춤' : v.mvpEta !== null ? `D-${Math.max(0, v.mvpEta)}` : '-'}</span>
              <span className="mvp-date">
                {missing.length
                  ? `핵심 기능 ${missing.length}개가 만드는 순서에 없습니다`
                  : stalled
                    ? '아무도 개발하지 않습니다. 대표 일정에 "개발"을 넣거나 개발자를 뽑으세요'
                    : v.mvpEta !== null
                      ? `${formatDate(s.day + v.mvpEta)} 출시 예정 · 핵심 기능을 다 만들면 자동으로 국내에 출시됩니다`
                      : ''}
              </span>
            </div>
            <div className="mvp-ring" style={{ ['--p' as string]: `${p}%` }}>
              <span>{Math.round(p)}%</span>
            </div>
          </div>
          <div className="mvp-track">
            {v.cores.map((c, i) => {
              const done = featureLevel(s, c.id) >= 1;
              const qi = s.product.roadmap.findIndex((x) => x.id === c.id);
              const it = qi >= 0 ? s.product.roadmap[qi] : null;
              const need = it ? itemNeed(it) : null;
              const pct = it && need ? ((it.devDone + it.designDone) / (need.dev + need.design)) * 100 : 0;
              const state = done ? 'done' : qi === 0 ? 'now' : it ? 'wait' : 'missing';
              return (
                <div key={c.id} className={`mvp-node ${state}`}>
                  <span className="mvp-dot" style={state === 'now' ? { ['--p' as string]: `${pct}%` } : undefined}>
                    {done ? '✓' : state === 'missing' ? '+' : i + 1}
                  </span>
                  <b>{c.name}</b>
                  <span>{done ? '완료' : state === 'now' ? `만드는 중 ${Math.round(pct)}%` : it ? `${dayText(v.etas[qi])} 뒤` : '순서에 없음'}</span>
                </div>
              );
            })}
            <div className="mvp-node goal">
              <span className="mvp-dot">
                <PxIcon id="star" size={18} />
              </span>
              <b>국내 출시</b>
              <span>고객·매출 시작</span>
            </div>
          </div>
          {missing.length > 0 && (
            <button className="btn mvp-fix" data-testid="fill-cores" onClick={fillCores}>
              핵심 기능 {missing.length}개 모두 만드는 순서에 넣기
            </button>
          )}
        </div>
        <div className="mvp-team">
          <div className="mvp-team-title">만드는 사람</div>
          <div className="mvp-person">
            <span className="mvp-av me">나</span>
            <div className="grow">
              <div className="pd-kv">
                <span>대표</span>
                <b>{v.rate.ceo > 0 ? `하루 ${v.rate.ceo.toFixed(2)}` : '개발 안 함'}</b>
              </div>
              <span className="mvp-bar">
                <i style={{ width: `${(v.rate.ceo / maxRate) * 100}%` }} />
              </span>
            </div>
          </div>
          <div className={`mvp-person ${devCount ? '' : 'empty'}`}>
            <span className="mvp-av">개</span>
            <div className="grow">
              <div className="pd-kv">
                <span>개발자 {devCount}명</span>
                <b>{v.rate.team > 0 ? `하루 ${v.rate.team.toFixed(1)}` : devCount ? '다른 일 중' : '없음'}</b>
              </div>
              <span className="mvp-bar">
                <i style={{ width: `${(v.rate.team / maxRate) * 100}%` }} />
              </span>
            </div>
          </div>
          <div className={`mvp-person ${designCount ? '' : 'empty'}`}>
            <span className="mvp-av design">디</span>
            <div className="grow">
              <div className="pd-kv">
                <span>디자이너 {designCount}명</span>
                <b>{v.rate.design > 0 ? `하루 ${v.rate.design.toFixed(1)}` : designCount ? '다른 일 중' : '없음 · 개발이 대신(절반 속도)'}</b>
              </div>
              <span className="mvp-bar design">
                <i style={{ width: `${(v.rate.design / maxRate) * 100}%` }} />
              </span>
            </div>
          </div>
          {withDev !== null && v.mvpEta !== null && isFinite(withDev) && (!isFinite(v.mvpEta) || withDev < v.mvpEta) && (
            <div className="mvp-tip">
              개발자 1명을 뽑으면 출시가 <b>D-{withDev}</b>로 당겨집니다{isFinite(v.mvpEta) ? ` (${v.mvpEta - withDev}일 빨라짐)` : ''}.
            </div>
          )}
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
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
        </div>
      </div>
    </div>
  );
}

// 반원 계기판(품질)
function Gauge({ value, label }: { value: number; label: string }) {
  const t = useTween(value);
  const a = Math.PI * (1 - Math.max(0, Math.min(100, t)) / 100);
  const x = 60 + 48 * Math.cos(a);
  const y = 60 - 48 * Math.sin(a);
  const color = t >= 75 ? 'var(--green)' : t >= 50 ? 'var(--amber)' : 'var(--red)';
  return (
    <svg viewBox="0 0 120 70" className="pd-gauge" aria-label={`${label} ${Math.round(t)}%`}>
      <path d="M12 60 A48 48 0 0 1 108 60" fill="none" stroke="var(--c-gray-200)" strokeWidth="12" />
      <path d={`M12 60 A48 48 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`} fill="none" stroke={color} strokeWidth="12" />
      <text x="60" y="56" textAnchor="middle" className="pd-gauge-num">
        {Math.round(t)}%
      </text>
    </svg>
  );
}

// 출시 후 상태: 지금 사용자·어제 매출·품질 계기판·그래프
function LiveStatus({ s, v, openSchedule }: { s: GameState; v: View; openSchedule?: () => void }) {
  const d = s.product.daily ?? [];
  const last = d[d.length - 1];
  const prev = d[d.length - 2];
  const users = useTween(totalUsers(s));
  const delta = last && prev ? last.users - prev.users : 0;
  const cur = s.product.roadmap[0];
  const curF = cur ? feature(cur.id) : null;
  const need = cur ? itemNeed(cur) : null;
  return (
    <div className="col">
      <div className="pd-tiles3" data-testid="product-status">
        <div className="pd-tile center">
          <div className="pd-tile-label">
            <span className="pd-live" /> 지금 사용자
          </div>
          <div className="pd-tile-huge">{num(users)}</div>
          <div className={`tiny ${delta < 0 ? 'neg' : 'pos'}`}>
            어제보다 {delta >= 0 ? '+' : ''}
            {num(delta)}
          </div>
        </div>
        <div className="pd-tile">
          <div className="pd-tile-label">어제 매출</div>
          <div className="pd-tile-big">{wonShort(last?.rev ?? 0)}</div>
          <MoneyNote s={s} />
          <div className="pd-kv">
            <span>매력도</span>
            <b>{appeal(s).toFixed(1)}</b>
          </div>
          <div className="pd-kv">
            <span>
              가격 <Help text="싸게 팔면 고객이 많이 오고, 비싸게 팔면 고객당 매출이 큽니다." />
            </span>
            <div className="seg">
              {(['low', 'standard', 'premium'] as PriceTier[]).map((t) => (
                <button key={t} className={s.product.priceTier === t ? 'on' : ''} data-testid={`price-${t}`} title={priceTierDef(t).desc} onClick={() => act((g) => (g.product.priceTier = t))}>
                  {priceTierDef(t).name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="pd-tile center">
          <div className="pd-tile-label">
            품질 <Help text="버그가 적을수록 높습니다. 새 기능을 만들 때마다 버그가 생기고, 품질이 낮으면 고객이 떠나고 장애가 납니다. 개발팀에 '안정화·버그 수정'을 맡기면 오릅니다." />
          </div>
          <Gauge value={quality(s)} label="품질" />
          <div className="pd-kv">
            <span>
              기술 부채 <Help text="급하게(야근) 만든 코드가 쌓인 정도입니다. 높을수록 새 기능에 버그가 더 생깁니다. '기술 부채 정리'로 줄입니다." />
            </span>
            <b>{Math.round(s.product.debt * 100)}%</b>
          </div>
          <div className="pd-kv">
            <span>
              UX 완성도 <Help text="디자인팀이 'UX 다듬기'를 하면 오르고 매력도에 곱해집니다. 새 기능을 낼 때마다 조금씩 내려갑니다." />
            </span>
            <b>+{Math.round(s.product.polish * 100)}%</b>
          </div>
        </div>
      </div>
      <Inflow s={s} />
      <div className="pd-charts">
        <div className="pd-tile">
          <div className="pd-tile-label">사용자 (최근 {d.length}일)</div>
          <Spark points={d.map((x) => x.users)} h={110} />
        </div>
        <div className="pd-tile">
          <div className="pd-tile-label">하루 매출 (최근 {d.length}일)</div>
          <Spark points={d.map((x) => x.rev)} h={110} />
        </div>
      </div>
      <div className="pd-hero">
        <div className="pd-hero-main">
          <div className="pd-stage">지금 만드는 기능</div>
          {cur && curF && need ? (
            <>
              <div className="pd-headline">
                {curF.name}
                {curF.levels > 1 ? ` Lv${cur.level}` : ''} · {dayText(v.etas[0])} 뒤 출시
              </div>
              <div className="pbar">
                <div
                  className="dev"
                  style={{
                    width: `${(cur.devDone / (need.dev + need.design)) * 100}%`,
                  }}
                />
                <div
                  className="design"
                  style={{
                    width: `${(cur.designDone / (need.dev + need.design)) * 100}%`,
                  }}
                />
              </div>
              <div className="tiny muted">{curF.desc}</div>
            </>
          ) : (
            <div className="pd-headline">만들 기능이 없습니다. 기능 탭에서 다음 기능을 고르세요.</div>
          )}
        </div>
        <Builders s={s} v={v} openSchedule={openSchedule} />
      </div>
    </div>
  );
}

// 고객이 어디서 오나(최근 약 2주 하루 평균): 홍보 없이는 지인 말고 거의 오지 않습니다.
function Inflow({ s }: { s: GameState }) {
  const f = s.markets.kr.flow;
  const unit = industry(s.company.industry).unit;
  const rows: [string, number, string][] = f
    ? [
        ['스스로 찾아옴', f.inbound, '인지도가 3%는 넘어야 검색으로 찾아옵니다.'],
        ['입소문', f.viral, '쓰는 사람이 많을수록, 입소문 기능이 있을수록 늘어납니다.'],
        ['영업', f.sales, '대표 주 업무 "영업"·고객사 방문이나 세일즈팀.'],
        ['광고', f.paid, '시장·광고 메뉴의 광고 예산.'],
      ]
    : [];
  const inTotal = rows.reduce((a, r) => a + r[1], 0);
  const fmt = (x: number) => (x >= 10 ? num(x) : x.toFixed(1));
  return (
    <div className="pd-tile" data-testid="inflow">
      <div className="pd-tile-label">
        {unit}이 어디서 오나 (하루 평균) <Help text="홍보를 하지 않으면 출시 날 들어온 대표의 지인 말고는 거의 들어오지 않습니다. 광고·영업·콘텐츠로 인지도를 올려야 합니다." />
      </div>
      <div className="pd-inflow">
        {rows.map(([name, x, tip]) => (
          <div key={name} className="pd-inflow-row" title={tip}>
            <span>{name}</span>
            <span className="pd-inflow-bar">
              <i style={{ width: `${inTotal > 0 ? (x / inTotal) * 100 : 0}%` }} />
            </span>
            <b>+{fmt(x)}</b>
          </div>
        ))}
        <div className="pd-inflow-row neg">
          <span>떠남</span>
          <span />
          <b>-{fmt(f?.lost ?? 0)}</b>
        </div>
      </div>
      <div className="tiny muted">
        국내 인지도 {(s.markets.kr.awareness * 100).toFixed(2)}% · 광고 예산 월 {wonShort(s.markets.kr.adBudget)}
      </div>
    </div>
  );
}

// 기능 그림(카테고리별 앱 화면 미리보기, assets/features/*.png)
const FEAT_ART = Object.fromEntries(Object.entries(import.meta.glob<string>('../../assets/features/*.png', { eager: true, import: 'default' })).map(([path, url]) => [path.split('/').pop()!.replace('.png', ''), url]));

// 기능 탭(Startup Company식): 위 요약(잠재 고객·사용자·매력도 구성 / 다음 출시·작업량·기능 수) + 기능 카드 줄(그림·레벨·업그레이드)
function Features({ s, v }: { s: GameState; v: View }) {
  const all = featuresOf(s.company.industry);
  const [msg, setMsg] = useState<string | null>(null);
  const [showLocked, setShowLocked] = useState(false);
  const ind = industry(s.company.industry);
  const bd = appealBreakdown(s);
  const alive = s.competitors.filter((c) => c.alive);
  const compAvg = alive.length ? alive.reduce((a, c) => a + c.appeal, 0) / alive.length : 0;
  const queuedOf = (f: FeatureDef) => s.product.roadmap.filter((r) => r.id === f.id).length;
  const mine = all.filter((f) => featureLevel(s, f.id) > 0 || queuedOf(f) > 0);
  const can = all.filter((f) => !mine.includes(f) && !featureLock(s, f));
  const locked = all.filter((f) => !mine.includes(f) && featureLock(s, f));
  const builtCount = Object.keys(s.product.features).length;
  const maxLv = Math.max(0, ...Object.values(s.product.features));
  const featPts = bd.parts.reduce((a, x) => a + x.pts, 0) + bd.bonus;
  const pctOf = (x: number) => (featPts > 0 ? `${Math.round((x / featPts) * 100)}%` : '-');
  const signed = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`;
  const face = !hasMvp(s) ? 'empty' : bd.total >= compAvg ? 'star' : bd.total >= compAvg * 0.7 ? 'check' : 'warn';

  const add = (f: FeatureDef) => {
    const err = act((g) => addToRoadmap(g, f.id));
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
    return (
      <div key={f.id} className={`fc ${lv > 0 ? 'own' : ''} ${lock && !lv && !q ? 'locked' : ''}`} data-testid={`feat-${f.id}`}>
        <div className="fc-art">
          {art ? <img src={art} alt="" draggable={false} /> : <span className={`cat ${f.cat}`}>{CAT_NAME[f.cat]}</span>}
          {lv > 0 && <span className="fc-lv">Lv {lv}</span>}
          {q > 0 && <span className="fc-q">{qi === 0 ? '만드는 중' : `순서 ${qi + 1}번`}</span>}
        </div>
        <div className="fc-body">
          <div className="row" style={{ gap: 6 }}>
            <span className={`cat ${f.cat}`}>{CAT_NAME[f.cat]}</span>
            <b className="grow fc-name">{f.name}</b>
          </div>
          {f.levels > 1 && (
            <span className="pd-dots" title={`레벨 ${lv}/${f.levels}`}>
              {Array.from({ length: f.levels }, (_, i) => (
                <i key={i} className={i < lv ? 'on' : i < lv + q ? 'q' : ''} />
              ))}
            </span>
          )}
          <div className="fc-fx">{f.desc}</div>
        </div>
        <div className="fc-foot">
          {lock ? (
            <span className="tiny muted" data-testid={`feat-lock-${f.id}`}>
              {lv + q >= f.levels ? (lv >= f.levels ? (f.levels > 1 ? '최고 레벨' : '완성') : f.levels > 1 ? '최고 레벨까지 순서에 있음' : '만드는 순서에 있음') : cost.n > insightHave(s, cost.kind) && lock.endsWith('부족') ? `${costName} ${num(cost.n)} 필요 · 지금 ${num(insightHave(s, cost.kind))}` : lock}
            </span>
          ) : (
            <>
              <span className="tiny muted grow">
                {dayText(days)}
                {cost.n > 0 && ` · ${costName} ${num(cost.n)}`}
              </span>
              <button className="btn small" onClick={() => add(f)}>
                {lv + q === 0 ? '만들기' : '업그레이드'}
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="col">
      <div className="fs-top">
        <div className="fs-col">
          <div className="pd-kv">
            <span>지금 {ind.unit}</span>
            <b>{num(totalUsers(s))}</b>
          </div>
          <div className="pd-kv fs-appeal" tabIndex={0}>
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
        </div>
        <div className="fs-col">
          <div className="pd-kv">
            <span>다음 기능 출시까지</span>
            <b>{s.product.roadmap.length ? dayText(v.etas[0]) : '-'}</b>
          </div>
          <div className="pd-kv">
            <span>하루 작업량(개발 / 디자인)</span>
            <b>
              {v.rate.dev.toFixed(2)} / {v.rate.design.toFixed(1)}
            </b>
          </div>
          <div className="pd-kv" data-testid="insight">
            <span>고객 인사이트 · 지불 의사</span>
            <b>
              {num(insightHave(s, 'insight'))} · {num(insightHave(s, 'pay'))}
            </b>
          </div>
          {v.rate.upkeep >= 0.05 && (
            <div className="pd-kv">
              <span>유지보수로 빠지는 개발</span>
              <b className="neg">{Math.round(v.rate.upkeep * 100)}%</b>
            </div>
          )}
          <div className="pd-kv">
            <span>만든 기능 · 최고 레벨</span>
            <b>
              {builtCount}개 · Lv {maxLv}
            </b>
          </div>
        </div>
      </div>
      {msg && <div className="warn">{msg}</div>}
      <div className="section-title">우리 제품 기능 {mine.length}개</div>
      {mine.length ? <div className="fc-row">{mine.map(card)}</div> : <div className="tiny muted">아직 없습니다. 아래에서 만들 기능을 고르세요.</div>}
      <div className="section-title">새로 만들 수 있는 기능 {can.length}개</div>
      <div className="fc-row">{can.map(card)}</div>
      {locked.length > 0 && (
        <button className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setShowLocked((x) => !x)}>
          {showLocked ? '나중에 열리는 기능 접기' : `나중에 열리는 기능 ${locked.length}개 보기`}
        </button>
      )}
      {showLocked && <div className="fc-row">{locked.map(card)}</div>}
    </div>
  );
}

function Roadmap({ s, v, openSchedule, goFeatures }: { s: GameState; v: View; openSchedule?: () => void; goFeatures: () => void }) {
  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <div className="col grow">
        {s.product.roadmap.length === 0 && (
          <div className="warn">
            만들 기능이 없습니다.{' '}
            <button className="btn small" onClick={goFeatures}>
              기능 고르기
            </button>
          </div>
        )}
        {s.product.roadmap.map((it, i) => {
          const f = feature(it.id);
          const need = itemNeed(it);
          const tot = need.dev + need.design;
          return (
            <div key={`${it.id}-${it.level}`} className={`rm-item ${i === 0 ? 'first' : ''}`} data-testid={`roadmap-${i}`}>
              <div className="row">
                <span className="pd-order">{i + 1}</span>
                <span className={`cat ${f.cat}`}>{CAT_NAME[f.cat]}</span>
                <b className="grow">
                  {f.name}
                  {f.levels > 1 ? ` Lv${it.level}` : ''}
                </b>
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
                <b>{isFinite(v.etas[i]) ? `${dayText(v.etas[i])} 뒤 출시 (${formatDate(s.day + v.etas[i])})` : '멈춤'}</b>
              </div>
            </div>
          );
        })}
        <Help text="맨 위 기능부터 하나씩 만듭니다. ▲▼로 순서를 바꾸고 ✕로 뺄 수 있습니다. 파란 막대는 개발, 보라 막대는 디자인 진행입니다." />
      </div>
      <Builders s={s} v={v} openSchedule={openSchedule} />
    </div>
  );
}

function ShipLog({ s }: { s: GameState }) {
  if (s.product.shipped.length === 0) return <div className="warn">아직 출시한 기능이 없습니다.</div>;
  return (
    <table className="t">
      <thead>
        <tr>
          <th>날짜</th>
          <th>기능</th>
          <th>판정</th>
        </tr>
      </thead>
      <tbody>
        {[...s.product.shipped].reverse().map((x, i) => {
          const f = feature(x.id);
          return (
            <tr key={i}>
              <td>{formatDate(x.day)}</td>
              <td>
                {f.name}
                {f.levels > 1 ? ` Lv${x.level}` : ''}
              </td>
              <td>{x.result === 'full' ? <span className="chip green">완전 수행</span> : x.result === 'partial' ? <span className="chip amber">부분 수행(버그 조금)</span> : <span className="chip red">버그 많음</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
