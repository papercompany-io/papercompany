# ui-apps-AdSalesPanel-2 문구 교정 보고

확인 59개 / 수정 3개 / 보류 2개

## 수정

| 파일 경로 | 위치 | 원문 | 수정 | 이유 |
|---|---|---|---|---|
| src/ui/apps/AdSalesPanel.tsx | 226 | · 최소에 못 미침 | · 최소 미달 | 풀어 쓴 상태 문구 |
| src/ui/apps/AdSalesPanel.tsx | 392 | 노출 1000회당 받는 돈(eCPM) | 노출 1000회당 단가(eCPM) | 풀어 쓴 표현, 같은 파일 168줄 툴팁과 통일 |
| src/ui/apps/AdSalesPanel.tsx | 393 | 1000회당 단가: | 1000회당 단가 | 불필요한 콜론 |

## 보류

| 파일 경로 | 위치 | 원문 | 수정 후보 | 판단이 필요한 까닭 |
|---|---|---|---|---|
| src/ui/apps/AdSalesPanel.tsx | 248, 250 | 끝남 | 종료 | 구어체 상태 라벨이지만 MarketApp.tsx 316줄도 같은 "끝남"을 씀. 앱 전체에서 함께 바꿀지 정해야 함 |
| src/ui/apps/AdSalesPanel.tsx | 461 | 이 조건 받아들이기 (1000회당 … 일) | 이 조건 수락 (1000회당 … 일) | HiringApp.tsx 466줄 "역제안 받아들이기"와 짝을 이루는 버튼. 두 협상 창을 함께 바꿀지 정해야 함 |
