// F04 채용(A-88 디자인 개편, A-213부터 직원 관리 창의 채용 탭): HR-04 공고 등록, HR-05 지원자 목록과 프로필(EM-03 특성), HR-06 채용 확정과 입사 처리, HR-07 인사팀 위임 채용
import { useEffect, useRef, useState } from 'react';
import { DATA, DEPT_IDS, dept } from '../../core/data';
import { formatDate } from '../../core/calendar';
import { seatsAvailable } from '../../core/office';
import { deptInIndustry, deptUnlocked } from '../../core/employees';
import { NO_END, acceptCounter, careerLevel, arrivalRate, closePosting, createPosting, hireWarning, negotiate, negotiation, postingFull, postingOpenEnded, postingWarnings, rejectApplicant, setAutoHire } from '../../core/hiring';
import { PixelAvatar } from '../office/Avatar';
import { marketSalary, maxSpeedOf, speedOf } from '../../core/staff';
import { trait } from '../../core/data';
import { act, timeHold, useGame } from '../store';
import type { Applicant, DeptId, Grade, Posting } from '../../core/types';
import './apps.css';

// 채용 탭(A-213): 직원 관리 창 안. 왼쪽 새 공고 판, 오른쪽 지원자 줄 → 올린 공고 줄(외주 제안처럼 회색 줄).
// 마감한 공고 기록·공고별 시간 막대·안쪽 탭(공고/지원자/위임)은 뺌. 위임 채용은 팀 탭 인사팀 페이지에 있음
export function HireTab() {
  const s = useGame();
  const H = DATA.hiring;
  const waiting = s.applicants.filter((a) => a.status === 'waiting').sort((x, y) => y.arrivedDay - x.arrivedDay || (y.id > x.id ? 1 : -1));
  const open = s.postings.filter((p) => p.status === 'open');
  // 인원·기간은 고르지 않음(A-89: 무제한, 직접 마감할 때까지)
  const [form, setForm] = useState({ dept: 'dev' as DeptId, level: 'junior', promo: 'none' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [offerFor, setOfferFor] = useState<string | null>(null);
  const warnings = postingWarnings(s);
  const promo = H.promos.find((p) => p.id === form.promo)!;
  // 등급별 예상 월급 범위: 그 등급에서 나올 수 있는 능력(가중치 > 0) 중 가장 낮은·높은 시장 월급 × 재능 폭
  const grades = H.grades as Grade[];
  const pool = grades.filter((_, i) => careerLevel(form.level)!.gradeWeights[i] > 0);
  // 재능에 따라 0.95~1.08배(A-92). 10만원 단위로 둥글게
  const payLo = (Math.round((marketSalary(s, form.dept, pool[0]) * 0.95) / 1e5) * 10).toLocaleString();
  const payHi = (Math.round((marketSalary(s, form.dept, pool[pool.length - 1]) * 1.08) / 1e5) * 10).toLocaleString();
  // 미리보기: 이 조건으로 올렸을 때 하루 예상 지원자(공고 기록에 남기지 않음)
  const preview: Posting = { id: 'preview', dept: form.dept, headcount: 0, salaryLevel: 'normal', level: form.level, durationDays: 0, promo: form.promo, startDay: s.day, endDay: NO_END, status: 'open', hired: 0 };
  const full = (postingId: string) => {
    const p = s.postings.find((x) => x.id === postingId);
    return !!p && postingFull(p);
  };

  return (
    <div className="em3-hire">
      <section className="hire-form">
        <h3 className="wk-sect">새 공고</h3>
        <div className="hf-field">
          <div className="hf-label">직군</div>
          <DeptDropdown value={form.dept} onChange={(d) => setForm({ ...form, dept: d })} />
        </div>
        <div className="hf-field">
          <div className="hf-label">등급</div>
          <div className="seg" data-testid="post-level">
            {H.careerLevels.map((l) => (
              <button key={l.id} className={form.level === l.id ? 'on' : ''} onClick={() => setForm({ ...form, level: l.id })}>
                {l.name}
              </button>
            ))}
          </div>
        </div>
        <div className="hf-field">
          <div className="hf-label">홍보</div>
          <div className="seg" data-testid="post-promo">
            {H.promos.map((p) => (
              <button key={p.id} className={form.promo === p.id ? 'on' : ''} title={p.cost ? `${(p.cost / 1e4).toLocaleString()}만원` : '무료'} onClick={() => setForm({ ...form, promo: p.id })}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
        {warnings.map((w) => (
          <div key={w} className="warn">
            {w}
          </div>
        ))}
        <div className="em3-sums">
          <div>
            <span>예상 월급</span>
            <b>
              {payLo}~{payHi}만원
            </b>
          </div>
          <div>
            <span>홍보비</span>
            <b>{promo.cost ? `${(promo.cost / 1e4).toLocaleString()}만원` : '무료'}</b>
          </div>
          <div>
            <span>지원자</span>
            <b>하루 약 {arrivalRate(s, preview).toFixed(1)}명</b>
          </div>
        </div>
        <button
          className="btn big"
          data-testid="post-create"
          disabled={seatsAvailable(s) === 0}
          title={seatsAvailable(s) === 0 ? '빈 자리가 없습니다. 사무실을 넓히거나 책상을 놓으세요.' : ''}
          onClick={() => {
            const e = act((g) => createPosting(g, form));
            setMsg(e ? { ok: false, text: e } : { ok: true, text: `${dept(form.dept).name} 공고를 올렸습니다. 지원자는 하루 중 아무 때나 한 명씩 들어옵니다.` });
          }}
        >
          공고 올리기
        </button>
        {msg && <div className={msg.ok ? 'ok' : 'err'}>{msg.text}</div>}
      </section>

      <section className="em3-hire-main">
        <h3 className="wk-sect">
          지원자 <em>{waiting.length}</em>
        </h3>
        {waiting.length === 0 && <div className="wk-empty small">{open.length ? '아직 지원자가 없습니다. 하루 중 아무 때나 한 명씩 들어옵니다.' : '공고를 올리면 지원자가 들어옵니다.'}</div>}
        <div className="ct2-list">
          {waiting.map((a) => {
            const staysLeft = Math.max(0, a.leaveDay - s.day);
            const sp = applicantSpeed(a);
            return (
              <div key={a.id} className="em3-ap" data-testid={`applicant-${a.id}`} style={{ ['--dc' as string]: dept(a.dept).color }}>
                <PixelAvatar id={a.id} color={dept(a.dept).color} size={40} />
                <div className="em3-ap-main">
                  <div className="em3-ap-name">
                    <b>{a.name}</b>
                    {a.arrivedDay >= s.day - 1 && <span className="chip blue">새로 옴</span>}
                    {a.traits.map((t) => (
                      <span key={t} className="chip amber" title={trait(t)?.desc}>
                        {trait(t)?.name}
                      </span>
                    ))}
                  </div>
                  <span>
                    {roleName(a)} · 경력 {a.years}년 · <span className={staysLeft <= 2 ? 'fin-bad' : ''}>{staysLeft}일 더 기다림</span>
                  </span>
                </div>
                <div className="em3-ap-val" title={`개발 속도 ${sp}% · 숙련을 다 올리면 ${maxSpeedOf(a.grade, a.talent ?? 1)}%`}>
                  <span>속도</span>
                  <b>{sp}%</b>
                </div>
                <div className="em3-ap-val">
                  <span>희망 월급</span>
                  <b>{a.nego?.revealed ? `${(a.desiredSalary / 1e4).toLocaleString()}만` : '?'}</b>
                </div>
                {full(a.postingId) ? (
                  <span className="em3-ap-full">모집 인원이 다 찼습니다</span>
                ) : (
                  <div className="em3-ap-btns">
                    <button className="btn small" data-testid={`hire-${a.id}`} onClick={() => setOfferFor(a.id)}>
                      {a.nego ? '협상 이어가기' : '협상'}
                    </button>
                    <button className="btn small ghost" onClick={() => act((g) => rejectApplicant(g, a.id))}>
                      불합격
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {open.length > 0 && (
          <>
            <h3 className="wk-sect">
              올린 공고 <em>{open.length}</em>
            </h3>
            <div className="ct2-list">
              {open
                .slice()
                .reverse()
                .map((p) => {
                  const wait = s.applicants.filter((a) => a.postingId === p.id && a.status === 'waiting').length;
                  return (
                    <div key={p.id} className="em3-post" style={{ ['--dc' as string]: dept(p.dept).color }}>
                      <i className="em3-dot" />
                      <div className="em3-ap-main">
                        <b>
                          {careerLevel(p.level)?.name ?? ''} {dept(p.dept).name}
                        </b>
                        <span>
                          {postingOpenEnded(p) ? `${formatDate(p.startDay)}부터 상시 모집` : `${formatDate(p.endDay)} 마감 · D-${Math.max(0, p.endDay - s.day)}`} · 홍보 {H.promos.find((x) => x.id === p.promo)!.name}
                        </span>
                      </div>
                      <div className="em3-ap-val">
                        <span>대기 · 채용</span>
                        <b>
                          {wait} · {p.hired}
                        </b>
                      </div>
                      <button className="btn small ghost" onClick={() => act((g) => closePosting(g, p.id))}>
                        마감
                      </button>
                    </div>
                  );
                })}
            </div>
          </>
        )}
      </section>

      {offerFor && (
        <NegotiationDialog
          applicantId={offerFor}
          onClose={() => setOfferFor(null)}
          onDone={(text) => {
            setMsg({ ok: true, text });
            setOfferFor(null);
          }}
        />
      )}
    </div>
  );
}

// 직군 드롭다운(A-90): 얼굴·직군·직무. 열리지 않은 직군은 단계 안내와 함께 흐리게. 바깥을 누르거나 Esc면 닫힘
function DeptDropdown({ value, onChange }: { value: DeptId; onChange: (d: DeptId) => void }) {
  const s = useGame();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', off);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', off);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  const row = (d: DeptId) => (
    <>
      <PixelAvatar id={`role-${d}`} color={dept(d).color} size={30} />
      <span className="dd-name">
        <b>{dept(d).name}</b>
        <span>{dept(d).role}</span>
      </span>
    </>
  );
  return (
    <div className={`dept-dd ${open ? 'open' : ''}`} ref={box} data-testid="post-dept" style={{ ['--dc' as string]: dept(value).color }}>
      <button className="dd-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {row(value)}
        <span className="dd-caret">▾</span>
      </button>
      {open && (
        <div className="dd-list" role="listbox">
          {DEPT_IDS.filter((d) => deptInIndustry(s, d)).map((d) => {
            const on = deptUnlocked(s, d);
            return (
              <button
                key={d}
                role="option"
                aria-selected={d === value}
                className={`dd-opt ${d === value ? 'on' : ''}`}
                style={{ ['--dc' as string]: dept(d).color }}
                disabled={!on}
                onClick={() => {
                  onChange(d);
                  setOpen(false);
                }}
              >
                {row(d)}
                {!on && <span className="dd-pay">단계 {dept(d).stage}에 열림</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 지원자 직무 이름: 공고 등급이 있으면 "중급 개발자"처럼(A-91)
function roleName(a: Applicant): string {
  const lv = careerLevel(a.level);
  return lv ? `${lv.name} ${dept(a.dept).role}` : dept(a.dept).role;
}

// 개발 속도 %(A-89): 등급 대신 Startup Company처럼 %로. 예전 저장 지원자는 숙련을 모르니 보통 숙련으로 봄
function applicantSpeed(a: Applicant): number {
  return speedOf(a.grade, a.skill ?? 50, a.talent ?? 1);
}

// 연봉 협상 창(Startup Company 채용 협상): 왼쪽 위 프로필(속도·희망 월급·특성), 왼쪽 아래 제안(월급·사이닝 보너스 슬라이더), 오른쪽 협상 대화
function NegotiationDialog({ applicantId, onClose, onDone }: { applicantId: string; onClose: () => void; onDone: (text: string) => void }) {
  const s = useGame();
  const a = s.applicants.find((x) => x.id === applicantId);
  const base = Math.round(marketSalary(s, a?.dept ?? 'dev', 'B') / 1e5) * 1e5;
  const [salary, setSalary] = useState(Math.round((base * 0.9) / 1e5) * 1e5);
  const [bonus, setBonus] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  // 협상 중에는 게임 시간이 가지 않음(A-118)
  useEffect(() => {
    timeHold.nego = true;
    return () => {
      timeHold.nego = false;
    };
  }, []);
  const nego = a?.nego;
  const msgs = nego?.log ?? (a ? [{ from: 'them' as const, text: `${a.name}님이 첫 제안을 기다립니다.` }] : []);
  // 채팅처럼: 내 말은 바로, 지원자 답은 "입력 중…"을 잠깐 보여 준 뒤 하나씩(글이 길수록 조금 더 오래)
  const [shown, setShown] = useState(msgs.length);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const lastPatience = useRef<number>(a?.nego?.patience ?? DATA.hiring.nego.patience);
  const typing = shown < msgs.length && msgs[shown].from === 'them';
  useEffect(() => {
    if (shown >= msgs.length) return;
    const next = msgs[shown];
    const wait = next.from === 'me' ? 0 : 700 + Math.min(1500, next.text.length * 28);
    const t = setTimeout(() => setShown((v) => v + 1), wait);
    return () => clearTimeout(t);
  }, [shown, msgs.length]);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' });
  }, [shown, typing]);
  // 채용이 정해지면 마지막 답까지 보여 준 뒤 창을 닫음
  useEffect(() => {
    if (!doneMsg || shown < msgs.length) return;
    const t = setTimeout(() => onDone(doneMsg), 1100);
    return () => clearTimeout(t);
  }, [doneMsg, shown, msgs.length]);
  if (!a) return null;
  const busy = shown < msgs.length || !!doneMsg;
  // 인내심 숫자는 지원자 답이 보인 뒤에 바뀜(입력 중에는 앞 값)
  const pat = Math.round(typing && shown > 0 ? lastPatience.current : (nego?.patience ?? DATA.hiring.nego.patience));
  if (!typing) lastPatience.current = pat;
  const closed = a.status !== 'waiting';
  const color = dept(a.dept).color;
  const sp = applicantSpeed(a);
  const sMin = Math.round((base * 0.5) / 1e5) * 1e5;
  const sMax = Math.round((base * 2.2) / 1e5) * 1e5;
  const bMax = base * 6;
  const warn = hireWarning(s, salary);
  const man = (v: number) => `${(v / 1e4).toLocaleString()}만원`;
  const send = () => {
    const r = act((g) => {
      const ap = g.applicants.find((x) => x.id === a.id);
      if (ap) negotiation(g, ap);
      return negotiate(g, a.id, salary, bonus);
    })!;
    setErr(r.ok ? null : r.message);
    if (r.hired) setDoneMsg(r.message);
  };
  const take = () => {
    const r = act((g) => acceptCounter(g, a.id))!;
    if (!r.ok) setErr(r.message);
    else setDoneMsg(r.message);
  };
  const step = (set: (f: (v: number) => number) => void, d: number, lo: number, hi: number) => set((v) => Math.max(lo, Math.min(hi, v + d)));
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal nego" data-testid="offer-dialog" onClick={(e) => e.stopPropagation()} style={{ ['--dc' as string]: color }}>
        <div className="nego-body">
          <div className="nego-left">
            <section className="nego-card">
              <div className="nego-head">{a.name}</div>
              <div className="nego-profile">
                <PixelAvatar id={a.id} color={color} size={64} />
                <div>
                  <b>{roleName(a)}</b> · 경력 {a.years}년
                  <div className="nego-traits">
                    {a.traits.map((t) => (
                      <span key={t} className="chip amber" title={trait(t)?.desc}>
                        {trait(t)?.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="nego-stats">
                <div title="숙련을 다 올렸을 때 괄호 속도">
                  <span>속도</span>
                  <b>
                    {sp}% <small>({maxSpeedOf(a.grade, a.talent ?? 1)}%)</small>
                  </b>
                </div>
                <div>
                  <span>희망 월급</span>
                  <b>{nego?.revealed ? man(a.desiredSalary) : '?'}</b>
                </div>
                <div className="nego-patience">
                  <span>인내심</span>
                  <b key={pat} className={`nego-pnum ${pat <= 30 ? 'bad' : ''}`}>{pat}%</b>
                  <i>
                    <em style={{ width: `${pat}%` }} className={pat <= 30 ? 'bad' : pat <= 60 ? 'mid' : ''} />
                  </i>
                </div>
              </div>
            </section>
            <section className="nego-card">
              <div className="nego-head">제안 보내기</div>
              <div className="nego-offer">
                <label>
                  월급: <b>{man(salary)}</b>
                </label>
                <div className="nego-slider">
                  <button onClick={() => step(setSalary, -1e5, sMin, sMax)} aria-label="월급 내리기">
                    −
                  </button>
                  <input type="range" data-testid="offer-salary" min={sMin} max={sMax} step={1e5} value={salary} onChange={(e) => setSalary(Number(e.target.value))} />
                  <button onClick={() => step(setSalary, 1e5, sMin, sMax)} aria-label="월급 올리기">
                    +
                  </button>
                </div>
                <label>
                  사이닝 보너스: <b>{bonus ? man(bonus) : '없음'}</b>
                </label>
                <div className="nego-slider">
                  <button onClick={() => step(setBonus, -5e5, 0, bMax)} aria-label="보너스 내리기">
                    −
                  </button>
                  <input type="range" data-testid="offer-bonus" min={0} max={bMax} step={5e5} value={bonus} onChange={(e) => setBonus(Number(e.target.value))} />
                  <button onClick={() => step(setBonus, 5e5, 0, bMax)} aria-label="보너스 올리기">
                    +
                  </button>
                </div>
                {warn && <div className="tiny" style={{ color: 'var(--negative-press)' }}>{warn}</div>}
                {err && <div className="tiny" style={{ color: 'var(--negative-press)', fontWeight: 700 }}>{err}</div>}
                <button className="btn green" data-testid="offer-send" disabled={closed || busy} onClick={send}>
                  제안 보내기
                </button>
              </div>
            </section>
          </div>
          <section className="nego-card nego-chat">
            <div className="nego-head">협상</div>
            <div className="nego-log" ref={log}>
              {msgs.slice(0, shown).map((m, i) => (
                <div key={i} className={`nego-msg ${m.from}`}>
                  {m.from === 'them' && <PixelAvatar id={a.id} color={color} size={28} />}
                  <div className="nego-bubble">
                    {m.from === 'me' ? (
                      <>
                        {m.text ? `${m.text} ` : '제안: '}월 {man(m.salary ?? 0)}
                        {m.bonus ? ` · 보너스 ${man(m.bonus)}` : ''}
                      </>
                    ) : (
                      m.text
                    )}
                  </div>
                  {m.mood && <span className={`nego-mood ${m.mood}`}>{m.mood === 'happy' ? '만족' : m.mood === 'ok' ? '고민' : '불만'}</span>}
                  {/* 이 답에서 바뀐 인내심(A-130) */}
                  {m.patience !== undefined && m.patience !== 0 && (
                    <span className={`nego-pdelta ${m.patience < 0 ? 'down' : 'up'}`} data-testid="nego-patience-delta">
                      인내심 {m.patience > 0 ? '+' : ''}
                      {m.patience}%
                    </span>
                  )}
                </div>
              ))}
              {typing && (
                <div className="nego-msg them typing" aria-label="입력 중">
                  <PixelAvatar id={a.id} color={color} size={28} />
                  <div className="nego-bubble">
                    <span className="dots">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="typing-label">입력 중</span>
                  </div>
                </div>
              )}
              {nego?.counter && !closed && !busy && (
                <button className="btn small nego-take" data-testid="offer-accept-counter" onClick={take}>
                  역제안 받아들이기 (월 {man(nego.counter.salary)}
                  {nego.counter.bonus ? ` · 보너스 ${man(nego.counter.bonus)}` : ''})
                </button>
              )}
            </div>
            {a.status === 'rejected' && !busy && (
              <div className="nego-broke" data-testid="nego-broke">
                <b>협상 결렬</b> · {a.name}님이 협상을 끝내고 떠났습니다.
              </div>
            )}
          </section>
        </div>
        <div className="nego-foot">
          <button className="btn ghost" onClick={onClose}>
            뒤로
          </button>
        </div>
      </div>
    </div>
  );
}

// HR-07 인사팀 위임 채용: 부서별 목표 인원과 월급 수준만 정하면 인사팀이 알아서 뽑습니다(수수료: 월급의 30%).
export function AutoHire() {
  const s = useGame();
  const hr = s.employees.filter((e) => e.dept === 'hr').length;
  const [msg, setMsg] = useState<string | null>(null);
  if (!hr) return <div className="warn">인사팀(단계 2부터)이 있어야 채용을 맡길 수 있습니다. 인사 담당자를 먼저 뽑으세요.</div>;
  return (
    <div className="col">
      <div className="tiny muted">
        인사팀 {hr}명. 인원이 많고 "채용 지원" 지시를 하고 있을수록 빨리 뽑습니다. C등급 지원자는 절반쯤 걸러 냅니다. 자금이 부족하면 위임이 자동으로 멈춥니다.
      </div>
      <div className="row">
        <span className="tiny">월급 수준</span>
        <div className="seg">
          {DATA.hiring.salaryLevels.map((l) => (
            <button key={l.id} className={s.company.autoHireLevel === l.id ? 'on' : ''} onClick={() => act((g) => (g.company.autoHireLevel = l.id))}>
              {l.name}
            </button>
          ))}
        </div>
      </div>
      {msg && <div className="warn">{msg}</div>}
      <table className="t">
        <thead>
          <tr>
            <th>부서</th>
            <th className="r">지금</th>
            <th>목표 인원</th>
          </tr>
        </thead>
        <tbody>
          {DEPT_IDS.filter((d) => deptUnlocked(s, d)).map((d) => {
            const have = s.employees.filter((e) => e.dept === d).length;
            const t = s.company.autoHire[d] ?? 0;
            return (
              <tr key={d}>
                <td>{dept(d).name}</td>
                <td className="r">{have}</td>
                <td>
                  <div className="row">
                    <button className="btn small ghost" disabled={t <= 0} onClick={() => setMsg(act((g) => setAutoHire(g, d, t - 1)) ?? null)}>
                      −
                    </button>
                    <b className="num" data-testid={`auto-${d}`}>
                      {t || '꺼짐'}
                    </b>
                    <button className="btn small ghost" data-testid={`auto-plus-${d}`} onClick={() => setMsg(act((g) => setAutoHire(g, d, Math.max(t, have) + 1)) ?? null)}>
                      +
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
