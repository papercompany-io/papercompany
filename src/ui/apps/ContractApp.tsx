// 외주 창(A-207): 업무 창의 외주 탭(A-133·A-136)을 따로 뗀 앱. 짜임은 업무 창(A-171·A-179)과 같은 톤
//  (진행 중일 때만) 가운데 큰 마감 D-day + 칸칸이 막대 → 납작한 회색 요약 칸 → 하는 사람 줄
//  → 평판 한 줄(완료 건수·도움말) → 들어온 제안은 회색 리스트 줄(이름·거래처 / 대표 혼자 걸리는 날 / 대금 / 받기). 창 안 머리띠·제안 수 큰 글자는 없음, 창 넓이를 다 씀
//  A-208: 왼쪽 아래 "새 제안 알림 받기" 체크 박스(켜면 제안 목록이 바뀔 때 알림)
//  A-238: 외주를 동시에 여러 개(최대 maxActive) — 진행 중인 외주마다 카드 하나. 카드의 "하는 사람"에서 "인원 배치"로 개발·디자인 직원을 한 명씩,
//  또는 부서를 통째로 이 외주에 배치(끝나면 원래 부서 일로 돌아감). 대표 외주 칸과 배치 없이 "외주 작업"을 맡은 사람은 마감이 가장 가까운 외주에 들어감
// 계산(contractPace·contractDue)은 일정 창과 알림 카드가 같이 쓰므로 ScheduleApp에 둡니다.
import { useState } from 'react';
import { dept, orderDef } from '../../core/data';
import { acceptContract, activeContracts, canStaff, contractsOpen, dropContract, setContractAlert, setContractSquad, setContractStaff, staffedOn, trustLevel, type Contract } from '../../core/contracts';
import { empOrderOf } from '../../core/assign';
import { squad, squadMembers, squadsOf } from '../../core/squads';
import { output } from '../../core/staff';
import { PixelAvatar } from '../office/Avatar';
import { act, useGame } from '../store';
import type { Employee, GameState } from '../../core/types';
import DATA from '../../data/contracts.json';
import { Help, Money } from '../common';
import { contractDue, contractPace, daysText } from './ScheduleApp';

const ST_MAX = DATA.staffing.maxActive;

