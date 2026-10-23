// DT-02/03 앱: Startup Company처럼 왼쪽 메뉴에서 바로 열고, 사무실 위에 창으로 뜹니다(A-83).
// 창은 여러 개 열 수 있고, 제목줄을 끌어 옮기고 네 변·모서리를 끌어 크기를 바꿉니다(A-124, A-218). 가장자리에 붙이면 반쪽 크기, Tab은 바로 전 창.
// 회사 단계가 오르면 새 앱이 열리고(NEW 표시), 메뉴 버튼에 알림 배지(DT-04)가 붙습니다.
import { useLayoutEffect, useRef, useState } from 'react';
import { unreadTotal } from '../core/messenger';
import { contractsOpen } from '../core/contracts';
import { useGame } from './store';
import { getSettings, useSettings } from './meta';
import { ScheduleApp } from './apps/ScheduleApp';
import { EmployeesApp } from './apps/EmployeesApp';
import { MessengerApp } from './apps/MessengerApp';
import { InvestApp } from './apps/InvestApp';
import { FinanceApp } from './apps/FinanceApp';
import { ProductApp } from './apps/ProductApp';
import { ContractApp } from './apps/ContractApp';
import { MarketApp } from './apps/MarketApp';
import { OfficeApp } from './apps/OfficeApp';
import { ShopApp } from './apps/ShopApp';
import { requestEdit } from './office/placement';
import { StockApp } from './apps/StockApp';
import { RankingApp } from './apps/RankingApp';
import { CareerApp } from './apps/CareerApp';
import { SettingsApp } from './apps/SettingsApp';
import { AppIcon, APP_COLORS } from './icons';
import type { GameState } from '../core/types';
import './desktop.css';

export type AppId = 'schedule' | 'messenger' | 'product' | 'contract' | 'market' | 'hiring' | 'employees' | 'team' | 'ai' | 'office' | 'shop' | 'invest' | 'finance' | 'exit' | 'stock' | 'career' | 'ranking' | 'settings';

// 일정은 왼쪽 메뉴에 없음: 사무실에서 대표(나)를 눌러야만 열림(창 제목·알림 연결용으로 목록에는 둠)
export const APPS: { id: AppId; name: string; unit: string; desc: string; stage: number; publicOnly?: boolean; hideLocked?: boolean; noMenu?: boolean }[] = [
  { id: 'schedule', name: 'CEO 일정', unit: 'F14 대표 행동', desc: '개발 사이클·약속·외출', stage: 0, noMenu: true },
  { id: 'messenger', name: '메신저', unit: 'F06 메신저', desc: '팀 지시·결정', stage: 0 },
  { id: 'product', name: '업무', unit: 'F09 업무', desc: '제품 개발·마케팅', stage: 0 }, // A-136: 제품 → 업무
  { id: 'contract', name: '외주', unit: 'A-207 외주', desc: '일감·평판', stage: 0, hideLocked: true }, // A-207: 업무 창의 외주 탭을 따로 뗌. 외주를 받을 수 없게 되면 메뉴에서 사라짐
  { id: 'market', name: '시장', unit: 'RV 시장·경쟁', desc: '고객·점유율·경쟁사', stage: 1 },
  { id: 'employees', name: '직원 관리', unit: 'F05 직원·조직', desc: '직원·채용·팀·복지·AI', stage: 0 },
  // A-213: 채용·팀·AI 도입은 직원 관리 창의 탭. 알림·다른 창이 예전 id로 열면 appRoute가 그 탭으로 보냄
  { id: 'hiring', name: '채용', unit: 'F04 채용', desc: '공고·지원자', stage: 0, noMenu: true },
  { id: 'team', name: '팀', unit: 'A-191 부서 일', desc: '부서별 하는 일·지시', stage: 0, noMenu: true },
  { id: 'ai', name: 'AI 도입', unit: 'F07 AI 도입', desc: '모델·적용률', stage: 1, noMenu: true },
  { id: 'shop', name: '상점', unit: 'OF-07 상점', desc: '책상·가구 사서 놓기', stage: 0 },
  { id: 'office', name: '사무실', unit: 'OF-07 사무실', desc: '넓이·이전', stage: 0, noMenu: true }, // A-214: 오른쪽 위 회사 카드의 이사가기 모달로 옮김
  { id: 'invest', name: '투자', unit: 'F08 투자 유치', desc: '라운드·지분·Exit', stage: 0 },
  { id: 'finance', name: '재무', unit: 'F10 재무·기업가치', desc: '손익·자금·가치', stage: 0 },
  { id: 'exit', name: 'Exit', unit: 'F12 Exit', desc: '매각·IPO', stage: 1, noMenu: true }, // A-215: 투자 창의 Exit 탭으로 합침
  { id: 'stock', name: '주식', unit: '상장사', desc: '주가·실적·지분 매각', stage: 5, publicOnly: true },
  { id: 'ranking', name: '시장 랭킹', unit: 'A-120 랭킹', desc: '시장별 고객 수 순위', stage: 0, noMenu: true },
  { id: 'career', name: '커리어', unit: '미션·업적', desc: '목표·업적·기록', stage: 0 },
  { id: 'settings', name: '설정', unit: 'DT-08 설정', desc: '소리·화면·종료', stage: 0 },
];

