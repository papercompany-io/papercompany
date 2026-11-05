// Cloudflare Worker 진입점(A-249): /api/auth/*는 로그인, /api/mp/*는 세션을 확인한 뒤 멀티플레이로 넘깁니다.
// 나머지 주소는 정적 웹 빌드(ASSETS). cron은 R2 지연 삭제(A-248)와 끝난 로그인 기록을 정리합니다.
import { authenticate, handleAuth, isAuthPath, sweepAuth, type AuthEnv } from './auth';
import { handleMultiplayer, isMultiplayerPath, sweepBlobs, verifyPendingRuns, type MultiplayerEnv } from './multiplayer';
import { handleTalk, isTalkPath, type TalkEnv } from './talk';

export interface Env extends AuthEnv, Omit<TalkEnv, 'DB'> {
  SAVES: MultiplayerEnv['SAVES'];
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (isAuthPath(pathname)) return handleAuth(request, env);
  if (isTalkPath(pathname)) {
    const who = await authenticate(request, env);
    if (who instanceof Response) return who;
    return handleTalk(request, env, who.userId);
  }
  if (isMultiplayerPath(pathname)) {
    const who = await authenticate(request, env);
    if (who instanceof Response) return who;
    return handleMultiplayer(request, env, who.userId);
  }
  if (env.ASSETS) return env.ASSETS.fetch(request);
  return new Response('Not found', { status: 404 });
}

export async function runScheduled(env: Env, now: number): Promise<void> {
  const blobs = await sweepBlobs(env, now);
  if (blobs.failed > 0) console.error('cron: R2 blob sweep failures', blobs);
  await sweepAuth(env, now);
  const runs = await verifyPendingRuns(env, now);
  if (runs.failed > 0) console.error('cron: replay verification failures', runs);
}

export default {
  fetch: (request: Request, env: Env) => handleRequest(request, env),
  scheduled(_controller: unknown, env: Env, ctx: ExecutionContextLike) {
    ctx.waitUntil(runScheduled(env, Date.now()));
  },
};
