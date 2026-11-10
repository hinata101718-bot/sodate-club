/* ゲームの状態と、1週ずつ進めるしくみ */
import { Rng, clamp } from './rng';
import { FORM, STYLE_NAMES } from './constants';
import { makePlayer, makeSquad, ovr, assignNumbers } from './player';
import { simulateMatch, type Policy, type TeamIn } from './match';
import { growPlayer, mergeReports, DEFAULT_CTX } from './growth';
import { makeManager } from './staff';
import { CLUB_COLORS } from './data/names';
import { defaultEmblem, type Emblem } from './emblem';
import type { Manager, MatchView, Player, ReportEntry } from './types';

export const SAVE_VERSION = 1;
export interface Row { p: number; w: number; d: number; l: number; gf: number; ga: number; }
export interface ClubRec { id: number; name: string; color: string; me: boolean; lvl: number; squad: Player[]; mgr: Manager; pref: string; }
export interface Offer { type: 'offer'; pid: number; club: string; price: number; }
export interface GameState {
  version: number;
  rng: number;
  ids: { n: number };
  season: number;
  week: number;
  tier: number;
  club: { name: string; color: string; pref: string; city: string; emblem: Emblem };
  clubs: ClubRec[];
  squad: Player[];
  mgr: Manager;
  policy: Policy;
  fixtures: [number, number][][];
  table: Record<number, Row>;
  lastMatch: MatchView | null;
  lastReport: ReportEntry[];
  pending: Offer[];
  lastSeason: { season: number; rank: number; up: boolean } | null;
}

const OPP = [['浜名湖ブリーズ', '#2c6aa0'], ['豊橋ソレイユ', '#c47a1a'], ['甲府アルペンSC', '#5b3f8f'], ['四日市ポートFC', '#1d7f8a'], ['松本ハイランダーズ', '#4b6b2f'], ['岐阜リバーサイド', '#a63a3a'], ['長岡フレイムFC', '#c2561b'], ['津テンプルス', '#3a4f8f'], ['富士宮ボルケーノ', '#8f2f4f'], ['上越スノーウルフ', '#4f7f9f'], ['伊那バレーFC', '#6f7f2f']];
/** 段ごとの強さの目安（先発の総合力：3部50〜60、2部65〜70、1部72〜75。感想 4） */
export const TIER_LVL: Record<number, number> = { 3: 57, 2: 69, 1: 76 };

export function newGame(seed = 20261110): GameState {
  const r = new Rng(seed); const ids = { n: 1 };
  const mgr = makeManager(r, ids, 0.55, 'ポゼッション');
  mgr.forms = ['4-3-3', '4-2-3-1', '5-3-2']; mgr.youth = 1.3; mgr.obey = 0.75; mgr.grow = 1.15;
  const squad = makeSquad(r, ids, 53, { pref: '静岡県' });
  /* 化けそうな無名の若手を何人か混ぜる（試作と同じ） */
  for (const pos of ['WG', 'CM', 'ST', 'CB'] as const) {
    const k = makePlayer(r, ids, 44, pos, { age: r.int(16, 18), nSp: 0, exp: 0, pref: '静岡県', origin: 'ユース出身' });
    k.pot = r.int(76, 86); k.gStart = k.age; k.gLen = r.int(4, 7); k.contract = 3; squad.push(k);
  }
  assignNumbers(squad);
  const clubs: ClubRec[] = [{ id: 0, name: 'わかば静岡FC', color: '#1f6f5c', me: true, lvl: 53, squad: [], mgr, pref: '静岡県' }];
  OPP.forEach(([n, c], i) => {
    const lvl = TIER_LVL[3] + r.int(-4, 5);
    clubs.push({ id: i + 1, name: n, color: c, me: false, lvl, squad: makeSquad(r, ids, lvl), mgr: makeManager(r, ids, r.next()), pref: '静岡県' });
  });
  const G: GameState = {
    version: SAVE_VERSION, rng: r.s, ids, season: 1, week: 0, tier: 3,
    club: { name: 'わかば静岡FC', color: '#1f6f5c', pref: '静岡県', city: '静岡市', emblem: defaultEmblem('#1f6f5c') },
    clubs, squad, mgr, policy: 'ふつう', fixtures: makeFixtures(12), table: {}, lastMatch: null, lastReport: [], pending: [], lastSeason: null,
  };
  for (const c of clubs) G.table[c.id] = emptyRow();
  return G;
}
export const emptyRow = (): Row => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });

/** 総当たり（ホーム・アウェイで年22試合） */
export function makeFixtures(n: number): [number, number][][] {
  const ids = [...Array(n).keys()]; const rounds: [number, number][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) { const h = ids[i], a = ids[n - 1 - i]; pairs.push(r % 2 ? [a, h] : [h, a]); }
    rounds.push(pairs); ids.splice(1, 0, ids.pop()!);
  }
  return [...rounds, ...rounds.map((rd) => rd.map(([h, a]) => [a, h] as [number, number]))];
}
export const clubById = (G: GameState, id: number) => G.clubs.find((c) => c.id === id)!;
export function teamIn(G: GameState, c: ClubRec): TeamIn {
  return c.me ? { id: c.id, name: G.club.name, me: true, color: G.club.color, squad: G.squad, mgr: G.mgr, policy: G.policy } : { id: c.id, name: c.name, me: false, color: c.color, squad: c.squad, mgr: c.mgr };
}
export function standings(G: GameState) {
  return G.clubs.map((c) => ({ c, ...G.table[c.id] })).sort((a, b) => b.p - a.p || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf);
}
export const dateLabel = (G: GameState) => `${G.season}年目 第${G.week + 1}節`;
const MONTHS = ['3月', '3月', '4月', '4月', '4月', '5月', '5月', '5月', '6月', '6月', '7月', '7月', '8月', '8月', '9月', '9月', '9月', '10月', '10月', '10月', '11月', '11月', '12月'];
export const monthOf = (w: number) => MONTHS[Math.min(w, 22)];

