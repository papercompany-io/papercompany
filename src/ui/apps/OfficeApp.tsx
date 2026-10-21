// OF-07 사무실 이전(DEC-020) — 부동산 앱: 단계별 사무실(좌석·부서 구역·보증금·월세·쾌적도)
import { useState } from 'react';
import { DATA, OFFICE_TIERS, dept } from '../../core/data';
import { currentTier, moveBlock, moveOffice, seatCount, totalSeats } from '../../core/office';
import { act, useGame } from '../store';
import { Money } from '../common';
import type { DeptId } from '../../core/types';
import './apps.css';

export function OfficeApp() {
  const s = useGame();
  const cur = currentTier(s);
  const [msg, setMsg] = useState<string | null>(null);
  const used = s.seats.filter((x) => x.zone !== 'ceo' && x.zone !== 'exec' && x.occupant !== null).length;
  return (
    <div className="col">
      <div className="kpi">
        <div className="stat">
          <div className="stat-label">지금 사무실</div>
          <div className="stat-value">{cur.name}</div>
        </div>
        <div className="stat">
          <div className="stat-label">좌석</div>
          <div className="stat-value">
            {used} / {totalSeats(cur)}
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
          <div className="stat-value">+{cur.comfort}</div>
        </div>
      </div>
      {s.company.movingUntil !== null && <div className="warn">이사 중입니다. 며칠 동안 일이 느려집니다.</div>}
      {msg && <div className="warn">{msg}</div>}
      <div className="col">
        {OFFICE_TIERS.map((t) => {
          const block = moveBlock(s, t.id);
          const here = t.id === s.company.officeTier;
          return (
            <div key={t.id} className="card col" style={here ? { borderColor: 'var(--blue)', borderWidth: 2 } : undefined}>
              <div className="row">
                <b style={{ fontSize: 16 }}>
                  {t.id}. {t.name}
                </b>
                {here && <span className="chip blue">지금 사무실</span>}
                <span className="grow" />
                <span className="tiny">
                  보증금 <Money v={t.deposit} /> · 월세 <Money v={t.rent} /> · 쾌적도 +{t.comfort}
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
      <div className="tiny muted">이전하면 지금 보증금을 돌려받고 새 보증금을 냅니다. 직원은 새 사무실의 자기 부서 구역에 다시 앉습니다(OF-07). 좌석이 모두 차면 그 부서는 더 뽑을 수 없습니다(HR-04).</div>
    </div>
  );
}
