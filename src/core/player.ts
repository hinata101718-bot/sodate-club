import { Rng, clamp } from './rng';
import { APTF, NEAR, POS, W, type Pos } from './constants';
import { SPECIALS, SP_ANY, SP_BY_POS, NOT_GK, BAD_NAMES, badAllowed } from './data/specials';
import { GIVEN, SURNAMES } from './data/names';
import type { Player } from './types';

export interface Ids { n: number }
export interface MakeOpts {
  age?: number; name?: string; nSp?: number; exp?: number; pref?: string; origin?: string; pot?: number;
  gStart?: number; gLen?: number; prefPool?: string[];
}

export function randomName(r: Rng): string { return r.pick(SURNAMES) + ' ' + r.pick(GIVEN); }

/** 給料（万円/年）。強いほど高い */
/** 年俸（万円）。問125：Jリーグの目安に合わせた（3部の先発 約1,000万・2部 約2,700万・1部 約7,500万） */
export function salaryFor(o: number): number { const d = o - 55; return Math.max(300, Math.min(30000, Math.round((1000 * Math.exp(0.05 * d + 0.003 * d * Math.abs(d) * (d > 0 ? 1 : 0.4))) / 10) * 10)); }

/** 選手を作る。level はそのポジションでの強さの目安（総合力のおおよそ） */
export function makePlayer(r: Rng, ids: Ids, level: number, pos: Pos, opts: MakeOpts = {}): Player {
  const age = opts.age ?? r.int(18, 32);
  const a = new Array(8).fill(0);
  for (let i = 0; i < 8; i++) {
    const w = W[pos][i];
    a[i] = clamp(level - 12 + w * 6 + (r.next() * 16 - 8), 12, 95);
  }
  /* 成長期（企画書 8-4：選手ごとにバラバラ、多くは16〜28歳。ごくまれに16歳より前・28歳より後） */
  let gStart = Math.round(16 + r.next() * 9);
  const odd = r.next();
  if (odd < 0.05) gStart = r.int(13, 15); else if (odd > 0.95) gStart = r.int(26, 29);
  const gLen = r.chance(0.5) ? r.int(2, 4) : r.int(4, 8);
  const pot = opts.pot ?? clamp(Math.round(level + r.int(-3, 6) + (r.next() < 0.1 ? r.int(6, 14) : 0)), 30, 88);
  const apt = {} as Record<Pos, number>;
  for (const p of POS) apt[p] = 0;
  apt[pos] = 3;
  if (pos !== 'GK') {
    for (const p of POS) {
      if (p === 'GK' || p === pos) continue;
      apt[p] = NEAR[pos].includes(p) ? (r.next() < 0.35 ? 3 : r.next() < 0.6 ? 2 : 1) : r.next() < 0.25 ? 1 : 0;
    }
    capDouble(apt, pos);
  }
  const sp: string[] = [];
  const nSp = opts.nSp ?? (level >= 80 ? r.int(3, 5) : level > 66 ? r.int(2, 4) : level > 55 ? r.int(1, 2) : r.int(0, 1));
  const pool = [...SP_BY_POS[pos], ...SP_BY_POS[pos], ...SP_ANY.filter((s) => pos !== 'GK' || !NOT_GK.has(s))];
  let guard = 0;
  while (sp.length < nSp && guard++ < 50) { const s = r.pick(pool); if (!sp.includes(s)) sp.push(s); }
  const bad: string[] = [];
  const bp = BAD_NAMES.filter((b) => badAllowed(b, pos));
  if (r.next() < 0.3) bad.push(r.pick(bp));
  if (r.next() < 0.06) { const b = r.pick(bp); if (!bad.includes(b)) bad.push(b); }
  const fresh = opts.exp === 0;
  const prevApps = !fresh && age >= 19 ? (age - 18) * r.int(8, 22) : 0;
  const gr = ({ ST: 0.35, WG: 0.22, AM: 0.18, CM: 0.08, DM: 0.03, SB: 0.03, CB: 0.04, GK: 0 } as Record<Pos, number>)[pos];
  const height = pos === 'GK' || pos === 'CB' ? r.int(178, 194) : r.int(164, 188);
  const p: Player = {
    id: ids.n++, name: opts.name ?? randomName(r), age, pos, a, pot, gStart: opts.gStart ?? gStart, gLen: opts.gLen ?? gLen,
    decl: r.int(29, 33) + (sp.includes('衰えにくい') ? 2 : 0), apt, aptXp: {}, sp, bad,
    exp: opts.exp ?? clamp((age - 18) * 12 + r.int(0, 20), 0, 100), cond: 0, fat: 0, inj: 0,
    pref: opts.pref ?? (opts.prefPool ? r.pick(opts.prefPool) : '静岡県'), height, foot: r.next() < 0.22 ? '左' : r.next() < 0.08 ? '両' : '右',
    origin: opts.origin ?? r.pick(['スカウト', '練習生', '他クラブから', '大学から']), num: 0,
    apps: prevApps, goals: Math.round(prevApps * gr * (0.5 + r.next())), seasonApps: 0, seasonGoals: 0, seasonPerf: 0,
    firstApp: fresh || !prevApps ? null : '入団前', firstGoal: null, req: false, played: false, injNew: false, hist: [],
    contract: r.int(1, 3), salary: 0,
  };
  p.salary = salaryFor(ovr(p));
  return p;
}

