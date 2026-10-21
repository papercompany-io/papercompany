// F09 제품 앱(PD-01~04): 로드맵·기능 트리·품질(버그)·기술 부채·UX 완성도·가격 정책
import { useMemo, useState } from 'react';
import { DATA, featuresOf, featureWork, priceTierDef, type FeatureDef, type FeatureFx } from '../../core/data';
import { addToRoadmap, appeal, coreFeatures, featureLevel, featureLock, hasMvp, itemNeed, moveRoadmap, quality, removeFromRoadmap, ROADMAP_MAX, fxTotals } from '../../core/product';
import { deptOutput } from '../../core/staff';
import { orderOf, setOrder } from '../../core/orders';
import { formatDate } from '../../core/calendar';
import { act, useGame } from '../store';
import { Tabs } from '../common';
import { play } from '../sound';
import type { PriceTier } from '../../core/types';
import './apps.css';

const CAT_NAME: Record<string, string> = { core: '핵심', growth: '성장', monetize: '수익화', retention: '리텐션', infra: '인프라', enterprise: '대기업', global: '해외', ai: 'AI', platform: '플랫폼' };

export function fxText(fx: FeatureFx): string {
  const p: string[] = [];
  if (fx.appeal) p.push(`매력 +${fx.appeal}`);
  if (fx.conv) p.push(`획득 +${Math.round(fx.conv * 100)}%`);
  if (fx.churn) p.push(`이탈 ${Math.round(fx.churn * 100)}%`);
  if (fx.pay) p.push(`유료 전환 +${(fx.pay * 100).toFixed(1)}%p`);
  if (fx.arpu) p.push(`객단가 +${Math.round(fx.arpu * 100)}%`);
  if (fx.ad) p.push(`광고 +${fx.ad}원/명`);
  if (fx.take) p.push(`수수료 +${(fx.take * 100).toFixed(1)}%p`);
  if (fx.gmv) p.push(`거래액 +${Math.round(fx.gmv * 100)}%`);
  if (fx.viral) p.push(`입소문 +${(fx.viral * 100).toFixed(1)}`);
  if (fx.infra) p.push(`인프라비 ${Math.round(fx.infra * 100)}%`);
  if (fx.stability) p.push(`안정성 +${Math.round(fx.stability * 100)}`);
  if (fx.enterprise) p.push('대기업 계약 가능');
  if (fx.market) p.push(`${DATA.markets.markets.find((m) => m.id === fx.market)!.name} 진출 가능`);
  if (fx.ai) p.push('AI 기능');
  if (fx.bugs) p.push(`버그 +${fx.bugs}`);
  return p.join(' · ');
}

