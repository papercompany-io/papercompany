# data-founderSpecs-plus3 문구 교정 보고

확인 72개 / 수정 3개 / 보류 0개

## 수정

| 파일 경로 | 위치 | 원문 | 수정 | 이유 |
|---|---|---|---|---|
| src/data/funding.json | 102 (letters.proposal.desc) | 이번 라운드 지분과 희망 회사 가치를 제안합니다. 높게 부를수록 덜 반깁니다. | 이번 라운드 지분과 희망 기업가치를 제안합니다. 높게 부를수록 덜 반깁니다. | 용어집: 회사 가치 → 기업가치 |
| src/data/funding.json | 107 (letters.material.name) | 추가 자료 보내기 | 추가 자료 | 레터 이름을 다른 레터(회사 소개·투자 제안)처럼 명사형으로 |
| src/data/funding.json | 113 (letters.club.name) | 공동 투자 의향 밝히기 | 공동 투자 의향 | 레터 이름을 명사형으로, 풀어 쓴 표현 줄임 |

## 보류

없음. founderSpecs·furniture·hiring 문자열과 라운드 이름, 희망 가치 선택지는 짧은 명사형이거나 가구 설명의 의도된 짧은 말투라 그대로 두었습니다. 위 세 문자열은 로직에서 비교하지 않음을 grep으로 확인했습니다.
