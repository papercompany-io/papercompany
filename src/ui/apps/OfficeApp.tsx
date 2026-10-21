// OF-07 사무실 앱: 가구(A-78, 책상은 채용 때 자동 구입) + 이전(DEC-020, 단계별 사무실·좌석·보증금·월세)
import { useState } from 'react';
import { DATA, OFFICE_TIERS, dept } from '../../core/data';
import { buyFurniture, buyFurnitureBlock, currentTier, furnitureFits, furnitureItems, moveBlock, moveOffice, officeComfort, ownsFurniture, seatBought, seatCount, totalSeats } from '../../core/office';
import { act, useGame } from '../store';
import { Money } from '../common';
import type { DeptId } from '../../core/types';
import './apps.css';

export function OfficeApp() {
  const s = useGame();
  const cur = currentTier(s);
  const [msg, setMsg] = useState<string | null>(null);
  const used = s.seats.filter((x) => x.zone !== 'ceo' && x.zone !== 'exec' && x.occupant !== null).length;
  const desks = s.seats.filter((x) => x.zone !== 'ceo' && x.zone !== 'exec' && seatBought(x)).length;
  return (
    <div className="col">
      <div className="kpi">
        <div className="stat">
          <div className="stat-label">지금 사무실</div>
          <div className="stat-value">{cur.name}</div>
        </div>
        <div className="stat">
          <div className="stat-label">앉은 사람 · 책상 · 자리</div>
          <div className="stat-value">
            {used} · {desks} / {totalSeats(cur)}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">월세</div>
          <div className="stat-value">
            <Money v={cur.rent} />
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">쾌적도(만족도)</div>
          <div className="stat-value">+{officeComfort(s)}</div>
        </div>
      </div>
      {s.company.movingUntil !== null && <div className="warn">이사 중입니다. 며칠 동안 일이 느려집니다.</div>}
      {msg && <div className="warn">{msg}</div>}
      <div className="section-title">가구 들여놓기</div>
      <div className="tiny muted">책상·PC는 사람을 뽑으면 자리마다 자동으로 삽니다(개당 <Money v={DATA.furniture.deskPrice} />). 나머지 가구는 여기서 사서 놓으면 사무실이 채워지고 쾌적도(직원 만족·건강)가 오릅니다.</div>
      <div className="furn-grid">
        {furnitureItems().map((it) => {
          const own = ownsFurniture(s, it.id);
          const fits = furnitureFits(s, it);
          const block = buyFurnitureBlock(s, it.id);
          return (
            <div key={it.id} className={`card furn ${own ? 'own' : ''} ${!fits ? 'nofit' : ''}`}>
              <div className="row">
                <b className="grow">{it.name}</b>
                <span className="chip green">쾌적 +{it.comfort}</span>
              </div>
              <div className="tiny muted">{it.desc}</div>
              {own ? (
                <span className="chip blue" style={{ alignSelf: 'flex-start' }}>
                  {fits ? '놓여 있음' : '보관 중(이 사무실엔 공간 없음)'}
                </span>
              ) : (
                <button className="btn small" data-testid={`buy-${it.id}`} disabled={!!block} title={block ?? ''} onClick={() => setMsg(act((g) => buyFurniture(g, it.id)) ?? null)}>
                  <Money v={it.price} /> 사기
                </button>
              )}
              {!own && !fits && <div className="tiny muted">더 큰 사무실에서 놓을 수 있음</div>}
            </div>
          );
        })}
      </div>
      <div className="section-title">사무실 옮기기</div>
      <div className="col">
        {OFFICE_TIERS.map((t) => {
          const block = moveBlock(s, t.id);
          const here = t.id === s.company.officeTier;
          return (
            <div key={t.id} className="card col" style={here ? { borderColor: 'var(--blue)', borderWidth: 2 } : undefined}>
              <div className="row">
                <b style={{ fontSize: 16 }}>
                  {t.name}
                </b>
                {here && <span className="chip blue">지금 사무실</span>}
                <span className="grow" />
                <span className="tiny">
                  보증금 <Money v={t.deposit} /> · 월세 <Money v={t.rent} />
                </span>
                {!here && (
                  <button
                    className="btn small"
                    data-testid={`move-${t.id}`}
                    disabled={!!block}
                    title={block ?? ''}
                    onClick={() => {
                      const err = act((g) => moveOffice(g, t.id));
                      setMsg(err ?? null);
                    }}
                  >
                    이전하기
                  </button>
                )}
              </div>
              <div className="tiny muted">{t.desc}</div>
              <div className="row tiny" style={{ flexWrap: 'wrap', gap: 6 }}>
                좌석 {totalSeats(t)}석:
                {DATA.depts.departments.map((d) => {
                  const n = seatCount(t, d.id as DeptId);
                  return n > 0 ? (
                    <span key={d.id} className="chip">
                      {dept(d.id as DeptId).name} {n}
                    </span>
                  ) : null;
                })}
              </div>
              {!here && block && <div className="tiny muted">{block}</div>}
            </div>
          );
        })}
      </div>
      <div className="tiny muted">이전하면 지금 보증금을 돌려받고 새 보증금을 냅니다. 산 책상·가구는 들고 갑니다. 부서 자리가 모두 차면 그 부서는 더 뽑을 수 없습니다.</div>
    </div>
  );
}
