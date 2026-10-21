// 플레이테스트 보조: 정한 시간(초) 동안 배속으로 진행하며, 긴급 결정 창이 뜨면 규칙으로 답하고(가장 싼 선택),
// 단순 일시정지는 계속을 누릅니다. 상태 요약을 줄마다 출력합니다. 사람이 하는 전략 조작은 do.mjs로 따로 합니다.
//   node playtest/step.mjs <초> [배속키 1|2|3]
import http from 'http';
const secs = Number(process.argv[2] ?? 30);
const speedKey = process.argv[3] ?? '3';
function send(cmd) {
  return new Promise((res) => {
    const req = http.request({ host: '127.0.0.1', port: 7777, method: 'POST', path: '/' }, (r) => {
      let b = '';
      r.on('data', (d) => (b += d));
      r.on('end', () => res(JSON.parse(b)));
    });
    req.end(JSON.stringify(cmd));
  });
}
const Q = `(() => { const s = window.__pc(); if (!s) return null; const open = s.decisions.filter(d => !d.resolved); return JSON.stringify({ day: s.day, ended: s.ended, stage: s.company.stage, cash: Math.round(s.cash/1e4), users: Math.round(Object.values(s.markets).reduce((a,m)=>a+m.users,0)), emp: s.employees.length, pause: s.pauseReason, urgent: open.filter(d=>d.urgent).map(d=>({id:d.id, text:d.text.slice(0,40), choices:d.choices.map(c=>[c.label,c.cost,c.enabled])})), open: open.length, exit: s.exitAttempt && s.exitAttempt.status }); })()`;
const t0 = Date.now();
await send({ action: 'key', key: speedKey, label: 'speed', noshot: true });
while (Date.now() - t0 < secs * 1000) {
  await send({ action: 'wait', wait: 3000, label: 'step', noshot: true });
  const r = await send({ action: 'eval', target: Q, label: 'q', noshot: true });
  const st = r.value ? JSON.parse(r.value) : null;
  if (!st || st.ended) { console.log('끝', st); break; }
  if (st.urgent.length) {
    const d = st.urgent[0];
    let best = 0, bestCost = Infinity;
    d.choices.forEach((c, i) => { if (c[2] && c[1] < bestCost) { best = i; bestCost = c[1]; } });
    console.log(`긴급 결정 day ${st.day}: ${d.text} → ${d.choices[best][0]}`);
    await send({ action: 'click', target: `t:choice-${best}`, label: 'urgent-choice' }).catch(() => {});
  }
  if (st.pause && !st.urgent.length) {
    console.log(`일시정지 day ${st.day}: ${st.pause}`);
    if (st.exit === 'offer') break; // 인수 제안은 사람이 판단
    if (st.pause.includes('제안서')) break; // 투자 제안서는 사람이 판단
    if (st.pause.includes('파산')) break; // 파산 경고도 사람이 판단
    await send({ action: 'click', target: 't:pause-resume', label: 'resume' }).catch(() => {});
    await send({ action: 'key', key: speedKey, label: 'speed', noshot: true });
  }
  console.log(`day ${st.day} 단계 ${st.stage} 자금 ${st.cash}만 고객 ${st.users} 직원 ${st.emp} 결정대기 ${st.open}`);
}
await send({ action: 'click', target: 't:speed-0', label: 'pause', noshot: true }).catch(() => {}); // 끝나면 멈춰 둡니다(조사하는 동안 시간이 흐르지 않게)
const sh = await send({ action: 'wait', wait: 10, label: `step-end` });
console.log(sh.file);
