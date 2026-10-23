// 메타 프로필(레거시·업적·명예의 전당)과 설정(DT-08)을 화면 쪽에서 들고 있는 곳.
import { useSyncExternalStore } from 'react';
import { emptyProfile } from '../core/career';
import type { Profile } from '../core/types';
import type { AutoSkip } from '../core/night';
import { saveProfile } from '../platform/save';

let profile: Profile = emptyProfile();
let pv = 0;
const subs = new Set<() => void>();

export function setProfile(p: Profile) {
  profile = p;
  pv++;
  subs.forEach((f) => f());
}

export function getProfile(): Profile {
  return profile;
}

export function updateProfile(fn: (p: Profile) => void) {
  fn(profile);
  pv++;
  subs.forEach((f) => f());
  void saveProfile(profile);
}

export function useProfile(): Profile {
  useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => pv,
  );
  return profile;
}

// ── 설정(DT-08) ──
export interface Settings {
  autoPauseUrgent: boolean; // 긴급 알림 때 자동 일시정지(DT-04)
  defaultSpeed: number;
  toasts: boolean;
  animations: boolean;
  muteChatter: boolean; // 잡담 알림 끄기(A-201): 팀 채널·#전체 안 읽음을 뱃지에서 뺌
  autoSkipNight: AutoSkip; // 퇴근 뒤 자동 빨리 감기(A-149, A-159)
  autoSkipLast: Exclude<AutoSkip, 'off'>; // 위 막대 버튼으로 다시 켤 때 쓸 마지막 방식(A-159)
  uiScale: number; // 화면 크기(A-241): 화면 전체 확대 배율
  tutorialDone: boolean; // 게임 시작 튜토리얼을 끝내거나 건너뜀(A-242)
  guides: boolean; // 기능 상황 안내 보이기(A-242)
  guidesSeen: string[]; // 본 상황 안내 id(tutorial.json guides)
}

const SKEY = 'papercompany.settings';
let settings: Settings = { autoPauseUrgent: true, defaultSpeed: 1, toasts: true, animations: true, muteChatter: false, autoSkipNight: 'off', autoSkipLast: 'always', uiScale: 1, tutorialDone: false, guides: true, guidesSeen: [] };
try {
  const raw = localStorage.getItem(SKEY);
  if (raw) settings = { ...settings, ...(JSON.parse(raw) as Partial<Settings>) };
} catch {
  /* 기본값 */
}
let sv = 0;

// 화면 크기(A-241): html에 CSS zoom(웹·Electron 같음). 포인터 좌표(clientX)·getBoundingClientRect·innerWidth는 화면 픽셀이고
// 창 위치·크기(style)는 CSS 픽셀이라, 그 둘을 섞는 곳은 uiZoom()으로 나눔. CSS의 100vw·100vh 대신 var(--vw)·var(--vh)
export function uiZoom(): number {
  return settings.uiScale > 0 ? settings.uiScale : 1;
}
export const viewW = () => window.innerWidth / uiZoom();
export const viewH = () => window.innerHeight / uiZoom();
function applyZoom() {
  const h = document.documentElement;
  const z = uiZoom();
  h.style.zoom = z === 1 ? '' : String(z);
  h.style.setProperty('--ui-z', String(z));
  window.dispatchEvent(new Event('resize')); // 열린 창·목록이 새 넓이에 맞춰 다시 자리 잡게
}
applyZoom();
const ssubs = new Set<() => void>();

export function getSettings(): Settings {
  return settings;
}

export function setSettings(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  if (patch.uiScale !== undefined) applyZoom();
  sv++;
  ssubs.forEach((f) => f());
  try {
    localStorage.setItem(SKEY, JSON.stringify(settings));
  } catch {
    /* 무시 */
  }
}

// 자동 빨리 감기 방식 바꾸기: 끌 때는 켜져 있던 방식을 기억해 둠(A-159)
export function setAutoSkip(mode: AutoSkip) {
  const cur = settings.autoSkipNight;
  setSettings(mode === 'off' && cur !== 'off' ? { autoSkipNight: mode, autoSkipLast: cur } : { autoSkipNight: mode });
}

// 위 막대 빨리 감기 버튼(A-159): 꺼져 있으면 마지막 방식으로 켜고, 켜져 있으면 끔
export function toggleAutoSkip() {
  setAutoSkip(settings.autoSkipNight === 'off' ? settings.autoSkipLast : 'off');
}

export function useSettings(): Settings {
  useSyncExternalStore(
    (cb) => {
      ssubs.add(cb);
      return () => ssubs.delete(cb);
    },
    () => sv,
  );
  return settings;
}
