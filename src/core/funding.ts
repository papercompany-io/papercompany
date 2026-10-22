// F08 투자 유치: FR-01 단계 구조, FR-02~05 단계별 투자, FR-06 협상, FR-07 판정, FR-08 수락·거절,
// FR-09 클럽딜, FR-10 투자사 레터, FR-11 룸과 투자금, FR-13 라운드 열기와 유치 기간, EQ-02 희석
import { DATA, industry, investor, specEffects, stage, stageIndex } from './data';
import { convertSafes, founderShares, founderPct, newSharesForRoom, recordEquity, safeConversion, totalShares } from './equity';
import { book, lastRevenue } from './finance';
import { nextId } from './ids';
import { ensureExternal, post } from './messenger';
import { econ } from './economy';
import { addMod, mod } from './mods';
import { news, notify } from './notify';
import { coreFeatures, featureLevel, hasMvp } from './product';
import { totalUsers } from './market';
import { legacyFx } from './career';
import { rand, randInt } from './rng';
import { computeValuation, revenueGrowth, updateStoredValuation } from './valuation';
import type { GameState, LetterThread, Offer, Round, StageId } from './types';

const FD = DATA.funding;

export function openRound(s: GameState): Round | undefined {
  return s.rounds.find((r) => r.status === 'open');
}

export function activeRound(s: GameState): Round | undefined {
  return s.rounds.find((r) => r.status === 'open' || r.status === 'offer');
}

export function getRound(s: GameState, id: string): Round | undefined {
  return s.rounds.find((r) => r.id === id);
}

// FR-01 단계 선택(A-15): 처음엔 엔젤·프리시드·시드, 이후엔 현재 단계(재투자) 또는 다음 단계
export function selectableStages(s: GameState): StageId[] {
  const cur = stageIndex(s.fundingStage);
  const lo = Math.max(0, cur);
  let hi = Math.max(cur + 1, stageIndex('seed'));
  // 건너뛰기(A-76): 매출(또는 사용자 규모) 기준을 80% 넘게 채운 단계까지는 바로 열 수 있습니다.
  FD.stages.forEach((st, i) => {
    const need = (st as { needRevenue?: number }).needRevenue;
    if (i > hi && need && tractionRatio(s, need) >= 0.8) hi = i;
  });
  return FD.stages.filter((_, i) => i >= lo && i <= hi).map((x) => x.id as StageId);
}

export { lastRevenue };

// 견인력(A-51): 매출 기준 대비 비율. 소비자 앱처럼 매출보다 사용자로 크는 회사는 사용자 가치(사용자 수 × 사용자당 가치 ÷ 40)로도 봅니다.
export function tractionRatio(s: GameState, needRevenue: number): number {
  const byRev = lastRevenue(s) / needRevenue;
  const byUsers = (totalUsers(s) * industry(s.company.industry).userValue) / (needRevenue * 40);
  return Math.max(byRev, byUsers);
}

export function seedUsersNeed(s: GameState): number {
  return (FD.seedUsers as Record<string, number>)[s.company.industry] ?? 5;
}

// 라운드에 맞는 시점인지(DEC-040): 맞지 않으면 실패 확률이 커집니다. 열기 자체는 막지 않습니다.
export function stageConditions(s: GameState, id: StageId): { label: string; ok: boolean }[] {
  const st = stage(id) as { needProduct?: number; needCustomers?: number; needRevenue?: number; early: boolean };
  const out: { label: string; ok: boolean }[] = [];
  if (st.needProduct !== undefined) {
    if (st.needProduct >= 100) out.push({ label: 'MVP 출시', ok: hasMvp(s) });
    else out.push({ label: '핵심 기능 1개 이상 완성', ok: coreFeatures(s).some((f) => featureLevel(s, f.id) >= 1) });
  }
  if (st.needCustomers !== undefined) out.push({ label: `고객 ${seedUsersNeed(s).toLocaleString('ko-KR')} 이상`, ok: Math.floor(totalUsers(s)) >= seedUsersNeed(s) });
  if (st.needRevenue !== undefined) out.push({ label: `지난달 매출 ${(st.needRevenue / 10000).toLocaleString('ko-KR')}만원 이상(또는 그만한 사용자 규모)`, ok: tractionRatio(s, st.needRevenue) >= 1 });
  if (s.lastRoundDay !== null) out.push({ label: `직전 라운드 후 ${FD.prob.recentDays}일 지남`, ok: s.day - s.lastRoundDay >= FD.prob.recentDays });
  if (st.early) out.push({ label: '창업자가 투자 유치·엑싯 경험 보유(초기 라운드)', ok: specEffects(s.founder.picks).earlyRound !== 'hard' });
  return out;
}

