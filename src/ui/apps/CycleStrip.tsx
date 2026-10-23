// 개발 사이클 띠(A-183): 업무 창 탭 아래에 늘 보이는 8주 일정 한 줄. 만드는 순서가 이어 붙은 막대(만드는 중은 진행만큼 채움),
// 약속 기한 깃발(늦을 것 같으면 빨강), 지난 출시 점, MVP 출시 깃발, 오늘 세로줄. 위 한 줄은 "다음 출시 · 다음 기한". 누르면 개발 일정 탭
import { dateOf } from '../../core/calendar';
import { feature } from '../../core/data';
import { hasMvp, itemNeed } from '../../core/product';
import { forecast, KIND_NAME, milestones } from '../../core/milestones';
import type { GameState } from '../../core/types';
import type { productView } from './ProductApp';

const SPAN = 56;
const md = (day: number) => `${dateOf(day).getUTCMonth() + 1}/${dateOf(day).getUTCDate()}`;
export const weekStartOf = (day: number) => day - ((dateOf(day).getUTCDay() + 6) % 7);

// 만드는 순서 항목마다 시작·끝 날(끝 = null이면 만드는 사람이 없어 멈춤)
export function itemSpans(s: GameState, etas: number[]): { from: number; to: number | null }[] {
  return s.product.roadmap.map((_, i) => {
    const prev = i ? etas[i - 1] : 0;
    return { from: isFinite(prev) ? s.day + prev : Infinity, to: isFinite(etas[i]) ? s.day + etas[i] : null };
  });
}

export function CycleStrip({ s, v, onOpen }: { s: GameState; v: ReturnType<typeof productView>; onOpen: () => void }) {
  const start = weekStartOf(s.day) - 7;
  const pos = (d: number) => `${Math.max(0, Math.min(1, (d - start) / SPAN)) * 100}%`;
  const inSpan = (d: number) => d >= start && d < start + SPAN;
  const spans = itemSpans(s, v.etas);
  const promises = milestones(s)
    .filter((m) => m.status === 'active' && m.deadline !== undefined)
    .map((m) => ({ m, f: forecast(s, m) }))
    .sort((a, b) => a.m.deadline! - b.m.deadline!);
  const next = s.product.roadmap.length && spans[0].to !== null ? { name: feature(s.product.roadmap[0].id).name, day: spans[0].to } : null;
  const mvpDay = !hasMvp(s) && v.mvpEta !== null && isFinite(v.mvpEta) ? s.day + v.mvpEta : null;
  const due = promises[0];
  return (
    <button className="pc-strip" data-testid="product-cycle" onClick={onOpen} title="개발 일정 탭에서 순서·기한을 조율합니다">
      <div className="pcs-head">
        <b>개발 사이클</b>
        <span>
          {next ? (
            <>
              다음 출시 <b>{next.name}</b> {md(next.day)}
              {next.day - s.day > 0 ? ` (D-${next.day - s.day})` : ' (오늘)'}
            </>
          ) : s.product.roadmap.length ? (
            <span className="bad">멈춤 · 만드는 사람이 없습니다</span>
          ) : (
            '만드는 순서가 비었습니다'
          )}
        </span>
        {due && (
          <span className={due.f.risk === 'late' ? 'bad' : due.f.risk === 'tight' ? 'mid' : ''}>
            · 다음 기한 {KIND_NAME[due.m.kind]} {md(due.m.deadline!)}
            {promises.length > 1 ? ` 외 ${promises.length - 1}` : ''}
          </span>
        )}
      </div>
      <div className="pcs-track" style={{ ['--today' as string]: pos(s.day) }}>
        {Array.from({ length: SPAN / 7 }, (_, w) => (
          <span key={w} className="pcs-week" style={{ left: pos(start + w * 7) }}>
            {md(start + w * 7)}
          </span>
        ))}
        {s.product.roadmap.map((it, i) => {
          const sp = spans[i];
          if (!isFinite(sp.from) || sp.from >= start + SPAN) return null;
          const to = sp.to === null ? start + SPAN : Math.min(start + SPAN, sp.to + 1);
          const need = it.devDone + it.designDone;
          const w = itemNeed(it);
          const tot = w.dev + w.design;
          return (
            <span
              key={`${it.id}-${it.level}`}
              className={`pcs-seg ${i === 0 ? 'now' : ''} ${sp.to === null ? 'stall' : ''} ${i % 2 ? 'alt' : ''}`}
              style={{ left: pos(Math.max(start, sp.from)), width: `calc(${pos(to)} - ${pos(Math.max(start, sp.from))})`, ['--p' as string]: `${tot ? (need / tot) * 100 : 0}%` }}
              title={`${feature(it.id).name} · ${md(sp.from)} ~ ${sp.to === null ? '멈춤' : md(sp.to)}`}
            />
          );
        })}
        {s.product.shipped
          .filter((x) => inSpan(x.day))
          .map((x, i) => (
            <span key={`sh-${i}`} className={`pcs-ship ${x.result}`} style={{ left: pos(x.day) }} title={`${md(x.day)} ${feature(x.id).name} 출시`} />
          ))}
        {mvpDay !== null && inSpan(mvpDay) && <span className="pcs-flag mvp" style={{ left: pos(mvpDay) }} title={`${md(mvpDay)} MVP 출시 예정`} />}
        {promises
          .filter((p) => inSpan(p.m.deadline!))
          .map((p) => (
            <span key={p.m.id} className={`pcs-flag ${p.f.risk}`} style={{ left: pos(p.m.deadline!) }} title={`${p.m.from} 약속 기한 ${md(p.m.deadline!)}`} />
          ))}
        <i className="pcs-today" />
      </div>
    </button>
  );
}
