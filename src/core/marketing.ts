// 마케팅팀이 하는 일(A-157): 월초 고객 리포트(어디서 왔고 왜 떠났나), 광고 맡기기(채널 예산 옮기기·지친 소재 교체·새 채널 시험).
// 마케터가 없으면 비서가 짧게만 보고합니다(채널 성과·제안은 마케터가 있을 때만).
import { DATA, industry, market } from './data';
import { adMix, adSlots, campaignBlock, campaignCost, campaignDef, channelDef, channelFit, channelsFor, marketers, runningChannels, startCampaign } from './ads';
import { demand, growthRoom, launchedMarkets, totalUsers, unitWord, type RoomState } from './market';
import { dateOf } from './calendar';
import { countShort, josa } from './format';
import { post, teamChannelId } from './messenger';
import { hasMvp } from './product';
import type { GainWhy, GameState } from './types';

const T = DATA.ads.team;

export const GAIN_WORD: Record<GainWhy, string> = { inbound: '스스로 찾아온 고객', viral: '입소문', sales: '영업', ads: '광고', campaign: '캠페인' };

// 떠나는 이유를 쉬운 말로(화면 막대 이름)
export function lossName(key: string): string {
  if (key.startsWith('mod:')) return key.slice(4);
  return ({ natural: '원래 떠나는 고객', bugs: '버그·불편', price: '가격 부담', cs: '문의 답이 늦음', excess: '제품보다 많이 데려옴' } as Record<string, string>)[key] ?? key;
}

const LOSS_LINE: Record<string, string> = {
  natural: '특별한 문제 없이 원래 떠나는 만큼 떠났습니다.',
  bugs: '버그 때문에 불편하다는 고객이 가장 많았습니다. 개발팀에 "안정화·버그 수정"을 맡기면 줄어듭니다.',
  price: '가격이 부담된다며 떠난 고객이 가장 많았습니다.',
  cs: '문의에 답이 늦어 떠난 고객이 가장 많았습니다. 고객지원 인원이 모자랍니다.',
  excess: '광고·영업으로 데려온 고객 가운데 제품에 실망한 분들이 많이 빠져나갔습니다.',
};

export const ROOM_LINE: Record<RoomState, string> = {
  room: '제품은 고객을 더 받을 수 있습니다. 더 알리면 더 옵니다.',
  near: '제품이 받쳐 주는 만큼 차 가고 있습니다.',
  full: '제품이 받쳐 주는 만큼 거의 찼습니다. 제품 메뉴 기능 탭에서 기능 레벨을 올리거나 새 기능을 만들어 매력을 높여야 더 큽니다.',
  over: '제품이 받쳐 주는 것보다 많이 데려왔습니다. 광고·영업으로 온 고객이 빠져나가고 있습니다.',
};

// 받쳐 주는 만큼 찼을 때 아직 안 나간 시장이 있으면(A-196: 어디서 하는지까지)
export const CLOSED_LINE = ' 아직 나가지 않은 해외 시장도 있습니다. 현지화 기능을 만든 뒤 시장·광고 메뉴에서 진출하면 그 시장 고객이 더해집니다.';

function sum(o: Partial<Record<string, number>>): number {
  return Object.values(o).reduce<number>((a, v) => a + (v ?? 0), 0);
}

function chName(id: string): string {
  return channelDef(id)?.name ?? id;
}

// 가장 큰 이유. "원래 떠나는 고객"보다 다른 이유를 먼저 말하되, 다른 이유가 작으면(전체의 15% 미만) 원래 떠나는 만큼이라고 말함
export function topLoss(lost: Partial<Record<string, number>>): string[] {
  const total = sum(lost);
  if (total <= 0) return [];
  const rest = Object.entries(lost)
    .filter(([k, v]) => k !== 'natural' && (v ?? 0) / total >= 0.15)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([k]) => k);
  return rest.length ? rest.slice(0, 2) : ['natural'];
}

