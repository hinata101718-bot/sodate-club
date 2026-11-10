import { newGame, advanceWeek, myTier, myRank } from '../src/core/game';
import { payroll, staffPay } from '../src/core/owner';
const G = newGame({ seed: +(process.env.SEED || 3), pref: process.env.PREF || '静岡県' });
for (let s = 0; s < +(process.env.N || 3); s++) {
  const start = G.season;
  while (G.season === start) advanceWeek(G);
  const L = G.owner.lastLedger!;
  console.log(`S${start} tier${G.history.at(-1)!.tier} rank${G.history.at(-1)!.rank} money ${G.owner.money} debt ${G.owner.debt} pop ${G.owner.pop.toFixed(0)} | in gate ${L.gate} spon ${L.sponsor} sales ${L.sales} prize ${L.prize} | out sal ${L.salary} staff ${L.staff} | payroll ${payroll(G)} staffPay ${staffPay(G)} squad ${G.squad.length}`);
}
