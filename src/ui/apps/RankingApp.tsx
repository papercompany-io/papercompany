// 시장 랭킹 창(A-120, A-161, A-162): 오른쪽 위 순위 카드를 누르면 열립니다. 전체·시장별 고객 수 순위(시장마다 30곳 안팎)와 우리 위치, 회사마다 기업가치·주가.
// 짜임(A-162): 리그 화면처럼 위 3곳은 포디움(받침대 위 픽셀 1·2·3등), 4등부터는 둥근 카드 목록. 데이터·규칙은 그대로이고 겉모습만 바뀝니다.
import { useState } from 'react';
import { industry, market, MARKET_IDS } from '../../core/data';
import { myRank, rankings, type Quote, type RankRow } from '../../core/ranking';
import { hasMvp } from '../../core/product';
import { countShort, wonCompact, wonShort } from '../../core/format';
import { useGame } from '../store';
import { Tabs } from '../common';
import { PixelRank, RankAvatar } from './rankArt';
import crownUrl from '../../assets/rank/crown.png';
import type { MarketId, ServiceInfo } from '../../core/types';
import './apps.css';

type Tab = 'all' | MarketId;
type Logo = ServiceInfo['logo'] | undefined;

const SHOW = 30; // 보이는 줄(포디움 3곳 포함). 우리가 그 밖이면 맨 아래에 따로 붙입니다.

const n = (v: number) => Math.round(v).toLocaleString('ko-KR');

export function RankingApp() {
  const s = useGame();
  const [tab, setTab] = useState<Tab>('all');
  const ind = industry(s.company.industry);
  const all = rankings(s);
  const rows = tab === 'all' ? all.overall : all.markets[tab];
  const me = myRank(rows);
  const valueRank = me ? rows.filter((r) => r.value > me.value).length + 1 : null;
  const head = headOf(rows, ind.unit, valueRank, !hasMvp(s) ? '서비스를 출시하면 순위표에 오릅니다.' : tab !== 'all' && !s.markets[tab].launched ? '시장 창에서 진출하면 순위가 매겨집니다.' : '');
  return (
    <div className="col rk">
      <div className="rk-head">
        <h2 className="rk-big">{head.big}</h2>
        {head.lead && <p className="rk-lead">{head.lead}</p>}
      </div>
      <Tabs<Tab>
        tabs={[{ id: 'all', label: '전체' }, ...MARKET_IDS.map((m) => ({ id: m as Tab, label: `${market(m).flag} ${market(m).name}${s.markets[m].launched && myRank(all.markets[m]) ? ` ${myRank(all.markets[m])!.rank}위` : ''}` }))]}
        value={tab}
        onChange={setTab}
      />
      {rows.length === 0 ? <div className="empty-note">아직 순위에 오른 회사가 없습니다.</div> : <Board rows={rows} unit={ind.unit} here={tab === 'all' ? 'kr' : tab} logo={s.company.service?.logo} />}
    </div>
  );
}

// 맨 위 큰 문장: 우리가 몇 위인지. 아래 작은 글은 앞 회사·1위와 차이, 기업가치 순위(예전 위쪽 요약 칸 다섯 개를 글로)
function headOf(rows: RankRow[], unit: string, valueRank: number | null, notYet: string): { big: string; lead: string } {
  const me = myRank(rows);
  if (!me) return { big: '아직 순위에 없습니다', lead: notYet };
  const lead: string[] = [];
  if (me.rank > 1) lead.push(`바로 앞 회사와 ${unit} ${countShort(rows[me.rank - 2].users - me.users)} 차이`, `1위와 ${countShort(rows[0].users - me.users)} 차이`);
  else if (rows.length > 1) lead.push(`2위와 ${unit} ${countShort(me.users - rows[1].users)} 차이`);
  if (valueRank) lead.push(`기업가치는 ${valueRank}위`);
  return { big: me.rank === 1 ? '우리가 1위입니다' : `우리는 ${me.rank}위입니다`, lead: lead.join(' · ') };
}