export function roundMath(preValue: number, room: number) {
  const postValue = Math.round(preValue / (1 - room));
  const amount = Math.round(postValue * room);
  return { preValue, postValue, amount };
}

// FR-13 라운드 열기
export function canSafe(id: StageId): boolean {
  return (FD.safe.stages as string[]).includes(id);
}

export function startRound(s: GameState, id: StageId, room: number, instrument: 'equity' | 'safe' = 'equity'): string | null {
  if (s.ended) return '게임이 끝났습니다.';
  if (s.career.challenge === 'bootstrap') return '무투자 도전 중에는 투자를 받을 수 없습니다.';
  if (s.public) return '상장사는 투자 라운드 대신 주식 시장에서 자금을 조달합니다.';
  if (instrument === 'safe' && !canSafe(id)) return 'SAFE는 시드 라운드까지만 쓸 수 있습니다.';
  if (activeRound(s)) return '이미 진행 중인 라운드가 있습니다.';
  if (!selectableStages(s).includes(id)) return '지금 열 수 없는 단계입니다.';
  if (room < FD.roomMin || room > FD.roomMax) return `룸은 ${FD.roomMin * 100}%~${FD.roomMax * 100}% 사이로 정해야 합니다.`;
  const preValue = computeValuation(s).value;
  s.rounds.push({
    id: nextId(s, 'r'),
    stage: id,
    room,
    instrument,
    openedDay: s.day,
    endDay: s.day + FD.roundDays,
    preValue,
    status: 'open',
    leadId: null,
    letters: {},
    offer: null,
    closedDay: null,
  });
  s.events.push({ type: 'needsTime', what: '투자 라운드' }); // A-126
  return null;
}

function thread(s: GameState, r: Round, investorId: string): LetterThread {
  if (!r.letters[investorId]) {
    const bonus = Math.min(FD.networkInterestCap, Math.floor(s.networkPoints / 10) * FD.networkInterestPer10) + Math.min(10, Math.floor(s.career.rep / 5));
    r.letters[investorId] = { investorId, interest: bonus, sent: [], valuationAsk: null, decision: null, decisionP: null, coInvest: null, coInvestP: null, pendingReplies: [] };
  }
  return r.letters[investorId];
}

export function fits(investorId: string, id: StageId): boolean {
  return (investor(investorId).stages as string[]).includes(id);
}

// A-109 레터 효과: 투자사마다 반기는 레터가 다르고(B), 자료·소개 레터는 회사의 실제 지표·창업자 명성을 따릅니다(D).
// 그냥 다 보낸다고 관심이 오르지 않게: 평범한 레터는 조금, 반기지 않는 레터와 나쁜 지표는 오히려 깎습니다.
const LIKE_HINT: Record<string, string> = {
  intro: '저희는 창업자가 어떤 사람인지를 가장 궁금해합니다.',
  proposal: '저희는 구체적인 조건부터 듣는 걸 좋아합니다.',
  material: '저희는 숫자(고객·매출·품질)로 판단합니다.',
  club: '저희는 함께할 다른 투자사가 있는지를 중요하게 봅니다.',
};

// 자료 레터 점수: MVP가 없으면 0, 있으면 고객 수·매출 성장·버그로 −20~30
export function materialScore(s: GameState): { v: number; good: string | null; bad: string | null } {
  const M = FD.letterFx.material;
  if (!hasMvp(s)) return { v: 0, good: null, bad: '아직 보여 줄 제품이 없음' };
  const users = Math.min(M.usersCap, Math.log10(totalUsers(s) + 1) * M.usersPerLog10);
  const g = revenueGrowth(s);
  const growth = g === null ? 0 : g >= 0.15 ? M.growthGood : g >= 0.08 ? M.growthOk : g >= 0.03 ? M.growthSlow : g < 0 ? M.growthBad : 0;
  const bugs = s.product.bugs > 75 ? M.bugsHigh : s.product.bugs > 50 ? M.bugsMid : 0;
  const v = Math.round(Math.max(M.min, Math.min(M.max, M.base + users + growth + bugs)));
  const parts: [string, number][] = [
    ['고객 반응', users - 4],
    ['매출 성장', growth],
    ['제품 품질', bugs === 0 ? 2 : bugs],
  ];
  const best = parts.slice().sort((x, y) => y[1] - x[1])[0];
  const worst = parts.slice().sort((x, y) => x[1] - y[1])[0];
  return { v, good: best[1] > 3 ? best[0] : null, bad: worst[1] < 0 ? worst[0] : null };
}

