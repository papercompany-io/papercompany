// OF-01·OF-02 사무실 뷰(M1 임시 평면 배치). M2에서 아이소메트릭 픽셀 캔버스로 바꿉니다.
import { DATA, dept } from '../../core/data';
import { useGame } from '../store';
import type { DeptId } from '../../core/types';

export function Office({ onCeo, onEmployee }: { onCeo: () => void; onEmployee: (id: string) => void }) {
  const s = useGame();
  const zones = DATA.office.zones.map((z) => z.dept as DeptId);
  return (
    <div className="office-flat">
      <div className="zone exec">
        <div className="zone-name">경영</div>
        <button className="desk ceo" data-testid="ceo" onClick={onCeo}>
          나(CEO)
        </button>
        {s.seats
          .filter((x) => x.zone === 'exec')
          .map((seat) => {
            const e = s.employees.find((x) => x.id === seat.occupant);
            return e ? (
              <button key={seat.id} className="desk" data-testid={`emp-${e.id}`} onClick={() => onEmployee(e.id)}>
                {e.name}
              </button>
            ) : (
              <div key={seat.id} className="desk empty">빈자리</div>
            );
          })}
      </div>
      {zones.map((d) => (
        <div key={d} className="zone">
          <div className="zone-name" style={{ color: dept(d).color }}>
            {dept(d).name}
          </div>
          {s.seats
            .filter((x) => x.zone === d)
            .map((seat) => {
              const e = s.employees.find((x) => x.id === seat.occupant);
              if (e)
                return (
                  <button key={seat.id} className="desk" data-testid={`emp-${e.id}`} onClick={() => onEmployee(e.id)}>
                    {e.name}
                  </button>
                );
              return (
                <div key={seat.id} className="desk empty">
                  {seat.occupant ? '입사 대기' : '빈자리'}
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}
