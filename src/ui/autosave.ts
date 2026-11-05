// DT-07 저장 연결부: 수동 저장, 자동 저장(날짜 변경·투자 수락·채용 확정·Exit 시도·판 종료), 종료 직전 저장(A-29).
// 온라인 모드(A-251)면 로컬 저장과 같은 시점에 클라우드 main 칸도 올립니다. 충돌(409)은 최신 쪽을 그대로 적용합니다.
import { saveGame, localSaveTime, parseSaveText } from '../platform/save';
import { isOnlineMode, online, OnlineError } from '../platform/online';
import { exportCommandRecording, getGame } from './store';

let lastSyncWarning: string | null = null;
export function takeSyncWarning(): string | null {
  const w = lastSyncWarning;
  lastSyncWarning = null;
  return w;
}

// localBefore: 이번에 로컬에 쓰기 직전 localSaveTime(). syncToCloud 안에서 다시 localSaveTime()을 읽으면
// saveNow가 이미 "지금"으로 찍어 둔 값이라 클라우드가 늘 더 과거로 보여 "이 기기가 최신"으로 오판한다(A-262).
async function syncToCloud(text: string, localBefore: number): Promise<void> {
  try {
    const meta = await online.listSaves();
    const current = meta.find((m) => m.slot === 'main');
    await online.putSave('main', text, current?.revision ?? null);
  } catch (e) {
    if (!(e instanceof OnlineError) || e.code !== 'conflict') return; // 오프라인·서버 오류는 조용히 건너뜀(로컬 저장은 이미 끝났음)
    // 충돌: 클라우드 판이 이 기기보다 최신이면 그 판을 받아 이 기기에 반영, 아니면 이 기기 판으로 덮어씀(최신 것 우선).
    try {
      const cloud = await online.getSave('main');
      if (cloud.updatedAt > localBefore) {
        const s = parseSaveText(cloud.data);
        if (s) {
          // 지금 플레이 중인 상태를 통보 없이 바꾸면 진행을 잃으니, 로컬 저장 파일만 최신으로 맞추고
          // 화면 메모리(setGame)는 그대로 둡니다. 다음 "이어하기"에서 이 판으로 열립니다.
          await saveGame(s);
          lastSyncWarning = '다른 기기에서 더 최근에 저장한 판이 있습니다. 지금 판은 그대로 두고, 다음에 이어할 때 그 판이 열립니다.';
          return;
        }
      }
      await online.putSave('main', text, cloud.revision);
      lastSyncWarning = '이 기기의 판이 더 최근이라 클라우드 판을 덮어썼습니다.';
    } catch {
      /* 재시도는 다음 저장 때 다시 시도 */
    }
  }
}

export async function saveNow(_reason: string): Promise<boolean> {
  const g = getGame();
  if (!g) return false;
  const localBefore = localSaveTime(); // saveGame이 "지금"으로 덮어쓰기 전의 값을 먼저 잡아둠(A-262)
  const replay = exportCommandRecording();
  const ok = await saveGame(g, replay);
  if (ok && isOnlineMode()) void syncToCloud(JSON.stringify({ ...g, events: [], replay }), localBefore);
  return ok;
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
