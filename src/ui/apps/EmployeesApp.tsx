// F05 직원·조직 앱: EM-01 목록과 상세(만족도·건강·숙련·특성), EM-02 부서 배치, EM-04 퇴사·해고, 팀장, 부서 지시(MG-03),
// WF-01~04 복지와 근무 방침, 연봉 인상, EQ-04 스톡옵션 지급
import { useState } from 'react';
import { DATA, DEPT_IDS, dept, ordersFor, trait } from '../../core/data';
import { formatDate } from '../../core/calendar';
import { deptMembers, deptUnlocked, headcountByDept, moveDept, severance } from '../../core/employees';
import { monthlySalary, payrollWithBenefits, welfareMonthly } from '../../core/finance';
import { avgHealth, avgSat, deptOutput, demoteLead, fire, giveRaise, healthTarget, isSick, leadInfo, marketSalary, output, promoteLead, satTarget, employeeSpeed } from '../../core/staff';
import { esopEntry, esopFree, grantOptions, unvestedOptions, vestedFraction } from '../../core/equity';
import { orderOf } from '../../core/orders';
import { commandOrder } from '../../core/reactions';
import { act, useGame } from '../store';
import { Tabs } from '../common';
import { PixelAvatar } from '../office/Avatar';
import { wonShort } from '../../core/format';
import type { DeptId, Employee, GameState, WorkPolicy } from '../../core/types';
import './apps.css';

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
    <div className="col" data-testid="emp-detail">
      <div className="tiny muted">
        {kind} · {dept(e.dept).name}팀{e.lead ? ' 팀장' : ''} · 입사 {formatDate(e.joinedDay)} · 경력 {e.years}년 · 속도 {employeeSpeed(e)}%
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
        {e.traits.map((t) => (
          <span key={t} className="chip amber" title={trait(t)?.desc}>
            {trait(t)?.name}
          </span>
        ))}
        {isSick(s, e) && <span className="chip red">병가 ~{formatDate(e.sickUntil!)}</span>}
        {e.leaving !== null && <span className="chip red">퇴사 예정 {formatDate(e.leaving)}</span>}
      </div>
      <div className="tiny">{e.traits.map((t) => `${trait(t)?.name}: ${trait(t)?.desc}`).join(' ')}</div>
      <Meter v={e.sat} label={`만족도 (목표 ${Math.round(st.value)})`} />
      <Meter v={e.health} label={`건강 (목표 ${Math.round(healthTarget(s, e))})`} />
      <Meter v={e.skill} label="숙련" />
      <div className="tiny">
        하루 작업량 <b>{output(s, e).toFixed(2)}</b> · 월급 {e.salary.toLocaleString('ko-KR')}원 (시장 {Math.round(ms / 1e4).toLocaleString('ko-KR')}만원)
      </div>
      {!compact && (
        <div className="tiny muted">
          만족도 목표: {st.parts.map((p) => `${p.label} ${p.v >= 0 ? '+' : ''}${Math.round(p.v)}`).join(' · ')}
        </div>
      )}
      {e.options > 0 && (
        <div className="tiny">
          스톡옵션 {e.options.toLocaleString('ko-KR')}주 · 베스팅 {Math.round(vestedFraction(s, e) * 100)}% (미베스팅 {unvestedOptions(s, e).toLocaleString('ko-KR')}주)
        </div>
      )}
      {!compact && (
        <>
          <label className="tiny row">
            부서 이동
            <select
              data-testid="move-dept"
              value={e.dept}
              onChange={(ev) => run((g) => moveDept(g, e.id, ev.target.value as DeptId), `${e.name}님을 옮겼습니다. 좌석은 다음 날 옮기고, 새 직무라 숙련이 조금 줄어듭니다.`)}
            >
              {DEPT_IDS.map((d) => (
                <option key={d} value={d} disabled={!deptUnlocked(s, d)}>
                  {dept(d).name}
                </option>
              ))}
            </select>
          </label>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
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
                <span className="row">
                  <span className="tiny">위로금 {Math.round(severance(e) / 1e4).toLocaleString('ko-KR')}만원, 팀 분위기 하락</span>
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
      {msg && <div className={`tiny ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
    </div>
  );
}

export function EmployeesApp({ openDm }: { openDm: (id: string) => void }) {
  const s = useGame();
  const [tab, setTab] = useState<'people' | 'depts' | 'welfare'>('people');
  const [sort, setSort] = useState<'dept' | 'sat' | 'salary' | 'skill'>('dept');
  const [filter, setFilter] = useState<DeptId | 'all'>('all');
  const [sel, setSel] = useState<string | null>(null);
  const pay = payrollWithBenefits(monthlySalary(s));
  const counts = headcountByDept(s);
  const list = s.employees
    .filter((e) => filter === 'all' || e.dept === filter)
    .slice()
    .sort((a, b) => (sort === 'salary' ? b.salary - a.salary : sort === 'sat' ? a.sat - b.sat : sort === 'skill' ? b.skill - a.skill : a.dept.localeCompare(b.dept) || Number(b.lead) - Number(a.lead)));
  const e = s.employees.find((x) => x.id === sel);
  const n = s.employees.length;

  return (
    <div className="col emp">
      {/* 위 요약 줄: 채용 공고 요약 줄처럼 이름·숫자만 */}
      <div className="emp-top">
        <div className="hf-sum">
          <span>직원</span>
          <b data-testid="emp-total">{n}명</b>
        </div>
        <div className="hf-sum" title="4대보험·퇴직연금 회사 부담 포함">
          <span>한 달 월급</span>
          <b>{wonShort(pay.total)}</b>
        </div>
        <div className="hf-sum">
          <span>한 달 복지비</span>
          <b>{wonShort(welfareMonthly(s))}</b>
        </div>
        <div className="hf-sum">
          <span>평균 만족</span>
          <b className={n && avgSat(s) < 40 ? 'fin-bad' : ''}>{n ? Math.round(avgSat(s)) : '-'}</b>
        </div>
        <div className="hf-sum">
          <span>평균 건강</span>
          <b className={n && avgHealth(s) < 40 ? 'fin-bad' : ''}>{n ? Math.round(avgHealth(s)) : '-'}</b>
        </div>
        <div className="hf-sum" title="이 회사에서 지금까지">
          <span>나간 사람 · 뽑은 사람</span>
          <b>
            {s.stats.quits + s.stats.fired} · {s.stats.hires}
          </b>
        </div>
      </div>
      <Tabs
        tabs={[
          { id: 'people', label: `직원 (${n})` },
          { id: 'depts', label: '부서·지시' },
          { id: 'welfare', label: '복지·근무' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'people' &&
        (n === 0 ? (
          <div className="empty-note">아직 직원이 없습니다. 채용 메뉴에서 공고를 올려 직원을 뽑으세요.</div>
        ) : (
          <>
            <div className="row emp-tools">
              <div className="seg applicant-filter">
                <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
                  전체 {n}
                </button>
                {DEPT_IDS.filter((d) => counts[d] > 0).map((d) => (
                  <button key={d} className={filter === d ? 'on' : ''} onClick={() => setFilter(d)}>
                    {dept(d).name} {counts[d]}
                  </button>
                ))}
              </div>
              <span className="grow" />
              <select value={sort} onChange={(ev) => setSort(ev.target.value as typeof sort)} aria-label="정렬">
                <option value="dept">부서 순</option>
                <option value="sat">만족도 낮은 순</option>
                <option value="skill">숙련 높은 순</option>
                <option value="salary">월급 높은 순</option>
              </select>
            </div>
            <div className="emp-layout">
              <div className="applicant-grid emp-grid">
                {list.map((x) => (
                  <button key={x.id} className={`applicant-card emp-card ${x.id === sel ? 'on' : ''}`} data-testid={`emp-row-${x.id}`} style={{ ['--dc' as string]: dept(x.dept).color }} onClick={() => setSel(x.id)}>
                    <div className="ac-head">
                      <PixelAvatar id={x.id} color={dept(x.dept).color} size={40} />
                      <div className="ac-id">
                        <b>{x.name}</b>
                        <span>
                          {dept(x.dept).name}팀{x.lead ? ' 팀장' : ''}
                          {x.kind === 'cofounder' ? ' · 코파운더' : ''}
                        </span>
                      </div>
                      <div className="ac-traits">
                        {isSick(s, x) && <span className="chip red">병가</span>}
                        {x.leaving !== null && <span className="chip red">퇴사 예정</span>}
                      </div>
                    </div>
                    <MiniBar label="만족" v={x.sat} />
                    <MiniBar label="건강" v={x.health} />
                    <div className="ac-stats">
                      <div>
                        <span>속도</span>
                        <b>{employeeSpeed(x)}%</b>
                      </div>
                      <div>
                        <span>월급</span>
                        <b>{Math.round(x.salary / 1e4).toLocaleString()}만</b>
                      </div>
                      <div>
                        <span>숙련</span>
                        <b>{Math.round(x.skill)}</b>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <aside className="emp-side">
                {e ? (
                  <div className="post-card emp-detail" style={{ ['--dc' as string]: dept(e.dept).color }}>
                    <div className="ac-head">
                      <PixelAvatar id={e.id} color={dept(e.dept).color} size={48} />
                      <div className="ac-id">
                        <b>{e.name}</b>
                        <span>
                          {dept(e.dept).name}팀{e.lead ? ' 팀장' : ''}
                        </span>
                      </div>
                    </div>
                    <EmployeeDetail e={e} openDm={openDm} />
                  </div>
                ) : (
                  <div className="empty-note">직원 카드를 누르면 자세한 정보와 할 수 있는 일이 여기 나옵니다.</div>
                )}
              </aside>
            </div>
          </>
        ))}
      {tab === 'depts' && <Depts />}
      {tab === 'welfare' && <Welfare />}
    </div>
  );
}

// 카드 속 얇은 막대(만족·건강): 낮으면 빨강
function MiniBar({ label, v }: { label: string; v: number }) {
  return (
    <div className="emp-bar">
      <span>{label}</span>
      <div className={`meter ${meterCls(v)}`}>
        <div style={{ width: `${v}%` }} />
      </div>
      <b className={v < 35 ? 'fin-bad' : ''}>{Math.round(v)}</b>
    </div>
  );
}

// 부서 카드: 채용 공고 카드처럼 색 점 · 숫자 줄 · 맡은 일. 아직 안 열린 부서는 보이지 않음
function Depts() {
  const s = useGame();
  const open = DEPT_IDS.filter((d) => deptUnlocked(s, d));
  return (
    <div className="col">
      <div className="emp-depts">
        {open.map((d) => {
          const li = leadInfo(s, d);
          const n = deptMembers(s, d).length;
          return (
            <div key={d} className={`post-card ${n ? '' : 'closed'}`} style={{ ['--dc' as string]: dept(d).color }}>
              <div className="pc-head">
                <span className="pc-dot" />
                <b>{dept(d).name}</b>
                <span className="pc-hired">{n}명</span>
              </div>
              <div className="pc-stats">
                <span>
                  팀장 <b>{li.have}{li.needed > 0 ? ` / ${li.needed}` : ''}</b>
                </span>
                <span>
                  하루 작업량 <b>{deptOutput(s, d).toFixed(1)}</b>
                </span>
                {li.span < 1 && <span className="chip red">팀장 부족 −{Math.round((1 - li.span) * 100)}%</span>}
              </div>
              {n > 0 ? (
                <>
                  <select className="emp-order" data-testid={`order-${d}`} value={orderOf(s, d)} onChange={(e) => act((g) => commandOrder(g, d, e.target.value))}>
                    {ordersFor(d).map((o) => (
                      <option key={o.id} value={o.id} disabled={s.company.stage < o.stage}>
                        {o.name}
                        {s.company.stage < o.stage ? ` (단계 ${o.stage})` : ''}
                      </option>
                    ))}
                  </select>
                  <div className="pc-foot">
                    <span>{ordersFor(d).find((o) => o.id === orderOf(s, d))?.desc}</span>
                  </div>
                </>
              ) : (
                <div className="pc-foot">
                  <span>아직 사람이 없습니다. 채용에서 뽑으면 일을 맡길 수 있습니다.</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 복지·근무: 채용 짜임처럼 왼쪽 복지 타일(누르면 켜고 끔), 오른쪽 회색 판(근무 방침 · 연봉 인상률). 돈 액수·수치 효과는 보여 주지 않음
function Welfare() {
  const s = useGame();
  const policy = DATA.welfare.workPolicies.find((p) => p.id === s.company.workPolicy)!;
  return (
    <div className="hire-layout">
      <section className="post-list">
        <div className="hf-title">
          복지 <span className="chip">{s.company.welfare.length}개 켜짐</span>
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
                  {on ? '✓' : ''}
                </span>
                <b>{w.name}</b>
                <span className="ew-desc">{w.desc}</span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="hire-form">
        <div className="hf-title">일하는 방식</div>
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
            {policy.id === 'crunch' ? ' 버그와 기술 부채도 늘어납니다.' : ''}
          </div>
        </div>
        <div className="hf-field">
          <div className="hf-label">매년 1월 연봉 인상</div>
          <div className="seg">
            {[0, 0.03, 0.05, 0.08].map((r) => (
              <button key={r} className={s.company.raiseRate === r ? 'on' : ''} onClick={() => act((g) => (g.company.raiseRate = r))}>
                {r ? `${r * 100}%` : '안 올림'}
              </button>
            ))}
          </div>
          <div className="ew-note">다른 회사 월급은 해마다 조금씩 오릅니다. 안 올리면 만족도가 서서히 떨어집니다.</div>
        </div>
      </section>
    </div>
  );
}
