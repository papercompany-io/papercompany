// PD-01~04 제품: 기능 트리와 로드맵, 개발·디자인 작업량, 버그(품질)와 기술 부채, 제품 매력도.
// MVP = 핵심(core) 기능을 모두 만든 상태. MVP가 나오면 국내 시장에 출시됩니다.
import { DATA, feature, FEATURE_RULES, featuresOf, featureWork, industry, type FeatureDef, type FeatureFx } from './data';
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

// 돈을 받을 수 있는지(A-111): 결제가 필요한 산업은 결제 기능을 만들어야 구독·거래 매출이 생깁니다.
export function canCharge(s: GameState, fx: FxTotals = fxTotals(s)): boolean {
  return !industry(s.company.industry).needsBilling || fx.billing;
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
  const c = insightCost(f, featureLevel(s, f.id) + queued + 1);
  if (c.n > insightHave(s, c.kind)) return c.kind === 'pay' ? '지불 의사 인사이트 부족' : '고객 인사이트 부족';
  return null;
}

// ── 기능 착수 조건(A-115): 고객 인사이트 ──
// 기능을 로드맵에 넣을 때(개발 착수) 인사이트를 씁니다. 수익화 기능은 돈을 내는 고객에게서만 쌓이는 지불 의사 인사이트를 써서 중반에 열립니다.
const IN = FEATURE_RULES.insight;
export type InsightKind = 'insight' | 'pay';

export function insightCost(f: FeatureDef, level: number): { kind: InsightKind; n: number } {
  const kind: InsightKind = f.cat === 'monetize' ? 'pay' : 'insight';
  // 핵심 기능과 첫 결제 기능은 무료(이게 없으면 출시도 매출도 없음)
  if (f.cat === 'core' || f.fx.billing) return { kind, n: 0 };
  const w = featureWork(f, level);
  const rate = (IN.rate as Record<string, number>)[f.cat] ?? 0.5;
  return { kind, n: Math.ceil((w.dev + w.design) * rate) };
}

export function insightHave(s: GameState, kind: InsightKind): number {
  return kind === 'pay' ? (s.product.payInsight ?? 0) : (s.product.insight ?? IN.start);
}

function insightAdd(s: GameState, kind: InsightKind, n: number) {
  if (kind === 'pay') s.product.payInsight = insightHave(s, 'pay') + n;
  else s.product.insight = insightHave(s, 'insight') + n;
}

// 돈을 내는 사용자 수: 결제를 받을 수 있을 때, 구독형은 유료 비율만큼, 거래형(커머스)은 사는 사람 모두
export function payingUsers(s: GameState, users: number, fx: FxTotals = fxTotals(s)): number {
  if (!canCharge(s, fx)) return 0;
  const ind = industry(s.company.industry);
  return users * (ind.gmv > 0 ? 1 : Math.min(1, ind.payBase + fx.pay));
}

// 하루에 쌓이는 인사이트. users·paying은 unit으로 나눈 값(산업마다 사용자 규모가 달라서), csOut = 고객지원 '의견 수집' 출력
export function insightGain(users: number, paying: number, csOut: number): { insight: number; pay: number } {
  // TODO(human)
  return { insight: 0, pay: 0 };
}

export function insightDay(s: GameState, users: number, csOut: number) {
  if (!hasMvp(s)) return;
  const unit = (IN.unit as Record<string, number>)[s.company.industry] ?? 1;
  const g = insightGain(users / unit, payingUsers(s, users) / unit, csOut);
  insightAdd(s, 'insight', g.insight);
  insightAdd(s, 'pay', g.pay);
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
  const level = featureLevel(s, id) + queued + 1;
  const c = insightCost(f, level);
  insightAdd(s, c.kind, -c.n);
  s.product.roadmap.push({ id, level, devDone: 0, designDone: 0 });
  return null;
}

