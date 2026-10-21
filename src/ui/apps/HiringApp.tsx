// F04 채용 앱: HR-04 공고 등록, HR-05 지원자 목록과 프로필(EM-03 특성), HR-06 채용 확정과 입사 처리, HR-07 인사팀 위임 채용
import { useState } from 'react';
import { DATA, DEPT_IDS, dept } from '../../core/data';
import { formatDate } from '../../core/calendar';
import { seatsAvailable } from '../../core/office';
import { deptUnlocked } from '../../core/employees';
import { arrivalRate, closePosting, createPosting, hireWarning, offerJob, postingWarnings, rejectApplicant, setAutoHire, traitNames } from '../../core/hiring';
import { marketSalary } from '../../core/staff';
import { trait } from '../../core/data';
import { act, useGame } from '../store';
import { Tabs } from '../common';
import type { DeptId } from '../../core/types';
import './apps.css';

export function HiringApp() {
  const s = useGame();
  const s_waiting = () => s.applicants.some((a) => a.status === 'waiting');
  const [tab, setTab] = useState<'postings' | 'applicants' | 'auto'>(s_waiting() ? 'applicants' : 'postings');
  const [form, setForm] = useState({ dept: 'dev' as DeptId, headcount: 1, salaryLevel: 'normal', durationDays: 14, promo: 'none' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [offerFor, setOfferFor] = useState<string | null>(null);
  const H = DATA.hiring;
  const waiting = s.applicants.filter((a) => a.status === 'waiting');
  const warnings = postingWarnings(s, form.dept, form.headcount);
  const promoCost = H.promos.find((p) => p.id === form.promo)!.cost;
  const full = (postingId: string) => {
    const p = s.postings.find((x) => x.id === postingId)!;
    return p.hired >= p.headcount;
  };

  return (
    <div className="col">
      <Tabs
        tabs={[
          { id: 'postings', label: `공고 (${s.postings.filter((p) => p.status === 'open').length})` },
          { id: 'applicants', label: `지원자 (${waiting.length})` },
          { id: 'auto', label: '위임 채용(인사팀)' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {msg && <div className={msg.ok ? 'ok' : 'err'}>{msg.text}</div>}
      {tab === 'postings' && (
        <>
          <div className="card col">
            <b>새 채용 공고</b>
            <div className="form-grid">
              <label>
                부서(직군)
                <select data-testid="post-dept" value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value as DeptId })}>
                  {DEPT_IDS.map((d) => (
                    <option key={d} value={d} disabled={!deptUnlocked(s, d)}>
                      {dept(d).name} · {deptUnlocked(s, d) ? `빈자리 ${seatsAvailable(s, d)}석` : `단계 ${dept(d).stage}에 열림`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                인원
                <select data-testid="post-headcount" value={form.headcount} onChange={(e) => setForm({ ...form, headcount: Number(e.target.value) })}>
                  {Array.from({ length: H.maxHeadcountPerPosting }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}명
                    </option>
                  ))}
                </select>
              </label>
              <label>
                월급 수준
                <select data-testid="post-salary" value={form.salaryLevel} onChange={(e) => setForm({ ...form, salaryLevel: e.target.value })}>
                  {H.salaryLevels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} (B등급 월 약 {Math.round((marketSalary(s, form.dept, 'B') * l.salaryMult) / 1e4).toLocaleString()}만원)
                    </option>
                  ))}
                </select>
              </label>
              <label>
                공고 기간
                <select data-testid="post-duration" value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: Number(e.target.value) })}>
                  {H.durations.map((d) => (
                    <option key={d} value={d}>
                      {d}일
                    </option>
                  ))}
                </select>
              </label>
              <label>
                홍보 수준
                <select data-testid="post-promo" value={form.promo} onChange={(e) => setForm({ ...form, promo: e.target.value })}>
                  {H.promos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.cost ? `${(p.cost / 1e4).toLocaleString()}만원` : '무료'}, 지원자 ×{p.arrivalMult})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {warnings.map((w) => (
              <div key={w} className="warn">
                {w}
              </div>
            ))}
            <div className="row">
              <span className="tiny muted">홍보비 {promoCost ? `${(promoCost / 1e4).toLocaleString()}만원이 바로 빠집니다` : '없음'} · 공고 기간 동안 게임 시간이 흐르면 지원자가 들어옵니다.</span>
              <div className="grow" />
              <button
                className="btn"
                data-testid="post-create"
                disabled={seatsAvailable(s, form.dept) === 0}
                onClick={() => {
                  const e = act((g) => createPosting(g, form));
                  setMsg(e ? { ok: false, text: e } : { ok: true, text: `${dept(form.dept).name} 공고를 올렸습니다. 지원자는 하루 단위로 들어옵니다.` });
                }}
              >
                공고 올리기
              </button>
            </div>
          </div>
          <table className="t">
            <thead>
              <tr>
                <th>부서</th>
                <th>인원</th>
                <th>월급 수준</th>
                <th>홍보</th>
                <th>기간</th>
                <th>지원</th>
                <th>대기</th>
                <th>상태</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {s.postings
                .slice()
                .reverse()
                .map((p) => (
                  <tr key={p.id}>
                    <td>{dept(p.dept).name}</td>
                    <td>
                      {p.hired}/{p.headcount}명
                    </td>
                    <td>{H.salaryLevels.find((l) => l.id === p.salaryLevel)!.name}</td>
                    <td>{H.promos.find((x) => x.id === p.promo)!.name}</td>
                    <td>
                      {formatDate(p.startDay)} ~ {formatDate(p.endDay)}
                    </td>
                    <td>{s.applicants.filter((a) => a.postingId === p.id).length}명</td>
                    <td>{s.applicants.filter((a) => a.postingId === p.id && a.status === 'waiting').length}명</td>
                    <td>{p.status === 'open' ? <span className="chip green">모집 중 · 하루 약 {arrivalRate(s, p).toFixed(1)}명</span> : <span className="chip">마감</span>}</td>
                    <td>
                      {p.status === 'open' && (
                        <button className="btn small ghost" onClick={() => act((g) => closePosting(g, p.id))}>
                          마감
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}
      {tab === 'applicants' && (
        <>
          {waiting.length === 0 && <div className="warn">대기 중인 지원자가 없습니다. 공고를 올리거나, 홍보 수준·연봉을 올리면 지원자가 더 들어옵니다.</div>}
          <div className="cards">
            {waiting.map((a) => (
              <div key={a.id} className="card applicant" data-testid={`applicant-${a.id}`}>
                <div className="row">
                  <b>{a.name}</b>
                  <span className="chip blue">{dept(a.dept).role}</span>
                  <div className="grow" />
                  <span className={`chip ${a.grade === 'S' || a.grade === 'A' ? 'green' : a.grade === 'C' ? 'red' : ''}`}>능력 {a.grade}</span>
                </div>
                <div className="tiny">
                  경력 {a.years}년 · 희망 월급 {(a.desiredSalary / 1e4).toLocaleString()}만원
                </div>
                <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                  {a.traits.map((t) => (
                    <span key={t} className="chip amber" title={trait(t)?.desc}>
                      {trait(t)?.name}
                    </span>
                  ))}
                </div>
                <div className="tiny muted">{formatDate(a.leaveDay)}까지 기다립니다</div>
                {full(a.postingId) ? (
                  <button className="btn small" disabled>
                    공고 모집 인원이 다 찼습니다
                  </button>
                ) : (
                  <div className="row">
                    <button className="btn small grow" data-testid={`hire-${a.id}`} onClick={() => setOfferFor(a.id)}>
                      채용 제안
                    </button>
                    <button className="btn small ghost" onClick={() => act((g) => rejectApplicant(g, a.id))}>
                      불합격
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {tab === 'auto' && <AutoHire />}
      {offerFor && (
        <OfferDialog
          applicantId={offerFor}
          onClose={() => setOfferFor(null)}
          onResult={(r) => {
            setMsg({ ok: r.ok, text: r.message });
            setOfferFor(null);
          }}
        />
      )}
    </div>
  );
}

function OfferDialog({ applicantId, onClose, onResult }: { applicantId: string; onClose: () => void; onResult: (r: { ok: boolean; message: string }) => void }) {
  const s = useGame();
  const a = s.applicants.find((x) => x.id === applicantId)!;
  const low = Math.round((a.desiredSalary * DATA.hiring.lowballRate) / 10000) * 10000;
  const warn = hireWarning(s, a.desiredSalary);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" data-testid="offer-dialog" onClick={(e) => e.stopPropagation()}>
        <b>{a.name}님에게 채용 제안</b>
        <div className="tiny">
          {dept(a.dept).name} · 능력 {a.grade} · 경력 {a.years}년 · 희망 월급 {(a.desiredSalary / 1e4).toLocaleString()}만원 · 특성 {traitNames(a.traits)}
        </div>
        <div className="tiny muted">월급 외에 4대보험(9.4%)과 퇴직연금(8.3%) 회사 부담분이 함께 나갑니다. 입사는 다음 날입니다.</div>
        {warn && <div className="warn">{warn}</div>}
        <button className="btn" data-testid="offer-full" onClick={() => onResult(act((g) => offerJob(g, a.id, false))!)}>
          희망 월급 그대로 제안 (월 {(a.desiredSalary / 1e4).toLocaleString()}만원)
        </button>
        <button className="btn ghost" data-testid="offer-low" onClick={() => onResult(act((g) => offerJob(g, a.id, true))!)}>
          10% 낮게 제안 (월 {(low / 1e4).toLocaleString()}만원, 거절될 수 있음)
        </button>
        <button className="btn ghost" onClick={onClose}>
          취소
        </button>
      </div>
    </div>
  );
}

// HR-07 인사팀 위임 채용: 부서별 목표 인원과 월급 수준만 정하면 인사팀이 알아서 뽑습니다(수수료: 월급의 30%).
function AutoHire() {
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
            <th className="r">빈 좌석</th>
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
                <td className="r">{seatsAvailable(s, d)}</td>
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
