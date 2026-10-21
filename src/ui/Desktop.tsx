// DT-02/03 앱: Startup Company처럼 왼쪽 메뉴에서 바로 열고, 사무실 위에 창으로 뜹니다(A-83). 앱은 한 번에 하나.
// 회사 단계가 오르면 새 앱이 열리고(NEW 표시), 메뉴 버튼에 알림 배지(DT-04)가 붙습니다.
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
import { StockApp } from './apps/StockApp';
import { NewsApp } from './apps/NewsApp';
import { CareerApp } from './apps/CareerApp';
import { SettingsApp } from './apps/SettingsApp';
import { APP_COLORS } from './icons';
import { UiIcon } from './uiIcons';
import { X } from 'lucide-react';
import type { GameState } from '../core/types';
import './desktop.css';

export type AppId = 'schedule' | 'messenger' | 'product' | 'market' | 'hiring' | 'employees' | 'ai' | 'office' | 'invest' | 'finance' | 'exit' | 'stock' | 'news' | 'career' | 'settings';

export const APPS: { id: AppId; name: string; unit: string; desc: string; stage: number; publicOnly?: boolean }[] = [
  { id: 'schedule', name: '일정', unit: 'F14 대표 행동', desc: '대표의 하루 8칸', stage: 0 },
  { id: 'messenger', name: '메신저', unit: 'F06 메신저', desc: '팀 지시·결정', stage: 0 },
  { id: 'product', name: '제품', unit: 'F09 제품', desc: '로드맵·품질·가격', stage: 0 },
  { id: 'market', name: '시장', unit: 'RV 시장·경쟁', desc: '고객·광고·경쟁사', stage: 1 },
  { id: 'hiring', name: '채용', unit: 'F04 채용', desc: '공고·지원자·위임', stage: 0 },
  { id: 'employees', name: '직원 관리', unit: 'F05 직원·조직', desc: '직원·팀장·복지', stage: 0 },
  { id: 'ai', name: 'AI 도입', unit: 'F07 AI 도입', desc: '모델·적용률', stage: 1 },
  { id: 'office', name: '사무실', unit: 'OF-07 사무실', desc: '가구·이전', stage: 0 },
  { id: 'invest', name: '투자', unit: 'F08 투자 유치', desc: '라운드·지분·ESOP', stage: 0 },
  { id: 'finance', name: '재무', unit: 'F10 재무·기업가치', desc: '손익·자금·가치', stage: 0 },
  { id: 'exit', name: 'Exit', unit: 'F12 Exit', desc: '매각·IPO', stage: 1 },
  { id: 'stock', name: '주식', unit: '상장사', desc: '주가·실적·지분 매각', stage: 5, publicOnly: true },
  { id: 'news', name: '페이퍼뉴스', unit: '뉴스', desc: '업계·경제 소식', stage: 0 },
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
export function Sidebar({ app, onOpen }: { app: AppId | null; onOpen: (id: AppId) => void }) {
  const s = useGame();
  const seen = seenApps(s);
  return (
    <nav className="sidebar" data-testid="sidebar" onPointerDown={(e) => e.stopPropagation()}>
      {APPS.map((a) => {
        const on = appOpen(s, a.id);
        if (a.publicOnly && !on) return null;
        const b = on ? badge(s, a.id) : 0;
        return (
          <button
            key={a.id}
            className={`sb-item ${app === a.id ? 'on' : ''} ${on ? '' : 'locked'}`}
            data-testid={`app-${a.id}`}
            disabled={!on}
            title={on ? `${a.name} · ${a.desc}` : `${a.name} · 단계 ${a.stage}에 열림`}
            onClick={() => {
              markSeen(s, a.id);
              onOpen(a.id);
            }}
            style={{ ['--ac' as string]: APP_COLORS[a.id] }}
          >
            <UiIcon id={a.id} size={20} />
            <span className="sb-name">{a.name}</span>
            {b > 0 && <span className="sb-badge">{b > 99 ? '99+' : b}</span>}
            {on && !seen.includes(a.id) && a.stage > 0 && b === 0 && <span className="sb-new" title="새로 열림" />}
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

// 앱 창: 사무실 위 가운데에 뜨는 패널. 닫으면 사무실로 돌아갑니다.
export function AppPanel({ app, arg, setApp, onClose }: { app: AppId; arg?: string; setApp: (a: AppId, arg?: string) => void; onClose: () => void }) {
  const cur = APPS.find((a) => a.id === app)!;
  return (
    <div key={cur.id} className="app-panel" data-testid={`window-${cur.id}`} style={{ ['--ac' as string]: APP_COLORS[cur.id] }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="app-head">
        <span className="app-head-icon">
          <UiIcon id={cur.id} />
        </span>
        <div className="app-head-name">{cur.name}</div>
        <div className="grow" />
        <button className="app-x" data-testid="app-close" onClick={onClose} title="닫기 (Esc)">
          <X size={18} strokeWidth={1.75} />
        </button>
      </div>
      <div className={`app-body ${app === 'messenger' ? 'flush' : ''}`}>
        {app === 'schedule' && <ScheduleApp />}
        {app === 'hiring' && <HiringApp />}
        {app === 'employees' && <EmployeesApp openDm={(id) => setApp('messenger', `dm-${id}`)} />}
        {app === 'messenger' && <MessengerApp initial={arg} openInvest={() => setApp('invest')} />}
        {app === 'invest' && <InvestApp initialStage={arg} />}
        {app === 'finance' && <FinanceApp />}
        {app === 'exit' && <ExitApp />}
        {app === 'product' && <ProductApp />}
        {app === 'market' && <MarketApp />}
        {app === 'ai' && <AiApp />}
        {app === 'office' && <OfficeApp />}
        {app === 'stock' && <StockApp />}
        {app === 'news' && <NewsApp />}
        {app === 'career' && <CareerApp />}
        {app === 'settings' && <SettingsApp />}
      </div>
    </div>
  );
}
