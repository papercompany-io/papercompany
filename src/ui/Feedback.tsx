// DT-04 알림 토스트, DC-01 긴급 결정 창, 축하 연출(색종이). 화면 피드백 묶음.
import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveDecision } from '../core/events';
import { wonShort } from '../core/format';
import type { GameState, Notice, PendingDecision } from '../core/types';
import { act } from './store';
import { play } from './sound';
import './feedback.css';

const ICON: Record<Notice['kind'], string> = { info: '💬', good: '✅', bad: '⚠️', urgent: '🚨', achievement: '🏆', mission: '⭐' };

export function Toasts({ s, enabled, onOpen }: { s: GameState; enabled: boolean; onOpen: (app: string, arg?: string) => void }) {
  const seen = useRef<string | null>(s.notices.length ? s.notices[s.notices.length - 1].id : null);
  const [shown, setShown] = useState<(Notice & { at: number })[]>([]);

  useEffect(() => {
    const list = s.notices;
    const idx = seen.current ? list.findIndex((n) => n.id === seen.current) : -1;
    const fresh = list.slice(idx + 1);
    if (!fresh.length) return;
    seen.current = list[list.length - 1].id;
    if (!enabled) return;
    const now = Date.now();
    setShown((cur) => [...cur, ...fresh.slice(-4).map((n) => ({ ...n, at: now }))].slice(-5));
  });

  useEffect(() => {
    if (!shown.length) return;
    const t = setInterval(() => {
      const now = Date.now();
      setShown((cur) => cur.filter((n) => now - n.at < (n.kind === 'urgent' || n.kind === 'achievement' || n.kind === 'mission' ? 9000 : 5500)));
    }, 500);
    return () => clearInterval(t);
  }, [shown.length]);

  return (
    <div className="toasts" data-testid="toasts">
      {shown.map((n) => (
        <button
          key={n.id}
          className={`toast ${n.kind}`}
          onClick={() => {
            setShown((cur) => cur.filter((x) => x.id !== n.id));
            if (n.app) onOpen(n.app, n.arg);
          }}
        >
          <span className="toast-ic">{ICON[n.kind]}</span>
          <span className="toast-text">{n.text}</span>
        </button>
      ))}
    </div>
  );
}

export function DecisionView({ d, onDone }: { d: PendingDecision; onDone?: () => void }) {
  const [res, setRes] = useState<string | null>(null);
  if (d.resolved) return <div className="ok">결과: {d.resolved.text}</div>;
  return (
    <div className="decision" data-testid="decision">
      <div className="dc-choices">
        {d.choices.map((c, i) => (
          <button
            key={i}
            className="dc-choice"
            data-testid={`choice-${i}`}
            disabled={!c.enabled}
            onClick={() => {
              const err = act((g) => resolveDecision(g, d.id, i));
              if (err) setRes(err);
              else {
                play('click');
                onDone?.();
              }
            }}
          >
            <span className="dc-label">
              {c.label} {c.isNew && <span className="chip green">NEW</span>}
            </span>
            {c.cost > 0 && <span className="dc-cost">비용 {wonShort(c.cost)}</span>}
            {c.hint && <span className="dc-hint">{c.hint}</span>}
            {!c.enabled && c.why && <span className="dc-hint bad">{c.why}</span>}
          </button>
        ))}
      </div>
      {res && <div className="err">{res}</div>}
    </div>
  );
}

export function DecisionModal({ d, onClose, onOpenMessenger }: { d: PendingDecision; onClose: () => void; onOpenMessenger: () => void }) {
  return (
    <div className="modal-bg">
      <div className="modal decision-modal" data-testid="urgent-decision">
        <div className="dm-head">
          <span className="dm-siren">!</span>
          <div className="grow">
            <div className="dm-kind">긴급 결정</div>
            <b className="dm-from">{d.from}</b>
          </div>
          <span className="dm-deadline">기한 {d.deadline - d.day}일 · 시간 멈춤</span>
        </div>
        <div className="dm-body">
          <div className="dm-text">{d.text}</div>
          <DecisionView d={d} onDone={onClose} />
          <div className="row dm-foot">
            <button className="btn small ghost" onClick={onOpenMessenger}>
              메신저에서 보기
            </button>
            <span className="tiny muted grow">나중에 답하면 기한이 지날 때 기본 선택이 적용됩니다.</span>
            <button className="btn small ghost" onClick={onClose}>
              나중에
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const COLORS = ['#2d8fd5', '#36b44a', '#f0a020', '#d9453b', '#a77bff', '#ff7043'];

export function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        dur: 1.6 + Math.random() * 1.2,
        color: COLORS[i % COLORS.length],
        size: 5 + Math.floor(Math.random() * 3) * 2,
        drift: (Math.random() - 0.5) * 160,
      })),
    [],
  );
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setOn(false), 3200);
    return () => clearTimeout(t);
  }, []);
  if (!on) return null;
  return (
    <div className="confetti">
      {bits.map((b, i) => (
        <i key={i} style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, background: b.color, width: b.size, height: b.size, ['--drift' as string]: `${b.drift}px` }} />
      ))}
    </div>
  );
}
