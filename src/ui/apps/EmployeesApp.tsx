// F05 직원·조직 앱: EM-01 목록과 상세(만족도·건강·숙련·특성), EM-02 부서 배치, EM-04 퇴사·해고, 팀장, 부서 지시(MG-03),
// WF-01~04 복지와 근무 방침, 연봉 인상, EQ-04 스톡옵션 지급
// 화면(A-179): 커리어·업무와 같은 톤 — 가운데 큰 인원수, 납작한 회색 요약 칸, 알약 탭·거르기, 칸칸이 차는 막대, 작은 라벨은 픽셀 글꼴. 긴 설명은 title로
import { burningActive, burningBlock, burningCost, startBurning } from '../../core/burning';
import { useState } from 'react';
import { DATA, DEPT_IDS, dept, ordersFor, trait } from '../../core/data';
import { formatDate } from '../../core/calendar';
import { deptInIndustry, deptMembers, deptUnlocked, headcountByDept, moveDept, severance } from '../../core/employees';
import { monthlySalary, payrollWithBenefits, welfareMonthly } from '../../core/finance';
import { avgHealth, avgSat, bonusBlock, bonusCost, deptOutput, demoteLead, fire, giveBonus, giveRaise, healthTarget, isSick, leadInfo, marketSalary, output, promoteLead, satTarget, employeeSpeed } from '../../core/staff';
import { esopEntry, esopFree, grantOptions, unvestedOptions, vestedFraction } from '../../core/equity';
import { orderOf } from '../../core/orders';
import { commandOrder } from '../../core/reactions';
import { act, useGame } from '../store';
import { Tabs } from '../common';
import { PixelAvatar } from '../office/Avatar';
import { wonShort } from '../../core/format';
import type { DeptId, Employee, GameState, WorkPolicy } from '../../core/types';
import './apps.css';
import { EmpOrderSelect } from './MessengerApp';
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
    <div className="col emp em2">
      {/* 위: 가운데 큰 인원수 + 한 달 월급 한 줄, 아래 납작한 회색 요약 칸 */}
      <div className="em2-head">
        <span className="em2-kicker">우리 회사 직원</span>
        <h2 className="em2-big" data-testid="emp-total">
          {n}명
        </h2>
        <p className="em2-lead" title="4대보험·퇴직연금 회사 부담 포함">
          한 달 월급 {wonShort(pay.total)}
        </p>
      </div>
      <div className="em2-stats">
        <div>
          <span>한 달 복지비</span>
          <b>{wonShort(welfareMonthly(s))}</b>
        </div>
        <div>
          <span>평균 만족</span>
          <b className={n && avgSat(s) < 40 ? 'neg' : ''}>{n ? Math.round(avgSat(s)) : '-'}</b>
        </div>
        <div>
          <span>평균 건강</span>
          <b className={n && avgHealth(s) < 40 ? 'neg' : ''}>{n ? Math.round(avgHealth(s)) : '-'}</b>
        </div>
        <div title="이 회사에서 지금까지">
          <span>나간 · 뽑은 사람</span>
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
          <div className="em2-empty">
            <b>아직 직원이 없습니다</b>
            <span>채용 메뉴에서 공고를 올려 직원을 뽑으세요.</span>
          </div>
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
                      <button className="em2-x" onClick={() => setSel(null)} title="닫기" aria-label="닫기">
                        ×
                      </button>
                    </div>
                    <EmployeeDetail e={e} openDm={openDm} />
                  </div>
                ) : (
                  <div className="em2-empty small" title="직원 카드를 누르면 자세한 정보와 할 수 있는 일이 여기 나옵니다.">
                    직원을 고르면 여기 나옵니다
                  </div>
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
      <div className="em2-sect">부서 {open.length}곳</div>
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
                <div className="pc-foot" title="채용에서 뽑으면 일을 맡길 수 있습니다.">
                  <span>아직 사람이 없습니다</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
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
