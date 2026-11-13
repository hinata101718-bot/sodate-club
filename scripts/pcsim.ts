/* PC版（GM兼監督）のテストプレイ：おまかせのGMで何シーズンか進め、成績・お金・信頼・実績を見る
   N=シーズン数 DIFF=normal SEEDS=1,2 */
import { newGame, playWeek, answerOffer, myTier, myRank, type GameState } from '../src/core/game';
import { pickSponsor, answerEvent, autoXI, ACH, DIFFS, type Diff } from '../src/core/gm';
import { closeMeeting } from '../src/core/meeting';
import { teamStrength } from '../src/core/player';
import { INCOME_KEYS, EXPENSE_KEYS } from '../src/core/finance';

const N = +(process.env.N || 6); const diff = (process.env.DIFF || 'normal') as Diff;
const seeds = (process.env.SEEDS || '1,2').split(',').map(Number);
for (const seed of seeds) {
  const G: GameState = newGame({ seed, pref: process.env.PREF || '宮城県', diff });
  let issues = 0;
  for (let s = 0; s < N && !G.gm.over; s++) {
    for (let w = 0; w < 48 && !G.gm.over; w++) {
      if (G.gm.offers) pickSponsor(G, 0);
      if (G.gm.event) answerEvent(G, 0);
      while (G.pending.length) answerOffer(G, 0, false);
      if (G.meet) closeMeeting(G);
      if (process.env.AUTO !== '0') G.gm.tac.auto = true; else autoXI(G);
      const res = playWeek(G);
      if (!Number.isFinite(G.owner.money)) issues++;
      for (const k of [...INCOME_KEYS, ...EXPENSE_KEYS]) if (!Number.isFinite(G.owner.ledger[k])) issues++;
      if (res.seasonEnd) {
        const h = G.history[G.history.length - 1];
        const L = G.owner.lastLedger!; const inc = INCOME_KEYS.reduce((t, k) => t + L[k], 0), exp = EXPENSE_KEYS.reduce((t, k) => t + L[k], 0);
        console.log(`seed${seed} ${DIFFS[diff].n} Y${h.season} ${h.tier}部${h.rank}位 杯:${h.cup} 信頼${G.mgrEval} お金${G.owner.money} 借金${G.owner.debt} 収${inc} 支${exp} 人気${Math.round(G.owner.pop)} 強さ${teamStrength(G.squad).toFixed(1)} 実績${Object.keys(G.gm.ach).length}/${ACH.length} 殿堂${G.gm.hof.length}`);
      }
    }
  }
  if (G.gm.over) console.log(`seed${seed} 解任：${G.gm.over.reason}（${G.gm.over.season}年目）`);
  console.log(`seed${seed} 終わり ${myTier(G)}部${myRank(G)}位 問題${issues} 実績: ${Object.keys(G.gm.ach).join(',')}`);
}
