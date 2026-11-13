/* PC版（GM兼監督）で足したしくみ
   - 難易度と、オーナーの信頼（0で解任）
   - 自分で決める戦術（並び方・戦い方・攻守の方針・先発・キッカー）と練習（テーマ・強度・個別）
   - スポンサー選び・チケットの値段
   - ミッション（毎シーズン3つ）・実績・ランダムな出来事・殿堂・クラブの記録 */
import { Rng, clamp } from './rng';
import { FORM, type Pos, type StyleName } from './constants';
import { ovr } from './player';
import { pickLineup, type TeamIn } from './match';
import { sponsorYear } from './finance';
import { staffName } from './staff';
import type { GrowCtx } from './growth';
import type { MatchView, Player } from './types';
import type { GameState, WeekResult } from './game';

/* ---------- 難易度 ---------- */
export type Diff = 'easy' | 'normal' | 'hard' | 'legend';
export const DIFFS: Record<Diff, { n: string; money: number; lvl: number; rev: number; fire: boolean; d: string }> = {
  easy: { n: 'イージー', money: 1.6, lvl: 3, rev: 1.15, fire: false, d: 'お金に余裕があり、選手も少し強い。解任されない' },
  normal: { n: 'ノーマル', money: 1, lvl: 0, rev: 1, fire: true, d: '標準のバランス。オーナーの信頼が0になると解任される' },
  hard: { n: 'ハード', money: 0.6, lvl: -2, rev: 0.92, fire: true, d: 'お金が少なく、収入も控えめ。選手も少し弱い' },
  legend: { n: 'レジェンド', money: 0.35, lvl: -4, rev: 0.85, fire: true, d: 'いちばん苦しいところからの挑戦。上級者向け' },
};
export const DIFF_KEYS = Object.keys(DIFFS) as Diff[];

/* ---------- 戦術 ---------- */
export type Ment = 'att' | 'bal' | 'def';
export const MENT: Record<Ment, { n: string; d: string }> = {
  att: { n: '攻撃的', d: '攻める回数が増え、シュートとドリブルが少し上がる。そのぶん相手の攻めも増える' },
  bal: { n: 'バランス', d: '攻めと守りのバランスをとる' },
  def: { n: '守備的', d: '試合の攻め合いが減り、ディフェンスとIQが少し上がる。点も取りにくくなる' },
};
export interface Tac { form: string; style: StyleName; ment: Ment; xi: (number | null)[]; auto: boolean; kick: { ck?: number; fk?: number; pk?: number } }

/* ---------- 練習 ---------- */
/** 項目の並び：スピード・シュート・パス・ドリブル・フィジカル・ディフェンス・スタミナ・IQ（キーパーはシュート→セービング、パス→キック、ドリブル→飛び出し、ディフェンス→ハイボール） */
export const THEMES: Record<string, { n: string; d: string; m: number[] }> = {
  balance: { n: 'バランス', d: '全体をまんべんなく伸ばす', m: [1, 1, 1, 1, 1, 1, 1, 1] },
  attack: { n: 'シュート・突破', d: 'シュートとドリブルを重点的に（キーパーはセービング・飛び出し）', m: [1, 1.7, 0.9, 1.5, 0.9, 0.7, 0.9, 1] },
  passing: { n: 'パス・連携', d: 'パスとIQを重点的に（キーパーはキック）', m: [0.9, 0.9, 1.8, 1.1, 0.8, 0.8, 0.9, 1.3] },
  defense: { n: '守備', d: 'ディフェンスとフィジカルを重点的に（キーパーはハイボール）', m: [0.9, 0.7, 0.9, 0.8, 1.2, 1.8, 1, 1.1] },
  physical: { n: 'フィジカル', d: 'スピード・フィジカル・スタミナを重点的に', m: [1.6, 0.8, 0.8, 0.8, 1.6, 0.8, 1.6, 0.8] },
  tactics: { n: '戦術理解', d: 'IQを重点的に。どのポジションにも効く', m: [0.8, 0.9, 1.2, 0.9, 0.8, 1, 0.8, 1.9] },
  rest: { n: '休養', d: '伸びは小さいが、疲れが大きく抜ける', m: [1, 1, 1, 1, 1, 1, 1, 1] },
};
export const INTENS: Record<string, { n: string; g: number; recov: number; inj: number }> = {
  light: { n: '軽め', g: 0.78, recov: 14, inj: 0 },
  normal: { n: 'ふつう', g: 1, recov: 0, inj: 0.0015 },
  hard: { n: 'ハード', g: 1.3, recov: -14, inj: 0.006 },
};
export interface Train { theme: string; inten: string }

/* ---------- スポンサー ---------- */
export interface Sponsor { name: string; type: 'fixed' | 'win' | 'goal'; base: number; perWin: number; perGoal: number; d: string }
const SP_NAMES = ['北辰テクノロジー', '朝凪フーズ', 'ミナト運輸', '翠嶺ホールディングス', 'あおば銀行', 'ひだまり製薬', 'カナタ自動車', 'ツクモ電機', '紅葉ビール', '星野建設', '潮騒ホテルズ', '若葉通信'];

/* ---------- ミッション・実績・出来事・殿堂 ---------- */
export interface Mission { id: string; text: string; target: number; prog: number; done: boolean; reward: number; pop: number }
export interface MStat { homeWins: number; clean: number; youthStarts: number; cur: number; best: number; startPop: number; startOvr: Record<number, number>; startMoney: number; inc0: number; exp0: number }
export interface GmEvent { id: string; title: string; text: string; choices: string[]; data: Record<string, number | string> }
export interface Hof { id: number; name: string; pos: Pos; apps: number; goals: number; ast: number; peak: number; youth: boolean; season: number; why: string; honors: number }
/** 殿堂の判定に使う、選手のひかえ */
export interface Snap { name: string; pos: Pos; apps: number; goals: number; ast: number; honors: number; youth: boolean; peak: number; retiring: boolean }
const snapOf = (p: Player): Snap => ({ name: p.name, pos: p.pos, apps: p.capps ?? 0, goals: p.cgoals ?? 0, ast: p.ast ?? 0, honors: (p.honors ?? []).length, youth: p.origin === 'ユース出身', peak: Math.max(ovr(p), ...p.hist.map((h) => h.ovr)), retiring: !!p.retiring });
export interface Records { streak: number; best: number; unbeaten: number; maxGoals: number; maxAtt: number; bigBuy: number; bigSell: number; maxPop: number }
export interface GmState {
  diff: Diff; owner: string;
  tac: Tac; train: Train;
  /** チケットの値段（円） */
  ticket: number;
  sponsor: Sponsor | null; offers: Sponsor[] | null;
  ach: Record<string, { y: number; w: number }>; flags: Record<string, number>;
  missions: Mission[]; ms: MStat;
  event: GmEvent | null; hof: Hof[]; rec: Records;
  over: { reason: string; season: number } | null;
  /** 先週の自分の選手（いなくなった選手を殿堂の対象にするため） */
  last: Record<number, Snap>;
  /** シーズンの記録（クラブ史の表のため） */
  log: { season: number; money: number; pop: number; profit: number; att: number }[];
  /** 毎週のお金（グラフ用）と、ニュースの記録 */
  mh: [number, number, number][]; news: { s: number; w: number; t: string; k?: string }[];
}

