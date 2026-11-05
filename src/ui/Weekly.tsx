// 주간 도전: 서버의 시드·규칙으로 시작하고 검증된 순위와 미검증 기록을 분리합니다.
import { useEffect, useState } from 'react';
import { DATA } from '../core/data';
import { wonShort } from '../core/format';
import type { GameState } from '../core/types';
import { online, OnlineError, type BoardStatus, type ChallengeBoard, type RunSubmission, type WeeklyChallenge } from '../platform/online';
import { loadGame } from '../platform/save';
import { Tabs } from './common';
import { buildReplay, getCommandRecordingStatus, getGame } from './store';
import './result.css';
import './weekly.css';

const deadline = (time: number) => new Date(time).toLocaleString('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

interface Props {
  readonly onBack: () => void;
  readonly onStart: (challenge: WeeklyChallenge) => void;
}

export function Weekly({ onBack, onStart }: Props) {
  const [challenges, setChallenges] = useState<WeeklyChallenge[] | null>(null);
  const [selected, setSelected] = useState('');
  const [saved, setSaved] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setChallenges(null);
    setError(null);
    void Promise.all([online.listChallenges(), online.getChallenge(), loadGame()]).then(([list, current, save]) => {
      if (!active) return;
      setChallenges([current.challenge, ...list.challenges.filter((c) => c.id !== current.challenge.id)]);
      setSelected(current.challenge.id);
      setSaved(save.state);
    }).catch((e: unknown) => {
      if (active) setError(e instanceof Error ? e.message : '도전을 불러오지 못했습니다.');
    });
    return () => { active = false; };
  }, [reload]);

  const challenge = challenges?.find((c) => c.id === selected);
  return (
    <div className="result-screen weekly" data-testid="weekly">
      <section className="result-window">
        <header className="result-head">
          <h1 className="setup-title">주간 도전</h1>
          <button className="btn ghost" data-testid="weekly-back" onClick={onBack}>돌아가기</button>
        </header>
        <div className="weekly-body">
          {error ? (
            <div role="alert" className="err">
              <p>{error} 일반 커리어는 인터넷 연결 없이 플레이할 수 있습니다.</p>
              <button className="btn ghost" data-testid="weekly-retry" onClick={() => setReload((n) => n + 1)}>다시 불러오기</button>
            </div>
          ) : !challenges ? <p role="status">도전을 불러오고 있습니다.</p> : (
            <>
              <label className="weekly-select">
                <span>도전 기간</span>
                <select data-testid="weekly-select" value={selected} onChange={(e) => setSelected(e.target.value)}>
                  {challenges.map((c) => <option key={c.id} value={c.id}>
                    {deadline(c.startsAt)}부터 · {c.open ? '진행 중' : '마감'}
                  </option>)}
                </select>
              </label>
              {challenge && <WeeklyBoard key={challenge.id} challenge={challenge} saved={saved} onStart={onStart} />}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function WeeklyBoard({ challenge, saved, onStart }: {
  readonly challenge: WeeklyChallenge;
  readonly saved: GameState | null;
  readonly onStart: Props['onStart'];
}) {
  const [status, setStatus] = useState<BoardStatus>('verified');
  const [offset, setOffset] = useState(0);
  const [board, setBoard] = useState<ChallengeBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const rule = DATA.career.challenges.find((c) => c.id === challenge.rule);
  const matches = saved?.seed === challenge.seed && (saved.career.challenge ?? null) === challenge.rule;
  const recording = getCommandRecordingStatus();
  const [submission, setSubmission] = useState<RunSubmission | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  // 제출할 수 있는 판: 이 도전의 기록이 끝까지 온전하고, 지금 판이 같은 시드·규칙으로 은퇴까지 끝남
  const live = getGame();
  const ready = !!recording && recording.challengeId === challenge.id && recording.eligible && !!live?.career.retired
    && live.seed === challenge.seed && (live.career.challenge ?? null) === challenge.rule;

  useEffect(() => {
    let active = true;
    // 내 제출 상태는 로그인해야 보입니다. 로그아웃(401)이면 조용히 비워 두고, 그 밖의 오류는 알립니다
    void online.getMyRun(challenge.id).then((r) => {
      if (active) setSubmission(r.submission);
    }).catch((e: unknown) => {
      if (!active) return;
      if (e instanceof OnlineError && e.status === 401) setSubmission(null);
      else setSubmitMsg(e instanceof Error ? e.message : '제출 상태를 불러오지 못했습니다.');
    });
    return () => { active = false; };
  }, [challenge.id, reload]);

  const submit = async () => {
    const replay = buildReplay(challenge.rule);
    if (!replay) return;
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const r = await online.submitRun(challenge.id, replay);
      setSubmission({ runId: r.runId, status: 'pending', score: null, rejectionCode: null, submittedAt: Date.now(), completedAt: null });
      setSubmitMsg('기록을 보냈습니다. 서버가 명령 기록을 다시 돌려 검증한 뒤 순위에 올립니다.');
    } catch (e: unknown) {
      if (e instanceof OnlineError && e.status === 401) setSubmitMsg('기록을 제출하려면 계정에 로그인해 주세요.');
      else setSubmitMsg(e instanceof Error ? e.message : '기록을 제출하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    let active = true;
    setBoard(null);
    setError(null);
    void online.getLeaderboard(challenge.id, status, offset).then((result) => {
      if (active) setBoard(result);
    }).catch((e: unknown) => {
      if (active) setError(e instanceof Error ? e.message : '순위를 불러오지 못했습니다.');
    });
    return () => { active = false; };
  }, [challenge.id, status, offset, reload]);

  const start = async () => {
    if (saved && !saved.career.retired && !window.confirm('새 도전을 시작하면 지금 기기의 저장을 덮어씁니다. 계속하시겠습니까?')) return;
    setStarting(true);
    setStartError(null);
    try {
      const current = await online.getChallenge(challenge.id);
      if (!current.challenge.open) {
        setStartError('도전이 마감되었습니다. 돌아간 뒤 이번 주 도전을 불러와 주세요.');
        return;
      }
      onStart(current.challenge);
    } catch (e: unknown) {
      setStartError(e instanceof Error ? e.message : '도전을 시작하지 못했습니다.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <section className="weekly-rules">
        <h2>{rule?.name ?? '일반 커리어'}</h2>
        <p>{rule?.desc ?? '기본 커리어 규칙으로 플레이합니다.'} 같은 시드와 규칙으로 시작합니다.</p>
        <p className="muted">{deadline(challenge.endsAt)} 마감 · 한국 시간</p>
        <button className="btn" data-testid="weekly-start" disabled={!challenge.open || starting} onClick={() => void start()}>
          {challenge.open ? '이번 주 도전 시작' : '마감된 도전'}
        </button>
        {startError && <p className="err" role="alert">{startError}</p>}
      </section>
      <section className="weekly-record">
        <h2>내 기록 제출</h2>
        <p>{matches && saved?.career.retired ? '이 도전을 마친 은퇴 기록이 있습니다.' : '이 도전으로 시작한 커리어를 은퇴까지 플레이하면 기록을 제출할 수 있습니다.'}</p>
        <button className="btn ghost" data-testid="weekly-submit" disabled={!ready || !challenge.open || submitting || submission?.status === 'pending'}
          aria-describedby="weekly-submit-reason" onClick={() => void submit()}>기록 제출</button>
        <p id="weekly-submit-reason" className="muted">
          {recording?.challengeId === challenge.id && recording.reason
            ? recording.reason
            : !challenge.open ? '마감된 도전은 기록을 받지 않습니다.'
            : submission?.status === 'pending' ? '보낸 기록을 서버가 검증하고 있습니다. 끝난 뒤 다시 제출할 수 있습니다.'
            : ready ? '명령 기록을 보내면 서버가 처음부터 다시 돌려 점수를 정합니다.'
            : '이 기기에서 이 도전을 시작해 은퇴까지 마친 커리어만 제출할 수 있습니다.'}
        </p>
        {submission && <p className={submission.status === 'rejected' ? 'warn' : 'info'} data-testid="weekly-submission">
          최근 제출 · {submission.status === 'pending' ? '검증 대기 중'
            : submission.status === 'verified' ? `검증됨${submission.score !== null ? ` · ${wonShort(submission.score)}` : ''}`
            : '검증에서 받아들여지지 않았습니다'}
        </p>}
        {submitMsg && <p className="muted" role="status">{submitMsg}</p>}
      </section>
      <section aria-label="주간 도전 순위">
        <Tabs tabs={[{ id: 'verified', label: '검증된 순위' }, { id: 'unverified', label: '미검증 기록' }]}
          value={status} onChange={(value) => { setStatus(value); setOffset(0); }} />
        {status === 'unverified' && <p className="warn">직접 신고한 기록입니다. 서버가 검증하지 않았으며 공식 순위가 아닙니다.</p>}
        {error ? <div className="err" role="alert">
          <p>{error}</p>
          <button className="btn ghost" onClick={() => setReload((n) => n + 1)}>다시 불러오기</button>
        </div> : !board ? <p role="status">순위를 불러오고 있습니다.</p> : (
          <>
            {board.me && board.me.status === status && <p className="info" data-testid="weekly-me">
              내 {status === 'verified' ? '순위' : '참고 기록'} · {board.me.rank}위 · {wonShort(board.me.reportedScore)}
            </p>}
            {board.entries.length === 0 ? <div className="empty-note" data-testid="weekly-empty">
              {status === 'verified' ? '아직 검증된 기록이 없습니다.' : '아직 미검증 기록이 없습니다.'}
            </div> : <ol className="weekly-list" start={offset + 1} data-testid="weekly-entries">
              {board.entries.filter((entry) => entry.status === status).map((entry) => <li key={entry.rank}>
                <span className="weekly-place">{entry.rank}위</span>
                <span className="weekly-founder"><b>{entry.founderName}</b>{entry.mine && <span className="chip blue">나</span>}<small className="muted">회사 {entry.companies}곳</small></span>
                <span className="weekly-score"><small>{status === 'verified' ? '개인 자산' : '신고 자산'}</small><b>{wonShort(entry.reportedScore)}</b></span>
              </li>)}
            </ol>}
            <div className="row weekly-pages">
              <button className="btn ghost" data-testid="weekly-prev" disabled={offset === 0} onClick={() => setOffset((n) => Math.max(0, n - 50))}>이전 기록</button>
              <button className="btn ghost" data-testid="weekly-next" disabled={board.entries.length < 50} onClick={() => setOffset((n) => n + 50)}>다음 기록</button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
