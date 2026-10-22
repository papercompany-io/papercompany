import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 자유 입력 DM(A-139): 개발 서버가 /api/jev 요청에 .env의 OPENROUTER_API_KEY를 붙여 OpenRouter Decisions(Jev)로 넘깁니다.
// Jev는 글을 쓰지 않고 주어진 질문의 선택지를 고르는 모델입니다(의도·업무·말투·주제). 답 문장은 게임이 대사 묶음으로 만듭니다.
// 키는 VITE_ 접두사가 없어 브라우저 번들에 들어가지 않습니다. 키가 없으면 503 → 게임은 키워드 규칙으로 읽습니다.
function jevProxy(env: Record<string, string>): Plugin {
  return {
    name: 'pc-jev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/jev', async (req, res) => {
        const key = env.OPENROUTER_API_KEY;
        if (req.method !== 'POST' || !key) {
          res.statusCode = 503;
          return res.end('no key');
        }
        let body = '';
        for await (const chunk of req) body += chunk;
        try {
          const { questions, state } = JSON.parse(body);
          const r = await fetch('https://openrouter.ai/api/alpha/decisions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'PaperCompany' },
            body: JSON.stringify({ model: env.OPENROUTER_MODEL || 'typesafe/jev-1.14', questions, state }),
          });
          const j = await r.json();
          res.statusCode = r.ok ? 200 : 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ answers: j?.answers ?? null, model: j?.model, error: r.ok ? undefined : j?.error?.message }));
        } catch (e) {
          res.statusCode = 502;
          res.end(JSON.stringify({ answers: null, error: String(e) }));
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
    plugins: mode === 'web' ? [react(), viteSingleFile()] : [react(), jevProxy(env)],
    build: { outDir: mode === 'web' ? 'dist-web' : 'dist', emptyOutDir: true },
  };
});
