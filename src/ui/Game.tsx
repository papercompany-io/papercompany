// 게임 화면: DT-09 사무실 메인 화면 + 위 막대(DT-05 회사·자금·시계·배속) + 왼쪽 메뉴·앱 창(DT-02/03) + 알림(DT-04)·목표·긴급 결정 창.
// 배치는 Startup Company를 따릅니다(A-83): 화면 전체 사무실, 위 가로 막대, 왼쪽 세로 메뉴, 메뉴를 누르면 가운데 창. 책상·가구 배치는 상점에서 시작(A-87).
import { ProductCard } from './apps/ProductApp';
import { paydayForecast } from '../core/forecast';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { advance, isRunning, setSpeed } from '../core/sim';
import { autoSkipDue, clockHour, clockText, inNight, shownDay, workingLate } from '../core/night';
import { dateOf, formatDate } from '../core/calendar';
import { founderPct } from '../core/equity';
import { DATA, industry, market, MARKET_IDS } from '../core/data';
import { currentPL, runwayMonths } from '../core/finance';
import { computeValuation } from '../core/valuation';
import { coreFeatures, featureLevel, hasMvp, quality } from '../core/product';
import { liveUsers } from '../core/market';
import { myRank, rankings } from '../core/ranking';
import { activeMissions, missionProgress, STAGE_NAMES } from '../core/progress';
import { founderAge } from '../core/career';
import { burningActive } from '../core/burning';
import { act, getGame, timeHold, touch, useGame } from './store';
import { AppPanel, Sidebar, defaultBox, type AppId, type WinBox } from './Desktop';
import { Office } from './office/Office';
import { EmployeeModal } from './EmployeeModal';
import { MeetingModal } from './MeetingModal';
import { DevPanel } from './DevPanel';
import { Money, useTween } from './common';
import { ServiceLogo } from './logo';
import { nextHint } from './hints';
import { requestAutosave } from './autosave';
import { countShort, pct, wonShort } from '../core/format';
import { play, type Sfx } from './sound';
import { getSettings, toggleAutoSkip, useSettings } from './meta';
import { Toasts, DecisionModal, Confetti, SideStack } from './Feedback';
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

// 열린 앱 창(A-124): 여러 개를 띄우고, z가 클수록 앞. nonce는 이미 열린 창을 다른 인자(채널 등)로 다시 열 때 내용을 새로 그리려고 씀
interface Win {
  app: AppId;
  arg?: string;
  box: WinBox;
  z: number;
  nonce: number;
}

