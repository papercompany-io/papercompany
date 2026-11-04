// 플레이어 명령(재실행 기록용): 화면이 게임 상태를 바꾸는 모든 길을 이름 붙은 명령 하나로 모읍니다.
// 같은 시드 + 같은 명령 순서 = 같은 결과가 되도록, 화면은 act(g => ...) 대신 dispatch(명령)를 씁니다.
// 시간 흐름도 명령(tick)입니다. 실제 경과 시간은 기기마다 달라서 기록해 두어야 다시 돌릴 수 있습니다.
// 명령 값은 JSON으로 그대로 저장되므로 함수·객체 참조 대신 id·숫자·문자열만 담습니다.
import type { ActionId, DeptId, MarketId, PriceTier, Rot, StageId, WorkPolicy } from './types';
import type { CardId } from './meeting';
import type { DmAction } from './reactions';
import type { LeaveId } from './staff';
import type { PostingInput } from './hiring';
import type { TalkRead } from './talk';
import type { ChannelRead } from './chat';
import type { GameState } from './types';
import { advance, setSpeed } from './sim';
import { acquire } from './competitors';
import { answerSaid, postSaid, setEmpOrder } from './talk';
import { acceptAdCounter, adNegotiation, breakAdDeal, declineAdOffer, negotiateAd, setAdAutoRenew } from './adsales';
import { acceptSale, declineSale, startExit } from './exit';
import { addGrow, addToRoadmap, moveRoadmap, removeFromRoadmap } from './product';
import { acceptCounter, closePosting, createPosting, negotiate, negotiation, rejectApplicant, setAutoHire } from './hiring';
import { autoFinish, bringCompanion, leaveMeeting, playCard } from './meeting';
import { markRead } from './messenger';
import { acceptContract, dropContract, setContractAlert, setContractSquad, setContractStaff } from './contracts';
import { createSquad, removeSquad, renameSquad, setSquad, setSquadOrder } from './squads';
import { setCeoMode, setCeoWork } from './ceo';
import { applyForLoan, repayEarly } from './loans';
import { answerChannel, postChannelSaid } from './chat';
import { startBurning } from './burning';
import { commandOrder, dmAction } from './reactions';
import { resolveDecision } from './events';
import { acceptMilestone, cutScope, declineMilestone, dropMilestone, extendDeadline, pushTeam } from './milestones';
import { setChannelBudget, startCampaign } from './ads';
import { launchMarket, setAdBudget } from './market';
import { grantOptions, topUpEsop } from './equity';
import { chooseModel, setAdoption } from './aiadopt';
import { demoteLead, fire, giveBonus, giveRaise, promoteLead, sendLeave } from './staff';
import { acceptOffer, askCoInvest, cancelRound, closeForOffer, rejectOffer, requestDecision, sendLetter, startRound } from './funding';
import { moveDesk, moveFurniture, moveOffice, placeDesk, placeFurniture, removeDesk, rotateDesk, rotateFurniture, storeFurniture } from './office';
import { buyback, resign, sellShares, setGuidance } from './public';
import { acceptOuting, cancelOuting, declineOuting } from './outings';

