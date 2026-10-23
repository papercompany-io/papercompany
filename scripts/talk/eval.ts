// 자유 입력 대화 평가(A-199): 평가 세트(cases.json)를 화면과 같은 코드(core/talkPrompt.ts → electron/openrouter.ts → core/talk·chat)로
// 실제 LLM에 돌려 해석(의도·말투·업무·부른 사람)·실제 업무 변화·답장 규칙을 채점합니다. 답장은 사람이 읽어 보라고 같이 찍습니다.
// 실행: npm run talk-eval -- [--rules] [--only id,id] [--prefix h-] [--repeat N] [--model 모델] [-v]
//   --rules = LLM 없이 키워드 규칙과 대사 묶음(키가 없을 때 모습), -v = 요청 프롬프트도 찍음
import fs from 'fs';
import { talkChat } from '../../electron/openrouter';
import { parseChannel, parseDm, planChannel, planDm } from '../../src/core/talkPrompt';
import { answerChannel, channelMembers, ruleRead, type ChannelRead } from '../../src/core/chat';
import { answerSaid, classify, type TalkRead } from '../../src/core/talk';
import { getChannel, post } from '../../src/core/messenger';
import { empOrderOf } from '../../src/core/assign';
import { empByName, loadCases, loadScenarios, makeWorld, setupWorld, stage, type Case, type Scenario } from './world';
import type { GameState } from '../../src/core/types';

const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const RULES = args.includes('--rules');
const VERBOSE = args.includes('-v');
const ONLY = opt('--only')?.split(',');
const PREFIX = opt('--prefix');
const REPEAT = Number(opt('--repeat') ?? 1);
const env: Record<string, string> = {};
try {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  /* 키 없음 */
}
if (opt('--model')) env.OPENROUTER_TALK_MODEL = opt('--model')!;
if (!RULES && !env.OPENROUTER_API_KEY) {
  console.log('.env에 OPENROUTER_API_KEY가 없습니다. --rules로 키워드 규칙만 볼 수 있습니다.');
  process.exit(1);
}

const EMOJI = /[\p{Extended_Pictographic}]/u;

type Result = { c: Case; ok: boolean; fails: string[]; lines: string[]; gist?: string; ms: number; intent: string };

async function runCase(c: Case, world?: GameState): Promise<Result> {
  const s = world ?? makeWorld();
  const chId = stage(s, c);
  const before = getChannel(s, chId)!.messages.length;
  const orders0 = JSON.stringify(s.company.orders);
  const emp0 = JSON.stringify(s.employees.map((e) => empOrderOf(s, e)));
  post(s, chId, '나(대표)', c.msg, 'player');
  const t0 = Date.now();
  const fails: string[] = [];
  let read: TalkRead | ChannelRead | null = null;
  // 키워드 규칙(--rules)일 때 게임이 실제로 쓰는 해석
  let ruleIntent: string | null = null;
  if (c.ch === 'dm') {
    const e = empByName(s, c.to!)!;
    const plan = planDm(s, e.id, c.msg)!;
    if (VERBOSE) console.log(plan.req.user);
    const content = RULES ? null : await talkChat(env, plan.req).catch(() => null);
    read = content ? parseDm(plan, content) : null;
    if (!RULES && !read) fails.push('LLM 실패');
    if (RULES) ruleIntent = classify(s, e, c.msg).intent;
    answerSaid(s, e.id, c.msg, read);
  } else {
    const plan = planChannel(s, chId, c.msg)!;
    if (VERBOSE) console.log(plan.req.user);
    const content = RULES ? null : await talkChat(env, plan.req).catch(() => null);
    read = content ? parseChannel(plan, content) : null;
    if (!RULES && !read) fails.push('LLM 실패');
    if (RULES) ruleIntent = ruleRead(s, chId, channelMembers(s, chId), c.msg).intent;
    answerChannel(s, chId, c.msg, read);
  }
  const ms = Date.now() - t0;
  const out = getChannel(s, chId)!.messages.slice(before + 1);
  const x = c.expect;
  const intent = read?.intent ?? ruleIntent ?? '?';
  const name = (id: string | null | undefined) => (id ? s.employees.find((e) => e.id === id)?.name ?? id : null);
  const want = Array.isArray(x.intent) ? x.intent : [x.intent];
  if (!want.includes(intent)) fails.push(`의도 ${intent} (기대 ${want.join('|')})`);

  if (read) {
    const t = read.tone;
    if (x.tone === 'insult' && t > -2) fails.push(`말투 ${t} (기대 -2)`);
    if (x.tone === 'neg' && t > -1) fails.push(`말투 ${t} (기대 -1 이하)`);
    if (x.tone === 'pos' && t < 1) fails.push(`말투 ${t} (기대 1 이상)`);
    if ('speaker' in read && x.addressed !== undefined) {
      const okNames = Array.isArray(x.addressed) ? x.addressed : [x.addressed];
      if (!okNames.includes(name(read.speaker))) fails.push(`부른 사람 ${name(read.speaker)} (기대 ${okNames.join('|')})`);
    }
    if ('teamOrders' in read && x.teamOrders && [...read.teamOrders].sort().join() !== [...x.teamOrders].sort().join()) fails.push(`팀 일 ${read.teamOrders.join(',') || '없음'} (기대 ${x.teamOrders.join(',')})`);
    if ('assigns' in read && x.assigns) {
      const got = Object.fromEntries(Object.entries(read.assigns).map(([id, o]) => [name(id), o]));
      if (JSON.stringify(Object.entries(got).sort()) !== JSON.stringify(Object.entries(x.assigns).sort())) fails.push(`사람별 ${JSON.stringify(got)} (기대 ${JSON.stringify(x.assigns)})`);
    }
    if ('everyone' in read && x.everyone !== undefined && read.everyone !== x.everyone) fails.push(`모두 ${read.everyone}`);
    if ('scope' in read) {
      const orders = x.order === undefined ? null : Array.isArray(x.order) ? x.order : [x.order];
      if (orders && !orders.includes(read.order)) fails.push(`맡길 일 ${read.order} (기대 ${orders.join('|')})`);
      if (x.back && read.order !== 'team') fails.push(`팀 일로 돌아가기 아님(${read.order})`);
      // 팀 일로 돌아가기(order = team)는 범위와 상관없이 그 사람만 돌아감
      if (x.scope && read.intent === 'order' && read.order !== 'team' && read.scope !== x.scope) fails.push(`범위 ${read.scope} (기대 ${x.scope})`);
    }
  }
  // 실제 결과: 사람마다 지금 하는 일
  for (const [n, o] of Object.entries(x.empOrders ?? {})) {
    const e = empByName(s, n)!;
    if (empOrderOf(s, e) !== o) fails.push(`${n} 하는 일 ${empOrderOf(s, e)} (기대 ${o})`);
  }
  if (x.noOrder && (JSON.stringify(s.company.orders) !== orders0 || JSON.stringify(s.employees.map((e) => empOrderOf(s, e))) !== emp0)) fails.push('업무가 바뀜');
  const replies = out.filter((m) => m.kind === 'npc');
  if (!replies.length) fails.push('답 없음');
  for (const m of replies) {
    if (EMOJI.test(m.text)) fails.push(`이모지: ${m.text}`);
    if (m.text.length > 130) fails.push(`너무 김(${m.text.length})`);
  }
  const gist = read && 'gist' in read ? read.gist : undefined;
  return { c, ok: !fails.length, fails, lines: out.map((m) => `${m.kind === 'player' ? '  ' : ''}${m.from}: ${m.text}`), gist, ms, intent };
}

