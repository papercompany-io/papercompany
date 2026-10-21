// F02 창업 셋업 마법사: FS-01 스펙 구매 → TM-01·TM-02·EQ-01 팀 → CO-01 이름 → CO-02 첫 행보
import { useMemo, useState } from 'react';
import { DATA, specEffects } from '../core/data';
import { defaultPicks, newGame, specTotal, validateCompanyName } from '../core/state';
import { makeSeed } from '../core/rng';
import { pct } from '../core/format';
import type { GameState } from '../core/types';
import { PixelAvatar } from './office/Avatar';
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

export function Setup({ onDone }: { onDone: (s: GameState) => void }) {
  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState<Record<string, string>>(defaultPicks());
  const [cofounderId, setCofounderId] = useState<string | null>(null);
  const [equity, setEquity] = useState(0.2);
  const [engineerId, setEngineerId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [seed, setSeed] = useState<number>(initialSeed);
  const [teamMsg, setTeamMsg] = useState<string | null>(null);

  const budget = DATA.specs.budget;
  const spent = specTotal(picks);
  const left = budget - spent;
  const fx = useMemo(() => specEffects(picks), [picks]);
  const nameErr = validateCompanyName(name);
  const cof = DATA.candidates.cofounders.find((c) => c.id === cofounderId);

  const steps = ['창업자 스펙', '창업 팀', '회사 이름', '첫 행보'];

  const confirmTeam = () => {
    if (cof && equity < cof.minEquity) {
      setTeamMsg(`${cof.name}님이 지분 ${pct(equity, 0)}로는 합류하지 않겠다고 했습니다. 영입이 취소되었습니다.`);
      setCofounderId(null);
      return;
    }
    setTeamMsg(null);
    setStep(2);
  };

  const finish = (wantsAngel: boolean) => {
    onDone(newGame({ picks, cofounderId, cofounderEquity: cofounderId ? equity : 0, engineerId, companyName: name, wantsAngel, seed }));
  };

  return (
    <div className="setup">
      <div className="setup-window">
        <div className="setup-head">
          <div className="setup-title">창업 신청서</div>
          <div className="setup-steps">
            {steps.map((t, i) => (
              <span key={t} className={i === step ? 'on' : i < step ? 'done' : ''}>
                {i + 1}. {t}
              </span>
            ))}
          </div>
        </div>

        {step === 0 && (
          <div className="setup-body two">
            <div className="col grow">
              <div className="muted">시작 예산 {budget.toLocaleString()} 크레딧으로 창업자의 출발 조건을 고르세요. 범주마다 하나씩 고르고, 모든 범주의 최고 항목을 다 살 수는 없습니다.</div>
              {DATA.specs.categories.map((c) => (
                <div key={c.id} className="spec-cat">
                  <div className="section-title">{c.name}</div>
                  <div className="spec-items">
                    {c.items.map((it) => {
                      const selected = picks[c.id] === it.id;
                      const curPrice = c.items.find((x) => x.id === picks[c.id])!.price;
                      const affordable = it.price - curPrice <= left;
                      return (
                        <button
                          key={it.id}
                          data-testid={`spec-${it.id}`}
                          className={`spec-item ${selected ? 'sel' : ''}`}
                          disabled={!selected && !affordable}
                          onClick={() => setPicks({ ...picks, [c.id]: it.id })}
                        >
                          <div className="spec-name">{it.name}</div>
                          <div className="spec-price">{it.price} 크레딧</div>
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
              <button className="btn big" data-testid="spec-confirm" style={{ marginTop: 14 }} onClick={() => setStep(1)}>
                확정
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="setup-body">
            <div className="section-title">코파운더 (주식을 받습니다)</div>
            <div className="cands">
              <button className={`cand ${cofounderId === null ? 'sel' : ''}`} data-testid="cof-none" onClick={() => { setCofounderId(null); setTeamMsg(null); }}>
                <div className="cand-name">영입하지 않음</div>
                <div className="tiny muted">혼자 지분 100%로 시작</div>
              </button>
              {DATA.candidates.cofounders.map((c) => (
                <button key={c.id} className={`cand ${cofounderId === c.id ? 'sel' : ''}`} data-testid={`cof-${c.id}`} onClick={() => { setCofounderId(c.id); setTeamMsg(null); }}>
                  <div className="cand-name">{c.name}</div>
                  <div className="tiny">
                    {DATA.depts.departments.find((d) => d.id === c.dept)!.name} · 능력 {c.grade} · 월급 {(c.salary / 1e4).toLocaleString()}만원
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
                <button key={c.id} className={`cand ${engineerId === c.id ? 'sel' : ''}`} data-testid={`eng-${c.id}`} onClick={() => setEngineerId(c.id)}>
                  <div className="cand-name">{c.name}</div>
                  <div className="tiny">
                    개발 · 능력 {c.grade} · 월급 {(c.salary / 1e4).toLocaleString()}만원
                  </div>
                  <div className="tiny muted">{c.desc}</div>
                </button>
              ))}
            </div>
            {teamMsg && <div className="err">{teamMsg}</div>}
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button className="btn ghost" onClick={() => setStep(0)}>
                이전
              </button>
              <button className="btn big" data-testid="team-confirm" onClick={confirmTeam}>
                다음
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="setup-body narrow">
            <div className="section-title">회사 이름</div>
            <input className="name-input" data-testid="company-name" placeholder="예: 페이퍼랩스" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
            <div className="tiny muted">2~20자. 메신저 워크스페이스와 결과 화면에 쓰입니다.</div>
            {name.length > 0 && nameErr && <div className="warn">{nameErr}</div>}
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button className="btn ghost" onClick={() => setStep(1)}>
                이전
              </button>
              <button className="btn big" data-testid="name-confirm" disabled={!!nameErr} onClick={() => setStep(3)}>
                다음
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="setup-body narrow">
            <div className="section-title">시작하자마자 투자를 알아볼까요?</div>
            <div className="choices">
              <button className="choice" data-testid="start-angel" onClick={() => finish(true)}>
                <b>엔젤 투자를 알아본다</b>
                <span className="tiny muted">사무실에 들어가면 투자 앱이 열리고 엔젤 라운드를 준비합니다.</span>
                {fx.earlyRound === 'hard' && <span className="tiny warn">투자 유치·엑싯 경험이 없는 창업자는 엔젤·프리시드를 받기 어렵습니다.</span>}
              </button>
              <button className="choice" data-testid="start-bootstrap" onClick={() => finish(false)}>
                <b>투자 없이 시작한다</b>
                <span className="tiny muted">자본금 {(DATA.finance.startCash / 1e4).toLocaleString()}만원으로 제품과 매출부터 만듭니다. 투자는 나중에 언제든 열 수 있습니다.</span>
              </button>
            </div>
            <div className="row tiny muted">
              난수 시드
              <input data-testid="seed" className="seed" value={seed} onChange={(e) => /^\d*$/.test(e.target.value) && setSeed(Number(e.target.value || 0))} />
              <span>같은 시드면 같은 결과가 나옵니다.</span>
            </div>
            <button className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setStep(2)}>
              이전
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
