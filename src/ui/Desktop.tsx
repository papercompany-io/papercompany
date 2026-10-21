// DT-02 바탕화면과 앱: CEO를 누르면 사무실 위에 창으로 뜹니다(DT-09, DEC-018). 앱은 한 번에 하나(A-08).
import { useState } from 'react';
import { clockOf, formatDate } from '../core/calendar';
import { useGame } from './store';
import { ScheduleApp } from './apps/ScheduleApp';
import { HiringApp } from './apps/HiringApp';
import { EmployeesApp } from './apps/EmployeesApp';
import { MessengerApp } from './apps/MessengerApp';
import { InvestApp } from './apps/InvestApp';
import { FinanceApp } from './apps/FinanceApp';
import { ExitApp } from './apps/ExitApp';
import { AppIcon, APP_COLORS } from './icons';
import { saveNow } from './autosave';
import './desktop.css';

export type AppId = 'schedule' | 'hiring' | 'employees' | 'messenger' | 'invest' | 'finance' | 'exit';

export const APPS: { id: AppId; name: string; unit: string; desc: string }[] = [
  { id: 'schedule', name: '일정', unit: 'F14 대표 행동', desc: '대표의 하루 8칸 배분' },
  { id: 'messenger', name: '메신저', unit: 'F06 메신저', desc: '팀 채널에서 부서 지시' },
  { id: 'hiring', name: '채용', unit: 'F04 채용', desc: '공고 올리기·지원자 고용' },
  { id: 'employees', name: '직원 관리', unit: 'F05 직원 관리', desc: '직원 목록·부서 이동' },
  { id: 'invest', name: '투자', unit: 'F08 투자 유치', desc: '라운드 열기·투자사 레터' },
  { id: 'finance', name: '재무', unit: 'F10 재무·기업가치', desc: '손익·자금·기업가치' },
  { id: 'exit', name: 'Exit', unit: 'F12 Exit', desc: '매각·IPO 시도' },
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
    <div className="desk-window" data-testid="desktop">
      <div className="dw-title">
        <span className="dw-monitor" />
        <b>대표 컴퓨터</b>
        <span className="dw-os">PaperOS</span>
        {cur && (
          <>
            <span className="dw-sep">›</span>
            <AppIcon id={cur.id} small />
            <b>{cur.name}</b>
            <span className="dw-unit">{cur.unit}</span>
          </>
        )}
        <div className="grow" />
        <button className="dw-x" data-testid="desktop-x" onClick={onClose} title="컴퓨터 닫고 사무실 보기">
          ✕
        </button>
      </div>

      <div className="dw-screen">
        {!cur && (
          <div className="wallpaper">
            <div className="wall-hello">
              <div className="wall-co">{s.company.name}</div>
              <div className="wall-sub">앱을 눌러 일을 시작하세요. 컴퓨터를 보는 동안에도 시간은 흐릅니다.</div>
            </div>
            <div className="icons">
              {APPS.map((a) => (
                <button key={a.id} className="icon" data-testid={`app-${a.id}`} onClick={() => setApp(a.id)} style={{ ['--ac' as string]: APP_COLORS[a.id] }}>
                  <span className="icon-tile">
                    <AppIcon id={a.id} />
                  </span>
                  <span className="icon-name">{a.name}</span>
                  <span className="icon-desc">{a.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {cur && (
          <div className="app-window" data-testid={`window-${cur.id}`}>
            <div className="app-bar">
              <button className="app-back" data-testid="app-close" onClick={() => setApp(null)} title="바탕화면으로">
                ← 바탕화면
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
            </div>
          </div>
        )}
      </div>

      <div className="taskbar">
        <button className="tb-start" data-testid="desktop-close" onClick={onClose} title="컴퓨터 닫고 사무실 보기">
          ⬑ 사무실로
        </button>
        <button className="tb-btn" data-testid="save-button" onClick={doSave}>
          저장
        </button>
        {saved && <span className="tb-saved">{saved}</span>}
        <div className="grow" />
        <div className="tb-clock" data-testid="taskbar-clock">
          <div>{clockOf(s.msInDay)}</div>
          <div>{formatDate(s.day)}</div>
        </div>
      </div>
    </div>
  );
}
