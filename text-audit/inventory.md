# 문자열 목록 (inventory)

플레이어에게 보이는 한국어 문자열 수. 2026-10-23 기준, `src/` 아래 .ts/.tsx/.json.

- 세는 법: TS/TSX는 TypeScript 구문 트리에서 한글이 든 문자열·템플릿 조각·JSX 텍스트(주석·`console.*` 제외). JSON은 한글이 든 문자열 값(`_note` 등 `_`로 시작하는 설계 메모 키 제외).
- 합계 **10287개**, 파일 104개, 묶음 157개(묶음당 80개 이하).

## 제외한 파일

| 파일 | 이유 |
|---|---|
| src/data/talk.json, src/core/talk.ts, src/core/talkPrompt.ts, src/core/chat.ts, src/data/tutorial.json, src/ui/Tutorial.tsx | 다른 세션이 수정 중(커밋 안 된 변경) |
| src/core/talkPrompt.ts | LLM에 보내는 프롬프트(플레이어에게 안 보임) |
| src/ui/DevPanel.tsx | 개발자용 패널 |
| src/core/sim.ts | 봇·시뮬레이션용 |
| src/data/names.json | 사람 이름 목록 |
| scripts/, playtest/ | 개발 도구 |

## 파일별

| 파일 | 갈래 | 문자열 | 묶음 |
|---|---|---:|---|
| src/core/ads.ts | 규칙·알림 문구 | 38 | core-ads |
| src/core/adsales.ts | 규칙·알림 문구 | 68 | core-adsales |
| src/core/aiadopt.ts | 규칙·알림 문구 | 25 | core-aiadopt-plus5 |
| src/core/burning.ts | 규칙·알림 문구 | 17 | core-aiadopt-plus5 |
| src/core/calendar.ts | 규칙·알림 문구 | 4 | core-aiadopt-plus5 |
| src/core/career.ts | 규칙·알림 문구 | 23 | core-aiadopt-plus5 |
| src/core/ceo.ts | 규칙·알림 문구 | 8 | core-aiadopt-plus5 |
| src/core/chatter.ts | 규칙·알림 문구 | 1 | core-aiadopt-plus5 |
| src/core/competitors.ts | 규칙·알림 문구 | 29 | core-competitors-plus3 |
| src/core/contracts.ts | 규칙·알림 문구 | 29 | core-competitors-plus3 |
| src/core/economy.ts | 규칙·알림 문구 | 3 | core-competitors-plus3 |
| src/core/equity.ts | 규칙·알림 문구 | 14 | core-competitors-plus3 |
| src/core/events.ts | 규칙·알림 문구 | 51 | core-events |
| src/core/exit.ts | 규칙·알림 문구 | 50 | core-exit-plus1 |
| src/core/finance.ts | 규칙·알림 문구 | 13 | core-exit-plus1 |
| src/core/format.ts | 규칙·알림 문구 | 34 | core-format |
| src/core/funding.ts | 규칙·알림 문구 | 157 | core-funding-1, core-funding-2 |
| src/core/hiring.ts | 규칙·알림 문구 | 85 | core-hiring-1, core-hiring-2 |
| src/core/loans.ts | 규칙·알림 문구 | 43 | core-loans-plus1 |
| src/core/market.ts | 규칙·알림 문구 | 23 | core-loans-plus1 |
| src/core/marketing.ts | 규칙·알림 문구 | 51 | core-marketing |
| src/core/meeting.ts | 규칙·알림 문구 | 80 | core-meeting |
| src/core/messenger.ts | 규칙·알림 문구 | 12 | core-messenger |
| src/core/milestones.ts | 규칙·알림 문구 | 145 | core-milestones-1, core-milestones-2 |
| src/core/office.ts | 규칙·알림 문구 | 54 | core-office |
| src/core/orders.ts | 규칙·알림 문구 | 47 | core-orders |
| src/core/outings.ts | 규칙·알림 문구 | 95 | core-outings-1, core-outings-2 |
| src/core/product.ts | 규칙·알림 문구 | 47 | core-product |
| src/core/progress.ts | 규칙·알림 문구 | 35 | core-progress |
| src/core/public.ts | 규칙·알림 문구 | 50 | core-public |
| src/core/reactions.ts | 규칙·알림 문구 | 150 | core-reactions-1, core-reactions-2 |
| src/core/squads.ts | 규칙·알림 문구 | 30 | core-squads-plus1 |
| src/core/staff.ts | 규칙·알림 문구 | 48 | core-squads-plus1 |
| src/core/state.ts | 규칙·알림 문구 | 9 | core-state-plus1 |
| src/core/valuation.ts | 규칙·알림 문구 | 34 | core-state-plus1 |
| src/data/achievements.json | 데이터 | 134 | data-achievements-1, data-achievements-2 |
| src/data/ads.json | 데이터 | 56 | data-ads |
| src/data/adsales.json | 데이터 | 47 | data-adsales-plus2 |
| src/data/ai.json | 데이터 | 6 | data-adsales-plus2 |
| src/data/candidates.json | 데이터 | 10 | data-adsales-plus2 |
| src/data/career.json | 데이터 | 48 | data-career-plus1 |
| src/data/ceo.json | 데이터 | 31 | data-career-plus1 |
| src/data/chatter.json | 이벤트·대사 | 2700 | data-chatter-1 … data-chatter-34 (34개) |
| src/data/contracts.json | 데이터 | 35 | data-contracts-plus2 |
| src/data/departments.json | 데이터 | 20 | data-contracts-plus2 |
| src/data/economy.json | 데이터 | 3 | data-contracts-plus2 |
| src/data/events-a.json | 이벤트·대사 | 1086 | data-events-a-1 … data-events-a-14 (14개) |
| src/data/events-b.json | 이벤트·대사 | 1108 | data-events-b-1 … data-events-b-14 (14개) |
| src/data/features.json | 데이터 | 376 | data-features-1 … data-features-5 (5개) |
| src/data/founderSpecs.json | 데이터 | 20 | data-founderSpecs-plus3 |
| src/data/funding.json | 데이터 | 21 | data-founderSpecs-plus3 |
| src/data/furniture.json | 데이터 | 22 | data-founderSpecs-plus3 |
| src/data/hiring.json | 데이터 | 9 | data-founderSpecs-plus3 |
| src/data/industries.json | 데이터 | 59 | data-industries-plus1 |
| src/data/instructions.json | 데이터 | 20 | data-industries-plus1 |
| src/data/investors.json | 데이터 | 34 | data-investors |
| src/data/markets.json | 데이터 | 174 | data-markets-1, data-markets-2, data-markets-3 |
| src/data/meetings.json | 데이터 | 101 | data-meetings-1, data-meetings-2 |
| src/data/milestones.json | 데이터 | 21 | data-milestones |
| src/data/missions.json | 데이터 | 66 | data-missions-plus1 |
| src/data/offices.json | 데이터 | 12 | data-missions-plus1 |
| src/data/orders.json | 데이터 | 52 | data-orders-plus2 |
| src/data/product.json | 데이터 | 3 | data-orders-plus2 |
| src/data/public.json | 데이터 | 3 | data-orders-plus2 |
| src/data/traits.json | 데이터 | 32 | data-traits-plus1 |
| src/data/welfare.json | 데이터 | 24 | data-traits-plus1 |
| src/ui/App.tsx | 화면 공통 | 5 | ui-App-plus1 |
| src/ui/Boot.tsx | 화면 공통 | 14 | ui-App-plus1 |
| src/ui/Career.tsx | 화면 공통 | 65 | ui-Career |
| src/ui/Desktop.tsx | 화면 공통 | 57 | ui-Desktop |
| src/ui/EmployeeModal.tsx | 화면 공통 | 30 | ui-EmployeeModal-plus1 |
| src/ui/Feedback.tsx | 화면 공통 | 38 | ui-EmployeeModal-plus1 |
| src/ui/Game.tsx | 화면 공통 | 85 | ui-Game-1, ui-Game-2 |
| src/ui/Hall.tsx | 화면 공통 | 23 | ui-Hall-plus2 |
| src/ui/MeetingModal.tsx | 화면 공통 | 45 | ui-Hall-plus2 |
| src/ui/NewsTicker.tsx | 화면 공통 | 9 | ui-Hall-plus2 |
| src/ui/Setup.tsx | 화면 공통 | 100 | ui-Setup-1, ui-Setup-2 |
| src/ui/apps/AdSalesPanel.tsx | 앱 창 | 115 | ui-apps-AdSalesPanel-1, ui-apps-AdSalesPanel-2 |
| src/ui/apps/AdsPanel.tsx | 앱 창 | 81 | ui-apps-AdsPanel-1, ui-apps-AdsPanel-2 |
| src/ui/apps/AiApp.tsx | 앱 창 | 45 | ui-apps-AiApp |
| src/ui/apps/CareerApp.tsx | 앱 창 | 37 | ui-apps-CareerApp |
| src/ui/apps/ContractApp.tsx | 앱 창 | 65 | ui-apps-ContractApp |
| src/ui/apps/CustomerFlow.tsx | 앱 창 | 19 | ui-apps-CustomerFlow-plus1 |
| src/ui/apps/CycleStrip.tsx | 앱 창 | 12 | ui-apps-CustomerFlow-plus1 |
| src/ui/apps/EmployeesApp.tsx | 앱 창 | 85 | ui-apps-EmployeesApp-1, ui-apps-EmployeesApp-2 |
| src/ui/apps/ExitApp.tsx | 앱 창 | 67 | ui-apps-ExitApp |
| src/ui/apps/FinanceApp.tsx | 앱 창 | 94 | ui-apps-FinanceApp-1, ui-apps-FinanceApp-2 |
| src/ui/apps/HiringApp.tsx | 앱 창 | 81 | ui-apps-HiringApp-1, ui-apps-HiringApp-2 |
| src/ui/apps/InvestApp.tsx | 앱 창 | 183 | ui-apps-InvestApp-1, ui-apps-InvestApp-2, ui-apps-InvestApp-3 |
| src/ui/apps/MarketApp.tsx | 앱 창 | 53 | ui-apps-MarketApp |
| src/ui/apps/MessengerApp.tsx | 앱 창 | 110 | ui-apps-MessengerApp-1, ui-apps-MessengerApp-2 |
| src/ui/apps/MilestoneCard.tsx | 앱 창 | 69 | ui-apps-MilestoneCard |
| src/ui/apps/OfficeApp.tsx | 앱 창 | 32 | ui-apps-OfficeApp |
| src/ui/apps/ProductApp.tsx | 앱 창 | 277 | ui-apps-ProductApp-1 … ui-apps-ProductApp-4 (4개) |
| src/ui/apps/RankingApp.tsx | 앱 창 | 30 | ui-apps-RankingApp |
| src/ui/apps/ScheduleApp.tsx | 앱 창 | 126 | ui-apps-ScheduleApp-1, ui-apps-ScheduleApp-2 |
| src/ui/apps/SettingsApp.tsx | 앱 창 | 49 | ui-apps-SettingsApp-plus1 |
| src/ui/apps/ShopApp.tsx | 앱 창 | 20 | ui-apps-SettingsApp-plus1 |
| src/ui/apps/StockApp.tsx | 앱 창 | 54 | ui-apps-StockApp |
| src/ui/apps/TeamApp.tsx | 앱 창 | 60 | ui-apps-TeamApp-plus1 |
| src/ui/apps/rankArt.tsx | 앱 창 | 2 | ui-apps-TeamApp-plus1 |
| src/ui/common.tsx | 화면 공통 | 5 | ui-common-plus1 |
| src/ui/hints.ts | 화면 공통 | 66 | ui-common-plus1 |
| src/ui/office/Office.tsx | 화면 공통 | 44 | ui-office-Office |

