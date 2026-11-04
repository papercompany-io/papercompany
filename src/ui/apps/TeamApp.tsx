// 화면(A-191): 팀 앱 — 사람이 있는 부서마다 알약 탭, 탭마다 그 부서가 하는 일 페이지(DeptPage).
// 화면(A-213): 따로 있던 팀 앱은 직원 관리 창의 탭으로. 왼쪽 줄 + 오른쪽 고른 페이지
// 화면(A-237): 부서(=팀)는 대표가 만든 사람 묶음이고 직무가 섞여도 됨. 채용하면 직무만 정해지고 "소속 없음"에 들어감.
//   왼쪽 줄 = 만든 부서들 · 소속 없음 · "+ 부서 만들기". 오른쪽 = 고른 부서의 "하는 일"(직무마다 한 줄, 사람별 예외) · 사람(넣기·옮기기) · 그 직무들이 쓰는 화면.
//   맡은 일은 늘 부서 기준: 부서 사람은 그 부서가 직무에 맡긴 일, 소속 없음은 회사 기본 일(company.orders)
// DeptPage는 사무실 직원 창 오른쪽(특수 업무 직무, A-229)에 들어가는 직무 페이지
// 직무마다 이미 있는 화면을 그대로 씀: 개발·디자인 = 개발 일정, 마케팅 = 광고 집행, 광고 운영 = 광고 판매, 세일즈 = 대기업 계약, 인사 = 위임 채용, AI연구 = AI 도입
import { useState } from 'react';
import { DEPT_IDS, dept, orderDef } from '../../core/data';
import { deptMembers } from '../../core/employees';
import { deptOutput, leadInfo } from '../../core/staff';
import { EmpOrderSelect, SquadOrderSelect, TeamOrderSelect } from './MessengerApp';
import { createSquad, renameSquad, setSquad, squad, squadChannelId, squadJobs, squadMembers, squadsOf, unassigned } from '../../core/squads';
import { groupOrder } from '../../core/assign';
import { deptCoverage } from '../../core/market';
import type { DeptId, Employee } from '../../core/types';
import { dispatch, useGame } from '../store';
import { PixelAvatar } from '../office/Avatar';
import type { AppId } from '../Desktop';
import { Ads } from './AdsPanel';
import { AdSales } from './AdSalesPanel';
import { Enterprise } from './MarketApp';
import { AutoHire } from './HiringApp';
import { NowBuilding, productView } from './ProductApp';
import { AiApp } from './AiApp';
import './skin/TeamApp.css';

export type OpenApp = (app: AppId, arg?: string) => void;

const NONE = 'none'; // 소속 없음 줄

// 사람들이 가진 직무(직무 순서대로)
function jobsOf(people: Employee[]): DeptId[] {
  return DEPT_IDS.filter((d) => people.some((e) => e.dept === d));
}

export function TeamApp({ initial, openApp, onEmployee }: { initial?: string; openApp: OpenApp; onEmployee?: (id: string) => void }) {
  const s = useGame();
  const squads = squadsOf(s);
  const [sel, setSel] = useState<string>(initial ?? squads[0]?.id ?? NONE);
  if (!s.employees.length)
    return (
      <div className="wk-empty">
        <b>아직 직원이 없습니다</b>
        <span>직원을 채용하면 여기서 부서를 만들고 업무를 맡깁니다.</span>
        <button className="btn small" data-testid="team-open-hiring" onClick={() => openApp('hiring')}>
          채용 탭으로
        </button>
      </div>
    );
  const cur = sel === 'new' ? 'new' : squad(s, sel) ? sel : NONE;
  const loose = unassigned(s);
  return (
    <div className="em3-split">
      <nav className="em3-list">
        {squads.map((q) => (
          <button key={q.id} className={`em3-row dept sq ${cur === q.id ? 'on' : ''}`} data-testid={`tab-squad-${q.id}`} onClick={() => setSel(q.id)}>
            <span className="sq-row-main">
              <b>{q.name}</b>
              <small>{squadJobs(s, q.id).map((d) => dept(d).name).join(' · ') || '직원 없음'}</small>
            </span>
            <span className="em3-sat">{squadMembers(s, q.id).length}명</span>
          </button>
        ))}
        <button className={`em3-row dept sq none ${cur === NONE ? 'on' : ''}`} data-testid="tab-squad-none" onClick={() => setSel(NONE)}>
          <span className="sq-row-main">
            <b>소속 없음</b>
            <small>{loose.length ? '부서 미배정 직원' : '모두 배정됨'}</small>
          </span>
          <span className="em3-sat">{loose.length}명</span>
        </button>
        <button className={`em3-row dept add ${cur === 'new' ? 'on' : ''}`} data-testid="dept-new" onClick={() => setSel('new')}>
          <b>+ 부서 만들기</b>
        </button>
      </nav>
      <section className="em3-detail">
        {cur === 'new' ? <NewSquad onDone={setSel} /> : cur === NONE ? <LoosePage openApp={openApp} onEmployee={onEmployee} /> : <SquadPage id={cur} openApp={openApp} onEmployee={onEmployee} onDeleted={() => setSel(NONE)} />}
      </section>
    </div>
  );
}

