// F08 투자 메뉴: FR-01 단계 사다리, FR-13 라운드 열기, FR-11 룸·투자금, FR-10 투자사 레터, FR-06·07 협상·판정,
// FR-09 클럽딜, FR-08 제안서 수락·거절, EQ-02 희석, EQ-03 지분 구조
// 화면 짜임(A-107): 채용처럼 왼쪽 회색 판(라운드 열기·진행·제안서) + 오른쪽 카드(지난 라운드·할 일), 말은 쉽게("받을 돈", "내 지분")
// 화면(A-179): 커리어·업무 창과 같은 톤 — 알약 탭, 탭마다 가운데 큰 숫자(받을 돈·D-day·제안 금액·관심·내 지분) + 회색 한 줄, 납작한 회색 칸, 색 타일 + 흰 픽셀 표식 사다리, 칸칸이 차는 막대. 긴 설명은 title로
import { PxIcon } from '../icons';
import { PixelCheck, PixelFlag } from '../pixelMarks';
import { useState } from 'react';
import { DATA, investor, stage, stageIndex } from '../../core/data';
import { formatDate } from '../../core/calendar';
import { totalShares } from '../../core/equity';
import { pct, pctsSumTo100, wonShort } from '../../core/format';
import {
  acceptOffer,
  activeRound,
  askCoInvest,
  closeForOffer,
  coInvestProbability,
  coInvestors,
  decisionProbability,
  fits,
  letterGain,
  pendingDecision,
  rejectOffer,
  requestDecision,
  roundMath,
  selectableStages,
  sendLetter,
  stageConditions,
  startRound,
  canSafe,
  cancelRound,
} from '../../core/funding';
import { externalChannelId } from '../../core/messenger';
import { computeValuation } from '../../core/valuation';
import { act, useGame } from '../store';
import { Tabs, chanceLabel } from '../common';
import { esopEntry, esopFree, investorPct, topUpEsop } from '../../core/equity';
import type { GameState, Round, StageId } from '../../core/types';
import './apps.css';
import './skin/InvestApp.css';

type Tab = 'round' | 'investors' | 'cap';

function founderPct(s: GameState): number {
  const total = totalShares(s.capTable) || 1;
  return s.capTable.filter((c) => c.kind === 'founder').reduce((a, c) => a + c.shares, 0) / total;
}

