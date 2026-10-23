// 화면(A-191): 팀 앱 — 사람이 있는 부서마다 알약 탭, 탭마다 그 부서가 하는 일 페이지(DeptPage).
// DeptPage는 사무실 직원 창 오른쪽에도 그대로 들어갑니다(왼쪽 직원 정보 + 오른쪽 그 직원 부서의 일, 바로 조작 가능).
// 부서마다 이미 있는 화면을 그대로 씀: 개발·디자인 = 개발 일정, 마케팅 = 광고 집행, 광고 운영 = 광고 판매, 세일즈 = 대기업 계약, 인사 = 위임 채용, AI연구 = AI 도입
import { useState } from 'react';
import { DEPT_IDS, dept, ordersFor } from '../../core/data';
import { deptMembers, deptUnlocked } from '../../core/employees';
import { deptOutput, leadInfo } from '../../core/staff';
import { orderOf } from '../../core/orders';
import { commandOrder } from '../../core/reactions';
import { deptCoverage } from '../../core/market';
import type { DeptId, GameState } from '../../core/types';
import { act, useGame } from '../store';
import { Tabs } from '../common';
import { PixelAvatar } from '../office/Avatar';
import type { AppId } from '../Desktop';
import { Ads } from './AdsPanel';
import { AdSales } from './AdSalesPanel';
import { Enterprise } from './MarketApp';
import { AutoHire } from './HiringApp';
import { Roadmap, productView } from './ProductApp';
import { AiApp } from './AiApp';
import './skin/TeamApp.css';

export type OpenApp = (app: AppId, arg?: string) => void;

// 팀 탭에 나오는 부서: 열렸고 사람이 있는 곳만
export function teamDepts(s: GameState): DeptId[] {
  return DEPT_IDS.filter((d) => deptUnlocked(s, d) && deptMembers(s, d).length > 0);
}

export function TeamApp({ initial, openApp }: { initial?: string; openApp: OpenApp }) {
  const s = useGame();
  const list = teamDepts(s);
  const [sel, setSel] = useState<DeptId | null>((initial as DeptId) ?? null);
  const d = sel && list.includes(sel) ? sel : list[0];
  if (!d)
    return (
      <div className="dpg-empty">
        <b>아직 팀이 없습니다</b>
        <span>채용에서 첫 직원을 뽑으면 부서마다 하는 일을 여기서 보고 바꿉니다.</span>
        <button className="btn small" data-testid="team-open-hiring" onClick={() => openApp('hiring')}>
          채용 열기
        </button>
      </div>
    );
  return (
    <div className="col">
      <Tabs tabs={list.map((x) => ({ id: `dept-${x}`, label: `${dept(x).name} ${deptMembers(s, x).length}` }))} value={`dept-${d}`} onChange={(t) => setSel(t.slice(5) as DeptId)} />
      <DeptPage d={d} openApp={openApp} />
    </div>
  );
}

