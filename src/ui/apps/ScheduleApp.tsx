// F14 일정 메뉴(A-101): 하루 칸 배분 없이, 대표는 주 업무 하나를 하루 내내 합니다(실무: 개발·외주·영업, 경영: 대기업 영업·결재).
// 투자자 미팅·컨퍼런스·네트워킹·고객사 방문은 메신저로 오는 초대를 수락해 1~3일 자리를 비우는 외출. 여기서도 수락·거절·취소
// A-127: 하루짜리 약속은 시각·이동 시간이 있고, 겹치면 기존 일정을 취소하고 받거나 거절
import { DATA, dept } from '../../core/data';
import { slotParts, actionDef, approveMultiplier, approveNeed, ceoWork, efficiency, executiveBlock, setCeoMode, setCeoWork, workChoices } from '../../core/ceo';
import { acceptContract, contractsOpen, dropContract, trustLevel } from '../../core/contracts';
import { openRound } from '../../core/funding';
import { enterpriseThreshold, orderOf } from '../../core/orders';
import { deptMembers } from '../../core/employees';
import { deptOutput } from '../../core/staff';
import { clockHour, inNight } from '../../core/night';
import { fxTotals, hasMvp } from '../../core/product';
import { delegates, acceptOuting, awayOuting, cancelOuting, dayName, declineOuting, hhmm, isFullDay, outingConflict, outingEffect, outingRange, outingTravel, outings, todayOutings } from '../../core/outings';
import { useState } from 'react';
import { act, useGame } from '../store';
import { Money, Help } from '../common';
import type { ActionId, Outing } from '../../core/types';
import './apps.css';

// TODO(human): 디자인 시스템 토큰(var(--c-*) / var(--positive) …)으로 활동 색을 다시 정하기.
//   흰 글자가 올라가므로 대비 3:1 이상이어야 함 — 지금 network(#3fbf7f)·sales(#f2a33a)는 약 2.3:1.
export const COLORS: Record<ActionId, string> = { dev: '#4f8df5', contract: '#2bb3a8', sales: '#f2a33a', ir: '#e5484d', network: '#3fbf7f', enterprise: '#b5651d', approve: '#6b5bd6' };

// 주 업무 설명(하루 내내 했을 때)
const WORK_DESC: Partial<Record<ActionId, string>> = {
  dev: '로드맵 기능을 직접 만듭니다.',
  contract: '받은 외주 일감을 합니다(없으면 제품 개발).',
  sales: '직접 고객을 찾아 첫 고객을 모읍니다. 접대비가 듭니다.',
  enterprise: '대기업 계약을 따러 다닙니다. 접대비가 큽니다.',
  approve: '쌓인 결재를 처리해 전 직원 출력이 떨어지지 않게 합니다.',
};

const KIND_ACTION: Record<Outing['kind'], ActionId> = { ir: 'ir', network: 'network', sales: 'sales' };

