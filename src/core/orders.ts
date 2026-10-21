// MG-03 부서 지시 v2: 부서마다 맡은 일을 하나 정해 두면 매일 그 부서 출력이 그 일에 들어갑니다(상시 지시, A-41).
// 대기업 계약(CA-03·OQ-046 [Claude 제안])과 장애(OP-02)도 여기서 처리합니다.
import { DATA, dept, industry, orderDef, trait } from './data';
import { deptMembers } from './employees';
import { addMod, mod } from './mods';
import { news, notify, float } from './notify';
import { post, teamChannelId } from './messenger';
import { applyWork, appeal, fixBugs, fxTotals, hasMvp } from './product';
import { deptCoverage, launchedMarkets, totalUsers, type DayPush } from './market';
import { nextId } from './ids';
import { ceoSalesToday } from './ceo';
import { allDeptOutputs } from './staff';
import { pick, rand, randInt, randRange } from './rng';
import type { DeptId, GameState } from './types';

export function setOrder(s: GameState, d: DeptId, orderId: string): string | null {
  const o = orderDef(orderId);
  if (!o || o.dept !== d) return '이 부서의 지시가 아닙니다.';
  if (s.company.stage < o.stage) return `회사 단계 ${o.stage}부터 내릴 수 있는 지시입니다.`;
  if (s.company.orders[d] === orderId) return null;
  s.company.orders[d] = orderId;
  post(s, teamChannelId(d), '나(대표)', `[지시] 앞으로 "${o.name}"에 집중해 주세요. ${o.desc}`, 'player');
  const m = deptMembers(s, d)[0];
  if (m) post(s, teamChannelId(d), m.name, '네, 알겠습니다. 바로 그 일로 옮기겠습니다.', 'npc');
  return null;
}

export function orderOf(s: GameState, d: DeptId): string {
  return s.company.orders[d] ?? (DATA.orders.defaults as Record<string, string>)[d];
}

function devBugMult(s: GameState): number {
  const devs = deptMembers(s, 'dev');
  let m = 1;
  if (devs.length) {
    let sum = 0;
    for (const e of devs) {
      let t = 1;
      for (const id of e.traits) t += ((trait(id)?.fx as unknown as Record<string, number>)?.bugs ?? 0) as number;
      sum += Math.max(0.3, t);
    }
    m = sum / devs.length;
  }
  if (s.company.workPolicy === 'crunch') m *= 1.3;
  return m;
}

// 품질 경고: 품질 점수가 60·40·20 아래로 떨어지면 한 번씩 알립니다(10점 회복하면 다시 알림 가능).
function qualityWarn(s: GameState) {
  if (!hasMvp(s)) return;
  const q = 100 - s.product.bugs;
  for (const th of [60, 40, 20]) {
    const key = `qwarn${th}`;
    const has = s.flags.includes(key);
    if (!has && q < th) {
      s.flags.push(key);
      const stab = orderOf(s, 'dev') === 'dev_stabilize';
      notify(s, `제품 품질이 ${Math.round(q)}점으로 떨어졌습니다. 버그는 이탈·장애를 부릅니다.${stab ? '' : ' 개발팀 채널에서 "안정화·버그 수정"을 맡기세요.'}`, th <= 40 ? 'urgent' : 'bad', 'messenger', teamChannelId('dev'));
    } else if (has && q >= th + 10) s.flags = s.flags.filter((f) => f !== key);
  }
}

