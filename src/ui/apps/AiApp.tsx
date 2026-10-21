// F07 AI 도입 메뉴: AT-01 공급사·모델 선택(효과 평균·분산·부작용), AT-04 부서별 적용률, AT-05 생산성 배율, AT-06 비용, AT-03 부작용(슬롭), AT-07 새 모델
import { DATA, aiModel, aiVendor, dept } from '../../core/data';
import { aiMonthlyCost, avgAdoption, chooseModel, releasedModels, setAdoption } from '../../core/aiadopt';
import { formatDate, dayOfMonthKey } from '../../core/calendar';
import { act, useGame } from '../store';
import { Money } from '../common';
import type { DeptId } from '../../core/types';
import './apps.css';

export function AiApp() {
  const s = useGame();
  const cur = s.ai.modelId ? aiModel(s.ai.modelId) : null;
  const rel = releasedModels(s);
  const upcoming = DATA.ai.models.filter((m) => dayOfMonthKey(m.release) > s.day).slice(0, 3);
  const depts = [...new Set(s.employees.map((e) => e.dept))] as DeptId[];
  return (
    <div className="col">
      <div className="kpi">
        <div className="stat">
          <div className="stat-label">쓰는 모델</div>
          <div className="stat-value">{cur ? `${aiVendor(cur.vendor).name} ${cur.name}` : '없음'}</div>
        </div>
        <div className="stat">
          <div className="stat-label">적응도(교체하면 일부 초기화)</div>
          <div className="stat-value">{Math.round(s.ai.adaptation * 100)}%</div>
          <div className="meter">
            <div style={{ width: `${s.ai.adaptation * 100}%` }} />
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">평균 적용률 · 이 회사 실제 효과</div>
          <div className="stat-value">
            {Math.round(avgAdoption(s) * 100)}% · +{Math.round(s.ai.realized * 100)}%
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">월 구독료 · 부작용 누적</div>
          <div className="stat-value">
            <Money v={aiMonthlyCost(s)} /> · {s.ai.incidents}건
          </div>
        </div>
      </div>
      <div className="section-title">모델 고르기 (가상 공급사)</div>
      <table className="t">
        <thead>
          <tr>
            <th>공급사</th>
            <th>모델</th>
            <th>출시</th>
            <th className="r">평균 효과</th>
            <th className="r">흔들림(분산)</th>
            <th className="r">부작용 위험/월</th>
            <th className="r">1인 월 요금</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {[...rel].reverse().slice(0, 9).map((m) => (
            <tr key={m.id} className={s.ai.modelId === m.id ? 'sel' : ''}>
              <td>
                <span style={{ color: aiVendor(m.vendor).color, fontWeight: 900 }}>■</span> {aiVendor(m.vendor).name}
                <div className="tiny muted">{aiVendor(m.vendor).style}</div>
              </td>
              <td>
                <b>{m.name}</b>
              </td>
              <td>{m.release}</td>
              <td className="r">+{Math.round(m.mean * 100)}%</td>
              <td className="r">±{Math.round(m.var * 100)}%</td>
              <td className="r">{Math.round(m.slop * 100)}%</td>
              <td className="r">{(m.cost / 1e4).toFixed(0)}만원</td>
              <td>
                <button className="btn small" data-testid={`ai-model-${m.id}`} disabled={s.ai.modelId === m.id} onClick={() => act((g) => chooseModel(g, m.id))}>
                  {s.ai.modelId === m.id ? '사용 중' : s.ai.modelId ? '교체' : '도입'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {upcoming.length > 0 && <div className="tiny muted">다가오는 출시(소문): {upcoming.map((m) => `${aiVendor(m.vendor).name} ${m.name}(${m.release})`).join(', ')}</div>}
      <div className="section-title">부서별 적용률</div>
      {!cur && <div className="warn">먼저 모델을 고르세요.</div>}
      {cur && (
        <div className="col">
          {depts.length === 0 && <div className="muted tiny">직원이 있는 부서가 없습니다.</div>}
          {depts.map((d) => {
            const v = s.ai.adoption[d] ?? 0;
            const fit = (DATA.ai.deptFit as Record<string, number>)[d] ?? 1;
            const n = s.employees.filter((e) => e.dept === d).length;
            const skeptic = s.employees.filter((e) => e.dept === d && e.traits.includes('ai_skeptic')).length;
            return (
              <div key={d} className="row">
                <b style={{ width: 90 }}>{dept(d).name}</b>
                <input type="range" className="grow" data-testid={`ai-adopt-${d}`} min={0} max={1} step={0.05} value={v} onChange={(e) => act((g) => setAdoption(g, d, Number(e.target.value)))} />
                <span style={{ width: 48 }} className="num">
                  {Math.round(v * 100)}%
                </span>
                <span className="tiny muted" style={{ width: 280 }}>
                  출력 +{Math.round(v * s.ai.realized * s.ai.adaptation * fit * 100)}% · 월 {Math.round((v * cur.cost * n) / 1e4).toLocaleString('ko-KR')}만원 · 적합도 ×{fit}
                  {skeptic > 0 ? ` · AI 회의적 ${skeptic}명(불만)` : ''}
                </span>
              </div>
            );
          })}
          <div className="tiny muted">
            적용률이 높을수록 효과와 부작용(AI 슬롭) 위험이 함께 커집니다. AX 복지와 AI연구팀의 "사내 AI 도구 고도화"가 적응을 빠르게 하고 부작용을 줄입니다. 마지막 교체: {s.ai.switchedDay !== null ? formatDate(s.ai.switchedDay) : '-'}.
          </div>
        </div>
      )}
    </div>
  );
}
