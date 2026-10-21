// OF-06 직원 클릭 정보 모달: 이름, 부서, 직군, 월급, 능력, 현재 상태 [Claude 제안 표시 항목]. 정보 확인만(조작·DM 버튼은 보류, U06).
import { dept, instructionOption } from '../core/data';
import { formatDate } from '../core/calendar';
import { useGame } from './store';
import { PixelAvatar } from './office/Avatar';

export function EmployeeModal({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useGame();
  const e = s.employees.find((x) => x.id === id);
  if (!e) return null;
  const ins = e.instructionId ? s.instructions.find((x) => x.id === e.instructionId) : null;
  const kind = e.kind === 'cofounder' ? '코파운더' : e.kind === 'engineer' ? '파운딩 엔지니어' : '직원';
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal emp-modal" data-testid="employee-modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="emp-head" style={{ background: dept(e.dept).color }}>
          <div className="emp-avatar">
            <PixelAvatar id={e.id} color={dept(e.dept).color} />
          </div>
          <div>
            <div className="emp-name">{e.name}</div>
            <div className="tiny">
              {kind} · {dept(e.dept).name}팀
            </div>
          </div>
          <button className="x" onClick={onClose} title="닫기">
            ✕
          </button>
        </div>
        <div className="emp-body">
          <table className="t">
            <tbody>
              <tr>
                <th>부서</th>
                <td>{dept(e.dept).name}</td>
              </tr>
              <tr>
                <th>직군</th>
                <td>{dept(e.roleDept).role}</td>
              </tr>
              <tr>
                <th>능력 등급</th>
                <td>{e.grade}</td>
              </tr>
              <tr>
                <th>경력</th>
                <td>{e.years}년</td>
              </tr>
              <tr>
                <th>월급</th>
                <td className="num">{e.salary.toLocaleString('ko-KR')}원</td>
              </tr>
              <tr>
                <th>입사일</th>
                <td>{formatDate(e.joinedDay)}</td>
              </tr>
              <tr>
                <th>현재 상태</th>
                <td data-testid="emp-status">{ins ? `지시 수행 중: ${instructionOption(ins.optionId).name} (${formatDate(ins.endDay)} 완료 예정)` : '근무 중 · 맡은 지시 없음'}</td>
              </tr>
              {e.lastResult && (
                <tr>
                  <th>최근 결과</th>
                  <td className="tiny">{e.lastResult}</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" data-testid="employee-modal-close" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
