/* 移籍市場（企画書 12-0・夜2）
   - 申し込めるのは「知っている選手」だけ（全員を検索できる形にはしない）
   - スカウトは1つのしくみ：ポジション・ざっくりの地域・市場の値段・年齢の4つの条件で、所属を問わず探す
   - 移籍金は「相場」。値段の交渉はしない。相手のクラブが売るか、選手本人が来るかを決める（段と給料だけ） */
import { Rng, clamp } from './rng';
import { POS, type Pos } from './constants';
import { PREFS, REGIONS, prefByName } from './data/prefs';
import { makePlayer, ovr, salaryFor, assignNumbers } from './player';
import { TIER_LVL, type Club } from './world';
import type { Scout } from './staff';
import { joinBond } from './bond';
import type { Player } from './types';
import type { GameState } from './game';

/* ---------- スカウトの条件 ---------- */
/** どれも null（または空）は「こだわらない」 */
export interface ScoutCond { pos: Pos[]; region: string | null; vmin: number | null; vmax: number | null; amin: number | null; amax: number | null;
  /** 問104：クラブに合わせる（いまのお金で払える・段の差が1つまでの選手を先に探す）。なければオン */
  fit?: boolean; }
export const anyCond = (): ScoutCond => ({ pos: [], region: null, vmin: null, vmax: null, amin: null, amax: null });
/** 画面に出す地域の名前（指示書の呼び方にそろえる） */
export const SCOUT_REGIONS = REGIONS;
export const regionLabel = (r: string) => ({ 近畿: '関西', '九州・沖縄': '九州沖縄' } as Record<string, string>)[r] ?? r;
/** 値段の範囲の選びどころ（万円） */
export const VALUE_STEPS = [0, 500, 1000, 2000, 3000, 5000, 8000, 12000, 20000];
export function condText(c: ScoutCond): string {
  const v = c.vmin == null && c.vmax == null ? '値段はこだわらない' : `${c.vmin ? manText(c.vmin) : '0円'}〜${c.vmax != null ? manText(c.vmax) : '上限なし'}`;
  const a = c.amin == null && c.amax == null ? '年齢はこだわらない' : `${c.amin ?? 16}〜${c.amax ?? 40}歳`;
  return `${c.pos.length ? c.pos.join('・') : 'ポジションはこだわらない'} ／ ${c.region ? regionLabel(c.region) : '地域はこだわらない'} ／ ${v} ／ ${a}`;
}
const manText = (m: number) => (m >= 10000 ? `${m / 10000}億円` : `${m.toLocaleString()}万円`);
export const scoutCond = (s: Scout): ScoutCond => (s.cond ??= anyCond());

/* ---------- 市場の値段（相場） ---------- */
/** 相場（万円）：能力・年齢・契約の残り年数・いる段で決まる（感想22：買って強くするのも楽しめる値段）。高校生・大学生・フリーは0円 */
export function marketValue(p: Player, tier: number | null): number {
  if (tier == null) return 0;
  const o = ovr(p);
  const age = p.age <= 21 ? 1.6 : p.age <= 24 ? 1.35 : p.age <= 28 ? 1 : p.age <= 30 ? 0.75 : p.age <= 32 ? 0.5 : 0.3;
  const ct = p.contract <= 1 ? 0.6 : p.contract === 2 ? 0.85 : 1;
  const tf = tier === 1 ? 1.3 : tier === 2 ? 1.1 : 1;
  return Math.max(200, Math.round((Math.pow(Math.max(0, o - 40), 2) * 4.5 * age * ct * tf) / 100) * 100);
}
/** 総合力のだいたい（例：「60台」） */
export const ovrRange = (o: number) => `${Math.floor(o / 10) * 10}台`;
/** 能力から見た「その選手が本来いる段」（フリーの選手が来てくれるかに使う） */
export const tierByOvr = (o: number) => (o >= 72 ? 1 : o >= 63 ? 2 : 3);

