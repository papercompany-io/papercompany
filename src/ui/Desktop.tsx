// DT-02/03 앱: Startup Company처럼 왼쪽 메뉴에서 바로 열고, 사무실 위에 창으로 뜹니다(A-83).
// 창은 여러 개 열 수 있고, 제목줄을 끌어 옮기고 오른쪽 아래 모서리를 끌어 크기를 바꿉니다(A-124).
// 회사 단계가 오르면 새 앱이 열리고(NEW 표시), 메뉴 버튼에 알림 배지(DT-04)가 붙습니다.
import { useLayoutEffect, useRef } from 'react';
import { unreadTotal } from '../core/messenger';
import { useGame } from './store';
import { ScheduleApp } from './apps/ScheduleApp';
import { HiringApp } from './apps/HiringApp';
import { EmployeesApp } from './apps/EmployeesApp';
import { MessengerApp } from './apps/MessengerApp';
import { InvestApp } from './apps/InvestApp';
import { FinanceApp } from './apps/FinanceApp';
import { ExitApp } from './apps/ExitApp';
import { ProductApp } from './apps/ProductApp';
import { MarketApp } from './apps/MarketApp';
import { AiApp } from './apps/AiApp';
import { OfficeApp } from './apps/OfficeApp';
import { ShopApp } from './apps/ShopApp';
import { requestEdit } from './office/placement';
import { StockApp } from './apps/StockApp';
import { NewsApp } from './apps/NewsApp';
import { RankingApp } from './apps/RankingApp';
import { CareerApp } from './apps/CareerApp';
import { SettingsApp } from './apps/SettingsApp';
import { AppIcon, APP_COLORS } from './icons';
import type { GameState } from '../core/types';
import './desktop.css';

export type AppId = 'schedule' | 'messenger' | 'product' | 'market' | 'hiring' | 'employees' | 'ai' | 'office' | 'shop' | 'invest' | 'finance' | 'exit' | 'stock' | 'news' | 'career' | 'ranking' | 'settings';

// 일정은 왼쪽 메뉴에 없음: 사무실에서 대표(나)를 눌러야만 열림(창 제목·알림 연결용으로 목록에는 둠)
export const APPS: { id: AppId; name: string; unit: string; desc: string; stage: number; publicOnly?: boolean; noMenu?: boolean }[] = [
  { id: 'schedule', name: 'CEO 개인 일정', unit: 'F14 대표 행동', desc: '대표의 하루 8칸', stage: 0, noMenu: true },
  { id: 'messenger', name: '메신저', unit: 'F06 메신저', desc: '팀 지시·결정', stage: 0 },
  { id: 'product', name: '제품', unit: 'F09 제품', desc: '로드맵·품질·가격', stage: 0 },
  { id: 'market', name: '시장·광고', unit: 'RV 시장·경쟁', desc: '고객·광고·경쟁사', stage: 1 },
  { id: 'hiring', name: '채용', unit: 'F04 채용', desc: '공고·지원자·위임', stage: 0 },
  { id: 'employees', name: '직원 관리', unit: 'F05 직원·조직', desc: '직원·팀장·복지', stage: 0 },
  { id: 'ai', name: 'AI 도입', unit: 'F07 AI 도입', desc: '모델·적용률', stage: 1 },
  { id: 'shop', name: '상점', unit: 'OF-07 상점', desc: '책상·가구 사서 놓기', stage: 0 },
  { id: 'office', name: '사무실', unit: 'OF-07 사무실', desc: '넓이·이전', stage: 0 },
  { id: 'invest', name: '투자', unit: 'F08 투자 유치', desc: '라운드·지분·ESOP', stage: 0 },
  { id: 'finance', name: '재무', unit: 'F10 재무·기업가치', desc: '손익·자금·가치', stage: 0 },
  { id: 'exit', name: 'Exit', unit: 'F12 Exit', desc: '매각·IPO', stage: 1 },
  { id: 'stock', name: '주식', unit: '상장사', desc: '주가·실적·지분 매각', stage: 5, publicOnly: true },
  { id: 'news', name: '페이퍼뉴스', unit: '뉴스', desc: '업계·경제 소식', stage: 0 },
  { id: 'ranking', name: '시장 랭킹', unit: 'A-120 랭킹', desc: '시장별 고객 수 순위', stage: 0, noMenu: true },
  { id: 'career', name: '커리어', unit: '미션·업적', desc: '목표·업적·기록', stage: 0 },
  { id: 'settings', name: '설정', unit: 'DT-08 설정', desc: '소리·화면·종료', stage: 0 },
];

