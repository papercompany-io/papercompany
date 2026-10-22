// F02 창업 셋업 마법사: (새 커리어) 창업자·도전 → 산업 → FS-01 스펙 → TM-01·TM-02·EQ-01 팀 → CO-01 이름(·개인 출자) → CO-02 첫 행보
import { useMemo, useState } from 'react';
import { DATA, INDUSTRIES, specEffects } from '../core/data';
import { defaultPicks, specBudget, specCost, validateCompanyName, type SetupChoices } from '../core/state';
import { legacyUnlocked } from '../core/career';
import { makeSeed } from '../core/rng';
import { pct, wonShort } from '../core/format';
import type { Grade, IndustryId } from '../core/types';
import { typicalSpeed } from '../core/staff';
import { useProfile } from './meta';
import { play } from './sound';
import { PixelAvatar } from './office/Avatar';
import { LOGO_COLORS, LOGO_MARKS, ServiceLogo, defaultLogo } from './logo';
import './setup.css';

const EFFECT_LABEL: Record<string, string> = {
  investorMeeting: '투자자 미팅',
  applicantQuality: '지원자 질',
  sales: '영업',
  dev: '개발',
  enterpriseSales: '대기업 영업',
  networking: '네트워킹',
  allActions: '모든 행동',
};

export function effectText(effects: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(effects)) {
    if (v === 0) continue;
    if (k === 'earlyRound') {
      if (v === 'hard') parts.push('엔젤·프리시드는 거의 받기 어려움');
      if (v === 'ok') parts.push('엔젤·프리시드를 받을 수 있음');
      if (v === 'big') parts.push('엔젤·프리시드를 크게 받음');
    } else if (k === 'teamScore') parts.push(`기업가치 팀 점수 +${v}`);
    else parts.push(`${EFFECT_LABEL[k] ?? k} +${v}%`);
  }
  return parts.length ? parts.join(', ') : '효과 없음';
}

function initialSeed(): number {
  const q = new URLSearchParams(window.location.search).get('seed');
  return q && /^\d+$/.test(q) ? Number(q) : makeSeed();
}

interface Props {
  mode: 'new' | 'next';
  wealth?: number; // 다음 회사: 개인 자산
  legacy?: Record<string, number>;
  challenge?: string | null;
  owned?: Record<string, string> | null; // 다음 회사: 이미 가진 창업자 스펙
  onDone: (c: SetupChoices) => void;
  onCancel?: () => void;
}

