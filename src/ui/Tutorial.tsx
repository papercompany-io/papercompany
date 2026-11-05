// 튜토리얼(A-244). 두 겹입니다.
// 1) Tutorial: 게임 시작 때 한 번 보는 짧은 화면 소개. 화면을 어둡게 덮고 한 곳만 밝게 뚫어(하이라이트) 말풍선으로 설명.
//    안내하는 동안 시간은 멈추고(timeHold.tutorial, 저장되는 배속은 그대로) 게임 단축키도 막습니다.
// 2) Guide: 기능을 쓸 때가 되면(tutorial.json guides의 when) 그 버튼에 빛나는 테두리 + 작은 말풍선. 게임은 멈추지 않고 화면도 덮지 않음.
//    창이 닫혀 있으면 메뉴 버튼을, 창을 열면 창 안 버튼을 짚습니다. 짚은 곳을 누르거나 "알겠습니다"를 누르면 본 것으로.
// 본 것은 설정(기기)에 남고, 설정 창 "튜토리얼 다시 보기"로 처음부터 다시 봅니다.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getGame, timeHold, useGame } from './store';
import { getSettings, setSettings, uiZoom, useSettings, viewH, viewW } from './meta';
import { GUIDES, allTrue, type GuideDef } from './guide';
import type { GameState } from '../core/types';
import DATA from '../data/tutorial.json';
import './tutorial.css';

interface Step {
  target: string | null;
  title: string;
  text: string;
}
const STEPS = DATA.intro as Step[];

// 설정 창에서 다시 보기를 누르면 게임 화면이 듣는 신호
export const TOUR_EVENT = 'pc-tutorial';
export const replayTutorial = () => {
  setSettings({ tutorialDone: false, guidesSeen: [] });
  window.dispatchEvent(new Event(TOUR_EVENT));
};

