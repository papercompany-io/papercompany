// 다음에 할 일 안내(주 타깃: 일반인·타이쿤 팬). 상태를 보고 가장 급한 한 줄을 고릅니다.
import { ceoWork } from '../core/ceo';
import { todayOuting } from '../core/outings';
import { paydayForecast } from '../core/forecast';
import { runwayMonths } from '../core/finance';
import { formatDate } from '../core/calendar';
import { josa } from '../core/format';
import { openRound, activeRound } from '../core/funding';
import { availableFeatures, canCharge, fxTotals, hasMvp, insightHave } from '../core/product';
import { growthRoom, launchedMarkets, totalUsers } from '../core/market';
import { isFull } from '../core/office';
import { leadInfo, avgSat } from '../core/staff';
import { DATA, featuresOf, industry } from '../core/data';
import { adSalesOf, adSalesOn } from '../core/adsales';
import type { DeptId, GameState } from '../core/types';

export function nextHint(s: GameState, desktopOpenedOnce: boolean): string {
  if (!desktopOpenedOnce) return '왼쪽 메뉴에서 일을 고릅니다. 창업하자마자 대표가 MVP(핵심 기능)를 만들기 시작합니다. "업무"에서 출시까지 남은 날을 확인하세요.';
  if (s.pauseReason) return `일시정지: ${s.pauseReason}. 확인한 뒤 ▶ 버튼(스페이스)으로 시간을 다시 흐르게 하세요.`;
  const open = s.decisions.filter((d) => !d.resolved);
  if (s.exitAttempt?.status === 'offer') return `${s.exitAttempt.buyer ?? '인수 희망 기업'}의 인수 제안이 와 있습니다. Exit 메뉴에서 수락하거나 거절하세요.`;
  const r = activeRound(s);
  if (r?.status === 'offer') return '투자 제안서가 와 있습니다. 투자 메뉴에서 수락하거나 거절하세요.';
  const fc = paydayForecast(s);
  if (fc.cashAfter <= 0) return `이대로면 다음 월급일(${formatDate(s.day + fc.daysLeft)})에 자금이 약 ${Math.round(fc.cashAfter / 1e4).toLocaleString('ko-KR')}만원이 되어 파산합니다. 투자를 받거나 광고비·인원을 줄이세요.`;
  const rw = runwayMonths(s);
  if (rw !== null && rw < 3 && !r && !s.public) return `자금이 약 ${rw.toFixed(1)}개월분 남았습니다. 투자 메뉴에서 라운드를 열거나(SAFE도 가능) 비용을 줄이세요.`;
  if (hasMvp(s) && s.product.bugs > 60 && s.company.orders.dev !== 'dev_stabilize') return `제품 품질 ${Math.round(100 - s.product.bugs)}점: 버그 때문에 고객이 떠나고 있습니다. 메신저 #개발팀에서 "안정화·버그 수정"을 맡기세요.`;
  const or0 = openRound(s);
  if (or0 && !or0.leadId && or0.endDay - s.day <= 10) return `라운드 마감 ${or0.endDay - s.day}일 전: 리드 투자사가 없으면 라운드가 실패합니다. 투자 메뉴에서 "투자 결정 요청"을 하세요.`;
  if (hasMvp(s) && s.product.roadmap.length === 0 && availableFeatures(s).length === 0 && insightHave(s, 'insight') < 40) return '새 기능을 착수할 고객 인사이트가 모자랍니다. 인사이트는 고객이 쓸수록 쌓이고, 메신저 #고객지원팀에 "의견 수집"을 맡기면 더 빨리 쌓입니다. 수익화 기능은 돈을 내는 고객에게서 쌓이는 지불 의사 인사이트가 필요합니다.';
  if (open.length) return `답을 기다리는 결정이 ${open.length}건 있습니다(메신저). 기한이 지나면 기본 선택이 적용됩니다.`;
  const or = openRound(s);
  if (or) {
    if (Object.keys(or.letters).length === 0) return '라운드 진행 중: 투자 메뉴의 투자사 목록에서 레터를 보내 이야기를 시작하세요.';
    if (!or.leadId) return '라운드 진행 중: 레터로 관심을 높인 뒤 "투자 결정 요청"을 누르세요. 선호 단계가 맞는 투자사가 유리합니다.';
    return '리드 투자사가 정해졌습니다. 공동 투자를 제안하거나 라운드를 마감해 제안서를 받으세요.';
  }
  if (!hasMvp(s)) {
    if (s.product.roadmap.length === 0) return '제품 메뉴의 만드는 순서가 비었습니다. 핵심 기능을 넣으세요. 핵심 기능을 모두 만들면 MVP가 출시됩니다.';
    if (ceoWork(s) !== 'dev' && !todayOuting(s) && !s.employees.some((e) => e.dept === 'dev')) return '개발할 사람이 없습니다. 사무실의 대표(나)를 눌러 주 업무를 "개발"로 바꾸거나 개발자를 뽑으세요.';
    if (s.contracts?.active && ceoWork(s) !== 'contract' && s.company.orders.dev !== 'dev_contract') return `받은 외주 "${s.contracts.active.title}"가 멈춰 있습니다. 사무실의 대표(나)를 눌러 주 업무를 "외주"로 바꾸거나 개발팀에 맡기세요.`;
    if (!s.contracts?.active && s.contracts?.offers.length && s.cash < 30000000) return '돈이 빠듯합니다. "업무" 창의 외주 탭에서 일감을 받고 주 업무를 "외주"로 바꾸면 MVP를 만드는 동안 대금으로 버틸 수 있습니다.';
    return 'MVP를 만드는 중입니다. 제품 메뉴에서 출시까지 남은 날을 확인하세요. 그동안 투자 유치(엔젤·SAFE)나 채용을 준비할 수 있습니다.';
  }
  // A-111: 출시했어도 결제 기능이 없으면 무료로만 씁니다
  if (!canCharge(s)) {
    const bill = featuresOf(s.company.industry).find((f) => f.fx.billing);
    const queued = bill && s.product.roadmap.some((r) => r.id === bill.id);
    return queued ? `"${bill!.name}" 기능을 만드는 중입니다. 다 만들면 그때부터 돈을 받습니다.` : `출시했지만 결제 기능이 없어 아직 돈을 받지 못합니다. 제품 메뉴 기능 탭에서 "${bill?.name ?? '결제'}" 기능을 만드세요.`;
  }
  // A-182 광고 판매 산업: 광고 자리 → 광고 운영 담당자 → 광고주 제안 순으로 안내
  if (adSalesOn(s) && totalUsers(s) >= 1) {
    const fx = fxTotals(s);
    const banner = featuresOf(s.company.industry).find((f) => f.fx.adFormat === 'banner');
    if (!fx.adFormats.length && !s.product.roadmap.some((r) => r.id === banner?.id)) return `광고 자리가 없어 매출이 거의 없습니다. 이 앱은 광고로 법니다. 제품 메뉴 기능 탭에서 "${banner?.name ?? '배너 광고'}"부터 만드세요.`;
    if (fx.adFormats.length && s.company.stage >= 1 && !s.employees.some((e) => e.dept === 'adops')) return '광고 자리가 생겼지만 광고주와 계약하지 않은 자리는 광고 네트워크가 싸게 채웁니다. 채용 메뉴에서 "광고 운영"(애드옵스 매니저)을 뽑으면 광고주가 직접 계약을 제안합니다.';
    const offers = adSalesOf(s).offers.filter((o) => !o.left).length;
    if (offers) return `오늘의 광고주 제안이 ${offers}건 있습니다. 시장·광고 메뉴 "광고 판매" 탭에서 단가와 기간을 흥정하세요. 흥정하지 않은 제안은 내일 새 제안으로 바뀝니다.`;
  }
  const waiting = s.applicants.filter((a) => a.status === 'waiting').length;
  if (waiting > 0) return `채용 메뉴에 지원자 ${waiting}명이 기다리고 있습니다. 오래 두면 다른 회사로 떠납니다.`;
  if (s.product.roadmap.length === 0) return '로드맵이 비었습니다. 제품 메뉴에서 다음 기능을 넣으세요. 경쟁사는 계속 따라옵니다.';
  if (totalUsers(s) < 1) return 'MVP가 나왔습니다! 시장·광고 메뉴에서 광고 예산을 정하거나, 사무실의 대표(나)를 눌러 주 업무를 "영업"으로 바꿔 첫 고객을 모으세요.';
  if (s.product.bugs > 40) return `버그가 많습니다(품질 ${Math.round(100 - s.product.bugs)}점). 개발팀에 "안정화·버그 수정"을 맡기세요. 버그는 이탈과 장애를 부릅니다.`;
  const kr = s.markets.kr;
  if (kr.flow && kr.users >= kr.flow.target * 0.9 && kr.awareness < 0.1 && s.plHistory.length >= 2) {
    const hasMkt = s.employees.some((e) => e.dept === 'marketing');
    return `고객이 지금 알려진 만큼은 거의 다 왔습니다. 인지도 ${(kr.awareness * 100).toFixed(1)}% — ${hasMkt ? '광고 예산을 늘리거나 디자인팀에 "브랜드 디자인"을 맡기세요' : '마케터를 뽑아 "콘텐츠·PR"을 맡기거나 광고 예산을 쓰세요'}. 업무 창 상태 탭에서 고객이 들고 나는 길과 떠나는 이유를 볼 수 있습니다.`;
  }
  // A-196 받쳐 주는 만큼 찼는데 기능 레벨을 올리는 중이 아니면: 어디서 올리는지
  if (s.plHistory.length >= 2 && growthRoom(s).state !== 'room' && growthRoom(s).state !== 'near' && !s.product.roadmap.some((r) => r.grow)) {
    const r = growthRoom(s);
    return `제품이 받쳐 주는 ${industry(s.company.industry).unit}${josa(industry(s.company.industry).unit, '이')} ${Math.round((r.users / Math.max(1, r.target)) * 100)}% 찼습니다. 제품 메뉴 기능 탭에서 기능 카드의 "레벨업"을 누르면 매력도가 올라 더 받을 수 있습니다.${r.closed.length && s.company.stage >= 3 ? ' 해외 시장 진출도 방법입니다.' : ''}`;
  }
  if (isFull(s) && s.company.officeTier < 5) return '책상을 더 놓을 수 없습니다. 사무실 메뉴에서 더 큰 사무실로 옮기세요.';
  for (const d of DATA.depts.departments.map((x) => x.id as DeptId)) {
    const li = leadInfo(s, d);
    if (li.needed > li.have) return `${DATA.depts.departments.find((x) => x.id === d)!.name}팀이 커져서 팀장이 필요합니다. 직원 관리 메뉴에서 팀장을 세우세요.`;
  }
  if (s.employees.length >= 2 && (s.company.placed?.length ?? 1) === 0) return '사무실이 휑합니다. 상점에서 화분·정수기 같은 가구를 사서 놓으면 쾌적도가 올라 직원 만족·건강이 좋아집니다.';
  if (s.employees.length >= 5 && avgSat(s) < 50) return `직원 만족도가 낮습니다(평균 ${Math.round(avgSat(s))}). 월급·복지·근무 방침을 살펴보세요. 낮으면 퇴사가 늘어납니다.`;
  if (!s.fundingStage && !s.safes.length && s.career.challenge !== 'bootstrap') return '고객이 생기면 기업가치가 올라갑니다. 투자 메뉴에서 시드(또는 SAFE)로 성장 자금을 받을 수 있습니다. 투자 없이 매출로 키우는 길도 있습니다.';
  // 중후반 전략 안내(A-75): 지금 회사에서 아직 안 쓴 큰 성장 수단을 하나 짚어 줍니다.
  const fx = fxTotals(s);
  const ent = featuresOf(s.company.industry).find((f) => f.cat === 'enterprise');
  if (s.company.stage >= 2 && ent && !fx.enterprise && industry(s.company.industry).entBase > 0) return `대기업 계약은 한 건이 큰 매출입니다. 제품 메뉴에서 대기업용 기능(${ent.name} 등)을 만들고 세일즈팀에 "대기업 영업"을 맡겨 보세요.`;
  if (s.company.stage >= 2 && fx.enterprise && s.enterprise.length === 0 && s.company.orders.sales !== 'sales_enterprise' && ceoWork(s) !== 'enterprise') return '대기업용 기능이 준비됐습니다. 세일즈팀에 "대기업 영업"을 맡기거나, 경영 모드에서 대표 주 업무를 "대기업 영업"으로 하세요.';
  const foreign = launchedMarkets(s).length;
  if (s.company.stage >= 3 && foreign === 1) return '국내 시장만으로는 점유율 상한이 있습니다. 제품 메뉴의 현지화 기능을 만들고 시장·광고 메뉴에서 해외 시장(일본·동남아부터)에 진출해 보세요.';
  if (s.company.stage >= 3 && !s.public && s.company.ipoReady < 50) return `상장하려면 재무법무팀의 "상장 준비"가 필요합니다(지금 준비도 ${Math.round(s.company.ipoReady)}). 재무법무 직원을 뽑고 지시하세요.`;
  const rw2 = runwayMonths(s);
  if (!s.public && rw2 !== null && rw2 < 9 && !r) return `런웨이 ${rw2.toFixed(1)}개월. 성장 중이라면 다음 라운드를 미리 여세요 — 런웨이가 짧을수록 협상력(매각가·투자 확률)이 떨어집니다.`;
  return '미션을 따라가 보세요. 로드맵·채용·마케팅으로 회사를 키우고, 기업가치가 충분히 크면 Exit 메뉴에서 매각이나 IPO를 시도할 수 있습니다.';
}
