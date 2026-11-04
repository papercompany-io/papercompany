-- 멀티플레이(비동기 경쟁): 클라우드 저장, 같은 시드 주간 도전, 도전 기록.
-- 큰 JSON 본문은 R2(SAVES)에 두고 D1에는 메타데이터만 둡니다. user_id는 인증 쪽 사용자 id(문자열)입니다.

CREATE TABLE IF NOT EXISTS mp_saves (
  user_id    TEXT    NOT NULL,
  slot       TEXT    NOT NULL,
  revision   INTEGER NOT NULL CHECK (revision >= 1),
  size       INTEGER NOT NULL,
  r2_key     TEXT    NOT NULL,
  updated_at INTEGER NOT NULL, -- 밀리초(Unix)
  PRIMARY KEY (user_id, slot)
);

CREATE TABLE IF NOT EXISTS mp_challenges (
  id        TEXT    PRIMARY KEY, -- 예: 2026-W45
  seed      INTEGER NOT NULL,
  rule      TEXT,                -- career.json challenges[].id 또는 NULL(일반 판)
  starts_at INTEGER NOT NULL,
  ends_at   INTEGER NOT NULL
);

-- 한 사람이 한 도전에 기록 하나(가장 높은 점수만 남김).
-- status: 'unverified'(서버가 아직 다시 돌려 보지 않음) | 'verified' | 'rejected'.
-- 지금은 다시 돌려 검증하는 기능이 없으므로 모든 기록은 'unverified'입니다.
CREATE TABLE IF NOT EXISTS mp_runs (
  id           TEXT    PRIMARY KEY,
  challenge_id TEXT    NOT NULL REFERENCES mp_challenges(id),
  user_id      TEXT    NOT NULL,
  founder_name TEXT    NOT NULL,
  score        INTEGER NOT NULL,
  companies    INTEGER NOT NULL,
  ending_id    TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified', 'verified', 'rejected')),
  state_key    TEXT    NOT NULL,
  submitted_at INTEGER NOT NULL,
  UNIQUE (challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS mp_runs_board ON mp_runs (challenge_id, status, score DESC, submitted_at ASC);
CREATE INDEX IF NOT EXISTS mp_runs_user ON mp_runs (user_id);
CREATE INDEX IF NOT EXISTS mp_saves_key ON mp_saves (r2_key);
CREATE INDEX IF NOT EXISTS mp_runs_key ON mp_runs (state_key);

-- R2에서 지울 후보(A-248). 쓰기 전에 새 키와 밀려날 옛 키를 적고, 정리 작업이 delete_after가 지난 것 중
-- mp_saves·mp_runs가 가리키지 않는 것만 지웁니다. 요청 안에서 바로 지우지 않아 읽기와 겹쳐도 본문이 남습니다.
CREATE TABLE IF NOT EXISTS mp_blob_gc (
  r2_key       TEXT    PRIMARY KEY,
  delete_after INTEGER NOT NULL -- 밀리초(Unix)
);
CREATE INDEX IF NOT EXISTS mp_blob_gc_due ON mp_blob_gc (delete_after);