/* ---------- 知っている選手 ---------- */
export type KnownSrc = 'scout' | 'match' | 'award' | 'free';
export interface Known {
  pid: number;
  /** くわしく調べたか（スカウト・表彰・フリーのお知らせ）。対戦で見ただけなら false */
  full: boolean;
  season: number; week: number; src: KnownSrc;
  /** 調べたときの総合力・能力・年齢・いたところ */
  ovr: number; a?: number[]; age: number; club: string;
  note?: string; scout?: string;
  /** 高校生・大学生（どこにも所属していないので、ここに選手そのものを持つ） */
  p?: Player; from?: string; fee?: number;
}
export interface Bid { pid: number; bump: number; fee: number; salary: number; at: number; }
export interface MarketState { known: Record<number, Known>; free: Player[]; bids: Bid[]; result: number;
  /** 候補リスト（感想24：スカウトの報告から気になった選手を入れておき、あとで誰に申し込むか決める）。古いセーブにはないので、なければ空 */
  short?: number[]; }
export const shortList = (G: GameState) => (G.owner.mk.short ??= []);
export const inShort = (G: GameState, pid: number) => shortList(G).includes(pid);
export function toggleShort(G: GameState, pid: number): boolean {
  const s = shortList(G); const i = s.indexOf(pid);
  if (i >= 0) { s.splice(i, 1); return false; }
  if (!G.owner.mk.known[pid]) return false;
  s.push(pid); return true;
}
const dropShort = (G: GameState, pid: number) => { const s = shortList(G); const i = s.indexOf(pid); if (i >= 0) s.splice(i, 1); };
export const initMarket = (): MarketState => ({ known: {}, free: [], bids: [], result: -1, short: [] });
export const absWeek = (G: GameState) => G.season * 48 + G.week;
const tierOf = (G: GameState) => G.clubs.find((c) => c.me)!.tier;
export const marketOpen = (G: GameState) => (G.week >= 24 && G.week <= 31) || G.week >= 44;

export type Where = { p: Player; club: Club | null; kind: 'pro' | 'free' | 'ama' };
/** その選手がいまどこにいるか（いなくなった選手は null） */
export function whereIs(G: GameState, pid: number, idx?: Map<number, Where>): Where | null {
  if (idx) return idx.get(pid) ?? null;
  for (const c of G.clubs) if (!c.me) { const p = c.squad.find((x) => x.id === pid); if (p) return { p, club: c, kind: 'pro' }; }
  const f = G.owner.mk.free.find((x) => x.id === pid); if (f) return { p: f, club: null, kind: 'free' };
  const k = G.owner.mk.known[pid]; if (k?.p) return { p: k.p, club: null, kind: 'ama' };
  return null;
}
export function playerIndex(G: GameState): Map<number, Where> {
  const m = new Map<number, Where>();
  for (const c of G.clubs) if (!c.me) for (const p of c.squad) m.set(p.id, { p, club: c, kind: 'pro' });
  for (const p of G.owner.mk.free) m.set(p.id, { p, club: null, kind: 'free' });
  for (const k of Object.values(G.owner.mk.known)) if (k.p) m.set(k.pid, { p: k.p, club: null, kind: 'ama' });
  return m;
}
export const valueOf = (w: Where) => (w.kind === 'pro' ? marketValue(w.p, w.club!.tier) : 0);
const regionOfWhere = (w: Where) => prefByName(w.club ? w.club.pref : w.p.pref).region;
/** 情報の新しさ */
export const isStale = (G: GameState, k: Known) => k.season < G.season;