export function letterGain(s: GameState, r: Round, investorId: string, letterId: string, askId?: string): number {
  const F = FD.letterFx;
  const def = FD.letters.find((l) => l.id === letterId)!;
  let v = def.interest;
  if (letterId === 'intro') v += Math.min(F.repCap, Math.floor(s.career.rep / 4) * F.repPer4);
  if (letterId === 'proposal') v = (F.proposalByAsk as Record<string, number>)[askId ?? 'as_is'] ?? v;
  if (letterId === 'material') v = materialScore(s).v;
  // 좋아하는 레터는 좋든 나쁘든 크게 받아들입니다(지표를 보는 곳은 나쁜 숫자에 더 실망)
  if (investor(investorId).likes === letterId) v *= F.likedMult;
  // 반기지 않는 레터는 관심을 조금 깎습니다(A-110): 아무거나 다 보내는 것보다 골라 보내는 게 낫게
  if (investor(investorId).dislikes === letterId) v = F.dislikedPenalty;
  if (!fits(investorId, r.stage)) v *= F.misfitMult;
  return Math.round(v);
}

function replyFor(s: GameState, r: Round, investorId: string, letterId: string, gain: number): string {
  const inv = investor(investorId);
  const stName = stage(r.stage).name;
  if (!fits(investorId, r.stage)) {
    const pref = inv.stages.map((x) => stage(x as StageId).name).join('·');
    return `연락 감사합니다. 다만 저희는 주로 ${pref} 단계에 투자해서, 이번 ${stName} 라운드는 맞지 않을 수 있습니다.`;
  }
  const liked = inv.likes === letterId;
  if (inv.dislikes === letterId) {
    const why = { intro: '소개보다는 다른 이야기를 듣고 싶었습니다.', proposal: '이야기도 나누기 전에 조건부터 받으니 조금 당황스럽네요.', material: '긴 자료는 저희 방식이 아닙니다.', club: '저희는 다른 곳과 엮이는 걸 그리 좋아하지 않습니다.' }[letterId] ?? '';
    return `${why} ${LIKE_HINT[inv.likes] ?? ''}`.trim();
  }
  if (letterId === 'material') {
    const m = materialScore(s);
    if (!hasMvp(s)) return `자료 감사합니다. 다만 아직 제품이 없어 판단하기 어렵습니다. ${liked ? '제품과 고객이 생기면 꼭 다시 보여 주세요.' : ''}`.trim();
    if (gain < 0) return `자료 잘 봤습니다. 솔직히 ${m.bad ?? '지표'} 쪽이 걱정됩니다.`;
    const head = liked ? `기다리던 자료입니다! ${m.good ? `${m.good}이 인상적이네요.` : '숫자를 잘 봤습니다.'}` : `자료 잘 받았습니다.${m.good ? ` ${m.good}이 괜찮네요.` : ''}`;
    return `${head}${m.bad ? ` ${m.bad}은 조금 더 지켜보겠습니다.` : ''}`;
  }
  if (liked) {
    switch (letterId) {
      case 'intro':
        return `${s.company.name} 이야기 정말 반갑게 읽었습니다. 창업자를 꼭 한번 뵙고 싶네요.`;
      case 'proposal':
        return `조건(지분 ${(r.room * 100).toFixed(1)}%)을 분명하게 주셔서 좋습니다. 투자 결정을 요청하시면 빠르게 답을 드리겠습니다.`;
      case 'club':
        return '좋습니다! 여러 곳이 함께하는 구조라면 저희도 훨씬 편하게 참여할 수 있습니다.';
    }
  }
  const base = { intro: `${s.company.name} 소개 잘 받았습니다.`, proposal: `제안하신 조건(지분 ${(r.room * 100).toFixed(1)}%) 검토하겠습니다.`, club: '공동 투자 구조도 괜찮습니다.' }[letterId] ?? '감사합니다.';
  return `${base} ${LIKE_HINT[inv.likes] ?? ''}`.trim();
}

