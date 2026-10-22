# 페이퍼컴퍼니

한국 스타트업 창업 타이쿤(Startup Company 레퍼런스). 창업자 한 명의 커리어(30~65세)를 플레이합니다. React + TypeScript + Vite, Electron 패키징. 문서·화면·주석은 모두 한국어입니다.

## 명령

- `npm run dev` — 웹 개발 서버(미리보기 이름 `dev`, `.claude/launch.json`)
- `npx tsc -p tsconfig.json --noEmit` — 타입 검사(코드 바꾸면 항상). 지운 코드 뒤엔 `--noUnusedLocals`로 남은 변수 확인
- `npm run sim -- <판 수> <시드> --one` — 밸런싱 봇(화면 없이 커리어 전체). 수치·규칙을 바꾸면 같은 시드로 전후 비교
- `npm run build` — Electron + 웹 빌드

## 구조

- `src/core/` — 게임 규칙(순수 함수, 상태를 직접 바꿈). UI 없이 봇이 그대로 돌림
- `src/data/*.json` — 모든 수치·콘텐츠([예시값], 형식은 `docs/CONTENT_SCHEMA.md`). 수치는 코드가 아니라 여기서
- `src/ui/apps/*App.tsx` — 왼쪽 메뉴의 앱 창, `src/ui/Desktop.tsx`가 목록(`APPS`)과 창 연결
- `src/ui/theme.css` — 디자인 시스템 마지막 층(토큰·부품·화면 짜임)
- `src/ui/store.ts` — `useGame()` 읽기, `act(g => ...)` 바꾸기
- `scripts/sim/bot.ts` — 봇(유능한 플레이어 흉내), `playtest/` — Electron 플레이테스트 도구

## 문서 (먼저 읽기)

- `docs/SCREEN_GUIDE.md` — **화면 짜임·문구 규칙, 숨기는 정보 목록**(채용 짜임 기준)
- `docs/DESIGN_SYSTEM.md` — 색 토큰·부품
- `docs/ASSUMPTIONS.md` — 결정 기록 A-01~. 규칙·수치·화면 방침을 바꾸면 **다음 번호로 한 줄** 추가하고 코드 주석에 같은 번호
- `docs/GAME_DESIGN.md`, `docs/PROGRESS.md`, `docs/PLAYTEST.md`

## 규칙

- **결정 번호**: 새 번호는 `docs/ASSUMPTIONS.md` 마지막 번호 + 1. 이미 있는 번호를 다른 뜻으로 쓰지 않습니다. 다른 세션이 동시에 번호를 쓰므로 **ASSUMPTIONS에 줄을 쓰기 직전에** `grep -n "^| A-" docs/ASSUMPTIONS.md | tail -1`로 다시 확인하고, 겹치면 코드 주석까지 새 번호로 바꿉니다.
- **화면**: 새 화면·개편은 `screen-design` 스킬. 효과 수치·시장 크기·경쟁사 정보·복지 비용은 보여 주지 않습니다(SCREEN_GUIDE 3절).
- **규칙·수치**: `balance-change` 스킬. 공짜로 늘 이득인 행동(지배 전략)을 만들지 않습니다 — 선택마다 조건이나 대가를.
- **돈**: SaaS·커머스·AI는 결제 기능(`fx.billing`)을 만들어야 구독·거래 매출이 생깁니다(`canCharge`, A-111). MVP = 핵심(core) 기능만.
- **문구**: 쉬운 말, 존댓말 보고체, 이모지 금지, 조사 받침 확인. 대화는 메신저로.
- **testid·공유 컴포넌트**: `data-testid` 값과 내보낸 컴포넌트 모양을 유지(플레이테스트·봇이 씀).
- **사용자 게임 저장**: 브라우저로 확인할 때 사용자가 플레이 중일 수 있습니다. 라운드 열기·레터 보내기 같은 게임 행동은 하지 않고 읽기(`window.__pc()`)만. 시험 데이터를 넣었다면 끝나고 지우고 알립니다.
