#!/bin/sh
# 라운드 열기 → 레터 → 리드가 정해질 때까지 결정 요청 → 공동 투자 → 마감·수락(플레이테스트 보조). 인자: 단계 룸 투자사...
D="node playtest/do.mjs"; ST=$1; ROOM=$2; shift 2
$D key Tab >/dev/null; $D click t:app-invest >/dev/null; $D select t:round-stage $ST >/dev/null; $D click t:inst-equity >/dev/null 2>&1; $D range t:room-slider $ROOM >/dev/null; $D click t:round-open >/dev/null; $D click "text=투자사 목록" >/dev/null
for inv in "$@"; do for l in intro proposal material club; do $D click t:letter-$inv-$l >/dev/null 2>&1; done; done
for inv in "$@"; do L=$($D eval "(() => window.__pc().rounds.slice(-1)[0].leadId)()" | sed 's/.*"value":\([^,]*\),.*/\1/'); [ "$L" != "null" ] && break; $D click t:decide-$inv >/dev/null 2>&1; done
for inv in "$@"; do $D click t:coinvest-$inv >/dev/null 2>&1; done
$D eval "(() => { const r = window.__pc().rounds.slice(-1)[0]; return r.stage+' pre '+Math.round(r.preValue/1e8)+'억 lead '+r.leadId+' '+Object.values(r.letters).map(t=>t.investorId+':'+t.decision+':'+(t.decisionP?t.decisionP.toFixed(2):'')).join(' '); })()" | sed 's/.*"value":"\([^"]*\)".*/\1/'
$D click "text=라운드 · 진행 중" >/dev/null 2>&1; $D click t:round-close-offer >/dev/null 2>&1; $D click t:offer-accept >/dev/null 2>&1 || $D click t:round-cancel >/dev/null 2>&1; $D click t:pause-resume >/dev/null 2>&1
$D click t:app-close >/dev/null; $D key Escape >/dev/null
