// 화면(A-186): 고객사 미팅 — 회의실 그림 위에 참석자(몸짓 표정·이름표·알아낸 걱정), 가운데 대화 기록, 아래 손패 카드.
// 분위기·친밀도 숫자는 숨기고 몸짓 말로만 보여 줌. 카드는 효과 숫자 없이 하는 일과 쓰는 시간만. 시계는 미팅 동안 멈춤
import { useEffect, useRef, useState } from 'react';
import { dept, feature } from '../core/data';
import { bondLabel, contact } from '../core/contacts';
import { autoFinish, bringCompanion, companionCandidates, concernName, leaveMeeting, meetingHand, meetingStages, playCard, promiseFor, resultText, roleName, signalText, type CardId } from '../core/meeting';
import type { Meeting } from '../core/types';
import { act, useGame } from './store';
import { PixelAvatar } from './office/Avatar';
import type { FaceExpr } from './office/face';
import room from '../assets/meeting/room.png';
import './apps/skin/MeetingModal.css';

// 몸짓 → 표정
const EXPR: Record<string, FaceExpr> = {
  nod: { eyes: 'happy', mouth: 'smile', brows: 'up' },
  note: { mouth: 'small', brows: 'flat' },
  listen: { mouth: 'flat' },
  arms: { mouth: 'flat', brows: 'thick' },
  clock: { mouth: 'small', brows: 'up', eyes: 'apart' },
};

// 참석자 수에 따른 의자 자리(그림의 의자 가로 위치 %)
const SEATS: Record<number, number[]> = { 1: [50], 2: [22.5, 78.5], 3: [22.5, 50, 78.5] };