function Board({ rows, unit, here, logo }: { rows: RankRow[]; unit: string; here: MarketId; logo: Logo }) {
  const me = myRank(rows);
  const pinned = me && me.rank > SHOW ? me : null;
  const rest = rows.slice(3, SHOW);
  const item = (r: RankRow) => <Item key={r.id} r={r} unit={unit} here={here} logo={logo} />;
  return (
    <div className="rk-board" data-testid="ranking-table">
      <div className="rk-stage">
        <div className="rk-podium">
          {([1, 2, 3] as const).map((k) => (
            <Slot key={k} rank={k} r={rows[k - 1]} unit={unit} logo={logo} />
          ))}
        </div>
      </div>
      {(rest.length > 0 || pinned) && (
        <div className="rk-card">
          {rest.map(item)}
          {pinned && (
            <>
              <div className="rk-more" aria-hidden>
                ⋯
              </div>
              {item(pinned)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function detail(r: RankRow): string {
  return `${r.name}\n기업가치 ${wonShort(r.value)}${r.quote ? `\n주가 ${n(r.quote.price)}원` : '\n비상장'}`;
}

function Slot({ rank, r, unit, logo }: { rank: 1 | 2 | 3; r: RankRow | undefined; unit: string; logo: Logo }) {
  return (
    <div className={`rk-slot r${rank} ${r?.me ? 'me' : ''}`} data-testid={r ? `rank-${r.id}` : undefined}>
      <div className="rk-top" title={r ? detail(r) : undefined}>
        <span className="rk-avwrap">
          {rank === 1 && r && <img className="rk-crown" src={crownUrl} alt="" draggable={false} />}
          {r ? <RankAvatar id={r.id} name={r.name} logo={r.me ? logo : undefined} /> : <span className="rk-av ghost" />}
        </span>
        <span className="rk-pnm">
          <b>{r ? r.name : '-'}</b>
          {r?.me && <em className="chip blue">우리</em>}
        </span>
        <span className="rk-pscore">{r ? `${countShort(r.users)} ${unit}` : ' '}</span>
        <span className="rk-pval">
          {r ? (
            <>
              <span className="rk-lbl">기업가치 </span>
              {wonCompact(r.value)}
            </>
          ) : (
            ' '
          )}
        </span>
      </div>
      <div className="rk-ped-wrap">
        <div className="rk-ped">
          <PixelRank rank={rank} />
        </div>
      </div>
    </div>
  );
}

function Item({ r, unit, here, logo }: { r: RankRow; unit: string; here: MarketId; logo: Logo }) {
  return (
    <div className={`rk-item ${r.me ? 'me' : ''}`} data-testid={`rank-${r.id}`} title={detail(r)}>
      <span className="rk-no">{r.rank}</span>
      <RankAvatar id={r.id} name={r.name} logo={r.me ? logo : undefined} size={36} />
      <span className="rk-who">
        <span className="rk-nm">
          <b>{r.name}</b>
          {r.me && <em className="chip blue">우리</em>}
          {!r.me && r.home !== here && (
            <em className="rk-home" title={`본사: ${market(r.home).name}`}>
              {market(r.home).flag}
            </em>
          )}
        </span>
        <span className="rk-meta">
          <span>기업가치 {wonCompact(r.value)}</span>
          <QuoteText q={r.quote} />
        </span>
      </span>
      <span className="rk-pt" title={`${n(r.users)} ${unit}`}>
        <b>
          {countShort(r.users)} <i>{unit}</i>
        </b>
        <small>점유율 {(r.share * 100).toFixed(1)}%</small>
      </span>
    </div>
  );
}

function QuoteText({ q }: { q: Quote | null }) {
  if (!q) return <span className="rk-quote">비상장</span>;
  const pct = `${Math.abs(q.change * 100).toFixed(2)}%`;
  const move = q.change >= 0.00005 ? { cls: 'fin-good', text: `▲ ${pct}` } : q.change <= -0.00005 ? { cls: 'fin-bad', text: `▼ ${pct}` } : { cls: '', text: '0.00%' };
  return (
    <span className="rk-quote">
      주가 {n(q.price)}원 <span className={move.cls}>{move.text}</span>
    </span>
  );
}
