// 시장·광고 메뉴의 광고 탭(A-116): 왼쪽 회색 판 = 채널별 예산(궁합·지침 표시), 오른쪽 = 지난 30일 성과 · 캠페인
// 효과량은 미리 보여 주지 않고, 써 본 결과(성과·캠페인 결과)로 배우게 합니다.
import { useState } from 'react';
import { DATA, industry, market, MARKET_IDS } from '../../core/data';
import {
  activeCampaigns,
  adMix,
  campaignBlock,
  campaignCost,
  campaignDef,
  campaignVerdict,
  channelsFor,
  fitLabel,
  seasonMult,
  seasonName,
  setChannelBudget,
  startCampaign,
} from '../../core/ads';
import { wonShort } from '../../core/format';
import { act, useGame } from '../store';
import { Help } from '../common';
import { play } from '../sound';
import type { MarketId } from '../../core/types';
import './apps.css';

const AD = DATA.ads;

export function Ads({ setMsg }: { setMsg: (m: string | null) => void }) {
  const s = useGame();
  const launched = MARKET_IDS.filter((m) => s.markets[m].launched);
  const [sel, setSel] = useState<MarketId>(launched[0] ?? 'kr');
  if (!launched.length) return <div className="empty-note">출시하면 광고를 할 수 있습니다.</div>;
  const m = s.markets[sel].launched ? sel : launched[0];
  const ms = s.markets[m];
  const mix = adMix(s, m);
  const total = Object.values(mix).reduce((a, v) => a + v, 0);
  const max = Math.max(2e7, Math.min(2e10, Math.ceil(s.cash / 6 / 1e6) * 1e6));
  const step = Math.max(1e5, Math.round(Math.max(2e7, s.cash / 6) / 200 / 1e5) * 1e5);
  const season = seasonName(s);
  const sm = seasonMult(s);
  return (
    <div className="hire-layout">
      <section className="hire-form">
        <div className="hf-title inv-title">
          광고 채널
          <Help text="채널마다 성격이 다릅니다. 바로 데려오는 채널, 널리 알리는 채널이 있고, 우리 사업과 잘 맞는 채널이 있습니다. 한 채널에 몰아 넣으면 효과가 점점 줄고, 같은 광고를 오래 돌리면 지칩니다. 나눠 넣고, 성과를 보고 고치세요." />
        </div>
        {launched.length > 1 && (
          <div className="seg applicant-filter">
            {launched.map((x) => (
              <button key={x} className={m === x ? 'on' : ''} onClick={() => setSel(x)}>
                {market(x).name}
              </button>
            ))}
          </div>
        )}
        {season && (
          <div className={`ad-season ${sm >= 1 ? 'up' : 'down'}`}>
            지금은 <b>{season}</b> — 광고가 {sm >= 1 ? '더 잘' : '덜'} 통합니다.
          </div>
        )}
        <div className="ad-channels">
          {channelsFor(s).map((c) => {
            const fit = fitLabel(s, c.id);
            const fat = ms.adFatigue?.[c.id] ?? 0;
            const v = mix[c.id] ?? 0;
            return (
              <div key={c.id} className={`ad-ch ${v > 0 ? 'on' : ''}`}>
                <div className="ad-ch-head">
                  <b>{c.name}</b>
                  {fit.text !== '보통' && <span className={`chip ${fit.tone}`}>{fit.text}</span>}
                  {fat >= 0.3 && <span className="chip amber">{fat >= 0.6 ? '많이 지침' : '조금 지침'}</span>}
                  <span className="ad-ch-v">{v ? `월 ${wonShort(v)}` : '안 함'}</span>
                </div>
                <div className="ad-ch-desc">{c.desc}</div>
                <input type="range" className="inv-range" data-testid={`adch-${m}-${c.id}`} min={0} max={max} step={step} value={v} onChange={(e) => act((g) => setChannelBudget(g, m, c.id, Number(e.target.value)))} />
              </div>
            );
          })}
        </div>
        <div className="fb-row big">
          <span>한 달 광고비 합계</span>
          <b>{wonShort(total)}</b>
        </div>
      </section>

      <section className="post-list">
        <div className="hf-title">지난 30일 성과</div>
        <AdStats m={m} />
        <div className="hf-title">캠페인</div>
        <Campaigns m={m} setMsg={setMsg} />
      </section>
    </div>
  );
}