export function ScheduleApp() {
  const s = useGame();
  const [err, setErr] = useState<string | null>(null);
  const exec = s.company.ceoMode === 'executive';
  const execErr = executiveBlock(s);
  const out = awayOuting(s);
  const later = !out ? todayOutings(s).find((o) => !isFullDay(o)) : undefined; // 오늘 나중에 나갈 약속
  const work = ceoWork(s);
  const list = outings(s);
  const offers = list.filter((o) => o.status === 'offer').sort((a, b) => a.startDay - b.startDay);
  const booked = list.filter((o) => o.status === 'booked').sort((a, b) => a.startDay - b.startDay);
  const run = (f: Parameters<typeof act>[0]) => setErr((act(f) as string | null | undefined) ?? null);
  return (
    <div className="col sched">
      <div className="sched-top">
        {/* 지금 대표가 하는 일 */}
        <section className={`sched-now ${out ? 'away' : ''}`} style={{ ['--ac' as string]: COLORS[out ? KIND_ACTION[out.kind] : work] }}>
          <span className="sn-label">지금</span>
          {out ? (
            <>
              <b>외출 중 · {out.title}</b>
              <span>
                {out.host} · {out.days > 1 ? `${out.days}일 중 ${s.day - out.startDay + 1}일째 · ` : ''}
                {isFullDay(out) ? `${dayName(out.startDay + out.days)} 복귀` : `${hhmm(out.startHour! + out.hours! + (out.travel ?? 0))}쯤 복귀`}
              </span>
            </>
          ) : (
            <>
              <b>책상에서 {actionDef(work).name} 중</b>
              <span>{later ? `오늘 ${hhmm(later.startHour!)} ${later.title} 약속이 있습니다(${outingTravel(later) ?? '이동 없음'}).` : WORK_DESC[work]}</span>
            </>
          )}
        </section>
        <div className="seg">
          <button className={!exec ? 'on' : ''} data-testid="mode-founder" onClick={() => run((g) => setCeoMode(g, 'founder'))}>
            실무 모드
          </button>
          <button className={exec ? 'on' : ''} data-testid="mode-executive" disabled={!!execErr} title={execErr ?? ''} onClick={() => run((g) => setCeoMode(g, 'executive'))}>
            경영 모드
          </button>
        </div>
      </div>
      {err && <div className="err">{err}</div>}

      <div className="section-title">주 업무</div>
      <div className="work-grid">
        {workChoices(s).map((a) => {
          const blocked = a === 'sales' && !hasMvp(s) ? 'MVP 전에는 팔 제품이 없습니다.' : null;
          return (
            <button
              key={a}
              className={`work-tile ${work === a ? 'on' : ''}`}
              style={{ ['--ac' as string]: COLORS[a] }}
              data-testid={`work-${a}`}
              disabled={!!blocked}
              title={blocked ?? ''}
              onClick={() => run((g) => setCeoWork(g, a))}
            >
              <div className="wt-head">
                <b>{actionDef(a).name}</b>
                <span className="chip blue" title="창업자 스펙·레거시에 따른 효율">×{efficiency(s, a).toFixed(2)}</span>
              </div>
              <span className="wt-desc">{blocked ?? WORK_DESC[a]}</span>
              {a === 'enterprise' && !fxTotals(s).enterprise && <span className="wt-warn">대기업용 기능이 없어 계약이 성사되지 않습니다.</span>}
            </button>
          );
        })}
      </div>

      <div className="sched-lists">
        <section>
          <div className="section-title">
            초대 {offers.length}
            {openRound(s) && <span className="chip amber" style={{ marginLeft: 8 }}>투자 라운드 중 · 투자 미팅 초대가 자주 옴</span>}
          </div>
          {offers.length === 0 && <div className="empty-note">아직 받은 초대가 없습니다. 투자자·행사·고객사 초대는 메신저로 옵니다.</div>}
          {offers.map((o) => (
            <OutingCard key={o.id} o={o}>
              <OutingOfferActions o={o} onErr={setErr} />
            </OutingCard>
          ))}
        </section>
        <section>
          <div className="section-title">잡힌 외출 {booked.length}</div>
          {booked.length === 0 && <div className="empty-note">잡힌 외출이 없습니다. 평소처럼 주 업무를 합니다.</div>}
          {booked.map((o) => (
            <OutingCard key={o.id} o={o}>
              {s.day < o.startDay ? (
                <button className="btn small ghost" onClick={() => run((g) => cancelOuting(g, o.id))} title="비용은 돌려받지 못하고, 상대가 서운해합니다">
                  취소
                </button>
              ) : (
                <span className="chip green">진행 중</span>
              )}
            </OutingCard>
          ))}
        </section>
      </div>


      <div className="stats">
        <div className="stat">
          <div className="stat-label">IR 점수(투자 확률)</div>
          <div className="stat-value">{s.irPoints.toFixed(1)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">네트워크 점수</div>
          <div className="stat-value">{s.networkPoints.toFixed(1)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">대기업 파이프라인</div>
          <div className="stat-value">
            {s.entPipeline.toFixed(1)} / {enterpriseThreshold(s).toFixed(1)}
          </div>
        </div>
        {exec && (
          <div className="stat">
            <div className="stat-label">결재(직원 {s.employees.length}명 · 하루 {approveNeed(s).toFixed(1)}만큼 쌓임)</div>
            <div className="stat-value" style={{ color: approveMultiplier(s) < 1 ? 'var(--red)' : 'var(--green-d)' }}>
              전 직원 출력 ×{approveMultiplier(s).toFixed(2)}
            </div>
          </div>
        )}
      </div>
      {execErr && !exec && <div className="tiny muted">경영 모드: {execErr}</div>}
    </div>
  );
}

function OutingCard({ o, children }: { o: Outing; children: React.ReactNode }) {
  return (
    <div className="outing-card" style={{ ['--ac' as string]: COLORS[KIND_ACTION[o.kind]] }}>
      <div className="oc-head">
        <span className="oc-dot" />
        <b>{o.title}</b>
        <span className="oc-host">{o.host}</span>
        {o.delegate && <OutingDelegate id={o.delegate} />}
      </div>
      <div className="oc-meta">
        <span>{outingRange(o)}</span>
        {outingTravel(o) && <span>{outingTravel(o)}</span>}
        <span>{outingEffect(o)}</span>
        <span>비용 {o.cost ? `${(o.cost / 1e4).toLocaleString()}만원` : '없음'}</span>
      </div>
      <div className="oc-actions">{children}</div>
    </div>
  );
}

function OutingDelegate({ id }: { id: string }) {
  const s = useGame();
  const e = s.employees.find((x) => x.id === id);
  return <span className="chip blue">{e ? `${e.name}님이 대신 감` : '직원이 대신 감'}</span>;
}

// 초대 수락·거절(A-127): 이동 시간까지 따져 겹치는 일정이 있으면 "기존 일정 취소하고 수락" 또는 "거절". 메신저 초대 카드도 같이 씀
// A-133: 행사·모임·고객사 방문은 "누가 갈까"에서 직원을 고르면 대표 일정과 상관없이 받을 수 있음
export function OutingOfferActions({ o, onErr }: { o: Outing; onErr: (e: string | null) => void }) {
  const s = useGame();
  const can = delegates(s, o);
  const [who, setWho] = useState<string>(''); // '' = 대표
  const sent = who && can.some((e) => e.id === who) ? who : undefined;
  const c = outingConflict(s, o, sent);
  const started = !!c && s.day >= c.startDay;
  const run = (f: Parameters<typeof act>[0]) => onErr((act(f) as string | null | undefined) ?? null);
  const whoName = sent ? `${can.find((e) => e.id === sent)!.name}님의 ` : '';
  return (
    <>
      {can.length > 0 && (
        <label className="oc-who">
          누가 갈까
          <select data-testid={`outing-who-${o.id}`} value={sent ?? ''} onChange={(e) => setWho(e.target.value)}>
            <option value="">대표(나)</option>
            {can.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {dept(e.dept).name}
              </option>
            ))}
          </select>
        </label>
      )}
      {c && (
        <div className="oc-conflict" data-testid={`outing-conflict-${o.id}`}>
          {whoName}
          {outingRange(c)} "{c.title}" 일정과 겹칩니다(이동 시간 포함).{started ? ' 이미 시작한 일정이라 바꿀 수 없습니다.' : ''}
          {!sent && can.length > 0 && !started ? ' 직원을 대신 보낼 수도 있습니다.' : ''}
        </div>
      )}
      {c ? (
        !started && (
          <button className="btn small" data-testid={`outing-replace-${o.id}`} title="취소한 일정의 비용은 돌려받지 못하고, 상대가 서운해합니다" onClick={() => run((g) => acceptOuting(g, o.id, true, sent))}>
            기존 일정 취소하고 수락
          </button>
        )
      ) : (
        <button className="btn small green" data-testid={`outing-accept-${o.id}`} onClick={() => run((g) => acceptOuting(g, o.id, false, sent))}>
          {sent ? '보내기' : '수락'}
        </button>
      )}
      <button className="btn small ghost" data-testid={`outing-decline-${o.id}`} onClick={() => run((g) => declineOuting(g, o.id))}>
        {c ? '새 초대 거절' : '거절'}
      </button>
    </>
  );
}