/** ◎は多くて4つ（企画書 8-3） */
export function capDouble(apt: Record<Pos, number>, main: Pos) {
  const dbl = POS.filter((p) => apt[p] === 3 && p !== main);
  while (dbl.length > 3) { const p = dbl.pop()!; apt[p] = 2; }
}

export function ovr(p: Player): number { return Math.round(rating(p, p.pos)); }
export function rating(p: Player, pos: Pos): number {
  const w = W[pos]; let s = 0, t = 0;
  for (let i = 0; i < 8; i++) { s += p.a[i] * w[i]; t += w[i]; }
  return s / t;
}
/** そのポジションで出せる力（適性つき） */
export function posRating(p: Player, pos: Pos): number { return rating(p, pos) * APTF[p.apt[pos]]; }
export function isGood(name: string): boolean { return !!SPECIALS.find((s) => s.name === name && s.good); }

/** トップチームの基本の顔ぶれ（22人） */
export const SQUAD_PLAN: Pos[] = ['GK', 'GK', 'CB', 'CB', 'CB', 'CB', 'SB', 'SB', 'SB', 'DM', 'DM', 'CM', 'CM', 'CM', 'AM', 'AM', 'WG', 'WG', 'WG', 'ST', 'ST', 'ST'];
export function makeSquad(r: Rng, ids: Ids, level: number, opts: MakeOpts = {}): Player[] {
  const sq = SQUAD_PLAN.map((p) => makePlayer(r, ids, level + r.int(-5, 4), p, opts));
  assignNumbers(sq);
  return sq;
}
export function assignNumbers(sq: Player[]) {
  const used = new Set(sq.filter((p) => p.num > 0).map((p) => p.num));
  const pref: Record<Pos, number[]> = { GK: [1, 21, 31], CB: [3, 4, 5, 15, 22], SB: [2, 6, 16, 23], DM: [6, 14, 24], CM: [8, 7, 17, 25], AM: [10, 18, 26], WG: [7, 11, 19, 27], ST: [9, 11, 20, 13, 29] };
  for (const p of sq) {
    if (p.num > 0) continue;
    let n = pref[p.pos].find((x) => !used.has(x));
    if (!n) { n = 2; while (used.has(n)) n++; }
    p.num = n; used.add(n);
  }
}
/** 強いほうから11人の総合力の平均 */
export function teamStrength(sq: Player[]): number {
  const v = sq.filter((p) => p.inj === 0).map(ovr).sort((x, y) => y - x).slice(0, 11);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
}
export function inGrowth(p: Player): boolean { return p.age >= p.gStart && p.age < p.gStart + p.gLen; }

/** 問124：成長タイプ（隠れている伸び方から決める）。クラブに丸1シーズンいると、コーチが言えるようになる */
export function growthType(p: Player): '早熟' | 'ふつう' | '晩成' | '長く伸びる' {
  if (p.gLen >= 7) return '長く伸びる';
  if (p.gStart >= 23) return '晩成';
  if (p.gStart <= 17 && p.gStart + p.gLen <= 21) return '早熟';
  if (p.decl <= 29 && p.gStart <= 18) return '早熟';
  return 'ふつう';
}