## 묶음

| 묶음 | 문자열 | 파일(줄 범위) |
|---|---:|---|
| core-ads | 38 | src/core/ads.ts |
| core-adsales | 68 | src/core/adsales.ts |
| core-aiadopt-plus5 | 78 | src/core/aiadopt.ts<br>src/core/burning.ts<br>src/core/calendar.ts<br>src/core/career.ts<br>src/core/ceo.ts<br>src/core/chatter.ts |
| core-competitors-plus3 | 75 | src/core/competitors.ts<br>src/core/contracts.ts<br>src/core/economy.ts<br>src/core/equity.ts |
| core-events | 51 | src/core/events.ts |
| core-exit-plus1 | 63 | src/core/exit.ts<br>src/core/finance.ts |
| core-format | 34 | src/core/format.ts |
| core-funding-1 | 79 | src/core/funding.ts (1~259) |
| core-funding-2 | 78 | src/core/funding.ts (260~끝) |
| core-hiring-1 | 43 | src/core/hiring.ts (1~318) |
| core-hiring-2 | 42 | src/core/hiring.ts (319~끝) |
| core-loans-plus1 | 66 | src/core/loans.ts<br>src/core/market.ts |
| core-marketing | 51 | src/core/marketing.ts |
| core-meeting | 80 | src/core/meeting.ts |
| core-messenger | 12 | src/core/messenger.ts |
| core-milestones-1 | 73 | src/core/milestones.ts (1~447) |
| core-milestones-2 | 72 | src/core/milestones.ts (448~끝) |
| core-office | 54 | src/core/office.ts |
| core-orders | 47 | src/core/orders.ts |
| core-outings-1 | 48 | src/core/outings.ts (1~211) |
| core-outings-2 | 47 | src/core/outings.ts (212~끝) |
| core-product | 47 | src/core/product.ts |
| core-progress | 35 | src/core/progress.ts |
| core-public | 50 | src/core/public.ts |
| core-reactions-1 | 75 | src/core/reactions.ts (1~168) |
| core-reactions-2 | 75 | src/core/reactions.ts (169~끝) |
| core-squads-plus1 | 78 | src/core/squads.ts<br>src/core/staff.ts |
| core-state-plus1 | 43 | src/core/state.ts<br>src/core/valuation.ts |
| data-achievements-1 | 67 | src/data/achievements.json (1~335) |
| data-achievements-2 | 67 | src/data/achievements.json (336~끝) |
| data-ads | 56 | src/data/ads.json |
| data-adsales-plus2 | 63 | src/data/adsales.json<br>src/data/ai.json<br>src/data/candidates.json |
| data-career-plus1 | 79 | src/data/career.json<br>src/data/ceo.json |
| data-chatter-1 | 80 | src/data/chatter.json (1~192) |
| data-chatter-2 | 80 | src/data/chatter.json (193~368) |
| data-chatter-3 | 80 | src/data/chatter.json (369~548) |
| data-chatter-4 | 80 | src/data/chatter.json (549~723) |
| data-chatter-5 | 80 | src/data/chatter.json (724~904) |
| data-chatter-6 | 80 | src/data/chatter.json (905~1071) |
| data-chatter-7 | 80 | src/data/chatter.json (1072~1249) |
| data-chatter-8 | 80 | src/data/chatter.json (1250~1417) |
| data-chatter-9 | 80 | src/data/chatter.json (1418~1596) |
| data-chatter-10 | 80 | src/data/chatter.json (1597~1772) |
| data-chatter-11 | 80 | src/data/chatter.json (1773~1940) |
| data-chatter-12 | 80 | src/data/chatter.json (1941~2120) |
| data-chatter-13 | 80 | src/data/chatter.json (2121~2299) |
| data-chatter-14 | 80 | src/data/chatter.json (2300~2480) |
| data-chatter-15 | 80 | src/data/chatter.json (2481~2656) |
| data-chatter-16 | 80 | src/data/chatter.json (2657~2834) |
| data-chatter-17 | 80 | src/data/chatter.json (2835~3018) |
| data-chatter-18 | 80 | src/data/chatter.json (3019~3186) |
| data-chatter-19 | 80 | src/data/chatter.json (3187~3362) |
| data-chatter-20 | 80 | src/data/chatter.json (3363~3538) |
| data-chatter-21 | 80 | src/data/chatter.json (3539~3712) |
| data-chatter-22 | 80 | src/data/chatter.json (3713~3898) |
| data-chatter-23 | 80 | src/data/chatter.json (3899~4072) |
| data-chatter-24 | 80 | src/data/chatter.json (4073~4248) |
| data-chatter-25 | 80 | src/data/chatter.json (4249~4418) |
| data-chatter-26 | 80 | src/data/chatter.json (4419~4598) |
| data-chatter-27 | 80 | src/data/chatter.json (4599~4774) |
| data-chatter-28 | 80 | src/data/chatter.json (4775~4958) |
| data-chatter-29 | 80 | src/data/chatter.json (4959~5126) |
| data-chatter-30 | 80 | src/data/chatter.json (5127~5300) |
| data-chatter-31 | 80 | src/data/chatter.json (5301~5476) |
| data-chatter-32 | 80 | src/data/chatter.json (5477~5646) |
| data-chatter-33 | 80 | src/data/chatter.json (5647~5826) |
| data-chatter-34 | 60 | src/data/chatter.json (5827~끝) |
| data-contracts-plus2 | 58 | src/data/contracts.json<br>src/data/departments.json<br>src/data/economy.json |
| data-events-a-1 | 78 | src/data/events-a.json (1~507) |
| data-events-a-2 | 78 | src/data/events-a.json (508~1030) |
| data-events-a-3 | 78 | src/data/events-a.json (1031~1499) |
| data-events-a-4 | 78 | src/data/events-a.json (1500~2004) |
| data-events-a-5 | 78 | src/data/events-a.json (2005~2466) |
| data-events-a-6 | 78 | src/data/events-a.json (2467~3002) |
| data-events-a-7 | 78 | src/data/events-a.json (3003~3475) |
| data-events-a-8 | 78 | src/data/events-a.json (3476~3927) |
| data-events-a-9 | 78 | src/data/events-a.json (3928~4371) |
| data-events-a-10 | 78 | src/data/events-a.json (4372~4802) |
| data-events-a-11 | 78 | src/data/events-a.json (4803~5217) |
| data-events-a-12 | 78 | src/data/events-a.json (5218~5658) |
| data-events-a-13 | 78 | src/data/events-a.json (5659~6116) |
| data-events-a-14 | 72 | src/data/events-a.json (6117~끝) |
| data-events-b-1 | 80 | src/data/events-b.json (1~440) |
| data-events-b-2 | 80 | src/data/events-b.json (441~908) |
| data-events-b-3 | 80 | src/data/events-b.json (909~1427) |
| data-events-b-4 | 80 | src/data/events-b.json (1428~1875) |
| data-events-b-5 | 80 | src/data/events-b.json (1876~2350) |
| data-events-b-6 | 80 | src/data/events-b.json (2351~2812) |
| data-events-b-7 | 80 | src/data/events-b.json (2813~3289) |
| data-events-b-8 | 80 | src/data/events-b.json (3290~3808) |
| data-events-b-9 | 80 | src/data/events-b.json (3809~4294) |
| data-events-b-10 | 80 | src/data/events-b.json (4295~4738) |
| data-events-b-11 | 80 | src/data/events-b.json (4739~5233) |
| data-events-b-12 | 80 | src/data/events-b.json (5234~5693) |
| data-events-b-13 | 80 | src/data/events-b.json (5694~6178) |
| data-events-b-14 | 68 | src/data/events-b.json (6179~끝) |
| data-features-1 | 76 | src/data/features.json (1~67) |
| data-features-2 | 76 | src/data/features.json (68~107) |
| data-features-3 | 76 | src/data/features.json (108~147) |
| data-features-4 | 76 | src/data/features.json (148~187) |
| data-features-5 | 72 | src/data/features.json (188~끝) |
| data-founderSpecs-plus3 | 72 | src/data/founderSpecs.json<br>src/data/funding.json<br>src/data/furniture.json<br>src/data/hiring.json |
| data-industries-plus1 | 79 | src/data/industries.json<br>src/data/instructions.json |
| data-investors | 34 | src/data/investors.json |
| data-markets-1 | 58 | src/data/markets.json (1~137) |
| data-markets-2 | 58 | src/data/markets.json (138~142) |
| data-markets-3 | 58 | src/data/markets.json (143~끝) |
| data-meetings-1 | 51 | src/data/meetings.json (1~32) |
| data-meetings-2 | 50 | src/data/meetings.json (33~끝) |
| data-milestones | 21 | src/data/milestones.json |
| data-missions-plus1 | 78 | src/data/missions.json<br>src/data/offices.json |
| data-orders-plus2 | 58 | src/data/orders.json<br>src/data/product.json<br>src/data/public.json |
| data-traits-plus1 | 56 | src/data/traits.json<br>src/data/welfare.json |
| ui-App-plus1 | 19 | src/ui/App.tsx<br>src/ui/Boot.tsx |
| ui-Career | 65 | src/ui/Career.tsx |
| ui-Desktop | 57 | src/ui/Desktop.tsx |
| ui-EmployeeModal-plus1 | 68 | src/ui/EmployeeModal.tsx<br>src/ui/Feedback.tsx |
| ui-Game-1 | 43 | src/ui/Game.tsx (1~517) |
| ui-Game-2 | 42 | src/ui/Game.tsx (518~끝) |
| ui-Hall-plus2 | 77 | src/ui/Hall.tsx<br>src/ui/MeetingModal.tsx<br>src/ui/NewsTicker.tsx |
| ui-Setup-1 | 50 | src/ui/Setup.tsx (1~218) |
| ui-Setup-2 | 50 | src/ui/Setup.tsx (219~끝) |
| ui-apps-AdSalesPanel-1 | 58 | src/ui/apps/AdSalesPanel.tsx (1~225) |
| ui-apps-AdSalesPanel-2 | 57 | src/ui/apps/AdSalesPanel.tsx (226~끝) |
| ui-apps-AdsPanel-1 | 41 | src/ui/apps/AdsPanel.tsx (1~204) |
| ui-apps-AdsPanel-2 | 40 | src/ui/apps/AdsPanel.tsx (205~끝) |
| ui-apps-AiApp | 45 | src/ui/apps/AiApp.tsx |
| ui-apps-CareerApp | 37 | src/ui/apps/CareerApp.tsx |
| ui-apps-ContractApp | 65 | src/ui/apps/ContractApp.tsx |
| ui-apps-CustomerFlow-plus1 | 31 | src/ui/apps/CustomerFlow.tsx<br>src/ui/apps/CycleStrip.tsx |
| ui-apps-EmployeesApp-1 | 43 | src/ui/apps/EmployeesApp.tsx (1~153) |
| ui-apps-EmployeesApp-2 | 42 | src/ui/apps/EmployeesApp.tsx (154~끝) |
| ui-apps-ExitApp | 67 | src/ui/apps/ExitApp.tsx |
| ui-apps-FinanceApp-1 | 47 | src/ui/apps/FinanceApp.tsx (1~154) |
| ui-apps-FinanceApp-2 | 47 | src/ui/apps/FinanceApp.tsx (155~끝) |
| ui-apps-HiringApp-1 | 41 | src/ui/apps/HiringApp.tsx (1~299) |
| ui-apps-HiringApp-2 | 40 | src/ui/apps/HiringApp.tsx (300~끝) |
| ui-apps-InvestApp-1 | 61 | src/ui/apps/InvestApp.tsx (1~347) |
| ui-apps-InvestApp-2 | 61 | src/ui/apps/InvestApp.tsx (348~618) |
| ui-apps-InvestApp-3 | 61 | src/ui/apps/InvestApp.tsx (619~끝) |
| ui-apps-MarketApp | 53 | src/ui/apps/MarketApp.tsx |
| ui-apps-MessengerApp-1 | 55 | src/ui/apps/MessengerApp.tsx (1~321) |
| ui-apps-MessengerApp-2 | 55 | src/ui/apps/MessengerApp.tsx (322~끝) |
| ui-apps-MilestoneCard | 69 | src/ui/apps/MilestoneCard.tsx |
| ui-apps-OfficeApp | 32 | src/ui/apps/OfficeApp.tsx |
| ui-apps-ProductApp-1 | 70 | src/ui/apps/ProductApp.tsx (1~259) |
| ui-apps-ProductApp-2 | 70 | src/ui/apps/ProductApp.tsx (260~504) |
| ui-apps-ProductApp-3 | 70 | src/ui/apps/ProductApp.tsx (505~901) |
| ui-apps-ProductApp-4 | 67 | src/ui/apps/ProductApp.tsx (902~끝) |
| ui-apps-RankingApp | 30 | src/ui/apps/RankingApp.tsx |
| ui-apps-ScheduleApp-1 | 63 | src/ui/apps/ScheduleApp.tsx (1~269) |
| ui-apps-ScheduleApp-2 | 63 | src/ui/apps/ScheduleApp.tsx (270~끝) |
| ui-apps-SettingsApp-plus1 | 69 | src/ui/apps/SettingsApp.tsx<br>src/ui/apps/ShopApp.tsx |
| ui-apps-StockApp | 54 | src/ui/apps/StockApp.tsx |
| ui-apps-TeamApp-plus1 | 62 | src/ui/apps/TeamApp.tsx<br>src/ui/apps/rankArt.tsx |
| ui-common-plus1 | 71 | src/ui/common.tsx<br>src/ui/hints.ts |
| ui-office-Office | 44 | src/ui/office/Office.tsx |
