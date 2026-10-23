// 광고(A-116): 채널별 예산·궁합·한계(무릎)·피로·시즌, 성과 기록, 캠페인(문구 고르기·대박/실패·논란)
// 시장 하루 처리(marketDay)가 adDay·campaignDay로 "알리기 몫"과 "바로 데려오기 몫"을 받아 인지도·광고 고객에 씁니다.
import { DATA, industry, market, tamMultOf } from './data';
import { dateOf } from './calendar';
import { spendNow } from './finance';
import { josa } from './format';
import { nextId } from './ids';
import { addMod } from './mods';
import { news, notify } from './notify';
import { rand } from './rng';
import type { Campaign, GameState, MarketId } from './types';

const AD = DATA.ads;
// JSON의 _note 칸 때문에 색인 타입으로 한 번만 바꿔 둠
const SEASONS = AD.seasons as unknown as Record<string, Record<string, number>>;
const SEASON_NAMES = AD.seasonNames as unknown as Record<string, Record<string, string>>;
const MIX = AD.defaultMix as unknown as Record<string, Record<string, number>>;
export type ChannelDef = (typeof AD.channels)[number];
export type CampaignDef = (typeof AD.campaigns)[number];

export function channelDef(id: string): ChannelDef | undefined {
  return AD.channels.find((c) => c.id === id);
}

export function campaignDef(id: string): CampaignDef | undefined {
  return AD.campaigns.find((c) => c.id === id);
}

// 시장 전체를 다 알리는 데 드는 돈(원). 채널 무릎·캠페인 비용의 기준
export function fullInform(s: GameState, m: MarketId): number {
  const ind = industry(s.company.industry);
  const md = market(m);
  return ind.tam * tamMultOf(ind.id, m) * ind.adCost * md.adCost; // A-156
}

export function audience(s: GameState): 'b2b' | 'b2c' {
  return ((AD.audience as Record<string, string>)[s.company.industry] ?? 'b2c') as 'b2b' | 'b2c';
}

export function seasonMult(s: GameState): number {
  const month = String(dateOf(s.day).getMonth() + 1);
  return (SEASONS[audience(s)] ?? {})[month] ?? 1;
}

export function seasonName(s: GameState): string | null {
  const month = String(dateOf(s.day).getMonth() + 1);
  return (SEASON_NAMES[audience(s)] ?? {})[month] ?? null;
}

export function channelFit(s: GameState, id: string): number {
  return (channelDef(id)?.fit as Record<string, number> | undefined)?.[s.company.industry] ?? 1;
}

// 궁합은 숫자 대신 말로(화면용)
export function fitLabel(s: GameState, id: string): { text: string; tone: '' | 'green' | 'red' } {
  const f = channelFit(s, id);
  return f >= 1.15 ? { text: '우리와 잘 맞음', tone: 'green' } : f <= 0.75 ? { text: '우리와 안 맞음', tone: 'red' } : { text: '보통', tone: '' };
}

// 규모로 열림(A-157): unlock = {b2c, b2b} 사용자 수(회사 최고 기록). 그 갈래 키가 없으면 이 산업은 못 씀(null)
type Unlock = { unlock?: { b2c?: number; b2b?: number } };
export function unlockNeed(s: GameState, x: Unlock): number | null {
  if (!x.unlock) return 0;
  return x.unlock[audience(s)] ?? null;
}

export function scaleOpen(s: GameState, x: Unlock): boolean {
  const need = unlockNeed(s, x);
  return need !== null && s.company.peakUsers >= need;
}

export function channelsFor(s: GameState): ChannelDef[] {
  return AD.channels.filter((c) => s.company.stage >= c.stage && scaleOpen(s, c));
}

// 아직 안 열린 채널·캠페인(규모가 모자람). 화면 예고용: 이름과 필요한 사용자 수
export function lockedByScale(s: GameState): { name: string; need: number; kind: 'channel' | 'campaign' }[] {
  const out: { name: string; need: number; kind: 'channel' | 'campaign' }[] = [];
  for (const c of AD.channels) {
    const n = unlockNeed(s, c);
    if (n !== null && s.company.peakUsers < n) out.push({ name: c.name, need: n, kind: 'channel' });
  }
  for (const c of AD.campaigns) {
    const n = unlockNeed(s, c as Unlock);
    if (n !== null && s.company.peakUsers < n) out.push({ name: c.name, need: n, kind: 'campaign' });
  }
  return out.sort((a, b) => a.need - b.need);
}

