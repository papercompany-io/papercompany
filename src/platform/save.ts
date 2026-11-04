// DT-07 저장 어댑터: Electron은 사용자 데이터 폴더의 파일, 웹은 localStorage(A-29).
import { migrateFurniture, migrateSeats } from '../core/office';
import { seedMvpRoadmap } from '../core/product';
import { DATA } from '../core/data';
import type { DeptId, GameState, Profile } from '../core/types';
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
  talk?: (req: { system: string; user: string; schema: unknown; maxTokens: number }) => Promise<string | null>; // 자유 입력 대화(A-199): LLM 답(JSON 문자열)
  clearOnlineSession?: () => Promise<void>;
  onlineRequest?: (request: { base: string; path: string; method: string; body?: string }) => Promise<{ status: number; ok: boolean; body: unknown }>;
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
    delete (s as { replay?: unknown }).replay; // 명령 기록은 상태에 남기지 않습니다(A-250)
    if (s && s.version === 2 && typeof s.day === 'number' && Array.isArray(s.capTable) && s.career) {
      // 예전 저장 보정: 대표 행동 "외주"(A-79)
      s.ceoAlloc.contract ??= 0;
      s.todayLog.contract ??= 0;
      // 예전 저장 보정: 부서 구역 좌석 → 자유 배치 책상(A-80)
      migrateSeats(s);
      // 예전 저장 보정: 평면에 고정된 가구 → 직접 놓는 가구(A-87)
      migrateFurniture(s);
      // 예전 저장 보정: 진행 중 외주 하나(active) → 여러 개(actives, A-238)
      if (s.contracts && !s.contracts.actives) {
        s.contracts.actives = s.contracts.active ? [s.contracts.active] : [];
        delete s.contracts.active;
      }
      // 예전 저장 보정: "기술 부채 정리"는 "안정화·기술 부채 정리"로 합침(A-240)
      const merged = (o?: Record<string, string | undefined> | null) => {
        for (const k in o ?? {}) if (o![k] === 'dev_debt') o![k] = 'dev_stabilize';
      };
      merged(s.company.orders);
      for (const q of s.company.squads ?? []) merged(q.orders);
      for (const e of s.employees) if ((e.order as string | null) === 'dev_debt') e.order = 'dev_stabilize';
      // 예전 저장 보정: 그룹 메시지(A-226)·직무 채널(#개발팀 등, A-237)은 없앰. 부서 채널만 남김
      s.channels = s.channels.filter((c) => (c.kind as string) !== 'group' && !(c.kind === 'team' && !c.squadId));
      // 예전 저장 보정: 한 직무 안의 팀(dept·order) → 직무가 섞이는 부서(orders, A-237)
      for (const q of s.company.squads ?? []) {
        const old = q as unknown as { dept?: DeptId; order?: string | null };
        if (!q.orders) q.orders = old.dept && old.order ? { [old.dept]: old.order } : {};
        delete old.dept;
        delete old.order;
      }
      for (const c of s.channels) if (c.squadId) delete c.dept;
      // 부서 사람의 직무 일이 비어 있으면 소속 없음의 일로 채움(부서 일은 늘 정해져 있음, A-237)
      for (const e of s.employees) {
        const q = s.company.squads?.find((x) => x.id === e.squadId);
        if (q && !q.orders[e.dept]) q.orders[e.dept] = s.company.orders[e.dept] ?? (DATA.orders.defaults as Record<string, string>)[e.dept];
      }
      // 예전 저장 보정: 창업 직후 비어 있던 로드맵에 MVP 핵심 기능(A-95)
      if (!s.ended && s.product.launchedDay === null && s.product.roadmap.length === 0 && Object.keys(s.product.features).length === 0) seedMvpRoadmap(s);
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
  replay: unknown; // 도전 판의 명령 기록(A-250). 형식 검사는 화면 저장소가 합니다
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
  if (s) return { state: s, recovered: false, corrupt: false, oldVersion: false, replay: replayOf(main) };
  if (isOld(main)) return { state: null, recovered: false, corrupt: false, oldVersion: true, replay: null };
  const bakText = await api().read('backup');
  const bak = parse(bakText);
  if (bak) return { state: bak, recovered: true, corrupt: false, oldVersion: false, replay: replayOf(bakText) };
  return { state: null, recovered: false, corrupt: main !== null, oldVersion: false, replay: null };
}

// 저장 파일의 replay 칸은 게임 상태 밖의 덧붙임입니다(A-250). parse가 GameState로 읽어도 게임 규칙은 이 칸을 쓰지 않습니다
function replayOf(text: string | null): unknown {
  try {
    return text ? ((JSON.parse(text) as { replay?: unknown }).replay ?? null) : null;
  } catch {
    return null;
  }
}

export async function saveGame(s: GameState, replay: unknown = null): Promise<boolean> {
  const copy = { ...s, events: [], replay };
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

// 클라우드에서 받은 판도 로컬 저장과 같은 검사·보정을 거칩니다(A-247).
export const parseSaveText = parse;
