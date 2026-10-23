// 직원 잡담 표본(A-211): 실제 게임 코드(core/chatter.ts chatterSlot)로 잡담을 만들어 찍습니다. 질문과 답이 맞는지 사람이 읽어 보는 용도.
// 실행: npm run chatter-sample -- [개수=20] [시드=1]
// 기분이 좋은 사람·무난한 사람·지친 사람을 섞고, 날마다 야근·자금 부족·출시 같은 상황을 바꿔 상황 주제도 나오게 합니다.
import { chatterSlot } from '../../src/core/chatter';
import { getChannel } from '../../src/core/messenger';
import { moodOf } from '../../src/core/talk';
import { empByName, makeWorld } from './world';

const want = Number(process.argv[2] ?? 20);
const seed = Number(process.argv[3] ?? 1);
const s = makeWorld();
s.company.name = `잡담시험${seed}`; // 잡담 난수는 회사 이름·날·칸으로 정해짐
empByName(s, '최유찬')!.sat = 30; // 지친 사람
empByName(s, '오가은')!.sat = 55; // 무난한 사람
const ch = (id: string) => getChannel(s, id)!.messages;
const seen = new Set(['team-dev', 'team-marketing', 'all'].flatMap((id) => ch(id).map((m) => m.id)));
const out: string[] = [];
for (let day = 0; out.length < want && day < 400; day++) {
  s.day += 1;
  // 상황을 날마다 바꿈: 야근, 자금 부족(현금 0), 최근 출시
  s.company.workPolicy = day % 5 === 1 ? 'crunch' : 'normal';
  s.cash = day % 7 === 2 ? 0 : 300000000;
  s.product.shipped = day % 6 === 3 ? [{ id: s.product.roadmap[0]?.id ?? 'x', level: 1, day: s.day, result: 'full' }] : [];
  for (let slot = 0; slot < 8 && out.length < want; slot++) {
    chatterSlot(s, slot);
    for (const id of ['team-dev', 'team-marketing', 'all']) {
      const fresh = ch(id).filter((m) => !seen.has(m.id));
      if (!fresh.length) continue;
      fresh.forEach((m) => seen.add(m.id));
      const mood = (n: string) => {
        const e = s.employees.find((x) => x.name === n);
        return e ? { good: '좋음', neutral: '무난', bad: '지침' }[moodOf(s, e)] : '';
      };
      out.push(`#${id} (${day + 1}일째${s.company.workPolicy === 'crunch' ? ', 야근' : ''}${s.cash === 0 ? ', 자금 부족' : ''}${s.product.shipped.length ? ', 출시 직후' : ''})\n${fresh.map((m) => `  ${m.from}(${mood(m.from)}): ${m.text}`).join('\n')}`);
    }
  }
}
console.log(out.slice(0, want).join('\n\n'));
