// F05 직원·조직 앱: EM-01 목록과 상세(만족도·건강·숙련·특성), EM-02 부서 배치, EM-04 퇴사·해고, 팀장, 부서 지시(MG-03),
// WF-01~04 복지와 근무 방침, 연봉 인상, EQ-04 스톡옵션 지급
import { useState } from 'react';
import { DATA, DEPT_IDS, dept, ordersFor, trait, welfareItem } from '../../core/data';
import { formatDate } from '../../core/calendar';
import { deptMembers, deptUnlocked, headcountByDept, moveDept, severance } from '../../core/employees';
import { monthlySalary, payrollWithBenefits, welfareMonthly } from '../../core/finance';
import { avgHealth, avgSat, deptOutput, demoteLead, fire, giveRaise, healthTarget, isSick, leadInfo, marketSalary, output, promoteLead, satTarget } from '../../core/staff';
import { esopEntry, esopFree, grantOptions, unvestedOptions, vestedFraction } from '../../core/equity';
import { orderOf, setOrder } from '../../core/orders';
import { act, useGame } from '../store';
import { Money, Tabs } from '../common';
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
        {kind} · {dept(e.dept).name}팀{e.lead ? ' 팀장' : ''} · 입사 {formatDate(e.joinedDay)} · 경력 {e.years}년 · 능력 {e.grade}
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

  return (
    <div className="col">
      <div className="kpi">
        <div className="stat">
          <div className="stat-label">총 인원</div>
          <div className="stat-value" data-testid="emp-total">
            {s.employees.length}명
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">월 인건비(+보험·연금) · 복지비</div>
          <div className="stat-value">
            <Money v={pay.total} /> · <Money v={welfareMonthly(s)} />
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">평균 만족도 · 건강</div>
          <div className="stat-value">
            {Math.round(avgSat(s))} · {Math.round(avgHealth(s))}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">올해 퇴사 · 채용(이 회사 누적)</div>
          <div className="stat-value">
            {s.stats.quits + s.stats.fired} · {s.stats.hires}
          </div>
        </div>
      </div>
      <Tabs
        tabs={[
          { id: 'people', label: '직원' },
          { id: 'depts', label: '부서·지시' },
          { id: 'welfare', label: '복지·근무' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'people' &&
        (s.employees.length === 0 ? (
          <div className="warn">아직 직원이 없습니다. 채용 앱에서 공고를 올려 직원을 뽑으세요.</div>
        ) : (
          <>
            <div className="row tiny">
              정렬
              <select value={sort} onChange={(ev) => setSort(ev.target.value as typeof sort)}>
                <option value="dept">부서</option>
                <option value="sat">만족도 낮은 순</option>
                <option value="skill">숙련 높은 순</option>
                <option value="salary">월급</option>
              </select>
              부서
              <select value={filter} onChange={(ev) => setFilter(ev.target.value as DeptId | 'all')}>
                <option value="all">전체</option>
                {DEPT_IDS.map((d) => (
                  <option key={d} value={d}>
                    {dept(d).name} ({counts[d]})
                  </option>
                ))}
              </select>
            </div>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <table className="t grow">
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>부서</th>
                    <th>능력</th>
                    <th className="r">월급</th>
                    <th className="r">만족</th>
                    <th className="r">건강</th>
                    <th className="r">숙련</th>
                    <th>특성</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((x) => (
                    <tr key={x.id} className={`clickable ${x.id === sel ? 'sel' : ''}`} data-testid={`emp-row-${x.id}`} onClick={() => setSel(x.id)}>
                      <td>
                        {x.name} {x.kind === 'cofounder' && <span className="chip amber">코파운더</span>}
                        {x.lead && <span className="chip blue">팀장</span>}
                        {x.leaving !== null && <span className="chip red">퇴사 예정</span>}
                        {isSick(s, x) && <span className="chip red">병가</span>}
                      </td>
                      <td>{dept(x.dept).name}</td>
                      <td>{x.grade}</td>
                      <td className="r num">{Math.round(x.salary / 1e4).toLocaleString()}만</td>
                      <td className="r" style={{ color: x.sat < 40 ? 'var(--red)' : undefined }}>
                        {Math.round(x.sat)}
                      </td>
                      <td className="r" style={{ color: x.health < 40 ? 'var(--red)' : undefined }}>
                        {Math.round(x.health)}
                      </td>
                      <td className="r">{Math.round(x.skill)}</td>
                      <td className="tiny">{x.traits.map((t) => trait(t)?.name).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {e && (
                <div className="card emp-detail" style={{ width: 320 }}>
                  <b style={{ fontSize: 18 }}>{e.name}</b>
                  <EmployeeDetail e={e} openDm={openDm} />
                </div>
              )}
            </div>
          </>
        ))}
      {tab === 'depts' && <Depts />}
      {tab === 'welfare' && <Welfare />}
    </div>
  );
}

function Depts() {
  const s = useGame();
  return (
    <table className="t">
      <thead>
        <tr>
          <th>부서</th>
          <th className="r">인원</th>
          <th>팀장(필요)</th>
          <th className="r">하루 작업량</th>
          <th>맡은 일</th>
        </tr>
      </thead>
      <tbody>
        {DEPT_IDS.map((d) => {
          const li = leadInfo(s, d);
          const n = deptMembers(s, d).length;
          const unlocked = deptUnlocked(s, d);
          return (
            <tr key={d} style={{ opacity: unlocked ? 1 : 0.5 }}>
              <td>
                <span style={{ color: dept(d).color, fontWeight: 900 }}>■</span> {dept(d).name}
                {!unlocked && <span className="tiny muted"> 단계 {dept(d).stage}</span>}
              </td>
              <td className="r">{n}</td>
              <td>
                {li.have}
                {li.needed > 0 ? ` / ${li.needed}` : ''}
                {li.span < 1 && <span className="chip red">관리 부족 −{Math.round((1 - li.span) * 100)}%</span>}
              </td>
              <td className="r">{deptOutput(s, d).toFixed(1)}</td>
              <td>
                {n > 0 ? (
                  <select data-testid={`order-${d}`} value={orderOf(s, d)} onChange={(e) => act((g) => setOrder(g, d, e.target.value))}>
                    {ordersFor(d).map((o) => (
                      <option key={o.id} value={o.id} disabled={s.company.stage < o.stage}>
                        {o.name}
                        {s.company.stage < o.stage ? ` (단계 ${o.stage})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="tiny muted">사람 없음</span>
                )}
                {n > 0 && <div className="tiny muted">{ordersFor(d).find((o) => o.id === orderOf(s, d))?.desc}</div>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Welfare() {
  const s = useGame();
  const n = s.employees.length;
  return (
    <div className="col">
      <div className="section-title">복지(+ 확장) — 직원 1명당 월 비용</div>
      <div className="feat-grid">
        {DATA.welfare.items.map((w) => {
          const on = s.company.welfare.includes(w.id);
          return (
            <label key={w.id} className="feat row" style={{ cursor: 'pointer', borderColor: on ? 'var(--green)' : undefined }}>
              <input
                type="checkbox"
                data-testid={`welfare-${w.id}`}
                checked={on}
                onChange={() => act((g) => (g.company.welfare = on ? g.company.welfare.filter((x) => x !== w.id) : [...g.company.welfare, w.id]))}
              />
              <div className="col grow" style={{ gap: 2 }}>
                <b>
                  {w.name} {(w as { ssot?: string }).ssot && <span className="chip">{(w as { ssot?: string }).ssot}</span>}
                </b>
                <span className="tiny muted">{w.desc}</span>
                <span className="tiny">
                  1인 {(w.cost / 1e4).toLocaleString()}만원 · 지금 {Math.round((w.cost * n) / 1e4).toLocaleString('ko-KR')}만원/월 · {welfareText(w.id)}
                </span>
              </div>
            </label>
          );
        })}
      </div>
      <div className="section-title">근무 방침</div>
      <div className="seg">
        {DATA.welfare.workPolicies.map((p) => (
          <button key={p.id} className={s.company.workPolicy === p.id ? 'on' : ''} data-testid={`policy-${p.id}`} onClick={() => act((g) => (g.company.workPolicy = p.id as WorkPolicy))} title={p.desc}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="tiny muted">{DATA.welfare.workPolicies.find((p) => p.id === s.company.workPolicy)!.desc} 야근은 버그와 기술 부채도 늘립니다.</div>
      <div className="section-title">매년 1월 연봉 인상률</div>
      <div className="seg">
        {[0, 0.03, 0.05, 0.08].map((r) => (
          <button key={r} className={s.company.raiseRate === r ? 'on' : ''} onClick={() => act((g) => (g.company.raiseRate = r))}>
            {r * 100}%
          </button>
        ))}
      </div>
      <div className="tiny muted">시장 월급은 해마다 약 {DATA.economy.salaryInflationYear * 100}%씩 오릅니다. 인상하지 않으면 만족도가 서서히 떨어집니다.</div>
    </div>
  );
}

function welfareText(id: string): string {
  const fx = (welfareItem(id)?.fx ?? {}) as Record<string, number | boolean>;
  const p: string[] = [];
  if (fx.sat) p.push(`만족 +${fx.sat}`);
  if (fx.health) p.push(`건강 +${fx.health}`);
  if (fx.output) p.push(`출력 ${(fx.output as number) > 0 ? '+' : ''}${Math.round((fx.output as number) * 100)}%`);
  if (fx.ai) p.push('AI 적응↑');
  if (fx.skill) p.push('숙련↑');
  if (fx.apply) p.push(`지원자 +${Math.round((fx.apply as number) * 100)}%`);
  if (fx.quality) p.push('지원자 질↑');
  return p.join(' · ');
}
