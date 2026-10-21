// 회사 한 판이 끝난 화면(SC-01 결과 금액, ED-01 성장 경로, ED-03 파산) + 커리어 요약 → 다음 회사 또는 은퇴(OQ-020).
// 은퇴하면 엔딩(ED-02)과 명예의 전당(RK-01 로컬)으로 갑니다.
import { DATA, industry } from '../core/data';
import { careerStats, endingFor, founderAge, legacyEarned, mustRetire, pathSummary } from '../core/career';
import { formatDate } from '../core/calendar';
import { pct, won, wonShort } from '../core/format';
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
        창업자에게 돌아온 돈
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
            <td>성장 경로(ED-01)</td>
            <td className="r">
              <b>{r.path}</b> — {pathSummary(r.path)}
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
                  <b data-testid="career-wealth">
                    <Money v={s.career.wealth} />
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
                이번 회사로 얻은 레거시 점수 <b>+{lp}</b> (회사 단계 {s.company.stage} "{STAGE_NAMES[s.company.stage]}"까지 도달). 레거시 점수는 명예의 전당에서 다음 커리어를 강하게 만드는 데 씁니다.
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
                  다음 회사 창업하기
                </button>
              )}
              <button className={`btn big ${forced ? 'green' : 'ghost'}`} data-testid="retire" onClick={onRetire}>
                {forced ? '은퇴하기(65세)' : '은퇴하고 엔딩 보기'}
              </button>
            </div>
            {forced && <div className="warn">은퇴 나이가 되었습니다. 이 커리어를 마칩니다.</div>}
            {!forced && <div className="tiny muted">다음 회사는 {DATA.career.breakDays}일 쉰 뒤 시작합니다. 엔딩은 은퇴할 때의 개인 자산과 기록으로 정해집니다(지금이라면: {endingFor(s).name}).</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Ending({ s, onHome }: { s: GameState; onHome: () => void }) {
  const e = endingFor(s);
  const st = careerStats(s);
  return (
    <div className="result-screen ending">
      <div className="result-window">
        <div className="ending-body">
          <div className="ending-tag">엔딩</div>
          <div className="ending-title" data-testid="ending-title">
            {e.name}
          </div>
          <div className="ending-text">{e.text}</div>
          <div className="career-stats big">
            <div>
              <span>최종 개인 자산</span>
              <b>
                <Money v={s.career.wealth} />
              </b>
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
            <div>
              <span>업적</span>
              <b>
                {s.career.achievements.length} / {DATA.achievements.achievements.length}
              </b>
            </div>
          </div>
          <button className="btn big" data-testid="ending-home" onClick={onHome}>
            명예의 전당으로
          </button>
        </div>
      </div>
    </div>
  );
}