// FR-10 레터 보내기(선택지 입력, DEC-032)
export function sendLetter(s: GameState, roundId: string, investorId: string, letterId: string, askId?: string): string | null {
  const r = getRound(s, roundId);
  if (!r || r.status !== 'open') return '열린 라운드가 없습니다.';
  const def = FD.letters.find((l) => l.id === letterId);
  if (!def) return '알 수 없는 레터입니다.';
  const t = thread(s, r, investorId);
  if (t.decision) return '이미 투자 결정을 받은 투자사입니다.';
  if (t.sent.includes(letterId)) return '이번 라운드에 이미 보낸 레터입니다.';
  const inc = letterGain(s, r, investorId, letterId, askId);
  t.interest = Math.max(0, Math.min(100, t.interest + inc));
  t.sent.push(letterId);
  let body = `[${def.name}] `;
  const st = stage(r.stage).name;
  if (letterId === 'proposal') {
    const ask = FD.valuationAsks.find((a) => a.id === (askId ?? 'as_is')) ?? FD.valuationAsks[0];
    t.valuationAsk = ask.id;
    const m = roundMath(Math.round(r.preValue * ask.mult), r.room);
    body += `${st} 라운드, 룸 ${(r.room * 100).toFixed(1)}%, 희망 프리밸류 ${(m.preValue / 1e8).toFixed(2)}억원(${ask.name})을 제안드립니다.`;
  } else if (letterId === 'intro') body += `${s.company.name}의 대표입니다. ${st} 라운드를 진행 중입니다.`;
  else if (letterId === 'material') body += '제품 소개서와 최근 지표를 보내드립니다.';
  else if (letterId === 'club') body += '이번 라운드는 여러 투자사와 함께하는 클럽딜로 만들려고 합니다.';
  const ch = ensureExternal(s, investorId);
  post(s, ch, '나(대표)', body, 'player');
  t.pendingReplies.push({ day: s.day + FD.replyDelayDays, text: replyFor(s, r, investorId, letterId, inc) });
  s.events.push({ type: 'needsTime', what: '투자사 레터' }); // A-126
  return null;
}

export interface ProbFactor {
  label: string;
  value: number; // 더하는 값(곱은 mult로)
  mult?: number;
}

