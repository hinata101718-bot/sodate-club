/* ゲームの状態と、1週ずつ進めるしくみ */
import { Rng, clamp } from './rng';
import { makePlayer, makeSquad, ovr, assignNumbers, teamStrength } from './player';
import { simulateMatch, type Policy, type TeamIn } from './match';
import { growPlayer, mergeReports, DEFAULT_CTX } from './growth';
import { makeManager } from './staff';
import { prefByName } from './data/prefs';
import { defaultEmblem, type Emblem } from './emblem';
import { makeWorld, nudgeToTier, TIER_LVL, type Club } from './world';
import { AWARD_WEEK, CUP_ROUND_NAMES, WEEKS, isCamp, isOff, isWindow, monthOf, seasonSchedule, weekOfMonth } from './calendar';
import { makeFixtures } from './fixtures';
import type { Manager, MatchView, Player, ReportEntry } from './types';

export { makeFixtures };
export const SAVE_VERSION = 2;
export interface Row { p: number; w: number; d: number; l: number; gf: number; ga: number; }
export interface Offer { type: 'offer'; pid: number; club: string; price: number; }
export interface CupTie { a: number; b: number; w?: number; s?: [number, number]; pk?: [number, number] | null; }
export interface Cup { round: number; rounds: CupTie[][]; champion: number | null; }
export interface League { ids: number[]; fixtures: [number, number][][]; table: Record<number, Row>; }
export interface Award { title: string; tier: number; name: string; club: string; me: boolean; detail: string; }
export interface SeasonRec { season: number; tier: number; rank: number; cup: string; awards: Award[]; promoted: boolean; relegated: boolean; champion: Record<number, string>; cupChampion: string; }
export interface GoalRec { id: string; season: number; }
export interface NewGameOpts { seed?: number; pref?: string; name?: string; color?: string; emblem?: Emblem; }
export interface GameState {
  version: number;
  rng: number;
  ids: { n: number };
  season: number;
  /** 1年の中の週（0〜47） */
  week: number;
  club: { name: string; color: string; pref: string; city: string; emblem: Emblem };
  clubs: Club[];
  squad: Player[];
  mgr: Manager;
  policy: Policy;
  leagues: Record<number, League>;
  sched: { league: number[]; cup: number[] };
  cup: Cup;
  lastMatch: MatchView | null;
  lastReport: ReportEntry[];
  pending: Offer[];
  history: SeasonRec[];
  goals: GoalRec[];
  /** 今週のお知らせ（1行ずつ） */
  news: string[];
}
export const ME = 0;

export function newGame(o: NewGameOpts = {}): GameState {
  const r = new Rng(o.seed ?? 20261110); const ids = { n: 1 };
  const pref = o.pref ?? '静岡県'; const P = prefByName(pref);
  const color = o.color ?? '#1f6f5c';
  const name = o.name ?? 'わかば静岡FC';
  const mgr = makeManager(r, ids, 0.55, 'ポゼッション');
  mgr.forms = ['4-3-3', '4-2-3-1', '5-3-2']; mgr.youth = 1.3; mgr.obey = 0.75; mgr.grow = 1.15;
  /* 最初の選手は、地元の若手中心の22人ほどで、能力は低め（企画書 3★） */
  const squad = makeSquad(r, ids, 53, { prefPool: [pref, pref, pref, pref, '東京都', '大阪府', '神奈川県', '愛知県', '福岡県'] });
  for (const pos of ['WG', 'CM', 'ST', 'CB'] as const) {
    const k = makePlayer(r, ids, 44, pos, { age: r.int(16, 18), nSp: 0, exp: 0, pref, origin: 'ユース出身' });
    k.pot = r.int(76, 86); k.gStart = k.age; k.gLen = r.int(4, 7); k.contract = 3; squad.push(k);
  }
  assignNumbers(squad);
  const emblem = o.emblem ?? defaultEmblem(color);
  const me: Club = { id: ME, name, color, pref, tier: 3, lvl: 53, squad: [], mgr, emblem, me: true, prevRank: 0 };
  const clubs = makeWorld(r, ids, pref, 3, [me]);
  const G: GameState = {
    version: SAVE_VERSION, rng: r.s, ids, season: 1, week: 0,
    club: { name, color, pref, city: P.city, emblem },
    clubs, squad, mgr, policy: 'ふつう', leagues: {}, sched: seasonSchedule(), cup: { round: 0, rounds: [], champion: null },
    lastMatch: null, lastReport: [], pending: [], history: [], goals: [], news: [],
  };
  setupSeason(G, r);
  G.rng = r.s;
  return G;
}