// 창업 직후 로드맵에 핵심 기능(MVP)을 미리 넣어, 대표의 개발 칸이 첫날부터 MVP에 들어가게 합니다.
export function seedMvpRoadmap(s: GameState) {
  for (const f of coreFeatures(s)) if (!featureLock(s, f)) addToRoadmap(s, f.id);
}

// 하루 작업량으로 남은 일을 끝내는 데 걸리는 날수(앞 항목부터 순서대로 끝남).
// devRate: 개발 작업량/일(대표 포함), designRate: 디자이너 작업량/일. 디자이너가 없으면 개발 쪽이 디자인을 절반 효율로 합니다.
export function etaDays(items: RoadmapItem[], devRate: number, designRate: number): number[] {
  const out: number[] = [];
  let day = 0;
  for (const it of items) {
    const need = itemNeed(it);
    const devLeft = Math.max(0, need.dev - it.devDone);
    const designLeft = Math.max(0, need.design - it.designDone);
    if (devLeft + designLeft > 0) {
      if (designRate > 0) day += Math.max(devRate > 0 ? devLeft / devRate : devLeft > 0 ? Infinity : 0, designLeft / designRate);
      else day += devRate > 0 ? devLeft / devRate + designLeft / (devRate * 0.5) : Infinity;
    }
    out.push(Math.ceil(day));
  }
  return out;
}