function learn(G: GameState, p: Player, club: string, src: KnownSrc, full: boolean, extra: Partial<Known> = {}) {
  const mk = G.owner.mk; const old = mk.known[p.id];
  /* くわしい情報を、対戦で見ただけの情報で上書きしない（同じシーズンなら） */
  if (old && old.full && !full && old.season === G.season) return;
  mk.known[p.id] = { pid: p.id, full, season: G.season, week: G.week, src, ovr: ovr(p), a: full ? [...p.a] : undefined, age: p.age, club, ...extra };
}
/** 対戦したクラブの先発（強い順の11人）は、名前・ポジション・だいたいの強さだけわかる */
/** 問100：対戦で見ただけの選手は、もう覚えない（残しているのは古いセーブのためだけ） */
export function seeOpponent(G: GameState, c: Club) {
  if (c.me) return;
  for (const p of [...c.squad].sort((a, b) => ovr(b) - ovr(a)).slice(0, 11)) learn(G, p, c.name, 'match', false);
}
/** 年末の表彰に選ばれた選手は、誰でも知っている */
export function learnAward(G: GameState, p: Player, c: Club) { if (!c.me) learn(G, p, c.name, 'award', true, { note: '年末の表彰に選ばれた' }); }

/* ---------- スカウトが毎月探してくる ---------- */
function fits(cond: ScoutCond, pos: Pos, age: number, value: number, region: string) {
  if (cond.pos.length && !cond.pos.includes(pos)) return false;
  if (cond.region && cond.region !== region) return false;
  if (cond.vmin != null && value < cond.vmin) return false;
  if (cond.vmax != null && value > cond.vmax) return false;
  if (cond.amin != null && age < cond.amin) return false;
  if (cond.amax != null && age > cond.amax) return false;
  return true;
}
/** 高校生・大学生（17〜22歳・0円）を探せる条件か */
function amaAges(cond: ScoutCond): [number, number] | null {
  if (cond.vmin != null && cond.vmin > 0) return null;
  const lo = Math.max(17, cond.amin ?? 17), hi = Math.min(22, cond.amax ?? 22);
  return lo <= hi ? [lo, hi] : null;
}
export function scoutMonth(G: GameState, r: Rng): string[] {
  const o = G.owner; const mk = o.mk; const out: string[] = [];
  if (!o.scouts.length) return out;
  const idx = playerIndex(G);
  const pool = [...idx.values()].filter((w) => w.kind !== 'ama');
  const tier = tierOf(G);
  let found = 0; const none: string[] = [];
  for (const s of o.scouts) {
    const cond = scoutCond(s);
    /* 腕がいいほど、1回に調べる人数が多い（問30） */
    const n = 2 + (r.next() < s.skill ? 1 : 0) + (r.next() < s.skill * 0.6 ? 1 : 0);
    const budget = G.owner.money - mk.bids.reduce((t, b) => t + b.fee, 0);
    const reach = (w: Where) => cond.fit === false || ((w.club ? w.club.tier >= tier - 1 : true) && valueOf(w) <= Math.max(0, budget));
    const pros = pool.filter((w) => fits(cond, w.p.pos, w.p.age, valueOf(w), regionOfWhere(w)) && reach(w) && !(mk.known[w.p.id]?.full && mk.known[w.p.id].season === G.season));
    r.shuffle(pros);
    /* 腕のいいスカウトほど、条件の中でも力のある選手を先に見つける */
    if (r.next() < s.skill) pros.sort((a, b) => ovr(b.p) - ovr(a.p) + (r.next() - 0.5) * 12);
    const ama = amaAges(cond);
    let got = 0;
    for (let i = 0; i < n; i++) {
      const useAma = ama && (!pros.length || r.next() < 0.3);
      if (useAma) {
        const p = makeAmateur(G, r, s, cond, ama!, tier);
        learn(G, p, p.age <= 18 ? '高校' : '大学', 'scout', true, { note: scoutNote(p, s.skill, r), scout: s.name, p, from: p.age <= 18 ? '高校生' : '大学生', fee: Math.max(50, Math.round((100 + r.next() * 300 + (p.pot - 60) * 8) / 10) * 10) });
        got++;
      } else if (pros.length) {
        const w = pros.shift()!;
        learn(G, w.p, w.club ? w.club.name : 'フリー', w.kind === 'free' ? 'free' : 'scout', true, { note: proNote(w, s.skill, r), scout: s.name });
        got++;
      }
    }
    found += got;
    if (!got) none.push(s.name);
  }
  /* 問119：自分から売り込みに来る子は、スカウトの報告の1人として届く */
  if (G.week >= 8 && G.week <= 43 && r.next() < 0.18) {
    const age = r.int(17, 23); const p = makePlayer(r, G.ids, 38 + r.int(0, 12), r.pick(POS), { age, nSp: 0, exp: 0, pref: r.next() < 0.5 ? G.club.pref : r.pick(PREFS).name, origin: '売り込み' });
    p.pot = clamp(ovr(p) + r.int(4, 26), 40, 86); p.salary = salaryFor(ovr(p)); p.contract = 2;
    learn(G, p, age <= 18 ? '高校' : age <= 22 ? '大学' : 'どこにも所属していない', 'scout', true, { note: '「テストを受けさせてください」と、自分から売り込みに来た', scout: '売り込み', p, from: '売り込み', fee: 50 });
    out.push(`${p.name}（${age}歳・${p.pos}）が、自分から売り込みに来た。スカウトの報告に入れておいた。`);
  }
  if (found) out.push(`スカウトが、条件に合う選手を${found}人調べてきた（チーム → 移籍 → スカウトで見られる）。`);
  if (none.length) out.push(`スカウトの${none.join('・')}：「条件に合う選手が見つからなかった」。条件を少しゆるめてみよう。`);
  return out;
}
function makeAmateur(G: GameState, r: Rng, s: Scout, cond: ScoutCond, ages: [number, number], tier: number): Player {
  const pos = cond.pos.length ? r.pick(cond.pos) : r.pick(POS);
  const age = r.int(ages[0], ages[1]);
  const region = cond.region ?? r.pick(REGIONS);
  const pref = r.pick(PREFS.filter((p) => p.region === region)).name;
  const lvl = 40 + r.int(0, 10) + (age - 17) * 1.5 + (tier < 3 ? 4 : 0);
  const p = makePlayer(r, G.ids, lvl, pos, { age, nSp: r.next() < 0.3 ? 1 : 0, exp: age >= 20 ? 10 : 0, pref, origin: 'スカウト' });
  /* 腕のいいスカウトほど、隠れた原石を持ってくる（問30） */
  const gem = r.next() < 0.04 + s.skill * 0.16;
  p.pot = clamp(Math.round(ovr(p) + 6 + r.next() * 10 + s.skill * 10 + (gem ? r.int(8, 16) : 0)), 40, 88);
  if (p.gStart < age - 2) p.gStart = age - r.int(0, 2);
  p.contract = 3; p.salary = salaryFor(ovr(p));
  return p;
}
/** ひとことの評価：腕がいいほど当たる */
export function scoutNote(p: Player, skill: number, r: Rng): string {
  const room = p.pot - ovr(p) + (r.next() > 0.45 + skill * 0.55 ? r.int(-10, 10) : 0);
  const g = p.sp.find((s) => ['練習の虫', 'キャンプで化ける', '実戦で伸びる', '吸収力', '学ぶ力', '衰えにくい'].includes(s));
  const base = room >= 25 ? '化けるかもしれない。ほかのクラブに取られる前に' : room >= 15 ? '伸びしろがある。数年かけて育てたい' : room >= 8 ? 'まじめな子。少しずつ伸びそうだ' : 'すぐに使えるが、上はそれほど高くないかもしれない';
  return g && skill >= 0.5 ? `${base}。${g === '練習の虫' ? 'あいつは練習の虫です' : `「${g}」の気配がある`}` : base;
}
function proNote(w: Where, skill: number, r: Rng): string {
  const p = w.p; const room = p.pot - ovr(p) + (r.next() > 0.45 + skill * 0.55 ? r.int(-8, 8) : 0);
  const role = w.club ? (isStarter(w.club, p) ? '先発で出ている' : '控えにいる') : '契約が切れて、いまはどこにもいない';
  const up = p.age >= 30 ? 'そろそろ力が落ちてくる年齢' : room >= 12 ? 'まだ伸びる' : room >= 5 ? '少しは伸びる' : 'もう伸びしろは少ない';
  const lead = w.club ? `${w.club.tier}部の${w.club.name}で${role}` : role;
  return `${lead}。${up}${p.contract <= 1 && w.club ? '。契約が今年で切れる' : ''}`;
}
export function isStarter(c: Club, p: Player): boolean {
  const same = c.squad.filter((x) => x.pos === p.pos).sort((a, b) => ovr(b) - ovr(a));
  const slots = p.pos === 'GK' || p.pos === 'DM' || p.pos === 'AM' ? 1 : 2;
  return same.indexOf(p) < slots;
}

