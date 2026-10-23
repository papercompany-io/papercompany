# core-competitors-plus3 문구 교정

확인 75개 / 수정 5개 / 보류 0개

## 수정

| 파일 경로 | 위치 | 원문 | 수정 | 이유 |
|---|---|---|---|---|
| src/core/competitors.ts | 48 (STYLE_NAME.price) | 가격으로 맞서는 곳 | 가격 경쟁형 | 풀어 쓴 설명형 라벨 |
| src/core/competitors.ts | 48 (STYLE_NAME.feature) | 기능을 빨리 따라오는 곳 | 기능 추격형 | 풀어 쓴 설명형 라벨 |
| src/core/competitors.ts | 48 (STYLE_NAME.marketing) | 광고를 크게 쓰는 곳 | 광고 공세형 | 풀어 쓴 설명형 라벨 |
| src/core/contracts.ts | 68 | "가 됐습니다. 거래처 사이에 소문이 나서 더 큰 일감이 들어옵니다. | "가 됐습니다. 고객사 사이에 소문이 나서 더 큰 일감이 들어옵니다. | 용어집: 거래처 → 고객사 |
| src/core/contracts.ts | 221 | " 완료! 대금 | " 완료. 대금 | 알림 느낌표 제거 |

참고: STYLE_NAME은 src·scripts·playtest 어디서도 비교·참조하지 않습니다(grep 확인). 뉴스 헤드라인(64~66줄)의 대시는 용어집상 허용이라 두었습니다. 221줄 "원래 부서 일"의 "원래"는 배치 전 부서라는 정보가 있어 유지했습니다.

## 보류

없음.
