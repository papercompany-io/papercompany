# ui-apps-ScheduleApp-1 (src/ui/apps/ScheduleApp.tsx 1~269)

확인 63개 / 수정 12개 / 보류 2개

## 수정

| 파일 경로 | 위치 | 원문 | 수정 | 이유 |
|---|---|---|---|---|
| src/ui/apps/ScheduleApp.tsx | 32 | 받은 외주 일감을 합니다(없으면 제품 개발). | 받은 외주를 진행합니다(없으면 제품 개발). | 어색한 서술 |
| src/ui/apps/ScheduleApp.tsx | 100 | 아무도 만들지 않음 | 개발 인력 없음 | 풀어 쓴 표현, 용어집(인력) |
| src/ui/apps/ScheduleApp.tsx | 161 | 외출·야근·자금 압박에 닳고, 하루마다 조금씩 회복합니다. | 외출·야근·자금 압박으로 줄고, 매일 조금씩 회복합니다. | 은유(닳고) |
| src/ui/apps/ScheduleApp.tsx | 171 | 주 업무 · 약속이 없는 시간에 하는 일 | 주 업무 · 약속 없는 시간 | 풀어 쓴 설명형 라벨 |
| src/ui/apps/ScheduleApp.tsx | 210 | 대표 활동으로 쌓인 것 | 대표 활동 성과 | 풀어 쓴 설명형 라벨 |
| src/ui/apps/ScheduleApp.tsx | 220 | 밀려서 일이 늦어지고 있습니다 | 밀림 · 업무 지연 중 | 상태 값을 짧게 |
| src/ui/apps/ScheduleApp.tsx | 220 | 제때 처리하고 있습니다 | 제때 처리 중 | 상태 값을 짧게 |
| src/ui/apps/ScheduleApp.tsx | 226 | 바깥과 한 약속을 지켜 온 기록입니다. 투자 결정과 고객사 계약 규모에 들어갑니다. 오래되면 잊힙니다. | 외부와 한 약속을 지킨 기록입니다. 투자 결정과 고객사 계약 규모에 반영됩니다. 오래되면 잊힙니다. | 어색한 서술 |
| src/ui/apps/ScheduleApp.tsx | 231 | 이 회사에서 | 이 회사 기록 | 문장 조각 라벨을 명사형으로 |
| src/ui/apps/ScheduleApp.tsx | 243 | …날짜를 제안하면 여기에 옵니다. … | …날짜를 제안하면 여기에 표시됩니다. … | 구어체 |
| src/ui/apps/ScheduleApp.tsx | 263 | 투자 라운드 중 · 투자 미팅 초대가 자주 옴 | 투자 라운드 중 · 투자 미팅 초대 많음 | 구어체 칩 문구 |
| src/ui/apps/ScheduleApp.tsx | 267 | 앞 4주 | 이전 4주 | "앞"이 이전/다음 중 모호 |

## 보류

| 파일 경로 | 위치 | 원문 | 수정 | 판단이 필요한 까닭 |
|---|---|---|---|---|
| src/ui/apps/ScheduleApp.tsx | 35 | 쌓인 결재를 처리해 전 직원 출력이 떨어지지 않게 합니다. | (미정) | "출력"(output 직역)을 "생산성" 등으로 바꿀지 용어 결정 필요 |
| src/ui/apps/ScheduleApp.tsx | 32 | 받은 외주 일감을 합니다 | 받은 외주를 진행합니다 | 수정은 했으나 src/data/orders.json `dev_contract` desc에 같은 꼴 문구가 있음. 다른 묶음과 맞출지 확인 |

## 용어 결정 필요

- "출력"(직원 작업량, 코드의 output): 화면 문구로 "생산성"·"작업량" 중 하나를 정해야 합니다.
