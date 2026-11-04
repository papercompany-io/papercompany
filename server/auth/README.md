# 계정 서버

`server/worker.ts`가 계정 API와 멀티플레이 API를 연결합니다. 배포는 이 작업에 포함하지 않습니다.

## 설정

- `DB`: D1. `migrations/*.sql`을 번호순으로 적용합니다.
- `SAVES`: 멀티플레이 저장용 R2.
- `EMAIL`: Cloudflare Email Sending 바인딩.
- `EMAIL_FROM`: 인증 메일을 보내는 주소.
- `AUTH_ENCRYPTION_KEY`: 32바이트 난수의 64자리 hex 문자열. Worker secret으로 넣고 저장소에는 넣지 않습니다. TOTP 비밀값을 AES-GCM으로 암호화합니다.
- `ALLOWED_ORIGINS`: 추가 허용 출처를 쉼표로 구분합니다. 같은 출처는 기본 허용합니다.

Cloudflare Email Service에서 보내는 도메인을 등록하고 안내하는 DNS 인증을 마친 뒤,
`EMAIL_FROM`과 `send_email.allowed_sender_addresses`를 같은 실제 주소로 바꾸세요.
제한 속성 없는 바인딩은 계정에서 인증된 수신 주소만 대상으로 합니다.
가입자에게 보내는 바인딩은 보내는 주소 허용 목록을 사용합니다.

공식 문서: `https://developers.cloudflare.com/email-service/configuration/send-bindings/`,
`https://developers.cloudflare.com/email-service/configuration/domains/`.

로컬 개발에서는 `send_email.remote: false`를 유지하고 `wrangler dev --remote`를 쓰지 않습니다.
메일은 로컬 에뮬레이션으로 확인합니다. 시험은 실제 메일이나 원격 D1·R2를 사용하지 않습니다.
배포 전 D1 id와 R2 이름을 채우고, 마이그레이션을 적용하고, `AUTH_ENCRYPTION_KEY`를 설정해야 합니다.
키를 잃으면 저장된 TOTP 비밀값을 복호화할 수 없습니다. 키 교체 시 별도 재암호화 절차가 필요합니다.

## API

모든 경로의 접두사는 `/api/auth`입니다. 요청과 응답은 JSON입니다.
실패는 `{ error: string, message: string }`이며 요청 수를 넘으면 429와 `Retry-After`를 돌려줍니다.

| 메서드·경로 | 요청 | 응답 |
| --- | --- | --- |
| POST /register | username, email, password | 201, ok, recoveryCodes |
| POST /verify-email | email, code | ok |
| POST /verify-email/resend | email | ok |
| POST /login | username, password | account 또는 needTotp, ticket |
| POST /login/totp | ticket, code | account |
| POST /login/recovery | ticket, code | account |
| POST /recovery/reset | username, code, password | ok |
| POST /logout | 빈 객체 | ok |
| GET /me | 없음 | username, email, emailVerified, totpEnabled |
| POST /totp/setup | 빈 객체 | secret, otpauthUri |
| POST /totp/enable | code | recoveryCodes |
| POST /totp/disable | code | ok |
| POST /recovery/regenerate | code(TOTP 켜짐) 또는 password(TOTP 꺼짐) | recoveryCodes |

가입 시 복구 코드를 한 번만 보여 줍니다. 클라이언트가 사용자에게 보관을 안내해야 합니다.
복구는 아이디와 미사용 복구 코드 하나로 비밀번호를 바꾸고 TOTP를 끄며 모든 세션·로그인 티켓을 무효화합니다.
이메일로 비밀번호를 재설정하는 경로는 없습니다. 복구 코드도 잃으면 복구할 수 없습니다.
TOTP를 켜거나 복구 코드를 재발급하면 이전 코드 묶음은 무효화됩니다.

브라우저는 HttpOnly·Secure·SameSite=Lax 쿠키를 사용합니다.
Origin이 없는 데스크톱 요청만 로그인 응답에 token을 받으며 이후 Bearer로 보냅니다.
쿠키로 상태를 바꾸는 요청에는 허용된 Origin이 필요합니다.

## 시험

`bun test server`는 실제 SQLite와 주입한 시계로 인증·저장 규칙을 확인합니다.
`node --test tests/online/*.test.mjs`는 로컬 workerd·D1·R2·메일을 사용합니다.
