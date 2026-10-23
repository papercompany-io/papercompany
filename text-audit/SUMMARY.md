# AI 문체 제거 작업 요약

2026-10-23. 커밋하지 않고 diff 상태로 두었습니다.

## 숫자

| 항목 | 수 |
|---|---:|
| 확인한 문자열 | 10,287 (묶음 157개) |
| 수정 | 629 (묶음 에이전트) + 18곳 (검수에서 통일) |
| 보류 | 129 (전체 목록: [held.md](held.md)) |
| 되돌림 | 0 |

- 파일별 문자열 수와 묶음은 [inventory.md](inventory.md)에 있습니다.
- 묶음별 수정표는 `reports/<묶음>.md`, 검수 결과는 [reports/_review.md](reports/_review.md)에 있습니다.
- 제외한 파일: `talk.json`, `talk.ts`, `talkPrompt.ts`, `chat.ts`, `tutorial.json`, `Tutorial.tsx`(다른 세션이 수정 중), `DevPanel.tsx`, `sim.ts`, `names.json`. 이 파일들은 확인하지 않았습니다.

## 검사

- `npx tsc -p tsconfig.json --noEmit`: 통과
- `src/data/*.json` 40개 파싱: 통과
- `npm run build`: 통과. 기존 chunk 크기 경고만 나왔고, `dist/`가 다시 만들어졌습니다.
- 봇 `npm run sim -- 2 7 --one`: 커리어 2판(상장 1, 파산 1)이 오류 없이 끝났습니다. 수정 전 결과와는 비교하지 않았습니다.
- 수정 628건 각각에 대해 원문을 `src`·`scripts`·`playtest`에서 검색했습니다. 코드가 원문과 비교하는 곳은 없었습니다.
- 플레이스홀더·태그·엔티티·따옴표: 자동으로 비교했습니다. 일부러 바꾼 2곳은 따로 확인했습니다.
  - `ProductApp.tsx:667`: `josa()` 조각을 없앴고, 쓰지 않게 된 import도 함께 지웠습니다.
  - `events-b.json:5411`: 인용 따옴표 `\"`를 추가했습니다.

## 확정한 용어집

전체 표와 "바꾸지 않는 것"은 [glossary.md](glossary.md)에 있습니다. 주요 결정은 다음과 같습니다.

| 개념 | 정한 말 | 쓰지 않는 말 |
|---|---|---|
| 플레이어 | 대표 | 사장, CEO(단독). 앱 이름 "CEO 일정"은 유지 |
| 조직 단위 | 부서 (A-237) | 팀(단독 라벨). "팀 탭"은 "부서 탭"으로 |
| 사람 | 직원 · 인력(배치 맥락) · 채용 · 해고/퇴사 · 월급 · 만족도 | 사원, 고용, 급여, 사기 |
| 사용자 흐름 | 사용자 · 유입 · 이탈 · 순증감 · 자연 이탈 · 해지(구독) | 유저, 들어옴, 떠남, 원래 떠나는 |
| 제품 | 출시 · 개발 중 · 기능 · 버그 · 매력도 · 인지도 · 지침(광고) · 사무실 · 외주 · 고객사 | 런칭, 만드는 중, 피처, 오류, 우리를 아는 사람, 오피스 |
| 돈 | 매출 · 비용 · 이익/손실 · 흑자/적자 · 잔고 · 런웨이 | 수익(매출 뜻), 지출, 번 돈·쓴 돈 |
| 투자 | 기업가치 · 투자 전/후 기업가치(프리/포스트밸류) · 투자사 · 투자자 · 지분 · 레터 | 회사 가치, 몸값, 밸류(단독) |
| 기간 | 월 기준, 월 ○○ | 한 달 환산, 한 달에 |

## 결정이 필요한 것

### 1. 화면 문구 방침 충돌 (해결: A-245)

실무 용어 방향을 유지하기로 했습니다. `docs/SCREEN_GUIDE.md` 1절 3항과 4절을 실무 용어·glossary 기준으로 고쳤고, `docs/ASSUMPTIONS.md`에 A-245를 추가했습니다.

### 2. 용어 결정 필요 (묶음 에이전트가 고치지 않고 넘긴 것)