// 외주 일감(A-79). A-132: 작업량 숫자 대신 "얼마나 했나 · 지금 속도면 언제 끝나나 · 누가 하고 있나"를 보여 줌
// 왼쪽 알림 카드(A-144)도 같은 계산을 씁니다.
export function contractPace(s: ReturnType<typeof useGame>) {
  const per = actionDef('contract').perSlot * efficiency(s, 'contract');
  let ceo = 0;
  let ceoLeft = 0; // 오늘 아직 안 지난 칸(퇴근 뒤면 0)
  for (let i = 0; i < DATA.time.slotsPerDay; i++)
    for (const p of slotParts(s, i))
      if (p.action === 'contract') {
        ceo += p.w * per;
        if (i >= s.slotsDone) ceoLeft += p.w * per;
      }
  const ceoFull = DATA.time.slotsPerDay * per; // 대표가 외주를 주 업무로 할 때
  const devs = deptMembers(s, 'dev').length;
  const team = orderOf(s, 'dev') === 'dev_contract' ? deptOutput(s, 'dev') : 0;
  return { ceo, ceoLeft, ceoFull, team, devs, total: ceo + team };
}

export const daysText = (d: number) => (d < 1 ? '오늘 안에' : `약 ${Math.ceil(d)}일`);

const WORK_HOURS = DATA.time.workEndHour - DATA.time.workStartHour;

