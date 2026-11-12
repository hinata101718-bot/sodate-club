/* ゲームの状態と、1週ずつ進めるしくみ */
import { Rng, clamp } from './rng';
import { makePlayer, makeSquad, ovr, assignNumbers, teamStrength, growthType, salaryFor } from './player';
import { simulateMatch, pickLineup, chooseForm, type Policy, type TeamIn } from './match';
import { growPlayer, mergeReports, DEFAULT_CTX } from './growth';
import { makeManager } from './staff';
import { prefByName } from './data/prefs';
import { defaultEmblem, type Emblem } from './emblem';
import { makeWorld, nudgeTo, TIER_LVL, type Club } from './world';
import { ensureFin, aiWeekMoney, aiSeasonFin, canPay, payRoomOK, clubPay, finWord, distressSale, fitPayCap, aiGrowCtx, aiYouth, type AiMatch } from './clubfin';
import { AWARD_WEEK, CUP_ROUND_NAMES, WEEKS, isCamp, isOff, isWindow, monthOf, seasonSchedule, weekOfMonth } from './calendar';
import { makeFixtures } from './fixtures';
import type { Manager, MatchView, Player, ReportEntry } from './types';
import type { Pos } from './constants';
import { intake, monthlyReport, recommend, startYouth, youthWeek, type YouthReport } from './youth';
import { initOwner, growCtx, gkCtx, youthSkill, weekMoney, popResult, rollContracts, newOwnerSeason, refreshMarket, earn, type OwnerState } from './owner';
import { afterMyMatch, monthBond, seasonBond, refusesToLeave, ORDER_SHORT, type OrderKind } from './bond';
import { scoutMonth, resolveBids, learnAward, releaseFree, freeNews, aiTransfers, marketValue } from './market';
import { sponsorYear, leaguePrize, CUP_PRIZE } from './finance';
import { openReg, applyReg, ensureReg, matchSquad, MAX_SQUAD, REG_WEEKS, type RegMeet } from './squad';
import { closeMeeting, ensureMeta, mail, monthMeeting, yearMeeting, judgeGoal, snapshot, potNote, type Msg, type Meeting, type MonthSnap, type Goal } from './meeting';

export { makeFixtures };
export const SAVE_VERSION = 8;
export interface Row { p: number; w: number; d: number; l: number; gf: number; ga: number; }
export interface Offer { type: 'offer'; pid: number; club: string; price: number; clubId?: number; listed?: boolean; base?: number; rounds?: number; }
export interface CupTie { a: number; b: number; w?: number; s?: [number, number]; pk?: [number, number] | null; }
export interface Cup { round: number; rounds: CupTie[][]; champion: number | null; }
export interface League { ids: number[]; fixtures: [number, number][][]; table: Record<number, Row>; }
export interface Award { title: string; tier: number; name: string; club: string; me: boolean; detail: string; pos?: Pos; }
/** 年末の表彰式（問110・111）：開いていないときは null */
export interface Ceremony { season: number; tier: number; awards: Award[]; xi: Award[]; effects: string[] }
export interface SeasonRec { season: number; tier: number; rank: number; cup: string; awards: Award[]; xi?: Award[]; promoted: boolean; relegated: boolean; champion: Record<number, string>; cupChampion: string; }
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
  /** ユース（段階3） */
  youth: Player[];
  youthLog: YouthReport[];
  /** 春の昇格会議（開いているあいだ） */
  promo: { open: boolean; rec: number[] } | null;
  /** 年末のコーチのひとこと（ポテンシャルが動いたことなど） */
  yearNotes: { pid: number; name: string; text: string; d?: number; why?: string }[];
  /** お気に入りの選手の記録（問103：移籍・引退でクラブを去った選手） */
  favLog?: { name: string; pos: string; season: number; text: string }[];
  /** 年末の表彰式（開くのを待っている） */
  cere?: Ceremony | null;
  /** 問112〜116：メッセージ・経営会議・目標・監督の評価・補強の予算 */
  inbox?: Msg[]; meet?: Meeting | null; snap?: MonthSnap; front?: { acct: string; sales: string };
  goal?: Goal; nextGoal?: Goal | null; goalLog?: { season: number; text: string; level: string; ok: boolean }[]; mgrEval?: number; spMul?: number;
  budget?: { cap: number; spent: number }; typeNews?: string[]; honorFix?: boolean;
  /** 月の経営会議で話した、来月の動き（監督の方針・コーチの練習の強さ） */
  plan?: { until: number; tilt: 'def' | 'atk' | null; care: boolean }; regm?: RegMeet | null; breakFix?: boolean; yearStart?: { pop: number; fans: [number, number] }; streak?: number;
  /** オーナーが決めること（段階4）：お金・施設・人・移籍 */
  owner: OwnerState;
}
export const ME = 0;
/** 最初の選手の強さの目安（3部の相手は57前後。少し低めから始める） */
export const START_LVL = 55;

