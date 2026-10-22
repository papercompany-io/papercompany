// F06 메신저(A-93, 슬랙처럼): MG-01 채널 구성(#전체·팀 채널·그룹·DM·외부 연락처), MG-03 부서 지시(맡은 일 선택지), DC-01 메시지 속 결정 버튼.
// 왼쪽 사이드바(접히는 묶음·안 읽음 굵게·DM 상태 점), 채널 머리(설명·구성원 얼굴), 날짜 구분선·"새 메시지" 구분선,
// 같은 사람이 이어 보낸 말은 묶음, 보고 있는 채널에 새 말이 오면 "입력 중…"을 잠깐 보여 준 뒤 하나씩 나타남.
import { Help } from '../common';
import { PxIcon } from '../icons';
import { useEffect, useRef, useState } from 'react';
import { DATA, dept, ordersFor } from '../../core/data';
import { dateOf } from '../../core/calendar';
import { orderOf } from '../../core/orders';
import { DM_ACTIONS, commandOrder, dmAction } from '../../core/reactions';
import { answerSaid, postSaid } from '../../core/talk';
import { readTalk } from '../talkJev';
import { delegateAway, isFullDay, outingEffect, outingRange, outingTravel, outings } from '../../core/outings';
import { OutingOfferActions } from './ScheduleApp';
import { createGroup, markRead } from '../../core/messenger';
import { deptMembers } from '../../core/employees';
import { deptOutput, isSick } from '../../core/staff';
import { act, getGame, useGame } from '../store';
import { DecisionView } from '../Feedback';
import { InvestPeek } from './InvestApp';
import { PixelAvatar } from '../office/Avatar';
import type { Channel, DeptId, Employee, GameState, Message } from '../../core/types';
import './apps.css';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

// 메시지 시각: 그날 ms → "오후 2:13"(근무 시간 9~18시 안에서)
function timeOf(at: number | undefined): string {
  if (at === undefined) return '';
  const T = DATA.time;
  const mins = T.workStartHour * 60 + Math.floor(Math.min(1, at / T.dayMs) * (T.workEndHour - T.workStartHour) * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(m).padStart(2, '0')}`;
}

function dayLabel(day: number, today: number): string {
  if (day === today) return '오늘';
  if (day === today - 1) return '어제';
  const d = dateOf(day);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${WEEK[d.getUTCDay()]}요일`;
}

function empByName(s: GameState, name: string): Employee | undefined {
  return s.employees.find((e) => e.name === name);
}

// 상태 점: 일하는 중(초록) · 병가·퇴사 예정(회색)
function presence(s: GameState, e: Employee | undefined): 'on' | 'away' {
  return e && !isSick(s, e) && e.leaving === null && delegateAway(s, e.id) < 1 ? 'on' : 'away';
}

// 보낸 사람 얼굴: 직원은 픽셀 얼굴, 대표(나)는 파랑, 시스템·외부는 글자 네모
function Face({ s, m, size }: { s: GameState; m: Message; size: number }) {
  const e = empByName(s, m.from);
  if (e) return <PixelAvatar id={e.id} color={dept(e.dept).color} size={size} />;
  const cls = m.kind === 'player' ? 'me' : m.kind === 'system' ? 'sys' : 'ext';
  return (
    <span className={`mg-face ${cls}`} style={{ width: size, height: size }}>
      {m.kind === 'system' ? <PxIcon id="talk" size={Math.round(size * 0.55)} /> : [...m.from][0]}
    </span>
  );
}

