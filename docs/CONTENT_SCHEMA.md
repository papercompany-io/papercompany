# 콘텐츠 데이터 스키마 (v2)

게임 엔진(`src/core`)이 읽는 콘텐츠 JSON의 형식입니다. 수치는 모두 [예시값]이고 밸런싱 시뮬레이터로 조정합니다. 이름은 모두 가상명(실존 회사·인물·브랜드 금지, RSK-11)입니다. 문구는 한국어, 존댓말 보고체("~했습니다")를 기본으로 합니다.

## 공통 단위

- 작업량(work unit): B등급 직원 1명이 하루에 하는 일 = 1. 대표 개발 1칸 = 0.125.
- 회사 단계 `stage`: 0 차고(창업) · 1 MVP · 2 팀 · 3 조직 · 4 스케일업 · 5 상장사.
- 산업 `industry`: `saas`(B2B SaaS) · `consumer`(소비자 앱) · `commerce`(커머스) · `fintech`(핀테크) · `ai`(AI 플랫폼).
- 시장 `market`: `kr` 국내 · `jp` 일본 · `sea` 동남아 · `us` 미국 · `eu` 유럽.
- 부서 `dept`: `dev` 개발 · `design` 디자인 · `sales` 세일즈 · `marketing` 마케팅 · `hr` 인사 · `cs` 고객지원 · `infra` 인프라 · `finlegal` 재무법무 · `ai` AI연구.
- 경기 `economy`: `boom` 호황 · `normal` 보통 · `recession` 불황.

## 1. 기능 트리 `src/data/features.json`

```json
{ "industries": { "saas": [ Feature, ... ], "consumer": [...], "commerce": [...], "fintech": [...], "ai": [...] } }
```

Feature:

| 키 | 뜻 |
| --- | --- |
| `id` | 산업 접두어 포함 고유 id. 예 `saas_login` |
| `name`, `desc` | 이름, 한 줄 설명(효과가 짐작되게) |
| `cat` | `core`(MVP 필수) · `growth` · `monetize` · `retention` · `infra` · `enterprise` · `global` · `ai` · `platform` |
| `dev`, `design` | 1레벨 작업량. core는 합계 60~110, 중반 80~400, 후반 400~3000 |
| `levels` | 최대 레벨(1~5). 레벨이 오를 때마다 작업량 ×1.8, 효과는 레벨마다 같은 값을 더함 |
| `req` | 선행 기능 id 목록(같은 산업, 레벨 1 완료면 충족) |
| `year` | 이 해 1월부터 개발 가능(2027~2040). 생략 시 2027 |
| `stage` | 최소 회사 단계. 생략 시 0 |
| `fx` | 레벨당 효과(아래) |

`fx` 키(모두 선택):

| 키 | 뜻 | 보통 크기 |
| --- | --- | --- |
| `appeal` | 제품 매력도 점수(+) | 2~15 |
| `conv` | 신규 획득 속도 배율 가산 | 0.03~0.15 |
| `churn` | 이탈률 배율 가산(음수가 좋음) | -0.03~-0.12 |
| `pay` | 유료 전환 비율 가산(소비자·핀테크) | 0.005~0.02 |
| `arpu` | 객단가 배율 가산 | 0.05~0.25 |
| `ad` | 사용자당 월 광고 매출 가산(원) | 50~400 |
| `take` | 거래 수수료율 가산(커머스) | 0.002~0.01 |
| `gmv` | 사용자당 월 거래액 배율 가산(커머스) | 0.05~0.2 |
| `viral` | 입소문 획득 가산 | 0.005~0.03 |
| `infra` | 사용자당 인프라 비용 배율 가산(음수가 좋음) | -0.05~-0.2 |
| `stability` | 장애 위험 감소(양수가 좋음) | 0.05~0.2 |
| `enterprise` | `true`면 대기업 계약 가능 | |
| `market` | 이 기능으로 진출 가능해지는 시장 id(`global` 범주) | |
| `bugs` | 출시할 때 붙는 추가 버그(양수가 나쁨) | 0~20 |
| `ai` | `true`면 AI 기능(AI연구 부서 출력이 속도를 올림) | |

산업마다 30~38개. core 3~4개(MVP), global 4개(jp·sea·us·eu 각 1개, 국내는 기본), enterprise 2~3개, ai 4~6개(2028년 이후 등장), 나머지는 growth·monetize·retention·infra·platform에 고르게. 연도가 늦은 기능(2031~2040)도 몇 개 넣어 후반에 새 선택지가 계속 생기게 합니다.

