/* 世界：3段×12クラブ・全36クラブ（企画書 5）。相手の35クラブは、自分の県以外の県に1つずつ */
import { Rng } from './rng';
import { PREFS, cityShort } from './data/prefs';
import { CLUB_COLORS, CLUB_WORDS } from './data/names';
import { makeSquad, ovr, teamStrength } from './player';
import { makeManager } from './staff';
import type { Emblem } from './emblem';
import type { Manager, Player } from './types';
import { initFin, type ClubFin } from './clubfin';

export interface Club { id: number; name: string; color: string; pref: string; tier: number; lvl: number; squad: Player[]; mgr: Manager; emblem: Emblem; me: boolean; prevRank: number; fin?: ClubFin; }
/** 段ごとの強さの目安（先発の総合力：3部50〜60、2部65〜70、1部72〜75。感想 4） */
export const TIER_LVL: Record<number, number> = { 3: 57, 2: 69, 1: 76 };

export function clubName(r: Rng, pref: string, used: Set<string>): string {
  const p = PREFS.find((x) => x.name === pref)!;
  const base = cityShort(p.city);
  for (let i = 0; i < 30; i++) {
    const w = r.pick(CLUB_WORDS);
    const n = r.next() < 0.18 ? `FC${base}${w}` : r.next() < 0.3 ? `${base}${w}SC` : `${base}${w}`;
    if (!used.has(n)) { used.add(n); return n; }
  }
  const n = `${base}FC${used.size}`; used.add(n); return n;
}
export function makeAiClub(r: Rng, ids: { n: number }, id: number, pref: string, tier: number, used: Set<string>): Club {
  const lvl = TIER_LVL[tier] + r.int(-4, 5);
  const color = r.pick(CLUB_COLORS);
  const c: Club = {
    id, name: clubName(r, pref, used), color, pref, tier, lvl, squad: makeSquad(r, ids, lvl, { prefPool: [pref, pref, pref, r.pick(PREFS).name] }),
    mgr: makeManager(r, ids, tier === 1 ? 0.6 + r.next() * 0.4 : tier === 2 ? 0.3 + r.next() * 0.5 : r.next() * 0.6),
    emblem: { shape: r.int(0, 4), pattern: r.int(0, 3), c1: color, c2: '#ffffff', symbol: r.int(0, 5) }, me: false, prevRank: 0,
  };
  c.fin = initFin(c, r);
  return c;
}
/** 自分の県以外の46県から35県を選んで、1つずつクラブを置く */
export function makeWorld(r: Rng, ids: { n: number }, myPref: string, myTier: number, keep: Club[] = []): Club[] {
  const others = PREFS.map((p) => p.name).filter((n) => n !== myPref && !keep.some((k) => k.pref === n));
  r.shuffle(others);
  const used = new Set<string>(keep.map((k) => k.name));
  const clubs: Club[] = [...keep];
  const tiers: number[] = [];
  for (const t of [1, 2, 3]) for (let i = 0; i < 12; i++) tiers.push(t);
  /* 自分の段と、残しておくクラブの段を先に引く */
  const take = (t: number) => { const i = tiers.indexOf(t); if (i >= 0) tiers.splice(i, 1); };
  for (const k of keep) take(k.tier);
  void myTier;
  let id = Math.max(0, ...keep.map((k) => k.id)) + 1;
  for (const t of tiers) clubs.push(makeAiClub(r, ids, id++, others.pop()!, t, used));
  return clubs;
}
/** 段が変わったときなどに、強さを段の目安へ近づける（顔ぶれはそのまま） */
export function nudgeToTier(c: Club, r: Rng, rate = 0.7) {
  const target = TIER_LVL[c.tier] + r.int(-3, 4);
  const now = teamStrength(c.squad);
  const shift = (target - 1.5 - now) * rate;
  for (const p of c.squad) p.a = p.a.map((v) => Math.max(10, Math.min(95, v + shift * (0.8 + r.next() * 0.4))));
  c.lvl = target;
}
/** 問126：お金で決まった強さ（先発の総合力の目安）へ近づける */
export function nudgeTo(c: Club, r: Rng, target: number) {
  const shift = target - teamStrength(c.squad);
  for (const p of c.squad) p.a = p.a.map((v) => Math.max(10, Math.min(95, v + shift * (0.8 + r.next() * 0.4))));
  c.lvl = Math.round(target);
}
export const bestPlayers = (sq: Player[], n: number) => [...sq].sort((a, b) => ovr(b) - ovr(a)).slice(0, n);
