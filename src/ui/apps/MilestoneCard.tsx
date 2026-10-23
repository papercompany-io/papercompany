// 약속 카드(A-177): CEO 일정 창·메신저·왼쪽 알림 카드가 같이 씀.
// 한 장에 "무엇을 · 언제까지 · 지금 속도면 언제 · 지키면/못 지키면" 과 할 일(받기·거절·목표 수준·조율)을 모읍니다. 효과 숫자는 말로
import { useState } from 'react';
import { feature } from '../../core/data';
import { dateOf } from '../../core/calendar';
import { wonShort } from '../../core/format';
import { featureLevel } from '../../core/product';
import { acceptMilestone, canCut, canExtend, canPush, cutScope, declineMilestone, dropMilestone, eventFee, extendDeadline, forecast, KIND_NAME, metricValue, MS, pendingReview, pushTeam, type MilestoneForecast } from '../../core/milestones';
import { acceptOuting, declineOuting, dayName, hhmm } from '../../core/outings';
import { act, useGame } from '../store';
import type { GameState, Milestone } from '../../core/types';

const md = (day: number) => `${dateOf(day).getUTCMonth() + 1}/${dateOf(day).getUTCDate()}`;

export const RISK_TEXT: Record<MilestoneForecast['risk'], { text: string; chip: string }> = {
  done: { text: '조건 채움', chip: 'green' },
  ok: { text: '여유 있음', chip: 'green' },
  tight: { text: '빠듯함', chip: 'amber' },
  late: { text: '늦을 것 같음', chip: 'red' },
};

const metricText = (m: Milestone, v: number) => (m.metric === 'mrr' ? `월 매출 ${wonShort(v)}` : `사용자 ${Math.round(v).toLocaleString('ko-KR')}명`);

// 지키면 / 못 지키면(숫자 대신 말로)
function stakes(s: GameState, m: Milestone): { win: string; lose: string } {
  switch (m.kind) {
    case 'customer':
      return { win: `${m.reward.months ?? 12}개월 시범 계약`, lose: '명성이 깎이고 소문이 나서 대기업 영업이 늦어짐' };
    case 'partner':
      return { win: '제휴사 공동 홍보로 인지도·사용자 증가', lose: '제휴사 고객 사이 평판이 나빠져 인지도 하락' };
    case 'event':
      return { win: `투자자 관심·인지도·명성 · 참가비 ${wonShort(eventFee(s))}(받을 때)`, lose: '발표가 펑크 나 명성과 투자자 관심이 떨어짐' };
    case 'investor':
      return { win: '다음 투자 때 그 투자사가 힘을 실어 줌', lose: '1년 동안 투자 결정이 어려워짐' };
    case 'goal':
      return { win: '팀 분위기가 좋아지고 약속 신뢰가 오름(크게 잡을수록 큼)', lose: '팀 분위기가 가라앉음(크게 잡을수록 큼)' };
  }
}

// 조건 줄: 기능이면 기능마다 상태, 지표면 지금 / 목표 막대
function Needs({ s, m, f }: { s: GameState; m: Milestone; f: MilestoneForecast }) {
  if (m.needs)
    return (
      <div className="ms-needs">
        {m.needs.map((n) => {
          const done = featureLevel(s, n.id) >= n.level;
          const qi = s.product.roadmap.findIndex((r) => r.id === n.id && r.level === n.level);
          const it = qi >= 0 ? s.product.roadmap[qi] : null;
          const st = done ? '완성' : it ? (qi === 0 ? '개발 중' : `만드는 순서 ${qi + 1}번째`) : m.status === 'offer' ? '받으면 순서 끝에 넣음' : '만드는 순서에 없음';
          return (
            <div key={n.id} className={`ms-need ${done ? 'done' : !it && m.status === 'active' ? 'miss' : ''}`}>
              <span className="ms-check">{done ? '✓' : ''}</span>
              <b>
                {feature(n.id).name}
                {n.level > 1 ? ` ${n.level}단계` : ''}
              </b>
              <span>{st}</span>
            </div>
          );
        })}
      </div>
    );
  const v = metricValue(s, m.metric!);
  const target = m.target ?? 0;
  return (
    <div className="ms-metric">
      <div className="row">
        <span className="grow">지금 {metricText(m, v)}</span>
        <b>목표 {metricText(m, target)}</b>
      </div>
      <div className="meter">
        <div style={{ width: `${Math.round(f.progress * 100)}%` }} />
      </div>
    </div>
  );
}