export type Command =
  // 시간·멈춤
  | { type: 'tick'; ms: number; nightFast: boolean } // 화면 루프 한 프레임(advance)
  | { type: 'setSpeed'; speed: number }
  | { type: 'clearPause' } // 설정상 자동 일시정지를 끈 경우 화면이 멈춤 사유를 지움
  | { type: 'ackAngelOnStart' }
  // 알림·메신저
  | { type: 'markNoticeRead'; noticeId: string }
  | { type: 'markRead'; channelIds: string[] }
  | { type: 'postSaid'; empId: string; said: string }
  | { type: 'answerSaid'; empId: string; said: string; read: TalkRead | null } // read = LLM 해석 결과(기록해야 재실행이 같아짐)
  | { type: 'postChannelSaid'; channelId: string; said: string }
  | { type: 'answerChannel'; channelId: string; said: string; read: ChannelRead | null }
  | { type: 'dmAction'; empId: string; action: DmAction }
  | { type: 'setEmpOrder'; empId: string; orderId: string | null; channelId?: string }
  | { type: 'commandOrder'; dept: DeptId; orderId: string }
  | { type: 'setSquadOrder'; squadId: string; dept: DeptId; orderId: string | null }
  // 결정·미팅·일정
  | { type: 'resolveDecision'; decisionId: string; choice: number }
  | { type: 'playCard'; card: CardId; targetId?: string }
  | { type: 'bringCompanion'; empId: string | null }
  | { type: 'autoFinish' }
  | { type: 'leaveMeeting' }
  | { type: 'acceptOuting'; outingId: string; replace?: boolean; delegateId?: string }
  | { type: 'declineOuting'; outingId: string }
  | { type: 'cancelOuting'; outingId: string }
  | { type: 'setCeoWork'; work: ActionId }
  | { type: 'setCeoMode'; mode: 'founder' | 'executive' }
  | { type: 'acceptMilestone'; milestoneId: string; level?: number }
  | { type: 'declineMilestone'; milestoneId: string }
  | { type: 'cutScope'; milestoneId: string }
  | { type: 'extendDeadline'; milestoneId: string }
  | { type: 'pushTeam'; milestoneId: string }
  | { type: 'dropMilestone'; milestoneId: string }
  // 사람
  | { type: 'createPosting'; input: PostingInput }
  | { type: 'closePosting'; postingId: string }
  | { type: 'rejectApplicant'; applicantId: string }
  | { type: 'negotiate'; applicantId: string; salary: number; bonus: number } // 협상 상태가 없으면 먼저 엽니다
  | { type: 'acceptCounter'; applicantId: string }
  | { type: 'setAutoHire'; dept: DeptId; target: number }
  | { type: 'setAutoHireLevel'; level: string }
  | { type: 'fire'; empId: string }
  | { type: 'giveBonus'; empId: string }
  | { type: 'giveRaise'; empId: string; rate: number }
  | { type: 'promoteLead'; empId: string }
  | { type: 'demoteLead'; empId: string }
  | { type: 'grantOptions'; empId: string; shares: number }
  | { type: 'sendLeave'; empId: string; leave: LeaveId }
  | { type: 'startBurning' }
  | { type: 'toggleWelfare'; welfareId: string }
  | { type: 'setWorkPolicy'; policy: WorkPolicy }
  | { type: 'setRaiseRate'; rate: number }
  | { type: 'createSquad'; name: string; members: string[] }
  | { type: 'renameSquad'; squadId: string; name: string }
  | { type: 'removeSquad'; squadId: string }
  | { type: 'setSquad'; empId: string; squadId: string | null }
  // 제품·시장·광고
  | { type: 'addToRoadmap'; featureIds: string[] }
  | { type: 'addGrow'; featureId: string }
  | { type: 'removeFromRoadmap'; index: number }
  | { type: 'moveRoadmap'; index: number; dir: -1 | 1 }
  | { type: 'setPriceTier'; tier: PriceTier }
  | { type: 'launchMarket'; market: MarketId }
  | { type: 'setAdBudget'; market: MarketId; monthly: number }
  | { type: 'setAdAuto'; on: boolean }
  | { type: 'setChannelBudget'; market: MarketId; channel: string; monthly: number }
  | { type: 'startCampaign'; defId: string; market: MarketId; toneId: string }
  | { type: 'acquire'; competitorId: string }
  | { type: 'chooseModel'; modelId: string }
  | { type: 'setAdoption'; dept: DeptId; value: number }
  // 광고 판매
  | { type: 'openAdNegotiation'; offerId: string }
  | { type: 'negotiateAd'; offerId: string; ecpm: number; days: number }
  | { type: 'acceptAdCounter'; offerId: string }
  | { type: 'declineAdOffer'; offerId: string }
  | { type: 'setAdAutoRenew'; dealId: string; on: boolean }
  | { type: 'breakAdDeal'; dealId: string }
  // 외주
  | { type: 'acceptContract'; contractId: string }
  | { type: 'dropContract'; contractId: string }
  | { type: 'setContractAlert'; on: boolean }
  | { type: 'setContractStaff'; contractId: string; empId: string; on: boolean }
  | { type: 'setContractSquad'; contractId: string; squadId: string | null }
  // 돈·투자·상장·매각
  | { type: 'applyForLoan'; kind: 'policy' | 'bank' }
  | { type: 'repayEarly'; loanId: string }
  | { type: 'startRound'; stage: StageId; room: number; instrument: 'equity' | 'safe' }
  | { type: 'cancelRound'; roundId: string }
  | { type: 'closeForOffer'; roundId: string }
  | { type: 'acceptOffer'; roundId: string }
  | { type: 'rejectOffer'; roundId: string }
  | { type: 'sendLetter'; roundId: string; investorId: string; letterId: string; askId?: string }
  | { type: 'requestDecision'; roundId: string; investorId: string }
  | { type: 'askCoInvest'; roundId: string; investorId: string }
  | { type: 'topUpEsop'; pct: number }
  | { type: 'setGuidance'; optionId: string }
  | { type: 'sellShares'; fraction: number }
  | { type: 'buyback'; amount: number }
  | { type: 'resign' }
  | { type: 'startExit'; method: 'sale' | 'ipo' }
  | { type: 'acceptSale' }
  | { type: 'declineSale' }
  // 사무실
  | { type: 'moveOffice'; tierId: number }
  | { type: 'placeDesk'; gx: number; gy: number; rot: Rot }
  | { type: 'moveDesk'; deskId: string; gx: number; gy: number; rot?: Rot }
  | { type: 'rotateDesk'; deskId: string }
  | { type: 'removeDesk'; deskId: string }
  | { type: 'placeFurniture'; itemId: string; gx: number; gy: number; rot: Rot }
  | { type: 'moveFurniture'; placedId: string; gx: number; gy: number; rot?: Rot }
  | { type: 'rotateFurniture'; placedId: string }
  | { type: 'storeFurniture'; placedId: string };