export function setupSeason(G: GameState, r: Rng) {
  for (const t of [1, 2, 3]) {
    const ids = G.clubs.filter((c) => c.tier === t).map((c) => c.id);
    r.shuffle(ids);
    const fx = makeFixtures(12).map((rd) => rd.map(([h, a]) => [ids[h], ids[a]] as [number, number]));
    const table: Record<number, Row> = {}; for (const id of ids) table[id] = emptyRow();
    G.leagues[t] = { ids, fixtures: fx, table };
  }
  G.sched = seasonSchedule();
  G.cup = { round: 0, rounds: [], champion: null };
}
export const emptyRow = (): Row => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });
export const clubById = (G: GameState, id: number) => G.clubs.find((c) => c.id === id)!;
export const myClub = (G: GameState) => clubById(G, ME);
export const myTier = (G: GameState) => myClub(G).tier;
export const clubName = (G: GameState, id: number) => (id === ME ? G.club.name : clubById(G, id).name);
export function teamIn(G: GameState, c: Club): TeamIn {
  return c.me ? { id: c.id, name: G.club.name, me: true, color: G.club.color, squad: G.squad, mgr: G.mgr, policy: G.policy } : { id: c.id, name: c.name, me: false, color: c.color, squad: c.squad, mgr: c.mgr };
}
/** 順位表（勝ち点、並んだら得失点差、さらに得点） */
export function standings(G: GameState, tier = myTier(G)) {
  const L = G.leagues[tier];
  return L.ids.map((id) => ({ c: clubById(G, id), id, ...L.table[id] })).sort((a, b) => b.p - a.p || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf || a.id - b.id);
}
export const myRank = (G: GameState) => standings(G).findIndex((x) => x.id === ME) + 1;
export const leagueRound = (G: GameState) => G.sched.league.filter((w) => w < G.week).length;
export const dateText = (G: GameState) => `${G.season}年目 ${monthOf(G.week)}月 第${weekOfMonth(G.week)}週`;

export type NextEvent = { kind: 'league'; round: number; opp: number; home: boolean } | { kind: 'cup'; round: number; opp: number | null; home: boolean } | { kind: 'off' } | { kind: 'camp' } | { kind: 'promo' } | { kind: 'rest' } | { kind: 'dec' };
/** 今週なにがあるか */
export function eventOf(G: GameState, w = G.week): NextEvent {
  const li = G.sched.league.indexOf(w);
  if (li >= 0) {
    const pair = G.leagues[myTier(G)].fixtures[li].find(([h, a]) => h === ME || a === ME)!;
    return { kind: 'league', round: li + 1, opp: pair[0] === ME ? pair[1] : pair[0], home: pair[0] === ME };
  }
  const ci = G.sched.cup.indexOf(w);
  if (ci >= 0) return { kind: 'cup', round: ci, opp: null, home: false };
  if (isOff(w)) return { kind: 'off' };
  if (w === 4) return { kind: 'promo' };
  if (isCamp(w)) return { kind: 'camp' };
  if (w >= AWARD_WEEK) return { kind: 'dec' };
  return { kind: 'rest' };
}
export function cupAlive(G: GameState): boolean {
  if (G.cup.champion != null) return G.cup.champion === ME;
  for (const rd of G.cup.rounds) { const t = rd.find((x) => x.a === ME || x.b === ME); if (t && t.w != null && t.w !== ME) return false; }
  return true;
}

