/* 試合（企画書 13-2：場面ごとの1対1を積み上げて、結果ができあがる）
   問107：90分を1分ずつ進める。毎分、ボールを持つ選手・パス・奪う・ドリブル・シュートを決め、
   決定機はこの流れの先に生まれる。数えた本物の数字から、10点満点の評価点を出す（問106・108） */
import { obeyChance, youthBonus, mgrView } from './bond';
import { Rng, clamp, sig } from './rng';
import { APTF, DEF, DRI, FORM, FORM_ATK, IQ, PAS, PHY, SCENE_BASE, SHT, SPD, STA, STYLES, type Pos, type StyleName } from './constants';
import { SP_MAP, type Step } from './data/specials';
import { ovr, posRating, teamStrength } from './player';
import type { Line, Manager, MatchView, Player, Token, ViewItem } from './types';
import { narrate } from './narrate';
import { resetPhrases, playLine, goalComment, LATE_TIE, pickFresh, fillLine, preTalk, halfTalk, fullTalk, type PlayKind, type Stakes, type Who, type MicLine } from './commentary';

export type Policy = '若手多め' | 'ふつう' | '勝ち優先';
export interface TeamIn { id: number; name: string; me: boolean; color: string; squad: Player[]; mgr: Manager; policy?: Policy; injMul?: number;
  /** オーナーの頼みを聞いたか（選手ごと。試合の中で決まる） */
  heard?: Map<number, boolean>;
  /** 監督の今月の方針（月の経営会議で話したこと）：守りを固める／攻めに出る */
  tilt?: 'def' | 'atk' | null;
  /** 問134：どの大会の試合か（出場停止を数える） */
  comp?: Comp;
  /** 問133：オーナーが頼んだキッカー（選手のid） */
  kickReq?: { ck?: number; fk?: number; pk?: number };
  /** 頼んだキッカーを、監督が聞いてくれたか（試合の前に決まる） */
  kickOk?: boolean;
  /** PC版：GM兼監督が決めた並び方・先発・戦い方（auto なら先発はヘッドコーチが選ぶ） */
  fixed?: { form: string; xi: (number | null)[]; auto: boolean; style: StyleName }; }
export type Comp = 'L' | 'C';
/** 問134：この大会で出場停止か */
export const banned = (p: Player, c: Comp) => (p.ban?.[c] ?? 0) > 0;
/** 問137：監督の采配の腕（0.2〜1）。給料（＝監督の格）と、その監督ごとのくせで決まる */
export const tacOf = (m: Manager) => { const q = clamp((m.salary - 1650) / 6000, 0, 1); const h = ((m.id * 7919) % 101) / 100; return clamp(0.3 + q * 0.45 + h * 0.25, 0.2, 1); };
/** 問136：監督の守りの好み（＋なら早めに逃げ切る、−ならもう1点を取りにいく） */
export const defLean = (m: Manager) => (m.style === 'ローブロック' || m.style === 'ロングカウンター' ? 1 : m.style === 'ポゼッション' || m.style === 'ゲーゲンプレス' ? -1 : 0);
export interface MatchOpts { record?: boolean; label?: string; big?: boolean; cup?: boolean; neutral?: boolean; title?: string;
  /** 実況の前ふり（問122・123）：順位などのひとことと、大事な試合か */
  pre?: { info: string; stakes: Stakes }; final?: boolean; }
export interface OnPl { p: Player; pos: Pos; sub: boolean; lr?: 'L' | 'R' | 'C'; }
/** 1試合の選手ごとの数字（問107） */
export interface St { pa: number; pc: number; tk: number; sh: number; ot: number; sv: number; dr: number; kp: number; as: number; g: number; dw: number; dl: number; ga: number; from: number; to: number;
  /** 問134・135：ファウル・イエロー・退場・PKを止めた・PKを与えた */
  fo?: number; yc?: number; rc?: number; psv?: number; pkc?: number }
const zeroSt = (from = 0): St => ({ pa: 0, pc: 0, tk: 0, sh: 0, ot: 0, sv: 0, dr: 0, kp: 0, as: 0, g: 0, dw: 0, dl: 0, ga: 0, from, to: 90 });
type Shot = { min: number; x: number; y: number; goal: boolean; ot: boolean; sp: boolean; who: string; how: string };
type Duel = { a: Player; d: Player; zone: string; w: number; l: number; said?: boolean };
type SubRec = { min: number; off: Player; on: Player; why: string };
interface Side {
  t: TeamIn; home: boolean; day: number; style: StyleName; form: string; on: OnPl[]; bench: Player[]; subs: number; goals: number; str: number; offs: OnPl[]; changed: boolean;
  st: Map<Player, St>;
  /** 問136：人数・点を取った直後の勢い（この分まで） */
  men: number; moUntil: number;
  /** 問134・135：ファウル・コーナー・オフサイド・カード */
  fouls: number; corners: number; offsides: number; cards: { min: number; p: Player; red: boolean }[];
  /** 問139：シュートの位置 */
  shots: Shot[];
  /** 問137：交代の回数（ハーフタイムは数えない）・交代の記録・最後に動いた分 */
  windows: number; subLog: SubRec[]; lastAct: number;
  /** 問138：1対1（攻める選手のid-守る選手のid）・2人で守っている場所 */
  duels: Map<string, Duel>; cover: Set<string>;
  /** 問133：キッカー */
  kick: { ck: Player | null; fk: Player | null; pk: Player | null };
  /** 問134：試合の前から出場停止だった選手 */
  banStart: Player[];
}
export interface Fire { sp: string; t: string; me: boolean; gk?: boolean; step?: string }
interface Chance {
  min: number; scene: string; k: number; att: OnPl; assist: OnPl | null; def: OnPl | null; ok: boolean; goal: boolean; save: boolean; shotAv: number; text: Line[];
  flow?: string | null; mem?: boolean; score?: [number, number]; turnover?: boolean;
}
interface Ev { t: number; kind: 'talk' | 'flow' | 'memo'; text: Line; me: boolean; who?: Who; after?: boolean; pre?: boolean; good?: boolean; hl?: boolean }

export interface MatchResult { score: [number, number]; pk: [number, number] | null; winner: 0 | 1 | null; view: MatchView; }

const MID: Pos[] = ['DM', 'CM', 'AM'];
const has = (pl: OnPl, s: string) => pl.p.sp.includes(s);
const hasBad = (pl: OnPl, s: string) => pl.p.bad.includes(s);
const anyOn = (side: Side, s: string) => side.on.some((x) => x.p.sp.includes(s));
const countOn = (side: Side, s: string) => side.on.filter((x) => x.p.sp.includes(s)).length;
const countBad = (side: Side, s: string) => side.on.filter((x) => x.p.bad.includes(s)).length;
export const mgrShort = (m: Manager) => m.name.split(' ')[0] + '監督';

/* ---------- 先発を選ぶ（監督が決める：企画書 13-3） ---------- */
export function youthBias(t: TeamIn): number {
  if (!t.me) return 1;
  const pol = t.policy === '若手多め' ? 1.6 : t.policy === '勝ち優先' ? 0.6 : 1;
  return pol * t.mgr.youth;
}
/** assume：試合前の画面の「予定」。頼みは全部聞いてもらえたとして組む（問109） */
export function pickLineup(r: Rng, t: TeamIn, form: string, assume = false): { lineup: OnPl[]; bench: Player[] } {
  let sq = t.squad.filter((p) => p.inj === 0 && !banned(p, t.comp ?? 'L'));
  const slots = FORM[form]; const used = new Set<number>(); const lineup: OnPl[] = [];
  const yb = youthBias(t);
  /* オーナーの頼み（問93）：1人ずつ、聞いてくれるかが決まる。頼みが多いほど聞いてもらいにくい */
  const heard = new Map<number, boolean>();
  if (t.me) {
    const ords = t.squad.filter((p) => p.ord && p.inj === 0); const ch = obeyChance(t.mgr.obey, ords.length);
    for (const p of ords) heard.set(p.id, assume || r.next() < ch);
    const out = sq.filter((p) => p.ord?.kind === 'bench' && heard.get(p.id));
    /* 人が足りないときは、使わないでと言われた選手も出す */
    if (sq.length - out.length >= slots.length + 2) sq = sq.filter((p) => !out.includes(p));
    else for (const p of out) heard.set(p.id, false);
  }
  t.heard = heard;
  const h = (p: Player) => heard.get(p.id) === true;
  /* 枠と選手の組み合わせを全部くらべて、いちばん合う組から決めていく（前から順に埋めると、
     いい中盤の選手が先にサイドバックの枠にとられ、適性のない場所で使われることがあった） */
  const score = (p: Player, pos: Pos) => {
    let s = posRating(p, pos) + p.cond * 1.5 - p.fat * 0.06;
    s += t.me ? youthBonus(p.age, yb) : p.age <= 21 ? 2.2 * (yb - 1) * 3 + (yb > 1 ? 1.5 : 0) : 0;
    if (t.me) s += mgrView(p, t.mgr);
    if (h(p) && p.ord!.kind === 'start') s += 8;
    if (h(p) && p.ord!.kind === 'pos') s += p.ord!.pos === pos ? 14 : -6;
    if (h(p) && p.ord!.kind === 'sub') s -= 30;
    return s;
  };
  const pairs: { i: number; p: Player; s: number }[] = [];
  slots.forEach((pos, i) => { for (const p of sq) pairs.push({ i, p, s: score(p, pos) }); });
  pairs.sort((a, b) => b.s - a.s);
  const filled: (Player | null)[] = slots.map(() => null);
  for (const x of pairs) { if (filled[x.i] || used.has(x.p.id)) continue; filled[x.i] = x.p; used.add(x.p.id); }
  slots.forEach((pos, i) => { const p = filled[i]; if (p) lineup.push({ p, pos, sub: false }); });
  return { lineup, bench: sq.filter((p) => !used.has(p.id)) };
}
/** PC版：GMが決めた先発。出られない選手の枠は、残りから一番合う選手で埋める */
export function fixedLineup(t: TeamIn, form: string, xi: (number | null)[]): { lineup: OnPl[]; bench: Player[] } {
  const sq = t.squad.filter((p) => p.inj === 0 && !banned(p, t.comp ?? 'L'));
  const slots = FORM[form]; const used = new Set<number>(); const filled: (Player | null)[] = slots.map(() => null);
  slots.forEach((_, i) => { const id = xi[i]; const p = id != null ? sq.find((x) => x.id === id) : undefined; if (p && !used.has(p.id)) { filled[i] = p; used.add(p.id); } });
  const pairs: { i: number; p: Player; s: number }[] = [];
  slots.forEach((pos, i) => { if (!filled[i]) for (const p of sq) if (!used.has(p.id)) pairs.push({ i, p, s: posRating(p, pos) + p.cond * 1.5 - p.fat * 0.06 }); });
  pairs.sort((a, b) => b.s - a.s);
  for (const x of pairs) { if (filled[x.i] || used.has(x.p.id)) continue; filled[x.i] = x.p; used.add(x.p.id); }
  const lineup: OnPl[] = []; slots.forEach((pos, i) => { const p = filled[i]; if (p) lineup.push({ p, pos, sub: false }); });
  return { lineup, bench: sq.filter((p) => !used.has(p.id)) };
}
/** PC版：攻撃的＝1・守備的＝−1 */
const tv = (s: { t: TeamIn }) => (s.t.tilt === 'atk' ? 1 : s.t.tilt === 'def' ? -1 : 0);
export function chooseForm(m: Manager, myStr: number, oppStr: number, squad?: Player[], tilt?: 'def' | 'atk' | null): string {
  const f = m.forms; const diff = myStr - oppStr + (tilt === 'atk' ? 4 : tilt === 'def' ? -4 : 0);
  const byAtk = [...f].sort((x, y) => FORM_ATK[y] - FORM_ATK[x]);
  /* そろっている選手：ケガでFWが足りないときは、FWの少ない形にする */
  if (squad) {
    const fw = squad.filter((p) => p.inj === 0 && (p.apt.ST >= 2 || p.apt.WG >= 2)).length;
    if (fw < 3) { const few = [...f].sort((x, y) => FORM[x].filter((p) => p === 'ST' || p === 'WG').length - FORM[y].filter((p) => p === 'ST' || p === 'WG').length); return few[0]; }
  }
  if (diff < -3) return byAtk[byAtk.length - 1];
  if (diff > 3) return byAtk[0];
  return f[0];
}

