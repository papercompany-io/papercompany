# ui-Game-2 문구 교정 (src/ui/Game.tsx 518~끝)

확인 42개 / 수정 13개 / 보류 2개

줄 번호는 현재 원본 파일 기준입니다(목록 tsv보다 1줄 뒤).

| 파일 경로 | 위치 | 원문 | 수정 | 이유 |
|---|---|---|---|---|
| src/ui/Game.tsx | 519 (hud-dday title) | 창업한 날부터 센 운영일 | 창업일 기준 운영일 | 풀어 쓴 표현 |
| src/ui/Game.tsx | 542 (skip-night title) | 켜면 밤을 빠르게 흘려 보냅니다. 다음 밤에도 켜져 있습니다. | 켜면 밤 시간을 빨리 감습니다. 다음 밤에도 켜져 있습니다. | 억지 은유, 버튼 이름(빨리 감기)과 맞춤 |
| src/ui/Game.tsx | 544 (skip-night title) | 야근하는 사람이 모두 퇴근하면 빨리 감습니다. 누르면 끕니다. | 야근 직원이 모두 퇴근하면 빨리 감습니다. 누르면 끕니다. | 풀어 쓴 표현, 용어집(직원) |
| src/ui/Game.tsx | 559 (hud-burning title) | 버닝: 팀이 더 빨리 일하는 중 | 버닝 기간에는 직원이 더 빨리 일합니다 | 불필요한 콜론, 용어집(팀 단독 금지), 보고체 |
| src/ui/Game.tsx | 638 MISSION_CTA.featuresDone | 기능 만들기 | 기능 개발 | 버튼 명사형 |
| src/ui/Game.tsx | 639 MISSION_CTA.stage | 기능 만들기 | 기능 개발 | 버튼 명사형 |
| src/ui/Game.tsx | 640 MISSION_CTA.users | 마케팅 하기 | 마케팅 | 버튼 ~하기 제거 |
| src/ui/Game.tsx | 641 MISSION_CTA.mrr | 결제 기능 만들기 | 결제 기능 개발 | 버튼 명사형 |
| src/ui/Game.tsx | 644 MISSION_CTA.staff | 채용하기 | 채용 | 버튼 ~하기 제거 |
| src/ui/Game.tsx | 645 MISSION_CTA.deptHr | 채용하기 | 채용 | 버튼 ~하기 제거 |
| src/ui/Game.tsx | 646 MISSION_CTA.welfare | 복지 정하기 | 복지 설정 | 버튼 명사형 |
| src/ui/Game.tsx | 647 MISSION_CTA.aiAdoption | AI 도입하기 | AI 도입 | 버튼 ~하기 제거 |
| src/ui/Game.tsx | 649 MISSION_CTA.fundingIndex | 투자 유치하기 | 투자 유치 | 버튼 ~하기 제거 |

## 보류

| 파일 경로 | 위치 | 원문 | 수정안 | 판단이 필요한 까닭 |
|---|---|---|---|---|
| src/ui/Game.tsx | 602 (office-move-open 버튼) | 이사가기 | 이사 | src/ui/hints.ts:79 안내 문구가 버튼 이름 "이사가기"를 그대로 인용합니다. 두 곳을 함께 바꿀지 결정 필요 |
| src/ui/Game.tsx | 648 MISSION_CTA.officeTier | 이사가기 | 이사 | 위 회사 카드 버튼과 같은 이름이라 함께 결정 필요 |

참고: 542줄과 같은 "흘려 보냅니다" 표현이 src/ui/apps/SettingsApp.tsx:96에도 있습니다(다른 묶음 담당).
