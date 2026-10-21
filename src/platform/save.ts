// DT-07 저장 어댑터: Electron은 사용자 데이터 폴더의 파일, 웹은 localStorage(A-29).
import type { GameState, Profile } from '../core/types';
import { emptyProfile } from '../core/career';

interface PcSave {
  read: (slot: 'main' | 'backup') => Promise<string | null>;
  write: (data: string) => Promise<boolean>;
  clear: () => Promise<boolean>;
  onBeforeClose?: (cb: () => void) => void;
  closeReady?: () => void;
  readProfile?: () => Promise<string | null>;
  writeProfile?: (data: string) => Promise<boolean>;
  toggleFullscreen?: () => void;
  quit?: () => void;
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
    if (s && s.version === 2 && typeof s.day === 'number' && Array.isArray(s.capTable) && s.career) {
      // 예전 저장 보정: 대표 행동 "외주"(A-79)
      s.ceoAlloc.contract ??= 0;
      s.todayLog.contract ??= 0;
      return s;
    }
  } catch {
    /* 손상 */
  }
  return null;
}

export interface LoadResult {
  state: GameState | null;
  recovered: boolean; // 본 저장이 손상되어 백업으로 복구했는지
  corrupt: boolean; // 둘 다 읽지 못함
  oldVersion: boolean; // v1(MVP) 저장 — v2에서는 이어할 수 없음
}

function isOld(text: string | null): boolean {
  if (!text) return false;
  try {
    return (JSON.parse(text) as { version?: number }).version === 1;
  } catch {
    return false;
  }
}

export async function loadGame(): Promise<LoadResult> {
  const main = await api().read('main');
  const s = parse(main);
  if (s) return { state: s, recovered: false, corrupt: false, oldVersion: false };
  if (isOld(main)) return { state: null, recovered: false, corrupt: false, oldVersion: true };
  const bak = parse(await api().read('backup'));
  if (bak) return { state: bak, recovered: true, corrupt: false, oldVersion: false };
  return { state: null, recovered: false, corrupt: main !== null, oldVersion: false };
}

export async function saveGame(s: GameState): Promise<boolean> {
  const copy = { ...s, events: [] };
  return api().write(JSON.stringify(copy));
}

export async function clearSave(): Promise<void> {
  await api().clear();
}

// DT-07 종료 직전 저장. Electron은 창 닫힘 신호를 받아 저장한 뒤 닫고, 웹은 페이지를 떠날 때 저장합니다
// (localStorage 쓰기는 동기라 beforeunload 안에서 끝납니다).
export function onAppClosing(save: () => Promise<unknown>) {
  const p = window.pcSave;
  if (p?.onBeforeClose) {
    p.onBeforeClose(() => {
      save().finally(() => p.closeReady?.());
    });
  } else {
    window.addEventListener('beforeunload', () => {
      void save();
    });
  }
}

export function isElectron(): boolean {
  return !!window.pcSave;
}

// ── 메타 프로필(레거시·업적·명예의 전당) ──
const PKEY = 'papercompany.profile';

export async function loadProfile(): Promise<Profile> {
  let text: string | null = null;
  try {
    text = window.pcSave?.readProfile ? await window.pcSave.readProfile() : localStorage.getItem(PKEY);
  } catch {
    text = null;
  }
  if (!text) return emptyProfile();
  try {
    const p = JSON.parse(text) as Profile;
    if (p && p.version === 1) return { ...emptyProfile(), ...p };
  } catch {
    /* 손상 */
  }
  return emptyProfile();
}

export async function saveProfile(p: Profile): Promise<boolean> {
  const text = JSON.stringify(p);
  try {
    if (window.pcSave?.writeProfile) return await window.pcSave.writeProfile(text);
    localStorage.setItem(PKEY, text);
    return true;
  } catch {
    return false;
  }
}

export function toggleFullscreen() {
  if (window.pcSave?.toggleFullscreen) window.pcSave.toggleFullscreen();
  else if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.();
}
