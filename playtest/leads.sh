#!/bin/sh
# 팀장이 모자란 부서마다 실력 좋은 직원을 팀장으로(직원 관리 앱, 플레이테스트 보조)
D="node playtest/do.mjs"
IDS=$($D eval "(() => { const s=window.__pc(); const out=[]; const by={}; for (const e of s.employees) (by[e.dept]=by[e.dept]||[]).push(e); for (const [d,es] of Object.entries(by)) { const n=es.length, have=es.filter(e=>e.lead).length, need=Math.floor(n/6); const c=es.filter(e=>!e.lead&&e.kind==='staff').sort((a,b)=>b.skill-a.skill); for (let i=0;i<need-have&&i<c.length;i++) out.push(c[i].id); } return out.join(' '); })()" | sed 's/.*"value":"\([^"]*\)".*/\1/')
$D key Tab >/dev/null; $D click t:app-employees >/dev/null
for id in $IDS; do $D click t:emp-row-$id >/dev/null 2>&1; $D click t:promote >/dev/null 2>&1; done
echo "promoted: $IDS"
$D click t:app-close >/dev/null; $D key Escape >/dev/null
