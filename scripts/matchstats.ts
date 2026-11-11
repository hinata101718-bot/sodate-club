/* 試合の数字の確かめ（問107）：1シーズンぶんの試合の、パス・シュート・評価点の平均 */
import { newGame, advanceWeek, STATS } from '../src/core/game';
const G = newGame({ seed: 5 }); STATS.on = true;
const rts: number[] = []; let pa = 0, pc = 0, sh = 0, ot = 0, tk = 0, n = 0, goals = 0; const moms: string[] = [];
const S = G.season;
while (G.season === S && G.week < 47) { const r = advanceWeek(G); const m = r.match; if (!m) continue; n++; goals += m.score[0] + m.score[1];
  for (const p of m.played) { rts.push(p.rt!); pa += p.st!.pa; pc += p.st!.pc; sh += p.st!.sh; ot += p.st!.ot; tk += p.st!.tk; }
  if (n <= 3) { console.log(m.title, m.score.join('-'), 'MOM', JSON.stringify(m.mom)); for (const p of m.played) console.log(' ', p.pos, p.name, p.rt, p.min + '分', JSON.stringify(p.st), 'G' + p.goals, 'A' + p.ast); }
  if (m.mom) moms.push(m.mom.rt.toFixed(1)); }
rts.sort((a, b) => a - b);
console.log('試合', n, '1試合の点', (goals / n).toFixed(2), '自チームのパス/試合', (pa / n).toFixed(0), '成功率', (pc / pa * 100).toFixed(1) + '%', 'シュート', (sh / n).toFixed(1), '枠内', (ot / n).toFixed(1), '奪った', (tk / n).toFixed(1));
console.log('評価点 最小', rts[0], '中央', rts[rts.length >> 1], '平均', (rts.reduce((a, b) => a + b, 0) / rts.length).toFixed(2), '最大', rts[rts.length - 1], '10%', rts[Math.floor(rts.length * 0.1)], '90%', rts[Math.floor(rts.length * 0.9)]);
const sq = [...G.squad].filter((p) => (p.seasonRtN ?? 0) > 0).sort((a, b) => (b.seasonRt! / b.seasonRtN!) - (a.seasonRt! / a.seasonRtN!));
console.log('今季の平均評価点 上位', sq.slice(0, 5).map((p) => `${p.pos}${p.name} ${(p.seasonRt! / p.seasonRtN!).toFixed(2)} (${p.seasonRtN}試合 ${p.seasonGoals}点 ${p.seasonAst}A)`).join(' / '));
const all = G.clubs.flatMap((c) => c.squad);
console.log('アシスト最多', Math.max(...all.map((p) => p.ast ?? 0)), '得点最多', Math.max(...all.map((p) => p.goals)));