export interface WeekResult { match: MatchView | null; report: ReportEntry[]; seasonEnd?: boolean; news: string[]; }

function playLeagueRound(G: GameState, r: Rng, li: number): MatchView | null {
  let mine: MatchView | null = null;
  const tier = myTier(G);
  for (const t of [1, 2, 3]) {
    const L = G.leagues[t];
    for (const [h, a] of L.fixtures[li]) {
      const hc = clubById(G, h), ac = clubById(G, a);
      const isMine = h === ME || a === ME;
      const big = isMine && li >= 17 && contention(G, t);
      const res = simulateMatch(r, teamIn(G, hc), teamIn(G, ac), { record: true, label: `${G.season}年目 リーグ第${li + 1}節`, big, title: `${t}部 第${li + 1}節` });
      const [sh, sa] = res.score; const th = L.table[h], ta = L.table[a];
      th.gf += sh; th.ga += sa; ta.gf += sa; ta.ga += sh;
      if (sh > sa) { th.w++; th.p += 3; ta.l++; } else if (sh < sa) { ta.w++; ta.p += 3; th.l++; } else { th.d++; ta.d++; th.p++; ta.p++; }
      if (isMine) mine = res.view;
    }
  }
  void tier;
  return mine;
}
/** 昇格や優勝がかかっているか（見どころを長めにする：問37） */
function contention(G: GameState, tier: number): boolean {
  const rows = standings(G, tier); const me = rows.findIndex((x) => x.id === ME);
  if (me < 0) return false;
  const line = rows[tier === 1 ? 0 : 1];
  return me <= 3 || line.p - rows[me].p <= 6;
}

/** 勝ち抜きの大会（企画書 5）：1回戦は3部と2部の24クラブ、2回戦から1部の下位4つ、3回戦から1部の上位8つが出てくる */
function cupEntrants(G: GameState, round: number, winners: number[]): number[] {
  const t1 = G.clubs.filter((c) => c.tier === 1).sort((a, b) => (a.prevRank || 99) - (b.prevRank || 99) || a.id - b.id).map((c) => c.id);
  if (round === 0) return G.clubs.filter((c) => c.tier >= 2).map((c) => c.id);
  if (round === 1) return [...winners, ...t1.slice(8)];
  if (round === 2) return [...winners, ...t1.slice(0, 8)];
  return winners;
}
function playCupRound(G: GameState, r: Rng, round: number): MatchView | null {
  const prev = G.cup.rounds[round - 1];
  const winners = prev ? prev.map((t) => t.w!) : [];
  const ent = cupEntrants(G, round, winners); r.shuffle(ent);
  const ties: CupTie[] = [];
  for (let i = 0; i + 1 < ent.length; i += 2) ties.push({ a: ent[i], b: ent[i + 1] });
  let mine: MatchView | null = null;
  const final = round === 5;
  for (const t of ties) {
    const isMine = t.a === ME || t.b === ME;
    const res = simulateMatch(r, teamIn(G, clubById(G, t.a)), teamIn(G, clubById(G, t.b)), { record: true, cup: true, neutral: final, big: isMine && round >= 3, label: `${G.season}年目 大会${CUP_ROUND_NAMES[round]}`, title: `勝ち抜きの大会 ${CUP_ROUND_NAMES[round]}` });
    t.s = res.score; t.pk = res.pk; t.w = res.winner === 0 ? t.a : t.b;
    if (isMine) mine = res.view;
  }
  G.cup.rounds[round] = ties; G.cup.round = round + 1;
  if (final) G.cup.champion = ties[0].w!;
  return mine;
}

