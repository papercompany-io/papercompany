// 화면 흐름: 부팅 → (새 커리어) 셋업 → 게임 → 회사 끝(커리어 화면) → 다음 회사 셋업 → … → 은퇴 엔딩 → 명예의 전당
import { useEffect, useState } from 'react';
import { Boot } from './Boot';
import { Setup } from './Setup';
import { Game } from './Game';
import { Career, Ending } from './Career';
import { Hall } from './Hall';
import { Weekly } from './Weekly';
import type { WeeklyChallenge } from '../platform/online';
import { beginCommandRecording, getGame, recordTransition, restoreCommandRecording, setGame, touch, type SavedRecording } from './store';
import { saveNow } from './autosave';
import { getProfile, setProfile, updateProfile } from './meta';
import { loadProfile, onAppClosing } from '../platform/save';
import { newCareer, nextCompany, ownedSpecs, type SetupChoices } from '../core/state';
import { emptyProfile, recordCareerInProfile, recordCompanyInProfile, retire } from '../core/career';
import { formatDate } from '../core/calendar';
import type { GameState } from '../core/types';
import { play, setMusicOn } from './sound';

type Screen = 'boot' | 'setup' | 'game' | 'career' | 'next' | 'ending' | 'hall' | 'weekly';

// 주간 도전 판 표시. 도전 판은 빈 프로필로 시작해야 서버가 시드와 명령 기록만으로 다시 돌릴 수 있습니다
const WEEKLY_FLAG = 'weekly:';
export function isWeeklyRun(s: GameState): boolean {
  return s.flags.some((f) => f.startsWith(WEEKLY_FLAG));
}

// 회사가 끝나면 프로필(레거시 점수·회사 랭킹·업적)에 한 번만 기록합니다.
export function syncProfile(s: GameState) {
  updateProfile((p) => {
    for (const a of s.career.achievements) if (!p.achievements.includes(a)) p.achievements.push(a);
    if (s.ended && s.result && !s.flags.includes('profiled')) {
      recordCompanyInProfile(p, s, formatDate(s.day));
      s.flags.push('profiled');
    }
    if (s.career.retired && !s.flags.includes('hall')) {
      recordCareerInProfile(p, s, formatDate(s.day));
      s.flags.push('hall');
    }
  });
}

export function App() {
  const [screen, setScreen] = useState<Screen>('boot');
  const [notice, setNotice] = useState<string | null>(null);
  const [continued, setContinued] = useState(false);
  const [weekly, setWeekly] = useState<WeeklyChallenge | undefined>(undefined);

  useEffect(() => {
    void loadProfile().then(setProfile);
  }, []);
  useEffect(() => onAppClosing(() => saveNow('종료')), []);
  // 배경음악(A-246): 게임 화면에서만 재생. 브라우저가 막으면 다음 입력 때 다시 시도
  useEffect(() => {
    setMusicOn(screen === 'game');
    if (screen !== 'game') return;
    const retry = () => setMusicOn(true);
    document.addEventListener('pointerdown', retry);
    document.addEventListener('keydown', retry);
    return () => {
      document.removeEventListener('pointerdown', retry);
      document.removeEventListener('keydown', retry);
    };
  }, [screen]);

  const startGame = (s: GameState, setup: SetupChoices, challengeId?: string) => {
    setGame(s);
    if (challengeId) beginCommandRecording(challengeId, setup);
    setScreen('game');
  };

  if (screen === 'boot')
    return (
      <Boot
        onNew={() => { setWeekly(undefined); setScreen('setup'); }}
        onHall={() => setScreen('hall')}
        onWeekly={() => setScreen('weekly')}
        onContinue={(s, msg, replay) => {
          setNotice(msg);
          setGame(s);
          if (isWeeklyRun(s)) restoreCommandRecording(replay as SavedRecording | null);
          if (s.ended) {
            setScreen('career');
            return;
          }
          s.pauseReason = '저장한 회사를 불러왔습니다';
          setContinued(true);
          setScreen('game');
        }}
      />
    );
  if (screen === 'hall') return <Hall onBack={() => setScreen('boot')} />;
  if (screen === 'weekly') return <Weekly onBack={() => setScreen('boot')} onStart={(challenge) => {
    setWeekly(challenge);
    setScreen('setup');
  }} />;
  if (screen === 'setup')
    return (
      <Setup
        mode="new"
        weekly={weekly}
        onCancel={() => setScreen(weekly ? 'weekly' : 'boot')}
        onDone={(c) => {
          setContinued(false);
          const s = newCareer(c, weekly ? emptyProfile() : getProfile());
          if (weekly) s.flags.push(WEEKLY_FLAG + weekly.id);
          startGame(s, c, weekly?.id);
          void saveNow('새 커리어');
        }}
      />
    );
  const g = getGame();
  if (screen === 'next' && g)
    return (
      <Setup
        mode="next"
        wealth={g.career.wealth}
        legacy={{ ...(isWeeklyRun(g) ? emptyProfile() : getProfile()).legacy }}
        challenge={g.career.challenge}
        owned={ownedSpecs(g)}
        onCancel={() => setScreen('career')}
        onDone={(c) => {
          const weeklyFlag = g.flags.find((f) => f.startsWith(WEEKLY_FLAG));
          g.career.legacy = { ...(isWeeklyRun(g) ? emptyProfile() : getProfile()).legacy };
          const err = nextCompany(g, c);
          if (err) return;
          recordTransition({ type: 'nextCompany', setup: c });
          if (weeklyFlag) g.flags.push(weeklyFlag);
          setContinued(false);
          touch();
          setScreen('game');
          void saveNow('다음 회사');
        }}
      />
    );
  if (screen === 'career' && g)
    return (
      <Career
        s={g}
        onNext={() => setScreen('next')}
        onRetire={() => {
          retire(g);
          recordTransition({ type: 'retire' });
          syncProfile(g);
          void saveNow('은퇴');
          setScreen('ending');
        }}
      />
    );
  if (screen === 'ending' && g) return <Ending s={g} onHome={() => setScreen('hall')} />;
  return (
    <Game
      continued={continued}
      notice={notice}
      clearNotice={() => setNotice(null)}
      onEnded={() => {
        const s = getGame();
        if (s) syncProfile(s);
        setScreen('career');
      }}
    />
  );
}