// 예전 앱 id → 직원 관리 창의 탭(A-213). arg는 EmployeesApp initial('team-dev'처럼)
export function appRoute(app: AppId, arg?: string): [AppId, string | undefined] {
  if (app === 'hiring') return ['employees', 'hire'];
  if (app === 'ai') return ['employees', 'ai'];
  if (app === 'team') return ['employees', arg ? `team-${arg}` : 'team'];
  if (app === 'exit') return ['invest', 'exit']; // A-215
  return [app, arg];
}

export function appOpen(s: GameState, id: AppId): boolean {
  const a = APPS.find((x) => x.id === id)!;
  if (a.publicOnly) return !!s.public;
  if (id === 'contract') return !!s.contracts?.active || contractsOpen(s);
  return s.company.stage >= a.stage;
}

// 외주 메뉴 뱃지(A-207): 업무 창 탭 이름에 붙던 "진행 중"·제안 수를 메뉴 숫자로
function contractBadge(s: GameState): number {
  // TODO(human)
  return 0;
}

export function badge(s: GameState, id: AppId): number {
  switch (id) {
    case 'messenger':
      return unreadTotal(s, getSettings().muteChatter);
    case 'employees':
      return s.applicants.filter((a) => a.status === 'waiting').length;
    case 'invest':
      return (s.rounds.some((r) => r.status === 'offer') ? 1 : 0) + (s.exitAttempt?.status === 'offer' ? 1 : 0); // A-215: 인수 제안도
    case 'product':
      return s.product.roadmap.length === 0 ? 1 : 0;
    case 'contract':
      return contractBadge(s);
    default:
      return 0;
  }
}

// 왼쪽 메뉴(Startup Company식): 앱 버튼이 세로로 늘 떠 있고, 누르면 사무실 위에 창이 뜹니다.
// app = 맨 앞 창, open = 열려 있는 창 전부(A-124)
export function Sidebar({ app, open = [], onOpen }: { app: AppId | null; open?: AppId[]; onOpen: (id: AppId) => void }) {
  const s = useGame();
  useSettings(); // 잡담 알림 끄기를 바꾸면 메신저 뱃지를 다시 셈
  const seen = seenApps(s);
  return (
    <nav className="sidebar" data-testid="sidebar" onPointerDown={(e) => e.stopPropagation()}>
      {APPS.map((a) => {
        const on = appOpen(s, a.id);
        if (a.id === 'settings' || a.noMenu || ((a.publicOnly || a.hideLocked) && !on)) return null; // 설정은 아래 작은 아이콘
        const b = on ? badge(s, a.id) : 0;
        return (
          <button
            key={a.id}
            className={`sb-item ${app === a.id || open.includes(a.id) ? 'on' : ''} ${on ? '' : 'locked'}`}
            data-testid={`app-${a.id}`}
            disabled={!on}
            title={on ? `${a.name} · ${a.desc}` : `${a.name} · 단계 ${a.stage}에 열림`}
            onClick={() => {
              markSeen(s, a.id);
              onOpen(a.id);
            }}
            style={{ ['--ac' as string]: APP_COLORS[a.id] }}
          >
            <span className="sb-icon">
              <AppIcon id={a.id} />
            </span>
            <span className="sb-name">{a.name}</span>
            {b > 0 && <span className="sb-badge">{b > 99 ? '99+' : b}</span>}
            {on && !seen.includes(a.id) && a.stage > 0 && <span className="sb-new">NEW</span>}
          </button>
        );
      })}
      <button
        className={`sb-gear ${app === 'settings' || open.includes('settings') ? 'on' : ''}`}
        data-testid="app-settings"
        title="설정 · 소리·화면·종료"
        aria-label="설정"
        onClick={() => onOpen('settings')}
        style={{ ['--ac' as string]: APP_COLORS.settings }}
      >
        <AppIcon id="settings" />
      </button>
    </nav>
  );
}

