// 화면(A-191): 팀 앱 — 사람이 있는 부서마다 알약 탭, 탭마다 그 부서가 하는 일 페이지(DeptPage).
// 화면(A-213): 따로 있던 팀 앱은 직원 관리 창의 "팀" 탭으로. 왼쪽 부서 줄 + 오른쪽 부서 페이지
// DeptPage는 사무실 직원 창 오른쪽에도 그대로 들어갑니다(왼쪽 직원 정보 + 오른쪽 그 직원 부서의 일, 바로 조작 가능).
// 화면(A-193): 위 띠는 색 바탕·왼쪽 색 줄 없이 밑줄 하나. 직원 창에서 혼자인 팀이면 사람 칩 줄을 뺌
// 화면(A-226): 팀 탭의 부서 페이지에 "부서 안의 팀" 칸 — 팀 만들기·이름 바꾸기·없애기, 팀마다 맡은 일, 사람마다 소속 팀
// 화면(A-233): 왼쪽 줄 맨 아래 "+ 부서 만들기" — 직무·이름·사람을 골라 새 부서(부서 안의 팀)를 만듦. 만든 부서는 그 직무 줄 아래 들여 써 보이고, 누르면 그 부서 페이지
// 부서마다 이미 있는 화면을 그대로 씀: 개발·디자인 = 개발 일정, 마케팅 = 광고 집행, 광고 운영 = 광고 판매, 세일즈 = 대기업 계약, 인사 = 위임 채용, AI연구 = AI 도입
import { useState } from 'react';
import { DEPT_IDS, dept, ordersFor } from '../../core/data';
import { deptInIndustry, deptMembers, deptUnlocked } from '../../core/employees';
import { deptOutput, leadInfo } from '../../core/staff';
import { orderOf } from '../../core/orders';
import { SquadOrderSelect, TeamOrderSelect } from './MessengerApp';
import { createSquad, removeSquad, renameSquad, setSquad, squad, squadChannelId, squadMembers, squadsOf } from '../../core/squads';
import { deptCoverage } from '../../core/market';
import type { DeptId, GameState } from '../../core/types';
import { act, useGame } from '../store';
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

// 팀 탭에 나오는 부서: 열렸고 사람이 있는 곳만
export function teamDepts(s: GameState): DeptId[] {
  return DEPT_IDS.filter((d) => deptUnlocked(s, d) && deptMembers(s, d).length > 0);
}

export function TeamApp({ initial, openApp, onEmployee }: { initial?: string; openApp: OpenApp; onEmployee?: (id: string) => void }) {
  const s = useGame();
  const list = teamDepts(s);
  // 고른 줄: 직무(DeptId) · 만든 부서('sq:id') · 새로 만들기('new')
  const [sel, setSel] = useState<string | null>(initial ?? null);
  const sq = sel?.startsWith('sq:') ? squad(s, sel.slice(3)) : undefined;
  const d = sel && list.includes(sel as DeptId) ? (sel as DeptId) : list[0];
  if (!d)
    return (
      <div className="wk-empty">
        <b>아직 팀이 없습니다</b>
        <span>첫 직원을 뽑으면 부서마다 하는 일을 여기서 보고 바꿉니다.</span>
        <button className="btn small" data-testid="team-open-hiring" onClick={() => openApp('hiring')}>
          채용 탭으로
        </button>
      </div>
    );
  // A-213: 부서 알약 탭 대신 시장 창처럼 왼쪽 부서 줄 + 오른쪽 고른 부서 페이지
  return (
    <div className="em3-split">
      <nav className="em3-list">
        {list.map((x) => (
          <div key={x} className="em3-group">
            <button className={`em3-row dept ${!sq && sel !== 'new' && x === d ? 'on' : ''}`} data-testid={`tab-dept-${x}`} style={{ ['--dc' as string]: dept(x).color }} onClick={() => setSel(x)}>
              <i className="em3-dot" />
              <b>{dept(x).name}</b>
              <span className="em3-sat">{deptMembers(s, x).length}명</span>
            </button>
            {squadsOf(s, x).map((q) => (
              <button key={q.id} className={`em3-row dept sub ${sq?.id === q.id ? 'on' : ''}`} data-testid={`tab-squad-${q.id}`} style={{ ['--dc' as string]: dept(x).color }} onClick={() => setSel(`sq:${q.id}`)}>
                <b>{q.name}</b>
                <span className="em3-sat">{squadMembers(s, q.id).length}명</span>
              </button>
            ))}
          </div>
        ))}
        <button className={`em3-row dept add ${sel === 'new' ? 'on' : ''}`} data-testid="dept-new" onClick={() => setSel('new')}>
          <b>+ 부서 만들기</b>
        </button>
      </nav>
      <section className="em3-detail">
        {sel === 'new' ? (
          <NewSquad onDone={(id) => setSel(`sq:${id}`)} />
        ) : sq ? (
          <SquadPage id={sq.id} openApp={openApp} onDeleted={() => setSel(sq.dept)} />
        ) : (
          <DeptPage d={d} openApp={openApp} onEmployee={onEmployee} />
        )}
      </section>
    </div>
  );
}