// 규모 사다리 n에서 새로 열리는 채널·캠페인 이름(성장 알림용)
export function opensAt(s: GameState, n: number): string[] {
  return [...AD.channels, ...AD.campaigns].filter((x) => unlockNeed(s, x as Unlock) === n).map((x) => x.name);
}

// 마케팅팀(A-157): 마케터 수만큼 일손이 늘어 동시에 돌리는 채널이 늘고, 캠페인 준비가 빨라지고 결과가 덜 흔들립니다
export function marketers(s: GameState): number {
  return s.employees.filter((e) => e.dept === 'marketing').length;
}

export function adSlots(s: GameState): number {
  return AD.team.slotsBase + marketers(s);
}

// 지금 실제로 도는 채널: 예산이 있는 열린 채널 중 예산이 큰 순서로 일손(adSlots)만큼
export function runningChannels(s: GameState, m: MarketId): string[] {
  const mix = adMix(s, m);
  const open = new Set(channelsFor(s).map((c) => c.id));
  return Object.entries(mix)
    .filter(([id, v]) => (v ?? 0) > 0 && open.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, adSlots(s))
    .map(([id]) => id);
}

// 채널별 월 예산. 예전 저장(채널 없음)은 총예산을 산업 기본 비율로 나눠 봄
export function adMix(s: GameState, m: MarketId): Record<string, number> {
  const ms = s.markets[m];
  if (ms.ads) return Object.fromEntries(Object.entries(ms.ads).filter(([, v]) => (v ?? 0) > 0)) as Record<string, number>;
  const mix = MIX[s.company.industry] ?? {};
  const out: Record<string, number> = {};
  for (const [c, r] of Object.entries(mix)) if (c !== '_note') out[c] = Math.round((ms.adBudget * r) / 1e5) * 1e5;
  return out;
}

export function setChannelBudget(s: GameState, m: MarketId, channel: string, monthly: number): string | null {
  const ms = s.markets[m];
  const mix = adMix(s, m);
  const v = Math.max(0, Math.round(monthly / 1e5) * 1e5);
  // 새 채널을 켜려면 일손이 남아야 함(A-157)
  if (v > 0 && !((mix[channel] ?? 0) > 0) && Object.values(mix).filter((x) => x > 0).length >= adSlots(s))
    return `지금은 채널 ${adSlots(s)}개까지 돌릴 수 있습니다. 다른 채널을 끄거나 마케터를 뽑으면 하나씩 늘어납니다.`;
  mix[channel] = v;
  ms.ads = mix;
  ms.adBudget = Object.values(mix).reduce((a, x) => a + x, 0);
  return null;
}

// 총예산 한 번에 정하기(봇·예전 화면): 지금 비율(없으면 산업 기본 비율)대로 나눔
export function setTotalAdBudget(s: GameState, m: MarketId, monthly: number) {
  const ms = s.markets[m];
  const total = Math.max(0, Math.round(monthly / 1e5) * 1e5);
  const cur = adMix(s, m);
  const sum = Object.values(cur).reduce((a, v) => a + v, 0);
  const base = sum > 0 ? cur : Object.fromEntries(Object.entries(MIX[s.company.industry] ?? {}).filter(([k]) => k !== '_note'));
  const bsum = Object.values(base).reduce((a, v) => a + v, 0) || 1;
  // 일손(A-157)만큼만: 열린 채널 중 비율이 큰 순서로
  const open = new Set(channelsFor(s).map((c) => c.id));
  const use = Object.entries(base)
    .filter(([c, v]) => open.has(c) && v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, adSlots(s));
  const usum = use.reduce((a, [, v]) => a + v, 0) || bsum;
  const out: Record<string, number> = {};
  for (const [c, v] of use) out[c] = Math.round(((total * v) / usum) / 1e5) * 1e5;
  ms.ads = out;
  ms.adBudget = Object.values(out).reduce((a, v) => a + v, 0);
}

export interface AdPart {
  id: string;
  spent: number; // 하루 쓴 돈
  aware: number; // 알리기 몫(원 환산)
  direct: number; // 바로 데려오기 몫(원 환산)
}