export const START_CAP = 80;
/** 総合力が上限をこえていたら、8項目を少しずつ下げて上限に収める */
export function capOvr(p: Player, cap: number) {
  for (let g = 0; g < 40 && ovr(p) > cap; g++) p.a = p.a.map((v) => Math.max(20, v - 0.6));
  p.pot = Math.max(p.pot, ovr(p));
}
export function newGame(o: NewGameOpts = {}): GameState {
  const r = new Rng(o.seed ?? 20261110); const ids = { n: 1 };
  const pref = o.pref ?? '静岡県'; const P = prefByName(pref);
  const color = o.color ?? '#1f6f5c';
  const name = o.name ?? 'わかば静岡FC';
  const mgr = makeManager(r, ids, 0.55, 'ポゼッション');
  mgr.forms = ['4-3-3', '4-2-3-1', '5-3-2']; mgr.youth = 1.3; mgr.obey = 0.75; mgr.grow = 1.15;
  /* 最初の選手は、地元の若手中心の22人ほどで、能力は低め（企画書 3★） */
  const squad = makeSquad(r, ids, START_LVL, { prefPool: [pref, pref, pref, pref, '東京都', '大阪府', '神奈川県', '愛知県', '福岡県'] });
  /* 若手4人を足して23人にする（トップは22〜25人：企画書 8-1） */
  for (const pos of ['CB', 'CM', 'WG'] as const) { const i = squad.findIndex((p) => p.pos === pos); squad.splice(i, 1); }
  squad.forEach((p) => (p.num = 0));
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
    youth: [], youthLog: [], promo: null, yearNotes: [], owner: initOwner(r, ids, pref),
  };
  G.owner.sponsor = sponsorYear(3, pref, G.owner.pop);
  G.youth = startYouth(r, ids, youthEnv(G));
  /* 問105：ゲームの始まりは、どの選手も総合力80まで（伸びて81〜88になるのはよい） */
  for (const p of [...G.squad, ...G.clubs.flatMap((c) => c.squad)]) capOvr(p, START_CAP);
  for (const c of G.clubs) if (!c.me) { for (const p of c.squad) p.salary = salaryFor(ovr(p)); fitPayCap(c); }
  setupSeason(G, r);
  G.yearStart = { pop: G.owner.pop, fans: [0, 0] };
  ensureMeta(G);
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
export function youthEnv(G: GameState) { return { pref: G.club.pref, facility: G.owner?.fac.youth ?? 1, dorm: G.owner?.fac.dorm ?? 0, coachSkill: G.owner ? youthSkill(G) : 0.5 }; }
export function youthCoachSkill(G: GameState) { return G.owner ? youthSkill(G) : 0.5; }
export const emptyRow = (): Row => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });
export const clubById = (G: GameState, id: number) => G.clubs.find((c) => c.id === id)!;
export const myClub = (G: GameState) => clubById(G, ME);
export const myTier = (G: GameState) => myClub(G).tier;
export const clubName = (G: GameState, id: number) => (id === ME ? G.club.name : clubById(G, id).name);
export function teamIn(G: GameState, c: Club): TeamIn {
  const plan = G.plan && G.plan.until > G.season * 48 + G.week ? G.plan : null;
  return c.me ? { id: c.id, name: G.club.name, me: true, color: G.club.color, squad: G.owner ? matchSquad(G) : G.squad, mgr: G.mgr, policy: G.policy, tilt: plan?.tilt ?? null, injMul: (plan?.care ? 0.8 : 1) * (G.owner ? 1 - (G.owner.fac.medical - 1) * 0.1 : 1) } : { id: c.id, name: c.name, me: false, color: c.color, squad: c.squad, mgr: c.mgr };
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

let homeInfo: { oppTier: number; cup: boolean; home: boolean; won: boolean } | null = null;
/** 問126：ほかのクラブの、今週の試合（入場料・人気のため） */
let aiM = new Map<number, AiMatch>();
/** バランスの確かめ用（ふだんは使わない） */
export const STATS = { on: false, matches: [] as { tier: number; hs: number; as: number; sh: number; sa: number }[] };
function playLeagueRound(G: GameState, r: Rng, li: number): MatchView | null {
  let mine: MatchView | null = null;
  const tier = myTier(G);
  for (const t of [1, 2, 3]) {
    const L = G.leagues[t];
    for (const [h, a] of L.fixtures[li]) {
      const hc = clubById(G, h), ac = clubById(G, a);
      const isMine = h === ME || a === ME;
      const big = isMine && li >= 17 && contention(G, t);
      const res = simulateMatch(r, teamIn(G, hc), teamIn(G, ac), { record: true, label: `${G.season}年目 リーグ第${li + 1}節`, big, title: `${t}部 第${li + 1}節`, pre: isMine ? preInfo(G, t, li, hc, ac, big) : undefined });
      const [sh, sa] = res.score; const th = L.table[h], ta = L.table[a];
      if (STATS.on) STATS.matches.push({ tier: t, hs: teamStrength(hc.me ? G.squad : hc.squad), as: teamStrength(ac.me ? G.squad : ac.squad), sh, sa });
      th.gf += sh; th.ga += sa; ta.gf += sa; ta.ga += sh;
      if (sh > sa) { th.w++; th.p += 3; ta.l++; } else if (sh < sa) { ta.w++; ta.p += 3; th.l++; } else { th.d++; ta.d++; th.p++; ta.p++; }
      if (!hc.me) aiM.set(h, { home: true, won: sh > sa, oppTier: t, cup: false, gf: sh, ga: sa });
      if (!ac.me) aiM.set(a, { home: false, won: sa > sh, oppTier: t, cup: false, gf: sa, ga: sh });
      if (isMine) vsAdd(h === ME ? ac : hc, h === ME ? sh : sa, h === ME ? sa : sh);
      if (isMine) { mine = res.view; myAfter(G, res.view); if (G.owner) { popResult(G, h === ME ? sh : sa, h === ME ? sa : sh); homeInfo = { oppTier: t, cup: false, home: h === ME, won: (h === ME ? sh - sa : sa - sh) > 0 }; } }
    }
  }
  void tier;
  return mine;
}
/** 問130：自分のクラブとの対戦成績（大会はPKでも勝ち負けで数える） */
function vsAdd(c: Club, gf: number, ga: number) { const v = (c.vs ??= { w: 0, d: 0, l: 0, gf: 0, ga: 0 }); v.gf += gf; v.ga += ga; if (gf > ga) v.w++; else if (gf < ga) v.l++; else v.d++; }
/** 実況の前ふり（問122・123）：順位と、大事な試合か（優勝・昇格・残留・同じ地方どうし） */
function preInfo(G: GameState, t: number, li: number, hc: Club, ac: Club, big: boolean): { info: string; stakes: { kind: '' | '優勝' | '昇格' | '残留' | '地元' } } {
  const rows = standings(G, t); const played = rows[0] ? rows[0].w + rows[0].d + rows[0].l : 0;
  const rk = (id: number) => rows.findIndex((x) => x.id === id) + 1;
  const info = played ? `リーグ第${li + 1}節、${rk(hc.id)}位と${rk(ac.id)}位の対戦です。` : `リーグ第${li + 1}節です。`;
  const me = rk(ME);
  const kind = big ? (t === 1 ? '優勝' : '昇格') : li >= 17 && t < 3 && me >= 10 ? '残留' : prefByName(hc.pref).region === prefByName(ac.pref).region ? '地元' : '';
  return { info, stakes: { kind } };
}
/** 自分の試合のあと：信頼と不満が動き、頼みを聞いてくれたかをお知らせにのせる（問93〜95） */
let bondNews: string[] = [];
function myAfter(G: GameState, v: MatchView) {
  afterMyMatch(G, v.played);
  const o = v.orders ?? [];
  /* 3連敗したら、監督からメッセージ（問112） */
  const my = v.home.me ? v.score[0] - v.score[1] : v.score[1] - v.score[0];
  G.streak = my < 0 ? (G.streak ?? 0) + 1 : 0;
  if (G.streak === 3) mail(G, '監督', G.mgr.name, '3連敗について', '3連敗です。申し訳ありません。並び方と先発を見直して、次の試合で立て直します。起用の頼みがあれば、試合前に言ってください。');
  if (o.length) {
    const ok = o.filter((x) => x.heard); const ng = o.filter((x) => !x.heard);
    if (G.snap) { G.snap.ord[0] += o.length; G.snap.ord[1] += ok.length; }
    bondNews.push(`監督への頼み：${o.length}つのうち${ok.length}つを聞いてくれた${ok.length ? `（${ok.map((x) => `${x.name}を${ORDER_SHORT[x.kind as OrderKind]}`).join('・')}）` : ''}${ng.length ? `。聞いてもらえなかった：${ng.map((x) => x.name).join('・')}` : ''}。`);
  }
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
    const res = simulateMatch(r, teamIn(G, clubById(G, t.a)), teamIn(G, clubById(G, t.b)), { record: true, cup: true, neutral: final, final, pre: isMine ? { info: `勝ち抜きの大会、${CUP_ROUND_NAMES[round]}です。`, stakes: { kind: final ? '決勝' : '' } } : undefined, big: isMine && round >= 3, label: `${G.season}年目 大会${CUP_ROUND_NAMES[round]}`, title: `勝ち抜きの大会 ${CUP_ROUND_NAMES[round]}` });
    t.s = res.score; t.pk = res.pk; t.w = res.winner === 0 ? t.a : t.b;
    const ca = clubById(G, t.a), cb = clubById(G, t.b);
    if (!ca.me) aiM.set(t.a, { home: !final, won: t.w === t.a, oppTier: cb.tier, cup: true, gf: res.score[0], ga: res.score[1] });
    if (!cb.me) aiM.set(t.b, { home: false, won: t.w === t.b, oppTier: ca.tier, cup: true, gf: res.score[1], ga: res.score[0] });
    if (isMine) { const meA0 = t.a === ME; const sc = res.score; const won = t.w === ME; const o = meA0 ? cb : ca; const v = (o.vs ??= { w: 0, d: 0, l: 0, gf: 0, ga: 0 }); v.gf += meA0 ? sc[0] : sc[1]; v.ga += meA0 ? sc[1] : sc[0]; if (won) v.w++; else v.l++; }
    if (isMine) { mine = res.view; myAfter(G, res.view); if (G.owner) { const meA = t.a === ME; popResult(G, meA ? res.score[0] : res.score[1], meA ? res.score[1] : res.score[0]); homeInfo = { oppTier: clubById(G, meA ? t.b : t.a).tier, cup: true, home: meA && !final, won: t.w === ME }; } }
  }
  G.cup.rounds[round] = ties; G.cup.round = round + 1;
  if (final) G.cup.champion = ties[0].w!;
  return mine;
}

