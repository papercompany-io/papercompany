// 재미 지표 계측(fun-loop 1절): 게임 규칙은 건드리지 않고, 봇이 하루를 넘길 때마다 상태 변화를 세어 "결정 밀도·빈 시간·위기"를 잽니다.
// "의미 있는 결정" = 플레이어에게 새로 생긴 고를 거리(사건 결정·외출 초대·외주 일감·인수 제안·투자 제안) + 플레이어가 한 큰 행동(채용·기능 출시·라운드·이사·해외 진출·단계 변화).
import { runwayMonths } from '../../src/core/finance';
import { outings } from '../../src/core/outings';
import { eventDef } from '../../src/core/events';
import type { GameState } from '../../src/core/types';

export interface CompanyMetrics {
  days: number;
  perMonth: number; // 30일당 의미 있는 결정
  emptyWindows: number; // 결정이 1개 이하인 30일 구간 수
  windows: number;
  longestEmpty: number; // 아무 결정도 없는 가장 긴 연속 일수
  empty60: number; // 60일 넘는 빈 구간 수
  byYear: number[]; // 해마다 30일당 결정
  eventsPerMonth: number; // 사건 카드만
  crises: number; // 위기 시작 횟수(런웨이 3개월 미만 진입, S·A급 퇴사, 경쟁 사건)
  crisisGapMed: number | null; // 위기 사이 간격 중앙값(일)
  crisisGapMax: number | null;
  runwayCrises: number;
  keyQuits: number;
  compEvents: number;
  eventCats: Record<string, number>;
}

export class Meter {
  private seen = new Set<string>();
  private daily: number[] = [];
  private evDaily: number[] = [];
  private crisisDays: number[] = [];
  private lowRunway = false;
  private prev = { emp: new Map<string, string>(), shipped: 0, stage: 0, tier: 0, markets: 0, funding: '' as string | null, round: '' };
  private runwayCrises = 0;
  private keyQuits = 0;
  private compEvents = 0;
  private cats: Record<string, number> = {};

  constructor(s: GameState) {
    this.snap(s);
    for (const d of s.decisions) this.seen.add('d' + d.id);
  }

  private snap(s: GameState) {
    this.prev.emp = new Map(s.employees.map((e) => [e.id, e.grade]));
    this.prev.shipped = s.product.shipped.length;
    this.prev.stage = s.company.stage;
    this.prev.tier = s.company.officeTier;
    this.prev.markets = Object.values(s.markets).filter((m) => m.launched).length;
    this.prev.funding = s.fundingStage;
    this.prev.round = s.rounds?.map((r) => r.id + r.status).join() ?? '';
  }

  // runDay 직후 한 번
  day(s: GameState) {
    let n = 0;
    let ev = 0;
    const newKey = (k: string) => {
      if (this.seen.has(k)) return false;
      this.seen.add(k);
      return true;
    };
    for (const d of s.decisions) {
      if (newKey('d' + d.id)) {
        n++;
        ev++;
        const cat = eventDef(d.eventId)?.cat ?? '?';
        this.cats[cat] = (this.cats[cat] ?? 0) + 1;
        if (cat === 'competitor') {
          this.compEvents++;
          this.crisisDays.push(s.day);
        }
      }
    }
    for (const o of outings(s)) if (o.status === 'offer' && newKey('o' + o.id)) n++;
    for (const c of s.contracts?.offers ?? []) if (newKey('c' + c.id)) n++;
    if (s.exitAttempt?.status === 'offer' && newKey('x' + s.exitAttempt.startedDay)) n++;
    const roundSig = s.rounds?.map((r) => r.id + r.status).join() ?? '';
    if (roundSig !== this.prev.round) n++;
    const hires = s.employees.filter((e) => !this.prev.emp.has(e.id)).length;
    n += Math.min(hires, 2); // 한 공고에서 여럿 뽑아도 결정은 한두 번
    const cur = new Set(s.employees.map((e) => e.id));
    for (const [id, g] of this.prev.emp) {
      if (!cur.has(id) && (g === 'S' || g === 'A')) {
        this.keyQuits++;
        this.crisisDays.push(s.day);
      }
    }
    if (s.product.shipped.length > this.prev.shipped) n++;
    if (s.company.stage !== this.prev.stage) n++;
    if (s.company.officeTier !== this.prev.tier) n++;
    const mk = Object.values(s.markets).filter((m) => m.launched).length;
    if (mk !== this.prev.markets) n++;
    const rw = runwayMonths(s);
    const low = !s.public && rw !== null && rw < 3;
    if (low && !this.lowRunway) {
      this.runwayCrises++;
      this.crisisDays.push(s.day);
    }
    this.lowRunway = low;
    this.snap(s);
    this.daily.push(n);
    this.evDaily.push(ev);
  }

