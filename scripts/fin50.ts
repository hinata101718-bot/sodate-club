/* 問126〜129：ほかのクラブのお金のやりくりを50シーズン回して、段の強さとお金を見る。N=50 SEED=1 */
import { newGame, advanceWeek } from '../src/core/game';
import { teamStrength, ovr } from '../src/core/player';
import { finWord, clubPayroll, clubRevenue } from '../src/core/clubfin';
const N = +(process.env.N || 50); const seed = +(process.env.SEED || 1);
const G = newGame({ seed });
const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
let news = 0, distress = 0, big = 0, ok3 = 0, seasons = 0;
for (let s = 0; s < N; s++) {
  const st = G.season;
  while (G.season === st) { const r = advanceWeek(G); for (const l of r.news) { if (l.startsWith('経営難')) distress++; if (l.includes('大型補強')) big++; } news++; }
  { const t1 = G.clubs.filter((c) => !c.me && c.tier === 1); const k = ['堅実', 'ふつう', '勝負好き'].map((x) => t1.filter((c) => c.fin!.style === x).length); if (Math.min(...k) >= 3) ok3++; seasons++; }
  if (s % 5 === 4 || s === 0) {
    const row = [1, 2, 3].map((t) => { const cs = G.clubs.filter((c) => !c.me && c.tier === t);
      const w = cs.map(finWord); return `${t}部 強さ${avg(cs.map((c) => teamStrength(c.squad))).toFixed(1)}(${Math.min(...cs.map((c) => teamStrength(c.squad))).toFixed(0)}-${Math.max(...cs.map((c) => teamStrength(c.squad))).toFixed(0)}) 給/収${avg(cs.map((c) => clubPayroll(c) / clubRevenue(c))).toFixed(2)} 金${Math.round(avg(cs.map((c) => c.fin!.money)) / 100) / 100}億 借${Math.round(avg(cs.map((c) => c.fin!.debt)) / 100) / 100}億 裕${w.filter((x) => x === '裕福').length}苦${w.filter((x) => x === '苦しい').length} 堅/ふ/勝${['堅実', 'ふつう', '勝負好き'].map((x) => cs.filter((c) => c.fin!.style === x).length).join('/')}`; });
    console.log(`${G.season - 1}年目終わり | ${row.join(' | ')}`);
  }
}
console.log('経営難の放出', distress, '大型補強', big, `1部にどの性格も3つ以上：${seasons}年中${ok3}年`);
const ai = G.clubs.filter((c) => !c.me).flatMap((c) => c.squad.map((p) => ({ p, c })));
const yth = ai.filter(({ p }) => p.origin === 'ユース出身');
console.log('ほかのクラブのユース出身', yth.length, '人・いちばん強い', Math.max(...yth.map(({ p }) => ovr(p))).toFixed(0), '・23歳以下で段の目安+6以上', ai.filter(({ p, c }) => p.age <= 23 && ovr(p) >= ({ 1: 76, 2: 69, 3: 57 } as any)[c.tier] + 6).length, '人');
const styles = ['堅実', 'ふつう', '勝負好き'].map((x) => `${x}: 平均の段 ${avg(G.clubs.filter((c) => c.fin?.style === x).map((c) => c.tier)).toFixed(2)}`);
console.log(styles.join(' / '));