// 시나리오: 한 회사에서 차례로 말함(앞 대화가 이어짐). 단계마다 해석을 채점하고, after로 업무·만족 변화를 확인
async function runScenario(sc: Scenario): Promise<Result[]> {
  const s = makeWorld();
  setupWorld(s, sc);
  const sat0 = Object.fromEntries(s.employees.map((e) => [e.name, e.sat]));
  const out: Result[] = [];
  for (const [i, step] of sc.steps.entries()) {
    if (step.day) s.day += step.day;
    const r = await runCase({ ...step, id: `${sc.id}#${i + 1}` }, s);
    if (step.after?.order && s.company.orders.dev !== step.after.order) r.fails.push(`개발팀 일 ${s.company.orders.dev} (기대 ${step.after.order})`);
    for (const [name, [lo, hi]] of Object.entries(step.after?.sat ?? {})) {
      const d = Math.round(empByName(s, name)!.sat - sat0[name]);
      if (d < lo || d > hi) r.fails.push(`${name} 만족 변화 ${d} (기대 ${lo}~${hi})`);
    }
    r.ok = !r.fails.length;
    out.push(r);
  }
  return out;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}

async function main() {
  const pick = (id: string) => (!ONLY || ONLY.includes(id)) && (!PREFIX || id.startsWith(PREFIX));
  const cases = loadCases().filter((c) => pick(c.id));
  const scenarios = loadScenarios().filter((sc) => pick(sc.id));
  const all: Result[] = [];
  for (let r = 0; r < REPEAT; r++) {
    const res = [...(await pool(cases, RULES ? 1 : 6, (c) => runCase(c))), ...(await pool(scenarios, RULES ? 1 : 6, runScenario)).flat()];
    all.push(...res);
    for (const x of res) {
      console.log(`${x.ok ? 'O' : 'X'} ${x.c.id.padEnd(18)} [${x.intent}] ${x.c.ch === 'dm' ? `${x.c.to}에게 ` : `#${x.c.ch} `}"${x.c.msg}"${RULES ? '' : `  ${x.ms}ms`}`);
      if (x.gist) console.log(`     뜻: ${x.gist}`);
      for (const l of x.lines) console.log(`     ${l}`);
      if (!x.ok) console.log(`     ✗ ${x.fails.join(' / ')}`);
    }
  }
  const pass = all.filter((x) => x.ok).length;
  const intentOk = all.filter((x) => !x.fails.some((f) => f.startsWith('의도') || f === 'LLM 실패')).length;
  const ms = all.map((x) => x.ms).sort((a, b) => a - b);
  console.log(`\n전부 맞음 ${pass}/${all.length}, 의도 맞음 ${intentOk}/${all.length}${RULES ? '' : `, 응답 시간 중앙 ${ms[Math.floor(ms.length / 2)]}ms 최대 ${ms[ms.length - 1]}ms (모델 ${env.OPENROUTER_TALK_MODEL || '기본'})`}`);
}
main();
