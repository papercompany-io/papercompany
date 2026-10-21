// F14 일정 앱: CA-01 하루 행동 칸 배분, CA-02 스펙 효율
import { DATA, productStage } from '../../core/data';
import { actionDef, allocTotal, daySchedule, efficiency, setAlloc } from '../../core/ceo';
import { openRound } from '../../core/funding';
import { act, useGame } from '../store';
import type { ActionId } from '../../core/types';
import './apps.css';

const ACTIONS: ActionId[] = ['dev', 'sales', 'ir', 'network'];
const COLORS: Record<ActionId, string> = { dev: '#4f8df5', sales: '#f2a33a', ir: '#e5484d', network: '#3fbf7f' };

export function ScheduleApp() {
  const s = useGame();
  const sched = daySchedule(s);
  const total = allocTotal(s.ceoAlloc);
  const slots = DATA.time.slotsPerDay;
  const round = openRound(s);
  const ps = productStage(s.productPoints);
  return (
    <div className="col">
      <div className="muted">하루 행동 칸 {slots}칸을 개발·영업·투자자 미팅·네트워킹에 나눠 쓰세요. 배분은 다음 날에도 그대로 이어지고, 한 칸이 근무 1시간처럼 차례로 실행됩니다.</div>
      <div className="card">
        <div className="section-title">오늘 일정 (09:00~18:00)</div>
        <div className="timeline">
          {sched.map((slot, i) => (
            <div key={i} className={`slot ${i < s.slotsDone ? 'done' : ''} ${i === s.slotsDone ? 'now' : ''}`} data-testid={`slot-${i}`} style={{ background: slot.action ? COLORS[slot.action] : '#d5dbe7' }}>
              <span className="slot-hour">{String(9 + i).padStart(2, '0')}시</span>
              <span>{slot.action ? actionDef(slot.action).name : '비어 있음'}</span>
              {slot.locked && <span className="slot-lock">라운드</span>}
            </div>
          ))}
        </div>
        {round && <div className="warn">투자 라운드 진행 중: 앞 {DATA.funding.lockedSlots}칸이 투자자 미팅에 묶여 다른 일이 밀립니다(FR-13). 라운드가 끝나면 풀립니다.</div>}
      </div>
      <div className="alloc-grid">
        {ACTIONS.map((a) => {
          const def = actionDef(a);
          const eff = efficiency(s, a);
          return (
            <div key={a} className="card alloc" style={{ borderTop: `4px solid ${COLORS[a]}` }}>
              <div className="row">
                <b>{def.name}</b>
                <div className="grow" />
                <span className="chip blue" title="창업자 스펙에 따른 효율(CA-02)">효율 ×{eff.toFixed(2)}</span>
              </div>
              <div className="tiny muted">{def.desc}</div>
              <div className="row stepper">
                <button className="btn small ghost" data-testid={`alloc-${a}-minus`} disabled={s.ceoAlloc[a] === 0} onClick={() => act((g) => setAlloc(g, a, g.ceoAlloc[a] - 1))}>
                  −
                </button>
                <b className="num" data-testid={`alloc-${a}`}>
                  {s.ceoAlloc[a]}칸
                </b>
                <button className="btn small ghost" data-testid={`alloc-${a}-plus`} disabled={total >= slots} onClick={() => act((g) => setAlloc(g, a, g.ceoAlloc[a] + 1))}>
                  +
                </button>
              </div>
              <div className="tiny">오늘 실행 {s.todayLog[a]}칸</div>
            </div>
          );
        })}
      </div>
      <div className="tiny muted">
        배분 {total}/{slots}칸{total < slots ? ` · ${slots - total}칸이 비어 있습니다.` : ''}
      </div>
      <div className="stats">
        <div className="stat">
          <div className="stat-label">제품 단계</div>
          <div className="stat-value" data-testid="product-stage">
            {ps.name} <span className="tiny muted">({s.productPoints.toFixed(1)}점, MVP 100)</span>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">고객</div>
          <div className="stat-value">{Math.floor(s.customers)}곳</div>
        </div>
        <div className="stat">
          <div className="stat-label">IR 점수(투자 확률)</div>
          <div className="stat-value">{s.irPoints.toFixed(1)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">네트워크 점수</div>
          <div className="stat-value">{s.networkPoints.toFixed(1)}</div>
        </div>
      </div>
    </div>
  );
}
