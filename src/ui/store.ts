// 게임 상태 저장소: 코어 함수가 상태를 직접 바꾸고, 바꾼 뒤 버전을 올려 화면을 다시 그립니다.
import { useSyncExternalStore } from 'react';
import type { GameState } from '../core/types';
import { applyCommand, type Command } from '../core/commands';
import type { SetupChoices } from '../core/state';

let current: GameState | null = null;
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version++;
  for (const l of listeners) l();
}

export function setGame(s: GameState | null) {
  stopCommandRecording();
  current = s;
  // 디버그용 읽기 창구(플레이테스트에서 상태 확인)
  (window as unknown as { __pc?: () => GameState | null }).__pc = () => current;
  emit();
}

// 채용 협상 창(A-118)·튜토리얼(A-244)이 열려 있는 동안 게임 시간을 멈추는 화면 쪽 표시(저장되지 않음)
export const timeHold = { nego: false, tutorial: false };

export function getGame(): GameState | null {
  return current;
}

// 코어 액션을 실행하고 화면을 갱신합니다. 반환값(오류 문구 등)을 그대로 돌려줍니다.
export function act<T>(fn: (s: GameState) => T): T | undefined {
  if (!current) return undefined;
  invalidateCommandRecording('명령으로 기록되지 않는 동작을 사용하여 이 도전은 제출할 수 없습니다.');
  const out = fn(current);
  emit();
  return out;
}

// 재실행 기록(명령 순서). 화면은 상태를 바꿀 때 act 대신 dispatch를 씁니다
// 같은 tick이 이어지면 횟수만 올려 한 칸에 모읍니다(커리어 한 판이 수백만 tick이라 그대로 두면 너무 커짐)
// 회사 사이의 전환(다음 회사·은퇴)도 같은 기록에 한 칸씩 넣어 서버가 커리어 전체를 다시 돌립니다
export type ReplayStep = Command | { type: 'nextCompany'; setup: SetupChoices } | { type: 'retire' };
export type LogEntry = { c: ReplayStep; n: number };
let commandLog: LogEntry[] = [];
let recording: { challengeId: string; seed: number; setup: SetupChoices; reason: string | null } | null = null;

// 저장 파일에 함께 넣는 기록. 앱을 다시 켜도 같은 도전 기록을 이어서 쌓습니다(A-250)
export interface SavedRecording {
  challengeId: string;
  seed: number;
  setup: SetupChoices;
  reason: string | null;
  log: LogEntry[];
}
let logBytes = 0;
const REPLAY_BYTE_LIMIT = 2 * 1024 * 1024; // 서버의 replayBytes 상한 안에서만 메모리를 씁니다.
// 화면 루프가 보내는 tick 한 번의 실제 시간(ms). 고정 크기라야 서버가 같은 결과로 다시 돌립니다
export const TICK_MS = 100;

export function beginCommandRecording(challengeId: string, setup: SetupChoices) {
  stopCommandRecording();
  if (current) recording = { challengeId, seed: current.seed, setup, reason: null };
}

export function exportCommandRecording(): SavedRecording | null {
  return recording ? { ...recording, log: commandLog } : null;
}

// 저장에서 불러온 기록을 되살립니다. 판의 시드가 다르면 다른 판의 기록이라 버립니다
export function restoreCommandRecording(saved: SavedRecording | null | undefined) {
  stopCommandRecording();
  if (!current || !saved || saved.seed !== current.seed || !Array.isArray(saved.log)) return;
  recording = { challengeId: saved.challengeId, seed: saved.seed, setup: saved.setup, reason: saved.reason };
  commandLog = saved.reason === null ? saved.log : [];
  logBytes = commandLog.reduce((n, e) => n + new TextEncoder().encode(JSON.stringify(e)).byteLength + 32, 0);
}

export function stopCommandRecording() {
  commandLog = [];
  logBytes = 0;
  recording = null;
}

export function invalidateCommandRecording(reason: string) {
  if (!recording || recording.reason !== null) return;
  recording.reason = reason;
  commandLog = [];
  logBytes = 0;
}

export function getCommandRecordingStatus() {
  return recording ? { ...recording, eligible: recording.reason === null, entries: commandLog.length } : null;
}

// 도전 기록 중인지. 화면은 기록에 남길 수 없는 동작(LLM 해석·멈춤 사유 지우기)을 이때 피합니다
export function isRecordingCommands(): boolean {
  return !!recording && recording.reason === null;
}

function pushStep(c: ReplayStep) {
  if (!recording || recording.reason !== null) return;
  logBytes += new TextEncoder().encode(JSON.stringify({ c, n: 1 })).byteLength + 32;
  if (logBytes > REPLAY_BYTE_LIMIT) invalidateCommandRecording('명령 기록의 크기 한도를 넘어 이 도전은 제출할 수 없습니다.');
  else commandLog.push({ c, n: 1 });
}

// 다음 회사 시작·은퇴는 코어 함수를 화면이 직접 부르므로, 성공한 뒤 여기서 기록만 남깁니다
export function recordTransition(c: Exclude<ReplayStep, Command>) {
  pushStep(c);
}

// 도전 기록에 넣을 본문. 서버는 seed·rule을 도전 값과 비교하고 셋업과 명령으로 커리어를 다시 돌립니다
export function buildReplay(rule: string | null): string | null {
  if (!recording || recording.reason !== null) return null;
  return JSON.stringify({ version: 1, seed: recording.seed, rule, setup: recording.setup, commands: commandLog });
}

export function dispatch(c: Command): unknown {
  if (!current) return undefined;
  // 서버 재실행은 멈춤 사유 지우기와 LLM 해석 결과를 받지 않습니다
  if (recording && recording.reason === null) {
    if (c.type === 'clearPause') invalidateCommandRecording('자동 일시정지 해제는 명령 기록에 남길 수 없어 이 도전은 제출할 수 없습니다.');
    if ((c.type === 'answerSaid' || c.type === 'answerChannel') && c.read !== null) invalidateCommandRecording('메시지 해석 결과는 명령 기록에 남길 수 없어 이 도전은 제출할 수 없습니다.');
  }
  let out: unknown;
  try {
    out = applyCommand(current, c);
  } catch (e) {
    invalidateCommandRecording('동작 처리 중 오류가 발생하여 이 도전은 제출할 수 없습니다.');
    throw e;
  }
  if (recording && recording.reason === null) {
    if (c.type === 'tick' && c.ms !== TICK_MS) {
      invalidateCommandRecording('시간 기록 형식이 맞지 않아 이 도전은 제출할 수 없습니다.');
    } else {
      const last = commandLog[commandLog.length - 1];
      if (c.type === 'tick' && last?.c.type === 'tick' && last.c.ms === c.ms && last.c.nightFast === c.nightFast) last.n++;
      else pushStep(c);
    }
  }
  emit();
  return out;
}

export function takeCommandLog(): LogEntry[] {
  const out = commandLog;
  stopCommandRecording();
  return out;
}

export function touch() {
  emit();
}

export function useGame(): GameState {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
  );
  return current!;
}

export function useVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
  );
}
