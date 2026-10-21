import { useState } from 'react';
import { Boot } from './Boot';
import { Setup } from './Setup';
import { Game } from './Game';
import { Result } from './Result';
import { setGame } from './store';
import type { GameState } from '../core/types';

type Screen = 'boot' | 'setup' | 'game' | 'result';

export function App() {
  const [screen, setScreen] = useState<Screen>('boot');
  const [notice, setNotice] = useState<string | null>(null);

  const startGame = (s: GameState) => {
    setGame(s);
    setScreen('game');
  };

  if (screen === 'boot')
    return (
      <Boot
        onNew={() => setScreen('setup')}
        onContinue={(s, msg) => {
          setNotice(msg);
          startGame(s);
        }}
      />
    );
  if (screen === 'setup') return <Setup onDone={startGame} />;
  if (screen === 'result')
    return (
      <Result
        onNewCompany={() => {
          setGame(null);
          setScreen('boot');
        }}
      />
    );
  return <Game notice={notice} clearNotice={() => setNotice(null)} onEnded={() => setScreen('result')} />;
}