export function ProductApp() {
  const s = useGame();
  const [tab, setTab] = useState<'roadmap' | 'tree' | 'log'>('roadmap');
  const [cat, setCat] = useState<string>('all');
  const [msg, setMsg] = useState<string | null>(null);
  const cores = coreFeatures(s);
  const fx = fxTotals(s);
  const devOut = deptOutput(s, 'dev');
  const desOut = deptOutput(s, 'design');
  const alive = s.competitors.filter((c) => c.alive);
  const compAvg = alive.length ? alive.reduce((a, c) => a + c.appeal, 0) / alive.length : 0;
  const all = featuresOf(s.company.industry);
  const list = useMemo(() => all.filter((f) => cat === 'all' || f.cat === cat), [all, cat]);

  const add = (f: FeatureDef) => {
    const err = act((g) => addToRoadmap(g, f.id));
    setMsg(err ?? null);
    if (!err) play('click');
  };

  return (
    <div className="col">
      <div className="kpi">
        <div className="stat">
          <div className="stat-label">{hasMvp(s) ? '제품 매력도' : 'MVP까지 핵심 기능'}</div>
          <div className="stat-value" data-testid="product-appeal">
            {hasMvp(s) ? `${appeal(s).toFixed(1)} (경쟁 평균 ${compAvg.toFixed(1)})` : `${cores.filter((c) => featureLevel(s, c.id) >= 1).length} / ${cores.length}`}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">품질(버그가 적을수록 높음)</div>
          <div className="stat-value" style={{ color: quality(s) < 60 ? 'var(--red)' : undefined }}>
            {quality(s)}점 · 기술 부채 {Math.round(s.product.debt * 100)}%
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">UX 완성도</div>
          <div className="stat-value">+{Math.round(s.product.polish * 100)}%</div>
        </div>
        <div className="stat">
          <div className="stat-label">하루 작업량(개발 / 디자인)</div>
          <div className="stat-value">
            {devOut.toFixed(1)} / {desOut.toFixed(1)}
          </div>
        </div>
      </div>
      <div className="row tiny">
        <span className="muted">개발팀 맡은 일</span>
        <select data-testid="dev-order" value={orderOf(s, 'dev')} onChange={(e) => act((g) => setOrder(g, 'dev', e.target.value))}>
          {DATA.orders.orders
            .filter((o) => o.dept === 'dev')
            .map((o) => (
              <option key={o.id} value={o.id} disabled={s.company.stage < o.stage}>
                {o.name}
                {s.company.stage < o.stage ? ` (단계 ${o.stage})` : ''}
              </option>
            ))}
        </select>
        <span className="muted">디자인팀</span>
        <select data-testid="design-order" value={orderOf(s, 'design')} onChange={(e) => act((g) => setOrder(g, 'design', e.target.value))}>
          {DATA.orders.orders
            .filter((o) => o.dept === 'design')
            .map((o) => (
              <option key={o.id} value={o.id} disabled={s.company.stage < o.stage}>
                {o.name}
              </option>
            ))}
        </select>
        <span className="grow" />
        {hasMvp(s) && (
          <>
            <span className="muted">가격 정책</span>
            <div className="seg">
              {(['low', 'standard', 'premium'] as PriceTier[]).map((t) => (
                <button key={t} className={s.product.priceTier === t ? 'on' : ''} data-testid={`price-${t}`} title={priceTierDef(t).desc} onClick={() => act((g) => (g.product.priceTier = t))}>
                  {priceTierDef(t).name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <Tabs
        tabs={[
          { id: 'roadmap', label: `로드맵 ${s.product.roadmap.length}/${ROADMAP_MAX}` },
          { id: 'tree', label: `기능 목록 (${Object.keys(s.product.features).length}/${all.length})` },
          { id: 'log', label: '출시 기록' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {msg && <div className="warn">{msg}</div>}
      {tab === 'roadmap' && (
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="col" style={{ width: 380, flex: 'none' }}>
            <div className="section-title">개발 순서(위부터)</div>
            {s.product.roadmap.length === 0 && <div className="warn">로드맵이 비어 있습니다. 오른쪽에서 기능을 넣으세요.</div>}
            {s.product.roadmap.map((it, i) => {
              const f = all.find((x) => x.id === it.id)!;
              const need = itemNeed(it);
              const tot = need.dev + need.design;
              return (
                <div key={`${it.id}-${it.level}`} className={`rm-item ${i === 0 ? 'first' : ''}`} data-testid={`roadmap-${i}`}>
                  <div className="row">
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
                  <div className="tiny muted">
                    개발 {Math.floor(it.devDone)}/{need.dev} · 디자인 {Math.floor(it.designDone)}/{need.design}
                    {i === 0 && devOut + desOut > 0 ? ` · 약 ${Math.ceil(Math.max(0, tot - it.devDone - it.designDone) / Math.max(0.1, devOut + desOut + (s.ceoAlloc.dev * 0.125)))}일` : ''}
                  </div>
                </div>
              );
            })}
            <div className="tiny muted">디자이너가 없으면 개발자·대표가 디자인 작업을 절반 효율로 합니다. 새 코드는 버그를 만들고, 버그가 많으면 이탈과 장애가 늘어납니다.</div>
          </div>
          <div className="col grow">
            <div className="row">
              <div className="section-title grow">넣을 수 있는 기능</div>
              <select value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="all">전체</option>
                {Object.entries(CAT_NAME).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <FeatureList list={list.filter((f) => !featureLock(s, f))} onAdd={add} />
          </div>
        </div>
      )}
      {tab === 'tree' && (
        <div className="col">
          <div className="tiny muted">
            모든 기능과 잠긴 이유입니다. 기능 효과 합계: {fxText({ appeal: Math.round(fx.appeal), conv: +fx.conv.toFixed(2), churn: +fx.churn.toFixed(2), arpu: +fx.arpu.toFixed(2) })} (많이 쌓을수록 효과가 줄어듭니다)
          </div>
          <FeatureList list={list} onAdd={add} showLocked />
        </div>
      )}
      {tab === 'log' && (
        <table className="t">
          <thead>
            <tr>
              <th>날짜</th>
              <th>기능</th>
              <th>판정(MG-04)</th>
            </tr>
          </thead>
          <tbody>
            {[...s.product.shipped].reverse().map((x, i) => {
              const f = all.find((y) => y.id === x.id);
              return (
                <tr key={i}>
                  <td>{formatDate(x.day)}</td>
                  <td>
                    {f?.name}
                    {f && f.levels > 1 ? ` Lv${x.level}` : ''}
                  </td>
                  <td>{x.result === 'full' ? <span className="chip green">완전 수행</span> : x.result === 'partial' ? <span className="chip amber">부분 수행(버그 조금)</span> : <span className="chip red">버그 많음</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );

  function FeatureList({ list, onAdd, showLocked }: { list: FeatureDef[]; onAdd: (f: FeatureDef) => void; showLocked?: boolean }) {
    return (
      <div className="feat-grid">
        {list.map((f) => {
          const lv = featureLevel(s, f.id);
          const lock = featureLock(s, f);
          const next = Math.min(f.levels, lv + 1 + s.product.roadmap.filter((r) => r.id === f.id).length);
          const w = featureWork(f, next);
          if (!showLocked && lock) return null;
          return (
            <button key={f.id} className="feat" data-testid={`feat-${f.id}`} disabled={!!lock} onClick={() => onAdd(f)}>
              <div className="row">
                <span className={`cat ${f.cat}`}>{CAT_NAME[f.cat]}</span>
                <b className="grow">{f.name}</b>
                {f.levels > 1 && (
                  <span className="tiny muted">
                    Lv {lv}/{f.levels}
                  </span>
                )}
                {f.levels === 1 && lv >= 1 && <span className="chip green">완성</span>}
              </div>
              <span className="tiny muted">{f.desc}</span>
              <span className="fx">{fxText(f.fx)}</span>
              <span className="tiny">
                작업량 개발 {w.dev} · 디자인 {w.design}
                {lock ? ` · 🔒 ${lock}` : ''}
              </span>
            </button>
          );
        })}
      </div>
    );
  }
}
