// DT-07 저장 어댑터: Electron은 사용자 데이터 폴더의 파일, 웹은 localStorage(A-29).
import type { GameState } from '../core/types';

interface PcSave {
  read: (slot: 'main' | 'backup') => Promise<string | null>;
  write: (data: string) => Promise<boolean>;
  clear: () => Promise<boolean>;
}

declare global {
  interface Window {
    pcSave?: PcSave;
  }
}

const KEY = 'papercompany.save';
const KEY_BAK = 'papercompany.save.bak';

function web(): PcSave {
  return {
    async read(slot) {
      try {
        return localStorage.getItem(slot === 'main' ? KEY : KEY_BAK);
      } catch {
        return null;
      }
    },
    async write(data) {
      try {
        const prev = localStorage.getItem(KEY);
        if (prev) localStorage.setItem(KEY_BAK, prev);
        localStorage.setItem(KEY, data);
        return true;
      } catch {
        return false;
      }
    },
    async clear() {
      try {
        localStorage.removeItem(KEY);
        localStorage.removeItem(KEY_BAK);
      } catch {
        /* 무시 */
      }
      return true;
    },
  };
}

const api = (): PcSave => window.pcSave ?? web();

function parse(text: string | null): GameState | null {
  if (!text) return null;
  try {
    const s = JSON.parse(text) as GameState;
    if (s && s.version === 1 && typeof s.day === 'number' && Array.isArray(s.capTable)) return s;
  } catch {
    /* 손상 */
  }
  return null;
}

export interface LoadResult {
  state: GameState | null;
  recovered: boolean; // 본 저장이 손상되어 백업으로 복구했는지
  corrupt: boolean; // 둘 다 읽지 못함
}

export async function loadGame(): Promise<LoadResult> {
  const main = await api().read('main');
  const s = parse(main);
  if (s) return { state: s, recovered: false, corrupt: false };
  const bak = parse(await api().read('backup'));
  if (bak) return { state: bak, recovered: true, corrupt: false };
  return { state: null, recovered: false, corrupt: main !== null };
}

export async function saveGame(s: GameState): Promise<boolean> {
  const copy = { ...s, events: [] };
  return api().write(JSON.stringify(copy));
}

export async function clearSave(): Promise<void> {
  await api().clear();
}

export function isElectron(): boolean {
  return !!window.pcSave;
}
