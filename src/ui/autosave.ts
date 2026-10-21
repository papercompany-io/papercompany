// DT-07 저장 연결부. M3에서 자동 저장을 붙입니다.
import { saveGame } from '../platform/save';
import { getGame } from './store';

export async function saveNow(_reason: string): Promise<boolean> {
  const g = getGame();
  if (!g) return false;
  return saveGame(g);
}