## 2. 이벤트 `src/data/events.json`

```json
{ "events": [ Event, ... ] }
```

Event:

| 키 | 뜻 |
| --- | --- |
| `id` | `ev_` 접두어 고유 id |
| `cat` | `staff` `product` `market` `finance` `investor` `legal` `pr` `ai` `economy` `personal` `competitor` `public` `office` |
| `from` | 보낸 사람 표시. `"{target}"`(대상 직원), 또는 고정 문자열(예: "법무법인 바른길", "페이퍼뉴스 기자", "이사회") |
| `weight` | 상대 빈도(1이 보통, 0.3 드묾, 2 잦음) |
| `cooldown` | 같은 이벤트 재등장 최소 간격(일). 보통 120~720 |
| `once` | `true`면 판마다 한 번 |
| `urgent` | `true`면 시간이 멈추고 결정 창이 뜸(DT-04). 아니면 메신저 메시지 + 알림 |
| `cond` | 등장 조건(아래). 모두 만족해야 후보 |
| `target` | 대상 직원 고르는 방법: `any`(아무 직원) `staff`(코파운더 제외) `best`(능력 최고) `lowSat`(만족도 최저) `lowHealth`(건강 최저) `dev`/`sales` 등 부서 id(그 부서 아무나) `lead`(팀장 중) `aiSkeptic`(AI 회의적 특성) |
| `texts` | 질문 문장 변형 2~3개(DC-03). 치환자: `{target}` 직원 이름, `{dept}` 대상 부서 이름, `{company}` 회사 이름, `{competitor}` 경쟁사 이름, `{market}` 시장 이름, `{amount}` 선택지 금액 표시 |
| `choices` | 선택지 2~4개 |
| `deadline` | 답변 기한(일, 3~14). 지나면 `default` 선택 |
| `default` | 기한이 지났을 때 고르는 선택지 번호(0부터) |

`cond` 키(모두 선택):

| 키 | 뜻 |
| --- | --- |
| `stageMin`, `stageMax` | 회사 단계 범위(0~5) |
| `empMin`, `empMax` | 직원 수 범위(대표 제외) |
| `usersMin` | 전체 사용자·고객 수 하한 |
| `revMin` | 지난달 매출 하한(원) |
| `runwayMax` | 런웨이(개월) 상한. 흑자면 불충족 |
| `cashMin` | 보유 자금 하한 |
| `yearMin`, `yearMax` | 게임 연도 범위 |
| `industry` | 산업 id 배열 |
| `economy` | 경기 id |
| `dept` | 이 부서에 직원이 있어야 함 |
| `noDept` | 이 부서에 직원이 없어야 함 |
| `aiMin` | 회사 평균 AI 적용률 하한(0~1) |
| `satMax` | 직원 평균 만족도 상한(0~100) |
| `healthMax` | 직원 평균 건강 상한(0~100) |
| `bugsMin` | 품질 점수 상한 대신 버그 하한(버그 0~100, 30 이상이면 품질이 나쁨) |
| `marketsMin` | 진출한 시장 수 하한 |
| `mvp` | MVP(핵심 기능)를 만들었는지(true/false, A-119) |
| `roundOpen` | 투자 라운드가 열려 있는지(true/false, A-121) |
| `funded` | `true`면 투자를 한 번 이상 받음, `false`면 무투자 |
| `investorPctMin` | 투자자 지분 합 하한(0~1) |
| `public` | `true`면 상장사, `false`면 비상장 |
| `crunch` | `true`면 근무 방침이 야근(크런치) |
| `flag`, `noFlag` | 이전 결정이 남긴 표식이 있음/없음 |
| `competitor` | `true`면 살아 있는 경쟁사가 있어야 함(`{competitor}` 치환에 씀) |

Choice:

| 키 | 뜻 |
| --- | --- |
| `label` | 버튼 문구(짧게, 18자 이내) |
| `hint` | 비용·예상 효과 힌트(DC-01: "자금 -500만원, 만족도↑ 가능성 큼") |
| `cost` | 고르는 즉시 나가는 돈(원). `costRev`를 쓰면 지난달 매출 × 값(최소 1천만원 기준) |
| `cond` | 이 선택지가 보일 조건(DC-04/05, 위 cond와 같은 키). 예: HR팀이 있어야 "HR팀에 맡긴다" |
| `outcomes` | 결과 분포(DC-02) 1~3개. `w` 가중치, `text` 결과 보고 문장, `fx` 효과 |

`fx` 키(모두 선택, 결과에 적용):

