// UX-13 페이퍼뉴스: 경제·경쟁사·AI·우리 회사 소식
// 신문처럼: 제호 · 맨 위 머리기사(가장 최근 소식) · 아래는 날짜별 묶음
import { formatDate } from '../../core/calendar';
import { useGame } from '../store';
import type { NewsItem } from '../../core/types';
import './apps.css';

const KIND: Record<NewsItem['kind'], string> = { economy: '경제', competitor: '경쟁사', ai: 'AI', company: '우리 회사', market: '시장', public: '증시' };

export function NewsApp() {
  const s = useGame();
  const [top, ...rest] = [...s.news].reverse();
  const days: { day: number; items: NewsItem[] }[] = [];
  for (const n of rest) {
    const last = days[days.length - 1];
    if (last && last.day === n.day) last.items.push(n);
    else days.push({ day: n.day, items: [n] });
  }
  return (
    <div className="col news">
      <header className="news-mast">
        <b>페이퍼뉴스</b>
        <span>{formatDate(s.day)}</span>
      </header>
      {!top && <div className="empty-note">아직 소식이 없습니다.</div>}
      {top && (
        <article className="news-top">
          <span className={`news-kind ${top.kind}`}>{KIND[top.kind]}</span>
          <h2>{top.text}</h2>
          <span className="news-date">{formatDate(top.day)}</span>
        </article>
      )}
      {days.map((d) => (
        <section key={d.day} className="news-day">
          <div className="news-day-head">{formatDate(d.day)}</div>
          {d.items.map((n, i) => (
            <div key={i} className="news-item">
              <span className={`news-kind ${n.kind}`}>{KIND[n.kind]}</span>
              <span>{n.text}</span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
