// DT-04 알림 토스트, DC-01 긴급 결정 창, 축하 연출(색종이). 화면 피드백 묶음.
import { useEffect, useMemo, useRef, useState } from 'react';
import { eventDef, resolveDecision } from '../core/events';
import { wonShort } from '../core/format';
import type { GameState, Notice, PendingDecision } from '../core/types';
import { act } from './store';
import { play } from './sound';
import { PxIcon, type PxId } from './icons';
import { COLORS as WORK_COLORS, contractDue, contractPace, daysText } from './apps/ScheduleApp';
import { forecast, KIND_NAME, milestones } from '../core/milestones';
import { RISK_TEXT } from './apps/MilestoneCard';
import './feedback.css';

const ICON: Record<Notice['kind'], PxId> = { info: 'talk', good: 'check', bad: 'warn', urgent: 'siren', achievement: 'trophy', mission: 'star' };
const LABEL: Record<Notice['kind'], string> = { info: '알림', good: '좋은 소식', bad: '주의', urgent: '긴급', achievement: '업적 달성', mission: '목표 완료' };
// 알림이 떠 있는 시간. 남은 시간은 토스트 아래 막대로 보여 줍니다.
const lifeOf = (k: Notice['kind']) => (k === 'urgent' || k === 'achievement' || k === 'mission' ? 9000 : 5500);
const TOAST_MAX = 3;

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
    setShown((cur) => [...cur, ...fresh.slice(-8).map((n) => ({ ...n, at: now }))].slice(-9));
  });
  // A-190: 최근 TOAST_MAX장만 카드로, 나머지는 위 한 줄로 묶음(누르면 잠깐 모두 펼침). 묶인 알림도 제 시간이 지나면 사라짐
  const [open, setOpen] = useState(false);
  const folded = shown.length > TOAST_MAX && !open ? shown.slice(0, -TOAST_MAX) : [];
  const cards = folded.length ? shown.slice(-TOAST_MAX) : shown;
  useEffect(() => {
    if (shown.length <= TOAST_MAX) setOpen(false);
  }, [shown.length]);

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
      {(folded.length > 0 || (open && shown.length > TOAST_MAX)) && (
        <button className="toast-more" data-testid="toasts-more" onClick={() => setOpen(!open)}>
          {folded.map((n) => (
            <i key={n.id} className={`tm-dot tm-${n.kind}`} />
          ))}
          {open ? '접기' : `알림 ${folded.length}개 더`}
        </button>
      )}
      {cards.map((n) => (
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

// 답장 선택지(A-152): 한 줄에 하나(이름 · 설명 / 오른쪽 비용), 기한이 지나면 고를 답에 "기본" 표시. 답한 뒤엔 내 답 + 결과
export function DecisionView({ d, onDone }: { d: PendingDecision; onDone?: () => void }) {
  const [res, setRes] = useState<string | null>(null);
  if (d.resolved) {
    const picked = d.choices[d.resolved.choice];
    return (
      <div className="dc-done">
        <div className="dc-done-head">
          <PxIcon id="check" size={14} />
          <span>{d.resolved.auto ? '기한이 지나 기본 답으로 정해졌습니다' : '내 답'}</span>
          {picked && <b>{picked.label}</b>}
        </div>
        <div className="dc-done-text">{d.resolved.text}</div>
      </div>
    );
  }
  const def = eventDef(d.eventId)?.default ?? d.choices.length - 1;
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
            <span className="dc-main">
              <span className="dc-label">
                {c.label}
                {c.isNew && <span className="chip green">NEW</span>}
                {i === def && <span className="chip">기본</span>}
              </span>
              {!c.enabled && c.why ? <span className="dc-hint bad">{c.why}</span> : c.hint && <span className="dc-hint">{c.hint}</span>}
            </span>
            <span className={`dc-cost ${c.cost > 0 ? '' : 'free'}`}>{c.cost > 0 ? wonShort(c.cost) : '비용 없음'}</span>
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
const isUrgent = (it: StackItem) => it.kind === 'urgent' || !!it.decision?.urgent;

// 외주 진행 카드(A-144): 진행 중인 외주는 마감이 걸린 중요한 상태라 알림 카드 맨 위에 늘 붙여 둡니다(✕ 없음, 개수 제한에 안 셈).
// A-235: ✕로 이 일감 카드만 치움(다음 외주를 받으면 다시 뜸)
function ContractStackCard({ s, onOpen, hidden, onHide }: { s: GameState; onOpen: (app: string, arg?: string) => void; hidden: string[]; onHide: (key: string) => void }) {
  const a = s.contracts?.active;
  if (!a || a.deadline === null || hidden.includes(`c-${a.id}`)) return null;
  const pct = Math.min(100, (a.done / a.work) * 100);
  const pace = contractPace(s);
  const eta = pace.total > 0 ? Math.max(0, a.work - a.done) / pace.total : null;
  const due = contractDue(s)!;
  const late = due.late;
  return (
    <div role="button" className={`ss-card contract ${late ? 'late' : ''}`} data-testid="stack-contract" onClick={() => onOpen('contract')}>
      <div className="ss-head">
        <PxIcon id="case" size={16} />
        <b className="ss-from">외주 · {a.title}</b>
        <span className={`ss-due ${late ? 'bad' : ''}`} title={due.tip}>
          {due.text}
        </span>
        <HideX onHide={() => onHide(`c-${a.id}`)} />
      </div>
      <div className="ss-progress">
        <b>{Math.floor(pct)}%</b>
        <div className="bar grow">
          <div style={{ width: `${pct}%`, background: WORK_COLORS.contract }} />
        </div>
      </div>
      <span className="ss-sub">{eta === null ? '아무도 안 하는 중 · 대표 주 업무나 개발팀 지시를 바꾸세요' : `${a.client} · 끝나는 때 ${daysText(eta)}${late ? ' · 마감보다 늦음' : ''}`}</span>
    </div>
  );
}

// 약속 카드(A-177): 진행 중인 약속 중 가장 급한 하나(늦을 것 같음 → 빠듯함 → 기한 가까운 순)를 외주 카드처럼 늘 붙여 둠. 누르면 CEO 일정
const RISK_RANK = { late: 0, tight: 1, ok: 2, done: 3 } as const;
function PromiseStackCard({ s, onOpen, hidden, onHide }: { s: GameState; onOpen: (app: string, arg?: string) => void; hidden: string[]; onHide: (key: string) => void }) {
  const act = milestones(s).filter((m) => m.status === 'active' && !hidden.includes(`p-${m.id}`));
  if (!act.length) return null;
  const rows = act.map((m) => ({ m, f: forecast(s, m) })).sort((a, b) => RISK_RANK[a.f.risk] - RISK_RANK[b.f.risk] || a.f.daysLeft - b.f.daysLeft);
  const { m, f } = rows[0];
  const r = RISK_TEXT[f.risk];
  return (
    <div role="button" className={`ss-card promise ${f.risk === 'late' ? 'late' : ''}`} data-testid="stack-milestone" onClick={() => onOpen('schedule')}>
      <div className="ss-head">
        <PxIcon id="clock" size={16} />
        <b className="ss-from">
          약속 · {KIND_NAME[m.kind]} {m.from}
        </b>
        <span className={`ss-due ${f.risk === 'late' ? 'bad' : ''}`}>{f.daysLeft >= 0 ? `${f.daysLeft}일 남음` : `${-f.daysLeft}일 지남`}</span>
        <HideX onHide={() => onHide(`p-${m.id}`)} />
      </div>
      <div className="ss-progress">
        <b>{Math.floor(f.progress * 100)}%</b>
        <div className="bar grow">
          <div style={{ width: `${f.progress * 100}%`, background: f.risk === 'late' ? 'var(--negative)' : f.risk === 'tight' ? 'var(--caution)' : 'var(--positive)' }} />
        </div>
      </div>
      <span className="ss-sub">
        {m.title} · {r.text}
        {rows.length > 1 ? ` · 약속 ${rows.length}개 진행 중` : ''}
      </span>
    </div>
  );
}

function HideX({ onHide }: { onHide: () => void }) {
  return (
    <button
      className="ss-x"
      title="이 카드 치우기"
      onClick={(e) => {
        e.stopPropagation();
        onHide();
      }}
    >
      ✕
    </button>
  );
}

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
      // A-235: 긴급 결정이 함께 낸 "긴급: …" 알림은 결정 카드와 같은 말이라 따로 띄우지 않음
      if (n.kind === 'urgent' && !n.read && s.day - n.day <= 3 && !s.decisions.some((d) => !d.resolved && d.urgent && d.channelId === n.arg))
        out.push({
          key: `n-${n.id}`,
          kind: 'urgent',
          from: '긴급',
          text: n.text,
          open: () => n.app && onOpen(n.app, n.arg),
          onDismiss: () => act((g) => g.notices.forEach((x) => x.id === n.id && (x.read = true))),
        });
    // 긴급(A-221): 긴급 알림·긴급 결정은 외주·약속 카드보다도 위, 맨 위에 둠
    return out.filter((x) => !hidden.includes(x.key)).sort((a, b) => +isUrgent(b) - +isUrgent(a));
  })();
  const hide = (key: string) => setHidden((h) => [...h, key]);
  const contract = !!s.contracts?.active && !hidden.includes(`c-${s.contracts.active.id}`);
  const promise = milestones(s).some((m) => m.status === 'active' && !hidden.includes(`p-${m.id}`));
  if (!items.length && !contract && !promise) return null;
  const show = items.slice(0, STACK_MAX);
  const card = (it: StackItem) => {
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
  };
  return (
    <div className="side-stack" data-testid="side-stack" onPointerDown={(e) => e.stopPropagation()}>
      {show.filter(isUrgent).map(card)}
      <ContractStackCard s={s} onOpen={onOpen} hidden={hidden} onHide={hide} />
      <PromiseStackCard s={s} onOpen={onOpen} hidden={hidden} onHide={hide} />
      {show.filter((it) => !isUrgent(it)).map(card)}
      {items.length > STACK_MAX && <div className="ss-more">외 {items.length - STACK_MAX}개 · 메신저에서 확인</div>}
    </div>
  );
}