/* ---------- 力の計算 ---------- */
function eff(side: Side, pl: OnPl, i: number, t: number, scene: string): number {
  const p = pl.p; let v = p.a[i] * APTF[p.apt[pl.pos]];
  v += p.cond * 2.2;
  const late = Math.max(0, t - 45) / 45;
  let staDrop = ((100 - p.a[STA]) / 100) * 7 * late;
  if (has(pl, 'エンジン')) staDrop *= 0.4;
  if (hasBad(pl, 'スタミナ切れ')) staDrop *= 1.8;
  v -= staDrop + p.fat * 0.04;
  if (t <= 15 && has(pl, '立ち上がりに強い')) v += 3;
  if (t <= 15 && hasBad(pl, 'スロースターター')) v -= 4;
  if (side.home) v += 2;
  v += side.day;
  if (p.age <= 23 && p.exp < 40 && !has(pl, '吸収力')) v -= 4 * (1 - p.exp / 40);
  if (STYLES[side.style].key.includes(i)) v += 1.5;
  if (side.t.tilt === 'atk' && (i === SHT || i === DRI)) v += 1.2;
  if (side.t.tilt === 'def' && (i === DEF || i === IQ)) v += 1.2;
  if (pl.sub && has(pl, 'スーパーサブ')) v += 3;
  if (hasBad(pl, '判断が遅い') && i === IQ && (scene === 'combo' || scene === 'counter')) v -= 5;
  if (hasBad(pl, '空中戦が苦手') && i === PHY && (scene === 'cross' || scene === 'setpiece' || scene === 'longball')) v -= 6;
  return v;
}
const gkOf = (s: Side) => s.on.find((x) => x.pos === 'GK') || s.on[0];
function byPos(side: Side, arr: Pos[]): OnPl[] {
  const r = side.on.filter((x) => arr.includes(x.pos));
  return r.length ? r : side.on.filter((x) => x.pos !== 'GK');
}
type Role = 'shoot' | 'assist' | 'def' | 'run';
function wPlayer(r: Rng, list: OnPl[], attr: number, role: Role, styleSp?: string): OnPl {
  return r.wpick(list.map((x) => {
    let w = Math.pow(Math.max(5, x.p.a[attr]), 2);
    if (styleSp && has(x, styleSp)) w *= 2.2;
    if (has(x, '点取り屋')) w *= role === 'shoot' ? 1.6 : role === 'assist' ? 0.6 : 1;
    if (has(x, 'チャンスメーカー')) w *= role === 'assist' ? 1.6 : role === 'shoot' ? 0.6 : 1;
    if (has(x, '守備職人')) w *= role === 'def' ? 3 : 0.3;
    if (has(x, '2列目からの飛び出し') && (x.pos === 'AM' || x.pos === 'CM') && (role === 'shoot' || role === 'run')) w *= 2;
    if (DOMW) w *= DOMW(x);
    return [x, w] as [OnPl, number];
  }));
}
function pickDef(r: Rng, side: Side, arr: Pos[]): OnPl {
  const list = byPos(side, arr);
  /* 守備職人は相手の決定機で必ず守りに関わる */
  const pro = list.filter((x) => has(x, '守備職人'));
  if (pro.length && r.next() < 0.7) return r.pick(pro);
  return r.pick(list);
}
function mid(s: Side): number {
  const m = s.on.filter((x) => MID.includes(x.pos)); const arr = m.length ? m : s.on;
  return arr.reduce((t, x) => t + ((x.p.a[PAS] + x.p.a[IQ] + x.p.a[DEF] * 0.6) / 2.6) * APTF[x.p.apt[x.pos]], 0) / arr.length + (anyOn(s, '広い視野') ? 2 : 0);
}

/* ---------- 試合 ---------- */
const DEFP: Pos[] = ['CB', 'SB', 'DM'];
const ATKP: Pos[] = ['ST', 'WG', 'AM'];
/** 問138：左右をわりふる（SB・WG は1人目が右、2人目が左） */
function assignLR(s: Side) {
  const seen: Record<string, number> = {};
  for (const x of s.on) { if (x.pos === 'SB' || x.pos === 'WG') { const n = (seen[x.pos] = (seen[x.pos] ?? 0) + 1); x.lr = n === 1 ? 'R' : 'L'; } else x.lr = 'C'; }
}
/** 問138：向き合う相手（右のWGには、相手の左のSB） */
function opponentOf(D: Side, a: OnPl): OnPl | null {
  const opp = (pos: Pos[], lr: 'L' | 'R' | 'C' | null) => D.on.find((y) => pos.includes(y.pos) && (lr == null || y.lr === lr)) ?? null;
  const flip = a.lr === 'R' ? 'L' : a.lr === 'L' ? 'R' : 'C';
  if (a.pos === 'WG') return opp(['SB'], flip) ?? opp(['SB'], null) ?? opp(['CB'], null);
  if (a.pos === 'SB') return opp(['WG'], flip) ?? opp(['WG'], null);
  if (a.pos === 'ST' || a.pos === 'AM') return opp(['CB'], null) ?? opp(['DM'], null);
  if (a.pos === 'CB') return opp(['ST'], null);
  if (MID.includes(a.pos)) return opp(MID, null);
  return null;
}
const zoneOf = (a: OnPl): string => (a.pos === 'WG' || a.pos === 'SB' ? (a.lr === 'L' ? 'L' : 'R') : a.pos === 'ST' || a.pos === 'CB' || a.pos === 'AM' ? 'C' : a.pos === 'GK' ? 'G' : 'M');
const ZONE_NAME: Record<string, string> = { R: '右サイド', L: '左サイド', C: 'ゴール前の競り合い', M: '中盤', G: 'シュート対キーパー' };
/** 問138：その場所で、どれだけ勝っているか（−1〜1） */
function dom(s: Side, zone: string): number { let w = 0, l = 0; for (const d of s.duels.values()) if (d.zone === zone) { w += d.w; l += d.l; } return (w - l) / (w + l + 5); }
let DOMW: ((x: OnPl) => number) | null = null;

