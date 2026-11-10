/* 数字のバランスの確かめ：npx vite-node scripts/balance.ts  N=シーズン数 SEEDS=1,2,3
   オーナーは「おまかせ」で遊ぶ：昇格会議はコーチのおすすめ、契約は自動で更新、お金に余裕があれば施設を強化、スカウトの候補で伸びしろのある子を獲る */
import { newGame, advanceWeek, myTier, STATS, ME } from '../src/core/game';
import { ovr, teamStrength } from '../src/core/player';
import { pickLineup, chooseForm } from '../src/core/match';
import { startBuild, signCand, hireScout } from '../src/core/owner';
import { facCost, FAC_KEYS } from '../src/core/finance';
import { Rng } from '../src/core/rng';

const N = +(process.env.N || 2); const seeds = (process.env.SEEDS || '1,2,3').split(',').map(Number);
STATS.on = true;
const all: any = { goals: [], strong: [0, 0], xi: { 1: [], 2: [], 3: [] }, mvp: [], awake: [], money: [], youth: [], tiers: [] };
for (const seed of seeds) {
  const G = newGame({ seed, pref: ['静岡県', '鳥取県', '大阪府', '宮城県', '熊本県'][seed % 5] });
  hireScout(G, G.owner.market.scout[0].id);
  const r = new Rng(seed * 99);
  const kids = [...G.squad, ...G.youth].filter((p) => p.age >= 16 && p.age <= 18).map((p) => ({ id: p.id, o: ovr(p), age: p.age }));
  let awake = 0;
  for (let s = 0; s < N; s++) {
    const start = G.season;
    while (G.season === start) {
      const res = advanceWeek(G);
      awake += res.report.filter((x) => x.awake).length;
      /* おまかせのオーナー */
      for (const k of FAC_KEYS) { const nx = G.owner.fac[k] + 1; if (!G.owner.build && nx <= 5 && G.owner.money > facCost(k, nx) * 1.6 && G.owner.debt === 0) startBuild(G, k); }
      for (const c of [...G.owner.cands]) if (c.src === 'scout' && c.p.pot - ovr(c.p) >= 18 && G.squad.length < 24 && G.owner.money > 3000) signCand(G, c.id, r);
      if (G.week === 20) {
        for (const t of [1, 2, 3]) {
          const cs = G.clubs.filter((c) => c.tier === t && !c.me);
          for (const c of cs) { const f = chooseForm(c.mgr, teamStrength(c.squad), teamStrength(c.squad)); const { lineup } = pickLineup(r, { id: c.id, name: c.name, me: false, color: c.color, squad: c.squad, mgr: c.mgr }, f); all.xi[t].push(lineup.reduce((a, x) => a + ovr(x.p), 0) / lineup.length); }
          if (t === 1) all.mvp.push(Math.max(...cs.flatMap((c) => c.squad.map(ovr))));
        }
      }
    }
    const h = G.history.at(-1)!;
    all.tiers.push(`${seed}:${h.season}年 ${h.tier}部${h.rank}位`);
    all.money.push({ seed, season: h.season, money: G.owner.money, debt: G.owner.debt, fac: Object.values(G.owner.fac).join('') });
  }
  all.awake.push(awake / N);
  for (const k of kids) { const p = [...G.squad, ...G.youth].find((x) => x.id === k.id); if (p) all.youth.push({ from: k.o, to: ovr(p), age: k.age }); }
}
const M = STATS.matches;
const goals = M.reduce((s, m) => s + m.sh + m.sa, 0) / M.length;
let sw = 0, sn = 0; for (const m of M) { const d = m.hs - m.as; if (Math.abs(d) >= 3 && Math.abs(d) <= 6) { sn++; if (d > 0 ? m.sh > m.sa : m.sa > m.sh) sw++; } }
const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
console.log(`シーズン数 ${N} × クラブ ${seeds.length}（リーグ ${M.length}試合）`);
console.log(`1試合の得点 ${goals.toFixed(2)}`);
console.log(`強いほうの勝ち率（力の差3〜6、${sn}試合） ${(sw / sn * 100).toFixed(1)}%`);
console.log(`先発の総合力 1部 ${avg(all.xi[1]).toFixed(1)} ・ 2部 ${avg(all.xi[2]).toFixed(1)} ・ 3部 ${avg(all.xi[3]).toFixed(1)} ・ 1部でいちばん強い選手 ${avg(all.mvp).toFixed(1)}`);
const y = all.youth; console.log(`16〜18歳の若手（${y.length}人）：はじめ ${avg(y.map((x: any) => x.from)).toFixed(1)} → ${N}年後 ${avg(y.map((x: any) => x.to)).toFixed(1)}（いちばん上 ${Math.max(...y.map((x: any) => x.to))}、いちばん下 ${Math.min(...y.map((x: any) => x.to))}）`);
console.log(`大きな覚醒の回数（1シーズンあたり） ${avg(all.awake).toFixed(1)}`);
console.log(`成績：${all.tiers.join(' / ')}`);
console.log(`お金（万円）：${all.money.map((m: any) => `${m.seed}:${m.season}年 ${m.money}${m.debt ? `（借金${m.debt}）` : ''} 施設${m.fac}`).join(' / ')}`);
void myTier; void ME;
