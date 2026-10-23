# 문구 교정 보고: data-career-plus1

확인 79개 / 수정 1개 / 보류 3개

대상: `src/data/career.json`, `src/data/ceo.json`. ceo.json 242줄의 두 항목은 `_note`(개발 메모, 화면에 나오지 않음)라 확인만 하고 고치지 않았습니다. 대사(초대 문구 "오실래요?" 등)는 말투를 유지했습니다.

## 수정

| 파일 경로 | 위치 | 원문 | 수정 | 이유 |
|---|---|---|---|---|
| src/data/career.json | 206 (endings.rich.text) | 100억이 넘는 자산과 함께 조용히 은퇴했습니다. 가끔 후배들에게 엔젤 투자를 합니다. | 100억이 넘는 자산을 남기고 조용히 은퇴했습니다. 가끔 후배들에게 엔젤 투자를 합니다. | 번역투(~과 함께) |

## 보류

| 파일 경로 | 위치 | 원문 | 제안 | 판단이 필요한 까닭 |
|---|---|---|---|---|
| src/data/career.json | 157 (endings.legend.text) | 두 번 넘게 회사를 상장시키고 … | 두 번 이상 회사를 상장시키고 … | 조건은 `ipos >= 2`(core/career.ts endingFor)인데 "두 번 넘게"는 3회 이상으로 읽힘. 문체가 아니라 뜻 교정이라 넘김 |
| src/data/career.json | 215 (endings.phoenix.text) | 두 번 넘게 망했지만 끝내 Exit을 해냈습니다. … | 두 번 이상 망했지만 끝내 Exit을 해냈습니다. … | 같은 이유(`bankruptcies >= 2`). "Exit"은 투자 창 탭 이름이라 유지 |
| src/data/ceo.json | 55 (actions.approve.desc) | 결재가 밀리지 않으면 전 직원 출력↑, 밀리면 출력↓ | (예) 전 직원 생산성↑ / 생산성↓ | "출력"(output 직역)이 ScheduleApp 등 다른 화면에도 쓰여 한 곳만 바꾸면 어긋남. 용어 결정 필요 |

## 용어 결정 필요

- **출력**(직원·대표의 하루 작업량): 화면 노출 문구에서 "출력"을 유지할지, "생산성"·"작업량" 중 하나로 통일할지. 사용처: `src/data/ceo.json` 55줄, `src/ui/apps/ScheduleApp.tsx` 35줄.