| 지금 문구 | 쓰는 곳 | 후보 |
|---|---|---|
| 제품이 받쳐 주는 고객 (A-196) | CustomerFlow, MarketApp, hints.ts, product.ts, marketing.ts | 수용 한도, 수용 가능 고객 |
| 스스로 찾아옴 | CustomerFlow, MarketApp, marketing.ts | 자연 유입 |
| 제품보다 많이 데려옴 | marketing.ts | 수용량 초과 유입 |
| 만드는 순서(로드맵) | 제품 창, MilestoneCard, ScheduleApp, hints.ts, missions.json | 유지, 개발 순서, 로드맵 |
| 출력(하루 작업량, output) | ceo.json, events-a/b.json, ScheduleApp | 생산성, 작업량 |
| 보유 자금 / 잔고 | FinanceApp:349, valuation.ts, public.ts, exit.ts, achievements.json | 하나로 통일 |
| 이벤트 수입(일회성 입금) | events.ts | 이벤트 입금, 기타 매출 |
| 창업자 몫(종료 때 받은 돈) | Hall.tsx, career.ts | 유지, 창업자 수령액 |
| 코파운더 영입 | Setup.tsx | 영입 유지, 채용 |
| 새 주식 / 신주 | ExitApp | 신주 |
| 들어온 돈 / 나간 돈 | FinanceApp 장부 | 입금 / 출금 |
| 미리 갚기 | FinanceApp 대출 | 중도상환 |
| 받을 돈 / 투자금 | InvestApp (A-107) | 하나로 통일 |
| 내줄 지분 | InvestApp 143·190·359 | 유지, 신규 발행 지분 |
| 희석 | InvestApp 349 | 용어집에 추가할지 |
| 일하는 중 / 근무 중 | MessengerApp 재실 상태 | 근무 중 |
| 답을 기다리는 결정 | MessengerApp, hints.ts | 결정 대기 |
| 맡은 일 / 업무 / 일, 맡길 곳 | MessengerApp, 부서 페이지 | 업무, 배정 |
| 대신 감 / 대리 참석 | outings.ts:135, ScheduleApp:467 | 대리 참석 |
| 물러나기 / 사임 | ExitApp, StockApp, exit.ts | 사임 |

### 3. 보류 129건의 갈래 ([held.md](held.md))

- 위 용어 결정을 기다리는 것: 약 50건
- 코드가 문구를 비교에 써서 못 바꾸는 것: 약 15건
  - 예: `startsWith('규모:')`, 선택지 "정책자금…", 광고 궁합 "보통"
  - 문구를 고치려면 비교 코드도 같이 바꿔야 합니다.
- 고유명사·앱 이름: 약 25건
- 여러 파일이 같은 문구를 써서 한 번에 정해야 하는 것: 약 10건
  - 예: "자금이 부족합니다"는 그대로 두기로 했습니다.
- 그 밖: 대사 말투, 판단이 애매한 것

### 4. 이번 작업 전부터 섞여 있던 것 (그대로 둠)

- "Space"와 "스페이스"가 섞여 있습니다. 그중 SettingsApp은 다른 세션이 고치는 중입니다.
- "엑싯"과 "Exit"이 섞여 있습니다.
- `milestones.ts:553·574`의 조사가 받침과 상관없이 고정돼 있습니다.

## 글자 수가 늘어 UI를 확인해야 할 화면

30% 넘게 늘어난 문구는 25건입니다. 표 전체는 [reports/_review.md](reports/_review.md)에 있습니다. 브라우저에서 직접 보지는 않았습니다.

| 화면 | 위치 | 변화 |
|---|---|---|
| **투자 창 요약 칸** (가장 위험) | InvestApp.tsx 187·191·271·355·363 | "회사 가치"(5자) → "투자 전/후 기업가치"(9자). 한 줄에 칸 3개 |
| 투자 창 본문·툴팁 | InvestApp.tsx 190·352·354·362 | 프리/포스트밸류 → 투자 전/후 기업가치(괄호 원어) |
| 왼쪽 메뉴 설명 | Desktop.tsx:35 | "일감·평판" → "외주 제안·평판" |
| 시장 창 광고 탭 | AdsPanel.tsx 72·116 | "돌리는 광고" → "집행 중인 광고" |
| 업무(제품) 창 | ProductApp.tsx 38·477 | 기능 분류 설명, "· 오늘 유입" |
| 시장·랭킹·주식 창 | MarketApp:182, RankingApp:150, StockApp:179 | 1~3자 늘어남(본문 안이라 위험 낮음) |

## 작업 중 생긴 일

- 작업 도중 다른 세션의 커밋 `832b9b5`("feat: Add glossary…")에 이 작업의 중간 산출물이 함께 들어갔습니다.
  - 들어간 것: `text-audit/`의 앞쪽 묶음 10여 개 보고서, inventory, glossary
  - 소스 수정은 그 커밋에 없습니다. 이번 문구 수정은 모두 커밋되지 않은 diff입니다.
- 작업 트리에는 다른 세션의 커밋 안 된 수정이 섞여 있습니다.
  - 파일: Game.tsx, SettingsApp.tsx, Tutorial.tsx, tutorial.json, guide.ts, meta.ts, store.ts, tutorial.css, docs 3개
  - Game.tsx와 SettingsApp.tsx에는 이번 문구 수정도 들어 있습니다. 커밋할 때는 줄 단위로 나눠 stage해야 합니다.
- 묶음 에이전트는 소스를 직접 고치지 않았습니다. 수정안을 `changes.json`(묶음별 항목을 한 파일로 합침, `batch` 필드)에 썼고, 그것을 한 스크립트로 적용했습니다.
  - 같은 파일(chatter.json 34묶음 등)을 여러 에이전트가 동시에 맡았기 때문입니다.
  - 적용 기록: `changes.json` 629건이 전부 적용됐습니다(1건은 따옴표 때문에 손으로 적용).