export function Setup({ mode, wealth = 0, legacy, challenge: careerChallenge = null, owned = null, onDone, onCancel }: Props) {
  const profile = useProfile();
  const lg = legacy ?? profile.legacy;
  const [step, setStep] = useState(mode === 'new' ? 0 : 1);
  const [founderName, setFounderName] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [industry, setIndustry] = useState<IndustryId>('saas');
  const [invest, setInvest] = useState(0);
  const [picks, setPicks] = useState<Record<string, string>>(owned ? { ...owned } : defaultPicks());
  const [cofounderId, setCofounderId] = useState<string | null>(null);
  const [equity, setEquity] = useState(0.2);
  const [engineerId, setEngineerId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [logo, setLogo] = useState(defaultLogo);
  const [seed] = useState<number>(initialSeed);
  const [teamMsg, setTeamMsg] = useState<string | null>(null);

  const budget = specBudget(lg);
  const solo = (mode === 'new' ? challenge : careerChallenge) === 'solo';
  const maxInvest = Math.floor(Math.min(wealth * DATA.career.maxInvestShare, DATA.career.maxInvest) / 1e6) * 1e6;
  const spent = specCost(picks, owned);
  const left = budget - spent;
  const fx = useMemo(() => specEffects(picks), [picks]);
  const nameErr = validateCompanyName(name);
  const service = { field: INDUSTRIES.find((x) => x.id === industry)!.name, name: serviceName.trim() || name.trim() || '우리 서비스', logo };
  const cof = DATA.candidates.cofounders.find((c) => c.id === cofounderId);

  const steps = ['창업자', '산업', '창업자 스펙', '창업 팀', '회사 이름', '첫 행보'];

  const confirmTeam = () => {
    if (cof && equity < cof.minEquity) {
      setTeamMsg(`${cof.name}님이 지분 ${pct(equity, 0)}로는 합류하지 않겠다고 했습니다. 영입이 취소되었습니다.`);
      setCofounderId(null);
      return;
    }
    setTeamMsg(null);
    setStep(4);
  };

  const finish = (wantsAngel: boolean) => {
    play('success');
    onDone({ picks, cofounderId: solo ? null : cofounderId, cofounderEquity: cofounderId ? equity : 0, engineerId: solo ? null : engineerId, companyName: name, wantsAngel, seed, industry, service, founderName, challenge, invest });
  };

  return (
    <div className="setup">
      <div className="setup-window">
        <div className="setup-head">
          <div className="setup-title">창업 신청서</div>
          <div className="setup-steps">
            {steps.map((t, i) => ({ t, i })).filter((x) => x.i !== 3).map(({ t, i }, n) => (
              <span key={t} className={i === step ? 'on' : i < step ? 'done' : ''}>
                {n + 1}. {t}
              </span>
            ))}
          </div>
        </div>

        {step === 0 && (
          <div className="setup-body narrow">
            <div className="section-title">창업자 이름</div>
            <input className="name-input" data-testid="founder-name" placeholder="예: 김대표" value={founderName} maxLength={12} onChange={(e) => setFounderName(e.target.value)} />
            <div className="tiny muted">2027년, 30세. 빈 원룸에서 책상 하나, 혼자 시작합니다. 제품을 만들고 사람을 뽑고 가구를 들이며 회사를 키우세요. 65세에 은퇴할 때까지 여러 회사를 세우며 커리어를 쌓습니다. 회사가 끝나면(매각·상장·파산) 다음 회사를 세울 수 있습니다.</div>
            <div className="section-title">도전 모드(선택)</div>
            <div className="cands">
              <button className={`cand challenge ${challenge === null ? 'sel' : ''}`} data-testid="challenge-none" onClick={() => setChallenge(null)}>
                <div className="cand-name">일반</div>
                <div className="tiny muted">기본 커리어</div>
                <div className="diff" style={{ color: '#3f9a5a' }}>난이도 쉬움</div>
              </button>
              {[...DATA.career.challenges].sort((a, b) => a.legacyMult - b.legacyMult).map((c) => (
                <button key={c.id} className={`cand challenge ${challenge === c.id ? 'sel' : ''}`} data-testid={`challenge-${c.id}`} onClick={() => setChallenge(c.id)}>
                  <div className="cand-name">{c.name}</div>
                  <div className="tiny muted">{c.desc}</div>
                  <div className="diff" style={c.legacyMult > 1.3 ? { color: 'var(--red)' } : { color: '#2c6fa8' }}>난이도 {c.legacyMult <= 1.3 ? '보통' : c.legacyMult <= 1.4 ? '어려움' : '매우 어려움'}</div>
                </button>
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              {onCancel ? (
                <button className="btn ghost" onClick={onCancel}>
                  처음으로
                </button>
              ) : (
                <span />
              )}
              <button className="btn big" data-testid="founder-confirm" disabled={founderName.trim().length < 2} onClick={() => setStep(1)}>
                다음
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="setup-body">
            <div className="section-title">어떤 사업을 할까요?</div>
            <div className="industries">
              {INDUSTRIES.map((ind) => {
                const locked = ind.locked && !legacyUnlocked(lg, ind.id);
                return (
                  <button key={ind.id} disabled={locked} className={`industry ${industry === ind.id ? 'sel' : ''}`} data-testid={`industry-${ind.id}`} onClick={() => setIndustry(ind.id)}>
                    <div className="cand-name">
                      {ind.name} {locked && <span className="chip">레거시로 해금</span>}
                    </div>
                    <div className="tiny muted">{ind.desc}</div>
                    <div className="tiny">
                      고객 단위: {ind.unit} · 기본 월 이탈 {pct(ind.churnM, 1)} · 매출 배수 {ind.valMult}배
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="service-card">
              <div className="service-preview">
                <ServiceLogo service={service} fallback={service.name} size={72} />
                <div className="service-preview-name">{service.name}</div>
                <div className="tiny muted">{service.field}</div>
              </div>
              <div className="service-form">
                <label className="service-row">
                  <span>서비스 이름</span>
                  <input data-testid="service-name" placeholder="비우면 회사 이름을 씁니다" value={serviceName} maxLength={16} onChange={(e) => setServiceName(e.target.value)} />
                </label>
                <div className="service-row">
                  <span>로고</span>
                  <div className="logo-marks">
                    {LOGO_MARKS.map((m) => (
                      <button key={m} className={`logo-pick ${logo.mark === m ? 'sel' : ''}`} data-testid={`logo-${m}`} onClick={() => setLogo({ ...logo, mark: m })}>
                        <ServiceLogo service={{ ...service, logo: { mark: m, color: logo.color } }} fallback="" size={34} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="service-row">
                  <span>색</span>
                  <div className="logo-colors">
                    {LOGO_COLORS.map((c) => (
                      <button key={c} className={`logo-color ${logo.color === c ? 'sel' : ''}`} style={{ background: c }} aria-label={c} onClick={() => setLogo({ ...logo, color: c })} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              {mode === 'new' ? (
                <button className="btn ghost" onClick={() => setStep(0)}>
                  이전
                </button>
              ) : onCancel ? (
                <button className="btn ghost" onClick={onCancel}>
                  커리어 화면으로
                </button>
              ) : (
                <span />
              )}
              <button className="btn big" data-testid="industry-confirm" onClick={() => setStep(2)}>
                다음
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="setup-body two">
            <div className="col grow">
              <div className="muted">
                {owned
                  ? `같은 창업자입니다. 지난 회사까지의 스펙을 그대로 가지고 있고(창업 경험은 실제 기록으로 채워짐), ${budget.toLocaleString()} 크레딧으로 더 좋은 항목을 차액만 내고 올릴 수 있습니다.`
                  : `시작 예산 ${budget.toLocaleString()} 크레딧으로 창업자의 출발 조건을 고르세요. 범주마다 하나씩 고르고, 모든 범주의 최고 항목을 다 살 수는 없습니다.`}
              </div>
              {DATA.specs.categories.map((c) => (
                <div key={c.id} className="spec-cat">
                  <div className="section-title">{c.name}</div>
                  <div className="spec-items">
                    {c.items.map((it) => {
                      const selected = picks[c.id] === it.id;
                      const ownPrice = owned ? c.items.find((x) => x.id === owned[c.id])?.price ?? 0 : 0;
                      const costOf = (price: number) => Math.max(0, price - ownPrice);
                      const curPrice = costOf(c.items.find((x) => x.id === picks[c.id])!.price);
                      const affordable = costOf(it.price) - curPrice <= left;
                      const isOwned = owned?.[c.id] === it.id;
                      return (
                        <button
                          key={it.id}
                          data-testid={`spec-${it.id}`}
                          className={`spec-item ${selected ? 'sel' : ''}`}
                          disabled={!selected && !affordable}
                          onClick={() => setPicks({ ...picks, [c.id]: it.id })}
                        >
                          <div className="spec-name">{it.name}</div>
                          <div className="spec-price">{isOwned ? '보유(무료)' : owned && it.price <= ownPrice ? '무료' : `${costOf(it.price)} 크레딧${owned && ownPrice > 0 ? '(차액)' : ''}`}</div>
                          <div className="spec-fx">{effectText(it.effects)}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="profile card">
              <div className="avatar">
                <PixelAvatar id="ceo-founder" color="#2c3a5c" suit size={72} />
              </div>
              <div className="profile-name">창업자 프로필</div>
              <div className="credit">
                남은 크레딧 <b data-testid="credits-left">{left.toLocaleString()}</b> / {budget.toLocaleString()}
              </div>
              {DATA.specs.categories.map((c) => (
                <div key={c.id} className="row tiny">
                  <span className="muted" style={{ width: 64 }}>
                    {c.name}
                  </span>
                  <b>{c.items.find((x) => x.id === picks[c.id])!.name}</b>
                </div>
              ))}
              <div className="section-title" style={{ marginTop: 10 }}>
                효과(판 전체 고정)
              </div>
              <div className="tiny">{effectText(fx as unknown as Record<string, unknown>)}</div>
              <div className="tiny muted" style={{ marginTop: 8 }}>
                남은 크레딧은 회사 자금으로 넘어가지 않습니다.
              </div>
              <button className="btn big" data-testid="spec-confirm" style={{ marginTop: 14 }} onClick={() => setStep(4)}>
                확정
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="setup-body">
            {solo && <div className="warn">1인 창업 도전 중입니다. 코파운더·파운딩 엔지니어 없이 시작합니다.</div>}
            <div className="section-title">코파운더 (주식을 받습니다)</div>
            <div className="cands">
              <button className={`cand ${cofounderId === null ? 'sel' : ''}`} data-testid="cof-none" onClick={() => { setCofounderId(null); setTeamMsg(null); }}>
                <div className="cand-name">영입하지 않음</div>
                <div className="tiny muted">혼자 지분 100%로 시작</div>
              </button>
              {DATA.candidates.cofounders.map((c) => (
                <button key={c.id} disabled={solo} className={`cand ${cofounderId === c.id ? 'sel' : ''}`} data-testid={`cof-${c.id}`} onClick={() => { setCofounderId(c.id); setTeamMsg(null); }}>
                  <div className="cand-name">{c.name}</div>
                  <div className="tiny">
                    {DATA.depts.departments.find((d) => d.id === c.dept)!.name} · 속도 약 {typicalSpeed(c.grade as Grade, 7)}% · 월급 {(c.salary / 1e4).toLocaleString()}만원
                  </div>
                  <div className="tiny muted">{c.desc}</div>
                  <div className="tiny">최소 요구 지분 {pct(c.minEquity, 0)}</div>
                </button>
              ))}
            </div>
            {cof && (
              <div className="card equity">
                <div className="row">
                  <b>지분 분배</b>
                  <span className="muted tiny">창업자와 코파운더가 회사 주식을 나눕니다.</span>
                </div>
                <input data-testid="equity-slider" type="range" min={0.05} max={0.5} step={0.01} value={equity} onChange={(e) => { setEquity(Number(e.target.value)); setTeamMsg(null); }} />
                <div className="row">
                  <span>
                    창업자(나) <b data-testid="equity-founder">{pct(1 - equity, 0)}</b>
                  </span>
                  <span>
                    {cof.name} <b data-testid="equity-cof">{pct(equity, 0)}</b>
                  </span>
                  <span className="muted tiny">합계 100%</span>
                </div>
                {equity < cof.minEquity && <div className="warn">{cof.name}님의 최소 요구 지분({pct(cof.minEquity, 0)})보다 낮습니다. 이대로 확정하면 영입이 취소됩니다.</div>}
              </div>
            )}
            <div className="section-title">파운딩 엔지니어 (월급을 받는 첫 개발자)</div>
            <div className="cands">
              <button className={`cand ${engineerId === null ? 'sel' : ''}`} data-testid="eng-none" onClick={() => setEngineerId(null)}>
                <div className="cand-name">영입하지 않음</div>
              </button>
              {DATA.candidates.engineers.map((c) => (
                <button key={c.id} disabled={solo} className={`cand ${engineerId === c.id ? 'sel' : ''}`} data-testid={`eng-${c.id}`} onClick={() => setEngineerId(c.id)}>
                  <div className="cand-name">{c.name}</div>
                  <div className="tiny">
                    개발 · 속도 약 {typicalSpeed(c.grade as Grade, 5)}% · 월급 {(c.salary / 1e4).toLocaleString()}만원
                  </div>
                  <div className="tiny muted">{c.desc}</div>
                </button>
              ))}
            </div>
            {teamMsg && <div className="err">{teamMsg}</div>}
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button className="btn ghost" onClick={() => setStep(2)}>
                이전
              </button>
              <button className="btn big" data-testid="team-confirm" onClick={confirmTeam}>
                다음
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="setup-body narrow">
            <div className="section-title">회사 이름</div>
            <input className="name-input" data-testid="company-name" placeholder="예: 페이퍼랩스" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
            <div className="tiny muted">2~20자. 메신저 워크스페이스와 결과 화면에 쓰입니다.</div>
            {name.length > 0 && nameErr && <div className="warn">{nameErr}</div>}
            {mode === 'next' && maxInvest > 0 && (
              <div className="card col">
                <b>개인 자산 출자</b>
                <div className="tiny muted">개인 자산의 최대 {DATA.career.maxInvestShare * 100}%(최대 {wonShort(DATA.career.maxInvest)})까지 새 회사 자본금으로 넣을 수 있습니다. 지분은 줄지 않지만, 회사가 망하면 잃습니다.</div>
                <input type="range" data-testid="invest-slider" min={0} max={maxInvest} step={Math.max(1e6, Math.round(maxInvest / 100 / 1e6) * 1e6)} value={invest} onChange={(e) => setInvest(Number(e.target.value))} />
                <div className="row">
                  <span>
                    출자 <b>{wonShort(invest)}</b>
                  </span>
                  <span className="muted tiny">개인 자산 {wonShort(wealth)}</span>
                </div>
              </div>
            )}
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button className="btn ghost" onClick={() => setStep(2)}>
                이전
              </button>
              <button className="btn big" data-testid="name-confirm" disabled={!!nameErr} onClick={() => setStep(5)}>
                다음
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="setup-body narrow">
            <div className="section-title">시작하자마자 투자를 알아볼까요?</div>
            <div className="choices">
              <button className="choice" data-testid="start-angel" onClick={() => finish(true)}>
                <b>엔젤 투자를 알아본다</b>
                <span className="tiny muted">사무실에 들어가면 투자 메뉴이 열리고 엔젤 라운드를 준비합니다.</span>
                {fx.earlyRound === 'hard' && <span className="tiny warn">투자 유치·엑싯 경험이 없는 창업자는 엔젤·프리시드를 받기 어렵습니다.</span>}
              </button>
              <button className="choice" data-testid="start-bootstrap" onClick={() => finish(false)}>
                <b>투자 없이 시작한다</b>
                <span className="tiny muted">자본금으로 제품과 매출부터 만듭니다. 투자는 나중에 언제든 열 수 있습니다.</span>
              </button>
            </div>
            <button className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setStep(4)}>
              이전
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