const SEEN = 'seen-apps';
function seenApps(s: GameState): string[] {
  return (s.flags.find((f) => f.startsWith(SEEN)) ?? `${SEEN}:`).slice(SEEN.length + 1).split(',').filter(Boolean);
}
function markSeen(s: GameState, id: AppId) {
  const seen = seenApps(s);
  if (seen.includes(id)) return;
  s.flags = s.flags.filter((f) => !f.startsWith(SEEN));
  s.flags.push(`${SEEN}:${[...seen, id].join(',')}`);
}

// 창 위치·크기(A-124). 화면(.stage) 왼쪽 위 기준 px
export interface WinBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_W = 420;
const MIN_H = 280;

function cssPx(name: string, fallback: number): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
}

// 창이 놓일 수 있는 넓이: 위 막대 아래, 왼쪽 메뉴 오른쪽, 오른쪽 카드 왼쪽(A-219: 카드가 창에 가리지 않게)
export function winArea() {
  const top = cssPx('--top-h', 86) + 12;
  const left = cssPx('--side-w', 84) + 14;
  const right = cssPx('--cards-w', 216) + 24;
  return { left, top, w: Math.max(MIN_W, window.innerWidth - left - right), h: Math.max(MIN_H, window.innerHeight - top - 14) };
}

// 기본 크기는 화면을 다 덮지 않는 보통 크기(가로 960·세로 680까지, 화면의 70%·82%까지). 내용이 더 커야 하면 열 때 내용에 맞게 키움(fitMin).
// 창이 여러 개면 비스듬히 겹쳐 엽니다.
export function defaultBox(index: number): WinBox {
  const a = winArea();
  const k = index % 6;
  const w = Math.max(MIN_W, Math.min(960, Math.round(a.w * 0.7)));
  const h = Math.max(MIN_H, Math.min(680, Math.round(a.h * 0.82)));
  return clampBox({ x: a.left + 36 * k, y: a.top + 30 * k, w, h });
}

// 제목줄 두 번 누르기: 넓게(창이 놓일 수 있는 곳 전부)
export function wideBox(): WinBox {
  const a = winArea();
  return { x: a.left, y: a.top, w: Math.min(1240, a.w), h: a.h };
}

// 제목줄이 늘 화면 안에 남게(끌어서 화면 밖으로 잃어버리지 않게). min = 그 창 내용이 들어가는 최소 크기(A-124)
export function clampBox(b: WinBox, min: { w: number; h: number } = { w: MIN_W, h: MIN_H }): WinBox {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const w = Math.max(Math.min(W, min.w), Math.min(W, b.w));
  const h = Math.max(Math.min(H, min.h), Math.min(H, b.h));
  return { w, h, x: Math.max(120 - w, Math.min(W - 120, b.x)), y: Math.max(0, Math.min(H - 48, b.y)) };
}

// 크기 바꾸는 테두리(A-218): 네 변 + 네 모서리. 글자는 움직이는 쪽(n 위, s 아래, w 왼쪽, e 오른쪽)
type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

