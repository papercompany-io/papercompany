// OF-01 아이소메트릭 픽셀 사무실(캔버스) + OF-02 부서별 좌석 + OF-06 직원 클릭, DT-09 CEO 클릭 → 데스크탑.
// 그림은 캔버스에 픽셀로 그리고, 이름표와 클릭 영역은 그 위에 DOM으로 겹칩니다(글자를 또렷하게, 테스트에서 클릭 가능하게).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DATA, dept, instructionOption } from '../../core/data';
import { formatDate } from '../../core/calendar';
import { runningInstruction } from '../../core/instructions';
import type { DeptId, GameState } from '../../core/types';
import { getGame, useGame } from '../store';
import { Pix } from './pixel';
import { actors, drawOffice, makeView, type Actor } from './scene';
import './office.css';

// HUD(위)와 회사 카드(오른쪽)가 가리는 영역
const RESERVE_TOP = 110;
const RESERVE_RIGHT = 300;

interface Props {
  onCeo: () => void;
  onEmployee: (id: string) => void;
  pulseCeo: boolean;
}

export function Office({ onCeo, onEmployee, pulseCeo }: Props) {
  const s = useGame();
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const hover = useRef<string | null>(null);
  const hoverZone = useRef<DeptId | null>(null);
  const [size, setSize] = useState({ w: 1280, h: 800 });
  const view = useMemo(() => makeView(size.w, size.h, RESERVE_RIGHT, RESERVE_TOP), [size]);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // 픽셀 장면은 초당 약 15장으로 다시 그립니다(타이핑·기지개·창밖 하늘).
  useEffect(() => {
    const canvas = cv.current;
    if (!canvas) return;
    canvas.width = view.artW;
    canvas.height = view.artH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pix = new Pix(view.artW, view.artH);
    let raf = 0;
    let last = -1000;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 66) return;
      last = now;
      const g = getGame();
      if (!g) return;
      drawOffice(pix, view, g, now, hover.current, hoverZone.current);
      ctx.putImageData(pix.img, 0, 0);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [view]);

  if (!s) return null;
  const sc = view.scale;
  const list = actors(s, view).sort((a, b) => a.head[1] - b.head[1]);
  const click = (a: Actor) => (a.kind === 'ceo' ? onCeo() : a.kind === 'emp' ? onEmployee(a.id) : undefined);

  return (
    <div className="office" ref={wrap} data-testid="office">
      <canvas ref={cv} className="office-canvas" style={{ width: view.artW * sc, height: view.artH * sc }} />
      <div className="zone-legend" data-testid="zone-legend">
        <div className="zl-title">부서 구역 좌석</div>
        {DATA.office.zones.map(({ dept: id }) => {
          const d = id as DeptId;
          return (
            <div key={d} className="zl-item" style={{ ['--dc' as string]: dept(d).color }} onMouseEnter={() => (hoverZone.current = d)} onMouseLeave={() => (hoverZone.current = null)}>
              <span className="zone-dot" />
              {dept(d).name}
              <b>{zoneCount(s, d)}</b>
            </div>
          );
        })}
      </div>
      {list.map((a) =>
        a.kind === 'pending' ? null : (
          <button
            key={`hit-${a.id}`}
            className="actor-hit"
            data-testid={a.kind === 'ceo' ? 'ceo' : `emp-${a.id}`}
            title={a.kind === 'ceo' ? '내 컴퓨터 열기' : '직원 정보'}
            style={{ left: a.box[0] * sc, top: a.box[1] * sc, width: a.box[2] * sc, height: a.box[3] * sc }}
            onClick={() => click(a)}
            onMouseEnter={() => (hover.current = a.id)}
            onMouseLeave={() => (hover.current = null)}
          />
        ),
      )}
      {list.map((a) => (
        <NameTag key={`tag-${a.id}`} a={a} s={s} sc={sc} pulse={pulseCeo && a.kind === 'ceo'} onClick={() => click(a)} />
      ))}
    </div>
  );
}

function zoneCount(s: GameState, d: DeptId): string {
  const seats = s.seats.filter((x) => x.zone === d);
  const used = seats.filter((x) => x.occupant !== null).length;
  return `${used}/${seats.length}`;
}

function NameTag({ a, s, sc, pulse, onClick }: { a: Actor; s: GameState; sc: number; pulse: boolean; onClick: () => void }) {
  const style = { left: a.head[0] * sc, top: a.head[1] * sc };
  if (a.kind === 'ceo') {
    return (
      <div className={`nametag ceo ${pulse ? 'pulse' : ''}`} style={style} onClick={onClick} data-testid="ceo-tag">
        {pulse && <div className="tag-arrow">클릭!</div>}
        <div className="tag-name">나 · 대표</div>
        <div className="tag-sub">내 컴퓨터 열기</div>
      </div>
    );
  }
  if (a.kind === 'pending') {
    const h = s.pendingHires.find((x) => `pending:${x.applicantId}` === a.id);
    return (
      <div className="nametag pending" style={style}>
        <div className="tag-name">{h?.name ?? '새 직원'}</div>
        <div className="tag-sub">입사 예정 {h ? formatDate(h.startDay).slice(5) : ''}</div>
      </div>
    );
  }
  const e = s.employees.find((x) => x.id === a.id);
  if (!e) return null;
  const run = runningInstruction(s, e.dept);
  let status: string;
  let busy = false;
  if (run) {
    const span = Math.max(1, run.endDay - run.startDay);
    const done = Math.min(1, (s.day - run.startDay + s.msInDay / DATA.time.dayMs) / span);
    status = `${instructionOption(run.optionId).name} ${Math.floor(done * 100)}%`;
    busy = true;
  } else status = '지시 대기';
  return (
    <div className="nametag" style={{ ...style, ['--dc' as string]: dept(e.dept).color }} onClick={onClick}>
      <div className="tag-name">
        <span className="tag-dept" />
        {e.name}
        {e.kind === 'cofounder' && <span className="tag-badge">코파운더</span>}
      </div>
      <div className={`tag-sub ${busy ? '' : 'idle'}`}>{status}</div>
    </div>
  );
}