export function ContractApp({ openSchedule, openDevTeam }: { openSchedule?: () => void; openDevTeam?: () => void }) {
  const s = useGame();
  const c = s.contracts;
  const actives = activeContracts(s); // A-238: 동시에 여러 외주
  const full = actives.length >= ST_MAX;
  const pace = contractPace(s);
  const t = trustLevel(s); // A-144: 단계 이름과 다음 단계까지 막대만(점수·단가는 숨김)
  const offers = c?.offers ?? [];
  if (!actives.length && !contractsOpen(s))
    return (
      <div className="col wk" data-testid="contracts">
        <div className="wk-empty">
          <b>이제 외주를 받지 않습니다</b>
          <span>회사가 커서 고객사가 작은 일감을 맡기지 않습니다.</span>
        </div>
      </div>
    );
  return (
    <div className="col wk ct2-page" data-testid="contracts">
      <div className="wk-mvp ct2">
        {actives.length > 1 && (
          <h3 className="wk-sect">
            진행 중 <em>{actives.length}/{ST_MAX}</em>
          </h3>
        )}
        {actives.map((a) => a.deadline !== null && <Active key={a.id} a={a} many={actives.length > 1} openSchedule={openSchedule} />)}
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
          <Help text="외주는 동시에 여러 개 받을 수 있습니다. 외주마다 개발·디자인 직원이나 부서를 배치하면 끝날 때까지 그 외주만 하고, 끝나면 원래 부서 일로 돌아갑니다. 대표 주 업무 &quot;외주&quot;는 마감이 가장 가까운 외주에 들어갑니다. 끝냈을 때 대금이 들어옵니다. 그만큼 제품 개발은 늦어집니다. 마감은 근무 시간으로 세서 퇴근 뒤 밤에는 줄지 않습니다. 마감을 넘기면 대금이 깎이고, 많이 넘기면 취소됩니다. 제때 끝낼수록 외주 평판이 올라 더 크고 비싼 일감이 들어옵니다." />
        </div>
        {!actives.length && !offers.length && (
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
                    <button className="btn small" data-testid={`contract-take-${o.id}`} disabled={full} title={full ? `외주는 동시에 ${ST_MAX}개까지 진행할 수 있습니다.` : ok ? '' : '대표 혼자서는 기간 안에 끝내기 어렵습니다. 받은 뒤 인력을 배치하세요.'} onClick={() => act((g) => acceptContract(g, o.id))}>
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
// 진행 중인 외주 하나(A-238): 큰 D-day + 막대, 회색 요약 칸, 하는 사람(대표·배치한 부서·배치한 사람·외주 작업 맡은 사람) + 인원 배치
function Active({ a, many, openSchedule }: { a: Contract; many: boolean; openSchedule?: () => void }) {
  const s = useGame();
  const [picking, setPicking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pace = contractPace(s, a);
  const due = contractDue(s, a)!;
  const pct = Math.min(100, (a.done / a.work) * 100);
  const eta = pace.total > 0 ? Math.max(0, a.work - a.done) / pace.total : null;
  const bad = due.late || eta === null;
  const sq = squad(s, a.squadId);
  const solo = pace.staffed.filter((e) => a.staff?.includes(e.id));
  const viaSquad = pace.staffed.filter((e) => !a.staff?.includes(e.id));
  const maxRate = Math.max(pace.ceoFull, ...pace.staffed.map((e) => output(s, e)), ...pace.loose.map((e) => output(s, e)), 0.01);
  const run = (fn: (g: GameState) => string | null) => setErr(act(fn) ?? null);
  return (
    <div className={`ct3 ${many ? 'many' : ''}`} data-testid={`contract-active-${a.id}`}>
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
          <span>예상 완료</span>
          <b className={bad ? 'neg' : ''}>{eta === null ? '멈춤' : daysText(eta)}</b>
        </div>
        <div className="wk-stat">
          <span>마감 대비</span>
          <b className={bad ? 'neg' : ''}>{eta === null ? '인력 없음' : due.late ? '늦음' : '제때'}</b>
        </div>
        <div className="wk-stat">
          <span>대금</span>
          <b>
            <Money v={a.pay} />
          </b>
        </div>
      </div>
      <section className="wk-team">
        <div className="ct3-head">
          <h3 className="wk-sect">작업 인력</h3>
          <button className={`btn small ${picking ? '' : 'ghost'}`} data-testid={`contract-staff-${a.id}`} aria-expanded={picking} onClick={() => setPicking(!picking)}>
            {picking ? '배치 닫기' : '+ 인원 배치'}
          </button>
        </div>
        {pace.ceo > 0 && <Row av="나" name="대표" sub="주 업무 외주" rate={pace.ceo} max={maxRate} />}
        {sq && (
          <div className="wk-person ct3-squad">
            <span className="wk-av dev">부</span>
            <b>
              {sq.name} <small>부서 배치 · {viaSquad.length}명</small>
            </b>
            <span className="ct3-fill" />
            <button className="ct3-x" title="부서 배치 빼기(원래 부서 일로 돌아감)" onClick={() => run((g) => setContractSquad(g, a.id, null))}>
              빼기
            </button>
          </div>
        )}
        {viaSquad.map((e) => (
          <Row key={e.id} e={e} sub={`${dept(e.dept).name} · ${sq?.name ?? ''}`} rate={output(s, e)} max={maxRate} />
        ))}
        {solo.map((e) => (
          <Row key={e.id} e={e} sub={`${dept(e.dept).name} · 배치`} rate={output(s, e)} max={maxRate} onRemove={() => run((g) => setContractStaff(g, a.id, e.id, false))} />
        ))}
        {pace.loose.map((e) => (
          <Row key={e.id} e={e} sub={`${dept(e.dept).name} · "외주 작업" 맡음`} rate={output(s, e)} max={maxRate} />
        ))}
        {eta === null && <p className="wk-tip">아무도 이 외주를 하지 않습니다. "+ 인원 배치"로 사람이나 부서를 넣거나, 대표 주 업무를 "외주"로 바꾸세요.</p>}
        {picking && <Picker a={a} run={run} />}
        {err && <div className="err">{err}</div>}
        <div className="wk-btns">
          {openSchedule && (
            <button className="btn small ghost" onClick={openSchedule}>
              대표 일정 바꾸기
            </button>
          )}
          <button className="btn small ghost" data-testid="contract-drop" onClick={() => run((g) => dropContract(g, a.id))}>
            포기
          </button>
        </div>
      </section>
    </div>
  );
}

function Row({ e, av, name, sub, rate, max, onRemove }: { e?: Employee; av?: string; name?: string; sub: string; rate: number; max: number; onRemove?: () => void }) {
  return (
    <div className="wk-person">
      {e ? <PixelAvatar id={e.id} color={dept(e.dept).color} size={22} /> : <span className="wk-av me">{av}</span>}
      <b>
        {e ? e.name : name} <small>{sub}</small>
      </b>
      <span className="ms-bar">
        <div style={{ width: `${(rate / max) * 100}%` }} />
      </span>
      {onRemove ? (
        <button className="ct3-x" title="배치 빼기(원래 부서 일로 돌아감)" onClick={onRemove}>
          빼기
        </button>
      ) : (
        <em>외주 중</em>
      )}
    </div>
  );
}

// 인원 배치(A-238): 사람 한 명씩 또는 부서 통째로. 지금 하는 일·다른 외주 배치를 같이 보여 줌
function Picker({ a, run }: { a: Contract; run: (fn: (g: GameState) => string | null) => void }) {
  const s = useGame();
  const [mode, setMode] = useState<'people' | 'squad'>('people');
  const people = s.employees.filter(canStaff);
  const squads = squadsOf(s);
  return (
    <div className="ct3-pick" data-testid={`contract-picker-${a.id}`}>
      <div className="seg ct3-seg">
        <button className={mode === 'people' ? 'on' : ''} onClick={() => setMode('people')}>
          사람
        </button>
        <button className={mode === 'squad' ? 'on' : ''} onClick={() => setMode('squad')}>
          부서
        </button>
      </div>
      {mode === 'people' ? (
        people.length === 0 ? (
          <p className="wk-tip">외주를 할 개발·디자인 직원이 없습니다.</p>
        ) : (
          <div className="ct3-list">
            {people.map((e) => {
              const on = !!a.staff?.includes(e.id);
              const other = staffedOn(s, e);
              const now = other && other.id !== a.id ? `다른 외주: ${other.title}` : other ? '이 외주 진행 중' : orderDef(empOrderOf(s, e))?.name ?? '';
              return (
                <label key={e.id} className={`ct3-opt ${on ? 'on' : ''}`}>
                  <input type="checkbox" data-testid={`contract-staff-${a.id}-${e.id}`} checked={on} onChange={(ev) => run((g) => setContractStaff(g, a.id, e.id, ev.target.checked))} />
                  <PixelAvatar id={e.id} color={dept(e.dept).color} size={22} />
                  <span>
                    <b>{e.name}</b>{' '}
                    <small>
                      {dept(e.dept).name}
                      {squad(s, e.squadId) ? ` · ${squad(s, e.squadId)!.name}` : ''}
                    </small>
                  </span>
                  <em>{now}</em>
                </label>
              );
            })}
          </div>
        )
      ) : squads.length === 0 ? (
        <p className="wk-tip">아직 부서가 없습니다. 직원 관리의 부서 탭에서 만들 수 있습니다.</p>
      ) : (
        <div className="ct3-list">
          {squads.map((q) => {
            const on = a.squadId === q.id;
            const elsewhere = activeContracts(s).find((x) => x.id !== a.id && x.squadId === q.id);
            const n = squadMembers(s, q.id).filter(canStaff).length;
            return (
              <label key={q.id} className={`ct3-opt ${on ? 'on' : ''}`}>
                <input type="radio" name={`ct-sq-${a.id}`} data-testid={`contract-squad-${a.id}-${q.id}`} checked={on} disabled={n === 0} onChange={() => run((g) => setContractSquad(g, a.id, q.id))} />
                <span>
                  <b>{q.name}</b> <small>외주 가능 인력 {n}명</small>
                </span>
                <em>{elsewhere ? `다른 외주: ${elsewhere.title}` : ''}</em>
              </label>
            );
          })}
          {a.squadId && (
            <button className="btn small ghost" onClick={() => run((g) => setContractSquad(g, a.id, null))}>
              부서 배치 빼기
            </button>
          )}
        </div>
      )}
      <p className="ct3-note">배치한 직원은 이 외주가 끝날 때까지 외주만 하고, 끝나면 원래 부서 일로 돌아갑니다. 그동안 제품 개발은 그만큼 늦어집니다.</p>
    </div>
  );
}