/** 問124：クラブに長くいる選手の成長タイプを、コーチが見きわめる（need 週いると。腕のいいコーチは半分でわかる） */
function revealTypes(G: GameState, need: number): string[] {
  const now = G.season * 48 + G.week; const out: string[] = [];
  for (const p of G.squad) {
    if (p.gType) continue;
    const since = p.joined ?? 48; const C = G.owner.coaches; const c = p.pos === 'GK' ? C.gk : ['CB', 'SB', 'DM'].includes(p.pos) ? C.def : C.off;
    const want = (c?.skill ?? 0.3) >= 0.65 ? Math.min(need, 24) : need;
    if (now - since >= want) { p.gType = growthType(p); out.push(`${p.name}：${p.gType}`); }
  }
  return out;
}
/** 今週、自分のクラブの試合があるか（勝ち抜きの大会で、まだ出番がない回はない） */
export function hasMyMatch(G: GameState): boolean {
  const e = eventOf(G);
  if (e.kind === 'league') return true;
  if (e.kind !== 'cup' || !cupAlive(G)) return false;
  if (e.round === 0 && myTier(G) === 1) return false;
  if (e.round === 1 && myTier(G) === 1 && (clubById(G, ME).prevRank || 99) <= 8) return false;
  return true;
}
/** 試合前の画面（問109）：監督が予定している並び方と先発。頼みは聞いてもらえたとして組む（聞いてくれるかは当日わかる） */
export function matchPlan(G: GameState): { form: string; lineup: { p: Player; pos: Pos }[]; bench: Player[]; opp: Club | null; home: boolean | null } {
  const e = eventOf(G); const opp = e.kind === 'league' ? clubById(G, e.opp) : null;
  const me = teamIn(G, myClub(G));
  const form = chooseForm(G.mgr, teamStrength(G.squad), opp ? teamStrength(opp.squad) : teamStrength(G.squad), G.squad, me.tilt);
  const { lineup, bench } = pickLineup(new Rng(1), me, form, true);
  delete me.heard;
  return { form, lineup: lineup.map((x) => ({ p: x.p, pos: x.pos })), bench: bench.sort((a, b) => ovr(b) - ovr(a)), opp, home: e.kind === 'league' ? e.home : null };
}
/** 1週進める */
export function advanceWeek(G: GameState): WeekResult {
  const r = new Rng(G.rng);
  const news: string[] = [];
  const favBefore = [...G.squad, ...G.youth].filter((p) => p.fav).map((p) => ({ id: p.id, name: p.name, pos: p.pos, age: p.age, retiring: !!p.retiring }));
  try {
    const w = G.week;
    ensureMeta(G);
    /* 開いたままの会議・表彰式は、決めずに進んだらおすすめどおりで閉じる */
    if (G.meet) closeMeeting(G);
    G.cere = null;
    if (G.promo?.open) news.push(...applyPromo(G, r, G.promo.rec));
    if (G.regm?.open) news.push(...applyReg(G, G.regm.sel));
    bondNews = [];
    if (G.owner) news.push(...resolveBids(G, r));
    homeInfo = null; aiM = new Map();
    ensureFin(G);
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
    const ctx = growCtx(G, isCamp(w)); const gctx = gkCtx(G, ctx);
    if (!isOff(w)) for (const p of G.squad) { const e = growPlayer(r, p, p.pos === 'GK' ? gctx : ctx); if (e) report.push(e); }
    else for (const p of G.squad) { p.fat = 0; p.cond = 0; if (p.inj) p.inj = Math.max(0, p.inj - 2); p.played = false; p.injNew = false; }
    /* コーチからの急ぎの知らせ（問112）：覚醒・長いケガ */
    const coachName = (G.owner?.coaches.phys ?? G.owner?.coaches.off)?.name ?? G.mgr.name;
    for (const e of report) { const p = G.squad.find((x) => x.id === e.pid); if (!p) continue;
      if (e.awake) { G.snap?.awake.push(p.name); mail(G, 'コーチ', coachName, `${p.name}が覚醒`, `オーナー、${p.name}（${p.pos}）が覚醒しました！ 今週の練習は、まるで別人です。どこが伸びたかは、週の報告にまとめておきます。`); }
      if (e.injNew && p.inj >= 4) mail(G, 'コーチ', coachName, `${p.name}のケガ`, `${p.name}（${p.pos}）がケガをしました。もどってくるまで、${p.inj}週ほどかかりそうです。`); }
    if (!isOff(w)) youthWeek(r, G.youth, youthCoachSkill(G), ctx.field, isCamp(w));
    /* スカウトの報告は、メッセージで届く（問112） */
    if (w % 4 === 0) { const sc = G.owner?.scouts[0]?.name ?? 'スカウト'; for (const l of scoutMonth(G, r)) mail(G, 'スカウト', sc, /売り込み/.test(l) ? '売り込みに来た選手' : 'スカウトの報告', l); }
    if (w % 4 === 2 && G.owner) for (const l of monthBond(G)) { const nm = l.split('（')[0]; const p = G.squad.find((x) => x.name === nm); mail(G, '選手', nm, '少しお話があります', 'もっと試合に出たいです。このまま出番がないなら、移籍させてください。', { pid: p?.id, kind: 'wantOut' }); }
    if (w === AWARD_WEEK) releaseFree(G, r);
    if (w === 24 || w === AWARD_WEEK) news.push(...freeNews(G, r));
    if (w === 25 || w === AWARD_WEEK + 1) {
      news.push(...aiTransfers(G, r));
      /* 問126：お金に苦しいクラブは、移籍の期間に主力を手放すことがある（ニュースになる） */
      const sad = G.clubs.filter((c) => !c.me && finWord(c) === '苦しい' && r.next() < 0.35);
      for (const c of sad.slice(0, 2)) { const n = distressSale(G, c, r); if (n) news.push(n); }
    }
    news.push(...weekMoney(G, homeInfo));
    for (const c of G.clubs) if (!c.me) news.push(...aiWeekMoney(G, c, aiM.get(c.id) ?? null, r));
    if (w >= 8 && w % 4 === 0) {
      const rep = monthlyReport(r, G.youth, G.season, monthOf(w), youthCoachSkill(G));
      G.youthLog.push(rep); if (G.youthLog.length > 4) G.youthLog.shift();
      news.push(`${monthOf(w)}月のユースの報告会議があった。`);
    }
    /* 問131：ほかのクラブの選手も育つ（試合に出たかどうかを使うので、疲れなどをもどす前に） */
    if (!isOff(w)) for (const c of G.clubs) if (!c.me) { const cx = aiGrowCtx(c, isCamp(w)); for (const p of c.squad) growPlayer(r, p, cx); }
    for (const c of G.clubs) if (!c.me) for (const p of c.squad) { p.fat = clamp(p.fat - (isOff(w) ? 100 : 28), 0, 100); if (p.inj && !p.injNew) p.inj--; p.injNew = false; p.played = false; }
    if (w === AWARD_WEEK) news.push(...yearEnd(G, r));
    if (isWindow(w)) { maybeOffer(G, r); listedOffers(G, r); }
    G.lastMatch = match ?? G.lastMatch;
    G.lastReport = mergeReports(report);
    /* 問113：月の終わりに経営会議（3〜11月）。12月は年に1回の経営会議 */
    if (w % 4 === 3 && G.owner) { if (w >= 11 && w <= 43) G.meet = monthMeeting(G); G.snap = snapshot(G); }
    G.week++;
    let seasonEnd = false;
    if (G.week >= WEEKS) { news.push(...newSeason(G, r)); seasonEnd = true; news.push(`${G.season}年目が始まった。`); }
    if (G.owner && G.week === 28) { const f = revealTypes(G, 24); if (f.length) mail(G, 'コーチ', (G.owner.coaches.phys ?? G.owner.coaches.off)?.name ?? G.mgr.name, '成長タイプがわかった選手', `半年見てきて、成長のしかたがわかってきた選手がいます。${f.join('、')}。記録にも残しておきます。`); }
    if (G.owner && REG_WEEKS.includes(G.week)) { openReg(G); news.push(`選手登録の会議（${G.regm!.kind}）が開かれる。試合に出られる23人を決めよう。`); }
    if (G.week === 4) { G.promo = { open: true, rec: recommend(G.youth, G.squad.length) }; news.push('春の昇格会議が開かれる。トップに上げる子を決めよう。'); }
    news.push(...bondNews); bondNews = [];
    /* 問103：お気に入りの選手がクラブを去ったら知らせて、記録に残す */
    const here = new Set([...G.squad, ...G.youth].map((p) => p.id));
    for (const f of favBefore) if (!here.has(f.id)) {
      const text = f.retiring ? '引退した' : 'クラブを去った（移籍・契約満了）';
      news.push(`お気に入りの${f.name}（${f.pos}）が${text}。`);
      (G.favLog ??= []).push({ name: f.name, pos: f.pos, season: G.season, text });
    }
    G.news = news;
    return { match, report: G.lastReport, seasonEnd, news };
  } finally { G.rng = r.s; }
}