/** 1週進める */
export function advanceWeek(G: GameState): WeekResult {
  const r = new Rng(G.rng);
  const news: string[] = [];
  try {
    const w = G.week;
    let match: MatchView | null = null;
    const li = G.sched.league.indexOf(w); const ci = G.sched.cup.indexOf(w);
    if (li >= 0) match = playLeagueRound(G, r, li);
    if (ci >= 0) {
      const wasAlive = cupAlive(G);
      match = playCupRound(G, r, ci);
      if (wasAlive && !cupAlive(G)) news.push(`勝ち抜きの大会は${CUP_ROUND_NAMES[ci]}で負けた。`);
      if (G.cup.champion === ME) news.push('勝ち抜きの大会で優勝した！');
    }
    if (isOff(w) && w === 0) news.push('オフの休み。ケガと疲れが回復する。');
    if (isCamp(w) && w === 5) news.push('春のキャンプが始まった。この期間は選手が伸びやすい。');
    if (w === 8) news.push('シーズン開幕！');
    if (w === 24) news.push('夏の移籍の期間が始まった（8月まで）。');
    /* 伸び（1月はオフで練習しない） */
    const report: ReportEntry[] = [];
    if (!isOff(w)) for (const p of G.squad) { const e = growPlayer(r, p, { ...DEFAULT_CTX, mgrGrow: G.mgr.grow, style: G.mgr.style, camp: isCamp(w) }); if (e) report.push(e); }
    else for (const p of G.squad) { p.fat = 0; p.cond = 0; if (p.inj) p.inj = Math.max(0, p.inj - 2); p.played = false; p.injNew = false; }
    for (const c of G.clubs) if (!c.me) for (const p of c.squad) { p.fat = clamp(p.fat - (isOff(w) ? 100 : 28), 0, 100); if (p.inj && !p.injNew) p.inj--; p.injNew = false; p.played = false; }
    if (w === AWARD_WEEK) news.push(...yearEnd(G, r));
    if (isWindow(w)) maybeOffer(G, r);
    G.lastMatch = match ?? G.lastMatch;
    G.lastReport = mergeReports(report);
    G.week++;
    let seasonEnd = false;
    if (G.week >= WEEKS) { newSeason(G, r); seasonEnd = true; news.push(`${G.season}年目が始まった。`); }
    G.news = news;
    return { match, report: G.lastReport, seasonEnd, news };
  } finally { G.rng = r.s; }
}

function maybeOffer(G: GameState, r: Rng) {
  /* 他クラブからのオファー（問41）。移籍の期間だけ */
  if (r.next() > 0.22 || G.pending.length >= 2) return;
  const cands = G.squad.filter((p) => ovr(p) >= 50 && p.inj === 0 && !G.pending.some((e) => e.pid === p.id)); if (!cands.length) return;
  const p = r.pick(cands);
  const buyers = G.clubs.filter((c) => !c.me && c.tier <= Math.max(1, myTier(G)));
  const club = r.pick(buyers).name;
  G.pending.push({ type: 'offer', pid: p.id, club, price: offerPrice(p) });
}
/** 選手の値段（万円）。強いほど、若いほど高い */
export function offerPrice(p: Player): number { const o = ovr(p); return Math.max(300, Math.round((Math.pow(Math.max(0, o - 35), 2) * 3.2 * (p.age <= 23 ? 1.5 : p.age >= 30 ? 0.6 : 1)) / 100) * 100); }
export function answerOffer(G: GameState, i: number, accept: boolean) {
  const e = G.pending[i]; if (!e) return;
  if (accept) G.squad = G.squad.filter((x) => x.id !== e.pid);
  G.pending.splice(i, 1);
}

