// DT-01 앱 실행과 부팅 연출: 가상 OS 로고와 진행 막대, 클릭하면 건너뜀. 끝나면 시작 메뉴(이어하기·새 커리어·명예의 전당·레거시).
// 저장이 없는 처음 진입은 로컬·온라인 선택지도 띄움(A-251), 온라인을 고르고 로그인하면 클라우드 main 칸이 있었을 때 이어하기로, 없으면 새 커리어로 넘깁니다.
// 로그인 상태는 새로고침해도 쿠키/토큰이 남아 있으니, 부팅 때마다 online.me()로 확인해 로비(계정 이름·로그아웃·클라우드 저장 목록)를 보여줍니다(A-252).
import { useEffect, useState } from 'react';
import type { GameState } from '../core/types';
import { loadGame } from '../platform/save';
import { useProfile } from './meta';
import { formatDate } from '../core/calendar';
import { wonShort } from '../core/format';
import { play } from './sound';
import { online, type Account } from '../platform/online';
import { BootOnline } from './BootOnline';
import { BootLobby } from './BootLobby';
import './boot.css';

interface Props {
  onNew: () => void;
  onContinue: (s: GameState, notice: string | null, replay: unknown) => void;
  onHall: () => void;
  onWeekly?: () => void;
}

export function Boot({ onNew, onContinue, onHall, onWeekly }: Props) {
  const [progress, setProgress] = useState(0);
  const [checked, setChecked] = useState<{ save: GameState | null; recovered: boolean; corrupt: boolean; old: boolean; replay: unknown } | null>(null);
  const [me, setMe] = useState<Account | null | undefined>(undefined); // undefined: 아직 확인 전
  const [onlinePick, setOnlinePick] = useState(false);
  const profile = useProfile();

  useEffect(() => {
    const t = setInterval(() => setProgress((p) => Math.min(100, p + 5)), 50);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (progress < 100 || checked) return;
    loadGame().then((r) => setChecked({ save: r.state, recovered: r.recovered, corrupt: r.corrupt, old: r.oldVersion, replay: r.replay }));
    void online.me().then((r) => setMe(r.state === 'in' ? r.account : null));
  }, [progress, checked]);

  const done = progress >= 100;
  const sv = checked?.save;
  const live = sv && !sv.career.retired;

  return (
    <div className="boot" onClick={() => !done && setProgress(100)}>
      <div className="boot-logo">
        <div className="boot-mark">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="boot-name">PaperOS</div>
        <div className="boot-sub">페이퍼컴퍼니 · 창업자의 35년</div>
      </div>
      {!done && (
        <>
          <div className="boot-bar">
            {Array.from({ length: 20 }, (_, i) => (
              <i key={i} className={progress >= (i + 1) * 5 ? 'on' : ''} />
            ))}
          </div>
          <div className="boot-skip">클릭하면 건너뜁니다</div>
        </>
      )}
      {done && checked && me !== undefined && !onlinePick && (
        <div className="boot-choices" onClick={(e) => e.stopPropagation()}>
          {me && (
            <BootLobby
              me={me}
              onLogout={() => setMe(null)}
              onLoaded={(s) => { play('open'); onContinue(s, null, null); }}
            />
          )}
          {checked.corrupt && <div className="err">저장 파일을 읽지 못했습니다. 새 커리어로 시작하세요.</div>}
          {checked.old && <div className="warn">이전 버전(MVP) 저장 파일은 이어할 수 없습니다. 새 커리어를 시작하세요.</div>}
          {live && (
            <button
              className="btn big"
              data-testid="continue"
              onClick={() => {
                play('open');
                onContinue(sv!, checked.recovered ? '저장 파일이 손상되어 직전 자동 저장으로 복구했습니다.' : null, checked.replay);
              }}
            >
              이어하기 · {sv!.career.founderName} · {sv!.ended ? '다음 회사 준비' : sv!.company.name}
              <span className="boot-meta">
                {formatDate(sv!.day)} · 개인 자산 {wonShort(sv!.career.wealth)} · 회사 {sv!.career.companies.length + (sv!.ended ? 0 : 1)}개째
              </span>
            </button>
          )}
          {!live && !sv && !me && (
            <button className="btn big" data-testid="boot-online-open" onClick={() => setOnlinePick(true)}>
              로그인하고 온라인으로 시작
              <span className="boot-meta">다른 기기에서도 같은 판이 자동으로 맞습니다</span>
            </button>
          )}
          <button
            className={`btn big ${live ? 'ghost' : ''}`}
            data-testid="new-career"
            onClick={() => {
              play('click');
              onNew();
            }}
          >
            {live ? '새 커리어(지금 저장은 덮어씁니다)' : !sv && !me ? '로컬로 시작' : '새 커리어 시작'}
          </button>
          <button className="btn big ghost" data-testid="hall" onClick={onHall}>
            명예의 전당 · 레거시 ({profile.legacyPoints}점)
          </button>
          {onWeekly && <button className="btn big ghost" data-testid="weekly-open" onClick={onWeekly}>
            주간 도전 · 온라인 순위
          </button>}
        </div>
      )}
      {done && checked && onlinePick && (
        <BootOnline
          onCancel={() => setOnlinePick(false)}
          onLoggedIn={() => {
            setOnlinePick(false);
            void online.me().then((r) => setMe(r.state === 'in' ? r.account : null));
          }}
        />
      )}
    </div>
  );
}