// 근무 시간을 "2일 4시간"으로(근무 하루 = 9시간)
const workTimeText = (h: number) => {
  const t = Math.ceil(h - 1e-6);
  return [Math.floor(t / WORK_HOURS) ? `${Math.floor(t / WORK_HOURS)}일` : '', t % WORK_HOURS ? `${t % WORK_HOURS}시간` : ''].filter(Boolean).join(' ');
};

// 외주 마감까지 남은 근무 시간(A-155). 마감은 날짜(s.day) 단위라 마감일 근무까지 쓸 수 있고, 퇴근 뒤 밤에는 줄지 않습니다.
// "늦음"은 마감까지 할 수 있는 양으로 봅니다: 대표는 오늘 남은 칸 + 마감일까지 하루치씩, 개발팀은 하루 끝에 들어가므로 오늘 포함 마감일까지 하루치씩
export function contractDue(s: ReturnType<typeof useGame>) {
  const a = s.contracts?.active;
  if (!a || a.deadline === null) return null;
  const dl = a.deadline - s.day;
  const today = inNight(s) ? 0 : Math.max(0, DATA.time.workEndHour - clockHour(s));
  const hours = Math.max(0, dl * WORK_HOURS + today);
  const pace = contractPace(s);
  const capacity = pace.ceoLeft + pace.ceo * Math.max(0, dl) + pace.team * Math.max(0, dl + 1);
  const overdue = dl < 0;
  const late = overdue || (pace.total > 0 && a.work - a.done > capacity + 1e-6);
  const text = overdue ? `마감 ${-dl}일 지남` : hours > 0 ? `마감까지 근무 ${workTimeText(hours)}` : '마감일 근무 끝남';
  return { dl, hours, overdue, late, text, tip: '마감은 근무 시간(9~18시)만 셉니다. 퇴근 뒤 밤에는 줄지 않습니다.' };
}

