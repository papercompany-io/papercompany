// F14 일정 메뉴(A-101): 하루 칸 배분 없이, 대표는 주 업무 하나를 하루 내내 합니다(실무: 개발·외주·영업, 경영: 대기업 영업·결재).
// 투자자 미팅·컨퍼런스·네트워킹·고객사 방문은 메신저로 오는 초대를 수락해 1~3일 자리를 비우는 외출. 여기서도 수락·거절·취소
// A-127: 하루짜리 약속은 시각·이동 시간이 있고, 겹치면 기존 일정을 취소하고 받거나 거절
import { DATA } from '../../core/data';
import { actionDef, approveMultiplier, approveNeed, ceoWork, efficiency, executiveBlock, setCeoMode, setCeoWork, workChoices } from '../../core/ceo';
import { acceptContract, contractsOpen, dropContract } from '../../core/contracts';
import { openRound } from '../../core/funding';
import { enterpriseThreshold } from '../../core/orders';
import { fxTotals, hasMvp } from '../../core/product';
import { acceptOuting, awayOuting, cancelOuting, dayName, declineOuting, hhmm, isFullDay, outingConflict, outingEffect, outingRange, outingTravel, outings, todayOutings } from '../../core/outings';
import { useState } from 'react';
import { act, useGame } from '../store';
import { Money, Help } from '../common';
import type { ActionId, Outing } from '../../core/types';
import './apps.css';

// TODO(human): 디자인 시스템 토큰(var(--c-*) / var(--positive) …)으로 활동 색을 다시 정하기.
//   흰 글자가 올라가므로 대비 3:1 이상이어야 함 — 지금 network(#3fbf7f)·sales(#f2a33a)는 약 2.3:1.
const COLORS: Record<ActionId, string> = { dev: '#4f8df5', contract: '#2bb3a8', sales: '#f2a33a', ir: '#e5484d', network: '#3fbf7f', enterprise: '#b5651d', approve: '#6b5bd6' };

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

      <ContractsCard />

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

// 초대 수락·거절(A-127): 이동 시간까지 따져 겹치는 일정이 있으면 "기존 일정 취소하고 수락" 또는 "거절". 메신저 초대 카드도 같이 씀
export function OutingOfferActions({ o, onErr }: { o: Outing; onErr: (e: string | null) => void }) {
  const s = useGame();
  const c = outingConflict(s, o);
  const started = !!c && s.day >= c.startDay;
  const run = (f: Parameters<typeof act>[0]) => onErr((act(f) as string | null | undefined) ?? null);
  return (
    <>
      {c && (
        <div className="oc-conflict" data-testid={`outing-conflict-${o.id}`}>
          {outingRange(c)} "{c.title}" 일정과 겹칩니다(이동 시간 포함).{started ? ' 이미 시작한 일정이라 바꿀 수 없습니다.' : ''}
        </div>
      )}
      {c ? (
        !started && (
          <button className="btn small" data-testid={`outing-replace-${o.id}`} title="취소한 일정의 비용은 돌려받지 못하고, 상대가 서운해합니다" onClick={() => run((g) => acceptOuting(g, o.id, true))}>
            기존 일정 취소하고 수락
          </button>
        )
      ) : (
        <button className="btn small green" data-testid={`outing-accept-${o.id}`} onClick={() => run((g) => acceptOuting(g, o.id))}>
          수락
        </button>
      )}
      <button className="btn small ghost" data-testid={`outing-decline-${o.id}`} onClick={() => run((g) => declineOuting(g, o.id))}>
        {c ? '새 초대 거절' : '거절'}
      </button>
    </>
  );
}

// 외주 일감(A-79): 제품을 만드는 동안 남의 일을 해서 런웨이를 늘립니다.
function ContractsCard() {
  const s = useGame();
  const c = s.contracts;
  const a = c?.active ?? null;
  if (!a && (!contractsOpen(s) || !c?.offers.length)) return null;
  return (
    <div className="card col" data-testid="contracts">
      <div className="row">
        <div className="section-title grow">외주 일감</div>
        {!!c?.completed && <span className="chip">완료 {c.completed}건</span>}
      </div>
      <Help text="대표 주 업무 &quot;외주&quot;나 개발팀 &quot;외주 작업&quot; 지시로 작업량을 채우면 대금이 들어옵니다. 그만큼 제품 개발은 늦어집니다. 마감을 넘기면 대금이 깎이고, 많이 넘기면 취소됩니다." />
      {a && a.deadline !== null && (
        <div className="card col" style={{ borderTop: `4px solid ${COLORS.contract}` }}>
          <div className="row">
            <b className="grow">
              {a.title} · {a.client}
            </b>
            <span className={`chip ${s.day > a.deadline ? 'red' : a.deadline - s.day <= 3 ? 'amber' : 'blue'}`}>{s.day > a.deadline ? `마감 ${s.day - a.deadline}일 지남` : `마감 ${a.deadline - s.day}일 남음`}</span>
          </div>
          <div className="bar">
            <div style={{ width: `${Math.min(100, (a.done / a.work) * 100)}%`, background: COLORS.contract }} />
          </div>
          <div className="row tiny">
            <span className="grow">
              작업량 {a.done.toFixed(1)} / {a.work}
            </span>
            대금 <Money v={a.pay} />
            <button className="btn small ghost" data-testid="contract-drop" onClick={() => act((g) => dropContract(g))}>
              포기
            </button>
          </div>
          {ceoWork(s) !== 'contract' && s.company.orders.dev !== 'dev_contract' && <div className="tiny warn">대표 주 업무가 "외주"가 아니고 개발팀도 맡지 않아 진행되지 않습니다.</div>}
        </div>
      )}
      {!!c?.offers.length && (
        <div className="furn-grid">
          {c.offers.map((o) => (
            <div key={o.id} className="card furn">
              <b>{o.title}</b>
              <div className="tiny muted">
                {o.client} · 작업량 {o.work} · 기간 {o.days}일
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
          ))}
        </div>
      )}
    </div>
  );
}