// 하루 부서 출력 반영. 시장 처리에 넘길 값(DayPush)을 돌려줍니다.
export function ordersDay(s: GameState): DayPush & { outputs: Record<DeptId, number> } {
  const out = allDeptOutputs(s);
  const push: DayPush = { salesPush: ceoSalesToday(s), mktOutput: 0, retention: 0, contentAwareness: 0 };
  const aiBoost = orderOf(s, 'ai') === 'ai_research' ? Math.min(2, out.ai * 0.08) : 0;
  const hasDesigners = deptMembers(s, 'design').length > 0;
  // 개발
  if (out.dev > 0) {
    const o = orderOf(s, 'dev');
    if (o === 'dev_build') {
      const used = applyWork(s, out.dev, 'dev', !hasDesigners, devBugMult(s), aiBoost);
      if (used < out.dev * 0.5 && s.product.roadmap.length === 0) fixBugs(s, (out.dev - used) * 0.5, 'stabilize');
    } else if (o === 'dev_stabilize') fixBugs(s, out.dev, 'stabilize');
    else if (o === 'dev_debt') fixBugs(s, out.dev, 'debt');
  }
  qualityWarn(s);
  // 디자인
  if (out.design > 0) {
    const o = orderOf(s, 'design');
    if (o === 'design_build') {
      const used = applyWork(s, out.design, 'design', false, 1, aiBoost);
      if (used < out.design) s.product.polish = Math.min(0.4, s.product.polish + (out.design - used) * 0.0004 * (1 - s.product.polish / 0.4));
    } else if (o === 'design_polish') s.product.polish = Math.min(0.4, s.product.polish + out.design * 0.0008 * (1 - s.product.polish / 0.4));
    else if (o === 'design_brand') push.contentAwareness += 0.00012 * Math.pow(out.design, 0.8);
  }
  // 세일즈
  if (out.sales > 0) {
    const o = orderOf(s, 'sales');
    if (o === 'sales_direct') push.salesPush += out.sales;
    else if (o === 'sales_enterprise') s.entPipeline += out.sales * 0.12 * (fxTotals(s).enterprise ? 1 : 0.3);
    else if (o === 'sales_partner') s.networkPoints += out.sales * 0.3;
  }
  // 영업 콜·미팅도 회사를 알립니다(아웃바운드 인지도, A-59). 세일즈만으로 점유율 상한에 막히지 않게 합니다.
  if (push.salesPush > 0) push.contentAwareness += 0.00008 * Math.pow(push.salesPush, 0.8);
  // 마케팅
  if (out.marketing > 0) {
    const o = orderOf(s, 'marketing');
    if (o === 'mkt_perf') push.mktOutput = out.marketing;
    else if (o === 'mkt_content') push.contentAwareness += 0.00025 * Math.pow(out.marketing, 0.8);
    else if (o === 'mkt_retention') push.retention = out.marketing;
  }
  // 인사: 조직 문화
  const cultureTarget = orderOf(s, 'hr') === 'hr_culture' ? Math.min(12, (out.hr * 30) / (s.employees.length + 5)) : 0;
  s.company.culture += (cultureTarget - s.company.culture) * 0.02;
  // 고객지원: 의견 수집
  if (out.cs > 0 && orderOf(s, 'cs') === 'cs_feedback') s.product.appealBonus += out.cs * 0.0025;
  // 인프라: 안정성
  if (out.infra > 0 && orderOf(s, 'infra') === 'infra_reliability') fixBugs(s, out.infra * 0.6, 'infra');
  // 재무법무: 상장 준비
  if (out.finlegal > 0 && orderOf(s, 'finlegal') === 'fl_ipo') s.company.ipoReady = Math.min(100, s.company.ipoReady + out.finlegal * 0.12);
  else s.company.ipoReady = Math.max(0, s.company.ipoReady - 0.02);
  enterpriseDay(s);
  outageRoll(s);
  return { ...push, outputs: out };
}

// 대기업 계약: 파이프라인이 문턱을 넘고 대기업 기능이 있으면 계약(OQ-046 [Claude 제안])
export function enterpriseThreshold(s: GameState): number {
  return 12 + 6 * Math.sqrt(s.company.enterpriseCount);
}

const ENT_NAMES = ['한빛전자', '대성그룹', '미래금융', '동해물산', '세종건설', '청운유통', '태백제약', '누리통신', '해오름항공', '백두화학', '가람자동차', '푸른에너지', '새벽보험', '나래식품', '은하조선'];

