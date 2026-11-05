// OF-01 아이소메트릭 픽셀 사무실(캔버스) + OF-02 책상·가구 배치(A-80, A-87: 상점에서 시작) + OF-06 직원 클릭, DT-09 CEO 클릭 → 데스크탑.
// Startup Company처럼 사무실이 화면을 채우는 탑뷰입니다. 끌어서 이동, 휠·버튼으로 확대·축소, 방향키로도 이동합니다.
// 그림은 캔버스에 픽셀로 그리고, 이름표와 클릭 영역은 그 위에 DOM으로 겹칩니다(글자를 또렷하게, 테스트에서 클릭 가능하게).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DATA, dept } from '../../core/data';
import { formatDate } from '../../core/calendar';
import { orderLabel } from '../../core/orders';
import { isSick } from '../../core/staff';
import { deskAt, furnitureAt, furnitureItems, itemSize, nextRot, ownsFurniture } from '../../core/office';
import type { GameState } from '../../core/types';
import { dispatch, getGame, useGame } from '../store';
import { uiZoom } from '../meta';
import { wonShort } from '../../core/format';
import { Pix } from './pixel';
import { TH, TW, ZOOM_MAX, ZOOM_MIN, actors, clampCamera, defaultCamera, defaultZoom, drawOffice, editItem, makeView, setLayout, type Actor, type Camera, type EditState } from './scene';
import { useEditRequests } from './placement';
import { awayOuting } from '../../core/outings';
import { play } from '../sound';
import { PxIcon, bubbleIcon } from '../icons';
import type { FloatFx } from '../Game';
import { actionDef, ceoEnergy, ceoWork } from '../../core/ceo';
import { hasMvp } from '../../core/product';
import { productView } from '../apps/ProductApp';
import { energyWord } from '../apps/ScheduleApp';

// 대표 이름표의 "~ 중" 말(A-189). 없는 일은 행동 이름 그대로
const CEO_DOING: Partial<Record<string, string>> = { contract: '외주 작업' };
import './office.css';

// 위 막대·왼쪽 메뉴·오른쪽 목표가 가리는 영역(카메라 가운데를 그만큼 옮김)
const RESERVE_TOP = 70;
const RESERVE_RIGHT = 180;

interface Props {
  onCeo: () => void;
  onEmployee: (id: string) => void;
  pulseCeo: boolean;
  keysEnabled: boolean;
  floats?: FloatFx[];
}