export function simulateMatch(r: Rng, home: TeamIn, away: TeamIn, opts: MatchOpts = {}): MatchResult {
  const comp: Comp = opts.cup ? 'C' : 'L';
  home.comp = comp; away.comp = comp;
  const sides: Side[] = [home, away].map((t, ix) => {
    const myS = teamStrength(t.squad), opS = teamStrength((ix ? home : away).squad);
    const fx = t.fixed;
    const form = fx ? fx.form : chooseForm(t.mgr, myS, opS, t.squad.filter((p) => !banned(p, comp)), t.tilt);
    const { lineup, bench } = fx && !fx.auto ? fixedLineup(t, form, fx.xi) : pickLineup(r, t, form);
    if (t.me && t.kickReq) t.kickOk = fx ? true : r.next() < Math.min(0.95, obeyChance(t.mgr.obey, 1) + 0.15);
    const s: Side = { t, home: ix === 0 && !opts.neutral, day: (r.next() - 0.5) * 8, style: fx ? fx.style : t.mgr.style, form, on: lineup, bench, subs: 0, goals: 0, str: myS, offs: [], changed: !!fx, st: new Map(lineup.map((x) => [x.p, zeroSt()])),
      men: 11, moUntil: -1, fouls: 0, corners: 0, offsides: 0, cards: [], shots: [], windows: 0, subLog: [], lastAct: 0, duels: new Map(), cover: new Set(), kick: { ck: null, fk: null, pk: null }, banStart: t.squad.filter((p) => banned(p, comp)) };
    assignLR(s); s.kick = chooseKickers(r, s); return s;
  });
  const ev: Ev[] = []; const log: Chance[] = [];
  const mic = home.me || away.me; resetPhrases();
  const poss: [number, number] = [0, 0]; let possHalf: [number, number] = [0, 0]; let lateTie = false;
  const T = (side: Side, pl: OnPl | Player): Token => ({ t: ('p' in pl ? pl.p : pl).name, me: side.t.me });
  const C = (side: Side): Token => ({ t: side.t.name, me: side.t.me });
  const MG = (side: Side): Token => (side.t.me ? { t: side.t.fixed ? side.t.mgr.name.split(' ')[0] + 'ヘッドコーチ' : mgrShort(side.t.mgr), me: true } : { t: side.t.name + 'の監督', me: false });
  const kOf = (s: Side) => (s === sides[0] ? 0 : 1) as 0 | 1;
  /* 問139：流れのグラフ（1分ごと・ホームから見て押していれば＋）と印 */
  const pg: number[] = Array(92).fill(0); const marks: { min: number; kind: 'goal' | 'red' | 'sub'; side: 0 | 1 }[] = [];
  const push = (s: Side, mm: number, v: number) => { pg[Math.min(91, Math.max(0, mm))] += s === sides[0] ? v : -v; };
  const injured = new Map<Player, number>();
  let lastGoal = -99;
  for (const s of sides) for (const x of s.on) if (s.t.me && x.p.apps === 0) ev.push({ t: 1, kind: 'memo', text: [T(s, x), ' がプロとして初めてピッチに立つ。'], me: true });
  /* 問122 C：試合の前の実況と解説 */
  if (mic) {
    const ms = sides.find((x) => x.t.me)!; const ace = [...ms.on].filter((x) => x.pos !== 'GK').sort((a, b) => b.p.seasonGoals - a.p.seasonGoals || ovr(b.p) - ovr(a.p))[0];
    for (const m of preTalk(r, C(sides[0]), C(sides[1]), opts.pre?.info ?? '', opts.pre?.stakes ?? { kind: '' }, ace ? { name: T(ms, ace), goals: ace.p.seasonGoals } : null)) ev.push({ t: 0, kind: 'talk', me: false, text: m.line, who: m.who, pre: true, hl: true });
  }
  ev.push({ t: 0, kind: 'talk', me: false, text: ['キックオフ。', C(sides[0]), ' は ', sides[0].form, '、', C(sides[1]), ' は ', sides[1].form, ' で入った。'] });
  const pending: { k: number; min: number; scene?: string }[] = [];

  /* ---- 交代（問137） ---- */
  const benchFor = (s: Side, inPos: Pos[], youth = false) => {
    const pool = s.bench.filter((b) => b.inj === 0 && !injured.has(b) && inPos.some((q) => b.apt[q] >= 1));
    if (!pool.length) return null;
    const best = (p: Player) => Math.max(...inPos.map((q) => posRating(p, q)));
    const subOrd = (p: Player) => (s.t.me && p.ord?.kind === 'sub' && s.t.heard?.get(p.id) ? 40 : 0);
    const score = (p: Player) => best(p) + (youth && p.age <= 21 ? 12 : 0) + (p.sp.includes('スーパーサブ') ? 3 : 0) - p.fat * 0.05 + subOrd(p);
    const on = pool.sort((x, y) => score(y) - score(x))[0];
    const pos = inPos.slice().sort((a, b) => posRating(on, b) - posRating(on, a))[0];
    return { on, pos };
  };
  const doSub = (s: Side, off: OnPl, inPos: Pos[], mm: number, why: string, youth = false): boolean => {
    if (s.subs >= 5 || !s.on.includes(off)) return false;
    const b = benchFor(s, inPos, youth); if (!b) return false;
    s.bench = s.bench.filter((x) => x !== b.on);
    const lr = b.pos === off.pos ? off.lr : b.pos === 'WG' || b.pos === 'SB' ? (s.on.some((x) => x.pos === b.pos && x.lr === 'R') ? 'L' : 'R') : 'C';
    const idx = s.on.indexOf(off); s.on[idx] = { p: b.on, pos: b.pos, sub: true, lr }; s.offs.push(off); s.subs++; subMin(s, off.p, b.on, mm);
    s.subLog.push({ min: mm, off: off.p, on: b.on, why }); marks.push({ min: mm, kind: 'sub', side: kOf(s) });
    if (s.kick.ck === off.p || s.kick.fk === off.p || s.kick.pk === off.p) s.kick = chooseKickers(r, s);
    ev.push({ t: mm, kind: 'talk', me: false, text: ['交代。', T(s, off), ' に代わって、', { t: b.on.name, me: s.t.me }, ' が入る。', WHY_LINE[why] ?? ''] });
    if (s.t.me && b.on.apps === 0) ev.push({ t: mm, kind: 'memo', me: true, text: [{ t: b.on.name, me: true }, ' が途中出場。これがプロ初出場だ。'] });
    return true;
  };
  const formTo = (s: Side, kind: 'atk' | 'def', mm: number) => {
    if (s.changed) return;
    const f = [...s.t.mgr.forms].sort((x, y) => kind === 'atk' ? FORM_ATK[y] - FORM_ATK[x] : FORM_ATK[x] - FORM_ATK[y])[0];
    if (f === s.form || (kind === 'def' && FORM_ATK[f] >= FORM_ATK[s.form] - 1)) return;
    s.form = f; s.changed = true;
    ev.push({ t: mm, kind: 'flow', me: s.t.me, text: [MG(s), kind === 'atk' ? ' が動いた。' + f + ' に切りかえて、攻めに出る。' : ' は ' + f + ' に変えて、リードを守りにいく。'] });
  };
  /** 1分ごとに、監督が動くかを決める（腕がいいほど、理由が出てから早く動く） */
  const mgrTick = (s: Side, o: Side, mm: number) => {
    if (s.subs >= 5 || (mm !== 46 && s.windows >= 3)) return;
    if (mm !== 46 && mm - s.lastAct < 4) return;
    const tac = tacOf(s.t.mgr); const lead = s.goals - o.goals;
    const lean = defLean(s.t.mgr) + (s.t.tilt === 'def' ? 1 : s.t.tilt === 'atk' ? -1 : 0);
    const justGoal = mm - lastGoal <= 3;
    const reasons: { why: string; off: OnPl; inPos: Pos[]; form?: 'atk' | 'def'; youth?: boolean }[] = [];
    const outf = s.on.filter((x) => x.pos !== 'GK' && !injured.has(x.p));
    const tiredOf = (x: OnPl) => x.p.fat * 0.4 + (100 - x.p.a[STA]) * 0.7 * Math.max(0, mm - 40) / 50 - x.p.cond * 4 - (x.sub ? 30 : 0);
    const byTired = [...outf].sort((a, b) => tiredOf(b) - tiredOf(a));
    /* オーナーの「途中からでも使ってほしい」（問93）：聞いてくれたら、得意なポジションの選手と代える */
    if (s.t.me && mm >= 55) for (const on of s.bench.filter((b) => b.inj === 0 && b.ord?.kind === 'sub' && s.t.heard?.get(b.id))) {
      const off = byTired.find((x) => on.apt[x.pos] >= 2); if (off) { reasons.push({ why: 'オーナーの頼み', off, inPos: [off.pos] }); break; }
    }
    if (lead < 0 && mm >= 62 - tac * 14 - (justGoal ? 4 : 0)) {
      const d = [...outf].filter((x) => DEFP.includes(x.pos) && !(x.pos === 'CB' && outf.filter((y) => y.pos === 'CB').length <= 2 && lead > -2)).sort((a, b) => ovr(a.p) - ovr(b.p))[0] ?? outf.filter((x) => x.pos === 'DM' || x.pos === 'CM')[0];
      if (d) reasons.push({ why: '点を取りにいく', off: d, inPos: ATKP, form: 'atk' });
    }
    if (lead === 1 && mm >= 74 - lean * 6 - tac * 4 && (lean >= 0 || mm >= 84)) {
      const a = [...outf].filter((x) => ATKP.includes(x.pos)).sort((x, y) => tiredOf(y) - tiredOf(x))[0];
      if (a) reasons.push({ why: '守りきる', off: a, inPos: ['DM', 'CB', 'SB'], form: 'def' });
    }
    const yel = outf.find((x) => DEFP.includes(x.pos) && (stOf(s, x.p).yc ?? 0) >= 1);
    if (yel && mm >= 52 && r.next() < 0.3 + tac * 0.4) reasons.push({ why: 'イエロー', off: yel, inPos: [yel.pos] });
    if (mm >= 58 && byTired[0] && tiredOf(byTired[0]) > 24 - tac * 6) reasons.push({ why: '疲れ', off: byTired[0], inPos: [byTired[0].pos] });
    if ((lead >= 2 || (mm >= 75 && Math.abs(lead) >= 2)) && r.next() < 0.3 * youthBias(s.t) && byTired[0]) reasons.push({ why: '若手', off: byTired[0], inPos: [byTired[0].pos], youth: true });
    if (!reasons.length) return;
    const pAct = mm === 46 ? 0.15 + tac * 0.35 : 0.05 + tac * 0.2 + (mm >= 80 ? 0.15 : 0);
    if (r.next() > pAct) return;
    let n = 0; const used = new Set<OnPl>();
    for (const x of reasons) {
      if (n >= 2 || used.has(x.off)) continue;
      if (x.form) formTo(s, x.form, mm);
      if (doSub(s, x.off, x.inPos, mm, x.why, x.youth)) { n++; used.add(x.off); }
    }
    if (!n) return;
    if (mm !== 46) s.windows++;
    s.lastAct = mm;
    if (mic && r.next() < 0.5) {
      const late = lead < 0 && mm >= 80 && s.subs <= n;
      const good = tac >= 0.72 && mm < 75;
      if (late) ev.push({ t: mm, kind: 'talk', me: false, text: [pickFresh(r, ANA_LATE)], who: '解説', after: true });
      else if (good) ev.push({ t: mm, kind: 'talk', me: false, text: [pickFresh(r, ANA_GOOD)], who: '解説', after: true });
    }
  };
  /* ---- 退場（問134） ---- */
  const sendOff = (D: Side, pl: OnPl, mm: number, second: boolean) => {
    if (!D.on.includes(pl)) return;
    const st = stOf(D, pl.p); st.rc = 1; st.to = mm;
    D.on = D.on.filter((x) => x !== pl); D.offs.push(pl); D.men--; D.cards.push({ min: mm, p: pl.p, red: true }); marks.push({ min: mm, kind: 'red', side: kOf(D) });
    ev.push({ t: mm, kind: 'flow', me: D.t.me, text: second ? ['2枚目のイエロー。', T(D, pl), ' は退場だ。', C(D), ' は10人になった。'] : ['レッドカード！', T(D, pl), ' は一発退場。', C(D), ' は10人で戦うことになった。'] });
    if (D.kick.ck === pl.p || D.kick.fk === pl.p || D.kick.pk === pl.p) D.kick = chooseKickers(r, D);
    /* 立て直し：キーパーなら控えのキーパーを入れる。守りの選手なら、攻めの選手を下げて守りを足す */
    if (pl.pos === 'GK') {
      const off = [...D.on].filter((x) => ATKP.includes(x.pos)).sort((a, b) => ovr(a.p) - ovr(b.p))[0] ?? D.on.filter((x) => x.pos !== 'GK')[0];
      if (!(off && doSub(D, off, ['GK'], mm, '退場'))) { const f = [...D.on].sort((a, b) => b.p.height - a.p.height)[0]; if (f) f.pos = 'GK'; }
    } else if (DEFP.includes(pl.pos) && D.subs < 5 && D.windows < 3) {
      const off = [...D.on].filter((x) => ATKP.includes(x.pos)).sort((a, b) => ovr(a.p) - ovr(b.p))[0];
      if (off && doSub(D, off, [pl.pos], mm, '退場')) { D.windows++; D.lastAct = mm; }
    }
  };
  /* ---- ファウル・カード・セットプレー（問133・134） ---- */
  const foul = (A: Side, D: Side, h: OnPl, d: OnPl, mm: number, i: number, beaten: boolean): boolean => {
    if (!D.on.includes(d) || d.pos === 'GK') return false;
    let pf = (beaten ? 0.25 : 0.09) * ((stOf(D, d.p).yc ?? 0) ? 0.5 : 1) * (D.style === 'ゲーゲンプレス' ? 1.2 : D.style === 'ローブロック' ? 0.9 : 1) * (DEFP.includes(d.pos) ? 1.15 : 0.9);
    if (beaten && fv(A, h, SPD, mm) - fv(D, d, SPD, mm) > 6) pf *= 1.5;
    if (hasBad(d, 'ラフプレイヤー')) pf *= 1.4; if (has(d, 'クリーンディフェンス')) pf *= 0.6;
    if (r.next() >= pf) return false;
    D.fouls++; const st = stOf(D, d.p); st.fo = (st.fo ?? 0) + 1;
    const hot = (opts.big ? 1.3 : 1) * (mm >= 70 && D.goals < A.goals ? 1.35 : 1) * (beaten ? 1.5 : 0.8);
    const py = TUNE.yel * hot * ((st.yc ?? 0) ? 0.55 : 1) * (hasBad(d, 'ラフプレイヤー') ? 1.6 : 1) * (has(d, 'クリーンディフェンス') ? 0.5 : 1);
    if (r.next() < 0.0015 * hot * (hasBad(d, 'ラフプレイヤー') ? 2 : 1)) sendOff(D, d, mm, false);
    else if (r.next() < py) {
      st.yc = (st.yc ?? 0) + 1; D.cards.push({ min: mm, p: d.p, red: false });
      if (st.yc >= 2) sendOff(D, d, mm, true);
      else if (mic && r.next() < 0.6) ev.push({ t: mm, kind: 'talk', me: false, text: fillY(r, T(D, d), T(A, h)) });
    }
    /* ゴールに近い場所なら、セットプレー */
    if ((FWD.includes(h.pos) && i >= 1) || i >= 4) {
      const u = r.next(); const k = kOf(A);
      if (u < TUNE.pkP) { pending.push({ k, min: mm, scene: 'pk' }); st.pkc = (st.pkc ?? 0) + 1; }
      else if (u < TUNE.pkP + TUNE.fkP) pending.push({ k, min: mm, scene: 'fk' });
      else if (u < TUNE.pkP + TUNE.fkP + 0.25) pending.push({ k, min: mm, scene: 'fkcross' });
    }
    return true;
  };
  const corner = (A: Side, mm: number) => { A.corners++; push(A, mm, 0.4); if (r.next() < TUNE.ckP) pending.push({ k: kOf(A), min: mm, scene: 'corner' }); };
  const offside = (A: Side, mm: number) => { A.offsides++; void mm; };
  const duel = (A: Side, D: Side, a: OnPl, d: OnPl, win: boolean, mm: number) => {
    const key = `${a.p.id}-${d.p.id}`; let x = A.duels.get(key);
    if (!x) { x = { a: a.p, d: d.p, zone: zoneOf(a), w: 0, l: 0 }; A.duels.set(key, x); }
    if (win) x.w++; else x.l++;
    /* 問138：はっきり勝っていたら、実況が言う（1つの対決で1回だけ） */
    if (mic && !x.said && x.w + x.l >= 6 && (x.w >= x.l * 3 || x.l >= x.w * 3) && x.zone !== 'M') {
      x.said = true; const winA = x.w > x.l;
      ev.push({ t: mm, kind: 'talk', me: false, text: fillDuel(r, ZONE_NAME[x.zone], winA ? T(A, a) : T(D, d), winA ? T(D, d) : T(A, a)), who: '実況' });
    }
  };
  const shotH = (A: Side, h: OnPl, mm: number, ot: boolean) => { A.shots.push({ min: mm, ...shotXY(r, 'flow', kOf(A)), goal: false, ot, sp: false, who: h.p.name, how: 'シュート' }); push(A, mm, 0.6); if (!ot && r.next() < 0.5) corner(A, mm); };
  const hooks: Hooks = { foul, corner, offside, duel, pair: opponentOf, shot: shotH };

  for (let blk = 0; blk < 6; blk++) {
    const t0 = blk * 15;
    if (blk === 3) {
      ev.push({ t: 45, kind: 'talk', me: false, text: ['前半終了。', C(sides[0]), ' ', String(sides[0].goals), ' - ', String(sides[1].goals), ' ', C(sides[1]), '。'] });
      if (mic) {
        possHalf = [...poss] as [number, number]; const tot = Math.max(1, poss[0] + poss[1]);
        const shots = sides.map((x) => [...x.st.values()].reduce((t, y) => t + y.sh, 0)) as [number, number];
        let star: { name: Token; why: string } | null = null; let bs = 2.5;
        for (const x of sides) for (const [p, y] of x.st) { const v = y.g * 3 + y.as * 2 + y.kp + y.tk * 0.35 + y.dr * 0.45 + y.sv * 0.6; if (v > bs) { bs = v; star = { name: { t: p.name, me: x.t.me }, why: y.g ? 'もう点も取りました。' : y.sv >= 2 ? 'キーパーが当たっていますね。' : y.tk >= 4 ? '何度もボールを奪っています。' : y.dr >= 3 ? 'ドリブルで仕掛け続けています。' : y.kp >= 2 ? 'チャンスを何度も作っています。' : 'ボールがよく集まっています。' }; } }
        for (const m of halfTalk(r, { score: [sides[0].goals, sides[1].goals], poss: [Math.round((poss[0] / tot) * 100), 100 - Math.round((poss[0] / tot) * 100)], shots, names: [C(sides[0]), C(sides[1])], star })) ev.push({ t: 45, kind: 'talk', me: false, text: m.line, who: m.who, after: true, hl: true });
      }
      ev.push({ t: 46, kind: 'talk', me: false, text: [r.pick(['後半が始まる。', '後半のキックオフ。', '選手たちがピッチにもどってきた。後半開始。'])] });
      for (let k = 0; k < 2; k++) mgrTick(sides[k], sides[1 - k], 46);
    }
    const mH = mid(sides[0]), mA = mid(sides[1]);
    const st0 = STYLES[sides[0].style], st1 = STYLES[sides[1].style];
    const lazy = (s: Side) => countBad(s, '守備をサボる') * 0.12;
    const share = sig((mH - mA) / 11 + (st0.chanceAdj - st1.chanceAdj) * 0.15 + (st1.oppChance - st0.oppChance) * 0.06 + (FORM_ATK[sides[0].form] - FORM_ATK[sides[1].form]) * 0.05 + 0.08 + lazy(sides[1]) - lazy(sides[0]) + (tv(sides[0]) - tv(sides[1])) * 0.04);
    const total = TUNE.base + (st0.chanceAdj + st1.chanceAdj) * 0.12 + (st0.oppChance + st1.oppChance) * 0.1 + (FORM_ATK[sides[0].form] + FORM_ATK[sides[1].form]) * 0.06 + (tv(sides[0]) + tv(sides[1])) * 0.12 + (blk >= 4 && sides[0].goals !== sides[1].goals ? TUNE.late : 0);
    const n = Math.max(0, Math.round(total + (r.next() - 0.5) * 1.6));
    {
      const k = share >= 0.5 ? 0 : 1; const S = sides[k], O = sides[1 - k];
      const mm = S.on.filter((x) => MID.includes(x.pos)); const m1 = mm.length ? r.pick(mm) : r.pick(S.on); const o1 = r.pick(O.on.filter((x) => x.pos !== 'GK'));
      const talk: Line = Math.abs(share - 0.5) > 0.08
        ? r.pick<Line>([[C(S), ' がボールを持つ時間が長い。', T(S, m1), ' を中心に、落ち着いてパスを回す。'], [T(S, m1), ' が中盤で前を向く。', C(O), ' は自陣で耐える時間だ。'], [C(O), ' はなかなか前に出られない。', T(O, o1), ' が声を出して守りを整える。'], [C(S), ' が押しこむ。', C(O), ' は守りの人数をそろえて、すきを見せない。']])
        : r.pick<Line>([['一進一退の攻防。', T(S, m1), ' と ', T(O, o1), ' が中盤で激しくぶつかる。'], ['どちらも決め手を欠いたまま、時間が過ぎていく。'], ['ボールが行ったり来たり。', T(S, m1), ' が落ち着かせようと、何度も手で合図を送る。']]);
      ev.push({ t: t0 + r.int(2, 13), kind: 'talk', me: false, text: talk });
    }
    const minutes: { k: number; min: number; scene?: string }[] = [];
    for (let c = 0; c < n; c++) minutes.push({ k: -1, min: t0 + r.int(1, 15) });
    minutes.sort((x, y) => x.min - y.min);
    const press = sides.map((s) => { const f = s.on.filter((x) => x.pos !== 'GK'); return f.reduce((t, x) => t + x.p.a[DEF] * 0.6 + x.p.a[IQ] * 0.4, 0) / Math.max(1, f.length); });
    let ci = 0;
    for (let mm = t0 + 1; mm <= t0 + 15; mm++) {
      if (mm >= 55 && mm <= 88) for (let k = 0; k < 2; k++) mgrTick(sides[k], sides[1 - k], mm);
      /* 問136：この分の押し合い（点の直後の勢い・リード後の守り・終盤の猛攻・人数） */
      const adj = (s: Side, o: Side) => {
        let v = mm <= s.moUntil ? 0.12 : 0; const lead = s.goals - o.goals;
        const lean = defLean(s.t.mgr) + (s.t.tilt === 'def' ? 1 : s.t.tilt === 'atk' ? -1 : 0);
        if (lead > 0 && mm >= 60) v -= (0.05 + lean * 0.03) * Math.min(1, (mm - 55) / 30);
        if (lead < 0 && mm >= 68) v += 0.11 + Math.min(0.06, -lead * 0.02);
        v -= (11 - s.men) * 0.08;
        v += (dom(s, 'R') + dom(s, 'L') + dom(s, 'C')) * 0.04 * (0.5 + tacOf(s.t.mgr));
        return v;
      };
      const shareNow = clamp(share + adj(sides[0], sides[1]) - adj(sides[1], sides[0]), 0.1, 0.9);
      const here: { k: number; min: number; scene?: string }[] = [];
      while (ci < minutes.length && minutes[ci].min <= mm) { const x = minutes[ci++]; x.k = r.next() < shareNow ? 0 : 1; here.push(x); }
      for (let i = pending.length - 1; i >= 0; i--) if (pending[i].min <= mm) { here.push(pending[i]); pending.splice(i, 1); }
      /* 問137：ケガ（その場ですぐ交代） */
      for (const s of sides) for (const x of [...s.on]) {
        let ir = (0.012 / 90) * (1 + x.p.fat / 120) * (s.t.injMul ?? 1); if (x.p.bad.includes('スペ体質')) ir *= 2.2; if (x.p.sp.includes('ケガをしにくい')) ir *= 0.45;
        if (!injured.has(x.p) && r.next() < ir) {
          injured.set(x.p, r.int(1, 5));
          ev.push({ t: mm, kind: 'talk', me: s.t.me, text: [T(s, x), ' が倒れこんだまま、起き上がれない。ケガのようだ。'] });
          if (!doSub(s, x, [x.pos], mm, 'ケガ') && x.pos !== 'GK') { /* 交代できないときは、そのままプレーを続ける */ }
        }
      }
      const notes: { k: PlayKind; A: Side; D: Side; a: OnPl; d: OnPl | null }[] = [];
      const nt = mic ? (A: Side, D: Side) => (k: PlayKind, a: OnPl, d: OnPl | null) => notes.push({ k, A, D, a, d }) : () => undefined;
      /* 1分の中で、ボールは何度も行き来する（問135：パスの数を本物に） */
      if (!here.length) { const k = r.next() < shareNow ? 0 : 1; poss[k]++; push(sides[k], mm, 0.35);
        for (let j = 0; j < TUNE.flows; j++) { const kk = j === 0 ? k : r.next() < shareNow ? 0 : 1; flow(r, sides[kk], sides[1 - kk], mm, press[1 - kk], false, TUNE.len1, TUNE.len0, nt(sides[kk], sides[1 - kk]), hooks); } }
      else { poss[here[0].k]++; push(sides[here[0].k], mm, 0.35); for (let j = 1; j < TUNE.flows; j++) { const kk = r.next() < shareNow ? 0 : 1; flow(r, sides[kk], sides[1 - kk], mm, press[1 - kk], false, TUNE.len1, TUNE.len0, () => undefined, hooks); } }
      for (const { k, scene } of here) if (!scene) flow(r, sides[k], sides[1 - k], mm, press[1 - k], true, 7, 2, () => undefined, hooks);
      /* ロングスロー：得意な選手がいれば、相手のゴールに近いスローインからチャンスになる */
      for (let k = 0; k < 2; k++) if (sides[k].on.some((x) => has(x, 'ロングスロー')) && r.next() < 0.02) pending.push({ k, min: mm, scene: 'throw' });
      /* 問121：試合の流れの目立つ出来事を、実況の1行にする（1分に1つまで） */
      if (notes.length && r.next() < 0.34) {
        const mine = notes.filter((x) => x.A.t.me ? ['dr', 'off', 'chain'].includes(x.k) : ['tk', 'blk', 'sv'].includes(x.k));
        const n0 = mine.length && r.next() < 0.6 ? r.pick(mine) : r.pick(notes);
        const map: Record<string, Token> = { A: T(n0.A, n0.a), T: C(n0.A), O: C(n0.D) }; if (n0.d) map.D = T(n0.D, n0.d);
        const good = (n0.A.t.me && n0.k === 'dr') || (n0.D.t.me && ['tk', 'sv', 'blk'].includes(n0.k));
        ev.push({ t: mm, kind: 'talk', me: good, text: playLine(r, n0.k, map), good });
      }
      for (const { k, min, scene } of here) {
        const A = sides[k], D = sides[1 - k];
        if (!A.on.length || !D.on.length) continue;
        /* 問138：勝っている所の選手ほど、攻めにかかわる */
        DOMW = (x: OnPl) => 1 + Math.max(0, dom(A, zoneOf(x))) * 1.6 * (0.5 + tacOf(A.t.mgr));
        const counter = D.goals < A.goals && min >= 70 ? 1.8 : D.men < A.men ? 1.3 : 1;
        const res = resolveChance(r, A, D, Math.min(90, min), scene, counter, hooks);
        DOMW = null;
        if (!res) continue;
        res.k = k;
        log.push(res);
        chanceStats(A, D, res);
        push(A, min, res.ok ? 1.6 : 0.8);
        if (res.ok) A.shots.push({ min: res.min, ...shotXY(r, res.scene, k), goal: res.goal, ot: res.goal || res.save, sp: SP_SCENES.includes(res.scene), who: res.att.p.name, how: SCENE_JP[res.scene] ?? '' });
        if (res.save && r.next() < 0.4) corner(A, min);
        else if (!res.ok && (res.scene === 'cross' || res.scene === 'through' || res.scene === 'corner') && r.next() < 0.3) corner(A, min);
        if (res.turnover && min < 89) pending.push({ k: 1 - k, min: min + 1 });
        if (res.goal) {
          const before: [number, number] = [sides[0].goals, sides[1].goals]; A.goals++; lastGoal = min;
          A.moUntil = min + 5; marks.push({ min, kind: 'goal', side: k as 0 | 1 });
          const tie = sides[0].goals === sides[1].goals; const lead = before[k] === before[1 - k] && D.goals > 0;
          res.flow = tie ? '同点' : lead ? '勝ち越し' : before[k] < before[1 - k] && A.goals > D.goals ? '逆転' : null;
          if (A.t.me && res.att.p.goals === 0 && !log.some((x) => x !== res && x.goal && x.att.p === res.att.p)) res.mem = true;
          res.score = [sides[0].goals, sides[1].goals];
          if (mic) {
            const p = res.att.p; const inMatch = log.filter((x) => x.goal && x.att.p === p).length;
            const head = ['cross', 'setpiece', 'longball', 'corner', 'fkcross', 'throw'].includes(res.scene);
            const line = goalComment(r, { min, flow: res.flow ?? null, lead: A.goals - D.goals, first: sides[0].goals + sides[1].goals === 1, p, seasonGoals: p.seasonGoals + inMatch, headed: head, mem: !!res.mem, me: A.t.me }, T(A, res.att));
            if (line) ev.push({ t: Math.min(90, min), kind: 'talk', me: A.t.me, text: line, who: '実況', after: true, hl: true });
          }
        } else if (mic && res.ok && min >= 80 && sides[0].goals === sides[1].goals && !lateTie && r.next() < 0.6) {
          lateTie = true; ev.push({ t: Math.min(90, min), kind: 'talk', me: false, text: [pickFresh(r, LATE_TIE)], who: '実況', after: true, hl: true });
        }
      }
      /* 問138：負けている場所は、腕のいい監督ほど早く「2人で守る」 */
      if (mm >= 30 && mm % 5 === 0) for (let k = 0; k < 2; k++) { const D = sides[k], A = sides[1 - k];
        for (const z of ['R', 'L']) if (!D.cover.has(z) && dom(A, z) > 0.35 && r.next() < tacOf(D.t.mgr)) { D.cover.add(z); if (mic) ev.push({ t: mm, kind: 'flow', me: D.t.me, text: [MG(D), ' が手を打った。', z === 'R' ? '左サイド' : '右サイド', 'を2人で守らせる。'] }); } }
    }
    if (blk === 5) pending.length = 0;
  }
  ev.push({ t: 90, kind: 'talk', me: false, text: ['試合終了の笛。', C(sides[0]), ' ', String(sides[0].goals), ' - ', String(sides[1].goals), ' ', C(sides[1]), '。'] });
  log.sort((x, y) => x.min - y.min);
  /* 天皇杯で引き分け：延長はせず、すぐにPK戦 */
  let pk: [number, number] | null = null;
  if (opts.cup && sides[0].goals === sides[1].goals) pk = shootout(r, sides, ev);
  const score: [number, number] = [sides[0].goals, sides[1].goals];
  const winner: 0 | 1 | null = score[0] > score[1] ? 0 : score[1] > score[0] ? 1 : pk ? (pk[0] > pk[1] ? 0 : 1) : null;
  const rt = rateAll(sides, score);
  if (opts.record) record(r, sides, log, opts.label || '', rt, comp, injured);
  const view = buildView(sides, log, ev, score, pk, !!opts.big, opts.title || '', rt);
  /* 問135・139：試合の数字・流れのグラフ・シュートの位置・1対1・交代・カード */
  {
    const tot = Math.max(1, poss[0] + poss[1]); const P = Math.round((poss[0] / tot) * 100);
    const sum = (s: Side, f: (x: St) => number) => [...s.st.values()].reduce((t, x) => t + f(x), 0);
    const two = (f: (s: Side) => number): [number, number] => [f(sides[0]), f(sides[1])];
    view.stats = { poss: [P, 100 - P], sh: two((s) => sum(s, (x) => x.sh)), ot: two((s) => sum(s, (x) => x.ot)), pa: two((s) => sum(s, (x) => x.pa)), pc: two((s) => sum(s, (x) => x.pc)), ck: two((s) => s.corners), fo: two((s) => s.fouls), yc: two((s) => s.cards.filter((c) => !c.red).length), rc: two((s) => s.cards.filter((c) => c.red).length), off: two((s) => s.offsides), sv: two((s) => sum(s, (x) => x.sv)) };
    const pts: number[] = []; for (let b = 0; b < 18; b++) { let v = 0; for (let m = b * 5 + 1; m <= b * 5 + 5; m++) v += pg[m]; pts.push(Math.round(Math.tanh(v / 4) * 100) / 100); }
    view.flowG = { pts, marks };
    view.shots = sides.flatMap((s, k) => s.shots.map((x) => ({ ...x, side: k as 0 | 1 })));
    view.cards = sides.flatMap((s, k) => s.cards.map((c) => ({ min: c.min, side: k as 0 | 1, who: c.p.name, red: c.red })));
    view.subs = sides.flatMap((s, k) => s.subLog.map((x) => { const y = stOf(s, x.on); return { min: x.min, side: k as 0 | 1, off: x.off.name, on: x.on.name, why: WHY_SHORT[x.why] ?? x.why, rt: rt.get(x.on), g: y.g, a: y.as }; }));
    const meK = sides[0].t.me ? 0 : sides[1].t.me ? 1 : -1;
    if (meK >= 0) {
      const M = sides[meK], O = sides[1 - meK];
      const dz: { zone: string; me: string; opp: string; w: number; l: number; x: number; y: number }[] = [];
      const add = (zone: string, meP: Player, opP: Player, w: number, l: number) => { const e = dz.find((d) => d.me === meP.name && d.opp === opP.name); if (e) { e.w += w; e.l += l; } else { const xy = ZXY[zone]; dz.push({ zone, me: meP.name, opp: opP.name, w, l, x: xy[0], y: xy[1] }); } };
      for (const d of M.duels.values()) add(d.zone, d.a, d.d, d.w, d.l);
      for (const d of O.duels.values()) add(d.zone === 'R' ? 'Ld' : d.zone === 'L' ? 'Rd' : d.zone === 'C' ? 'Cd' : d.zone === 'G' ? 'Gd' : d.zone, d.d, d.a, d.l, d.w);
      view.duels = dz.filter((d) => d.w + d.l >= 3 && d.zone !== 'M').sort((a, b) => b.w + b.l - (a.w + a.l)).slice(0, 8);
      const kk = M.kick; view.kick = { ck: kk.ck?.name ?? '', fk: kk.fk?.name ?? '', pk: kk.pk?.name ?? '' };
    }
  }
  /* 問122 A：試合のあとの実況と解説のふり返り（試合のまとめの上に出す） */
  if (mic) {
    const tot = Math.max(1, poss[0] + poss[1]); const pp: [number, number] = [Math.round((poss[0] / tot) * 100), 100 - Math.round((poss[0] / tot) * 100)];
    let decider: { name: Token; min: number } | null = null;
    if (winner != null && !pk) { const lose = score[1 - winner]; const g = log.filter((c) => c.goal && c.k === winner)[lose]; if (g) decider = { name: T(sides[winner], g.att), min: g.min }; }
    const m = view.mom; let momT: { name: Token; rt: string; why: string } | null = null;
    if (m) { const sd = sides.find((x) => x.t.name === m.club)!; const pl = [...sd.on, ...sd.offs].find((x) => x.p.name === m.name); const y = pl ? stOf(sd, pl.p) : null;
      const why = !y ? '' : y.g >= 2 ? `${y.g}点を取りました。` : y.g && y.as ? '点も取って、アシストもしました。' : y.g ? '大事なゴールを決めました。' : y.as ? 'アシストで勝ちに貢献しました。' : (y.psv ?? 0) ? 'PKを止めました。' : y.sv >= 3 ? `${y.sv}本のセーブで、ゴールを守りました。` : y.tk >= 5 ? `ボールを${y.tk}回も奪いました。` : '攻めも守りも、よく走っていました。';
      momT = { name: { t: m.name, me: m.me }, rt: m.rt.toFixed(1), why }; }
    let saves: { name: Token; n: number } | null = null;
    for (const x of sides) { const g = [...x.on, ...x.offs].find((y) => y.pos === 'GK'); if (g) { const n = stOf(x, g.p).sv; if (!saves || n > saves.n) saves = { name: T(x, g), n }; } }
    void possHalf;
    view.recap = fullTalk(r, { score, pk, names: [C(sides[0]), C(sides[1])], poss: pp, winner, decider, mom: momT, saves, final: !!opts.final, big: !!opts.big }).map((x: MicLine) => ({ who: x.who, line: x.line }));
  }
  return { score, pk, winner, view };
}
/** 問133：キッカー。監督がキックのうまさで決め、オーナーの頼みは監督の気持ちしだいで聞く（頼みはTeamInで、聞いたかどうかは試合の前に決まる） */
function chooseKickers(r: Rng, s: Side): Side['kick'] {
  const out = s.on.filter((x) => x.pos !== 'GK');
  const best = (f: (x: OnPl) => number) => [...out].sort((a, b) => f(b) - f(a))[0]?.p ?? null;
  const req = s.t.kickReq; const ok = (id?: number) => (id != null ? out.find((x) => x.p.id === id)?.p ?? null : null);
  const heard = (id?: number) => (id != null && s.t.kickOk ? ok(id) : null);
  void r;
  return {
    ck: heard(req?.ck) ?? best((x) => x.p.a[PAS] + (has(x, 'プレースキッカー') ? 12 : 0) + (has(x, '正確なクロス') ? 5 : 0)),
    fk: heard(req?.fk) ?? best((x) => x.p.a[SHT] * 0.6 + x.p.a[PAS] * 0.4 + (has(x, 'フリーキックの名手') ? 15 : 0) + (has(x, 'プレースキッカー') ? 5 : 0)),
    pk: heard(req?.pk) ?? best((x) => x.p.a[SHT] + (has(x, 'PKの名手') ? 15 : 0) + (has(x, '冷静沈着') ? 4 : 0)),
  };
}
/** 問138：試合前の注目の対決（うちのWG対相手のSB、うちのST対相手のCB） */
export function featuredDuels(my: OnPl[], opp: OnPl[]): { zone: string; me: Player; opp: Player; mv: number; ov: number; what: string }[] {
  const A = { on: my.map((x) => ({ ...x })) } as unknown as Side; const D = { on: opp.map((x) => ({ ...x })) } as unknown as Side;
  assignLR(A); assignLR(D);
  const out: { zone: string; me: Player; opp: Player; mv: number; ov: number; what: string }[] = [];
  for (const a of A.on.filter((x) => x.pos === 'WG' || x.pos === 'ST')) {
    const d = opponentOf(D, a); if (!d) continue;
    if (a.pos === 'WG') out.push({ zone: ZONE_NAME[zoneOf(a)], me: a.p, opp: d.p, mv: Math.round(a.p.a[SPD]), ov: Math.round(d.p.a[SPD]), what: 'スピード' });
    else out.push({ zone: 'ゴール前の競り合い', me: a.p, opp: d.p, mv: Math.round(a.p.a[PHY] + (a.p.height - 180) * 0.25), ov: Math.round(d.p.a[PHY] + (d.p.height - 180) * 0.25), what: '競り合いの強さ' });
  }
  return out.sort((x, y) => Math.abs(y.mv - y.ov) - Math.abs(x.mv - x.ov)).slice(0, 2);
}
/** 監督が決めるキッカー（試合前の画面で見せる） */
export function kickersFor(t: TeamIn, lineup: OnPl[]): { ck: Player | null; fk: Player | null; pk: Player | null } {
  const s = { t: { ...t, kickOk: true }, on: lineup } as unknown as Side; return chooseKickers(new Rng(1), s);
}
type Hooks = {
  foul: (A: Side, D: Side, h: OnPl, d: OnPl, mm: number, i: number, beaten: boolean) => boolean;
  corner: (A: Side, mm: number) => void; offside: (A: Side, mm: number) => void;
  duel: (A: Side, D: Side, a: OnPl, d: OnPl, win: boolean, mm: number) => void;
  pair: (D: Side, a: OnPl) => OnPl | null;
  shot: (A: Side, h: OnPl, mm: number, ot: boolean) => void;
};
const WHY_LINE: Record<string, string> = { 点を取りにいく: '守りの選手を下げて、点を取りにいく。', 守りきる: '前の選手を下げて、守りを固める。', 疲れ: '疲れの見えた選手を休ませる。', ケガ: 'ケガの選手と代える。', イエロー: 'イエローをもらっている選手を下げて、退場をさける。', 退場: '退場のあとの立て直しだ。', 若手: '若手を試す。', オーナーの頼み: '' };
const WHY_SHORT: Record<string, string> = { 点を取りにいく: '点を取りにいく', 守りきる: '守りきる', 疲れ: '疲れ', ケガ: 'ケガ', イエロー: 'イエローの選手を下げる', 退場: '退場のあとの立て直し', 若手: '若手を試す', オーナーの頼み: 'オーナーの頼み' };
const ANA_GOOD = ['いい判断です。早めに手を打ちましたね。', 'この交代は効きそうです。監督はよく見ています。', '先に動きましたね。こういう采配が流れを変えます。'];
const ANA_LATE = ['少し遅いかもしれません。もっと早く動いてもよかった。', 'この時間からだと、苦しいですね。交代が遅れました。'];
const YELLOW_LINE = ['{D} にイエローカード。{A} を倒してしまった。', '審判がカードを出す。{D} にイエロー。', '{A} を止めにいった {D} に、イエローカードが出た。'];
function fillY(r: Rng, d: Token, a: Token): Line { return fillLine(pickFresh(r, YELLOW_LINE), { D: d, A: a }); }
const DUEL_LINE = ['{Z}は {W} が完全に上回っています。{L} は手を焼いていますね。', '{Z}の勝負は {W} に分があります。{L} はついていけません。', '{Z}、{W} が {L} を何度も上回っています。'];
function fillDuel(r: Rng, z: string, w: Token, l: Token): Line { return fillLine(pickFresh(r, DUEL_LINE).replace('{Z}', z), { W: w, L: l }); }
const SP_SCENES = ['corner', 'fk', 'fkcross', 'pk', 'throw', 'setpiece'];
const SCENE_JP: Record<string, string> = { through: '抜け出し', dribble: 'ドリブル突破', combo: '崩し', cross: 'クロス', mid: 'ミドルシュート', setpiece: 'セットプレー', counter: 'カウンター', loose: 'こぼれ球', pk: 'PK', error: '守りのミス', longball: 'ロングボール', corner: 'コーナーキック', fk: '直接フリーキック', fkcross: 'フリーキック', throw: 'ロングスロー', flow: 'シュート' };
/** 問139：対決の場所（ピッチの図の上の位置。自分が右へ攻める向き） */
const ZXY: Record<string, [number, number]> = { R: [78, 58], L: [78, 10], C: [90, 34], G: [100, 34], Rd: [26, 58], Ld: [26, 10], Cd: [14, 34], Gd: [4, 34], M: [52, 34] };
/** 問139：シュートの位置（ホームは右のゴールへ攻める） */
function shotXY(r: Rng, scene: string, k: number): { x: number; y: number } {
  const R = (a: number, b: number) => a + r.next() * (b - a);
  const [d, lat] = scene === 'pk' ? [11, 0] : scene === 'mid' ? [R(18, 28), R(-14, 14)] : scene === 'fk' ? [R(18, 28), R(-12, 12)] : ['cross', 'corner', 'fkcross', 'throw', 'setpiece', 'longball'].includes(scene) ? [R(4, 11), R(-7, 7)] : scene === 'flow' ? [R(16, 30), R(-18, 18)] : [R(6, 16), R(-11, 11)];
  const x = k === 0 ? 105 - d : d; return { x: Math.round(x * 10) / 10, y: Math.round((34 + lat) * 10) / 10 };
}

