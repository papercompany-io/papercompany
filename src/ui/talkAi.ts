// 자유 입력 대화(A-199): 대표가 쓴 말을 실제 LLM에 보내 해석과 직원 답장을 받습니다.
// 요청 만들기·답 읽기는 core/talkPrompt.ts(평가 도구와 같은 코드), 여기서는 보내기만 합니다.
// Electron은 메인 프로세스(window.pcSave.talk), 웹 개발 서버는 /api/talk(vite.config.ts)가 .env의 키를 붙입니다.
// 키가 없거나 실패·시간 초과면 null → 게임은 키워드 규칙과 대사 묶음으로 답합니다.
import { parseChannel, parseDm, planChannel, planDm, type TalkRequest } from '../core/talkPrompt';
import type { ChannelRead } from '../core/chat';
import type { TalkRead } from '../core/talk';
import type { GameState } from '../core/types';

const TIMEOUT_MS = 12000;

async function ask(req: TalkRequest): Promise<string | null> {
  const run = async () => {
    if (window.pcSave?.talk) return window.pcSave.talk(req);
    const r = await fetch('/api/talk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
    if (!r.ok) return null;
    return ((await r.json()) as { content: string | null }).content;
  };
  try {
    return await Promise.race([run(), new Promise<null>((r) => setTimeout(() => r(null), TIMEOUT_MS))]);
  } catch {
    return null;
  }
}

export async function readTalk(s: GameState, empId: string, said: string): Promise<TalkRead | null> {
  const plan = planDm(s, empId, said);
  const c = plan && (await ask(plan.req));
  return plan && c ? parseDm(plan, c) : null;
}

export async function readChannel(s: GameState, chId: string, said: string): Promise<ChannelRead | null> {
  const plan = planChannel(s, chId, said);
  const c = plan && (await ask(plan.req));
  return plan && c ? parseChannel(plan, c) : null;
}
