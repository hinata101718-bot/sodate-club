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

export { simulateMatch, MatchSim } from './sim';
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
export const zeroSt = (from = 0): St => ({ pa: 0, pc: 0, tk: 0, sh: 0, ot: 0, sv: 0, dr: 0, kp: 0, as: 0, g: 0, dw: 0, dl: 0, ga: 0, from, to: 90 });
export type Shot = { min: number; x: number; y: number; goal: boolean; ot: boolean; sp: boolean; who: string; how: string };
export type Duel = { a: Player; d: Player; zone: string; w: number; l: number; said?: boolean };
export type SubRec = { min: number; off: Player; on: Player; why: string };
export interface Side {
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
export interface Chance {
  min: number; scene: string; k: number; att: OnPl; assist: OnPl | null; def: OnPl | null; ok: boolean; goal: boolean; save: boolean; shotAv: number; text: Line[];
  flow?: string | null; mem?: boolean; score?: [number, number]; turnover?: boolean;
  /** 新しいエンジン：その場面の始まりの時刻（試合の時計の秒）・行ごとの時刻・見どころの大きさ */
  sec?: number; secs?: number[]; hv?: number;
}
export interface Ev { t: number; kind: 'talk' | 'flow' | 'memo'; text: Line; me: boolean; who?: Who; after?: boolean; pre?: boolean; good?: boolean; hl?: boolean; sec?: number }

export interface MatchResult { score: [number, number]; pk: [number, number] | null; winner: 0 | 1 | null; view: MatchView; }

export const gkOf = (s: { on: OnPl[] }) => s.on.find((x) => x.pos === 'GK') || s.on[0];
export const MID: Pos[] = ['DM', 'CM', 'AM'];
export const has = (pl: OnPl, s: string) => pl.p.sp.includes(s);
export const hasBad = (pl: OnPl, s: string) => pl.p.bad.includes(s);
export const anyOn = (side: Side, s: string) => side.on.some((x) => x.p.sp.includes(s));
export const countOn = (side: Side, s: string) => side.on.filter((x) => x.p.sp.includes(s)).length;
export const countBad = (side: Side, s: string) => side.on.filter((x) => x.p.bad.includes(s)).length;
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
export const tv = (s: { t: TeamIn }) => (s.t.tilt === 'atk' ? 1 : s.t.tilt === 'def' ? -1 : 0);
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

/* ---------- 試合 ---------- */
export const DEFP: Pos[] = ['CB', 'SB', 'DM'];
export const ATKP: Pos[] = ['ST', 'WG', 'AM'];
/** 問138：左右をわりふる（SB・WG は1人目が右、2人目が左） */
export function assignLR(s: Side) {
  const seen: Record<string, number> = {};
  for (const x of s.on) { if (x.pos === 'SB' || x.pos === 'WG') { const n = (seen[x.pos] = (seen[x.pos] ?? 0) + 1); x.lr = n === 1 ? 'R' : 'L'; } else x.lr = 'C'; }
}
/** 問138：向き合う相手（右のWGには、相手の左のSB） */
export function opponentOf(D: Side, a: OnPl): OnPl | null {
  const opp = (pos: Pos[], lr: 'L' | 'R' | 'C' | null) => D.on.find((y) => pos.includes(y.pos) && (lr == null || y.lr === lr)) ?? null;
  const flip = a.lr === 'R' ? 'L' : a.lr === 'L' ? 'R' : 'C';
  if (a.pos === 'WG') return opp(['SB'], flip) ?? opp(['SB'], null) ?? opp(['CB'], null);
  if (a.pos === 'SB') return opp(['WG'], flip) ?? opp(['WG'], null);
  if (a.pos === 'ST' || a.pos === 'AM') return opp(['CB'], null) ?? opp(['DM'], null);
  if (a.pos === 'CB') return opp(['ST'], null);
  if (MID.includes(a.pos)) return opp(MID, null);
  return null;
}
export const zoneOf = (a: OnPl): string => (a.pos === 'WG' || a.pos === 'SB' ? (a.lr === 'L' ? 'L' : 'R') : a.pos === 'ST' || a.pos === 'CB' || a.pos === 'AM' ? 'C' : a.pos === 'GK' ? 'G' : 'M');
export const ZONE_NAME: Record<string, string> = { R: '右サイド', L: '左サイド', C: 'ゴール前の競り合い', M: '中盤', G: 'シュート対キーパー' };
/** 問138：その場所で、どれだけ勝っているか（−1〜1） */
export function dom(s: Side, zone: string): number { let w = 0, l = 0; for (const d of s.duels.values()) if (d.zone === zone) { w += d.w; l += d.l; } return (w - l) / (w + l + 5); }
let DOMW: ((x: OnPl) => number) | null = null;
export function chooseKickers(r: Rng, s: Side): Side['kick'] {
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
export const WHY_LINE: Record<string, string> = { 点を取りにいく: '守りの選手を下げて、点を取りにいく。', 守りきる: '前の選手を下げて、守りを固める。', 疲れ: '疲れの見えた選手を休ませる。', ケガ: 'ケガの選手と代える。', イエロー: 'イエローをもらっている選手を下げて、退場をさける。', 退場: '退場のあとの立て直しだ。', 若手: '若手を試す。', オーナーの頼み: '' };
export const WHY_SHORT: Record<string, string> = { 点を取りにいく: '点を取りにいく', 守りきる: '守りきる', 疲れ: '疲れ', ケガ: 'ケガ', イエロー: 'イエローの選手を下げる', 退場: '退場のあとの立て直し', 若手: '若手を試す', オーナーの頼み: 'オーナーの頼み' };
export const ANA_GOOD = ['いい判断です。早めに手を打ちましたね。', 'この交代は効きそうです。監督はよく見ています。', '先に動きましたね。こういう采配が流れを変えます。'];
export const ANA_LATE = ['少し遅いかもしれません。もっと早く動いてもよかった。', 'この時間からだと、苦しいですね。交代が遅れました。'];
const YELLOW_LINE = ['{D} にイエローカード。{A} を倒してしまった。', '審判がカードを出す。{D} にイエロー。', '{A} を止めにいった {D} に、イエローカードが出た。'];
export function fillY(r: Rng, d: Token, a: Token): Line { return fillLine(pickFresh(r, YELLOW_LINE), { D: d, A: a }); }
const DUEL_LINE = ['{Z}は {W} が完全に上回っています。{L} は手を焼いていますね。', '{Z}の勝負は {W} に分があります。{L} はついていけません。', '{Z}、{W} が {L} を何度も上回っています。'];
export function fillDuel(r: Rng, z: string, w: Token, l: Token): Line { return fillLine(pickFresh(r, DUEL_LINE).replace('{Z}', z), { W: w, L: l }); }
export const SP_SCENES = ['corner', 'fk', 'fkcross', 'pk', 'throw', 'setpiece'];
export const SCENE_JP: Record<string, string> = { through: '抜け出し', dribble: 'ドリブル突破', combo: '崩し', cross: 'クロス', mid: 'ミドルシュート', setpiece: 'セットプレー', counter: 'カウンター', loose: 'こぼれ球', pk: 'PK', error: '守りのミス', longball: 'ロングボール', corner: 'コーナーキック', fk: '直接フリーキック', fkcross: 'フリーキック', throw: 'ロングスロー', flow: 'シュート' };
/** 問139：対決の場所（ピッチの図の上の位置。自分が右へ攻める向き） */
export const ZXY: Record<string, [number, number]> = { R: [78, 58], L: [78, 10], C: [90, 34], G: [100, 34], Rd: [26, 58], Ld: [26, 10], Cd: [14, 34], Gd: [4, 34], M: [52, 34] };
/** 問139：シュートの位置（ホームは右のゴールへ攻める） */
export function shotXY(r: Rng, scene: string, k: number): { x: number; y: number } {
  const R = (a: number, b: number) => a + r.next() * (b - a);
  const [d, lat] = scene === 'pk' ? [11, 0] : scene === 'mid' ? [R(18, 28), R(-14, 14)] : scene === 'fk' ? [R(18, 28), R(-12, 12)] : ['cross', 'corner', 'fkcross', 'throw', 'setpiece', 'longball'].includes(scene) ? [R(4, 11), R(-7, 7)] : scene === 'flow' ? [R(16, 30), R(-18, 18)] : [R(6, 16), R(-11, 11)];
  const x = k === 0 ? 105 - d : d; return { x: Math.round(x * 10) / 10, y: Math.round((34 + lat) * 10) / 10 };
}

export function shootout(r: Rng, sides: Side[], ev: Ev[]): [number, number] {
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
export const TUNE = { rTk: 0.035, rDr: 0.06, rDw: 0.07, rDl: 0.08, base: 2.0, shotK: 17, shotMul: 1.13, duelK: 15, late: 0.8, len0: 3, len1: 12, miss: 0.5, flowShot: 0.055, rK: 0.86, offside: 0.028, pass: 0.8, rPc: 0.0035, rPm: 0.015, flows: 3, yel: 0.135, pkP: 0.025, fkP: 0.08, ckP: 0.35 };

/* ---------- 記録（出場・疲れ・ケガ・ゴール） ---------- */
export function record(r: Rng, sides: Side[], log: Chance[], label: string, rt: Map<Player, number>, comp: Comp, injured: Map<Player, number>) {
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
export function buildView(sides: Side[], log: Chance[], ev: Ev[], score: [number, number], pk: [number, number] | null, big: boolean, title: string, rt: Map<Player, number>): MatchView {
  const toItem = (c: Chance): ViewItem => ({
    min: c.min, kind: c.goal ? 'goal' : 'chance', me: sides[c.k].t.me, lines: c.text, sec: c.sec, secs: c.secs, hv: c.hv,
    goal: c.goal ? { scorer: c.att.p.name, score: c.score!, flow: c.flow ?? null, mem: !!c.mem, team: sides[c.k].t.name, me: sides[c.k].t.me } : undefined,
  });
  /* 並べる順：前ふり → キックオフなど → 場面 → 場面のあとのひとこと → 試合終了の笛 */
  const ordOf = (e: Ev) => (e.pre ? -2 : e.after ? 6 : e.kind === 'talk' ? (e.t >= 90 ? 8 : 0) : 3);
  const evItem = (e: Ev): ViewItem => ({ min: e.t, kind: e.kind, me: e.me, lines: [e.text], who: e.who, ord: ordOf(e), sec: e.sec });
  /* 見どころ（問63）：ゴールは全部、守りの見せ場、流れが変わった場面、記念の場面、残りは惜しい場面 */
  const goals = log.filter((x) => x.goal);
  const flows = ev.filter((e) => e.kind === 'flow');
  const memos = ev.filter((e) => e.kind === 'memo').slice(0, 2);
  const meK = sides[0].t.me ? 0 : sides[1].t.me ? 1 : -1;
  void meK;
  /* 新しいエンジン：ゴールは全部。ほかは場面の大きさ（シュートの質・枠内・ポスト・PK）の大きい順 */
  const want = big ? 9 : 7;
  const chosen = new Set<Chance>(goals);
  for (const n of log.filter((x) => !x.goal && (x.hv ?? 0) > 0).sort((a, b) => (b.hv ?? 0) - (a.hv ?? 0))) { if (chosen.size >= Math.max(goals.length + 3, want)) break; chosen.add(n); }
  const hl: ViewItem[] = [...chosen].map(toItem);
  for (const f of flows) hl.push(evItem(f));
  for (const m of memos) hl.push(evItem(m));
  /* 問121 C・問122：見どころにも、前ふり・前半のふり返り・ゴールのあとのひとこと、自分の選手のいいプレー（2〜3場面）を入れる */
  for (const e of ev.filter((x) => x.hl)) { if (e.after && e.who === '実況' && e.t !== 45 && !hl.some((h) => h.min === e.t && h.kind === 'goal') && !/同点のまま|どちらに転ぶ|ため息/.test(String(e.text[0]))) continue; hl.push(evItem(e)); }
  const goods = ev.filter((x) => x.good); for (const e of goods.filter((_, i) => i % Math.max(1, Math.floor(goods.length / 3)) === 0).slice(0, 3)) hl.push(evItem(e));
  const ordV = (x: ViewItem) => x.ord ?? (x.kind === 'memo' ? 2 : 3);
  const secOf = (x: ViewItem) => x.sec ?? (x.min <= 0 ? 0 : (x.min - 1) * 60 + 30);
  hl.sort((a, b) => a.min - b.min || secOf(a) - secOf(b) || ordV(a) - ordV(b));
  const full: ViewItem[] = [...log.map(toItem), ...ev.map(evItem)].sort((x, y) => x.min - y.min || secOf(x) - secOf(y) || ordV(x) - ordV(y));
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
    chances: [log.filter((x) => x.k === 0 && x.ok).length, log.filter((x) => x.k === 1 && x.ok).length],
    scorers: goals.map((c) => ({ name: c.att.p.name, min: c.min, me: sides[c.k].t.me })),
    played,
    mom: momOf(sides, rt),
    orders: meSide ? meSide.t.squad.filter((p) => p.ord && meSide.t.heard?.has(p.id)).map((p) => ({ name: p.name, kind: p.ord!.kind, heard: !!meSide.t.heard!.get(p.id) })) : undefined,
  };
}

/* ---------- 1分ごとのボールの動き（問107） ---------- */
export const FWD: Pos[] = ['AM', 'WG', 'ST'];
export function stOf(s: { st: Map<Player, St> }, p: Player): St { let x = s.st.get(p); if (!x) { x = zeroSt(); s.st.set(p, x); } return x; }
export function subMin(s: Side, off: Player, on: Player, min: number) { stOf(s, off).to = min; const x = stOf(s, on); x.from = min; x.to = 90; }
export function rateOne(st: St, pos: Pos, ga: number, res: number): number {
  const DEFS: Pos[] = ['CB', 'SB'];
  let v = 6.0;
  v += st.g * (DEFS.includes(pos) || pos === 'DM' ? 1.2 : 0.95) + st.as * 0.6 + st.kp * 0.15;
  v += st.ot * 0.1 - (st.sh - st.ot) * 0.03;
  v += st.pc * TUNE.rPc - (st.pa - st.pc) * TUNE.rPm;
  /* 問135：カードで下がる・PKを止めると上がる・PKを与えると下がる */
  v += -(st.yc ?? 0) * 0.3 - (st.rc ?? 0) * 1.2 + (st.psv ?? 0) * 0.6 - (st.pkc ?? 0) * 0.35 - (st.fo ?? 0) * 0.03;
  v += st.tk * TUNE.rTk + st.dr * TUNE.rDr + st.dw * TUNE.rDw - st.dl * TUNE.rDl;
  if (pos === 'GK') v += st.sv * 0.33 - ga * 0.35 + (ga === 0 ? 0.45 : 0);
  else if (DEFS.includes(pos)) v += -ga * 0.15 + (ga === 0 ? 0.35 : 0);
  else if (pos === 'DM') v += -ga * 0.07 + (ga === 0 ? 0.15 : 0);
  v += res * 0.25;
  const mins = Math.max(1, st.to - st.from);
  v = 6 + (v - 6) * Math.min(1, 0.45 + mins / 50);
  v = 6.4 + (v - 6.4) * TUNE.rK - 0.17;
  return Math.round(clamp(v, 3, 10) * 10) / 10;
}
export function rateAll(sides: Side[], score: [number, number]): Map<Player, number> {
  const out = new Map<Player, number>();
  sides.forEach((s, k) => {
    const res = Math.sign(score[k] - score[1 - k]);
    for (const x of [...s.on, ...s.offs]) { const st = stOf(s, x.p); out.set(x.p, rateOne(st, x.pos, gaWhile(sides[1 - k], st), res)); }
  });
  return out;
}
/** その選手がピッチにいた間に取られた点 */
export function gaWhile(o: Side, st: St): number { let n = 0; for (const x of o.st.values()) n += x.g; return st.from === 0 && st.to === 90 ? n : Math.round(n * (st.to - st.from) / 90); }
export function momOf(sides: Side[], rt: Map<Player, number>) {
  let best: { name: string; me: boolean; rt: number; club: string } | undefined; let bv = -1;
  for (const s of sides) for (const x of [...s.on, ...s.offs]) { const v = (rt.get(x.p) ?? 0) + stOf(s, x.p).g * 0.01; if (v > bv) { bv = v; best = { name: x.p.name, me: s.t.me, rt: rt.get(x.p) ?? 6, club: s.t.name }; } }
  return best;
}
