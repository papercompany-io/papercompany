// DT-01 앱 실행과 부팅 연출: 가상 OS 로고와 진행 막대, 클릭하면 건너뜀. 끝나면 시작 메뉴(이어하기·새 커리어·명예의 전당·레거시).
import { useEffect, useState } from 'react';
import type { GameState } from '../core/types';
import { loadGame } from '../platform/save';
import { useProfile } from './meta';
import { formatDate } from '../core/calendar';
import { wonShort } from '../core/format';
import { play } from './sound';
import './boot.css';

interface Props {
  onNew: () => void;
  onContinue: (s: GameState, notice: string | null) => void;
  onHall: () => void;
}

export function Boot({ onNew, onContinue, onHall }: Props) {
  const [progress, setProgress] = useState(0);
  const [checked, setChecked] = useState<{ save: GameState | null; recovered: boolean; corrupt: boolean; old: boolean } | null>(null);
  const profile = useProfile();

  useEffect(() => {
    const t = setInterval(() => setProgress((p) => Math.min(100, p + 5)), 50);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (progress < 100 || checked) return;
    loadGame().then((r) => setChecked({ save: r.state, recovered: r.recovered, corrupt: r.corrupt, old: r.oldVersion }));
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
      {done && checked && (
        <div className="boot-choices" onClick={(e) => e.stopPropagation()}>
          {checked.corrupt && <div className="err">저장 파일을 읽지 못했습니다. 새 커리어로 시작하세요.</div>}
          {checked.old && <div className="warn">이전 버전(MVP)의 저장은 새 버전에서 이어할 수 없습니다. 새 커리어를 시작하세요.</div>}
          {live && (
            <button
              className="btn big"
              data-testid="continue"
              onClick={() => {
                play('open');
                onContinue(sv!, checked.recovered ? '저장 파일이 손상되어 직전 자동 저장으로 복구했습니다.' : null);
              }}
            >
              이어하기 · {sv!.career.founderName} · {sv!.ended ? '다음 회사 준비' : sv!.company.name}
              <span className="boot-meta">
                {formatDate(sv!.day)} · 개인 자산 {wonShort(sv!.career.wealth)} · 회사 {sv!.career.companies.length + (sv!.ended ? 0 : 1)}개째
              </span>
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
            {live ? '새 커리어(지금 저장은 덮어씁니다)' : '새 커리어 시작'}
          </button>
          <button className="btn big ghost" data-testid="hall" onClick={onHall}>
            명예의 전당 · 레거시 ({profile.legacyPoints}점)
          </button>
        </div>
      )}
    </div>
  );
}
