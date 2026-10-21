// F05 직원 관리 앱: EM-01 목록과 상세, EM-02 부서 배치, HR-02 인건비 요약
import { useState } from 'react';
import { DEPT_IDS, dept, instructionOption } from '../../core/data';
import { formatDate } from '../../core/calendar';
import { headcountByDept, moveDept } from '../../core/employees';
import { monthlySalary, payrollWithBenefits } from '../../core/finance';
import { act, useGame } from '../store';
import { Money } from '../common';
import type { DeptId } from '../../core/types';
import './apps.css';

type SortKey = 'dept' | 'role' | 'salary';

export function EmployeesApp({ openDm }: { openDm: (id: string) => void }) {
  const s = useGame();
  const [sort, setSort] = useState<SortKey>('dept');
  const [filter, setFilter] = useState<DeptId | 'all'>('all');
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const pay = payrollWithBenefits(monthlySalary(s));
  const counts = headcountByDept(s);
  const list = s.employees
    .filter((e) => filter === 'all' || e.dept === filter)
    .slice()
    .sort((a, b) => (sort === 'salary' ? b.salary - a.salary : sort === 'role' ? a.roleDept.localeCompare(b.roleDept) : a.dept.localeCompare(b.dept)));
  const e = s.employees.find((x) => x.id === sel);

  if (s.employees.length === 0) {
    return <div className="warn">아직 직원이 없습니다. 채용 앱에서 공고를 올려 직원을 뽑으세요.</div>;
  }

  return (
    <div className="col">
      <div className="stats">
        <div className="stat">
          <div className="stat-label">총 인원</div>
          <div className="stat-value" data-testid="emp-total">
            {s.employees.length}명
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">월 인건비(월급+4대보험+퇴직연금)</div>
          <div className="stat-value">
            <Money v={pay.total} full />
          </div>
          <div className="tiny muted">
            월급 {pay.salary.toLocaleString()} + 보험 {pay.insurance.toLocaleString()} + 연금 {pay.pension.toLocaleString()}
          </div>
        </div>
        {DEPT_IDS.map((d) => (
          <div key={d} className="stat">
            <div className="stat-label">{dept(d).name}</div>
            <div className="stat-value">{counts[d]}명</div>
          </div>
        ))}
      </div>
      <div className="row tiny">
        정렬
        <select value={sort} onChange={(ev) => setSort(ev.target.value as SortKey)}>
          <option value="dept">부서</option>
          <option value="role">직군</option>
          <option value="salary">월급</option>
        </select>
        부서
        <select value={filter} onChange={(ev) => setFilter(ev.target.value as DeptId | 'all')}>
          <option value="all">전체</option>
          {DEPT_IDS.map((d) => (
            <option key={d} value={d}>
              {dept(d).name}
            </option>
          ))}
        </select>
      </div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <table className="t grow">
          <thead>
            <tr>
              <th>이름</th>
              <th>직군</th>
              <th>부서</th>
              <th className="r">월급</th>
              <th>능력</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.id} className={`clickable ${x.id === sel ? 'sel' : ''}`} data-testid={`emp-row-${x.id}`} onClick={() => setSel(x.id)}>
                <td>
                  {x.name} {x.kind === 'cofounder' && <span className="chip amber">코파운더</span>}
                </td>
                <td>{dept(x.roleDept).role}</td>
                <td>{dept(x.dept).name}</td>
                <td className="r num">{x.salary.toLocaleString()}원</td>
                <td>{x.grade}</td>
                <td>{x.instructionId ? '지시 수행 중' : '근무'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {e && (
          <div className="card emp-detail" data-testid="emp-detail">
            <b style={{ fontSize: 18 }}>{e.name}</b>
            <div className="tiny muted">
              {dept(e.roleDept).role} · 입사 {formatDate(e.joinedDay)} · 경력 {e.years}년 · 능력 {e.grade}
            </div>
            <div className="tiny">
              맡은 지시: {e.instructionId ? instructionOption(s.instructions.find((i) => i.id === e.instructionId)!.optionId).name : '없음'}
            </div>
            <div className="tiny">최근 결과: {e.lastResult ?? '없음'}</div>
            <label className="tiny">
              부서 이동
              <select
                data-testid="move-dept"
                value={e.dept}
                onChange={(ev) => {
                  const err = act((g) => moveDept(g, e.id, ev.target.value as DeptId));
                  setMsg(err ?? `${e.name}님을 ${dept(ev.target.value as DeptId).name}팀으로 옮겼습니다. 좌석은 다음 날 옮깁니다.`);
                }}
              >
                {DEPT_IDS.map((d) => (
                  <option key={d} value={d}>
                    {dept(d).name}
                  </option>
                ))}
              </select>
            </label>
            {msg && <div className="tiny warn">{msg}</div>}
            <button className="btn small ghost" onClick={() => openDm(e.id)}>
              메시지 보내기(DM)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
