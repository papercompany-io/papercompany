// 효과음: 외부 파일 없이 WebAudio로 짧은 칩튠 소리를 만듭니다(픽셀 아트와 맞춤).
// 브라우저 정책상 첫 사용자 입력 뒤에 소리가 납니다. 음량·끄기는 설정(DT-08)에서 바꿉니다.

import bgmUrl from '../assets/audio/paper_company_ost.m4a';

export type Sfx = 'click' | 'open' | 'close' | 'coin' | 'success' | 'fail' | 'notify' | 'hire' | 'levelup' | 'warn' | 'type';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.5;
let muted = false;
let musicVolume = 0.25; // 배경음악 음량(작게 시작) [예시값]

try {
  const raw = localStorage.getItem('papercompany.sound');
  if (raw) {
    const v = JSON.parse(raw) as { volume?: number; muted?: boolean; musicVolume?: number };
    if (typeof v.volume === 'number') volume = v.volume;
    if (typeof v.muted === 'boolean') muted = v.muted;
    if (typeof v.musicVolume === 'number') musicVolume = v.musicVolume;
  }
} catch {
  /* 저장소를 못 쓰면 기본값 */
}

function persist() {
  try {
    localStorage.setItem('papercompany.sound', JSON.stringify({ volume, muted, musicVolume }));
  } catch {
    /* 무시 */
  }
}

export function soundSettings() {
  return { volume, muted, musicVolume };
}

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = muted ? 0 : volume * 0.35;
  persist();
}

export function setMuted(m: boolean) {
  muted = m;
  if (master) master.gain.value = muted ? 0 : volume * 0.35;
  applyMusic();
  persist();
}

// 배경음악: 파일 하나를 반복 재생합니다. 브라우저 정책상 첫 클릭·키 입력 뒤에 시작합니다.
let bgm: HTMLAudioElement | null = null;
let musicOn = false; // 게임 화면에 있을 때만 켭니다

function applyMusic() {
  if (!bgm) return;
  bgm.volume = muted ? 0 : musicVolume;
  if (musicOn && musicVolume > 0 && !muted) void bgm.play().catch(() => {});
  else bgm.pause();
}

export function setMusicVolume(v: number) {
  musicVolume = Math.max(0, Math.min(1, v));
  applyMusic();
  persist();
}

export function setMusicOn(on: boolean) {
  if (typeof window === 'undefined') return;
  musicOn = on;
  if (!bgm && !on) return;
  if (!bgm) {
    bgm = new Audio(bgmUrl);
    bgm.loop = true;
  }
  applyMusic();
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume * 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

// 한 음: 파형, 시작 주파수 → 끝 주파수, 길이(초), 시작 지연
function tone(type: OscillatorType, f0: number, f1: number, dur: number, delay = 0, gain = 1) {
  const c = ac();
  if (!c || !master || muted || volume <= 0) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const last: Partial<Record<Sfx, number>> = {};

export function play(s: Sfx) {
  // 같은 소리가 한꺼번에 몰리지 않게(4배속 등) 짧은 간격으로 묶습니다.
  const now = performance.now();
  if ((last[s] ?? 0) > now - 70) return;
  last[s] = now;
  switch (s) {
    case 'click':
      tone('square', 880, 660, 0.05, 0, 0.35);
      break;
    case 'type':
      tone('square', 1400, 1200, 0.025, 0, 0.12);
      break;
    case 'open':
      tone('square', 520, 780, 0.07, 0, 0.4);
      tone('square', 780, 1040, 0.07, 0.06, 0.35);
      break;
    case 'close':
      tone('square', 780, 520, 0.07, 0, 0.35);
      break;
    case 'coin':
      tone('square', 988, 988, 0.06, 0, 0.4);
      tone('square', 1319, 1319, 0.16, 0.06, 0.4);
      break;
    case 'hire':
      tone('triangle', 523, 523, 0.08, 0, 0.6);
      tone('triangle', 659, 659, 0.08, 0.08, 0.6);
      tone('triangle', 784, 784, 0.14, 0.16, 0.6);
      break;
    case 'success':
      tone('square', 523, 523, 0.09, 0, 0.4);
      tone('square', 659, 659, 0.09, 0.09, 0.4);
      tone('square', 784, 784, 0.09, 0.18, 0.4);
      tone('square', 1047, 1047, 0.25, 0.27, 0.45);
      break;
    case 'levelup':
      for (let i = 0; i < 6; i++) tone('square', 440 * Math.pow(1.26, i), 440 * Math.pow(1.26, i), 0.07, i * 0.06, 0.35);
      break;
    case 'fail':
      tone('sawtooth', 330, 220, 0.18, 0, 0.35);
      tone('sawtooth', 220, 110, 0.3, 0.16, 0.35);
      break;
    case 'warn':
      tone('square', 660, 660, 0.08, 0, 0.35);
      tone('square', 660, 660, 0.08, 0.14, 0.35);
      break;
    case 'notify':
      tone('sine', 1175, 1175, 0.08, 0, 0.5);
      tone('sine', 1568, 1568, 0.14, 0.08, 0.5);
      break;
  }
}