/* ---------- 獲得の申し込み ---------- */
export const BUMPS = [0, 20, 50];
/** 申し込んだときの給料（フリーは高め） */
export const offerSalary = (w: Where, bump: number) => Math.round((salaryFor(ovr(w.p)) * (w.kind === 'free' ? 1.4 : 1) * (1 + bump / 100)) / 10) * 10;
/** 相手のクラブが売ってくれる見こみ：先発の上位ほど売りにくく、控えや契約が残り1年なら売りやすい */
export function sellChance(c: Club, p: Player): number {
  const rank = [...c.squad].sort((a, b) => ovr(b) - ovr(a)).indexOf(p);
  let x = rank < 3 ? 0.05 : isStarter(c, p) ? 0.3 : rank < 16 ? 0.7 : 0.85;
  if (p.contract <= 1) x += 0.3;
  return clamp(x, 0.02, 0.95);
}
/** 選手本人が来てくれる見こみ：段の差と、給料の上乗せだけで決まる（気持ちのしくみは入れない：問52） */
export function joinChance(fromTier: number, myTier: number, bump: number): number {
  const d = myTier - fromTier;
  const base = d <= -1 ? 0.95 : d === 0 ? 0.85 : d === 1 ? 0.5 : 0.2;
  return clamp(base + (bump >= 50 ? 0.4 : bump >= 20 ? 0.2 : 0), 0.05, 0.95);
}
export const fromTierOf = (w: Where) => (w.club ? w.club.tier : tierByOvr(ovr(w.p)));
export const chanceWord = (x: number) => (x >= 0.75 ? '高い' : x >= 0.45 ? 'ふつう' : x >= 0.2 ? '低い' : 'とても低い');
const reserved = (G: GameState) => G.owner.mk.bids.reduce((s, b) => s + b.fee, 0);

