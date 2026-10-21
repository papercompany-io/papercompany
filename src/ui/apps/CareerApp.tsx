// 커리어 앱: 미션(튜토리얼·마일스톤), 회사 단계와 해금, 업적, 커리어 기록
import { PxIcon } from '../icons';
import { useState } from 'react';
import { DATA } from '../../core/data';
import { careerStats, endingFor, founderAge } from '../../core/career';
import { missionProgress, STAGE_NAMES, STAGE_UNLOCKS } from '../../core/progress';
import { useGame } from '../store';
import { Money, Tabs } from '../common';
import { AchievementGrid } from '../Hall';
import './apps.css';

export function CareerApp() {
  const s = useGame();
  const [tab, setTab] = useState<'missions' | 'stages' | 'ach' | 'career'>('missions');
  const st = careerStats(s);
  return (
    <div className="col">
      <Tabs
        tabs={[
          { id: 'missions', label: `미션 ${s.company.missionsDone.length}/${DATA.missions.missions.length}` },
          { id: 'stages', label: '단계와 해금' },
          { id: 'ach', label: `업적 ${s.career.achievements.length}/${DATA.achievements.achievements.length}` },
          { id: 'career', label: '커리어' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'missions' && (
        <table className="t">
          <tbody>
            {DATA.missions.missions.map((m) => {
              const done = s.company.missionsDone.includes(m.id);
              const p = missionProgress(s, m);
              const r = m.reward as { cash?: number; rep?: number; legacy?: number };
              return (
                <tr key={m.id} style={{ opacity: done ? 0.55 : 1 }}>
                  <td style={{ width: 24 }}>
                    <PxIcon id={done ? 'check' : 'empty'} size={16} />
                  </td>
                  <td>
                    <b>{m.name}</b>
                    <div className="tiny muted">{m.guide}</div>
                  </td>
                  <td style={{ width: 140 }}>
                    <div className="ms-bar">
                      <div style={{ width: `${(done ? 1 : p) * 100}%` }} />
                    </div>
                  </td>
                  <td className="tiny" style={{ width: 170 }}>
                    {[r.cash ? `자금 +${Math.round(r.cash / 1e4)}만` : '', r.rep ? `명성 +${r.rep}` : '', r.legacy ? `레거시 +${r.legacy}` : ''].filter(Boolean).join(' · ')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {tab === 'stages' && (
        <div className="col">
          {STAGE_NAMES.map((n, i) => (
            <div key={i} className="card col" style={{ opacity: i <= s.company.stage ? 1 : 0.6, borderLeft: `4px solid ${i <= s.company.stage ? 'var(--violet)' : 'var(--line)'}` }}>
              <div className="row">
                <b>
                  단계 {i} · {n}
                </b>
                {i === s.company.stage && <span className="chip blue">지금</span>}
                {i < s.company.stage && <span className="chip green">지남</span>}
              </div>
              <div className="tiny muted">
                {['시작', 'MVP 출시', 'MVP + 직원 1명 이상', '시리즈 B 이상 또는 직원 20명 이상', '시리즈 C 이상 또는 연매출 100억 이상', 'IPO 성공'][i]} → 열림: {STAGE_UNLOCKS[i].join(', ')}
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === 'ach' && <AchievementGrid unlocked={s.career.achievements} />}
      {tab === 'career' && (
        <div className="col">
          <div className="career-stats">
            <div>
              <span>창업자</span>
              <b>
                {s.career.founderName} · {Math.floor(founderAge(s))}세
              </b>
            </div>
            <div>
              <span>개인 자산</span>
              <b>
                <Money v={s.career.wealth} />
              </b>
            </div>
            <div>
              <span>명성</span>
              <b>{Math.round(s.career.rep)}</b>
            </div>
            <div>
              <span>Exit / 상장 / 파산</span>
              <b>
                {st.exits} / {st.ipos} / {st.bankruptcies}
              </b>
            </div>
          </div>
          <div className="tiny muted">
            은퇴(65세 또는 회사가 끝난 뒤 원할 때) 때의 자산·기록으로 엔딩이 정해집니다. 지금 예상 엔딩: <b>{endingFor(s).name}</b>. 이번 커리어에서 얻은 레거시 점수 {s.career.legacyEarned}점(회사가 끝날 때 명예의 전당에 적립).
            {s.career.challenge ? ` 도전 모드: ${DATA.career.challenges.find((c) => c.id === s.career.challenge)?.name}.` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
