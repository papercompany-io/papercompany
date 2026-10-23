// OF-07 사무실(A-214부터 왼쪽 메뉴가 아니라 오른쪽 위 회사 카드의 이사가기 모달): 이전(DEC-020, 단계별 넓이·보증금·월세). 책상·가구는 상점에서 사서 직접 놓습니다(A-87).
// 화면 짜임(A-104): 위 회색 판(지금 사무실 · 책상 칸), 아래 매물 카드(몇 명 앉나 · 보증금·월세 · 이사 버튼)
// 화면(A-179): 커리어·업무와 같은 톤 — 가운데 큰 사무실 이름, 칸칸이 놓인 책상 칸, 납작한 회색 요약 칸, 매물 카드는 1px 테두리 납작한 면
import { useState } from 'react';
import { OFFICE_TIERS } from '../../core/data';
import { currentTier, deskCapacity, desks, moveBlock, moveOffice, officeComfort, seatsAvailable } from '../../core/office';
import { wonShort } from '../../core/format';
import { act, useGame } from '../store';
import { Help } from '../common';
import './apps.css';
import './skin/OfficeApp.css';

const ROOM: Record<string, string> = { lounge_small: '작은 휴게실', lounge: '휴게실', meeting: '회의실', meeting2: '회의실', kitchen: '탕비실', pingpong: '탁구대', gym: '헬스장', auditorium: '강당' };

export function OfficeApp() {
  const s = useGame();
  const cur = currentTier(s);
  const [msg, setMsg] = useState<string | null>(null);
  const all = desks(s);
  const used = all.filter((x) => x.occupant !== null).length;
  const room = seatsAvailable(s) - (all.length - used);
  const cap = deskCapacity(cur.id);
  return (
    <div className="col of of2">
      <section className="of2-seats">
        <div className="of-seats" aria-label={`책상 ${all.length}개 중 ${used}개 사용 중, 더 놓을 자리 ${room}개`}>
          {Array.from({ length: Math.min(cap, 50) }, (_, i) => (
            <i key={i} className={i < used ? 'sat' : i < all.length ? 'empty' : ''} />
          ))}
          {cap > 50 && <span>+{cap - 50}</span>}
        </div>
        <div className="of-legend">
          <span>
            <i className="sat" />
            앉은 책상 {used}
          </span>
          <span>
            <i className="empty" />
            빈 책상 {all.length - used}
          </span>
          <span>
            <i />더 놓을 자리 {room}
          </span>
        </div>
      </section>
      <div className="of2-stats">
        <div>
          <span>월세</span>
          <b>{wonShort(cur.rent)}</b>
        </div>
        <div>
          <span>쾌적도</span>
          <b>+{officeComfort(s)}</b>
        </div>
        <div>
          <span>책상 최대</span>
          <b>{cap}개</b>
        </div>
      </div>
      {s.company.movingUntil !== null && <div className="warn">이사 중입니다. 며칠 동안 일이 느려집니다.</div>}
      {msg && <div className="warn">{msg}</div>}

      <div className="of2-sect">
        사무실 이전
        <Help text="이전하면 지금 보증금을 돌려받고 새 보증금을 냅니다. 책상·가구는 들고 가서 새 사무실 빈 자리에 차례로 놓입니다(놓을 곳이 없는 가구는 보관함으로). 배치는 상점에서 다시 바꿀 수 있습니다." />
      </div>
      <div className="of-grid">
        {OFFICE_TIERS.map((t) => {
          const block = moveBlock(s, t.id);
          const here = t.id === s.company.officeTier;
          return (
            <div key={t.id} className={`of-card ${here ? 'here' : ''} ${!here && block ? 'blocked' : ''}`}>
              <div className="of2-card-head">
                <div className="of-name">{t.name}</div>
                {here && <span className="of-here">지금 여기</span>}
              </div>
              <div className="of-cap">
                <b>{deskCapacity(t.id)}명</b>까지 수용
              </div>
              <div className="of-tags">
                {t.comfort > 0 && <span>쾌적도 +{t.comfort}</span>}
                {[...new Set(t.rooms.map((r) => ROOM[r] ?? r))].map((r) => (
                  <span key={r}>{r}</span>
                ))}
              </div>
              <div className="of-money">
                <div className="fb-line">
                  <span>보증금</span>
                  <b>{t.deposit ? wonShort(t.deposit) : '없음'}</b>
                </div>
                <div className="fb-line">
                  <span>월세</span>
                  <b>{wonShort(t.rent)}</b>
                </div>
              </div>
              {!here &&
                (block ? (
                  <div className="of-block" title={block}>
                    {block.includes('자금') ? `자금이 부족합니다 · 필요 ${wonShort(t.deposit - cur.deposit + t.rent)}` : block}
                  </div>
                ) : (
                  <button
                    className="btn small"
                    data-testid={`move-${t.id}`}
                    onClick={() => {
                      const err = act((g) => moveOffice(g, t.id));
                      setMsg(err ?? null);
                    }}
                  >
                    이사
                  </button>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
