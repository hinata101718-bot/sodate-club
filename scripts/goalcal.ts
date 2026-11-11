import { newGame, advanceWeek, myRank, myTier } from '../src/core/game';
const d: number[] = []; let ok = 0, n = 0;
for (const seed of [21, 22, 23, 24, 25, 26]) { const G = newGame({ seed });
  for (let s = 0; s < 6; s++) { const S = G.season; while (G.season === S) { advanceWeek(G); if (G.week === 44 && G.goal && G.goal.season === G.season && myTier(G) === G.goal.tier) { d.push(myRank(G) - G.goal.rank); n++; if (myRank(G) <= G.goal.rank) ok++; } } } }
d.sort((a, b) => a - b); console.log('実際の順位−目標（ちょうどいい）', d.join(' '), '中央', d[d.length >> 1], '達成', ok, '/', n);
