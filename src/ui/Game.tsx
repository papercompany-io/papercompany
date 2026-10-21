// 게임 화면: DT-09 사무실 메인 화면 + HUD(DT-05 시계·배속) + CEO 클릭 시 데스크탑(DT-02) + 개발용 상태 패널
// 배치는 Startup Company를 참고했습니다: 가운데 위 HUD, 오른쪽 위 회사 카드, 화면 전체에 아이소메트릭 사무실.
import { paydayForecast } from '../core/forecast';
import { useEffect, useRef, useState } from 'react';
import { advance, isRunning, setSpeed } from '../core/sim';
import { clockOf, dateOf, formatDate } from '../core/calendar';
import { founderPct } from '../core/equity';
import { DATA, hasMvp, productStage, stage } from '../core/data';
import { currentPL, runwayMonths } from '../core/finance';
import { computeValuation } from '../core/valuation';
import { act, getGame, touch, useGame } from './store';
import { Desktop, type AppId } from './Desktop';
import { Office } from './office/Office';
import { EmployeeModal } from './EmployeeModal';
import { DevPanel } from './DevPanel';
import { Money } from './common';
import { nextHint } from './hints';
import { requestAutosave } from './autosave';
import { pct } from '../core/format';
import type { GameState } from '../core/types';
import './game.css';

