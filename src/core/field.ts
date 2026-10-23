// 시장 순위 채우기(A-161): 시장마다 순위표가 30곳 안팎이 되도록 이름 있는 현지 회사를 채우고, 회사마다 기업가치·주가를 매깁니다.
// 점유율 규칙은 그대로입니다 — 현지 기업·대체재 몫(A-47) 일부를 이 회사들에 나눠 보여 줄 뿐입니다.
// 상태를 저장하지 않고 (커리어 시드·산업·시장·자리)의 해시로 정합니다. 게임 난수(s.rng)를 쓰지 않아 봇 결과가 그대로입니다.
import { DATA, industry, market, tamMultOf } from './data';
import { yearFrac } from './calendar';
import { econ } from './economy';
import { adoption } from './market';
import { nextRandom } from './rng';
import type { Competitor, GameState, IndustryId, MarketId } from './types';

const F = DATA.markets.field;
const START = yearFrac(0); // 게임 세계가 시작하는 해(2027)

// 같은 입력이면 늘 같은 0~1(FNV-1a → mulberry32 한 번)
function hash(...parts: (string | number)[]): number {
  const str = parts.join('|');
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return nextRandom(h)[0];
}

function gauss(...key: (string | number)[]): number {
  return Math.sqrt(-2 * Math.log(Math.max(1e-9, hash(...key, 'u')))) * Math.cos(2 * Math.PI * hash(...key, 'v'));
}

const between = ([lo, hi]: number[], u: number) => lo + (hi - lo) * u;
const logBetween = ([lo, hi]: number[], u: number) => lo * Math.pow(hi / lo, u);

// 부드러운 흔들림(-1~1): period일마다 해시 값을 찍고 그 사이를 매끄럽게 잇습니다.
function wave(key: string, day: number, period: number): number {
  const t = day / period;
  const i = Math.floor(t);
  const f = t - i;
  const a = hash(key, period, i) * 2 - 1;
  const b = hash(key, period, i + 1) * 2 - 1;
  return a + (b - a) * f * f * (3 - 2 * f);
}

const dayAt = (year: number) => Math.round((year - START) * 365.25);

export interface FieldCo {
  id: string;
  key: string; // 해시 키(시드 포함)
  name: string;
  home: MarketId;
  w: number; // 기본 덩치
  from: number; // 세운 해(소수)
  to: number | null; // 문 닫는 해
  ipo: number | null; // 상장하는 해(안 하면 null)
  mult: number; // 기업가치 배수(같은 고객이라도 회사마다 다름)
  basePrice: number; // 상장 무렵 주가대(주식 수를 정함)
}

const pools = new Map<string, FieldCo[]>();

// 시장 하나의 후보 회사들. 시드·산업·시장마다 한 번 만들고 기억합니다.
export function fieldPool(seed: number, ind: IndustryId, m: MarketId): FieldCo[] {
  const key = `${seed}|${ind}|${m}`;
  const hit = pools.get(key);
  if (hit) return hit;
  const nm = (F.names as Record<MarketId, { sep: string; pre: string[] }>)[m];
  const words = (F.words as Record<IndustryId, string[]>)[ind];
  const taken = new Set(industry(ind).competitorNames);
  const list: FieldCo[] = [];
  for (let i = 0; i < F.pool; i++) {
    const k = `${key}|${i}`;
    let name = '';
    for (let t = 0; t < 40 && (!name || taken.has(name)); t++) name = nm.pre[Math.floor(hash(k, 'pre', t) * nm.pre.length)] + nm.sep + words[Math.floor(hash(k, 'word', t) * words.length)];
    taken.add(name);
    const from = hash(k, 'old') < F.established ? between([F.foundedFrom, START], hash(k, 'from')) : between([START, F.entrantsUntil], hash(k, 'from'));
    list.push({
      id: `f-${m}-${i}`,
      key: k,
      name,
      home: m,
      w: Math.exp(F.weightSigma * gauss(k, 'w')),
      from,
      to: hash(k, 'close') < F.closeChance ? from + between(F.closeAfter, hash(k, 'closeAt')) : null,
      ipo: hash(k, 'ipo') < (F.listed as Record<MarketId, number>)[m] ? from + between(F.ipoAfter, hash(k, 'ipoAt')) : null,
      mult: Math.exp(F.valueSigma * gauss(k, 'mult')),
      basePrice: logBetween(F.basePrice, hash(k, 'price')),
    });
  }
  pools.set(key, list);
  return list;
}

const alive = (c: FieldCo, y: number) => y >= c.from && (c.to === null || y < c.to);

// 그날의 덩치: 새 회사는 몇 년 동안 크고, 닫기 전엔 줄고, 몇 년 주기로 천천히 오르내립니다.
function weightAt(c: FieldCo, y: number, day: number): number {
  if (!alive(c, y)) return 0;
  const ramp = Math.min(1, (y - c.from + 0.25) / F.rampYears);
  const fade = c.to === null ? 1 : Math.min(1, (c.to - y) / F.fadeYears);
  return c.w * ramp * fade * Math.exp(F.drift * wave(c.key, day, F.driftDays));
}

