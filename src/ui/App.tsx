// 화면 흐름: 부팅 → (새 커리어) 셋업 → 게임 → 회사 끝(커리어 화면) → 다음 회사 셋업 → … → 은퇴 엔딩 → 명예의 전당
import { useEffect, useState } from 'react';
import { Boot } from './Boot';
import { Setup } from './Setup';
import { Game } from './Game';
import { Career, Ending } from './Career';
import { Hall } from './Hall';
import { getGame, setGame, touch } from './store';
import { saveNow } from './autosave';
import { getProfile, setProfile, updateProfile } from './meta';
import { loadProfile, onAppClosing } from '../platform/save';
import { newCareer, nextCompany, ownedSpecs } from '../core/state';
import { recordCareerInProfile, recordCompanyInProfile, retire } from '../core/career';
import { formatDate } from '../core/calendar';
import type { GameState } from '../core/types';
import { play, startMusic } from './sound';

type Screen = 'boot' | 'setup' | 'game' | 'career' | 'next' | 'ending' | 'hall';

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

  useEffect(() => {
    void loadProfile().then(setProfile);
  }, []);
  useEffect(() => onAppClosing(() => saveNow('종료')), []);
  // 배경음악(A-246): 첫 입력이 있어야 브라우저가 소리를 허용합니다
  useEffect(() => {
    const go = () => {
      startMusic();
      document.removeEventListener('pointerdown', go);
      document.removeEventListener('keydown', go);
    };
    document.addEventListener('pointerdown', go);
    document.addEventListener('keydown', go);
    return () => {
      document.removeEventListener('pointerdown', go);
      document.removeEventListener('keydown', go);
    };
  }, []);
  // 화면 전체 UI 효과음: 누를 수 있는 버튼은 클릭음, 런처 아이콘·선택지 카드에 마우스를 올리면 짧은 틱
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest('button, .tab, select');
      if (el && !(el as HTMLButtonElement).disabled) play('click');
    };
    let lastHover: Element | null = null;
    const over = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest('.icon:not(.locked), .dc-choice:not(:disabled), .order:not(:disabled), .feat:not(:disabled)');
      if (el && el !== lastHover) play('type');
      lastHover = el ?? null;
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('mouseover', over);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('mouseover', over);
    };
  }, []);

  const startGame = (s: GameState) => {
    setGame(s);
    setScreen('game');
  };

  if (screen === 'boot')
    return (
      <Boot
        onNew={() => setScreen('setup')}
        onHall={() => setScreen('hall')}
        onContinue={(s, msg) => {
          setNotice(msg);
          setGame(s);
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
  if (screen === 'setup')
    return (
      <Setup
        mode="new"
        onCancel={() => setScreen('boot')}
        onDone={(c) => {
          setContinued(false);
          const s = newCareer(c, getProfile());
          startGame(s);
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
        legacy={{ ...getProfile().legacy }}
        challenge={g.career.challenge}
        owned={ownedSpecs(g)}
        onCancel={() => setScreen('career')}
        onDone={(c) => {
          g.career.legacy = { ...getProfile().legacy };
          const err = nextCompany(g, c);
          if (err) return;
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
