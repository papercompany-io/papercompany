-- 비동기 재실행 검증: mp_runs는 검증된 개인 최고 기록, 제출 이력은 별도 보관합니다.
-- 기존 'verified' 행에는 완전 재실행 근거가 없으므로 공식 순위에서 제외합니다.
UPDATE mp_runs SET status = 'unverified' WHERE status = 'verified';

CREATE TABLE mp_run_submissions (
  id            TEXT    PRIMARY KEY,
  challenge_id  TEXT    NOT NULL REFERENCES mp_challenges(id),
  user_id       TEXT    NOT NULL,
  replay_key    TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  score         INTEGER,
  rejection_code TEXT,
  submitted_at  INTEGER NOT NULL,
  completed_at  INTEGER,
  lease_id      TEXT,
  lease_until   INTEGER NOT NULL DEFAULT 0,
  attempts      INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  CHECK ((status = 'verified' AND score IS NOT NULL) OR (status <> 'verified' AND score IS NULL)),
  CHECK ((status = 'pending' AND completed_at IS NULL) OR (status <> 'pending' AND completed_at IS NOT NULL))
);

-- 대기열은 유료 Queue 대신 기존 cron이 읽습니다. lease_id로 겹친 cron의 완료 쓰기를 구분합니다.
CREATE INDEX mp_submissions_pending ON mp_run_submissions (status, submitted_at, id);
CREATE INDEX mp_submissions_user ON mp_run_submissions (user_id, challenge_id, submitted_at DESC, id DESC);
CREATE INDEX mp_submissions_replay ON mp_run_submissions (replay_key) WHERE status = 'pending';
