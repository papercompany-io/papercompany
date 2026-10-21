// 웹 미리보기용: dist-web/index.html(한 파일 빌드)을 claude.ai Artifact 페이지 조각으로 바꿉니다.
// Artifact는 문서 뼈대(<html>·<head>·<body>)를 직접 씌우므로 title·style·script·#root만 남기고,
// 작은 화면에서는 1280×800 화면을 통째로 줄여 보여줍니다(게임은 데스크탑 화면 기준).
import fs from 'fs';

const src = fs.readFileSync('dist-web/index.html', 'utf8');
const pick = (re) => [...src.matchAll(re)].map((m) => m[0]);
const title = (src.match(/<title>[\s\S]*?<\/title>/) ?? ['<title>페이퍼컴퍼니</title>'])[0];
const styles = pick(/<style[\s\S]*?<\/style>/g);
const scripts = pick(/<script[\s\S]*?<\/script>/g);
const fit = `<style>:root{color-scheme:dark}html,body{height:100%;background:#1a2034}</style>
<script>(function(){var W=1280,H=800;function fit(){var r=document.getElementById('root');if(!r)return;var w=innerWidth,h=innerHeight;if(w>=1200&&h>=720){r.removeAttribute('style');return}var s=Math.min(w/W,h/H);r.setAttribute('style','position:absolute;left:0;top:0;width:'+W+'px;height:'+H+'px;transform-origin:0 0;transform:translate('+((w-W*s)/2)+'px,'+((h-H*s)/2)+'px) scale('+s+')')}addEventListener('resize',fit);addEventListener('DOMContentLoaded',fit);fit()})();</script>`;
const out = [title, ...styles, fit, '<div id="root"></div>', ...scripts].join('\n');
fs.writeFileSync('dist-web/artifact.html', out);
console.log('dist-web/artifact.html', (out.length / 1024 / 1024).toFixed(2), 'MB');