// 채널 하나의 실제 효과(원 환산): 한계(무릎) · 궁합 · 피로 · 시즌
export function channelEffect(s: GameState, m: MarketId, id: string, daily: number): number {
  const c = channelDef(id);
  if (!c || daily <= 0) return 0;
  const knee = (c.knee / 100) * fullInform(s, m) / 30;
  const fat = s.markets[m].adFatigue?.[id] ?? 0;
  return (daily / (1 + daily / knee)) * channelFit(s, id) * (1 - AD.fatigue.max * fat) * seasonMult(s);
}

// 하루 광고 집행: 돈을 쓰고 피로를 쌓고, 알리기·데려오기 몫을 돌려줌. 돈이 모자라면 그날은 쉼
export function adDay(s: GameState, m: MarketId): { aware: number; direct: number; parts: AdPart[] } {
  const ms = s.markets[m];
  const mix = adMix(s, m);
  // 일손이 모자라 쉬는 채널은 돈도 쓰지 않음(A-157)
  const run = new Set(runningChannels(s, m));
  const total = [...run].reduce((a, id) => a + (mix[id] ?? 0), 0) / 30;
  const parts: AdPart[] = [];
  const fat = (ms.adFatigue ??= {});
  const canPay = total > 0 && s.cash > total;
  if (canPay) spendNow(s, '', total, 'ads', true);
  for (const c of AD.channels) {
    const daily = canPay && run.has(c.id) ? (mix[c.id] ?? 0) / 30 : 0;
    const knee = (c.knee / 100) * fullInform(s, m) / 30;
    // 피로: 세게 돌릴수록 빨리 쌓이고, 쉬면 풀림
    const f = fat[c.id] ?? 0;
    fat[c.id] = daily > 0 ? Math.min(1, f + AD.fatigue.gain * Math.min(1, daily / knee)) : Math.max(0, f - AD.fatigue.recover);
    if (daily <= 0) continue;
    const eff = channelEffect(s, m, c.id, daily);
    parts.push({ id: c.id, spent: daily, aware: eff * c.aware, direct: eff * c.direct });
  }
  return { aware: parts.reduce((a, p) => a + p.aware, 0), direct: parts.reduce((a, p) => a + p.direct, 0), parts };
}

// 성과 기록(약 30일 이동 평균, 하루 값). 데려온 고객은 바로 데려오기 몫, 인지도는 알리기 몫 비율로 나눔
export function recordAdStats(s: GameState, m: MarketId, parts: AdPart[], gotPaid: number, awareGain: number) {
  const ms = s.markets[m];
  const st = (ms.adStats ??= {});
  const dSum = parts.reduce((a, p) => a + p.direct, 0) || 1;
  const aSum = parts.reduce((a, p) => a + p.aware, 0) || 1;
  const a = 1 / 30;
  for (const c of AD.channels) {
    const p = parts.find((x) => x.id === c.id);
    const cur = st[c.id] ?? { spent: 0, got: 0, aware: 0 };
    const today = { spent: p?.spent ?? 0, got: p ? (gotPaid * p.direct) / dSum : 0, aware: p ? (awareGain * p.aware) / aSum : 0 };
    if (!p && cur.spent < 1 && cur.got < 0.001) continue;
    st[c.id] = { spent: cur.spent + (today.spent - cur.spent) * a, got: cur.got + (today.got - cur.got) * a, aware: cur.aware + (today.aware - cur.aware) * a };
  }
}

// ── 캠페인 ──
export function campaignCost(s: GameState, def: CampaignDef, m: MarketId): number {
  // 사람마다 혜택을 주는 캠페인(친구 초대·충성 고객)은 그 시장 사용자 수에 비례해 더 듦(A-157)
  const per = extra(def).perUser?.[audience(s)] ?? 0;
  return Math.round((Math.max(def.minCost, (def.costPct / 100) * fullInform(s, m)) + per * s.markets[m].users) / 1e5) * 1e5;
}

export function activeCampaigns(s: GameState, m?: MarketId): Campaign[] {
  return (s.campaigns ?? []).filter((c) => !c.done && (!m || c.market === m));
}