export function Game({ continued, notice, clearNotice, onEnded }: Props) {
  const s = useGame();
  const settings = useSettings();
  const [wins, setWins] = useState<Win[]>([]);
  const zTop = useRef(0);
  const front = wins.length ? wins.reduce((a, b) => (a.z > b.z ? a : b)) : null;
  // 창 열기: 이미 열려 있으면 앞으로(인자가 있으면 그 내용으로), 없으면 새 창
  const showApp = (app: AppId, arg?: string) =>
    setWins((ws) => {
      const z = ++zTop.current;
      const i = ws.findIndex((w) => w.app === app);
      if (i < 0) return [...ws, { app, arg, z, nonce: 0, box: defaultBox(ws.length) }];
      const n = [...ws];
      n[i] = arg === undefined ? { ...n[i], z } : { ...n[i], arg, z, nonce: n[i].nonce + 1 };
      return n;
    });
  const closeApp = (app: AppId) => setWins((ws) => ws.filter((w) => w.app !== app));
  const [openedOnce, setOpenedOnce] = useState(continued);
  const [empModal, setEmpModal] = useState<string | null>(null);
  const [dev, setDev] = useState(false);
  const [urgentId, setUrgentId] = useState<string | null>(null);
  const [floats, setFloats] = useState<FloatFx[]>([]);
  const [confetti, setConfetti] = useState(0);
  // 멈춘 채로 공고·투자를 시작하면 묻는 팝업(A-126). 같은 멈춤 동안 "그대로 두기"를 고르면 다시 묻지 않음
  const [waitAsk, setWaitAsk] = useState<string | null>(null);
  const waitDismissed = useRef(false);
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
      if (g && isRunning(g) && !timeHold.nego) {
        const day = g.day;
        advance(g, dt, autoSkipDue(g, getSettings().autoSkipNight)); // 퇴근 뒤 자동 빨리 감기(A-159)
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
      if (e.type === 'offerReady') showApp('invest');
      if (e.type === 'needsTime' && !isRunning(s) && !s.ended && !waitDismissed.current) setWaitAsk(e.what);
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

  const running = !!s && isRunning(s);
  useEffect(() => {
    if (!running) return;
    waitDismissed.current = false;
    setWaitAsk(null);
  }, [running]);

  useEffect(() => {
    if (s?.ended) {
      const t = setTimeout(onEnded, 900);
      return () => clearTimeout(t);
    }
  }, [s?.ended, onEnded]);

  // CO-02: 엔젤 투자를 고른 경우 처음 들어올 때 투자 메뉴을 엽니다.
  useEffect(() => {
    if (s?.wantsAngelOnStart) {
      act((g) => (g.wantsAngelOnStart = false));
      showApp('invest', 'angel');
      setOpenedOnce(true);
    }
  }, [s?.wantsAngelOnStart]);

  // 단축키: 스페이스 일시정지, 1~3 배속, Esc 창 닫기, ` 또는 F9 개발 패널
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
        // 맨 앞 창부터 하나씩 닫음
        setEmpModal(null);
        setWins((ws) => (ws.length ? ws.filter((w) => w !== ws.reduce((a, b) => (a.z > b.z ? a : b))) : ws));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!s) return null;

  const openDesktop = (app: AppId, arg?: string) => {
    showApp(app, arg);
    setOpenedOnce(true);
    play('open');
  };
  // 왼쪽 메뉴: 맨 앞 창이면 닫고, 뒤에 열려 있으면 앞으로, 없으면 열기
  const toggleApp = (app: AppId) => {
    if (front?.app === app) {
      closeApp(app);
      play('close');
    } else openDesktop(app);
  };

  const urgent = urgentId ? s.decisions.find((d) => d.id === urgentId && !d.resolved) : undefined;

  return (
    <div className="game">
      <main className="stage">
        <Office onCeo={() => openDesktop('schedule')} onEmployee={(id) => setEmpModal(id)} pulseCeo={!openedOnce} keysEnabled={!wins.length && !empModal} floats={floats} />
        <TopBar s={s} />
        <Sidebar app={front?.app ?? null} open={wins.map((w) => w.app)} onOpen={toggleApp} />
        {/* 창 층(A-124): 창끼리 순서는 이 안에서만 바뀌어 알림(토스트)보다 위로 올라가지 않음 */}
        <div className="win-layer">
        {wins.map((w) => (
          <AppPanel
            key={`${w.app}-${w.nonce}`}
            app={w.app}
            arg={w.arg}
            box={w.box}
            z={wins.filter((x) => x.z < w.z).length}
            focused={w === front}
            onFocus={() => w !== front && showApp(w.app)}
            onBox={(box) => setWins((ws) => ws.map((x) => (x.app === w.app ? { ...x, box } : x)))}
            setApp={(app, arg) => {
              showApp(app, arg);
              play('open');
            }}
            onClose={() => {
              closeApp(w.app);
              play('close');
            }}
          />
        ))}
        </div>
        {s.pauseReason && !s.ended ? (
          // 일시정지는 위험이 아니라 "멈춤": 빨강 대신 흰 카드 + 주황(배속 버튼과 같은 색)
          <div className="hint paused" data-testid="hint">
            <span className="hint-pause-ic">
              <PauseIcon />
            </span>
            <div className="hint-body">
              <b className="hint-title">일시정지</b>
              <span>{s.pauseReason}</span>
            </div>
            <button className="btn green" data-testid="pause-resume" onClick={() => act((g) => setSpeed(g, g.speed || 1))}>
              ▶ 계속 <kbd>Space</kbd>
            </button>
          </div>
        ) : (
          <div className={`hint ${paydayForecast(s).cashAfter <= 0 ? 'urgent' : ''}`} data-testid="hint">
            <span className="hint-tag">다음 할 일</span>
            <span>{nextHint(s, openedOnce)}</span>
          </div>
        )}
        {!wins.length && <SideCards s={s} onOpen={(a) => openDesktop(a)} />}
        <SideStack s={s} onOpen={(app, arg) => openDesktop(app as AppId, arg)} />
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

      {s.meeting && <MeetingModal />}
      {urgent && !s.meeting && (
        <DecisionModal
          d={urgent}
          onClose={() => setUrgentId(null)}
          onOpenMessenger={() => {
            setUrgentId(null);
            openDesktop('messenger', urgent.channelId);
          }}
        />
      )}
      {empModal && (
        <EmployeeModal
          id={empModal}
          onClose={() => setEmpModal(null)}
          onDm={(id) => {
            setEmpModal(null);
            openDesktop('messenger', `dm-${id}`);
          }}
          onManage={() => {
            setEmpModal(null);
            openDesktop('employees');
          }}
        />
      )}
      {waitAsk && (
        <WaitTimeModal
          what={waitAsk}
          onResume={() => {
            act((g) => setSpeed(g, g.speed || settingsSpeed()));
            setWaitAsk(null);
          }}
          onStay={() => {
            waitDismissed.current = true;
            setWaitAsk(null);
          }}
        />
      )}
      {dev && <DevPanel onClose={() => setDev(false)} />}
    </div>
  );
}