export const tierTicket = (tier: number) => ({ 3: 1800, 2: 2300, 1: 3000 } as Record<number, number>)[tier] ?? 1800;
const tierOf = (G: GameState) => G.clubs.find((c) => c.me)!.tier;
const absW = (G: GameState) => G.season * 48 + G.week;
const man = (v: number) => (Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(v % 10000 === 0 ? 0 : 1)}億円` : `${Math.round(v).toLocaleString()}万円`);

export function initGm(G: GameState, diff: Diff, r: Rng) {
  const D = DIFFS[diff];
  G.owner.money = Math.round(G.owner.money * D.money / 100) * 100;
  const form = G.mgr.forms[0] ?? '4-4-2';
  G.gm = {
    diff, owner: staffName(r),
    tac: { form, style: G.mgr.style, ment: 'bal', xi: [], auto: true, kick: {} },
    train: { theme: 'balance', inten: 'normal' },
    ticket: tierTicket(3), sponsor: null, offers: null,
    ach: {}, flags: {}, missions: [], ms: newMStat(G), event: null, hof: [],
    rec: { streak: 0, best: 0, unbeaten: 0, maxGoals: 0, maxAtt: 0, bigBuy: 0, bigSell: 0, maxPop: G.owner.pop },
    over: null, last: {}, log: [], mh: [[1, 0, G.owner.money]], news: [],
  };
  autoXI(G);
  G.gm.offers = sponsorOffers(G, r);
  G.gm.missions = makeMissions(G, r);
  G.mgrEval = 60;
}
function newMStat(G: GameState): MStat {
  const led = G.owner.ledger;
  return { homeWins: 0, clean: 0, youthStarts: 0, cur: 0, best: 0, startPop: G.owner.pop, startOvr: Object.fromEntries(G.squad.map((p) => [p.id, ovr(p)])), startMoney: G.owner.money,
    inc0: led.gate + led.sponsor + led.goods + led.dist + led.sales + led.prize + (led.misc ?? 0), exp0: led.salary + led.staff + led.ops + led.build + led.buy + led.interest + (led.miscx ?? 0) };
}

/* ---------- 試合と練習へのつなぎ ---------- */
/** 自分のクラブの TeamIn に、GMが決めたことを入れる */
export function applyTac(G: GameState, t: TeamIn): TeamIn {
  const g = G.gm; if (!g || !t.me) return t;
  t.fixed = { form: g.tac.form, xi: g.tac.xi, auto: g.tac.auto, style: g.tac.style };
  t.tilt = g.tac.ment === 'att' ? 'atk' : g.tac.ment === 'def' ? 'def' : null;
  t.kickReq = g.tac.kick;
  /* 自動のときの先発の選び方：ヘッドコーチの目は、GMが選んだ戦い方で見る */
  t.mgr = { ...t.mgr, style: g.tac.style, forms: [g.tac.form] };
  return t;
}
export function applyTrain(G: GameState, ctx: GrowCtx): GrowCtx {
  const g = G.gm; if (!g) return ctx;
  const th = THEMES[g.train.theme] ?? THEMES.balance; const it = INTENS[g.train.inten] ?? INTENS.normal;
  const rest = g.train.theme === 'rest';
  return { ...ctx, theme: th.m, inten: rest ? 0.3 : it.g, recov: rest ? 26 : it.recov, trainInj: rest ? 0 : it.inj * (1 - (G.owner.fac.medical - 1) * 0.12) };
}
/** 先発を、いま出られる選手から自動で選び直す（ヘッドコーチが選ぶのと同じ決め方） */
export function autoXI(G: GameState) {
  const g = G.gm; const t = applyTac(G, { id: 0, name: G.club.name, me: true, color: G.club.color, squad: regSquad(G), mgr: G.mgr, policy: G.policy });
  const { lineup } = pickLineup(new Rng(G.season * 999 + G.week), { ...t, fixed: undefined }, g.tac.form, true);
  const slots = FORM[g.tac.form]; const xi: (number | null)[] = slots.map(() => null); const used = new Set<number>();
  for (const x of lineup) { const i = slots.findIndex((pos, k) => pos === x.pos && xi[k] == null); if (i >= 0) { xi[i] = x.p.id; used.add(x.p.id); } }
  g.tac.xi = xi;
}
export const regSquad = (G: GameState) => { const r = G.squad.filter((p) => p.reg); return r.filter((p) => !p.inj).length >= 14 ? r : G.squad; };
/** 先発の枠に、もういない選手・出られない選手が入っていたら外す（試合では空いた枠をヘッドコーチが埋める） */
export function cleanXI(G: GameState): number[] {
  const g = G.gm; const slots = FORM[g.tac.form]; const ok = new Set(regSquad(G).filter((p) => p.inj === 0).map((p) => p.id));
  const out: number[] = [];
  if (g.tac.xi.length !== slots.length) g.tac.xi = slots.map((_, i) => g.tac.xi[i] ?? null);
  g.tac.xi = g.tac.xi.map((id) => { if (id != null && !ok.has(id)) { out.push(id); return null; } return id; });
  return out;
}
export function setForm(G: GameState, form: string) {
  if (!FORM[form]) return;
  const g = G.gm; const old = FORM[g.tac.form]; const ids = g.tac.xi.slice();
  g.tac.form = form; const slots = FORM[form]; const xi: (number | null)[] = slots.map(() => null); const used = new Set<number>();
  /* 同じポジションの人はそのまま、残りは近い順に入れる */
  slots.forEach((pos, i) => { const k = old.findIndex((q, j) => q === pos && ids[j] != null && !used.has(ids[j]!)); if (k >= 0) { xi[i] = ids[k]; used.add(ids[k]!); } });
  if (g.tac.auto) autoXI(G); else { g.tac.xi = xi; }
}

/* ---------- 潜在の見立て（★とひとこと） ---------- */
export const potStar = (pot: number) => (pot >= 82 ? 5 : pot >= 75 ? 4 : pot >= 68 ? 3 : pot >= 60 ? 2 : 1);
/** 自分の選手は、そのポジションを受け持つコーチの腕とスカウト部で見える幅が変わる */
export function potRange(G: GameState, p: Player, skill?: number): [number, number] {
  const C = G.owner.coaches;
  const s = skill ?? (p.pos === 'GK' ? C.gk : ['CB', 'SB', 'DM'].includes(p.pos) ? C.def : C.off)?.skill ?? 0.3;
  const lv = G.owner.fac.scout ?? 1;
  const unc = s >= 0.75 || lv >= 5 ? 0 : s >= 0.45 || lv >= 3 ? 1 : 2;
  const st = potStar(p.pot);
  if (!unc) return [st, st];
  const seed = ((p.id * 2654435761) >>> 0) % 1000 / 1000;
  const lo = clamp(st - Math.round(seed * unc), 1, 5); return [lo, clamp(lo + unc, 1, 5)];
}
export function potWord(p: Player): string {
  const room = p.pot - ovr(p);
  if (p.age >= 30) return 'ここからは、力を保つのが大事な年齢';
  return room >= 22 ? '化けるかもしれない' : room >= 14 ? 'まだまだ伸びる' : room >= 7 ? '少しずつ伸びそう' : room >= 3 ? '伸びしろは少なめ' : 'もう伸びしろは少ない';
}

/* ---------- スポンサー ---------- */
export function sponsorOffers(G: GameState, r: Rng): Sponsor[] {
  const raw = G.owner.sponsor > 0 ? G.owner.sponsor : sponsorYear(tierOf(G), G.club.pref, G.owner.pop);
  const base = Math.round(raw * DIFFS[G.gm.diff].rev / 100) * 100;
  const n = r.shuffle([...SP_NAMES]);
  return [
    { name: n[0], type: 'fixed', base, perWin: 0, perGoal: 0, d: '決まった額がいちばん大きい安定型' },
    { name: n[1], type: 'win', base: Math.round(base * 0.6 / 100) * 100, perWin: Math.round(base * 0.055 / 10) * 10, perGoal: 0, d: '勝つたびにボーナスが入る成果型（リーグ・天皇杯）' },
    { name: n[2], type: 'goal', base: Math.round(base * 0.65 / 100) * 100, perWin: 0, perGoal: Math.round(base * 0.025 / 10) * 10, d: '点を取るたびにボーナスが入る攻撃型' },
  ];
}
export function pickSponsor(G: GameState, i: number) {
  const s = G.gm.offers?.[i]; if (!s) return;
  G.gm.sponsor = s; G.owner.sponsor = s.base; G.gm.offers = null;
}

/* ---------- ミッション ---------- */
export function makeMissions(G: GameState, r: Rng): Mission[] {
  const t = tierOf(G); const cap = [0, 5000, 9000, 15000, 24000, 36000][G.owner.fac.stadium] ?? 5000;
  const sc = t === 3 ? 1 : t === 2 ? 2 : 4;
  const att = Math.round(Math.min(cap * 0.7, ({ 3: 2600, 2: 6000, 1: 15000 } as Record<number, number>)[t]) / 100) * 100;
  const pool: Omit<Mission, 'prog' | 'done' | 'reward' | 'pop'>[] = [
    { id: 'homeWins', text: 'ホームで6勝する', target: 6 },
    { id: 'clean', text: '無失点の試合を5回つくる', target: 5 },
    { id: 'goals', text: 'リーグ戦で35点取る', target: 35 },
    { id: 'youthStarts', text: 'ユース出身の選手を、のべ15回先発させる', target: 15 },
    { id: 'streak', text: '公式戦で4連勝する', target: 4 },
    { id: 'att', text: `ホームの試合の平均のお客さんを${att.toLocaleString()}人にする`, target: att },
    { id: 'pop', text: 'クラブの人気を6上げる', target: 6 },
    { id: 'scorer', text: '1人の選手がリーグ戦で10点取る', target: 10 },
    { id: 'growth', text: '21歳以下の選手の総合力を、合わせて10上げる', target: 10 },
    { id: 'profit', text: 'シーズンの収支を黒字にする（12月に判定）', target: 1 },
    { id: 'cup', text: '天皇杯で準々決勝まで勝ち進む', target: 1 },
  ];
  return r.shuffle(pool).slice(0, 3).map((m) => ({ ...m, prog: 0, done: false, reward: Math.round(r.int(15, 30) * 100 * sc), pop: 1 }));
}
function missionProg(G: GameState, m: Mission): number {
  const ms = G.gm.ms; const row = G.leagues[tierOf(G)].table[0];
  switch (m.id) {
    case 'homeWins': return ms.homeWins;
    case 'clean': return ms.clean;
    case 'goals': return row.gf;
    case 'youthStarts': return ms.youthStarts;
    case 'streak': return ms.best;
    case 'att': { const f = G.yearStart?.fans ?? [0, 0]; return f[1] >= 3 ? Math.round(f[0] / f[1]) : 0; }
    case 'pop': return Math.max(0, Math.round(G.owner.pop - ms.startPop));
    case 'scorer': return Math.max(0, ...G.squad.map((p) => p.seasonGoals));
    case 'growth': return G.squad.filter((p) => p.age <= 21 && ms.startOvr[p.id] != null).reduce((s, p) => s + Math.max(0, ovr(p) - ms.startOvr[p.id]), 0);
    case 'cup': return G.cup.rounds.filter((rd) => rd.some((x) => x.w === 0)).length >= 3 || G.cup.champion === 0 ? 1 : 0;
    case 'profit': return seasonNet(G) > 0 ? 1 : 0;
  }
  return 0;
}
export function seasonNet(G: GameState): number {
  const led = G.owner.ledger; const ms = G.gm.ms;
  const inc = led.gate + led.sponsor + led.goods + led.dist + led.sales + led.prize + (led.misc ?? 0);
  const exp = led.salary + led.staff + led.ops + led.build + led.buy + led.interest + (led.miscx ?? 0);
  return inc - ms.inc0 - (exp - ms.exp0);
}
function payMission(G: GameState, m: Mission, out: Toast[]) {
  m.done = true; m.prog = Math.max(m.prog, m.target);
  earn(G, 'misc', m.reward); G.owner.pop = Math.min(100, G.owner.pop + m.pop);
  out.push({ kind: 'good', title: 'ミッション達成', text: `${m.text}（報酬 ${man(m.reward)}・人気 +${m.pop}）` });
}

/* ---------- お金（その他の収入・支出） ---------- */
export function earn(G: GameState, key: 'misc' | 'sponsor' | 'sales', v: number) { G.owner.money += v; G.owner.ledger[key] = (G.owner.ledger[key] ?? 0) + v; }
export function spend(G: GameState, v: number) { G.owner.money -= v; G.owner.ledger.miscx = (G.owner.ledger.miscx ?? 0) + v; }

/* ---------- 実績 ---------- */
export interface AchDef { id: string; n: string; d: string; c: string; t: 1 | 2 | 3; f: (G: GameState) => boolean }
const hist = (G: GameState) => G.history;
const fl = (G: GameState, k: string) => (G.gm.flags[k] ?? 0);
export const ACH: AchDef[] = [
  { id: 'firstWin', n: '初勝利', d: '公式戦ではじめて勝つ', c: '試合', t: 1, f: (G) => fl(G, 'wins') >= 1 },
  { id: 'win3', n: '3連勝', d: '公式戦で3連勝する', c: '試合', t: 1, f: (G) => G.gm.rec.best >= 3 },
  { id: 'win6', n: '快進撃', d: '公式戦で6連勝する', c: '試合', t: 2, f: (G) => G.gm.rec.best >= 6 },
  { id: 'win10', n: '止まらない', d: '公式戦で10連勝する', c: '試合', t: 3, f: (G) => G.gm.rec.best >= 10 },
  { id: 'unb12', n: '負け知らず', d: '公式戦12試合つづけて負けない', c: '試合', t: 2, f: (G) => fl(G, 'unb') >= 12 },
  { id: 'goal5', n: 'ゴールラッシュ', d: '1試合で5点取る', c: '試合', t: 2, f: (G) => G.gm.rec.maxGoals >= 5 },
  { id: 'comeback', n: '逆転劇', d: 'リードされた試合をひっくり返して勝つ', c: '試合', t: 1, f: (G) => fl(G, 'comeback') >= 1 },
  { id: 'giant', n: 'ジャイアントキリング', d: '天皇杯で上の段のクラブに勝つ', c: '試合', t: 2, f: (G) => fl(G, 'giant') >= 1 },
  { id: 'cupFinal', n: 'ファイナリスト', d: '天皇杯の決勝に進む', c: '試合', t: 2, f: (G) => fl(G, 'final') >= 1 },
  { id: 'cupWin', n: '天皇杯制覇', d: '天皇杯で優勝する', c: '試合', t: 3, f: (G) => hist(G).some((h) => h.cup === '優勝') || G.cup.champion === 0 },
  { id: 'promo', n: '昇格', d: 'はじめて昇格する', c: 'リーグ', t: 1, f: (G) => hist(G).some((h) => h.promoted) },
  { id: 'reach1', n: 'トップリーグへ', d: '1部に上がる', c: 'リーグ', t: 2, f: (G) => tierOf(G) === 1 },
  { id: 'champ3', n: '3部王者', d: '3部で優勝する', c: 'リーグ', t: 1, f: (G) => hist(G).some((h) => h.tier === 3 && h.rank === 1) },
  { id: 'champ2', n: '2部王者', d: '2部で優勝する', c: 'リーグ', t: 2, f: (G) => hist(G).some((h) => h.tier === 2 && h.rank === 1) },
  { id: 'champ1', n: '頂点', d: '1部で優勝する', c: 'リーグ', t: 3, f: (G) => hist(G).some((h) => h.tier === 1 && h.rank === 1) },
  { id: 'champ1x3', n: '王朝', d: '1部で3回優勝する', c: 'リーグ', t: 3, f: (G) => hist(G).filter((h) => h.tier === 1 && h.rank === 1).length >= 3 },
  { id: 'double', n: '二冠', d: '同じ年に1部と天皇杯で優勝する', c: 'リーグ', t: 3, f: (G) => hist(G).some((h) => h.tier === 1 && h.rank === 1 && h.cup === '優勝') },
  { id: 'invincible', n: '無敗優勝', d: 'リーグ戦で1度も負けずに優勝する', c: 'リーグ', t: 3, f: (G) => fl(G, 'invincible') >= 1 },
  { id: 'pts55', n: '勝ち点55', d: '1シーズンで勝ち点55以上を取る', c: 'リーグ', t: 2, f: (G) => fl(G, 'pts55') >= 1 },
  { id: 'titles5', n: 'タイトルコレクター', d: 'リーグ優勝と天皇杯優勝を、合わせて5回', c: 'リーグ', t: 3, f: (G) => hist(G).filter((h) => h.rank === 1).length + hist(G).filter((h) => h.cup === '優勝').length >= 5 },
  { id: 'ovr70', n: '頼れる主力', d: '総合力70以上の選手がいる', c: '選手', t: 1, f: (G) => G.squad.some((p) => ovr(p) >= 70) },
  { id: 'ovr78', n: 'エース誕生', d: '総合力78以上の選手がいる', c: '選手', t: 2, f: (G) => G.squad.some((p) => ovr(p) >= 78) },
  { id: 'ovr84', n: '日本を代表する選手', d: '総合力84以上の選手がいる', c: '選手', t: 3, f: (G) => G.squad.some((p) => ovr(p) >= 84) },
  { id: 'youth72', n: '生え抜きの柱', d: 'ユース出身の選手を総合力72まで育てる', c: '選手', t: 2, f: (G) => G.squad.some((p) => p.origin === 'ユース出身' && ovr(p) >= 72) },
  { id: 'awake', n: '覚醒', d: '選手が覚醒する', c: '選手', t: 1, f: (G) => fl(G, 'awake') >= 1 },
  { id: 'awake5', n: '化ける育成', d: '選手の覚醒が通算5回', c: '選手', t: 2, f: (G) => fl(G, 'awake') >= 5 },
  { id: 'top', n: '得点王', d: '自分の選手がリーグの得点王になる', c: '選手', t: 2, f: (G) => hist(G).some((h) => h.awards.some((a) => a.me && a.title === '得点王' && a.tier === h.tier)) },
  { id: 'mvp', n: 'シーズンMVP', d: '自分の選手がシーズンMVPに選ばれる', c: '選手', t: 2, f: (G) => hist(G).some((h) => h.awards.some((a) => a.me && a.title === 'シーズンMVP')) },
  { id: 'young', n: '最優秀若手', d: '自分の選手がベストヤングプレイヤー賞に選ばれる', c: '選手', t: 1, f: (G) => hist(G).some((h) => h.awards.some((a) => a.me && a.title === 'ベストヤングプレイヤー賞')) },
  { id: 'g20', n: '20ゴール', d: '1人の選手がリーグ戦で20点取る', c: '選手', t: 2, f: (G) => fl(G, 'g20') >= 1 },
  { id: 'apps100', n: 'クラブの顔', d: 'このクラブで通算100試合に出た選手がいる', c: '選手', t: 1, f: (G) => G.squad.some((p) => (p.capps ?? 0) >= 100) },
  { id: 'goals80', n: 'レジェンドストライカー', d: 'このクラブで通算80点取った選手がいる', c: '選手', t: 3, f: (G) => G.squad.some((p) => (p.cgoals ?? 0) >= 80) },
  { id: 'hof', n: '殿堂入り', d: 'クラブの殿堂に選手を迎える', c: '選手', t: 2, f: (G) => G.gm.hof.length >= 1 },
  { id: 'gem', n: '金の卵', d: '潜在★5の20歳以下の選手がいる', c: '選手', t: 2, f: (G) => G.squad.some((p) => p.age <= 20 && potStar(p.pot) >= 5) },
  { id: 'money5', n: '5億円クラブ', d: 'お金が5億円をこえる', c: '経営', t: 1, f: (G) => G.owner.money >= 50000 },
  { id: 'money20', n: '20億円クラブ', d: 'お金が20億円をこえる', c: '経営', t: 2, f: (G) => G.owner.money >= 200000 },
  { id: 'money50', n: '大富豪', d: 'お金が50億円をこえる', c: '経営', t: 3, f: (G) => G.owner.money >= 500000 },
  { id: 'nodebt', n: '借金ゼロ', d: '借金をしてから、すべて返す', c: '経営', t: 1, f: (G) => fl(G, 'repaid') >= 1 },
  { id: 'pop50', n: '街の人気者', d: 'クラブの人気が50をこえる', c: '経営', t: 1, f: (G) => G.owner.pop >= 50 },
  { id: 'pop80', n: '国民的クラブ', d: 'クラブの人気が80をこえる', c: '経営', t: 3, f: (G) => G.owner.pop >= 80 },
  { id: 'full', n: '満員御礼', d: 'ホームの試合を満員にする', c: '経営', t: 1, f: (G) => fl(G, 'full') >= 1 },
  { id: 'att20k', n: '2万人の声援', d: 'ホームの試合に2万人のお客さんが来る', c: '経営', t: 2, f: (G) => G.gm.rec.maxAtt >= 20000 },
  { id: 'stadium5', n: '夢のスタジアム', d: 'スタジアムを最大まで大きくする', c: '経営', t: 3, f: (G) => G.owner.fac.stadium >= 5 },
  { id: 'fac3', n: '充実の設備', d: 'すべての施設をレベル3以上にする', c: '経営', t: 2, f: (G) => Object.values(G.owner.fac).every((v) => v >= 3) },
  { id: 'fac5', n: '世界基準', d: 'すべての施設を最大まで強化する', c: '経営', t: 3, f: (G) => Object.values(G.owner.fac).every((v) => v >= 5) },
  { id: 'buy1', n: '大型補強', d: '移籍金1億円以上で選手を獲る', c: '経営', t: 2, f: (G) => G.gm.rec.bigBuy >= 10000 },
  { id: 'sell1', n: '高値で売る', d: '移籍金1億円以上で選手を売る', c: '経営', t: 2, f: (G) => G.gm.rec.bigSell >= 10000 },
  { id: 'profit', n: '黒字経営', d: 'シーズンの収支を黒字で終える', c: '経営', t: 1, f: (G) => fl(G, 'profit') >= 1 },
  { id: 'y3', n: '3年目', d: '就任3年目をむかえる', c: '歴史', t: 1, f: (G) => G.season >= 3 },
  { id: 'y5', n: '5年目', d: '就任5年目をむかえる', c: '歴史', t: 1, f: (G) => G.season >= 5 },
  { id: 'y10', n: '10年目', d: '就任10年目をむかえる', c: '歴史', t: 2, f: (G) => G.season >= 10 },
  { id: 'y20', n: '20年目', d: '就任20年目をむかえる', c: '歴史', t: 2, f: (G) => G.season >= 20 },
  { id: 'y30', n: '30年目', d: '就任30年目をむかえる', c: '歴史', t: 3, f: (G) => G.season >= 30 },
  { id: 'y50', n: '名誉GM', d: '就任50年目をむかえる', c: '歴史', t: 3, f: (G) => G.season >= 50 },
];
export const ACH_REWARD = [0, 300, 1200, 5000];
export interface Toast { kind: 'good' | 'ach' | 'bad' | 'info'; title: string; text: string }
export function checkAch(G: GameState, out: Toast[]) {
  for (const a of ACH) {
    if (G.gm.ach[a.id]) continue;
    let ok = false; try { ok = a.f(G); } catch { ok = false; }
    if (!ok) continue;
    G.gm.ach[a.id] = { y: G.season, w: G.week };
    earn(G, 'misc', ACH_REWARD[a.t]);
    out.push({ kind: 'ach', title: '実績解除', text: `${a.n}：${a.d}（報酬 ${man(ACH_REWARD[a.t])}）` });
  }
}

/* ---------- 殿堂 ---------- */
function hofCheck(G: GameState, id: number, p: Snap, why: string): Hof | null {
  const hon = p.honors;
  if (!(p.apps >= 150 || p.goals >= 50 || hon >= 2 || (p.youth && p.apps >= 100))) return null;
  if (G.gm.hof.some((h) => h.id === id)) return null;
  const h: Hof = { id, name: p.name, pos: p.pos, apps: p.apps, goals: p.goals, ast: p.ast, peak: p.peak, youth: p.youth, season: G.season, why, honors: hon };
  G.gm.hof.push(h); return h;
}

/* ---------- ランダムな出来事 ---------- */
type EvDef = { id: string; w: number; when: (G: GameState) => boolean; make: (G: GameState, r: Rng) => GmEvent; apply: (G: GameState, e: GmEvent, i: number, r: Rng) => string };
const pickP = (G: GameState, r: Rng, f: (p: Player) => boolean) => { const c = G.squad.filter(f); return c.length ? r.pick(c) : null; };
const findP = (G: GameState, id: number | string) => G.squad.find((p) => p.id === Number(id));
const EVENTS: EvDef[] = [
  { id: 'localAd', w: 3, when: () => true, make: (G, r) => { const v = Math.round(G.owner.sponsor * (0.03 + r.next() * 0.03) / 100) * 100; return { id: 'localAd', title: '地元の会社からの広告の話', text: `${G.club.city}の老舗の会社が、スタジアムに看板を出したいと言ってきた。広告料は${man(v)}。`, choices: [`受ける（+${man(v)}）`, '断る'], data: { v } }; },
    apply: (G, e, i) => { if (i === 0) { earn(G, 'misc', Number(e.data.v)); return '広告の契約を結んだ。'; } return '今回は見送った。'; } },
  { id: 'fanDay', w: 3, when: () => true, make: (G) => { const c = Math.round((300 + G.owner.pop * 15) / 10) * 10; return { id: 'fanDay', title: 'ファン感謝デーの提案', text: `広報からファン感謝デーをやりたいという話が来た。費用は${man(c)}。人気が上がり、選手の気持ちも少し上がりそうだ。`, choices: [`開く（−${man(c)}）`, '見送る'], data: { c } }; },
    apply: (G, e, i) => { if (i === 0) { spend(G, Number(e.data.c)); G.owner.pop = Math.min(100, G.owner.pop + 1); for (const p of G.squad) p.love = Math.min(100, (p.love ?? 40) + 2); return 'ファン感謝デーは大にぎわい。人気が1上がった。'; } return '今回は開かなかった。'; } },
  { id: 'payRise', w: 3, when: (G) => G.squad.some((p) => ovr(p) >= 60 && (p.love ?? 40) < 70), make: (G, r) => { const p = pickP(G, r, (x) => ovr(x) >= 60 && (x.love ?? 40) < 70)!; const nw = Math.round(p.salary * 1.25 / 10) * 10; return { id: 'payRise', title: `${p.name}の給料アップの希望`, text: `主力の${p.name}（総合力${ovr(p)}）が、年俸を${man(p.salary)}から${man(nw)}に上げてほしいと言ってきた。`, choices: ['希望をのむ', '断る'], data: { pid: p.id, nw } }; },
    apply: (G, e, i) => { const p = findP(G, e.data.pid); if (!p) return 'その選手は、もういない。'; if (i === 0) { p.salary = Number(e.data.nw); p.love = Math.min(100, (p.love ?? 40) + 12); p.unrest = Math.max(0, (p.unrest ?? 0) - 15); return `${p.name}は喜んでいる。クラブへの愛着が上がった。`; } p.unrest = Math.min(100, (p.unrest ?? 0) + 20); p.love = Math.max(0, (p.love ?? 40) - 8); return `${p.name}は不満そうだ。`; } },
  { id: 'tv', w: 2, when: () => true, make: (G) => ({ id: 'tv', title: '地元テレビの取材', text: `${G.club.city}のテレビ局から、GMの1日を追いかけたいという取材の話が来た。練習の時間が少しけずられる。`, choices: ['受ける', '断る'], data: {} }),
    apply: (G, _e, i) => { if (i === 0) { G.owner.pop = Math.min(100, G.owner.pop + 0.8); for (const p of G.squad) p.fat = Math.min(100, p.fat + 8); return '放送は好評。人気が上がった。選手は少し疲れている。'; } return '取材は断った。'; } },
  { id: 'camp', w: 2, when: (G) => G.week >= 8 && G.week <= 40, make: (G) => { const c = Math.round(({ 3: 400, 2: 900, 1: 2000 } as Record<number, number>)[tierOf(G)]); return { id: 'camp', title: '短い強化合宿の提案', text: `コーチから、短い合宿をしたいという話が来た。費用は${man(c)}。来週の練習の伸びが大きくなる。`, choices: [`行う（−${man(c)}）`, '見送る'], data: { c } }; },
    apply: (G, e, i) => { if (i === 0) { spend(G, Number(e.data.c)); G.gm.flags.campBoost = absW(G) + 1; return '来週は、伸びやすい練習になる。'; } return '見送った。'; } },
  { id: 'clash', w: 2, when: (G) => G.squad.length >= 20, make: (G, r) => { const [a, b] = r.shuffle([...G.squad]).slice(0, 2); return { id: 'clash', title: 'ロッカールームの口げんか', text: `${a.name}と${b.name}が、練習中に言い合いになった。どう収める？`, choices: [`${a.name.split(' ')[0]}の言い分を聞く`, `${b.name.split(' ')[0]}の言い分を聞く`, '2人とも罰金にする'], data: { a: a.id, b: b.id } }; },
    apply: (G, e, i) => { const a = findP(G, e.data.a), b = findP(G, e.data.b); if (!a || !b) return 'もう解決していた。'; if (i === 0) { b.unrest = Math.min(100, (b.unrest ?? 0) + 18); a.love = Math.min(100, (a.love ?? 40) + 5); return `${b.name}は納得していない様子だ。`; } if (i === 1) { a.unrest = Math.min(100, (a.unrest ?? 0) + 18); b.love = Math.min(100, (b.love ?? 40) + 5); return `${a.name}は納得していない様子だ。`; } a.unrest = Math.min(100, (a.unrest ?? 0) + 6); b.unrest = Math.min(100, (b.unrest ?? 0) + 6); for (const p of G.squad) p.trust = Math.min(100, (p.trust ?? 50) + 2); return 'チームの規律が引きしまった。'; } },
  { id: 'investor', w: 1, when: (G) => G.owner.money < 5000, make: (G) => { const v = Math.round(G.owner.sponsor * 0.25 / 100) * 100; return { id: 'investor', title: '出資の申し出', text: `お金が苦しいと聞いた投資家が、${man(v)}を出したいと言っている。ただ、オーナーはいい顔をしないだろう。`, choices: ['受ける', '断る'], data: { v } }; },
    apply: (G, e, i) => { if (i === 0) { earn(G, 'misc', Number(e.data.v)); G.mgrEval = clamp((G.mgrEval ?? 60) - 6, 0, 100); return `${man(Number(e.data.v))}を受け取った。オーナーの信頼が少し下がった。`; } G.mgrEval = clamp((G.mgrEval ?? 60) + 2, 0, 100); return 'オーナーは、あなたの判断を気に入ったようだ。'; } },
  { id: 'naming', w: 1, when: (G) => G.owner.fac.stadium >= 2 && !G.gm.flags.naming, make: (G) => { const v = Math.round(G.owner.sponsor * 0.18 / 100) * 100; return { id: 'naming', title: 'スタジアムの名前を売る話', text: `大きな会社が、スタジアムの名前をつける権利を${man(v)}で買いたいと言っている。昔からのファンは少しさびしがりそうだ。`, choices: ['売る', '断る'], data: { v } }; },
    apply: (G, e, i) => { if (i === 0) { earn(G, 'misc', Number(e.data.v)); G.gm.flags.naming = 1; G.owner.pop = Math.max(0, G.owner.pop - 1); return '名前の権利を売った。人気が少し下がった。'; } G.owner.pop = Math.min(100, G.owner.pop + 0.5); return 'ファンはクラブの決断を喜んでいる。'; } },
  { id: 'sns', w: 2, when: () => true, make: (G, r) => { const p = r.pick(G.squad); return { id: 'sns', title: 'SNSでの失言', text: `${p.name}の投稿が炎上している。対応を決めよう。`, choices: ['注意だけにする', '罰金と2週間の謹慎'], data: { pid: p.id } }; },
    apply: (G, e, i) => { const p = findP(G, e.data.pid); if (!p) return 'その選手は、もういない。'; if (i === 0) { G.owner.pop = Math.max(0, G.owner.pop - 1); return '人気が少し下がった。'; } p.inj = Math.max(p.inj, 2); p.injNew = true; p.unrest = Math.min(100, (p.unrest ?? 0) + 10); G.mgrEval = clamp((G.mgrEval ?? 60) + 2, 0, 100); return `${p.name}は2週間、試合に出られない。オーナーは毅然とした対応を評価した。`; } },
  { id: 'press', w: 2, when: (G) => G.week >= 9 && G.week <= 42, make: () => ({ id: 'press', title: '記者会見', text: '次の試合の前に、記者から「今年の目標は？」と聞かれた。', choices: ['「全部勝つ」と言い切る', '「一戦一戦、全力で」'], data: {} }),
    apply: (G, _e, i) => { if (i === 0) { for (const p of G.squad) p.trust = Math.min(100, (p.trust ?? 50) + 3); G.owner.pop = Math.min(100, G.owner.pop + 0.5); return '選手たちの士気が上がった。'; } G.mgrEval = clamp((G.mgrEval ?? 60) + 2, 0, 100); return 'オーナーは堅実な姿勢を評価している。'; } },
  { id: 'awakeHint', w: 2, when: (G) => G.squad.some((p) => p.age <= 23 && p.pot - ovr(p) >= 6), make: (G, r) => { const p = pickP(G, r, (x) => x.age <= 23 && x.pot - ovr(x) >= 6)!; return { id: 'awakeHint', title: '若手の居残り練習', text: `${p.name}（${p.age}歳）が、毎日遅くまで残って練習している。コーチは「つきあってやりたい」と言っている。`, choices: ['特別メニューを組ませる', 'ほどほどに休ませる'], data: { pid: p.id } }; },
    apply: (G, e, i, r) => { const p = findP(G, e.data.pid); if (!p) return 'その選手は、もういない。'; if (i === 0) { const b = ovr(p); for (let k = 0; k < 8; k++) p.a[k] = Math.min(99, p.a[k] + r.next() * 1.4); p.fat = Math.min(100, p.fat + 15); return `${p.name}の総合力が ${b} から ${ovr(p)} になった。少し疲れている。`; } p.fat = 0; return `${p.name}は元気いっぱいだ。`; } },
];
function rollEvent(G: GameState, r: Rng) {
  if (G.gm.event || G.week < 2 || r.next() > 0.2) return;
  const c = EVENTS.filter((e) => e.when(G)); if (!c.length) return;
  const tot = c.reduce((s, e) => s + e.w, 0); let x = r.next() * tot; let e = c[0];
  for (const d of c) { x -= d.w; if (x <= 0) { e = d; break; } }
  G.gm.event = e.make(G, r);
}
export function answerEvent(G: GameState, i: number): string {
  const e = G.gm.event; if (!e) return '';
  const d = EVENTS.find((x) => x.id === e.id); G.gm.event = null;
  if (!d) return '';
  const r = new Rng(G.rng); try { return d.apply(G, e, i, r); } finally { G.rng = r.s; }
}

/* ---------- 1週ごとの、PC版のしくみ ---------- */
/** advanceWeek のあとに呼ぶ。お知らせ（トースト）を返す */
export function afterWeek(G: GameState, res: WeekResult, att: number): Toast[] {
  const out: Toast[] = []; const g = G.gm; if (!g) return out;
  const r = new Rng(G.rng ^ 0x5bd1e995);
  try {
    if (res.match) myMatch(G, res.match, att, out);
    if (att > 0) { g.rec.maxAtt = Math.max(g.rec.maxAtt, att); const cap = [0, 5000, 9000, 15000, 24000, 36000][G.owner.fac.stadium] ?? 5000; if (att >= cap) g.flags.full = (g.flags.full ?? 0) + 1;
      if (g.ticket > tierTicket(tierOf(G)) * 1.5) G.owner.pop = Math.max(0, G.owner.pop - 0.3); }
    for (const e of res.report) if (e.awake) g.flags.awake = (g.flags.awake ?? 0) + 1;
    g.rec.maxPop = Math.max(g.rec.maxPop, G.owner.pop);
    g.mh.push([G.season, G.week, Math.round(G.owner.money)]); if (g.mh.length > 400) g.mh.splice(0, g.mh.length - 400);
    const wk = res.seasonEnd ? 0 : G.week - 1;
    for (const t of res.news) g.news.unshift({ s: res.seasonEnd ? G.season - 1 : G.season, w: res.seasonEnd ? 47 : wk, t });
    if (g.news.length > 160) g.news.length = 160;
    if (G.owner.debt > 0) g.flags.hadDebt = 1; else if (g.flags.hadDebt) g.flags.repaid = 1;
    /* いなくなった選手：殿堂に入るか */
    const here = new Set(G.squad.map((p) => p.id));
    for (const id in g.last) if (!here.has(+id)) { const p = g.last[id]; const h = hofCheck(G, +id, p, p.retiring ? '引退' : 'クラブを去った'); if (h) out.push({ kind: 'ach', title: '殿堂入り', text: `${h.name}がクラブの殿堂に入った（通算${h.apps}試合 ${h.goals}点）` }); }
    g.last = Object.fromEntries(G.squad.map((p) => [p.id, snapOf(p)]));
    /* ミッション（収支は12月に判定） */
    for (const m of g.missions) { if (m.done) continue; m.prog = missionProg(G, m); if (m.id !== 'profit' && m.prog >= m.target) payMission(G, m, out); }
    /* 12月の表彰の週：収支とシーズンの記録 */
    if (G.week === 45) {
      const net = seasonNet(G);
      for (const m of g.missions) if (m.id === 'profit' && !m.done && net > 0) payMission(G, m, out);
      if (net > 0) g.flags.profit = (g.flags.profit ?? 0) + 1;
      const last = G.history[G.history.length - 1];
      if (last && last.season === G.season) {
        const row = G.leagues[tierOf(G)].table[0];
        if (row.w * 3 + row.d >= 55) g.flags.pts55 = 1;
        if (last.rank === 1 && row.l === 0) g.flags.invincible = 1;
        const f = G.yearStart?.fans ?? [0, 0];
        g.log.push({ season: G.season, money: G.owner.money, pop: Math.round(G.owner.pop), profit: net, att: f[1] ? Math.round(f[0] / f[1]) : 0 });
      }
      if (G.squad.some((p) => p.seasonGoals >= 20)) g.flags.g20 = 1;
    }
    /* お金が足りない月は、オーナーの信頼が下がる */
    if (G.week % 4 === 3 && G.owner.money < 0) { G.mgrEval = clamp((G.mgrEval ?? 60) - 4, 0, 100); out.push({ kind: 'bad', title: 'オーナーの信頼が下がった', text: 'お金が足りず、給料の支払いが遅れている。' }); }
    /* 新しいシーズン：スポンサー・ミッション・記録の起点 */
    if (res.seasonEnd) {
      g.offers = sponsorOffers(G, r); g.sponsor = null;
      g.missions = makeMissions(G, r); g.ms = newMStat(G);
      g.ticket = clamp(g.ticket, 500, 9000);
    }
    if (G.week === 4 || G.week === 8 || G.week === 29) { if (g.tac.auto) autoXI(G); }
    cleanXI(G);
    checkAch(G, out);
    /* 解任 */
    if (DIFFS[g.diff].fire && (G.mgrEval ?? 60) <= 0 && !g.over) {
      g.over = { reason: (G.owner.money < 0 ? 'お金のやりくりに失敗し、' : '成績が目標に届かず、') + `オーナーの${g.owner}から解任を言い渡された。`, season: G.season };
    }
    if (!g.over) rollEvent(G, r);
  } finally { G.rng = r.s ^ 0x5bd1e995; }
  return out;
}
function myMatch(G: GameState, m: MatchView, att: number, out: Toast[]) {
  const g = G.gm; const meH = m.home.me; const my = meH ? m.score[0] : m.score[1], op = meH ? m.score[1] : m.score[0];
  let win = my > op, draw = my === op;
  if (m.pk) { win = meH ? m.pk[0] > m.pk[1] : m.pk[1] > m.pk[0]; draw = false; }
  if (win) { g.rec.streak++; g.flags.unb = (g.flags.unb ?? 0) + 1; g.ms.cur++; g.flags.wins = (g.flags.wins ?? 0) + 1; }
  else if (draw) { g.rec.streak = 0; g.flags.unb = (g.flags.unb ?? 0) + 1; g.ms.cur = 0; }
  else { g.rec.streak = 0; g.flags.unb = 0; g.ms.cur = 0; }
  g.rec.best = Math.max(g.rec.best, g.rec.streak); g.ms.best = Math.max(g.ms.best, g.ms.cur);
  g.rec.maxGoals = Math.max(g.rec.maxGoals, my);
  if (op === 0) g.ms.clean++;
  if (att > 0 && win) g.ms.homeWins++;
  /* 逆転：途中でリードされていたのに勝った */
  if (win) { let a = 0, b = 0, behind = false; for (const s of [...m.scorers].sort((x, y) => x.min - y.min)) { if (s.me) a++; else b++; if (a < b) behind = true; } if (behind) g.flags.comeback = (g.flags.comeback ?? 0) + 1; }
  if (/天皇杯/.test(m.title)) {
    const oppName = meH ? m.away.name : m.home.name; const oc = G.clubs.find((c) => c.name === oppName);
    if (win && oc && oc.tier < tierOf(G)) g.flags.giant = (g.flags.giant ?? 0) + 1;
    if (win && /準決勝/.test(m.title)) g.flags.final = 1;
  }
  for (const x of m.played) { const p = G.squad.find((q) => q.id === x.id); if (p) { p.capps = (p.capps ?? 0) + 1; p.cgoals = (p.cgoals ?? 0) + x.goals; } }
  g.ms.youthStarts += m.played.filter((x) => !x.sub && G.squad.find((p) => p.id === x.id)?.origin === 'ユース出身').length;
  const sp = g.sponsor;
  if (sp) { const b = (win ? sp.perWin : 0) + sp.perGoal * my; if (b) { earn(G, 'sponsor', b); } }
  void out;
}
export function noteBuy(G: GameState, fee: number) { if (G.gm) G.gm.rec.bigBuy = Math.max(G.gm.rec.bigBuy, fee); }
export function noteSell(G: GameState, fee: number) { if (G.gm) G.gm.rec.bigSell = Math.max(G.gm.rec.bigSell, fee); }
/** 契約を切る：のこりの契約の給料の半分を払う */
export const releaseCost = (p: Player) => Math.round(p.salary * Math.max(1, p.contract) * 0.5 / 10) * 10;
export function releasePlayer(G: GameState, id: number): string | null {
  const p = G.squad.find((x) => x.id === id); if (!p) return 'その選手はいない。';
  if (G.squad.length <= 16) return 'トップが16人より少なくなると、試合ができなくなる。';
  if (p.pos === 'GK' && G.squad.filter((x) => x.pos === 'GK').length <= 2) return 'キーパーが2人より少なくなる。';
  const c = releaseCost(p); spend(G, c);
  G.squad = G.squad.filter((x) => x !== p); p.contract = 0; p.listed = false; p.num = 0;
  if (G.owner.mk.free.length < 24) G.owner.mk.free.push(p);
  cleanXI(G);
  return null;
}
/** 先週の自分の選手を覚える（ゲームのはじめ・読みこみのとき） */
export function rememberSquad(G: GameState) { if (G.gm) G.gm.last = Object.fromEntries(G.squad.map((p) => [p.id, snapOf(p)])); }
export const isCampBoost = (G: GameState) => (G.gm?.flags.campBoost ?? -1) === absW(G);
