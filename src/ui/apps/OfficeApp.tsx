// OF-07 사무실 메뉴: 가구(A-78) + 이전(DEC-020, 단계별 넓이·보증금·월세). 책상은 사무실 화면에서 직접 놓습니다(A-80).
import { useState } from 'react';
import { DATA, OFFICE_TIERS } from '../../core/data';
import { buyFurniture, buyFurnitureBlock, currentTier, deskCapacity, desks, furnitureFits, furnitureItems, moveBlock, moveOffice, officeComfort, ownsFurniture, seatsAvailable } from '../../core/office';
import { act, useGame } from '../store';
import { Money } from '../common';
import './apps.css';

export function OfficeApp() {
  const s = useGame();
  const cur = currentTier(s);
  const [msg, setMsg] = useState<string | null>(null);
  const all = desks(s);
  const used = all.filter((x) => x.occupant !== null).length;
  return (
    <div className="col">
      <div className="kpi">
        <div className="stat">
          <div className="stat-label">지금 사무실</div>
          <div className="stat-value">{cur.name}</div>
        </div>
        <div className="stat">
          <div className="stat-label">책상(앉은 사람/전체) · 더 놓을 자리</div>
          <div className="stat-value">
            {used}/{all.length} · {seatsAvailable(s) - (all.length - used)}
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
      <div className="tiny muted">
        책상은 사무실 화면 왼쪽 아래 "책상 놓기"로 원하는 자리에 놓습니다(개당 <Money v={DATA.furniture.deskPrice} />). 빈 책상 없이 사람을 뽑으면 빈 자리에 하나 사서 놓습니다. 가구는 쾌적도(만족·건강)를 올립니다.
      </div>
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
              <div className="row tiny" style={{ gap: 6 }}>
                <span className="chip">
                  바닥 {t.size.w}×{t.size.h}칸
                </span>
                <span className="chip">책상 최대 {deskCapacity(t.id)}개</span>
              </div>
              {!here && block && <div className="tiny muted">{block}</div>}
            </div>
          );
        })}
      </div>
      <div className="tiny muted">이전하면 지금 보증금을 돌려받고 새 보증금을 냅니다. 책상·가구는 들고 가고, 책상은 새 사무실 빈 자리에 차례로 놓입니다(배치는 다시 바꿀 수 있음).</div>
    </div>
  );
}
