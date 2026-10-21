// F06 메신저: MG-01 채널 구성(#전체·팀 채널·그룹·DM·외부 연락처), MG-03 부서 지시(맡은 일 선택지), DC-01 메시지 속 결정 버튼
import { useEffect, useRef, useState } from 'react';
import { dept, ordersFor } from '../../core/data';
import { formatDate } from '../../core/calendar';
import { orderOf, setOrder } from '../../core/orders';
import { createGroup, markRead } from '../../core/messenger';
import { deptMembers } from '../../core/employees';
import { deptOutput } from '../../core/staff';
import { act, useGame } from '../store';
import { DecisionView } from '../Feedback';
import type { Channel, DeptId } from '../../core/types';
import './apps.css';

export function MessengerApp({ initial, openInvest }: { initial?: string; openInvest: () => void }) {
  const s = useGame();
  const [sel, setSel] = useState<string>(initial && s.channels.some((c) => c.id === initial) ? initial : 'all');
  const [err, setErr] = useState<string | null>(null);
  const [grouping, setGrouping] = useState<string[] | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const ch = s.channels.find((c) => c.id === sel) ?? s.channels[0];

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
    if (ch.unread) act((g) => markRead(g, ch.id));
  }, [sel, ch.messages.length]);
  const pending = s.decisions.filter((d) => !d.resolved);

  const groups: { title: string; kind: Channel['kind'][] }[] = [
    { title: '채널', kind: ['all', 'team'] },
    { title: '그룹 메시지', kind: ['group'] },
    { title: '다이렉트 메시지', kind: ['dm'] },
    { title: '외부 연락처', kind: ['external'] },
  ];

  return (
    <div className="messenger">
      <aside className="msg-side">
        <div className="ws-name">{s.company.name}</div>
        {pending.length > 0 && (
          <div className="side-title" style={{ color: '#ffb3ad' }}>
            답을 기다리는 결정 {pending.length}
          </div>
        )}
        {pending.map((d) => (
          <button key={d.id} className={`side-item ${d.channelId === sel ? 'on' : ''}`} onClick={() => setSel(d.channelId)}>
            {d.urgent ? '🚨 ' : '💬 '}
            {d.from}
          </button>
        ))}
        {groups.map((g) => (
          <div key={g.title}>
            <div className="side-title">
              {g.title}
              {g.title === '그룹 메시지' && (
                <button className="mini" data-testid="group-new" onClick={() => setGrouping([])} disabled={s.employees.length < 2}>
                  +
                </button>
              )}
            </div>
            {s.channels
              .filter((c) => g.kind.includes(c.kind))
              .map((c) => (
                <button key={c.id} data-testid={`ch-${c.id}`} className={`side-item ${c.id === sel ? 'on' : ''}`} onClick={() => { setSel(c.id); setErr(null); }}>
                  {c.kind === 'all' || c.kind === 'team' ? '# ' : c.kind === 'external' ? '✉ ' : '● '}
                  {c.name}
                  {c.unread > 0 && c.id !== sel && <span className="unread">{c.unread > 99 ? '99+' : c.unread}</span>}
                </button>
              ))}
          </div>
        ))}
      </aside>
      <section className="msg-main">
        <div className="msg-head">
          <b>
            {ch.kind === 'all' || ch.kind === 'team' ? '#' : ''}
            {ch.name}
          </b>
          <span className="tiny muted">{ch.kind === 'external' ? '외부 연락처' : `구성원 ${ch.memberIds.length}명`}</span>
        </div>
        <div className="msg-list" data-testid="msg-list">
          {ch.messages.length === 0 && <div className="tiny muted">아직 메시지가 없습니다.</div>}
          {ch.messages.map((m) => (
            <div key={m.id} className={`msg ${m.kind}`}>
              <div className="msg-meta">
                <b>{m.from}</b> <span>{formatDate(m.day)}</span>
              </div>
              <div>{m.text}</div>
              {m.decisionId && <MsgDecision id={m.decisionId} />}
            </div>
          ))}
          <div ref={bottom} />
        </div>
        <div className="msg-compose">
          {ch.kind === 'team' && ch.dept && <TeamOrders deptId={ch.dept} onErr={setErr} />}
          {ch.kind === 'all' && <div className="tiny muted">#전체는 회사 소식을 보는 채널입니다. 일은 각 팀 채널에서 부서가 맡을 일을 정합니다.</div>}
          {(ch.kind === 'dm' || ch.kind === 'group') && <div className="tiny muted">지시는 팀 채널에서 부서 단위로 내립니다(개인 지시 없음). 직원의 고민·제안은 DM으로 옵니다.</div>}
          {ch.kind === 'external' && (
            <div className="row tiny muted">
              투자사에 보내는 레터는 투자 앱에서 선택지로 고릅니다. 다른 외부 연락은 메시지 속 버튼으로 답합니다.
              <button className="btn small" onClick={openInvest}>
                투자 앱 열기
              </button>
            </div>
          )}
          {err && <div className="err">{err}</div>}
        </div>
      </section>
      {grouping && (
        <div className="modal-bg" onClick={() => setGrouping(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <b>그룹 메시지 만들기</b>
            <div className="col">
              {s.employees.map((e) => (
                <label key={e.id} className="row tiny">
                  <input type="checkbox" checked={grouping.includes(e.id)} onChange={(ev) => setGrouping(ev.target.checked ? [...grouping, e.id] : grouping.filter((x) => x !== e.id))} />
                  {e.name} · {dept(e.dept).name}
                </label>
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setGrouping(null)}>
                취소
              </button>
              <button
                className="btn"
                disabled={grouping.length < 2}
                onClick={() => {
                  const id = act((g) => createGroup(g, grouping));
                  if (id) setSel(id);
                  setGrouping(null);
                }}
              >
                만들기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MsgDecision({ id }: { id: string }) {
  const s = useGame();
  const d = s.decisions.find((x) => x.id === id);
  if (!d) return null;
  return (
    <div className="msg-decision">
      {!d.resolved && (
        <div className="tiny muted">
          답변 기한 {formatDate(d.deadline)} ({Math.max(0, d.deadline - s.day)}일 남음) · 지나면 기본 선택
        </div>
      )}
      <DecisionView d={d} />
    </div>
  );
}

// MG-03 부서 지시 v2: 팀 전체가 맡을 일을 고릅니다(바꿀 때까지 매일 그 일을 함, A-41).
function TeamOrders({ deptId, onErr }: { deptId: DeptId; onErr: (e: string | null) => void }) {
  const s = useGame();
  const members = deptMembers(s, deptId);
  const cur = orderOf(s, deptId);
  return (
    <div className="col">
      <div className="row tiny muted">
        <span className="grow">
          {dept(deptId).name}팀 {members.length}명 · 하루 작업량 {deptOutput(s, deptId).toFixed(1)} · 고른 일은 바꿀 때까지 매일 계속합니다.
        </span>
      </div>
      <div className="orders">
        {ordersFor(deptId).map((o) => {
          const locked = s.company.stage < o.stage;
          return (
            <button
              key={o.id}
              className={`order ${cur === o.id ? 'on' : ''}`}
              data-testid={`order-${o.id}`}
              disabled={locked}
              onClick={() => {
                const e = act((g) => setOrder(g, deptId, o.id));
                onErr(e ?? null);
              }}
            >
              <b>
                {cur === o.id ? '✔ ' : ''}
                {o.name}
              </b>
              <span className="tiny">{o.desc}</span>
              {locked && <span className="tiny muted">회사 단계 {o.stage}부터</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
