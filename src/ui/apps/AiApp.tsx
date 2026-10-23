// F07 AI 도입 메뉴(A-112 화면 개편): AT-01 공급사·모델 선택, AT-04 부서별 적용률, AT-05 생산성, AT-06 비용, AT-03 부작용(슬롭), AT-07 새 모델.
// 채용 짜임: 왼쪽 회색 판(지금 쓰는 AI·적응·요약·부서별 적용률) + 오른쪽 모델 카드. 효과·흔들림·부작용 확률 같은 수치는 숨기고 말로(SCREEN_GUIDE 3절).
// 화면(A-179): 업무·커리어와 같은 톤 — 가운데 지금 쓰는 모델 이름(큰 글자) + 체감·칸칸이 차는 적응 막대, 납작한 회색 요약 칸, 왼쪽 부서별 적용률 판 + 오른쪽 모델 카드(회사 색 타일 + 흰 픽셀 그림)
import { DATA, aiModel, aiVendor, dept } from '../../core/data';
import { aiMonthlyCost, avgAdoption, chooseModel, releasedModels, setAdoption } from '../../core/aiadopt';
import { dayOfMonthKey } from '../../core/calendar';
import { act, useGame } from '../store';
import { Money } from '../common';
import { AppIcon, PxIcon } from '../icons';
import type { DeptId } from '../../core/types';
import './apps.css';
import './skin/AiApp.css';

type Model = (typeof DATA.ai.models)[number];

// 성능: 지금 나와 있는 모델 중 가장 좋은 것과 비교
function perfLabel(m: Model, best: number): { text: string; cls: string } {
  const r = m.mean / best;
  return r >= 0.9 ? { text: '최고 수준', cls: 'green' } : r >= 0.65 ? { text: '좋음', cls: 'blue' } : { text: '예전 세대', cls: '' };
}
// 안정성: 효과에 비해 회사마다 얼마나 흔들리나
function steadyLabel(m: Model): { text: string; cls: string } {
  const r = m.var / m.mean;
  return r <= 0.15 ? { text: '안정적', cls: 'green' } : r <= 0.4 ? { text: '보통', cls: '' } : { text: '들쭉날쭉', cls: 'amber' };
}
// 부작용(AI 슬롭): 적용률을 높였을 때 사고가 얼마나 잦나
function slopLabel(m: Model): { text: string; cls: string } {
  return m.slop <= 0.03 ? { text: '드묾', cls: 'green' } : m.slop <= 0.07 ? { text: '가끔', cls: '' } : { text: '잦음', cls: 'red' };
}
// 부서 적합도
function fitLabel(fit: number): string {
  return fit >= 1.1 ? '잘 맞음' : fit >= 0.75 ? '보통' : '잘 안 맞음';
}