export function removeFromRoadmap(s: GameState, index: number): string | null {
  const it = s.product.roadmap[index];
  if (!it) return '없는 항목입니다.';
  const before = s.product.roadmap;
  // 같은 기능의 더 높은 레벨이 뒤에 있으면 함께 빠집니다.
  s.product.roadmap = s.product.roadmap.filter((r, i) => i !== index && !(r.id === it.id && r.level > it.level));
  // 이 기능을 선행으로 둔 항목이 아직 안 만들어졌으면 빠집니다.
  s.product.roadmap = s.product.roadmap.filter((r) => feature(r.id).req.every((q) => featureLevel(s, q) >= 1 || s.product.roadmap.some((x) => x.id === q)));
  // 빠진 항목의 인사이트는 돌려받습니다(A-115)
  for (const r of before) {
    if (s.product.roadmap.includes(r)) continue;
    const c = insightCost(feature(r.id), r.level);
    insightAdd(s, c.kind, c.n);
  }
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
  // 유지보수(A-115): 만든 코드가 클수록 개발 출력 일부가 기존 기능을 지키는 데 빠집니다
  let left = kind === 'dev' ? amount * (1 - upkeepShare(s)) : amount;
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

// 개발 출력 중 유지보수로 빠지는 몫(0~maxShare)
export function upkeepShare(s: GameState): number {
  const U = FEATURE_RULES.upkeep;
  const W = codebase(s);
  return (U.maxShare * W) / (W + U.half);
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
  if (f.fx.market) notify(s, `${DATA.markets.markets.find((m) => m.id === f.fx.market)!.name} 진출 준비가 됐습니다. 시장·광고 메뉴에서 진출할 수 있습니다.`, 'good', 'market');
}

function launchMvp(s: GameState) {
  s.product.launchedDay = s.day;
  const kr = s.markets.kr;
  kr.launched = true;
  kr.launchedDay = s.day;
  // 홍보 없이 출시하면 아는 사람은 대표의 지인뿐입니다(A-95). 인지도는 네트워크만큼만 조금 오르고, 그 뒤 고객은 홍보·영업·입소문으로 늘립니다.
  kr.awareness += Math.min(0.006, s.networkPoints / 60000);
  const ind = industry(s.company.industry);
  const friends = Math.round(ind.friends + s.networkPoints * ind.friendsPerNet);
  kr.users += friends;
  const who = friends > 0 ? `대표의 지인 ${friends}${ind.unit === '고객사' ? '곳' : '명'}이 먼저 써 보기 시작했습니다` : '아직 아무도 모릅니다';
  notify(s, `MVP 출시! ${s.company.name}이(가) 국내 시장에 나왔습니다. ${who}. 고객을 늘리려면 광고·영업·콘텐츠로 알려야 합니다.`, 'mission', 'market');
  news(s, `[스타트업] ${s.company.name}, 첫 서비스 출시`, 'company');
  post(s, 'all', '시스템', 'MVP를 출시했습니다. 홍보하지 않으면 지인 말고는 거의 들어오지 않습니다. 시장·광고 메뉴에서 광고 예산을 정하거나 대표 일정에 "영업"을 넣으세요.', 'system');
  s.events.push({ type: 'confetti' });
}

// 기능 효과 합(레벨 × 레벨당 효과)
export type FxTotals = Required<Omit<FeatureFx, 'enterprise' | 'market' | 'ai' | 'billing'>> & { enterprise: boolean; billing: boolean; markets: MarketId[]; aiFeatures: number };

export function fxTotals(s: GameState): FxTotals {
  const t: FxTotals = { appeal: 0, conv: 0, churn: 0, pay: 0, arpu: 0, ad: 0, take: 0, gmv: 0, viral: 0, infra: 0, stability: 0, bugs: 0, enterprise: false, billing: false, markets: ['kr'], aiFeatures: 0 };
  for (const [id, lv] of Object.entries(s.product.features)) {
    if (lv <= 0) continue;
    const fx = feature(id).fx;
    for (const k of ['appeal', 'conv', 'churn', 'pay', 'arpu', 'ad', 'take', 'gmv', 'viral', 'infra', 'stability'] as const) {
      const v = fx[k];
      if (typeof v === 'number') t[k] += v * lv;
    }
    if (fx.enterprise) t.enterprise = true;
    if (fx.billing) t.billing = true;
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
  return Math.max(0, base * (1 + s.product.polish) * q * complexityMult(s) * (1 + mod(s, 'appeal')));
}

// 복잡도(A-115): 기능 레벨 합이 UX 완성도로 감당할 만큼을 넘으면 쓰기 어려워져 매력도가 깎입니다(곱하기)
export function complexityMult(s: GameState): number {
  const C = FEATURE_RULES.complexity;
  const room = C.base + s.product.polish * C.perPolish;
  return 1 - Math.min(C.max, Math.max(0, featuresDoneCount(s) - room) * C.perLevel);
}

// 매력도 구성(기능 화면의 "매력도가 어디서 오나"): 기능별 점수(수확 체감을 비율대로 나눔) × UX 완성도 × 품질 × 기간 효과
export function appealBreakdown(s: GameState) {
  const raw = Object.entries(s.product.features)
    .filter(([, lv]) => lv > 0)
    .map(([id, lv]) => ({ id, name: feature(id).name, pts: (feature(id).fx.appeal ?? 0) * lv }))
    .filter((x) => x.pts > 0);
  const sum = raw.reduce((a, x) => a + x.pts, 0);
  const scale = sum > 0 ? fxTotals(s).appeal / sum : 0;
  const parts = raw.map((x) => ({ ...x, pts: x.pts * scale })).sort((a, b) => b.pts - a.pts);
  return {
    parts,
    bonus: s.product.appealBonus,
    polish: s.product.polish, // 곱하기 (1 + polish)
    quality: 1 - s.product.bugs / 200, // 곱하기
    complexity: complexityMult(s), // 곱하기
    other: mod(s, 'appeal'), // 곱하기 (1 + other)
    total: appeal(s),
  };
}

// 경쟁사 사이 매력도 순위(1위부터)
export function appealRank(s: GameState): { rank: number; of: number } {
  const me = appeal(s);
  const alive = s.competitors.filter((c) => c.alive);
  return { rank: 1 + alive.filter((c) => c.appeal > me).length, of: alive.length + 1 };
}

export function featuresDoneCount(s: GameState): number {
  return Object.values(s.product.features).reduce((a, b) => a + b, 0);
}
