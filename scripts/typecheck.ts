import { newGame, advanceWeek } from '../src/core/game';
import { growthType } from '../src/core/player';
const G = newGame({ seed: 4 }); const c: Record<string, number> = {};
for (const p of G.clubs.flatMap((x) => x.squad)) c[growthType(p)] = (c[growthType(p)] ?? 0) + 1;
console.log('タイプの割合', JSON.stringify(c));
const S = G.season; while (G.season === S) advanceWeek(G);
console.log('1年目の終わりにわかった人数', G.squad.filter((p) => p.gType).length, '/', G.squad.length);
