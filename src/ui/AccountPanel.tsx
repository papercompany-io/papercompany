// 계정·클라우드 저장 묶음(A-247). 설정 창 아래에 붙습니다. 서버가 없거나 로그아웃이면 오프라인으로 그대로 플레이합니다.
import { useEffect, useState } from 'react';
import { getServerUrl, isElectronUrlEditable, online, OnlineError, setServerUrl, type Account, type CloudSaveMeta, type SaveSlot } from '../platform/online';
import { parseSaveText, saveGame } from '../platform/save';
import { setGame, useGame } from './store';
import { RecoveryCodes } from './RecoveryCodes';

type Step = 'login' | 'register' | 'codes' | 'verify' | 'second' | 'reset';
type Form = { username: string; email: string; password: string; code: string; url: string };

export function AccountPanel() {
  const g = useGame();
  const [me, setMe] = useState<Account | null>(null);
  const [step, setStep] = useState<Step>('login');
  const [f, setF] = useState<Form>({ username: '', email: '', password: '', code: '', url: getServerUrl() });
  const [ticket, setTicket] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saves, setSaves] = useState<CloudSaveMeta[]>([]);
  const [totp, setTotp] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [confirm, setConfirm] = useState<{ slot: SaveSlot; kind: 'load' | 'del' } | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const run = (fn: () => Promise<unknown>, okText?: string) => async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (okText) setMsg({ ok: true, text: okText });
    } catch (e) {
      if (e instanceof OnlineError && e.code === 'conflict') {
        setMsg({ ok: false, text: '다른 기기에서 먼저 바뀐 판이 있습니다. 목록을 새로 받았으니 확인하고 다시 해 주세요.' });
        await refresh();
      } else setMsg({ ok: false, text: e instanceof Error ? e.message : '요청을 마치지 못했습니다.' });
    } finally {
      setBusy(false);
    }
  };
  async function refresh() {
    const r = await online.me();
    setMe(r.state === 'in' ? r.account : null);
    setOffline(r.state === 'offline');
    if (r.state === 'error') setMsg({ ok: false, text: r.message });
    if (r.state === 'in') {
      try {
        setSaves(await online.listSaves());
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message });
      }
    }
  }
  const loadCloud = async (slot: SaveSlot) => {
    const { data } = await online.getSave(slot);
    const s = parseSaveText(data);
    if (!s) throw new Error('클라우드 판을 읽지 못했습니다. 지금 판은 그대로입니다.');
    if (!(await saveGame(s))) throw new Error('이 기기에 저장하지 못했습니다. 지금 판은 그대로입니다.');
    setGame(s);
    setConfirm(null);
  };
  useEffect(() => {
    void refresh();
  }, []);

  const field = (k: keyof Form, label: string, type = 'text') => (
    <label className="col" style={{ gap: 4 }}>
      <span className="hf-label">{label}</span>
      <input data-testid={`acc-${k}`} type={type} value={f[k]} onChange={set(k)} autoComplete={type === 'password' ? (step === 'register' || step === 'reset' ? 'new-password' : 'current-password') : k === 'username' ? 'username' : 'off'} />
    </label>
  );

  return (
    <div className="set-group col" data-testid="account-panel" style={{ gap: 10, padding: 16 }}>
      <div className="hf-title">계정과 클라우드 저장</div>
      {isElectronUrlEditable() && (
        <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
          {field('url', '서버 주소')}
          <button className="btn small ghost" data-testid="acc-url-save" onClick={run(async () => { const bad = await setServerUrl(f.url); if (bad) throw new Error(bad); await refresh(); }, '서버 주소를 저장했습니다.')}>저장</button>
        </div>
      )}
      {msg && <div className={msg.ok ? 'ok' : 'warn'} data-testid="acc-msg">{msg.text}</div>}

      {offline && <div className="tiny muted" data-testid="acc-offline">오프라인입니다. 이 기기 저장으로 그대로 플레이합니다.</div>}
      {!me && step === 'login' && (
        <>
          <div className="tiny muted">로그인하지 않아도 지금처럼 이 기기에서 플레이할 수 있습니다.</div>
          {field('username', '아이디')}
          {field('password', '비밀번호', 'password')}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" data-testid="acc-login" disabled={busy} onClick={run(async () => {
              const r = await online.login(f.username, f.password);
              setF((old) => ({ ...old, password: '', code: '' }));
              if ('needTotp' in r) { setTicket(r.ticket); setStep('second'); } else await refresh();
            })}>로그인</button>
            <button className="btn ghost" data-testid="acc-to-register" onClick={() => setStep('register')}>회원가입</button>
            <button className="btn ghost" data-testid="acc-to-reset" onClick={() => { setF((old) => ({ ...old, password: '', code: '' })); setStep('reset'); }}>계정을 잃었나요?</button>
          </div>
        </>
      )}
      {!me && step === 'register' && (
        <>
          {field('username', '아이디')}
          {field('email', '이메일', 'email')}
          {field('password', '비밀번호', 'password')}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" data-testid="acc-register" disabled={busy} onClick={run(async () => {
              const result = await online.register(f.username, f.email, f.password);
              setCodes(result.recoveryCodes);
              setF((old) => ({ ...old, password: '', code: '' }));
              setStep('codes');
            }, '인증 코드를 이메일로 보냈습니다.')}>가입하기</button>
            <button className="btn ghost" onClick={() => setStep('login')}>돌아가기</button>
          </div>
        </>
      )}
      {!me && step === 'verify' && (
        <>
          {field('email', '이메일', 'email')}
          {field('code', '이메일 인증 코드')}
          <button className="btn" data-testid="acc-verify" disabled={busy} onClick={run(async () => {
            await online.verifyEmail(f.email, f.code);
            setF((old) => ({ ...old, code: '' }));
            setStep('login');
          }, '이메일을 인증했습니다. 로그인해 주세요.')}>인증하기</button>
          <button className="btn ghost" data-testid="acc-resend" disabled={busy} onClick={run(() => online.resendVerification(f.email), '인증 메일을 다시 요청했습니다.')}>인증 메일 다시 받기</button>
        </>
      )}
      {!me && step === 'reset' && (
        <form className="col" onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await online.resetRecovery(f.username, f.code, f.password);
            setF((old) => ({ ...old, password: '', code: '' }));
            setTicket(''); setCodes(null); setTotp(null); setStep('login');
          }, '비밀번호를 바꿨습니다. 기존 로그인과 2단계 인증은 해제되었습니다. 새 비밀번호로 로그인해 주세요.')();
        }}>
          <div className="warn">가입할 때 받은 복구 코드 한 개로 비밀번호를 바꿉니다. 모든 기기의 로그인과 2단계 인증이 해제됩니다. 이메일로는 비밀번호를 찾을 수 없으며, 복구 코드도 잃었다면 계정을 되찾을 수 없습니다.</div>
          {field('username', '아이디')}
          {field('code', '일회용 복구 코드')}
          {field('password', '새 비밀번호(8자 이상, 72바이트 이하)', 'password')}
          <div className="row">
            <button className="btn" type="submit" data-testid="acc-reset" disabled={busy || !f.username.trim() || !f.code.trim() || f.password.length < 8}>비밀번호 바꾸기</button>
            <button className="btn ghost" type="button" onClick={() => { setF((old) => ({ ...old, password: '', code: '' })); setStep('login'); }}>취소</button>
          </div>
        </form>
      )}
      {!me && step === 'second' && (
        <>
          {field('code', useRecovery ? '복구 코드' : '인증 앱의 6자리 코드')}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" data-testid="acc-second" onClick={run(async () => {
              await (useRecovery ? online.loginRecovery(ticket, f.code) : online.loginTotp(ticket, f.code));
              setTicket(''); setF((old) => ({ ...old, code: '' })); setStep('login'); await refresh();
            })}>확인</button>
            <button className="btn ghost" data-testid="acc-use-recovery" onClick={() => setUseRecovery(!useRecovery)}>{useRecovery ? '인증 앱 코드 쓰기' : '복구 코드 쓰기'}</button>
          </div>
        </>
      )}

      {me && (
        <>
          <div className="row" style={{ gap: 8 }}>
            <b data-testid="acc-name">{me.username}</b>
            <span className="tiny muted">{me.totpEnabled ? '2단계 인증 사용 중' : '2단계 인증 꺼짐'}</span>
            <button className="btn small ghost" data-testid="acc-logout" style={{ marginLeft: 'auto' }} onClick={run(async () => {
              await online.logout(); setMe(null); setCodes(null); setTotp(null); setTicket('');
              setF((old) => ({ ...old, password: '', code: '' }));
            })}>로그아웃</button>
          </div>
          {!me.totpEnabled && !totp && <button className="btn small ghost" data-testid="acc-totp-setup" onClick={run(async () => setTotp(await online.totpSetup()))}>2단계 인증 켜기</button>}
          {totp && (
            <>
              <div className="tiny">인증 앱에 아래 키를 등록하고 6자리 코드를 넣어 주세요.</div>
              <code data-testid="acc-totp-secret" style={{ userSelect: 'all', wordBreak: 'break-all' }}>{totp.secret}</code>
              {field('code', '6자리 코드')}
              <button className="btn small" data-testid="acc-totp-enable" onClick={run(async () => { setCodes((await online.totpEnable(f.code)).recoveryCodes); setTotp(null); await refresh(); })}>켜기</button>
            </>
          )}
          {me.totpEnabled && (
            <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
              {field('code', '인증 앱 코드')}
              <button className="btn small ghost" data-testid="acc-recovery-new" onClick={run(async () => { setCodes((await online.regenerateRecovery({ code: f.code })).recoveryCodes); setF((old) => ({ ...old, code: '' })); }, '새 복구 코드를 받았습니다. 이전 복구 코드는 더 이상 쓸 수 없습니다.')}>복구 코드 새로 받기</button>
              <button className="btn small red" data-testid="acc-totp-disable" onClick={run(async () => { await online.totpDisable(f.code); await refresh(); }, '2단계 인증을 껐습니다.')}>끄기</button>
            </div>
          )}
          {!me.totpEnabled && !totp && (
            <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              {field('password', '현재 비밀번호', 'password')}
              <button className="btn small ghost" data-testid="acc-recovery-new" onClick={run(async () => {
                setCodes((await online.regenerateRecovery({ password: f.password })).recoveryCodes);
                setF((old) => ({ ...old, password: '' }));
              }, '새 복구 코드를 받았습니다. 이전 복구 코드는 더 이상 쓸 수 없습니다.')}>복구 코드 새로 받기</button>
            </div>
          )}
          <div className="hf-title">클라우드 저장</div>
          <button className="btn small" data-testid="cloud-upload" onClick={run(async () => { await online.putSave('main', JSON.stringify({ ...g, events: [] }), saves.find((x) => x.slot === 'main')?.revision ?? null); await refresh(); }, '지금 판을 클라우드에 올렸습니다.')}>지금 판 올리기</button>
          {saves.length === 0 && <div className="tiny muted">클라우드에 저장한 판이 없습니다.</div>}
          {saves.filter((s) => s.slot !== 'profile' && s.slot !== 'backup').map((s) => (
            <div key={s.slot} className="row" style={{ gap: 8 }} data-testid={`cloud-${s.slot}`}>
              <span>{s.slot === 'main' ? '기본 칸' : s.slot}</span>
              <span className="tiny muted">{new Date(s.updatedAt).toLocaleString('ko-KR')}</span>
              <span style={{ marginLeft: 'auto' }} />
              {confirm?.slot === s.slot ? (
                <>
                  <span className="tiny">{confirm.kind === 'load' ? '이 기기의 지금 판을 덮어씁니다.' : '클라우드에서 이 판을 지웁니다. 되돌릴 수 없습니다.'}</span>
                  {confirm.kind === 'load' ? (
                    <button className="btn small red" data-testid={`cloud-load-yes-${s.slot}`} onClick={run(() => loadCloud(s.slot), '클라우드 판을 불러와 이 기기에 저장했습니다.')}>불러오기</button>
                  ) : (
                    <button className="btn small red" data-testid={`cloud-del-yes-${s.slot}`} onClick={run(async () => { await online.deleteSave(s.slot, s.revision); setConfirm(null); await refresh(); }, '클라우드 판을 지웠습니다.')}>지우기</button>
                  )}
                  <button className="btn small ghost" onClick={() => setConfirm(null)}>취소</button>
                </>
              ) : (
                <>
                  <button className="btn small ghost" data-testid={`cloud-load-${s.slot}`} onClick={() => setConfirm({ slot: s.slot, kind: 'load' })}>불러오기</button>
                  <button className="btn small ghost" data-testid={`cloud-del-${s.slot}`} onClick={() => setConfirm({ slot: s.slot, kind: 'del' })}>지우기</button>
                </>
              )}
            </div>
          ))}
        </>
      )}
      {codes && <RecoveryCodes codes={codes} buttonText={step === 'codes' ? '보관했습니다 · 이메일 인증으로' : undefined} onDismiss={() => {
        setCodes(null);
        if (step === 'codes') setStep('verify');
      }} />}
    </div>
  );
}
