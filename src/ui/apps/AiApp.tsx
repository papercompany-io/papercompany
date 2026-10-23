// F07 AI 도입 메뉴(A-112 화면 개편): AT-01 공급사·모델 선택, AT-04 부서별 적용률, AT-05 생산성, AT-06 비용, AT-03 부작용(슬롭), AT-07 새 모델.
// 채용 짜임: 왼쪽 회색 판(지금 쓰는 AI·적응·요약·부서별 적용률) + 오른쪽 모델 카드. 효과·흔들림·부작용 확률 같은 수치는 숨기고 말로(SCREEN_GUIDE 3절).
// 화면(A-179): 업무·커리어와 같은 톤 — 가운데 지금 쓰는 모델 이름(큰 글자) + 체감·칸칸이 차는 적응 막대, 납작한 회색 요약 칸, 왼쪽 부서별 적용률 판 + 오른쪽 모델 카드(회사 색 타일 + 흰 픽셀 그림)
import { DATA, aiModel, aiVendor, dept } from '../../core/data';
import { aiMonthlyCost, chooseModel, releasedModels, setAdoption } from '../../core/aiadopt';
import { dayOfMonthKey } from '../../core/calendar';
import { act, useGame } from '../store';
import { Money } from '../common';
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
  return r <= 0.15 ? { text: '안정적', cls: 'green' } : r <= 0.4 ? { text: '보통', cls: '' } : { text: '불안정', cls: 'amber' };
}
// 부작용(AI 슬롭): 적용률을 높였을 때 사고가 얼마나 잦나
function slopLabel(m: Model): { text: string; cls: string } {
  return m.slop <= 0.03 ? { text: '드묾', cls: 'green' } : m.slop <= 0.07 ? { text: '가끔', cls: '' } : { text: '잦음', cls: 'red' };
}
// 부서 적합도
function fitLabel(fit: number): string {
  return fit >= 1.1 ? '잘 맞음' : fit >= 0.75 ? '보통' : '잘 안 맞음';
}

// 화면(A-213): 직원 관리 창 AI 도입 탭 · 팀 탭 AI연구팀 페이지. 가운데 큰 모델 이름·아이콘 요약 칸·회사 색 타일은 빼고
// 위 회색 한 줄(지금 쓰는 AI · 체감 · 팀 적응 · 월 구독료) → 왼쪽 부서별 적용률 줄 + 오른쪽 모델 줄(외주 제안 줄과 같은 회색 줄)
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
  return (
    <div className="col ai3">
      <div className="ai3-now">
        <span>사용 중인 AI</span>
        <b>{cur ? `${aiVendor(cur.vendor).name} ${cur.name}` : '아직 없음'}</b>
        {cur ? (
          <>
            <span className={`chip ${feel === '기대 이상' ? 'green' : feel === '기대 이하' ? 'red' : 'blue'}`} title="우리 회사의 실제 효과(같은 모델도 회사마다 다름)">
              체감 {feel}
            </span>
            <div className="ai3-adapt" title="모델을 바꾸면 적응이 일부 초기화됩니다.">
              <div className="ms-bar">
                <div style={{ width: `${adapt}%` }} />
              </div>
              <em>적응 {adapt}%</em>
            </div>
            <em>
              월 <Money v={aiMonthlyCost(s)} />
            </em>
          </>
        ) : (
          <em className="ai3-grow">오른쪽에서 모델을 고르세요.</em>
        )}
        {s.ai.incidents > 0 && <span className="chip red">부작용 {s.ai.incidents}번</span>}
      </div>

      <div className="ai3-split">
        <section className="ai3-col">
          <h3 className="wk-sect" title='적용률이 높을수록 효과와 부작용(AI 슬롭) 위험이 함께 커집니다. AX 복지와 AI연구팀의 "사내 AI 도구 고도화"가 적응을 빠르게 하고 부작용을 줄입니다.'>
            부서별 적용률
          </h3>
          {!cur && <div className="wk-empty small">모델을 도입하면 부서별 적용률을 정합니다.</div>}
          {cur && depts.length === 0 && <div className="wk-empty small">직원이 있는 부서가 없습니다.</div>}
          {cur &&
            depts.map((d) => {
              const v = s.ai.adoption[d] ?? 0;
              const fit = (DATA.ai.deptFit as Record<string, number>)[d] ?? 1;
              const skeptic = s.employees.filter((e) => e.dept === d && e.traits.includes('ai_skeptic')).length;
              return (
                <div key={d} className="ai3-dept" style={{ ['--dc' as string]: dept(d).color }}>
                  <i className="em3-dot" />
                  <b>{dept(d).name}</b>
                  <span>{fitLabel(fit)}</span>
                  {skeptic > 0 && v > 0 && (
                    <span className="chip amber" title="AI를 싫어하는 직원은 적용률이 높을수록 불만이 커집니다">
                      회의적 {skeptic}명
                    </span>
                  )}
                  <input type="range" data-testid={`ai-adopt-${d}`} min={0} max={1} step={0.05} value={v} onChange={(e) => act((g) => setAdoption(g, d, Number(e.target.value)))} />
                  <em>{Math.round(v * 100)}%</em>
                </div>
              );
            })}
        </section>

        <section className="ai3-col">
          <h3 className="wk-sect">모델</h3>
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
                <div key={m.id} className={`ai3-model ${on ? 'on' : ''}`}>
                  <div className="em3-ap-main" title={v.style}>
                    <b>{m.name}</b>
                    <span>
                      {v.name} · {m.release.replace('-', '.')} 출시 · 1인 월 {(m.cost / 1e4).toLocaleString()}만원
                    </span>
                    <div className="ai3-tags">
                      {tags.map((t) => (
                        <span key={t.k}>
                          {t.k} <span className={`chip ${t.cls}`}>{t.text}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <button className={`btn small ${on ? 'ghost' : ''}`} data-testid={`ai-model-${m.id}`} disabled={on} onClick={() => act((g) => chooseModel(g, m.id))}>
                    {on ? '사용 중' : s.ai.modelId ? '교체' : '도입'}
                  </button>
                </div>
              );
            })}
          {upcoming.length > 0 && (
            <div className="ai3-soon" title="소문만 돌고 있습니다.">
              출시 예정 · {upcoming.map((m) => `${aiVendor(m.vendor).name} ${m.name}(${m.release.replace('-', '.')})`).join(', ')}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