// 테두리를 끈 만큼 크기를 바꿈. 왼쪽·위 변은 반대쪽 변이 제자리에 있게 x·y도 같이 옮김(최소 크기에서 멈춤)
function resizeBox(b: WinBox, edge: Edge, dx: number, dy: number, min: { w: number; h: number }): WinBox {
  let { x, y, w, h } = b;
  if (edge.includes('e')) w = Math.max(min.w, b.w + dx);
  if (edge.includes('s')) h = Math.max(min.h, b.h + dy);
  if (edge.includes('w')) {
    w = Math.max(min.w, b.w - dx);
    x = b.x + b.w - w;
  }
  if (edge.includes('n')) {
    h = Math.max(min.h, b.h - dy);
    y = b.y + b.h - h;
  }
  return { x, y, w, h };
}

// 끌어서 화면 가장자리에 붙이기(A-218): 포인터가 창 놓는 곳 바깥(왼쪽 메뉴·위 막대·화면 끝)까지 가면 그 쪽 절반, 모서리면 4분의 1.
// 붙일 곳이 아니면 null
const SNAP_PX = 12;
function snapBox(px: number, py: number): WinBox | null {
  const a = winArea();
  const gap = 6;
  const L = px <= a.left - 4;
  const R = px >= window.innerWidth - SNAP_PX;
  const T = py <= a.top - 4;
  const B = py >= window.innerHeight - SNAP_PX;
  if (!L && !R && !T && !B) return null;
  const halfW = Math.round((a.w - gap) / 2);
  const halfH = Math.round((a.h - gap) / 2);
  const x = R ? a.left + a.w - halfW : a.left;
  const y = B ? a.top + a.h - halfH : a.top;
  const w = L || R ? halfW : a.w;
  const h = T || B ? halfH : a.h;
  return { x, y, w, h };
}