// 캠페인에만 있는 칸(A-157): 준비 기간, 시작할 때 기간 효과, 할 수 있는 달·해
type CampaignExtra = Unlock & { prep?: number; onStart?: { key: string; value: number; days: number; label: string }; months?: number[]; evenYears?: boolean; once?: boolean; refresh?: boolean; riskP?: number; perUser?: { b2c?: number; b2b?: number }; cooldown?: number };
function extra(def: CampaignDef): CampaignExtra {
  return def as CampaignExtra;
}

// 준비 기간(일): 마케터가 많을수록 짧음. 마케터가 없으면 대행사가 원래 기간대로 준비
export function prepDays(s: GameState, def: CampaignDef): number {
  const p = extra(def).prep ?? 0;
  return p <= 0 ? 0 : Math.ceil(p / (1 + AD.team.prepPer * marketers(s)));
}

export function campaignBlock(s: GameState, defId: string, m: MarketId): string | null {
  const def = campaignDef(defId);
  if (!def) return '없는 캠페인입니다.';
  if (!s.markets[m].launched) return '이 시장에 먼저 진출해야 합니다.';
  if (s.company.stage < def.stage) return `회사 단계 ${def.stage}부터 할 수 있습니다.`;
  const x = extra(def);
  const need = unlockNeed(s, x);
  if (need === null) return '우리 사업에는 맞지 않는 캠페인입니다.';
  if (s.company.peakUsers < need) return `규모: 사용자가 ${need.toLocaleString('ko-KR')}을 넘으면 열립니다.`;
  const d = dateOf(s.day);
  if (x.months && !x.months.includes(d.getUTCMonth() + 1)) return `${x.months.join('·')}월에만 할 수 있습니다.`;
  if (x.evenYears && d.getUTCFullYear() % 2 !== 0) return '대회가 열리는 해(짝수 해)에만 할 수 있습니다.';
  if (activeCampaigns(s, m).some((c) => c.def === defId)) return '이미 진행 중입니다.';
  if (x.once && (s.campaigns ?? []).some((c) => c.def === defId && c.startDay >= s.company.startDay)) return '회사마다 한 번만 할 수 있습니다.';
  const lastEnd = Math.max(-Infinity, ...(s.campaigns ?? []).filter((c) => c.def === defId && c.market === m && c.done).map((c) => c.endDay));
  if (x.cooldown && s.day < lastEnd + x.cooldown) return `다시 하려면 ${lastEnd + x.cooldown - s.day}일 더 기다려야 합니다.`;
  if (s.cash < campaignCost(s, def, m)) return '자금이 부족합니다.';
  return null;
}

export function startCampaign(s: GameState, defId: string, m: MarketId, toneId: string): string | null {
  const err = campaignBlock(s, defId, m);
  if (err) return err;
  // 끝난 캠페인은 최근 20개만 남김(저장 크기)
  if (s.campaigns) {
    const done = s.campaigns.filter((c) => c.done);
    if (done.length > 20) s.campaigns = [...done.slice(-20), ...s.campaigns.filter((c) => !c.done)];
  }
  const def = campaignDef(defId)!;
  const cost = campaignCost(s, def, m);
  spendNow(s, `광고 캠페인: ${def.name}`, cost, 'ads');
  s.accrual.adsOnce = (s.accrual.adsOnce ?? 0) + cost; // A-195
  if (extra(def).refresh) {
    s.markets[m].adFatigue = {};
    (s.campaigns ??= []).push({ id: nextId(s, 'cp'), def: defId, market: m, tone: toneId, startDay: s.day, endDay: s.day, cost, mult: 1, risk: false, got: 0, aware: 0, done: true });
    notify(s, `${market(m).name} 광고를 새 소재로 바꿨습니다. 지쳤던 광고가 다시 힘을 냅니다.`, 'good', 'market');
    return null;
  }
  const tone = AD.tones.find((x) => x.id === toneId) ?? AD.tones[0];
  const fit = (tone.fit as Record<string, number>)[audience(s)] ?? 1;
  // 마케터가 많을수록 결과가 덜 흔들림(대박도 저조도 줄어듦, A-157)
  const steady = 1 / (1 + AD.team.steady * marketers(s));
  const mult = Math.max(0.15, fit * (1 + tone.spread * steady * (rand(s) * 2 - 1)));
  const risk = rand(s) < (extra(def).riskP ?? 0);
  const prep = prepDays(s, def);
  (s.campaigns ??= []).push({ id: nextId(s, 'cp'), def: defId, market: m, tone: toneId, startDay: s.day, prepUntil: s.day + prep, endDay: s.day + prep + def.days, cost, mult, risk, got: 0, aware: 0, done: false });
  if (prep > 0) notify(s, `"${def.name}" 준비를 시작했습니다. ${prep}일 뒤에 시작합니다.${marketers(s) ? '' : ' (마케터가 있으면 더 빨리 준비합니다)'}`, 'info', 'market');
  return null;
}

