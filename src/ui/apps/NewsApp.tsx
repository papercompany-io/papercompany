// UX-13 페이퍼뉴스: 경제·경쟁사·AI·우리 회사 소식
import { useState } from 'react';
import { formatDate } from '../../core/calendar';
import { useGame } from '../store';
import type { NewsItem } from '../../core/types';
import './apps.css';

const KIND: Record<NewsItem['kind'], string> = { economy: '경제', competitor: '경쟁사', ai: 'AI', company: '우리 회사', market: '시장', public: '증시' };

export function NewsApp() {
  const s = useGame();
  const [f, setF] = useState<NewsItem['kind'] | 'all'>('all');
  const list = [...s.news].reverse().filter((n) => f === 'all' || n.kind === f);
  return (
    <div className="col">
      <div className="row">
        <b style={{ fontFamily: 'var(--pixel)', fontSize: 20 }}>페이퍼뉴스</b>
        <span className="tiny muted">경기: {s.economy.phase === 'boom' ? '호황' : s.economy.phase === 'recession' ? '불황' : '보통'}</span>
        <span className="grow" />
        <div className="seg">
          <button className={f === 'all' ? 'on' : ''} onClick={() => setF('all')}>
            전체
          </button>
          {(Object.keys(KIND) as NewsItem['kind'][]).map((k) => (
            <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>
              {KIND[k]}
            </button>
          ))}
        </div>
      </div>
      <div>
        {list.map((n, i) => (
          <div key={i} className="news-item">
            <span className={`news-kind ${n.kind}`}>{KIND[n.kind]}</span>
            <span className="grow">{n.text}</span>
            <span className="tiny muted">{formatDate(n.day)}</span>
          </div>
        ))}
        {list.length === 0 && <div className="muted">아직 소식이 없습니다.</div>}
      </div>
    </div>
  );
}