// 기한과 예상(범위)
function When({ s, m, f }: { s: GameState; m: Milestone; f: MilestoneForecast }) {
  const dl = m.deadline ?? s.day + m.days;
  const r = RISK_TEXT[f.risk];
  const est = f.mid === 0 ? '조건을 채웠습니다' : !isFinite(f.mid) ? '지금은 끝나지 않음(개발 인력·순서·추세 확인)' : f.lo === f.hi ? `지금 속도면 ${md(s.day + f.mid)}` : `지금 속도면 ${md(s.day + f.lo)}~${md(s.day + f.hi)}`;
  return (
    <div className="ms-when">
      <span>
        기한 <b>{md(dl)}</b> {f.daysLeft >= 0 ? `(${f.daysLeft}일 남음)` : `(${-f.daysLeft}일 지남)`}
      </span>
      <span className="ms-est" title="예상은 남은 일이 많을수록 넓게 잡습니다. 진행할수록 좁아집니다.">
        {est}
      </span>
      {m.status !== 'offer' || m.kind !== 'goal' ? <span className={`chip ${r.chip}`}>{r.text}</span> : null}
    </div>
  );
}

// 점검 줄(A-181): 점검 전이면 "숨은 일이 있을 수 있음"과 걸린 점검 회의(참석·거절), 점검했으면 결과
function Review({ s, m, onErr }: { s: GameState; m: Milestone; onErr: (e: string | null) => void }) {
  if (!m.needs || m.status !== 'active' || (m.kind !== 'customer' && m.kind !== 'partner' && m.kind !== 'event')) return null;
  const items = m.needs.map((n) => s.product.roadmap.find((r) => r.id === n.id && r.level === n.level));
  const late = items.some((it) => it?.found === 'late');
  const early = items.some((it) => it?.found === 'review');
  const o = pendingReview(s, m);
  const run = (f: Parameters<typeof act>[0]) => onErr((act(f) as string | null | undefined) ?? null);
  if (m.checked)
    return (
      <div className={`ms-review ${late ? 'late' : 'done'}`} data-testid={`ms-review-${m.id}`}>
        {late ? '마무리 무렵에야 숨은 일이 드러났습니다. 점검했다면 더 일찍 알았을 겁니다.' : early ? `점검에서 숨은 일을 일찍 찾았습니다. 예상이 좁아졌습니다.` : '점검함 · 숨은 일 없음. 예상이 좁아졌습니다.'}
      </div>
    );
  return (
    <div className="ms-review open" data-testid={`ms-review-${m.id}`}>
      <span className="grow">아직 점검 전 · 숨은 일이 있을 수 있어 예상을 넓게 잡았습니다.</span>
      {!o && <span className="tiny muted">{s.employees.some((e) => e.dept === 'dev') ? '개발자가 곧 점검 회의를 요청합니다.' : '개발자가 있어야 점검 회의를 엽니다.'}</span>}
      {o?.status === 'booked' && <span className="chip blue">점검 회의 {dayName(o.startDay)} {hhmm(o.startHour!)}</span>}
      {o?.status === 'offer' && (
        <>
          <span className="chip amber">
            {o.host}님 요청 · {dayName(o.startDay)} {hhmm(o.startHour!)} 1시간
          </span>
          <button className="btn small" data-testid={`ms-review-accept-${m.id}`} title="그 한 시간은 대표 주 업무 대신 회의를 합니다. 이동은 없습니다." onClick={() => run((g) => acceptOuting(g, o.id))}>
            참석
          </button>
          <button className="btn small ghost" data-testid={`ms-review-decline-${m.id}`} onClick={() => run((g) => declineOuting(g, o.id))}>
            건너뛰기
          </button>
        </>
      )}
    </div>
  );
}

