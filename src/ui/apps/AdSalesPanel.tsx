// 광고 판매 탭(A-182): 광고 자리(배너·이미지·비디오)가 얼마나 팔렸는지, 광고 운영팀이 받아 온 광고주 제안, 맺은 계약(자동 연장·해지 위약금).
// 짜임은 채용(A-88)과 같게 — 왼쪽 회색 판(광고 자리·오늘 광고 수입·광고 운영팀) + 오른쪽 광고주 카드. 흥정은 채용 협상 창과 같은 모양.
// 광고주가 낼 수 있는 최고 단가는 보여 주지 않습니다(흥정 답으로 알게).
// 화면(A-193): 광고 자리는 색 줄 카드 세 장 대신 선으로 나눈 줄. 아직 없는 자리는 회색 한 줄(자세한 말은 title). 팀 페이지 안(inTeam)에서는 위 띠와 겹치는 "광고 운영팀" 제목을 빼고 다음 제안 날만
// 화면(A-194): Startup Company 광고 계약처럼 하루 단위 — 광고 자리 막대는 계약마다 칸을 나눠(단가 높은 순, 회색 = 광고 네트워크), 제안은 "오늘의 제안"(내일 새로 바뀜),
//  계약 카드는 하루 최소~최대 노출 막대(오늘 내보낸 노출, 최소 눈금, 못 채우면 빨강)와 오늘 받는 돈·지금까지 번 돈
import { useEffect, useRef, useState } from 'react';
import { DATA, featuresOf } from '../../core/data';
import {
  acceptAdCounter,
  adCapacity,
  adFlow,
  adFormatDef,
  adRevenueSplit,
  adSizeDef,
  adSalesOf,
  adTierDef,
  breakPenalty,
  impsText,
  liveAdDeals,
  negotiateAd,
  offerWait,
  type AdDeal,
  type DealFlow,
} from '../../core/adsales';
import { formatDate } from '../../core/calendar';
import { josa, won, wonShort } from '../../core/format';
import { fxTotals } from '../../core/product';
import { PixelAvatar } from '../office/Avatar';
import { dispatch, timeHold, useGame } from '../store';
import type { GameState } from '../../core/types';

const TIER_COLOR: Record<string, string> = { local: 'var(--positive)', mid: 'var(--c-blue-500)', big: 'var(--caution)', global: 'var(--c-violet-600)' };

