// DT-04 알림 토스트, DC-01 긴급 결정 창, 축하 연출(색종이). 화면 피드백 묶음.
import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveDecision } from '../core/events';
import { wonShort } from '../core/format';
import type { GameState, Notice, PendingDecision } from '../core/types';
import { act } from './store';
import { play } from './sound';
import { PxIcon, type PxId } from './icons';
import './feedback.css';

const ICON: Record<Notice['kind'], PxId> = { info: 'talk', good: 'check', bad: 'warn', urgent: 'siren', achievement: 'trophy', mission: 'star' };
const LABEL: Record<Notice['kind'], string> = { info: '알림', good: '좋은 소식', bad: '주의', urgent: '긴급', achievement: '업적 달성', mission: '목표 완료' };
// 알림이 떠 있는 시간. 남은 시간은 토스트 아래 막대로 보여 줍니다.
const lifeOf = (k: Notice['kind']) => (k === 'urgent' || k === 'achievement' || k === 'mission' ? 9000 : 5500);

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
      setShown((cur) => cur.filter((n) => now - n.at < lifeOf(n.kind)));
    }, 500);
    return () => clearInterval(t);
  }, [shown.length]);

  return (
    <div className="toasts" data-testid="toasts">
      {shown.map((n) => (
        <button
          key={n.id}
          className={`toast ${n.kind} ${n.app ? 'link' : ''}`}
          style={{ ['--life' as string]: `${lifeOf(n.kind)}ms` }}
          onClick={() => {
            setShown((cur) => cur.filter((x) => x.id !== n.id));
            if (n.app) onOpen(n.app, n.arg);
          }}
        >
          <span className="toast-ic">
            <PxIcon id={ICON[n.kind]} size={18} />
          </span>
          <span className="toast-body">
            <span className="toast-label">{LABEL[n.kind]}</span>
            <span className="toast-text">{n.text}</span>
          </span>
          {n.app && <span className="toast-go">›</span>}
          <span className="toast-life" />
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

// 쌓이는 알림 카드(A-134): Startup Company처럼 왼쪽 메뉴 옆에 답을 기다리는 결정·직원 DM·긴급 알림이 카드로 쌓입니다.
// 누르면 그 대화를 열고, 결정 카드는 펼쳐서 바로 고를 수 있습니다. ✕는 이 카드만 치움(새 메시지가 오면 다시 뜸).
interface StackItem {
  key: string;
  kind: 'decision' | 'dm' | 'urgent';
  from: string;
  text: string;
  open: () => void;
  decision?: PendingDecision;
  onDismiss?: () => void;
}

const STACK_MAX = 4;

export function SideStack({ s, onOpen }: { s: GameState; onOpen: (app: string, arg?: string) => void }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const items = (() => {
    const out: StackItem[] = [];
    for (const d of s.decisions) if (!d.resolved) out.push({ key: `d-${d.id}`, kind: 'decision', from: d.from, text: d.text, decision: d, open: () => onOpen('messenger', d.channelId) });
    for (const ch of s.channels) {
      if (ch.kind !== 'dm' || ch.unread <= 0) continue;
      const last = ch.messages[ch.messages.length - 1];
      if (!last || last.decisionId) continue; // 결정 메시지는 위 결정 카드로
      out.push({ key: `m-${ch.id}-${last.id}`, kind: 'dm', from: ch.name, text: last.text, open: () => onOpen('messenger', ch.id) });
    }
    for (const n of s.notices)
      if (n.kind === 'urgent' && !n.read && s.day - n.day <= 3)
        out.push({
          key: `n-${n.id}`,
          kind: 'urgent',
          from: '긴급',
          text: n.text,
          open: () => n.app && onOpen(n.app, n.arg),
          onDismiss: () => act((g) => g.notices.forEach((x) => x.id === n.id && (x.read = true))),
        });
    return out.filter((x) => !hidden.includes(x.key));
  })();
  if (!items.length) return null;
  const show = items.slice(0, STACK_MAX);
  return (
    <div className="side-stack" data-testid="side-stack" onPointerDown={(e) => e.stopPropagation()}>
      {show.map((it) => {
        const open = expanded === it.key && it.decision;
        return (
          <div key={it.key} className={`ss-card ${it.kind} ${it.decision?.urgent ? 'urgent' : ''}`} data-testid={`stack-${it.kind}`}>
            <div className="ss-head">
              <PxIcon id={it.kind === 'dm' ? 'talk' : it.kind === 'urgent' || it.decision?.urgent ? 'siren' : 'warn'} size={16} />
              <b className="ss-from">{it.from}</b>
              {it.decision && <span className="ss-due">{Math.max(0, it.decision.deadline - s.day)}일 안에</span>}
              <button
                className="ss-x"
                title="이 카드 치우기"
                onClick={() => {
                  it.onDismiss?.();
                  setHidden((h) => [...h, it.key]);
                }}
              >
                ✕
              </button>
            </div>
            <button className="ss-text" onClick={() => (it.decision ? setExpanded(open ? null : it.key) : it.open())}>
              {it.text}
            </button>
            {open && it.decision && <DecisionView d={it.decision} onDone={() => setExpanded(null)} />}
            <div className="ss-foot">
              {it.decision && (
                <button className="btn small ghost" onClick={() => setExpanded(open ? null : it.key)}>
                  {open ? '접기' : '여기서 답하기'}
                </button>
              )}
              <button className="btn small" onClick={it.open}>
                {it.kind === 'urgent' ? '보기' : '대화 열기'}
              </button>
            </div>
          </div>
        );
      })}
      {items.length > STACK_MAX && <div className="ss-more">외 {items.length - STACK_MAX}개 · 메신저에서 확인</div>}
    </div>
  );
}