function shootout(r: Rng, sides: Side[], ev: Ev[]): [number, number] {
  const sc: [number, number] = [0, 0];
  const order = sides.map((s) => [...s.on].filter((x) => x.pos !== 'GK').sort((a, b) => b.p.a[SHT] + (has(b, 'PKの名手') ? 15 : 0) - a.p.a[SHT] - (has(a, 'PKの名手') ? 15 : 0)));
  ev.push({ t: 90, kind: 'talk', me: false, text: ['引き分け。勝負はPK戦で決まる。'] });
  for (let i = 0; i < 20; i++) {
    for (let k = 0; k < 2; k++) {
      const s = sides[k], o = sides[1 - k]; const kicker = order[k][i % order[k].length]; const g = gkOf(o);
      const sv = kicker.p.a[SHT] + (has(kicker, 'PKの名手') ? 12 : 0) + 14; const gv = g.p.a[SHT] + (has(g, 'PKストッパー') ? 12 : 0);
      const goal = r.next() < sig((sv - gv) / 17) * 1.0;
      if (goal) sc[k]++;
      ev.push({ t: 90, kind: 'talk', me: false, text: [{ t: kicker.p.name, me: s.t.me }, goal ? ' が決めた。' : r.pick([' のキックは、', ' のシュートを、']) + (goal ? '' : ''), ...(goal ? [] : [{ t: g.p.name, me: o.t.me } as Token, ' が止めた！'])] });
    }
    if (i >= 4 && sc[0] !== sc[1]) break;
    if (i < 4) { const left = 4 - i; if (sc[0] > sc[1] + left || sc[1] > sc[0] + left) break; }
  }
  const w = sc[0] > sc[1] ? 0 : 1;
  ev.push({ t: 90, kind: 'talk', me: false, text: ['PK戦 ', String(sc[0]), ' - ', String(sc[1]), '。', { t: sides[w].t.name, me: sides[w].t.me }, ' が勝ち上がった。'] });
  return sc;
}

