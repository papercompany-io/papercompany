// 회사 한 판이 끝난 화면(SC-01 결과 금액, ED-01 성장 경로, ED-03 파산) + 커리어 요약 → 다음 회사 또는 은퇴(OQ-020).
// 은퇴하면 엔딩(ED-02)과 명예의 전당(RK-01 로컬)으로 갑니다.
import { useState } from 'react';
import { DATA, industry } from '../core/data';
import { careerStats, endingFor, founderAge, legacyEarned, mustRetire, pathSummary } from '../core/career';
import { formatDate, yearOf } from '../core/calendar';
import { pct, won, wonCompact, wonShort } from '../core/format';
import { STAGE_NAMES } from '../core/progress';
import type { CompanyResult, GameState } from '../core/types';
import { Money } from './common';
import './result.css';

const KIND: Record<string, { title: string; cls: string }> = {
  sale: { title: '매각 성공 (Exit)', cls: 'win' },
  ipo_exit: { title: '상장사 대표에서 물러남 (Exit)', cls: 'win' },
  bankrupt: { title: '파산', cls: 'lose' },
  fired: { title: '이사회에서 해임됨', cls: 'lose' },
  retired_ceo: { title: '은퇴로 회사를 넘김', cls: 'win' },
};

export function CompanyResultCard({ r }: { r: CompanyResult }) {
  const k = KIND[r.kind];
  const years = (r.day - r.startDay) / 365;
  return (
    <div className={`result-card ${k.cls}`} data-testid="result-card">
      <div className="rc-kind">{k.title}</div>
      <div className="rc-name">{r.companyName}</div>
      <div className="rc-sub">
        {industry(r.industry).name} · {formatDate(r.startDay)} ~ {formatDate(r.day)} ({years.toFixed(1)}년)
      </div>
      <div className="rc-amount">
        창업자 수령액
        <b data-testid="result-amount">
          <Money v={r.amount} full />
        </b>
      </div>
      <table className="t">
        <tbody>
          {r.kind !== 'bankrupt' && r.exitValue > 0 && (
            <tr>
              <td>Exit 가치</td>
              <td className="r">{won(r.exitValue)}</td>
            </tr>
          )}
          {r.kind !== 'bankrupt' && (
            <tr>
              <td>내 지분</td>
              <td className="r">{pct(r.founderPct)}</td>
            </tr>
          )}
          <tr>
            <td>최대 기업가치</td>
            <td className="r">{wonShort(r.maxValuation)}</td>
          </tr>
          <tr>
            <td>최대 고객</td>
            <td className="r">{Math.round(r.peakUsers).toLocaleString('ko-KR')}</td>
          </tr>
          <tr>
            <td>최대 직원</td>
            <td className="r">{r.peakEmployees}명</td>
          </tr>
          <tr>
            <td>투자 라운드</td>
            <td className="r">{r.rounds}회</td>
          </tr>
          <tr>
            <td>성장 경로</td>
            <td className="r">
              <b>{r.path}</b> · {pathSummary(r.path)}
            </td>
          </tr>
        </tbody>
      </table>
      {r.reason && <div className="tiny muted">{r.reason}</div>}
    </div>
  );
}

