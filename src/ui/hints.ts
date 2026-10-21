// 다음에 할 일 안내(주 타깃: 일반인·타이쿤 팬). 상태를 보고 가장 급한 한 줄을 고릅니다.
import { hasMvp } from '../core/data';
import { runwayMonths } from '../core/finance';
import { openRound, activeRound } from '../core/funding';
import { runningInstruction } from '../core/instructions';
import type { GameState } from '../core/types';

export function nextHint(s: GameState, desktopOpenedOnce: boolean): string {
  if (!desktopOpenedOnce) return '사무실에서 나(CEO)를 클릭해 컴퓨터를 여세요. 모든 업무는 컴퓨터의 앱으로 합니다.';
  if (s.pauseReason) return `일시정지: ${s.pauseReason}. 확인한 뒤 ▶ 버튼으로 시간을 다시 흐르게 하세요.`;
  const rw = runwayMonths(s);
  const r = activeRound(s);
  if (r?.status === 'offer') return '투자 제안서가 와 있습니다. 투자 앱에서 수락하거나 거절하세요.';
  if (rw !== null && rw < 2 && !r) return `자금이 약 ${rw.toFixed(1)}개월분 남았습니다. 투자 앱에서 라운드를 열거나 매출을 늘리세요. 자금 0 이하로 월급일(매월 1일)을 넘기면 파산합니다.`;
  const open = openRound(s);
  if (open) {
    const threads = Object.values(open.letters);
    if (threads.length === 0) return '라운드 진행 중: 투자 앱의 투자사 목록에서 레터를 보내 이야기를 시작하세요.';
    if (!open.leadId) return '라운드 진행 중: 레터로 관심을 높인 뒤 "투자 결정 요청"을 누르세요. 선호 단계가 맞는 투자사가 유리합니다.';
    return '리드 투자사가 정해졌습니다. 다른 투자사에 공동 투자를 제안(클럽딜)하거나 라운드를 마감하고 제안서를 받으세요.';
  }
  const devMembers = s.employees.filter((e) => e.dept === 'dev').length;
  if (!hasMvp(s)) {
    if (devMembers > 0 && !runningInstruction(s, 'dev')) return '개발팀이 쉬고 있습니다. 메신저의 개발팀 채널에서 "제품 개발 스프린트"를 지시하세요.';
    if (s.ceoAlloc.dev === 0) return '아직 MVP가 없습니다. 일정 앱에서 대표 행동 칸을 개발에 배분하세요(제품 점수 100이면 MVP).';
    return `MVP까지 제품 점수 ${Math.max(0, 100 - s.productPoints).toFixed(0)}점 남았습니다. 개발 지시와 대표 개발 시간으로 채우세요.`;
  }
  if (Math.floor(s.customers) === 0) return 'MVP가 나왔습니다! 일정 앱에서 영업에 칸을 배분하거나, 세일즈·마케팅 직원을 뽑아 고객을 모으세요.';
  const salesIdle = s.employees.some((e) => e.dept === 'sales') && !runningInstruction(s, 'sales');
  if (salesIdle) return '세일즈팀이 쉬고 있습니다. 메신저 세일즈팀 채널에서 "신규 고객 영업"을 지시하세요.';
  if (!s.fundingStage) return '매출이 생기면 기업가치가 올라갑니다. 투자 앱에서 시드 라운드를 열어 성장 자금을 받아 보세요.';
  return '채용으로 팀을 키우고, 팀 채널에서 지시를 내려 매출을 늘리세요. 기업가치가 충분히 크면 Exit 앱에서 매각이나 IPO를 시도할 수 있습니다.';
}