export function MilestoneCard({ m, compact = false }: { m: Milestone; compact?: boolean }) {
  const s = useGame();
  const [err, setErr] = useState<string | null>(null);
  const [lv, setLv] = useState(1);
  const run = (f: Parameters<typeof act>[0]) => setErr((act(f) as string | null | undefined) ?? null);
  const shown = m.kind === 'goal' && m.status === 'offer' ? { ...m, target: m.targets![lv], level: lv } : m;
  const f = forecast(s, shown);
  const st = stakes(s, m);
  const ended = m.status !== 'offer' && m.status !== 'active';
  const endText: Partial<Record<Milestone['status'], string>> = { done: '지킴', late: '늦게 지킴', failed: '못 지킴', declined: '거절함', expired: '지난 제안' };
  return (
    <div className={`ms-card ${m.kind} ${m.status} ${m.status === 'active' ? `risk-${f.risk}` : ''} ${compact ? 'compact' : ''}`} data-testid={`milestone-${m.id}`}>
      <div className="ms-head">
        <span className="chip">{KIND_NAME[m.kind]}</span>
        <b className="grow">{m.title}</b>
        <span className="ms-from">{m.from}</span>
        {ended && <span className={`chip ${m.status === 'done' ? 'green' : m.status === 'failed' ? 'red' : ''}`}>{endText[m.status]}</span>}
        {m.status === 'offer' && <span className="chip blue">제안 · {Math.max(0, m.offerUntil - s.day)}일 안에 답</span>}
      </div>
      {!ended && (
        <>
          {m.kind === 'goal' && m.status === 'offer' ? (
            <div className="ms-levels">
              {MS.goal.levels.map((l, i) => (
                <button key={l.id} className={`ms-level ${lv === i ? 'on' : ''}`} data-testid={`ms-goal-${m.id}-${i}`} onClick={() => setLv(i)}>
                  <b>{l.name}</b>
                  <span>{metricText(m, m.targets![i])}</span>
                  <span className="tiny muted">{l.desc}</span>
                </button>
              ))}
            </div>
          ) : (
            <Needs s={s} m={shown} f={f} />
          )}
          <When s={s} m={shown} f={f} />
          <Review s={s} m={m} onErr={setErr} />
          {!compact && (
            <div className="ms-stakes">
              <span>
                <b>지키면</b> {st.win}
              </span>
              <span>
                <b>못 지키면</b> {st.lose}
              </span>
            </div>
          )}
          <div className="ms-actions">
            {m.status === 'offer' ? (
              <>
                <button className="btn small green" data-testid={`ms-accept-${m.id}`} onClick={() => run((g) => acceptMilestone(g, m.id, m.kind === 'goal' ? lv : undefined))}>
                  {m.kind === 'goal' ? '이 수준으로 정하기' : '약속하기'}
                </button>
                <button className="btn small ghost" data-testid={`ms-decline-${m.id}`} onClick={() => run((g) => declineMilestone(g, m.id))}>
                  {m.kind === 'goal' ? '이번 분기는 안 정함' : '거절'}
                </button>
              </>
            ) : (
              <>
                {f.risk === 'late' && <span className="ms-hint">늦을 것 같습니다. 조율이 필요합니다.</span>}
                {canCut(m) && (
                  <button className="btn small ghost" data-testid={`ms-cut-${m.id}`} title="기능 하나를 빼고 나머지로 지킵니다. 보상이 줄고 신뢰가 조금 깎입니다." onClick={() => run((g) => cutScope(g, m.id))}>
                    범위 줄이기
                  </button>
                )}
                {canExtend(s, m) && (
                  <button className="btn small ghost" data-testid={`ms-extend-${m.id}`} title="기한을 한 번 미뤄 달라고 합니다. 신뢰가 깎입니다. 기한이 너무 가까우면 받아 주지 않습니다." onClick={() => run((g) => extendDeadline(g, m.id))}>
                    기한 연장 요청
                  </button>
                )}
                {canPush(s, m) && (
                  <button className="btn small ghost" data-testid={`ms-push-${m.id}`} title={`${MS.push.days}일 동안 팀이 더 빨리 만들지만 만족도가 떨어지고 대표가 지치고 버그가 늘어납니다.`} onClick={() => run((g) => pushTeam(g, m.id))}>
                    팀 몰아치기
                  </button>
                )}
                <button className="btn small ghost" data-testid={`ms-drop-${m.id}`} title="약속을 포기합니다. 못 지켰을 때와 비슷하게 신뢰가 깎입니다." onClick={() => run((g) => dropMilestone(g, m.id))}>
                  포기
                </button>
              </>
            )}
          </div>
        </>
      )}
      {err && <div className="err">{err}</div>}
    </div>
  );
}
