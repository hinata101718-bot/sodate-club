import { newGame, advanceWeek } from '../src/core/game';
import { setOrder } from '../src/core/bond';
const G = newGame({ seed: 8 }); let bad = 0, tot = 0, cmStart = '';
const cm = G.squad.find((p) => p.pos === 'CM')!; setOrder(G, cm.id, { kind: 'start' });
for (let i = 0; i < 48; i++) { const r = advanceWeek(G); if (!r.match) continue; for (const x of r.match.played) { if (x.sub) continue; const p = G.squad.find((q) => q.id === x.id); if (!p) continue; tot++; if (p.apt[x.pos] < 2) bad++; if (p.id === cm.id) cmStart = x.pos; } }
console.log('先発で適性△以下の場所', bad, '/', tot, ' 先発での頼みのCMの位置', cmStart);
