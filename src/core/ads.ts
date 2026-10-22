// 광고(A-116): 채널별 예산·궁합·한계(무릎)·피로·시즌, 성과 기록, 캠페인(문구 고르기·대박/실패·논란)
// 시장 하루 처리(marketDay)가 adDay·campaignDay로 "알리기 몫"과 "바로 데려오기 몫"을 받아 인지도·광고 고객에 씁니다.
import { DATA, industry, market } from './data';
import { dateOf } from './calendar';
import { spendNow } from './finance';
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
  return ind.tam * md.tamMult * ind.adCost * md.adCost;
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

export function channelsFor(s: GameState): ChannelDef[] {
  return AD.channels.filter((c) => s.company.stage >= c.stage);
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

export function setChannelBudget(s: GameState, m: MarketId, channel: string, monthly: number) {
  const ms = s.markets[m];
  const mix = adMix(s, m);
  mix[channel] = Math.max(0, Math.round(monthly / 1e5) * 1e5);
  ms.ads = mix;
  ms.adBudget = Object.values(mix).reduce((a, v) => a + v, 0);
}

// 총예산 한 번에 정하기(봇·예전 화면): 지금 비율(없으면 산업 기본 비율)대로 나눔
export function setTotalAdBudget(s: GameState, m: MarketId, monthly: number) {
  const ms = s.markets[m];
  const total = Math.max(0, Math.round(monthly / 1e5) * 1e5);
  const cur = adMix(s, m);
  const sum = Object.values(cur).reduce((a, v) => a + v, 0);
  const base = sum > 0 ? cur : Object.fromEntries(Object.entries(MIX[s.company.industry] ?? {}).filter(([k]) => k !== '_note'));
  const bsum = Object.values(base).reduce((a, v) => a + v, 0) || 1;
  const open = new Set(channelsFor(s).map((c) => c.id));
  const out: Record<string, number> = {};
  for (const [c, v] of Object.entries(base)) if (open.has(c)) out[c] = Math.round(((total * v) / bsum) / 1e5) * 1e5;
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
  const total = Object.values(mix).reduce((a, v) => a + v, 0) / 30;
  const parts: AdPart[] = [];
  const fat = (ms.adFatigue ??= {});
  const canPay = total > 0 && s.cash > total;
  if (canPay) spendNow(s, '', total, 'ads', true);
  for (const c of AD.channels) {
    const daily = canPay && s.company.stage >= c.stage ? (mix[c.id] ?? 0) / 30 : 0;
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
  return Math.round(Math.max(def.minCost, (def.costPct / 100) * fullInform(s, m)) / 1e5) * 1e5;
}

export function activeCampaigns(s: GameState, m?: MarketId): Campaign[] {
  return (s.campaigns ?? []).filter((c) => !c.done && (!m || c.market === m));
}

export function campaignBlock(s: GameState, defId: string, m: MarketId): string | null {
  const def = campaignDef(defId);
  if (!def) return '없는 캠페인입니다.';
  if (!s.markets[m].launched) return '이 시장에 먼저 진출해야 합니다.';
  if (s.company.stage < def.stage) return `회사 단계 ${def.stage}부터 할 수 있습니다.`;
  if (activeCampaigns(s, m).some((c) => c.def === defId)) return '이미 진행 중입니다.';
  if ((def as { once?: boolean }).once && (s.campaigns ?? []).some((c) => c.def === defId && c.startDay >= s.company.startDay)) return '회사마다 한 번만 할 수 있습니다.';
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
  if ((def as { refresh?: boolean }).refresh) {
    s.markets[m].adFatigue = {};
    (s.campaigns ??= []).push({ id: nextId(s, 'cp'), def: defId, market: m, tone: toneId, startDay: s.day, endDay: s.day, cost, mult: 1, risk: false, got: 0, aware: 0, done: true });
    notify(s, `${market(m).name} 광고를 새 소재로 바꿨습니다. 지쳤던 광고가 다시 힘을 냅니다.`, 'good', 'market');
    return null;
  }
  const tone = AD.tones.find((x) => x.id === toneId) ?? AD.tones[0];
  const fit = (tone.fit as Record<string, number>)[audience(s)] ?? 1;
  const mult = Math.max(0.15, fit * (1 + tone.spread * (rand(s) * 2 - 1)));
  const risk = rand(s) < ((def as { riskP?: number }).riskP ?? 0);
  (s.campaigns ??= []).push({ id: nextId(s, 'cp'), def: defId, market: m, tone: toneId, startDay: s.day, endDay: s.day + def.days, cost, mult, risk, got: 0, aware: 0, done: false });
  return null;
}

// 하루치 캠페인 효과(원 환산). 결과 배율이 곱해짐
export function campaignDay(s: GameState, m: MarketId): { aware: number; direct: number; list: Campaign[] } {
  const list = activeCampaigns(s, m).filter((c) => s.day < c.endDay);
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

// 끝난 캠페인 정리: 결과 알림, 할인 뒤 이탈, 논란
export function endCampaigns(s: GameState) {
  for (const c of activeCampaigns(s)) {
    if (s.day < c.endDay) continue;
    c.done = true;
    const def = campaignDef(c.def)!;
    const v = campaignVerdict(c);
    const head = v === 'hit' ? '대박! ' : v === 'flop' ? '반응이 저조했습니다. ' : '';
    const unit = industry(s.company.industry).unit;
    notify(s, `${head}"${def.name}" 끝: ${unit} ${Math.round(c.got).toLocaleString('ko-KR')} 데려옴, 우리를 아는 사람 +${(c.aware * 100).toFixed(1)}%p`, v === 'flop' ? 'bad' : 'good', 'market');
    if (v === 'hit') news(s, `${s.company.name}의 "${def.name}"가 화제입니다.`, 'company');
    const after = def as { afterChurn?: number; afterDays?: number };
    if (after.afterChurn) addMod(s, 'churn', after.afterChurn, after.afterDays ?? 30, '할인이 끝나 떠나는 고객');
    if (c.risk) {
      s.career.rep = Math.max(0, s.career.rep + AD.campaignResult.riskRep);
      notify(s, `"${def.name}"에서 인플루언서 논란이 생겼습니다. 이름은 많이 알려졌지만 평판이 조금 깎였습니다.`, 'bad', 'market');
      news(s, `${s.company.name} 광고 모델 논란… "협업 재검토"`, 'company');
    }
  }
}
