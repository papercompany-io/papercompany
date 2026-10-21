// RK-01 결과 금액 랭킹(로컬 명예의 전당) + 레거시 강화 상점 + 업적 목록
import { useState } from 'react';
import { DATA } from '../core/data';
import { buyLegacy, legacyCost } from '../core/career';
import { wonShort } from '../core/format';
import { Tabs } from './common';
import { updateProfile, useProfile } from './meta';
import { play } from './sound';
import './result.css';

export function Hall({ onBack }: { onBack: () => void }) {
  const p = useProfile();
  const [tab, setTab] = useState<'hall' | 'legacy' | 'ach'>('legacy');
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="result-screen">
      <div className="result-window">
        <div className="result-head">
          <div className="setup-title">명예의 전당</div>
          <button className="btn ghost" data-testid="hall-back" onClick={onBack}>
            ← 돌아가기
          </button>
        </div>
        <div className="col" style={{ padding: '12px 20px', overflow: 'auto' }}>
          <Tabs
            tabs={[
              { id: 'legacy', label: `레거시 강화 (${p.legacyPoints}점)` },
              { id: 'hall', label: '랭킹' },
              { id: 'ach', label: `업적 ${p.achievements.length}/${DATA.achievements.achievements.length}` },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === 'legacy' && (
            <>
              <div className="tiny muted">회사가 끝날 때마다(파산 포함) 레거시 점수를 받습니다. 강화는 새로 시작하는 커리어(와 진행 중인 커리어의 다음 회사)에 적용됩니다.</div>
              {msg && <div className="warn">{msg}</div>}
              <div className="legacy-grid">
                {DATA.career.legacy.map((l) => {
                  const lv = p.legacy[l.id] ?? 0;
                  const cost = legacyCost(l.id, lv);
                  return (
                    <div key={l.id} className="card col legacy">
                      <div className="row">
                        <b>{l.name}</b>
                        <span className="chip blue">
                          Lv {lv}/{l.max}
                        </span>
                      </div>
                      <div className="tiny muted">{l.desc}</div>
                      <button
                        className="btn small"
                        data-testid={`legacy-${l.id}`}
                        disabled={cost === null || p.legacyPoints < cost}
                        onClick={() =>
                          updateProfile((pp) => {
                            const err = buyLegacy(pp, l.id);
                            setMsg(err);
                            if (!err) play('levelup');
                          })
                        }
                      >
                        {cost === null ? '최대' : `강화 (${cost}점)`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {tab === 'hall' && (
            <div className="two-col">
              <div className="card">
                <div className="section-title">커리어 랭킹(최종 개인 자산)</div>
                <table className="t">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>창업자</th>
                      <th>엔딩</th>
                      <th>대표 회사</th>
                      <th className="r">자산</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.hall.map((h, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>
                          {h.name}
                          {h.challenge && <span className="chip amber">도전</span>}
                        </td>
                        <td>{h.ending}</td>
                        <td>{h.best}</td>
                        <td className="r">{wonShort(h.wealth)}</td>
                      </tr>
                    ))}
                    {p.hall.length === 0 && (
                      <tr>
                        <td colSpan={5} className="muted">
                          아직 은퇴한 창업자가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="card">
                <div className="section-title">회사 랭킹(창업자 몫)</div>
                <table className="t">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>회사</th>
                      <th>창업자</th>
                      <th className="r">금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.companyHall.map((h, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{h.company}</td>
                        <td>{h.founder}</td>
                        <td className="r">{wonShort(h.amount)}</td>
                      </tr>
                    ))}
                    {p.companyHall.length === 0 && (
                      <tr>
                        <td colSpan={4} className="muted">
                          아직 끝난 회사가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {tab === 'ach' && <AchievementGrid unlocked={p.achievements} />}
        </div>
      </div>
    </div>
  );
}

export function AchievementGrid({ unlocked }: { unlocked: string[] }) {
  return (
    <div className="ach-grid">
      {DATA.achievements.achievements.map((a) => {
        const on = unlocked.includes(a.id);
        const hidden = (a as { hidden?: boolean }).hidden && !on;
        return (
          <div key={a.id} className={`ach ${on ? 'on' : ''} ${a.tier}`}>
            <div className="ach-medal">{on ? '🏆' : '🔒'}</div>
            <div className="col" style={{ gap: 2 }}>
              <b>{hidden ? '???' : a.name}</b>
              <span className="tiny muted">{hidden ? '숨겨진 업적' : a.desc}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
