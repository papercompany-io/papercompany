# ui-apps-MarketApp 문구 교정

확인 53개 / 수정 16개 / 보류 4개

## 수정

| 파일 경로 | 위치 | 원문 | 수정 | 이유 |
|---|---|---|---|---|
| src/ui/apps/MarketApp.tsx | 103 | 들여 진출하기 | 들여 진출 | 버튼 ~하기 생략 |
| src/ui/apps/MarketApp.tsx | 137 | 한 달 광고 예산 | 월 광고 예산 | 용어집: 월 기준 |
| src/ui/apps/MarketApp.tsx | 139 | 광고는 우리를 아는 사람을 늘리고, 고객을 직접 데려옵니다. 고객이 많아질수록 한 명 데려오는 값이 비싸집니다. … | 광고는 인지도를 올리고 고객을 직접 데려옵니다. 고객이 많아질수록 한 명을 데려오는 비용이 오릅니다. …(뒤 문장 그대로) | 용어집: 인지도·비용 |
| src/ui/apps/MarketApp.tsx | 152 | 우리를 아는 사람 | 인지도 | 용어집: 인지도 |
| src/ui/apps/MarketApp.tsx | 167 | 지금은 들어오는 고객보다 떠나는 고객이 많습니다. | 지금은 유입보다 이탈이 많습니다. | 용어집: 유입·이탈 |
| src/ui/apps/MarketApp.tsx | 171 | 한 달에 들고 나는 {unit} | 월 {unit} 유입·이탈 | 억지 은유, 월 기준 |
| src/ui/apps/MarketApp.tsx | 174 | 들어옴 | 유입 | 구어체 라벨 |
| src/ui/apps/MarketApp.tsx | 178 | 떠남 | 이탈 | 구어체 라벨 |
| src/ui/apps/MarketApp.tsx | 182 | 합계 | 순증감 | 용어집: 유입−이탈=순증감 |
| src/ui/apps/MarketApp.tsx | 218 | 경쟁사는 매달 기능을 내고 … 경쟁사를 사들여 … | 경쟁사는 매달 기능을 출시하고 … 경쟁사를 인수해 … | 용어 통일: 출시·인수 |
| src/ui/apps/MarketApp.tsx | 231 | 인수함 | 인수됨 | 상대 회사 카드 상태 표현 |
| src/ui/apps/MarketApp.tsx | 231 | 문 닫음 | 폐업 | 구어체 라벨 |
| src/ui/apps/MarketApp.tsx | 232 | 가격 내리는 중 | 가격 인하 중 | 풀어 쓴 라벨 |
| src/ui/apps/MarketApp.tsx | 247 | 사들이려면 {가격} | 인수가 {가격} | 문장형 라벨 |
| src/ui/apps/MarketApp.tsx | 293 | 대기업에서 받는 돈 | 대기업 매출 | 용어집: 매출 |
| src/ui/apps/MarketApp.tsx | 316 | 끝남 | 종료 | 구어체 상태 |

## 보류

| 파일 경로 | 위치 | 원문 | 수정 | 이유 |
|---|---|---|---|---|
| src/ui/apps/MarketApp.tsx | 117 | 아직 아무것도 안 쓰는 고객 | (없음) | 점유율 막대 빈 칸 툴팁. 구어체지만 짧은 대체어("미사용 고객", "남은 시장")가 뜻을 흐릴 수 있어 판단 필요 |
| src/ui/apps/MarketApp.tsx | 173 | 스스로 찾아옴 + | (후보: 자연 유입 +) | 용어 결정 필요. CustomerFlow.tsx:107에도 같은 말이 있어 함께 정해야 함 |
| src/ui/apps/MarketApp.tsx | 190 | 이 시장에서 지금 제품이 받쳐 주는 고객입니다(A-196). … | (없음) | "받쳐 주는"이 hints.ts:77·CustomerFlow.tsx에서도 쓰이는 개념어라 용어 결정 필요. 툴팁에 결정 번호(A-196)가 노출됨 |
| src/ui/apps/MarketApp.tsx | 192 | 제품이 받쳐 주는 {unit} / 약 / % 찼음 | (후보: 수용 가능 {unit}, % 도달) | 위와 같은 개념, 용어 결정 필요 |

## 용어 결정 필요

- "스스로 찾아옴"(organic inbound): 후보 "자연 유입". 용어집에는 "자연 이탈"만 있음.
- "제품이 받쳐 주는 고객"(A-196, 잠재 사용자 상한): 후보 "수용 가능 고객", "잠재 사용자". hints.ts·CustomerFlow.tsx와 함께 바꿔야 함.