// 채널별 지난 30일: 쓴 돈 · 데려온 고객 · 한 명당 값 · 알린 정도
function AdStats({ m }: { m: MarketId }) {
  const s = useGame();
  const unit = industry(s.company.industry).unit;
  const st = s.markets[m].adStats ?? {};
  const rows = AD.channels.filter((c) => (st[c.id]?.spent ?? 0) * 30 >= 1e4 || (st[c.id]?.got ?? 0) * 30 >= 0.5);
  if (!rows.length) return <div className="empty-note">광고를 돌리면 며칠 뒤부터 채널별 성과가 쌓입니다.</div>;
  const best = rows.map((c) => ({ id: c.id, per: (st[c.id]!.spent * 30) / Math.max(0.01, st[c.id]!.got * 30) })).sort((a, b) => a.per - b.per)[0]?.id;
  return (
    <div className="post-card ad-stats">
      <div className="ad-stat-row head">
        <span>채널</span>
        <span>쓴 돈</span>
        <span>데려온 {unit}</span>
        <span>한 명당</span>
        <span>알린 정도</span>
      </div>
      {rows.map((c) => {
        const x = st[c.id]!;
        const spent = x.spent * 30;
        const got = x.got * 30;
        return (
          <div key={c.id} className="ad-stat-row">
            <span>
              {c.name}
              {c.id === best && rows.length > 1 && got >= 1 && <em className="chip green">가장 싸게 데려옴</em>}
            </span>
            <span>{wonShort(spent)}</span>
            <span>{got >= 10 ? Math.round(got).toLocaleString('ko-KR') : got.toFixed(1)}</span>
            <span>{got >= 0.5 ? wonShort(spent / got) : '-'}</span>
            <span>+{(x.aware * 30 * 100).toFixed(2)}%p</span>
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
  const past = (s.campaigns ?? []).filter((c) => c.done && c.market === m && c.def !== 'refresh').slice(-3).reverse();
  return (
    <>
      {running.map((c) => {
        const def = campaignDef(c.def)!;
        const frac = Math.min(1, (s.day - c.startDay) / Math.max(1, c.endDay - c.startDay));
        return (
          <div key={c.id} className="post-card" style={{ ['--dc' as string]: 'var(--accent)' }}>
            <div className="pc-head">
              <span className="pc-dot" />
              <b>{def.name}</b>
              <span className="chip blue">진행 중</span>
              <span className="pc-hired">D-{Math.max(0, c.endDay - s.day)}</span>
            </div>
            <div className="pc-time">
              <i style={{ width: `${frac * 100}%` }} />
            </div>
            <div className="pc-stats">
              <span>
                지금까지 {unit} <b>{Math.round(c.got).toLocaleString('ko-KR')}</b>
              </span>
              <span>
                알린 정도 <b>+{(c.aware * 100).toFixed(1)}%p</b>
              </span>
            </div>
          </div>
        );
      })}
      {AD.campaigns.map((def) => {
        if (running.some((c) => c.def === def.id)) return null;
        const block = campaignBlock(s, def.id, m);
        const isRefresh = !!(def as { refresh?: boolean }).refresh;
        if (block && (block.includes('한 번만') || block.includes('단계'))) return null;
        const t = tone[def.id] ?? AD.tones[0].id;
        return (
          <div key={def.id} className="post-card ad-cp">
            <div className="pc-head">
              <b>{def.name}</b>
              <span className="pc-hired">{wonShort(campaignCost(s, def, m))}</span>
            </div>
            <div className="inv-desc">
              {def.desc}
              {def.days > 1 ? ` ${def.days}일 동안.` : ''}
            </div>
            {!isRefresh && (
              <>
                <div className="hf-label">광고 문구</div>
                <div className="seg ad-tones">
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
      {past.length > 0 && (
        <>
          <div className="hf-label">지난 캠페인</div>
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
