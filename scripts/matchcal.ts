/* 問133〜138：試合の数字を本物と比べる。N試合（同じ段どうし）。N=600 */
import { newGame } from '../src/core/game';
import { simulateMatch, rateOne } from '../src/core/match';
import { Rng } from '../src/core/rng';
void rateOne;
const N = +(process.env.N || 600); const G = newGame({ seed: +(process.env.SEED || 3) }); const r = new Rng(99);
const add = (o: Record<string, number>, k: string, v: number) => { o[k] = (o[k] ?? 0) + v; };
const S: Record<string, number> = {}; let goals = 0, spGoals = 0, comeback = 0, lateG = 0, reds = 0, pks = 0, pkg = 0, ckN = 0, ckG = 0, fkN = 0, fkG = 0, draws = 0, homeW = 0; const moms: number[] = [];
const subsMin: number[] = []; const why: Record<string, number> = {};
for (let i = 0; i < N; i++) {
  const t = 1 + (i % 3); const cs = G.clubs.filter((c) => c.tier === t && !c.me); const a = r.pick(cs); let b = r.pick(cs); while (b === a) b = r.pick(cs);
  const ti = (c: typeof a) => ({ id: c.id, name: c.name, me: false, color: c.color, squad: c.squad, mgr: c.mgr });
  const res = simulateMatch(r, ti(a), ti(b), {}); const v = res.view; const st = v.stats!;
  for (const k of Object.keys(st)) add(S, k, (st as any)[k][0] + (st as any)[k][1]);
  goals += res.score[0] + res.score[1];
  for (const sh of v.shots!) { if (sh.goal && sh.sp) spGoals++; if (sh.goal && sh.min >= 80) lateG++; if (sh.how === 'PK') { pks++; if (sh.goal) pkg++; } if (sh.how === 'コーナーキック') { if (sh.goal) ckG++; } if (sh.how === '直接フリーキック') { fkN++; if (sh.goal) fkG++; } }
  ckN += st.ck[0] + st.ck[1]; reds += st.rc[0] + st.rc[1];
  if (res.score[0] === res.score[1]) draws++; if (res.score[0] > res.score[1]) homeW++;
  /* 逆転：一度リードされたチームが勝った */
  const gl = v.shots!.filter((x) => x.goal).sort((x, y) => x.min - y.min); let s0 = 0, s1 = 0, beh = [false, false];
  for (const g of gl) { if (g.side === 0) s0++; else s1++; if (s0 < s1) beh[0] = true; if (s1 < s0) beh[1] = true; }
  if ((res.winner === 0 && beh[0]) || (res.winner === 1 && beh[1])) comeback++;
  if (v.mom) moms.push(v.mom.rt);
  for (const x of v.subs!) { subsMin.push(x.min); why[x.why] = (why[x.why] ?? 0) + 1; }
}
const pt = (k: string) => (S[k] / N / 2).toFixed(1);
console.log(`1試合の点 ${(goals / N).toFixed(2)}（本物 約2.6）・引き分け ${(draws / N * 100).toFixed(0)}%・ホーム勝ち ${(homeW / N * 100).toFixed(0)}%`);
console.log(`1チーム：パス ${pt('pa')}（約450）成功率 ${(S.pc / S.pa * 100).toFixed(0)}%（約80%）・シュート ${pt('sh')}（約12）枠内 ${(S.ot / S.sh * 100).toFixed(0)}%（約35%）・コーナー ${pt('ck')}（約5）・ファウル ${pt('fo')}（約12）・イエロー ${pt('yc')}（約1.5）・オフサイド ${pt('off')}（約2）・セーブ ${pt('sv')}`);
console.log(`退場 ${(reds / N).toFixed(2)}/試合（約0.1）・PK ${(pks / N).toFixed(2)}/試合（約0.25）決まった ${(pkg / Math.max(1, pks) * 100).toFixed(0)}%（約80%）・コーナー${(ckN / Math.max(1, ckG)).toFixed(0)}本に1点（約30）・直接FK ${(fkN / N).toFixed(2)}/試合 ${(fkN / Math.max(1, fkG)).toFixed(0)}本に1点（約15）`);
console.log(`セットプレーの点 ${(spGoals / goals * 100).toFixed(0)}%（約30%）・80分以降の点 ${(lateG / goals * 100).toFixed(0)}%・逆転勝ち ${(comeback / N * 100).toFixed(0)}%（約10%）`);
moms.sort((a, b) => a - b); console.log(`MOMの評価点 中央 ${moms[moms.length >> 1]} 10% ${moms[Math.floor(moms.length * 0.1)]} 90% ${moms[Math.floor(moms.length * 0.9)]}（7.5〜8.5）`);
subsMin.sort((a, b) => a - b); console.log(`交代 ${(subsMin.length / N / 2).toFixed(1)}人/チーム・中央 ${subsMin[subsMin.length >> 1]}分・理由`, JSON.stringify(why));
{ /* 評価点の平均（全部の選手） */
  const all: number[] = []; const r2 = new Rng(7);
  for (let i = 0; i < 200; i++) { const t = 1 + (i % 3); const cs = G.clubs.filter((c) => c.tier === t && !c.me); const a = r2.pick(cs); let b = r2.pick(cs); while (b === a) b = r2.pick(cs);
    const res = simulateMatch(r2, { id: a.id, name: a.name, me: true, color: a.color, squad: a.squad, mgr: a.mgr }, { id: b.id, name: b.name, me: false, color: b.color, squad: b.squad, mgr: b.mgr }, {});
    for (const p of res.view.played) all.push(p.rt!); }
  all.sort((a, b) => a - b); console.log(`評価点（自チーム）平均 ${(all.reduce((s, x) => s + x, 0) / all.length).toFixed(2)}（約6.5）・10% ${all[Math.floor(all.length * 0.1)]}・90% ${all[Math.floor(all.length * 0.9)]}`);
}