| 키 | 뜻 |
| --- | --- |
| `cash` | 자금 증감(원) |
| `cashRev` | 지난달 매출 × 값(최소 기준 1천만원)만큼 자금 증감 |
| `sat` | 전 직원 만족도 증감(0~100 척도, 보통 ±3~10) |
| `satDept` | 대상 부서(`{dept}`) 만족도 증감 |
| `satTarget` | 대상 직원 만족도 증감 |
| `health` | 전 직원 건강 증감 |
| `healthTarget` | 대상 직원 건강 증감 |
| `leaveTarget` | `true`면 대상 직원 퇴사 |
| `raiseTarget` | 대상 직원 월급 인상률(0.2 = 20%) |
| `promoteTarget` | `true`면 대상 직원을 그 부서 팀장으로 |
| `skillTarget` | 대상 직원 숙련도 증감(0~100) |
| `awareness` | 진출한 모든 시장 인지도 증감(0~1 척도, 보통 ±0.02~0.1) |
| `users` | 사용자 비율 증감(-0.05 = 5% 이탈) |
| `bugs` | 버그 증감(0~100 척도) |
| `appeal` | 제품 매력도 영구 증감(점수, ±2~10) |
| `rep` | 창업자 명성 증감(±1~10) |
| `ir` | 투자 관심(IR 점수) 증감(±5~30) |
| `network` | 네트워크 점수 증감 |
| `work` | 지금 개발 중인 기능에 작업량 증감 |
| `ai` | AI 적응도 증감(0~1, ±0.1~0.3) |
| `board` | 이사회 신뢰도 증감(0~100, 투자자 지분이 큰 회사) |
| `stock` | 상장사 주가 비율 변화(-0.1 = 10% 하락) |
| `flag` | 표식 남기기(문자열) |
| `unflag` | 표식 지우기 |
| `compAppeal` | 대상 경쟁사 매력도 비율 변화(0.1 = 10%↑) |
| `compDie` | `true`면 대상 경쟁사 폐업 |
| `mod` | 기간 효과 배열 `[{"key": 키, "value": 값, "days": 기간}]`. 키: `appeal`(매력도 배율 가산) `acq`(획득 속도 배율 가산) `churn`(이탈률 배율 가산) `output`(전 직원 출력 배율 가산) `valuation`(기업가치 배율 가산) `invest`(투자 성공 확률 가산, 0.1=10%p) `infra`(인프라 비용 배율 가산) `outage`(장애 위험 배율 가산) `sat`(만족도 목표 가산, 점수) `price`(객단가 배율 가산) |
| `loan` | 대출 선택(A-137): `"policy"`면 정책자금 심사 신청(2~3주 뒤 승인·거절), `"bank"`면 은행 대출 바로 실행(대표 개인 보증). 한도·이자는 `finance.json`의 `loan` |
| `hire` | 특별 인재 합류 `{"name": "이름", "dept": "dev", "grade": "S", "salary": 9000000, "trait": "특성 id"}`(좌석이 있어야 함) |
| `news` | 페이퍼뉴스에 실릴 헤드라인(`{company}` 치환 가능) |

예시:

```json
{
  "id": "ev_poach_offer",
  "cat": "staff",
  "from": "{target}",
  "weight": 1.2,
  "cooldown": 150,
  "cond": { "empMin": 3, "competitor": true },
  "target": "best",
  "texts": [
    "대표님, 솔직히 말씀드리면 {competitor}에서 연봉 30% 높여 주겠다는 제안을 받았습니다.",
    "{competitor} 쪽에서 계속 연락이 옵니다. 조건이 꽤 좋네요. 어떻게 해야 할지 고민입니다."
  ],
  "choices": [
    { "label": "연봉 20% 올려 잡는다", "hint": "월급 +20%, 잔류 가능성 큼",
      "outcomes": [ { "w": 85, "text": "{target}님이 남기로 했습니다.", "fx": { "raiseTarget": 0.2, "satTarget": 15 } },
                    { "w": 15, "text": "고마워했지만 결국 떠나기로 했습니다.", "fx": { "leaveTarget": true } } ] },
    { "label": "스톡옵션을 준다", "hint": "ESOP 풀이 있어야 함", "cond": { "flag": "esop" },
      "outcomes": [ { "w": 75, "text": "회사의 미래에 걸어 보겠다고 합니다.", "fx": { "satTarget": 20 } },
                    { "w": 25, "text": "옵션으로는 부족하다며 떠났습니다.", "fx": { "leaveTarget": true } } ] },
    { "label": "축하하며 보내 준다", "hint": "퇴사, 팀 분위기 영향",
      "outcomes": [ { "w": 100, "text": "{target}님이 다음 달 떠납니다.", "fx": { "leaveTarget": true, "sat": -2 } } ] }
  ],
  "deadline": 5,
  "default": 2
}
```