function maybeOffer(G: GameState, r: Rng) {
  /* 他クラブからのオファー（問41）。移籍の期間だけ */
  if (r.next() > 0.22 || G.pending.length >= 2) return;
  const cands = G.squad.filter((p) => ovr(p) >= 50 && p.inj === 0 && !G.pending.some((e) => e.pid === p.id)); if (!cands.length) return;
  /* 不満がたまっている選手・移籍したい選手には、ほかのクラブも声をかけやすい（問95） */
  const hot = cands.filter((p) => p.wantOut || (p.unrest ?? 0) >= 50);
  const p = hot.length && r.next() < 0.6 ? r.pick(hot) : r.pick(cands);
  /* 問126：払えるクラブ・給料の決まりに入るクラブだけが声をかける。裕福なクラブは少し高めに出す */
  const base = offerPrice(p, myTier(G));
  const buyers = G.clubs.filter((c) => !c.me && c.tier <= Math.max(1, myTier(G)) && canPay(c, base) && payRoomOK(c, p.salary));
  if (!buyers.length) return;
  const c = r.pick(buyers);
  G.pending.push({ type: 'offer', pid: p.id, club: c.name, clubId: c.id, price: Math.round(base * (finWord(c) === '裕福' ? 1.1 : 1) / 100) * 100 });
}
/** 売りに出した選手に、買い手が見つかる */
function listedOffers(G: GameState, r: Rng) {
  for (const p of G.squad) {
    if (!p.listed || G.pending.some((e) => e.pid === p.id) || r.next() > 0.3) continue;
    const t = Math.max(1, Math.min(3, myTier(G) + (ovr(p) >= 70 ? -1 : ovr(p) < 55 ? 1 : 0)));
    const cs = G.clubs.filter((x) => !x.me && x.tier === t && canPay(x, offerPrice(p, myTier(G)) * 0.8)); if (!cs.length) continue;
    const c = r.pick(cs);
    G.pending.push({ type: 'offer', pid: p.id, club: c.name, clubId: c.id, price: Math.round(offerPrice(p, myTier(G)) * (0.8 + r.next() * 0.3) / 100) * 100, listed: true });
  }
}
/** 選手の値段（万円）：移籍市場の相場と同じ（強いほど、若いほど、契約が長いほど、上の段ほど高い） */
export function offerPrice(p: Player, tier = 3): number { return Math.max(300, marketValue(p, tier)); }
export function answerOffer(G: GameState, i: number, accept: boolean): string | null {
  const e = G.pending[i]; if (!e) return null;
  if (accept && G.squad.length <= 16) return 'トップが16人より少なくなると試合ができなくなるので、受けられない。';
  if (accept) {
    const p = G.squad.find((x) => x.id === e.pid);
    if (p && p.pos === 'GK' && G.squad.filter((x) => x.pos === 'GK').length <= 2) return 'キーパーが2人より少なくなると試合が組めなくなるので、受けられない。先にキーパーを獲ろう。';
    if (p && refusesToLeave(p, G.season)) { G.pending.splice(i, 1); return `${p.name} は「このクラブに残りたい」と言って、移籍を断った。`; }
    G.squad = G.squad.filter((x) => x.id !== e.pid);
    if (G.owner) earn(G, 'sales', e.price);
    const buyer = e.clubId != null ? G.clubs.find((c) => c.id === e.clubId) : G.clubs.find((c) => c.name === e.club);
    if (buyer && !buyer.me) { clubPay(buyer, 'buy', e.price); if (buyer.fin && buyer.fin.money < 0) { const need = Math.ceil(-buyer.fin.money / 1000) * 1000; buyer.fin.debt += need; buyer.fin.money += need; } }
    if (p && buyer && !buyer.me) {
      const same = buyer.squad.filter((x) => x.pos === p.pos).sort((a, b) => ovr(a) - ovr(b))[0];
      p.req = false; p.listed = false;
      if (same) { p.num = same.num; buyer.squad[buyer.squad.indexOf(same)] = p; }
    }
  }
  G.pending.splice(i, 1);
  return null;
}

