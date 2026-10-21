// DT-01 앱 실행과 부팅 연출: 가상 OS 로고와 진행 막대, 클릭하면 건너뜀 [Claude 제안]
import { useEffect, useState } from 'react';
import type { GameState } from '../core/types';
import { loadGame } from '../platform/save';
import './boot.css';

interface Props {
  onNew: () => void;
  onContinue: (s: GameState, notice: string | null) => void;
}

export function Boot({ onNew, onContinue }: Props) {
  const [progress, setProgress] = useState(0);
  const [checked, setChecked] = useState<{ save: GameState | null; recovered: boolean; corrupt: boolean } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setProgress((p) => Math.min(100, p + 4)), 60);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (progress < 100 || checked) return;
    loadGame().then((r) => setChecked({ save: r.state, recovered: r.recovered, corrupt: r.corrupt }));
  }, [progress, checked]);

  const done = progress >= 100;

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
        <div className="boot-sub">페이퍼컴퍼니 · 대표 업무용 컴퓨터</div>
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
          {checked.corrupt && <div className="err">저장 파일을 읽지 못했습니다. 새 회사로 시작하세요.</div>}
          {checked.save ? (
            <>
              <button className="btn big" data-testid="continue" onClick={() => onContinue(checked.save!, checked.recovered ? '저장 파일이 손상되어 직전 자동 저장으로 복구했습니다.' : null)}>
                이어하기 · {checked.save.company.name}
              </button>
              <button className="btn big ghost" data-testid="new-company" onClick={onNew}>
                새 회사
              </button>
            </>
          ) : (
            <button className="btn big" data-testid="new-company" onClick={onNew}>
              새 회사 시작
            </button>
          )}
        </div>
      )}
    </div>
  );
}