/** 獲得を申し込む。高校生・大学生はその場で決まる。プロとフリーは移籍の期間だけで、結果は次の週のお知らせで届く */
export function bid(G: GameState, pid: number, bump: number, r: Rng): string | null {
  const mk = G.owner.mk; const k = mk.known[pid];
  if (!k) return '知らない選手には申し込めない。スカウトに調べてもらおう。';
  const w = whereIs(G, pid); if (!w) return 'この選手は、もういない（引退したか、ほかのクラブに移った）。';
  if (G.squad.length + mk.bids.length >= 25) return 'トップは25人まで。誰かを売りに出してから獲ろう。';
  if (mk.bids.some((b) => b.pid === pid)) return 'もう申し込んでいる。結果は次の週に届く。';
  if (w.kind === 'ama') {
    const fee = k.fee ?? 100;
    if (G.owner.money < fee) return 'お金が足りない。';
    G.owner.money -= fee; G.owner.ledger.buy += fee;
    const p = w.p; joinBond(p, false); p.love = 45; p.num = 0; p.req = false; p.listed = false; p.hist ??= [];
    G.squad.push(p); assignNumbers(G.squad); delete mk.known[pid]; dropShort(G, pid);
    void r; return null;
  }
  if (!marketOpen(G)) return 'プロとフリーの選手は、移籍の期間（7〜8月・12月）にしか申し込めない。';
  const fee = valueOf(w);
  if (G.owner.money - reserved(G) < fee) return 'お金が足りない。';
  mk.bids.push({ pid, bump: BUMPS.includes(bump) ? bump : 0, fee, salary: offerSalary(w, bump), at: absWeek(G) });
  return null;
}
/** 問101：スカウトのリストから消す（候補リストからも外れる）。またスカウトが調べてきたら、新しい情報として出る */
export function forgetKnown(G: GameState, pid: number) { delete G.owner.mk.known[pid]; dropShort(G, pid); }
export function forgetUnlisted(G: GameState): number { const keep = new Set(shortList(G)); const bid = new Set(G.owner.mk.bids.map((b) => b.pid)); let n = 0; for (const k of Object.values(G.owner.mk.known)) if (!keep.has(k.pid) && !bid.has(k.pid)) { delete G.owner.mk.known[k.pid]; n++; } return n; }
export function cancelBid(G: GameState, pid: number) { G.owner.mk.bids = G.owner.mk.bids.filter((b) => b.pid !== pid); }