// 부서 한 곳의 페이지: 위 띠(팀 이름·사람·맡은 일 지시) + 아래 그 부서가 하는 일 화면
export function DeptPage({ d, openApp, focusId, onEmployee }: { d: DeptId; openApp: OpenApp; focusId?: string; onEmployee?: (id: string) => void }) {
  const s = useGame();
  const [msg, setMsg] = useState<string | null>(null);
  const members = deptMembers(s, d);
  const li = leadInfo(s, d);
  const orders = ordersFor(d);
  const cur = orders.find((o) => o.id === orderOf(s, d));
  // 직원 창 왼쪽에 이미 그 사람이 있으니, 혼자인 팀이면 사람 칩 줄을 빼서 같은 이름이 두 번 나오지 않게(A-193)
  const showPeople = !focusId || members.length > 1;
  return (
    <div className="dpg" style={{ ['--dc' as string]: dept(d).color }} data-testid={`dept-page-${d}`}>
      <div className="dpg-head">
        <div className="dpg-title">
          <span className="dpg-dot" />
          <b>{dept(d).name}팀</b>
          <span className="dpg-meta">
            {members.length}명 · 팀장 {li.have}
            {li.needed > 0 ? ` / ${li.needed}` : ''} · 하루 작업량 {deptOutput(s, d).toFixed(1)}
          </span>
        </div>
        {orders.length > 0 && (
          <div className="dpg-order">
            <span className="hf-label">맡은 일</span>
            <span className="dpg-pick">
              <TeamOrderSelect d={d} testId={`dept-order-${d}`} onErr={setMsg} />
            </span>
            {cur && <span className="dpg-desc">{cur.desc}</span>}
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
      {!focusId && <SquadPanel d={d} setMsg={setMsg} />}
      {msg && <div className="info dpg-msg">{msg}</div>}
      <div className="dpg-body">
        <DeptWork d={d} setMsg={setMsg} openApp={openApp} />
      </div>
    </div>
  );
}

// 새 부서 만들기(A-233): 직무를 고르고 이름을 붙인 뒤, 그 직무 직원 중 넣을 사람을 고름
function NewSquad({ onDone }: { onDone: (id: string) => void }) {
  const s = useGame();
  const jobs = DEPT_IDS.filter((x) => deptInIndustry(s, x) && deptUnlocked(s, x));
  const [d, setD] = useState<DeptId>(jobs.find((x) => deptMembers(s, x).length > 0) ?? jobs[0]);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const people = deptMembers(s, d);
  const make = () => {
    const r = act((g) => {
      const id = createSquad(g, d, name);
      if (typeof id === 'string') for (const e of picked) setSquad(g, e, id);
      return id;
    });
    if (!r) return;
    if (typeof r === 'object') return setErr(r.err);
    onDone(r);
  };
  return (
    <form
      className="dpg dpg-new"
      data-testid="dept-new-form"
      style={{ ['--dc' as string]: dept(d).color }}
      onSubmit={(ev) => {
        ev.preventDefault();
        make();
      }}
    >
      <div className="dpg-head">
        <div className="dpg-title">
          <span className="dpg-dot" />
          <b>새 부서 만들기</b>
          <span className="dpg-meta">부서마다 채팅방이 생기고, 버그 수정·외주·기능 개발 같은 일을 따로 맡길 수 있습니다.</span>
        </div>
      </div>
      <label className="dpg-field">
        <span className="hf-label">직무</span>
        <select data-testid="dept-new-job" value={d} onChange={(ev) => (setD(ev.target.value as DeptId), setPicked([]))}>
          {jobs.map((x) => (
            <option key={x} value={x}>
              {dept(x).name}
            </option>
          ))}
        </select>
      </label>
      <label className="dpg-field">
        <span className="hf-label">이름</span>
        <input data-testid="dept-new-name" value={name} maxLength={12} placeholder="예: 결제 개발부" onChange={(ev) => setName(ev.target.value)} />
      </label>
      <div className="dpg-field">
        <span className="hf-label">사람</span>
        {people.length === 0 ? (
          <span className="empty-note">아직 {dept(d).name} 직원이 없습니다. 사람은 나중에 넣어도 됩니다.</span>
        ) : (
          <div className="dpg-people">
            {people.map((e) => {
              const on = picked.includes(e.id);
              const other = squad(s, e.squadId);
              return (
                <button key={e.id} type="button" className={`dpg-person ${on ? 'on' : ''}`} aria-pressed={on} title={other ? `지금 ${other.name}` : undefined} onClick={() => setPicked(on ? picked.filter((x) => x !== e.id) : [...picked, e.id])}>
                  <PixelAvatar id={e.id} color={dept(d).color} size={26} />
                  <span>
                    {e.name}
                    {other ? ` · ${other.name}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        )}
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

// 만든 부서 한 곳의 페이지(A-233): 이름·맡은 일·사람 넣고 빼기·채팅방·없애기, 아래는 그 직무가 하는 일 화면
function SquadPage({ id, openApp, onDeleted }: { id: string; openApp: OpenApp; onDeleted: () => void }) {
  const s = useGame();
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const q = squad(s, id);
  if (!q) return null;
  const members = squadMembers(s, id);
  return (
    <div className="dpg" style={{ ['--dc' as string]: dept(q.dept).color }} data-testid={`squad-page-${id}`}>
      <div className="dpg-head">
        <div className="dpg-title">
          <span className="dpg-dot" />
          {editing !== null ? (
            <form
              className="dpg-sq-new"
              onSubmit={(ev) => {
                ev.preventDefault();
                const err = act((g) => renameSquad(g, id, editing)) ?? null;
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
          <span className="dpg-meta">
            {dept(q.dept).name} · {members.length}명
          </span>
          <span className="dpg-sq-tools">
            <button className="btn small ghost" onClick={() => openApp('messenger', squadChannelId(id))}>
              채팅방
            </button>
            <button
              className="btn small ghost"
              data-testid={`squad-remove-${id}`}
              title="사람은 직무 바로 아래로 돌아가고 채팅방은 닫힙니다"
              onClick={() => {
                act((g) => removeSquad(g, id));
                onDeleted();
              }}
            >
              부서 없애기
            </button>
          </span>
        </div>
        <div className="dpg-order">
          <span className="hf-label">맡은 일</span>
          <SquadOrderSelect squadId={id} onErr={setMsg} />
          <span className="dpg-desc">일을 정하지 않으면 {dept(q.dept).name} 전체 일을 따릅니다.</span>
        </div>
        <div className="dpg-people">
          {deptMembers(s, q.dept).map((e) => {
            const on = e.squadId === id;
            const other = !on ? squad(s, e.squadId) : undefined;
            return (
              <button key={e.id} className={`dpg-person ${on ? 'on' : ''}`} aria-pressed={on} title={on ? '누르면 이 부서에서 뺍니다' : other ? `지금 ${other.name} · 누르면 이 부서로` : '누르면 이 부서에 넣습니다'} onClick={() => setMsg(act((g) => setSquad(g, e.id, on ? null : id)) ?? null)}>
                <PixelAvatar id={e.id} color={dept(q.dept).color} size={26} />
                <span>
                  {e.name}
                  {other ? ` · ${other.name}` : ''}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {msg && <div className="info dpg-msg">{msg}</div>}
      <div className="dpg-body">
        <DeptWork d={q.dept} setMsg={setMsg} openApp={openApp} />
      </div>
    </div>
  );
}

// 부서 안의 팀(A-226): 팀을 나누면 팀마다 메신저 채널이 생기고, 버그 수정·외주·기능 개발 같은 일을 팀별로 맡김
function SquadPanel({ d, setMsg }: { d: DeptId; setMsg: (m: string | null) => void }) {
  const s = useGame();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const squads = squadsOf(s, d);
  const members = deptMembers(s, d);
  const add = () => {
    const r = act((g) => createSquad(g, d, name));
    if (typeof r === 'object') return setMsg(r.err);
    setName('');
    setMsg(null);
  };
  const rename = () => {
    if (!editing) return;
    const err = act((g) => renameSquad(g, editing.id, editing.name)) ?? null;
    setMsg(err);
    if (!err) setEditing(null);
  };
  return (
    <div className="dpg-squads" data-testid={`squads-${d}`}>
      <div className="dpg-sq-head">
        <span className="hf-label">부서 안의 팀</span>
        <form
          className="dpg-sq-new"
          onSubmit={(ev) => {
            ev.preventDefault();
            add();
          }}
        >
          <input data-testid={`squad-name-${d}`} value={name} maxLength={12} placeholder="새 팀 이름 (예: 결제팀)" onChange={(ev) => setName(ev.target.value)} />
          <button className="btn small" data-testid={`squad-add-${d}`} type="submit" disabled={!name.trim()}>
            팀 만들기
          </button>
        </form>
      </div>
      {squads.length === 0 ? (
        <p className="empty-note">팀을 나누면 팀마다 채팅방이 생기고, 버그 수정·외주·기능 개발 같은 일을 팀별로 맡길 수 있습니다.</p>
      ) : (
        <>
          <div className="dpg-sq-list">
            {squads.map((q) => (
              <div key={q.id} className="dpg-sq" data-testid={`squad-${q.id}`}>
                {editing?.id === q.id ? (
                  <form
                    className="dpg-sq-new"
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      rename();
                    }}
                  >
                    <input autoFocus value={editing.name} maxLength={12} onChange={(ev) => setEditing({ id: q.id, name: ev.target.value })} />
                    <button className="btn small" type="submit">
                      저장
                    </button>
                    <button className="btn small ghost" type="button" onClick={() => setEditing(null)}>
                      취소
                    </button>
                  </form>
                ) : (
                  <button className="dpg-sq-name" title="이름 바꾸기" onClick={() => setEditing({ id: q.id, name: q.name })}>
                    <b>{q.name}</b>
                    <span>{squadMembers(s, q.id).length}명</span>
                  </button>
                )}
                <SquadOrderSelect squadId={q.id} onErr={setMsg} />
                <button className="btn small ghost" data-testid={`squad-remove-${q.id}`} title="팀원은 부서 바로 아래로 돌아가고 팀 채팅방은 닫힙니다" onClick={() => setMsg(act((g) => removeSquad(g, q.id)) ?? null)}>
                  팀 없애기
                </button>
              </div>
            ))}
          </div>
          <div className="dpg-sq-people">
            {members.map((e) => (
              <label key={e.id} className="dpg-sq-person">
                <PixelAvatar id={e.id} color={dept(d).color} size={20} />
                <span>{e.name}</span>
                <select data-testid={`emp-squad-${e.id}`} value={e.squadId ?? ''} onChange={(ev) => setMsg(act((g) => setSquad(g, e.id, ev.target.value || null)) ?? null)}>
                  <option value="">팀 없음</option>
                  {squads.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </>
      )}
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
      return <div className="empty-note">이 팀은 따로 보는 화면이 없습니다. 위에서 맡은 일을 바꿉니다.</div>;
  }
}

// 고객지원·인프라: 사용자 수만큼 사람이 필요한 부서 — 지금 인원이 감당하는 정도(시장 창 "고객 한 명의 값"에 나오는 값과 같음)
function Coverage({ d, openApp }: { d: 'cs' | 'infra'; openApp: OpenApp }) {
  const s = useGame();
  const c = deptCoverage(s, d);
  const short = c < 0.95;
  return (
    <div className="dpg-cover">
      <div className="hf-label">{d === 'cs' ? '고객 문의를 감당하는 정도' : '서버·운영을 감당하는 정도'}</div>
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
            ? '모자라면 답이 늦어져 떠나는 고객이 늘어납니다. 고객지원 직원을 더 뽑으세요.'
            : '모자라면 장애가 잦아집니다. 인프라 직원을 더 뽑으세요.'}
      </p>
      {short && (
        <button className="btn small" onClick={() => openApp('hiring')}>
          채용 탭으로
        </button>
      )}
    </div>
  );
}
