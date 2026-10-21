// 플레이테스트 명령 보내기: node playtest/do.mjs <action> [대상] [값] [--wait ms] [--label 이름]
//  예) node playtest/do.mjs click t:new-company --label 새회사
//      node playtest/do.mjs fill t:company-name 페이퍼랩스
//      node playtest/do.mjs clickxy 700 400
//      node playtest/do.mjs wait --wait 3000 --label 대기
//      node playtest/do.mjs drag 700 500 400 300   (끌어서 사무실 이동)
//      node playtest/do.mjs wheel 700 500 -100      (휠로 확대, 양수는 축소)
import http from 'http';

const args = process.argv.slice(2);
const opts = {};
const pos = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--wait') opts.wait = Number(args[++i]);
  else if (args[i] === '--label') opts.label = args[++i];
  else pos.push(args[i]);
}
const [action, a1, a2] = pos;
const cmd = { action, ...opts };
if (action === 'drag') cmd.pts = pos.slice(1, 5).map(Number);
else if (action === 'wheel') Object.assign(cmd, { x: Number(a1), y: Number(a2), dy: Number(pos[3]) });
else if (action === 'clickxy') Object.assign(cmd, { x: Number(a1), y: Number(a2) });
else if (action === 'key') cmd.key = a1;
else if (action === 'wait') cmd.wait = opts.wait ?? Number(a1 ?? 1000);
else Object.assign(cmd, { target: a1, value: a2 });
if (!cmd.label) cmd.label = [action, a1 ?? ''].join('-');

const req = http.request({ host: '127.0.0.1', port: 7777, method: 'POST', path: '/' }, (res) => {
  let body = '';
  res.on('data', (d) => (body += d));
  res.on('end', () => console.log(body));
});
req.end(JSON.stringify(cmd));
