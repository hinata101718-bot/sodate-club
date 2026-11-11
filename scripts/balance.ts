/* 数字のバランスの確かめ：npx vite-node scripts/balance.ts  N=シーズン数 SEEDS=1,2,3
   オーナーは「おまかせ」で遊ぶ：昇格会議はコーチのおすすめ、契約は自動で更新、お金に余裕があれば施設を強化、スカウトの候補で伸びしろのある子を獲る */
import { newGame, advanceWeek, myTier, STATS, ME } from '../src/core/game';
import { ovr, teamStrength } from '../src/core/player';
import { pickLineup, chooseForm } from '../src/core/match';
import { startBuild, hireScout } from '../src/core/owner';
import { bid, playerIndex, valueOf, marketOpen } from '../src/core/market';
import { facCost, FAC_KEYS } from '../src/core/finance';
import { Rng } from '../src/core/rng';

const N = +(process.env.N || 2); const seeds = (process.env.SEEDS || '1,2,3').split(',').map(Number);
STATS.on = true;
const all: any = { fees: [], sales: [], mix: [], goals: [], strong: [0, 0], xi: { 1: [], 2: [], 3: [] }, mvp: [], awake: [], money: [], youth: [], tiers: [] };
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
      for (const k of Object.values(G.owner.mk.known)) if (k.p && k.p.pot - ovr(k.p) >= 18 && G.squad.length < 24 && G.owner.money > 3000) bid(G, k.pid, 0, r);
      /* 移籍の期間：先発のいちばん弱いところより3以上強い選手が、お金に余裕があれば申し込む */
      if (marketOpen(G) && G.owner.mk.bids.length === 0) {
        const idx = playerIndex(G);
        const best = [...G.squad].sort((a, b) => ovr(b) - ovr(a)).slice(0, 11);
        const weak = Math.min(...best.map(ovr));
        const c = Object.values(G.owner.mk.known).map((k) => idx.get(k.pid)).filter((w) => w && w.kind !== 'ama' && ovr(w.p) >= weak + 3 && G.owner.money > valueOf(w) * 1.5 + 5000).sort((a, b) => ovr(b!.p) - ovr(a!.p))[0];
        /* 25人いっぱいなら、いちばん弱い24歳以上の選手を手ばなしてから申し込む（売りに出すかわり） */
        if (c && G.squad.length >= 24) { const out = [...G.squad].filter((p) => p.age >= 24).sort((a, b) => ovr(a) - ovr(b))[0]; if (out) G.squad = G.squad.filter((p) => p !== out); }
        if (c && G.squad.length < 24) bid(G, c.p.id, 20, r);
      }
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
    const L = G.owner.lastLedger!; all.fees.push(L.buy); all.sales.push(L.sales);
    const xi = [...G.squad].sort((a, b) => ovr(b) - ovr(a)).slice(0, 11);
    all.mix.push(xi.filter((p) => p.origin === '他クラブから' || p.origin === 'フリーから').length);
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
console.log(`移籍金（1年あたり）：払った ${Math.round(avg(all.fees))}万円 ・ 売った ${Math.round(avg(all.sales))}万円 ・ 1年でいちばん払った ${Math.max(...all.fees)}万円`);
console.log(`自分のクラブの先発11人のうち、買った選手：平均 ${avg(all.mix).toFixed(1)}人（育てた・スカウトの若手・ユースは残り）`);
void myTier; void ME;
