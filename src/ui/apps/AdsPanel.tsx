// 시장 메뉴의 광고 탭(A-116): 왼쪽 회색 판 = 채널별 예산(궁합·지침 표시), 오른쪽 = 지난 30일 성과 · 캠페인
// 효과량은 미리 보여 주지 않고, 써 본 결과(성과·캠페인 결과)로 배우게 합니다.
// A-158: 마케팅팀 일손(동시에 돌리는 채널 수)·맡기기, 캠페인 준비 기간, 규모가 커지면 열리는 채널·캠페인 예고
// 화면(A-206): 위 요약 세 칸(광고비·채널·데려온 고객), 돌리는 채널만 카드(30일 성과 한 줄), 안 돌리는 채널은 "채널 추가" 창, 성과는 채널별 막대
// 화면(A-176): 업무·커리어와 같은 톤 — 가운데 큰 광고비, 알약 시장·운영 고르기, 채널은 격자 카드, 성과는 납작한 줄, 캠페인은 카드, 열리지 않은 광고는 자물쇠 타일. 긴 설명은 마우스를 올리면(title)
import { useState } from 'react';
import { DATA, industry, market, MARKET_IDS } from '../../core/data';
import {
  activeCampaigns,
  adMix,
  adSlots,
  campaignBlock,
  campaignCost,
  campaignDef,
  campaignVerdict,
  channelsFor,
  fitLabel,
  lockedByScale,
  marketers,
  prepDays,
  runningChannels,
  seasonMult,
  seasonName,
  setChannelBudget,
  startCampaign,
} from '../../core/ads';
import { countShort, wonShort } from '../../core/format';
import { unitWord } from '../../core/market';
import { act, useGame } from '../store';
import { PxIcon } from '../icons';
import { play } from '../sound';
import type { MarketId } from '../../core/types';
import './apps.css';

const AD = DATA.ads;

