// 페이퍼뉴스 띠(A-216): 왼쪽 메뉴의 뉴스 창을 없애고, 오른쪽 아래 가로로 긴 한 줄로 가장 최근 소식을 띄웁니다.
// 띠를 누르면 위로 최근 소식 목록이 펼쳐집니다(다시 누르거나 바깥을 누르면 닫힘).
import { useEffect, useRef, useState } from 'react';
import { formatDate } from '../core/calendar';
import type { GameState, NewsItem } from '../core/types';
import { APP_COLORS, AppIcon } from './icons';

const KIND: Record<NewsItem['kind'], string> = { economy: '경제', competitor: '경쟁사', ai: 'AI', company: '우리 회사', market: '시장', public: '증시' };
const LIST_MAX = 30;

export function NewsTicker({ s }: { s: GameState }) {
  const [open, setOpen] = useState(false);
  const el = useRef<HTMLDivElement>(null);
  const top = s.news[s.news.length - 1];
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !el.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  if (!top)
    return (
      <div className="nt" data-testid="news-ticker">
        <div className="nt-bar empty">
          <span className="nt-tile" style={{ ['--tc' as string]: APP_COLORS.news }}>
            <AppIcon id="news" />
          </span>
          <span className="nt-text">아직 소식이 없습니다.</span>
        </div>
      </div>
    );
  const list = s.news.slice(-LIST_MAX).reverse();
  return (
    <div ref={el} className={`nt ${open ? 'open' : ''}`} data-testid="news-ticker" onPointerDown={(e) => e.stopPropagation()}>
      {open && (
        <div className="nt-list" data-testid="news-list">
          <div className="nt-list-head">
            <b>페이퍼뉴스</b>
            <span>{formatDate(s.day)}</span>
          </div>
          <div className="nt-list-body">
            {list.map((n, i) => (
              <div key={i} className="nt-row">
                <span className={`news-kind ${n.kind}`}>{KIND[n.kind]}</span>
                <span className="nt-row-text">{n.text}</span>
                <span className="nt-date">{formatDate(n.day)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* 새 소식이 오면 띠가 한 번 물들어 눈에 띄게(소식이 바뀌면 key가 바뀌어 애니메이션이 다시 시작). 뉴스는 120개에서 잘려 개수로는 못 셈 */}
      <button key={`${top.day}-${top.text}`} className="nt-bar" data-testid="news-bar" title={open ? '닫기' : '지난 소식 보기'} onClick={() => setOpen(!open)}>
        <span className="nt-tile" style={{ ['--tc' as string]: APP_COLORS.news }}>
          <AppIcon id="news" />
        </span>
        <span className={`news-kind ${top.kind}`}>{KIND[top.kind]}</span>
        <span className="nt-text">{top.text}</span>
        <span className="nt-date">{formatDate(top.day)}</span>
        <span className="nt-caret" aria-hidden>
          {open ? '▾' : '▴'}
        </span>
      </button>
    </div>
  );
}