export function MessengerApp({ initial, openInvest }: { initial?: string; openInvest: () => void }) {
  const s = useGame();
  const [sel, setSel] = useState<string>(initial && s.channels.some((c) => c.id === initial) ? initial : 'all');
  const [err, setErr] = useState<string | null>(null);
  const [grouping, setGrouping] = useState<string[] | null>(null);
  const [folded, setFolded] = useState<string[]>([]);
  const [peek, setPeek] = useState(false); // 투자 요약 팝업(A-124)
  const [showWorking, setShowWorking] = useState(false); // 일하는 중인 직원 목록(A-135)
  const list = useRef<HTMLDivElement>(null);
  const ch = s.channels.find((c) => c.id === sel) ?? s.channels[0];

  // 채널을 열 때: 안 읽은 수만큼 위에 "새 메시지" 구분선, 지금 있는 말은 다 보임
  const [newFrom, setNewFrom] = useState<string | null>(null);
  const [shown, setShown] = useState(ch.messages.length);
  const opened = useRef(ch.id);
  useEffect(() => {
    opened.current = ch.id;
    const n = ch.messages.length;
    setNewFrom(ch.unread > 0 && ch.unread < n ? ch.messages[n - ch.unread].id : null);
    setShown(n);
    if (ch.unread) act((g) => markRead(g, ch.id));
  }, [ch.id]);

  // 보고 있는 채널에 새 말이 오면: 사람이 보낸 말은 "입력 중…"을 글 길이만큼 보여 준 뒤 하나씩, 시스템·내 말은 바로
  const total = ch.messages.length;
  const next = shown < total ? ch.messages[shown] : null;
  const typing = next && next.kind === 'npc' ? next.from : null;
  useEffect(() => {
    if (opened.current !== ch.id) return;
    if (shown > total) {
      setShown(total); // 오래된 말 정리(120개 넘음)
      return;
    }
    if (!next) {
      if (ch.unread) act((g) => markRead(g, ch.id));
      return;
    }
    const wait = next.kind === 'npc' ? 800 + Math.min(1800, next.text.length * 30) : 0;
    const t = setTimeout(() => setShown((v) => v + 1), wait);
    return () => clearTimeout(t);
  }, [shown, total, ch.id]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [shown, typing, ch.id]);

  const pending = s.decisions.filter((d) => !d.resolved);
  const groups: { title: string; kind: Channel['kind'][] }[] = [
    { title: '채널', kind: ['all', 'team'] },
    { title: '그룹 메시지', kind: ['group'] },
    { title: '다이렉트 메시지', kind: ['dm'] },
    { title: '외부 연락처', kind: ['external'] },
  ];
  const open = (id: string) => {
    setSel(id);
    setErr(null);
  };
  const members = ch.memberIds.map((id) => s.employees.find((e) => e.id === id)).filter((e): e is Employee => !!e);
  const topic =
    ch.kind === 'team' && ch.dept
      ? `${dept(ch.dept).name}팀 ${deptMembers(s, ch.dept).length}명 · 하루 작업량 ${deptOutput(s, ch.dept).toFixed(1)}`
      : ch.kind === 'all'
        ? '회사 소식 · 합류·퇴사·공지'
        : ch.kind === 'external'
          ? '외부 연락처'
          : ch.kind === 'dm'
            ? `${members[0] ? `${dept(members[0].dept).name}팀 · ${presence(s, members[0]) === 'on' ? '일하는 중' : '자리 비움'}` : '다이렉트 메시지'}`
            : `구성원 ${members.length}명`;
  const msgs = ch.messages.slice(0, shown);

  return (
    <div className="messenger mg">
      <aside className="msg-side mg-side">
        <div className="mg-ws">
          <b>{s.company.name}</b>
          <span>
            <i className="mg-dot on" /> 대표 · 나
          </span>
          {/* 직원 수 · 일하는 중(A-135): 누르면 일하는 중인 직원 목록, 이름을 누르면 DM */}
          {s.employees.length > 0 && (() => {
            const working = s.employees.filter((e) => presence(s, e) === 'on');
            return (
              <>
                <button className="mg-staff" data-testid="mg-staff" onClick={() => setShowWorking(!showWorking)} aria-expanded={showWorking}>
                  직원 {s.employees.length}명 · <b>일하는 중 {working.length}명</b>
                </button>
                {showWorking && (
                  <div className="mg-working" data-testid="mg-working">
                    {working.length === 0 && <span className="muted">지금 일하는 직원이 없습니다.</span>}
                    {working.map((e) => (
                      <button key={e.id} className="mg-working-row" onClick={() => s.channels.some((c) => c.id === `dm-${e.id}`) && open(`dm-${e.id}`)}>
                        <PixelAvatar id={e.id} color={dept(e.dept).color} size={18} />
                        <span>{e.name}</span>
                        <small>{dept(e.dept).name}</small>
                      </button>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
        {pending.length > 0 && (
          <div className="mg-sec">
            <div className="mg-sec-title urgent">
              답을 기다리는 결정 <span className="mg-badge">{pending.length}</span>
            </div>
            {pending.map((d) => (
              <button key={d.id} className={`mg-item ${d.channelId === sel ? 'on' : ''}`} onClick={() => open(d.channelId)}>
                <PxIcon id={d.urgent ? 'siren' : 'talk'} size={14} />
                <span className="mg-label">{d.from}</span>
              </button>
            ))}
          </div>
        )}
        {groups.map((g) => {
          const items = s.channels.filter((c) => g.kind.includes(c.kind));
          if (!items.length && g.title !== '그룹 메시지') return null;
          const isFolded = folded.includes(g.title);
          return (
            <div key={g.title} className="mg-sec">
              <div className="mg-sec-title">
                <button className="mg-fold" onClick={() => setFolded(isFolded ? folded.filter((x) => x !== g.title) : [...folded, g.title])}>
                  <span className={`mg-caret ${isFolded ? 'folded' : ''}`}>
                    {/* 그룹 열기·닫기 세모(A-123): 글자 ▾(10px)가 너무 작아 14px 그림으로 */}
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                      <path d="M3 5 L7 9.5 L11 5 Z" fill="currentColor" />
                    </svg>
                  </span>{' '}
                  {g.title}
                </button>
                {g.title === '그룹 메시지' && (
                  <button className="mg-add" data-testid="group-new" title="그룹 메시지 만들기" onClick={() => setGrouping([])} disabled={s.employees.length < 2}>
                    +
                  </button>
                )}
              </div>
              {!isFolded &&
                items.map((c) => {
                  const e = c.kind === 'dm' ? s.employees.find((x) => x.id === c.memberIds[0]) : undefined;
                  const unread = c.unread > 0 && c.id !== sel;
                  return (
                    <button key={c.id} data-testid={`ch-${c.id}`} className={`mg-item ${c.id === sel ? 'on' : ''} ${unread ? 'unread' : ''}`} onClick={() => open(c.id)}>
                      {e ? (
                        <span className="mg-mini">
                          <PixelAvatar id={e.id} color={dept(e.dept).color} size={18} />
                          <i className={`mg-dot ${presence(s, e)}`} />
                        </span>
                      ) : (
                        <span className="mg-hash">{c.kind === 'external' ? '@' : c.kind === 'group' ? '●' : '#'}</span>
                      )}
                      <span className="mg-label">{c.name}</span>
                      {unread && <span className="mg-badge">{c.unread > 99 ? '99+' : c.unread}</span>}
                    </button>
                  );
                })}
            </div>
          );
        })}
      </aside>

      <section className="msg-main mg-main">
        <header className="mg-head">
          <div className="mg-title">
            <b>
              {ch.kind === 'all' || ch.kind === 'team' ? '# ' : ch.kind === 'external' ? '@ ' : ''}
              {ch.name}
            </b>
            <span>{topic}</span>
          </div>
          {members.length > 0 && ch.kind !== 'dm' && (
            <div className="mg-members" title={members.map((e) => e.name).join(', ')}>
              {members.slice(0, 4).map((e) => (
                <PixelAvatar key={e.id} id={e.id} color={dept(e.dept).color} size={24} />
              ))}
              <span>{members.length}</span>
            </div>
          )}
        </header>

        <div className="mg-list" data-testid="msg-list" ref={list}>
          {msgs.length === 0 && <div className="mg-empty">아직 메시지가 없습니다.</div>}
          {msgs.map((m, i) => {
            const prev = msgs[i - 1];
            const newDay = !prev || prev.day !== m.day;
            const isNew = m.id === newFrom;
            // 같은 사람이 같은 날 이어서 보낸 말은 얼굴·이름 없이 붙임(시스템 말은 늘 한 줄)
            const grouped = !newDay && !isNew && prev && prev.from === m.from && prev.kind === m.kind && m.kind !== 'system' && !prev.decisionId;
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="mg-day">
                    <span>{dayLabel(m.day, s.day)}</span>
                  </div>
                )}
                {isNew && (
                  <div className="mg-new">
                    <span>새 메시지</span>
                  </div>
                )}
                {m.kind === 'system' ? (
                  <div className="mg-sys">
                    <span className="mg-time">{timeOf(m.at)}</span>
                    {m.text}
                  </div>
                ) : (
                  <div className={`mg-msg ${grouped ? 'grouped' : ''} ${m.kind}`}>
                    <div className="mg-gutter">{grouped ? <span className="mg-time hover">{timeOf(m.at)}</span> : <Face s={s} m={m} size={36} />}</div>
                    <div className="mg-content">
                      {!grouped && (
                        <div className="mg-meta">
                          <b>{m.kind === 'player' ? `${m.from} (나)` : m.from}</b>
                          {empByName(s, m.from) && <span className="mg-role">{dept(empByName(s, m.from)!.dept).name}팀</span>}
                          <span className="mg-time">{timeOf(m.at)}</span>
                        </div>
                      )}
                      <div className="mg-text">{m.text}</div>
                      {m.decisionId && <MsgDecision id={m.decisionId} />}
                      {m.outingId && <MsgOuting id={m.outingId} />}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mg-typing" aria-live="polite">
          {typing && (
            <>
              <span className="dots">
                <i />
                <i />
                <i />
              </span>
              <b>{typing}</b>님이 입력 중…
            </>
          )}
        </div>

        <div className="mg-compose">
          {ch.kind === 'team' && ch.dept ? (
            <TeamOrders deptId={ch.dept} onErr={setErr} />
          ) : ch.kind === 'dm' && members[0] ? (
            <DmActions empId={members[0].id} name={members[0].name} busy={!!typing || shown < total} onErr={setErr} />
          ) : (
            <div className="mg-box muted">
              {ch.kind === 'all' && <span>#전체는 회사 소식을 보는 채널입니다. 일은 각 팀 채널에서 부서가 맡을 일을 정합니다.</span>}
              {ch.kind === 'group' && <span>지시는 팀 채널에서 부서 단위로 내립니다. 직원의 고민·제안은 DM으로 오고, 메시지 속 버튼으로 답합니다.</span>}
              {ch.kind === 'external' && (
                <>
                  <span>투자사 레터는 투자 메뉴에서 보냅니다. 다른 외부 연락은 메시지 속 버튼으로 답합니다.</span>
                  <button className="btn small" data-testid="invest-peek-btn" onClick={() => setPeek(true)}>
                    투자 현황 보기
                  </button>
                </>
              )}
            </div>
          )}
          {err && <div className="err">{err}</div>}
        </div>
      </section>

      {peek && (
        <InvestPeek
          investorId={ch.kind === 'external' && DATA.investors.investors.some((i) => i.id === ch.memberIds[0]) ? ch.memberIds[0] : undefined}
          onClose={() => setPeek(false)}
          onOpenFull={() => {
            setPeek(false);
            openInvest();
          }}
        />
      )}
      {grouping && (
        <div className="modal-bg" onClick={() => setGrouping(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <b>그룹 메시지 만들기</b>
            <div className="mg-pick">
              {s.employees.map((e) => (
                <label key={e.id} className={`mg-pick-row ${grouping.includes(e.id) ? 'on' : ''}`}>
                  <input type="checkbox" checked={grouping.includes(e.id)} onChange={(ev) => setGrouping(ev.target.checked ? [...grouping, e.id] : grouping.filter((x) => x !== e.id))} />
                  <PixelAvatar id={e.id} color={dept(e.dept).color} size={24} />
                  <span>{e.name}</span>
                  <span className="muted tiny">{dept(e.dept).name}팀</span>
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
                  if (id) open(id);
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

// DM 보내기(A-94): 고른 말에 직원이 상태·회사 상황에 따라 다르게 답함. 답이 다 뜰 때까지(입력 중…) 잠금
// 직접 쓰기(A-139): 쓴 문장의 뜻을 읽어 답함(근황·칭찬·분발·휴식으로 읽히면 버튼과 같은 효과)
function DmActions({ empId, name, busy, onErr }: { empId: string; name: string; busy: boolean; onErr: (e: string | null) => void }) {
  const [text, setText] = useState('');
  const [waiting, setWaiting] = useState(false);
  const send = async () => {
    const said = text;
    if (busy || waiting || !said.trim()) return;
    const err = act((g) => postSaid(g, empId, said)) ?? null;
    onErr(err);
    if (err) return;
    setText('');
    setWaiting(true);
    const g0 = getGame();
    const read = g0 ? await readTalk(g0, empId, said) : null;
    setWaiting(false);
    act((g) => answerSaid(g, empId, said, read));
  };
  return (
    <div className="mg-box">
      <div className="mg-box-head">
        <b>{name}님에게</b>
        <span>{waiting ? `${name}님이 답을 쓰는 중…` : '직접 써도 됩니다. 일을 바꾸라고 하거나 칭찬·질책하면 기분과 업무에 반영됩니다.'}</span>
      </div>
      <form
        className="mg-write"
        onSubmit={(ev) => {
          ev.preventDefault();
          send();
        }}
      >
        <input data-testid="dm-input" value={text} maxLength={200} placeholder={`${name}님에게 메시지 쓰기`} onChange={(ev) => setText(ev.target.value)} />
        <button className="btn small" data-testid="dm-send" type="submit" disabled={busy || waiting || !text.trim()}>
          보내기
        </button>
      </form>
      <div className="mg-quick">
        {DM_ACTIONS.map((a) => (
          <button
            key={a.id}
            className="mg-chip"
            data-testid={`dm-${a.id}`}
            disabled={busy}
            title={a.say}
            onClick={() => onErr(act((g) => dmAction(g, empId, a.id)) ?? null)}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// 대표 외출 초대(A-101): 메시지 속 카드에서 바로 수락·거절
function MsgOuting({ id }: { id: string }) {
  const s = useGame();
  const [err, setErr] = useState<string | null>(null);
  const o = outings(s).find((x) => x.id === id);
  if (!o) return null;
  const state = o.status === 'offer' ? null : o.status === 'booked' ? '수락함' : o.status === 'done' ? '다녀옴' : o.status === 'declined' ? '거절함' : '지난 초대';
  return (
    <div className="mg-attach mg-outing">
      <div className="mo-head">
        <b>{o.title}</b>
        <span className="chip">{outingRange(o)}</span>
        {state && <span className={`chip ${o.status === 'booked' || o.status === 'done' ? 'green' : ''}`}>{state}</span>}
      </div>
      <div className="mo-meta">
        {outingEffect(o)} · 비용 {o.cost ? `${(o.cost / 1e4).toLocaleString()}만원` : '없음'}
        {outingTravel(o) ? ` · ${outingTravel(o)}` : ''} · {isFullDay(o) ? '그동안 대표 기본 업무는 쉼' : '오가는 시간 포함 그 시간만 주 업무를 쉼'}
      </div>
      {o.status === 'offer' && (
        <div className="mo-actions">
          <OutingOfferActions o={o} onErr={setErr} />
        </div>
      )}
      {err && <div className="tiny" style={{ color: 'var(--negative-press)', fontWeight: 700 }}>{err}</div>}
    </div>
  );
}

function MsgDecision({ id }: { id: string }) {
  const s = useGame();
  const d = s.decisions.find((x) => x.id === id);
  if (!d) return null;
  return (
    <div className="mg-attach">
      {!d.resolved && (
        <div className="mg-attach-due">
          답변 기한 D-{Math.max(0, d.deadline - s.day)} · 지나면 기본 선택
        </div>
      )}
      <DecisionView d={d} />
    </div>
  );
}

// MG-03 부서 지시 v2: 팀 전체가 맡을 일을 고릅니다(바꿀 때까지 매일 그 일을 함, A-41). 슬랙 입력창 자리에 놓인 상자
function TeamOrders({ deptId, onErr }: { deptId: DeptId; onErr: (e: string | null) => void }) {
  const s = useGame();
  const cur = orderOf(s, deptId);
  const pb = s.company.orderPushback;
  const refused = pb && pb.dept === deptId && s.day - pb.day <= 2 ? pb.order : null;
  return (
    <div className="mg-box">
      <div className="mg-box-head">
        <b>맡은 일</b>
        <span>고른 일은 바꿀 때까지 팀 전체가 매일 계속합니다.</span>
        <Help text="지시는 개인이 아니라 부서 단위입니다. 회사 단계가 오르면 고를 수 있는 일이 늘어납니다." />
      </div>
      <div className="mg-orders">
        {ordersFor(deptId).map((o) => {
          const locked = s.company.stage < o.stage;
          return (
            <button
              key={o.id}
              className={`mg-order ${cur === o.id ? 'on' : ''} ${refused === o.id ? 'refused' : ''}`}
              data-testid={`order-${o.id}`}
              disabled={locked}
              title={locked ? `회사 단계 ${o.stage}부터` : o.desc}
              onClick={() => {
                const e = act((g) => commandOrder(g, deptId, o.id));
                onErr(e ?? null);
              }}
            >
              <b>{o.name}</b>
              <span>{locked ? `단계 ${o.stage}부터` : refused === o.id ? '거절됨 · 다시 누르면 강행' : o.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
