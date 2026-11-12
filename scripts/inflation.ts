/* インフレの確かめ：お金・給料・選手の値段・強さが、年がたつと上がり続けていないか。N=50 SEED=1 */
import { newGame, advanceWeek } from '../src/core/game';
import { ovr } from '../src/core/player';
import { marketValue } from '../src/core/market';
import { clubRevenue } from '../src/core/clubfin';
const N = +(process.env.N || 50); const G = newGame({ seed: +(process.env.SEED || 1) });
const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const med = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)] ?? 0; };
let fees: number[] = [];
const oku = (v: number) => (v / 10000).toFixed(1);
console.log('年 | 段ごとのお金の平均（億）1・2・3部 | 段ごとの収入（億） | 給料の中央値（万） | 総合力の平均・上位10人 | 値段の中央値・最高（万） | 移籍金の中央値（万）');
for (let s = 0; s < N; s++) {
  const st = G.season;
  while (G.season === st) { const r = advanceWeek(G); for (const l of r.news) { const m = l.match(/移籍金 ([\d.]+)(億|万)円/); if (m) fees.push(Math.round(m[2] === '億' ? +m[1] * 10000 : +m[1].replace(/,/g, ''))); } }
  if (s % 5 === 0 || s === N - 1) {
    const ai = G.clubs.filter((c) => !c.me); const ps = ai.flatMap((c) => c.squad.map((p) => ({ p, c })));
    const money = [1, 2, 3].map((t) => oku(avg(ai.filter((c) => c.tier === t).map((c) => c.fin!.money - c.fin!.debt))));
    const rev = [1, 2, 3].map((t) => oku(avg(ai.filter((c) => c.tier === t).map(clubRevenue))));
    const o = ps.map(({ p }) => ovr(p)).sort((a, b) => b - a);
    const v = ps.map(({ p, c }) => marketValue(p, c.tier));
    console.log(`${G.season - 1}年目 | ${money.join('・')} | ${rev.join('・')} | ${med(ps.map(({ p }) => p.salary))} | ${avg(o).toFixed(1)}・${avg(o.slice(0, 10)).toFixed(1)} | ${med(v)}・${Math.max(...v)} | ${med(fees)}（${fees.length}件）`);
    fees = [];
  }
}
