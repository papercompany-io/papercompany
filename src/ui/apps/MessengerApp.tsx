// F06 메신저: MG-01 채널 구성(#전체·팀 채널·그룹·DM·외부 연락처), MG-03 부서 지시(선택지), MG-04 판정 결과
import { useEffect, useRef, useState } from 'react';
import { dept } from '../../core/data';
import { formatDate } from '../../core/calendar';
import { cannotInstruct, optionsFor, runningInstruction, successProbability } from '../../core/instructions';
import { issueInstruction } from '../../core/instructions';
import { createGroup } from '../../core/messenger';
import { deptMembers } from '../../core/employees';
import { act, useGame } from '../store';
import { chanceLabel } from '../common';
import type { Channel } from '../../core/types';
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
  }, [sel, ch.messages.length]);

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
            </div>
          ))}
          <div ref={bottom} />
        </div>
        <div className="msg-compose">
          {ch.kind === 'team' && ch.dept && <TeamOrders deptId={ch.dept} onErr={setErr} />}
          {ch.kind === 'all' && <div className="tiny muted">#전체는 회사 소식을 보는 채널입니다. 일은 각 팀 채널에서 부서 단위로 지시합니다.</div>}
          {(ch.kind === 'dm' || ch.kind === 'group') && <div className="tiny muted">지시는 팀 채널에서 부서 단위로 내립니다(개인 지시 없음).</div>}
          {ch.kind === 'external' && (
            <div className="row tiny muted">
              투자사에 보내는 레터는 투자 앱에서 선택지로 고릅니다.
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

function TeamOrders({ deptId, onErr }: { deptId: Parameters<typeof optionsFor>[0]; onErr: (e: string | null) => void }) {
  const s = useGame();
  const running = runningInstruction(s, deptId);
  const members = deptMembers(s, deptId);
  if (running) {
    return (
      <div className="ok" data-testid="order-running">
        {dept(deptId).name}팀이 지시를 수행 중입니다 · {formatDate(running.endDay)} 완료 예정 · 성공 가능성 {chanceLabel(running.p)}
      </div>
    );
  }
  return (
    <div className="col">
      <div className="tiny muted">{dept(deptId).name}팀 전체({members.length}명)에게 지시합니다. 결과는 끝나는 날 알고리즘으로 판정됩니다(완전 수행·부분 수행·실패).</div>
      <div className="orders">
        {optionsFor(deptId).map((o) => {
          const why = cannotInstruct(s, deptId, o.id);
          const p = successProbability(members, o.baseP);
          return (
            <button
              key={o.id}
              className="order"
              data-testid={`order-${o.id}`}
              disabled={!!why}
              title={why ?? ''}
              onClick={() => {
                const e = act((g) => issueInstruction(g, deptId, o.id));
                onErr(e ?? null);
              }}
            >
              <b>{o.name}</b>
              <span className="tiny">{o.desc}</span>
              <span className="tiny muted">
                {o.days}일 · 성공 가능성 {chanceLabel(p)}
              </span>
              {why && <span className="tiny" style={{ color: '#b5363a' }}>{why}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