  result(): CompanyMetrics {
    const d = this.daily;
    const win = Math.floor(d.length / 30);
    let emptyWindows = 0;
    for (let w = 0; w < win; w++) if (d.slice(w * 30, w * 30 + 30).reduce((a, b) => a + b, 0) <= 1) emptyWindows++;
    let longest = 0;
    let run = 0;
    let empty60 = 0;
    for (const x of d) {
      if (x === 0) run++;
      else {
        if (run > 60) empty60++;
        run = 0;
      }
      longest = Math.max(longest, run);
    }
    if (run > 60) empty60++;
    const byYear: number[] = [];
    for (let y = 0; y * 365 < d.length; y++) {
      const seg = d.slice(y * 365, (y + 1) * 365);
      byYear.push(+((seg.reduce((a, b) => a + b, 0) / seg.length) * 30).toFixed(1));
    }
    const cd = [...this.crisisDays].sort((a, b) => a - b);
    const gaps = cd.slice(1).map((x, i) => x - cd[i]).sort((a, b) => a - b);
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    return {
      days: d.length,
      perMonth: +((sum(d) / Math.max(1, d.length)) * 30).toFixed(1),
      emptyWindows,
      windows: win,
      longestEmpty: longest,
      empty60,
      byYear,
      eventsPerMonth: +((sum(this.evDaily) / Math.max(1, d.length)) * 30).toFixed(2),
      crises: cd.length,
      crisisGapMed: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
      crisisGapMax: gaps.length ? gaps[gaps.length - 1] : null,
      runwayCrises: this.runwayCrises,
      keyQuits: this.keyQuits,
      compEvents: this.compEvents,
      eventCats: this.cats,
    };
  }
}

// 여러 회사 결과를 한 줄 요약으로
export function summarize(all: { m: CompanyMetrics; kind: string; maxVal: number; ind: string; ms: Record<string, number | null> }[]): string[] {
  const out: string[] = [];
  const med = (a: number[]) => {
    const b = [...a].sort((x, y) => x - y);
    return b.length ? b[Math.floor(b.length / 2)] : NaN;
  };
  const fmt = (a: number[]) => `중앙 ${med(a).toFixed(1)} (최소 ${Math.min(...a).toFixed(1)}, 최대 ${Math.max(...a).toFixed(1)})`;
  const ms = all.map((x) => x.m);
  out.push(`[지표] 회사 ${all.length}개`);
  out.push(`  결정 밀도(30일당): ${fmt(ms.map((m) => m.perMonth))} | 사건 카드만: ${fmt(ms.map((m) => m.eventsPerMonth))}`);
  out.push(`  빈 30일 구간 비율: ${fmt(ms.map((m) => (m.windows ? (m.emptyWindows / m.windows) * 100 : 0)))}% | 가장 긴 빈 시간(일): ${fmt(ms.map((m) => m.longestEmpty))} | 60일 넘는 빈 구간 합계 ${ms.reduce((a, m) => a + m.empty60, 0)}`);
  const yrs = Math.max(...ms.map((m) => m.byYear.length));
  const yearRow: string[] = [];
  for (let y = 0; y < Math.min(yrs, 12); y++) {
    const v = ms.filter((m) => m.byYear.length > y).map((m) => m.byYear[y]);
    yearRow.push(`${y + 1}년 ${med(v).toFixed(1)}`);
  }
  out.push(`  해마다 결정 밀도(중앙): ${yearRow.join(' · ')}`);
  const firsts = ['mvp', 'rev1', 'seed', 'A', 'ipo'].map((k) => {
    const v = all.map((x) => x.ms[k]).filter((x): x is number => x !== null && x !== undefined);
    return `${k} ${v.length ? med(v) : '-'}일(${v.length}/${all.length})`;
  });
  out.push(`  첫 보상까지(중앙): ${firsts.join(' · ')}`);
  const kinds: Record<string, number> = {};
  for (const x of all) kinds[x.kind] = (kinds[x.kind] ?? 0) + 1;
  const top = Math.max(...Object.values(kinds)) / all.length;
  out.push(`  엔딩 분포: ${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(' · ')} (최빈 ${(top * 100).toFixed(0)}%)`);
  const vals = all.map((x) => x.maxVal / 1e8);
  const lv = vals.map((v) => Math.log10(Math.max(1, v)));
  const mean = lv.reduce((a, b) => a + b, 0) / lv.length;
  const sd = Math.sqrt(lv.reduce((a, b) => a + (b - mean) ** 2, 0) / lv.length);
  out.push(`  최고 기업가치(억): ${fmt(vals)} | log10 표준편차 ${sd.toFixed(2)}`);
  out.push(`  위기: 회사당 ${fmt(ms.map((m) => m.crises))}회 (런웨이 ${ms.reduce((a, m) => a + m.runwayCrises, 0)} · 핵심 퇴사 ${ms.reduce((a, m) => a + m.keyQuits, 0)} · 경쟁 ${ms.reduce((a, m) => a + m.compEvents, 0)}) | 간격 중앙 ${med(ms.map((m) => m.crisisGapMed ?? NaN).filter((x) => !isNaN(x)))}일 · 최대 간격 중앙 ${med(ms.map((m) => m.crisisGapMax ?? NaN).filter((x) => !isNaN(x)))}일`);
  const cats: Record<string, number> = {};
  for (const m of ms) for (const [k, v] of Object.entries(m.eventCats)) cats[k] = (cats[k] ?? 0) + v;
  const tot = Object.values(cats).reduce((a, b) => a + b, 0);
  out.push(`  사건 갈래: ${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${((v / tot) * 100).toFixed(0)}%`).join(' · ')}`);
  return out;
}