// 받침이 있으면 "은", 없으면 "는"
function eunNeun(word: string): string {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  return c >= 0 && c < 11172 && c % 28 !== 0 ? '은' : '는';
}

// 시간이 멈춰 있는데 시간이 흘러야 진행되는 일을 시작했을 때(A-126)
function WaitTimeModal({ what, onResume, onStay }: { what: string; onResume: () => void; onStay: () => void }) {
  const why = what === '채용 공고' ? '지원자는 하루 중 한 명씩 들어옵니다.' : '투자사 답장은 하루 이상 걸립니다.';
  return (
    <div className="modal-bg" onClick={onStay}>
      <div className="modal wait-modal" data-testid="wait-time" onClick={(e) => e.stopPropagation()}>
        <b className="wait-title">
          <PauseIcon /> 시간이 멈춰 있습니다
        </b>
        <p>
          {what}
          {eunNeun(what)} 시간이 흘러야 진행됩니다. {why}
        </p>
        <div className="row">
          <div className="grow" />
          <button className="btn small ghost" data-testid="wait-stay" onClick={onStay}>
            멈춘 채로 두기
          </button>
          <button className="btn small green" data-testid="wait-resume" onClick={onResume}>
            ▶ 시간 흐르게 하기
          </button>
        </div>
      </div>
    </div>
  );
}

function settingsSpeed() {
  return getSettings().defaultSpeed || 1;
}

// A-184 자금이 바뀔 때: 숫자가 잠깐 초록(들어옴)·빨강(나감)으로 빛나고, 바뀐 만큼이 아래 런웨이 줄에 잠깐 떴다 사라짐
type CashPop = { id: number; d: number };
function CashFlash({ cash, children }: { cash: number; children: ReactNode }) {
  const prev = useRef(cash);
  const seq = useRef(0);
  const [pops, setPops] = useState<CashPop[]>([]);
  const [tone, setTone] = useState<{ k: number; up: boolean } | null>(null);
  useEffect(() => {
    const d = cash - prev.current;
    prev.current = cash;
    if (Math.abs(d) < 1e4) return; // 만원 아래 끝전은 그냥 넘김
    const id = ++seq.current;
    setTone({ k: id, up: d > 0 });
    setPops((p) => [...p.slice(-2), { id, d }]);
    window.setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1300); // 다음 변화가 와도 지우지 않고 제때 사라지게
  }, [cash]);
  return (
    <span className="cash-flash">
      <span key={tone?.k ?? 0} className={tone ? (tone.up ? 'cf-up' : 'cf-down') : ''}>
        {children}
      </span>
      {pops.map((p) => (
        <span key={p.id} className={`cash-pop ${p.d > 0 ? 'up' : 'down'}`} aria-hidden>
          {p.d > 0 ? '+' : '−'}
          {wonShort(Math.abs(p.d))}
        </span>
      ))}
    </span>
  );
}