/* ---------- 年末（12月）：表彰・記録・節目の目標 ---------- */
function yearEnd(G: GameState, r: Rng): string[] {
  const out: string[] = [];
  const nameOf = (id: number) => clubName(G, id);
  const { awards, xi, effects } = seasonAwards(G);
  const mine = awards.filter((a) => a.me).concat(xi.filter((a) => a.me));
  if (mine.length) out.push(`年末の表彰式：${mine.map((a) => `${a.name}（${a.title}）`).join('、')}`);
  else out.push('年末の表彰式が開かれた。');
  G.cere = { season: G.season, tier: myTier(G), awards, xi, effects };
  out.push(...potentialAndRetire(G, r));
  const tier = myTier(G); const rank = myRank(G);
  if (G.owner) {
    const lp = leaguePrize(tier, rank); const won = G.cup.rounds.filter((rd) => rd.some((t) => t.w === ME)).length;
    const cp = CUP_PRIZE[Math.min(6, won)] ?? 0;
    earn(G, 'prize', lp + cp);
    out.push(`賞金：リーグ ${lp.toLocaleString()}万円${cp ? `、勝ち抜きの大会 ${cp.toLocaleString()}万円` : ''}。`);
    if (rank <= 2 && tier > 1) G.owner.pop = Math.min(100, G.owner.pop + 10);
    if (rank === 1) G.owner.pop = Math.min(100, G.owner.pop + 8);
    refreshMarket(r, G.ids, G.owner, tier);
    out.push('冬のコーチの見直しの時期。人の画面で、監督・コーチ・スカウトを入れかえられる。');
    const exp = G.squad.filter((p) => p.contract <= 1).length;
    if (exp) out.push(`契約が今年で切れる選手が${exp}人いる。選手の画面の「契約」で、更新するかを決めよう（決めないときは更新する）。`);
  }
  const champ: Record<number, string> = {};
  for (const t of [1, 2, 3]) champ[t] = nameOf(standings(G, t)[0].id);
  const cupRes = cupResultText(G);
  G.history.push({ season: G.season, tier, rank, cup: cupRes, awards, xi, promoted: tier > 1 && rank <= 2, relegated: tier < 3 && rank >= 11, champion: champ, cupChampion: G.cup.champion != null ? nameOf(G.cup.champion) : '' });
  /* 節目の目標（成績の目標だけ：企画書 7） */
  for (const g of GOALS) if (!G.goals.some((x) => x.id === g.id) && g.done(G)) { G.goals.push({ id: g.id, season: G.season }); out.push(`節目の目標を達成した：${g.text}`); }
  /* 問115・116：今年の目標に届いたか → 年に1回の経営会議 */
  if (G.owner) {
    const judged = judgeGoal(G, tier, rank); out.push(...judged);
    G.typeNews = revealTypes(G, 40);
    G.meet = yearMeeting(G, judged); G.typeNews = undefined;
    if ((G.mgrEval ?? 60) < 25) mail(G, '監督', G.mgr.name, '今年の結果について', '目標に大きく届かず、申し訳ありません。クラブのためなら、私を代えてもらってかまいません。');
  }
  void r;
  return out;
}
/* ---------- 年末の表彰（問110・111） ---------- */
export const avgRt = (p: Player) => (p.seasonRtN ? (p.seasonRt ?? 0) / p.seasonRtN : 0);
const XI_SLOTS: [string, Pos[], number][] = [['GK', ['GK'], 1], ['CB', ['CB'], 2], ['SB', ['SB'], 2], ['MF', ['DM', 'CM', 'AM'], 3], ['FW', ['WG', 'ST'], 3]];
export function seasonAwards(G: GameState): { awards: Award[]; xi: Award[]; effects: string[] } {
  const awards: Award[] = []; const xi: Award[] = []; const effects: string[] = [];
  const mine = myTier(G);
  const nameOf = (id: number) => clubName(G, id);
  for (const t of [1, 2, 3]) {
    const L = G.leagues[t];
    const all: { p: Player; club: number }[] = [];
    for (const id of L.ids) for (const p of id === ME ? G.squad : clubById(G, id).squad) all.push({ p, club: id });
    const reg = all.filter((x) => x.p.seasonApps >= 12);
    const mvpScore = (p: Player) => avgRt(p) + p.seasonGoals * 0.02 + (p.seasonAst ?? 0) * 0.015 + Math.min(p.seasonApps, 26) * 0.012;
    const ln = (p: Player) => `平均 ${avgRt(p).toFixed(2)} ・ ${p.seasonApps}試合 ${p.seasonGoals}点 ${p.seasonAst ?? 0}アシスト`;
    const add = (title: string, x: { p: Player; club: number } | undefined, detail: string, list = awards) => {
      if (!x) return;
      if (x.club !== ME && G.owner) learnAward(G, x.p, clubById(G, x.club));
      list.push({ title, tier: t, name: x.p.name, club: nameOf(x.club), me: x.club === ME, detail, pos: x.p.pos });
      /* 感想：選手の表彰歴。選手についていくので、移籍しても残る */
      (x.p.honors ??= []).push({ y: G.season, title, tier: t, club: nameOf(x.club) });
      if (x.club === ME) gainAward(G, x.p, title, effects);
    };
    const mvp = [...reg].sort((a, b) => mvpScore(b.p) - mvpScore(a.p))[0];
    const top = [...all].filter((x) => x.p.seasonGoals > 0).sort((a, b) => b.p.seasonGoals - a.p.seasonGoals || a.p.seasonApps - b.p.seasonApps || avgRt(b.p) - avgRt(a.p))[0];
    add('シーズンMVP', mvp, mvp ? ln(mvp.p) : '');
    add('得点王', top, top ? `${top.p.seasonGoals}点（${top.p.seasonApps}試合）` : '');
    if (t !== mine) continue;
    const ast = [...all].filter((x) => (x.p.seasonAst ?? 0) > 0).sort((a, b) => (b.p.seasonAst ?? 0) - (a.p.seasonAst ?? 0) || avgRt(b.p) - avgRt(a.p))[0];
    const young = all.filter((x) => x.p.age <= 21 && x.p.seasonApps >= 8).sort((a, b) => avgRt(b.p) + b.p.seasonApps * 0.01 - avgRt(a.p) - a.p.seasonApps * 0.01)[0];
    add('アシスト王', ast, ast ? `${ast.p.seasonAst}アシスト（${ast.p.seasonApps}試合）` : '');
    add('ベストヤングプレイヤー賞', young, young ? `${young.p.age}歳 ・ ${ln(young.p)}` : '');
    const used = new Set<Player>();
    for (const [, poss, n] of XI_SLOTS) {
      const c = reg.filter((x) => poss.includes(x.p.pos) && !used.has(x.p)).sort((a, b) => avgRt(b.p) + b.p.seasonApps * 0.01 - avgRt(a.p) - a.p.seasonApps * 0.01).slice(0, n);
      for (const x of c) { used.add(x.p); add('ベストイレブン', x, `平均 ${avgRt(x.p).toFixed(2)}`, xi); }
    }
  }
  return { awards, xi, effects };
}
/** 問111：自分の選手が賞をとると、クラブの人気・その選手の市場の値段・クラブへの愛着が上がる */
function gainAward(G: GameState, p: Player, title: string, effects: string[]) {
  const big = title === 'シーズンMVP' ? 2 : title === 'ベストイレブン' ? 0.5 : 1;
  p.fame = (p.fame ?? 0) + big;
  p.love = clamp((p.love ?? 40) + 4 * big + 2, 0, 100);
  if (G.owner) G.owner.pop = Math.min(100, G.owner.pop + Math.round(2 * big + 1));
  if (title !== 'ベストイレブン' || !effects.length) effects.push(title === 'ベストイレブン' ? 'ベストイレブンに選ばれた選手も、市場の値段と愛着が少し上がった。' : `${p.name}：市場の値段と、クラブへの愛着が上がった。`);
}
export function closeCeremony(G: GameState) { G.cere = null; }
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
  if (G.owner) { ensureMeta(G); if (G.goal) return G.goal.text; }
  const t = myTier(G);
  const next = GOALS.find((g) => !G.goals.some((x) => x.id === g.id));
  if (t === 3 && (!next || next.id !== 't3up')) return '3部で2位以内に入って、もう一度昇格';
  if (t === 2 && next && next.id !== 't2up' && next.id !== 't3up') return '2部で2位以内に入って、もう一度昇格';
  if (!next) { const n = G.history.filter((h) => h.tier === 1 && h.rank === 1).length; return `1部で優勝（${n + 1}回目）`; }
  if (next.id === 't3up' && t < 3) return GOALS[1].text;
  return next.text;
}