// 부서 한 곳의 페이지: 위 띠(팀 이름·사람·맡은 일 지시) + 아래 그 부서가 하는 일 화면
export function DeptPage({ d, openApp, focusId, onEmployee }: { d: DeptId; openApp: OpenApp; focusId?: string; onEmployee?: (id: string) => void }) {
  const s = useGame();
  const [msg, setMsg] = useState<string | null>(null);
  const members = deptMembers(s, d);
  const li = leadInfo(s, d);
  const orders = ordersFor(d);
  const cur = orders.find((o) => o.id === orderOf(s, d));
  return (
    <div className="dpg" style={{ ['--dc' as string]: dept(d).color }} data-testid={`dept-page-${d}`}>
      <div className="dpg-head">
        <div className="dpg-title">
          <span className="dpg-dot" />
          <b>{dept(d).name}팀</b>
          <span className="dpg-meta">
            {members.length}명 · 팀장 {li.have}
            {li.needed > 0 ? ` / ${li.needed}` : ''} · 하루 작업량 {deptOutput(s, d).toFixed(1)}
          </span>
        </div>
        {orders.length > 0 && (
          <div className="dpg-order">
            <span className="hf-label">맡은 일</span>
            <select data-testid={`dept-order-${d}`} value={orderOf(s, d)} onChange={(e) => act((g) => commandOrder(g, d, e.target.value))}>
              {orders.map((o) => (
                <option key={o.id} value={o.id} disabled={s.company.stage < o.stage}>
                  {o.name}
                  {s.company.stage < o.stage ? ` (단계 ${o.stage})` : ''}
                </option>
              ))}
            </select>
            {cur && <span className="dpg-desc">{cur.desc}</span>}
          </div>
        )}
        <div className="dpg-people">
          {members.map((e) => (
            <button key={e.id} className={`dpg-person ${e.id === focusId ? 'on' : ''}`} disabled={!onEmployee} title={onEmployee ? `${e.name} 보기` : e.name} onClick={() => onEmployee?.(e.id)}>
              <PixelAvatar id={e.id} color={dept(d).color} size={26} />
              <span>
                {e.name}
                {e.lead ? ' · 팀장' : ''}
              </span>
            </button>
          ))}
        </div>
      </div>
      {msg && <div className="info dpg-msg">{msg}</div>}
      <div className="dpg-body">
        <DeptWork d={d} setMsg={setMsg} openApp={openApp} />
      </div>
    </div>
  );
}

function DeptWork({ d, setMsg, openApp }: { d: DeptId; setMsg: (m: string | null) => void; openApp: OpenApp }) {
  const s = useGame();
  switch (d) {
    case 'dev':
    case 'design':
      return <Roadmap s={s} v={productView(s)} openSchedule={() => openApp('schedule')} goFeatures={() => openApp('product', 'features')} />;
    case 'marketing':
      return <Ads setMsg={setMsg} />;
    case 'adops':
      return <AdSales setMsg={setMsg} />;
    case 'sales':
      return <Enterprise />;
    case 'hr':
      return <AutoHire />;
    case 'ai':
      return <AiApp />;
    case 'cs':
    case 'infra':
      return <Coverage d={d} openApp={openApp} />;
    default:
      return <div className="empty-note">이 팀은 따로 보는 화면이 없습니다. 위에서 맡은 일을 바꿉니다.</div>;
  }
}

// 고객지원·인프라: 사용자 수만큼 사람이 필요한 부서 — 지금 인원이 감당하는 정도(시장 창 "고객 한 명의 값"에 나오는 값과 같음)
function Coverage({ d, openApp }: { d: 'cs' | 'infra'; openApp: OpenApp }) {
  const s = useGame();
  const c = deptCoverage(s, d);
  const short = c < 0.95;
  return (
    <div className="dpg-cover">
      <div className="hf-label">{d === 'cs' ? '고객 문의를 감당하는 정도' : '서버·운영을 감당하는 정도'}</div>
      <div className="dpg-cover-row">
        <div className={`meter ${c < 0.7 ? 'bad' : short ? 'warnc' : ''}`}>
          <div style={{ width: `${c * 100}%` }} />
        </div>
        <b className={c < 0.7 ? 'fin-bad' : ''}>{Math.round(c * 100)}%</b>
      </div>
      <p className="ew-note">
        {!short
          ? '지금 인원으로 충분합니다. 사용자가 늘면 다시 모자랄 수 있습니다.'
          : d === 'cs'
            ? '모자라면 답이 늦어져 떠나는 고객이 늘어납니다. 고객지원 직원을 더 뽑으세요.'
            : '모자라면 장애가 잦아집니다. 인프라 직원을 더 뽑으세요.'}
      </p>
      {short && (
        <button className="btn small" onClick={() => openApp('hiring')}>
          채용 열기
        </button>
      )}
    </div>
  );
}
