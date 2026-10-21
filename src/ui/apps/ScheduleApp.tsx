// F14 일정 앱: CA-01 하루 행동 칸 배분, CA-02 스펙 효율, CA-03 조직이 생긴 뒤 대표 행동(경영 모드)
import { DATA } from '../../core/data';
import { actionDef, allocTotal, approveMultiplier, approveNeed, daySchedule, efficiency, executiveBlock, modeActions, setAlloc, setCeoMode } from '../../core/ceo';
import { openRound } from '../../core/funding';
import { enterpriseThreshold } from '../../core/orders';
import { fxTotals, hasMvp } from '../../core/product';
import { act, useGame } from '../store';
import type { ActionId } from '../../core/types';
import './apps.css';

const COLORS: Record<ActionId, string> = { dev: '#4f8df5', sales: '#f2a33a', ir: '#e5484d', network: '#3fbf7f', enterprise: '#b5651d', approve: '#6b5bd6' };

export function ScheduleApp() {
  const s = useGame();
  const sched = daySchedule(s);
  const actions = modeActions(s);
  const total = allocTotal(Object.fromEntries(actions.map((a) => [a, s.ceoAlloc[a]])) as Record<ActionId, number>);
  const slots = DATA.time.slotsPerDay;
  const round = openRound(s);
  const exec = s.company.ceoMode === 'executive';
  const execErr = executiveBlock(s);
  return (
    <div className="col">
      <div className="row">
        <div className="muted grow">
          하루 {slots}칸을 나눠 쓰세요. 배분은 다음 날에도 이어지고, 한 칸이 근무 1시간처럼 차례로 실행됩니다.
          {exec ? ' 경영 모드: 실무는 조직이 맡고 대표는 큰일에 집중합니다(CA-03).' : ''}
        </div>
        <div className="seg">
          <button className={!exec ? 'on' : ''} data-testid="mode-founder" onClick={() => act((g) => setCeoMode(g, 'founder'))}>
            실무 모드
          </button>
          <button className={exec ? 'on' : ''} data-testid="mode-executive" disabled={!!execErr} title={execErr ?? ''} onClick={() => act((g) => setCeoMode(g, 'executive'))}>
            경영 모드 {execErr ? '🔒' : ''}
          </button>
        </div>
      </div>
      {execErr && !exec && <div className="tiny muted">경영 모드: {execErr}</div>}
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
        {actions.map((a) => {
          const def = actionDef(a);
          const eff = efficiency(s, a);
          return (
            <div key={a} className="card alloc" style={{ borderTop: `4px solid ${COLORS[a]}` }}>
              <div className="row">
                <b>{def.name}</b>
                <div className="grow" />
                <span className="chip blue" title="창업자 스펙·레거시에 따른 효율(CA-02)">×{eff.toFixed(2)}</span>
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
              {a === 'sales' && !hasMvp(s) && <div className="tiny warn">MVP 전에는 팔 제품이 없어 효과가 없습니다.</div>}
              {a === 'enterprise' && !fxTotals(s).enterprise && <div className="tiny warn">대기업용 기능이 없어 계약이 성사되지 않습니다(제품 앱).</div>}
            </div>
          );
        })}
      </div>
      <div className="tiny muted">
        배분 {total}/{slots}칸{total < slots ? ` · ${slots - total}칸이 비어 있습니다.` : ''}
      </div>
      <div className="stats">
        <div className="stat">
          <div className="stat-label">IR 점수(투자 확률)</div>
          <div className="stat-value">{s.irPoints.toFixed(1)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">네트워크 점수</div>
          <div className="stat-value">{s.networkPoints.toFixed(1)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">대기업 파이프라인</div>
          <div className="stat-value">
            {s.entPipeline.toFixed(1)} / {enterpriseThreshold(s).toFixed(1)}
          </div>
        </div>
        {exec && (
          <div className="stat">
            <div className="stat-label">결재(하루 필요 {approveNeed(s).toFixed(1)}칸)</div>
            <div className="stat-value" style={{ color: approveMultiplier(s) < 1 ? 'var(--red)' : 'var(--green-d)' }}>
              전 직원 출력 ×{approveMultiplier(s).toFixed(2)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