export type CommandType = Command['type'];

// 명령 하나를 실행하고 코어 함수의 반환값(오류 문구, 협상 결과 등)을 그대로 돌려줍니다.
// 반환 형은 명령마다 다르므로 화면은 기존 act()와 같이 필요한 모양으로 읽습니다.
export function applyCommand(s: GameState, c: Command): unknown {
  switch (c.type) {
    case 'tick':
      return advance(s, c.ms, c.nightFast);
    case 'setSpeed':
      return setSpeed(s, c.speed);
    case 'clearPause':
      s.pauseReason = null;
      return;
    case 'ackAngelOnStart':
      s.wantsAngelOnStart = false;
      return;
    case 'markNoticeRead':
      for (const n of s.notices) if (n.id === c.noticeId) n.read = true;
      return;
    case 'markRead':
      for (const id of c.channelIds) markRead(s, id);
      return;
    case 'postSaid':
      return postSaid(s, c.empId, c.said);
    case 'answerSaid':
      return answerSaid(s, c.empId, c.said, c.read);
    case 'postChannelSaid':
      return postChannelSaid(s, c.channelId, c.said);
    case 'answerChannel':
      return answerChannel(s, c.channelId, c.said, c.read);
    case 'dmAction':
      return dmAction(s, c.empId, c.action);
    case 'setEmpOrder':
      return setEmpOrder(s, c.empId, c.orderId, c.channelId);
    case 'commandOrder':
      return commandOrder(s, c.dept, c.orderId);
    case 'setSquadOrder':
      return setSquadOrder(s, c.squadId, c.dept, c.orderId);
    case 'resolveDecision':
      return resolveDecision(s, c.decisionId, c.choice);
    case 'playCard':
      return playCard(s, c.card, c.targetId);
    case 'bringCompanion':
      return bringCompanion(s, c.empId);
    case 'autoFinish':
      return autoFinish(s);
    case 'leaveMeeting':
      return leaveMeeting(s);
    case 'acceptOuting':
      return acceptOuting(s, c.outingId, c.replace ?? false, c.delegateId);
    case 'declineOuting':
      return declineOuting(s, c.outingId);
    case 'cancelOuting':
      return cancelOuting(s, c.outingId);
    case 'setCeoWork':
      return setCeoWork(s, c.work);
    case 'setCeoMode':
      return setCeoMode(s, c.mode);
    case 'acceptMilestone':
      return acceptMilestone(s, c.milestoneId, c.level);
    case 'declineMilestone':
      return declineMilestone(s, c.milestoneId);
    case 'cutScope':
      return cutScope(s, c.milestoneId);
    case 'extendDeadline':
      return extendDeadline(s, c.milestoneId);
    case 'pushTeam':
      return pushTeam(s, c.milestoneId);
    case 'dropMilestone':
      return dropMilestone(s, c.milestoneId);
    case 'createPosting':
      return createPosting(s, c.input);
    case 'closePosting':
      return closePosting(s, c.postingId);
    case 'rejectApplicant':
      return rejectApplicant(s, c.applicantId);
    case 'negotiate': {
      const ap = s.applicants.find((x) => x.id === c.applicantId);
      if (ap) negotiation(s, ap);
      return negotiate(s, c.applicantId, c.salary, c.bonus);
    }
    case 'acceptCounter':
      return acceptCounter(s, c.applicantId);
    case 'setAutoHire':
      return setAutoHire(s, c.dept, c.target);
    case 'setAutoHireLevel':
      s.company.autoHireLevel = c.level;
      return;
    case 'fire':
      return fire(s, c.empId);
    case 'giveBonus':
      return giveBonus(s, c.empId);
    case 'giveRaise':
      return giveRaise(s, c.empId, c.rate);
    case 'promoteLead':
      return promoteLead(s, c.empId);
    case 'demoteLead':
      return demoteLead(s, c.empId);
    case 'grantOptions': {
      const e = s.employees.find((x) => x.id === c.empId);
      return e ? grantOptions(s, e, c.shares) : '직원을 찾지 못했습니다.';
    }
    case 'sendLeave':
      return sendLeave(s, c.empId, c.leave);
    case 'startBurning':
      return startBurning(s);
    case 'toggleWelfare':
      s.company.welfare = s.company.welfare.includes(c.welfareId) ? s.company.welfare.filter((x) => x !== c.welfareId) : [...s.company.welfare, c.welfareId];
      return;
    case 'setWorkPolicy':
      s.company.workPolicy = c.policy;
      return;
    case 'setRaiseRate':
      s.company.raiseRate = c.rate;
      return;
    case 'createSquad': {
      const id = createSquad(s, c.name);
      if (typeof id === 'string') for (const e of c.members) setSquad(s, e, id);
      return id;
    }
    case 'renameSquad':
      return renameSquad(s, c.squadId, c.name);
    case 'removeSquad':
      return removeSquad(s, c.squadId);
    case 'setSquad':
      return setSquad(s, c.empId, c.squadId);
    case 'addToRoadmap': {
      let err: string | null = null;
      for (const id of c.featureIds) err = addToRoadmap(s, id) ?? err;
      return err;
    }
    case 'addGrow':
      return addGrow(s, c.featureId);
    case 'removeFromRoadmap':
      return removeFromRoadmap(s, c.index);
    case 'moveRoadmap':
      return moveRoadmap(s, c.index, c.dir);
    case 'setPriceTier':
      s.product.priceTier = c.tier;
      return;
    case 'launchMarket':
      return launchMarket(s, c.market);
    case 'setAdBudget':
      return setAdBudget(s, c.market, c.monthly);
    case 'setAdAuto':
      s.company.adAuto = c.on;
      return;
    case 'setChannelBudget':
      return setChannelBudget(s, c.market, c.channel, c.monthly);
    case 'startCampaign':
      return startCampaign(s, c.defId, c.market, c.toneId);
    case 'acquire':
      return acquire(s, c.competitorId);
    case 'chooseModel':
      return chooseModel(s, c.modelId);
    case 'setAdoption':
      return setAdoption(s, c.dept, c.value);
    case 'openAdNegotiation': {
      const o = s.adSales?.offers.find((x) => x.id === c.offerId);
      if (o) adNegotiation(s, o);
      return;
    }
    case 'negotiateAd':
      return negotiateAd(s, c.offerId, c.ecpm, c.days);
    case 'acceptAdCounter':
      return acceptAdCounter(s, c.offerId);
    case 'declineAdOffer':
      return declineAdOffer(s, c.offerId);
    case 'setAdAutoRenew':
      return setAdAutoRenew(s, c.dealId, c.on);
    case 'breakAdDeal':
      return breakAdDeal(s, c.dealId);
    case 'acceptContract':
      return acceptContract(s, c.contractId);
    case 'dropContract':
      return dropContract(s, c.contractId);
    case 'setContractAlert':
      return setContractAlert(s, c.on);
    case 'setContractStaff':
      return setContractStaff(s, c.contractId, c.empId, c.on);
    case 'setContractSquad':
      return setContractSquad(s, c.contractId, c.squadId);
    case 'applyForLoan':
      return applyForLoan(s, c.kind);
    case 'repayEarly':
      return repayEarly(s, c.loanId);
    case 'startRound':
      return startRound(s, c.stage, c.room, c.instrument);
    case 'cancelRound':
      return cancelRound(s, c.roundId);
    case 'closeForOffer':
      return closeForOffer(s, c.roundId);
    case 'acceptOffer':
      return acceptOffer(s, c.roundId);
    case 'rejectOffer':
      return rejectOffer(s, c.roundId);
    case 'sendLetter':
      return sendLetter(s, c.roundId, c.investorId, c.letterId, c.askId);
    case 'requestDecision':
      return requestDecision(s, c.roundId, c.investorId);
    case 'askCoInvest':
      return askCoInvest(s, c.roundId, c.investorId);
    case 'topUpEsop':
      return topUpEsop(s, c.pct);
    case 'setGuidance':
      return setGuidance(s, c.optionId);
    case 'sellShares':
      return sellShares(s, c.fraction);
    case 'buyback':
      return buyback(s, c.amount);
    case 'resign':
      return resign(s);
    case 'startExit':
      return startExit(s, c.method);
    case 'acceptSale':
      return acceptSale(s);
    case 'declineSale':
      return declineSale(s);
    case 'moveOffice':
      return moveOffice(s, c.tierId);
    case 'placeDesk':
      return placeDesk(s, c.gx, c.gy, c.rot);
    case 'moveDesk':
      return moveDesk(s, c.deskId, c.gx, c.gy, c.rot);
    case 'rotateDesk':
      return rotateDesk(s, c.deskId);
    case 'removeDesk':
      return removeDesk(s, c.deskId);
    case 'placeFurniture':
      return placeFurniture(s, c.itemId, c.gx, c.gy, c.rot);
    case 'moveFurniture':
      return moveFurniture(s, c.placedId, c.gx, c.gy, c.rot);
    case 'rotateFurniture':
      return rotateFurniture(s, c.placedId);
    case 'storeFurniture':
      return storeFurniture(s, c.placedId);
  }
}