export interface WeekResult { match: MatchView | null; report: ReportEntry[]; seasonEnd?: boolean; }

/** 1週進める */
export function advanceWeek(G: GameState): WeekResult {
  const r = new Rng(G.rng);
  try {
    if (G.week >= 22) { endSeason(G, r); return { match: null, report: [], seasonEnd: true }; }
    const round = G.fixtures[G.week]; let mine: MatchView | null = null;
    for (const [h, a] of round) {
      const hc = G.clubs[h], ac = G.clubs[a];
      const meIn = hc.me || ac.me;
      const res = simulateMatch(r, teamIn(G, hc), teamIn(G, ac), { record: true, label: dateLabel(G), big: G.week >= 18, title: `第${G.week + 1}節` });
      const [sh, sa] = res.score; const th = G.table[hc.id], ta = G.table[ac.id];
      th.gf += sh; th.ga += sa; ta.gf += sa; ta.ga += sh;
      if (sh > sa) { th.w++; th.p += 3; ta.l++; } else if (sh < sa) { ta.w++; ta.p += 3; th.l++; } else { th.d++; ta.d++; th.p++; ta.p++; }
      if (meIn) mine = res.view;
    }
    const report: ReportEntry[] = [];
    for (const p of G.squad) { const e = growPlayer(r, p, { ...DEFAULT_CTX, mgrGrow: G.mgr.grow, style: G.mgr.style }); if (e) report.push(e); }
    for (const c of G.clubs) if (!c.me) for (const p of c.squad) { p.fat = clamp(p.fat - 28, 0, 100); if (p.inj) p.inj--; p.played = false; p.injNew = false; }
    G.week++;
    G.lastMatch = mine; G.lastReport = mergeReports(report);
    maybeOffer(G, r);
    return { match: mine, report: G.lastReport };
  } finally { G.rng = r.s; }
}

function maybeOffer(G: GameState, r: Rng) {
  /* オーナーが決めること：他クラブからのオファー（問41）。移籍の期間（夏と冬）だけ */
  const window = (G.week >= 10 && G.week <= 13) || G.week >= 20;
  if (!window || r.next() > 0.28) return;
  const cands = G.squad.filter((p) => ovr(p) >= 52 && p.inj === 0 && !G.pending.some((e) => e.pid === p.id)); if (!cands.length) return;
  const p = r.pick(cands); const club = r.pick(['横浜ベイサイドFC', '名古屋グランツ', '大阪キャッスルズ', '札幌スノーリーフ']);
  const price = Math.round(((ovr(p) - 40) * (p.age < 24 ? 1.6 : 1) * 900) / 100) * 100;
  G.pending.push({ type: 'offer', pid: p.id, club, price });
}
export function answerOffer(G: GameState, i: number, accept: boolean) {
  const e = G.pending[i]; if (!e) return;
  if (accept) G.squad = G.squad.filter((x) => x.id !== e.pid);
  G.pending.splice(i, 1);
}

function endSeason(G: GameState, r: Rng) {
  const rows = standings(G); const rank = rows.findIndex((x) => x.c.me) + 1;
  G.lastSeason = { season: G.season, rank, up: rank <= 2 };
  for (const p of G.squad) { p.hist.push({ y: G.season, ovr: ovr(p), a: p.a.map(Math.floor) }); p.age++; p.seasonApps = 0; p.seasonGoals = 0; p.seasonPerf = 0; }
  if (G.lastSeason.up && G.tier > 1) G.tier--;
  for (const c of G.clubs) if (!c.me) { c.lvl = TIER_LVL[G.tier] + r.int(-4, 5); c.squad = makeSquad(r, G.ids, c.lvl); if (r.next() < 0.2) c.mgr = makeManager(r, G.ids, r.next(), r.pick(STYLE_NAMES)); }
  G.season++; G.week = 0; G.fixtures = makeFixtures(12);
  for (const c of G.clubs) G.table[c.id] = emptyRow();
}

export interface SkipResult { weeks: number; report: ReportEntry[]; lastMatch: MatchView | null; seasonEnd: boolean; }
/** 次に決めること（オファー・大きな覚醒・シーズンの終わり）まで、見どころを飛ばして進む */
export function advanceToDecision(G: GameState, maxWeeks = 8): SkipResult {
  let weeks = 0; const all: ReportEntry[] = []; let last: MatchView | null = null; let seasonEnd = false;
  while (weeks < maxWeeks) {
    const res = advanceWeek(G); weeks++;
    if (res.seasonEnd) { seasonEnd = true; break; }
    all.push(...res.report); if (res.match) last = res.match;
    if (G.pending.length || res.report.some((x) => x.awake) || G.week >= 22) break;
  }
  return { weeks, report: mergeReports(all), lastMatch: last, seasonEnd };
}
export const FORMS = Object.keys(FORM);
