// DT-07 저장 연결부: 수동 저장, 자동 저장(날짜 변경·투자 수락·채용 확정·Exit 시도·판 종료), 종료 직전 저장(A-29).
import { saveGame } from '../platform/save';
import { getGame } from './store';

export async function saveNow(_reason: string): Promise<boolean> {
  const g = getGame();
  if (!g) return false;
  return saveGame(g);
}

// 한 프레임에 자동 저장 요청이 여러 번 와도 한 번만 씁니다.
let queued = false;
export function requestAutosave(reason: string) {
  if (queued) return;
  queued = true;
  setTimeout(() => {
    queued = false;
    void saveNow(reason);
  }, 0);
}
