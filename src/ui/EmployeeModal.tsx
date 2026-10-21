// OF-06 직원 클릭 정보 모달: 이름·부서·능력·만족도·건강·숙련·특성·지금 하는 일
import { dept } from '../core/data';
import { orderLabel } from '../core/orders';
import { useGame } from './store';
import { PixelAvatar } from './office/Avatar';
import { EmployeeDetail } from './apps/EmployeesApp';

export function EmployeeModal({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useGame();
  const e = s.employees.find((x) => x.id === id);
  if (!e) return null;
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
              {kind} · {dept(e.dept).name}팀{e.lead ? ' 팀장' : ''} · 지금 하는 일: <span data-testid="emp-status">{orderLabel(s, e.dept)}</span>
            </div>
          </div>
          <button className="x" onClick={onClose} title="닫기">
            ✕
          </button>
        </div>
        <div className="emp-body">
          <EmployeeDetail e={e} compact />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <span className="tiny muted grow">자세한 관리(팀장·연봉·해고)는 직원 관리 앱에서 합니다.</span>
            <button className="btn" data-testid="employee-modal-close" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
