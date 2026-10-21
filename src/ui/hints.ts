// 다음에 할 일 안내(주 타깃: 일반인·타이쿤 팬). 상태를 보고 가장 급한 한 줄을 고릅니다.
import { paydayForecast } from '../core/forecast';
import { runwayMonths } from '../core/finance';
import { formatDate } from '../core/calendar';
import { openRound, activeRound } from '../core/funding';
import { hasMvp } from '../core/product';
import { totalUsers } from '../core/market';
import { isFull } from '../core/office';
import { leadInfo, avgSat } from '../core/staff';
import { DATA } from '../core/data';
import type { DeptId, GameState } from '../core/types';

export function nextHint(s: GameState, desktopOpenedOnce: boolean): string {
  if (!desktopOpenedOnce) return '사무실에서 나(CEO)를 클릭하거나 Tab 키로 컴퓨터를 여세요. 모든 업무는 컴퓨터의 앱으로 합니다.';
  if (s.pauseReason) return `일시정지: ${s.pauseReason}. 확인한 뒤 ▶ 버튼(스페이스)으로 시간을 다시 흐르게 하세요.`;
  const open = s.decisions.filter((d) => !d.resolved);
  if (s.exitAttempt?.status === 'offer') return `${s.exitAttempt.buyer ?? '인수 희망 기업'}의 인수 제안이 와 있습니다. Exit 앱에서 수락하거나 거절하세요.`;
  const r = activeRound(s);
  if (r?.status === 'offer') return '투자 제안서가 와 있습니다. 투자 앱에서 수락하거나 거절하세요.';
  const fc = paydayForecast(s);
  if (fc.cashAfter <= 0) return `⚠ 이대로면 다음 월급일(${formatDate(s.day + fc.daysLeft)})에 자금이 약 ${Math.round(fc.cashAfter / 1e4).toLocaleString('ko-KR')}만원이 되어 파산합니다. 투자를 받거나 광고비·인원을 줄이세요.`;
  const rw = runwayMonths(s);
  if (rw !== null && rw < 3 && !r && !s.public) return `자금이 약 ${rw.toFixed(1)}개월분 남았습니다. 투자 앱에서 라운드를 열거나(SAFE도 가능) 비용을 줄이세요.`;
  if (open.length) return `답을 기다리는 결정이 ${open.length}건 있습니다(메신저). 기한이 지나면 기본 선택이 적용됩니다.`;
  const or = openRound(s);
  if (or) {
    if (Object.keys(or.letters).length === 0) return '라운드 진행 중: 투자 앱의 투자사 목록에서 레터를 보내 이야기를 시작하세요.';
    if (!or.leadId) return '라운드 진행 중: 레터로 관심을 높인 뒤 "투자 결정 요청"을 누르세요. 선호 단계가 맞는 투자사가 유리합니다.';
    return '리드 투자사가 정해졌습니다. 공동 투자를 제안하거나 라운드를 마감해 제안서를 받으세요.';
  }
  if (!hasMvp(s)) {
    if (s.product.roadmap.length === 0) return '제품 앱에서 핵심(core) 기능을 로드맵에 넣으세요. 핵심 기능을 모두 만들면 MVP가 출시됩니다.';
    if (s.ceoAlloc.dev === 0 && !s.employees.some((e) => e.dept === 'dev')) return '개발할 사람이 없습니다. 일정 앱에서 대표 "개발" 칸을 늘리거나 개발자를 뽑으세요.';
    return 'MVP를 만드는 중입니다. 제품 앱에서 진행률을 확인하세요. 그동안 투자 유치(엔젤·SAFE)나 채용을 준비할 수 있습니다.';
  }
  const waiting = s.applicants.filter((a) => a.status === 'waiting').length;
  if (waiting > 0) return `채용 앱에 지원자 ${waiting}명이 기다리고 있습니다. 오래 두면 다른 회사로 떠납니다.`;
  if (s.product.roadmap.length === 0) return '로드맵이 비었습니다. 제품 앱에서 다음 기능을 넣으세요. 경쟁사는 계속 따라옵니다.';
  if (totalUsers(s) < 1) return 'MVP가 나왔습니다! 시장 앱에서 광고 예산을 정하거나, 일정 앱에서 대표 "영업" 칸을 늘려 첫 고객을 모으세요.';
  if (s.product.bugs > 40) return `버그가 많습니다(품질 ${Math.round(100 - s.product.bugs)}점). 개발팀에 "안정화·버그 수정"을 맡기세요. 버그는 이탈과 장애를 부릅니다.`;
  if (isFull(s) && s.company.officeTier < 5) return '좌석이 꽉 찼습니다. 부동산 앱에서 더 큰 사무실로 옮기면 좌석과 새 부서 구역이 생깁니다.';
  for (const d of DATA.depts.departments.map((x) => x.id as DeptId)) {
    const li = leadInfo(s, d);
    if (li.needed > li.have) return `${DATA.depts.departments.find((x) => x.id === d)!.name}팀이 커져서 팀장이 필요합니다. 직원 관리 앱에서 팀장을 세우세요.`;
  }
  if (s.employees.length >= 5 && avgSat(s) < 50) return `직원 만족도가 낮습니다(평균 ${Math.round(avgSat(s))}). 월급·복지·근무 방침을 살펴보세요. 낮으면 퇴사가 늘어납니다.`;
  if (!s.fundingStage && !s.safes.length && s.career.challenge !== 'bootstrap') return '고객이 생기면 기업가치가 올라갑니다. 투자 앱에서 시드(또는 SAFE)로 성장 자금을 받을 수 있습니다. 투자 없이 매출로 키우는 길도 있습니다.';
  return '미션을 따라가 보세요. 로드맵·채용·마케팅으로 회사를 키우고, 기업가치가 충분히 크면 Exit 앱에서 매각이나 IPO를 시도할 수 있습니다.';
}