export function AiApp() {
  const s = useGame();
  const cur = s.ai.modelId ? aiModel(s.ai.modelId) : null;
  const rel = releasedModels(s);
  const best = Math.max(...rel.map((m) => m.mean), 0.01);
  const upcoming = DATA.ai.models.filter((m) => dayOfMonthKey(m.release) > s.day).slice(0, 2);
  const depts = [...new Set(s.employees.map((e) => e.dept))] as DeptId[];
  // 체감 효과: 이 회사에서 실제로 나온 효과를 모델 평균과 비교(숫자는 숨김)
  const feel = cur ? (s.ai.realized >= cur.mean * 1.1 ? '기대 이상' : s.ai.realized >= cur.mean * 0.9 ? '기대만큼' : '기대 이하') : null;
  const adapt = Math.round(s.ai.adaptation * 100);
  const curVendor = cur ? aiVendor(cur.vendor) : null;
  return (
    <div className="col ai2">
      <div className="ai2-head">
        <span className="ai2-kicker">지금 쓰는 AI</span>
        {cur && curVendor ? (
          <>
            <div className="ai2-cur">
              <span className="ai2-tile" style={{ ['--dc' as string]: curVendor.color }}>
                <AppIcon id="ai" />
              </span>
              <h2 className="ai2-big">
                {curVendor.name} {cur.name}
              </h2>
            </div>
            <span className={`chip ${feel === '기대 이상' ? 'green' : feel === '기대 이하' ? 'red' : 'blue'}`} title="이 회사에서 실제로 나온 효과(같은 모델도 회사마다 다름)">
              체감 {feel}
            </span>
            <div className="ai2-adapt" title="모델을 바꾸면 일부 처음부터 다시 익힙니다">
              <span>팀 적응</span>
              <div className="ai2-bar">
                <div style={{ width: `${adapt}%` }} />
              </div>
              <b>{adapt}%</b>
            </div>
          </>
        ) : (
          <>
            <h2 className="ai2-big">아직 AI를 쓰지 않습니다</h2>
            <p className="ai2-lead">아래에서 모델을 고르세요.</p>
          </>
        )}
      </div>
      <div className="ai2-stats">
        <div>
          <PxIcon id="coin" size={20} />
          <span>월 구독료</span>
          <b>
            <Money v={aiMonthlyCost(s)} />
          </b>
        </div>
        <div>
          <PxIcon id="chart" size={20} />
          <span>평균 적용률</span>
          <b>{Math.round(avgAdoption(s) * 100)}%</b>
        </div>
        <div>
          <PxIcon id="warn" size={20} />
          <span>지금까지 부작용</span>
          <b className={s.ai.incidents ? 'fin-bad' : ''}>{s.ai.incidents}번</b>
        </div>
      </div>

      <div className="ai2-layout">
        {/* 왼쪽: 부서별 적용률 */}
        <section className="ai2-panel">
          <div className="ai2-sect" title='적용률이 높을수록 효과와 부작용(AI 슬롭) 위험이 함께 커집니다. AX 복지와 AI연구팀의 "사내 AI 도구 고도화"가 적응을 빠르게 하고 부작용을 줄입니다.'>
            부서별 적용률
          </div>
          {!cur && <div className="ai2-empty">모델을 고르면 부서마다 얼마나 쓸지 정할 수 있습니다.</div>}
          {cur && depts.length === 0 && <div className="ai2-empty">직원이 있는 부서가 없습니다.</div>}
          {cur &&
            depts.map((d) => {
              const v = s.ai.adoption[d] ?? 0;
              const fit = (DATA.ai.deptFit as Record<string, number>)[d] ?? 1;
              const n = s.employees.filter((e) => e.dept === d).length;
              const skeptic = s.employees.filter((e) => e.dept === d && e.traits.includes('ai_skeptic')).length;
              return (
                <div key={d} className="ai2-dept" style={{ ['--dc' as string]: dept(d).color }}>
                  <div className="ai2-dname">
                    <span className="ai2-sq" />
                    <b>{dept(d).name}</b>
                    <span>
                      {n}명 · {fitLabel(fit)}
                    </span>
                    {skeptic > 0 && v > 0 && (
                      <span className="chip amber" title="AI를 싫어하는 직원은 적용률이 높을수록 불만이 커집니다">
                        회의적 {skeptic}명
                      </span>
                    )}
                  </div>
                  <div className="ai2-drow">
                    <input type="range" data-testid={`ai-adopt-${d}`} min={0} max={1} step={0.05} value={v} onChange={(e) => act((g) => setAdoption(g, d, Number(e.target.value)))} />
                    <b>{Math.round(v * 100)}%</b>
                  </div>
                </div>
              );
            })}
        </section>

        {/* 오른쪽: 고를 수 있는 모델 */}
        <section className="ai2-models">
          <div className="ai2-sect">모델</div>
          {[...rel]
            .reverse()
            .slice(0, 6)
            .map((m) => {
              const on = s.ai.modelId === m.id;
              const v = aiVendor(m.vendor);
              const tags = [
                { k: '성능', ...perfLabel(m, best) },
                { k: '안정성', ...steadyLabel(m) },
                { k: '부작용', ...slopLabel(m) },
              ];
              return (
                <div key={m.id} className={`ai2-model ${on ? 'on' : ''}`} style={{ ['--dc' as string]: v.color }}>
                  <div className="ai2-mhead">
                    <span className="ai2-tile small">
                      <AppIcon id="ai" />
                    </span>
                    <div className="ai2-mname">
                      <b>{m.name}</b>
                      <span>
                        {v.name} · {m.release.replace('-', '.')} 출시
                      </span>
                    </div>
                  </div>
                  <div className="ai2-style">{v.style}</div>
                  <div className="ai2-tags">
                    {tags.map((t) => (
                      <span key={t.k} className="ai2-tag">
                        {t.k} <span className={`chip ${t.cls}`}>{t.text}</span>
                      </span>
                    ))}
                  </div>
                  <div className="ai2-foot">
                    <span>1인 월 {(m.cost / 1e4).toLocaleString()}만원</span>
                    <button className={`btn small ${on ? 'ghost' : ''}`} data-testid={`ai-model-${m.id}`} disabled={on} onClick={() => act((g) => chooseModel(g, m.id))}>
                      {on ? '사용 중' : s.ai.modelId ? '교체' : '도입'}
                    </button>
                  </div>
                </div>
              );
            })}
          {upcoming.map((m) => (
            <div key={m.id} className="ai2-model soon" style={{ ['--dc' as string]: aiVendor(m.vendor).color }}>
              <div className="ai2-mhead">
                <span className="ai2-tile small">
                  <PxIcon id="lock" size={18} />
                </span>
                <div className="ai2-mname">
                  <b>{m.name}</b>
                  <span>
                    {aiVendor(m.vendor).name} · {m.release.replace('-', '.')} 출시 예정
                  </span>
                </div>
              </div>
              <div className="ai2-style">소문만 돌고 있습니다.</div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