export function Ads({ setMsg }: { setMsg: (m: string | null) => void }) {
  const s = useGame();
  const launched = MARKET_IDS.filter((m) => s.markets[m].launched);
  const [sel, setSel] = useState<MarketId>(launched[0] ?? 'kr');
  const [adding, setAdding] = useState(false);
  if (!launched.length) return <div className="empty-note">출시하면 광고를 할 수 있습니다.</div>;
  const m = s.markets[sel].launched ? sel : launched[0];
  const ms = s.markets[m];
  const mix = adMix(s, m);
  const total = Object.values(mix).reduce((a, v) => a + v, 0);
  const max = Math.max(2e7, Math.min(2e10, Math.ceil(s.cash / 6 / 1e6) * 1e6));
  const step = Math.max(1e5, Math.round(Math.max(2e7, s.cash / 6) / 200 / 1e5) * 1e5);
  const season = seasonName(s);
  const sm = seasonMult(s);
  const run = new Set(runningChannels(s, m));
  const slots = adSlots(s);
  const mk = marketers(s);
  const onCount = Object.values(mix).filter((x) => x > 0).length;
  const locked = lockedByScale(s);
  const st = ms.adStats ?? {};
  const totSpent = Object.values(st).reduce((a, x) => a + (x?.spent ?? 0) * 30, 0);
  const totGot = Object.values(st).reduce((a, x) => a + (x?.got ?? 0) * 30, 0);
  const chans = channelsFor(s);
  const live = chans.filter((c) => (mix[c.id] ?? 0) > 0);
  const idle = chans.filter((c) => !((mix[c.id] ?? 0) > 0));
  const startAmount = Math.min(max, Math.max(step, 1e6));
  return (
    <div className="ad2">
      <div className="wk-stats ad2-sum" data-testid="ad-summary">
        <div className="wk-stat">
          <span>한 달 광고비</span>
          <b>{wonShort(total)}</b>
          <em>{season ? `${season} · 광고가 ${sm >= 1 ? '더 잘' : '덜'} 통합니다` : '평소 시기'}</em>
        </div>
        <div className="wk-stat" title="광고 채널 하나를 돌리려면 일손이 하나 필요합니다. 대표 혼자서는 한 채널, 마케터 한 명마다 한 채널씩 더 돌립니다. 일손보다 많은 채널에 예산을 넣으면 예산이 작은 채널부터 쉽니다.">
          <span>돌리는 광고</span>
          <b>
            {Math.min(onCount, slots)}/{slots}개
          </b>
          <em>마케터 {mk}명</em>
        </div>
        <div className="wk-stat">
          <span>30일 데려온 {industry(s.company.industry).unit}</span>
          <b>{totGot >= 10 ? countShort(totGot) : totGot.toFixed(1)}</b>
          <em>{totGot >= 0.5 ? `한 명당 ${wonShort(totSpent / totGot)}` : '아직 쌓이는 중'}</em>
        </div>
      </div>
      {launched.length > 1 && (
        <div className="ad2-pills">
          {launched.map((x) => (
            <button key={x} className={m === x ? 'on' : ''} onClick={() => setSel(x)}>
              {market(x).name}
            </button>
          ))}
        </div>
      )}
      <div className="ad-crew ad2-pills" data-testid="ad-crew">
        {mk > 0 ? (
          <>
            <button className={s.company.adAuto ? '' : 'on'} data-testid="ad-auto-off" onClick={() => act((g) => (g.company.adAuto = false))}>
              직접 정하기
            </button>
            <button
              className={s.company.adAuto ? 'on' : ''}
              data-testid="ad-auto-on"
              title="매달 초 마케팅팀이 성과가 나쁜 채널 예산을 좋은 채널로 옮기고, 지친 소재를 새로 만듭니다. 한 달 광고비 합계는 그대로입니다. 한 일은 마케팅팀 채널로 보고합니다."
              onClick={() => act((g) => (g.company.adAuto = true))}
            >
              마케팅팀에 맡기기
            </button>
          </>
        ) : (
          <span className="ad2-note">마케터를 뽑으면 채널을 더 돌리고 운영을 맡길 수 있습니다</span>
        )}
      </div>
      <h3
        className="ad2-sect"
        title="채널마다 성격이 다릅니다. 바로 데려오는 채널, 널리 알리는 채널이 있고, 우리 사업과 잘 맞는 채널이 있습니다. 한 채널에 몰아 넣으면 효과가 점점 줄고, 같은 광고를 오래 돌리면 지칩니다. 나눠 넣고, 성과를 보고 고치세요."
      >
        돌리는 광고
      </h3>
      {live.length === 0 && (
        <div className="ad2-empty">
          <PxIcon id="chart" size={28} />
          <span>돌리는 광고가 없습니다. 아래에서 광고를 시작하면 고객이 들어옵니다</span>
        </div>
      )}
      <div className="ad2-grid">
        {live.map((c) => {
          const fit = fitLabel(s, c.id);
          const fat = ms.adFatigue?.[c.id] ?? 0;
          const v = mix[c.id] ?? 0;
          const resting = !run.has(c.id);
          const x = st[c.id];
          const got = (x?.got ?? 0) * 30;
          const spent = (x?.spent ?? 0) * 30;
          return (
            <div key={c.id} className={`ad2-ch on ${resting ? 'rest' : ''}`}>
              <div className="ad2-ch-head">
                <b title={c.desc}>{c.name}</b>
                <span className="ad2-v">{wonShort(v)}</span>
              </div>
              <div className="ad2-tags">
                {fit.text !== '보통' && <span className={`chip ${fit.tone}`}>{fit.text}</span>}
                {fat >= 0.3 && <span className="chip amber">{fat >= 0.6 ? '많이 지침' : '조금 지침'}</span>}
                {resting && <span className="chip red">쉼 · 일손 모자람</span>}
              </div>
              <div className="ad2-mini" title="최근 30일로 바꾼 값입니다">
                {got >= 0.5 ? (
                  <>
                    30일 <b>{got >= 10 ? Math.round(got).toLocaleString('ko-KR') : got.toFixed(1)}</b>
                    {unitWord(s)} · 한 명당 <b>{wonShort(spent / got)}</b>
                  </>
                ) : (
                  '성과가 쌓이는 중'
                )}
              </div>
              <input
                type="range"
                className="inv-range"
                data-testid={`adch-${m}-${c.id}`}
                min={0}
                max={max}
                step={step}
                value={v}
                onChange={(e) => setMsg(act((g) => setChannelBudget(g, m, c.id, Number(e.target.value))) ?? null)}
              />
            </div>
          );
        })}
      </div>
      {idle.length > 0 && (
        <button className="fm-open" data-testid="ad-add-open" onClick={() => setAdding(true)}>
          <PxIcon id="star" size={16} />
          <b>새 광고 시작하기</b>
          <em>아직 안 쓰는 광고 {idle.length}가지 · 눌러서 골라 보기{onCount >= slots ? ' (일손이 모자라 하나를 꺼야 시작할 수 있습니다)' : ''}</em>
        </button>
      )}
      {adding && (
        <div className="modal-bg" onClick={() => setAdding(false)}>
          <div className="modal fmod" data-testid="ad-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fmod-head">
              <b>어디에 광고할까요</b>
              <span className="tiny muted">
                지금 {Math.min(onCount, slots)}개 / 동시에 {slots}개까지
              </span>
              <span className="grow" />
              <button className="btn small ghost" onClick={() => setAdding(false)}>
                닫기
              </button>
            </div>
            <div className="fmod-body">
              {idle.map((c) => {
                const fit = fitLabel(s, c.id);
                const noHands = onCount >= slots;
                return (
                  <div key={c.id} className={`fm-row ad2-pick ${noHands ? 'locked' : ''}`}>
                    <div className="fm-main">
                      <b>
                        {c.name} {fit.text !== '보통' && <span className={`chip ${fit.tone}`}>{fit.text}</span>}
                      </b>
                      <span>{c.desc}</span>
                    </div>
                    <div className="fm-side">
                      <button
                        className="btn small"
                        data-testid={`ad-start-${c.id}`}
                        disabled={noHands}
                        title={noHands ? `지금은 채널 ${slots}개까지 돌릴 수 있습니다` : `한 달 ${wonShort(startAmount)}로 시작합니다. 예산은 나중에 고칩니다`}
                        onClick={() => {
                          const e = act((g) => setChannelBudget(g, m, c.id, startAmount)) ?? null;
                          setMsg(e);
                          if (!e) setAdding(false);
                        }}
                      >
                        광고 시작
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <h3 className="ad2-sect">지난 30일 성과</h3>
      <AdStats m={m} />
      <h3 className="ad2-sect">캠페인</h3>
      <Campaigns m={m} setMsg={setMsg} />
      {locked.length > 0 && (
        <>
          <h3 className="ad2-sect">더 크면 열리는 광고</h3>
          <div className="ad2-locked" data-testid="ad-locked">
            {locked.slice(0, 4).map((x) => (
              <div key={x.name} className="ad2-lock">
                <PxIcon id="lock" size={20} />
                <b>{x.name}</b>
                <span>
                  {x.kind === 'campaign' ? '캠페인 · ' : ''}
                  {industry(s.company.industry).unit} {countShort(x.need)}
                  {unitWord(s)}부터
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// 채널별 지난 30일: 쓴 돈 · 데려온 고객 · 한 명당 값 · 알린 정도
function AdStats({ m }: { m: MarketId }) {
  const s = useGame();
  const unit = industry(s.company.industry).unit;
  const st = s.markets[m].adStats ?? {};
  const rows = AD.channels.filter((c) => (st[c.id]?.spent ?? 0) * 30 >= 1e4 || (st[c.id]?.got ?? 0) * 30 >= 0.5);
  if (!rows.length)
    return (
      <div className="ad2-empty">
        <PxIcon id="chart" size={28} />
        <span>광고를 돌리면 며칠 뒤부터 성과가 쌓입니다</span>
      </div>
    );
  const maxGot = Math.max(0.01, ...rows.map((c) => st[c.id]!.got * 30));
  const best = rows.map((c) => ({ id: c.id, per: (st[c.id]!.spent * 30) / Math.max(0.01, st[c.id]!.got * 30) })).sort((a, b) => a.per - b.per)[0]?.id;
  return (
    <div className="ad-stats ad2-stats ad2-perf">
      {rows.map((c) => {
        const x = st[c.id]!;
        const spent = x.spent * 30;
        const got = x.got * 30;
        return (
          <div key={c.id} className="ad2-perf-row">
            <div className="ad2-perf-top">
              <b>{c.name}</b>
              {c.id === best && rows.length > 1 && got >= 1 && <em className="chip green">가장 싸게 데려옴</em>}
              <span className="grow" />
              <span className="ad2-perf-per" title="한 명을 데려오는 데 든 돈">
                {got >= 0.5 ? `한 명당 ${wonShort(spent / got)}` : '-'}
              </span>
            </div>
            <div className="ad2-perf-bar" title={`쓴 돈 ${wonShort(spent)} · 알린 정도 +${(x.aware * 30 * 100).toFixed(2)}%p`}>
              <i style={{ width: `${Math.max(2, (got / maxGot) * 100)}%` }} />
              <span>
                {unit} {got >= 10 ? Math.round(got).toLocaleString('ko-KR') : got.toFixed(1)}
              </span>
            </div>
            <div className="ad2-perf-sub">
              쓴 돈 {wonShort(spent)} · 알린 정도 +{(x.aware * 30 * 100).toFixed(2)}%p
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Campaigns({ m, setMsg }: { m: MarketId; setMsg: (m: string | null) => void }) {
  const s = useGame();
  const [tone, setTone] = useState<Record<string, string>>({});
  const unit = industry(s.company.industry).unit;
  const running = activeCampaigns(s, m);
  const past = (s.campaigns ?? [])
    .filter((c) => c.done && c.market === m && (campaignDef(c.def)?.power ?? 0) > 0)
    .slice(-3)
    .reverse();
  return (
    <>
      <div className="ad2-grid fit">
        {running.map((c) => {
          const def = campaignDef(c.def)!;
          // 준비 중(A-158)이면 준비 기간 막대, 시작했으면 진행 기간 막대
          const prep = c.prepUntil !== undefined && s.day < c.prepUntil;
          const from = prep ? c.startDay : (c.prepUntil ?? c.startDay);
          const to = prep ? c.prepUntil! : c.endDay;
          const frac = Math.min(1, (s.day - from) / Math.max(1, to - from));
          return (
            <div key={c.id} className={`post-card ad2-cp running ${prep ? 'prep' : ''}`} style={{ ['--dc' as string]: prep ? 'var(--caution)' : 'var(--accent)' }}>
              <div className="pc-head">
                <span className="pc-dot" />
                <b>{def.name}</b>
                {prep ? <span className="chip amber">준비 중</span> : <span className="chip blue">진행 중</span>}
                <span className="pc-hired">{prep ? `${Math.max(0, to - s.day)}일 뒤 시작` : `D-${Math.max(0, c.endDay - s.day)}`}</span>
              </div>
              <div className="pc-time">
                <i style={{ width: `${frac * 100}%` }} />
              </div>
              {def.power > 0 ? (
                <div className="pc-stats">
                  <span>
                    지금까지 {unit} <b>{Math.round(c.got).toLocaleString('ko-KR')}</b>
                  </span>
                  <span>
                    알린 정도 <b>+{(c.aware * 100).toFixed(1)}%p</b>
                  </span>
                </div>
              ) : (
                <div className="tiny muted">{def.desc}</div>
              )}
            </div>
          );
        })}
        {AD.campaigns.map((def) => {
          if (running.some((c) => c.def === def.id)) return null;
          const block = campaignBlock(s, def.id, m);
          const isRefresh = !!(def as { refresh?: boolean }).refresh;
          if (block && (block.includes('한 번만') || block.includes('단계') || block.startsWith('규모:') || block.includes('맞지 않는'))) return null;
          const t = tone[def.id] ?? AD.tones[0].id;
          const prep = prepDays(s, def);
          return (
            <div key={def.id} className="post-card ad-cp ad2-cp">
              <div className="pc-head">
                <b>{def.name}</b>
                <span className="pc-hired">{wonShort(campaignCost(s, def, m))}</span>
              </div>
              <div className="inv-desc">
                {def.desc}
                {def.days > 1 ? ` ${def.days}일 동안.` : ''}
                {prep > 0 && (
                  <span className="tiny muted">
                    {' '}
                    준비 {prep}일{marketers(s) ? '' : '(마케터가 있으면 빨라짐)'}.
                  </span>
                )}
              </div>
              {!isRefresh && def.power > 0 && (
                <>
                  <div className="ad2-pills ad-tones" title="광고 문구">
                    {AD.tones.map((x) => (
                      <button key={x.id} className={t === x.id ? 'on' : ''} onClick={() => setTone({ ...tone, [def.id]: x.id })}>
                        {x.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="row">
                {block && <span className="tiny muted grow">{block}</span>}
                <span className="grow" />
                <button
                  className="btn small"
                  data-testid={`campaign-${def.id}`}
                  disabled={!!block}
                  onClick={() => {
                    const e = act((g) => startCampaign(g, def.id, m, t)) ?? null;
                    setMsg(e);
                    if (!e) play('success');
                  }}
                >
                  {isRefresh ? '바꾸기' : '시작'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {past.length > 0 && (
        <>
          <h3 className="ad2-sect small">지난 캠페인</h3>
          {past.map((c) => {
            const v = campaignVerdict(c);
            return (
              <div key={c.id} className="post-card closed" style={{ ['--dc' as string]: v === 'hit' ? 'var(--positive)' : v === 'flop' ? 'var(--negative)' : 'var(--c-gray-400)' }}>
                <div className="pc-head">
                  <span className="pc-dot" />
                  <b>{campaignDef(c.def)!.name}</b>
                  <span className={`chip ${v === 'hit' ? 'green' : v === 'flop' ? 'red' : ''}`}>{v === 'hit' ? '대박' : v === 'flop' ? '저조' : '보통'}</span>
                  {c.risk && <span className="chip red">논란</span>}
                </div>
                <div className="pc-stats">
                  <span>
                    {unit} <b>{Math.round(c.got).toLocaleString('ko-KR')}</b>
                  </span>
                  <span>
                    알린 정도 <b>+{(c.aware * 100).toFixed(1)}%p</b>
                  </span>
                  <span>
                    문구 <b>{AD.tones.find((x) => x.id === c.tone)?.name}</b>
                  </span>
                </div>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