export function Office({ onCeo, onEmployee, pulseCeo, keysEnabled, floats = [] }: Props) {
  const s = useGame();
  if (s) setLayout(s.company.officeTier);
  // 이사하면 카메라를 새 사무실 가운데로
  const tierRef = useRef(s?.company.officeTier);
  useEffect(() => {
    if (s && tierRef.current !== s.company.officeTier) {
      tierRef.current = s.company.officeTier;
      setCam(null);
      setZoom(null);
    }
  });
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const hover = useRef<string | null>(null);
  const [mode, setMode] = useState<EditState['mode'] | null>(null);
  const [modeItem, setModeItem] = useState<string | null>(null);
  const edit = useRef<EditState | null>(null);
  const [editMsg, setEditMsg] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 1280, h: 800 });
  const [zoom, setZoom] = useState<number | null>(null);
  const [cam, setCam] = useState<Camera | null>(null);
  const drag = useRef<{ x: number; y: number; cam: Camera; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const scale = zoom ?? defaultZoom(size.w, size.h);
  const camera = cam ?? defaultCamera(scale, RESERVE_RIGHT, RESERVE_TOP);
  const view = makeView(size.w, size.h, scale, camera);
  const viewRef = useRef(view);
  viewRef.current = view;

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // 픽셀 장면은 초당 약 15장으로 다시 그립니다(타이핑·기지개·창밖 하늘). 카메라가 바뀌면 다음 장에 반영됩니다.
  useEffect(() => {
    const canvas = cv.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let pix: Pix | null = null;
    let raf = 0;
    let last = -1000;
    let lastKey = '';
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const v = viewRef.current;
      const key = `${v.ox},${v.oy},${v.artW},${v.artH}`;
      if (now - last < 66 && key === lastKey) return;
      last = now;
      lastKey = key;
      const g = getGame();
      if (!g) return;
      if (!pix || pix.w !== v.artW || pix.h !== v.artH) {
        canvas.width = v.artW;
        canvas.height = v.artH;
        pix = new Pix(v.artW, v.artH);
      }
      drawOffice(pix, v, g, now, hover.current, edit.current);
      ctx.putImageData(pix.img, 0, 0);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 방향키로 이동(입력칸에 있을 때·컴퓨터 창이 열렸을 때는 무시)
  useEffect(() => {
    if (!keysEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      const step = 48 / viewRef.current.scale;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d) return;
      e.preventDefault();
      setCam((c) => {
        const cur = c ?? defaultCamera(viewRef.current.scale, RESERVE_RIGHT, RESERVE_TOP);
        return clampCamera({ x: cur.x + d[0], y: cur.y + d[1] });
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keysEnabled]);

  // 확대·축소: 기준점(마우스 위치 또는 화면 가운데) 아래의 바닥이 그대로 있게 카메라를 옮깁니다.
  const zoomTo = (next: number, fx = size.w / 2, fy = size.h / 2) => {
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
    if (z === scale) return;
    const wx = camera.x + (fx - size.w / 2) / scale;
    const wy = camera.y + (fy - size.h / 2) / scale;
    setZoom(z);
    setCam(clampCamera({ x: wx - (fx - size.w / 2) / z, y: wy - (fy - size.h / 2) / z }));
  };

  // 배치 모드 켜고 끄기(Esc로 끔). 상점 창에서 요청이 오면 그 모드로 들어갑니다.
  const setEdit = (m: EditState['mode'] | null, item: string | null = null) => {
    setMode(m);
    setModeItem(m === 'place' ? item : null);
    edit.current = m ? { mode: m, item: m === 'place' ? item : null, tile: null, pick: null, rot: 0 } : null;
    setEditMsg(null);
  };
  useEditRequests((r) => setEdit(r.mode, r.item ?? null));
  // 손에 든 물건 돌리기(A-128): 놓는 중이거나 옮기려고 집은 물건
  const turnHeld = () => {
    const e = edit.current;
    if (!e || !(e.mode === 'place' || (e.mode === 'move' && e.pick))) return false;
    e.rot = nextRot(e.rot);
    play('click');
    return true;
  };
  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEdit(null);
      if (e.key === 'r' || e.key === 'R' || e.key === 'ㄱ') turnHeld();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  // 화면 좌표 → 바닥 칸(소수)
  const floorAt = (clientX: number, clientY: number) => {
    const r = wrap.current!.getBoundingClientRect();
    const z = uiZoom(); // 화면 크기(A-241): 화면 픽셀 → CSS 픽셀
    const wx = (clientX - r.left) / z / view.scale - view.ox;
    const wy = (clientY - r.top) / z / view.scale - view.oy;
    const a = (2 * wx) / TW;
    const b = (2 * wy) / TH;
    return { x: (a + b) / 2, y: (b - a) / 2 };
  };
  // 손에 든 물건의 왼쪽 위 칸: 마우스가 물건 가운데에 오도록(책상 2×2, 가구는 크기대로)
  const tileAt = (e: EditState, f: { x: number; y: number }) => {
    const hand = editItem(getGame()!, e);
    const { w, h } = hand ? itemSize(hand, e.rot) : { w: 1, h: 1 };
    return { gx: Math.round(f.x - w / 2), gy: Math.round(f.y - h / 2) };
  };
  const onEditMove = (clientX: number, clientY: number) => {
    const e = edit.current;
    if (!e) return;
    e.tile = tileAt(e, floorAt(clientX, clientY));
  };
  const onEditClick = (clientX: number, clientY: number) => {
    const e = edit.current;
    if (!e) return;
    const f = floorAt(clientX, clientY);
    const tile = tileAt(e, f);
    const g0 = getGame()!;
    let err: string | null = null;
    let done = false;
    if (e.mode === 'place') {
      if (e.item === 'desk') err = (dispatch({ type: 'placeDesk', gx: tile.gx, gy: tile.gy, rot: e.rot }) as string | null | undefined) ?? null; // 책상은 여러 개 이어서 놓음
      else if (e.item) {
        err = (dispatch({ type: 'placeFurniture', itemId: e.item!, gx: tile.gx, gy: tile.gy, rot: e.rot }) as string | null | undefined) ?? null;
        done = !err; // 가구는 하나씩: 놓으면 배치 끝
      }
    } else if (e.mode === 'remove') {
      const d = deskAt(g0, f.x, f.y);
      const it = d ? null : furnitureAt(g0, f.x, f.y);
      if (d) err = (dispatch({ type: 'removeDesk', deskId: d.id }) as string | null | undefined) ?? null;
      else if (it) err = (dispatch({ type: 'storeFurniture', placedId: it.id }) as string | null | undefined) ?? null;
      else err = '치울 책상이나 가구를 누르세요.';
    } else if (e.mode === 'rotate') {
      const d = deskAt(g0, f.x, f.y);
      const it = d ? null : furnitureAt(g0, f.x, f.y);
      if (d) err = (dispatch({ type: 'rotateDesk', deskId: d.id }) as string | null | undefined) ?? null;
      else if (it) err = (dispatch({ type: 'rotateFurniture', placedId: it.id }) as string | null | undefined) ?? null;
      else err = '돌릴 책상이나 가구를 누르세요.';
    } else if (!e.pick) {
      const d = deskAt(g0, f.x, f.y);
      const it = d ? null : furnitureAt(g0, f.x, f.y);
      if (d) e.pick = { kind: 'desk', id: d.id };
      else if (it) e.pick = { kind: 'furn', id: it.id };
      else err = '옮길 책상이나 가구를 누르세요.';
      e.rot = (d ? d.rot : it?.rot) ?? 0;
      if (e.pick) e.tile = tileAt(e, f);
    } else {
      const pick = e.pick;
      const rot = e.rot;
      err = (dispatch(pick.kind === 'desk' ? { type: 'moveDesk', deskId: pick.id, gx: tile.gx, gy: tile.gy, rot } : { type: 'moveFurniture', placedId: pick.id, gx: tile.gx, gy: tile.gy, rot }) as string | null | undefined) ?? null;
      if (!err) e.pick = null;
    }
    setEditMsg(err);
    play(err ? 'fail' : 'click');
    if (done) setEdit(null);
  };

  if (!s) return null;
  const sc = view.scale;
  const list = actors(s, view).sort((a, b) => a.head[1] - b.head[1]);
  // 직원이 많으면 이름표는 확대했을 때만(말풍선·대표·입사 예정은 항상)
  const showTags = list.length <= 22 || scale >= 4;
  const click = (a: Actor) => {
    if (suppressClick.current) return;
    if (a.kind === 'ceo') onCeo();
    else if (a.kind === 'emp') onEmployee(a.id);
  };

  return (
    <div
      className={`office ${drag.current?.moved ? 'dragging' : ''} ${mode ? `editing edit-${mode}` : ''}`}
      ref={wrap}
      data-testid="office"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        drag.current = { x: e.clientX, y: e.clientY, cam: camera, moved: false };
        suppressClick.current = false;
      }}
      onPointerMove={(e) => {
        onEditMove(e.clientX, e.clientY);
        const d = drag.current;
        if (!d) return;
        const dx = (e.clientX - d.x) / uiZoom();
        const dy = (e.clientY - d.y) / uiZoom();
        if (!d.moved && Math.hypot(dx, dy) < 5) return;
        d.moved = true;
        setCam(clampCamera({ x: d.cam.x - dx / scale, y: d.cam.y - dy / scale }));
      }}
      onPointerUp={(e) => {
        if (drag.current?.moved) {
          suppressClick.current = true;
          setTimeout(() => (suppressClick.current = false), 0);
        } else if (drag.current && edit.current) onEditClick(e.clientX, e.clientY);
        drag.current = null;
      }}
      onPointerLeave={() => (drag.current = null)}
      onWheel={(e) => {
        const r = wrap.current?.getBoundingClientRect();
        zoomTo(scale + (e.deltaY < 0 ? 1 : -1), (e.clientX - (r?.left ?? 0)) / uiZoom(), (e.clientY - (r?.top ?? 0)) / uiZoom());
      }}
    >
      <canvas ref={cv} className="office-canvas" style={{ width: view.artW * sc, height: view.artH * sc }} />
      {list.map((a) =>
        a.kind === 'pending' ? null : (
          <button
            key={`hit-${a.id}`}
            className="actor-hit"
            data-testid={a.kind === 'ceo' ? 'ceo' : `emp-${a.id}`}
            title={a.kind === 'ceo' ? 'CEO 일정' : '직원 정보'}
            style={{ left: a.box[0] * sc, top: a.box[1] * sc, width: a.box[2] * sc, height: a.box[3] * sc }}
            onClick={() => click(a)}
            onMouseEnter={() => (hover.current = a.id)}
            onMouseLeave={() => (hover.current = null)}
          />
        ),
      )}
      {list.map((a) => (showTags || a.kind !== 'emp' ? <NameTag key={`tag-${a.id}`} a={a} s={s} sc={sc} pulse={pulseCeo && a.kind === 'ceo'} onClick={() => click(a)} /> : <Bubble key={`b-${a.id}`} a={a} s={s} sc={sc} />))}
      {floats.map((f) => {
        const a = (f.seat && list.find((x) => x.seat.id === f.seat)) || list.find((x) => x.kind === 'ceo');
        if (!a) return null;
        return (
          <div key={f.id} className={`floater ${f.kind}`} style={{ left: a.head[0] * sc, top: (a.head[1] - 10) * sc }}>
            {f.text}
          </div>
        );
      })}

      {mode && <PlaceBar s={s} mode={mode} item={modeItem} msg={editMsg} onMode={(m) => setEdit(m)} onTurn={() => turnHeld() || setEditMsg('먼저 책상이나 가구를 집으세요. "돌리기"를 고르면 놓인 물건을 눌러 바로 돌립니다.')} onDone={() => setEdit(null)} />}

      <div className="cam-tools" onPointerDown={(e) => e.stopPropagation()}>
        {/* 배치 수정(A-128): 상점을 거치지 않고 놓인 책상·가구를 바로 옮기기·돌리기·치우기 */}
        {!mode && (
          <button className="round-btn wide" data-testid="edit-open" title="놓인 책상·가구 옮기기·돌리기·치우기" onClick={() => setEdit('move')}>
            배치 수정
          </button>
        )}
        <button className="round-btn" data-testid="zoom-in" title="확대" onClick={() => zoomTo(scale + 1)} disabled={scale >= ZOOM_MAX}>
          +
        </button>
        <button className="round-btn" data-testid="zoom-out" title="축소" onClick={() => zoomTo(scale - 1)} disabled={scale <= ZOOM_MIN}>
          −
        </button>
        <button
          className="round-btn"
          data-testid="zoom-reset"
          title="사무실 가운데로"
          onClick={() => {
            setZoom(null);
            setCam(null);
          }}
        >
          ⌂
        </button>
      </div>
    </div>
  );
}

// 배치 중에만 뜨는 아래 가운데 막대: 지금 하는 일·안내(또는 안 되는 이유)·모드 바꾸기·끝내기. 배치는 상점에서 시작합니다(A-87).
function PlaceBar({ s, mode, item, msg, onMode, onTurn, onDone }: { s: GameState; mode: EditState['mode']; item: string | null; msg: string | null; onMode: (m: EditState['mode']) => void; onTurn: () => void; onDone: () => void }) {
  const def = item && item !== 'desk' ? furnitureItems().find((x) => x.id === item) : null;
  const stored = !!def && ownsFurniture(s, def.id);
  const title =
    mode === 'place'
      ? item === 'desk'
        ? `책상 놓기 · 개당 ${wonShort(DATA.furniture.deskPrice)}`
        : `${def?.name ?? '가구'} ${stored ? '꺼내 놓기' : `놓기 · ${wonShort(def?.price ?? 0)}`}`
      : mode === 'move'
        ? '옮기기'
        : mode === 'rotate'
          ? '돌리기'
          : '치우기';
  const tip =
    mode === 'place'
      ? item === 'desk'
        ? '빈 바닥을 눌러 책상을 놓습니다. 여러 개를 이어서 놓을 수 있습니다. R 키로 방향을 돌립니다.'
        : '빈 바닥을 눌러 놓습니다. 가구는 회의실·라운지 같은 방 안에도 놓을 수 있습니다. R 키로 방향을 돌립니다.'
      : mode === 'move'
        ? '책상이나 가구를 누른 다음 옮길 자리를 누르세요. 집은 동안 R 키로 돌립니다. 책상에 앉은 사람도 같이 옮겨 갑니다.'
        : mode === 'rotate'
          ? '책상이나 가구를 누를 때마다 시계 방향으로 90° 돕니다. 자리가 모자라면 옮긴 뒤 돌리세요.'
          : '빈 책상은 절반 값에 처분하고, 가구는 보관함으로 넣습니다(상점에서 다시 놓기).';
  return (
    <div className="place-bar" data-testid="place-bar" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
      <div className="pb-text">
        <b className="pb-title">{title}</b>
        <span className={`pb-tip ${msg ? 'bad' : ''}`}>{msg ?? tip}</span>
      </div>
      <div className="pb-tools">
        {mode !== 'place' && (
          <>
            <button className={`btn small ${mode === 'move' ? '' : 'ghost'}`} data-testid="edit-move" onClick={() => onMode('move')}>
              옮기기
            </button>
            <button className={`btn small ${mode === 'rotate' ? '' : 'ghost'}`} data-testid="edit-rotate" onClick={() => onMode('rotate')}>
              돌리기
            </button>
            <button className={`btn small ${mode === 'remove' ? '' : 'ghost'}`} data-testid="edit-remove" onClick={() => onMode('remove')}>
              치우기
            </button>
          </>
        )}
        {(mode === 'place' || mode === 'move') && (
          <button className="btn small ghost" data-testid="edit-turn" title="손에 든 물건 돌리기" onClick={onTurn}>
            ↻ <kbd>R</kbd>
          </button>
        )}
        <button className="btn small green" data-testid="edit-done" onClick={onDone}>
          완료 <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  );
}

function NameTag({ a, s, sc, pulse, onClick }: { a: Actor; s: GameState; sc: number; pulse: boolean; onClick: () => void }) {
  const style = { left: a.head[0] * sc, top: a.head[1] * sc };
  if (a.kind === 'ceo') {
    // A-189: 직원 이름표처럼 지금 하는 일 + 컨디션 막대(숫자 없이 색·말). 누르면 CEO 일정
    const out = awayOuting(s);
    const work = ceoWork(s);
    const doing = out ? `외출 중 · ${out.title}` : work === 'dev' && !hasMvp(s) ? `MVP 개발 중 · ${Math.floor(productView(s).mvpProgress * 100)}%` : `${CEO_DOING[work] ?? actionDef(work).name} 중`;
    const energy = ceoEnergy(s);
    const E = DATA.ceo.energy;
    return (
      <div className={`nametag ceo ${pulse ? 'pulse' : ''}`} style={style} onClick={onClick} data-testid="ceo-tag" title={`CEO 일정 열기 · 컨디션 ${energyWord(energy).word}`}>
        {pulse && <div className="tag-arrow">클릭!</div>}
        <div className="tag-name">나 · 대표</div>
        <div className="tag-sub">{doing}</div>
        <div className="tag-mood">
          <i style={{ width: `${energy}%`, background: energy < E.burnoutAt ? '#d9453b' : energy < E.lowAt ? '#f0a020' : '#36b44a' }} />
        </div>
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
  const sick = isSick(s, e);
  const status = sick ? '병가' : e.leaving !== null ? '퇴사 예정' : s.company.movingUntil !== null ? '이사 중' : orderLabel(s, e.dept);
  const busy = !sick && e.leaving === null;
  return (
    <div className="nametag" style={{ ...style, ['--dc' as string]: dept(e.dept).color }} onClick={onClick}>
      <div className="tag-name">
        <span className="tag-dept" />
        {e.name}
        {e.kind === 'cofounder' && <span className="tag-badge">코파운더</span>}
        {e.lead && <span className="tag-badge">팀장</span>}
        {e.bubble && (
          <span className="tag-emoji">
            <PxIcon id={bubbleIcon(e.bubble.text)} size={12} />
          </span>
        )}
      </div>
      <div className={`tag-sub ${busy ? '' : 'idle'}`}>{status}</div>
      <div className="tag-mood" title={`만족도 ${Math.round(e.sat)} · 건강 ${Math.round(e.health)}`}>
        <i style={{ width: `${e.sat}%`, background: e.sat < 35 ? '#d9453b' : e.sat < 55 ? '#f0a020' : '#36b44a' }} />
      </div>
    </div>
  );
}

// OF-05 직원 상태 표시: 이름표를 숨겼을 때도 말풍선(병가·불만·새 결정·입사 박스)은 보입니다.
function Bubble({ a, s, sc }: { a: Actor; s: GameState; sc: number }) {
  const e = s.employees.find((x) => x.id === a.id);
  if (!e || !e.bubble) return null;
  return (
    <div className="mood-bubble" style={{ left: a.head[0] * sc, top: a.head[1] * sc }}>
      <PxIcon id={bubbleIcon(e.bubble.text)} size={16} />
    </div>
  );
}