/** 調整用の数字（バランスの確かめで動かす） */
export const TUNE = { base: 2.0, shotK: 17, shotMul: 1.13, duelK: 15, late: 0.8, len0: 3, len1: 12, miss: 0.5, flowShot: 0.055, rK: 0.86, offside: 0.028, pass: 0.8, rPc: 0.0035, rPm: 0.015, flows: 3, yel: 0.135, pkP: 0.025, fkP: 0.08, ckP: 0.35 };

/* ---------- 場面の解決（企画書 13-2 の表） ---------- */
function resolveChance(r: Rng, A: Side, D: Side, min: number, forced?: string, counter = 1, hk?: Hooks): Chance | null {
  const st = STYLES[A.style];
  /* 問133：セットプレー・PKは、ファウルやコーナーから起きる（ここではくじで選ばない） */
  const w: [string, number][] = Object.entries(SCENE_BASE).map(([k, v]) => [k, ['setpiece', 'fk', 'pk'].includes(k) ? 0 : v * (st.scene[k] || 1)]);
  const mul = (k: string, m: number) => { const e = w.find((x) => x[0] === k); if (e) e[1] *= m; };
  if (anyOn(A, '仕掛け屋')) mul('dribble', 1.6);
  if (anyOn(A, 'チャンスメーカー')) { mul('combo', 1.5); mul('counter', 1.15); }
  if (A.style === 'ゲーゲンプレス' && anyOn(A, 'プレッサー')) mul('error', 1.4);
  if (anyOn(D, '現代型キーパー')) mul('error', 0.75);
  mul('pk', Math.pow(1.8, countBad(D, 'ラフプレイヤー')) * Math.pow(0.6, countOn(D, 'クリーンディフェンス')));
  if (anyOn(D, '2列目からの飛び出し') || anyOn(D, '攻撃参加')) mul('counter', 1.2);
  mul('counter', counter);
  /* 問136：疲れでミスが増える */
  mul('error', 1 + Math.max(0, min - 60) / 30 * 0.8);
  let scene = forced ?? r.wpick(w);
  const label = scene;
  if (scene === 'corner' || scene === 'fkcross' || scene === 'throw') scene = 'setpiece';
  const g = gkOf(D); const t = min;
  const fires: Fire[] = []; const shotFires: Fire[] = [];
  /* マンマーク：相手のエースが関わる場面で、相手の特殊能力の効き目を下げる */
  const marker = D.on.find((x) => has(x, 'マンマーク'));
  const ace = [...A.on].sort((x, y) => ovr(y.p) - ovr(x.p))[0];
  let markFired = false;
  const bonus = (side: Side, pl: OnPl, step: Step, role: 'att' | 'def', out: Fire[]): number => {
    let b = 0;
    for (const s of pl.p.sp) {
      const def = SP_MAP[s]; if (!def) continue;
      for (const fx of def.fx) {
        if (fx.side !== role || fx.step !== step || !fx.scenes.includes(scene)) continue;
        let v = fx.b;
        if (role === 'att' && marker && pl === ace) { v *= 0.5; if (!markFired) { markFired = true; fires.push({ sp: 'マンマーク', t: marker.p.name, me: D.t.me }); } }
        b += v;
        if (!out.some((u) => u.sp === s && u.t === pl.p.name) && !fires.some((u) => u.sp === s && u.t === pl.p.name)) out.push({ sp: s, t: pl.p.name, me: side.t.me, gk: pl.pos === 'GK' && role === 'def', step });
      }
    }
    /* コーチング：味方のDFのIQが少し上がる（指示の効き目なので、札は出さない） */
    if (role === 'def' && pl.pos !== 'GK' && ['CB', 'SB', 'DM'].includes(pl.pos) && anyOn(side, 'コーチング')) b += 1.5;
    return b;
  };
  let att!: OnPl, def!: OnPl, assist: OnPl | null = null; let rec: OnPl | null = null;
  let shotBonus = 0, headed = false, ok = true, turnover = false;
  /** 1対1。attVal/defVal はその場面で使う能力（特殊能力をのせる前） */
  const vs = (ap: OnPl, av0: number, dp: OnPl, dv0: number, step: Step, k = TUNE.duelK, extra = 0) => {
    const av = av0 + bonus(A, ap, step, 'att', fires) + extra; const dv = dv0 + bonus(D, dp, step, 'def', fires);
    return r.next() < sig((av - dv) / k);
  };
  const E = (side: Side, pl: OnPl, i: number) => eff(side, pl, i, t, scene);
  const E2 = (side: Side, pl: OnPl, i: number, j: number) => (eff(side, pl, i, t, scene) + eff(side, pl, j, t, scene)) / 2;
  const air = (side: Side, pl: OnPl) => E(side, pl, PHY) + (pl.p.height - 180) * 0.25;
  /** 起点のパスの質（次の勝負にのる） */
  const feed = (pl: OnPl, i: number) => (E(A, pl, i) + bonus(A, pl, 'feed', 'att', fires) - 60) * 0.15;
  const fw = () => wPlayer(r, byPos(A, ['ST', 'WG', 'AM']), SHT, 'shoot');
  const cb = () => pickDef(r, D, ['CB', 'DM']);
  const onOf = (p: Player | null) => (p ? A.on.find((x) => x.p === p) ?? null : null);
  switch (scene) {
    case 'through': {
      assist = wPlayer(r, byPos(A, ['AM', 'CM', 'DM']), PAS, 'assist');
      att = wPlayer(r, A.on.filter((x) => x !== assist && (['ST', 'WG'].includes(x.pos) || (has(x, '2列目からの飛び出し') && ['AM', 'CM'].includes(x.pos)))).length ? A.on.filter((x) => x !== assist && (['ST', 'WG'].includes(x.pos) || (has(x, '2列目からの飛び出し') && ['AM', 'CM'].includes(x.pos)))) : byPos(A, ['ST', 'WG']), SPD, 'run', 'スピードスター');
      def = cb();
      ok = vs(att, E(A, att, SPD), def, E(D, def, SPD), 'run', TUNE.duelK, feed(assist, PAS));
      if (ok && (has(g, '素早い飛び出し') || r.next() < 0.35)) ok = vs(att, E2(A, att, DRI, SPD), g, E(D, g, DRI), 'gkout', 10);
      break;
    }
    case 'dribble': {
      att = wPlayer(r, byPos(A, ['WG', 'AM', 'ST']), DRI, 'run', '仕掛け屋'); def = pickDef(r, D, ['SB', 'CB', 'DM']);
      ok = vs(att, E(A, att, DRI) * 0.75 + E(A, att, PHY) * 0.25, def, E(D, def, DEF) * 0.75 + E(D, def, PHY) * 0.25, 'beat');
      if (!ok && has(att, '仕掛け屋') && r.next() < 0.3) turnover = true;
      shotBonus = -1; break;
    }
    case 'combo': {
      assist = wPlayer(r, byPos(A, ['AM', 'CM']), PAS, 'assist', 'チャンスメーカー'); def = pickDef(r, D, ['DM', 'CB']);
      ok = vs(assist, E2(A, assist, PAS, IQ), def, E2(D, def, DEF, IQ), 'pass'); att = fw();
      if (att === assist) att = wPlayer(r, byPos(A, ['ST', 'WG']), SHT, 'shoot');
      break;
    }
    case 'cross': {
      const crossers = A.on.filter((x) => ['WG', 'SB'].includes(x.pos));
      assist = crossers.length ? r.wpick(crossers.map((x) => [x, Math.pow(x.p.a[PAS], 2) * (x.pos === 'SB' && has(x, '攻撃参加') ? 2.5 : 1) * (x.pos === 'SB' && !has(x, '攻撃参加') ? 0.6 : 1)] as [OnPl, number])) : wPlayer(r, byPos(A, ['CM', 'AM']), PAS, 'assist');
      def = pickDef(r, D, ['SB', 'WG']);
      ok = vs(assist, E(A, assist, PAS), def, E(D, def, DEF), 'cross');
      att = wPlayer(r, byPos(A, ['ST', 'CB', 'AM']).filter((x) => x !== assist), PHY, 'shoot', 'パワーヘッダー');
      if (ok) { const c = cb(); ok = vs(att, air(A, att), c, air(D, c), 'air'); def = c; }
      headed = true; break;
    }
    case 'mid': {
      att = wPlayer(r, byPos(A, ['AM', 'CM', 'DM', 'WG']), SHT, 'shoot', 'ミドルシューター'); def = pickDef(r, D, ['DM', 'CM', 'CB']); shotBonus = -9;
      if (has(def, 'シュートブロック') || r.next() < 0.3) ok = vs(att, E(A, att, SHT), def, E(D, def, DEF) + 6, 'block');
      break;
    }
    case 'setpiece': {
      /* 問133：コーナー・クロスを入れるフリーキック・ロングスロー。キッカーのキック、競り合いは背の高さとフィジカル、キーパーの飛び出し */
      const kp = label === 'throw' ? A.on.find((x) => has(x, 'ロングスロー')) ?? null : onOf(label === 'corner' ? A.kick.ck : A.kick.fk);
      assist = kp ?? wPlayer(r, A.on.filter((x) => x.pos !== 'GK'), PAS, 'assist', 'プレースキッカー');
      const heads = A.on.filter((x) => x !== assist && x.pos !== 'GK');
      att = r.wpick(heads.map((x) => [x, Math.pow(Math.max(10, x.p.a[PHY] + (x.p.height - 178) * 0.8), 2) * (['CB', 'ST'].includes(x.pos) ? 1.6 : 1) * (has(x, 'パワーヘッダー') || has(x, 'エアバトル') ? 2 : 1)] as [OnPl, number]));
      def = cb();
      const claim = sig((E2(D, g, DRI, DEF) - E(A, assist, PAS) - 6) / 18) * 0.35;
      if (r.next() < claim) { ok = false; def = g; }
      else ok = vs(att, air(A, att), def, air(D, def), 'air', TUNE.duelK, feed(assist, PAS) + (label === 'throw' ? -2 : 0));
      headed = true; shotBonus = -3; break;
    }
    case 'fk': {
      const k0 = onOf(A.kick.fk);
      att = k0 ?? wPlayer(r, A.on.filter((x) => x.pos !== 'GK'), SHT, 'shoot', 'プレースキッカー'); def = cb(); shotBonus = -32; break;
    }
    case 'counter': {
      def = pickDef(r, D, ['CM', 'AM', 'WG']);
      assist = wPlayer(r, byPos(A, ['DM', 'CB', 'CM']), DEF, 'assist');
      ok = vs(assist, E2(A, assist, DEF, IQ), def, E2(D, def, DRI, IQ), 'win');
      att = wPlayer(r, byPos(A, ['ST', 'WG']), SPD, 'run', 'スピードスター');
      if (ok) { const c = cb(); ok = vs(att, E(A, att, SPD), c, E(D, c, SPD), 'run', TUNE.duelK, feed(assist, PAS)); def = c; if (ok && has(g, '素早い飛び出し')) ok = vs(att, E2(A, att, DRI, SPD), g, E(D, g, DRI), 'gkout', 10); }
      break;
    }
    case 'loose': {
      const pool = A.on.filter((x) => ['ST', 'AM', 'WG'].includes(x.pos) || (has(x, '2列目からの飛び出し') && x.pos === 'CM'));
      att = wPlayer(r, pool.length ? pool : byPos(A, ['ST']), IQ, 'shoot', 'ゴール前の嗅覚'); def = cb();
      ok = vs(att, E2(A, att, IQ, SPD), def, E2(D, def, IQ, SPD), 'react'); shotBonus = 2; break;
    }
    case 'pk': {
      att = onOf(A.kick.pk) ?? [...A.on].filter((x) => x.pos !== 'GK').sort((x, y) => y.p.a[SHT] + (has(y, 'PKの名手') ? 15 : 0) - x.p.a[SHT] - (has(x, 'PKの名手') ? 15 : 0))[0];
      const rough = D.on.filter((x) => x.p.bad.includes('ラフプレイヤー'));
      def = rough.length && r.next() < 0.6 ? r.pick(rough) : pickDef(r, D, ['CB', 'SB', 'DM']); shotBonus = 19; break;
    }
    case 'error': {
      def = r.pick(byPos(D, ['CB', 'GK', 'DM'])); att = wPlayer(r, byPos(A, ['ST', 'WG', 'AM']), IQ, 'shoot');
      const others = D.on.filter((x) => x !== def && x.pos !== 'GK'); rec = others.length ? r.pick(others) : def;
      ok = vs(att, E2(A, att, IQ, SPD), def, E2(D, def, def.pos === 'GK' ? PAS : PAS, IQ) + 6, 'press', 8); break;
    }
    case 'longball': {
      assist = gk(A); att = wPlayer(r, byPos(A, ['ST']), PHY, 'shoot'); def = cb();
      ok = vs(att, air(A, att), def, air(D, def), 'air', TUNE.duelK, feed(assist, PAS)); shotBonus = -4; break;
    }
  }
  if (!att) return null;
  /* 問138：決定機の1対1も数える（攻めの選手と、止めにきた選手） */
  if (hk && def && def !== g && ['through', 'dribble', 'counter', 'cross'].includes(scene)) hk.duel(A, D, att, def, ok, t);
  let goal = false, save = false, shotAv = 0, gkFired = false, miss = false;
  if (ok) {
    const sv = E(A, att, SHT) + bonus(A, att, 'shot', 'att', shotFires) + shotBonus;
    let gv = E(D, g, SHT) + bonus(D, g, 'save', 'def', shotFires);
    if (headed) gv = (gv + E(D, g, DEF)) / 2 + (shotFires.some((f) => f.sp === 'ハイボール処理') ? 3.5 : 0);
    /* 問135：枠を外すこともある（PKはほとんど外さない。ヘディング・ミドル・直接フリーキックは外しやすい） */
    let pMiss = scene === 'pk' ? 0.06 : headed ? TUNE.miss + 0.1 : scene === 'fk' ? TUNE.miss + 0.25 : scene === 'mid' ? TUNE.miss + 0.18 : TUNE.miss;
    pMiss *= clamp(1.4 - E(A, att, SHT) / 100, 0.6, 1.3);
    if (r.next() < pMiss) miss = true;
    else {
      const pr = sig((sv - gv) / TUNE.shotK) * (scene === 'pk' ? 1.15 : TUNE.shotMul);
      goal = r.next() < pr; save = !goal;
    }
    shotAv = sv;
    gkFired = shotFires.some((f) => f.gk);
    /* 問138：シューター対キーパー */
    if (hk && !miss) hk.duel(A, D, att, g, goal, t);
  }
  /* 能力を上げない特殊能力も、関わった場面の文に出す（企画書 8-8：どの特殊能力も見どころの文に出る） */
  const pf = (side: Side, pl: OnPl | null, s: string, cond: boolean) => { if (pl && cond && has(pl, s) && !fires.some((f) => f.sp === s && f.t === pl.p.name) && fires.length < 2) fires.push({ sp: s, t: pl.p.name, me: side.t.me }); };
  pf(A, att, '点取り屋', r.next() < 0.5);
  pf(A, assist, 'チャンスメーカー', r.next() < 0.6);
  pf(A, att, '仕掛け屋', scene === 'dribble');
  pf(A, att, '2列目からの飛び出し', ['AM', 'CM'].includes(att.pos) && (scene === 'through' || scene === 'loose'));
  pf(A, assist, '攻撃参加', scene === 'cross' && assist?.pos === 'SB');
  pf(D, def, '守備職人', !ok);
  pf(A, att, 'エンジン', t >= 70); pf(D, def, 'エンジン', t >= 70 && !ok);
  pf(A, att, 'スーパーサブ', att.sub); pf(A, assist, 'スーパーサブ', !!assist?.sub);
  pf(A, att, '立ち上がりに強い', t <= 15); pf(D, def, '立ち上がりに強い', t <= 15 && !ok);
  pf(D, g, 'コーチング', !ok && ['CB', 'SB', 'DM'].includes(def.pos) && r.next() < 0.5);
  pf(D, def, 'クリーンディフェンス', !ok && (scene === 'dribble' || scene === 'through') && r.next() < 0.5);
  /* 枠を外したときは、キーパーの特殊能力は働かない */
  const sf = miss ? shotFires.filter((f) => !f.gk && f.me === A.t.me) : shotFires;
  const text = narrate(r, scene, A, D, att, assist, def, g, ok, goal, fires, sf, headed, rec, miss ? false : gkFired);
  /* 枠を外したとき：キーパーが止める文を、外れた文に入れかえる */
  if (miss && text.length > 1) text.pop();
  /* 問133：セットプレーのはじめのひとこと */
  const kName = (x: OnPl | null): Token => ({ t: (x ?? att).p.name, me: A.t.me });
  const pre: Record<string, Line> = { corner: ['コーナーキック。', kName(assist), ' が蹴る。'], fkcross: ['フリーキック。', kName(assist), ' がゴール前へ入れる。'], throw: ['ロングスロー。', kName(assist), ' がゴール前へ投げこむ。'], fk: ['ゴールに近い位置でフリーキック。', kName(att), ' が直接ねらう。'], pk: ['ペナルティエリアの中でファウル！ PKだ。', kName(att), ' がボールをセットする。'] };
  if (pre[label]) text.unshift(pre[label]);
  if (miss) text.push(r.pick<Line>([[kName(att), ' のシュートは、枠の外へ。'], [kName(att), ' のシュートは、わずかに外れた。'], [kName(att), ' が打った！ しかしゴールの上へ。']]));
  return { min, scene: label, k: 0, att, assist: assist && assist !== att ? assist : null, def: def ?? null, ok, goal, save, shotAv, text, turnover };
}
function gk(s: Side) { return gkOf(s); }


