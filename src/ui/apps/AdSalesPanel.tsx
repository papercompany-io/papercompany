// 광고 판매 탭(A-182): 광고 자리(배너·이미지·비디오)가 얼마나 팔렸는지, 광고 운영팀이 받아 온 광고주 제안, 맺은 계약(자동 연장·해지 위약금).
// 짜임은 채용(A-88)과 같게 — 왼쪽 회색 판(광고 자리·이번 달 광고 매출·광고 운영팀) + 오른쪽 광고주 카드. 흥정은 채용 협상 창과 같은 모양.
// 광고주가 낼 수 있는 최고 단가는 보여 주지 않습니다(흥정 답으로 알게).
import { useEffect, useRef, useState } from 'react';
import { DATA, featuresOf } from '../../core/data';
import {
  acceptAdCounter,
  adFormatDef,
  adNegotiation,
  adRevenueSplit,
  adRoom,
  adSalesOf,
  adTierDef,
  breakAdDeal,
  breakPenalty,
  dealMonthly,
  declineAdOffer,
  formatSales,
  impsText,
  liveAdDeals,
  negotiateAd,
  setAdAutoRenew,
  type AdDeal,
} from '../../core/adsales';
import { formatDate } from '../../core/calendar';
import { josa, won, wonShort } from '../../core/format';
import { fxTotals } from '../../core/product';
import { PixelAvatar } from '../office/Avatar';
import { act, timeHold, useGame } from '../store';
import type { GameState } from '../../core/types';

const TIER_COLOR: Record<string, string> = { local: 'var(--positive)', mid: 'var(--c-blue-500)', big: 'var(--caution)', global: 'var(--c-violet-600)' };
const FORMAT_COLOR: Record<string, string> = { banner: 'var(--c-blue-500)', image: 'var(--c-violet-600)', video: 'var(--negative)' };