/* ---------- 年末（12月）：表彰・記録・節目の目標 ---------- */
function yearEnd(G: GameState, r: Rng): string[] {
  const out: string[] = [];
  const awards: Award[] = [];
  const nameOf = (id: number) => clubName(G, id);
  for (const t of [1, 2, 3]) {
    const L = G.leagues[t];
    const all: { p: Player; club: number }[] = [];
    for (const id of L.ids) for (const p of id === ME ? G.squad : clubById(G, id).squad) all.push({ p, club: id });
    const score = (p: Player) => ovr(p) + p.seasonGoals * 0.7 + p.seasonApps * 0.25;
    const played = all.filter((x) => x.p.seasonApps >= 8);
    const mvp = [...played].sort((a, b) => score(b.p) - score(a.p))[0];
    const top = [...played].sort((a, b) => b.p.seasonGoals - a.p.seasonGoals || score(b.p) - score(a.p))[0];
    const young = played.filter((x) => x.p.age <= 21).sort((a, b) => score(b.p) - score(a.p))[0];
    const add = (title: string, x: { p: Player; club: number } | undefined, detail: string) => { if (x) awards.push({ title, tier: t, name: x.p.name, club: nameOf(x.club), me: x.club === ME, detail }); };
    add('リーグで一番の選手', mvp, mvp ? `${mvp.p.seasonApps}試合 ${mvp.p.seasonGoals}点` : '');
    add('得点王', top, top ? `${top.p.seasonGoals}点` : '');
    add('一番の若手', young, young ? `${young.p.age}歳 ・ ${young.p.seasonApps}試合` : '');
  }
  const mine = awards.filter((a) => a.me);
  if (mine.length) out.push(`年末の表彰：${mine.map((a) => `${a.name}（${a.tier}部の${a.title}）`).join('、')}`);
  else out.push('年末の表彰が行われた。');
  const tier = myTier(G); const rank = myRank(G);
  const champ: Record<number, string> = {};
  for (const t of [1, 2, 3]) champ[t] = nameOf(standings(G, t)[0].id);
  const cupRes = cupResultText(G);
  G.history.push({ season: G.season, tier, rank, cup: cupRes, awards, promoted: tier > 1 && rank <= 2, relegated: tier < 3 && rank >= 11, champion: champ, cupChampion: G.cup.champion != null ? nameOf(G.cup.champion) : '' });
  /* 節目の目標（成績の目標だけ：企画書 7） */
  for (const g of GOALS) if (!G.goals.some((x) => x.id === g.id) && g.done(G)) { G.goals.push({ id: g.id, season: G.season }); out.push(`目標を達成した：${g.text}`); }
  void r;
  return out;
}
export function cupResultText(G: GameState): string {
  if (G.cup.champion === ME) return '優勝';
  for (let i = 0; i < G.cup.rounds.length; i++) { const t = G.cup.rounds[i].find((x) => x.a === ME || x.b === ME); if (t && t.w != null && t.w !== ME) return `${CUP_ROUND_NAMES[i]}で負け`; }
  return G.cup.rounds.length ? 'とちゅう' : 'これから';
}
/* 節目の目標（企画書 7★）：1つ達成すると次が出てくる */
interface GoalDef { id: string; text: string; done: (G: GameState) => boolean; }
const lastRec = (G: GameState) => ({ tier: myTier(G), rank: myRank(G) });
export const GOALS: GoalDef[] = [
  { id: 't3up', text: '3部で2位以内に入って昇格', done: (G) => { const x = lastRec(G); return x.tier === 3 && x.rank <= 2; } },
  { id: 't2up', text: '2部で2位以内に入って昇格', done: (G) => { const x = lastRec(G); return x.tier === 2 && x.rank <= 2; } },
  { id: 't1stay', text: '1部に残る（10位以内）', done: (G) => { const x = lastRec(G); return x.tier === 1 && x.rank <= 10; } },
  { id: 'cup', text: '勝ち抜きの大会で優勝', done: (G) => G.cup.champion === ME },
  { id: 't1win', text: '1部で優勝', done: (G) => { const x = lastRec(G); return x.tier === 1 && x.rank === 1; } },
  { id: 'double', text: '1部と大会を同じ年に優勝', done: (G) => { const x = lastRec(G); return x.tier === 1 && x.rank === 1 && G.cup.champion === ME; } },
];
/** いまの目標（段が下がったときは、まず昇格を目標にする） */
export function currentGoal(G: GameState): string {
  const t = myTier(G);
  const next = GOALS.find((g) => !G.goals.some((x) => x.id === g.id));
  if (t === 3 && (!next || next.id !== 't3up')) return '3部で2位以内に入って、もう一度昇格';
  if (t === 2 && next && next.id !== 't2up' && next.id !== 't3up') return '2部で2位以内に入って、もう一度昇格';
  if (!next) { const n = G.history.filter((h) => h.tier === 1 && h.rank === 1).length; return `1部で優勝（${n + 1}回目）`; }
  if (next.id === 't3up' && t < 3) return GOALS[1].text;
  return next.text;
}

