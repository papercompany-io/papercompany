// PD-01~04 제품: 기능 트리와 로드맵, 개발·디자인 작업량, 버그(품질)와 기술 부채, 제품 매력도.
// MVP = 핵심(core) 기능을 모두 만든 상태. MVP가 나오면 국내 시장에 출시됩니다.
import { DATA, feature, featuresOf, featureWork, type FeatureDef, type FeatureFx } from './data';
import { yearOf } from './calendar';
import { mod } from './mods';
import { news, notify, sfx } from './notify';
import { post } from './messenger';
import { rand } from './rng';
import type { GameState, MarketId, RoadmapItem } from './types';

export const ROADMAP_MAX = 8;

export function featureLevel(s: GameState, id: string): number {
  return s.product.features[id] ?? 0;
}

export function coreFeatures(s: GameState): FeatureDef[] {
  return featuresOf(s.company.industry).filter((f) => f.cat === 'core');
}

export function hasMvp(s: GameState): boolean {
  return s.product.launchedDay !== null;
}

// 지금 개발할 수 있는지(선행 기능·등장 연도·회사 단계·최대 레벨)
export function featureLock(s: GameState, f: FeatureDef): string | null {
  const queued = s.product.roadmap.filter((r) => r.id === f.id).length;
  if (featureLevel(s, f.id) + queued >= f.levels) return f.levels > 1 ? '최대 레벨' : '완성됨';
  if (yearOf(s.day) < f.year) return `${f.year}년에 등장`;
  if (s.company.stage < f.stage) return `회사 단계 ${f.stage} 필요`;
  const miss = f.req.filter((r) => featureLevel(s, r) < 1 && !s.product.roadmap.some((x) => x.id === r && x.level === 1));
  if (miss.length) return `먼저 필요: ${miss.map((r) => feature(r).name).join(', ')}`;
  return null;
}

export function availableFeatures(s: GameState): FeatureDef[] {
  return featuresOf(s.company.industry).filter((f) => !featureLock(s, f));
}

export function addToRoadmap(s: GameState, id: string): string | null {
  const f = feature(id);
  const lock = featureLock(s, f);
  if (lock) return lock;
  if (s.product.roadmap.length >= ROADMAP_MAX) return `로드맵은 ${ROADMAP_MAX}개까지입니다.`;
  const queued = s.product.roadmap.filter((r) => r.id === id).length;
  s.product.roadmap.push({ id, level: featureLevel(s, id) + queued + 1, devDone: 0, designDone: 0 });
  return null;
}

export function removeFromRoadmap(s: GameState, index: number): string | null {
  const it = s.product.roadmap[index];
  if (!it) return '없는 항목입니다.';
  // 같은 기능의 더 높은 레벨이 뒤에 있으면 함께 빠집니다.
  s.product.roadmap = s.product.roadmap.filter((r, i) => i !== index && !(r.id === it.id && r.level > it.level));
  // 이 기능을 선행으로 둔 항목이 아직 안 만들어졌으면 빠집니다.
  s.product.roadmap = s.product.roadmap.filter((r) => feature(r.id).req.every((q) => featureLevel(s, q) >= 1 || s.product.roadmap.some((x) => x.id === q)));
  return null;
}

export function moveRoadmap(s: GameState, index: number, dir: -1 | 1) {
  const j = index + dir;
  const r = s.product.roadmap;
  if (j < 0 || j >= r.length) return;
  [r[index], r[j]] = [r[j], r[index]];
}

export function itemNeed(it: RoadmapItem) {
  return featureWork(feature(it.id), it.level);
}

// 지금까지 만든 기능의 작업량 합(코드베이스 크기). 버그 밀도 계산에 씁니다.
export function codebase(s: GameState): number {
  let w = 0;
  for (const [id, lv] of Object.entries(s.product.features)) {
    const f = feature(id);
    for (let l = 1; l <= lv; l++) {
      const n = featureWork(f, l);
      w += n.dev + n.design;
    }
  }
  return w;
}