function enterpriseDay(s: GameState) {
  const ind = industry(s.company.industry);
  if (!fxTotals(s).enterprise || ind.entBase <= 0) {
    s.entPipeline = Math.min(s.entPipeline, enterpriseThreshold(s));
    return;
  }
  // 계약 만료·갱신
  for (const d of s.enterprise) {
    if (d.endDay === s.day) {
      if (rand(s) < 0.55 + (100 - s.product.bugs) / 400) {
        d.endDay = s.day + 365;
        d.monthly = Math.round(d.monthly * 1.05);
        notify(s, `${d.name}이(가) 계약을 1년 연장했습니다(월 ${Math.round(d.monthly / 1e4).toLocaleString('ko-KR')}만원).`, 'good', 'market');
      } else notify(s, `${d.name} 계약이 끝났습니다. 갱신하지 않았습니다.`, 'bad', 'market');
    }
  }
  s.enterprise = s.enterprise.filter((d) => d.endDay > s.day - 400);
  const th = enterpriseThreshold(s);
  if (s.entPipeline >= th && hasMvp(s)) {
    s.entPipeline -= th;
    const used = new Set(s.enterprise.filter((d) => d.endDay > s.day).map((d) => d.name));
    const name = ENT_NAMES.find((n) => !used.has(n) && rand(s) < 0.5) ?? pick(s, ENT_NAMES);
    const mkts = launchedMarkets(s);
    const m = pick(s, mkts);
    const monthly = Math.round((ind.entBase * (1 + appeal(s) / 250) * randRange(s, 0.6, 1.6) * (m === 'us' ? 2 : m === 'eu' ? 1.6 : m === 'jp' ? 1.3 : 1)) / 1e5) * 1e5;
    const deal = { id: nextId(s, 'ent'), name: m === 'kr' ? name : `${name} ${m.toUpperCase()}`, monthly, startDay: s.day, endDay: s.day + randInt(s, 12, 36) * 30, market: m };
    s.enterprise.push(deal);
    s.company.enterpriseCount += 1;
    notify(s, `대기업 계약! ${deal.name} — 월 ${Math.round(monthly / 1e4).toLocaleString('ko-KR')}만원, ${Math.round((deal.endDay - deal.startDay) / 30)}개월`, 'good', 'market');
    news(s, `[계약] ${s.company.name}, ${deal.name}와 대형 공급 계약`, 'company');
    float(s, `+계약 ${Math.round(monthly / 1e4).toLocaleString('ko-KR')}만/월`, 'money');
  }
}

// OP-02 서비스 장애: 버그·안정성·인프라 충족도에 따라
function outageRoll(s: GameState) {
  const users = totalUsers(s);
  if (users < 20) return;
  const stab = Math.min(0.7, fxTotals(s).stability);
  const infra = deptCoverage(s, 'infra') * (orderOf(s, 'infra') === 'infra_reliability' ? 0.6 : 0.4);
  const p = 0.0022 * (1 + s.product.bugs / 22) * (1 - stab) * (1 - infra) * Math.max(0.2, 1 + mod(s, 'outage'));
  if (rand(s) >= p) return;
  const sev = randRange(s, 0.6, 1.6) * (1 + s.product.bugs / 60);
  for (const m of Object.values(s.markets)) {
    if (!m.launched) continue;
    m.users *= 1 - 0.012 * sev;
    m.awareness *= 1 - 0.02 * sev;
  }
  addMod(s, 'churn', 0.1 * sev, 14, '장애 여파');
  s.stats.outages += 1;
  const hours = Math.max(1, Math.round(sev * 4));
  notify(s, `서비스 장애 ${hours}시간! 고객 일부가 떠나고 2주 동안 이탈이 늘어납니다. (버그를 줄이고 인프라·안정성 기능을 갖추세요)`, 'bad', 'product');
  if (sev > 1.3) news(s, `[장애] ${s.company.name} 서비스 ${hours}시간 먹통… 이용자 불만`, 'company');
  post(s, s.channels.some((c) => c.id === 'team-dev') ? 'team-dev' : 'all', '시스템', `⚠ 서비스 장애 ${hours}시간 — 복구했습니다.`, 'system');
  float(s, '장애!', 'bad');
}

export function orderLabel(s: GameState, d: DeptId) {
  const o = orderDef(orderOf(s, d));
  return o ? o.name : `${dept(d).name} 기본 업무`;
}
