// UX-13 페이퍼뉴스: 경제·경쟁사·AI·우리 회사 소식
// 신문처럼: 제호 · 맨 위 머리기사(가장 최근 소식) · 아래는 날짜별 묶음
// 화면(A-179): 업무·커리어와 같은 톤 — 가운데 제호(큰 글자) + 픽셀 날짜, 머리기사는 납작한 면, 날짜 머리는 끊긴 줄, 갈래는 색 타일 칩(픽셀 글꼴)
import { formatDate } from '../../core/calendar';
import { useGame } from '../store';
import type { NewsItem } from '../../core/types';
import { APP_COLORS, AppIcon } from '../icons';
import './apps.css';
import './skin/NewsApp.css';

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
    <div className="col news nw2">
      <header className="news-mast">
        <span className="nw2-tile" style={{ ['--tc' as string]: APP_COLORS.news }}>
          <AppIcon id="news" />
        </span>
        <b>페이퍼뉴스</b>
        <span>{formatDate(s.day)}</span>
      </header>
      {!top && <div className="nw2-empty">아직 소식이 없습니다.</div>}
      {top && (
        <article className="news-top">
          <div className="nw2-top-meta">
            <span className={`news-kind ${top.kind}`}>{KIND[top.kind]}</span>
            <span className="news-date">{formatDate(top.day)}</span>
          </div>
          <h2>{top.text}</h2>
        </article>
      )}
      {days.map((d) => (
        <section key={d.day} className="news-day">
          <div className="news-day-head">
            <span>{formatDate(d.day)}</span>
          </div>
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