export function appOpen(s: GameState, id: AppId): boolean {
  const a = APPS.find((x) => x.id === id)!;
  if (a.publicOnly) return !!s.public;
  return s.company.stage >= a.stage;
}

export function badge(s: GameState, id: AppId): number {
  switch (id) {
    case 'messenger':
      return unreadTotal(s);
    case 'hiring':
      return s.applicants.filter((a) => a.status === 'waiting').length;
    case 'invest':
      return s.rounds.some((r) => r.status === 'offer') ? 1 : 0;
    case 'exit':
      return s.exitAttempt?.status === 'offer' ? 1 : 0;
    case 'product':
      return s.product.roadmap.length === 0 ? 1 : 0;
    default:
      return 0;
  }
}

// 왼쪽 메뉴(Startup Company식): 앱 버튼이 세로로 늘 떠 있고, 누르면 사무실 위에 창이 뜹니다.
// app = 맨 앞 창, open = 열려 있는 창 전부(A-124)
export function Sidebar({ app, open = [], onOpen }: { app: AppId | null; open?: AppId[]; onOpen: (id: AppId) => void }) {
  const s = useGame();
  const seen = seenApps(s);
  return (
    <nav className="sidebar" data-testid="sidebar" onPointerDown={(e) => e.stopPropagation()}>
      {APPS.map((a) => {
        const on = appOpen(s, a.id);
        if (a.noMenu || (a.publicOnly && !on)) return null;
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

// 창이 놓일 수 있는 넓이: 위 막대 아래, 왼쪽 메뉴 오른쪽
export function winArea() {
  const top = cssPx('--top-h', 86) + 12;
  const left = cssPx('--side-w', 84) + 14;
  return { left, top, w: Math.max(MIN_W, window.innerWidth - left - 14), h: Math.max(MIN_H, window.innerHeight - top - 14) };
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

// 앱 창: 사무실 위에 뜨는 패널. 제목줄을 끌면 옮기고, 오른쪽 아래 모서리를 끌면 크기가 바뀝니다. 제목줄을 두 번 누르면 넓게.
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
  const drag = useRef<{ kind: 'move' | 'size'; px: number; py: number; b: WinBox; min: { w: number; h: number } } | null>(null);
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
  const grab = (kind: 'move' | 'size') => (e: React.PointerEvent) => {
    if (!box || !onBox || e.button !== 0) return;
    if (kind === 'move' && (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind, px: e.clientX, py: e.clientY, b: box, min: fitMin() };
  };
  const follow = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !onBox) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    onBox(clampBox(d.kind === 'move' ? { ...d.b, x: d.b.x + dx, y: d.b.y + dy } : { ...d.b, w: d.b.w + dx, h: d.b.h + dy }, d.min));
  };
  const drop = () => (drag.current = null);
  const style: React.CSSProperties = { ['--ac' as string]: APP_COLORS[cur.id] };
  if (box) Object.assign(style, { left: box.x, top: box.y, width: box.w, height: box.h, right: 'auto', bottom: 'auto', maxWidth: 'none', zIndex: 1 + z });
  return (
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
        {app === 'hiring' && <HiringApp />}
        {app === 'employees' && <EmployeesApp openDm={(id) => setApp('messenger', `dm-${id}`)} />}
        {app === 'messenger' && <MessengerApp initial={arg} openInvest={() => setApp('invest')} />}
        {app === 'invest' && <InvestApp initialStage={arg} openChat={(ch) => setApp('messenger', ch)} />}
        {app === 'finance' && <FinanceApp />}
        {app === 'exit' && <ExitApp />}
        {app === 'product' && <ProductApp openSchedule={() => setApp('schedule')} openHiring={() => setApp('hiring')} />}
        {app === 'market' && <MarketApp />}
        {app === 'ai' && <AiApp />}
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
        {app === 'news' && <NewsApp />}
        {app === 'career' && <CareerApp />}
        {app === 'ranking' && <RankingApp />}
        {app === 'settings' && <SettingsApp />}
      </div>
      {box && <div className="app-resize" title="끌어서 크기 바꾸기" onPointerDown={grab('size')} onPointerMove={follow} onPointerUp={drop} onPointerCancel={drop} />}
    </div>
  );
}
