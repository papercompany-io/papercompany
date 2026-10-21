// 게임 화면: DT-09 사무실 메인 화면 + HUD(DT-05 시계·배속) + CEO 클릭 시 데스크탑(DT-02) + 개발용 상태 패널
import { useEffect, useRef, useState } from 'react';
import { advance, isRunning, setSpeed } from '../core/sim';
import { clockOf, formatDate } from '../core/calendar';
import { founderPct } from '../core/equity';
import { act, getGame, touch, useGame } from './store';
import { Desktop, type AppId } from './Desktop';
import { Office } from './office/Office';
import { EmployeeModal } from './EmployeeModal';
import { DevPanel } from './DevPanel';
import { Money } from './common';
import { nextHint } from './hints';
import { pct } from '../core/format';
import './game.css';

interface Props {
  notice: string | null;
  clearNotice: () => void;
  onEnded: () => void;
}

export function Game({ notice, clearNotice, onEnded }: Props) {
  const s = useGame();
  const [desktop, setDesktop] = useState<{ open: boolean; app: AppId | null; arg?: string }>({ open: false, app: null });
  const [openedOnce, setOpenedOnce] = useState(false);
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
      <header className="hud">
        <div className="hud-company">
          <div className="hud-logo" />
          <div>
            <div className="hud-name">{s.company.name}</div>
            <div className="hud-stage">{s.fundingStage ? `펀딩 단계 ${stageName(s.fundingStage)}` : '투자 전'}</div>
          </div>
        </div>
        <div className="hud-clock">
          <div className="hud-date" data-testid="hud-date">
            {formatDate(s.day)} <span>{clockOf(s.msInDay)}</span>
          </div>
          <div className="speed">
            {[0, 1, 2, 4].map((sp) => (
              <button key={sp} data-testid={`speed-${sp}`} className={s.speed === sp && (sp === 0 || !s.pauseReason) ? 'on' : ''} onClick={() => act((g) => setSpeed(g, sp))}>
                {sp === 0 ? '⏸' : `${sp}x`}
              </button>
            ))}
          </div>
        </div>
        <div className="hud-stats">
          <div>
            <span>자금</span>
            <Money v={s.cash} testId="hud-cash" />
          </div>
          <div>
            <span>기업가치</span>
            <Money v={s.valuation.stored} testId="hud-valuation" />
          </div>
          <div>
            <span>내 지분</span>
            <b data-testid="hud-equity">{pct(founderPct(s))}</b>
          </div>
        </div>
      </header>

      <div className="hintbar" data-testid="hint">
        <span className="hint-tag">다음 할 일</span> {nextHint(s, openedOnce)}
      </div>
      <main className="stage">
        <Office onCeo={() => openDesktop()} onEmployee={(id) => setEmpModal(id)} />
        {desktop.open && <Desktop app={desktop.app} arg={desktop.arg} setApp={(app, arg) => setDesktop({ open: true, app, arg })} onClose={() => setDesktop({ open: false, app: null })} />}
        {s.pauseReason && !s.ended && (
          <div className="pause-banner" data-testid="pause-banner">
            <b>⏸ {s.pauseReason}</b>
            <span className="tiny">중요한 결정이라 시간을 멈췄습니다.</span>
            <button className="btn small" onClick={() => act((g) => setSpeed(g, g.speed || 1))}>
              ▶ 계속
            </button>
          </div>
        )}
        {notice && (
          <div className="notice">
            {notice}{' '}
            <button className="btn small ghost" onClick={clearNotice}>
              확인
            </button>
          </div>
        )}
      </main>

      {empModal && <EmployeeModal id={empModal} onClose={() => setEmpModal(null)} onMessage={(id) => {
            setEmpModal(null);
            openDesktop('messenger', `dm-${id}`);
          }} />}
      {dev && <DevPanel onClose={() => setDev(false)} />}
    </div>
  );
}

function stageName(id: string): string {
  return { angel: '엔젤', preseed: '프리시드', seed: '시드' }[id] ?? `시리즈 ${id}`;
}
