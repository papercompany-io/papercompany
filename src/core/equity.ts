// EQ-01 창업 지분, EQ-02 투자 시 신주 발행과 희석, EQ-03 창업자 지분율 추적
import type { CapEntry, GameState } from './types';

export const INITIAL_SHARES = 1_000_000;

export function totalShares(table: CapEntry[]): number {
  return table.reduce((sum, c) => sum + c.shares, 0);
}

export function founderPct(s: GameState): number {
  const f = s.capTable.find((c) => c.kind === 'founder');
  return f ? f.shares / totalShares(s.capTable) : 0;
}

export function recordEquity(s: GameState, label: string) {
  s.equityHistory.push({
    day: s.day,
    label,
    founderPct: founderPct(s),
    totalShares: totalShares(s.capTable),
    table: s.capTable.map((c) => ({ ...c })),
  });
}

// 룸 r을 열면 신주 = 기존 주식 × r / (1 - r). 투자 후 신주 비율이 r이 됩니다.
export function newSharesForRoom(existing: number, room: number): number {
  return Math.round((existing * room) / (1 - room));
}
