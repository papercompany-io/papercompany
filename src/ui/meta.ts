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
  autoSkipNight: AutoSkip; // 퇴근 뒤 자동 건너뛰기(A-149)
}

const SKEY = 'papercompany.settings';
let settings: Settings = { autoPauseUrgent: true, defaultSpeed: 1, toasts: true, animations: true, autoSkipNight: 'off' };
try {
  const raw = localStorage.getItem(SKEY);
  if (raw) settings = { ...settings, ...(JSON.parse(raw) as Partial<Settings>) };
} catch {
  /* 기본값 */
}
let sv = 0;
const ssubs = new Set<() => void>();

export function getSettings(): Settings {
  return settings;
}

export function setSettings(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  sv++;
  ssubs.forEach((f) => f());
  try {
    localStorage.setItem(SKEY, JSON.stringify(settings));
  } catch {
    /* 무시 */
  }
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
