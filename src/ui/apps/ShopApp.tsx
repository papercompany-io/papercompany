// OF-07 상점(A-87): 책상·가구를 사서 사무실 빈 바닥에 직접 놓습니다. 그림 타일을 누르면 창이 닫히고 사무실 화면이 배치 모드로 바뀝니다.
// Startup Company 구매 창처럼 위 분류 탭, 큰 그림 타일(올리면 이름·가격 말풍선, 오른쪽 위 보유 배지).
// 놓인 가구 타일을 누르면 옮기기, 보관 중인 가구는 다시 놓기.
// 화면(A-179, A-232): 커리어·업무와 같은 톤 — 알약 분류 탭, 그림 타일 아래 이름·가격(작은 글자는 픽셀 글꼴), 놓임 배지는 흰 픽셀 체크
import { useState } from 'react';
import { DATA } from '../../core/data';
import { buyFurnitureBlock, currentTier, desks, furnitureFits, furnitureItems, itemSize, placedItems } from '../../core/office';
import { wonShort } from '../../core/format';
import { useGame } from '../store';
import { itemThumb } from '../office/scene';
import type { EditRequest } from '../office/placement';
import './apps.css';
import { PixelCheck } from '../pixelMarks';
import './skin/ShopApp.css';

const CATS = [
  { id: 'desk', name: '책상' },
  { id: 'furn', name: '가구' },
  { id: 'equip', name: '장비' },
  { id: 'decor', name: '장식' },
  { id: 'facility', name: '시설' },
] as const;
type CatId = (typeof CATS)[number]['id'];

interface Tile {
  id: string;
  name: string;
  desc: string;
  price: number;
  comfort: number;
  state: 'buy' | 'stored' | 'placed';
  block: string | null; // 누를 수 없는 이유
  badge: string | null;
}

export function ShopApp({ onEdit }: { onEdit: (r: EditRequest) => void }) {
  const s = useGame();
  const [cat, setCat] = useState<CatId>('desk');
  const t = currentTier(s);
  const all = desks(s);
  const moving = s.company.movingUntil !== null ? '이사 중에는 배치를 바꿀 수 없습니다.' : null;

  const tiles: Tile[] =
    cat === 'desk'
      ? [
          {
            id: 'desk',
            name: '책상·PC',
            desc: '직원 한 명이 앉는 자리입니다. 여러 개를 이어서 놓을 수 있습니다.',
            price: DATA.furniture.deskPrice,
            comfort: 0,
            state: 'buy',
            block: moving ?? (all.length >= t.maxDesks ? `이 사무실에는 책상을 ${t.maxDesks}개까지 놓을 수 있습니다.` : s.cash < DATA.furniture.deskPrice ? '자금이 부족합니다.' : null),
            badge: all.length ? String(all.length) : null,
          },
        ]
      : furnitureItems()
          .filter((it) => (it as { cat?: string }).cat === cat)
          .map((it) => {
            const mine = placedItems(s).find((p) => p.item === it.id);
            const fits = furnitureFits(s, it);
            const state = !mine ? 'buy' : mine.gx === null ? 'stored' : 'placed';
            const block = moving ?? (state === 'buy' ? buyFurnitureBlock(s, it.id) : state === 'stored' && !fits ? '지금 사무실에서는 쓸 수 없습니다.' : null);
            return { id: it.id, name: it.name, desc: it.desc, price: it.price, comfort: it.comfort, state, block, badge: state === 'placed' ? '✓' : state === 'stored' ? '보관' : null };
          });

  const act = (x: Tile) => {
    if (x.block) return;
    onEdit(x.state === 'placed' ? { mode: 'move' } : { mode: 'place', item: x.id });
  };

  return (
    <div className="shop sh2">
      <div className="shop-bar">
        <div className="shop-tabs" role="tablist">
          {CATS.map((c) => (
            <button key={c.id} role="tab" className={cat === c.id ? 'on' : ''} data-testid={`shop-cat-${c.id}`} onClick={() => setCat(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="shop-grid">
        {tiles.map((x) => {
          const { w, h } = itemSize(x.id);
          return (
            <button
              key={x.id}
              className={`shop-tile ${x.state} ${x.block ? 'blocked' : ''}`}
              data-testid={x.id === 'desk' ? 'shop-desk' : x.state === 'stored' ? `place-${x.id}` : `buy-${x.id}`}
              aria-disabled={!!x.block}
              onClick={() => act(x)}
            >
              <img className="st-img" src={itemThumb(s, x.id)} alt="" draggable={false} />
              {x.badge && <span className={`st-badge ${x.state}`}>{x.state === 'placed' ? <PixelCheck /> : x.badge}</span>}
              <span className="sh2-cap">
                <b>{x.name}</b>
                <em>{x.state === 'buy' ? wonShort(x.price) : x.state === 'stored' ? '보관 중' : '놓여 있음'}</em>
              </span>
              <span className="st-tip" role="tooltip">
                <b>{x.name}</b>
                <span className="st-price">{x.state === 'buy' ? `가격 ${wonShort(x.price)}` : x.state === 'stored' ? '보관 중 · 눌러서 놓기' : '놓여 있음 · 눌러서 옮기기'}</span>
                <span className="st-meta">
                  {w}×{h}칸{x.comfort ? ` · 쾌적 +${x.comfort}` : ''}
                </span>
                <span className="st-desc">{x.desc}</span>
                {x.block && <span className="st-block">{x.block}</span>}
              </span>
            </button>
          );
        })}
      </div>

    </div>
  );
}