function lossLine(key: string, second: boolean): string {
  if (key.startsWith('mod:')) return `${second ? '그다음은' : '가장 큰 이유는'} "${key.slice(4)}"입니다.`;
  if (!second) return LOSS_LINE[key] ?? '';
  return `${lossName(key)}${josa(lossName(key), '이')} 그다음입니다.`;
}

// 광고 맡기기(A-157): 매달 성과가 가장 나쁜 채널 예산 일부를 가장 좋은 채널로, 지친 소재 교체, 빈 일손이 있으면 잘 맞는 새 채널 시험. 총예산은 그대로
export function adAutoMonth(s: GameState): string[] {
  const n = marketers(s);
  if (!s.company.adAuto || n === 0) return [];
  const lines: string[] = [];
  const shift = Math.min(T.shiftMax, T.shiftBase + T.shiftPer * n);
  const many = launchedMarkets(s).length > 1;
  for (const m of launchedMarkets(s)) {
    const ms = s.markets[m];
    const mix = adMix(s, m) as Record<string, number>;
    const total = sum(mix);
    if (total <= 0) continue;
    const where = many ? `${market(m).name}: ` : '';
    const st = ms.adStats ?? {};
    const D = demand(s, m);
    // 한 원당 성과 = (데려온 고객 + 알린 사람 × 환산 비율) ÷ 쓴 돈(30일 평균)
    const value = (id: string): number | null => {
      const x = st[id];
      if (!x || x.spent * 30 < 1e5) return null;
      return (x.got + x.aware * D * T.awareValue) / x.spent;
    };
    const run = runningChannels(s, m).filter((id) => value(id) !== null);
    if (run.length >= 2) {
      run.sort((a, b) => value(b)! - value(a)!);
      const best = run[0];
      const worst = run[run.length - 1];
      const move = Math.round((mix[worst] * shift) / 1e5) * 1e5;
      if (value(best)! > value(worst)! * T.gap && move > 0) {
        mix[worst] -= move;
        mix[best] += move;
        lines.push(`${where}${chName(worst)} 예산 ${Math.round(shift * 100)}%를 ${chName(best)}${josa(chName(best), '으로')} 옮겼습니다. 같은 돈으로 더 많이 데려오고 알립니다.`);
      }
    }
    const tired = runningChannels(s, m).filter((id) => (ms.adFatigue?.[id] ?? 0) >= T.refreshAt);
    if (tired.length && !campaignBlock(s, 'refresh', m) && s.cash > campaignCost(s, campaignDef('refresh')!, m) * 10) {
      startCampaign(s, 'refresh', m, 'feature');
      lines.push(`${where}지친 ${tired.map(chName).join('·')} 소재를 새로 만들었습니다.`);
    }
    const used = Object.keys(mix).filter((k) => mix[k] > 0);
    if (used.length < adSlots(s)) {
      const cand = channelsFor(s)
        .filter((c) => !used.includes(c.id) && channelFit(s, c.id) >= 1.15)
        .sort((a, b) => channelFit(s, b.id) - channelFit(s, a.id))[0];
      const amt = Math.round((total * T.trial) / 1e5) * 1e5;
      if (cand && amt > 0) {
        for (const k of used) mix[k] = Math.max(0, mix[k] - Math.round((amt * mix[k]) / total / 1e5) * 1e5);
        mix[cand.id] = amt;
        lines.push(`${where}우리와 잘 맞을 것 같은 ${cand.name}에 예산 일부를 시험 삼아 넣었습니다.`);
      }
    }
    ms.ads = mix;
    ms.adBudget = sum(mix);
  }
  return lines;
}

