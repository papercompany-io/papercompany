// F14 일정 메뉴(A-101): 하루 칸 배분 없이, 대표는 주 업무 하나를 하루 내내 합니다(실무: 개발·외주·영업, 경영: 대기업 영업·결재).
// 투자자 미팅·컨퍼런스·네트워킹·고객사 방문은 메신저로 오는 초대를 수락해 1~3일 자리를 비우는 외출. 여기서도 수락·거절·취소
// A-127: 하루짜리 약속은 시각·이동 시간이 있고, 겹치면 기존 일정을 취소하고 받거나 거절
// A-177: 약속(마일스톤) — 오른쪽 맨 위 약속 카드(받기·목표 수준·조율), 타임라인에 약속 줄(기한 깃발 + 예상 범위), 왼쪽 판에 약속 신뢰
// A-168: 대표는 회사의 개발 사이클 일정을 관리 — 왼쪽 판(지금·컨디션·주 업무·쌓인 것) + 오른쪽 8주 타임라인(만드는 순서의 시작~끝·출시·외주 마감·대표 외출). 점수·효율 숫자는 말로
import { DATA, dept, feature } from '../../core/data';
import { slotParts, actionDef, approveMultiplier, ceoEnergy, ceoWork, efficiency, executiveBlock, setCeoMode, setCeoWork, workChoices } from '../../core/ceo';
import { dateOf } from '../../core/calendar';
import { openRound } from '../../core/funding';
import { deptMembers } from '../../core/employees';
import { output } from '../../core/staff';
import { contractWorkers, nearestContract, type Contract } from '../../core/contracts';
import { contractOf, empOrderOf } from '../../core/assign';
import { clockHour, inNight } from '../../core/night';
import { fxTotals, hasMvp, itemNeed } from '../../core/product';
import { productView } from './ProductApp';
import { MilestoneCard, RISK_TEXT } from './MilestoneCard';
import { forecast, KIND_NAME, milestones, openMilestones, trustWord } from '../../core/milestones';
import { delegates, acceptOuting, awayOuting, cancelOuting, dayName, declineOuting, hhmm, isFullDay, outingConflict, outingRange, outingTravel, outings, outingTpl, todayOutings } from '../../core/outings';
import { useState } from 'react';
import { act, useGame } from '../store';
import type { ActionId, GameState, Outing } from '../../core/types';
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

const KIND_ACTION: Record<Outing['kind'], ActionId> = { ir: 'ir', network: 'network', sales: 'sales', review: 'approve' };

// 외출이 하는 일(효과 숫자 대신 말로, A-168)
function outingPurpose(o: Outing): string {
  if (o.delegate) return '직원이 대신 갑니다 · 끝나면 성과 일부';
  if (o.kind === 'review') return '약속한 기능에 숨은 일이 없는지 점검합니다(사무실 안)';
  const b = outingTpl(o.tpl).bonus;
  if (o.kind === 'ir') return '투자자에게 회사를 알립니다';
  if (o.kind === 'network') return '인맥을 넓힙니다';
  return b.pipeline ? '고객을 직접 만나고 대기업 계약에 다가갑니다' : '고객을 직접 만납니다';
}

// 대표 활동이 쌓인 정도를 말로(A-168). 화면에 IR·네트워크·파이프라인 점수를 숫자로 보여 주지 않습니다.
// 참고: IR 점수는 투자 확률을 40점에서 최대(+20%p)로 올리고 라운드가 끝나면 0으로 돌아감.
//       네트워크는 지원자 +30%/100점(최대 +60%), 투자사 관심 +1/10점(최대 +15). 파이프라인은 enterpriseThreshold(s)를 넘으면 대기업 계약
export function standingWords(s: GameState): { label: string; word: string; tone: 'good' | 'mid' | 'low' }[] {
  // TODO(human)
  return [];
}

// ── 개발 사이클 일정(A-168): 만드는 순서가 언제 시작해 언제 끝나는지를 8주 타임라인으로 ──
// 규칙은 그대로: 끝나는 날은 업무 창과 같은 계산(productView의 etas, 앞 항목부터 차례로 끝남)
const SPAN = 56; // 8주
const WEEKS = SPAN / 7;

function weekStartOf(day: number): number {
  return day - ((dateOf(day).getUTCDay() + 6) % 7);
}

