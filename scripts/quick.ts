import { Rng } from '../src/core/rng';
import { makeSquad, teamStrength } from '../src/core/player';
import { simulateMatch, type TeamIn } from '../src/core/match';
import { STYLE_NAMES, FORM } from '../src/core/constants';
import { TUNE } from '../src/core/match';
TUNE.base = +(process.env.B||1.75); TUNE.shotMul = +(process.env.M||1.06);
const r = new Rng(1);
const ids = { n: 1 };
const forms = Object.keys(FORM);
function team(id: number, lvl: number): TeamIn {
  return { id, name: 'T' + id, me: false, color: '#333', squad: makeSquad(r, ids, lvl), mgr: { id, name: 'あ い', style: r.pick(STYLE_NAMES), forms: [r.pick(forms), r.pick(forms)], youth: 1, obey: 0.5, grow: 1, salary: 0, age: 50 } };
}
let goals = 0, n = 0, sw = 0, sd = 0, sn = 0; const diffs: number[] = [];
for (let i = 0; i < 3000; i++) {
  const base = 50 + r.int(0, 25);
  const d = r.int(0, 8);
  const A = team(1, base + d), B = team(2, base);
  const sa = teamStrength(A.squad), sb = teamStrength(B.squad);
  const home = i % 2 === 0;
  const res = home ? simulateMatch(r, A, B) : simulateMatch(r, B, A);
  const [h, a] = res.score; goals += h + a; n++;
  const diff = sa - sb;
  const aG = home ? h : a, bG = home ? a : h;
  if (Math.abs(diff) >= 3 && Math.abs(diff) <= 6) { sn++; const strongWin = diff > 0 ? aG > bG : bG > aG; if (strongWin) sw++; if (aG === bG) sd++; }
}
console.log('avg goals', (goals / n).toFixed(2), 'strong win (3-6)', (sw / sn).toFixed(3), 'draw', (sd / sn).toFixed(3), 'n', sn);