export function AdSales({ setMsg, inTeam }: { setMsg: (m: string | null) => void; inTeam?: boolean }) {
  const s = useGame();
  const [talk, setTalk] = useState<string | null>(null);
  const st = adSalesOf(s);
  const fx = fxTotals(s);
  const { formats: sales, deals: flow } = adFlow(s, fx);
  const rev = adRevenueSplit(s, fx);
  const ao = s.employees.filter((e) => e.dept === 'adops');
  const offers = st.offers.filter((o) => !o.left);
  const live = liveAdDeals(s);
  const cap = adCapacity(s);
  const full = live.length >= cap;
  const wait = offerWait(s);
  // 지금 계약 + 최근 끝난 계약 세 건(짧은 계약이 많아 끝난 건 다 보여 주지 않음)
  const ended = st.deals.filter((d) => !live.includes(d)).slice(-3).reverse();
  const feats = featuresOf(s.company.industry);
  return (
    <div className="hire-layout ads2">
      <section className="hire-form">
        <div className="hf-title">광고 자리</div>
        {sales.map((f) => {
          const def = adFormatDef(f.id);
          const feat = feats.find((x) => x.fx.adFormat === f.id);
          // 단가 높은 계약부터 칸을 나눔(실제로 노출을 채우는 순서)
          const ds = live.filter((d) => d.format === f.id).sort((a, b) => b.ecpm - a.ecpm || a.startDay - b.startDay);
          const short = ds.some((d) => flow[d.id]?.short);
          return (
            <div
              key={f.id}
              className={`ads2-slot ${f.on ? '' : 'off'}`}
              data-testid={`ad-slot-${f.id}`}
              title={f.on ? undefined : `업무 창에서 "${feat?.name ?? def.name}" 기능을 만들면 이 광고 자리가 생깁니다.`}
            >
              <div className="ads2-slot-head">
                <b>{def.name} 광고</b>
                {f.on ? <span className="ads2-slot-pct">{Math.round(f.soldShare * 100)}% 계약</span> : <span className="ads2-slot-lock">기능 개발 필요</span>}
              </div>
              {f.on && (
                <>
                  <div className="ads2-stack" title="단가가 높은 계약부터 노출을 채웁니다. 회색은 광고 네트워크가 싸게 채우는 미계약 자리입니다.">
                    {ds.map((d) => {
                      const x = flow[d.id];
                      if (!x || x.imps <= 0) return null;
                      return <i key={d.id} className={x.short ? 'short' : ''} style={{ width: `${(x.imps / f.inv) * 100}%`, ['--dc' as string]: TIER_COLOR[d.tier] }} title={`${d.advertiser} · 오늘 ${impsText(x.imps)}`} />;
                    })}
                  </div>
                  <div className="ads2-slot-foot">
                    <span>하루 {impsText(f.inv)} 노출</span>
                    <span>{f.dealDaily > 0 ? `계약 하루 ${wonShort(f.dealDaily)}` : '계약 없음'}</span>
                  </div>
                  {short && <div className="ads2-short">최소 노출을 못 채우는 계약이 있습니다. 그 계약은 하루 계약금이 20% 깎입니다.</div>}
                </>
              )}
            </div>
          );
        })}
        <div className="hf-summary">
          <div className="hf-sum">
            <span>광고주 계약</span>
            <b className="fin-good">하루 {wonShort(rev.deals / 30)}</b>
          </div>
          <div className="hf-sum" title="계약하지 않은 자리는 광고 네트워크가 광고주 계약보다 훨씬 싸게 채웁니다">
            <span>광고 네트워크</span>
            <b>하루 {wonShort(rev.network / 30)}</b>
          </div>
          <div className="hf-sum" title="광고 운영 담당자가 동시에 맡을 수 있는 계약 수입니다. 담당자가 늘거나 일을 잘하면 늘어납니다.">
            <span>계약</span>
            <b>
              {live.length}/{cap}건
            </b>
          </div>
        </div>
        {!inTeam && <div className="hf-title">광고 운영팀</div>}
        {ao.length === 0 ? (
          <div className="warn" data-testid="adops-none">
            광고 운영 담당자가 없어 광고주 제안이 오지 않습니다. 직원 관리 창 채용 탭에서 "광고 운영"(애드옵스 매니저)을 채용하면 매일 광고주 계약 제안을 받아 옵니다.
          </div>
        ) : (
          <div className="fb-row">
            <span>{inTeam ? '광고주 제안' : `광고 운영 ${ao.length}명`}</span>
            <b>{sales.some((f) => f.on) ? '매일 새로 바뀜' : '광고 자리가 없습니다'}</b>
          </div>
        )}
      </section>
      <section className="post-list">
        <div className="hf-title ads2-title">
          오늘의 광고주 제안
          {offers.length > 0 && <span>내일 새 제안으로 바뀝니다</span>}
        </div>
        {offers.length === 0 && <div className="empty-note">{wait ?? '오늘은 들어온 제안이 없습니다. 내일 새 제안이 들어옵니다. 사용자가 많을수록 큰 광고주가 찾아옵니다.'}</div>}
        {offers.length > 0 && full && <div className="ads2-short">맡을 수 있는 계약({cap}건)이 가득 차 새 계약을 맺을 수 없습니다. 광고 운영 담당자를 더 채용하거나 계약을 끝내면 흥정할 수 있습니다.</div>}
        <div className="applicant-grid">
          {offers.map((o) => {
            const left = Math.max(0, o.offeredUntil - s.day);
            const color = TIER_COLOR[o.tier];
            // 크기(A-194): 이 형식의 지금 하루 노출과 견줘 작은·보통·큰 계약
            const size = adSizeDef(o.size);
            const inv = sales.find((f) => f.id === o.format)?.inv ?? 0;
            return (
              <div key={o.id} className="applicant-card" data-testid={`ad-offer-${o.id}`} style={{ ['--dc' as string]: color }}>
                {o.since === s.day && !o.nego && <span className="ac-new">NEW</span>}
                <div className="ac-head">
                  <PixelAvatar id={o.id} color={color} size={48} />
                  <div className="ac-id">
                    <b>{o.advertiser}</b>
                    <span>
                      {adTierDef(o.tier).name} · {o.nego ? <span className={left <= 1 ? 'ac-soon' : ''}>흥정 중 D-{left}</span> : '오늘까지'}
                    </span>
                  </div>
                  <div className="ac-traits">
                    <span className="chip">{adFormatDef(o.format).name}</span>
                    {size && (
                      <span className={`chip ${size.id === 'big' ? 'amber' : size.id === 'small' ? 'green' : ''}`} title={`우리 ${adFormatDef(o.format).name} 광고 하루 ${impsText(inv)} 노출${size.desc} 사려고 합니다`}>
                        {size.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="ac-stats">
                  <div title="하루 최소 노출에 못 미치면 그날 계약금이 20% 깎이고, 사용자가 늘어도 최대 노출까지만 받습니다">
                    <span>하루 노출</span>
                    <b>
                      {impsText(o.min)}~{impsText(o.max)}
                    </b>
                  </div>
                  <div>
                    <span>원하는 기간</span>
                    <b>{o.days}일</b>
                  </div>
                  <div title="노출 1000회당 단가(eCPM)">
                    <span>첫 제안</span>
                    <b>{o.nego ? won(o.open) : '?'}</b>
                  </div>
                </div>
                <div className="ac-actions">
                  <button className="btn small green" data-testid={`ad-nego-${o.id}`} disabled={full} title={full ? '맡을 수 있는 계약이 가득 찼습니다' : undefined} onClick={() => setTalk(o.id)}>
                    {o.nego ? '흥정 이어가기' : '흥정 시작'}
                  </button>
                  <button className="btn small ghost" onClick={() => dispatch({ type: 'declineAdOffer', offerId: o.id })}>
                    거절
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="hf-title">계약</div>
        {live.length + ended.length === 0 && <div className="empty-note">아직 광고 계약이 없습니다.</div>}
        {[...live.slice().reverse(), ...ended].map((d) => (
          <DealCard key={d.id} s={s} d={d} x={flow[d.id]} setMsg={setMsg} />
        ))}
      </section>
      {talk && (
        <AdNegotiationDialog
          offerId={talk}
          onClose={() => setTalk(null)}
          onDone={(text) => {
            setMsg(text);
            setTalk(null);
          }}
        />
      )}
    </div>
  );
}

function DealCard({ s, d, x, setMsg }: { s: GameState; d: AdDeal; x: DealFlow | undefined; setMsg: (m: string | null) => void }) {
  const [ask, setAsk] = useState(false);
  const live = !d.closed && d.endDay > s.day;
  const fee = live ? breakPenalty(s, d) : 0;
  const imps = x?.imps ?? 0;
  return (
    <div className={`post-card ${live ? '' : 'closed'}`} data-testid={`ad-deal-${d.id}`} style={{ ['--dc' as string]: TIER_COLOR[d.tier] ?? 'var(--positive)' }}>
      <div className="pc-head">
        <span className="pc-dot" />
        <b>{d.advertiser}</b>
        <span className="chip">{adFormatDef(d.format).name}</span>
        <span className="pc-hired">{live ? `오늘 ${wonShort(x?.pay ?? 0)}` : `누적 매출 ${wonShort(d.earned)}`}</span>
      </div>
      {live && (
        <div className="ads2-meter" title={`하루 최소 ${impsText(d.min)} · 최대 ${impsText(d.max)}. 최소에 못 미치면 그날 계약금이 20% 깎이고, 사용자가 늘어도 최대까지만 받습니다.`}>
          <div className="ads2-meter-bar">
            <i className={x?.short ? 'short' : ''} style={{ width: `${Math.min(1, imps / d.max) * 100}%` }} />
            <em style={{ left: `${(d.min / d.max) * 100}%` }} />
          </div>
          <div className="ads2-meter-foot">
            <span className={x?.short ? 'bad' : imps >= d.max ? 'full' : ''}>
              오늘 {impsText(imps)} {x?.short ? '· 최소 미달' : imps >= d.max ? '· 최대' : ''}
            </span>
            <span>
              최소 {impsText(d.min)} · 최대 {impsText(d.max)}
            </span>
          </div>
        </div>
      )}
      <div className="pc-stats">
        <span>
          1000회당 <b>{won(d.ecpm)}</b>
        </span>
        <span>
          <b>{d.days}일</b>씩{d.renewals ? ` · ${d.renewals}번 연장` : ''}
        </span>
        <span>
          지금까지 <b>{wonShort(d.earned)}</b>
          {d.shortDays > 0 ? ` · 못 채운 날 ${d.shortDays}일` : ''}
        </span>
      </div>
      <div className="pc-foot">
        <span>
          {formatDate(d.startDay)}부터 · {live ? `${formatDate(d.endDay)}${d.autoRenew ? ' 자동 연장' : ' 끝남'}` : `${formatDate(d.endDay)} ${d.closed === 'break' ? '해지' : d.closed === 'lapse' ? '광고주가 연장하지 않음' : '끝남'}`}
        </span>
        <span>{live ? `D-${d.endDay - s.day}` : '끝남'}</span>
      </div>
      {live && (
        <div className="ads2-deal-acts">
          <label className="ads2-renew" title="켜 두면 기간이 끝날 때 같은 조건으로 계속 이어집니다. 끄면 이번 기간이 끝날 때 위약금 없이 끝납니다.">
            <input type="checkbox" data-testid={`ad-renew-${d.id}`} checked={d.autoRenew} onChange={(e) => dispatch({ type: 'setAdAutoRenew', dealId: d.id, on: e.target.checked })} />
            자동 연장
          </label>
          {ask ? (
            <>
              <span className="ads2-fee">위약금 {wonShort(fee)}</span>
              <button
                className="btn small red"
                data-testid={`ad-break-${d.id}`}
                onClick={() => {
                  const err = dispatch({ type: 'breakAdDeal', dealId: d.id }) as string | null | undefined;
                  setMsg(err ?? `${d.advertiser} 계약을 해지했습니다. 위약금 ${wonShort(fee)}을 냈습니다.`);
                  setAsk(false);
                }}
              >
                해지
              </button>
              <button className="btn small ghost" onClick={() => setAsk(false)}>
                취소
              </button>
            </>
          ) : (
            <button className="btn small ghost" onClick={() => setAsk(true)}>
              계약 해지
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// 광고 단가 흥정 창(채용 협상 창과 같은 짜임): 왼쪽 위 광고주(형식·하루 노출·원하는 기간·인내심), 왼쪽 아래 제안(단가 슬라이더·기간), 오른쪽 대화
function AdNegotiationDialog({ offerId, onClose, onDone }: { offerId: string; onClose: () => void; onDone: (text: string) => void }) {
  const s = useGame();
  const o = adSalesOf(s).offers.find((x) => x.id === offerId);
  // 창을 열면 광고주가 먼저 첫 제안을 말함
  useEffect(() => {
    dispatch({ type: 'openAdNegotiation', offerId });
  }, [offerId]);
  const open = o?.open ?? 1000;
  const step = Math.max(10, Math.round(open / 50 / 10) * 10);
  const eMin = Math.max(10, Math.round((open * 0.5) / step) * step);
  const eMax = Math.round((open * 3) / step) * step;
  const [ecpm, setEcpm] = useState(Math.round((open * 1.3) / step) * step);
  const [days, setDays] = useState(o?.days ?? 14);
  const [err, setErr] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  // 흥정 중에는 게임 시간이 가지 않음(A-118)
  useEffect(() => {
    timeHold.nego = true;
    return () => {
      timeHold.nego = false;
    };
  }, []);
  const nego = o?.nego;
  const msgs = nego?.log ?? [];
  const [shown, setShown] = useState(0);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const lastPatience = useRef<number>(nego?.patience ?? DATA.adsales.nego.patience);
  const typing = shown < msgs.length && msgs[shown].from === 'them';
  useEffect(() => {
    if (shown >= msgs.length) return;
    const next = msgs[shown];
    const wait = next.from === 'me' ? 0 : 700 + Math.min(1500, next.text.length * 28);
    const t = setTimeout(() => setShown((v) => v + 1), wait);
    return () => clearTimeout(t);
  }, [shown, msgs.length]);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' });
  }, [shown, typing]);
  useEffect(() => {
    if (!doneMsg || shown < msgs.length) return;
    const t = setTimeout(() => onDone(doneMsg), 1100);
    return () => clearTimeout(t);
  }, [doneMsg, shown, msgs.length]);
  if (!o) return null;
  const busy = shown < msgs.length || !!doneMsg;
  const pat = Math.round(typing && shown > 0 ? lastPatience.current : (nego?.patience ?? DATA.adsales.nego.patience));
  if (!typing) lastPatience.current = pat;
  const closed = !!o.left;
  const color = TIER_COLOR[o.tier];
  const fmt = adFormatDef(o.format).name;
  const daily = (o.max * ecpm) / 1000;
  const send = () => {
    const r = dispatch({ type: 'negotiateAd', offerId: o.id, ecpm, days }) as ReturnType<typeof negotiateAd>;
    setErr(r.ok ? null : r.message);
    if (r.signed) setDoneMsg(r.message);
  };
  const take = () => {
    const r = dispatch({ type: 'acceptAdCounter', offerId: o.id }) as ReturnType<typeof acceptAdCounter>;
    if (!r.ok) setErr(r.message);
    else setDoneMsg(r.message);
  };
  const nudge = (d: number) => setEcpm((v) => Math.max(eMin, Math.min(eMax, v + d)));
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal nego" data-testid="ad-dialog" onClick={(e) => e.stopPropagation()} style={{ ['--dc' as string]: color }}>
        <div className="nego-body">
          <div className="nego-left">
            <section className="nego-card">
              <div className="nego-head">{o.advertiser}</div>
              <div className="nego-profile">
                <PixelAvatar id={o.id} color={color} size={64} />
                <div>
                  <b>{adTierDef(o.tier).name}</b> 광고 담당자
                  <div className="nego-traits">
                    <span className="chip">{fmt} 광고</span>
                  </div>
                </div>
              </div>
              <div className="nego-stats">
                <div>
                  <span>하루 노출</span>
                  <b>
                    {impsText(o.min)}~{impsText(o.max)}
                  </b>
                </div>
                <div>
                  <span>원하는 기간</span>
                  <b>{o.days}일</b>
                </div>
                <div className="nego-patience">
                  <span>인내심</span>
                  <b key={pat} className={`nego-pnum ${pat <= 30 ? 'bad' : ''}`}>{pat}%</b>
                  <i>
                    <em style={{ width: `${pat}%` }} className={pat <= 30 ? 'bad' : pat <= 60 ? 'mid' : ''} />
                  </i>
                </div>
              </div>
            </section>
            <section className="nego-card">
              <div className="nego-head">제안 보내기</div>
              <div className="nego-offer">
                <label title="노출 1000회당 단가(eCPM)">
                  1000회당 단가 <b>{won(ecpm)}</b>
                </label>
                <div className="nego-slider">
                  <button onClick={() => nudge(-step)} aria-label="단가 내리기">
                    −
                  </button>
                  <input type="range" data-testid="ad-ecpm" min={eMin} max={eMax} step={step} value={ecpm} onChange={(e) => setEcpm(Number(e.target.value))} />
                  <button onClick={() => nudge(step)} aria-label="단가 올리기">
                    +
                  </button>
                </div>
                <label>계약 기간</label>
                <div className="seg">
                  {DATA.adsales.daysChoices.map((m) => (
                    <button key={m} className={m === days ? 'on' : ''} data-testid={`ad-months-${m}`} onClick={() => setDays(m)}>
                      {m}일
                    </button>
                  ))}
                </div>
                <div className="tiny">
                  최대 노출이면 하루 {wonShort(daily)} · {days}일이면 {wonShort(daily * days)}
                </div>
                {err && <div className="tiny" style={{ color: 'var(--negative-press)', fontWeight: 700 }}>{err}</div>}
                <button className="btn green" data-testid="ad-send" disabled={closed || busy} onClick={send}>
                  제안 보내기
                </button>
              </div>
            </section>
          </div>
          <section className="nego-card nego-chat">
            <div className="nego-head">흥정</div>
            <div className="nego-log" ref={log}>
              {msgs.slice(0, shown).map((m, i) => (
                <div key={i} className={`nego-msg ${m.from}`}>
                  {m.from === 'them' && <PixelAvatar id={o.id} color={color} size={28} />}
                  <div className="nego-bubble">
                    {m.from === 'me' ? (
                      <>
                        {m.text ? `${m.text} ` : '제안: '}1000회당 {won(m.ecpm ?? 0)} · {m.days}일
                      </>
                    ) : (
                      m.text
                    )}
                  </div>
                  {m.mood && <span className={`nego-mood ${m.mood}`}>{m.mood === 'happy' ? '만족' : m.mood === 'ok' ? '고민' : '불만'}</span>}
                  {m.patience !== undefined && m.patience !== 0 && (
                    <span className={`nego-pdelta ${m.patience < 0 ? 'down' : 'up'}`}>
                      인내심 {m.patience > 0 ? '+' : ''}
                      {m.patience}%
                    </span>
                  )}
                </div>
              ))}
              {typing && (
                <div className="nego-msg them typing" aria-label="입력 중">
                  <PixelAvatar id={o.id} color={color} size={28} />
                  <div className="nego-bubble">
                    <span className="dots">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="typing-label">입력 중</span>
                  </div>
                </div>
              )}
              {nego?.counter && !closed && !busy && (
                <button className="btn small nego-take" data-testid="ad-accept-counter" onClick={take}>
                  이 조건 받아들이기 (1000회당 {won(nego.counter.ecpm)} · {nego.counter.days}일)
                </button>
              )}
            </div>
            {closed && !busy && (
              <div className="nego-broke" data-testid="ad-nego-broke">
                <b>흥정 결렬</b> · {o.advertiser}
                {josa(o.advertiser, '이')} 다른 매체로 갔습니다.
              </div>
            )}
          </section>
        </div>
        <div className="nego-foot">
          <button className="btn ghost" onClick={onClose}>
            뒤로
          </button>
        </div>
      </div>
    </div>
  );
}