export function MeetingModal() {
  const g = useGame();
  const m = g.meeting;
  const [target, setTarget] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [m?.log.length]);
  useEffect(() => {
    if (m?.objection) setTarget(m.objection.contactId);
  }, [m?.objection?.contactId]);
  if (!m) return null;
  const stages = meetingStages(g);
  const hand = meetingHand(g);
  const started = m.minutesLeft < m.minutes;
  const mates = companionCandidates(g);
  const timePct = (m.minutesLeft / m.minutes) * 100;
  const tgt = target ? contact(g, target) : undefined;
  const promise = target ? promiseFor(g, m, target) : null;

  const play = (id: CardId, needsTarget: boolean) => {
    if (needsTarget && !target) return setErr('누구에게 할지 참석자를 먼저 고르세요.');
    const e = act((s) => playCard(s, id, needsTarget ? (target ?? undefined) : undefined));
    setErr(e ?? null);
  };

  return (
    <div className="modal-bg">
      <div className="modal mtg" data-testid="meeting-modal">
        <div className="mtg-head">
          <div className="mtg-id">
            <span className="mtg-kicker">
              고객사 미팅{stages > 1 ? ` · ${m.stage}/${stages}단계` : ''} · 시간 멈춤
            </span>
            <b className="mtg-host">{m.host}</b>
          </div>
          <div className="mtg-time" title="카드마다 시간을 씁니다. 다 쓰면 미팅이 끝납니다">
            <span>남은 시간 {m.minutesLeft}분</span>
            <div className="mtg-time-bar">
              <i style={{ width: `${timePct}%` }} className={timePct <= 25 ? 'low' : ''} />
            </div>
          </div>
        </div>

        <div className="mtg-room" style={{ backgroundImage: `url(${room})` }}>
          {m.attendees.map((a, i) => {
            const c = contact(g, a.contactId);
            if (!c) return null;
            const ob = m.objection?.contactId === c.id;
            const known = c.known.filter((k) => c.concerns.includes(k));
            return (
              <button
                key={c.id}
                className={`mtg-seat${target === c.id ? ' on' : ''}${ob ? ' ob' : ''}`}
                style={{ left: `${SEATS[m.attendees.length]?.[i] ?? 50}%` }}
                data-testid={`meeting-target-${c.id}`}
                onClick={() => setTarget(c.id)}
                disabled={!!m.result}
              >
                <span className="mtg-sign">{signalText(a.signal)}</span>
                <PixelAvatar id={c.id} color="#5b6b82" suit={c.role !== 'user'} size={72} expr={EXPR[a.signal]} />
                <span className="mtg-plate">
                  <b>
                    {c.name} {c.title}
                  </b>
                  <small>
                    {roleName(c.role)} · {bondLabel(c)}
                  </small>
                </span>
                {known.length > 0 && (
                  <span className="mtg-worries">
                    {known.map((k) => (
                      <span key={k} className={`chip${a.resolved.includes(k) ? ' green' : ob && m.objection?.concern === k ? ' red' : ''}`}>
                        {concernName(k)}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mtg-log" ref={logRef}>
          {m.log.map((l, i) => {
            if (l.from === 'sys')
              return (
                <div key={i} className={`mtg-sys${l.tone ? ' ' + l.tone : ''}`}>
                  {l.text}
                </div>
              );
            const who = l.from === 'them' && l.who ? contact(g, l.who) : undefined;
            const mate = l.from === 'mate' && l.who ? g.employees.find((e) => e.id === l.who) : undefined;
            return (
              <div key={i} className={`nego-msg ${l.from === 'me' ? 'me' : 'them'}`}>
                {who && <PixelAvatar id={who.id} color="#5b6b82" suit={who.role !== 'user'} size={28} />}
                {mate && <PixelAvatar id={mate.id} color={dept(mate.dept).color} size={28} />}
                <div className={`nego-bubble${l.tone === 'bad' ? ' mtg-bad' : l.tone === 'good' ? ' mtg-good' : ''}`}>
                  {(who || mate) && <span className="mtg-who">{who ? `${who.name} ${who.title}` : `${mate!.name}(우리 팀)`}</span>}
                  {l.text}
                </div>
              </div>
            );
          })}
        </div>

        {m.result ? (
          <MeetingResult m={m} last={m.stage >= stages && stages > 1} />
        ) : (
          <div className="mtg-hand">
            {!started && mates.length > 0 && (
              <label className="mtg-mate">
                <span>함께 온 직원</span>
                <select
                  data-testid="meeting-companion"
                  value={m.companion ?? ''}
                  onChange={(ev) => setErr(act((s) => bringCompanion(s, ev.target.value || null)) ?? null)}
                >
                  <option value="">혼자 왔습니다</option>
                  {mates.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({dept(e.dept).name})
                    </option>
                  ))}
                </select>
                <small>함께 오면 미팅 시간 동안 그 직원은 일을 못 합니다</small>
              </label>
            )}
            <div className="mtg-hint">
              {m.objection ? (
                <>
                  <b>{contact(g, m.objection.contactId)?.name}</b>님이 "{concernName(m.objection.concern)}" 걱정을 꺼냈습니다. 다음 카드로 바로 답하지 않으면 분위기가 나빠집니다.
                </>
              ) : tgt ? (
                <>
                  <b>
                    {tgt.name} {tgt.title}
                  </b>
                  님에게 할 카드를 고르세요.
                </>
              ) : (
                '참석자를 눌러 누구에게 말할지 고른 다음 카드를 내세요.'
              )}
            </div>
            <div className="mtg-cards">
              {hand.map((h) => (
                <button key={h.id} className={`mtg-card c-${h.id}`} data-testid={`meeting-card-${h.id}`} disabled={!h.ok || (h.id === 'promise' && !!target && !promise)} onClick={() => play(h.id, h.target)} title={h.desc}>
                  <span className="mtg-card-top">
                    <b>{h.name}</b>
                    <small>{h.minutes}분</small>
                  </span>
                  <span className="mtg-card-desc">{h.id === 'promise' && promise ? `"${promise.name}"을(를) 만들어 주겠다고 약속합니다.` : h.desc}</span>
                  {!h.ok && h.why && <span className="mtg-card-why">{h.why}</span>}
                  {h.ok && h.id === 'promise' && target && !promise && <span className="mtg-card-why">약속할 만한 기능이 없습니다</span>}
                </button>
              ))}
            </div>
            <div className="mtg-foot">
              {err ? <span className="err">{err}</span> : <span />}
              <button className="btn small ghost" data-testid="meeting-auto" onClick={() => setErr(act((s) => autoFinish(s)) ?? null)}>
                알아서 진행
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MeetingResult({ m, last }: { m: Meeting; last: boolean }) {
  const g = useGame();
  const r = m.result!;
  const next =
    r === 'won'
      ? last
        ? '계약 이야기로 넘어갑니다. 메신저와 CEO 일정을 확인하세요.'
        : '다음 단계 미팅 제안이 메신저로 왔습니다.'
      : r === 'warm'
        ? '다시 연락을 주겠다고 합니다. 영업 기회가 조금 늘었습니다.'
        : r === 'cold'
          ? '당장은 진행이 어렵겠지만 인연은 남았습니다.'
          : '이번에는 어렵다고 합니다. 다음에는 걱정을 먼저 물어보세요.';
  return (
    <div className="mtg-result" data-testid="meeting-result">
      <div className={`mtg-verdict ${r}`}>
        <b>{resultText(r)}</b>
        <span>{next}</span>
        {m.promised.length > 0 && <span>약속한 기능: {m.promised.map((id) => `"${feature(id).name}"`).join(', ')}</span>}
      </div>
      <div className="mtg-met">
        {m.attendees.map((a) => {
          const c = contact(g, a.contactId);
          return (
            c && (
              <span key={c.id} className="mtg-met-one">
                <PixelAvatar id={c.id} color="#5b6b82" suit={c.role !== 'user'} size={28} />
                <span>
                  {c.name} {c.title}
                  <small>{bondLabel(c)}</small>
                </span>
              </span>
            )
          );
        })}
      </div>
      <button className="btn green" data-testid="meeting-close" onClick={() => act((s) => leaveMeeting(s))}>
        회의실 나가기
      </button>
    </div>
  );
}
