// F05 직원·조직 앱: EM-01 목록과 상세(만족도·건강·숙련·특성), EM-02 부서 배치, EM-04 퇴사·해고, 팀장, 부서 지시(MG-03),
// WF-01~04 복지와 근무 방침, 연봉 인상, EQ-04 스톡옵션 지급
// 화면(A-179): 커리어·업무와 같은 톤 — 알약 탭, 칸칸이 차는 막대, 작은 라벨은 픽셀 글꼴. 긴 설명은 title로
// 화면(A-213): 채용(HireTab)·팀(TeamApp)·AI 도입(AiApp)을 이 창의 탭으로 합침. 직원 탭은 왼쪽 줄 + 오른쪽 한 명(시장 창 짜임)
import { burningActive, burningBlock, burningCost, startBurning } from '../../core/burning';
import { useState } from 'react';
import { DATA, DEPT_IDS, dept, trait } from '../../core/data';
import { formatDate } from '../../core/calendar';
import { deptInIndustry, deptUnlocked, moveDept, severance } from '../../core/employees';
import { monthlySalary, payrollWithBenefits } from '../../core/finance';
import { bonusBlock, bonusCost, demoteLead, fire, giveBonus, giveRaise, healthTarget, isSick, marketSalary, output, promoteLead, satTarget, employeeSpeed } from '../../core/staff';
import { esopEntry, esopFree, grantOptions, unvestedOptions, vestedFraction } from '../../core/equity';
import { act, useGame } from '../store';
import { Tabs } from '../common';
import { PixelAvatar } from '../office/Avatar';
import { wonShort } from '../../core/format';
import type { DeptId, Employee, GameState, WorkPolicy } from '../../core/types';
import './apps.css';
import { EmpOrderSelect } from './MessengerApp';
import { HireTab } from './HiringApp';
import { TeamApp, type OpenApp } from './TeamApp';
import { AiApp } from './AiApp';
import { PixelCheck } from '../pixelMarks';
import './skin/EmployeesApp.css';

function meterCls(v: number) {
  return v < 35 ? 'bad' : v < 55 ? 'warnc' : '';
}