/** 申し込みの結果（次の週のはじめに届く） */
export function resolveBids(G: GameState, r: Rng): string[] {
  const mk = G.owner.mk; const out: string[] = []; const now = absWeek(G);
  const due = mk.bids.filter((b) => b.at <= now); mk.bids = mk.bids.filter((b) => b.at > now);
  for (const b of due) {
    const w = whereIs(G, b.pid);
    if (!w) { out.push('申し込んだ選手は、もうほかへ移っていた。'); continue; }
    const p = w.p; const who = `${p.name}（${p.pos}・${p.age}歳）`;
    if (w.club && r.next() >= sellChance(w.club, p)) { out.push(`移籍の結果：${w.club.name}は ${who} を売ってくれなかった。`); continue; }
    if (r.next() >= joinChance(fromTierOf(w), tierOf(G), b.bump)) { out.push(`移籍の結果：${w.club ? `${w.club.name}は売ってくれたが、` : ''}${who}本人が来るのを断った。`); continue; }
    if (G.owner.money < b.fee) { out.push(`移籍の結果：お金が足りなくなっていて、${who}を獲れなかった。`); continue; }
    if (G.squad.length >= 25) { out.push(`移籍の結果：トップが25人いて、${who}を入れられなかった。`); continue; }
    if (b.fee) { G.owner.money -= b.fee; G.owner.ledger.buy += b.fee; }
    if (w.club) replaceInClub(G, w.club, p, r);
    else mk.free = mk.free.filter((x) => x !== p);
    joinBond(p, false); p.origin = w.club ? '他クラブから' : 'フリーから'; p.contract = 3; p.salary = b.salary; p.num = 0; p.req = false; p.listed = false; p.hist ??= [];
    G.squad.push(p); assignNumbers(G.squad); delete mk.known[p.id]; dropShort(G, p.id);
    out.push(`移籍の結果：${w.club ? `${w.club.name}から` : 'フリーの'} ${who} が来てくれた！${b.fee ? `（移籍金 ${manText(b.fee)}、` : '（'}給料 年${b.salary.toLocaleString()}万円）`);
  }
  mk.result = due.length ? now : mk.result;
  return out;
}
/** 選手が抜けたクラブには、段の目安くらいの選手が入る（段ごとの強さがくずれないように） */
function replaceInClub(G: GameState, c: Club, p: Player, r: Rng, lvl = TIER_LVL[c.tier] - 2) {
  const i = c.squad.indexOf(p); if (i < 0) return;
  const np = makePlayer(r, G.ids, lvl, p.pos, { age: r.int(19, 28), prefPool: [c.pref] }); np.num = p.num; c.squad[i] = np;
}