// 채널 성과 한두 줄(마케터가 있을 때만): 가장 싸게 데려온 채널, 지친 채널, 일손이 모자라 못 돌리는 잘 맞는 채널
function channelNotes(s: GameState): string[] {
  const out: string[] = [];
  const agg: Record<string, { spent: number; got: number }> = {};
  for (const m of launchedMarkets(s))
    for (const [id, x] of Object.entries(s.markets[m].adStats ?? {})) {
      if (!x) continue;
      const a = (agg[id] ??= { spent: 0, got: 0 });
      a.spent += x.spent;
      a.got += x.got;
    }
  const ranked = Object.entries(agg)
    .filter(([, x]) => x.got * 30 >= 1 && x.spent * 30 >= 1e5)
    .sort((a, b) => a[1].spent / a[1].got - b[1].spent / b[1].got);
  if (ranked.length >= 2) out.push(`${chName(ranked[0][0])}${josa(chName(ranked[0][0]), '이')} 한 명을 가장 싸게 데려옵니다.`);
  if (!s.company.adAuto) {
    const tired = new Set<string>();
    for (const m of launchedMarkets(s)) for (const id of runningChannels(s, m)) if ((s.markets[m].adFatigue?.[id] ?? 0) >= 0.5) tired.add(id);
    if (tired.size) out.push(`${[...tired].map(chName).join('·')}${josa(chName([...tired].pop()!), '이')} 지쳤습니다. 소재를 새로 만들면 다시 힘을 냅니다.`);
  }
  const kr = s.markets.kr;
  const on = Object.values(adMix(s, 'kr')).filter((v) => v > 0).length;
  if (kr.launched && on >= adSlots(s)) {
    const idle = channelsFor(s).find((c) => !(adMix(s, 'kr')[c.id] > 0) && channelFit(s, c.id) >= 1.15);
    if (idle) out.push(`${idle.name}${josa(idle.name, '이')} 우리와 잘 맞는데, 일손이 모자라 돌리지 못하고 있습니다.`);
  }
  return out;
}

// 월초 고객 리포트(A-157). 지난달 고객이 들고 난 길을 비우고 새 달을 시작합니다
export function marketingMonth(s: GameState) {
  const cm = s.company.custMonth;
  s.company.custMonth = { start: totalUsers(s), gain: {}, lost: {} };
  if (!hasMvp(s) || !cm) return;
  const auto = adAutoMonth(s);
  const now = totalUsers(s);
  const net = now - cm.start;
  const unit = industry(s.company.industry).unit;
  const w = unitWord(s);
  const month = dateOf(s.day - 1).getUTCMonth() + 1;
  const lines: string[] = [`[고객 리포트] ${month}월 ${unit} ${net >= 0 ? '+' : ''}${countShort(net)}${w} (지금 ${countShort(now)}${w})`];
  const gainTotal = sum(cm.gain);
  const topGain = (Object.entries(cm.gain) as [GainWhy, number][]).sort((a, b) => b[1] - a[1])[0];
  if (topGain && gainTotal >= 1) lines.push(`가장 많이 온 길은 ${GAIN_WORD[topGain[0]]}입니다(들어온 ${unit}의 ${Math.round((topGain[1] / gainTotal) * 100)}%).`);
  else lines.push(`새로 들어온 ${unit}${josa(unit, '이')} 거의 없습니다. 광고·영업·콘텐츠로 알려야 옵니다.`);
  const why = topLoss(cm.lost);
  why.forEach((k, i) => lines.push(lossLine(k, i > 0)));
  const room = growthRoom(s);
  lines.push(ROOM_LINE[room.state] + (room.state === 'full' && room.closed.length ? CLOSED_LINE : ''));
  const team = s.employees.filter((e) => e.dept === 'marketing');
  if (team.length) {
    lines.push(...channelNotes(s));
    if (auto.length) lines.push('', '[맡겨 주신 광고] ' + auto.join(' '));
    const speaker = team.find((e) => e.lead) ?? [...team].sort((a, b) => b.skill - a.skill)[0];
    post(s, teamChannelId('marketing'), speaker.name, lines.join('\n'), 'npc');
  } else {
    if (!s.flags.includes('custreport-tip')) {
      s.flags.push('custreport-tip');
      lines.push('마케터가 있으면 채널별 성과를 보고 제안도 드리고, 광고 운영을 맡길 수 있습니다.');
    }
    post(s, 'all', '비서', lines.join('\n'), 'npc');
  }
}