/* ---------- 年末：ポテンシャルの上下（企画書 8-4）と引退（12月に知らされる） ---------- */
function potentialAndRetire(G: GameState, r: Rng): string[] {
  const out: string[] = []; G.yearNotes = [];
  for (const p of G.squad) {
    const big = p.seasonApps >= 20 || p.seasonGoals >= 10;
    const ok = p.seasonApps >= 14;
    const few = p.seasonApps <= 3;
    let d = 0;
    if (big && p.age <= 28) d = r.int(2, 5); else if (ok && p.age <= 26) d = r.int(0, 2); else if (few && p.age <= 26) d = -r.int(1, 3);
    if (d) {
      p.pot = clamp(p.pot + d, 30, 88);
      const why = d > 0 ? `${p.seasonApps}試合・${p.seasonGoals}点${p.seasonRtN ? `・平均 ${((p.seasonRt ?? 0) / p.seasonRtN).toFixed(1)}` : ''}` : `出場${p.seasonApps}試合`;
      G.yearNotes.push({ pid: p.id, name: p.name, text: potNote(r, p, d), d, why });
      (p.potLog ??= []).push({ y: G.season, arrow: d >= 3 ? '↑↑' : d > 0 ? '↑' : '↓', why });
    }
  }
  /* 引退：能力が下がってきた選手や、試合に出られなくなった選手から考え始める。下限の年齢はない */
  for (const p of G.squad) {
    let pr = 0;
    if (p.age >= p.decl + 1) pr += 0.12 + 0.13 * (p.age - p.decl - 1);
    if (p.seasonApps <= 2 && p.age >= 24) pr += 0.06 + (p.age - 24) * 0.02;
    if (p.age >= 37) pr += 0.5;
    if (pr > 0 && r.next() < pr) { p.retiring = true; out.push(`${p.name}（${p.age}歳）が、今シーズンかぎりでの引退を決めた。`); }
  }
  return out;
}

