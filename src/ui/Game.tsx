// 게임 화면: DT-09 사무실 메인 화면 + HUD(DT-05 시계·배속) + CEO 클릭 시 데스크탑(DT-02) + 알림(DT-04)·미션·긴급 결정 창.
// 배치는 Startup Company를 참고했습니다: 가운데 위 HUD, 오른쪽 위 회사 카드, 왼쪽 위 목표, 화면 전체에 아이소메트릭 사무실.
import { paydayForecast } from '../core/forecast';
import { useEffect, useRef, useState } from 'react';
import { advance, isRunning, setSpeed } from '../core/sim';
import { clockOf, dateOf, formatDate } from '../core/calendar';
import { founderPct } from '../core/equity';
import { DATA, industry } from '../core/data';
import { currentPL, runwayMonths } from '../core/finance';
import { computeValuation } from '../core/valuation';
import { coreFeatures, featureLevel, hasMvp, quality } from '../core/product';
import { totalUsers } from '../core/market';
import { activeMissions, missionProgress, STAGE_NAMES } from '../core/progress';
import { founderAge } from '../core/career';
import { act, getGame, touch, useGame } from './store';
import { Desktop, type AppId } from './Desktop';
import { Office } from './office/Office';
import { EmployeeModal } from './EmployeeModal';
import { DevPanel } from './DevPanel';
import { Money, useTween } from './common';
import { nextHint } from './hints';
import { requestAutosave } from './autosave';
import { pct } from '../core/format';
import { play, type Sfx } from './sound';
import { getSettings, useSettings } from './meta';
import { Toasts, DecisionModal, Confetti } from './Feedback';
import type { GameState } from '../core/types';
import { PxIcon } from './icons';
import './game.css';

