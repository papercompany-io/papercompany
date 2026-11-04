-- 계정·로그인(A-249). 비밀번호는 bcrypt, 세션·티켓·복구 코드·인증 코드는 SHA-256 해시만 둡니다.
-- 시각은 모두 밀리초(Unix). D1은 외래 키를 기본으로 지키므로 사용자를 지우면 딸린 행이 함께 지워집니다.

CREATE TABLE IF NOT EXISTS auth_users (
  id                TEXT    PRIMARY KEY,
  username          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  email             TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash     TEXT    NOT NULL,          -- bcrypt($2b$)
  email_verified_at INTEGER,                   -- NULL이면 인증 전(로그인 불가, 24시간 뒤 자리 해제)
  totp_secret       TEXT,                      -- 사용자 id에 묶인 AES-GCM 암호문. NULL이면 2단계 인증 꺼짐
  totp_pending      TEXT,                      -- 설정 중인 AES-GCM 암호문(enable 전)
  totp_last_step    INTEGER,                   -- 마지막으로 받은 TOTP 시간 칸(같은 코드 재사용 막기)
  created_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_email_codes (
  user_id    TEXT    PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  code_hash  TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions (expires_at);

-- 비밀번호는 맞았고 2단계 인증을 기다리는 로그인
CREATE TABLE IF NOT EXISTS auth_login_tickets (
  ticket_hash TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS auth_recovery_codes (
  user_id   TEXT    NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  code_hash TEXT    NOT NULL,
  used_at   INTEGER,
  PRIMARY KEY (user_id, code_hash)
);

-- 고정 창 요청 수 세기. key 예: login-ip:203.0.113.5
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key          TEXT    PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);