// 준비가 끝난 캠페인 시작(A-157): 시작 알림과 시작할 때 기간 효과(친구 초대 = 입소문, 충성 고객 = 덜 떠남)
function startPrepared(s: GameState) {
  for (const c of activeCampaigns(s)) {
    if (c.live || c.prepUntil === undefined || s.day < c.prepUntil) continue;
    c.live = true;
    const def = campaignDef(c.def)!;
    const on = extra(def).onStart;
    if (on) addMod(s, on.key, on.value, on.days, on.label);
    if (c.prepUntil > c.startDay) notify(s, `"${def.name}" 준비를 마치고 시작했습니다(${market(c.market).name}, ${def.days}일).`, 'good', 'market');
  }
}

// 하루치 캠페인 효과(원 환산). 결과 배율이 곱해짐
export function campaignDay(s: GameState, m: MarketId): { aware: number; direct: number; list: Campaign[] } {
  const list = activeCampaigns(s, m).filter((c) => s.day < c.endDay && (c.prepUntil ?? 0) <= s.day);
  let aware = 0;
  let direct = 0;
  for (const c of list) {
    const def = campaignDef(c.def)!;
    const daily = (c.cost / def.days) * def.power * c.mult * seasonMult(s);
    aware += daily * def.aware;
    direct += daily * def.direct;
  }
  return { aware, direct, list };
}

// 캠페인 성과를 나눠 담기(그날 캠페인 몫만큼)
export function recordCampaigns(list: Campaign[], gotCampaign: number, awareCampaign: number) {
  if (!list.length) return;
  for (const c of list) {
    c.got += gotCampaign / list.length;
    c.aware += awareCampaign / list.length;
  }
}

export function campaignVerdict(c: Campaign): 'hit' | 'flop' | 'ok' {
  return c.mult >= AD.campaignResult.hit ? 'hit' : c.mult <= AD.campaignResult.flop ? 'flop' : 'ok';
}

// 끝난 캠페인 정리: 결과 알림, 할인 뒤 이탈, 논란. 준비가 끝난 캠페인은 여기서 시작(A-157)
export function endCampaigns(s: GameState) {
  startPrepared(s);
  for (const c of activeCampaigns(s)) {
    if (s.day < c.endDay) continue;
    c.done = true;
    const def = campaignDef(c.def)!;
    const v = campaignVerdict(c);
    const head = v === 'hit' ? '대박! ' : v === 'flop' ? '반응이 저조했습니다. ' : '';
    const unit = industry(s.company.industry).unit;
    if (def.power > 0) notify(s, `${head}"${def.name}" 끝: ${unit} ${Math.round(c.got).toLocaleString('ko-KR')} 데려옴, 우리를 아는 사람 +${(c.aware * 100).toFixed(1)}%p`, v === 'flop' ? 'bad' : 'good', 'market');
    else notify(s, `"${def.name}"${josa(def.name, '이')} 끝났습니다.`, 'info', 'market');
    if (v === 'hit' && def.power > 0) news(s, `${s.company.name}의 "${def.name}"${josa(def.name, '이')} 화제입니다.`, 'company');
    const after = def as { afterChurn?: number; afterDays?: number };
    if (after.afterChurn) addMod(s, 'churn', after.afterChurn, after.afterDays ?? 30, '할인이 끝나 떠나는 고객');
    if (c.risk) {
      s.career.rep = Math.max(0, s.career.rep + AD.campaignResult.riskRep);
      notify(s, `"${def.name}"에서 인플루언서 논란이 생겼습니다. 이름은 많이 알려졌지만 평판이 조금 깎였습니다.`, 'bad', 'market');
      news(s, `${s.company.name} 광고 모델 논란… "협업 재검토"`, 'company');
    }
  }
}
