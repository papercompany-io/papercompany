#!/bin/sh
# 제품 앱을 열고 넣을 수 있는 기능 중 앞쪽 N개를 로드맵에 넣습니다(플레이테스트 보조).
D="node playtest/do.mjs"; N=${1:-5}
$D key Tab >/dev/null; $D click t:app-product >/dev/null
for t in $($D eval "(() => [...document.querySelectorAll('[data-testid^=feat-]')].filter(x=>!x.disabled).slice(0,$N).map(x=>x.dataset.testid).join(' '))()" | sed 's/.*"value":"\([^"]*\)".*/\1/'); do $D click t:$t >/dev/null 2>&1; done
$D eval "(() => window.__pc().product.roadmap.map(r=>r.id).join(','))()" | sed 's/.*"value":"\([^"]*\)".*/\1/'
$D click t:app-close >/dev/null; $D key Escape >/dev/null