/* ---------- 新しいシーズン：昇格と降格 ---------- */
function newSeason(G: GameState, r: Rng) {
  const moves: { id: number; to: number }[] = [];
  for (const t of [1, 2, 3]) {
    const rows = standings(G, t);
    rows.forEach((x, i) => { x.c.prevRank = i + 1; });
    if (t < 3) rows.slice(10).forEach((x) => moves.push({ id: x.id, to: t + 1 }));
    if (t > 1) rows.slice(0, 2).forEach((x) => moves.push({ id: x.id, to: t - 1 }));
  }
  for (const m of moves) { const c = clubById(G, m.id); c.tier = m.to; if (!c.me) c.prevRank = 0; }
  /* 選手は1つ年をとる。記録を残す */
  for (const p of G.squad) { p.hist.push({ y: G.season, ovr: ovr(p), a: p.a.map(Math.floor) }); p.age++; p.seasonApps = 0; p.seasonGoals = 0; p.seasonPerf = 0; }
  for (const c of G.clubs) {
    if (c.me) continue;
    for (const p of c.squad) { p.age++; p.seasonApps = 0; p.seasonGoals = 0; p.seasonPerf = 0; p.inj = 0; p.fat = 0; }
    /* 年をとった選手が何人か去り、新しい選手が入る */
    const leave = c.squad.filter((p) => p.age >= 33 || (p.age >= 30 && r.next() < 0.25)).slice(0, 5);
    for (const p of leave) {
      const np = makePlayer(r, G.ids, TIER_LVL[c.tier] + r.int(-6, 3), p.pos, { age: r.int(18, 26), prefPool: [c.pref, c.pref, '東京都', '大阪府'] });
      np.num = p.num; c.squad[c.squad.indexOf(p)] = np;
    }
    nudgeToTier(c, r, 0.7);
    if (r.next() < 0.15) c.mgr = makeManager(r, G.ids, c.tier === 1 ? 0.7 : c.tier === 2 ? 0.5 : 0.3);
  }
  G.season++; G.week = 0;
  setupSeason(G, r);
  void teamStrength;
}

export interface SkipResult { weeks: number; report: ReportEntry[]; lastMatch: MatchView | null; seasonEnd: boolean; news: string[]; }
/** 次に決めること（オファー・大きな覚醒・年末・シーズンの変わり目）まで、見どころを飛ばして進む */
export function advanceToDecision(G: GameState, maxWeeks = 8): SkipResult {
  let weeks = 0; const all: ReportEntry[] = []; let last: MatchView | null = null; let seasonEnd = false; const news: string[] = [];
  while (weeks < maxWeeks) {
    const res = advanceWeek(G); weeks++;
    all.push(...res.report); if (res.match) last = res.match; news.push(...res.news);
    if (res.seasonEnd) { seasonEnd = true; break; }
    if (G.pending.length || res.report.some((x) => x.awake) || G.week === AWARD_WEEK + 1 || G.week === 4 || G.week === 8) break;
  }
  G.news = news;
  return { weeks, report: mergeReports(all), lastMatch: last, seasonEnd, news };
}