/* ---------- 春の昇格会議（企画書 9-1）：上げる子を決める。上げなかった3年は卒業してクラブを去る ---------- */
export function applyPromo(G: GameState, r: Rng, ids: number[]): string[] {
  const out: string[] = [];
  const up = G.youth.filter((p) => ids.includes(p.id)).slice(0, Math.max(0, MAX_SQUAD - G.squad.length));
  for (const p of up) {
    p.grade = undefined; p.snap = undefined; p.contract = 3; p.salary = 150; p.num = 0; p.origin = 'ユース出身'; p.exp = Math.max(p.exp, 5);
    G.squad.push(p); p.joined = G.season * 48 + G.week; p.reg = false;
  }
  assignNumbers(G.squad);
  if (up.length) out.push(`ユースから ${up.map((p) => p.name).join('、')} をトップに上げた。`);
  const leave = G.youth.filter((p) => !up.includes(p) && p.grade === 3);
  if (leave.length) out.push(`${leave.map((p) => p.name).join('、')} がユースを卒業し、クラブを去った。`);
  G.youth = G.youth.filter((p) => !up.includes(p) && p.grade !== 3);
  for (const p of G.youth) p.grade = (p.grade || 1) + 1;
  const kids = intake(r, G.ids, youthEnv(G));
  G.youth.push(...kids);
  out.push(`ユースに新しい1年生が${kids.length}人入ってきた。`);
  G.promo = null;
  return out;
}
/** 画面から：昇格会議で決める */
export function decidePromo(G: GameState, ids: number[]): string[] {
  const r = new Rng(G.rng); try { const o = applyPromo(G, r, ids); G.news = o; return o; } finally { G.rng = r.s; }
}