/* ---------- 記録（出場・疲れ・ケガ・ゴール） ---------- */
function record(r: Rng, sides: Side[], log: Chance[], label: string, rt: Map<Player, number>, comp: Comp, injured: Map<Player, number>) {
  for (const s of sides) {
    /* 問134：出場停止だった選手は、この試合で1つ減る。この試合のカードを数える */
    for (const p of s.banStart) if (p.ban) p.ban[comp] = Math.max(0, p.ban[comp] - 1);
    for (const x of [...s.on, ...s.offs]) {
      const st = stOf(s, x.p); const p = x.p;
      if (!p.yc) p.yc = { L: 0, C: 0 }; if (!p.ban) p.ban = { L: 0, C: 0 };
      const cn = comp === 'L' ? 'リーグ' : '天皇杯';
      if (st.rc) { const n = (st.yc ?? 0) >= 2 ? 1 : r.next() < 0.3 ? r.int(2, 3) : 1; p.ban[comp] += n; s.t.me && (p.banMsg ??= []).push(`${p.name}は退場したので、${cn}の次の${n}試合に出られません。`); }
      else if (st.yc) { p.yc[comp] += st.yc; if (p.yc[comp] >= 4) { p.yc[comp] -= 4; p.ban[comp] += 1; s.t.me && (p.banMsg ??= []).push(`${p.name}はイエローが4枚たまったので、${cn}の次の試合に出られません。`); } else if (p.yc[comp] === 3) s.t.me && (p.banMsg ??= []).push(`${p.name}は${cn}でイエローが3枚です。あと1枚で出場停止になります。`); }
    }
    for (const x of [...s.on, ...s.offs]) {
      const p = x.p;
      p.apps++; p.seasonApps++; p.seasonPerf += 1;
      const v = rt.get(p); if (v != null) { p.seasonRt = (p.seasonRt ?? 0) + v; p.seasonRtN = (p.seasonRtN ?? 0) + 1; p.seasonPerf += clamp(v - 6.5, -1, 2); }
      p.exp = clamp(p.exp + (p.sp.includes('吸収力') ? 8 : 3), 0, 100);
      if (s.t.me && !p.firstApp) p.firstApp = label;
      p.played = true;
      if (p.apt[x.pos] < 3) p.aptXp[x.pos] = (p.aptXp[x.pos] || 0) + 1;
      let f = 24 * (1.25 - p.a[STA] / 100); if (p.bad.includes('スタミナ切れ')) f *= 1.3; p.fat = clamp(p.fat + f, 0, 100);
      /* 問137：ケガは試合の中で起きる（そのとき交代している） */
      const iw = injured.get(p); if (iw) { p.inj = iw; p.injNew = true; }
    }
  }
  for (const c of log) if (c.goal) {
    const p = c.att.p; const s = sides[c.k];
    if (s.t.me && !p.firstGoal) p.firstGoal = label;
    p.goals++; p.seasonGoals++; p.seasonPerf += 2;
  }
  for (const c of log) if (c.goal && c.assist) { const p = c.assist.p; p.ast = (p.ast ?? 0) + 1; p.seasonAst = (p.seasonAst ?? 0) + 1; p.seasonPerf += 1; }
}