// FR-07 투자 성공 확률(알고리즘, DEC-031). 수치는 funding.json [예시값]
export function decisionProbability(s: GameState, r: Round, investorId: string): { p: number; factors: ProbFactor[] } {
  const P = FD.prob;
  const t = r.letters[investorId];
  const inv = investor(investorId);
  const st = stage(r.stage);
  const factors: ProbFactor[] = [];
  factors.push({ label: `${st.name} 기본 확률`, value: st.base });
  factors.push(fits(investorId, r.stage) ? { label: '투자사 선호 단계', value: P.fit } : { label: '투자사 선호 단계 아님', value: P.misfit });
  if (t) factors.push({ label: `관심도 ${t.interest}`, value: t.interest * P.perInterest });
  factors.push({ label: `IR 점수 ${s.irPoints.toFixed(1)}`, value: Math.min(P.irCap, s.irPoints * P.perIrPoint) });
  const mults: { label: string; mult: number }[] = [];
  const need = (st as { needRevenue?: number }).needRevenue;
  for (const c of stageConditions(s, r.stage)) {
    if (c.ok) continue;
    if (c.label.startsWith('직전 라운드')) factors.push({ label: `조건 미충족: ${c.label}`, value: -P.recentPenalty });
    else if (c.label.startsWith('창업자')) continue; // 초기 라운드 배율로 따로 반영
    else if (need && c.label.includes('매출')) {
      // 매출이 기준에 모자랄수록 크게 줄어듭니다: (지난달 매출 ÷ 기준)²
      const ratio = Math.max(0, tractionRatio(s, need));
      mults.push({ label: `조건 미충족: ${c.label} (기준의 ${Math.round(ratio * 100)}%)`, mult: Math.max(0.02, ratio * ratio) });
    } else mults.push({ label: `조건 미충족: ${c.label}`, mult: P.conditionMult });
  }
  if (t?.valuationAsk) {
    const ask = FD.valuationAsks.find((a) => a.id === t.valuationAsk)!;
    if (ask.pAdj !== 0) factors.push({ label: `희망 기업가치 ${ask.name}`, value: ask.pAdj });
  }
  if (t?.sent.includes('club')) factors.push({ label: inv.soloAverse ? '클럽딜 의향(단독 투자를 꺼리는 곳)' : '클럽딜 의향', value: inv.soloAverse ? P.clubSoloAverse : P.club });
  const ev = econ(s, 'invest');
  if (Math.abs(ev) > 0.005) factors.push({ label: `경기(${s.economy.phase === 'boom' ? '호황' : s.economy.phase === 'recession' ? '불황' : '보통'})`, value: ev });
  if (s.career.rep > 0) factors.push({ label: `창업자 명성 ${Math.round(s.career.rep)}`, value: Math.min(P.repCap, s.career.rep * P.perRep) });
  const lf = legacyFx(s, 'invest');
  if (lf) factors.push({ label: '레거시: 투자자 관계', value: lf });
  const mi = mod(s, 'invest');
  if (mi) factors.push({ label: '최근 일(이벤트)', value: mi });
  if (stageIndex(r.stage) >= stageIndex('A')) {
    const g = revenueGrowth(s);
    if (g !== null && g >= 0.08) factors.push({ label: `매출 성장률 월 ${(g * 100).toFixed(1)}%`, value: P.growthGood });
    else if (g !== null && g < 0) factors.push({ label: `매출 감소 월 ${(g * 100).toFixed(1)}%`, value: P.growthBad });
  }
  let p = factors.reduce((sum, f) => sum + f.value, 0);
  if (st.early) {
    const kind = specEffects(s.founder.picks).earlyRound;
    const mult = (P.earlyRound as Record<string, number>)[kind];
    if (mult !== 1) factors.push({ label: kind === 'hard' ? '초기 라운드: 창업자 투자 유치 경험 없음' : '초기 라운드: 엑싯 경험 창업자', value: 0, mult });
    p *= mult;
  }
  // 실사(A-61): 시드부터는 품질이 무너졌거나 고객이 줄거나, 같은 단계를 다시 받는(브릿지) 회사를 깎아 봅니다.
  if (!st.early) {
    if (hasMvp(s) && s.product.bugs > 50) mults.push({ label: `제품 품질 ${Math.round(100 - s.product.bugs)}점(버그 많음)`, mult: s.product.bugs > 75 ? 0.45 : 0.7 });
    const h = s.plHistory.slice(-4);
    if (h.length >= 4 && h[0].usersEnd > 0 && h[3].usersEnd < h[0].usersEnd * 0.95) mults.push({ label: '최근 3개월 고객 감소', mult: 0.6 });
    if (s.fundingStage === r.stage) mults.push({ label: '같은 단계 재유치(브릿지)', mult: 0.6 });
  }
  // 투자 업계는 좁습니다(A-65): 이번 라운드에서 거절한 곳이 있으면 다른 곳도 그 소식을 듣습니다.
  const declines = Object.values(r.letters).filter((x) => x.decision === 'declined' && x.investorId !== investorId).length;
  if (declines > 0) mults.push({ label: `이번 라운드 거절 ${declines}곳(소문)`, mult: Math.pow(0.8, declines) });
  // 이 단계의 핵심 조건(제품·고객·매출)을 못 맞추면 확률이 크게 줄어듭니다(A-50).
  for (const m of mults) {
    factors.push({ label: m.label, value: 0, mult: m.mult });
    p *= m.mult;
  }
  p = Math.max(P.min, Math.min(P.max, p));
  return { p, factors };
}

// 결정을 기다리는 투자사(A-125). 한 번에 한 곳만 요청할 수 있습니다.
export function pendingDecision(r: Round): LetterThread | undefined {
  return Object.values(r.letters).find((t) => t.decision === 'pending');
}