interface Props {
  continued: boolean;
  notice: string | null;
  clearNotice: () => void;
  onEnded: () => void;
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export interface FloatFx {
  id: number;
  text: string;
  kind: 'good' | 'bad' | 'money';
  seat?: string;
  born: number;
}

export function Game({ continued, notice, clearNotice, onEnded }: Props) {
  const s = useGame();
  const settings = useSettings();
  const [desktop, setDesktop] = useState<{ open: boolean; app: AppId | null; arg?: string }>({ open: false, app: null });
  const [openedOnce, setOpenedOnce] = useState(continued);
  const [empModal, setEmpModal] = useState<string | null>(null);
  const [dev, setDev] = useState(false);
  const [urgentId, setUrgentId] = useState<string | null>(null);
  const [floats, setFloats] = useState<FloatFx[]>([]);
  const [confetti, setConfetti] = useState(0);
  const lastTouch = useRef(0);
  const fid = useRef(0);

  // 게임 루프: 실시간 진행(DEC-018). 데스크탑을 보는 동안에도 시간이 흐릅니다.
  // 설정 "긴급 알림 때 자동 일시정지"를 끄면 인수 제안·투자 제안서 도착도 멈추지 않습니다(알림·배지는 그대로, 기한 안에 답하면 됨). 파산 경고는 항상 멈춤.
  useEffect(() => {
    if (!s || settings.autoPauseUrgent) return;
    if (s.pauseReason === '인수 제안이 들어왔습니다' || s.pauseReason === '투자 제안서가 도착했습니다') act((g) => (g.pauseReason = null));
  }, [s?.pauseReason, settings.autoPauseUrgent]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const g = getGame();
      const dt = now - last;
      last = now;
      if (g && isRunning(g)) {
        const day = g.day;
        advance(g, dt);
        const important = g.day !== day || g.events.length > 0 || !isRunning(g);
        if (important || now - lastTouch.current > 150) {
          lastTouch.current = now;
          touch();
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 일회성 이벤트 처리(효과음·떠오르는 숫자·축하·긴급 결정·자동 저장)
  useEffect(() => {
    if (!s || s.events.length === 0) return;
    const evs = s.events.splice(0);
    const sounds = new Set<string>();
    for (const e of evs) {
      if (e.type === 'offerReady') setDesktop({ open: true, app: 'invest' });
      if (e.type === 'autosave') requestAutosave(e.reason);
      if (e.type === 'exitResult' || e.type === 'bankrupt' || e.type === 'companyEnded') requestAutosave('판 종료');
      if (e.type === 'sfx') sounds.add(e.sound);
      if (e.type === 'hired') sounds.add('hire');
      if (e.type === 'confetti' && settings.animations) {
        setConfetti((c) => c + 1);
        sounds.add('levelup');
      }
      if (e.type === 'float' && settings.animations) {
        const id = ++fid.current;
        setFloats((f) => [...f.slice(-12), { id, text: e.text, kind: e.kind, seat: e.seat, born: performance.now() }]);
        setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1800);
      }
      if (e.type === 'decision' && e.urgent) {
        setUrgentId(e.id);
        if (!settings.autoPauseUrgent) act((g) => (g.pauseReason = null));
      }
      if (e.type === 'exitResult') sounds.add(e.success ? 'success' : 'fail');
      if (e.type === 'bankrupt') sounds.add('fail');
    }
    for (const snd of sounds) play(snd as Sfx);
  });

  useEffect(() => {
    if (s?.ended) {
      const t = setTimeout(onEnded, 900);
      return () => clearTimeout(t);
    }
  }, [s?.ended, onEnded]);

  // CO-02: 엔젤 투자를 고른 경우 처음 들어올 때 투자 앱을 엽니다.
  useEffect(() => {
    if (s?.wantsAngelOnStart) {
      act((g) => (g.wantsAngelOnStart = false));
      setDesktop({ open: true, app: 'invest', arg: 'angel' });
      setOpenedOnce(true);
    }
  }, [s?.wantsAngelOnStart]);

  // 단축키: 스페이스 일시정지, 1~3 배속, Esc 창 닫기, Tab 컴퓨터, ` 또는 F9 개발 패널
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === '`' || e.key === 'F9') {
        e.preventDefault();
        setDev((d) => !d);
      } else if (e.key === ' ') {
        e.preventDefault();
        act((g) => setSpeed(g, g.speed > 0 && !g.pauseReason ? 0 : g.speed || settingsSpeed()));
      } else if (e.key === '1' || e.key === '2' || e.key === '3') {
        act((g) => setSpeed(g, [1, 2, 4][Number(e.key) - 1]));
      } else if (e.key === 'Escape') {
        setEmpModal(null);
        setDesktop((d) => (d.app ? { open: true, app: null } : { open: false, app: null }));
      } else if (e.key === 'Tab') {
        e.preventDefault();
        setDesktop((d) => ({ open: !d.open, app: d.app }));
        setOpenedOnce(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!s) return null;

  const openDesktop = (app: AppId | null = null, arg?: string) => {
    setDesktop({ open: true, app, arg });
    setOpenedOnce(true);
    play('open');
  };

  const urgent = urgentId ? s.decisions.find((d) => d.id === urgentId && !d.resolved) : undefined;

  return (
    <div className="game">
      <main className="stage">
        <Office onCeo={() => openDesktop()} onEmployee={(id) => setEmpModal(id)} pulseCeo={!openedOnce} keysEnabled={!desktop.open && !empModal} floats={floats} />
        {desktop.open && (
          <Desktop
            app={desktop.app}
            arg={desktop.arg}
            setApp={(app, arg) => {
              setDesktop({ open: true, app, arg });
              play(app ? 'open' : 'close');
            }}
            onClose={() => {
              setDesktop({ open: false, app: null });
              play('close');
            }}
          />
        )}

        <Hud s={s} />
        <div className={`hint ${s.pauseReason || paydayForecast(s).cashAfter <= 0 ? 'urgent' : ''}`} data-testid="hint">
          <span className="hint-tag">{s.pauseReason && !s.ended ? '일시정지' : '다음 할 일'}</span>
          <span>{nextHint(s, openedOnce)}</span>
          {s.pauseReason && !s.ended && (
            <button className="btn small green" data-testid="pause-resume" onClick={() => act((g) => setSpeed(g, g.speed || 1))}>
              ▶ 계속
            </button>
          )}
        </div>
        <Missions s={s} onOpen={(a) => openDesktop(a)} />
        <CompanyCard s={s} onOpen={(a) => openDesktop(a)} />
        <Toasts s={s} enabled={settings.toasts} onOpen={(app, arg) => openDesktop(app as AppId, arg)} />
        {notice && (
          <div className="notice">
            {notice}
            <button className="btn small ghost" onClick={clearNotice}>
              확인
            </button>
          </div>
        )}
        {confetti > 0 && <Confetti key={confetti} />}
      </main>

      {urgent && (
        <DecisionModal
          d={urgent}
          onClose={() => setUrgentId(null)}
          onOpenMessenger={() => {
            setUrgentId(null);
            openDesktop('messenger', urgent.channelId);
          }}
        />
      )}
      {empModal && <EmployeeModal id={empModal} onClose={() => setEmpModal(null)} />}
      {dev && <DevPanel onClose={() => setDev(false)} />}
    </div>
  );
}

function settingsSpeed() {
  return getSettings().defaultSpeed || 1;
}

// 가운데 위 HUD: 날짜·하루 진행·배속·시각·고객·자금(DT-05)
function Hud({ s }: { s: GameState }) {
  const d = dateOf(s.day);
  const frac = Math.min(1, s.msInDay / DATA.time.dayMs);
  const fc = paydayForecast(s);
  const net = currentPL(s).netIncome;
  const cashShown = useTween(s.cash);
  return (
    <header className="hud" data-testid="hud">
      <div className="hud-progress">
        <div style={{ width: `${frac * 100}%` }} />
      </div>
      <div className="hud-row">
        <span className="hud-date" data-testid="hud-date">
          {formatDate(s.day)} ({WEEK[d.getUTCDay()]}) · 대표 {Math.floor(founderAge(s))}세
        </span>
        <span className={`hud-econ ${s.economy.phase}`} title="경기">
          {s.economy.phase === 'boom' ? '호황' : s.economy.phase === 'recession' ? '불황' : '보통'}
        </span>
        <span className="hud-payday">
          월급일 <b>D-{fc.daysLeft}</b>
        </span>
      </div>
      <div className="hud-row main">
        <div className="hud-speed">
          {[0, 1, 2, 4].map((sp) => (
            <button
              key={sp}
              data-testid={`speed-${sp}`}
              title={sp === 0 ? '일시정지 (스페이스)' : `${sp}배속 (${sp === 4 ? 3 : sp})`}
              className={`sp sp${sp} ${s.speed === sp && (sp === 0 || !s.pauseReason) ? 'on' : ''}`}
              onClick={() => {
                act((g) => setSpeed(g, sp));
                play('click');
              }}
            >
              {sp === 0 ? <PauseIcon /> : <PlayIcon n={sp === 1 ? 1 : sp === 2 ? 2 : 3} />}
            </button>
          ))}
        </div>
        <span className="hud-pill" title="게임 시각">
          <PxIcon id="clock" /> {clockOf(s.msInDay)}
        </span>
        <span className="hud-pill" title={`${industry(s.company.industry).unit} 수`} data-testid="hud-users">
          <PxIcon id="users" /> {Math.floor(totalUsers(s)).toLocaleString('ko-KR')}
        </span>
        <span className="hud-pill cash" title={`회사 자금 · 이번 달 손익 ${net >= 0 ? '흑자' : '적자'}`}>
          <PxIcon id="coin" />
          <Money v={Math.round(cashShown)} testId="hud-cash" />
          <span className={net >= 0 ? 'up' : 'down'}>{net >= 0 ? '▲' : '▼'}</span>
        </span>
      </div>
    </header>
  );
}

// 왼쪽 위: 지금 단계와 미션(튜토리얼·마일스톤)
function Missions({ s, onOpen }: { s: GameState; onOpen: (a: AppId) => void }) {
  const ms = activeMissions(s);
  const [open, setOpen] = useState(true);
  return (
    <aside className={`missions ${open ? '' : 'closed'}`} data-testid="missions">
      <button className="ms-head" onClick={() => setOpen((o) => !o)}>
        <span className="ms-stage">단계 {s.company.stage}</span>
        <b>{STAGE_NAMES[s.company.stage]}</b>
        <span className="ms-toggle">{open ? '–' : '+'}</span>
      </button>
      {open && (
        <div className="ms-list">
          {ms.map((m, i) => {
            const p = missionProgress(s, m);
            return (
              <div key={m.id} className="ms-item" title={m.guide}>
                <div className="row">
                  <b className="grow">{m.name}</b>
                  <span className="tiny muted">{Math.round(p * 100)}%</span>
                </div>
                <div className="ms-bar">
                  <div style={{ width: `${p * 100}%` }} />
                </div>
                {i === 0 && <div className="tiny muted">{m.guide}</div>}
              </div>
            );
          })}
          <button className="btn small ghost" onClick={() => onOpen('career')}>
            전체 목표
          </button>
        </div>
      )}
    </aside>
  );
}

// 오른쪽 위 회사 카드: CEO가 볼 핵심 상태
function CompanyCard({ s, onOpen }: { s: GameState; onOpen: (a: AppId) => void }) {
  const rw = runwayMonths(s);
  const fc = paydayForecast(s);
  const cores = coreFeatures(s);
  const coreDone = cores.filter((f) => featureLevel(s, f.id) >= 1).length;
  const inProg = s.product.roadmap[0];
  return (
    <aside className="company-card" data-testid="company-card">
      <div className="cc-head">
        <div className="cc-logo">{[...s.company.name][0]}</div>
        <div className="cc-title">
          <div className="cc-name">{s.company.name}</div>
          <div className="cc-stage">
            {industry(s.company.industry).name} · {s.public ? '상장사' : s.fundingStage ? `${DATA.funding.stages.find((x) => x.id === s.fundingStage)!.name} 투자 유치` : '투자 받기 전'}
          </div>
        </div>
      </div>
      <div className="cc-tiles">
        <Tile label={s.public ? '시가총액' : '기업가치'} testId="hud-valuation" wide>
          <Money v={computeValuation(s).value} />
        </Tile>
        <Tile label="내 지분" testId="hud-equity">
          {founderPct(s) >= 0.9995 ? "100%" : pct(founderPct(s))}
        </Tile>
        <Tile label={hasMvp(s) ? '제품 품질' : '제품(MVP까지)'} wide onClick={() => onOpen('product')}>
          {hasMvp(s) ? `${quality(s)}점 · 기능 ${Object.keys(s.product.features).length}개` : `핵심 기능 ${coreDone}/${cores.length}${inProg ? '' : ' · 로드맵 비어 있음'}`}
        </Tile>
        <Tile label="직원" onClick={() => onOpen('employees')}>
          {s.employees.length}명{s.pendingHires.length > 0 && <small> +{s.pendingHires.length}</small>}
        </Tile>
      </div>
      <div className={`cc-forecast ${fc.cashAfter <= 0 ? 'bad' : ''}`} onClick={() => onOpen('finance')}>
        <div>
          <span>다음 월급일({formatDate(s.day + fc.daysLeft).slice(5)}) 예상 자금</span>
          <Money v={Math.round(fc.cashAfter)} />
        </div>
        <div className={`cc-runway ${rw !== null && rw < 3 ? 'bad' : ''}`}>
          <span>런웨이</span>
          <b>{rw === null ? '흑자' : rw > 120 ? '10년 이상' : `${rw.toFixed(1)}개월`}</b>
        </div>
      </div>
    </aside>
  );
}

function Tile({ label, children, testId, wide, onClick }: { label: string; children: React.ReactNode; testId?: string; wide?: boolean; onClick?: () => void }) {
  return (
    <div className={`cc-tile ${wide ? 'wide' : ''} ${onClick ? 'link' : ''}`} onClick={onClick}>
      <div className="cc-label">{label}</div>
      <div className="cc-value" data-testid={testId}>
        {children}
      </div>
    </div>
  );
}

const PauseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12">
    <rect x="2" y="1" width="3" height="10" fill="currentColor" />
    <rect x="7" y="1" width="3" height="10" fill="currentColor" />
  </svg>
);
const PlayIcon = ({ n }: { n: number }) => (
  <svg width={6 + n * 6} height="12" viewBox={`0 0 ${6 + n * 6} 12`}>
    {Array.from({ length: n }, (_, i) => (
      <path key={i} d={`M${i * 6 + 1} 1 L${i * 6 + 8} 6 L${i * 6 + 1} 11 Z`} fill="currentColor" />
    ))}
  </svg>
);
