import type { GameState } from './types';

export function nextId(s: GameState, prefix: string): string {
  s.idSeq += 1;
  return `${prefix}${s.idSeq}`;
}