// FR-07 투자 결정 요청 → 판정. A-125: 답은 2~5일 뒤 메신저로 옵니다(요청한 날의 확률로 정해 두고, 그날 알림)
export function requestDecision(s: GameState, roundId: string, investorId: string): string | null {
  const r = getRound(s, roundId);
  if (!r || r.status !== 'open') return '열린 라운드가 없습니다.';
  if (r.leadId) return '이미 리드 투자사가 정해졌습니다. 다른 곳에는 공동 투자를 제안하세요.';
  const t = r.letters[investorId];
  if (!t || t.sent.length === 0) return '먼저 레터를 보내 이야기를 시작하세요.';
  if (t.decision === 'pending') return '이미 검토 중입니다. 답을 기다리세요.';
  if (t.decision) return '이미 답을 받은 투자사입니다.';
  const wait = pendingDecision(r);
  if (wait) return `${investor(wait.investorId).name}의 답을 기다리는 중입니다. 답을 받은 뒤 요청하세요.`;
  const { p } = decisionProbability(s, r, investorId);
  t.decisionP = p;
  const ch = ensureExternal(s, investorId);
  const inv = investor(investorId);
  post(s, ch, '나(대표)', '[투자 결정 요청] 이번 라운드 투자 여부를 결정해 주실 수 있을까요?', 'player');
  const [a, b] = FD.decisionDelayDays;
  t.decision = 'pending';
  t.decisionYes = rand(s) < p;
  t.decisionDue = Math.max(s.day, Math.min(r.endDay, s.day + randInt(s, a, b)));
  post(s, ch, inv.name, '내부 투자심의위원회에서 검토해 보겠습니다. 며칠 안에 답을 드리겠습니다.', 'npc');
  s.events.push({ type: 'needsTime', what: '투자 결정 요청' }); // A-126
  return null;
}

// 기다리던 결정이 도착(하루 끝)
function resolveDecision(s: GameState, r: Round, t: LetterThread) {
  const ch = ensureExternal(s, t.investorId);
  const inv = investor(t.investorId);
  const yes = !!t.decisionYes && !r.leadId;
  t.decisionDue = undefined;
  t.decisionYes = undefined;
  if (yes) {
    t.decision = 'committed';
    r.leadId = t.investorId;
    post(s, ch, inv.name, `투자하기로 결정했습니다. 저희가 리드를 맡겠습니다. 다른 투자사와 함께하셔도 좋습니다.`, 'npc');
    notify(s, `${inv.name}: 투자하기로 결정했습니다. 리드 투자사가 정해졌습니다.`, 'good', 'invest');
  } else {
    t.decision = 'declined';
    post(s, ch, inv.name, '검토 끝에 이번에는 투자하지 않기로 했습니다. 다음 기회에 다시 이야기 나누면 좋겠습니다.', 'npc');
    notify(s, `${inv.name}: 이번에는 투자하지 않기로 했습니다. 다른 투자사에 결정을 요청해 보세요.`, 'bad', 'messenger', ch);
  }
}

export function coInvestProbability(s: GameState, r: Round, investorId: string): number {
  const C = FD.coInvest;
  const t = r.letters[investorId];
  const inv = investor(investorId);
  let p = C.base + (t ? t.interest * C.perInterest : 0) + (inv.soloAverse ? C.soloAverse : 0);
  if (!fits(investorId, r.stage)) p += FD.prob.misfit;
  return Math.max(FD.prob.min, Math.min(FD.prob.max, p));
}

// FR-09 클럽딜: 리드 결정 뒤 "다른 곳도 같이 해도 될까요?"(DEC-034)
export function askCoInvest(s: GameState, roundId: string, investorId: string): string | null {
  const r = getRound(s, roundId);
  if (!r || r.status !== 'open') return '열린 라운드가 없습니다.';
  if (!r.leadId) return '먼저 리드 투자사의 결정을 받아야 합니다.';
  if (r.leadId === investorId) return '리드 투자사입니다.';
  const t = r.letters[investorId];
  if (!t || t.sent.length === 0) return '먼저 레터를 보내 이야기를 시작하세요.';
  if (t.coInvest) return '이미 답을 받았습니다.';
  const p = coInvestProbability(s, r, investorId);
  t.coInvestP = p;
  const ch = ensureExternal(s, investorId);
  const lead = investor(r.leadId).name;
  post(s, ch, '나(대표)', `[공동 투자 제안] ${lead}가 리드로 투자를 결정했습니다. 다른 곳도 같이 해도 될까요? 함께해 주시면 좋겠습니다.`, 'player');
  if (rand(s) < p) {
    t.coInvest = 'joined';
    post(s, ch, investor(investorId).name, `${lead}가 리드라면 저희도 함께하겠습니다.`, 'npc');
  } else {
    t.coInvest = 'declined';
    post(s, ch, investor(investorId).name, '이번에는 참여가 어렵겠습니다.', 'npc');
    notify(s, `${investor(investorId).name}: 공동 투자에 참여하지 않기로 했습니다.`, 'bad', 'messenger', ch);
  }
  return null;
}

