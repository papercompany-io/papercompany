# ui-apps-ScheduleApp-2 (src/ui/apps/ScheduleApp.tsx 270~끝)

확인 63개 / 수정 5개 / 보류 2개

## 수정

| 파일 경로 | 위치 | 원문 | 수정 | 이유 |
|---|---|---|---|---|
| src/ui/apps/ScheduleApp.tsx | 298 | · 일부만 잘 됨 | · 부분 성공 | 구어체 결과 표기 |
| src/ui/apps/ScheduleApp.tsx | 361 | 만드는 사람이 없어 끝나지 않습니다 | 개발 인력이 없어 끝나지 않습니다 | 용어집(인력) |
| src/ui/apps/ScheduleApp.tsx | 363 | 만드는 중 | 개발 중 | 용어집(개발 중) |
| src/ui/apps/ScheduleApp.tsx | 415 | 지금 만드는 사람: | 개발 인력: | 풀어 쓴 라벨, 용어집(인력) |
| src/ui/apps/ScheduleApp.tsx | 485 | 누가 갈까 | 참석자 | 질문형 라벨 |

## 보류

| 파일 경로 | 위치 | 원문 | 수정 | 이유 |
|---|---|---|---|---|
| src/ui/apps/ScheduleApp.tsx | 344 | 만드는 순서 | (개발 순서?) | 제품 창 섹션 이름·힌트(hints.ts, MilestoneCard, ProductApp)가 같은 말을 씀. 이 줄만 바꾸면 화면끼리 어긋남. 다른 묶음(ProductApp-3)은 "개발 순서"로, data-missions는 유지로 갈려 있어 통일 결정이 필요 |
| src/ui/apps/ScheduleApp.tsx | 345 | 만드는 순서가 비어 있습니다. 업무 창 기능 탭에서 넣으세요. | (개발 순서가 …) | 위와 같은 용어 결정에 따름 |

## 용어 결정 필요

- "만드는 순서"(로드맵): 용어집에 없음. 후보 "개발 순서". 제품 창 섹션 이름, hints.ts:42, MilestoneCard.tsx:49, ProductApp 여러 곳, missions.json이 함께 씀. 정하면 한꺼번에 바꿔야 합니다.
