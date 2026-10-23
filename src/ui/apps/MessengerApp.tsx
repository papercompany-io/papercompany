// F06 메신저(A-93, 슬랙처럼): MG-01 채널 구성(#전체·대표가 만든 부서 채널(A-237)·DM·외부 연락처), MG-03 부서 지시(맡은 일 선택지), DC-01 메시지 속 결정 버튼.
// 왼쪽 사이드바(접히는 묶음·안 읽음 굵게·DM 상태 점), 채널 머리(설명·구성원 얼굴), 날짜 구분선·"새 메시지" 구분선,
// 같은 사람이 이어 보낸 말은 묶음, 보고 있는 채널에 새 말이 오면 "입력 중…"을 잠깐 보여 준 뒤 하나씩 나타남.
import { bondLabel, contactsOf } from '../../core/contacts';
import { concernName } from '../../core/meeting';
import { Help } from '../common';
import { DescSelect } from '../DescSelect';
import { PxIcon } from '../icons';
import { useEffect, useRef, useState } from 'react';
import { DATA, dept, orderDef, ordersFor } from '../../core/data';
import { dateOf } from '../../core/calendar';
import { orderOf } from '../../core/orders';
import { DM_ACTIONS, commandOrder, dmAction } from '../../core/reactions';
import { answerSaid, postSaid, setEmpOrder } from '../../core/talk';
import { answerChannel, postChannelSaid } from '../../core/chat';
import { empOrderOf, groupOrder } from '../../core/assign';
import { setSquadOrder, squad, squadChannelId, squadJobs, squadMembers, squadsOf } from '../../core/squads';
import { readChannel, readTalk } from '../talkAi';
import { awayOuting, delegateAway, isFullDay, outingEffect, outingRange, outingTravel, outings } from '../../core/outings';
import { OutingOfferActions } from './ScheduleApp';
import { MilestoneCard } from './MilestoneCard';
import { milestones } from '../../core/milestones';
import { isChatterChannel, markRead } from '../../core/messenger';
import { setSettings, useSettings } from '../meta';
import { isOff, isSick } from '../../core/staff';
import { act, getGame, useGame } from '../store';
import { DecisionView } from '../Feedback';
import { InvestPeek, InvestorBar } from './InvestApp';
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
  return e && !isSick(s, e) && !isOff(s, e) && e.leaving === null && delegateAway(s, e.id) < 1 ? 'on' : 'away';
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
  const [folded, setFolded] = useState<string[]>([]);
  const [peek, setPeek] = useState(false); // 투자 요약 팝업(A-124)
  const [showWorking, setShowWorking] = useState(false); // 일하는 중인 직원 목록(A-135)
  const muteChatter = useSettings().muteChatter; // 잡담 알림 끄기(A-201)
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
    { title: '채널', kind: ['all'] },
    { title: '부서', kind: ['team'] }, // 대표가 만든 부서 채널(A-237)
    { title: '다이렉트 메시지', kind: ['dm'] },
    { title: '외부 연락처', kind: ['external'] },
  ];
  const open = (id: string) => {
    setSel(id);
    setErr(null);
  };
  const members = ch.memberIds.map((id) => s.employees.find((e) => e.id === id)).filter((e): e is Employee => !!e);
  const sq = squad(s, ch.squadId);
  const topic =
    sq
      ? `부서 · ${squadMembers(s, sq.id).length}명${squadJobs(s, sq.id).map((d) => ` · ${dept(d).name} ${squadMembers(s, sq.id).filter((e) => e.dept === d).length}`).join('')}`
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
          {/* 대표가 외근 중이면 점·글씨를 비활성 색으로(직원 자리 비움과 같은 표시) */}
          <span className={awayOuting(s) ? 'mg-off' : ''}>
            <i className={`mg-dot ${awayOuting(s) ? 'away' : 'on'}`} /> 대표 · 나
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
          if (!items.length) return null;
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
                {/* 잡담 알림 끄기(A-201): 팀 채널·#전체에 새 말이 와도 뱃지·굵은 글씨를 띄우지 않음 */}
                {g.title === '채널' && (
                  <button className={`mg-read-all ${muteChatter ? 'on' : ''}`} data-testid="mute-chatter" aria-pressed={muteChatter} title={muteChatter ? '팀 채널·#전체 알림을 다시 켭니다' : '팀 채널·#전체에 새 말이 와도 알림 뱃지를 띄우지 않습니다'} onClick={() => setSettings({ muteChatter: !muteChatter })}>
                    {muteChatter ? '알림 꺼짐' : '알림 끄기'}
                  </button>
                )}
                {/* 외부 연락처 한 번에 읽기(A-201): 안 읽은 연락이 있을 때만 */}
                {g.title === '외부 연락처' && items.some((c) => c.unread > 0) && (
                  <button className="mg-read-all" data-testid="ext-read-all" title="외부 연락처를 모두 읽음으로" onClick={() => act((gs) => items.forEach((c) => markRead(gs, c.id)))}>
                    모두 읽음
                  </button>
                )}
              </div>
              {!isFolded &&
                items.map((c) => {
                  const e = c.kind === 'dm' ? s.employees.find((x) => x.id === c.memberIds[0]) : undefined;
                  const unread = c.unread > 0 && c.id !== sel && !(muteChatter && isChatterChannel(c));
                  return (
                    <button key={c.id} data-testid={`ch-${c.id}`} className={`mg-item ${c.id === sel ? 'on' : ''} ${unread ? 'unread' : ''} ${e && presence(s, e) === 'away' ? 'mg-off' : ''}`} onClick={() => open(c.id)}>
                      {e ? (
                        <span className="mg-mini">
                          <PixelAvatar id={e.id} color={dept(e.dept).color} size={18} />
                          <i className={`mg-dot ${presence(s, e)}`} />
                        </span>
                      ) : (
                        <span className="mg-hash">{c.kind === 'external' ? '@' : '#'}</span>
                      )}
                      <span className="mg-label">{c.name}</span>
                      {e && <span className="mg-task" title={orderDef(empOrderOf(s, e))?.name}>{orderDef(empOrderOf(s, e))?.name}</span>}
                      {unread && <span className="mg-badge">{c.unread > 99 ? '99+' : c.unread}</span>}
                    </button>
                  );
                })}
            </div>
          );
        })}
        {/* 아는 사람(A-186): 고객사 미팅에서 만난 사람. 친밀도는 말로만, 알아낸 걱정은 말풍선 설명으로 */}
        {contactsOf(s).length > 0 && (
          <div className="mg-sec" data-testid="mg-contacts">
            <div className="mg-sec-title">
              <button className="mg-fold" onClick={() => setFolded(folded.includes('아는 사람') ? folded.filter((x) => x !== '아는 사람') : [...folded, '아는 사람'])}>
                <span className={`mg-caret ${folded.includes('아는 사람') ? 'folded' : ''}`}>
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                    <path d="M3 5 L7 9.5 L11 5 Z" fill="currentColor" />
                  </svg>
                </span>{' '}
                아는 사람
              </button>
            </div>
            {!folded.includes('아는 사람') &&
              [...contactsOf(s)]
                .sort((a, b) => b.metDay - a.metDay)
                .map((c) => {
                  const chId = s.channels.find((x) => x.kind === 'external' && x.name.startsWith(c.company + ' '))?.id;
                  const worries = c.known.map(concernName).join(', ');
                  return (
                    <button key={c.id} data-testid={`contact-${c.id}`} className={`mg-item mg-contact ${chId === sel ? 'on' : ''}`} onClick={() => chId && open(chId)} title={worries ? `알아낸 걱정: ${worries}` : '아직 걱정을 모릅니다'}>
                      <span className="mg-mini">
                        <PixelAvatar id={c.id} color="#5b6b82" suit={c.role !== 'user'} size={18} />
                      </span>
                      <span className="mg-label">
                        {c.name} {c.title}
                      </span>
                      <span className="mg-task">
                        {c.company} · {bondLabel(c)}
                      </span>
                    </button>
                  );
                })}
          </div>
        )}
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
                    {m.text.startsWith('[결과] ') ? (
                      <span className="mg-result">
                        <b>결과</b>
                        {m.text.slice(5)}
                      </span>
                    ) : (
                      m.text
                    )}
                  </div>
                ) : (
                  <div className={`mg-msg ${grouped ? 'grouped' : ''} ${m.kind}`}>
                    <div className="mg-gutter">{grouped ? <span className="mg-time hover">{timeOf(m.at)}</span> : <Face s={s} m={m} size={36} />}</div>
                    <div className="mg-content">
                      {!grouped && (
                        <div className="mg-meta">
                          <b>{m.kind === 'player' ? `${m.from} (나)` : m.from}</b>
                          {empByName(s, m.from) && <span className="mg-role">{dept(empByName(s, m.from)!.dept).name}{squad(s, empByName(s, m.from)!.squadId) ? ` · ${squad(s, empByName(s, m.from)!.squadId)!.name}` : ''}</span>}
                          <span className="mg-time">{timeOf(m.at)}</span>
                        </div>
                      )}
                      <MsgText m={m} />
                      {m.decisionId && <MsgDecision id={m.decisionId} />}
                      {m.outingId && <MsgOuting id={m.outingId} />}
                      {m.milestoneId && <MsgMilestone id={m.milestoneId} />}
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
          {sq ? (
            <>
              <ChatInput channelId={ch.id} placeholder={`${ch.name}에 메시지 쓰기 — 예: 이번 주는 버그 수정에 집중해 주세요`} onErr={setErr} />
              <SquadOrders squadId={sq.id} onErr={setErr} />
            </>
          ) : ch.kind === 'all' && s.employees.length > 0 ? (
            <ChatInput channelId={ch.id} placeholder="모두에게 메시지 쓰기 — 이름을 부르면 그 사람이, 팀 이름과 일을 말하면 그 팀이 답합니다" onErr={setErr} />
          ) : ch.kind === 'dm' && members[0] ? (
            <DmActions empId={members[0].id} name={members[0].name} busy={!!typing || shown < total} onErr={setErr} />
          ) : ch.kind === 'external' && DATA.investors.investors.some((i) => i.id === ch.memberIds[0]) ? (
            <InvestorBar investorId={ch.memberIds[0]} onPeek={() => setPeek(true)} onOpenInvest={openInvest} />
          ) : (
            <div className="mg-box muted">
              {ch.kind === 'all' && <span>#전체는 회사 소식을 보는 채널입니다. 일은 각 팀 채널에서 부서가 맡을 일을 정합니다.</span>}
              {ch.kind === 'external' && (
                <>
                  <span>외부 연락은 메시지 속 버튼으로 답합니다.</span>
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
    </div>
  );
}

// 직접 쓴 말의 답 대기열(A-199): LLM 답(약 2초)을 기다리는 동안 보낸 말도 바로 올리고, 답은 보낸 차례대로 받음.
// (예전에는 기다리는 동안 Enter가 소리 없이 무시돼 다음 말과 한 줄로 합쳐졌음)
function useTalkQueue() {
  const [waiting, setWaiting] = useState(false);
  const queue = useRef<(() => Promise<void>)[]>([]);
  const running = useRef(false);
  const push = (job: () => Promise<void>) => {
    queue.current.push(job);
    if (running.current) return;
    running.current = true;
    setWaiting(true);
    void (async () => {
      while (queue.current.length) await queue.current.shift()!().catch(() => undefined);
      running.current = false;
      setWaiting(false);
    })();
  };
  return { waiting, push };
}

// DM 보내기(A-94): 고른 말에 직원이 상태·회사 상황에 따라 다르게 답함. 답이 다 뜰 때까지(입력 중…) 잠금
// 직접 쓰기(A-139, A-199): 실제 LLM이 쓴 문장의 뜻을 읽고 직원 답을 씀(근황·칭찬·분발·휴식으로 읽히면 버튼과 같은 효과).
// 답을 기다리는 동안 버튼은 잠금(LLM에 넘긴 반응과 실제 효과가 어긋나지 않게)
function DmActions({ empId, name, busy, onErr }: { empId: string; name: string; busy: boolean; onErr: (e: string | null) => void }) {
  const [text, setText] = useState('');
  const { waiting, push } = useTalkQueue();
  // 직원이 "입력 중…"이어도 직접 쓴 말은 보낼 수 있음(대기열이 차례를 지킴). 빠른 버튼만 잠금
  const send = () => {
    const said = text;
    if (!said.trim()) return;
    const err = act((g) => postSaid(g, empId, said)) ?? null;
    onErr(err);
    if (err) return;
    setText('');
    push(async () => {
      const g0 = getGame();
      const read = g0 ? await readTalk(g0, empId, said) : null;
      act((g) => answerSaid(g, empId, said, read));
    });
  };
  return (
    <div className="mg-dm">
      {waiting && <div className="mg-box-head">{name}님이 답을 쓰는 중…</div>}
      <form
        className="mg-write"
        onSubmit={(ev) => {
          ev.preventDefault();
          send();
        }}
      >
        <input data-testid="dm-input" value={text} maxLength={200} placeholder={`${name}님에게 메시지 쓰기`} onChange={(ev) => setText(ev.target.value)} />
        <button className="btn small" data-testid="dm-send" type="submit" disabled={!text.trim()}>
          보내기
        </button>
      </form>
      <div className="mg-quick">
        {DM_ACTIONS.map((a) => (
          <button
            key={a.id}
            className="mg-chip"
            data-testid={`dm-${a.id}`}
            disabled={busy || waiting}
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

// 팀·전체 채널 직접 쓰기(A-147): 쓴 말의 뜻을 읽어 부른 사람이나 팀이 답함. 사람별·팀 업무 지시도 여기서
function ChatInput({ channelId, placeholder, onErr }: { channelId: string; placeholder: string; onErr: (e: string | null) => void }) {
  const [text, setText] = useState('');
  const { waiting, push } = useTalkQueue();
  const send = () => {
    const said = text;
    if (!said.trim()) return;
    const err = act((g) => postChannelSaid(g, channelId, said)) ?? null;
    onErr(err);
    if (err) return;
    setText('');
    push(async () => {
      const g0 = getGame();
      const read = g0 ? await readChannel(g0, channelId, said) : null;
      act((g) => answerChannel(g, channelId, said, read));
    });
  };
  return (
    <form
      className="mg-write"
      onSubmit={(ev) => {
        ev.preventDefault();
        send();
      }}
    >
      <input data-testid="ch-input" value={text} maxLength={200} placeholder={waiting ? '답을 기다리는 중…' : placeholder} onChange={(ev) => setText(ev.target.value)} />
      <button className="btn small" data-testid="ch-send" type="submit" disabled={!text.trim()}>
        보내기
      </button>
    </form>
  );
}

// 사람별 맡은 일(A-147): 부서 일을 따르거나 이 사람만 다른 일(예외). 부서 없는 사람은 "소속 없음"의 일(A-237)
export function EmpOrderSelect({ e, onErr }: { e: Employee; onErr?: (m: string | null) => void }) {
  const s = useGame();
  const team = groupOrder(s, e);
  const q = squad(s, e.squadId);
  const from = `${q ? q.name : '소속 없음'} 일`; // 사람별 예외가 없으면 부서 일(A-237)
  const cur = empOrderOf(s, e);
  const teamDef = ordersFor(e.dept).find((o) => o.id === team);
  return (
    <DescSelect
      className="emp-order"
      testId={`emp-order-${e.id}`}
      value={cur === team ? '' : cur}
      options={[
        { value: '', label: `${from} 따름`, note: teamDef?.name, desc: teamDef?.desc },
        ...ordersFor(e.dept)
          .filter((o) => o.id !== team)
          .map((o) => ({ value: o.id, label: o.name, desc: o.desc, disabled: s.company.stage < o.stage, note: s.company.stage < o.stage ? `단계 ${o.stage}부터` : undefined })),
      ]}
      onChange={(v) => onErr?.(act((g) => setEmpOrder(g, e.id, v || null, q ? squadChannelId(q.id) : `dm-${e.id}`)) ?? null)}
    />
  );
}

// 팀 맡은 일 고르기(A-200): 팀 앱·직원 창·제품·시장이 같은 부품을 씀. 팀이 거절하면 select가 원래 일로 돌아가므로
// 이유를 onErr로 알리고(없으면 옆에 한 줄), 거절된 일은 "다시 고르면 강행"으로 표시합니다.
// d = 직무. 이 직무 사람이 있는 부서가 있으면(A-237) 앞에 "맡길 곳"(소속 없음·부서) 선택칸이 붙어, 버그 수정·외주·기능 개발을 부서마다 맡길 수 있음
// plain = 맡길 곳 칸 없이 소속 없음의 일만(부서 탭 소속 없음 페이지)
export function TeamOrderSelect({ d, testId, className, onErr, plain }: { d: DeptId; testId?: string; className?: string; onErr?: (m: string | null) => void; plain?: boolean }) {
  const s = useGame();
  const [err, setErr] = useState<string | null>(null);
  const [target, setTarget] = useState<string>('');
  const pb = s.company.orderPushback;
  const refused = pb && pb.dept === d && s.day - pb.day <= 2 ? pb.order : null;
  const report = onErr ?? setErr;
  const squads = squadsOf(s).filter((q) => squadMembers(s, q.id).some((e) => e.dept === d));
  const sq = squads.find((q) => q.id === target);
  const pickTarget = !plain && squads.length > 0 && (
    <DescSelect
      className={className}
      testId={testId ? `${testId}-target` : undefined}
      ariaLabel="맡길 곳"
      value={sq ? sq.id : ''}
      onChange={setTarget}
      options={[
        { value: '', label: '소속 없음', desc: '부서에 넣지 않은 사람이 하는 회사 기본 일입니다.' },
        ...squads.map((q) => ({ value: q.id, label: q.name, desc: `이 부서 ${dept(d).name} ${squadMembers(s, q.id).filter((e) => e.dept === d).length}명이 따로 맡을 일을 정합니다.` })),
      ]}
    />
  );
  if (sq)
    return (
      <>
        {pickTarget}
        <SquadOrderSelect squadId={sq.id} d={d} className={className} testId={testId} onErr={report} />
        {!onErr && err && <span className="order-err">{err}</span>}
      </>
    );
  return (
    <>
      {pickTarget}
      <DescSelect
        className={className}
        testId={testId}
        value={orderOf(s, d)}
        onChange={(v) => report(act((g) => commandOrder(g, d, v)) ?? null)}
        options={ordersFor(d).map((o) => {
          const locked = s.company.stage < o.stage;
          return { value: o.id, label: o.name, desc: o.desc, disabled: locked, note: locked ? `단계 ${o.stage}부터` : refused === o.id ? '거절됨 · 다시 고르면 강행' : undefined };
        })}
      />
      {!onErr && err && <span className="order-err">{err}</span>}
    </>
  );
}

// 부서가 한 직무(d)에 맡긴 일(A-237). 부서의 직무 일은 늘 정해져 있음(사람이 들어올 때 하던 일을 이어받음)
export function SquadOrderSelect({ squadId, d, className, testId, onErr }: { squadId: string; d: DeptId; className?: string; testId?: string; onErr?: (m: string | null) => void }) {
  const s = useGame();
  const q = squad(s, squadId);
  if (!q) return null;
  return (
    <DescSelect
      className={className}
      testId={testId ?? `squad-order-${squadId}-${d}`}
      value={q.orders[d] ?? orderOf(s, d)}
      onChange={(v) => onErr?.(act((g) => setSquadOrder(g, squadId, d, v)) ?? null)}
      options={ordersFor(d).map((o) => {
        const locked = s.company.stage < o.stage;
        return { value: o.id, label: o.name, desc: o.desc, disabled: locked, note: locked ? `단계 ${o.stage}부터` : undefined };
      })}
    />
  );
}

// 대표 외출 초대(A-101): 메시지 속 카드에서 바로 수락·거절
// 약속 제안(A-177): 메시지 속에서 바로 받거나 거절
function MsgMilestone({ id }: { id: string }) {
  const s = useGame();
  const m = milestones(s).find((x) => x.id === id);
  if (!m) return null;
  return (
    <div className="mg-attach">
      <MilestoneCard m={m} compact />
    </div>
  );
}

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

// 메시지 본문(A-152): 내가 보낸 레터("[회사 소개] …")는 레터 카드로, 결정 답("→ 고른 답")은 답장 표시로
function MsgText({ m }: { m: Message }) {
  if (m.kind === 'player') {
    const reply = /^(\(답이 없어 기본 선택\) )?→ (.+)$/s.exec(m.text);
    if (reply)
      return (
        <div className="mg-reply">
          <span>{reply[1] ? '기본 답' : '답장'}</span>
          <b>{reply[2]}</b>
        </div>
      );
    const letter = /^\[([^\]]+)\] (.+)$/s.exec(m.text);
    if (letter)
      return (
        <div className="mg-letter">
          <span className="mg-letter-kind">
            <PxIcon id="talk" size={12} /> 레터 · {letter[1]}
          </span>
          <div>{letter[2]}</div>
        </div>
      );
  }
  return <div className="mg-text">{m.text}</div>;
}

function MsgDecision({ id }: { id: string }) {
  const s = useGame();
  const d = s.decisions.find((x) => x.id === id);
  if (!d) return null;
  // 답한 뒤에는 아래에 내 답·결과 메시지가 따로 오므로 짧게
  if (d.resolved)
    return (
      <div className="mg-attach done">
        <PxIcon id="check" size={14} /> 답함 · <b>{d.choices[d.resolved.choice]?.label}</b>
      </div>
    );
  const left = Math.max(0, d.deadline - s.day);
  return (
    <div className={`mg-attach ${d.urgent ? 'urgent' : ''}`}>
      <div className="mg-attach-head">
        <b>답을 골라 주세요</b>
        <span className={`chip ${left <= 1 ? 'red' : 'amber'}`}>{left === 0 ? '오늘까지' : `${left}일 남음`}</span>
        <span className="mg-attach-note">답하지 않으면 "기본" 답으로 정해집니다</span>
      </div>
      <DecisionView d={d} />
    </div>
  );
}

// 부서 채널(A-237): 이 부서가 직무별로 맡을 일 + 사람별 맡은 일
function SquadOrders({ squadId, onErr }: { squadId: string; onErr: (e: string | null) => void }) {
  const s = useGame();
  const q = squad(s, squadId);
  if (!q) return null;
  const team = squadMembers(s, squadId);
  const jobs = squadJobs(s, squadId);
  return (
    <div className="mg-box">
      <div className="mg-box-head">
        <b>{q.name} 맡은 일</b>
        <span>바꿀 때까지 매일 계속</span>
        <Help text="부서는 직무마다 하는 일이 하나씩 있습니다. 바꾸면 이 부서의 그 직무 사람이 모두 그 일로 옮깁니다. 한 사람만 다르게 하려면 아래 사람별 예외에서 고릅니다. 위 입력칸에 '버그 수정에 집중해 주세요'처럼 써도 됩니다. 며칠 안에 또 바꾸면 만족도가 조금 떨어집니다." />
      </div>
      {jobs.length === 0 ? (
        <div className="muted tiny">아직 사람이 없습니다. 직원 관리의 부서 탭에서 사람을 넣습니다.</div>
      ) : (
        <>
          <div className="mg-sq-jobs">
            {jobs.map((d) => (
              <label key={d} className="mg-person">
                <span>
                  {dept(d).name} {team.filter((e) => e.dept === d).length}명
                </span>
                <SquadOrderSelect squadId={squadId} d={d} onErr={onErr} />
              </label>
            ))}
          </div>
          <details className="mg-people">
            <summary>
              사람별 예외 <span className="muted">· {team.filter((e) => !!e.order).length ? `따로 하는 사람 ${team.filter((e) => !!e.order).length}명` : '없음'}</span>
            </summary>
            {team.map((e) => (
              <div key={e.id} className="mg-person">
                <span>
                  {e.name} · {dept(e.dept).name}
                  {e.lead ? ' (팀장)' : ''}
                </span>
                <EmpOrderSelect e={e} onErr={onErr} />
              </div>
            ))}
          </details>
        </>
      )}
    </div>
  );
}