// 게임 화면에 처음 들어올 때 튜토리얼을 자동으로 띄울지.
// continued = 저장한 회사를 불러옴, done = 이 기기에서 튜토리얼을 끝내거나 건너뛴 적 있음(설정)
export function shouldStartTutorial(s: GameState, continued: boolean, done: boolean): boolean {
  return !continued && !done && !s.ended;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = 6; // 하이라이트 둘레 여백
const GAP = 14; // 하이라이트와 말풍선 사이
const BUBBLE_W = 320;

// 짚을 곳의 자리(CSS 픽셀). 없거나 크기가 0이거나 화면 밖이면 null → 가운데 말풍선
function targetBox(sel: string | null): Box | null {
  if (!sel) return null;
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const z = uiZoom(); // A-241: 화면 픽셀 → CSS 픽셀
  const b = { x: r.left / z - PAD, y: r.top / z - PAD, w: r.width / z + PAD * 2, h: r.height / z + PAD * 2 };
  if (r.width < 1 || r.height < 1 || b.x + b.w < 0 || b.y + b.h < 0 || b.x > viewW() || b.y > viewH()) return null;
  return b;
}

// 말풍선 자리: 오른쪽 → 아래 → 왼쪽 → 위 순으로 들어가는 쪽, 화면 안으로 당김
function bubblePos(t: Box | null, bh: number, bw = BUBBLE_W): { left: number; top: number } {
  const W = viewW();
  const H = viewH();
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  if (!t) return { left: (W - bw) / 2, top: (H - bh) / 2 };
  const midY = clamp(t.y + t.h / 2 - bh / 2, 12, H - bh - 12);
  const midX = clamp(t.x + t.w / 2 - bw / 2, 12, W - bw - 12);
  if (t.x + t.w + GAP + bw <= W - 12) return { left: t.x + t.w + GAP, top: midY };
  if (t.y + t.h + GAP + bh <= H - 12) return { left: midX, top: t.y + t.h + GAP };
  if (t.x - GAP - bw >= 12) return { left: t.x - GAP - bw, top: midY };
  return { left: midX, top: clamp(t.y - GAP - bh, 12, H - bh - 12) };
}

const same = (a: Box | null, b: Box | null) => (!a || !b ? a === b : a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

export function Tutorial({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [bh, setBh] = useState(180);
  const bubble = useRef<HTMLDivElement>(null);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const finish = () => {
    setSettings({ tutorialDone: true });
    onClose();
  };
  const go = (d: number) => {
    if (i + d >= STEPS.length) return finish();
    setI((n) => Math.max(0, n + d));
  };
  const now = useRef({ go, finish });
  now.current = { go, finish };

  // 안내하는 동안 시간 멈춤
  useEffect(() => {
    timeHold.tutorial = true;
    return () => {
      timeHold.tutorial = false;
    };
  }, []);

  // 짚을 곳을 매 프레임 따라감(창 크기·화면 크기·사무실 이동에도 맞게)
  useEffect(() => {
    let raf = 0;
    let prev: Box | null = null;
    const tick = () => {
      const b = targetBox(step.target);
      if (!same(b, prev)) {
        prev = b;
        setBox(b);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [step.target]);

  useLayoutEffect(() => {
    if (bubble.current) setBh(bubble.current.offsetHeight);
  }, [i]);

  // 게임 단축키(스페이스·Esc·Tab 등)는 막고 튜토리얼 키만: Enter·→·스페이스 다음, ← 이전, Esc 건너뛰기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === ' ') now.current.go(1);
      else if (e.key === 'ArrowLeft') now.current.go(-1);
      else if (e.key === 'Escape') now.current.finish();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const pos = bubblePos(box, bh);
  return (
    <div className="tut" data-testid="tutorial" onPointerDown={(e) => e.stopPropagation()}>
      {box ? <div className="tut-spot" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} /> : <div className="tut-dim" />}
      <div ref={bubble} key={i} className="tut-bubble" role="dialog" aria-live="polite" style={{ left: pos.left, top: pos.top, width: BUBBLE_W }}>
        <div className="tut-head">
          <span className="tut-count">
            {i + 1} / {STEPS.length}
          </span>
          <button className="tut-skip" data-testid="tutorial-skip" onClick={finish}>
            건너뛰기
          </button>
        </div>
        <b className="tut-title">{step.title}</b>
        <p className="tut-text">{step.text}</p>
        <div className="tut-foot">
          <span className="tut-dots" aria-hidden>
            {STEPS.map((_, k) => (
              <i key={k} className={k === i ? 'on' : k < i ? 'past' : ''} />
            ))}
          </span>
          {i > 0 && (
            <button className="btn small ghost" data-testid="tutorial-prev" onClick={() => go(-1)}>
              이전
            </button>
          )}
          <button className="btn small" data-testid="tutorial-next" autoFocus onClick={() => go(1)}>
            {last ? '시작하기' : '다음'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 상황 안내 ──

const GUIDE_W = 280;

// 지금 보여 줄 안내: 아직 안 본 것 중 tutorial.json 순서로 처음 조건이 맞는 것
function pickGuide(s: GameState, seen: string[]): GuideDef | null {
  return GUIDES.find((g) => !seen.includes(g.id) && !allTrue(s, g.done) && allTrue(s, g.when)) ?? null;
}

// 짚을 곳: targets 가운데 화면에 보이는 첫 자리
function firstVisible(sels: string[]): Box | null {
  for (const sel of sels) {
    const b = targetBox(sel);
    if (b) return b;
  }
  return null;
}

// blocked = 시작 소개·모달이 떠 있음(그동안 안내를 띄우지 않음)
export function Guide({ blocked }: { blocked: boolean }) {
  const s = useGame();
  const st = useSettings();
  const [box, setBox] = useState<Box | null>(null);
  const [bh, setBh] = useState(120);
  const bubble = useRef<HTMLDivElement>(null);
  const lastDay = useRef<number | null>(null); // 마지막으로 안내를 닫은 날

  const markSeen = (id: string) => {
    const seen = getSettings().guidesSeen;
    if (!seen.includes(id)) setSettings({ guidesSeen: [...seen, id] });
    lastDay.current = getGame()?.day ?? null;
  };

  // 이미 해낸 일(done)은 안내 없이 본 것으로
  const doneNow = GUIDES.filter((g) => !st.guidesSeen.includes(g.id) && allTrue(s, g.done)).map((g) => g.id);
  useEffect(() => {
    if (doneNow.length) setSettings({ guidesSeen: [...getSettings().guidesSeen, ...doneNow] });
  }, [doneNow.join()]);

  const rest = guideRest(s.day, lastDay.current);
  const g = blocked || !st.guides || rest ? null : pickGuide(s, st.guidesSeen);

  // 짚을 곳을 매 프레임 따라감(창을 열고 닫거나 옮겨도)
  useEffect(() => {
    if (!g) return setBox(null);
    let raf = 0;
    let prev: Box | null = null;
    const tick = () => {
      const b = firstVisible(g.targets);
      if (!same(b, prev)) {
        prev = b;
        setBox(b);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [g?.id]);

  // 짚은 곳(가장 정확한 자리)을 누르면 본 것으로. 메뉴 버튼만 누르면 창 안 자리로 옮겨 감
  useEffect(() => {
    if (!g) return;
    const down = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest(g.targets[0])) markSeen(g.id);
    };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [g?.id]);

  useLayoutEffect(() => {
    if (bubble.current) setBh(bubble.current.offsetHeight);
  }, [g?.id, !!box]);

  if (!g || !box) return null;
  const pos = bubblePos(box, bh, GUIDE_W);
  return (
    <div className="gd" data-testid="guide">
      <div className="gd-ring" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />
      <div ref={bubble} key={g.id} className="gd-bubble" style={{ left: pos.left, top: pos.top, width: GUIDE_W }} onPointerDown={(e) => e.stopPropagation()}>
        <b className="tut-title">{g.title}</b>
        <p className="tut-text">{g.text}</p>
        <div className="tut-foot">
          <button className="tut-skip" data-testid="guide-off" title="설정에서 다시 켤 수 있습니다" onClick={() => setSettings({ guides: false })}>
            안내 끄기
          </button>
          <span className="grow" />
          <button className="btn small" data-testid="guide-ok" onClick={() => markSeen(g.id)}>
            알겠습니다
          </button>
        </div>
      </div>
    </div>
  );
}

// 안내를 하나 닫은 뒤 다음 안내까지 쉬는지. today = 오늘(게임 날), last = 마지막으로 닫은 날(이번에 켠 뒤 없으면 null)
// 같은 날 여러 안내가 연달아 뜨지 않게, 하루 쉼
function guideRest(today: number, last: number | null): boolean {
  return last !== null && today === last;
}
