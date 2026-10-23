# ui-apps-CustomerFlow-plus1 문구 교정

확인 31개 / 수정 11개 / 보류 3개

## 수정

| 파일 경로 | 위치 | 원문 | 수정 | 이유 |
|---|---|---|---|---|
| src/ui/apps/CustomerFlow.tsx | 61 (title) | 이보다 많이 데려온 고객은 빠져나갑니다. | 이를 넘는 고객은 이탈합니다. | 풀어 쓴 표현, 용어집(이탈) |
| src/ui/apps/CustomerFlow.tsx | 87 | 아직 떠나는 고객이 거의 없습니다. | 아직 이탈 고객이 거의 없습니다. | 용어집(떠남→이탈) |
| src/ui/apps/CustomerFlow.tsx | 122 | 한 달에 {unit} {netText} | 월 {unit} 순증감 {netText} | 문장형 라벨, 용어집(월 순증감) |
| src/ui/apps/CustomerFlow.tsx | 125 | 들어옴 | 유입 | 구어체 라벨 |
| src/ui/apps/CustomerFlow.tsx | 127 | 주로 ${topIn[0]} | ${topIn[0]} 비중 높음 | 흐린 수식어 |
| src/ui/apps/CustomerFlow.tsx | 130 | 떠남 | 이탈 | 구어체 라벨 |
| src/ui/apps/CustomerFlow.tsx | 132 | 주로 ${lossName(...)} | ${lossName(...)} 비중 높음 | 흐린 수식어 |
| src/ui/apps/CustomerFlow.tsx | 141 | 들어오는 길 | 유입 | 억지 은유, 용어집(유입) |
| src/ui/apps/CustomerFlow.tsx | 158 | 떠나는 이유 | 이탈 이유 | 풀어 쓴 표현, 용어집(이탈) |
| src/ui/apps/CustomerFlow.tsx | 163 | 한 달에 {unit} ± | 월 {unit} 순증감 ± | 문장형 라벨, 용어집(월 순증감) |
| src/ui/apps/CycleStrip.tsx | 45 | 멈춤 · 만드는 사람이 없습니다 | 멈춤 · 개발 인력이 없습니다 | 풀어 쓴 표현, 용어집(인력) |

## 보류

| 파일 경로 | 위치 | 원문 | 수정안 | 판단이 필요한 까닭 |
|---|---|---|---|---|
| src/ui/apps/CustomerFlow.tsx | 62 | 제품이 받쳐 주는 {unit} | (예: 수용 한도 {unit}) | 풀어 쓴 라벨이지만 용어집에 대응어 없음. A-196 개념 이름이라 새 용어 결정 필요 |
| src/ui/apps/CustomerFlow.tsx | 107 | 스스로 찾아옴 | (예: 자연 유입) | 구어체 라벨이지만 용어집에 없음. MarketApp.tsx:173 title에도 같은 말이 있어 함께 정해야 함 |
| src/ui/apps/CycleStrip.tsx | 47 | 만드는 순서가 비었습니다 | (예: 개발 순서가 비었습니다) | "만드는 순서"가 로드맵을 가리키는 화면 공통 이름(hints.ts:42, MilestoneCard.tsx:49 등). 한 곳만 바꾸면 어긋남 |

## 용어 결정 필요

- 제품이 감당하는 사용자 상한(A-196 "제품이 받쳐 주는 고객"): 후보 "수용 한도"
- 홍보 없이 들어오는 사용자("스스로 찾아옴"): 후보 "자연 유입"(용어집 "자연 이탈"과 짝)
- 로드맵 이름("만드는 순서"): 후보 "개발 순서" — 여러 파일 공통이라 일괄 결정 필요