export function ContractsCard() {
  const s = useGame();
  const c = s.contracts;
  const a = c?.active ?? null;
  if (!a && !contractsOpen(s)) return null;
  const pace = contractPace(s);
  return (
    <div className="card col" data-testid="contracts">
      <div className="row">
        <div className="section-title grow">외주 일감</div>
        {!!c?.completed && <span className="chip">완료 {c.completed}건</span>}
      </div>
      <Help text="대표 주 업무 &quot;외주&quot;나 개발팀 &quot;외주 작업&quot; 지시로 일을 하면 끝냈을 때 대금이 들어옵니다. 그만큼 제품 개발은 늦어집니다. 마감은 근무 시간으로 세서 퇴근 뒤 밤에는 줄지 않습니다. 마감을 넘기면 대금이 깎이고, 많이 넘기면 취소됩니다. 제때 끝낼수록 외주 평판이 올라 더 크고 비싼 일감이 들어옵니다." />
      {(() => {
        // A-144: 외주 평판 — 단계 이름과 다음 단계까지 막대만(점수·단가는 숨김)
        const t = trustLevel(s);
        return (
          <div className="ct-trust" data-testid="contract-trust">
            <span>외주 평판</span>
            <b>{t.name}</b>
            <div className="bar grow" title={t.next ? `다음 단계: ${t.next}` : '가장 높은 단계'}>
              <div style={{ width: `${t.progress * 100}%`, background: COLORS.contract }} />
            </div>
            <span className="tiny muted">{t.next ? `다음: ${t.next}` : '최고 단계'}</span>
          </div>
        );
      })()}
      {a && a.deadline !== null && (() => {
        const pct = Math.min(100, (a.done / a.work) * 100);
        const left = Math.max(0, a.work - a.done);
        const eta = pace.total > 0 ? left / pace.total : null;
        const due = contractDue(s)!;
        const late = due.late;
        const who = [pace.ceo > 0 ? '대표' : null, pace.team > 0 ? `개발팀 ${pace.devs}명` : null].filter(Boolean).join(' · ');
        return (
          <div className="ct-active" style={{ ['--ac' as string]: COLORS.contract }}>
            <div className="row">
              <b className="grow">
                {a.title} · {a.client}
              </b>
              <span className={`chip ${due.overdue ? 'red' : due.dl <= 3 ? 'amber' : 'blue'}`} title={due.tip}>
                {due.text}
              </span>
            </div>
            <div className="ct-progress">
              <b>{Math.floor(pct)}%</b>
              <div className="bar grow">
                <div style={{ width: `${pct}%`, background: COLORS.contract }} />
              </div>
            </div>
            <div className="ct-facts">
              <div>
                <span>끝나는 때</span>
                <b className={eta === null || late ? 'bad' : ''}>{eta === null ? '아무도 안 하는 중' : `${daysText(eta)}${late ? ' · 마감보다 늦음' : ''}`}</b>
              </div>
              <div>
                <span>하는 사람</span>
                <b>{who || '없음'}</b>
              </div>
              <div>
                <span>대금</span>
                <b>
                  <Money v={a.pay} />
                </b>
              </div>
            </div>
            {eta === null && <div className="tiny warn">대표 주 업무를 "외주"로 하거나, 개발팀 채널에서 "외주 작업"을 맡기세요.</div>}
            <div className="row">
              <div className="grow" />
              <button className="btn small ghost" data-testid="contract-drop" onClick={() => act((g) => dropContract(g))}>
                포기
              </button>
            </div>
          </div>
        );
      })()}
      {!a && !c?.offers.length && (
        // A-136: 업무 창에서 탭이 늘 보이므로, 제안이 없을 때는 다음 제안이 언제 오는지 알려 줌
        <div className="tiny muted" data-testid="contracts-empty">
          지금 들어온 외주 제안이 없습니다. {c && c.nextOfferDay > s.day ? `${c.nextOfferDay - s.day}일 뒤에 새 제안이 들어옵니다.` : '곧 새 제안이 들어옵니다.'}
        </div>
      )}
      {!!c?.offers.length && (
        <div className="furn-grid">
          {c.offers.map((o) => {
            const solo = o.work / pace.ceoFull;
            const ok = Math.ceil(solo) <= o.days;
            return (
              <div key={o.id} className="card furn">
                <div className="row">
                  <b className="grow">{o.title}</b>
                  {(o.tier ?? 0) >= 2 && <span className="chip amber">큰 일감</span>}
                </div>
                <div className="tiny muted">
                  {o.client} · 기간 근무 {o.days}일
                </div>
                <div className={`tiny ${ok ? '' : 'warn'}`} title="대표가 하루 내내 외주만 할 때">
                  대표 혼자 {daysText(solo)} 걸림{ok ? '' : ' · 기간 안에 혼자는 어려움'}
                </div>
                <div className="row">
                  <b className="grow">
                    <Money v={o.pay} />
                  </b>
                  <button className="btn small" data-testid={`contract-take-${o.id}`} disabled={!!a} title={a ? '진행 중인 외주를 먼저 끝내세요.' : ''} onClick={() => act((g) => acceptContract(g, o.id))}>
                    받기
                  </button>
                </div>
                <div className="tiny muted">{o.offeredUntil - s.day}일 뒤 마감되는 제안</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