interface Props {
  continued: boolean;
  notice: string | null;
  clearNotice: () => void;
  onEnded: () => void;
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export function Game({ continued, notice, clearNotice, onEnded }: Props) {
  const s = useGame();
  const [desktop, setDesktop] = useState<{ open: boolean; app: AppId | null; arg?: string }>({ open: false, app: null });
  // 이어하기한 판은 이미 컴퓨터를 써 본 판이라 첫 안내(대표 클릭)를 건너뜁니다(P3-02).
  const [openedOnce, setOpenedOnce] = useState(continued);
  const [empModal, setEmpModal] = useState<string | null>(null);
  const [dev, setDev] = useState(false);
  const lastTouch = useRef(0);

  // 게임 루프: 실시간 진행(DEC-018). 데스크탑을 보는 동안에도 시간이 흐릅니다.
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
        if (important || now - lastTouch.current > 120) {
          lastTouch.current = now;
          touch();
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 일회성 이벤트 처리
  useEffect(() => {
    if (!s || s.events.length === 0) return;
    const evs = s.events.splice(0);
    for (const e of evs) {
      if (e.type === 'offerReady') setDesktop({ open: true, app: 'invest' });
      if (e.type === 'autosave') requestAutosave(e.reason);
      if (e.type === 'exitResult' || e.type === 'bankrupt') requestAutosave('판 종료');
    }
  });

  useEffect(() => {
    if (s?.ended) {
      const t = setTimeout(onEnded, 600);
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

  // 개발용 상태 패널 단축키: ` 또는 F9
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`' || e.key === 'F9') {
        e.preventDefault();
        setDev((d) => !d);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!s) return null;

  const openDesktop = (app: AppId | null = null, arg?: string) => {
    setDesktop({ open: true, app, arg });
    setOpenedOnce(true);
  };

  return (
    <div className="game">
      <main className="stage">
        <Office onCeo={() => openDesktop()} onEmployee={(id) => setEmpModal(id)} pulseCeo={!openedOnce} keysEnabled={!desktop.open && !empModal} />
        {desktop.open && <Desktop app={desktop.app} arg={desktop.arg} setApp={(app, arg) => setDesktop({ open: true, app, arg })} onClose={() => setDesktop({ open: false, app: null })} />}

        <Hud s={s} />
        {/* 다음 할 일. 중요한 일로 시간이 멈췄으면 같은 자리에 이유와 계속 버튼을 둡니다(P2-03). */}
        <div className={`hint ${s.pauseReason || paydayForecast(s).cashAfter <= 0 ? 'urgent' : ''}`} data-testid="hint">
          <span className="hint-tag">{s.pauseReason && !s.ended ? '⏸ 일시정지' : '다음 할 일'}</span>
          <span>{nextHint(s, openedOnce)}</span>
          {s.pauseReason && !s.ended && (
            <button className="btn small green" data-testid="pause-resume" onClick={() => act((g) => setSpeed(g, g.speed || 1))}>
              ▶ 계속
            </button>
          )}
        </div>
        <CompanyCard s={s} />
        {notice && (
          <div className="notice">
            {notice}
            <button className="btn small ghost" onClick={clearNotice}>
              확인
            </button>
          </div>
        )}
      </main>

      {empModal && <EmployeeModal id={empModal} onClose={() => setEmpModal(null)} />}
      {dev && <DevPanel onClose={() => setDev(false)} />}
    </div>
  );
}

// 가운데 위 HUD: 날짜·하루 진행·배속·시각·고객·자금(DT-05)
function Hud({ s }: { s: GameState }) {
  const d = dateOf(s.day);
  const frac = Math.min(1, s.msInDay / DATA.time.dayMs);
  const fc = paydayForecast(s);
  const net = currentPL(s).netIncome;
  return (
    <header className="hud" data-testid="hud">
      <div className="hud-progress">
        <div style={{ width: `${frac * 100}%` }} />
      </div>
      <div className="hud-row">
        <span className="hud-date" data-testid="hud-date">
          {formatDate(s.day)} ({WEEK[d.getUTCDay()]}) · {s.day + 1}일째
        </span>
        <span className="hud-payday">
          다음 월급일 <b>D-{fc.daysLeft}</b>
        </span>
      </div>
      <div className="hud-row main">
        <div className="hud-speed">
          {[0, 1, 2, 4].map((sp) => (
            <button
              key={sp}
              data-testid={`speed-${sp}`}
              title={sp === 0 ? '일시정지' : `${sp}배속`}
              className={`sp sp${sp} ${s.speed === sp && (sp === 0 || !s.pauseReason) ? 'on' : ''}`}
              onClick={() => act((g) => setSpeed(g, sp))}
            >
              {sp === 0 ? <PauseIcon /> : <PlayIcon n={sp === 1 ? 1 : sp === 2 ? 2 : 3} />}
            </button>
          ))}
        </div>
        <span className="hud-item" title="게임 시각">
          <ClockIcon /> {clockOf(s.msInDay)}
        </span>
        <span className="hud-item" title="고객 수">
          <UserIcon /> {Math.floor(s.customers).toLocaleString('ko-KR')}
        </span>
        <span className="hud-cash" title="회사 자금">
          <Money v={s.cash} testId="hud-cash" />
          <span className={net >= 0 ? 'up' : 'down'}>{net >= 0 ? '▲' : '▼'}</span>
        </span>
      </div>
    </header>
  );
}

// 오른쪽 위 회사 카드: CEO가 볼 핵심 상태(기업가치·지분·제품·직원·런웨이)
function CompanyCard({ s }: { s: GameState }) {
  const ps = productStage(s.productPoints);
  const rw = runwayMonths(s);
  const fc = paydayForecast(s);
  return (
    <aside className="company-card" data-testid="company-card">
      <div className="cc-head">
        <div className="cc-logo" />
        <div className="cc-title">
          <div className="cc-name">{s.company.name}</div>
          <div className="cc-stage">{s.fundingStage ? `${stage(s.fundingStage).name} 투자 유치` : '투자 받기 전'}</div>
        </div>
      </div>
      <div className="cc-tiles">
        <Tile label="기업가치" testId="hud-valuation" wide>
          <Money v={computeValuation(s).value} />
        </Tile>
        <Tile label="내 지분" testId="hud-equity">
          {pct(founderPct(s))}
        </Tile>
        <Tile label={hasMvp(s) ? '제품' : '제품(MVP까지)'} wide>
          {hasMvp(s) ? ps.name : `${ps.name} · ${Math.floor(s.productPoints)}/100점`}
        </Tile>
        <Tile label="직원">
          {s.employees.length}명{s.pendingHires.length > 0 && <small> +{s.pendingHires.length}</small>}
        </Tile>
      </div>
      <div className={`cc-forecast ${fc.cashAfter <= 0 ? 'bad' : ''}`}>
        <div>
          <span>다음 월급일({formatDate(s.day + fc.daysLeft).slice(5)}) 예상 자금</span>
          <Money v={Math.round(fc.cashAfter)} />
        </div>
        <div className={`cc-runway ${rw !== null && rw < 3 ? 'bad' : ''}`}>
          <span>런웨이</span>
          <b>{rw === null ? '흑자' : `${rw.toFixed(1)}개월`}</b>
        </div>
      </div>
    </aside>
  );
}

function Tile({ label, children, testId, wide }: { label: string; children: React.ReactNode; testId?: string; wide?: boolean }) {
  return (
    <div className={`cc-tile ${wide ? 'wide' : ''}`}>
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
const ClockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13">
    <circle cx="6.5" cy="6.5" r="5.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M6.5 3.3 V6.7 H9" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);
const UserIcon = () => (
  <svg width="12" height="13" viewBox="0 0 12 13">
    <circle cx="6" cy="3.6" r="2.8" fill="currentColor" />
    <path d="M0.8 12.5 C1.2 8.4 3.2 7.4 6 7.4 S10.8 8.4 11.2 12.5 Z" fill="currentColor" />
  </svg>
);