// 시장 m의 이름 있는 회사: 현지·대체재 몫(사람 수 others)의 namedShare를 덩치대로 나누고, 큰 순서로 count곳
export function fieldUsers(s: GameState, m: MarketId, others: number, count: number): { co: FieldCo; users: number }[] {
  if (count <= 0) return [];
  const y = yearFrac(s.day);
  const live = fieldPool(s.seed, s.company.industry, m)
    .map((co) => ({ co, w: weightAt(co, y, s.day) }))
    .filter((x) => x.w > 0);
  const total = live.reduce((a, x) => a + x.w, 0);
  return live
    .sort((a, b) => b.w - a.w)
    .slice(0, count)
    .map((x) => ({ co: x.co, users: (others * F.namedShare * x.w) / total }));
}

// ── 기업가치·주가 ──

export interface Quote {
  price: number; // 주가(원)
  change: number; // 전날 대비(비율)
}

export interface Valued {
  value: number; // 기업가치(상장사는 시가총액)
  quote: Quote | null; // 비상장이면 null
}

// 시장 심리(배수): 느린·중간 흔들림 + 하루 흔들림
function mood(key: string, day: number): number {
  const V = F.vol;
  return Math.exp(V.slow * wave(key, day, 240) + V.mid * wave(key, day, 30) + V.day * gauss(key, 'day', day));
}

// 기업가치 = (고객 가치 × 경기 + 팀·기술 기본 몫 + 상장했으면 공모 자금) × 회사 배수
// worth = 시장 객단가 배수를 곱한 고객 수 합. 고객 1명당 가치는 우리 회사 사용자 기반 평가(A-49)와 같은 산업 값
function companyValue(s: GameState, worth: number, mult: number, isListed: boolean, ec = econ(s, 'valuation')): number {
  return (worth * industry(s.company.industry).userValue * ec + F.baseValue + (isListed ? F.listedValue : 0)) * mult;
}

// 상장사: 시가총액 = 가치 × 심리, 주가 = 시가총액 ÷ 주식 수
function listed(value: number, shares: number, key: string, day: number): Valued {
  const now = mood(key, day);
  const cap = value * now;
  return { value: cap, quote: { price: cap / shares, change: now / mood(key, day - 1) - 1 } };
}

// 주식 수 = 상장 무렵 예상 몸값 ÷ 주가대. 회사마다 주가 수준이 달라지고, 그 뒤로 몸값이 크면 주가도 오릅니다.
const sharesFor = (refValue: number, basePrice: number) => Math.max(1e5, Math.round(refValue / basePrice));

export function fieldValue(s: GameState, co: FieldCo, worth: number): Valued {
  const ipo = co.ipo;
  if (ipo === null || yearFrac(s.day) < ipo) return { value: companyValue(s, worth, co.mult, false), quote: null };
  // 예상 몸값: 상장하던 해 그 시장에서 현지 몫(경쟁사 하나만큼 있다고 봄)을 덩치대로 나눈 고객
  const ind = industry(s.company.industry);
  const md = market(co.home);
  const wSum = fieldPool(s.seed, ind.id, co.home).filter((c) => alive(c, ipo)).reduce((a, c) => a + c.w, 0) || co.w;
  const ref = ind.tam * tamMultOf(ind.id, co.home) * adoption(ind, dayAt(ipo)) * (md.local / (md.local + 1)) * F.namedShare * (co.w / wSum) * md.arpu;
  return listed(companyValue(s, worth, co.mult, true), sharesFor(companyValue(s, ref, co.mult, true, 1), co.basePrice), co.key, s.day);
}

// 경쟁사: 기업가치 + 보유 자금. 상장 여부·시기는 이름과 시드로 정합니다(처음 보일 때 이미 몇 년 된 회사일 수 있음).
export function rivalValue(s: GameState, c: Competitor, worth: number): Valued {
  const key = `${s.seed}|${c.id}|${c.name}`;
  const mult = Math.exp(F.valueSigma * gauss(key, 'mult'));
  const cash = Math.max(0, c.cash);
  const ipo = hash(key, 'ipo') < F.rivalListed ? yearFrac(c.bornDay) - between(F.rivalAge, hash(key, 'age')) + between(F.ipoAfter, hash(key, 'ipoAt')) : null;
  if (ipo === null || yearFrac(s.day) < ipo) return { value: companyValue(s, worth, mult, false) + cash, quote: null };
  // 예상 몸값: 상장하던 해 국내에서 처음 경쟁사들과 비슷한 몫
  const ind = industry(s.company.industry);
  const ref = (ind.tam * adoption(ind, dayAt(ipo))) / (ind.startCompetitors + 2);
  return listed(companyValue(s, worth, mult, true) + cash, sharesFor(companyValue(s, ref, mult, true, 1), logBetween(F.basePrice, hash(key, 'price'))), key, s.day);
}
