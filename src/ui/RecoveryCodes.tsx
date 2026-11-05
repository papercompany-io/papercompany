// 복구 코드는 응답을 받은 화면의 메모리에만 두고, 확인하면 지웁니다.
export function RecoveryCodes({ codes, onDismiss, buttonText = '보관했습니다 · 코드 숨기기' }: {
  readonly codes: readonly string[];
  readonly onDismiss: () => void;
  readonly buttonText?: string;
}) {
  return (
    <section className="warn col" data-testid="acc-recovery-codes" aria-label="일회용 복구 코드">
      <b>복구 코드는 지금 한 번만 표시합니다.</b>
      <p>안전한 곳에 보관해 주세요. 코드는 각각 한 번만 사용할 수 있으며, 화면을 닫으면 다시 볼 수 없습니다.</p>
      <p>비밀번호를 잊었을 때 계정을 되찾는 방법은 이 코드뿐입니다. 이메일로는 비밀번호를 찾을 수 없으니 꼭 적어 두세요.</p>
      <div style={{ fontFamily: 'monospace', userSelect: 'all', overflowWrap: 'anywhere' }}>{codes.join('  ')}</div>
      <button className="btn ghost" data-testid="acc-recovery-saved" onClick={onDismiss}>{buttonText}</button>
    </section>
  );
}
