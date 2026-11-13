/* 試合のエンジンの速さと数字を見る：N=200 npx vite-node scripts/simbench.ts */
import { newGame } from '../src/core/game';
import { simulateMatch } from '../src/core/match';
import { SIM, MatchSim } from '../src/core/sim';
if (process.env.DT) SIM.dt = +process.env.DT; if (process.env.TGT) SIM.tgt = +process.env.TGT;
for (const kv of (process.env.SET || '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); (SIM as any)[k] = +v; }
import { Rng } from '../src/core/rng';
import { teamStrength } from '../src/core/player';
const N = +(process.env.N || 200); const G = newGame({ seed: +(process.env.SEED || 3) }); const r = new Rng(+(process.env.R || 99));
const S: Record<string, number> = {}; let goals = 0, draws = 0, sw = 0, sn = 0, pks = 0, reds = 0;
const t0 = performance.now(); const RK: Record<string, number> = {};
for (let i = 0; i < N; i++) {
  const t = 1 + (i % 3); const cs = G.clubs.filter((c) => c.tier === t && !c.me); const a = r.pick(cs); let b = r.pick(cs); while (b === a) b = r.pick(cs);
  const ti = (c: typeof a) => ({ id: c.id, name: c.name, me: false, color: c.color, squad: c.squad, mgr: c.mgr });
  const m = new MatchSim(r, ti(a), ti(b), {}); const od = (m as any).dead.bind(m); (m as any).dead = (kind: string, ...rest: unknown[]) => { RK[kind] = (RK[kind] ?? 0) + 1; return od(kind, ...rest); }; const res = m.run(); const st = res.view.stats!;
  for (const sd of m.sides) for (const x of sd.st.values()) { S.tk = (S.tk ?? 0) + x.tk; S.dr = (S.dr ?? 0) + x.dr; S.kp = (S.kp ?? 0) + x.kp; }
  S.inplay = (S.inplay ?? 0) + m.possT[0] + m.possT[1];
  for (const k of Object.keys(st)) S[k] = (S[k] ?? 0) + (st as any)[k][0] + (st as any)[k][1];
  goals += res.score[0] + res.score[1]; if (res.score[0] === res.score[1]) draws++;
  pks += res.view.shots!.filter((x) => x.how === 'PK').length; reds += st.rc[0] + st.rc[1];
  const d = teamStrength(a.squad) - teamStrength(b.squad);
  if (Math.abs(d) >= 3) { sn++; if ((d > 0 ? res.score[0] - res.score[1] : res.score[1] - res.score[0]) > 0) sw++; }
}
const ms = (performance.now() - t0) / N;
const pt = (k: string) => (S[k] / N / 2).toFixed(1);
console.log(`${ms.toFixed(1)}ms/試合  点 ${(goals / N).toFixed(2)} 引分 ${(draws / N * 100).toFixed(0)}% 強いほう勝ち ${(sw / Math.max(1, sn) * 100).toFixed(0)}%(${sn})`);
console.log(`タックル ${pt('tk')} ドリブル成功 ${pt('dr')} キーパス ${pt('kp')} インプレー ${(S.inplay / N / 60).toFixed(1)}分`);
console.log(`1チーム：支配 ${(S.poss / N / 2).toFixed(0)} パス ${pt('pa')} 成功 ${(S.pc / S.pa * 100).toFixed(0)}% シュート ${pt('sh')} 枠内 ${(S.ot / S.sh * 100).toFixed(0)}% CK ${pt('ck')} ファウル ${pt('fo')} 黄 ${pt('yc')} 赤 ${(reds / N).toFixed(2)}/試合 オフサイド ${pt('off')} PK ${(pks / N).toFixed(2)}/試合`);

void simulateMatch;

console.log('再開/試合', Object.entries(RK).map(([k, v]) => `${k} ${(v / N).toFixed(1)}`).join(' '));
