// 커리어 메뉴: 미션(튜토리얼·마일스톤), 회사 단계와 해금, 업적, 커리어 기록
// 화면 짜임(A-163, 픽셀 느낌 A-166): 토스식 — 탭마다 맨 위 큰 한 문장(가운데) + 윤곽선 없는 납작한 면. 설명 글은 줄이고 자세한 말은 마우스를 올리면(title) 보입니다.
import { useState } from 'react';
import { DATA } from '../../core/data';
import { careerStats, endingFor, founderAge } from '../../core/career';
import { missionProgress, STAGE_NAMES, STAGE_UNLOCKS } from '../../core/progress';
import { useGame } from '../store';
import { Money, Tabs } from '../common';
import { AchievementGrid } from '../Hall';
import { PxIcon, type PxId } from '../icons';
import { PixelCheck, PixelFlag } from '../pixelMarks';
import './apps.css';

const STAGE_GOAL = ['시작', 'MVP 출시', 'MVP + 직원 1명 이상', '시리즈 B 이상 또는 직원 20명 이상', '시리즈 C 이상 또는 연매출 100억 이상', 'IPO 성공'];

type Mission = (typeof DATA.missions.missions)[number];

function rewardText(m: Mission): string[] {
  const r = m.reward as { cash?: number; rep?: number; legacy?: number };
  return [r.cash ? `자금 +${Math.round(r.cash / 1e4).toLocaleString('ko-KR')}만` : '', r.rep ? `명성 +${r.rep}` : '', r.legacy ? `레거시 +${r.legacy}` : ''].filter(Boolean);
}

function Head({ big, lead }: { big: string; lead?: string }) {
  return (
    <div className="cr-head">
      <h2 className="cr-big">{big}</h2>
      {lead && <p className="cr-lead">{lead}</p>}
    </div>
  );
}

export function CareerApp() {
  const s = useGame();
  const [tab, setTab] = useState<'missions' | 'stages' | 'ach' | 'career'>('missions');
  return (
    <div className="col cr">
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
      {tab === 'ach' && (
        <>
          <Head big={`업적 ${s.career.achievements.length}개를 모았습니다`} />
          <AchievementGrid unlocked={s.career.achievements} />
        </>
      )}
      {tab === 'career' && <Record />}
    </div>
  );
}

// 미션: 마일스톤 길. 달성한 미션은 초록 체크로 접어 두고, 지금 미션은 파랑 카드(길이 진행만큼 파랗게 채워짐), 앞 미션은 번호와 보상만 흐리게
function Missions() {
  const s = useGame();
  const [showDone, setShowDone] = useState(false);
  const all = DATA.missions.missions;
  const isDone = (m: Mission) => s.company.missionsDone.includes(m.id);
  const doneCount = all.filter(isDone).length;
  const now = all.find((m) => !isDone(m));
  const pct = now ? Math.round(missionProgress(s, now) * 100) : 100;
  return (
    <>
      <div className="cr-head">
        <h2 className="cr-big">{now ? `${doneCount}개 달성했습니다` : '모든 미션을 끝냈습니다'}</h2>
        {now && <p className="cr-lead">남은 미션 {all.length - doneCount}개</p>}
        <div className="cr-prog">
          <div className="ms-bar">
            <div style={{ width: `${(doneCount / all.length) * 100}%` }} />
          </div>
        </div>
      </div>
      {doneCount > 0 && (
        <button className="cr-fold" onClick={() => setShowDone((v) => !v)}>
          달성한 미션 {doneCount}개 {showDone ? '접기' : '보기'}
        </button>
      )}
      <ol className="cr-path">
        {all.map((m, i) => {
          const state = isDone(m) ? 'done' : m === now ? 'now' : 'next';
          if (state === 'done' && !showDone) return null;
          return (
            <li key={m.id} className={`cr-ms ${state}`} style={state === 'now' ? ({ '--p': `${pct}%` } as React.CSSProperties) : undefined} title={state === 'next' ? m.guide : undefined}>
              <span className="cr-dot">{state === 'done' ? <PixelCheck /> : state === 'now' ? <PixelFlag /> : i + 1}</span>
              <div className="cr-ms-body">
                <b>{m.name}</b>
                {state === 'now' && (
                  <>
                    <p className="cr-lead">{m.guide}</p>
                    <div className="cr-prog">
                      <b>{pct}%</b>
                      <div className="ms-bar">
                        <div style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="cr-reward">
                      {rewardText(m).map((r) => (
                        <span key={r} className="chip green">
                          {r}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {state === 'next' && <span className="cr-ms-rw">{rewardText(m).join(' · ')}</span>}
            </li>
          );
        })}
      </ol>
    </>
  );
}

// 회사 단계: 지난 단계는 체크, 지금 단계는 파랑 면, 앞 단계는 흐리게
function Stages() {
  const s = useGame();
  const stage = s.company.stage;
  const nextStage = stage + 1 < STAGE_NAMES.length ? stage + 1 : null;
  return (
    <>
      <Head big={STAGE_NAMES[stage]} lead={nextStage ? `다음 단계 조건: ${STAGE_GOAL[nextStage]}` : undefined} />
      <ol className="cr-road">
        {STAGE_NAMES.map((n, i) => {
          const state = i < stage ? 'past' : i === stage ? 'now' : 'next';
          return (
            <li key={i} className={`cr-step ${state}`}>
              <span className="cr-dot">{state === 'past' ? <PixelCheck /> : state === 'now' ? <PixelFlag /> : i}</span>
              <div className="cr-step-body">
                <div className="cr-step-head">
                  <b>{n}</b>
                  {state === 'now' && <span className="chip blue">지금</span>}
                </div>
                {i > 0 && state !== 'past' && <div className="cr-step-goal">{STAGE_GOAL[i]}</div>}
                {state !== 'past' && (
                  <div className="of-tags">
                    {STAGE_UNLOCKS[i].map((u) => (
                      <span key={u}>{u}</span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function Record() {
  const s = useGame();
  const st = careerStats(s);
  const stats: [string, React.ReactNode, PxId][] = [
    ['개인 자산', <Money key="w" v={s.career.wealth} />, 'coin'],
    ['명성', Math.round(s.career.rep), 'star'],
    ['Exit', st.exits, 'case'],
    ['상장', st.ipos, 'chart'],
    ['파산', st.bankruptcies, 'warn'],
  ];
  return (
    <>
      <Head big={`${s.career.founderName} ${Math.floor(founderAge(s))}세`} lead={s.career.challenge ? `도전 모드: ${DATA.career.challenges.find((c) => c.id === s.career.challenge)?.name}` : undefined} />
      <div className="cr-stats">
        {stats.map(([label, v, icon]) => (
          <div key={label}>
            <PxIcon id={icon} size={20} />
            <span>{label}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
      <div className="cr-tiles">
        <div title="65세에 은퇴하거나, 회사가 끝난 뒤 원할 때 은퇴하면 그때의 자산과 기록으로 엔딩이 정해집니다.">
          <span>이대로면 엔딩</span>
          <b>{endingFor(s).name}</b>
        </div>
        <div title="회사가 끝날 때 명예의 전당에 쌓여, 다음 커리어를 강화하는 데 씁니다.">
          <span>이번 커리어 레거시</span>
          <b>{s.career.legacyEarned}점</b>
        </div>
      </div>
    </>
  );
}