/* ---------- フリーの選手と、他のクラブ同士の移籍 ---------- */
/** 12月：他のクラブが契約を更新しなかった選手がフリーになる */
export function releaseFree(G: GameState, r: Rng) {
  const mk = G.owner.mk;
  for (const c of G.clubs) {
    if (c.me) continue;
    const pick = c.squad.filter((p) => p.contract <= 1 && !isStarter(c, p) && p.age >= 23 && p.age <= 32);
    for (const p of r.shuffle(pick).slice(0, r.next() < 0.5 ? 1 : 0)) {
      replaceInClub(G, c, p, r, TIER_LVL[c.tier] + r.int(-5, 1));
      p.contract = 0; p.num = 0; p.listed = false; mk.free.push(p);
    }
  }
  /* フリーは多くても24人まで（古い人から、引退したり、ほかの国へ行ったりする） */
  if (mk.free.length > 24) mk.free = mk.free.slice(-24);
}
/** 移籍の期間に、フリーの選手の情報が何人か届く */
export function freeNews(G: GameState, r: Rng): string[] {
  const mk = G.owner.mk; const cand = mk.free.filter((p) => !mk.known[p.id]?.full);
  const pick = r.shuffle([...cand]).slice(0, 3);
  for (const p of pick) learn(G, p, 'フリー', 'free', true, { note: `契約が切れて、いまはどこにもいない。移籍金なしで獲れるが、給料は高め` });
  return pick.length ? [`フリーの選手の情報が${pick.length}人ぶん届いた。移籍金なしで獲れる（給料は高め）。`] : [];
}
/** 他のクラブ同士の移籍：強いクラブが、下の段の力のある選手を獲る。お知らせに大きな移籍を出す */
export function aiTransfers(G: GameState, r: Rng): string[] {
  const out: { fee: number; t: string }[] = [];
  const clubs = G.clubs.filter((c) => !c.me);
  for (const buyer of clubs) {
    if (buyer.tier === 3 || r.next() > (buyer.tier === 1 ? 0.45 : 0.3)) continue;
    const weak = [...buyer.squad].sort((a, b) => ovr(a) - ovr(b));
    const sellers = clubs.filter((c) => c.tier > buyer.tier || (c.tier === buyer.tier && r.next() < 0.3));
    const pool = sellers.flatMap((c) => c.squad.map((p) => ({ p, c }))).filter(({ p, c }) => p.age <= 29 && ovr(p) <= TIER_LVL[buyer.tier] + 6 && ovr(p) >= TIER_LVL[buyer.tier] - 2 && r.next() < sellChance(c, p));
    if (!pool.length) continue;
    const { p, c } = r.pick(pool);
    const out1 = weak.find((x) => x.pos === p.pos) ?? weak[0];
    const fee = marketValue(p, c.tier);
    replaceInClub(G, c, p, r);
    /* 獲ったクラブからは、同じポジションのいちばん弱い選手が出ていく */
    const i = buyer.squad.indexOf(out1); p.num = out1.num; p.contract = 3; buyer.squad[i] = p;
    if (out1.age <= 32 && G.owner.mk.free.length < 24) { out1.contract = 0; out1.num = 0; G.owner.mk.free.push(out1); }
    G.owner.mk.bids = G.owner.mk.bids.filter((b) => b.pid !== p.id);
    out.push({ fee, t: `${buyer.name}（${buyer.tier}部）が、${c.name}（${c.tier}部）の${p.name}（${p.pos}・${p.age}歳）を獲った（移籍金 ${manText(fee)}）` });
  }
  out.sort((a, b) => b.fee - a.fee);
  return out.slice(0, 3).map((x) => `移籍のニュース：${x.t}。`);
}
/** 新しいシーズン：他クラブの契約を進める。古い情報をかたづける */
export function newMarketSeason(G: GameState, r: Rng) {
  const mk = G.owner.mk;
  for (const c of G.clubs) if (!c.me) for (const p of c.squad) { p.contract = (p.contract ?? 2) - 1; if (p.contract <= 0) p.contract = r.int(1, 3); }
  /* フリーの選手は1つ年をとる。半分ほどは引退するか、どこかのクラブに入る */
  mk.free = mk.free.filter((p) => { p.age++; return p.age < 34 && r.next() < 0.55; });
  for (const k of Object.values(mk.known)) if (k.p) k.p.age++;
  const idx = playerIndex(G);
  for (const k of Object.values(mk.known)) if (!idx.has(k.pid) || G.season - k.season >= 2) delete mk.known[k.pid];
  mk.short = shortList(G).filter((pid) => mk.known[pid]);
  mk.bids = [];
}
