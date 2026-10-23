# core-meeting 문구 교정

확인 80개 / 수정 6개 / 보류 1개

## 수정

| 파일 경로 | 위치 | 원문 | 수정 | 이유 |
|---|---|---|---|---|
| src/core/meeting.ts | 363 | 입니다. 실제로 어떻게 쓰시게 되는지 제가 설명드리겠습니다. | 입니다. 실제로 어떻게 쓰는지 제가 설명드리겠습니다. | 번역투(~하게 되는지), 대사 말투 유지 |
| src/core/meeting.ts | 559 | 대기업 계약! | 대기업 계약 체결: | 느낌표 제거 |
| src/core/meeting.ts | 559 | — 월 | , 월 | 문장 중간 대시 |
| src/core/meeting.ts | 647 | 분위기가 ${mood.text} — ${mood.level | 분위기가 ${mood.text}. ${mood.level | 문장 중간 대시(앞 문장이 "~습니다"로 끝남) |
| src/core/meeting.ts | 659 | 분위기가 ${mood.text} — ${mood.level | 분위기가 ${mood.text}. ${mood.level | 문장 중간 대시 |
| src/core/meeting.ts | 659 | 분위기가 ${mood.text} — 마무리 요청을 해 보세요. | 분위기가 ${mood.text}. 마무리 요청을 해 보세요. | 문장 중간 대시 |

## 보류

| 파일 경로 | 위치 | 원문 | 수정 | 이유 |
|---|---|---|---|---|
| src/core/meeting.ts | 126 | 고객사 미팅이 시작됐습니다: ${o.host}(${m.stage}단계) | (유지) | 콜론이지만 알림의 "제목: 대상" 꼴이 같은 파일(523·528줄 "○○ 미팅: …")과 맞춰져 있어 그대로 둠. 바꾸려면 알림 전체 꼴을 함께 정해야 함 |
