---
name: screen-design
description: 페이퍼컴퍼니 앱 창(재무·투자·직원 관리·사무실·제품·커리어·설정·뉴스 등) 화면을 새로 만들거나 디자인을 개선할 때 쓰는 절차. "OO 페이지 디자인 개선", "AI 같아", "뭐가 뭔지 모르겠음", "이런 말 보여 주지 마", "채용 앱 참고" 같은 요청이면 먼저 읽을 것.
---

# 화면 디자인 절차

기준: `docs/SCREEN_GUIDE.md`(짜임·문구·숨김 목록), `docs/DESIGN_SYSTEM.md`(토큰·부품), 기준 화면 `src/ui/apps/HiringApp.tsx`.

## 1. 보기 전에 읽기

1. 고칠 앱 파일 전체를 읽고, 내보낸 컴포넌트가 다른 곳에서 쓰이는지 확인: `grep -rn "<이름>" src/ui | grep -v <파일>`.
2. `data-testid` 목록을 적어 둠: `grep -o 'data-testid={[^}]*}\|data-testid="[^"]*"' <파일>`. 개편 뒤에도 전부 남아야 함.
3. 쓰는 CSS 클래스 찾기: `grep -n "\.클래스" src/ui/*.css src/ui/apps/apps.css`. 예전 규칙이 `apps.css`에, 새 규칙은 `theme.css` 끝에.
4. 지금 화면을 브라우저로 봄(아래 4절). 데이터가 비어 있으면 무엇이 보일지 상상하지 말고 시험 데이터로 확인.

## 2. 짜기

- `SCREEN_GUIDE.md` 2절 패턴을 조합합니다. 우선순위: `.hire-layout`(판 + 카드) → `.post-card`/`.applicant-card` → `.hf-summary`/`.fb-row` → `.seg`.
- 긴 목록은 "왼쪽 짧은 줄 + 오른쪽 고른 하나" 로. 할 일이 여러 단계면 `.inv-guide`/`.inv-todo` 처럼 지금 단계를 표시(상태는 기존 게임 데이터에서 계산, 새 상태 추가 금지).
- 숫자 효과·시장 크기·경쟁사·비용 같은 금지 정보(3절)를 넣지 않았는지 확인.
- 문구는 쉬운 말 + 존댓말. 조사 받침 확인(반응이/품질은/결제를).
- 새 CSS는 `theme.css` 끝에 한 덩어리로, 맨 위 주석에 `/* 화면(A-번호): 한 줄 설명 */`. 색은 토큰만(`var(--positive)` 등).
- 결정 번호는 `docs/ASSUMPTIONS.md` 마지막 번호 + 1 로 새로 받고, 파일 첫 주석·CSS 주석·ASSUMPTIONS 한 줄에 같은 번호.

## 3. 검사

```bash
npx tsc -p tsconfig.json --noEmit
npx tsc -p tsconfig.json --noEmit --noUnusedLocals 2>&1 | grep <파일이름>
```

testid가 그대로인지 1절 목록과 비교.

## 4. 브라우저로 확인

- `preview_start {name: "dev"}` → 저장된 게임 "이어하기"(없으면 새 커리어 설정 4단계). 창 크기 1440×900로 맞춘 뒤 확인, 끝나면 `desktop`으로 되돌림.
- 왼쪽 메뉴 버튼은 `find "재무 ·"`처럼 찾고 ref로 클릭(이미 열린 앱을 다시 누르면 닫힘).
- 스크린샷이 한 박자 늦게 올 때가 있음. 텍스트는 `read_page`/`find`로 확인.
- 콘솔 에러는 `read_console_messages onlyErrors`. 편집 도중 생긴 예전 타임스탬프 에러는 지금 모듈을 다시 불러 확인:
  `const m = await import('/src/core/market.ts?t=' + Date.now())`.
- 데이터가 필요하면(직원 0명 등) 시험 데이터를 넣고 **끝나면 지움**. 예:
  ```js
  const st = await import('/src/ui/store.ts');
  st.act(g => { g.employees.push({ id: 'tmpemp1', ... }) });   // 확인 뒤
  st.act(g => { g.employees = g.employees.filter(e => !e.id.startsWith('tmp')) });
  ```
  자동 저장에 남을 수 있으니 지웠는지 `window.__pc()`로 확인하고 사용자에게 알림.
- 사용자가 플레이 중이면 라운드 열기·레터·채용 같은 **게임 행동은 하지 않음**. 읽기만.
- 끝난 저장(파산 등)이라 화면을 볼 게임이 없으면: localStorage(`papercompany.save`·`.save.bak`·`.profile`)를 sessionStorage에 백업 → 새 커리어로 시험(핵심 기능·출시·`runDay`로 며칠 진행은 `act` 안에서) → **`setGame(null)`로 게임을 내린 뒤** 백업을 되돌리고 새로고침. 게임이 떠 있으면 새로고침 직전 자동 저장이 시험 게임으로 덮어씀. 되돌린 뒤 세 키가 백업과 같은지 확인

## 5. 마무리

- 좁은 창(900px 아래)에서도 한 번 확인.
- 바뀐 것·숨긴 것·확인 못 한 화면(예: 라운드 진행 중 화면)을 사용자에게 그대로 말함.
