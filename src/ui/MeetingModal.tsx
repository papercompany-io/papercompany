// 화면(A-186·A-187): 고객사 미팅 — 회의실 그림이 무대. 참석자 머리 위 말풍선으로 반응을 보여 주고, 아래 비서 한마디가 다음 수를 권함.
// 말할 상대는 비서가 권하는 사람으로 미리 골라 두어 카드 한 번 누르면 바로 냄(다른 사람을 누르면 바꿈).
// 분위기·친밀도·카드 효과 숫자는 숨기고 몸짓·점 다섯 개·말로만. 시계는 미팅 동안 멈춤
import { useEffect, useMemo, useRef, useState } from 'react';
import { dept, feature } from '../core/data';
import { bondLabel, contact, contactsOf } from '../core/contacts';
import {
  autoFinish,
  bondChange,
  bringCompanion,
  companionCandidates,
  concernName,
  meetingAdvice,
  meetingHand,
  meetingStages,
  moodLevel,
  playCard,
  promiseFor,
  resultText,
  roleName,
  roomMood,
  signalText,
  type CardId,
  type HandCard,
} from '../core/meeting';
import type { Contact, Meeting } from '../core/types';
import { dispatch, useGame } from './store';
import { PixelAvatar } from './office/Avatar';
import type { FaceExpr } from './office/face';
import { PxIcon, type PxId } from './icons';
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

const CARD_ICON: Record<CardId, PxId> = { ask: 'talk', demo: 'chart', case: 'case', price: 'coin', promise: 'star', companion: 'users', close: 'check' };
const GROUPS: { title: string; ids: CardId[] }[] = [
  { title: '알아보기', ids: ['ask'] },
  { title: '설득하기', ids: ['demo', 'case', 'price', 'promise', 'companion'] },
  { title: '끝내기', ids: ['close'] },
];
const STAGE_NAMES = ['실무 미팅', '임원 미팅', '최종 미팅'];

// 참석자 수에 따른 의자 자리(그림의 의자 가로 위치 %)
const SEATS: Record<number, number[]> = { 1: [50], 2: [22.5, 78.5], 3: [22.5, 50, 78.5] };
const SUIT = '#5b6b82';