export function InvestApp({ initialStage, openChat }: { initialStage?: string; openChat?: (channelId: string) => void }) {
  const s = useGame();
  const r = activeRound(s);
  const [tab, setTab] = useState<Tab>('round');
  return (
    <div className="col inv-app iv2">
      <Ladder />
      <Tabs
        tabs={[
          { id: 'round', label: r ? (r.status === 'offer' ? '라운드 · 제안서 도착' : '라운드 · 진행 중') : '라운드' },
          { id: 'investors', label: '투자사' },
          { id: 'cap', label: '지분' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'round' && <RoundTab key={`${s.fundingStage}-${s.rounds.length}`} initialStage={initialStage} goInvestors={() => setTab('investors')} />}
      {tab === 'investors' && <InvestorsTab openChat={openChat} />}
      {tab === 'cap' && <CapTab />}
    </div>
  );
}

// FR-01 단계 사다리: 점과 선. 받은 단계는 초록 체크, 지금 단계는 파랑, 다음 단계는 점선 테두리
function Ladder() {
  const s = useGame();
  const cur = stageIndex(s.fundingStage);
  const funded = new Set(s.rounds.filter((r) => r.status === 'accepted').map((r) => r.stage));
  return (
    <ol className="inv-steps" data-testid="ladder">
      {DATA.funding.stages.slice(0, 7).map((st, i) => {
        const cls = funded.has(st.id as StageId) ? 'done' : i === cur ? 'cur' : i === cur + 1 ? 'next' : '';
        return (
          <li key={st.id} className={`inv-step ${cls}`} title={st.name}>
            <span className="inv-step-dot">{cls === 'done' ? <PixelCheck /> : cls === 'cur' ? <PixelFlag /> : i + 1}</span>
            <span className="inv-step-name">{st.name}</span>
            {cls === 'next' && <small>다음</small>}
          </li>
        );
      })}
    </ol>
  );
}

function RoundTab({ initialStage, goInvestors }: { initialStage?: string; goInvestors: () => void }) {
  const s = useGame();
  const r = activeRound(s);
  const options = selectableStages(s);
  // 기본은 지금 펀딩 단계의 다음 단계. 처음 연 경로(CO-02 엔젤)가 정한 단계는 아직 그 단계를 지나지 않았을 때만 씁니다(P1-22).
  const cur = stageIndex(s.fundingStage);
  const next = options.find((id) => stageIndex(id) === cur + 1) ?? options[options.length - 1];
  const fromArg = options.includes(initialStage as StageId) && stageIndex(initialStage as StageId) > cur ? (initialStage as StageId) : null;
  const [stageId, setStageId] = useState<StageId>(fromArg ?? next);
  const st = stage(stageId);
  const [room, setRoom] = useState(0.1);
  const [instrument, setInstrument] = useState<'equity' | 'safe'>('equity');
  const [err, setErr] = useState<string | null>(null);
  const safeOk = canSafe(stageId);
  const safe = safeOk && instrument === 'safe';
  const v = computeValuation(s);
  const m = roundMath(v.value, room);
  const history = s.rounds.filter((x) => x.status !== 'open' && x.status !== 'offer');
  const conds = stageConditions(s, stageId);
  const fp = founderPct(s);

  if (r?.status === 'offer') return <OfferView r={r} />;
  if (r?.status === 'open') return <OpenRound r={r} goInvestors={goInvestors} />;
  if (s.career.challenge === 'bootstrap')
    return (
      <div className="iv2-empty">
        <PxIcon id="lock" />
        <b>무투자 도전 중입니다. 투자를 받을 수 없습니다. 매출로 키우세요!</b>
      </div>
    );
  if (s.public)
    return (
      <div className="iv2-empty">
        <PxIcon id="chart" />
        <b>상장사입니다. 투자 라운드 대신 주식 메뉴에서 주가·지분을 관리합니다.</b>
      </div>
    );

  return (
    <div className="hire-layout">
      <section className="hire-form iv2-main">
        <div className="iv2-hero" title={`라운드는 원할 때 언제든 열 수 있고, 실패해도 다시 열 수 있습니다. 다만 맞지 않는 시점에 열면 실패하기 쉽고, 진행하는 ${DATA.funding.roundDays}일 동안 투자자 미팅 초대가 자주 옵니다(수락하면 하루~이틀 자리를 비움).`}>
          <span className="iv2-kicker">새 {st.name} 라운드 · 받을 돈</span>
          <b className="iv2-big good" data-testid="preview-amount" title="투자금 = 투자 뒤 회사 가치 × 내줄 지분">
            {wonShort(m.amount)}
          </b>
          <span className="iv2-sub inv-mine">
            내 지분 <b>{pct(fp, 1)}</b> → <b>{pct(safe ? fp : fp * (1 - room), 1)}</b>
            {safe && ' (SAFE는 다음 지분 라운드에서 줄어듭니다)'}
          </span>
        </div>
        <div className="hf-row">
          <div className="hf-field">
            <div className="hf-label">단계</div>
            <select className="inv-select" data-testid="round-stage" value={stageId} onChange={(e) => setStageId(e.target.value as StageId)}>
              {options.map((id) => (
                <option key={id} value={id}>
                  {stage(id).name}
                  {id === s.fundingStage ? ' (같은 단계 다시)' : ''}
                </option>
              ))}
            </select>
          </div>
          {safeOk && (
            <div className="hf-field">
              <div className="hf-label">방식</div>
              <div className="seg" title="SAFE: 지금 회사 가치를 정하지 않고 돈만 받고, 다음 지분 라운드에서 주식으로 바뀝니다">
                <button className={instrument === 'equity' ? 'on' : ''} data-testid="inst-equity" onClick={() => setInstrument('equity')}>
                  지분 투자
                </button>
                <button className={instrument === 'safe' ? 'on' : ''} data-testid="inst-safe" onClick={() => setInstrument('safe')}>
                  SAFE
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="hf-field">
          <div className="hf-label inv-room-label">
            <span>내줄 지분</span>
            <b data-testid="room-value">{pct(room, 0)}</b>
            <span className="muted">보통 {st.typicalRoom}</span>
          </div>
          <input className="inv-range" data-testid="room-slider" type="range" min={DATA.funding.roomMin} max={DATA.funding.roomMax} step={0.01} value={room} onChange={(e) => setRoom(Number(e.target.value))} />
        </div>
        <div className="hf-summary">
          <div className="hf-sum" title="프리밸류">
            <span>지금 회사 가치</span>
            <b data-testid="preview-pre">{wonShort(m.preValue)}</b>
          </div>
          <div className="hf-sum" title="포스트밸류 = 프리밸류 ÷ (1 − 내줄 지분)">
            <span>투자 뒤 회사 가치</span>
            <b data-testid="preview-post">{wonShort(m.postValue)}</b>
          </div>
        </div>
        {safe && (
          <div className="iv2-note" title={`SAFE: 지금은 주식을 주지 않고 돈만 받습니다. 다음 지분 라운드에서 회사 가치 상한 ${wonShort(m.postValue)}과 할인 ${DATA.funding.safe.discount * 100}% 중 유리한 가격으로 주식이 됩니다.`}>
            SAFE · 지금은 돈만 받기 · 상한 {wonShort(m.postValue)} · 할인 {DATA.funding.safe.discount * 100}%
          </div>
        )}
        <div className="iv2-sect">이 단계에 맞는 때인가요?</div>
        <div className="inv-checks">
          {conds.length === 0 && <span className="muted">특별한 조건이 없습니다.</span>}
          {conds.map((c) => (
            <div key={c.label} className={c.ok ? '' : 'bad'}>
              <PxIcon id={c.ok ? 'check' : 'warn'} size={14} /> {c.label}
            </div>
          ))}
        </div>
        {err && <div className="err">{err}</div>}
        <button
          className="btn big"
          data-testid="round-open"
          onClick={() => {
            const e = act((g) => startRound(g, stageId, room, safeOk ? instrument : 'equity'));
            setErr(e ?? null);
            if (!e) goInvestors();
          }}
        >
          {st.name} {safe ? 'SAFE ' : ''}라운드 열기
        </button>
      </section>
      <section className="post-list">
        <div className="iv2-sect">지난 라운드</div>
        {s.safes.length > 0 && (
          <div className="post-card inv-note" title="다음 지분 라운드에서 주식이 됩니다.">
            아직 주식으로 바뀌지 않은 SAFE <b>{wonShort(s.safes.reduce((a, x) => a + x.amount, 0))}</b>
          </div>
        )}
        {history.length === 0 ? <div className="empty-note">아직 연 라운드가 없습니다.</div> : <RoundHistory rounds={history} />}
      </section>
    </div>
  );
}

function OpenRound({ r, goInvestors }: { r: Round; goInvestors: () => void }) {
  const s = useGame();
  const co = coInvestors(r);
  const [err, setErr] = useState<string | null>(null);
  const m = roundMath(r.preValue, r.room);
  const left = Math.max(0, r.endDay - s.day);
  const timeFrac = Math.min(1, (s.day - r.openedDay) / Math.max(1, r.endDay - r.openedDay));
  const sentAny = Object.values(r.letters).some((t) => t.sent.length > 0);
  const steps: [string, boolean][] = [
    ['투자사에 레터 보내기', sentAny],
    ['관심 높은 곳에 "투자 결정 요청" → 리드 정하기', !!r.leadId],
    ['(선택) 다른 투자사에 공동 투자 제안', co.length > 0],
    ['라운드 마감하고 제안서 받기', false],
  ];
  return (
    <div className="hire-layout">
      <section className="hire-form iv2-main" data-testid="round-open-card">
        <div className="iv2-hero">
          <span className="iv2-kicker">{stage(r.stage).name} 라운드 진행 중 · 마감까지</span>
          <b className="iv2-big">D-{left}</b>
          <div className="iv2-time">
            <div className="pc-time" style={{ ['--dc' as string]: 'var(--accent)' }}>
              <i style={{ width: `${timeFrac * 100}%` }} />
            </div>
            <div className="pc-foot">
              <span>{formatDate(r.openedDay)} 시작</span>
              <span>{formatDate(r.endDay)} 끝</span>
            </div>
          </div>
        </div>
        <div className="hf-summary">
          <div className="hf-sum">
            <span>내줄 지분</span>
            <b>{pct(r.room, 1)}</b>
          </div>
          <div className="hf-sum" title="라운드를 연 날 산정한 프리밸류">
            <span>회사 가치</span>
            <b>{wonShort(m.preValue)}</b>
          </div>
          <div className="hf-sum">
            <span>받을 돈</span>
            <b className="fin-good">{wonShort(m.amount)}</b>
          </div>
        </div>
        <div className="iv2-rows">
          <div className="fb-row">
            <span>리드 투자사</span>
            <b data-testid="round-lead">{r.leadId ? investor(r.leadId).name : '아직 없음'}</b>
          </div>
          <div className="fb-row">
            <span>함께하는 투자사</span>
            <b data-testid="round-co">{co.length ? co.map((id) => investor(id).name).join(', ') : '없음'}</b>
          </div>
        </div>
        {err && <div className="err">{err}</div>}
        <div className="row">
          {!r.leadId && (
            <button className="btn ghost" data-testid="round-cancel" onClick={() => setErr(act((g) => cancelRound(g, r.id)) ?? null)}>
              라운드 접기
            </button>
          )}
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
            마감하고 제안서 받기
          </button>
        </div>
      </section>
      <section className="post-list">
        <div className="iv2-sect">할 일</div>
        <div className="post-card inv-todo">
          {steps.map(([label, ok], i) => (
            <div key={label} className={ok ? 'ok' : ''}>
              <span className="inv-todo-n">{ok ? <PixelCheck /> : i + 1}</span>
              {label}
            </div>
          ))}
          <button className="pc-link" onClick={goInvestors}>
            투자사 보러 가기 ›
          </button>
        </div>
      </section>
    </div>
  );
}

function OfferView({ r }: { r: Round }) {
  const s = useGame();
  const o = r.offer!;
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="hire-layout">
      <section className="hire-form inv-offer iv2-main" data-testid="offer">
        <div className="iv2-hero">
          <span className="iv2-kicker">
            {stage(r.stage).name} {o.instrument === 'safe' ? 'SAFE ' : ''}투자 제안서
          </span>
          <b className="iv2-big good" data-testid="offer-amount">
            {wonShort(o.amount)}
          </b>
          <span className="iv2-sub">
            통장 {wonShort(s.cash)} → <b>{wonShort(s.cash + o.amount)}</b>
          </span>
        </div>
        {o.down && <div className="warn">지난번보다 낮은 회사 가치입니다(다운라운드). 받으면 직원 사기와 명성이 떨어집니다.</div>}
        {o.instrument === 'safe' && (
          <div className="iv2-note" title={`SAFE라 지금은 지분이 줄지 않습니다. 회사 가치 상한 ${wonShort(o.safeCap ?? 0)}, 할인 ${DATA.funding.safe.discount * 100}%로 다음 지분 라운드에서 주식이 됩니다.`}>
            SAFE · 지금은 지분이 줄지 않음 · 상한 {wonShort(o.safeCap ?? 0)} · 할인 {DATA.funding.safe.discount * 100}%
          </div>
        )}
        {o.safeShares > 0 && <div className="iv2-note">이번에 예전 SAFE가 주식 {o.safeShares.toLocaleString('ko-KR')}주로 바뀝니다.</div>}
        <div className="hf-summary">
          <div className="hf-sum" title="협상 반영 프리밸류">
            <span>회사 가치</span>
            <b data-testid="offer-pre">{wonShort(o.preValue)}</b>
          </div>
          <div className="hf-sum">
            <span>내줄 지분</span>
            <b data-testid="offer-room">{pct(o.room, 2)}</b>
          </div>
          <div className="hf-sum" title="포스트밸류">
            <span>투자 뒤 회사 가치</span>
            <b data-testid="offer-post">{wonShort(o.postValue)}</b>
          </div>
        </div>
        <div className="inv-mine big">
          내 지분 <b>{pct(o.founderBefore, 2)}</b> → <b data-testid="offer-founder-after">{pct(o.founderAfter, 2)}</b>
        </div>
        {err && <div className="err">{err}</div>}
        <div className="row">
          <button className="btn red" data-testid="offer-reject" onClick={() => setErr(act((g) => rejectOffer(g, r.id)) ?? null)}>
            거절
          </button>
          <div className="grow" />
          <button className="btn green big" data-testid="offer-accept" onClick={() => setErr(act((g) => acceptOffer(g, r.id)) ?? null)}>
            받기
          </button>
        </div>
      </section>
      <section className="post-list">
        <div className="iv2-sect">누가 얼마나</div>
        {o.shares.map((x, i) => (
          <div key={x.investorId} className="post-card" style={{ ['--dc' as string]: i === 0 ? 'var(--accent)' : 'var(--c-gray-400)' }}>
            <div className="pc-head">
              <span className="pc-dot" />
              <b>{x.name}</b>
              {i === 0 && <span className="chip blue">리드</span>}
              <span className="pc-hired">{wonShort(x.amount)}</span>
            </div>
            <div className="pc-stats">
              <span>
                지분 <b>{pct(x.pct, 2)}</b>
              </span>
              <span>
                새 주식 <b>{x.newShares.toLocaleString()}주</b>
              </span>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function RoundHistory({ rounds }: { rounds: Round[] }) {
  const label: Record<Round['status'], string> = { open: '진행 중', offer: '제안서', accepted: '투자 받음', rejected: '제안 거절', failed: '유치 실패' };
  return (
    <>
      {rounds
        .slice()
        .reverse()
        .map((x) => (
          <div key={x.id} className="post-card" style={{ ['--dc' as string]: x.status === 'accepted' ? 'var(--positive)' : 'var(--negative)' }}>
            <div className="pc-head">
              <span className="pc-dot" />
              <b>{stage(x.stage).name}</b>
              <span className="chip">{label[x.status]}</span>
              <span className="pc-hired">{x.offer && x.status === 'accepted' ? wonShort(x.offer.amount) : ''}</span>
            </div>
            <div className="pc-foot">
              <span>
                {formatDate(x.openedDay)} ~ {x.closedDay !== null ? formatDate(x.closedDay) : ''}
              </span>
              <span>지분 {pct(x.room, 1)}</span>
            </div>
          </div>
        ))}
    </>
  );
}

// 투자사 고르기(A-108): 위 3단계 안내 · 왼쪽 목록(이번 라운드에 맞는 곳 / 안 맞는 곳) · 오른쪽 고른 투자사의 다음 할 일 하나씩
type Inv = (typeof DATA.investors.investors)[number];

function invStatus(r: Round | null, id: string): { text: string; tone: '' | 'blue' | 'green' | 'red' } {
  const t = r?.letters[id];
  if (!r || !t) return { text: '', tone: '' };
  if (r.leadId === id) return { text: '리드', tone: 'blue' };
  if (t.coInvest === 'joined') return { text: '함께 투자', tone: 'green' };
  if (t.decision === 'declined' || t.coInvest === 'declined') return { text: '거절', tone: 'red' };
  if (t.decision === 'pending') return { text: '답 기다리는 중', tone: 'blue' };
  if (t.sent.length) return { text: '대화 중', tone: '' };
  return { text: '', tone: '' };
}

function InvestorsTab({ openChat }: { openChat?: (channelId: string) => void }) {
  const s = useGame();
  const r = activeRound(s);
  const open = r?.status === 'open' ? r : null;
  const all = DATA.investors.investors;
  const good = open ? all.filter((i) => fits(i.id, open.stage)) : all;
  const bad = open ? all.filter((i) => !fits(i.id, open.stage)) : [];
  const [sel, setSel] = useState<string>(open?.leadId ?? good[0]?.id ?? all[0].id);
  const [showBad, setShowBad] = useState(false);
  const inv = all.find((i) => i.id === sel)!;
  const step = !open ? 0 : open.leadId ? 3 : Object.values(open.letters).some((t) => t.sent.length) ? 2 : 1;
  const row = (i: Inv) => {
    const st = invStatus(open, i.id);
    const t = open?.letters[i.id];
    return (
      <button key={i.id} className={`inv-row ${sel === i.id ? 'on' : ''}`} data-testid={`inv-${i.id}`} onClick={() => setSel(i.id)}>
        <div className="inv-row-name">
          <b>{i.name}</b>
          <span>{i.kind}</span>
        </div>
        {t ? (
          <div className="meter inv-row-meter" title={`관심 ${t.interest}`}>
            <div style={{ width: `${t.interest}%` }} />
          </div>
        ) : (
          <span />
        )}
        {st.text ? <span className={`chip ${st.tone}`}>{st.text}</span> : <span />}
      </button>
    );
  };
  return (
    <div className="col">
      <ol className="inv-guide">
        {['이번 라운드에 맞는 투자사 고르기', '레터를 보내 관심 올리기', '투자 결정 요청 → 리드 정하기'].map((g, i) => (
          <li key={g} className={!open ? '' : step > i + 1 ? 'done' : step === i + 1 ? 'now' : ''}>
            <span>{step > i + 1 && open ? <PixelCheck /> : i + 1}</span>
            {g}
          </li>
        ))}
      </ol>
      {!open && <div className="empty-note">진행 중인 라운드가 없습니다. 라운드 탭에서 라운드를 열면 투자사에 연락할 수 있습니다.</div>}
      <div className="hire-layout inv-pick">
        <section className="inv-list2">
          <div className="iv2-sect">{open ? `${stage(open.stage).name}에 맞는 투자사 ${good.length}곳` : '투자사'}</div>
          {good.map(row)}
          {bad.length > 0 && (
            <>
              <button className="pc-link inv-more" onClick={() => setShowBad((v) => !v)}>
                이번 단계에 안 맞는 투자사 {bad.length}곳 {showBad ? '접기' : '보기'} ›
              </button>
              {showBad && bad.map(row)}
            </>
          )}
        </section>
        <InvestorPanel key={inv.id} inv={inv} open={open} openChat={openChat} />
      </div>
    </div>
  );
}

function InvestorPanel({ inv, open, openChat }: { inv: Inv; open: Round | null; openChat?: (channelId: string) => void }) {
  const s = useGame();
  const [err, setErr] = useState<string | null>(null);
  const [ask, setAsk] = useState('as_is');
  const [gain, setGain] = useState<{ name: string; v: number } | null>(null);
  const t = open?.letters[inv.id];
  // 보낸 직후 관심이 얼마나 바뀌었는지 보여 줌(답장은 다음 날 와서 이유를 알려 줌)
  const send = (letterId: string, name: string) => {
    const v = letterGain(s, open!, inv.id, letterId, ask);
    const e = act((g) => sendLetter(g, open!.id, inv.id, letterId, ask)) ?? null;
    setErr(e);
    setGain(e ? null : { name, v });
  };
  const fit = open ? fits(inv.id, open.stage) : true;
  const isLead = open?.leadId === inv.id;
  const msgs = s.channels.find((c) => c.id === externalChannelId(inv.id))?.messages ?? [];
  const waiting = open ? pendingDecision(open) : undefined;
  const dp = open && t && t.sent.length && !open.leadId && !t.decision && !waiting ? decisionProbability(s, open, inv.id) : null;
  const cp = open && t && t.sent.length && open.leadId && !isLead && !t.coInvest ? coInvestProbability(s, open, inv.id) : null;
  const canWrite = !!open && !t?.decision && !isLead && !t?.coInvest;
  const st = invStatus(open, inv.id);
  return (
    <section className="hire-form inv-panel iv2-main">
      <div className="inv-head">
        <b>{inv.name}</b>
        <span className="chip">{inv.kind}</span>
        {st.text && <span className={`chip ${st.tone}`}>{st.text}</span>}
      </div>
      <div className="inv-desc" title={inv.desc}>
        {inv.desc}
      </div>
      <div className="of-tags">
        {inv.stages.map((x) => (
          <span key={x} className={open && x === open.stage ? 'hit' : ''}>
            {stage(x as StageId).name}
          </span>
        ))}
        {inv.soloAverse && <span>혼자 투자는 꺼림</span>}
      </div>
      {open && !fit && <div className="warn">이 투자사는 {stage(open.stage).name} 단계에 잘 투자하지 않습니다. 맞는 투자사를 고르는 게 좋습니다.</div>}

      {open && (
        <div className="inv-interest-big iv2-hero">
          <span className="iv2-kicker">이 투자사의 관심</span>
          <b className="iv2-big" data-testid={`interest-${inv.id}`}>
            {t?.interest ?? 0}
          </b>
          <div className="meter iv2-meter" title={`관심 ${t?.interest ?? 0} / 100`}>
            <div style={{ width: `${t?.interest ?? 0}%` }} />
          </div>
        </div>
      )}

      {canWrite && (
        <>
          <div className="iv2-sect" title="보낼수록 관심이 올라갑니다">
            레터 보내기
          </div>
          <div className="inv-letters">
            {DATA.funding.letters.map((l, li) => {
              const sent = t?.sent.includes(l.id);
              return (
                <div key={l.id} className={`inv-letter ${sent ? 'sent' : ''}`}>
                  <span className="iv2-tile">{sent ? <PixelCheck /> : li + 1}</span>
                  <div className="inv-letter-text">
                    <b>{l.name}</b>
                    <span title={l.desc}>{l.desc}</span>
                    {l.id === 'proposal' && !sent && (
                      <div className="seg inv-ask">
                        {DATA.funding.valuationAsks.map((a) => (
                          <button key={a.id} className={ask === a.id ? 'on' : ''} data-testid={`ask-${inv.id}-${a.id}`} onClick={() => setAsk(a.id)} title={a.pAdj < 0 ? '높게 부르면 투자받기 어려워집니다' : a.pAdj > 0 ? '낮게 부르면 투자받기 쉬워집니다' : ''}>
                            {a.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="btn small" data-testid={`letter-${inv.id}-${l.id}`} disabled={sent} onClick={() => send(l.id, l.name)}>
                    {sent ? '보냄' : '보내기'}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {dp && (
        <div className="inv-decide">
          <div>
            <b>투자 결정 요청</b>
            <span>
              성공 가능성 <b>{chanceLabel(dp.p)}</b>
            </span>
            <span className="inv-why">{dp.factors.filter((f) => f.value < 0 || f.mult).map((f) => f.label).join(' · ') || '좋은 조건입니다'}</span>
          </div>
          <button className="btn green" data-testid={`decide-${inv.id}`} onClick={() => setErr(act((g) => requestDecision(g, open!.id, inv.id)) ?? null)}>
            요청하기
          </button>
        </div>
      )}
      {/* 결정 요청 뒤 답 기다림(A-125) */}
      {open && t?.decision === 'pending' && (
        <div className="inv-hint" data-testid={`decide-wait-${inv.id}`}>
          투자 결정을 검토하고 있습니다. 답은 {Math.max(1, (t.decisionDue ?? s.day) - s.day)}일 안에 메신저로 옵니다.
        </div>
      )}
      {open && waiting && waiting !== t && !open.leadId && t?.sent.length && !t.decision ? (
        <div className="inv-hint">{investor(waiting.investorId).name}의 답을 기다리는 중입니다. 답을 받은 뒤 결정을 요청할 수 있습니다.</div>
      ) : null}
      {open && t && !t.sent.length && !open.leadId && <div className="inv-hint">레터를 하나 이상 보내야 투자 결정을 요청할 수 있습니다.</div>}
      {open && !t && !open.leadId && <div className="inv-hint">먼저 레터를 보내 이야기를 시작하세요.</div>}
      {cp !== null && (
        <div className="inv-decide">
          <div>
            <b>같이 투자하자고 제안</b>
            <span>
              참여 가능성 <b>{chanceLabel(cp)}</b>
            </span>
          </div>
          <button className="btn green" data-testid={`coinvest-${inv.id}`} onClick={() => setErr(act((g) => askCoInvest(g, open!.id, inv.id)) ?? null)}>
            제안하기
          </button>
        </div>
      )}
      {gain && (
        <div className={`inv-gain ${gain.v > 0 ? 'up' : gain.v < 0 ? 'down' : ''}`}>
          {gain.name}: 관심 {gain.v > 0 ? `+${gain.v}` : gain.v} {gain.v >= 20 ? '· 아주 반깁니다!' : gain.v < 0 ? '· 반기지 않습니다' : gain.v === 0 ? '· 별 반응이 없습니다' : ''}
          <span>답장은 내일 메신저로 옵니다.</span>
        </div>
      )}
      {isLead && <div className="ok tiny">이 투자사가 리드를 맡았습니다. 다른 투자사에 같이 투자하자고 제안하거나, 라운드 탭에서 마감하고 제안서를 받으세요.</div>}
      {err && <div className="err">{err}</div>}

      {/* 주고받은 말은 메신저에서(투자사 채널) */}
      {msgs.length > 0 && openChat && (
        <button className="btn ghost inv-chat" onClick={() => openChat(externalChannelId(inv.id))}>
          메신저에서 대화 보기 ({msgs.length})
        </button>
      )}
    </section>
  );
}

const CAP_COLORS = ['#e5484d', '#8e6bff', '#3fbf7f', '#11a3a6'];
function capColor(kind: string, i: number): string {
  return kind === 'founder' ? 'var(--accent)' : kind === 'cofounder' ? 'var(--caution)' : kind === 'esop' ? 'var(--c-gray-400)' : CAP_COLORS[i % 4];
}

function CapTab() {
  const s = useGame();
  const total = totalShares(s.capTable);
  const pcts = pctsSumTo100(s.capTable.map((c) => c.shares));
  return (
    <div className="hire-layout">
      <section className="hire-form iv2-main">
        <div className="iv2-hero">
          <span className="iv2-kicker">내 지분</span>
          <b className="iv2-big">{pct(founderPct(s), 1)}</b>
          <span className="iv2-sub">누가 회사를 얼마나 갖고 있나</span>
        </div>
        <div className="inv-capbar">
          {s.capTable.map((c, i) => (
            <div key={c.holderId} title={`${c.name} ${pcts[i]}`} style={{ flex: c.shares, background: capColor(c.kind, i) }} />
          ))}
        </div>
        <div className="inv-cap" data-testid="cap-table">
          {s.capTable.map((c, i) => (
            <div key={c.holderId} className="fb-row">
              <span>
                <i className="inv-swatch" style={{ background: capColor(c.kind, i) }} />
                {c.name}
                <em>{c.kind === 'founder' ? '창업자' : c.kind === 'cofounder' ? '코파운더' : c.kind === 'esop' ? '직원 몫(ESOP)' : c.kind === 'employee' ? '임직원' : c.kind === 'public' ? '일반 주주' : `투자사 · ${c.round}`}</em>
              </span>
              <b title={`${c.shares.toLocaleString()}주`}>{pcts[i]}</b>
            </div>
          ))}
          <div className="fb-row big">
            <span>합계 · {total.toLocaleString()}주</span>
            <b data-testid="cap-total">{pcts.reduce((a, b) => a + Number(b.replace('%', '')), 0).toFixed(2)}%</b>
          </div>
        </div>
        {s.equityHistory.length > 1 && (
          <>
            <div className="iv2-sect">내 지분 변화</div>
            <div className="inv-hist">
              {s.equityHistory.map((h, i) => (
                <div key={i} className="emp-bar">
                  <span title={formatDate(h.day)}>{h.label}</span>
                  <div className="meter">
                    <div style={{ width: `${h.founderPct * 100}%` }} />
                  </div>
                  <b>{pct(h.founderPct, 1)}</b>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
      <section className="post-list">
        <EsopCard />
        {investorPct(s) > 0 && !s.public && (
          <div className="post-card" style={{ ['--dc' as string]: s.company.board < 30 ? 'var(--negative)' : 'var(--accent)' }}>
            <div className="pc-head">
              <span className="pc-dot" />
              <b className="iv2-help" title="투자자 지분이 과반이면 이사회가 대표를 평가합니다. 매출이 줄면 신뢰가 떨어지고, 0이 되면 대표에서 해임됩니다(회사 종료).">
                이사회 신뢰
              </b>
              <span className="pc-hired">{Math.round(s.company.board)}</span>
            </div>
            <div className="pc-time">
              <i style={{ width: `${s.company.board}%` }} />
            </div>
            <div className="pc-foot">
              <span>투자자 지분 {pct(investorPct(s), 1)}</span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// EQ-04 ESOP 풀과 스톡옵션
function EsopCard() {
  const s = useGame();
  const [err, setErr] = useState<string | null>(null);
  const pool = esopEntry(s);
  const granted = s.employees.reduce((a, e) => a + e.options, 0);
  return (
    <div className="post-card" style={{ ['--dc' as string]: 'var(--c-gray-400)' }}>
      <div className="pc-head">
        <span className="pc-dot" />
        <b className="iv2-help" title="ESOP 풀을 만들면 모든 주주가 같은 비율로 조금씩 줄지만, 핵심 직원에게 스톡옵션을 줘 오래 함께할 수 있습니다. 옵션은 직원 관리에서 줍니다(2년 20% → 3년 40% → 4년 80% → 5년 100%).">
          직원 몫(ESOP)
        </b>
      </div>
      {pool ? (
        <div className="pc-stats">
          <span>
            풀 <b>{pool.shares.toLocaleString('ko-KR')}주</b>
          </span>
          <span>
            준 몫 <b>{granted.toLocaleString('ko-KR')}주</b>
          </span>
          <span>
            남음 <b>{esopFree(s).toLocaleString('ko-KR')}주</b>
          </span>
        </div>
      ) : (
        <div className="pc-foot">
          <span>아직 직원 몫이 없습니다.</span>
        </div>
      )}
      <div className="row">
        {[0.05, 0.1].map((p) => (
          <button key={p} className="btn small ghost" data-testid={`esop-${p * 100}`} onClick={() => setErr(act((g) => topUpEsop(g, p)) ?? null)}>
            {pool ? '늘리기' : '만들기'} {p * 100}%
          </button>
        ))}
      </div>
      {err && <div className="err">{err}</div>}
    </div>
  );
}

// 투자사 대화 아래 상태 줄(A-152): 메신저 투자사 채널의 입력창 자리. 라운드 · 이 투자사 상태 · 관심 · 보낸 레터, 다음 할 일 한 줄
export function InvestorBar({ investorId, onPeek, onOpenInvest }: { investorId: string; onPeek: () => void; onOpenInvest: () => void }) {
  const s = useGame();
  const r = activeRound(s);
  const inv = investor(investorId);
  const t = r?.letters[investorId];
  const st = r ? invStatus(r, investorId) : null;
  const letters = DATA.funding.letters;
  return (
    <div className="mg-box inv-bar" data-testid="investor-bar">
      <div className="mg-box-head">
        <b>{inv.name}</b>
        <span className="chip">{inv.kind}</span>
        {st?.text && <span className={`chip ${st.tone}`}>{st.text}</span>}
        <span className="grow" />
        {r && (
          <span className="inv-bar-round">
            {stage(r.stage).name} 라운드 · {r.status === 'offer' ? '제안서 도착' : `마감 ${Math.max(0, r.endDay - s.day)}일 남음`}
          </span>
        )}
      </div>
      {r?.status === 'open' && (
        <div className="inv-bar-stats">
          <div className="emp-bar">
            <span>관심</span>
            <div className="meter">
              <div style={{ width: `${t?.interest ?? 0}%` }} />
            </div>
            <b>{t?.interest ?? 0}</b>
          </div>
          <div className="inv-bar-letters" title="보낸 레터">
            {letters.map((l) => (
              <span key={l.id} className={t?.sent.includes(l.id) ? 'on' : ''}>
                {t?.sent.includes(l.id) && <PxIcon id="check" size={11} />}
                {l.name}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="inv-bar-foot">
        <span className="inv-bar-next">{investorNextStep(s, r ?? null, investorId)}</span>
        <button className="btn small ghost" data-testid="invest-peek-btn" onClick={onPeek}>
          투자 현황
        </button>
        <button className="btn small" data-testid="invest-bar-open" onClick={onOpenInvest}>
          {r?.status === 'open' ? '투자 창에서 레터 보내기' : '투자 창 열기'}
        </button>
      </div>
    </div>
  );
}

// 이 투자사와 다음에 할 일 한 문장(존댓말 보고체)
function investorNextStep(s: GameState, r: Round | null, investorId: string): string {
  const t = r?.letters[investorId];
  // TODO(human)
  return '';
}

// 투자 요약 팝업(A-124): 메신저에서 "투자 메뉴 열기"를 누르면 창을 바꾸지 않고 지금 라운드와 이 투자사 상태만 간단히 보여 줍니다.
export function InvestPeek({ investorId, onOpenFull, onClose }: { investorId?: string; onOpenFull: () => void; onClose: () => void }) {
  const s = useGame();
  const r = activeRound(s);
  const inv = investorId ? DATA.investors.investors.find((i) => i.id === investorId) : undefined;
  const t = r && inv ? r.letters[inv.id] : undefined;
  const st = r && inv ? invStatus(r, inv.id) : null;
  const waiting = r?.status === 'open' ? pendingDecision(r) : undefined;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal inv-peek" data-testid="invest-peek" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <b className="grow">투자 현황</b>
          <button className="app-x" onClick={onClose} title="닫기">
            ✕
          </button>
        </div>
        {!r ? (
          <div className="inv-hint">진행 중인 투자 라운드가 없습니다. 투자 메뉴에서 라운드를 열면 투자사에 레터를 보낼 수 있습니다.</div>
        ) : (
          <div className="inv-peek-box">
            <div className="fb-row">
              <span>라운드</span>
              <b>
                {stage(r.stage).name} · {r.status === 'offer' ? '제안서 도착' : `마감 ${Math.max(0, r.endDay - s.day)}일 남음`}
              </b>
            </div>
            <div className="fb-row">
              <span>리드 투자사</span>
              <b>{r.leadId ? investor(r.leadId).name : waiting ? `${investor(waiting.investorId).name} 답 기다리는 중` : '아직 없음'}</b>
            </div>
            <div className="fb-row">
              <span>대화 중인 투자사</span>
              <b>{Object.values(r.letters).filter((x) => x.sent.length).length}곳</b>
            </div>
          </div>
        )}
        {inv && (
          <div className="inv-peek-box">
            <div className="fb-row">
              <span>{inv.name}</span>
              <b>{st?.text ? <span className={`chip ${st.tone}`}>{st.text}</span> : '아직 레터를 보내지 않음'}</b>
            </div>
            {r?.status === 'open' && (
              <div className="fb-row">
                <span>관심</span>
                <b>{t?.interest ?? 0}</b>
              </div>
            )}
          </div>
        )}
        <div className="row">
          <div className="grow" />
          <button className="btn small ghost" onClick={onClose}>
            닫기
          </button>
          <button className="btn small" data-testid="invest-peek-open" onClick={onOpenFull}>
            투자 창 열기
          </button>
        </div>
      </div>
    </div>
  );
}