## 3. 업적 `src/data/achievements.json`

```json
{ "achievements": [ { "id": "ach_first_user", "name": "첫 고객", "desc": "처음으로 고객이 생겼습니다.", "tier": "bronze", "cond": { "metric": "users", "gte": 1 } } ] }
```

`tier`: `bronze` `silver` `gold` `platinum`. `hidden: true`면 달성 전 설명을 가립니다.

`cond.metric` 목록(엔진이 계산): `users` 전체 사용자 · `mrr` 지난달 매출 · `valuation` 기업가치 · `employees` 직원 수 · `cash` 보유 자금 · `featuresDone` 완성한 기능 수(레벨 합) · `markets` 진출 시장 수 · `stage` 회사 단계 · `fundingIndex` 투자 단계 순번(엔젤 0 … 시리즈 G 9) · `marketCap` 상장사 시가총액 · `profitMonths` 연속 흑자 개월 · `officeTier` 사무실 등급(1~5) · `aiAdoption` 평균 AI 적용률 · `founderPct` 내 지분 · `wealth` 창업자 개인 자산(커리어) · `companies` 세운 회사 수(커리어) · `exits` 성공한 Exit 수(커리어) · `bankruptcies` 파산 수(커리어) · `ipos` 상장 수(커리어) · `exitAmount` 한 번의 Exit 결과 금액 최대 · `rep` 명성 · `age` 창업자 나이 · `acquisitions` 인수한 경쟁사 수 · `share` 국내 시장 점유율(0~1) · `eventsDecided` 결정한 이벤트 수 · `bootstrapExit` 무투자 Exit 수 · `leads` 팀장 수 · `enterprise` 대기업 계약 수 · `satAvg` 평균 만족도.

`gte`(이상) 또는 `lte`(이하) 중 하나. 상장사 시가총액이나 산업 조건이 필요하면 `industry` 키를 더할 수 있습니다.

## 대출 `src/data/finance.json` → `loan` (A-137)

| 키 | 뜻 |
| --- | --- |
| `offerRunway` | 버틸 기간이 이 개월 아래로 내려가면 대출 제안(메신저 결정 `ev_b_fin_loan_offer`). 0이면 제안 없음 |
| `offerCooldown` | 제안 사이 최소 일수 |
| `policy` / `bank` | 정책자금 / 은행. `rate` 연 이자율, `base` + `revMult` × 지난달 매출 = 한도(최대 `cap`), `graceMonths` 이자만 내는 기간, `termMonths` 원금을 나눠 갚는 개월 수 |
| `policy.reviewDays` | 심사 기간(여기에 0~4일 무작위 더함) |
| `policy.pBase` `pRevenue` `pQuality` `pRep` `pRepCap` | 승인 확률 = pBase + (매출 있으면 pRevenue) + pQuality × (1 − 버그/100) + min(pRepCap, 명성 × pRep), 0.1~0.9 |
| `policy.maxAgeYears` | 창업 뒤 이 햇수가 지나면 정책자금 대상 아님 |

남은 대출은 기업가치에서 빠지고, 이자는 손익표의 영업이익 아래 "대출 이자", 원금은 월급일에 통장에서만 빠집니다. 은행 대출이 남은 채 파산하면 남은 원금을 창업자 개인 자산에서 갚습니다.

## 광고 단가 규모 `src/data/markets.json` → `adScale` (A-138)

| 키 | 뜻 |
| --- | --- |
| `ref` | 배율 1이 되는 그 시장 사용자 수 |
| `perDecade` | 사용자가 10배가 될 때마다 더해지는 배율 |
| `min` / `max` | 배율 바닥·천장 |
| `milestones` | 처음 넘을 때 뉴스·알림을 보내는 사용자 수(광고 매출이 있는 산업만) |

사용자 한 명당 광고 매출 = (산업 `adBase` + 기능 효과) × 시장 객단가 배율 × `adScale`.

## 경쟁사 반격 `src/data/markets.json` → `rivalry` (A-140)