// 하는 일(A-237): 이 묶음에 있는 직무마다 한 줄 — 직무 · 사람 수 · 고르는 칸 · 설명. 아래 사람별 예외(혼자 다른 일)
function WorkRows({ people, squadId, setMsg }: { people: Employee[]; squadId?: string; setMsg: (m: string | null) => void }) {
  const s = useGame();
  const jobs = jobsOf(people);
  const odd = people.filter((e) => !!e.order && e.order !== groupOrder(s, e));
  if (!jobs.length) return <p className="empty-note">아직 직원이 없습니다. 아래에서 직원을 넣으면 직무별 업무를 정합니다.</p>;
  return (
    <div className="sq-work">
      {jobs.map((d) => {
        const n = people.filter((e) => e.dept === d).length;
        const id = squadId ? squad(s, squadId)?.orders[d] ?? groupOrder(s, people.find((e) => e.dept === d)!) : groupOrder(s, people.find((e) => e.dept === d)!);
        return (
          <div key={d} className="sq-work-row" style={{ ['--dc' as string]: dept(d).color }}>
            <span className="sq-job">
              <i className="em3-dot" />
              {dept(d).name} <small>{n}명</small>
            </span>
            {squadId ? <SquadOrderSelect squadId={squadId} d={d} onErr={setMsg} /> : <TeamOrderSelect d={d} plain testId={`dept-order-${d}`} onErr={setMsg} />}
            <span className="sq-desc">{orderDef(id)?.desc}</span>
          </div>
        );
      })}
      <details className="sq-odd" open={odd.length > 0}>
        <summary>
          사람별 예외 <span className="muted">· {odd.length ? `예외 ${odd.length}명` : '없음'}</span>
        </summary>
        <div className="sq-odd-list">
          {people.map((e) => (
            <label key={e.id} className="sq-odd-row">
              <span>
                {e.name} <small>{dept(e.dept).name}</small>
              </span>
              <EmpOrderSelect e={e} onErr={setMsg} />
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

// 사람 칩: 누르면 직원 탭에서 그 사람. 옆 칸으로 다른 부서로 옮김
function PeopleRows({ people, onEmployee, setMsg }: { people: Employee[]; onEmployee?: (id: string) => void; setMsg: (m: string | null) => void }) {
  const s = useGame();
  return (
    <div className="sq-people">
      {people.map((e) => (
        <div key={e.id} className="sq-person" style={{ ['--dc' as string]: dept(e.dept).color }}>
          <button className="dpg-person" disabled={!onEmployee} title={onEmployee ? `${e.name} 보기` : e.name} onClick={() => onEmployee?.(e.id)}>
            <PixelAvatar id={e.id} color={dept(e.dept).color} size={26} />
            <span>
              {e.name}
              <small>
                {dept(e.dept).name}
                {e.lead ? ' · 팀장' : ''}
              </small>
            </span>
          </button>
          <select aria-label={`${e.name} 부서`} data-testid={`emp-squad-${e.id}`} value={e.squadId ?? ''} onChange={(ev) => setMsg((dispatch({ type: 'setSquad', empId: e.id, squadId: ev.target.value || null }) as ReturnType<typeof setSquad>) ?? null)}>
            <option value="">소속 없음</option>
            {squadsOf(s).map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

// 이 직무들이 쓰는 화면(개발·디자인은 한 번만)
function JobViews({ jobs, setMsg, openApp }: { jobs: DeptId[]; setMsg: (m: string | null) => void; openApp: OpenApp }) {
  const shown = jobs.filter((d, i) => !(d === 'design' && jobs.includes('dev')) && jobs.indexOf(d) === i);
  if (!shown.length) return null;
  return (
    <div className="dpg-body sq-views">
      {shown.map((d) => (
        <div key={d}>
          <DeptWork d={d} setMsg={setMsg} openApp={openApp} />
        </div>
      ))}
    </div>
  );
}

// 만든 부서 한 곳(A-237)
function SquadPage({ id, openApp, onEmployee, onDeleted }: { id: string; openApp: OpenApp; onEmployee?: (id: string) => void; onDeleted: () => void }) {
  const s = useGame();
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const q = squad(s, id);
  if (!q) return null;
  const members = squadMembers(s, id);
  const others = s.employees.filter((e) => e.squadId !== id);
  return (
    <div className="dpg" data-testid={`squad-page-${id}`}>
      <div className="dpg-head">
        <div className="dpg-title">
          {editing !== null ? (
            <form
              className="dpg-sq-new"
              onSubmit={(ev) => {
                ev.preventDefault();
                const err = (dispatch({ type: 'renameSquad', squadId: id, name: editing }) as ReturnType<typeof renameSquad>) ?? null;
                setMsg(err);
                if (!err) setEditing(null);
              }}
            >
              <input autoFocus value={editing} maxLength={12} onChange={(ev) => setEditing(ev.target.value)} />
              <button className="btn small" type="submit">
                저장
              </button>
              <button className="btn small ghost" type="button" onClick={() => setEditing(null)}>
                취소
              </button>
            </form>
          ) : (
            <button className="dpg-sq-name" title="이름 바꾸기" onClick={() => setEditing(q.name)}>
              <b>{q.name}</b>
            </button>
          )}
          <span className="dpg-meta">{members.length}명</span>
          <span className="dpg-sq-tools">
            <button className="btn small ghost" onClick={() => openApp('messenger', squadChannelId(id))}>
              채팅방
            </button>
            <button className="btn small ghost" data-testid={`squad-remove-${id}`} title="직원은 소속 없음으로 돌아가고 채팅방은 닫힙니다" onClick={() => (dispatch({ type: 'removeSquad', squadId: id }), onDeleted())}>
              부서 삭제
            </button>
          </span>
        </div>
      </div>
      {msg && <div className="info dpg-msg">{msg}</div>}
      <section className="sq-sect">
        <h4 className="sq-h">업무</h4>
        <WorkRows people={members} squadId={id} setMsg={setMsg} />
      </section>
      <section className="sq-sect">
        <div className="sq-h-row">
          <h4 className="sq-h">직원</h4>
          {others.length > 0 && (
            <select className="sq-add" data-testid={`squad-add-${id}`} value="" onChange={(ev) => ev.target.value && setMsg((dispatch({ type: 'setSquad', empId: ev.target.value, squadId: id }) as ReturnType<typeof setSquad>) ?? null)}>
              <option value="">+ 직원 추가</option>
              {others.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({dept(e.dept).name}
                  {squad(s, e.squadId) ? ` · 지금 ${squad(s, e.squadId)!.name}` : ''})
                </option>
              ))}
            </select>
          )}
        </div>
        {members.length ? <PeopleRows people={members} onEmployee={onEmployee} setMsg={setMsg} /> : <p className="empty-note">아직 직원이 없습니다. 오른쪽 위 "+ 직원 추가"로 넣습니다.</p>}
      </section>
      <JobViews jobs={jobsOf(members)} setMsg={setMsg} openApp={openApp} />
    </div>
  );
}

// 소속 없음(A-237): 부서에 넣지 않은 사람과 그 사람들이 하는 회사 기본 일
function LoosePage({ openApp, onEmployee }: { openApp: OpenApp; onEmployee?: (id: string) => void }) {
  const s = useGame();
  const [msg, setMsg] = useState<string | null>(null);
  const loose = unassigned(s);
  return (
    <div className="dpg" data-testid="squad-page-none">
      <div className="dpg-head">
        <div className="dpg-title">
          <b>소속 없음</b>
          <span className="dpg-meta">{loose.length}명 · 부서 미배정 직원은 아래 업무를 합니다</span>
        </div>
      </div>
      {msg && <div className="info dpg-msg">{msg}</div>}
      {loose.length === 0 ? (
        <p className="empty-note">모든 직원이 부서에 있습니다.</p>
      ) : (
        <>
          <section className="sq-sect">
            <h4 className="sq-h">업무</h4>
            <WorkRows people={loose} setMsg={setMsg} />
          </section>
          <section className="sq-sect">
            <h4 className="sq-h">직원</h4>
            <PeopleRows people={loose} onEmployee={onEmployee} setMsg={setMsg} />
          </section>
          <JobViews jobs={jobsOf(loose)} setMsg={setMsg} openApp={openApp} />
        </>
      )}
    </div>
  );
}

// 새 부서 만들기(A-237): 이름과 넣을 사람(직무가 섞여도 됨)
function NewSquad({ onDone }: { onDone: (id: string) => void }) {
  const s = useGame();
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const make = () => {
    const r = dispatch({ type: 'createSquad', name, members: picked }) as ReturnType<typeof createSquad> | undefined;
    if (!r) return;
    if (typeof r === 'object') return setErr(r.err);
    onDone(r);
  };
  return (
    <form
      className="dpg dpg-new"
      data-testid="dept-new-form"
      onSubmit={(ev) => {
        ev.preventDefault();
        make();
      }}
    >
      <div className="dpg-head">
        <div className="dpg-title">
          <b>새 부서 만들기</b>
          <span className="dpg-meta">개발자·디자이너처럼 직무가 달라도 한 부서에 넣을 수 있습니다. 부서마다 채팅방이 생깁니다.</span>
        </div>
      </div>
      <label className="dpg-field">
        <span className="hf-label">이름</span>
        <input data-testid="dept-new-name" value={name} maxLength={12} placeholder="예: 결제팀" onChange={(ev) => setName(ev.target.value)} />
      </label>
      <div className="dpg-field">
        <span className="hf-label">직원 {picked.length ? `· ${picked.length}명 선택` : ''}</span>
        <div className="dpg-people">
          {s.employees.map((e) => {
            const on = picked.includes(e.id);
            const other = squad(s, e.squadId);
            return (
              <button key={e.id} type="button" className={`dpg-person ${on ? 'on' : ''}`} style={{ ['--dc' as string]: dept(e.dept).color }} aria-pressed={on} onClick={() => setPicked(on ? picked.filter((x) => x !== e.id) : [...picked, e.id])}>
                <PixelAvatar id={e.id} color={dept(e.dept).color} size={26} />
                <span>
                  {e.name}
                  <small>
                    {dept(e.dept).name}
                    {other ? ` · 지금 ${other.name}` : ''}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {err && <div className="info dpg-msg">{err}</div>}
      <div>
        <button className="btn" data-testid="dept-new-make" type="submit" disabled={!name.trim()}>
          부서 만들기
        </button>
      </div>
    </form>
  );
}

// 직무 한 곳의 페이지(사무실 직원 창, A-229): 위 띠(직무·사람·이 사람이 하는 일) + 아래 그 직무가 쓰는 화면
export function DeptPage({ d, openApp, focusId, onEmployee }: { d: DeptId; openApp: OpenApp; focusId?: string; onEmployee?: (id: string) => void }) {
  const s = useGame();
  const [msg, setMsg] = useState<string | null>(null);
  const members = deptMembers(s, d);
  const li = leadInfo(s, d);
  const me = members.find((e) => e.id === focusId);
  // 직원 창 왼쪽에 이미 그 사람이 있으니, 혼자인 직무면 사람 칩 줄을 빼서 같은 이름이 두 번 나오지 않게(A-193)
  const showPeople = !focusId || members.length > 1;
  return (
    <div className="dpg" style={{ ['--dc' as string]: dept(d).color }} data-testid={`dept-page-${d}`}>
      <div className="dpg-head">
        <div className="dpg-title">
          <span className="dpg-dot" />
          <b>{dept(d).name}</b>
          <span className="dpg-meta">
            {members.length}명 · 팀장 {li.have}
            {li.needed > 0 ? ` / ${li.needed}` : ''} · 하루 작업량 {deptOutput(s, d).toFixed(1)}
          </span>
        </div>
        {me && (
          <div className="dpg-order">
            <span className="hf-label">업무</span>
            <EmpOrderSelect e={me} onErr={setMsg} />
            <span className="dpg-desc">{squad(s, me.squadId) ? `${squad(s, me.squadId)!.name} 부서` : '소속 없음'} 기준. 부서 업무는 직원 관리의 부서 탭에서 바꿉니다.</span>
          </div>
        )}
        {showPeople && (
          <div className="dpg-people">
            {members.map((e) => (
              <button key={e.id} className={`dpg-person ${e.id === focusId ? 'on' : ''}`} disabled={!onEmployee} title={onEmployee ? `${e.name} 보기` : e.name} onClick={() => onEmployee?.(e.id)}>
                <PixelAvatar id={e.id} color={dept(d).color} size={26} />
                <span>
                  {e.name}
                  {e.lead ? ' · 팀장' : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {msg && <div className="info dpg-msg">{msg}</div>}
      <div className="dpg-body">
        <DeptWork d={d} setMsg={setMsg} openApp={openApp} />
      </div>
    </div>
  );
}

// 따로 다루는 화면이 있는 특수 업무 부서(A-229): 마케팅(광고)·광고 운영·세일즈(대기업)·인사(위임 채용)·AI연구.
// 개발·디자인 같은 일반 부서 직원은 직원 창에서 "업무" 탭을 빼고 직원 정보만 보여 줌
const SPECIAL_WORK: DeptId[] = ['marketing', 'adops', 'sales', 'hr', 'ai'];
export function hasSpecialWork(d: DeptId): boolean {
  return SPECIAL_WORK.includes(d);
}

function DeptWork({ d, setMsg, openApp }: { d: DeptId; setMsg: (m: string | null) => void; openApp: OpenApp }) {
  const s = useGame();
  switch (d) {
    case 'dev':
    case 'design':
      // A-209: 업무 창 상태 탭의 "지금 만드는 기능"과 같은 카드(.wk .pl 아래 스타일을 그대로 씀)
      return (
        <div className="wk">
          <div className="pl">
            <NowBuilding s={s} v={productView(s)} openSchedule={() => openApp('schedule')} goFeatures={() => openApp('product', 'features')} builders />
          </div>
        </div>
      );
    case 'marketing':
      return <Ads setMsg={setMsg} />;
    case 'adops':
      return <AdSales setMsg={setMsg} inTeam />;
    case 'sales':
      return <Enterprise />;
    case 'hr':
      return <AutoHire />;
    case 'ai':
      return <AiApp />;
    case 'cs':
    case 'infra':
      return <Coverage d={d} openApp={openApp} />;
    default:
      return <div className="empty-note">이 부서는 전용 화면이 없습니다. 업무는 위에서 바꿉니다.</div>;
  }
}

// 고객지원·인프라: 사용자 수만큼 사람이 필요한 부서 — 지금 인원이 감당하는 정도(시장 창 "고객 한 명의 값"에 나오는 값과 같음)
function Coverage({ d, openApp }: { d: 'cs' | 'infra'; openApp: OpenApp }) {
  const s = useGame();
  const c = deptCoverage(s, d);
  const short = c < 0.95;
  return (
    <div className="dpg-cover">
      <div className="hf-label">{d === 'cs' ? '고객 문의 대응 여력' : '서버·운영 대응 여력'}</div>
      <div className="dpg-cover-row">
        <div className={`meter ${c < 0.7 ? 'bad' : short ? 'warnc' : ''}`}>
          <div style={{ width: `${c * 100}%` }} />
        </div>
        <b className={c < 0.7 ? 'fin-bad' : ''}>{Math.round(c * 100)}%</b>
      </div>
      <p className="ew-note">
        {!short
          ? '지금 인원으로 충분합니다. 사용자가 늘면 다시 모자랄 수 있습니다.'
          : d === 'cs'
            ? '모자라면 답변이 늦어져 이탈이 늘어납니다. 고객지원 직원을 더 채용하세요.'
            : '모자라면 장애가 잦아집니다. 인프라 직원을 더 채용하세요.'}
      </p>
      {short && (
        <button className="btn small" onClick={() => openApp('hiring')}>
          채용 탭으로
        </button>
      )}
    </div>
  );
}