/* ---------- 画面に渡す形（JSONにできる） ---------- */
function buildView(sides: Side[], log: Chance[], ev: Ev[], score: [number, number], pk: [number, number] | null, big: boolean, title: string, rt: Map<Player, number>): MatchView {
  const toItem = (c: Chance): ViewItem => ({
    min: c.min, kind: c.goal ? 'goal' : 'chance', me: sides[c.k].t.me, lines: c.text,
    goal: c.goal ? { scorer: c.att.p.name, score: c.score!, flow: c.flow ?? null, mem: !!c.mem, team: sides[c.k].t.name, me: sides[c.k].t.me } : undefined,
  });
  /* 並べる順：前ふり → キックオフなど → 場面 → 場面のあとのひとこと → 試合終了の笛 */
  const ordOf = (e: Ev) => (e.pre ? -2 : e.after ? 6 : e.kind === 'talk' ? (e.t >= 90 ? 8 : 0) : 3);
  const evItem = (e: Ev): ViewItem => ({ min: e.t, kind: e.kind, me: e.me, lines: [e.text], who: e.who, ord: ordOf(e) });
  /* 見どころ（問63）：ゴールは全部、守りの見せ場、流れが変わった場面、記念の場面、残りは惜しい場面 */
  const goals = log.filter((x) => x.goal);
  const flows = ev.filter((e) => e.kind === 'flow');
  const memos = ev.filter((e) => e.kind === 'memo').slice(0, 2);
  const meK = sides[0].t.me ? 0 : sides[1].t.me ? 1 : -1;
  const saves = log.filter((x) => x.save && (meK < 0 || x.k !== meK)).sort((a, b) => b.shotAv - a.shotAv).slice(0, 1);
  const near = log.filter((x) => !x.goal && x.ok && !saves.includes(x));
  const want = big ? 8 : 6;
  const chosen = new Set<Chance>([...goals, ...saves]);
  for (const n of near) { if (chosen.size >= want - flows.length - memos.length) break; chosen.add(n); }
  const hl: ViewItem[] = [...chosen].map(toItem);
  for (const f of flows) hl.push(evItem(f));
  for (const m of memos) hl.push(evItem(m));
  /* 問121 C・問122：見どころにも、前ふり・前半のふり返り・ゴールのあとのひとこと、自分の選手のいいプレー（2〜3場面）を入れる */
  for (const e of ev.filter((x) => x.hl)) { if (e.after && e.who === '実況' && e.t !== 45 && !hl.some((h) => h.min === e.t && h.kind === 'goal') && !/同点のまま|どちらに転ぶ|ため息/.test(String(e.text[0]))) continue; hl.push(evItem(e)); }
  const goods = ev.filter((x) => x.good); for (const e of goods.filter((_, i) => i % Math.max(1, Math.floor(goods.length / 3)) === 0).slice(0, 3)) hl.push(evItem(e));
  const ordV = (x: ViewItem) => x.ord ?? (x.kind === 'memo' ? 2 : 3);
  hl.sort((a, b) => a.min - b.min || ordV(a) - ordV(b));
  const full: ViewItem[] = [...log.map(toItem), ...ev.map(evItem)].sort((x, y) => x.min - y.min || ordV(x) - ordV(y));
  const meSide = sides.find((s) => s.t.me);
  /* 感想：先発はポジション順（GK→DF→MF→FW）、そのあとに途中から入った選手を入った順に */
  const PO: Record<string, number> = { GK: 0, CB: 1, SB: 2, DM: 3, CM: 4, AM: 5, WG: 6, ST: 7 };
  const all = meSide ? [...meSide.on, ...meSide.offs] : [];
  const starters = all.filter((x) => !x.sub).sort((a, b) => PO[a.pos] - PO[b.pos]);
  const subsIn = all.filter((x) => x.sub).sort((a, b) => (meSide!.st.get(a.p)?.from ?? 0) - (meSide!.st.get(b.p)?.from ?? 0));
  const played = meSide ? [...starters, ...subsIn].map((x) => { const st = meSide.st.get(x.p) ?? zeroSt(); return { id: x.p.id, name: x.p.name, pos: x.pos, sub: x.sub, goals: st.g, ast: st.as, rt: rt.get(x.p) ?? 6, min: Math.max(0, st.to - st.from), st: { pa: st.pa, pc: st.pc, tk: st.tk, sh: st.sh, ot: st.ot, sv: st.sv, dr: st.dr, kp: st.kp } }; }) : [];
  return {
    title,
    home: { name: sides[0].t.name, me: sides[0].t.me, color: sides[0].t.color },
    away: { name: sides[1].t.name, me: sides[1].t.me, color: sides[1].t.color },
    score, pk, highlights: hl, full,
    chances: [log.filter((x) => x.k === 0).length, log.filter((x) => x.k === 1).length],
    scorers: goals.map((c) => ({ name: c.att.p.name, min: c.min, me: sides[c.k].t.me })),
    played,
    mom: momOf(sides, rt),
    orders: meSide ? meSide.t.squad.filter((p) => p.ord && meSide.t.heard?.has(p.id)).map((p) => ({ name: p.name, kind: p.ord!.kind, heard: !!meSide.t.heard!.get(p.id) })) : undefined,
  };
}