export function AdSales({ setMsg }: { setMsg: (m: string | null) => void }) {
  const s = useGame();
  const [talk, setTalk] = useState<string | null>(null);
  const st = adSalesOf(s);
  const fx = fxTotals(s);
  const sales = formatSales(s, fx);
  const rev = adRevenueSplit(s, fx);
  const ao = s.employees.filter((e) => e.dept === 'adops');
  const offers = st.offers.filter((o) => !o.left);
  const deals = st.deals.slice().reverse();
  const feats = featuresOf(s.company.industry);
  return (
    <div className="hire-layout ads2">
      <section className="hire-form">
        <div className="hf-title">광고 자리</div>
        {sales.map((f) => {
          const def = adFormatDef(f.id);
          const feat = feats.find((x) => x.fx.adFormat === f.id);
          return (
            <div key={f.id} className={`ads2-slot ${f.on ? '' : 'off'}`} style={{ ['--dc' as string]: FORMAT_COLOR[f.id] }} data-testid={`ad-slot-${f.id}`}>
              <div className="ads2-slot-head">
                <span className="pc-dot" />
                <b>{def.name} 광고</b>
                {f.on && <span className="ads2-slot-pct">{Math.round(f.soldShare * 100)}% 계약</span>}
              </div>
              {f.on ? (
                <>
                  <div className="ads2-bar" title="색 칸 = 광고주와 계약한 노출, 회색 = 광고 네트워크가 싸게 채우는 자리">
                    <i style={{ width: `${f.soldShare * 100}%` }} />
                  </div>
                  <div className="ads2-slot-foot">
                    <span>월 {impsText(f.inv)} 노출</span>
                    <span>{f.dealMonthly > 0 ? `계약 월 ${wonShort(f.dealMonthly)}` : '계약 없음'}</span>
                  </div>
                  {f.fill < 1 && <div className="ads2-short">사용자가 줄어 약속한 노출의 {Math.round(f.fill * 100)}%만 내보내고 있습니다. 모자라면 위약금을 냅니다.</div>}
                </>
              ) : (
                <div className="ew-note">업무 창에서 "{feat?.name ?? def.name}" 기능을 만들면 이 광고 자리가 생깁니다.</div>
              )}
            </div>
          );
        })}
        <div className="hf-summary">
          <div className="hf-sum">
            <span>광고주 계약</span>
            <b className="fin-good">월 {wonShort(rev.deals)}</b>
          </div>
          <div className="hf-sum" title="계약하지 않은 자리는 광고 네트워크가 광고주 계약보다 훨씬 싸게 채웁니다">
            <span>광고 네트워크</span>
            <b>월 {wonShort(rev.network)}</b>
          </div>
          <div className="hf-sum">
            <span>계약</span>
            <b>{liveAdDeals(s).length}건</b>
          </div>
        </div>
        <div className="hf-title">광고 운영팀</div>
        {ao.length === 0 ? (
          <div className="warn" data-testid="adops-none">
            광고 운영 담당자가 없어 광고주 제안이 오지 않습니다. 채용 창에서 "광고 운영"(애드옵스 매니저)을 뽑으면 광고주를 찾아 일주일마다 계약 제안을 받아 옵니다.
          </div>
        ) : (
          <div className="fb-row">
            <span>광고 운영 {ao.length}명</span>
            <b>{sales.some((f) => f.on) ? `다음 제안 D-${Math.max(0, st.nextBatchDay - s.day)}` : '광고 자리가 없습니다'}</b>
          </div>
        )}
      </section>
      <section className="post-list">
        <div className="hf-title">광고주 제안</div>
        {offers.length === 0 && <div className="empty-note">{ao.length ? '아직 들어온 제안이 없습니다. 사용자가 많을수록 큰 광고주가 찾아옵니다.' : '광고 운영 담당자를 뽑으면 제안이 들어옵니다.'}</div>}
        <div className="applicant-grid">
          {offers.map((o) => {
            const fresh = s.day - (o.offeredUntil - DATA.adsales.offerDays) <= 1;
            const left = Math.max(0, o.offeredUntil - s.day);
            const color = TIER_COLOR[o.tier];
            return (
              <div key={o.id} className="applicant-card" data-testid={`ad-offer-${o.id}`} style={{ ['--dc' as string]: color }}>
                {fresh && <span className="ac-new">NEW</span>}
                <div className="ac-head">
                  <PixelAvatar id={o.id} color={color} size={48} />
                  <div className="ac-id">
                    <b>{o.advertiser}</b>
                    <span>
                      {adTierDef(o.tier).name} · <span className={left <= 2 ? 'ac-soon' : ''}>D-{left} 기다림</span>
                    </span>
                  </div>
                  <div className="ac-traits">
                    <span className="chip">{adFormatDef(o.format).name}</span>
                  </div>
                </div>
                <div className="ac-stats">
                  <div>
                    <span>월 노출</span>
                    <b>{impsText(o.imps)}</b>
                  </div>
                  <div>
                    <span>원하는 기간</span>
                    <b>{o.months}개월</b>
                  </div>
                  <div title="노출 1000회당 단가(eCPM)">
                    <span>첫 제안</span>
                    <b>{o.nego ? won(o.open) : '?'}</b>
                  </div>
                </div>
                <div className="ac-actions">
                  <button className="btn small green" data-testid={`ad-nego-${o.id}`} onClick={() => setTalk(o.id)}>
                    {o.nego ? '흥정 이어가기' : '흥정 시작'}
                  </button>
                  <button className="btn small ghost" onClick={() => act((g) => declineAdOffer(g, o.id))}>
                    거절
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="hf-title">계약</div>
        {deals.length === 0 && <div className="empty-note">아직 광고 계약이 없습니다.</div>}
        {deals.map((d) => (
          <DealCard key={d.id} s={s} d={d} setMsg={setMsg} />
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

function DealCard({ s, d, setMsg }: { s: GameState; d: AdDeal; setMsg: (m: string | null) => void }) {
  const [ask, setAsk] = useState(false);
  const live = d.endDay > s.day;
  const termStart = d.endDay - d.months * 30;
  const done = Math.min(1, Math.max(0, (s.day - termStart) / (d.months * 30)));
  const fee = breakPenalty(s, d);
  return (
    <div className={`post-card ${live ? '' : 'closed'}`} data-testid={`ad-deal-${d.id}`} style={{ ['--dc' as string]: TIER_COLOR[d.tier] ?? 'var(--positive)' }}>
      <div className="pc-head">
        <span className="pc-dot" />
        <b>{d.advertiser}</b>
        <span className="chip">{adFormatDef(d.format).name}</span>
        <span className="pc-hired">월 {wonShort(dealMonthly(d))}</span>
      </div>
      <div className="pc-stats">
        <span>
          월 <b>{impsText(d.imps)}</b> 노출
        </span>
        <span>
          1000회당 <b>{won(d.ecpm)}</b>
        </span>
        <span>
          <b>{d.months}개월</b>씩{d.renewals ? ` · ${d.renewals}번 연장` : ''}
        </span>
      </div>
      {live && (
        <div className="pc-time" title="이번 계약 기간이 지난 몫">
          <i style={{ width: `${done * 100}%` }} />
        </div>
      )}
      <div className="pc-foot">
        <span>
          {formatDate(d.startDay)}부터 · {live ? `${formatDate(d.endDay)}${d.autoRenew ? ' 자동 연장' : ' 끝남'}` : `${formatDate(d.endDay)} ${d.closed === 'cancel' ? '광고주가 끊음' : d.closed === 'break' ? '해지' : '끝남'}`}
        </span>
        <span>{live ? `D-${d.endDay - s.day}` : '끝남'}</span>
      </div>
      {live && (
        <div className="ads2-deal-acts">
          <label className="ads2-renew" title="켜 두면 기간이 끝날 때 같은 조건으로 계속 이어집니다. 끄면 이번 기간이 끝날 때 위약금 없이 끝납니다.">
            <input type="checkbox" data-testid={`ad-renew-${d.id}`} checked={d.autoRenew} onChange={(e) => act((g) => setAdAutoRenew(g, d.id, e.target.checked))} />
            자동 연장
          </label>
          {ask ? (
            <>
              <span className="ads2-fee">위약금 {wonShort(fee)}</span>
              <button
                className="btn small red"
                data-testid={`ad-break-${d.id}`}
                onClick={() => {
                  const err = act((g) => breakAdDeal(g, d.id));
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

// 광고 단가 흥정 창(채용 협상 창과 같은 짜임): 왼쪽 위 광고주(형식·월 노출·원하는 기간·첫 제안·인내심), 왼쪽 아래 제안(단가 슬라이더·기간), 오른쪽 대화
function AdNegotiationDialog({ offerId, onClose, onDone }: { offerId: string; onClose: () => void; onDone: (text: string) => void }) {
  const s = useGame();
  const o = adSalesOf(s).offers.find((x) => x.id === offerId);
  // 창을 열면 광고주가 먼저 첫 제안을 말함
  useEffect(() => {
    act((g) => {
      const x = g.adSales?.offers.find((v) => v.id === offerId);
      if (x) adNegotiation(g, x);
    });
  }, [offerId]);
  const open = o?.open ?? 1000;
  const step = Math.max(10, Math.round(open / 50 / 10) * 10);
  const eMin = Math.max(10, Math.round((open * 0.5) / step) * step);
  const eMax = Math.round((open * 3) / step) * step;
  const [ecpm, setEcpm] = useState(Math.round((open * 1.3) / step) * step);
  const [months, setMonths] = useState(o?.months ?? 6);
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
  const room = adRoom(s, o.format);
  const monthly = (o.imps * ecpm) / 1000;
  const send = () => {
    const r = act((g) => negotiateAd(g, o.id, ecpm, months))!;
    setErr(r.ok ? null : r.message);
    if (r.signed) setDoneMsg(r.message);
  };
  const take = () => {
    const r = act((g) => acceptAdCounter(g, o.id))!;
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
                  <span>월 노출</span>
                  <b>{impsText(o.imps)}</b>
                </div>
                <div>
                  <span>원하는 기간</span>
                  <b>{o.months}개월</b>
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
                <label title="노출 1000회당 받는 돈(eCPM)">
                  1000회당 단가: <b>{won(ecpm)}</b>
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
                  {DATA.adsales.monthsChoices.map((m) => (
                    <button key={m} className={m === months ? 'on' : ''} data-testid={`ad-months-${m}`} onClick={() => setMonths(m)}>
                      {m}개월
                    </button>
                  ))}
                </div>
                <div className="tiny">
                  월 약 {wonShort(monthly)} · {months}개월이면 {wonShort(monthly * months)}
                </div>
                {o.imps > room + 1 && <div className="tiny" style={{ color: 'var(--negative-press)' }}>남은 {fmt} 광고 자리가 모자랍니다(월 {impsText(room)} 남음).</div>}
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
                        {m.text ? `${m.text} ` : '제안: '}1000회당 {won(m.ecpm ?? 0)} · {m.months}개월
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
                  이 조건 받아들이기 (1000회당 {won(nego.counter.ecpm)} · {nego.counter.months}개월)
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
