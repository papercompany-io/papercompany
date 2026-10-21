import type { ReactNode } from 'react';
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
