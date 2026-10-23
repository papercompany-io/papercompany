// 자유 입력 대화(A-199): OpenRouter 채팅 API로 실제 LLM에 대표 말의 해석과 직원 답장을 맡깁니다.
// Electron 메인 프로세스(main.ts)와 Vite 개발 서버(vite.config.ts)가 같이 씁니다. 키는 이 둘만 가지고 렌더러에는 닿지 않습니다.
// 렌더러는 system·user·schema만 보내고, 모델·토큰 상한·공급자 선택은 여기서 정합니다.
// 모델은 .env의 OPENROUTER_TALK_MODEL(없으면 Claude Haiku 5.5). 실패하면 null → 게임은 키워드 규칙과 대사 묶음으로 답합니다.
export const TALK_MODEL = 'anthropic/claude-haiku-5.5';

export interface TalkChatRequest {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}

export async function talkChat(env: Record<string, string | undefined>, req: TalkChatRequest): Promise<string | null> {
  const key = env.OPENROUTER_API_KEY;
  if (!key || typeof req?.system !== 'string' || typeof req.user !== 'string' || !req.schema) return null;
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'PaperCompany' },
    body: JSON.stringify({
      model: env.OPENROUTER_TALK_MODEL || TALK_MODEL,
      max_tokens: Math.min(800, req.maxTokens ?? 400),
      temperature: 0.7,
      // 생각(reasoning)을 켜 두면 Haiku 5.5가 출력 한도를 생각에 다 써서 답이 비고 2배 느려짐. 꺼도 해석 정확도는 같았음(평가 세트)
      reasoning: { effort: 'none' },
      provider: { sort: 'latency' },
      messages: [
        { role: 'system', content: req.system.slice(0, 20000) },
        { role: 'user', content: req.user.slice(0, 20000) },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'talk', strict: true, schema: req.schema } },
    }),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { choices?: { message?: { content?: unknown } }[] };
  const c = j.choices?.[0]?.message?.content;
  return typeof c === 'string' ? c : null;
}
