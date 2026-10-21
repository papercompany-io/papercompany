// 경기 순환(Claude 제안): 호황·보통·불황이 몇 달~몇 년씩 이어지며 투자·수요·기업가치·채용에 영향을 줍니다.
import { DATA } from './data';
import { news } from './notify';
import { randInt, weighted } from './rng';
import type { EconomyPhase, GameState } from './types';

export function phaseDef(id: EconomyPhase) {
  return DATA.economy.phases.find((p) => p.id === id)!;
}

// 경기 효과 값. 국면이 바뀔 때 갑자기 튀지 않게 level(0~1 보간)을 씁니다.
export function econ(s: GameState, key: keyof ReturnType<typeof phaseDef>['fx']): number {
  const cur = phaseDef(s.economy.phase).fx[key];
  const base = phaseDef('normal').fx[key];
  return base + (cur - base) * s.economy.level;
}

export function startPhase(s: GameState, phase: EconomyPhase, months?: number) {
  const def = phaseDef(phase);
  const m = months ?? randInt(s, def.months[0], def.months[1]);
  s.economy = { phase, until: s.day + m * 30, level: phase === 'normal' ? 1 : 0 };
}

// 하루마다: 국면 효과를 서서히 키우고, 기간이 끝나면 다음 국면으로
export function economyDay(s: GameState) {
  s.economy.level = Math.min(1, s.economy.level + 1 / 60);
  if (s.day < s.economy.until) return;
  const nx = phaseDef(s.economy.phase).next as unknown as Record<string, number>;
  const ids = Object.keys(nx) as EconomyPhase[];
  const next = weighted(s, ids, ids.map((k) => nx[k]));
  startPhase(s, next);
  const text =
    next === 'boom'
      ? '[경제] 투자 시장에 돈이 몰립니다. 벤처 투자가 크게 늘고 기업가치 평가가 후해지고 있습니다(호황).'
      : next === 'recession'
        ? '[경제] 경기 침체가 시작됐습니다. 투자가 얼어붙고 고객들이 지갑을 닫고 있습니다(불황).'
        : '[경제] 경기가 평소 수준으로 돌아왔습니다(보통).';
  news(s, text, 'economy');
}
