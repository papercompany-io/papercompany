// 커리어 메뉴: 미션(튜토리얼·마일스톤), 회사 단계와 해금, 업적, 커리어 기록
// 화면 짜임(A-106): 미션은 "지금 할 일" 큰 카드 + 남은 미션 줄 + 끝낸 미션 접기, 단계는 세로 길(점·선)
import { PxIcon } from '../icons';
import { useState } from 'react';
import { DATA } from '../../core/data';
import { careerStats, endingFor, founderAge } from '../../core/career';
import { missionProgress, STAGE_NAMES, STAGE_UNLOCKS } from '../../core/progress';
import { useGame } from '../store';
import { Money, Tabs } from '../common';
import { AchievementGrid } from '../Hall';
import './apps.css';

const STAGE_GOAL = ['시작', 'MVP 출시', 'MVP + 직원 1명 이상', '시리즈 B 이상 또는 직원 20명 이상', '시리즈 C 이상 또는 연매출 100억 이상', 'IPO 성공'];

type Mission = (typeof DATA.missions.missions)[number];

function rewardText(m: Mission): string[] {
  const r = m.reward as { cash?: number; rep?: number; legacy?: number };
  return [r.cash ? `자금 +${Math.round(r.cash / 1e4).toLocaleString('ko-KR')}만` : '', r.rep ? `명성 +${r.rep}` : '', r.legacy ? `레거시 +${r.legacy}` : ''].filter(Boolean);
}

export function CareerApp() {
  const s = useGame();
  const [tab, setTab] = useState<'missions' | 'stages' | 'ach' | 'career'>('missions');
  return (
    <div className="col car">
      <Tabs
        tabs={[
          { id: 'missions', label: `미션 ${s.company.missionsDone.length}/${DATA.missions.missions.length}` },
          { id: 'stages', label: `회사 단계 ${s.company.stage}` },
          { id: 'ach', label: `업적 ${s.career.achievements.length}/${DATA.achievements.achievements.length}` },
          { id: 'career', label: '내 기록' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'missions' && <Missions />}
      {tab === 'stages' && <Stages />}
      {tab === 'ach' && <AchievementGrid unlocked={s.career.achievements} />}
      {tab === 'career' && <Record />}
    </div>
  );
}

function Missions() {
  const s = useGame();
  const [showDone, setShowDone] = useState(false);
  const all = DATA.missions.missions;
  const todo = all.filter((m) => !s.company.missionsDone.includes(m.id));
  const done = all.filter((m) => s.company.missionsDone.includes(m.id));
  const [now, ...next] = todo;
  return (
    <div className="col">
      {now ? (
        <section className="car-now">
          <div className="hf-label">지금 할 일</div>
          <div className="car-now-name">{now.name}</div>
          <div className="car-now-guide">{now.guide}</div>
          <div className="car-progress">
            <div className="ms-bar">
              <div style={{ width: `${missionProgress(s, now) * 100}%` }} />
            </div>
            <b>{Math.round(missionProgress(s, now) * 100)}%</b>
          </div>
          <div className="car-reward">
            {rewardText(now).map((r) => (
              <span key={r} className="chip green">
                {r}
              </span>
            ))}
          </div>
        </section>
      ) : (
        <div className="empty-note">모든 미션을 끝냈습니다!</div>
      )}
      {next.length > 0 && (
        <section className="car-list">
          <div className="hf-title">다음 미션</div>
          {next.map((m) => (
            <div key={m.id} className="car-row">
              <PxIcon id="empty" size={16} />
              <div className="car-row-text">
                <b>{m.name}</b>
                <span>{m.guide}</span>
              </div>
              <div className="ms-bar">
                <div style={{ width: `${missionProgress(s, m) * 100}%` }} />
              </div>
            </div>
          ))}
        </section>
      )}
      {done.length > 0 && (
        <section className="car-list done">
          <button className="pc-link" onClick={() => setShowDone((v) => !v)}>
            끝낸 미션 {done.length}개 {showDone ? '접기' : '보기'} ›
          </button>
          {showDone &&
            done.map((m) => (
              <div key={m.id} className="car-row">
                <PxIcon id="check" size={16} />
                <div className="car-row-text">
                  <b>{m.name}</b>
                </div>
              </div>
            ))}
        </section>
      )}
    </div>
  );
}

// 회사 단계: 세로 길. 지난 단계는 체크, 지금 단계는 파랑, 앞 단계는 흐리게
function Stages() {
  const s = useGame();
  return (
    <ol className="car-road">
      {STAGE_NAMES.map((n, i) => {
        const state = i < s.company.stage ? 'past' : i === s.company.stage ? 'now' : 'next';
        return (
          <li key={i} className={`car-step ${state}`}>
            <span className="car-dot">{state === 'past' ? '✓' : i}</span>
            <div className="car-step-body">
              <div className="car-step-head">
                <b>{n}</b>
                {state === 'now' && <span className="chip blue">지금</span>}
              </div>
              {i > 0 && <div className="car-step-goal">{state === 'next' ? '조건: ' : ''}{STAGE_GOAL[i]}</div>}
              <div className="of-tags">
                {STAGE_UNLOCKS[i].map((u) => (
                  <span key={u}>{u}</span>
                ))}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Record() {
  const s = useGame();
  const st = careerStats(s);
  return (
    <div className="hire-layout">
      <section className="hire-form">
        <div className="hf-label">창업자</div>
        <div className="car-now-name">
          {s.career.founderName} <span className="car-age">{Math.floor(founderAge(s))}세</span>
        </div>
        <div className="emp-top car-stats">
          <div className="hf-sum">
            <span>개인 자산</span>
            <b>
              <Money v={s.career.wealth} />
            </b>
          </div>
          <div className="hf-sum">
            <span>명성</span>
            <b>{Math.round(s.career.rep)}</b>
          </div>
          <div className="hf-sum">
            <span>Exit</span>
            <b>{st.exits}</b>
          </div>
          <div className="hf-sum">
            <span>상장</span>
            <b>{st.ipos}</b>
          </div>
          <div className="hf-sum">
            <span>파산</span>
            <b>{st.bankruptcies}</b>
          </div>
        </div>
        {s.career.challenge && <div className="tiny muted">도전 모드: {DATA.career.challenges.find((c) => c.id === s.career.challenge)?.name}</div>}
      </section>
      <section className="post-list">
        <div className="post-card" style={{ ['--dc' as string]: 'var(--c-violet-600)' }}>
          <div className="hf-label">이대로면 엔딩</div>
          <div className="car-ending">{endingFor(s).name}</div>
          <div className="pc-foot">
            <span>65세에 은퇴하거나, 회사가 끝난 뒤 원할 때 은퇴하면 그때의 자산과 기록으로 엔딩이 정해집니다.</span>
          </div>
        </div>
        <div className="post-card" style={{ ['--dc' as string]: 'var(--caution)' }}>
          <div className="hf-label">이번 커리어 레거시</div>
          <div className="car-ending">{s.career.legacyEarned}점</div>
          <div className="pc-foot">
            <span>회사가 끝날 때 명예의 전당에 쌓여, 다음 커리어를 강화하는 데 씁니다.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
