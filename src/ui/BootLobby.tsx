// A-251 보강: 로그인 상태면 Boot 화면 안에서 계정 이름·로그아웃·클라우드 저장 슬롯 목록을 보여주는 로비 블록.
// 새로고침해도 로그인이 유지되도록 Boot.tsx가 부팅 때 online.me()로 상태를 확인한 뒤 이 컴포넌트를 보여줍니다.
import { useEffect, useState } from 'react';
import { online, type Account, type CloudSaveMeta, type SaveSlot } from '../platform/online';
import { parseSaveText, saveGame } from '../platform/save';
import type { GameState } from '../core/types';

const SLOT_LABEL: Record<string, string> = { main: '기본 칸', slot1: '저장 칸 1', slot2: '저장 칸 2', slot3: '저장 칸 3' };

export function BootLobby({ me, onLogout, onLoaded }: {
  readonly me: Account;
  readonly onLogout: () => void;
  readonly onLoaded: (loaded: GameState) => void;
}) {
  const [saves, setSaves] = useState<CloudSaveMeta[] | null>(null);
  const [busy, setBusy] = useState<SaveSlot | 'logout' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void online.listSaves().then((r) => { if (active) setSaves(r); }).catch((e: unknown) => {
      if (active) setErr(e instanceof Error ? e.message : '클라우드 저장을 불러오지 못했습니다.');
    });
    return () => { active = false; };
  }, []);

  const load = async (slot: SaveSlot) => {
    setBusy(slot);
    setErr(null);
    try {
      const { data } = await online.getSave(slot);
      const s = parseSaveText(data);
      if (!s) throw new Error('이 저장을 읽지 못했습니다.');
      if (!(await saveGame(s))) throw new Error('이 기기에 저장하지 못했습니다.');
      onLoaded(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '불러오지 못했습니다.');
    } finally {
      setBusy(null);
    }
  };

  const logout = async () => {
    setBusy('logout');
    try {
      await online.logout();
      onLogout();
    } finally {
      setBusy(null);
    }
  };

  const cloudSaves = (saves ?? []).filter((s) => s.slot !== 'profile' && s.slot !== 'backup');

  return (
    <div className="boot-choices boot-online">
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <div className="boot-online-title" style={{ marginBottom: 0 }}>{me.username}님, 환영합니다</div>
        <button className="btn ghost" data-testid="boot-logout" style={{ marginLeft: 'auto' }} disabled={busy === 'logout'} onClick={() => void logout()}>로그아웃</button>
      </div>
      {err && <div className="boot-online-err">{err}</div>}
      {saves === null ? (
        <div className="boot-online-msg">클라우드 저장을 불러오고 있습니다.</div>
      ) : cloudSaves.length === 0 ? (
        <div className="boot-online-msg">클라우드에 저장한 판이 없습니다. 새 커리어를 시작하면 자동으로 올라갑니다.</div>
      ) : (
        cloudSaves.map((s) => (
          <button
            key={s.slot}
            className="btn big ghost"
            data-testid={`boot-cloud-load-${s.slot}`}
            disabled={busy === s.slot}
            onClick={() => void load(s.slot)}
          >
            {SLOT_LABEL[s.slot] ?? s.slot}
            <span className="boot-meta">{new Date(s.updatedAt).toLocaleString('ko-KR')}</span>
          </button>
        ))
      )}
    </div>
  );
}