export function coInvestors(r: Round): string[] {
  return Object.values(r.letters)
    .filter((t) => t.coInvest === 'joined' && t.investorId !== r.leadId)
    .map((t) => t.investorId);
}

// FR-11 투자금 = 포스트밸류 × 룸, EQ-02 신주 발행 계산, FR-08 제안서 내용
export function buildOffer(s: GameState, r: Round): Offer {
  const leadThread = r.letters[r.leadId!];
  const ask = FD.valuationAsks.find((a) => a.id === (leadThread?.valuationAsk ?? 'as_is')) ?? FD.valuationAsks[0];
  const m = roundMath(Math.round(r.preValue * ask.mult), r.room);
  const before = totalShares(s.capTable);
  const safeShares = r.instrument === 'equity' ? safeConversion(s, m.preValue, before).shares : 0;
  const existing = before + safeShares;
  const newShares = r.instrument === 'safe' ? 0 : newSharesForRoom(existing, r.room);
  const unitShares = r.instrument === 'safe' ? Math.max(1, Math.round(m.amount / 1000)) : newShares;
  const ids = [r.leadId!, ...coInvestors(r)];
  const shareCounts: number[] = [];
  if (ids.length === 1) shareCounts.push(unitShares);
  else {
    const leadShares = Math.round(unitShares * FD.coInvest.leadShare);
    const each = Math.floor((unitShares - leadShares) / (ids.length - 1));
    const rest = unitShares - leadShares - each * (ids.length - 1);
    shareCounts.push(leadShares + rest, ...ids.slice(1).map(() => each));
  }
  const amounts = shareCounts.map((n) => Math.round((m.amount * n) / unitShares));
  amounts[0] += m.amount - amounts.reduce((a, b) => a + b, 0);
  const total = existing + newShares;
  const safe = r.instrument === 'safe';
  return {
    preValue: m.preValue,
    postValue: m.postValue,
    room: r.room,
    amount: m.amount,
    newShares,
    safeShares,
    shares: ids.map((id, i) => ({ investorId: id, name: investor(id).name, newShares: safe ? 0 : shareCounts[i], pct: safe ? 0 : shareCounts[i] / total, amount: amounts[i] })),
    founderBefore: founderPct(s),
    founderAfter: founderShares(s) / total,
    down: !safe && s.lastPostValue > 0 && m.preValue < s.lastPostValue,
    instrument: r.instrument,
    safeCap: safe ? Math.round(m.postValue * FD.safe.capMult) : null,
  };
}

// 리드가 있으면 라운드를 마감하고 제안서를 받습니다(FR-08).
export function closeForOffer(s: GameState, roundId: string): string | null {
  const r = getRound(s, roundId);
  if (!r || r.status !== 'open') return '열린 라운드가 없습니다.';
  if (!r.leadId) return '리드 투자사가 아직 없습니다.';
  r.offer = buildOffer(s, r);
  r.status = 'offer';
  s.events.push({ type: 'offerReady', roundId: r.id });
  s.pauseReason = '투자 제안서가 도착했습니다';
  return null;
}