// 위 가로 막대(Startup Company식): 왼쪽 회사, 가운데 자금·지표, 오른쪽 날짜·시각·배속·저장(DT-05)
function TopBar({ s }: { s: GameState }) {
  const d = dateOf(shownDay(s));
  const frac = (clockHour(s) - DATA.time.workStartHour) / 24; // 테두리: 출근(9시)부터 다음 날 9시까지 한 바퀴
  const night = inNight(s);
  const late = workingLate(s);
  const autoSkip = useSettings().autoSkipNight;
  const due = autoSkipDue(s, autoSkip);
  const fast = isRunning(s) && due; // 멈춰 있으면 감는 중이 아님
  const fc = paydayForecast(s);
  const rw = runwayMonths(s);
  const net = currentPL(s).netIncome;
  const cashShown = useTween(s.cash);
  const users = liveUsers(s); // 하루 끝에 한꺼번에 바뀌지 않고 시간 따라 오르내림(A-174)
  const cores = coreFeatures(s);
  const coreDone = cores.filter((f) => featureLevel(s, f.id) >= 1).length;
  return (
    <header className="topbar" data-testid="hud" onPointerDown={(e) => e.stopPropagation()}>
      {/* 왼쪽 카드(한 줄): 자금 · 기업가치 · 고객 */}
      <div className="hud-card hud-main">
        <div className="tb-row">
          <div className="tb-stats">
            <div className="tb-stat cash" title={`회사 자금 · 이번 달 손익 ${net >= 0 ? '흑자' : '적자'}`}>
              <PxIcon id="coin" size={18} />
              <div>
                <CashFlash cash={s.cash}>
                  <Money v={Math.round(cashShown)} testId="hud-cash" />
                </CashFlash>
                <span className={net >= 0 ? 'up' : 'down'}>{net >= 0 ? '▲' : '▼'}</span>
                <small className={fc.cashAfter <= 0 || (rw !== null && rw < 3) ? 'bad' : ''}>런웨이 {rw === null ? '흑자' : rw > 120 ? '10년+' : `${rw.toFixed(1)}개월`}</small>
              </div>
            </div>
            <div className="tb-stat" title={s.public ? '시가총액' : '기업가치'}>
              <PxIcon id="chart" size={18} />
              <div>
                <span data-testid="hud-valuation">
                  <Money v={computeValuation(s).value} />
                </span>
                <small data-testid="hud-equity">내 지분 {founderPct(s) >= 0.9995 ? '100%' : pct(founderPct(s))}</small>
              </div>
            </div>
            <div className="tb-stat" title={`${industry(s.company.industry).unit} ${Math.floor(users).toLocaleString('ko-KR')}`}>
              <PxIcon id="users" size={18} />
              <div>
                {/* 100만 넘으면 짧게(A-158): 3,400만 · 4.2억 */}
                <span data-testid="hud-users">{users >= 1e6 ? countShort(users) : Math.floor(users).toLocaleString('ko-KR')}</span>
                <small>{hasMvp(s) ? `품질 ${quality(s)}점` : `핵심 기능 ${coreDone}/${cores.length}`}</small>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* 오른쪽 카드(시간): 윗줄 날짜 · 경기 · 대표 나이(카드 테두리는 하루 진행), 아랫줄 시각 · 배속 */}
      <div className="hud-card hud-time" data-testid="hud-time">
        {/* 하루 진행: 카드 테두리가 위 왼쪽에서 시계 방향으로 차오름 */}
        <svg className="hud-ring" aria-hidden>
          <rect className="ring-track" pathLength={100} />
          <rect className="ring-fill" pathLength={100} strokeDasharray={`${(frac * 100).toFixed(2)} 100`} />
        </svg>
        <div className="tb-row tb-row1">
          <div className="tb-date" data-testid="hud-date">
            <span>
              {formatDate(shownDay(s))} ({WEEK[d.getUTCDay()]})
            </span>
            <span className={`hud-econ ${s.economy.phase}`} title="경기">
              {s.economy.phase === 'boom' ? '호황' : s.economy.phase === 'recession' ? '불황' : '보통'}
            </span>
          </div>
          <div className="tb-age">
            {/* 운영일(A-123): 창업한 날이 D+1 */}
            <span className="tb-dday" data-testid="hud-dday" title="창업한 날부터 센 운영일">
              D+{s.day - s.company.startDay + 1}
            </span>
            대표 <b>{Math.floor(founderAge(s))}</b>세
          </div>
        </div>
        <div className="tb-row tb-row2">
          <span className={`tb-clock ${night ? 'night' : ''}`} title={night ? '퇴근 뒤 시각' : '현재 시각'} data-testid="hud-clock">
            {clockText(s)}
          </span>
          {/* 퇴근 뒤(A-149): 야근 중인 사람 수와 자동 빨리 감기 켜고 끄기(A-159, 밤에만 보임) */}
          {night && late.length > 0 && (
            <span className="tb-late" data-testid="hud-late" title={`야근 중: ${late.map((e) => e.name).join(', ')}`}>
              야근 {late.length}명
            </span>
          )}
          {night && (
            <button
              className={`tb-skip ${autoSkip !== 'off' ? 'on' : ''} ${fast ? 'fast' : ''}`}
              data-testid="skip-night"
              aria-pressed={autoSkip !== 'off'}
              title={
                autoSkip === 'off'
                  ? '켜면 밤을 빠르게 흘려 보냅니다. 다음 밤에도 켜져 있습니다.'
                  : !due
                    ? '야근하는 사람이 모두 퇴근하면 빨리 감습니다. 누르면 끕니다.'
                    : fast
                      ? '아침까지 빨리 감는 중입니다. 누르면 끕니다.'
                      : '시간이 다시 흐르면 아침까지 빨리 감습니다. 누르면 끕니다.'
              }
              onClick={() => {
                toggleAutoSkip();
                play('click');
              }}
            >
              빨리 감기 <FastIcon />
            </button>
          )}
          {/* 버닝 중(A-131) */}
          {burningActive(s) && (
            <span className="tb-burn" data-testid="hud-burning" title="버닝: 팀이 더 빨리 일하는 중">
              버닝 {s.company.burning!.until - s.day}일
            </span>
          )}
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
        </div>
      </div>
    </header>
  );
}

