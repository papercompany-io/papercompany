# ui-apps-ProductApp-3 문구 교정 (src/ui/apps/ProductApp.tsx 505~901)

확인 70개 / 수정 13개 / 보류 2개

## 수정

| 파일 경로 | 위치 | 원문 | 수정 | 이유 |
|---|---|---|---|---|
| src/ui/apps/ProductApp.tsx | 514 | 지금까지 장애 | 누적 장애 | 풀어 쓴 라벨 |
| src/ui/apps/ProductApp.tsx | 584 | ${dayText(...)} 뒤 출시 | 출시까지 ${dayText(...)} | 어순 |
| src/ui/apps/ProductApp.tsx | 585 | 만드는 순서에서 빼기 | 개발 순서에서 빼기 | 풀어 쓴 표현 |
| src/ui/apps/ProductApp.tsx | 605 | ${dayText(...)} 뒤 출시 (${formatDate(...)}) | 출시까지 ${dayText(...)} (${formatDate(...)}) | 어순 |
| src/ui/apps/ProductApp.tsx | 605 | 만드는 사람이 없어 멈춤 | 개발 인력이 없어 멈춤 | 용어집(인력) |
| src/ui/apps/ProductApp.tsx | 631 | 지금 만드는 기능 | 개발 중인 기능 | 용어집(개발 중) |
| src/ui/apps/ProductApp.tsx | 645 | 품질이 낮을수록 장애가 잦고 고객이 떠납니다 | 품질이 낮을수록 장애가 잦고 이탈이 늘어납니다 | 용어집(이탈) |
| src/ui/apps/ProductApp.tsx | 665 | 최근 2주 평균을 한 달로 바꾼 값입니다. 홍보를 하지 않으면 출시 날 들어온 대표의 지인 말고는 거의 들어오지 않습니다. 떠나는 이유는 … | 최근 2주 평균을 월 기준으로 바꾼 값입니다. 홍보를 하지 않으면 출시 날 대표 지인 유입 말고는 유입이 거의 없습니다. 이탈 이유는 … | 용어집(월 기준·유입·이탈) |
| src/ui/apps/ProductApp.tsx | 667 | {josa(ind.unit, '이')} 들고 나는 길 | {' '}유입·이탈 | 억지 은유(기준 예시) |
| src/ui/apps/ProductApp.tsx | 667 | 한 달 환산 | 월 기준 | 풀어 쓴 표현(기준 예시) |
| src/ui/apps/ProductApp.tsx | 771 | 만드는 중 | 개발 중 | 용어집(개발 중) |
| src/ui/apps/ProductApp.tsx | 814 | 만드는 순서에 있음 | 개발 순서에 있음 | 풀어 쓴 표현 |
| src/ui/apps/ProductApp.tsx | 892 | 매력도는 어디서 오나 | 매력도 구성 | 질문형 라벨 |

적용 주의: 667 수정으로 `josa` 호출이 이 파일에서 사라집니다. 20줄 `import { countShort, josa, ... }`의 `josa`가 쓰이지 않게 되므로(범위 밖 줄) 메인 에이전트가 함께 빼야 합니다. 1126줄(다른 묶음)에도 584·605와 같은 "뒤 출시"·"만드는 사람이 없어 멈춤" 문구가 있어 맞춰 고치는 것이 좋습니다.

## 보류

| 파일 경로 | 위치 | 원문 | 수정 | 이유 |
|---|---|---|---|---|
| src/ui/apps/ProductApp.tsx | 566 | ${pm.from}와 약속한 기능입니다. | (미정) | pm.from 이름 받침에 따라 "과"가 맞을 수 있음. josa() 적용은 코드 변경이라 판단 넘김 |
| src/ui/apps/ProductApp.tsx | 814 | 최고 버전까지 순서에 있음 | (유지) | "개발 순서"로 맞출지 판단 필요. 뜻은 통해 그대로 둠 |
