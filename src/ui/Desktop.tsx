// DT-02 바탕화면과 앱: CEO를 누르면 사무실 위에 창으로 뜹니다(DT-09, DEC-018). 앱은 한 번에 하나(A-08).
import { useState } from 'react';
import { clockOf, formatDate } from '../core/calendar';
import { setSpeed } from '../core/sim';
import { act, useGame } from './store';
import { ScheduleApp } from './apps/ScheduleApp';
import { HiringApp } from './apps/HiringApp';
import { EmployeesApp } from './apps/EmployeesApp';
import { MessengerApp } from './apps/MessengerApp';
import { InvestApp } from './apps/InvestApp';
import { FinanceApp } from './apps/FinanceApp';
import { ExitApp } from './apps/ExitApp';
import { AppIcon } from './icons';
import { saveNow } from './autosave';
import './desktop.css';

export type AppId = 'schedule' | 'hiring' | 'employees' | 'messenger' | 'invest' | 'finance' | 'exit';

export const APPS: { id: AppId; name: string; unit: string }[] = [
  { id: 'schedule', name: '일정', unit: 'F14 대표 행동' },
  { id: 'messenger', name: '메신저', unit: 'F06 메신저' },
  { id: 'hiring', name: '채용', unit: 'F04 채용' },
  { id: 'employees', name: '직원 관리', unit: 'F05 직원 관리' },
  { id: 'invest', name: '투자', unit: 'F08 투자 유치' },
  { id: 'finance', name: '재무', unit: 'F10 재무·기업가치' },
  { id: 'exit', name: 'Exit', unit: 'F12 Exit' },
];

interface Props {
  app: AppId | null;
  arg?: string;
  setApp: (a: AppId | null, arg?: string) => void;
  onClose: () => void;
}

export function Desktop({ app, arg, setApp, onClose }: Props) {
  const s = useGame();
  const [saved, setSaved] = useState<string | null>(null);
  const cur = APPS.find((a) => a.id === app);

  const doSave = async () => {
    const ok = await saveNow('수동 저장');
    setSaved(ok ? '저장했습니다' : '저장하지 못했습니다');
    setTimeout(() => setSaved(null), 2000);
  };

  return (
    <div className="desk-overlay" data-testid="desktop">
      <div className="monitor">
        <div className="screen">
          {!cur && (
            <div className="wallpaper">
              <div className="wall-title">{s.company.name}</div>
              <div className="icons">
                {APPS.map((a) => (
                  <button key={a.id} className="icon" data-testid={`app-${a.id}`} onClick={() => setApp(a.id)}>
                    <AppIcon id={a.id} />
                    <span>{a.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {cur && (
            <div className="app-window" data-testid={`window-${cur.id}`}>
              <div className="app-title">
                <AppIcon id={cur.id} small />
                <b>{cur.name}</b>
                <span className="tiny">{cur.unit}</span>
                <div className="grow" />
                <button className="win-btn" data-testid="app-close" onClick={() => setApp(null)} title="바탕화면으로">
                  ✕
                </button>
              </div>
              <div className="app-body">
                {app === 'schedule' && <ScheduleApp />}
                {app === 'hiring' && <HiringApp />}
                {app === 'employees' && <EmployeesApp openDm={(id) => setApp('messenger', `dm-${id}`)} />}
                {app === 'messenger' && <MessengerApp initial={arg} openInvest={() => setApp('invest')} />}
                {app === 'invest' && <InvestApp initialStage={arg} />}
                {app === 'finance' && <FinanceApp />}
                {app === 'exit' && <ExitApp />}
              </div>
            </div>
          )}
          <div className="taskbar">
            <button className="start" data-testid="desktop-close" onClick={onClose} title="데스크탑 닫고 사무실 보기">
              ⬑ 사무실로
            </button>
            <button className="tb-btn" data-testid="save-button" onClick={doSave}>
              💾 저장
            </button>
            {saved && <span className="tb-saved">{saved}</span>}
            <div className="grow" />
            <div className="tb-speed">
              {[0, 1, 2, 4].map((sp) => (
                <button key={sp} className={s.speed === sp && (sp === 0 || !s.pauseReason) ? 'on' : ''} onClick={() => act((g) => setSpeed(g, sp))}>
                  {sp === 0 ? '⏸' : `${sp}x`}
                </button>
              ))}
            </div>
            <div className="tb-clock" data-testid="taskbar-clock">
              <div>{clockOf(s.msInDay)}</div>
              <div>{formatDate(s.day)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