// 오른쪽 위: 지금 단계의 목표(튜토리얼·마일스톤)
function SideCards({ s, onOpen }: { s: GameState; onOpen: (a: AppId) => void }) {
  const next = activeMissions(s)[0];
  const p = next ? missionProgress(s, next) : 1;
  return (
    <aside className="side-cards" onPointerDown={(e) => e.stopPropagation()}>
      {/* 회사 정보: 로고 + 이름 */}
      <div className="co-card" data-testid="company-card">
        <div className="co-name">
          <ServiceLogo service={s.company.service} fallback={s.company.name} size={16} />
          <b>{s.company.name}</b>
        </div>
      </div>
      {/* 제품 카드: 출시 전 MVP 진행, 출시 후 순위·품질·사용자 */}
      <ProductCard onOpen={() => onOpen('product')} />
      {/* 다음 마일스톤: 누르면 전체 목표 */}
      <button className="ms-card" data-testid="missions" onClick={() => onOpen('career')}>
        <span className="ms-label">다음 목표</span>
        <b className="ms-title">{next ? next.name : '모든 목표를 달성했습니다'}</b>
        {next && <span className="ms-desc">{next.guide}</span>}
        {next && (
          <span className="ms-meter" aria-label={`${Math.round(p * 100)}%`}>
            <i style={{ width: `${p * 100}%` }} />
          </span>
        )}
      </button>
      <RankCard s={s} onOpen={() => onOpen('ranking')} />
    </aside>
  );
}

// 오른쪽 아래: 시장 랭킹 요약(누르면 시장 랭킹 창). 가장 고객이 많은 시장의 순위를 보여 줍니다.
function RankCard({ s, onOpen }: { s: GameState; onOpen: () => void }) {
  const launched = MARKET_IDS.filter((m) => s.markets[m].launched);
  const rk = rankings(s);
  const mine = myRank(rk.overall);
  const best = launched.length ? launched.map((m) => ({ m, r: myRank(rk.markets[m]) })).filter((x) => x.r).sort((a, b) => b.r!.users - a.r!.users)[0] : undefined;
  const list = best ? rk.markets[best.m] : rk.overall;
  const head = list.slice(0, 3);
  return (
    <button className="ms-card rank-card" data-testid="rank-card" onClick={onOpen}>
      <span className="ms-label">{best ? `${market(best.m).name} 시장 순위` : '시장 순위'}</span>
      {mine && best?.r ? (
        <b className="ms-title">
          {best.r.rank}위<span className="rank-of"> / {list.length}곳</span>
        </b>
      ) : (
        <b className="ms-title">출시 후 순위가 매겨집니다</b>
      )}
      <span className="rank-mini">
        {head.map((r) => (
          <span key={r.id} className={`rank-line ${r.me ? 'me' : ''}`}>
            <i>{r.rank}</i>
            <span>{r.name}</span>
          </span>
        ))}
      </span>
    </button>
  );
}

const PauseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12">
    <rect x="2" y="1" width="3" height="10" fill="currentColor" />
    <rect x="7" y="1" width="3" height="10" fill="currentColor" />
  </svg>
);
// 빨리 감기(▶▶)
const FastIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12">
    <path d="M1 1 L6 6 L1 11 Z M6 1 L11 6 L6 11 Z" fill="currentColor" />
  </svg>
);
const PlayIcon = ({ n }: { n: number }) => (
  <svg width={6 + n * 6} height="12" viewBox={`0 0 ${6 + n * 6} 12`}>
    {Array.from({ length: n }, (_, i) => (
      <path key={i} d={`M${i * 6 + 1} 1 L${i * 6 + 8} 6 L${i * 6 + 1} 11 Z`} fill="currentColor" />
    ))}
  </svg>
);
