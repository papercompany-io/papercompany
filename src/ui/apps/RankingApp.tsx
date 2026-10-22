// 시장 랭킹 창(A-120): 오른쪽 위 순위 카드를 누르면 열립니다. 전체·시장별 고객 수 순위와 우리 위치.
import { useState } from 'react';
import { industry, market, MARKET_IDS } from '../../core/data';
import { marketRanking, myRank, overallRanking, type RankRow } from '../../core/ranking';
import { hasMvp } from '../../core/product';
import { useGame } from '../store';
import { Tabs } from '../common';
import { PxIcon } from '../icons';
import type { MarketId } from '../../core/types';
import './apps.css';

type Tab = 'all' | MarketId;

const n = (v: number) => Math.round(v).toLocaleString('ko-KR');

export function RankingApp() {
  const s = useGame();
  const [tab, setTab] = useState<Tab>('all');
  const ind = industry(s.company.industry);
  const rows = tab === 'all' ? overallRanking(s) : marketRanking(s, tab);
  const me = myRank(rows);
  const top = rows[0]?.users ?? 0;
  const launched = MARKET_IDS.filter((m) => s.markets[m].launched);
  return (
    <div className="col rk">
      <div className="emp-top">
        <div className="hf-sum">
          <span>우리 순위</span>
          <b>{me ? `${me.rank}위 / ${rows.length}곳` : '순위 없음'}</b>
        </div>
        <div className="hf-sum">
          <span>우리 {ind.unit}</span>
          <b>{me ? n(me.users) : 0}</b>
        </div>
        <div className="hf-sum">
          <span>고객 비중</span>
          <b>{me ? `${(me.share * 100).toFixed(1)}%` : '-'}</b>
        </div>
        <div className="hf-sum">
          <span>1위와 차이</span>
          <b>{me && me.rank > 1 ? `${n(top - me.users)}` : me ? '1위' : '-'}</b>
        </div>
      </div>
      <Tabs<Tab>
        tabs={[{ id: 'all', label: '전체' }, ...MARKET_IDS.map((m) => ({ id: m as Tab, label: `${market(m).flag} ${market(m).name}${s.markets[m].launched && marketRank(s, m) ? ` ${marketRank(s, m)}위` : ''}` }))]}
        value={tab}
        onChange={setTab}
      />
      {!hasMvp(s) && <div className="ew-note">서비스를 출시하면 우리 이름이 순위표에 오릅니다. 지금은 시장에 있는 회사만 보입니다.</div>}
      {hasMvp(s) && tab !== 'all' && !s.markets[tab].launched && <div className="ew-note">아직 이 시장에 진출하지 않았습니다. 시장 창에서 진출하면 순위가 매겨집니다.</div>}
      {tab === 'all' && launched.length > 1 && <div className="ew-note">진출한 모든 시장의 {ind.unit}를 합친 순위입니다.</div>}
      {rows.length === 0 ? <div className="empty-note">아직 순위에 오른 회사가 없습니다.</div> : <Table rows={rows} top={top} unit={ind.unit} />}
    </div>
  );
}

function marketRank(s: Parameters<typeof marketRanking>[0], m: MarketId): number | null {
  return myRank(marketRanking(s, m))?.rank ?? null;
}

function Table({ rows, top, unit }: { rows: RankRow[]; top: number; unit: string }) {
  return (
    <div className="rk-table" data-testid="ranking-table">
      <div className="rk-row rk-headrow">
        <span>순위</span>
        <span>회사</span>
        <span className="rk-bar-col">{unit} 많은 순서</span>
        <span className="rk-num">{unit}</span>
        <span className="rk-num">비중</span>
      </div>
      {rows.map((r) => (
        <div key={r.id} className={`rk-row ${r.me ? 'me' : ''}`} data-testid={`rank-${r.id}`}>
          <span className={`rk-pos ${r.rank <= 3 ? `top${r.rank}` : ''}`}>{r.rank <= 3 ? <PxIcon id="trophy" size={14} /> : null}{r.rank}</span>
          <span className="rk-name">
            {r.name}
            {r.me && <em className="chip">우리</em>}
          </span>
          <span className="rk-bar-col">
            <i className="rk-bar" style={{ width: `${top > 0 ? Math.max(2, (r.users / top) * 100) : 0}%` }} />
          </span>
          <span className="rk-num">{n(r.users)}</span>
          <span className="rk-num">{(r.share * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}
