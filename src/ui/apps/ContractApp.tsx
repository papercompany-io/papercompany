// 외주 창(A-207): 업무 창의 외주 탭(A-133·A-136)을 따로 뗀 앱. 짜임은 업무 창(A-171·A-179)과 같은 톤
//  (진행 중일 때만) 가운데 큰 마감 D-day + 칸칸이 막대 → 납작한 회색 요약 칸 → 하는 사람 줄
//  → 평판 한 줄(완료 건수·도움말) → 들어온 제안은 회색 리스트 줄(이름·거래처 / 대표 혼자 걸리는 날 / 대금 / 받기). 창 안 머리띠·제안 수 큰 글자는 없음, 창 넓이를 다 씀
//  A-208: 왼쪽 아래 "새 제안 알림 받기" 체크 박스(켜면 제안 목록이 바뀔 때 알림)
// 계산(contractPace·contractDue)은 일정 창과 알림 카드가 같이 쓰므로 ScheduleApp에 둡니다.
import { acceptContract, contractsOpen, dropContract, setContractAlert, trustLevel } from '../../core/contracts';
import { act, useGame } from '../store';
import { Help, Money } from '../common';
import { contractDue, contractPace, daysText } from './ScheduleApp';

export function ContractApp({ openSchedule, openDevTeam }: { openSchedule?: () => void; openDevTeam?: () => void }) {
  const s = useGame();
  const c = s.contracts;
  const a = c?.active ?? null;
  const pace = contractPace(s);
  const t = trustLevel(s); // A-144: 단계 이름과 다음 단계까지 막대만(점수·단가는 숨김)
  const offers = c?.offers ?? [];
  if (!a && !contractsOpen(s))
    return (
      <div className="col wk" data-testid="contracts">
        <div className="wk-empty">
          <b>이제 외주를 받지 않습니다</b>
          <span>회사가 커서 거래처가 작은 일감을 맡기지 않습니다.</span>
        </div>
      </div>
    );
  return (
    <div className="col wk ct2-page" data-testid="contracts">
      <div className="wk-mvp ct2">
        {a && a.deadline !== null && <Active openSchedule={openSchedule} openDevTeam={openDevTeam} />}
        <div className="ct2-trust" data-testid="contract-trust" title={t.next ? `다음 단계: ${t.next}` : '가장 높은 단계'}>
          <span>외주 평판</span>
          <b>{t.name}</b>
          <div className="ms-bar">
            <div style={{ width: `${t.progress * 100}%` }} />
          </div>
          <em>
            {t.next ? `다음: ${t.next}` : '최고 단계'}
            {c?.completed ? ` · 완료 ${c.completed}건` : ''}
          </em>
          <Help text="대표 주 업무 &quot;외주&quot;나 개발팀 &quot;외주 작업&quot; 지시로 일을 하면 끝냈을 때 대금이 들어옵니다. 그만큼 제품 개발은 늦어집니다. 마감은 근무 시간으로 세서 퇴근 뒤 밤에는 줄지 않습니다. 마감을 넘기면 대금이 깎이고, 많이 넘기면 취소됩니다. 제때 끝낼수록 외주 평판이 올라 더 크고 비싼 일감이 들어옵니다." />
        </div>
        {!a && !offers.length && (
          <div className="wk-empty small" data-testid="contracts-empty">
            지금 들어온 외주 제안이 없습니다. {c && c.nextOfferDay > s.day ? `${c.nextOfferDay - s.day}일 뒤에 새 제안이 들어옵니다.` : '곧 새 제안이 들어옵니다.'}
          </div>
        )}
        {offers.length > 0 && (
          <>
            <h3 className="wk-sect">
              들어온 제안 <em>{offers.length}</em>
            </h3>
            <div className="ct2-list">
              {offers.map((o) => {
                const solo = o.work / pace.ceoFull;
                const ok = Math.ceil(solo) <= o.days;
                return (
                  <div key={o.id} className="ct2-row">
                    <div className="ct2-main">
                      <div className="ct2-name">
                        <b>{o.title}</b>
                        {(o.tier ?? 0) >= 2 && <span className="chip amber">큰 일감</span>}
                      </div>
                      <span>
                        {o.client} · 기간 근무 {o.days}일 · {o.offeredUntil - s.day}일 뒤 제안 마감
                      </span>
                    </div>
                    <div className={`ct2-solo ${ok ? '' : 'bad'}`} title="대표가 하루 내내 외주만 할 때">
                      <span>대표 혼자</span>
                      <b>{daysText(solo)}</b>
                    </div>
                    <b className="ct2-pay">
                      <Money v={o.pay} />
                    </b>
                    <button className="btn small" data-testid={`contract-take-${o.id}`} disabled={!!a} title={a ? '진행 중인 외주를 먼저 끝내세요.' : ok ? '' : '기간 안에 대표 혼자는 어렵습니다.'} onClick={() => act((g) => acceptContract(g, o.id))}>
                      받기
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      <label className="ct2-alert" title="켜 두면 외주 제안 목록이 새로 바뀔 때 알림이 옵니다.">
        <input type="checkbox" data-testid="contract-alert" checked={!!c?.alert} onChange={(e) => act((g) => setContractAlert(g, e.target.checked))} />
        새 제안 알림 받기
      </label>
    </div>
  );
}

// 진행 중인 외주: 업무 창 MVP 상태처럼 가운데 큰 D-day + 막대, 회색 요약 칸, 하는 사람 줄
function Active({ openSchedule, openDevTeam }: { openSchedule?: () => void; openDevTeam?: () => void }) {
  const s = useGame();
  const a = s.contracts!.active!;
  const pace = contractPace(s);
  const due = contractDue(s)!;
  const pct = Math.min(100, (a.done / a.work) * 100);
  const eta = pace.total > 0 ? Math.max(0, a.work - a.done) / pace.total : null;
  const bad = due.late || eta === null;
  const maxRate = Math.max(pace.ceoFull, pace.team, 0.01);
  const people = [
    { key: 'me', av: '나', name: '대표', rate: pace.ceo, text: pace.ceo > 0 ? '외주 중' : '다른 일 중', empty: pace.ceo <= 0 },
    { key: 'dev', av: '개', name: `개발팀 ${pace.devs}명`, rate: pace.team, text: pace.team > 0 ? '외주 중' : pace.devs ? '다른 일 중' : '없음', empty: pace.team <= 0 },
  ];
  return (
    <>
      <section className={`wk-hero ${bad ? 'bad' : ''}`}>
        <span className="wk-kicker">
          {a.client} · {a.title}
        </span>
        <h2 className="wk-count" title={due.tip}>
          {due.overdue ? '마감 지남' : `D-${Math.max(0, due.dl)}`}
        </h2>
        <p className="wk-sub" title={due.tip}>
          {due.text}
        </p>
        <div className="wk-prog">
          <div className="ms-bar">
            <div style={{ width: `${pct}%` }} />
          </div>
          <b>{Math.floor(pct)}%</b>
        </div>
      </section>
      <div className="wk-stats">
        <div className="wk-stat">
          <span>끝나는 때</span>
          <b className={bad ? 'neg' : ''}>{eta === null ? '멈춤' : daysText(eta)}</b>
        </div>
        <div className="wk-stat">
          <span>마감과 비교</span>
          <b className={bad ? 'neg' : ''}>{eta === null ? '아무도 안 함' : due.late ? '늦음' : '맞춤'}</b>
        </div>
        <div className="wk-stat">
          <span>대금</span>
          <b>
            <Money v={a.pay} />
          </b>
        </div>
      </div>
      <section className="wk-team">
        <h3 className="wk-sect">하는 사람</h3>
        {people.map((x) => (
          <div key={x.key} className={`wk-person ${x.empty ? 'empty' : ''}`}>
            <span className={`wk-av ${x.key}`}>{x.av}</span>
            <b>{x.name}</b>
            <span className="ms-bar">
              <div style={{ width: `${(x.rate / maxRate) * 100}%` }} />
            </span>
            <em>{x.text}</em>
          </div>
        ))}
        {eta === null && <p className="wk-tip">대표 주 업무를 "외주"로 하거나, 개발팀에 "외주 작업"을 맡기세요.</p>}
        <div className="wk-btns">
          {openSchedule && (
            <button className="btn small" onClick={openSchedule}>
              대표 일정 바꾸기
            </button>
          )}
          {openDevTeam && pace.devs > 0 && (
            <button className="btn small ghost" onClick={openDevTeam}>
              개발팀에 맡기기
            </button>
          )}
          <button className="btn small ghost" data-testid="contract-drop" onClick={() => act((g) => dropContract(g))}>
            포기
          </button>
        </div>
      </section>
    </>
  );
}