/* ---------- 1分ごとのボールの動き（問107） ---------- */
const W_HOLD: Record<Pos, number> = { GK: 0.9, CB: 1.25, SB: 1, DM: 1.45, CM: 1.5, AM: 1.2, WG: 0.9, ST: 0.6 };
const W_WIN: Record<Pos, number> = { GK: 0, CB: 1.3, SB: 1.1, DM: 1.6, CM: 1.1, AM: 0.6, WG: 0.5, ST: 0.3 };
const FWD: Pos[] = ['AM', 'WG', 'ST'];
export function stOf(s: { st: Map<Player, St> }, p: Player): St { let x = s.st.get(p); if (!x) { x = zeroSt(); s.st.set(p, x); } return x; }
function subMin(s: Side, off: Player, on: Player, min: number) { stOf(s, off).to = min; const x = stOf(s, on); x.from = min; x.to = 90; }
const fv = (side: Side, pl: OnPl, i: number, t: number) => eff(side, pl, i, t, 'flow');
function winner(r: Rng, D: Side): OnPl {
  const f = D.on.filter((x) => x.pos !== 'GK');
  return r.wpick(f.map((x) => [x, W_WIN[x.pos] * Math.pow(Math.max(10, x.p.a[DEF]), 1.5) + 40] as [OnPl, number]));
}
/** 1回の攻め：パスをつなぐ。keep のときは、このあと決定機になる（とちゅうで奪われない）。
    問133〜138：とちゅうでファウル（セットプレー）・オフサイド・コーナー・1対1が起きる */
function flow(r: Rng, A: Side, D: Side, t: number, press: number, keep: boolean, maxLen = 7, minLen = 2, note: (k: PlayKind, a: OnPl, d: OnPl | null) => void = () => undefined, hk?: Hooks): void {
  if (!A.on.length || !D.on.length) return;
  let h = r.wpick(A.on.map((x) => [x, W_HOLD[x.pos]] as [OnPl, number]));
  const n = r.int(minLen, maxLen);
  for (let i = 0; i < n; i++) {
    const sh = stOf(A, h.p);
    /* 決定機にならないシュート（遠め・角度がない）：点にはならない。枠外・ブロック・キーパーが楽に止める */
    if (!keep && i >= 1 && (FWD.includes(h.pos) || h.pos === 'CM') && r.next() < (FWD.includes(h.pos) ? TUNE.flowShot : TUNE.flowShot * 0.35) * (0.6 + h.p.a[SHT] / 100)) {
      sh.sh++; const u = r.next();
      if (u >= 0.78) { sh.ot++; stOf(D, gkOf(D).p).sv++; note('sv', h, gkOf(D)); hk?.shot(A, h, t, true); } else if (u < 0.3) { note('blk', h, winner(r, D)); hk?.shot(A, h, t, false); } else { note('off', h, null); hk?.shot(A, h, t, false); }
      return;
    }
    if (FWD.includes(h.pos) && r.next() < 0.16) {
      /* 問138：向き合う相手と1対1（いなければ、近くの守りの選手） */
      const pd = hk?.pair(D, h); const d = pd && r.next() < 0.75 ? pd : winner(r, D);
      const cov = D.cover.has(h.lr === 'R' ? 'R' : h.lr === 'L' ? 'L' : '') ? 5 : 0;
      const win = keep || r.next() < sig((fv(A, h, DRI, t) - fv(D, d, DEF, t) - cov) / 14 + 0.25);
      if (!keep) hk?.duel(A, D, h, d, win, t);
      if (win) { sh.dr++; if (!keep) { note('dr', h, d); if (hk?.foul(A, D, h, d, t, i, true)) return; } }
      else { stOf(D, d.p).tk++; note('tk', h, d); if (hk?.foul(A, D, h, d, t, i, false)) return; return; }
    }
    const to = r.wpick(A.on.filter((x) => x !== h).map((x) => [x, W_HOLD[x.pos] * (i >= 2 && FWD.includes(x.pos) ? 1.6 : 1) * (x.pos === 'GK' ? 0.6 : 1)] as [OnPl, number]));
    if (!to) return;
    /* オフサイド：前の選手へのパス */
    if (!keep && i >= 1 && (to.pos === 'ST' || to.pos === 'WG') && r.next() < TUNE.offside) { hk?.offside(A, t); return; }
    const tired = Math.max(0, t - 60) / 30 * (100 - h.p.a[STA]) / 100 * 0.05;
    const pOk = clamp(TUNE.pass + ((fv(A, h, PAS, t) + fv(A, h, IQ, t)) / 2 - press) / 140 - i * 0.008 - (h.pos === 'GK' ? 0.08 : 0) + (FWD.includes(to.pos) ? -0.06 : 0.03) - tired, 0.5, 0.97);
    sh.pa++;
    if (keep || r.next() < pOk) { sh.pc++; h = to; }
    else {
      const w = winner(r, D); stOf(D, w.p).tk++;
      if (MID.includes(h.pos) && MID.includes(w.pos)) hk?.duel(A, D, h, w, false, t);
      if (r.next() < 0.3) note('tk', h, w);
      if (hk?.foul(A, D, h, w, t, i, false)) return;
      if (i >= 3 && FWD.includes(to.pos) && r.next() < 0.1) hk?.corner(A, t);
      return;
    }
  }
  if (!keep && n >= 9) note('chain', h, null);
}
function chanceStats(A: Side, D: Side, c: Chance) {
  const g = gkOf(D);
  if (c.ok) {
    const s = stOf(A, c.att.p); s.sh++;
    if (c.goal) { s.g++; s.ot++; stOf(D, g.p).ga++; if (c.assist) stOf(A, c.assist.p).as++; }
    else if (c.save) { s.ot++; const gs = stOf(D, g.p); gs.sv++; if (c.scene === 'pk') gs.psv = (gs.psv ?? 0) + 1; }
    if (c.assist) stOf(A, c.assist.p).kp++;
    if (c.def && c.def !== g) stOf(D, c.def.p).dl++;
  } else if (c.def) { const d = stOf(D, c.def.p); d.dw++; d.tk++; }
}
/** 10点満点・0.1きざみの評価点（問106）。試合全体での働き（数えた数字）から決める */
export function rateOne(st: St, pos: Pos, ga: number, res: number): number {
  const DEFS: Pos[] = ['CB', 'SB'];
  let v = 6.0;
  v += st.g * (DEFS.includes(pos) || pos === 'DM' ? 1.2 : 0.95) + st.as * 0.6 + st.kp * 0.15;
  v += st.ot * 0.1 - (st.sh - st.ot) * 0.03;
  v += st.pc * TUNE.rPc - (st.pa - st.pc) * TUNE.rPm;
  /* 問135：カードで下がる・PKを止めると上がる・PKを与えると下がる */
  v += -(st.yc ?? 0) * 0.3 - (st.rc ?? 0) * 1.2 + (st.psv ?? 0) * 0.6 - (st.pkc ?? 0) * 0.35 - (st.fo ?? 0) * 0.03;
  v += st.tk * 0.06 + st.dr * 0.08 + st.dw * 0.22 - st.dl * 0.2;
  if (pos === 'GK') v += st.sv * 0.33 - ga * 0.35 + (ga === 0 ? 0.45 : 0);
  else if (DEFS.includes(pos)) v += -ga * 0.15 + (ga === 0 ? 0.35 : 0);
  else if (pos === 'DM') v += -ga * 0.07 + (ga === 0 ? 0.15 : 0);
  v += res * 0.25;
  const mins = Math.max(1, st.to - st.from);
  v = 6 + (v - 6) * Math.min(1, 0.45 + mins / 50);
  v = 6.4 + (v - 6.4) * TUNE.rK - 0.17;
  return Math.round(clamp(v, 3, 10) * 10) / 10;
}
function rateAll(sides: Side[], score: [number, number]): Map<Player, number> {
  const out = new Map<Player, number>();
  sides.forEach((s, k) => {
    const res = Math.sign(score[k] - score[1 - k]);
    for (const x of [...s.on, ...s.offs]) { const st = stOf(s, x.p); out.set(x.p, rateOne(st, x.pos, gaWhile(sides[1 - k], st), res)); }
  });
  return out;
}
/** その選手がピッチにいた間に取られた点 */
function gaWhile(o: Side, st: St): number { let n = 0; for (const x of o.st.values()) n += x.g; return st.from === 0 && st.to === 90 ? n : Math.round(n * (st.to - st.from) / 90); }
function momOf(sides: Side[], rt: Map<Player, number>) {
  let best: { name: string; me: boolean; rt: number; club: string } | undefined; let bv = -1;
  for (const s of sides) for (const x of [...s.on, ...s.offs]) { const v = (rt.get(x.p) ?? 0) + stOf(s, x.p).g * 0.01; if (v > bv) { bv = v; best = { name: x.p.name, me: s.t.me, rt: rt.get(x.p) ?? 6, club: s.t.name }; } }
  return best;
}