/* ---------- 新しいシーズン：昇格と降格 ---------- */
function newSeason(G: GameState, r: Rng): string[] {
  const out: string[] = [];
  if (G.owner) seasonBond(G);
  if (G.owner) out.push(...rollContracts(G));
  const ret = G.squad.filter((p) => p.retiring);
  if (ret.length) out.push(`${ret.map((p) => p.name).join('、')} が引退した。`);
  G.squad = G.squad.filter((p) => !p.retiring);
  /* 人数が足りないときは、契約の切れた選手をすぐに呼ぶ（試合ができなくならないように） */
  const need: Pos[] = [];
  const cnt = (pos: Pos) => G.squad.filter((p) => p.pos === pos).length + need.filter((x) => x === pos).length;
  for (const [pos, min] of [['GK', 2], ['CB', 3], ['SB', 2], ['CM', 2], ['DM', 1], ['WG', 2], ['ST', 2]] as [Pos, number][]) while (cnt(pos) < min) need.push(pos);
  while (G.squad.length + need.length < 18) need.push(r.pick(['CB', 'CM', 'WG', 'ST', 'SB'] as Pos[]));
  if (need.length) {
    const lv = TIER_LVL[myTier(G)] - 8;
    const add = need.map((pos) => { const p = makePlayer(r, G.ids, lv, pos, { age: r.int(22, 30), origin: '他クラブから', prefPool: [G.club.pref] }); p.contract = 1; return p; });
    G.squad.push(...add); assignNumbers(G.squad);
    out.push(`人数が足りないので、契約の切れていた ${add.map((p) => p.name).join('、')} を呼んだ。`);
  }
  for (const p of G.youth) p.age++;
  const moves: { id: number; to: number }[] = [];
  const done = new Map<number, { rank: number; tier: number }>(); const finNews: string[] = [];
  for (const t of [1, 2, 3]) {
    const rows = standings(G, t);
    rows.forEach((x, i) => { x.c.prevRank = i + 1; done.set(x.id, { rank: i + 1, tier: t }); if (!x.c.me) { (x.c.hist ??= []).push({ y: G.season, tier: t, rank: i + 1 }); if (x.c.hist.length > 60) x.c.hist.shift(); } });
    if (t < 3) rows.slice(10).forEach((x) => moves.push({ id: x.id, to: t + 1 }));
    if (t > 1) rows.slice(0, 2).forEach((x) => moves.push({ id: x.id, to: t - 1 }));
  }
  for (const m of moves) { const c = clubById(G, m.id); c.tier = m.to; if (!c.me) c.prevRank = 0; }
  /* 選手は1つ年をとる。記録を残す */
  for (const p of G.squad) { p.hist.push({ y: G.season, ovr: ovr(p), a: p.a.map(Math.floor) }); p.age++; p.seasonApps = 0; p.seasonGoals = 0; p.seasonPerf = 0; p.seasonAst = 0; p.seasonRt = 0; p.seasonRtN = 0; if (p.fame) p.fame = Math.floor(p.fame * 0.5 * 10) / 10; }
  for (const c of G.clubs) {
    if (c.me) continue;
    for (const p of c.squad) { p.age++; p.seasonApps = 0; p.seasonGoals = 0; p.seasonPerf = 0; p.seasonAst = 0; p.seasonRt = 0; p.seasonRtN = 0; p.inj = 0; p.fat = 0; }
    /* 年をとった選手が何人か去り、新しい選手が入る */
    aiYouth(G, c, r);
    const leave = c.squad.filter((p) => p.age >= 33 || (p.age >= 30 && r.next() < 0.25)).slice(0, 5);
    for (const p of leave) {
      const np = makePlayer(r, G.ids, TIER_LVL[c.tier] + r.int(-6, 3), p.pos, { age: r.int(21, 29), prefPool: [c.pref, c.pref, '東京都', '大阪府'] });
      np.num = p.num; c.squad[c.squad.indexOf(p)] = np;
    }
    /* 問126：強さは、お金（来年の給料の目安）で決まる。段の目安へ無理に寄せない */
    const d0 = done.get(c.id) ?? { rank: 6, tier: c.tier };
    finNews.push(...aiSeasonFin(G, c, r, d0.rank, d0.tier, (cc, target) => nudgeTo(cc, r, target)));
    if (r.next() < 0.15) c.mgr = makeManager(r, G.ids, c.tier === 1 ? 0.7 : c.tier === 2 ? 0.5 : 0.3);
  }
  out.push(...r.shuffle(finNews).slice(0, 4));
  G.season++; G.week = 0;
  setupSeason(G, r);
  if (G.owner) out.push(...newOwnerSeason(G, r));
  if (G.owner) { G.goal = G.nextGoal && G.nextGoal.season === G.season ? G.nextGoal : undefined; G.nextGoal = null; G.yearStart = { pop: G.owner.pop, fans: [0, 0] }; ensureMeta(G); G.snap = snapshot(G); }
  void teamStrength;
  return out;
}

export interface SkipResult { weeks: number; report: ReportEntry[]; lastMatch: MatchView | null; seasonEnd: boolean; news: string[]; }
/** 次に決めること（オファー・大きな覚醒・年末・シーズンの変わり目）まで、見どころを飛ばして進む */
export function advanceToDecision(G: GameState, maxWeeks = 8): SkipResult {
  let weeks = 0; const all: ReportEntry[] = []; let last: MatchView | null = null; let seasonEnd = false; const news: string[] = [];
  while (weeks < maxWeeks) {
    const res = advanceWeek(G); weeks++;
    all.push(...res.report); if (res.match) last = res.match; news.push(...res.news);
    if (res.seasonEnd) { seasonEnd = true; break; }
    if (G.cere || G.meet || G.regm?.open || G.pending.length || res.news.some((l) => l.startsWith('移籍の結果')) || res.report.some((x) => x.awake) || G.week === AWARD_WEEK + 1 || G.week === 4 || G.week === 8 || G.promo?.open || G.owner?.cands.some((c) => c.src === 'trial' && c.until === G.season * 48 + G.week + 4) || G.owner?.trials.some((p) => p.trialMonths === 0)) break;
  }
  G.news = news;
  return { weeks, report: mergeReports(all), lastMatch: last, seasonEnd, news };
}
