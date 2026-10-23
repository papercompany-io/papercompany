// OF-06 직원 클릭 정보 모달: 이름·부서·능력·만족도·건강·숙련·특성·지금 하는 일
// 화면(A-180): 직원 상세 톤(A-179)에 맞춘 머리 + 아래 행동 버튼(보너스·DM·연봉 인상·직원 관리). 결과는 버튼 위 한 줄로
// 화면(A-191): 한 줄 짜임 — 왼쪽 직원 정보, 오른쪽 그 직원 부서가 하는 일 페이지(팀 앱과 같은 DeptPage, 바로 조작). 오른쪽 사람 칩을 누르면 같은 팀의 다른 직원으로
// 화면(A-209): 한 칸 창 + 탭 — 기본은 "업무"(그 직원 부서가 하는 일), "직원 정보" 탭에 능력치·보너스·DM·연봉. 만족도·건강·숙련은 한 줄 세 칸의 작은 막대
// 화면(A-193): 머리는 색 띠·색 바탕 없이 흰 면 + 부서색 얼굴 타일. 입사·경력은 이름 아래 한 줄로 모아 아래 상세의 같은 줄을 뺌
// 화면(A-230): 행동 버튼(보너스·연봉·팀장·DM·해고, 직원 관리와 같은 .act-row)은 머리 오른쪽 위로, 탭은 머리 아래 줄로. 어느 탭에서든 바로 누름. 해고는 한 번 더 확인
// 화면(A-234): 행동 버튼은 머리 아래 창 폭 한 줄로, 보상·역할·쉼·대화 묶음(.epm-grp) 사이에 구분선, 해고는 오른쪽 끝
import { useState } from 'react';
import { dept } from '../core/data';
import { formatDate } from '../core/calendar';
import { orderLabel } from '../core/orders';
import { severance } from '../core/employees';
import { bonusBlock, bonusCost, demoteLead, fire, giveBonus, giveRaise, promoteLead } from '../core/staff';
import type { GameState } from '../core/types';
import { act, useGame } from './store';
import { Tabs } from './common';
import { PixelAvatar } from './office/Avatar';
import { EmployeeDetail, LeaveButtons } from './apps/EmployeesApp';
import { DeptPage, hasSpecialWork, type OpenApp } from './apps/TeamApp';
import './apps/skin/EmployeeModal.css';

export function EmployeeModal({ id, onClose, onDm, onManage, openApp, onEmployee }: { id: string; onClose: () => void; onDm: (id: string) => void; onManage: () => void; openApp?: OpenApp; onEmployee?: (id: string) => void }) {
  const s = useGame();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [tab, setTab] = useState<'work' | 'info'>('work');
  const [confirmFire, setConfirmFire] = useState(false);
  const e = s.employees.find((x) => x.id === id);
  if (!e) return null;
  const kind = e.kind === 'cofounder' ? '코파운더' : e.kind === 'engineer' ? '파운딩 엔지니어' : '직원';
  const color = dept(e.dept).color;
  const showWork = !!openApp && hasSpecialWork(e.dept); // 일반 부서(개발·디자인 등)는 업무 탭 없이 직원 정보만(A-229)
  const bonusWhy = bonusBlock(s, e);
  const raiseWhy = s.day - e.lastRaiseDay < 90 ? '최근 90일 안에 이미 올려 주었습니다.' : null;
  const run = (fn: (g: GameState) => string | null, ok: string) => {
    const err = act(fn);
    setMsg(err ? { text: err, ok: false } : { text: ok, ok: true });
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className={`modal emp-modal epm ${showWork ? 'wide' : ''}`} data-testid="employee-modal" onClick={(ev) => ev.stopPropagation()} style={{ ['--dc' as string]: color }}>
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
          <div className="epm-acts act-row">
            {!confirmFire ? (
              <>
                <span className="epm-grp">
                  <button
                    className="btn small act-main"
                    data-testid="employee-bonus"
                    disabled={!!bonusWhy}
                    title={bonusWhy ?? '떨어진 만족도만큼 보너스를 줍니다(많이 떨어졌을수록 비쌈). 만족도가 가득 차지만, 처우가 그대로면 차츰 원래대로 돌아옵니다.'}
                    onClick={() => run((g) => giveBonus(g, e.id), `${e.name}님에게 보너스를 줬습니다. 만족도가 가득 찼습니다.`)}
                  >
                    보너스 <small>{Math.round(bonusCost(e) / 1e4).toLocaleString('ko-KR')}만원</small>
                  </button>
                  <button className="btn small ghost" data-testid="employee-modal-raise" disabled={!!raiseWhy} title={raiseWhy ?? '월급을 10% 올립니다.'} onClick={() => run((g) => giveRaise(g, e.id, 0.1), '월급을 10% 올렸습니다.')}>
                    연봉 10% 인상
                  </button>
                </span>
                <span className="epm-grp">
                  {!e.lead ? (
                    <button className="btn small ghost" data-testid="employee-modal-promote" onClick={() => run((g) => promoteLead(g, e.id), '팀장이 되었습니다(월급 15% 인상).')}>
                      팀장 세우기
                    </button>
                  ) : (
                    <button className="btn small ghost" onClick={() => run((g) => demoteLead(g, e.id), '팀장에서 내렸습니다.')}>
                      팀장 해제
                    </button>
                  )}
                </span>
                <span className="epm-grp">
                  <LeaveButtons e={e} run={run} />
                </span>
                <span className="epm-grp">
                  <button className="btn small ghost" data-testid="employee-modal-dm" onClick={() => onDm(e.id)}>
                    DM
                  </button>
                </span>
                {e.kind !== 'cofounder' && (
                  <button className="btn small act-danger" data-testid="employee-modal-fire" onClick={() => setConfirmFire(true)}>
                    해고
                  </button>
                )}
              </>
            ) : (
              <span className="epm-fire-ask">
                <span>위로금 {Math.round(severance(e) / 1e4).toLocaleString('ko-KR')}만원, 팀 분위기 하락</span>
                <button
                  className="btn small red"
                  data-testid="employee-modal-fire-confirm"
                  onClick={() => {
                    const err = act((g) => fire(g, e.id));
                    if (err) setMsg({ text: err, ok: false });
                    else onClose();
                  }}
                >
                  해고 확정
                </button>
                <button className="btn small ghost" onClick={() => setConfirmFire(false)}>
                  취소
                </button>
              </span>
            )}
          </div>
          <button className="epm-x" data-testid="employee-modal-close" onClick={onClose} title="닫기" aria-label="닫기">
            ×
          </button>
        </div>
        {msg && <div className={`epm-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
        {showWork && (
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
        {(!showWork || tab === 'info') && (
          <div className="epm-info">
            <div className="epm-body">
              <EmployeeDetail e={e} compact />
            </div>
          </div>
        )}
        {showWork && openApp && tab === 'work' && (
          <div className="epm-right" data-testid="employee-modal-work">
            <DeptPage d={e.dept} openApp={openApp} focusId={e.id} onEmployee={onEmployee} />
          </div>
        )}
      </div>
    </div>
  );
}
