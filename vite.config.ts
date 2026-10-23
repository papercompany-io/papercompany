import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { talkChat } from './electron/openrouter';

// 자유 입력 대화(A-139 → A-199): 개발 서버가 /api/talk 요청에 .env의 OPENROUTER_API_KEY를 붙여 OpenRouter의 실제 LLM으로 넘깁니다.
// LLM은 대표 말의 해석(의도·말투·업무)과 직원 답장을 한 번에 냅니다(electron/openrouter.ts, Electron과 같은 호출). 효과는 게임 규칙이 정합니다.
// 키는 VITE_ 접두사가 없어 브라우저 번들에 들어가지 않습니다. 키가 없거나 실패하면 503·502 → 게임은 키워드 규칙과 대사 묶음으로 답합니다.
function talkProxy(env: Record<string, string>): Plugin {
  return {
    name: 'pc-talk-proxy',
    configureServer(server) {
      server.middlewares.use('/api/talk', async (req, res) => {
        if (req.method !== 'POST' || !env.OPENROUTER_API_KEY) {
          res.statusCode = 503;
          return res.end('no key');
        }
        let body = '';
        for await (const chunk of req) body += chunk;
        try {
          const content = await talkChat(env, JSON.parse(body));
          res.statusCode = content ? 200 : 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ content }));
        } catch (e) {
          res.statusCode = 502;
          res.end(JSON.stringify({ content: null, error: String(e) }));
        }
      });
    },
  };
}

// Electron 빌드는 dist/(file:// 로드), 웹 미리보기는 dist-web/ 단일 HTML.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    plugins: mode === 'web' ? [react(), viteSingleFile()] : [react(), talkProxy(env)],
    build: { outDir: mode === 'web' ? 'dist-web' : 'dist', emptyOutDir: true },
  };
});
