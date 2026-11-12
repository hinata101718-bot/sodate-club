/* 50シーズンのテストプレイ（おまかせのオーナー）。毎シーズン、おかしなところがないか確かめる
   N=シーズン数 SEEDS=1,2,3 */
import { newGame, advanceWeek, answerOffer, STATS, ME, myTier, type GameState } from '../src/core/game';
import { ovr, teamStrength } from '../src/core/player';
import { pickLineup, chooseForm } from '../src/core/match';
import { startBuild, hireScout } from '../src/core/owner';
import { bid, playerIndex, valueOf, marketOpen } from '../src/core/market';
import { facCost, FAC_KEYS, debtCap, INCOME_KEYS, EXPENSE_KEYS } from '../src/core/finance';
import { regd } from '../src/core/squad';
import { Rng } from '../src/core/rng';

const N = +(process.env.N || 50); const seeds = (process.env.SEEDS || '1,2,3').split(',').map(Number);
STATS.on = true;
const issues: string[] = []; const bad = (s: string) => { if (issues.length < 2000) issues.push(s); };
const dec: Record<number, any> = {};
const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
function checkState(G: GameState, tag: string) {
  const o = G.owner;
  if (!Number.isFinite(o.money)) bad(`${tag} お金が数字でない: ${o.money}`);
  for (const k of [...INCOME_KEYS, ...EXPENSE_KEYS]) if (!Number.isFinite(o.ledger[k])) bad(`${tag} 帳簿 ${k} が数字でない`);
  if (o.debt > debtCap(myTier(G)) + 1) bad(`${tag} 借金が上限をこえた ${o.debt}`);
  if (G.squad.length < 16 || G.squad.length > 35) bad(`${tag} トップの人数 ${G.squad.length}`);
  if (regd(G).length > 23) bad(`${tag} 登録が23人をこえた ${regd(G).length}`);
  if (G.squad.filter((p) => p.pos === 'GK').length < 2) bad(`${tag} キーパーが2人より少ない`);
  const ids = new Set<number>();
  for (const c of G.clubs) { const sq = c.me ? G.squad : c.squad; if (!c.me && (sq.length < 18 || sq.length > 30)) bad(`${tag} ${c.name}の人数 ${sq.length}`);
    for (const p of sq) { if (ids.has(p.id)) bad(`${tag} 選手の番号が重なっている ${p.name}`); ids.add(p.id);
      if (p.a.some((v) => !Number.isFinite(v))) bad(`${tag} 能力が数字でない ${p.name}`);
      if (p.age > 41) bad(`${tag} ${p.age}歳の選手がいる ${p.name}`);
      if (!Number.isFinite(p.salary) || p.salary <= 0) bad(`${tag} 給料がおかしい ${p.name} ${p.salary}`); } }
  for (const c of G.clubs) if (!c.me) { const f = c.fin; if (!f) { bad(`${tag} ${c.name}にお金の情報がない`); continue; }
    if (!Number.isFinite(f.money) || !Number.isFinite(f.debt)) bad(`${tag} ${c.name}のお金が数字でない`);
    if (f.debt > debtCap(c.tier) * 1.01 && G.week % 48 > 4) bad(`${tag} ${c.name}の借金が上限をこえた ${f.debt}`); }
  for (const t of [1, 2, 3]) if (G.clubs.filter((c) => c.tier === t).length !== 12) bad(`${tag} ${t}部のクラブ数 ${G.clubs.filter((c) => c.tier === t).length}`);
  if ((G.inbox ?? []).length > 60) bad(`${tag} メッセージが多すぎる`);
}
for (const seed of seeds) {
  const G = newGame({ seed, pref: ['静岡県', '鳥取県', '大阪府', '宮城県', '熊本県'][seed % 5] });
  hireScout(G, G.owner.market.scout[0].id);
  const r = new Rng(seed * 99);
  let mi = 0;
  for (let s = 0; s < N; s++) {
    const start = G.season; const t0 = Date.now();
    try {
      while (G.season === start) {
        advanceWeek(G);
        for (const k of FAC_KEYS) { const nx = G.owner.fac[k] + 1; if (!G.owner.build && nx <= 5 && G.owner.money > facCost(k, nx) * 1.6 && G.owner.debt === 0) startBuild(G, k); }
        for (const k of Object.values(G.owner.mk.known)) if (k.p && k.p.pot - ovr(k.p) >= 18 && G.squad.length < 28 && G.owner.money > 9000) bid(G, k.pid, 0, r);
        for (let i = G.pending.length - 1; i >= 0; i--) { const e = G.pending[i]; const top = [...G.squad].sort((a, b) => ovr(b) - ovr(a)).slice(0, 11); answerOffer(G, i, !top.some((p) => p.id === e.pid) && G.squad.length > 22); }
        if (marketOpen(G)) {
          const idx = playerIndex(G);
          for (let t = 0; t < 3 && G.owner.mk.bids.length < 3; t++) {
            const best = [...G.squad].sort((a, b) => ovr(b) - ovr(a)).slice(0, 11); const weak = Math.min(...best.map(ovr));
            const c = Object.values(G.owner.mk.known).map((k) => idx.get(k.pid)).filter((w) => w && w.kind !== 'ama' && !G.owner.mk.bids.some((x) => x.pid === w.p.id) && ovr(w.p) >= weak + 1 && G.owner.money > valueOf(w) * 1.2 + 9000).sort((a, b) => ovr(b!.p) - ovr(a!.p))[0];
            if (!c) break;
            if (G.squad.length + G.owner.mk.bids.length >= 30) { const out = [...G.squad].filter((p) => p.age >= 24 && p.pos !== 'GK').sort((a, b) => ovr(a) - ovr(b))[0]; if (out) G.squad = G.squad.filter((p) => p !== out); }
            if (bid(G, c.p.id, 20, r)) break;
          }
        }
        if (G.week % 4 === 0) checkState(G, `seed${seed} ${G.season}年目${G.week}週`);
      }
    } catch (e: any) { bad(`seed${seed} ${G.season}年目${G.week}週 でエラー: ${e?.message}\n${String(e?.stack).split('\n').slice(1, 5).join('\n')}`); break; }
    const ms = Date.now() - t0;
    const h = G.history.at(-1)!; const d = Math.floor(s / 10);
    const D = (dec[d] ??= { xi: { 1: [], 2: [], 3: [] }, top: [], goals: [], ms: [], size: [], money: [], tier: [], awards: [], goalOk: [], eval: [], payroll: [], revenue: [], age: [], youth: [], gtype: 0, n: 0 });
    for (const t of [1, 2, 3]) { const cs = G.clubs.filter((c) => c.tier === t && !c.me); for (const c of cs) { const f = chooseForm(c.mgr, teamStrength(c.squad), teamStrength(c.squad)); const { lineup } = pickLineup(r, { id: c.id, name: c.name, me: false, color: c.color, squad: c.squad, mgr: c.mgr }, f); D.xi[t].push(lineup.reduce((a, x) => a + ovr(x.p), 0) / lineup.length); } }
    D.top.push(Math.max(...G.clubs.filter((c) => c.tier === 1 && !c.me).flatMap((c) => c.squad.map(ovr))));
    const M = STATS.matches.slice(mi); mi = STATS.matches.length; D.goals.push(avg(M.map((m) => m.sh + m.sa)));
    D.ms.push(ms); D.size.push(JSON.stringify(G).length / 1024); D.money.push(G.owner.money); D.tier.push(h.tier);
    D.awards.push(h.awards.length + (h.xi?.length ?? 0)); const gl = (G.goalLog ?? []).at(-1); if (gl) D.goalOk.push(gl.ok ? 1 : 0); D.eval.push(G.mgrEval ?? 60);
    const L = G.owner.lastLedger!; D.payroll.push(L.salary); D.revenue.push(INCOME_KEYS.reduce((x, k) => x + L[k], 0));
    D.age.push(avg(G.clubs.flatMap((c) => (c.me ? G.squad : c.squad).map((p) => p.age)))); D.youth.push(G.youth.length); D.gtype += G.squad.filter((p) => p.gType).length / G.squad.length; D.n++;
    if (!h.awards.length) bad(`seed${seed} ${h.season}年目 表彰がない`);
  }
}
console.log(`シーズン ${N} × クラブ ${seeds.length}`);
console.log('10年ごと：先発の総合力（1部・2部・3部）｜1部の最強｜1試合の点｜1シーズンの時間｜セーブの大きさ｜お金｜いた段｜目標に届いた割合｜監督の評価｜給料÷収入｜平均年齢｜ユース人数｜成長タイプがわかった割合');
for (const [d, D] of Object.entries(dec) as any) console.log(`${+d * 10 + 1}〜${+d * 10 + 10}年: ${avg(D.xi[1]).toFixed(1)}・${avg(D.xi[2]).toFixed(1)}・${avg(D.xi[3]).toFixed(1)}｜${avg(D.top).toFixed(1)}｜${avg(D.goals).toFixed(2)}｜${Math.round(avg(D.ms))}ms｜${Math.round(avg(D.size))}KB｜${Math.round(avg(D.money) / 10000)}億｜${avg(D.tier).toFixed(1)}部｜${Math.round(avg(D.goalOk) * 100)}%｜${Math.round(avg(D.eval))}｜${(avg(D.payroll) / Math.max(1, avg(D.revenue))).toFixed(2)}｜${avg(D.age).toFixed(1)}歳｜${avg(D.youth).toFixed(0)}人｜${Math.round((D.gtype / D.n) * 100)}%`);
console.log(`見つかった問題 ${issues.length}件`); for (const s of issues) console.log(' - ' + s);
void ME;