// 앱 창: 사무실 위에 뜨는 패널. 제목줄을 끌면 옮기고, 네 변·모서리를 끌면 크기가 바뀝니다(A-218). 제목줄을 두 번 누르면 넓게.
// 끌어서 화면 가장자리에 붙이면 반쪽(모서리는 4분의 1)에 맞춰지고, 붙은 창을 다시 끌면 원래 크기로 돌아옵니다.
export function AppPanel({
  app,
  arg,
  setApp,
  onClose,
  box,
  z = 0,
  focused = true,
  onFocus,
  onBox,
}: {
  app: AppId;
  arg?: string;
  setApp: (a: AppId, arg?: string) => void;
  onClose: () => void;
  box?: WinBox;
  z?: number;
  focused?: boolean;
  onFocus?: () => void;
  onBox?: (b: WinBox) => void;
}) {
  const cur = APPS.find((a) => a.id === app)!;
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: 'move' | Edge; px: number; py: number; b: WinBox; min: { w: number; h: number }; snap: WinBox | null } | null>(null);
  const restore = useRef<WinBox | null>(null); // 붙이기 전 크기. 붙은 채로 끌면 이 크기로 돌아옴
  const [ghost, setGhost] = useState<WinBox | null>(null); // 놓으면 붙을 자리 미리 보기
  // 최소 크기 = 내용에 맞춘 크기(fit content): 가로는 내용이 잘리지 않는 가장 좁은 폭, 세로는 지금 폭에서 내용이 다 보이는 높이.
  // 내용이 기본 높이보다 길면 기본 높이까지만(그 아래는 창 안에서 스크롤). 긴 앱이 늘 화면을 다 덮지 않게
  const fitMin = () => {
    const p = el.current;
    if (!p) return { w: MIN_W, h: MIN_H };
    const { width, height } = p.style;
    p.style.width = 'min-content';
    const w = p.offsetWidth;
    p.style.width = width;
    p.style.height = 'auto';
    const h = p.offsetHeight;
    p.style.height = height;
    return { w: Math.max(240, w), h: Math.max(160, Math.min(h, defaultBox(0).h)) };
  };
  // 처음 열 때 내용보다 작으면 내용에 맞게 키움
  useLayoutEffect(() => {
    if (!box || !onBox) return;
    const min = fitMin();
    if (box.w < min.w || box.h < min.h) onBox(clampBox(box, min));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const grab = (kind: 'move' | Edge) => (e: React.PointerEvent) => {
    if (!box || !onBox || e.button !== 0) return;
    if (kind === 'move' && (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (kind !== 'move') restore.current = null; // 붙은 창의 크기를 직접 바꾸면 그 크기가 새 기준
    drag.current = { kind, px: e.clientX, py: e.clientY, b: box, min: fitMin(), snap: null };
  };
  const follow = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !onBox) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (d.kind !== 'move') return onBox(clampBox(resizeBox(d.b, d.kind, dx, dy, d.min), d.min));
    // 붙은 창을 떼면 붙이기 전 크기로, 잡은 곳이 제목줄 같은 비율 위치에 오게
    const r = restore.current;
    if (r && Math.abs(dx) + Math.abs(dy) > 6) {
      const ratio = (d.px - d.b.x) / d.b.w;
      d.b = { ...r, x: d.px - ratio * r.w, y: d.b.y };
      restore.current = null;
    }
    onBox(clampBox({ ...d.b, x: d.b.x + dx, y: d.b.y + dy }, d.min));
    d.snap = snapBox(e.clientX, e.clientY);
    setGhost(d.snap);
  };
  const drop = () => {
    const d = drag.current;
    drag.current = null;
    setGhost(null);
    if (!d?.snap || !onBox) return;
    if (!restore.current) restore.current = d.b;
    // 세로는 반쪽에 맞춤(긴 내용은 창 안에서 스크롤). 가로 최소는 그대로 지켜 내용이 잘리지 않게
    onBox(clampBox(d.snap, { w: d.min.w, h: Math.min(d.min.h, MIN_H) }));
  };
  const style: React.CSSProperties = { ['--ac' as string]: APP_COLORS[cur.id] };
  if (box) Object.assign(style, { left: box.x, top: box.y, width: box.w, height: box.h, right: 'auto', bottom: 'auto', maxWidth: 'none', zIndex: 1 + z });
  return (
    <>
    {ghost && <div className="win-snap" style={{ left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h, zIndex: 1 + z }} />}
    <div
      ref={el}
      className={`app-panel ${box ? 'floating' : ''} ${focused ? 'focused' : ''}`}
      data-testid={`window-${cur.id}`}
      style={style}
      onPointerDown={(e) => {
        e.stopPropagation();
        onFocus?.();
      }}
    >
      <div className="app-head" onPointerDown={grab('move')} onPointerMove={follow} onPointerUp={drop} onPointerCancel={drop} onDoubleClick={(e) => !(e.target as HTMLElement).closest('button') && onBox?.(wideBox())}>
        <span className="app-head-icon">
          <AppIcon id={cur.id} />
        </span>
        <div className="app-head-name">{cur.name}</div>
        <div className="grow" />
        <button className="app-x" data-testid="app-close" onClick={onClose} title="닫기 (Esc)">
          ✕
        </button>
      </div>
      <div className={`app-body ${app === 'messenger' ? 'flush' : ''}`}>
        {app === 'schedule' && <ScheduleApp />}
        {app === 'employees' && <EmployeesApp key={arg} initial={arg} openApp={setApp} openDm={(id) => setApp('messenger', `dm-${id}`)} />}
        {app === 'messenger' && <MessengerApp initial={arg} openInvest={() => setApp('invest')} />}
        {app === 'invest' && <InvestApp key={arg} initial={arg} openChat={(ch) => setApp('messenger', ch)} />}
        {app === 'finance' && <FinanceApp />}
        {app === 'contract' && <ContractApp openSchedule={() => setApp('schedule')} openDevTeam={() => setApp('team', 'dev')} />}
        {app === 'product' && <ProductApp initialTab={arg} openSchedule={() => setApp('schedule')} openHiring={() => setApp('hiring')} />}
        {app === 'market' && <MarketApp key={arg} initialTab={arg} />}
        {app === 'office' && <OfficeApp />}
        {app === 'shop' && (
          <ShopApp
            onEdit={(r) => {
              onClose();
              requestEdit(r);
            }}
          />
        )}
        {app === 'stock' && <StockApp />}
        {app === 'career' && <CareerApp />}
        {app === 'ranking' && <RankingApp />}
        {app === 'settings' && <SettingsApp />}
      </div>
      {box && EDGES.map((k) => <div key={k} className={`app-resize ${k}`} onPointerDown={grab(k)} onPointerMove={follow} onPointerUp={drop} onPointerCancel={drop} />)}
    </div>
    </>
  );
}
