// OF-06 직원 클릭 정보 모달: 이름·부서·능력·만족도·건강·숙련·특성·지금 하는 일
// 화면(A-180): 직원 상세 톤(A-179)에 맞춘 머리 + 아래 행동 버튼(보너스·DM·연봉 인상·직원 관리). 결과는 버튼 위 한 줄로
// 화면(A-191): 한 줄 짜임 — 왼쪽 직원 정보, 오른쪽 그 직원 부서가 하는 일 페이지(팀 앱과 같은 DeptPage, 바로 조작). 오른쪽 사람 칩을 누르면 같은 팀의 다른 직원으로
// 화면(A-209): 한 칸 창 + 탭 — 기본은 "업무"(그 직원 부서가 하는 일), "직원 정보" 탭에 능력치·보너스·DM·연봉. 만족도·건강·숙련은 한 줄 세 칸의 작은 막대
// 화면(A-193): 머리는 색 띠·색 바탕 없이 흰 면 + 부서색 얼굴 타일. 입사·경력은 이름 아래 한 줄로 모아 아래 상세의 같은 줄을 뺌
import { useState } from 'react';
import { dept } from '../core/data';
import { formatDate } from '../core/calendar';
import { orderLabel } from '../core/orders';
import { bonusBlock, bonusCost, giveBonus, giveRaise } from '../core/staff';
import type { GameState } from '../core/types';
import { act, useGame } from './store';
import { Tabs } from './common';
import { PixelAvatar } from './office/Avatar';
import { EmployeeDetail } from './apps/EmployeesApp';
import { DeptPage, type OpenApp } from './apps/TeamApp';
import './apps/skin/EmployeeModal.css';

export function EmployeeModal({ id, onClose, onDm, onManage, openApp, onEmployee }: { id: string; onClose: () => void; onDm: (id: string) => void; onManage: () => void; openApp?: OpenApp; onEmployee?: (id: string) => void }) {
  const s = useGame();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [tab, setTab] = useState<'work' | 'info'>('work');
  const e = s.employees.find((x) => x.id === id);
  if (!e) return null;
  const kind = e.kind === 'cofounder' ? '코파운더' : e.kind === 'engineer' ? '파운딩 엔지니어' : '직원';
  const color = dept(e.dept).color;
  const bonusWhy = bonusBlock(s, e);
  const raiseWhy = s.day - e.lastRaiseDay < 90 ? '최근 90일 안에 이미 올려 주었습니다.' : null;
  const run = (fn: (g: GameState) => string | null, ok: string) => {
    const err = act(fn);
    setMsg(err ? { text: err, ok: false } : { text: ok, ok: true });
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className={`modal emp-modal epm ${openApp ? 'wide' : ''}`} data-testid="employee-modal" onClick={(ev) => ev.stopPropagation()} style={{ ['--dc' as string]: color }}>
        <div className="epm-head">
          <div className="epm-avatar">
            <PixelAvatar id={e.id} color={color} />
          </div>
          <div className="epm-id">
            <b className="epm-name">{e.name}</b>
            <span className="epm-kicker">
              {dept(e.dept).name}팀 · {e.lead ? '팀장' : kind} · 입사 {formatDate(e.joinedDay)} · 경력 {e.years}년
            </span>
            <span className="epm-now">
              지금 하는 일 <em data-testid="emp-status">{orderLabel(s, e.dept)}</em>
            </span>
          </div>
        {openApp && (
          <div className="epm-tabs">
          <Tabs
            tabs={[
              { id: 'work' as const, label: '업무', icon: 'case' },
              { id: 'info' as const, label: '직원 정보', icon: 'users' },
            ]}
            value={tab}
            onChange={setTab}
          />
          </div>
        )}
          <button className="epm-x" onClick={onClose} title="닫기" aria-label="닫기">
            ×
          </button>
        </div>
        {(!openApp || tab === 'info') && (
        <div className="epm-info">
        <div className="epm-body">
          <EmployeeDetail e={e} compact />
        </div>
        <div className="epm-foot">
          {msg && <div className={`epm-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
          <div className="epm-acts">
            <button
              className="btn epm-main"
              data-testid="employee-bonus"
              disabled={!!bonusWhy}
              title={bonusWhy ?? '월급 한 달치를 보너스로 줍니다. 만족도가 가득 차지만, 처우가 그대로면 차츰 원래대로 돌아옵니다.'}
              onClick={() => run((g) => giveBonus(g, e.id), `${e.name}님에게 보너스를 줬습니다. 만족도가 가득 찼습니다.`)}
            >
              <span>보너스 지급</span>
              <small>{Math.round(bonusCost(e) / 1e4).toLocaleString('ko-KR')}만원</small>
            </button>
            <button className="btn ghost" data-testid="employee-modal-dm" onClick={() => onDm(e.id)}>
              DM 보내기
            </button>
            <button className="btn ghost" data-testid="employee-modal-raise" disabled={!!raiseWhy} title={raiseWhy ?? '월급을 10% 올립니다.'} onClick={() => run((g) => giveRaise(g, e.id, 0.1), '월급을 10% 올렸습니다.')}>
              연봉 10% 인상
            </button>
          </div>
          <div className="epm-sub">
            <button className="epm-link" onClick={onManage}>
              팀장·부서 이동·해고는 직원 관리에서
            </button>
            <button className="btn small ghost" data-testid="employee-modal-close" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
        </div>
        )}
        {openApp && tab === 'work' && (
          <div className="epm-right" data-testid="employee-modal-work">
            <DeptPage d={e.dept} openApp={openApp} focusId={e.id} onEmployee={onEmployee} />
          </div>
        )}
      </div>
    </div>
  );
}
