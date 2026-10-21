// 게임 상태 저장소: 코어 함수가 상태를 직접 바꾸고, 바꾼 뒤 버전을 올려 화면을 다시 그립니다.
import { useSyncExternalStore } from 'react';
import type { GameState } from '../core/types';

let current: GameState | null = null;
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version++;
  for (const l of listeners) l();
}

export function setGame(s: GameState | null) {
  current = s;
  emit();
}

export function getGame(): GameState | null {
  return current;
}

// 코어 액션을 실행하고 화면을 갱신합니다. 반환값(오류 문구 등)을 그대로 돌려줍니다.
export function act<T>(fn: (s: GameState) => T): T | undefined {
  if (!current) return undefined;
  const out = fn(current);
  emit();
  return out;
}

export function touch() {
  emit();
}

export function useGame(): GameState {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
  );
  return current!;
}

export function useVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
  );
}
