// 시드 고정 PRNG(mulberry32). 상태를 GameState.rng에 저장해 불러오기 후에도 같은 순서로 이어집니다(A-30).
import type { GameState } from './types';

export function nextRandom(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) | 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

export function rand(s: GameState): number {
  const [v, next] = nextRandom(s.rng);
  s.rng = next;
  return v;
}

export function randInt(s: GameState, min: number, max: number): number {
  return min + Math.floor(rand(s) * (max - min + 1));
}

export function randRange(s: GameState, min: number, max: number): number {
  return min + rand(s) * (max - min);
}

export function pick<T>(s: GameState, arr: T[]): T {
  return arr[Math.floor(rand(s) * arr.length)];
}

export function weighted<T>(s: GameState, items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand(s) * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

// 이벤트 없이 0~1 사이 Poisson 근사: 기대값 lambda만큼 도착 수를 뽑습니다.
export function poisson(s: GameState, lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand(s);
  } while (p > L && k < 20);
  return k - 1;
}

export function makeSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
