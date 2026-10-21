// 기간 효과(이벤트 결과 등). 키마다 지금 살아 있는 값의 합을 씁니다.
import type { GameState } from './types';

export function addMod(s: GameState, key: string, value: number, days: number, label: string) {
  s.modifiers.push({ key, value, until: s.day + days, label });
}

export function mod(s: GameState, key: string): number {
  let v = 0;
  for (const m of s.modifiers) if (m.key === key && m.until > s.day) v += m.value;
  return v;
}

export function pruneMods(s: GameState) {
  s.modifiers = s.modifiers.filter((m) => m.until > s.day);
}

export function hasFlag(s: GameState, f: string) {
  return s.flags.includes(f);
}

export function setFlag(s: GameState, f: string) {
  if (!s.flags.includes(f)) s.flags.push(f);
}

export function clearFlag(s: GameState, f: string) {
  s.flags = s.flags.filter((x) => x !== f);
}
