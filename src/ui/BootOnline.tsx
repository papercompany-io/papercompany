// A-251 부팅 화면의 온라인 선택: 저장이 없을 때만 로컬/온라인을 고르게 하고, 온라인을 고르면 로그인해 클라우드 main 칸을 그 기기로 당겨옵니다.
// 계정 설정의 전체 AccountPanel(가입·TOTP 관리 등)과 달리 로그인에 필요한 최소 입력만 둡니다. 가입은 "나중에 설정에서" 안내로 넘깁니다.
import { useState } from 'react';
import { online, OnlineError, setOnlineMode } from '../platform/online';
import { parseSaveText, saveGame } from '../platform/save';
import type { GameState } from '../core/types';

type Step = 'login' | 'second';

export function BootOnline({ onDone, onCancel }: {
  readonly onDone: (loaded: GameState | null) => void; // loaded: 클라우드에 있던 판(없으면 null, 새 커리어로)
  readonly onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [ticket, setTicket] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function afterLogin() {
    setOnlineMode(true);
    try {
      const { data } = await online.getSave('main');
      const s = parseSaveText(data);
      if (s) {
        await saveGame(s);
        onDone(s);
        return;
      }
    } catch {
      /* 클라우드에 저장이 없으면 새 커리어로 시작 */
    }
    onDone(null);
  }

  const login = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await online.login(username, password);
      if ('needTotp' in r) { setTicket(r.ticket); setStep('second'); return; }
      await afterLogin();
    } catch (e) {
      setErr(e instanceof OnlineError ? e.message : '로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };
  const second = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await (useRecovery ? online.loginRecovery(ticket, code) : online.loginTotp(ticket, code));
      await afterLogin();
    } catch (e) {
      setErr(e instanceof OnlineError ? e.message : '확인하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="boot-choices col" style={{ gap: 10 }} onClick={(e) => e.stopPropagation()}>
      <div className="hf-title">로그인하고 온라인으로 시작</div>
      {err && <div className="warn" data-testid="boot-online-err">{err}</div>}
      {step === 'login' && (
        <>
          <label className="col" style={{ gap: 4 }}>
            <span className="hf-label">아이디</span>
            <input data-testid="boot-online-username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </label>
          <label className="col" style={{ gap: 4 }}>
            <span className="hf-label">비밀번호</span>
            <input data-testid="boot-online-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" data-testid="boot-online-login" disabled={busy || !username.trim() || !password} onClick={() => void login()}>로그인</button>
            <button className="btn ghost" data-testid="boot-online-cancel" onClick={onCancel}>취소</button>
          </div>
          <div className="tiny muted">계정이 없으면 게임 안 설정에서 가입할 수 있습니다. 일단 로컬로 시작해도 나중에 언제든 연동할 수 있습니다.</div>
        </>
      )}
      {step === 'second' && (
        <>
          <label className="col" style={{ gap: 4 }}>
            <span className="hf-label">{useRecovery ? '복구 코드' : '인증 앱의 6자리 코드'}</span>
            <input data-testid="boot-online-code" value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" data-testid="boot-online-second" disabled={busy || !code.trim()} onClick={() => void second()}>확인</button>
            <button className="btn ghost" onClick={() => setUseRecovery(!useRecovery)}>{useRecovery ? '인증 앱 코드 쓰기' : '복구 코드 쓰기'}</button>
            <button className="btn ghost" onClick={onCancel}>취소</button>
          </div>
        </>
      )}
    </div>
  );
}
