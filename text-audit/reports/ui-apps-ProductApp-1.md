# ui-apps-ProductApp-1 문구 교정

확인 69개 / 수정 19개 / 보류 3개

## 수정

| 파일 경로 | 위치 | 원문 | 수정 | 이유 |
|---|---|---|---|---|
| src/ui/apps/ProductApp.tsx | 34 | 제품의 뼈대입니다. 다 있어야 출시합니다 | 모두 만들어야 출시합니다 | 억지 은유(뼈대) |
| src/ui/apps/ProductApp.tsx | 35 | 더 많이 데려옵니다 | 사용자 유입을 늘립니다 | 구어체, 용어집 유입 |
| src/ui/apps/ProductApp.tsx | 36 | 돈을 법니다 | 매출을 냅니다 | 용어집 매출 |
| src/ui/apps/ProductApp.tsx | 37 | 덜 떠나게 합니다 | 이탈을 줄입니다 | 용어집 이탈 |
| src/ui/apps/ProductApp.tsx | 38 | 안정과 서버 비용 | 안정성과 서버비를 관리합니다 | 한 묶음 안 명사형·문장형 섞임, 효과 줄 용어(안정성·서버비)와 맞춤 |
| src/ui/apps/ProductApp.tsx | 39 | 큰 회사와 계약을 맺게 합니다 | 대기업 계약을 엽니다 | 풀어 쓴 표현 |
| src/ui/apps/ProductApp.tsx | 40 | 다른 나라에 나갈 수 있게 합니다 | 해외 진출을 엽니다 | 풀어 쓴 표현 |
| src/ui/apps/ProductApp.tsx | 41 | 새 기술로 매력을 더합니다 | 새 기술로 매력도를 높입니다 | 용어집 매력도 |
| src/ui/apps/ProductApp.tsx | 42 | 다른 서비스와 이어 판을 키웁니다 | 다른 서비스와 연동해 규모를 키웁니다 | 억지 은유(판) |
| src/ui/apps/ProductApp.tsx | 62 | 떠나는 고객 | 이탈 | 용어집 이탈 |
| src/ui/apps/ProductApp.tsx | 65 | 광고 수익 + | 광고 매출 + | 용어집 매출(수익 쓰지 않음) |
| src/ui/apps/ProductApp.tsx | 74 | 버그 조금 생김 | 버그 약간 발생 | 구어체 라벨 |
| src/ui/apps/ProductApp.tsx | 103 | 당 한 달 매출 | 당 월 매출 | 용어집 월 기준 |
| src/ui/apps/ProductApp.tsx | 112 | 아직 결제 기능이 없어 무료로만 씁니다. 기능 탭에서 " | 결제 기능이 없어 무료로 제공 중입니다. 기능 탭에서 " | 주어 흐린 구어체 |
| src/ui/apps/ProductApp.tsx | 112 | " 기능을 만들어야 돈이 들어옵니다. | " 기능을 만들어야 매출이 생깁니다. | 용어집 매출 |
| src/ui/apps/ProductApp.tsx | 161 | MVP 만드는 중 · | MVP 개발 중 · | 용어집 개발 중 |
| src/ui/apps/ProductApp.tsx | 178 | 어제보다 늘어난 사용자 | 어제 대비 순증감 | 용어집 순증감(감소도 표시됨) |
| src/ui/apps/ProductApp.tsx | 184 | 만드는 중: | 개발 중: | 용어집 개발 중 |
| src/ui/apps/ProductApp.tsx | 257 | 누가 만드나 | 개발 인력 | 질문형 라벨 |

## 보류

| 파일 경로 | 위치 | 원문 | 수정 | 판단이 필요한 까닭 |
|---|---|---|---|---|
| src/ui/apps/ProductApp.tsx | 165 | 핵심 기능을 만드는 순서에 넣으세요 | (보류) | "만드는 순서"는 로드맵을 가리키는 게임 용어로 hints.ts·CycleStrip·MilestoneCard 등 여러 곳에서 씀. "개발 순서"/"로드맵" 중 용어 결정 필요 |
| src/ui/apps/ProductApp.tsx | 184 | 만들 기능이 없습니다 | (보류) | 같은 파일 554·1065줄(다른 묶음)과 같은 문구. 바꾸려면 함께 "개발할 기능이 없습니다"로 맞춰야 함 |
| src/ui/apps/ProductApp.tsx | 157 | 출시! | (보류) | 새 출시 배지의 느낌표. 이모지는 아니고 배지 강조 용도라 유지, 느낌표를 뺄지 방침 결정 필요 |

## 용어 결정 필요

- 로드맵(개발 대기열) 이름: 현재 "만드는 순서". 용어집에 없음. "개발 순서" 또는 "로드맵" 중 하나로 정하면 165줄과 다른 파일을 함께 바꿀 수 있습니다.