// 개발 작업량을 로드맵에 넣습니다. flex=true면 그쪽 일이 없을 때 다른 쪽 일을 절반 효율로 합니다(디자이너 없는 초기 팀).
export function applyWork(s: GameState, amount: number, kind: 'dev' | 'design', flex: boolean, bugMult = 1, aiBoost = 0): number {
  let left = amount;
  let used = 0;
  let devUsed = 0;
  // 앞 항목부터 끝냅니다. flex면 그 항목의 다른 쪽 일(디자인↔개발)을 절반 효율로 메웁니다.
  for (const it of s.product.roadmap) {
    if (left <= 1e-9) break;
    const need = itemNeed(it);
    const boost = feature(it.id).fx.ai ? 1 + aiBoost : 1;
    const kinds: ['dev' | 'design', number][] = flex ? [[kind, 1], [kind === 'dev' ? 'design' : 'dev', 0.5]] : [[kind, 1]];
    for (const [k, eff] of kinds) {
      if (left <= 1e-9) break;
      const rate = eff * boost;
      if (k === 'dev' && it.devDone < need.dev) {
        const put = Math.min(left * rate, need.dev - it.devDone);
        it.devDone += put;
        left -= put / rate;
        used += put;
        devUsed += put;
      } else if (k === 'design' && it.designDone < need.design) {
        const put = Math.min(left * rate, need.design - it.designDone);
        it.designDone += put;
        left -= put / rate;
        used += put;
      }
    }
  }
  if (devUsed > 0) addBugs(s, devUsed, bugMult);
  shipReady(s);
  return used;
}

// 새로 만든 코드만큼 버그 밀도가 오릅니다(코드베이스가 클수록 같은 양의 영향이 작음).
export function addBugs(s: GameState, work: number, mult: number) {
  const W = codebase(s);
  const d = work * 0.35 * (1 + s.product.debt) * mult * (100 / (W + 150));
  s.product.bugs = Math.min(100, s.product.bugs + d);
  // 크런치·속도형 개발은 기술 부채를 쌓습니다.
  if (mult > 1.05) s.product.debt = Math.min(1.5, s.product.debt + work * 0.0004 * (mult - 1));
}

export function fixBugs(s: GameState, work: number, kind: 'stabilize' | 'debt' | 'infra') {
  const W = codebase(s);
  const scale = 100 / (W + 150);
  if (kind === 'stabilize') s.product.bugs = Math.max(0, s.product.bugs - work * 1.3 * scale);
  if (kind === 'debt') {
    s.product.bugs = Math.max(0, s.product.bugs - work * 0.7 * scale);
    s.product.debt = Math.max(0, s.product.debt - work * 0.002 * (300 / (W + 300)));
  }
  if (kind === 'infra') s.product.bugs = Math.max(0, s.product.bugs - work * 0.4 * scale);
}

// 개발팀 실력으로 출시 품질 판정(MG-04 완전·부분·실패)
function shipQuality(s: GameState): number {
  const devs = s.employees.filter((e) => e.dept === 'dev');
  const skill = devs.length ? devs.reduce((a, e) => a + e.skill, 0) / devs.length : 45;
  return Math.max(0.35, Math.min(0.95, 0.55 + (skill - 50) / 150 - s.product.debt * 0.15 - s.product.bugs / 400));
}

function shipReady(s: GameState) {
  const done: RoadmapItem[] = [];
  for (const it of s.product.roadmap) {
    const need = itemNeed(it);
    if (it.devDone >= need.dev - 1e-6 && it.designDone >= need.design - 1e-6 && it.level === featureLevel(s, it.id) + 1) done.push(it);
  }
  for (const it of done) ship(s, it);
}

function ship(s: GameState, it: RoadmapItem) {
  s.product.roadmap = s.product.roadmap.filter((x) => x !== it);
  const f = feature(it.id);
  s.product.features[it.id] = it.level;
  const q = shipQuality(s);
  const r = rand(s);
  const result: 'full' | 'partial' | 'fail' = r < q ? 'full' : r < q + (1 - q) * 0.6 ? 'partial' : 'fail';
  const extra = (f.fx.bugs ?? 0) + (result === 'partial' ? 6 : result === 'fail' ? 16 : 0);
  if (extra > 0) s.product.bugs = Math.min(100, s.product.bugs + extra * (100 / (codebase(s) + 150)) * 3);
  s.product.polish = Math.max(0, s.product.polish - 0.008);
  s.product.shipped.push({ id: it.id, level: it.level, day: s.day, result });
  if (s.product.shipped.length > 80) s.product.shipped.splice(0, s.product.shipped.length - 80);
  const label = result === 'full' ? '완전 수행' : result === 'partial' ? '부분 수행(버그 조금)' : '실패에 가까움(버그 많음)';
  const name = f.levels > 1 ? `${f.name} Lv${it.level}` : f.name;
  const ch = s.channels.some((c) => c.id === 'team-dev') ? 'team-dev' : 'all';
  post(s, ch, '시스템', `[출시] ${name} — ${label}`, 'system');
  s.events.push({ type: 'shipped', featureId: it.id });
  sfx(s, result === 'fail' ? 'warn' : 'coin');
  if (!hasMvp(s) && coreFeatures(s).every((c) => featureLevel(s, c.id) >= 1)) launchMvp(s);
  else notify(s, `기능 출시: ${name} (${label})`, result === 'fail' ? 'bad' : 'good', 'product');
  if (f.fx.market) notify(s, `${DATA.markets.markets.find((m) => m.id === f.fx.market)!.name} 진출 준비가 됐습니다. 시장 앱에서 진출할 수 있습니다.`, 'good', 'market');
}

