# ui-apps-ProductApp-2 문구 교정 (src/ui/apps/ProductApp.tsx 260~504)

확인 71개 / 수정 14개 / 보류 3개

## 수정

| 파일 경로 | 위치 | 원문 | 수정 | 이유 |
|---|---|---|---|---|
| src/ui/apps/ProductApp.tsx | 266 | 디자이너가 없으면 개발하는 사람이 디자인도 절반 속도로 합니다. | 디자이너가 없으면 개발 인력이 디자인도 절반 속도로 합니다. | 풀어 쓴 표현 |
| src/ui/apps/ProductApp.tsx | 273 | 개발팀이 하는 일 | 개발팀 업무 | 풀어 쓴 라벨 |
| src/ui/apps/ProductApp.tsx | 279 | 디자인팀이 하는 일 | 디자인팀 업무 | 풀어 쓴 라벨 |
| src/ui/apps/ProductApp.tsx | 285 | 대표 하루 일정 바꾸기 | 대표 일정 바꾸기 | 버튼 군더더기, 407줄 버튼과 통일 |
| src/ui/apps/ProductApp.tsx | 333 | 디자이너가 없으면 개발하는 사람이 디자인도 절반 속도로 합니다. | 디자이너가 없으면 개발 인력이 디자인도 절반 속도로 합니다. | 풀어 쓴 표현 |
| src/ui/apps/ProductApp.tsx | 363 | 만드는 중 ${...}% | 개발 중 ${...}% | 용어집: 개발 중 |
| src/ui/apps/ProductApp.tsx | 382 | 만드는 사람 | 개발 인력 | 풀어 쓴 라벨, 용어집 인력 |
| src/ui/apps/ProductApp.tsx | 395 | 개발자 1명을 뽑으면 출시가 | 개발자 1명을 채용하면 출시가 | 용어집: 채용 |
| src/ui/apps/ProductApp.tsx | 402 | 개발자 뽑기 | 개발자 채용 | 용어집: 채용 |
| src/ui/apps/ProductApp.tsx | 462 | 한 달 매출 | 월 매출 | 용어집: 월 기준 |
| src/ui/apps/ProductApp.tsx | 464 | 기준 30일로 환산 | 기준 월 환산 | 풀어 쓴 표현 |
| src/ui/apps/ProductApp.tsx | 466 | . 제품이 받쳐 주는 최대 약 | . 수용 가능한 최대 약 | 풀어 쓴 표현, 473줄 라벨과 통일 |
| src/ui/apps/ProductApp.tsx | 477 | · 오늘 | · 오늘 유입 | 의미가 흐린 라벨(오늘 신규 유입 수) |
| src/ui/apps/ProductApp.tsx | 497 | 품질이 낮으면 고객이 떠나고 장애가 납니다. | 품질이 낮으면 이탈이 늘고 장애가 납니다. | 용어집: 이탈 |

## 보류

| 파일 경로 | 위치 | 원문 | 수정 | 이유 |
|---|---|---|---|---|
| src/ui/apps/ProductApp.tsx | 342 | 개가 만드는 순서에 없습니다 | - | "만드는 순서"(로드맵)는 hints.ts·MilestoneCard·CycleStrip 등 여러 화면이 쓰는 게임 용어. 용어집에 없음 |
| src/ui/apps/ProductApp.tsx | 363 | 순서에 없음 | - | 위와 같은 로드맵 용어 |
| src/ui/apps/ProductApp.tsx | 377 | 개 모두 만드는 순서에 넣기 | - | 위와 같은 로드맵 용어 |

## 용어 결정 필요

- 로드맵(s.product.roadmap) 화면 이름: 지금 "만드는 순서". "개발 순서" 또는 "개발 대기열" 같은 짧은 말로 바꿀지 정해야 합니다. 정하면 342·363·377줄과 다른 파일을 함께 바꿉니다.