// FR-08 수락 → EQ-02 지분 발행과 희석, EQ-03 기록
export function acceptOffer(s: GameState, roundId: string): string | null {
  const r = getRound(s, roundId);
  if (!r || r.status !== 'offer' || !r.offer) return '받을 제안서가 없습니다.';
  const o = r.offer;
  const stName = stage(r.stage).name;
  if (o.instrument === 'safe') {
    s.safes.push({ id: nextId(s, 'safe'), holders: o.shares.map((x) => ({ investorId: x.investorId, name: x.name, amount: x.amount })), amount: o.amount, cap: o.safeCap ?? o.postValue, discount: FD.safe.discount, day: s.day, stage: r.stage });
  } else {
    convertSafes(s, o.preValue);
    for (const sh of o.shares) {
      s.capTable.push({ holderId: `${sh.investorId}@${r.id}`, name: `${sh.name}`, kind: 'investor', shares: sh.newShares, round: stName });
    }
    s.lastPostValue = o.postValue;
    if (s.company.board <= 0) s.company.board = 70;
    if (o.down) {
      addMod(s, 'sat', FD.downRoundSat, 60, '다운라운드');
      s.career.rep = Math.max(0, s.career.rep - 2);
      news(s, `[투자] ${s.company.name}, 기업가치를 낮춰 ${stName} 유치(다운라운드)`, 'company');
      notify(s, '다운라운드로 투자를 받았습니다. 직원 사기와 명성이 조금 떨어졌습니다.', 'bad', 'invest');
    }
  }
  book(s, `${stName} ${o.instrument === 'safe' ? 'SAFE ' : ''}투자금 (${o.shares.map((x) => x.name).join(', ')})`, o.amount);
  s.accrual.investment += o.amount;
  if (stageIndex(r.stage) > stageIndex(s.fundingStage)) s.fundingStage = r.stage;
  s.lastRoundDay = s.day;
  s.irPoints = 0;
  r.status = 'accepted';
  r.closedDay = s.day;
  s.pauseReason = null;
  recordEquity(s, o.instrument === 'safe' ? `${stName} SAFE (캡 ${Math.round((o.safeCap ?? 0) / 1e8)}억)` : `${stName} 투자 (룸 ${(r.room * 100).toFixed(1)}%)`);
  if (!o.down) news(s, `[투자] ${s.company.name}, ${stName} ${Math.round(o.amount / 1e8) >= 1 ? Math.round(o.amount / 1e8) + '억원' : Math.round(o.amount / 1e4) + '만원'} 유치`, 'company');
  s.events.push({ type: 'confetti' });
  updateStoredValuation(s);
  for (const sh of o.shares) post(s, ensureExternal(s, sh.investorId), investor(sh.investorId).name, `계약을 마쳤습니다. 투자금 ${(sh.amount / 1e4).toLocaleString('ko-KR')}만원을 보냈습니다.`, 'npc');
  s.events.push({ type: 'autosave', reason: '투자 수락' });
  return null;
}

// 라운드 접기: 가망이 없으면 일찍 끝내 대표 시간을 돌려받습니다(재시도 간격은 그대로 적용).
export function cancelRound(s: GameState, roundId: string): string | null {
  const r = getRound(s, roundId);
  if (!r || r.status !== 'open') return '열린 라운드가 없습니다.';
  if (r.leadId) return '리드 투자사가 정해진 라운드는 마감해 제안서를 받으세요.';
  r.status = 'failed';
  r.closedDay = s.day;
  s.irPoints = 0;
  return null;
}

export function rejectOffer(s: GameState, roundId: string): string | null {
  const r = getRound(s, roundId);
  if (!r || r.status !== 'offer') return '받을 제안서가 없습니다.';
  r.status = 'rejected';
  r.closedDay = s.day;
  s.irPoints = 0;
  s.pauseReason = null;
  return null;
}

// 하루가 끝날 때: 답장 도착, 유치 기간 종료(FR-13)
export function roundDayEnd(s: GameState) {
  const r = openRound(s);
  if (!r) return;
  for (const t of Object.values(r.letters)) {
    const due = t.pendingReplies.filter((x) => x.day <= s.day);
    t.pendingReplies = t.pendingReplies.filter((x) => x.day > s.day);
    for (const d of due) post(s, ensureExternal(s, t.investorId), investor(t.investorId).name, d.text, 'npc');
    if (t.decision === 'pending' && (t.decisionDue ?? 0) <= s.day) resolveDecision(s, r, t);
  }
  // 마감 경고: 리드가 없으면 10일·3일 전에 알립니다(레터만 보내고 결정 요청을 잊는 일이 잦음).
  const left = r.endDay - s.day;
  if (!r.leadId && (left === 10 || left === 3)) {
    const asked = Object.values(r.letters).some((t) => t.decision);
    notify(s, `${stage(r.stage).name} 라운드 마감 ${left}일 전: 리드 투자사가 없습니다. ${asked ? '다른 투자사에도' : '레터를 보낸 투자사에'} "투자 결정 요청"을 하세요.`, 'urgent', 'invest');
  }
  if (s.day >= r.endDay) {
    if (r.leadId) {
      closeForOffer(s, r.id);
    } else {
      r.status = 'failed';
      r.closedDay = s.day;
      s.irPoints = 0;
      s.events.push({ type: 'roundFailed', roundId: r.id });
      s.pauseReason = `${stage(r.stage).name} 라운드 유치에 실패했습니다`;
    }
  }
}
