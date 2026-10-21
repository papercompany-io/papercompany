import { useEffect, useState } from 'react';
import { Boot } from './Boot';
import { Setup } from './Setup';
import { Game } from './Game';
import { Result } from './Result';
import { setGame } from './store';
import { saveNow } from './autosave';
import { onAppClosing } from '../platform/save';
import type { GameState } from '../core/types';

type Screen = 'boot' | 'setup' | 'game' | 'result';

export function App() {
  const [screen, setScreen] = useState<Screen>('boot');
  const [notice, setNotice] = useState<string | null>(null);
  const [continued, setContinued] = useState(false);

  const startGame = (s: GameState) => {
    setGame(s);
    setScreen('game');
  };

  // DT-07 종료 직전 저장
  useEffect(() => onAppClosing(() => saveNow('종료')), []);

  if (screen === 'boot')
    return (
      <Boot
        onNew={() => setScreen('setup')}
        onContinue={(s, msg) => {
          setNotice(msg);
          // 끝난 판이면 결과 화면을, 아니면 멈춘 상태로 이어서 엽니다(A-29).
          if (s.ended) {
            setGame(s);
            setScreen('result');
            return;
          }
          s.pauseReason = '저장한 회사를 불러왔습니다';
          setContinued(true);
          startGame(s);
        }}
      />
    );
  if (screen === 'setup')
    return (
      <Setup
        onDone={(s) => {
          setContinued(false);
          startGame(s);
        }}
      />
    );
  if (screen === 'result')
    return (
      <Result
        onNewCompany={() => {
          setGame(null);
          setScreen('boot');
        }}
      />
    );
  return <Game continued={continued} notice={notice} clearNotice={() => setNotice(null)} onEnded={() => setScreen('result')} />;
}
