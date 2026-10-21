// EQ-01 창업 지분, EQ-02 신주 발행과 희석, EQ-03 창업자 지분 추적, EQ-04 ESOP 풀과 스톡옵션 베스팅, FR-12 SAFE 전환
import { DATA } from './data';
import { notify } from './notify';
import type { CapEntry, Employee, GameState } from './types';

export const INITIAL_SHARES = 1_000_000;

export function totalShares(table: CapEntry[]): number {
  return table.reduce((sum, c) => sum + c.shares, 0);
}

export function founderShares(s: GameState): number {
  return s.capTable.find((c) => c.kind === 'founder')?.shares ?? 0;
}

export function founderPct(s: GameState): number {
  const t = totalShares(s.capTable);
  return t > 0 ? founderShares(s) / t : 0;
}

export function investorPct(s: GameState): number {
  const t = totalShares(s.capTable);
  return t > 0 ? s.capTable.filter((c) => c.kind === 'investor' || c.kind === 'public').reduce((a, c) => a + c.shares, 0) / t : 0;
}

export function recordEquity(s: GameState, label: string) {
  s.equityHistory.push({ day: s.day, label, founderPct: founderPct(s), totalShares: totalShares(s.capTable), table: s.capTable.map((c) => ({ ...c })) });
  if (s.equityHistory.length > 60) s.equityHistory.splice(1, s.equityHistory.length - 60);
}

export function newSharesForRoom(existing: number, room: number): number {
  return Math.round((existing * room) / (1 - room));
}

// ── ESOP(EQ-04) ──
export function esopEntry(s: GameState): CapEntry | undefined {
  return s.capTable.find((c) => c.kind === 'esop');
}

// 풀 만들기: 투자 후 지분 기준 pct만큼 새 주식을 풀에 넣습니다(모든 주주가 같은 비율로 희석). [Claude 제안] OQ-048 풀 크기는 플레이어가 고름
export function createEsop(s: GameState, pct: number): string | null {
  if (esopEntry(s)) return '이미 ESOP 풀이 있습니다. 풀을 늘리려면 추가 발행을 하세요.';
  if (pct <= 0 || pct > 0.2) return '풀 크기는 1~20%입니다.';
  const n = newSharesForRoom(totalShares(s.capTable), pct);
  s.capTable.push({ holderId: 'esop', name: 'ESOP 풀(임직원 몫)', kind: 'esop', shares: n });
  if (!s.flags.includes('esop')) s.flags.push('esop');
  recordEquity(s, `ESOP 풀 ${(pct * 100).toFixed(0)}% 생성`);
  return null;
}

export function topUpEsop(s: GameState, pct: number): string | null {
  const e = esopEntry(s);
  if (!e) return createEsop(s, pct);
  const n = newSharesForRoom(totalShares(s.capTable), pct);
  e.shares += n;
  recordEquity(s, `ESOP 풀 ${(pct * 100).toFixed(0)}% 추가`);
  return null;
}

export function esopFree(s: GameState): number {
  const e = esopEntry(s);
  if (!e) return 0;
  const granted = s.employees.reduce((a, x) => a + x.options, 0);
  return Math.max(0, e.shares - granted);
}

// 베스팅 일정(EQ-04 예시값 2년 20%, 3년 40%, 이어서 80%, 100% → 4년 80%, 5년 100%로 해석, A-40)
export function vestedFraction(s: GameState, e: Employee): number {
  if (e.optionDay === null || e.options <= 0) return 0;
  const y = (s.day - e.optionDay) / 365;
  if (y >= 5) return 1;
  if (y >= 4) return 0.8;
  if (y >= 3) return 0.4;
  if (y >= 2) return 0.2;
  return 0;
}

export function unvestedOptions(s: GameState, e: Employee): number {
  return Math.round(e.options * (1 - vestedFraction(s, e)));
}

export function grantOptions(s: GameState, e: Employee, shares: number): string | null {
  if (!esopEntry(s)) return '먼저 ESOP 풀을 만들어야 합니다(투자 앱 → 지분).';
  if (shares <= 0) return '줄 주식 수를 정하세요.';
  if (shares > esopFree(s)) return 'ESOP 풀에 남은 주식이 부족합니다.';
  if (e.options > 0 && e.optionDay !== null) {
    // 추가 지급은 기존 베스팅 일정에 합칩니다(단순화).
  } else e.optionDay = s.day;
  e.options += shares;
  e.sat = Math.min(100, e.sat + 10);
  e.bubble = { text: '📈', until: s.day + 4 };
  return null;
}

// 퇴사: 베스팅된 몫은 "임직원 주주"로 옮기고, 안 된 몫은 풀로 돌아갑니다(OQ-048 [Claude 제안]).
export function forfeitOptions(s: GameState, e: Employee) {
  if (e.options <= 0) return;
  const vested = Math.round(e.options * vestedFraction(s, e));
  const pool = esopEntry(s);
  if (vested > 0 && pool) {
    pool.shares -= vested;
    let emp = s.capTable.find((c) => c.kind === 'employee');
    if (!emp) {
      emp = { holderId: 'employees', name: '전·현직 임직원', kind: 'employee', shares: 0 };
      s.capTable.push(emp);
    }
    emp.shares += vested;
  }
  e.options = 0;
}

// Exit 때 베스팅된 옵션은 모두 행사된 것으로 봅니다(풀에 남은 주식도 희석으로 셈, SC-01 [CS]).
export function vestAllOnExit(s: GameState) {
  for (const e of s.employees) forfeitOptions(s, { ...e, optionDay: e.optionDay !== null ? -99999 : null });
}

// ── SAFE(FR-12) ──
// 다음 지분 라운드에서 전환: 전환 가격 = min(캡 ÷ 투자 전 주식 수, 라운드 주당 가격 × (1 − 할인)). OQ-049 [Claude 제안]
export function safeConversion(s: GameState, preValue: number, existingShares: number) {
  const roundPrice = preValue / existingShares;
  let shares = 0;
  const parts: { name: string; investorId: string; shares: number; amount: number }[] = [];
  for (const sf of s.safes) {
    const capPrice = sf.cap / existingShares;
    const price = Math.min(capPrice, roundPrice * (1 - sf.discount));
    for (const h of sf.holders) {
      const n = Math.round(h.amount / price);
      shares += n;
      parts.push({ name: h.name, investorId: h.investorId, shares: n, amount: h.amount });
    }
  }
  return { shares, parts };
}

export function convertSafes(s: GameState, preValue: number) {
  if (!s.safes.length) return 0;
  const existing = totalShares(s.capTable);
  const conv = safeConversion(s, preValue, existing);
  for (const p of conv.parts) s.capTable.push({ holderId: `${p.investorId}@safe`, name: `${p.name}(SAFE 전환)`, kind: 'investor', shares: p.shares, round: 'SAFE' });
  s.safes = [];
  notify(s, `SAFE가 이번 라운드에서 주식 ${conv.shares.toLocaleString('ko-KR')}주로 전환됐습니다.`, 'info', 'invest');
  return conv.shares;
}

export function safeTotal(s: GameState): number {
  return s.safes.reduce((a, x) => a + x.amount, 0);
}

void DATA;