function launchMvp(s: GameState) {
  s.product.launchedDay = s.day;
  const kr = s.markets.kr;
  kr.launched = true;
  kr.launchedDay = s.day;
  kr.awareness = Math.max(kr.awareness, 0.02);
  notify(s, `MVP 출시! ${s.company.name}이(가) 국내 시장에 나왔습니다. 이제 고객이 들어옵니다.`, 'mission', 'market');
  news(s, `[스타트업] ${s.company.name}, 첫 서비스 출시`, 'company');
  post(s, 'all', '시스템', 'MVP를 출시했습니다. 국내 시장에서 고객을 받기 시작합니다. 시장 앱에서 인지도·점유율을, 재무 앱에서 매출을 확인하세요.', 'system');
  s.events.push({ type: 'confetti' });
}

// 기능 효과 합(레벨 × 레벨당 효과)
export type FxTotals = Required<Omit<FeatureFx, 'enterprise' | 'market' | 'ai'>> & { enterprise: boolean; markets: MarketId[]; aiFeatures: number };

export function fxTotals(s: GameState): FxTotals {
  const t: FxTotals = { appeal: 0, conv: 0, churn: 0, pay: 0, arpu: 0, ad: 0, take: 0, gmv: 0, viral: 0, infra: 0, stability: 0, bugs: 0, enterprise: false, markets: ['kr'], aiFeatures: 0 };
  for (const [id, lv] of Object.entries(s.product.features)) {
    if (lv <= 0) continue;
    const fx = feature(id).fx;
    for (const k of ['appeal', 'conv', 'churn', 'pay', 'arpu', 'ad', 'take', 'gmv', 'viral', 'infra', 'stability'] as const) {
      const v = fx[k];
      if (typeof v === 'number') t[k] += v * lv;
    }
    if (fx.enterprise) t.enterprise = true;
    if (fx.market && !t.markets.includes(fx.market)) t.markets.push(fx.market);
    if (fx.ai) t.aiFeatures += lv;
  }
  // 수확 체감(A-45): 기능을 많이 쌓을수록 같은 효과가 덜 붙습니다.
  const soft = (x: number, k: number) => k * Math.log(1 + Math.max(0, x) / k);
  t.appeal = soft(t.appeal, 60);
  t.arpu = soft(t.arpu, 0.7);
  t.conv = soft(t.conv, 0.5);
  t.viral = soft(t.viral, 0.08);
  t.pay = soft(t.pay, 0.06);
  t.gmv = soft(t.gmv, 0.6);
  t.take = soft(t.take, 0.02);
  t.stability = soft(t.stability, 0.6);
  t.ad = soft(t.ad, 800);
  t.churn = -(1 - Math.exp(t.churn));
  t.infra = -(1 - Math.exp(t.infra));
  return t;
}

// 품질 0~100(버그가 많을수록 낮음)
export function quality(s: GameState): number {
  return Math.max(0, Math.round(100 - s.product.bugs));
}

// 제품 매력도: 기능 점수 × UX 완성도 × 품질 × 기간 효과
export function appeal(s: GameState): number {
  const base = fxTotals(s).appeal + s.product.appealBonus;
  const q = 1 - s.product.bugs / 200;
  return Math.max(0, base * (1 + s.product.polish) * q * (1 + mod(s, 'appeal')));
}

export function featuresDoneCount(s: GameState): number {
  return Object.values(s.product.features).reduce((a, b) => a + b, 0);
}
