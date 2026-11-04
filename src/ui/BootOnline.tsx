// A-251 부팅 화면의 온라인 선택: 저장이 없을 때만 로컬/온라인을 고르게 하고, 온라인을 고르면 로그인하거나 바로 가입해 클라우드 main 칸을 그 기기로 당겨옵니다.
// AccountPanel(설정 안 계정 묶음)과 같은 online API를 쓰지만, 부팅 화면에 맞는 어두운 배색으로 따로 그립니다.
import { useState } from 'react';
import { online, OnlineError, setOnlineMode } from '../platform/online';
import { parseSaveText, saveGame } from '../platform/save';
import type { GameState } from '../core/types';
import { RecoveryCodes } from './RecoveryCodes';

type Step = 'login' | 'register' | 'codes' | 'verify' | 'second';

export function BootOnline({ onDone, onCancel }: {
  readonly onDone: (loaded: GameState | null) => void; // loaded: 클라우드에 있던 판(없으면 null, 새 커리어로)
  readonly onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [ticket, setTicket] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

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

  const run = (fn: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof OnlineError ? e.message : '요청을 마치지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const login = run(async () => {
    const r = await online.login(username, password);
    if ('needTotp' in r) { setTicket(r.ticket); setStep('second'); return; }
    await afterLogin();
  });
  const register = run(async () => {
    const r = await online.register(username, email, password);
    setCodes(r.recoveryCodes);
    setStep('codes');
  });
  const verify = run(async () => {
    await online.verifyEmail(email, code);
    setCode('');
    setMsg('이메일을 인증했습니다. 로그인해 주세요.');
    setStep('login');
  });
  const second = run(async () => {
    await (useRecovery ? online.loginRecovery(ticket, code) : online.loginTotp(ticket, code));
    await afterLogin();
  });

  const field = (value: string, onChange: (v: string) => void, label: string, type = 'text', testid?: string) => (
    <label className="boot-field">
      <span>{label}</span>
      <input data-testid={testid} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );

  return (
    <div className="boot-choices boot-online" onClick={(e) => e.stopPropagation()}>
      <div className="boot-online-title">
        {step === 'login' && '로그인하고 온라인으로 시작'}
        {step === 'register' && '회원가입하고 온라인으로 시작'}
        {step === 'verify' && '이메일 인증'}
        {step === 'second' && '2단계 인증'}
        {step === 'codes' && '복구 코드'}
      </div>
      {err && <div className="boot-online-err">{err}</div>}
      {msg && step === 'login' && <div className="boot-online-msg">{msg}</div>}
      {step === 'login' && (
        <>
          {field(username, setUsername, '아이디', 'text', 'boot-online-username')}
          {field(password, setPassword, '비밀번호', 'password', 'boot-online-password')}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" data-testid="boot-online-login" disabled={busy || !username.trim() || !password} onClick={() => void login()}>로그인</button>
            <button className="btn ghost" data-testid="boot-online-to-register" onClick={() => { setErr(null); setMsg(null); setStep('register'); }}>회원가입</button>
          </div>
          <button className="btn ghost" data-testid="boot-online-cancel" onClick={onCancel}>로컬로 시작</button>
        </>
      )}
      {step === 'register' && (
        <>
          {field(username, setUsername, '아이디', 'text', 'boot-online-reg-username')}
          {field(email, setEmail, '이메일', 'email', 'boot-online-reg-email')}
          {field(password, setPassword, '비밀번호', 'password', 'boot-online-reg-password')}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" data-testid="boot-online-register" disabled={busy || !username.trim() || !email.trim() || password.length < 8} onClick={() => void register()}>가입하기</button>
            <button className="btn ghost" onClick={() => { setErr(null); setStep('login'); }}>돌아가기</button>
          </div>
        </>
      )}
      {step === 'verify' && (
        <>
          <div className="boot-online-msg">가입하신 이메일({email})로 인증 코드를 보냈습니다.</div>
          {field(code, setCode, '이메일 인증 코드', 'text', 'boot-online-verify-code')}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" data-testid="boot-online-verify" disabled={busy || !code.trim()} onClick={() => void verify()}>인증하기</button>
            <button className="btn ghost" data-testid="boot-online-resend" disabled={busy} onClick={run(async () => { await online.resendVerification(email); setErr(null); setMsg('인증 메일을 다시 보냈습니다.'); })}>메일 다시 받기</button>
          </div>
        </>
      )}
      {step === 'second' && (
        <>
          {field(code, setCode, useRecovery ? '복구 코드' : '인증 앱의 6자리 코드', 'text', 'boot-online-code')}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" data-testid="boot-online-second" disabled={busy || !code.trim()} onClick={() => void second()}>확인</button>
            <button className="btn ghost" onClick={() => setUseRecovery(!useRecovery)}>{useRecovery ? '인증 앱 코드 쓰기' : '복구 코드 쓰기'}</button>
          </div>
        </>
      )}
      {step !== 'login' && step !== 'codes' && (
        <button className="btn ghost" onClick={onCancel}>로컬로 시작</button>
      )}
      {codes && step === 'codes' && (
        <RecoveryCodes codes={codes} buttonText="보관했습니다 · 이메일 인증으로" onDismiss={() => { setCodes(null); setStep('verify'); }} />
      )}
    </div>
  );
}