const md = (day: number) => `${dateOf(day).getUTCMonth() + 1}/${dateOf(day).getUTCDate()}`;

interface CycleBar {
  key: string;
  name: string;
  core: boolean;
  from: number;
  to: number | null; // null = 만드는 사람이 없어 끝나지 않음
  progress: number;
  now: boolean;
}

function cycleBars(s: GameState, v: ReturnType<typeof productView>): CycleBar[] {
  return s.product.roadmap.map((it, i) => {
    const f = feature(it.id);
    const need = itemNeed(it);
    const prev = i ? v.etas[i - 1] : 0;
    return {
      key: `${it.id}-${it.level}`,
      name: `${f.name}${it.level > 1 ? ` ${it.level}단계` : ''}`,
      core: f.cat === 'core',
      from: isFinite(prev) ? s.day + prev : Infinity,
      to: isFinite(v.etas[i]) ? s.day + v.etas[i] : null,
      progress: need.dev + need.design ? (it.devDone + it.designDone) / (need.dev + need.design) : 0,
      now: i === 0,
    };
  });
}

// 누가 만드나(숫자 없이 말로)
function buildersText(s: GameState, v: ReturnType<typeof productView>): string {
  const devs = deptMembers(s, 'dev').length;
  const parts = [v.rate.ceo > 0 ? '대표' : null, v.rate.team > 0 ? `개발자 ${devs}명` : null, v.rate.design > 0 ? `디자이너 ${deptMembers(s, 'design').length}명` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : '아무도 만들지 않음';
}

export function energyWord(e: number): { word: string; cls: string; hint: string } {
  const E = DATA.ceo.energy;
  if (e >= 70) return { word: '좋음', cls: '', hint: '일이 잘 손에 붙습니다.' };
  if (e >= E.lowAt) return { word: '괜찮음', cls: '', hint: '아직은 버틸 만합니다.' };
  if (e >= E.burnoutAt) return { word: '지침', cls: 'warnc', hint: '일이 예전만큼 손에 붙지 않고, 판단이 흐려집니다.' };
  return { word: '많이 지침', cls: 'bad', hint: '쉬어야 합니다. 외출을 줄이고 야근을 멈추세요.' };
}

export function ScheduleApp() {
  const s = useGame();
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(0); // 지금 8주에서 4주씩 앞뒤(-1~1)
  const [sel, setSel] = useState<string | null>(null);
  const exec = s.company.ceoMode === 'executive';
  const execErr = executiveBlock(s);
  const out = awayOuting(s);
  const later = !out ? todayOutings(s).find((o) => !isFullDay(o)) : undefined; // 오늘 나중에 나갈 약속
  const work = ceoWork(s);
  const list = outings(s);
  const offers = list.filter((o) => o.status === 'offer').sort((a, b) => a.startDay - b.startDay);
  const run = (f: Parameters<typeof act>[0]) => setErr((act(f) as string | null | undefined) ?? null);
  const energy = energyWord(ceoEnergy(s));
  const v = productView(s);
  const bars = cycleBars(s, v);
  const start = weekStartOf(s.day) - 7 + page * 28; // 지난주부터 8주
  const pos = (day: number) => `${Math.max(0, Math.min(1, (day - start) / SPAN)) * 100}%`;
  const inSpan = (day: number) => day >= start && day < start + SPAN;
  const todayIn = inSpan(s.day);
  const mvpDay = !hasMvp(s) && v.mvpEta !== null && isFinite(v.mvpEta) ? s.day + v.mvpEta : null;
  const ct = nearestContract(s) ?? null; // 여러 외주면 마감이 가장 가까운 것(A-238)
  const picked = list.find((o) => o.id === sel && o.status !== 'offer' && o.status !== 'declined' && o.status !== 'expired');
  const trust = trustWord(s);
  const promises = openMilestones(s).sort((a, b) => (a.status === b.status ? (a.deadline ?? a.offeredDay + a.days) - (b.deadline ?? b.offeredDay + b.days) : a.status === 'offer' ? -1 : 1));
  const past = milestones(s).filter((m) => m.status !== 'offer' && m.status !== 'active' && m.status !== 'declined' && m.status !== 'expired').slice(-3).reverse();
  return (
    <div className="hire-layout sched2">
      {/* 왼쪽 판: 지금 · 컨디션 · 주 업무 · 모드 · 쌓인 것 */}
      <aside className="hire-form">
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

        <div>
          <div className="hf-label">컨디션</div>
          <div className="sc-energy" data-testid="ceo-energy" title="외출·야근·자금 압박에 닳고, 하루마다 조금씩 회복합니다.">
            <div className={`meter ${energy.cls}`}>
              <div style={{ width: `${ceoEnergy(s)}%` }} />
            </div>
            <b>{energy.word}</b>
          </div>
          <div className="tiny muted">{energy.hint}</div>
        </div>

        <div>
          <div className="hf-label">주 업무 · 약속이 없는 시간에 하는 일</div>
          <div className="sc-work">
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
                  </div>
                  <span className="wt-desc">{blocked ?? WORK_DESC[a]}</span>
                  {a === 'enterprise' && !fxTotals(s).enterprise && <span className="wt-warn">대기업용 기능이 없어 계약이 성사되지 않습니다.</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="hf-label">대표 모드</div>
          <div className="seg">
            <button className={!exec ? 'on' : ''} data-testid="mode-founder" onClick={() => run((g) => setCeoMode(g, 'founder'))}>
              실무 모드
            </button>
            <button className={exec ? 'on' : ''} data-testid="mode-executive" disabled={!!execErr} title={execErr ?? ''} onClick={() => run((g) => setCeoMode(g, 'executive'))}>
              경영 모드
            </button>
          </div>
          {execErr && !exec && <div className="tiny muted">{execErr}</div>}
        </div>

        <div>
          <div className="hf-label">대표 활동으로 쌓인 것</div>
          {standingWords(s).map((w) => (
            <div key={w.label} className="fb-row">
              <span>{w.label}</span>
              <b className={w.tone === 'good' ? 'fin-good' : w.tone === 'low' ? 'muted' : ''}>{w.word}</b>
            </div>
          ))}
          {exec && (
            <div className="fb-row">
              <span>결재</span>
              <b className={approveMultiplier(s) < 1 ? 'fin-bad' : 'fin-good'}>{approveMultiplier(s) < 1 ? '밀려서 일이 늦어지고 있습니다' : '제때 처리하고 있습니다'}</b>
            </div>
          )}
        </div>
        <div>
          <div className="hf-label">약속</div>
          <div className="fb-row" data-testid="ms-trust" title="바깥과 한 약속을 지켜 온 기록입니다. 투자 결정과 고객사 계약 규모에 들어갑니다. 오래되면 잊힙니다.">
            <span>약속 신뢰</span>
            <b className={trust.tone === 'good' ? 'fin-good' : trust.tone === 'low' ? 'fin-bad' : ''}>{trust.word}</b>
          </div>
          <div className="fb-row">
            <span>이 회사에서</span>
            <b>
              지킴 {s.milestones?.kept ?? 0} · 못 지킴 {s.milestones?.broken ?? 0}
            </b>
          </div>
        </div>
        {err && <div className="err">{err}</div>}
      </aside>

      {/* 오른쪽: 개발 사이클 타임라인(만드는 순서·출시·외주 마감·대표 외출) + 고른 일정 + 답할 초대 */}
      <div className="post-list">
        <div className="section-title">약속 {promises.length}</div>
        {promises.length === 0 && <div className="empty-note">진행 중인 약속이 없습니다. 고객사·행사·투자사가 날짜를 제안하면 여기에 옵니다. 분기 첫날에는 분기 목표를 정합니다.</div>}
        <div className="ms-list">
          {promises.map((m) => (
            <MilestoneCard key={m.id} m={m} />
          ))}
        </div>
        {past.length > 0 && (
          <div className="ms-past">
            {past.map((m) => (
              <span key={m.id} className={`chip ${m.status === 'failed' ? 'red' : 'green'}`} title={`${m.from} · ${m.title}`}>
                {KIND_NAME[m.kind]} · {m.status === 'done' ? '지킴' : m.status === 'late' ? '늦게 지킴' : '못 지킴'}
              </span>
            ))}
          </div>
        )}

        <div className="sc-week-head">
          <b>
            개발 사이클 · {md(start)} ~ {md(start + SPAN - 1)}
          </b>
          {openRound(s) && <span className="chip amber">투자 라운드 중 · 투자 미팅 초대가 자주 옴</span>}
          <span className="grow" />
          <div className="seg">
            <button className={page === -1 ? 'on' : ''} data-testid="cycle-prev" onClick={() => setPage(-1)}>
              앞 4주
            </button>
            <button className={page === 0 ? 'on' : ''} data-testid="cycle-now" onClick={() => setPage(0)}>
              지금
            </button>
            <button className={page === 1 ? 'on' : ''} data-testid="cycle-next" onClick={() => setPage(1)}>
              뒤 4주
            </button>
          </div>
        </div>

        <div className="cy" data-testid="dev-cycle" style={{ ['--today' as string]: pos(s.day) }}>
          <div className="cy-row cy-weeks">
            <span className="cy-label" />
            <div className="cy-track">
              {Array.from({ length: WEEKS }, (_, w) => (
                <span key={w} style={{ left: pos(start + w * 7) }}>
                  {md(start + w * 7)}
                </span>
              ))}
              {todayIn && <i className="cy-today" />}
            </div>
          </div>

          {/* 출시: 이미 출시한 기능과 MVP 출시 예정 */}
          <div className="cy-row">
            <span className="cy-label">출시</span>
            <div className="cy-track">
              {s.product.shipped
                .filter((x) => inSpan(x.day))
                .map((x, i) => (
                  <span key={`${x.id}-${x.level}-${i}`} className={`cy-ship ${x.result}`} style={{ left: pos(x.day) }} title={`${md(x.day)} ${feature(x.id).name} 출시${x.result === 'full' ? '' : x.result === 'partial' ? ' · 일부만 잘 됨' : ' · 실패'}`} />
                ))}
              {mvpDay !== null && inSpan(mvpDay) && (
                <span className="cy-flag" style={{ left: pos(mvpDay) }} title={`${md(mvpDay)} MVP 출시 예정`}>
                  MVP 출시
                </span>
              )}
              {todayIn && <i className="cy-today" />}
            </div>
          </div>

          {/* 약속(A-177): 받은 날 ~ 기한 막대, 기한 깃발, 지금 속도면 끝나는 범위(점선 띠) */}
          {promises.map((m) => {
            const f = forecast(s, m.kind === 'goal' && m.status === 'offer' ? { ...m, target: m.targets![1], level: 1 } : m);
            const from = m.startDay ?? s.day;
            const dl = m.deadline ?? s.day + m.days;
            const r = RISK_TEXT[f.risk];
            const lo = isFinite(f.lo) ? s.day + f.lo : start + SPAN;
            const hi = isFinite(f.hi) ? s.day + f.hi : start + SPAN;
            return (
              <div key={m.id} className="cy-row">
                <span className="cy-label" title={`${m.from} · ${m.title}`}>
                  <span className={`chip ${r.chip} cy-core`}>{KIND_NAME[m.kind]}</span>
                  {m.from}
                </span>
                <div className="cy-track">
                  {from < start + SPAN && dl >= start && (
                    <span className={`cy-bar promise ${m.status}`} style={{ left: pos(Math.max(start, from)), width: `calc(${pos(Math.min(start + SPAN, dl + 1))} - ${pos(Math.max(start, from))})`, ['--p' as string]: `${f.progress * 100}%` }} title={`${md(dl)}까지`}>
                      {m.status === 'offer' ? '제안' : r.text}
                    </span>
                  )}
                  {f.mid > 0 && lo < start + SPAN && hi >= start && <span className={`cy-est ${f.risk}`} style={{ left: pos(Math.max(start, lo)), width: `calc(${pos(Math.min(start + SPAN, hi + 1))} - ${pos(Math.max(start, lo))})` }} title="지금 속도면 이 사이에 끝납니다" />}
                  {inSpan(dl) && (
                    <span className="cy-flag deadline" style={{ left: pos(dl) }} title={`기한 ${md(dl)}`}>
                      {md(dl)}
                    </span>
                  )}
                  {todayIn && <i className="cy-today" />}
                </div>
              </div>
            );
          })}

          {/* 만드는 순서: 항목마다 시작 ~ 끝나는 날 */}
          {bars.length === 0 && (
            <div className="cy-row">
              <span className="cy-label muted">만드는 순서</span>
              <div className="cy-track cy-empty">만드는 순서가 비어 있습니다. 업무 창 기능 탭에서 넣으세요.</div>
            </div>
          )}
          {bars.map((b) => {
            const shown = isFinite(b.from) && b.from < start + SPAN && (b.to === null || b.to >= start);
            return (
              <div key={b.key} className="cy-row">
                <span className="cy-label" title={b.name}>
                  {b.core && <span className="chip red cy-core">핵심</span>}
                  {b.name}
                </span>
                <div className="cy-track">
                  {shown ? (
                    <span
                      className={`cy-bar ${b.now ? 'now' : ''} ${b.to === null ? 'stall' : ''}`}
                      style={{ left: pos(Math.max(start, b.from)), width: `calc(${pos(b.to === null ? start + SPAN : Math.min(start + SPAN, b.to + 1))} - ${pos(Math.max(start, b.from))})`, ['--p' as string]: `${b.progress * 100}%` }}
                      title={b.to === null ? '만드는 사람이 없어 끝나지 않습니다' : `${md(b.from)} ~ ${md(b.to)}`}
                    >
                      {b.to === null ? '멈춤' : b.now ? `만드는 중 ${Math.floor(b.progress * 100)}%` : `${md(b.to)} 끝`}
                    </span>
                  ) : (
                    <span className="cy-out">{!isFinite(b.from) ? '앞 항목이 멈춰 시작 못 함' : b.from >= start + SPAN ? `${md(b.from)}부터` : '이 기간 전에 끝남'}</span>
                  )}
                  {todayIn && <i className="cy-today" />}
                </div>
              </div>
            );
          })}

          {/* 외주 마감(A-155) */}
          {ct && ct.deadline !== null && (
            <div className="cy-row">
              <span className="cy-label">외주 · {ct.client}</span>
              <div className="cy-track">
                {inSpan(ct.deadline) || inSpan(ct.deadline - ct.days) ? (
                  <span
                    className="cy-bar contract"
                    style={{ left: pos(Math.max(start, ct.deadline - ct.days)), width: `calc(${pos(Math.min(start + SPAN, ct.deadline + 1))} - ${pos(Math.max(start, ct.deadline - ct.days))})`, ['--p' as string]: `${(ct.done / ct.work) * 100}%` }}
                    title={`${md(ct.deadline)} 마감`}
                  >
                    {md(ct.deadline)} 마감
                  </span>
                ) : (
                  <span className="cy-out">{md(ct.deadline)} 마감</span>
                )}
                {todayIn && <i className="cy-today" />}
              </div>
            </div>
          )}

          {/* 대표 일정: 외출(그날은 대표 개발이 줄어듦)과 점검 회의(A-181). 대신 보낸 외출은 빠짐(A-133) */}
          <div className="cy-row">
            <span className="cy-label">대표 일정</span>
            <div className="cy-track">
              {list
                .filter((o) => !o.delegate && (o.status === 'booked' || o.status === 'offer' || o.status === 'done') && o.startDay + o.days > start && o.startDay < start + SPAN)
                .map((o) => (
                  <button
                    key={o.id}
                    className={`cy-out-block ${o.status} ${sel === o.id ? 'on' : ''}`}
                    style={{ ['--ac' as string]: COLORS[KIND_ACTION[o.kind]], left: pos(Math.max(start, o.startDay)), width: `calc(${pos(Math.min(start + SPAN, o.startDay + o.days))} - ${pos(Math.max(start, o.startDay))})` }}
                    onClick={() => setSel(o.id)}
                    title={`${o.status === 'offer' ? '초대 · ' : ''}${o.title} · ${outingRange(o)}`}
                  />
                ))}
              {todayIn && <i className="cy-today" />}
            </div>
          </div>
        </div>
        <div className="tiny muted">
          지금 만드는 사람: {buildersText(s, v)}. 끝나는 날은 지금 속도로 계산합니다. 대표가 외출하거나 주 업무를 바꾸면 늦어집니다. 약속 줄의 옅은 띠는 지금 속도면 끝나는 범위, 깃발은 기한입니다. 점선은 아직 답하지 않은 초대입니다.
        </div>

        {picked && (
          <OutingCard o={picked}>
            {picked.status === 'done' ? (
              <span className="chip">다녀옴</span>
            ) : s.day < picked.startDay ? (
              <button className="btn small ghost" onClick={() => run((g) => cancelOuting(g, picked.id))} title="비용은 돌려받지 못하고, 상대가 서운해합니다">
                취소
              </button>
            ) : (
              <span className="chip green">진행 중</span>
            )}
          </OutingCard>
        )}

        <div className="section-title">답할 초대 {offers.length}</div>
        {offers.length === 0 && <div className="empty-note">아직 받은 초대가 없습니다. 투자자·행사·고객사 초대는 메신저로 옵니다.</div>}
        {offers.map((o) => (
          <OutingCard key={o.id} o={o} on={sel === o.id} onPick={() => setSel(o.id)}>
            <OutingOfferActions o={o} onErr={setErr} />
          </OutingCard>
        ))}
      </div>
    </div>
  );
}

function OutingCard({ o, on, onPick, children }: { o: Outing; on?: boolean; onPick?: () => void; children: React.ReactNode }) {
  return (
    <div className={`outing-card ${on ? 'on' : ''}`} style={{ ['--ac' as string]: COLORS[KIND_ACTION[o.kind]] }} onClick={onPick}>
      <div className="oc-head">
        <span className="oc-dot" />
        <b>{o.title}</b>
        <span className="oc-host">{o.host}</span>
        {o.delegate && <OutingDelegate id={o.delegate} />}
      </div>
      <div className="oc-meta">
        <span>{outingRange(o)}</span>
        {outingTravel(o) && <span>{outingTravel(o)}</span>}
        <span>{outingPurpose(o)}</span>
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
// A-238: a = 볼 외주. 대표 외주 칸과 배치 없이 "외주 작업"을 맡은 사람은 마감이 가장 가까운 외주에만 들어감
export function contractPace(s: ReturnType<typeof useGame>, a?: Contract) {
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
  const near = !a || a.id === nearestContract(s)?.id;
  const staffed = a ? contractWorkers(s, a) : [];
  const loose = near ? s.employees.filter((e) => empOrderOf(s, e) === 'dev_contract' && !contractOf(s, e)) : [];
  const team = [...staffed, ...loose].reduce((t, e) => t + output(s, e), 0);
  if (!near) (ceo = 0), (ceoLeft = 0);
  return { ceo, ceoLeft, ceoFull, team, devs: staffed.length + loose.length, staffed, loose, total: ceo + team };
}

export const daysText = (d: number) => (d < 1 ? '오늘 안에' : `약 ${Math.ceil(d)}일`);

const WORK_HOURS = DATA.time.workEndHour - DATA.time.workStartHour;

// 근무 시간을 "2일 4시간"으로(근무 하루 = 9시간)
const workTimeText = (h: number) => {
  const t = Math.ceil(h - 1e-6);
  return [Math.floor(t / WORK_HOURS) ? `${Math.floor(t / WORK_HOURS)}일` : '', t % WORK_HOURS ? `${t % WORK_HOURS}시간` : ''].filter(Boolean).join(' ');
};

// 외주 마감까지 남은 근무 시간(A-155). 마감은 날짜(s.day) 단위라 마감일 근무까지 쓸 수 있고, 퇴근 뒤 밤에는 줄지 않습니다.
// "늦음"은 마감까지 할 수 있는 양으로 봅니다: 대표·개발팀 모두 오늘 남은 칸 + 마감일까지 하루치씩(A-173)
export function contractDue(s: ReturnType<typeof useGame>, ct?: Contract) {
  const a = ct ?? nearestContract(s);
  if (!a || a.deadline === null) return null;
  const dl = a.deadline - s.day;
  const today = inNight(s) ? 0 : Math.max(0, DATA.time.workEndHour - clockHour(s));
  const hours = Math.max(0, dl * WORK_HOURS + today);
  const pace = contractPace(s, a);
  const slotsLeft = DATA.time.slotsPerDay - s.slotsDone; // 개발팀도 칸마다 들어가므로 오늘 남은 칸만큼(A-173)
  const capacity = pace.ceoLeft + pace.ceo * Math.max(0, dl) + pace.team * (Math.max(0, dl) + slotsLeft / DATA.time.slotsPerDay);
  const overdue = dl < 0;
  const late = overdue || (pace.total > 0 && a.work - a.done > capacity + 1e-6);
  const text = overdue ? `마감 ${-dl}일 지남` : hours > 0 ? `마감까지 근무 ${workTimeText(hours)}` : '마감일 근무 끝남';
  return { dl, hours, overdue, late, text, tip: '마감은 근무 시간(9~18시)만 셉니다. 퇴근 뒤 밤에는 줄지 않습니다.' };
}