export function MeetingModal() {
  const g = useGame();
  const m = g.meeting;
  const [picked, setPicked] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const logLen = m?.log.length ?? 0;
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logLen, showLog]);
  // 방금 한 말(말풍선): 마지막 카드 뒤에 나온 줄들
  const recent = useMemo(() => {
    if (!m) return { them: new Map<string, { text: string; tone?: string }>(), me: null as string | null, sys: null as { text: string; tone?: string } | null };
    const them = new Map<string, { text: string; tone?: string }>();
    let me: string | null = null;
    let sys: { text: string; tone?: string } | null = null;
    for (let i = m.log.length - 1; i >= 0; i--) {
      const l = m.log[i];
      if (l.from === 'me') {
        me = l.text;
        break;
      }
      if (l.from === 'them' && l.who && !them.has(l.who)) them.set(l.who, { text: l.text, tone: l.tone });
      if (l.from === 'sys' && !sys) sys = { text: l.text, tone: l.tone };
      if (l.from === 'mate' && !sys) sys = { text: l.text };
    }
    return { them, me, sys };
  }, [m, logLen]);
  if (!m) return null;

  const stages = meetingStages(g);
  const hand = meetingHand(g);
  const advice = meetingAdvice(g);
  const mood = roomMood(g, m);
  const started = m.minutesLeft < m.minutes;
  const mates = companionCandidates(g);
  const target = picked && m.attendees.some((a) => a.contactId === picked) ? picked : (advice?.target ?? m.attendees[0]?.contactId ?? null);
  const tgt = target ? contact(g, target) : undefined;
  const promise = target ? promiseFor(g, m, target) : null;
  const firstTime = m.attendees.every((a) => (contact(g, a.contactId)?.meetings ?? 0) === 0) && contactsOf(g).length <= m.attendees.length;
  const blocks = Math.round(m.minutes / 10);
  const left = Math.round(m.minutesLeft / 10);

  const play = (h: HandCard) => {
    const e = dispatch({ type: 'playCard', card: h.id, targetId: h.target ? (target ?? undefined) : undefined }) as ReturnType<typeof playCard>;
    setErr(e ?? null);
    if (!e) setPicked(null); // 다음 상대는 비서 권유를 따름
  };

  return (
    <div className="modal-bg">
      <div className="modal mtg" data-testid="meeting-modal">
        <div className="mtg-head">
          <div className="mtg-id">
            <span className="mtg-kicker">고객사 미팅 · 시간 멈춤</span>
            <b className="mtg-host">{m.host}</b>
          </div>
          {stages > 1 && (
            <ol className="mtg-steps" aria-label="미팅 단계">
              {STAGE_NAMES.slice(0, stages).map((n, i) => (
                <li key={n} className={i + 1 < m.stage ? 'done' : i + 1 === m.stage ? 'now' : ''}>
                  <i>{i + 1 < m.stage ? <PxIcon id="check" size={12} /> : i + 1}</i>
                  <span>{n}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="mtg-time" title="카드마다 10분이나 20분을 씁니다. 다 쓰면 미팅이 끝납니다">
            <span>
              <PxIcon id="clock" size={14} /> 남은 시간 <b>{m.minutesLeft}분</b>
            </span>
            <div className={`mtg-blocks${left <= 2 ? ' low' : ''}`}>
              {Array.from({ length: blocks }, (_, i) => (
                <i key={i} className={i < left ? 'on' : ''} />
              ))}
            </div>
          </div>
        </div>

        {firstTime && !started && !m.result && (
          <ol className="mtg-guide">
            <li>
              <b>1</b> 사람을 눌러 말할 상대를 고릅니다(처음엔 비서가 골라 둡니다)
            </li>
            <li>
              <b>2</b> 질문으로 걱정을 알아내고, 맞는 카드로 풀어 줍니다
            </li>
            <li>
              <b>3</b> 표정이 밝아지면 마무리 요청으로 다음 단계를 잡습니다
            </li>
          </ol>
        )}

        <div className="mtg-room" style={{ backgroundImage: `url(${room})` }}>
          {m.attendees.map((a, i) => {
            const c = contact(g, a.contactId);
            if (!c) return null;
            const said = recent.them.get(c.id);
            return (
              <Seat
                key={c.id}
                c={c}
                level={moodLevel(a.signal)}
                signal={a.signal}
                resolved={a.resolved}
                left={SEATS[m.attendees.length]?.[i] ?? 50}
                on={target === c.id && !m.result}
                ob={m.objection?.contactId === c.id ? m.objection.concern : null}
                said={said}
                disabled={!!m.result}
                onPick={() => setPicked(c.id)}
              />
            );
          })}
          {recent.me && !m.result && (
            <div className="mtg-me" key={logLen}>
              <span className="mtg-me-tag">나</span>
              {recent.me}
            </div>
          )}
          {recent.sys && (
            <div className={`mtg-toast${recent.sys.tone === 'bad' ? ' bad' : ''}`} key={'s' + logLen}>
              {recent.sys.text}
            </div>
          )}
        </div>

        {m.result ? (
          <MeetingResult m={m} last={m.stage >= stages && stages > 1} />
        ) : (
          <div className="mtg-hand">
            <div className={`mtg-advice${advice?.urgent ? ' urgent' : ''}`} data-testid="meeting-advice">
              <span className="mtg-advice-who">
                <PxIcon id={advice?.urgent ? 'warn' : 'talk'} size={16} />
                비서
              </span>
              <span className="mtg-advice-text">{advice?.text}</span>
              <span className={`mtg-mood l${mood.level}`} title="참석자 표정으로 짐작한 분위기">
                <span className="mtg-mood-bar">
                  {[0, 1, 2, 3].map((k) => (
                    <i key={k} className={k <= mood.level ? 'on' : ''} />
                  ))}
                </span>
                분위기 {mood.text}
              </span>
            </div>

            {!started && mates.length > 0 && (
              <label className="mtg-mate">
                <PxIcon id="users" size={14} />
                <span>함께 온 직원</span>
                <select data-testid="meeting-companion" value={m.companion ?? ''} onChange={(ev) => setErr((dispatch({ type: 'bringCompanion', empId: ev.target.value || null }) as ReturnType<typeof bringCompanion>) ?? null)}>
                  <option value="">혼자 왔습니다</option>
                  {mates.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({dept(e.dept).name})
                    </option>
                  ))}
                </select>
                <small>함께 오면 "동행 발언"을 쓸 수 있고, 그 직원은 미팅 동안 일을 못 합니다</small>
              </label>
            )}

            <div className="mtg-groups">
              {GROUPS.map((gr) => (
                <div key={gr.title} className={`mtg-group g-${gr.ids[0]}`}>
                  <span className="mtg-group-title">{gr.title}</span>
                  <div className="mtg-cards">
                    {gr.ids.map((id) => {
                      const h = hand.find((x) => x.id === id);
                      if (!h) return null;
                      const noPromise = h.id === 'promise' && h.ok && !promise;
                      const ok = h.ok && !noPromise;
                      const rec = ok && !!advice?.cards.includes(h.id) && (!h.target || !advice.target || advice.target === target);
                      const why = !h.ok ? h.why : noPromise ? '이 사람에게 약속할 기능이 없습니다' : undefined;
                      return (
                        <button key={h.id} className={`mtg-card${rec ? ' rec' : ''}`} data-testid={`meeting-card-${h.id}`} disabled={!ok} onClick={() => play(h)} title={h.desc}>
                          <span className="mtg-card-top">
                            <PxIcon id={CARD_ICON[h.id]} size={18} />
                            <b>{h.name}</b>
                            <small>{h.minutes}분</small>
                          </span>
                          <span className="mtg-card-desc">{h.id === 'promise' && promise ? `"${promise.name}" 약속` : h.short}</span>
                          {why ? (
                            <span className="mtg-card-why">{why}</span>
                          ) : h.target && tgt ? (
                            <span className="mtg-card-to">→ {tgt.name} {tgt.title}</span>
                          ) : (
                            <span className="mtg-card-to">→ 모두에게</span>
                          )}
                          {rec && <span className="mtg-rec">추천</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mtg-foot">
              <button className="mtg-logbtn" data-testid="meeting-log-toggle" onClick={() => setShowLog(!showLog)} aria-expanded={showLog}>
                대화 기록 {m.log.length}줄 {showLog ? '접기' : '보기'}
              </button>
              {err && <span className="err">{err}</span>}
              <button className="btn small ghost" data-testid="meeting-auto" onClick={() => setErr((dispatch({ type: 'autoFinish' }) as ReturnType<typeof autoFinish>) ?? null)} title="남은 시간은 준비한 자료대로 진행합니다. 직접 할 때보다 결과가 낮습니다">
                알아서 진행
              </button>
            </div>
            {showLog && <MeetingLog m={m} logRef={logRef} />}
          </div>
        )}
      </div>
    </div>
  );
}

function Seat(p: {
  c: Contact;
  level: number;
  signal: string;
  resolved: string[];
  left: number;
  on: boolean;
  ob: string | null;
  said?: { text: string; tone?: string };
  disabled: boolean;
  onPick: () => void;
}) {
  const { c } = p;
  const known = c.known.filter((k) => c.concerns.includes(k));
  const hidden = c.concerns.length - known.length;
  return (
    <button className={`mtg-seat${p.on ? ' on' : ''}${p.ob ? ' ob' : ''}`} style={{ left: `${p.left}%` }} data-testid={`meeting-target-${c.id}`} onClick={p.onPick} disabled={p.disabled}>
      {p.said ? (
        <span className={`mtg-say${p.said.tone ? ' ' + p.said.tone : ''}`}>{p.said.text}</span>
      ) : (
        <span className="mtg-sign">{signalText(p.signal)}</span>
      )}
      <span className="mtg-face">
        <PixelAvatar id={c.id} color={SUIT} suit={c.role !== 'user'} size={72} expr={EXPR[p.signal]} />
        {p.on && <span className="mtg-pick">말할 상대</span>}
      </span>
      <span className="mtg-plate">
        <b>
          {c.name} {c.title}
        </b>
        <small>
          {roleName(c.role)} · {bondLabel(c)}
        </small>
        <span className={`mtg-pips l${p.level}`} aria-label={signalText(p.signal)}>
          {[0, 1, 2, 3, 4].map((k) => (
            <i key={k} className={k <= p.level ? 'on' : ''} />
          ))}
        </span>
      </span>
      <span className="mtg-worries">
        {known.map((k) => (
          <span key={k} className={`chip${p.resolved.includes(k) ? ' green' : p.ob === k ? ' red' : ''}`}>
            {p.resolved.includes(k) && <PxIcon id="check" size={10} />}
            {concernName(k)}
          </span>
        ))}
        {Array.from({ length: hidden }, (_, i) => (
          <span key={'h' + i} className="chip mtg-q" title="아직 모르는 걱정입니다. 질문으로 알아내세요">
            ?
          </span>
        ))}
      </span>
    </button>
  );
}

function MeetingLog({ m, logRef }: { m: Meeting; logRef: React.RefObject<HTMLDivElement> }) {
  const g = useGame();
  return (
    <div className="mtg-log" ref={logRef} data-testid="meeting-log">
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
            {who && <PixelAvatar id={who.id} color={SUIT} suit={who.role !== 'user'} size={28} />}
            {mate && <PixelAvatar id={mate.id} color={dept(mate.dept).color} size={28} />}
            <div className={`nego-bubble${l.tone === 'bad' ? ' mtg-bad' : l.tone === 'good' ? ' mtg-good' : ''}`}>
              {(who || mate) && <span className="mtg-who">{who ? `${who.name} ${who.title}` : `${mate!.name}(우리 팀)`}</span>}
              {l.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const VERDICT_ICON: Record<string, PxId> = { won: 'trophy', warm: 'star', cold: 'talk', lost: 'warn' };

function MeetingResult({ m, last }: { m: Meeting; last: boolean }) {
  const g = useGame();
  const r = m.result!;
  const next =
    r === 'won'
      ? last
        ? '계약 협상으로 넘어갑니다. 메신저와 CEO 일정을 확인하세요.'
        : '다음 단계 미팅 제안이 메신저로 왔습니다. CEO 일정에서 받으세요.'
      : r === 'warm'
        ? '다시 연락을 주겠다고 합니다. 영업 기회가 조금 늘었습니다.'
        : r === 'cold'
          ? '당장은 진행이 어렵겠지만 인연은 남았습니다. 다음에는 걱정을 더 많이 풀어 보세요.'
          : '이번에는 어렵다고 합니다. 다음에는 질문으로 걱정부터 알아내 보세요.';
  return (
    <div className="mtg-result" data-testid="meeting-result">
      <div className={`mtg-verdict ${r}`}>
        <PxIcon id={VERDICT_ICON[r]} size={32} />
        <span className="mtg-verdict-text">
          <b>{resultText(r)}</b>
          <span>{next}</span>
          {m.promised.length > 0 && <span className="mtg-promised">약속한 기능: {m.promised.map((id) => `"${feature(id).name}"`).join(', ')}</span>}
        </span>
      </div>
      <div className="mtg-section-title">이번에 알게 된 사람</div>
      <div className="mtg-met">
        {m.attendees.map((a) => {
          const c = contact(g, a.contactId);
          if (!c) return null;
          const known = c.known.filter((k) => c.concerns.includes(k));
          return (
            <div key={c.id} className="mtg-met-one">
              <PixelAvatar id={c.id} color={SUIT} suit={c.role !== 'user'} size={36} />
              <span className="mtg-met-text">
                <b>
                  {c.name} {c.title}
                </b>
                <small>
                  {bondLabel(c)} · {bondChange(g, a)}
                </small>
                <span className="mtg-met-worries">{known.length ? known.map(concernName).join(', ') : '걱정을 알아내지 못했습니다'}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="mtg-result-foot">
        <span className="muted">만난 사람은 메신저 "아는 사람"에 남습니다.</span>
        <button className="btn green" data-testid="meeting-close" onClick={() => dispatch({ type: 'leaveMeeting' })}>
          회의실 나가기
        </button>
      </div>
    </div>
  );
}
