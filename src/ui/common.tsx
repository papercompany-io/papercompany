import { useEffect, useRef, useState, type ReactNode } from 'react';
import { won, wonShort } from '../core/format';

export function Money({ v, full, testId }: { v: number; full?: boolean; testId?: string }) {
  return (
    <span className={`money ${v < 0 ? 'neg' : ''}`} data-testid={testId} title={won(v)}>
      {full ? won(v) : wonShort(v)}
    </span>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.id} data-testid={`tab-${t.id}`} className={`tab ${value === t.id ? 'on' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{children}</div>
    </div>
  );
}

export function chanceLabel(p: number): string {
  const level = p >= 0.65 ? '높음' : p >= 0.35 ? '보통' : '낮음';
  return `${level} (약 ${Math.round(p * 100)}%)`;
}

// HUD용: 값이 바뀌면 0.4초 동안 부드럽게 따라가며 셉니다(돈이 들어오고 나가는 느낌).
export function useTween(target: number, ms = 400): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    if (a === target) return;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const cur = a + (target - a) * e;
      from.current = cur;
      setV(cur);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

// 설명 문구: 화면에는 작은 "?"만 두고, 올리거나 누르면 펼쳐집니다(화면을 덜 복잡하게, A-84).
export function Help({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`help ${open ? 'open' : ''}`}>
      <button type="button" className="help-q" title={text} onClick={() => setOpen((o) => !o)} aria-label="설명">
        ?
      </button>
      {open && <span className="help-text">{text}</span>}
    </span>
  );
}
