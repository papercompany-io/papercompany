# ui-apps-ContractApp 문구 교정

확인 65개 / 수정 10개 / 보류 4개

## 수정

| 파일 경로 | 위치 | 원문 | 수정 | 이유 |
|---|---|---|---|---|
| src/ui/apps/ContractApp.tsx | 36 | 회사가 커서 거래처가 작은 일감을 맡기지 않습니다. | 회사가 커서 고객사가 작은 일감을 맡기지 않습니다. | 용어집: 거래처 → 고객사 |
| src/ui/apps/ContractApp.tsx | 93 | 기간 안에 대표 혼자는 어렵습니다. 받은 뒤 사람을 배치하세요. | 대표 혼자서는 기간 안에 끝내기 어렵습니다. 받은 뒤 인력을 배치하세요. | 어색한 어순, 용어집 인력 |
| src/ui/apps/ContractApp.tsx | 146 | 끝나는 때 | 예상 완료 | 풀어 쓴 라벨 |
| src/ui/apps/ContractApp.tsx | 150 | 마감과 비교 | 마감 대비 | 풀어 쓴 라벨 |
| src/ui/apps/ContractApp.tsx | 151 | 아무도 안 함 | 인력 없음 | 구어체 상태값 |
| src/ui/apps/ContractApp.tsx | 151 | 맞춤 | 제때 | 뜻이 흐린 상태값 |
| src/ui/apps/ContractApp.tsx | 162 | 하는 사람 | 작업 인력 | 풀어 쓴 라벨(누가 만드나 → 개발 인력과 같은 경우) |
| src/ui/apps/ContractApp.tsx | 252 | 이 외주 하는 중 | 이 외주 진행 중 | 구어체 상태 문구 |
| src/ui/apps/ContractApp.tsx | 282 | 외주 할 수 있는 사람 {n}명 | 외주 가능 인력 {n}명 | 풀어 쓴 라벨, 용어집 인력 |
| src/ui/apps/ContractApp.tsx | 295 | 배치한 사람은 이 외주가 끝날 때까지 … | 배치한 직원은 이 외주가 끝날 때까지 … | 용어집: 고용된 사람은 직원 |

참고: 146줄 "끝나는 때"는 src/ui/Feedback.tsx 250줄 "외주 진행" 카드에도 있습니다. 그쪽 묶음에서 "예상 완료"로 맞추면 두 화면 용어가 같아집니다.

## 보류

| 파일 경로 | 위치 | 원문 | 수정 | 판단이 필요한 까닭 |
|---|---|---|---|---|
| src/ui/apps/ContractApp.tsx | 83 | · 기간 근무 {o.days}일 · | (예: · 기간 {o.days}근무일 ·) | 어순이 어색하지만 조각이 플레이스홀더로 나뉘어 있고, 근무일 기준이라는 뜻을 유지할 표현을 정해야 합니다 |
| src/ui/apps/ContractApp.tsx | 189 | "+ 인원 배치"로 사람이나 부서를 넣거나 … | (사람 → 직원) | 같은 안내가 src/ui/hints.ts 45줄, src/core/contracts.ts 174줄에도 같은 문구로 있어 함께 바꿔야 합니다 |
| src/ui/apps/ContractApp.tsx | 164, 189 | + 인원 배치 | (+ 인력 배치) | "인원"은 용어집 금지어가 아니고, 189줄 안내와 theme.css 주석이 이 버튼 이름을 인용합니다. 바꾸면 두 곳을 같이 바꿔야 합니다 |
| src/ui/apps/ContractApp.tsx | 238 | 사람 | (직원) | 인원 배치 칸의 사람/부서 탭입니다. 직원 관리 창(TeamApp 224·267줄)도 "사람" 제목을 써서 한쪽만 바꾸면 어긋납니다 |
