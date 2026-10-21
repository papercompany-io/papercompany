// F08 투자 앱: FR-01 단계 사다리, FR-13 라운드 열기, FR-11 룸·투자금, FR-10 투자사 레터, FR-06·07 협상·판정,
// FR-09 클럽딜, FR-08 제안서 수락·거절, EQ-02 희석, EQ-03 지분 구조
import { useState } from 'react';
import { DATA, investor, stage, stageIndex } from '../../core/data';
import { formatDate } from '../../core/calendar';
import { totalShares } from '../../core/equity';
import { pct, pctsSumTo100, won, wonShort } from '../../core/format';
import {
  acceptOffer,
  activeRound,
  askCoInvest,
  closeForOffer,
  coInvestProbability,
  coInvestors,
  decisionProbability,
  fits,
  rejectOffer,
  requestDecision,
  roundMath,
  selectableStages,
  sendLetter,
  stageConditions,
  startRound,
} from '../../core/funding';
import { externalChannelId } from '../../core/messenger';
import { computeValuation } from '../../core/valuation';
import { act, useGame } from '../store';
import { Money, Tabs, chanceLabel } from '../common';
import type { Round, StageId } from '../../core/types';
import './apps.css';

type Tab = 'round' | 'investors' | 'cap';

export function InvestApp({ initialStage }: { initialStage?: string }) {
  const s = useGame();
  const r = activeRound(s);
  const [tab, setTab] = useState<Tab>('round');
  return (
    <div className="col">
      <Ladder />
      <Tabs
        tabs={[
          { id: 'round', label: r ? (r.status === 'offer' ? '라운드 · 제안서 도착' : '라운드 · 진행 중') : '라운드' },
          { id: 'investors', label: '투자사 목록' },
          { id: 'cap', label: '지분 구조' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'round' && <RoundTab initialStage={initialStage} goInvestors={() => setTab('investors')} />}
      {tab === 'investors' && <InvestorsTab />}
      {tab === 'cap' && <CapTab />}
    </div>
  );
}

function Ladder() {
  const s = useGame();
  const cur = stageIndex(s.fundingStage);
  return (
    <div className="ladder" data-testid="ladder">
      {DATA.funding.stages.slice(0, 7).map((st, i) => (
        <div key={st.id} className={`rung ${i <= cur ? 'done' : ''} ${i === cur ? 'cur' : ''}`}>
          {st.name}
        </div>
      ))}
      <div className="rung more">…</div>
    </div>
  );
}

function RoundTab({ initialStage, goInvestors }: { initialStage?: string; goInvestors: () => void }) {
  const s = useGame();
  const r = activeRound(s);
  const options = selectableStages(s);
  const [stageId, setStageId] = useState<StageId>(options.includes(initialStage as StageId) ? (initialStage as StageId) : options[options.length > 1 && !s.fundingStage ? 2 : options.length - 1] ?? options[0]);
  const st = stage(stageId);
  const [room, setRoom] = useState(0.1);
  const [err, setErr] = useState<string | null>(null);
  const v = computeValuation(s);
  const m = roundMath(v.value, room);
  const history = s.rounds.filter((x) => x.status !== 'open' && x.status !== 'offer');

  if (r?.status === 'offer') return <OfferView r={r} />;
  if (r?.status === 'open') return <OpenRound r={r} goInvestors={goInvestors} />;

  return (
    <div className="col">
      <div className="card col">
        <b>투자 라운드 열기</b>
        <div className="tiny muted">라운드는 원할 때 언제든 열 수 있고, 실패해도 다시 열 수 있습니다. 다만 맞지 않는 시점에 열면 실패하기 쉽고, 진행하는 {DATA.funding.roundDays}일 동안 대표 행동 칸 {DATA.funding.lockedSlots}칸이 투자자 미팅에 묶입니다.</div>
        <div className="row">
          <label className="tiny">
            단계
            <select data-testid="round-stage" value={stageId} onChange={(e) => setStageId(e.target.value as StageId)}>
              {options.map((id) => (
                <option key={id} value={id}>
                  {stage(id).name}
                  {id === s.fundingStage ? ' (같은 단계 다시)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="tiny grow">
            이번에 열 지분(룸): <b data-testid="room-value">{pct(room, 0)}</b> <span className="muted">· 보통 {st.typicalRoom}</span>
            <input data-testid="room-slider" type="range" min={DATA.funding.roomMin} max={DATA.funding.roomMax} step={0.01} value={room} onChange={(e) => setRoom(Number(e.target.value))} />
          </label>
        </div>
        <table className="t">
          <tbody>
            <tr>
              <th>프리밸류(지금 기업가치, VL-01)</th>
              <td className="r" data-testid="preview-pre">
                {won(m.preValue)}
              </td>
            </tr>
            <tr>
              <th>포스트밸류 = 프리밸류 ÷ (1 − 룸)</th>
              <td className="r" data-testid="preview-post">
                {won(m.postValue)}
              </td>
            </tr>
            <tr>
              <th>예상 투자금 = 포스트밸류 × 룸</th>
              <td className="r" data-testid="preview-amount">
                <Money v={m.amount} full />
              </td>
            </tr>
          </tbody>
        </table>
        <div className="section-title">이 단계에 맞는 시점인가요?</div>
        {stageConditions(s, stageId).length === 0 && <div className="tiny muted">특별한 조건이 없습니다.</div>}
        {stageConditions(s, stageId).map((c) => (
          <div key={c.label} className="tiny">
            {c.ok ? '✅' : '⚠️'} {c.label}
          </div>
        ))}
        {err && <div className="err">{err}</div>}
        <button
          className="btn big"
          data-testid="round-open"
          onClick={() => {
            const e = act((g) => startRound(g, stageId, room));
            setErr(e ?? null);
            if (!e) goInvestors();
          }}
        >
          {st.name} 라운드 열기
        </button>
      </div>
      {history.length > 0 && <RoundHistory rounds={history} />}
    </div>
  );
}

function OpenRound({ r, goInvestors }: { r: Round; goInvestors: () => void }) {
  const s = useGame();
  const co = coInvestors(r);
  const [err, setErr] = useState<string | null>(null);
  const m = roundMath(r.preValue, r.room);
  return (
    <div className="card col" data-testid="round-open-card">
      <div className="row">
        <b>{stage(r.stage).name} 라운드 진행 중</b>
        <span className="chip amber">
          {formatDate(r.endDay)}까지 · {r.endDay - s.day}일 남음
        </span>
      </div>
      <table className="t">
        <tbody>
          <tr>
            <th>룸</th>
            <td className="r">{pct(r.room, 1)}</td>
          </tr>
          <tr>
            <th>프리밸류(라운드를 연 날 산정)</th>
            <td className="r">{won(m.preValue)}</td>
          </tr>
          <tr>
            <th>포스트밸류</th>
            <td className="r">{won(m.postValue)}</td>
          </tr>
          <tr>
            <th>투자금 = 포스트밸류 × 룸</th>
            <td className="r">{won(m.amount)}</td>
          </tr>
          <tr>
            <th>리드 투자사</th>
            <td className="r" data-testid="round-lead">
              {r.leadId ? investor(r.leadId).name : '아직 없음'}
            </td>
          </tr>
          <tr>
            <th>공동 투자사(클럽딜)</th>
            <td className="r" data-testid="round-co">
              {co.length ? co.map((id) => investor(id).name).join(', ') : '없음'}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="tiny muted">투자사 목록에서 레터를 보내 관심을 높이고 "투자 결정 요청"을 하세요. 리드가 정해지면 다른 투자사에 공동 투자를 제안해 클럽딜을 만들 수 있습니다. 협상 결과(희망 기업가치)는 리드의 투자 제안 레터를 따릅니다.</div>
      {err && <div className="err">{err}</div>}
      <div className="row">
        <button className="btn ghost" onClick={goInvestors}>
          투자사 목록으로
        </button>
        <div className="grow" />
        <button
          className="btn green"
          data-testid="round-close-offer"
          disabled={!r.leadId}
          onClick={() => {
            const e = act((g) => closeForOffer(g, r.id));
            setErr(e ?? null);
          }}
        >
          라운드 마감하고 제안서 받기
        </button>
      </div>
    </div>
  );
}

function OfferView({ r }: { r: Round }) {
  const s = useGame();
  const o = r.offer!;
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card col offer" data-testid="offer">
      <b style={{ fontSize: 18 }}>{stage(r.stage).name} 투자 제안서</b>
      <table className="t">
        <tbody>
          <tr>
            <th>프리밸류(협상 반영)</th>
            <td className="r" data-testid="offer-pre">
              {won(o.preValue)}
            </td>
          </tr>
          <tr>
            <th>룸(이번에 여는 지분)</th>
            <td className="r" data-testid="offer-room">
              {pct(o.room, 2)}
            </td>
          </tr>
          <tr>
            <th>포스트밸류 = 프리밸류 ÷ (1 − 룸)</th>
            <td className="r" data-testid="offer-post">
              {won(o.postValue)}
            </td>
          </tr>
          <tr className="total">
            <th>투자금 = 포스트밸류 × 룸</th>
            <td className="r" data-testid="offer-amount">
              {won(o.amount)}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="section-title">투자사별 몫(룸을 나눠 가짐)</div>
      <table className="t">
        <thead>
          <tr>
            <th>투자사</th>
            <th className="r">신주</th>
            <th className="r">투자 후 지분</th>
            <th className="r">투자금</th>
          </tr>
        </thead>
        <tbody>
          {o.shares.map((x, i) => (
            <tr key={x.investorId}>
              <td>
                {x.name} {i === 0 && <span className="chip blue">리드</span>}
              </td>
              <td className="r num">{x.newShares.toLocaleString()}주</td>
              <td className="r">{pct(x.pct, 2)}</td>
              <td className="r num">{won(x.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <span>
          창업자 지분 <b>{pct(o.founderBefore, 2)}</b> → <b data-testid="offer-founder-after">{pct(o.founderAfter, 2)}</b>
        </span>
        <span className="tiny muted">신주 {o.newShares.toLocaleString()}주를 발행해 기존 주주 모두 같은 비율로 희석됩니다.</span>
      </div>
      {err && <div className="err">{err}</div>}
      <div className="row">
        <button className="btn red" data-testid="offer-reject" onClick={() => setErr(act((g) => rejectOffer(g, r.id)) ?? null)}>
          거절
        </button>
        <div className="grow" />
        <button className="btn green big" data-testid="offer-accept" onClick={() => setErr(act((g) => acceptOffer(g, r.id)) ?? null)}>
          수락하고 투자 받기
        </button>
      </div>
      <div className="tiny muted">지금 자금 {wonShort(s.cash)} → 수락하면 {wonShort(s.cash + o.amount)}</div>
    </div>
  );
}

function RoundHistory({ rounds }: { rounds: Round[] }) {
  const label: Record<Round['status'], string> = { open: '진행 중', offer: '제안서', accepted: '투자 받음', rejected: '제안 거절', failed: '유치 실패' };
  return (
    <div className="card">
      <div className="section-title">지난 라운드</div>
      <table className="t">
        <tbody>
          {rounds
            .slice()
            .reverse()
            .map((x) => (
              <tr key={x.id}>
                <td>{stage(x.stage).name}</td>
                <td>
                  {formatDate(x.openedDay)} ~ {x.closedDay !== null ? formatDate(x.closedDay) : ''}
                </td>
                <td>룸 {pct(x.room, 1)}</td>
                <td>{label[x.status]}</td>
                <td className="r">{x.offer && x.status === 'accepted' ? won(x.offer.amount) : ''}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function InvestorsTab() {
  const s = useGame();
  const r = activeRound(s);
  const open = r?.status === 'open' ? r : null;
  const [err, setErr] = useState<string | null>(null);
  const [ask, setAsk] = useState<Record<string, string>>({});
  const sorted = DATA.investors.investors.slice().sort((a, b) => (open ? Number(fits(b.id, open.stage)) - Number(fits(a.id, open.stage)) : 0));
  return (
    <div className="col">
      {!open && <div className="warn">진행 중인 라운드가 없습니다. 라운드 탭에서 라운드를 열면 레터를 보낼 수 있습니다.</div>}
      {err && <div className="err">{err}</div>}
      <div className="inv-list">
        {sorted.map((inv) => {
          const t = open?.letters[inv.id];
          const fit = open ? fits(inv.id, open.stage) : false;
          const isLead = open?.leadId === inv.id;
          const msgs = s.channels.find((c) => c.id === externalChannelId(inv.id))?.messages ?? [];
          const dp = open && t && !open.leadId && !t.decision ? decisionProbability(s, open, inv.id) : null;
          const cp = open && t && open.leadId && !isLead && !t.coInvest ? coInvestProbability(s, open, inv.id) : null;
          return (
            <div key={inv.id} className={`card inv ${isLead ? 'lead' : ''}`} data-testid={`inv-${inv.id}`}>
              <div className="row">
                <b>{inv.name}</b>
                <span className="chip">{inv.kind}</span>
                {open && <span className={`chip ${fit ? 'green' : 'red'}`}>{fit ? '선호 단계' : '선호 단계 아님'}</span>}
                {inv.soloAverse && <span className="chip amber">단독 투자를 꺼림</span>}
                <div className="grow" />
                {isLead && <span className="chip blue">리드</span>}
                {t?.coInvest === 'joined' && <span className="chip green">공동 투자 참여</span>}
                {t?.coInvest === 'declined' && <span className="chip red">공동 투자 거절</span>}
                {t?.decision === 'declined' && <span className="chip red">투자 거절</span>}
              </div>
              <div className="tiny muted">
                {inv.desc} · 선호: {inv.stages.map((x) => stage(x as StageId).name).join('·')}
              </div>
              {t && (
                <div className="row tiny">
                  관심도
                  <div className="bar">
                    <div style={{ width: `${t.interest}%` }} />
                  </div>
                  <b data-testid={`interest-${inv.id}`}>{t.interest}</b>
                  <span className="muted">보낸 레터: {t.sent.map((id) => DATA.funding.letters.find((l) => l.id === id)!.name).join(', ') || '없음'}</span>
                </div>
              )}
              {msgs.length > 0 && (
                <div className="thread">
                  {msgs.slice(-3).map((m) => (
                    <div key={m.id} className={`tiny ${m.kind}`}>
                      <b>{m.from}</b> · {formatDate(m.day)}: {m.text}
                    </div>
                  ))}
                </div>
              )}
              {open && !t?.decision && !isLead && (
                <div className="letters">
                  {DATA.funding.letters.map((l) => {
                    const sent = t?.sent.includes(l.id);
                    return (
                      <div key={l.id} className="letter">
                        <button
                          className="btn small ghost"
                          data-testid={`letter-${inv.id}-${l.id}`}
                          disabled={sent}
                          title={l.desc}
                          onClick={() => setErr(act((g) => sendLetter(g, open.id, inv.id, l.id, ask[inv.id])) ?? null)}
                        >
                          {sent ? '✓ ' : '✉ '}
                          {l.name}
                        </button>
                        {l.id === 'proposal' && !sent && (
                          <select data-testid={`ask-${inv.id}`} value={ask[inv.id] ?? 'as_is'} onChange={(e) => setAsk({ ...ask, [inv.id]: e.target.value })}>
                            {DATA.funding.valuationAsks.map((a) => (
                              <option key={a.id} value={a.id}>
                                희망 기업가치 {a.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {dp && (
                <div className="row">
                  <button className="btn" data-testid={`decide-${inv.id}`} onClick={() => setErr(act((g) => requestDecision(g, open!.id, inv.id)) ?? null)}>
                    투자 결정 요청
                  </button>
                  <span className="tiny">
                    성공 가능성 <b>{chanceLabel(dp.p)}</b>
                  </span>
                  <span className="tiny muted" title={dp.factors.map((f) => `${f.label} ${f.mult ? `×${f.mult}` : (f.value >= 0 ? '+' : '') + Math.round(f.value * 100) + '%p'}`).join('\n')}>
                    근거: {dp.factors.filter((f) => f.value < 0 || f.mult).map((f) => f.label).join(', ') || '좋음'}
                  </span>
                </div>
              )}
              {cp !== null && (
                <div className="row">
                  <button className="btn green" data-testid={`coinvest-${inv.id}`} onClick={() => setErr(act((g) => askCoInvest(g, open!.id, inv.id)) ?? null)}>
                    다른 곳도 같이 해도 될까요? (공동 투자 제안)
                  </button>
                  <span className="tiny">
                    참여 가능성 <b>{chanceLabel(cp)}</b>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CapTab() {
  const s = useGame();
  const total = totalShares(s.capTable);
  const pcts = pctsSumTo100(s.capTable.map((c) => c.shares));
  return (
    <div className="col">
      <div className="card">
        <div className="section-title">지금 지분 구조</div>
        <table className="t" data-testid="cap-table">
          <thead>
            <tr>
              <th>주주</th>
              <th>구분</th>
              <th className="r">주식 수</th>
              <th className="r">지분율</th>
            </tr>
          </thead>
          <tbody>
            {s.capTable.map((c, i) => (
              <tr key={c.holderId}>
                <td>{c.name}</td>
                <td>{c.kind === 'founder' ? '창업자' : c.kind === 'cofounder' ? '코파운더' : `투자사 · ${c.round}`}</td>
                <td className="r num">{c.shares.toLocaleString()}주</td>
                <td className="r num">{pcts[i]}</td>
              </tr>
            ))}
            <tr className="total">
              <td>합계</td>
              <td />
              <td className="r num">{total.toLocaleString()}주</td>
              <td className="r num" data-testid="cap-total">
                {pcts.reduce((a, b) => a + Number(b.replace('%', '')), 0).toFixed(2)}%
              </td>
            </tr>
          </tbody>
        </table>
        <div className="capbar">
          {s.capTable.map((c, i) => (
            <div key={c.holderId} title={`${c.name} ${pcts[i]}`} style={{ flex: c.shares, background: c.kind === 'founder' ? '#2f8fff' : c.kind === 'cofounder' ? '#f2a33a' : ['#e5484d', '#8e6bff', '#3fbf7f', '#11a3a6'][i % 4] }} />
          ))}
        </div>
      </div>
      <div className="card">
        <div className="section-title">창업자 지분 변화(EQ-03)</div>
        <table className="t">
          <tbody>
            {s.equityHistory.map((h, i) => (
              <tr key={i}>
                <td>{formatDate(h.day)}</td>
                <td>{h.label}</td>
                <td className="r num">{h.totalShares.toLocaleString()}주</td>
                <td style={{ width: 200 }}>
                  <div className="bar">
                    <div style={{ width: `${h.founderPct * 100}%` }} />
                  </div>
                </td>
                <td className="r">{pct(h.founderPct, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