export function Meter({ v, label }: { v: number; label: string }) {
  return (
    <div className="col" style={{ gap: 2 }}>
      <div className="row tiny">
        <span className="muted grow">{label}</span>
        <b>{Math.round(v)}</b>
      </div>
      <div className={`meter ${meterCls(v)}`}>
        <div style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export function EmployeeDetail({ e, openDm, compact }: { e: Employee; openDm?: (id: string) => void; compact?: boolean }) {
  const s = useGame();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirmFire, setConfirmFire] = useState(false);
  const st = satTarget(s, e);
  const kind = e.kind === 'cofounder' ? '코파운더' : e.kind === 'engineer' ? '파운딩 엔지니어' : '직원';
  const ms = marketSalary(s, e.dept, e.grade);
  const run = (fn: (g: GameState) => string | null, ok: string) => {
    const err = act(fn);
    setMsg(err ? { text: err, ok: false } : { text: ok, ok: true });
  };
  return (
    <div className="col emd" data-testid="emp-detail">
      <div className="emd-meta">
        {kind} · {dept(e.dept).name}팀{e.lead ? ' 팀장' : ''} · 입사 {formatDate(e.joinedDay)} · 경력 {e.years}년
      </div>
      {(e.traits.length > 0 || isSick(s, e) || e.leaving !== null) && (
        <div className="emd-chips" title={e.traits.map((t) => `${trait(t)?.name}: ${trait(t)?.desc}`).join('\n')}>
          {e.traits.map((t) => (
            <span key={t} className="chip amber" title={trait(t)?.desc}>
              {trait(t)?.name}
            </span>
          ))}
          {isSick(s, e) && <span className="chip red">병가 ~{formatDate(e.sickUntil!)}</span>}
          {e.leaving !== null && <span className="chip red">퇴사 예정 {formatDate(e.leaving)}</span>}
        </div>
      )}
      <div className="emd-meters">
        <Meter v={e.sat} label={`만족도 (목표 ${Math.round(st.value)})`} />
        <Meter v={e.health} label={`건강 (목표 ${Math.round(healthTarget(s, e))})`} />
        <Meter v={e.skill} label="숙련" />
      </div>
      {!compact && (
        <div className="emd-why">
          만족도 목표: {st.parts.map((p) => `${p.label} ${p.v >= 0 ? '+' : ''}${Math.round(p.v)}`).join(' · ')}
        </div>
      )}
      <div className="emd-stats">
        <div>
          <span>하루 작업량</span>
          <b>{output(s, e).toFixed(2)}</b>
        </div>
        <div>
          <span>속도</span>
          <b>{employeeSpeed(e)}%</b>
        </div>
        <div>
          <span>월급</span>
          <b>{e.salary.toLocaleString('ko-KR')}원</b>
        </div>
        <div>
          <span>시장 월급</span>
          <b>{Math.round(ms / 1e4).toLocaleString('ko-KR')}만원</b>
        </div>
      </div>
      {e.options > 0 && (
        <div className="emd-line">
          스톡옵션 <b>{e.options.toLocaleString('ko-KR')}주</b> · 베스팅 {Math.round(vestedFraction(s, e) * 100)}% (미베스팅 {unvestedOptions(s, e).toLocaleString('ko-KR')}주)
        </div>
      )}
      {!compact && (
        <>
          <label className="emd-field">
            <span>맡은 일</span>
            <EmpOrderSelect e={e} onErr={(m) => m && setMsg({ text: m, ok: false })} />
          </label>
          <label className="emd-field">
            <span>부서 이동</span>
            <select
              data-testid="move-dept"
              value={e.dept}
              onChange={(ev) => run((g) => moveDept(g, e.id, ev.target.value as DeptId), `${e.name}님을 옮겼습니다. 좌석은 다음 날 옮기고, 새 직무라 숙련이 조금 줄어듭니다.`)}
            >
              {DEPT_IDS.filter((d) => deptInIndustry(s, d)).map((d) => (
                <option key={d} value={d} disabled={!deptUnlocked(s, d)}>
                  {dept(d).name}
                </option>
              ))}
            </select>
          </label>
          <div className="emd-acts">
            {!e.lead ? (
              <button className="btn small" data-testid="promote" onClick={() => run((g) => promoteLead(g, e.id), '팀장이 되었습니다(월급 15% 인상).')}>
                팀장 세우기
              </button>
            ) : (
              <button className="btn small ghost" onClick={() => run((g) => demoteLead(g, e.id), '팀장에서 내렸습니다.')}>
                팀장 해제
              </button>
            )}
            <button className="btn small ghost" data-testid="raise" onClick={() => run((g) => giveRaise(g, e.id, 0.1), '월급을 10% 올렸습니다.')}>
              연봉 10% 인상
            </button>
            <button className="btn small ghost" data-testid="bonus" disabled={!!bonusBlock(s, e)} title={bonusBlock(s, e) ?? '월급 한 달치를 보너스로 줍니다. 만족도가 가득 차지만, 처우가 그대로면 차츰 원래대로 돌아옵니다.'} onClick={() => run((g) => giveBonus(g, e.id), '보너스를 줬습니다. 만족도가 가득 찼습니다.')}>
              보너스 {Math.round(bonusCost(e) / 1e4).toLocaleString('ko-KR')}만원
            </button>
            {esopEntry(s) && (
              <button className="btn small ghost" data-testid="grant" onClick={() => run((g) => grantOptions(g, e, Math.min(esopFree(g), Math.round(esopEntry(g)!.shares * (e.grade === 'S' ? 0.06 : e.grade === 'A' ? 0.04 : 0.02)))), '스톡옵션을 줬습니다(베스팅 2년 20%, 3년 40%, 4년 80%, 5년 100%).')}>
                스톡옵션 주기
              </button>
            )}
            {openDm && (
              <button className="btn small ghost" onClick={() => openDm(e.id)}>
                DM
              </button>
            )}
            {e.kind !== 'cofounder' &&
              (!confirmFire ? (
                <button className="btn small red" onClick={() => setConfirmFire(true)}>
                  해고
                </button>
              ) : (
                <span className="emd-fire">
                  <span>위로금 {Math.round(severance(e) / 1e4).toLocaleString('ko-KR')}만원, 팀 분위기 하락</span>
                  <button className="btn small red" data-testid="fire-confirm" onClick={() => run((g) => fire(g, e.id), '해고했습니다.')}>
                    확정
                  </button>
                  <button className="btn small ghost" onClick={() => setConfirmFire(false)}>
                    취소
                  </button>
                </span>
              ))}
          </div>
        </>
      )}
      {msg && <div className={`emd-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
    </div>
  );
}

// 화면(A-213): 채용·팀·AI 도입 앱을 직원 관리 한 창의 탭으로. 위 큰 인원수·요약 칸은 빼고 알약 탭부터.
// initial = 다른 창·알림이 연 탭('hire', 'team', 'team-dev', 'ai', 'welfare'). 예전 앱 id는 Desktop의 appRoute가 여기로 보냄
type EmpTab = 'people' | 'hire' | 'team' | 'welfare' | 'ai';

// 인자 없이 열었을 때 처음 보이는 탭
function defaultTab(s: GameState): EmpTab {
  // TODO(human)
  return 'people';
}

export function EmployeesApp({ openDm, initial, openApp }: { openDm: (id: string) => void; initial?: string; openApp: OpenApp }) {
  const s = useGame();
  const [tab, setTab] = useState<EmpTab>(() => (initial ? (initial.split('-')[0] as EmpTab) : defaultTab(s)));
  const [sel, setSel] = useState<string | null>(null);
  const waiting = s.applicants.filter((a) => a.status === 'waiting').length;
  return (
    <div className="col emp em2 em3">
      <Tabs
        tabs={[
          { id: 'people', label: `직원 ${s.employees.length}` },
          { id: 'hire', label: waiting ? `채용 · 지원자 ${waiting}` : '채용' },
          { id: 'team', label: '팀' },
          { id: 'welfare', label: '복지·근무' },
          ...(s.company.stage >= 1 ? [{ id: 'ai' as const, label: 'AI 도입' }] : []),
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'people' && <People openDm={openDm} sel={sel} setSel={setSel} goHire={() => setTab('hire')} />}
      {tab === 'hire' && <HireTab />}
      {tab === 'team' && (
        <TeamApp
          initial={initial?.startsWith('team-') ? initial.slice(5) : undefined}
          openApp={openApp}
          onEmployee={(id) => {
            setSel(id);
            setTab('people');
          }}
        />
      )}
      {tab === 'welfare' && <Welfare />}
      {tab === 'ai' && <AiApp />}
    </div>
  );
}

// 직원 탭: 시장 창처럼 왼쪽 부서별 짧은 줄(얼굴·이름·만족도) + 오른쪽 고른 한 명. 고르지 않았으면 맨 위 사람
function People({ openDm, sel, setSel, goHire }: { openDm: (id: string) => void; sel: string | null; setSel: (id: string) => void; goHire: () => void }) {
  const s = useGame();
  const n = s.employees.length;
  if (!n)
    return (
      <div className="wk-empty">
        <b>아직 직원이 없습니다</b>
        <span>채용 탭에서 공고를 올려 첫 직원을 뽑으세요.</span>
        <button className="btn small" onClick={goHire}>
          채용 탭으로
        </button>
      </div>
    );
  const groups = DEPT_IDS.map((d) => ({ d, list: s.employees.filter((x) => x.dept === d).sort((a, b) => Number(b.lead) - Number(a.lead)) })).filter((g) => g.list.length);
  const e = s.employees.find((x) => x.id === sel) ?? groups[0].list[0];
  return (
    <div className="em3-split">
      <nav className="em3-list">
        <div className="em3-total" title="4대보험·퇴직연금 회사 부담 포함">
          <b data-testid="emp-total">{n}명</b>
          <span>한 달 월급 {wonShort(payrollWithBenefits(monthlySalary(s)).total)}</span>
        </div>
        {groups.map(({ d, list }) => (
          <div key={d} className="em3-group" style={{ ['--dc' as string]: dept(d).color }}>
            <div className="em3-gname">
              <i />
              {dept(d).name}
              <em>{list.length}</em>
            </div>
            {list.map((x) => (
              <button key={x.id} className={`em3-row ${x.id === e.id ? 'on' : ''}`} data-testid={`emp-row-${x.id}`} onClick={() => setSel(x.id)}>
                <PixelAvatar id={x.id} color={dept(x.dept).color} size={26} />
                <b>{x.name}</b>
                {x.lead && <span className="em3-tag">팀장</span>}
                {isSick(s, x) ? <span className="chip red">병가</span> : x.leaving !== null && <span className="chip red">퇴사 예정</span>}
                <span className={`em3-sat ${x.sat < 35 ? 'fin-bad' : ''}`} title="만족도">
                  {Math.round(x.sat)}
                </span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <section className="em3-detail" style={{ ['--dc' as string]: dept(e.dept).color }}>
        <div className="em3-title">
          <PixelAvatar id={e.id} color={dept(e.dept).color} size={44} />
          <h3>{e.name}</h3>
        </div>
        <EmployeeDetail key={e.id} e={e} openDm={openDm} />
      </section>
    </div>
  );
}

// 버닝(A-131): 작은 보너스를 주고 며칠 동안 빠르게. 끝나면 지치고 한동안 다시 못 함
const BURN_HELP = '전 직원에게 작은 보너스를 주고 며칠 동안 일을 몰아서 빨리 진행합니다. 끝나면 팀이 며칠 지치고, 한동안 다시 할 수 없습니다.';
function Burning() {
  const s = useGame();
  const [err, setErr] = useState<string | null>(null);
  const on = burningActive(s);
  const block = burningBlock(s);
  const b = s.company.burning;
  return (
    <div className="hf-field" data-testid="burning">
      <div className="hf-label" title={BURN_HELP}>
        버닝
      </div>
      {on && b ? (
        <div className="burn-on">버닝 중 · {b.until - s.day}일 남음</div>
      ) : (
        <button className="btn small" data-testid="burning-start" disabled={!!block} title={block ?? BURN_HELP} onClick={() => setErr(act((g) => startBurning(g)) ?? null)}>
          버닝 시작 · 보너스 {wonShort(burningCost(s))}
        </button>
      )}
      <div className="ew-note" title={BURN_HELP}>
        {block && !on ? block : '며칠 동안 빨라지고, 끝나면 팀이 지칩니다.'}
      </div>
      {err && <div className="err">{err}</div>}
    </div>
  );
}

// 복지·근무: 채용 짜임처럼 왼쪽 복지 타일(누르면 켜고 끔), 오른쪽 회색 판(근무 방침 · 연봉 인상률). 돈 액수·수치 효과는 보여 주지 않음
function Welfare() {
  const s = useGame();
  const policy = DATA.welfare.workPolicies.find((p) => p.id === s.company.workPolicy)!;
  return (
    <div className="em2-wf">
      <section className="em2-wf-list">
        <div className="em2-sect">
          복지 <em>{s.company.welfare.length}개 켜짐</em>
        </div>
        <div className="emp-welfare-grid">
          {DATA.welfare.items.map((w) => {
            const on = s.company.welfare.includes(w.id);
            return (
              <button
                key={w.id}
                className={`emp-welfare ${on ? 'on' : ''}`}
                data-testid={`welfare-${w.id}`}
                aria-pressed={on}
                onClick={() => act((g) => (g.company.welfare = on ? g.company.welfare.filter((x) => x !== w.id) : [...g.company.welfare, w.id]))}
              >
                <span className="ew-check" aria-hidden>
                  {on && <PixelCheck />}
                </span>
                <b>{w.name}</b>
                <span className="ew-desc" title={w.desc}>
                  {w.desc}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="em2-wf-side">
        <div className="em2-sect">일하는 방식</div>
        <div className="hf-field">
          <div className="hf-label">근무 방침</div>
          <div className="seg">
            {DATA.welfare.workPolicies.map((p) => (
              <button key={p.id} className={s.company.workPolicy === p.id ? 'on' : ''} data-testid={`policy-${p.id}`} onClick={() => act((g) => (g.company.workPolicy = p.id as WorkPolicy))}>
                {p.name}
              </button>
            ))}
          </div>
          <div className="ew-note">
            {policy.desc}
            {policy.id === 'crunch' ? ' 버그와 기술 부채도 늘어납니다. 대표와 팀이 밤늦게까지 사무실에 남습니다.' : ''}
          </div>
        </div>
        <div className="hf-field">
          <div className="hf-label" title="다른 회사 월급은 해마다 조금씩 오릅니다. 안 올리면 만족도가 서서히 떨어집니다.">
            매년 1월 연봉 인상
          </div>
          <div className="seg">
            {[0, 0.03, 0.05, 0.08].map((r) => (
              <button key={r} className={s.company.raiseRate === r ? 'on' : ''} onClick={() => act((g) => (g.company.raiseRate = r))}>
                {r ? `${r * 100}%` : '안 올림'}
              </button>
            ))}
          </div>
          <div className="ew-note" title="다른 회사 월급은 해마다 조금씩 오릅니다.">
            안 올리면 만족도가 서서히 떨어집니다.
          </div>
        </div>
        <Burning />
      </section>
    </div>
  );
}
