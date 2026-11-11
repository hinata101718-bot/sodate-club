/* ユース（企画書 9-1）：1学年4〜6人×3学年。月1回の報告会議（数字は見せず、言葉と矢印）と、春の昇格会議（ここで初めて数字が見える） */
import { Rng, clamp } from './rng';
import { POS, W, AT_F, AT_K, type Pos } from './constants';
import { makePlayer } from './player';
import { growPlayer, DEFAULT_CTX } from './growth';
import { PREFS, prefByName, prefScale } from './data/prefs';
import type { Player } from './types';

export interface YouthLine { pid: number; apps: number; goals: number; words: string; arrow: string; comment: string; stars: number; }
export interface YouthReport { season: number; month: number; lines: YouthLine[]; coach: string; }
export interface YouthEnv { pref: string; facility: number; dorm: number; coachSkill: number; }

const POS_PLAN: Pos[] = ['GK', 'CB', 'SB', 'DM', 'CM', 'AM', 'WG', 'ST'];
/** 新しい1年生（春の昇格会議のあとに入ってくる） */
export function intake(r: Rng, ids: { n: number }, env: YouthEnv): Player[] {
  const sc = prefScale(env.pref);
  const n = clamp(Math.round(3.6 + sc * 0.9 + (env.facility - 1) * 0.35 + r.next() * 0.8), 4, 6);
  const me = prefByName(env.pref);
  /* 寮があると、遠くの県の子も来る（問39） */
  const near = PREFS.filter((p) => p.region === me.region).map((p) => p.name);
  const far = PREFS.map((p) => p.name);
  const out: Player[] = [];
  for (let i = 0; i < n; i++) {
    const pos = i < 2 ? r.pick(POS_PLAN) : POS_PLAN[r.int(0, POS_PLAN.length - 1)];
    const farKid = env.dorm > 0 && r.next() < 0.12 + env.dorm * 0.07;
    const pref = farKid ? r.pick(far) : r.next() < 0.75 ? env.pref : r.pick(near);
    const lvl = 34 + r.int(-4, 5) + env.facility;
    const p = makePlayer(r, ids, lvl, pos, { age: 15, nSp: r.next() < 0.15 ? 1 : 0, exp: 0, pref, origin: 'ユース出身' });
    /* 素質：ユースの施設がよいほど高い。まれに原石がいる */
    const gem = r.next() < 0.05 + env.facility * 0.02;
    p.pot = clamp(Math.round(52 + env.facility * 3 + r.next() * 20 + (gem ? r.int(8, 16) : 0)), 45, 88);
    p.gStart = r.next() < 0.1 ? r.int(13, 15) : r.int(15, 22);
    p.grade = 1; p.snap = p.a.map(Math.floor); p.mApps = 0; p.mGoals = 0; p.yApps = 0; p.yGoals = 0; p.contract = 0; p.salary = 0;
    out.push(p);
  }
  return out;
}
export function startYouth(r: Rng, ids: { n: number }, env: YouthEnv): Player[] {
  const all: Player[] = [];
  for (const g of [3, 2, 1]) {
    const k = intake(r, ids, env);
    for (const p of k) { p.grade = g; p.age = 15 + g; for (let i = 0; i < 8; i++) p.a[i] = clamp(p.a[i] + (g - 1) * 3.5, 5, 99); p.snap = p.a.map(Math.floor); }
    all.push(...k);
  }
  return all;
}
/** ユースの1週（ユースコーチの腕前で伸び方が変わる） */
export function youthWeek(r: Rng, youth: Player[], coach: number, field: number, camp: boolean) {
  for (const p of youth) {
    p.played = r.next() < 0.55;
    if (p.played) { p.mApps = (p.mApps || 0) + 1; p.yApps = (p.yApps || 0) + 1; const gr = ({ ST: 0.45, WG: 0.3, AM: 0.25, CM: 0.1, DM: 0.04, SB: 0.04, CB: 0.05, GK: 0 } as Record<Pos, number>)[p.pos]; if (r.next() < gr) { p.mGoals = (p.mGoals || 0) + 1; p.yGoals = (p.yGoals || 0) + 1; } }
    growPlayer(r, p, { ...DEFAULT_CTX, coach: new Array(8).fill(0.9 + coach * 0.4), field, camp, mgrGrow: 0.8 });
    p.inj = 0; p.fat = 0;
  }
}
/** 月1回の報告会議：数字は見せず、言葉と矢印で伸び方だけを見せる（問28）。腕のいいコーチほど正確 */
export function monthlyReport(r: Rng, youth: Player[], season: number, month: number, skill: number): YouthReport {
  const lines: YouthLine[] = youth.map((p) => {
    const L = p.pos === 'GK' ? AT_K : AT_F;
    const now = p.a.map(Math.floor); const before = p.snap || now;
    const d = now.map((v, i) => v - before[i]);
    const order = [...d.keys()].sort((a, b) => d[b] - d[a]);
    let top = order[0];
    if (r.next() > 0.5 + skill * 0.5) top = r.int(0, 7); /* 見立ちがずれることがある */
    const total = d.reduce((s, v) => s + Math.max(0, v), 0);
    let words: string, arrow: string;
    if (total >= 6 || d[top] >= 3) { words = `${L[top]}がよく伸びた`; arrow = '↑↑'; }
    else if (total >= 2) { words = `${L[top]}が伸びた`; arrow = '↑'; }
    else { words = '伸びはゆっくり'; arrow = '→'; }
    p.snap = now;
    const stars = starsFor(p, skill, r);
    const comment = youthComment(p, stars, total);
    const ln: YouthLine = { pid: p.id, apps: p.mApps || 0, goals: p.mGoals || 0, words, arrow, comment, stars };
    p.mApps = 0; p.mGoals = 0;
    return ln;
  });
  const best = [...lines].sort((a, b) => b.stars - a.stars)[0];
  const bp = youth.find((p) => p.id === best?.pid);
  const coach = bp ? `今月いちばん目を引いたのは ${bp.name}（${bp.grade}年）です。` : 'ユースの子たちは、まじめに練習しています。';
  return { season, month, lines, coach };
}
/** ユースコーチの評価（★1〜5）。素質（どこまで伸びるか）を、腕前に応じてぼんやり当てる */
export function starsFor(p: Player, skill: number, r: Rng): number {
  const noise = (r.next() - 0.5) * (1 - skill) * 18;
  const v = p.pot + noise;
  return v >= 82 ? 5 : v >= 74 ? 4 : v >= 66 ? 3 : v >= 58 ? 2 : 1;
}
function youthComment(p: Player, stars: number, total: number): string {
  if (stars >= 5) return '化けるかもしれない。大事に育てたい';
  if (stars >= 4) return total >= 4 ? 'ぐんぐん伸びている。トップでも見てみたい' : '素質はある。伸びる時期を待ちたい';
  if (stars >= 3) return 'まじめに取り組んでいる。もうひと伸びほしい';
  if (stars >= 2) return 'いいところはある。体ができてくればおもしろい';
  return 'まだ時間がかかりそうだ';
}
/** 昇格会議で、コーチがすすめる子（3年の上位と、1・2年のとびぬけた子） */
export function recommend(youth: Player[], topSize: number): number[] {
  const room = Math.max(0, 35 - topSize);
  const score = (p: Player) => p.pot * 0.6 + avgW(p) * 0.4;
  const g3 = youth.filter((p) => p.grade === 3).sort((a, b) => score(b) - score(a));
  const pick = g3.filter((p) => score(p) >= 52).slice(0, Math.max(1, Math.min(3, room)));
  const early = youth.filter((p) => (p.grade || 1) < 3 && p.pot >= 80 && avgW(p) >= 48);
  return [...pick, ...early].slice(0, room).map((p) => p.id);
}
function avgW(p: Player) { const w = W[p.pos]; let s = 0, t = 0; for (let i = 0; i < 8; i++) { s += p.a[i] * w[i]; t += w[i]; } return s / t; }
export { POS };