export function Career({ s, onNext, onRetire }: { s: GameState; onNext: () => void; onRetire: () => void }) {
  const r = s.result;
  const [askRetire, setAskRetire] = useState(false);
  const st = careerStats(s);
  const age = founderAge(s);
  const forced = mustRetire(s) || age + DATA.career.breakDays / 365 >= DATA.career.retireAge;
  const lp = r ? legacyEarned(r.kind, r.amount, s.company.stage, s.career.challenge) : 0;
  return (
    <div className="result-screen">
      <div className="result-window">
        <div className="result-head">
          <div className="setup-title">커리어 · {s.career.founderName}</div>
          <div className="muted">
            {formatDate(s.day)} · {age.toFixed(0)}세
          </div>
        </div>
        <div className="result-body">
          {r && <CompanyResultCard r={r} />}
          <div className="col grow">
            <div className="card col">
              <div className="section-title">커리어 요약</div>
              <div className="career-stats">
                <div>
                  <span>개인 자산</span>
                  <b data-testid="career-wealth" title={won(s.career.wealth)}>
                    <span className="money">{wonCompact(s.career.wealth)}</span>
                  </b>
                </div>
                <div>
                  <span>명성</span>
                  <b>{Math.round(s.career.rep)}</b>
                </div>
                <div>
                  <span>세운 회사</span>
                  <b>{s.career.companies.length}</b>
                </div>
                <div>
                  <span>Exit / 상장 / 파산</span>
                  <b>
                    {st.exits} / {st.ipos} / {st.bankruptcies}
                  </b>
                </div>
              </div>
              <div className="tiny">
                이번 회사 레거시 점수 <b>+{lp}</b> (회사 단계 {s.company.stage} "{STAGE_NAMES[s.company.stage]}"까지 도달). 레거시 점수는 명예의 전당에서 다음 커리어 강화에 씁니다.
              </div>
              <div className="tiny muted">명성이 높을수록 다음 회사의 투자 유치·채용·시작 인지도가 좋아집니다. 엑싯을 한 번 하면 투자자들이 먼저 연락합니다.</div>
            </div>
            <div className="card col">
              <div className="section-title">지금까지의 회사</div>
              <table className="t">
                <thead>
                  <tr>
                    <th>회사</th>
                    <th>산업</th>
                    <th>결과</th>
                    <th className="r">내 몫</th>
                  </tr>
                </thead>
                <tbody>
                  {s.career.companies.map((c, i) => (
                    <tr key={i}>
                      <td>{c.companyName}</td>
                      <td>{industry(c.industry).name}</td>
                      <td>{KIND[c.kind].title}</td>
                      <td className="r">{wonShort(c.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row">
              {!forced && (
                <button className="btn big green" data-testid="next-company" onClick={onNext}>
                  다음 회사 창업
                </button>
              )}
              {!askRetire ? (
                <button className={`btn big ${forced ? 'green' : 'ghost'}`} data-testid="retire" onClick={() => (forced ? onRetire() : setAskRetire(true))}>
                  {forced ? '은퇴(65세)' : '은퇴하고 엔딩 보기'}
                </button>
              ) : (
                <>
                  <span className="warn">은퇴하면 이 커리어가 끝나고 되돌릴 수 없습니다({Math.floor(age)}세).</span>
                  <button className="btn big red" data-testid="retire-confirm" onClick={onRetire}>
                    은퇴 확정
                  </button>
                  <button className="btn ghost" onClick={() => setAskRetire(false)}>
                    취소
                  </button>
                </>
              )}
            </div>
            {forced && <div className="warn">은퇴 나이가 되었습니다. 이 커리어를 마칩니다.</div>}
            {!forced && <div className="tiny muted">다음 회사는 {DATA.career.breakDays}일 쉰 뒤 시작합니다. 엔딩은 은퇴 시점의 개인 자산과 기록으로 정해집니다(현재 기준 {endingFor(s).name}).</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// 엔딩(A-114): 어두운 한 장 — 위 엔딩 이름·글, 납작한 요약 줄, 아래 "걸어온 길"(회사를 시간 순 세로 길로, 대표작 표시).
const END_KIND: Record<string, { label: string; chip: string }> = {
  sale: { label: '매각', chip: 'green' },
  ipo_exit: { label: '상장', chip: 'blue' },
  bankrupt: { label: '파산', chip: 'red' },
  fired: { label: '해임', chip: 'red' },
  retired_ceo: { label: '은퇴', chip: 'amber' },
};

// 걸어온 길에서 "대표작"으로 표시할 회사의 번호(없으면 -1).
function signatureIndex(cs: CompanyResult[]): number {
  // TODO(human)
  let best = -1;
  cs.forEach((c, i) => {
    if (c.amount > 0 && (best < 0 || c.amount > cs[best].amount)) best = i;
  });
  return best;
}

export function Ending({ s, onHome }: { s: GameState; onHome: () => void }) {
  const e = endingFor(s);
  const cs = s.career.companies;
  const sig = signatureIndex(cs);
  const count = (k: string) => cs.filter((c) => c.kind === k).length;
  const outcomes = (['sale', 'ipo_exit', 'bankrupt', 'fired', 'retired_ceo'] as const)
    .filter((k) => count(k) > 0)
    .map((k) => `${END_KIND[k].label} ${count(k)}`)
    .join(' · ');
  return (
    <div className="result-screen ending">
      <div className="end-wrap">
        <header className="end-hero">
          <div className="end-kicker">
            {s.career.founderName}의 커리어 · {s.career.startAge}세에 시작해 {Math.floor(founderAge(s))}세에 은퇴
          </div>
          <div className="ending-title" data-testid="ending-title">
            {e.name}
          </div>
          <div className="ending-text">{e.text}</div>
        </header>

        <div className="end-sum">
          <div className="end-cell main">
            <span>남긴 개인 자산</span>
            <b className="money" title={won(s.career.wealth)}>
              {wonCompact(s.career.wealth)}
            </b>
          </div>
          <div className="end-cell">
            <span>세운 회사</span>
            <b>{cs.length}곳</b>
            {outcomes && <i>{outcomes}</i>}
          </div>
          <div className="end-cell">
            <span>달성 업적</span>
            <b>{s.career.achievements.length}개</b>
            <i>전체 {DATA.achievements.achievements.length}개 중</i>
          </div>
        </div>

        <section className="end-road-wrap">
          <div className="end-sec">걸어온 길</div>
          {cs.length === 0 ? (
            <div className="end-empty">끝까지 마친 회사가 없습니다.</div>
          ) : (
            <ol className="end-road">
              {cs.map((c, i) => {
                const k = END_KIND[c.kind];
                return (
                  <li key={i} className={`end-step ${k.chip}${i === sig ? ' sig' : ''}`}>
                    <span className="end-year">
                      {yearOf(c.startDay)}–{yearOf(c.day)}
                    </span>
                    <span className="end-dot" />
                    <div className="end-co">
                      <div className="end-co-head">
                        <b>{c.companyName}</b>
                        <span className={`chip ${k.chip}`}>{k.label}</span>
                        {i === sig && <span className="end-sig">대표작</span>}
                      </div>
                      <div className="end-co-sub">
                        {industry(c.industry).name} · 최대 직원 {c.peakEmployees}명 · 최대 기업가치 {wonShort(c.maxValuation)}
                      </div>
                    </div>
                    <div className="end-co-amt">
                      <span>내 몫</span>
                      <b className={c.amount > 0 ? '' : 'zero'}>{c.amount > 0 ? wonShort(c.amount) : '없음'}</b>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <div className="end-foot">
          <button className="btn big gold" data-testid="ending-home" onClick={onHome}>
            명예의 전당으로
          </button>
        </div>
      </div>
    </div>
  );
}
