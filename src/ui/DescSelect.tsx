// 설명 달린 고르기 칸(A-239): 브라우저 select는 항목마다 부연 설명을 못 붙여서, 같은 모양의 버튼 + 목록으로 대신함.
// 목록은 body에 띄워(창 overflow에 안 잘림) 버튼 아래(모자라면 위)에 붙고, 바깥을 누르거나 Esc·스크롤하면 닫힘. ↑↓ Enter 지원.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { uiZoom, viewH, viewW } from './meta';

export type DescOption = { value: string; label: string; desc?: string; note?: string; disabled?: boolean };

export function DescSelect({ value, options, onChange, className, testId, ariaLabel, minWidth = 260 }: {
  value: string;
  options: DescOption[];
  onChange: (v: string) => void;
  className?: string;
  testId?: string;
  ariaLabel?: string;
  minWidth?: number;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const cur = options.find((o) => o.value === value) ?? options[0];

  const openList = () => {
    setHi(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const pick = (o: DescOption) => {
    if (o.disabled) return;
    setOpen(false);
    btn.current?.focus();
    if (o.value !== value) onChange(o.value);
  };

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    // 화면 크기(A-241): 버튼 자리·화면 넓이는 화면 픽셀이라 zoom으로 나눠 CSS 픽셀로
    const z = uiZoom();
    const b = btn.current.getBoundingClientRect();
    const r = { left: b.left / z, top: b.top / z, bottom: b.bottom / z, width: b.width / z };
    const W = viewW();
    const H = viewH();
    const below = H - r.bottom - 8;
    const above = r.top - 8;
    const up = below < 220 && above > below;
    const width = Math.max(r.width, minWidth);
    const left = Math.max(8, Math.min(r.left, W - width - 8));
    setPos(up ? { left, width, bottom: H - r.top + 4, maxH: Math.min(420, above) } : { left, width, top: r.bottom + 4, maxH: Math.min(420, below) });
  }, [open, minWidth]);

  useEffect(() => {
    if (!open) return;
    const away = (ev: MouseEvent) => {
      const t = ev.target as Node;
      if (!list.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const close = (ev: Event) => {
      if (ev.type === 'scroll' && list.current?.contains(ev.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', away);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>('[data-hi="1"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, hi]);

  const step = (dir: 1 | -1) => {
    let i = hi;
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i].disabled) return setHi(i);
    }
  };
  const onKey = (ev: React.KeyboardEvent) => {
    if (!open) {
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        openList();
      }
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      setOpen(false);
    } else if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      step(1);
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      step(-1);
    } else if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      pick(options[hi]);
    } else if (ev.key === 'Tab') setOpen(false);
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`dsel-btn ${className ?? ''}`}
        data-testid={testId}
        data-value={value}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKey}
      >
        <span className="dsel-cur">{cur?.label}</span>
        {cur?.note && <span className="dsel-note">{cur.note}</span>}
        <i className="dsel-caret" aria-hidden />
      </button>
      {open &&
        pos &&
        createPortal(
          <ul ref={list} className="dsel-list" role="listbox" style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}>
            {options.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled}
                data-hi={i === hi ? 1 : undefined}
                data-testid={testId ? `${testId}-opt-${o.value || 'none'}` : undefined}
                className={`dsel-opt${o.value === value ? ' on' : ''}${o.disabled ? ' off' : ''}${i === hi ? ' hi' : ''}`}
                onMouseEnter={() => !o.disabled && setHi(i)}
                onClick={() => pick(o)}
              >
                <span className="dsel-label">
                  {o.label}
                  {o.note && <small>{o.note}</small>}
                </span>
                {o.desc && <span className="dsel-desc">{o.desc}</span>}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