| 키 | 뜻 |
| --- | --- |
| `leadRatio` · `minPlayerShare` | 겹치는 시장에서 우리 점유율이 그 경쟁사의 몇 배 이상이고 최소 얼마 이상이면 위협으로 봄 |
| `attackCost` | 반격에 드는 경쟁사 자금(이보다 적으면 반격 못 함) |
| `warnDays` · `attackDays` · `cooldownDays` | 예고 뉴스 → 반격 시작까지, 반격 기간, 끝난 뒤 쉬는 날 |
| `priceBoost` | 가격형 반격 중 점유 가중치 배율 |
| `featureCatch` · `featureOver` | 기능형: 우리 매력도 × featureOver까지 남은 차이의 featureCatch만큼 한 번에 따라붙음 |
| `marketingAware` | 광고형: 인지도 += (1 − 인지도) × 이 값 |
| `randomPerAggression` | 위협이 없어도 매달 반격을 계획할 확률(× 공격성). 0이면 위협받을 때만 |
| `raiseBase` · `raisePerShare` · `raiseCap` | 경쟁사 투자 유치 확률 배율 = min(raiseCap, raiseBase + 점유율 × raisePerShare) |
| `events` | 성격별로 반격 시작 때 띄우는 사건 id. 이 사건들은 `cond: {"flag": "rival_attack_now"}`라 무작위로 오지 않음 |

경쟁사 `style`: `price`(가격으로 맞서는 곳) · `feature`(기능을 빨리 따라오는 곳) · `marketing`(광고를 크게 쓰는 곳). 화면에는 쓰지 않고 예고 뉴스 말투로만 드러납니다.

사건 문구의 `{competitor}가` `{company}를`처럼 이름 바로 뒤 조사(이·가·을·를·은·는·과·와)는 이름 받침에 맞게 바뀝니다.

## 사건 스토리텔러 `src/data/story.json` (A-141)

사건 카드의 성격은 데이터에 쓰지 않고 기본 선택지(`default`, 없으면 마지막)의 결과로 자동 분류합니다: 돈·사용자·인지도·만족·건강·명성·매력도·IR·네트워크·이사회·주가·기간 효과가 좋아지면 기회, 나빠지면(버그·퇴사 포함) 위협, 점수가 ±`toneCut` 안이면 보통. 새 사건을 쓸 때 기본 선택지를 "아무것도 안 하면 생기는 일"로 두면 스토리텔러가 알맞게 다룹니다.

| 키 | 뜻 |
| --- | --- |
| `restDays` · `restMult` | 위기(위협 사건·강제 사건) 뒤 쉬는 기간과 그동안의 위협 가중치 |
| `calmDays` · `calmCap` | 조용한 날 ÷ calmDays만큼 위협 가중치가 커짐(최대 1 + calmCap배) |
| `successGrowth` · `successRunway` · `successMult` | 잘나가는 회사(월 매출 성장·버틸 기간)에 위협 가중치 배율 |
| `desperateRunway` · `desperateBoost` · `desperateDamp` | 절박도(버틸 기간이 이보다 짧거나 고객 감소)만큼 기회 가중치 ↑, 위협 ↓ |
| `quietDays` · `quietBoost` | 조용한 날이 길수록 하루 사건 확률 배율 |

## 상장사 주주 신뢰 `src/data/public.json` → `pressure` (A-142)

| 키 | 뜻 |
| --- | --- |
| `startTrust` | 상장 때 주주 신뢰(0~100, `company.board`를 함께 씀) |
| `beatTrust` · `missTrust` · `missStreakTrust` | 가이던스를 넘으면 +, 못 넘으면 −(missTrust + missStreakTrust × (연속 미달 − 1)) |
| `belowIpoTrust` | 주가가 공모가 아래인 분기마다 − |
| `activistStreak` | 이만큼 연속 미달이면 행동주의 펀드 사건(`ev_b_pub_activist`) |
| `warnBelow` | 이 아래면 분기마다 경고 |
| `controlPct` · `firedDiscount` | 신뢰 0일 때 창업자 지분이 controlPct 미만이면 해임, 남은 지분은 주가 × firedDiscount |

## 장애 연쇄 `src/data/orders.json` → `outage` (A-143)

| 키 | 뜻 |
| --- | --- |
| `debtProb` · `debtSev` | 기술 부채(0~1.5)가 장애 확률·심각도에 곱해지는 정도 |
| `majorSev` | 이 심각도를 넘으면 큰 장애: 뉴스 + 결정 카드 + 투자사 기억 |
| `debtCard` | 기술 부채가 이 이상이면 `ev_product_debt_outage`, 아니면 `ev_product_outage`(두 카드 모두 `cond: {"flag": "outage_now"}`라 실제 장애 때만) |
| `investPenalty` · `investDays` | 큰 장애 뒤 투자 결정 확률 감점(최대값)과 기간(날이 갈수록 0으로) |
