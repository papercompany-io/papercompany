# 페이퍼컴퍼니 MVP 개발 계획

기준 문서: 기획 SSOT https://claude.ai/artifact/PyN3znzaqJWiNcGBtEkMjn (읽기 전용, 마일스톤 시작마다 해당 탭을 다시 읽음)
읽은 탭: D00, D07, D08, D09, D11, D13, F01~F14 (2026-10-21, D00 rev 14 / D08 v0.3 / CHG-011 기준)

## 범위 (P0만)

| 단위 | 기능 ID | 구현 위치 |
| --- | --- | --- |
| F01 데스크탑 셸 | DT-01, DT-02, DT-05, DT-07, DT-09 | `src/ui/Boot.tsx`, `src/ui/Desktop.tsx`, `src/core/time.ts`, `src/platform/save.ts` |
| F02 창업 셋업 | FS-01, FS-02, FS-03, TM-01, TM-02, CO-01, CO-02, EQ-01 | `src/ui/setup/*`, `src/core/setup.ts`, `src/data/founderSpecs.json`, `src/data/candidates.json` |
| F03 사무실 뷰 | OF-01, OF-02, OF-06 | `src/ui/office/*` (캔버스 아이소메트릭 픽셀 스프라이트) |
| F04 채용 | HR-01, HR-04, HR-05, HR-06 | `src/core/hiring.ts`, `src/ui/apps/HiringApp.tsx` |
| F05 직원 관리 | EM-01, EM-02, HR-02 | `src/core/employees.ts`, `src/ui/apps/EmployeesApp.tsx` |
| F06 메신저 | MG-01, MG-03, MG-04 | `src/core/messenger.ts`, `src/core/instructions.ts`, `src/ui/apps/MessengerApp.tsx` |
| F08 투자 유치 | FR-01~FR-11, FR-13, EQ-02, EQ-03 | `src/core/funding.ts`, `src/core/equity.ts`, `src/ui/apps/InvestApp.tsx` |
| F10 재무·기업가치 | FN-01, FN-02, FN-03, VL-01 | `src/core/finance.ts`, `src/core/valuation.ts`, `src/ui/apps/FinanceApp.tsx` |
| F12 Exit·파산 | EX-01, EX-02, EX-03, EX-04, FL-01 | `src/core/exit.ts`, `src/ui/apps/ExitApp.tsx` |
| F13 결과 | SC-01 | `src/core/score.ts`, `src/ui/Result.tsx` |
| F14 대표 행동 | CA-01, CA-02 | `src/core/ceo.ts`, `src/ui/apps/ScheduleApp.tsx` |

범위 밖(만들지 않음): DT-03·04·08, OF-03·05·07, HR-07, EM-03·04, HR-03, OP-*, WF-*, MG-02·05·06, AT-*, FR-12, EQ-04, PD-*, RV-01(ID로서의 기능), DC-*, AI-01, EX-05·06, RK-01, ED-*, CA-03.
D07 상태 변수(V-08 매출, V-14 고객, V-17 제품 단계)는 FN-03·VL-01·FR-07 계산에 필요하므로 상태로만 둡니다(ASSUMPTIONS 참고).

## 구조

- `src/core/` 게임 로직(순수 TypeScript, React·Electron 의존 없음). 상태는 하나의 `GameState` 객체, 모든 변경은 `actions.ts`의 함수로만.
- `src/data/*.json` 모든 수치([예시값]): 스펙 카탈로그, 투자 단계, 투자사, 직군·연봉, 지시 선택지, 세율, 시간 길이 등.
- 난수: `src/core/rng.ts` 시드 고정 PRNG(mulberry32). 상태 안에 시드와 현재 상태를 저장해 불러오기 후에도 같은 순서로 이어짐. `?seed=` 쿼리나 셋업 화면에서 시드를 지정 가능.
- `src/ui/` React 화면. `src/platform/` 저장소 어댑터(Electron IPC 파일 / 웹 localStorage).
- `electron/` 메인·프리로드 프로세스. 같은 렌더러 빌드를 띄우므로 웹(Artifact 미리보기)과 Electron이 한 코드.

## 마일스톤 (순서대로)

| # | 이름 | 내용 | 끝나는 기준 |
| --- | --- | --- | --- |
| M0 | 셋업 | Vite+React+TS+Electron, git, PLAN·ASSUMPTIONS | `npm run build` 성공, Electron 창이 뜸 |
| M1 | 코어 로직 | `src/core` 전부 + `src/data` + 최소 화면(텍스트 위주)으로 한 판 흐름 연결 | 플레이테스트 1회차(셋업→투자→고용→지시→Exit/파산) 기록 |
| M2 | 화면 | 아이소메트릭 픽셀 사무실, CEO 클릭 데스크탑, 앱 7종, Startup Company 풍 HUD, 개발용 상태 패널(` 키) | 플레이테스트 2회차 기록, 문제 수정 |
| M3 | 저장 | DT-07 자동·수동 저장, 백업 복구, 부팅 시 이어하기 | 플레이테스트 3회차(저장→재실행→이어하기) 기록 |
| M4 | 패키징 | electron-builder 설정(win nsis / mac dmg / linux dir), linux dir 빌드 확인, 웹 단일 파일 빌드 → Artifact 미리보기 | 최종 회차 두 판 (a)(b), `docs/PROGRESS.md` |

## 플레이테스트 방식

- 자동 판정 테스트 코드는 쓰지 않음. `playtest/` 아래 Playwright 스크립트는 "한 동작 → 스크린샷 저장"만 하고, 판정은 스크린샷을 직접 열어 봄.
- 실행: `xvfb-run` 위에서 Playwright `_electron.launch`로 실제 Electron 앱을 띄움.
- 회차별 기록: `docs/PLAYTEST.md` (한 조작, 본 화면, 발견한 문제, 고친 내용, 손 계산 검산, "다음에 뭘 할지 알 수 있는가").
