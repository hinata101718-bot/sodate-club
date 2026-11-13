/* 試合のエンジン（FM型）
   22人とボールを、試合の時間で少しずつ動かす。結果は、この動きの中から生まれる
   - 選手の立ち位置：役割のふだんの位置＋実データから学んだずれ（SkillCorner）＋戦術（ラインの高さ・幅・プレス・マーク・裏への走り）
   - ボールを持った選手：実データの行き先（StatsBomb）から候補を出し、能力・まわりの相手・戦術で一番よさそうなものを選ぶ（IQが高いほど上手に選ぶ）
   - パス・ドリブル・タックル・クロスの競り合い・シュートとキーパー・ファウル・カード・セットプレー・オフサイド・ケガ・疲れ・交代
   - 特殊能力は、それが関わる場面の能力にのる。働いたら実況に札で出る
   - 実況は、このエンジンで起きたプレーから作る（言い回しは phrases.ts・commentary.ts）
   - 試合の途中で、並び方・戦い方・攻めと守りの方針・交代を変えられる（PC版の画面から） */
import { obeyChance, youthBonus } from './bond';
import type { Rng } from './rng';
import { APTF, FORM, FORM_ATK, STYLES, type Pos, type StyleName } from './constants';
/* よく使うものは、この中に置く（速さのため） */
const SPD = 0, SHT = 1, PAS = 2, DRI = 3, PHY = 4, DEF = 5, STA = 6, IQ = 7;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const sig = (x: number) => 1 / (1 + Math.exp(-x));
import { SP_MAP, type Fx, type Step } from './data/specials';
import { ovr, posRating, teamStrength } from './player';
import type { Line, MatchView, Player, Token } from './types';
import { roleKey, roleAnchor, roleSpeed, filled, zoneData, passTarget, carryTarget, GRID } from './movement';
const NBX = GRID.nbx, NBY = GRID.nby, CW = 105 / NBX, CH = 68 / NBY;
const SH3: [number, number, number] = [0, 0, 0];
/** 学んだずれの表から、ボールの位置のずれを読む（となりのマスとならす）。movement.ts の gridShift と同じ */
function gridShift(g: Float32Array, bx: number, by: number): [number, number, number] {
  let fx = bx / CW - 0.5, fy = by / CH - 0.5; fx = fx < 0 ? 0 : fx > NBX - 1.001 ? NBX - 1.001 : fx; fy = fy < 0 ? 0 : fy > NBY - 1.001 ? NBY - 1.001 : fy;
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j; const i1 = i + 1 < NBX ? i + 1 : i, j1 = j + 1 < NBY ? j + 1 : j;
  const a = (i * NBY + j) * 3, b = (i1 * NBY + j) * 3, c = (i * NBY + j1) * 3, d = (i1 * NBY + j1) * 3;
  const w0 = (1 - u) * (1 - v), w1 = u * (1 - v), w2 = (1 - u) * v, w3 = u * v;
  SH3[0] = g[a] * w0 + g[b] * w1 + g[c] * w2 + g[d] * w3; SH3[1] = g[a + 1] * w0 + g[b + 1] * w1 + g[c + 1] * w2 + g[d + 1] * w3; SH3[2] = g[a + 2] * w0 + g[b + 2] * w1 + g[c + 2] * w2 + g[d + 2] * w3;
  return SH3;
}
import { PH } from './phrases';
import { resetPhrases, playLine, goalComment, LATE_TIE, pickFresh, fillLine, preTalk, halfTalk, fullTalk, type PlayKind, type Who, type MicLine } from './commentary';
import {
  banned, chooseForm, pickLineup, fixedLineup, tacOf, defLean, mgrShort, youthBias, zeroSt, stOf, subMin, assignLR, opponentOf, zoneOf, ZONE_NAME, chooseKickers,
  fillY, fillDuel, shootout, record, buildView, rateAll, WHY_LINE, WHY_SHORT, ANA_GOOD, ANA_LATE, SP_SCENES, SCENE_JP, ZXY, DEFP, ATKP, has, hasBad,
  type TeamIn, type MatchOpts, type MatchResult, type OnPl, type Side, type Chance, type Ev, type Comp, type St, type Fire,
} from './match';

/* ---------- 調整用の数字（scripts/simcal.ts で確かめる） ---------- */
export const SIM = {
  dt: 0.5, liveDt: 0.25, tgt: 1.0, gap: 3.0, passK: 16, passB: 0.55, lineRisk: 2.4, shotW: 1.0, shotB: -0.03, xgSht: 25, xgK: 22, xgOff: 8, crowd: 0.8, decK: 2.5, tau: 0.0065, foul: 0.07, yel: 0.12, takeK: 12,
  tackleRate: 0.13, tackleB: -0.8, runP: 0.05, offside: 0.18, block: 0.42, cand: 4,
};

/* 戦い方ごとのくせ */
interface StyleP { lineOut: number; lineIn: number; press: number; pressMax: number; tempo: number; risk: number; fwd: number; long: number; wide: number; cross: number; foul: number; width: number; gk: 'short' | 'long' | 'mix' }
export const SP: Record<StyleName, StyleP> = {
  'ポゼッション': { lineOut: 2, lineIn: 1, press: 1, pressMax: 78, tempo: 1.0, risk: 1.2, fwd: 0, long: -0.007, wide: 0, cross: -0.004, foul: 1, width: 1.05, gk: 'short' },
  'ロングカウンター': { lineOut: -5, lineIn: 1, press: 1, pressMax: 56, tempo: 0.85, risk: 0.85, fwd: 0.012, long: 0.004, wide: 0, cross: 0, foul: 1, width: 1, gk: 'long' },
  'サイドアタック': { lineOut: 0, lineIn: 0, press: 1, pressMax: 70, tempo: 0.95, risk: 1.0, fwd: 0.003, long: 0, wide: 0.005, cross: 0.012, foul: 1, width: 1.16, gk: 'mix' },
  'ローブロック': { lineOut: -6, lineIn: -2, press: 1, pressMax: 52, tempo: 1.0, risk: 1.1, fwd: 0.012, long: 0.002, wide: 0, cross: 0, foul: 0.9, width: 0.95, gk: 'long' },
  'ゲーゲンプレス': { lineOut: 6, lineIn: 2, press: 2, pressMax: 88, tempo: 0.85, risk: 0.95, fwd: 0.004, long: 0, wide: 0, cross: 0, foul: 1.25, width: 1, gk: 'mix' },
};

/** 選手（ピッチの上の1人） */
export interface Ag {
  k: 0 | 1; i: number; o: OnPl; role: string; ax: number; ay: number;
  x: number; y: number; px: number; py: number; vx: number; vy: number; tx: number; ty: number; sprint: boolean;
  en: number; e: number[]; vmax: number; stun: number; runUntil: number; rx: number; ry: number; out: boolean; fx: Fx[]; ph: number;
  /** 特殊能力のしるし（毎回さがさない） */
  eng: boolean; stb: boolean; lazy: boolean; ovl: boolean; late2: boolean; drain: number; G: Float32Array[] | null;
}
type BallSt = 'held' | 'air' | 'loose' | 'dead';
interface Item { id: number; k: 0 | 1; sec: number; lines: Line[]; secs: number[]; scene: string; att: Ag | null; assist: Ag | null; def: Ag | null; shot: boolean; ok: boolean; goal: boolean; save: boolean; hv: number; xg: number; min: number }
export interface Tap { T: number; clk: number; half: number; min: number; line: Line; kind: string; me: boolean; who?: string; gid?: number; k?: 0 | 1; goal?: [number, number]; imp?: boolean }
export interface SimOrder { form?: string; style?: StyleName; tilt?: 'atk' | 'def' | null }

const ZERO3: [number, number, number] = [0, 0, 3];
const tc = (k: number, x: number, y: number): [number, number] => (k === 0 ? [x, y] : [105 - x, 68 - y]);
const hyp = (a: number, b: number) => Math.sqrt(a * a + b * b);
/** その場所からのシュートの入りやすさ（ゴールの見える角度と距離） */
export function xgAt(x: number, y: number): number {
  const dx = Math.max(0.5, 105 - x), dy = y - 34;
  const th = Math.abs(Math.atan2(dy + 3.66, dx) - Math.atan2(dy - 3.66, dx));
  return sig(-3.0 + 3.2 * th - 0.035 * hyp(dx, dy));
}
/** その場所でボールを持っていることの値打ち（点につながりやすさ） */
const V = (x: number, y: number) => 0.01 + 0.6 * xgAt(x, y) + 0.03 * (x / 105) ** 2;
const logit = (p: number) => Math.log(p / (1 - p));

export class MatchSim {
  r: Rng; opts: MatchOpts; sides: Side[]; ags: Ag[] = []; mic: boolean; live: boolean;
  /** 時計（秒）・前半か後半か・止まらない時間（予定に使う） */
  clk = 0; half = 1; T = 0; over = false; add = [0, 0]; stopAcc = 0;
  ball = { x: 52.5, y: 34, px: 52.5, py: 34, st: 'dead' as BallSt, h: null as Ag | null, fx: 52.5, fy: 34, tx: 52.5, ty: 34, t0: 0, t1: 0, high: false, last: 0 as 0 | 1, land: null as null | (() => void), rcv: null as Ag | null };
  due = 0; carry: { tx: number; ty: number; until: number } | null = null;
  restart: { at: number; kind: string; k: 0 | 1; x: number; y: number; taker: Ag | null; lim?: number } | null = null;
  poss: 0 | 1 = 0; possT: [number, number] = [0, 0]; possHalf: [number, number] = [0, 0];
  seq = { k: 0 as 0 | 1, t0: 0, x0: 50, passes: 0, lastPass: '' as string, assist: null as Ag | null, beaten: null as Ag | null, won: null as Ag | null, press: false, from: '' as string, spk: '' as string };
  cur: Item | null = null; log: Chance[] = []; ev: Ev[] = []; items: Item[] = [];
  pg: number[] = Array(92).fill(0); marks: { min: number; kind: 'goal' | 'red' | 'sub'; side: 0 | 1 }[] = [];
  injured = new Map<Player, number>(); lastGoal = -99; lateTie = false; nextPlay = 0; lastMin = 0;
  oline: [number, number] = [70, 70];
  subQ: { k: 0 | 1; off: Player; on: Player; pos?: Pos }[] = [];
  autoSub: [boolean, boolean] = [true, true]; ord: [SimOrder, SimOrder] = [{}, {}];
  frames: { t: number; p: Float32Array }[] = [];
  /** 見どころ（画面の「見どころだけ」用）：時計の秒・大きさ */
  hlNew: { T: number; start: number; hv: number }[] = [];
  xi0: MatchView['lineups'];
  /** 画面用：出た順の実況の行（T は止まらない時間。画面はこの時刻になったら出す） */
  tap: Tap[] = []; private gid = 0;
  /** 画面用：音を鳴らす出来事（T は止まらない時間）。kick・shot・save・miss・post・block・goal・foul・card・kickoff・half・end */
  sfx: { T: number; s: string; k: number; v: number }[] = []; private noKick = false;
  private fx(s: string, k: number, v = 1, T = this.T) { if (!this.live) return; this.sfx.push({ T, s, k, v }); if (this.sfx.length > 600) this.sfx.splice(0, 200); }
  pkRes: [number, number] | null = null; result: MatchResult | null = null;
  /** いちばん前でボールを奪いにいく選手（この選手だけがタックルする） */
  p1: [Ag | null, Ag | null] = [null, null];
  /** 守りの質（フィールドの選手のディフェンスとIQの平均）。パスの通りやすさをくらべる相手 */
  dq: [number, number] = [60, 60];
  lastShot: [number, number] = [0, 0];
  private tgtT = 0; private frameT = 0; private ace: [Ag | null, Ag | null] = [null, null];

  constructor(r: Rng, home: TeamIn, away: TeamIn, opts: MatchOpts = {}, live = false) {
    this.r = r; this.opts = opts; this.live = live;
    const comp: Comp = opts.cup ? 'C' : 'L';
    home.comp = comp; away.comp = comp;
    this.sides = [home, away].map((t, ix) => {
      const myS = teamStrength(t.squad), opS = teamStrength((ix ? home : away).squad);
      const fx = t.fixed;
      const form = fx ? fx.form : chooseForm(t.mgr, myS, opS, t.squad.filter((p) => !banned(p, comp)), t.tilt);
      const { lineup, bench } = fx && !fx.auto ? fixedLineup(t, form, fx.xi) : pickLineup(r, t, form);
      if (t.me && t.kickReq) t.kickOk = fx ? true : r.next() < Math.min(0.95, obeyChance(t.mgr.obey, 1) + 0.15);
      const s: Side = { t, home: ix === 0 && !opts.neutral, day: (r.next() - 0.5) * 8, style: fx ? fx.style : t.mgr.style, form, on: lineup, bench, subs: 0, goals: 0, str: myS, offs: [], changed: !!fx, st: new Map(lineup.map((x) => [x.p, zeroSt()])),
        men: 11, moUntil: -1, fouls: 0, corners: 0, offsides: 0, cards: [], shots: [], windows: 0, subLog: [], lastAct: 0, duels: new Map(), cover: new Set(), kick: { ck: null, fk: null, pk: null }, banStart: t.squad.filter((p) => banned(p, comp)) };
      assignLR(s); s.kick = chooseKickers(r, s); return s;
    });
    this.mic = home.me || away.me;
    this.ord = [{ tilt: home.tilt ?? null }, { tilt: away.tilt ?? null }];
    this.xi0 = this.sides.map((s) => s.on.map((x) => ({ name: x.p.name, num: x.p.num, pos: x.pos, lr: x.lr ?? 'C' }))) as MatchView['lineups'];
    this.sides.forEach((s, k) => s.on.forEach((o, i) => this.ags.push(this.mkAg(k as 0 | 1, i, o))));
    this.placeRoles(0); this.placeRoles(1);
    for (const a of this.ags) this.refresh(a);
    this.calcDq();
    this.ace = [0, 1].map((k) => [...this.team(k)].sort((x, y) => ovr(y.o.p) - ovr(x.o.p))[0] ?? null) as [Ag | null, Ag | null];
    if (this.mic) resetPhrases();
    this.pre();
    this.kickoff(0, true);
  }

  /* ================= 選手 ================= */
  private mkAg(k: 0 | 1, i: number, o: OnPl): Ag {
    const fx: Fx[] = []; for (const s of o.p.sp) { const d = SP_MAP[s]; if (d) fx.push(...d.fx); }
    const a: Ag = { k, i, o, role: 'CM-C', ax: 50, ay: 34, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, tx: 0, ty: 0, sprint: false, en: clamp(1 - o.p.fat / 420, 0.7, 1), e: [], vmax: 7, stun: 0, runUntil: 0, rx: 0, ry: 0, out: false, fx, ph: this.r.next() * 6.28, eng: false, stb: false, lazy: false, ovl: false, late2: false, drain: 1, G: null };
    this.flags(a); return a;
  }
  private flags(a: Ag) {
    const o = a.o; a.eng = has(o, 'エンジン'); a.stb = hasBad(o, 'スタミナ切れ'); a.lazy = hasBad(o, '守備をサボる'); a.ovl = o.pos === 'SB' && has(o, '攻撃参加'); a.late2 = (o.pos === 'AM' || o.pos === 'CM') && has(o, '2列目からの飛び出し');
    a.drain = (1.3 - o.p.a[STA] / 100) * (a.eng ? 0.55 : 1) * (a.stb ? 1.6 : 1);
  }
  private tm: Ag[][] = [[], []]; private tmOk = false;
  team(k: number): Ag[] { if (!this.tmOk) { this.tm = [0, 1].map((q) => this.ags.filter((a) => a.k === q && !a.out)); this.tmOk = true; } return this.tm[k]; }
  /** 並び方から、役割とふだんの位置を決める（実データの役割の位置を使う） */
  private placeRoles(k: number) {
    const s = this.sides[k]; const ags = this.ags.filter((a) => a.k === k && !a.out);
    const tot: Record<string, number> = {}; const cnt: Record<string, number> = {};
    for (const a of ags) if (a.o.lr === 'C' || !a.o.lr) tot[a.o.pos] = (tot[a.o.pos] ?? 0) + 1;
    const nCB = ags.filter((a) => a.o.pos === 'CB').length;
    const BASE_X: Record<Pos, number> = { GK: 10, CB: 33, SB: 40, DM: 46, CM: 50, AM: 57, WG: 56, ST: 62 };
    for (const a of ags) {
      const x = a.o; let lr: string = x.lr ?? 'C'; let ay: number;
      if (lr === 'C') { const n = tot[x.pos]; const i = (cnt[x.pos] = (cnt[x.pos] ?? 0) + 1) - 1; lr = n === 1 ? 'C' : n === 2 ? (i === 0 ? 'L' : 'R') : (['L', 'C', 'R'][i] ?? 'C'); const w = x.pos === 'CB' ? (n >= 3 ? 14 : 8) : 9; ay = n === 1 ? 34 : 34 - w + ((2 * w) / Math.max(1, n - 1)) * i; }
      else ay = 34 + (lr === 'R' ? 1 : -1) * (x.pos === 'WG' ? 17 : 18);
      a.role = roleKey(x.pos, lr); a.G = filled(a.role);
      const an = roleAnchor(a.role);
      let ax = an ? an[0] : BASE_X[x.pos];
      if (an && x.lr !== 'C' && x.lr) ay = an[1];
      if (x.pos === 'SB' && nCB >= 3) ax += 8;
      if (x.pos === 'CM') ax = Math.max(ax, 50);
      if (x.pos === 'GK') { ax = 8; ay = 34; }
      a.ax = ax; a.ay = ay; a.vmax = Math.min(8.6, roleSpeed(a.role) * 0.55 + 2.4 + x.p.a[SPD] * 0.035);
    }
    void s;
  }
  /** その選手の今の力（疲れ・調子・ホーム・戦い方・特殊能力の時間のもの）。1分ごとに作り直す */
  private refresh(a: Ag) {
    const s = this.sides[a.k]; const p = a.o.p; const ap = APTF[p.apt[a.o.pos]];
    const drop = (1 - a.en) * 30; const early = this.clk < 900 && this.half === 1;
    const tilt = this.tiltOf(a.k);
    const coach = DEFP.includes(a.o.pos) && this.team(a.k).some((x) => x.o.pos === 'GK' && has(x.o, 'コーチング'));
    for (let i = 0; i < 8; i++) {
      let v = p.a[i] * ap + p.cond * 2.2 - drop - p.fat * 0.04 + (s.home ? 2 : 0) + s.day;
      if (early && has(a.o, '立ち上がりに強い')) v += 3;
      if (early && hasBad(a.o, 'スロースターター')) v -= 4;
      if (p.age <= 23 && p.exp < 40 && !has(a.o, '吸収力')) v -= 4 * (1 - p.exp / 40);
      if (STYLES[s.style].key.includes(i)) v += 1.5;
      if (tilt === 'def' && (i === DEF || i === IQ)) v += 2;
      if (tilt === 'atk' && i === DEF) v -= 2.5;
      if (a.o.sub && has(a.o, 'スーパーサブ')) v += 3;
      if (coach && (i === DEF || i === IQ)) v += 1.5;
      a.e[i] = v;
    }
  }
  private E(a: Ag, i: number, scene = '') {
    let v = a.e[i];
    if (i === IQ && hasBad(a.o, '判断が遅い') && (scene === 'combo' || scene === 'counter')) v -= 5;
    if (i === PHY && hasBad(a.o, '空中戦が苦手') && (scene === 'cross' || scene === 'setpiece' || scene === 'longball')) v -= 6;
    return v;
  }
  private air(a: Ag, scene: string) { return this.E(a, PHY, scene) + (a.o.p.height - 180) * 0.25; }
  /** 特殊能力の上のせ。働いたら fires に入れる（実況の札） */
  private bonus(a: Ag, step: Step, scene: string, role: 'att' | 'def', fires?: Fire[]): number {
    let b = 0;
    for (const f of a.fx) {
      if (f.side !== role || f.step !== step || !f.scenes.includes(scene)) continue;
      let v = f.b;
      const opp = this.team(1 - a.k).find((x) => has(x.o, 'マンマーク'));
      if (role === 'att' && opp && this.ace[a.k] === a) { v *= 0.5; if (fires && !fires.some((u) => u.sp === 'マンマーク')) fires.push({ sp: 'マンマーク', t: opp.o.p.name, me: this.sides[opp.k].t.me }); }
      b += v;
      const name = a.o.p.sp.find((s) => SP_MAP[s]?.fx.includes(f)) ?? '';
      if (fires && name && !fires.some((u) => u.sp === name && u.t === a.o.p.name)) fires.push({ sp: name, t: a.o.p.name, me: this.sides[a.k].t.me, gk: a.o.pos === 'GK' && role === 'def', step });
    }
    return b;
  }
  tiltOf(k: number): 'atk' | 'def' | null {
    const s = this.sides[k], o = this.sides[1 - k]; const base = this.ord[k].tilt ?? null;
    if (s.t.me && s.t.fixed) return base;
    const mm = this.minute(); const lead = s.goals - o.goals;
    if (lead < 0 && mm >= 70) return 'atk';
    if (lead > 0 && mm >= 75 - defLean(s.t.mgr) * 6) return 'def';
    return base;
  }
  minute() { return this.half === 1 ? Math.min(45, Math.floor(this.clk / 60) + 1) : Math.min(90, Math.floor(this.clk / 60) + 1); }
  sp(k: number) { return SP[this.sides[k].style]; }

  /* ================= 1歩すすめる ================= */
  step(dt = this.live ? SIM.liveDt : SIM.dt) {
    if (this.over) return;
    const B = this.ball;
    B.px = B.x; B.py = B.y;
    for (const a of this.ags) { a.px = a.x; a.py = a.y; }
    /* つぎの出来事（判断・ボールが着く・再開・立ち位置の見直し・1分の区切り）まで、ちょうどの時間ですすめる */
    const end = this.T + dt; let guard = 0;
    while (!this.over && this.T < end - 1e-9 && guard++ < 60) {
      let nx = end;
      if (B.st === 'held' && B.h) nx = Math.min(nx, this.carry ? this.carry.until : this.due);
      else if (B.st === 'air' || B.st === 'loose') nx = Math.min(nx, B.t1);
      else if (B.st === 'dead' && this.restart) nx = Math.min(nx, this.restart.at);
      nx = Math.min(nx, this.tgtT, this.T + (60 - (this.clk % 60)) + 1e-6);
      this.adv(Math.max(1e-3, nx - this.T));
    }
    if (this.live && this.T >= this.frameT) { this.frameT = this.T + 0.2; this.snap(); }
  }
  private adv(h: number) {
    const B = this.ball;
    this.T += h; this.clk += h;
    if (B.st !== 'dead') { this.possT[this.poss] += h; if (this.half === 1) this.possHalf[this.poss] += h; }
    this.move(h);
    /* 1分ごと */
    if (Math.floor(this.clk / 60) !== this.lastMin) { this.lastMin = Math.floor(this.clk / 60); this.perMinute(this.minute()); if (this.over) return; }
    /* 前半・後半の終わり（ボールが危ない場所にないとき） */
    const endAt = (this.half === 1 ? 2700 : 5400) + this.add[this.half - 1] * 60;
    if (this.clk >= endAt) {
      const bx = this.poss === 0 ? B.x : 105 - B.x;
      const calm = B.st === 'dead' ? !this.restart || !['corner', 'pk', 'fk'].includes(this.restart.kind) : bx < 72 || (B.st === 'held' && this.clk >= endAt + 20);
      if (calm || this.clk >= endAt + 40) { if (this.half === 1) this.halftime(); else { this.fulltime(); return; } }
    }
    /* ボール */
    if (B.st === 'dead') {
      if (this.restart && this.T >= this.restart.at - 1e-9) this.doRestart();
      else this.roll();
    } else if (B.st === 'air' || B.st === 'loose') {
      const u = clamp((this.T - B.t0) / Math.max(0.05, B.t1 - B.t0), 0, 1); const e = B.st === 'air' ? u : 1 - (1 - u) ** 2;
      B.x = B.fx + (B.tx - B.fx) * e; B.y = B.fy + (B.ty - B.fy) * e;
      if (u >= 1 - 1e-9) { const f = B.land; B.land = null; if (f) f(); else if (B.st === 'air') this.looseTo(B.x, B.y, 0.3); }
    } else if (B.st === 'held' && B.h) {
      const hd = B.h; const dir = hd.k === 0 ? 1 : -1; B.x = hd.x + dir * 0.6; B.y = hd.y;
      this.pressure(hd, h);
      if (B.st === 'held' && B.h === hd) {
        if (this.carry && (this.T >= this.carry.until - 1e-9 || hyp(hd.x - this.carry.tx, hd.y - this.carry.ty) < 0.8)) { this.carry = null; this.due = Math.min(this.due, this.T + 0.2); }
        if (this.T >= this.due - 1e-9 && !this.carry) this.decide(hd);
      }
    }
    /* 選手の行き先 */
    if (this.T >= this.tgtT - 1e-9) { this.tgtT = this.T + (this.ball.st === 'dead' ? SIM.tgt * 2 : SIM.tgt); this.targets(); }
  }
  /** 試合の終わりまで（見ないで進めるとき） */
  run() {
    let n = 0;
    while (!this.over && n++ < 40000) {
      /* 見ない試合：ボールが止まっている間は、大きめにすすめる */
      this.step();
    }
    return this.finish();
  }

  private snap() {
    const p = new Float32Array(this.ags.length * 2 + 2);
    this.ags.forEach((a, i) => { p[i * 2] = a.x; p[i * 2 + 1] = a.y; });
    p[this.ags.length * 2] = this.ball.x; p[this.ags.length * 2 + 1] = this.ball.y;
    this.frames.push({ t: this.T, p }); if (this.frames.length > 260) this.frames.splice(0, this.frames.length - 260);
  }

  /* ================= 立ち位置 ================= */
  private targets() {
    const B = this.ball;
    const inPoss = (k: number) => (B.st === 'held' || B.st === 'air' ? this.poss === k : B.st === 'loose' ? B.last === k : this.restart ? this.restart.k === k : false);
    /* 守りのライン（オフサイドライン）：チームの向きで、うしろから2人目 */
    for (let k = 0; k < 2; k++) {
      let m1 = -1, m2 = -1;
      for (const a of this.team(1 - k)) { const x = k === 0 ? a.x : 105 - a.x; if (x > m1) { m2 = m1; m1 = x; } else if (x > m2) m2 = x; }
      this.oline[k] = Math.max(52.5, m2 < 0 ? 80 : m2, (k === 0 ? B.x : 105 - B.x) - 0.01);
    }
    const holder = B.st === 'held' ? B.h : null;
    const ch = B.st === 'loose' ? this.chasers() : null;
    for (let k = 0 as 0 | 1; k < 2; k = (k + 1) as 0 | 1) {
      const st = this.sp(k); const own = inPoss(k); const f = k === 0;
      const bx = f ? B.x : 105 - B.x, by = f ? B.y : 68 - B.y;
      const tilt = this.tiltOf(k); const tl = tilt === 'atk' ? 3 : tilt === 'def' ? -3 : 0;
      const ags = this.team(k); const low = st === SP['ローブロック'];
      /* プレス：ボールに一番近い1〜2人が寄せる */
      let p1: Ag | null = null, p2: Ag | null = null;
      if (!own && holder && holder.k !== k && (bx <= st.pressMax || bx < 30)) {
        let d1 = 1e9, d2 = 1e9;
        for (const a of ags) { if (a.o.pos === 'GK' || this.T < a.stun) continue; const d = hyp(a.x - B.x, a.y - B.y); if (d < d1) { d2 = d1; p2 = p1; d1 = d; p1 = a; } else if (d < d2) { d2 = d; p2 = a; } }
        if ((bx < 30 ? 2 : st.press) < 2) p2 = null;
      }
      if (!own) this.p1[k] = p1;
      const hx = holder ? (f ? holder.x : 105 - holder.x) : 0, hy = holder ? (f ? holder.y : 68 - holder.y) : 0;
      const attackers = this.team(1 - k);
      for (const a of ags) {
        a.sprint = false;
        if (a === holder) {
          if (this.carry) { a.tx = this.carry.tx; a.ty = this.carry.ty; a.sprint = true; }
          else { a.tx = a.x + (f ? 0.3 : -0.3); a.ty = a.y; }
          continue;
        }
        if (this.restart && this.restart.taker === a) { a.tx = this.restart.x; a.ty = this.restart.y; a.sprint = true; continue; }
        if (B.rcv === a && B.st === 'air') { a.tx = B.tx; a.ty = B.ty; a.sprint = true; continue; }
        if (ch && (ch[0] === a || ch[1] === a)) { a.tx = B.tx; a.ty = B.ty; a.sprint = true; continue; }
        let x: number, y: number;
        if (a.o.pos === 'GK') {
          x = clamp(3 + Math.max(0, bx - 22) * 0.15, 2.5, own ? 22 : 17); y = 34 + (by - 34) * 0.22;
        } else {
          const sh = a.G ? gridShift(a.G[own ? 1 : 0], bx, by) : ZERO3;
          const line = own ? st.lineIn + tl : st.lineOut + tl * 0.7;
          const isDef = a.o.pos === 'CB' || a.o.pos === 'SB' || a.o.pos === 'DM';
          x = a.ax + sh[0] + line * (isDef ? 1 : 0.6); y = a.ay + sh[1];
          if (own && isDef && a.o.pos !== 'CB') x += tl > 0 ? 5 : tl < 0 ? -3 : 0;
          const j = Math.min(1.6, sh[2] * 0.12);
          if (own) { y = 34 + (y - 34) * st.width * (a.ovl ? 1.08 : 1); if (a.ovl) x += 6; }
          else { if (a.lazy) x += 9; if (a.late2) x += 3; if ((low || st === SP['ロングカウンター']) && (a.o.pos === 'ST' || a.o.pos === 'WG')) x += low ? 7 : 4; }
          if (this.live) { x += Math.sin(a.ph + this.T / 7) * j; y += Math.cos(a.ph * 1.3 + this.T / 9) * j; } else { x += (a.ph - 3.14) * j * 0.3; }
          if (own) {
            /* 裏へ走る */
            if (this.T < a.runUntil) { x = a.rx; y = a.ry; a.sprint = true; }
            else {
              x = Math.min(x, this.oline[k] - 0.4);
              const pz = a.o.pos;
              if (holder && holder.k === k && bx > 38 && (pz === 'ST' || pz === 'WG' || pz === 'AM' || a.late2) && this.r.next() < SIM.runP * (a.e[IQ] / 65) * (a.e[SPD] / 65) * (a.late2 ? 1.5 : 1)) {
                a.runUntil = this.T + 2.5 + this.r.next() * 1.5; a.rx = Math.min(99, this.oline[k] + 5 + this.r.next() * 9); a.ry = clamp(a.ay + (this.r.next() - 0.5) * 14, 6, 62);
              }
            }
          } else {
            /* マーク：近くの相手の、ゴール側に立つ */
            let bd = 13, ox = 0, oy = 0;
            if (Math.abs(x - bx) < 42) for (const o of attackers) { const qx = f ? o.x : 105 - o.x, qy = f ? o.y : 68 - o.y; const d = hyp(qx - x, qy - y); if (d < bd) { bd = d; ox = qx; oy = qy; } }
            if (bd < 13) {
              const near = clamp(1 - hyp(ox - bx, oy - by) / 32, 0.12, 0.72) * (0.6 + a.e[DEF] / 200 + a.e[IQ] / 300);
              x = x + ((ox - 1.6) - x) * near * 0.85; y = y + (oy - y) * near;
            }
            if ((a === p1 || a === p2) && holder) { x = hx - 0.9; y = hy; a.sprint = true; }
            y = y + (by - y) * (low ? 0.18 : 0.1);
          }
        }
        if (this.restart && (this.restart.kind === 'corner' || this.restart.kind === 'fkx')) [x, y] = this.setPos(a, k, own, x, y);
        if (this.restart && this.restart.kind === 'kickoff') x = Math.min(x, 51.5);
        x = clamp(x, 1, 104); y = clamp(y, 1, 67);
        a.tx = f ? x : 105 - x; a.ty = f ? y : 68 - y;
      }
    }
  }
  /** コーナー・ゴール前へのフリーキックのときの位置 */
  private setPos(a: Ag, k: number, own: boolean, x: number, y: number): [number, number] {
    const tall = a.o.pos === 'CB' || a.o.pos === 'ST' || a.o.p.height >= 185;
    if (own) { if (tall || a.o.pos === 'AM' || (a.o.pos === 'CM' && a.ph > 3)) return [95 + (a.ph % 1) * 6, 26 + a.ph * 2.6]; return [Math.min(x, 70), y]; }
    if (a.o.pos === 'GK') return [1.5, 34];
    if (DEFP.includes(a.o.pos) || a.o.pos === 'CM' || tall) return [4 + (a.ph % 1) * 9, 25 + a.ph * 2.9];
    return [Math.min(x, 30), y];
  }
  private chasers(): Ag[] {
    const B = this.ball; const out: Ag[] = [];
    for (const k of [0, 1]) { const a = this.team(k).filter((x) => x.o.pos !== 'GK' || hyp(x.x - B.tx, x.y - B.ty) < 12).sort((p, q) => hyp(p.x - B.tx, p.y - B.ty) - hyp(q.x - B.tx, q.y - B.ty))[0]; if (a) out.push(a); }
    return out;
  }
  private move(dt: number) {
    const gp = [this.sides[0].style === 'ゲーゲンプレス', this.sides[1].style === 'ゲーゲンプレス'];
    for (const a of this.ags) {
      if (a.out) { a.tx = 52.5; a.ty = -4; }
      const dx = a.tx - a.x, dy = a.ty - a.y; const d = hyp(dx, dy);
      const vm = a.vmax * (0.8 + 0.2 * a.en) * (a.sprint ? 1 : 0.6) * (this.T < a.stun ? 0.35 : 1);
      const want = d > 0.05 ? Math.min(vm, d * 1.5, (d / dt) * 0.9) : 0;
      const wx = d > 0.05 ? (dx / d) * want : 0, wy = d > 0.05 ? (dy / d) * want : 0;
      let ax = wx - a.vx, ay = wy - a.vy; const am = hyp(ax, ay); const lim = Math.min(7 * dt, 9); if (am > lim) { ax *= lim / am; ay *= lim / am; }
      a.vx += ax; a.vy += ay; a.x += a.vx * dt; a.y += a.vy * dt;
      if (!a.out) { a.x = clamp(a.x, -2, 107); a.y = clamp(a.y, -2, 70); }
      const v2 = a.vx * a.vx + a.vy * a.vy;
      a.en = Math.max(0.4, a.en - (0.000033 + 0.0000042 * v2) * a.drain * dt * (gp[a.k] ? 1.35 : 1));
    }
  }

  /* ================= ボールを持った選手 ================= */
  private give(a: Ag, how: 'pass' | 'win' | 'loose' | 'restart' | 'gk' = 'pass') {
    const B = this.ball; const prev = this.poss;
    B.st = 'held'; B.h = a; B.rcv = null; B.last = a.k; this.carry = null;
    if (prev !== a.k || how === 'restart' && this.seq.k !== a.k) this.newSeq(a, how);
    this.poss = a.k;
    const p = this.pressOn(a);
    const tempo = this.sp(a.k).tempo;
    this.due = this.T + clamp((0.75 + this.r.next() * 0.9) * SIM.gap * tempo * (1.12 - a.e[IQ] / 280) * (p < 3 ? 0.7 : 1), 0.35, 6) + (how === 'gk' ? 2 + this.r.next() * 3 : 0);
  }
  private newSeq(a: Ag, how: string) {
    this.closeItem();
    const [x] = tc(a.k, a.x, a.y);
    this.seq = { k: a.k, t0: this.T, x0: x, passes: 0, lastPass: '', assist: null, beaten: null, won: how === 'win' ? a : null, press: false, from: how, spk: '' };
  }
  private pressOn(a: Ag) { let d = 99; for (const o of this.team(1 - a.k)) { const v = hyp(o.x - a.x, o.y - a.y); if (v < d) d = v; } return d; }
  /** 寄せてきた相手が、ボールを奪いにくる */
  private pressure(h: Ag, dt: number) {
    for (const o of this.team(1 - h.k)) {
      if (o.o.pos === 'GK' || this.T < o.stun) continue;
      if (hyp(o.x - h.x, o.y - h.y) > 1.35) continue;
      if (this.p1[o.k] && this.p1[o.k] !== o && this.r.next() < 0.6) continue;
      if (this.r.next() > SIM.tackleRate * dt) continue;
      const high = (o.k === 0 ? o.x : 105 - o.x) > 68;
      const fires: Fire[] = [];
      const sc = high && this.sides[o.k].style === 'ゲーゲンプレス' ? 'error' : 'flow';
      const dv = this.E(o, DEF) + this.bonus(o, 'press', sc, 'att', fires);
      const hv = this.E(h, DRI) * 0.6 + this.E(h, PHY) * 0.4 + this.bonus(h, 'press', sc, 'def');
      const win = this.r.next() < sig((dv - hv) / SIM.takeK + SIM.tackleB);
      if (this.foul(o, h, win ? 0.6 : 1.2)) return;
      if (win) { this.wonBall(o, h, high, fires); return; }
      o.stun = this.T + 0.9;
    }
  }
  private wonBall(o: Ag, h: Ag, high: boolean, fires: Fire[] = []) {
    stOf(this.sides[o.k], o.o.p).tk++;
    this.duel(h, o, false);
    const loose = this.r.next() < 0.3;
    const err = high && this.mic && (tc(o.k, o.x, o.y)[0] > 72);
    if (err) { this.closeItem(); }
    if (loose) this.looseTo(h.x + (this.r.next() - 0.5) * 6, h.y + (this.r.next() - 0.5) * 6, 0.6);
    else this.give(o, 'win');
    this.seq.press = high; if (!loose) this.seq.won = o;
    if (this.mic) {
      if (err) {
        this.line(o.k, fillLine(pickFresh(this.r, PH.error.open), { D: this.tok(h) }), 'error', o);
        if (fires.length) this.line(o.k, this.fireTok(fires));
        this.line(o.k, fillLine(pickFresh(this.r, PH.error.win), { A: this.tok(o), D: this.tok(h) }));
      } else this.play('tk', h, o);
    }
  }

  private decide(h: Ag) {
    const k = h.k; const [hx, hy] = tc(k, h.x, h.y); const st = this.sp(k); const r = this.r;
    const s = this.sides[k]; const tilt = this.tiltOf(k);
    const press = this.pressOn(h);
    const lossW = st.risk * (tilt === 'def' ? 1.25 : tilt === 'atk' ? 0.7 : 1);
    type Opt = { u: number; go: () => void };
    const opts: Opt[] = [];
    const scene = this.sceneNow(h);
    /* シュート */
    if (hx > 70 && h.o.pos !== 'GK') {
      const xg0 = xgAt(hx, hy) * (press < 1.3 ? 0.65 : 1) * Math.pow(SIM.crowd, this.crowd(h));
      if (xg0 > 0.018) {
        let will = 1 + (has(h.o, '点取り屋') ? 0.45 : 0) - (has(h.o, 'チャンスメーカー') ? 0.3 : 0) + (tilt === 'atk' ? 0.15 : tilt === 'def' ? -0.1 : 0) + (h.o.pos === 'ST' ? 0.15 : DEFP.includes(h.o.pos) ? -0.25 : 0);
        if (has(h.o, 'ミドルシューター') && hx < 88) will += 0.35;
        /* 長くボールを回していると、そろそろ打ちにいく */
        will += Math.min(0.8, this.seq.passes * 0.05) * (hx > 75 ? 1 : 0.4);
        /* しばらくシュートを打てていないと、少し遠くても打つ */
        will += Math.min(1.2, (this.T - this.lastShot[k]) / 300 * 0.2);
        const g0 = this.gk(1 - k); const xq = xg0 * Math.exp((this.E(h, SHT) - (g0 ? this.E(g0, SHT) : 50) + SIM.xgOff) / (SIM.xgK * SIM.decK));
        opts.push({ u: xq * will * SIM.shotW + SIM.shotB, go: () => this.shoot(h, scene, xg0) });
      }
    }
    /* パス（実データの行き先から候補を出す） */
    const mates = this.team(k).filter((a) => a !== h);
    const seen = new Set<Ag>();
    const nc = SIM.cand + Math.round(h.e[IQ] / 45);
    const rf = () => r.next();
    for (let c = 0; c < nc; c++) {
      const [px, py] = passTarget(hx, hy, rf);
      let to: Ag | null = null, bd = 1e9;
      for (const m of mates) { if (m.o.pos === 'GK' && hx > 40) continue; const mx = k === 0 ? m.x : 105 - m.x, my = k === 0 ? m.y : 68 - m.y; const d = hyp(mx - px, my - py); if (d < bd) { bd = d; to = m; } }
      if (!to || seen.has(to)) continue; seen.add(to);
      opts.push(this.passOpt(h, to, 'pass', lossW, st));
    }
    /* 裏へのパス */
    for (const m of mates) if (this.T < m.runUntil && hx > 35) { const o = this.passOpt(h, m, 'through', lossW, st); opts.push(o); }
    /* クロス */
    if (hx > 76 && Math.abs(hy - 34) > 13) opts.push({ u: this.crossU(h) + st.cross + (has(h.o, '正確なクロス') ? 0.006 : 0), go: () => this.cross(h, 'cross') });
    /* ドリブル */
    {
      const [cx0, cy0] = carryTarget(hx, hy, rf); const len = hyp(cx0 - hx, cy0 - hy) || 1; const L = clamp(len, 3, 9 + h.e[DRI] / 12);
      const cx = clamp(hx + (cx0 - hx) / len * L, 1, 103), cy = clamp(hy + (cy0 - hy) / len * L, 1, 67);
      const def = this.blocker(h, cx, cy);
      let pk = 0.97;
      if (def) pk = this.takeOnP(h, def, '', false);
      const bias = (has(h.o, '仕掛け屋') ? 0.007 : 0) + (has(h.o, 'ドリブラー') ? 0.003 : 0) - (st === SP['ポゼッション'] ? 0.002 : 0);
      opts.push({ u: pk * V(cx, cy) - (1 - pk) * V(105 - hx, 68 - hy) * lossW + bias - 0.002, go: () => this.doCarry(h, cx, cy, def) });
    }
    /* 自陣のゴール前で苦しいときは、大きくける */
    if (hx < 22 && press < 3) opts.push({ u: 0.02 + (3 - press) * 0.004, go: () => this.clear(h) });
    if (!opts.length) { this.due = this.T + 0.5; return; }
    /* IQが高いほど、よい選択をする */
    const tau = SIM.tau * (1.55 - this.E(h, IQ, scene) / 100);
    const mx = Math.max(...opts.map((o) => o.u));
    const pick = r.wpick(opts.map((o) => [o, Math.exp((o.u - mx) / tau)] as [Opt, number]));
    void s;
    pick.go();
  }
  /** 今の攻めは、どんな場面か（特殊能力・実況の場面の名前） */
  /** シュートの前にいる相手の数（ゴールまでの扇形の中。キーパーはのぞく）。多いほど入りにくい */
  private crowd(h: Ag): number {
    const k = h.k; const hx = k === 0 ? h.x : 105 - h.x, hy = k === 0 ? h.y : 68 - h.y; let n = 0;
    for (const o of this.team(1 - k)) { if (o.o.pos === 'GK') continue; const ox = k === 0 ? o.x : 105 - o.x, oy = k === 0 ? o.y : 68 - o.y; if (ox <= hx + 0.3) continue;
      const t = (ox - hx) / Math.max(1, 105 - hx); if (t > 1) continue; const cy = hy + (34 - hy) * t; if (Math.abs(oy - cy) < 1.2 + 3.66 * t) n++; }
    return Math.min(4, n);
  }
  private sceneNow(h: Ag): string {
    const q = this.seq;
    if (q.from === 'pk') return 'pk';
    if (q.from === 'loose' && this.T - q.t0 < 4) return 'loose';
    if (q.press && this.T - q.t0 < 8) return 'error';
    if (this.T - q.t0 < 12 && q.x0 < 50 && q.from === 'win') return 'counter';
    if (q.lastPass === 'through') return 'through';
    if (q.lastPass === 'long') return 'longball';
    if (q.beaten && q.beaten.k !== h.k && this.T - q.t0 < 30) return 'dribble';
    if (this.T - q.t0 < 12 && q.x0 < 50) return 'counter';
    return 'combo';
  }
  private passOpt(h: Ag, to: Ag, kind: 'pass' | 'through' | 'long', lossW: number, st: StyleP): { u: number; go: () => void } {
    const k = h.k; const [hx, hy] = tc(k, h.x, h.y);
    let [px, py] = tc(k, to.x, to.y);
    if (kind === 'through') { px = Math.min(100, Math.max(px, this.oline[k] + 3)); py = to.ry ? tc(k, to.rx, to.ry)[1] * 0 + to.ry : py; }
    else { const [tvx, tvy] = [to.vx * (k === 0 ? 1 : -1), to.vy * (k === 0 ? 1 : -1)]; px += clamp(tvx, -3, 3) * 0.6; py += clamp(tvy, -3, 3) * 0.6; }
    px = clamp(px, 1, 104); py = clamp(py, 1, 67);
    const d = hyp(px - hx, py - hy);
    const kd = d > 30 ? 'long' : kind;
    const p = this.passP(h, to, px, py, kd === 'long' && kind !== 'through' ? 'long' : kind);
    let u = p * V(px, py) - (1 - p) * V(105 - px, 68 - py) * lossW;
    if (d > 28) u += st.long;
    if (px - hx > 15) u += st.fwd;
    if (Math.abs(py - 34) > 20) u += st.wide;
    if (kind === 'through') u += -0.004 + (has(h.o, 'キラーパス') ? 0.006 : 0);
    if (to.o.pos === 'GK') u -= 0.004;
    return { u, go: () => this.pass(h, to, px, py, kd === 'long' && kind !== 'through' ? 'long' : kind, p) };
  }
  /** パスが通る確率（実データの成功率を土台に、パスの腕・受け手のまわり・パスの線上の相手・距離） */
  private passP(h: Ag, to: Ag, px: number, py: number, kind: string, fires?: Fire[]): number {
    const k = h.k; const [hx, hy] = tc(k, h.x, h.y); const Z = zoneData(hx, hy);
    const d = hyp(px - hx, py - hy); const spd = this.passSpeed(d, kind);
    let open = 99, risk = 0;
    for (const o of this.team(1 - k)) {
      const ox = k === 0 ? o.x : 105 - o.x, oy = k === 0 ? o.y : 68 - o.y;
      const dr = hyp(ox - px, oy - py); if (dr < open) open = dr;
      const vx = px - hx, vy = py - hy; const L = vx * vx + vy * vy || 1; const u = clamp(((ox - hx) * vx + (oy - hy) * vy) / L, 0, 1);
      if (u < 0.12 || u > 0.92) continue;
      const dp = hyp(hx + vx * u - ox, hy + vy * u - oy); const tb = (u * d) / spd;
      const reach = 0.9 + o.vmax * tb * 0.42 * (this.T < o.stun ? 0.3 : 1) + (o.e[IQ] - 60) / 60;
      const rk = sig((reach - dp) / 0.7) * (kind === 'long' || kind === 'cross' ? 0.6 : 1);
      if (rk > risk) risk = rk;
    }
    const scene = kind === 'through' ? 'through' : hx > 70 ? 'combo' : this.sceneNow(h);
    const fb = kind === 'through' ? this.bonus(h, 'feed', 'through', 'att', fires) : kind === 'long' ? this.bonus(h, 'feed', this.seq.x0 < 50 && this.T - this.seq.t0 < 10 ? 'counter' : 'longball', 'att', fires) : scene === 'combo' && hx > 70 ? this.bonus(h, 'pass', 'combo', 'att', fires) : 0;
    const q = this.E(h, PAS) * 0.65 + this.E(h, IQ, scene) * 0.35 + fb;
    const press = this.pressOn(h);
    let lg = logit(clamp(Z?.pOk ?? 0.85, 0.5, 0.97)) + SIM.passB + (q - this.dq[1 - k]) / SIM.passK - 0.035 * Math.max(0, d - 18) + 0.22 * clamp(open - 3, -3, 6) - SIM.lineRisk * risk - (press < 1.6 ? 0.5 : 0) + (to.e[DRI] * 0.5 + to.e[IQ] * 0.5 - this.dq[1 - k]) / 45;
    if (kind === 'through') lg -= 0.4;
    if (px > 70 && this.sides[1 - k].style === 'ローブロック') lg -= 0.35;
    if (h.o.pos === 'GK') lg += (has(h.o, '現代型キーパー') ? 0.4 : 0) - 0.2;
    return sig(lg);
  }
  private passSpeed(d: number, kind: string) { return kind === 'long' || d > 30 ? 19 : kind === 'cross' ? 20 : clamp(9 + d * 0.32, 10, 17); }
  private pass(h: Ag, to: Ag, px: number, py: number, kind: string, p0: number) {
    const k = h.k; const s = this.sides[k]; const st = stOf(s, h.o.p); st.pa++;
    const fires: Fire[] = [];
    const p = this.passP(h, to, px, py, kind, fires); void p0;
    const [wx, wy] = tc(k, px, py); const [hx, hy] = tc(k, h.x, h.y);
    const d = hyp(px - hx, py - hy); const spd = this.passSpeed(d, kind);
    const B = this.ball; const ok = this.r.next() < p;
    this.seq.passes++;
    const notable = this.mic && (kind === 'through' && px > 70 || px > 84 && Math.abs(py - 34) < 20 && hx < px);
    if (notable) {
      if (kind === 'through') this.line(k, fillLine(pickFresh(this.r, PH.through.open), { S: this.tok(h), A: this.tok(to) }), 'through', to, h);
      else this.line(k, fillLine(pickFresh(this.r, PH.combo.open), { S: this.tok(h) }), 'combo', to, h);
      if (fires.length) this.line(k, this.fireTok(fires));
    }
    /* オフサイド */
    if ((kind === 'through' || px > this.oline[k] + 1) && tc(k, to.x, to.y)[0] > this.oline[k] + 0.5 && this.r.next() < SIM.offside * (1.25 - to.e[IQ] / 100) * (this.sp(1 - k).lineOut > 3 ? 1.4 : 1)) {
      this.kickBall(wx, wy, spd, false, () => {
        s.offsides++; this.fx('foul', 1 - k, 0.8);
        if (this.mic && notable) this.line(k, ['オフサイドの旗が上がる。']);
        else if (this.mic && this.r.next() < 0.25) this.say([this.tok(to), ' はオフサイド。']);
        this.dead('fk', (1 - k) as 0 | 1, tc(k, to.x, to.y)[0] > 0 ? to.x : to.x, to.y, 9 + this.r.next() * 7);
      });
      B.rcv = to; this.endPossAnim(); return;
    }
    if (ok) {
      B.rcv = to;
      this.kickBall(wx, wy, spd, kind === 'long', () => {
        /* 裏へのパス：走りこんだ選手と、追いかける相手の競走 */
        if (kind === 'through') {
          const def = this.nearestOpp(to, wx, wy);
          if (def && hyp(def.x - wx, def.y - wy) < 9) {
            const fr: Fire[] = [];
            const av = this.E(to, SPD) + this.bonus(to, 'run', this.seq.x0 < 50 ? 'counter' : 'through', 'att', fr) + (this.E(h, PAS) - 60) * 0.15;
            const dv = this.E(def, SPD) + this.bonus(def, 'run', 'through', 'def', fr) + (hyp(to.x - wx, to.y - wy) - hyp(def.x - wx, def.y - wy)) * 1.4;
            const win = this.r.next() < sig((av - dv) / 14 + 0.35);
            this.duel(to, def, win);
            if (this.mic && this.cur) { this.line(k, fillLine(pickFresh(this.r, PH.through.duel), { A: this.tok(to), D: this.tok(def) })); if (fr.length) this.line(k, this.fireTok(fr)); this.line(k, fillLine(pickFresh(this.r, win ? PH.through.win : PH.through.lose.filter((x) => !/オフサイド|旗/.test(x))), { A: this.tok(to), D: this.tok(def) }), '', to, h, def); }
            if (!win) { stOf(this.sides[def.k], def.o.p).tk++; if (this.foul(def, to, 1.6)) return; this.give(def, 'win'); return; }
          }
        }
        stOf(s, h.o.p).pc++;
        this.seq.lastPass = kind; this.seq.assist = h;
        if (tc(k, wx, wy)[0] > 82) stOf(s, h.o.p).kp += 0;
        this.give(to, 'pass');
        if (this.mic && notable && this.cur && kind !== 'through') this.line(k, fillLine(pickFresh(this.r, PH.combo.win), { A: this.tok(to), D: this.tok(this.nearestOpp(to, to.x, to.y) ?? to) }), '', to, h);
        if (this.mic && this.seq.passes === 12 && this.T >= this.nextPlay) this.play('chain', to, null);
      });
      return;
    }
    /* 失敗：パスの線の上の相手がカット／受け手のところで競り合い／外へ */
    let best: Ag | null = null, bt = 0.6, bd = 1e9;
    for (const o of this.team(1 - k)) { const vx = wx - B.x, vy = wy - B.y; const L = vx * vx + vy * vy || 1; const t = clamp(((o.x - B.x) * vx + (o.y - B.y) * vy) / L, 0.15, 1); const dd = hyp(B.x + vx * t - o.x, B.y + vy * t - o.y); if (dd < bd) { bd = dd; best = o; bt = t; } }
    /* 外に出る（実データの、その場所で外に出る割合） */
    const Z = zoneData(hx, hy); const outP = clamp((Z?.pOut ?? 0.03) / Math.max(0.05, 1 - (Z?.pOk ?? 0.8)), 0.12, 0.6) * (Math.min(py, 68 - py) < 8 || px > 98 ? 1.6 : 1);
    if (this.r.next() < outP) {
      const toSide = Math.min(py, 68 - py) < (105 - px) * 0.7 || px < 90;
      const [ex, ey] = toSide ? tc(k, px, py < 34 ? -1 : 69) : tc(k, 106, py);
      this.kickBall(ex, ey, spd, false, () => { if (!toSide && tc(k, ex, ey)[0] > 104 && this.r.next() < 0.45) this.dead('corner', k, ...this.cornerSpot(k, ey), 24 + this.r.next() * 12); else this.outOfPlay(k); }); this.endPossAnim(); return;
    }
    if (best && bd < 4) {
      const ix = B.x + (wx - B.x) * bt, iy = B.y + (wy - B.y) * bt; const o = best; B.rcv = o; const cut = bd < 1.0;
      this.kickBall(ix, iy, spd, false, () => { if (cut) { stOf(this.sides[o.k], o.o.p).tk++; } if (this.mic && this.r.next() < 0.25 && this.T >= this.nextPlay) this.play('tk', to, o); this.give(o, 'win'); });
    } else { B.rcv = to; this.kickBall(wx, wy, spd, kind === 'long', () => this.contest(to, wx, wy, kind === 'long' ? 'longball' : 'flow')); }
  }
  private endPossAnim() { this.ball.h = null; }
  /** 受け手のところで、相手と競り合う（ロングボールは空中戦） */
  private contest(to: Ag, wx: number, wy: number, scene: string) {
    const d = this.nearestOpp(to, wx, wy);
    if (!d || hyp(d.x - wx, d.y - wy) > 5) { this.give(to, 'pass'); return; }
    const fr: Fire[] = [];
    const av = scene === 'longball' ? this.air(to, scene) + this.bonus(to, 'air', 'longball', 'att', fr) : this.E(to, PHY) * 0.5 + this.E(to, DRI) * 0.5;
    const dv = scene === 'longball' ? this.air(d, scene) + this.bonus(d, 'air', 'longball', 'def', fr) : this.E(d, DEF) * 0.6 + this.E(d, PHY) * 0.4;
    const win = this.r.next() < sig((av - dv) / 13 - 0.1);
    if (this.foul(d, to, 0.7)) return;
    if (win) { stOf(this.sides[to.k], to.o.p).pc += 0; this.seq.lastPass = scene === 'longball' ? 'long' : ''; this.give(to, 'pass'); }
    else if (this.r.next() < 0.45) this.looseTo(wx + (this.r.next() - 0.5) * 10, wy + (this.r.next() - 0.5) * 10, 0.7);
    else { this.give(d, 'win'); }
  }
  private nearestOpp(a: Ag, x: number, y: number): Ag | null { let b: Ag | null = null, bd = 1e9; for (const o of this.team(1 - a.k)) { if (o.o.pos === 'GK') continue; const d = hyp(o.x - x, o.y - y); if (d < bd) { bd = d; b = o; } } return b; }
  private kickBall(x: number, y: number, spd: number, high: boolean, land: () => void) {
    if (this.noKick) this.noKick = false; else this.fx('kick', this.poss, spd >= 18 || high ? 1 : 0.65);
    const B = this.ball; B.st = 'air'; B.h = null; B.fx = B.x; B.fy = B.y; B.tx = x; B.ty = y; B.t0 = this.T; B.t1 = this.T + Math.max(0.25, hyp(x - B.x, y - B.y) / spd); B.high = high; B.land = land; this.carry = null;
  }
  private looseTo(x: number, y: number, sec: number) {
    const B = this.ball; B.st = 'loose'; B.h = null; B.rcv = null; B.fx = B.x; B.fy = B.y; B.tx = clamp(x, 0, 105); B.ty = clamp(y, 0, 68); B.t0 = this.T; B.t1 = this.T + sec; this.carry = null;
    B.land = () => this.settleLoose();
  }
  /** こぼれ球：一番早く着く選手が取る（IQで反応が早い） */
  private settleLoose() {
    const B = this.ball; let best: Ag | null = null, bt = 1e9;
    if (B.y < 1.2 || B.y > 66.8 || B.x < 0.6 || B.x > 104.4) { B.x = clamp(B.x, 0, 105); B.y = clamp(B.y, 0, 68); this.outOfPlay(B.last); return; }
    const box = (k: number) => tc(k, B.x, B.y)[0] > 86 && Math.abs(tc(k, B.x, B.y)[1] - 34) < 20;
    for (const a of this.ags) {
      if (a.out) continue;
      let tt = hyp(a.x - B.x, a.y - B.y) / Math.max(3, a.vmax) + (0.5 - a.e[IQ] / 200) + this.r.next() * 0.5;
      if (box(a.k)) tt -= this.bonus(a, 'react', 'loose', 'att') * 0.03; else if (box(1 - a.k)) tt -= this.bonus(a, 'react', 'loose', 'def') * 0.03;
      if (tt < bt) { bt = tt; best = a; }
    }
    if (!best) return;
    if (bt > 1.2) { B.t0 = this.T; B.t1 = this.T + 0.6; B.fx = B.x; B.fy = B.y; B.tx = clamp(B.x + (best.x - B.x) * 0.5, 0.5, 104.5); B.ty = clamp(B.y + (best.y - B.y) * 0.5, 0.5, 67.5); B.land = () => this.settleLoose(); return; }
    const sameSide = best.k === this.ball.last;
    if (!sameSide) stOf(this.sides[best.k], best.o.p).tk += 0;
    this.give(best, 'loose');
    if (box(best.k)) { this.seq.from = 'loose'; this.seq.t0 = this.T; if (this.mic) { this.line(best.k, fillLine(pickFresh(this.r, PH.loose.open), { D: this.tok(this.nearestOpp(best, best.x, best.y) ?? best) }), 'loose', best); } }
  }
  private blocker(h: Ag, cx: number, cy: number): Ag | null {
    const k = h.k; const [hx, hy] = tc(k, h.x, h.y); let b: Ag | null = null, bd = 1e9;
    for (const o of this.team(1 - k)) { if (o.o.pos === 'GK' || this.T < o.stun) continue; const ox = k === 0 ? o.x : 105 - o.x, oy = k === 0 ? o.y : 68 - o.y; const d = hyp(ox - hx, oy - hy); if (d > 4.2) continue; const fwd = (ox - hx) * (cx - hx) + (oy - hy) * (cy - hy); if (fwd < -2) continue; if (d < bd) { bd = d; b = o; } }
    return b;
  }
  private takeOnP(h: Ag, d: Ag, scene: string, real: boolean, fires?: Fire[]): number {
    const sc = scene || 'dribble';
    const cov = this.sides[d.k].cover.has(h.o.lr === 'R' ? 'R' : h.o.lr === 'L' ? 'L' : '') ? 5 : 0;
    const av = this.E(h, DRI) * 0.7 + this.E(h, SPD) * 0.15 + this.E(h, PHY) * 0.15 + (real ? this.bonus(h, 'beat', sc, 'att', fires) : 0);
    const dv = this.E(d, DEF) * 0.75 + this.E(d, PHY) * 0.15 + this.E(d, SPD) * 0.1 + (real ? this.bonus(d, 'beat', sc, 'def', fires) : 0) + cov;
    return sig((av - dv) / SIM.takeK + 0.2);
  }
  private doCarry(h: Ag, cx: number, cy: number, def: Ag | null) {
    const [wx, wy] = tc(h.k, cx, cy);
    if (!def) { this.carry = { tx: wx, ty: wy, until: this.T + hyp(wx - h.x, wy - h.y) / Math.max(3.5, h.vmax * 0.75) + 0.3 }; return; }
    /* 1対1の仕掛け */
    const k = h.k; const fires: Fire[] = []; const [hx] = tc(k, h.x, h.y);
    const p = this.takeOnP(h, def, 'dribble', true, fires);
    const win = this.r.next() < p;
    const say = this.mic && hx > 62;
    if (say) this.line(k, fillLine(pickFresh(this.r, PH.dribble.open), { A: this.tok(h), D: this.tok(def) }), 'dribble', h, null, def);
    this.duel(h, def, win);
    if (win) {
      stOf(this.sides[k], h.o.p).dr++; def.stun = this.T + 1.6; this.seq.beaten = def;
      if (say) { if (fires.length) this.line(k, this.fireTok(fires)); this.line(k, fillLine(pickFresh(this.r, PH.dribble.win), { A: this.tok(h), D: this.tok(def) })); }
      else if (this.mic && this.T >= this.nextPlay && this.r.next() < 0.3) this.play('dr', h, def);
      if (this.foul(def, h, 1.9)) return;
      const len = hyp(wx - h.x, wy - h.y) || 1;
      this.carry = { tx: h.x + (wx - h.x) / len * Math.max(len, 5), ty: h.y + (wy - h.y) / len * Math.max(len, 5), until: this.T + 1.4 };
    } else {
      stOf(this.sides[def.k], def.o.p).tk++;
      if (say) this.line(k, fillLine(pickFresh(this.r, PH.dribble.lose), { A: this.tok(h), D: this.tok(def) }));
      if (this.foul(def, h, 0.9)) return;
      if (has(h.o, '仕掛け屋') || this.r.next() < 0.6) this.give(def, 'win'); else this.looseTo(h.x + (this.r.next() - 0.5) * 7, h.y + (this.r.next() - 0.5) * 7, 0.6);
    }
  }
  private clear(h: Ag) {
    const k = h.k; const side = this.r.next() < 0.3; const [wx, wy] = tc(k, 40 + this.r.next() * 28, side ? (this.r.next() < 0.5 ? -1 : 69) : 8 + this.r.next() * 52);
    stOf(this.sides[k], h.o.p).pa++;
    if (side) { this.kickBall(wx, wy, 20, true, () => this.outOfPlay(k)); return; }
    this.kickBall(wx, wy, 20, true, () => this.looseTo(wx + (this.r.next() - 0.5) * 6, wy + (this.r.next() - 0.5) * 6, 0.5));
  }

  /* ================= クロス・セットプレー ================= */
  private crossU(h: Ag) { let n = 0; for (const a of this.team(h.k)) { const x = h.k === 0 ? a.x : 105 - a.x, y = h.k === 0 ? a.y : 68 - a.y; if (x > 86 && Math.abs(y - 34) < 16) n++; } return 0.012 + n * 0.007 + (this.E(h, PAS) - 60) / 2500; }
  /** クロス（scene：cross＝流れの中・setpiece＝コーナーやフリーキック） */
  private cross(h: Ag, scene: 'cross' | 'setpiece', label = '') {
    const k = h.k; const s = this.sides[k]; const r = this.r; stOf(s, h.o.p).pa++;
    const fires: Fire[] = [];
    const heads = this.team(k).filter((a) => a !== h && a.o.pos !== 'GK' && tc(k, a.x, a.y)[0] > 80);
    const tgt = heads.length ? r.wpick(heads.map((a) => [a, Math.pow(Math.max(10, a.e[PHY] + (a.o.p.height - 178) * 0.8), 2) * (['CB', 'ST'].includes(a.o.pos) ? 1.5 : 1) * (has(a.o, 'パワーヘッダー') || has(a.o, 'エアバトル') ? 2 : 1)] as [Ag, number])) : null;
    const [tx0, ty0] = tgt ? tc(k, tgt.x, tgt.y) : [94, 34];
    const px = clamp(tx0 + (r.next() - 0.5) * 3, 88, 101), py = clamp(ty0 + (r.next() - 0.5) * 4, 22, 46);
    const q = this.E(h, PAS) + this.bonus(h, scene === 'cross' ? 'cross' : 'feed', scene, 'att', fires);
    const [wx, wy] = tc(k, px, py);
    if (this.mic) {
      if (scene === 'cross') this.line(k, fillLine(pickFresh(this.r, PH.cross.open), { S: this.tok(h) }), 'cross', tgt, h);
      if (fires.length) this.line(k, this.fireTok(fires));
      if (tgt) { const d0 = this.nearestOpp(tgt, tgt.x, tgt.y); this.line(k, fillLine(pickFresh(this.r, (scene === 'cross' ? PH.cross.duel : PH.setpiece.duel)), { S: this.tok(h), A: this.tok(tgt), D: this.tok(d0 ?? tgt), F: this.foot(h) }), '', tgt, h); }
    }
    const reach = r.next() < sig((q - this.dq[1 - k] + 2) / 12 + (scene === 'setpiece' ? -0.35 : 0.45)) && !!tgt;
    this.ball.rcv = tgt;
    this.kickBall(wx, wy, 19, true, () => {
      const D = this.sides[1 - k]; const g = this.gk(1 - k);
      if (!reach || !tgt) {
        const u = r.next();
        if (this.mic && this.cur) this.line(k, [pickFresh(r, ['クロスが合わない。ボールはそのまま外へ。', 'ボールはゴール前を通りすぎていく。'])]);
        if (u < 0.3) { this.ball.x = wx; this.ball.y = wy; this.kickBall(tc(k, 106, py)[0], tc(k, 106, py)[1], 10, false, () => this.outOfPlay(k)); }
        else if (u < 0.58) this.dead('corner', k, ...this.cornerSpot(k, wy), 24 + r.next() * 12);
        else { this.looseTo(tc(k, 70 + r.next() * 12, 10 + r.next() * 48)[0], tc(k, 70, 10 + r.next() * 48)[1], 1.1); }
        return;
      }
      /* キーパーが出てきて取る */
      if (g) {
        const fr: Fire[] = [];
        const claim = sig((this.E(g, DEF) + this.bonus(g, 'save', scene, 'def', fr) - q - 6) / 18) * 0.32;
        if (r.next() < claim) {
          if (this.mic && this.cur) this.line(k, fillLine(pickFresh(r, ['{G} が前に出て、がっちりキャッチ。', '{G} が飛び出して、パンチングではじいた。']), { G: this.tok(g) }));
          this.give(g, 'gk'); return;
        }
      }
      const d = this.nearestOpp(tgt, wx, wy) ?? null;
      const fr: Fire[] = [];
      const av = this.air(tgt, scene) + this.bonus(tgt, 'air', scene, 'att', fr) + (q - 60) * 0.15;
      const dv = d ? this.air(d, scene) + this.bonus(d, 'air', scene, 'def', fr) + (hyp(d.x - wx, d.y - wy) < 2 ? 0 : -4) : -99;
      const win = r.next() < sig((av - dv) / 12 + (scene === 'setpiece' ? -0.55 : 0.05));
      if (d) this.duel(tgt, d, win);
      if (this.mic && this.cur) { if (fr.length) this.line(k, this.fireTok(fr)); this.line(k, fillLine(pickFresh(r, win ? (scene === 'cross' ? PH.cross.win : PH.setpiece.win) : (scene === 'cross' ? PH.cross.lose : PH.setpiece.lose).filter((x) => !/\{G\}/.test(x))), { A: this.tok(tgt), D: this.tok(d ?? tgt) }), '', tgt, h, d); }
      if (win) { tgt.x = wx; tgt.y = wy; this.ball.h = tgt; this.seq.assist = h; this.seq.lastPass = scene; this.poss = k; this.headShot(tgt, h, scene, label); return; }
      if (r.next() < 0.4) { this.dead('corner', k, ...this.cornerSpot(k, wy), 24 + r.next() * 12); return; }
      this.looseTo(tc(k, 68 + r.next() * 16, 12 + r.next() * 44)[0], tc(k, 68, 12 + r.next() * 44)[1], 1.0);
    });
  }
  private headShot(a: Ag, from: Ag, scene: 'cross' | 'setpiece', label: string) {
    const [x, y] = tc(a.k, a.x, a.y); void from; void label;
    this.shoot(a, scene, xgAt(x, y) * (scene === 'setpiece' ? 0.33 : 0.62), true);
  }
  private cornerSpot(k: number, wy: number): [number, number] { return [k === 0 ? 104.5 : 0.5, wy < 34 ? 0.5 : 67.5]; }

  /* ================= シュート ================= */
  private shoot(h: Ag, scene: string, xg0: number, headed = false) {
    const k = h.k; const r = this.r; const A = this.sides[k], D = this.sides[1 - k];
    const g = this.gk(1 - k); const [hx, hy] = tc(k, h.x, h.y);
    const sc = scene === 'pk' ? 'pk' : scene === 'fk' ? 'fk' : headed ? scene : hx < 88 && !['through', 'loose'].includes(scene) ? 'mid' : scene;
    const fires: Fire[] = [], sf: Fire[] = [];
    const sv = this.E(h, SHT) + this.bonus(h, 'shot', sc, 'att', sf) + (headed ? (this.E(h, PHY) - this.E(h, SHT)) * 0.4 : 0);
    let gv = g ? this.E(g, SHT) + this.bonus(g, 'save', sc, 'def', sf) : 30;
    if (headed && g) gv = (gv + this.E(g, DEF)) / 2;
    if (g && (sc === 'through' || sc === 'counter') && hx > 88) {
      const go = this.bonus(g, 'gkout', sc, 'def', sf); if (go) gv += go * 0.6;
    }
    let xg = clamp(xg0 * (sc !== 'pk' && D.style === 'ローブロック' ? 0.85 : 1) * Math.exp((sv - gv + SIM.xgOff) / SIM.xgK), 0.005, 0.95);
    const st = stOf(A, h.o.p); st.sh++; this.lastShot[k] = this.T;
    if (this.seq.assist && this.seq.assist !== h && this.seq.assist.k === k) stOf(A, this.seq.assist.o.p).kp++;
    /* ブロック */
    let blk: Ag | null = null;
    if (sc !== 'pk' && sc !== 'fk') {
      let pNo = 1;
      for (const o of this.team(1 - k)) {
        if (o.o.pos === 'GK' || this.T < o.stun) continue;
        const ox = k === 0 ? o.x : 105 - o.x, oy = k === 0 ? o.y : 68 - o.y; if (ox < hx + 0.5 || ox > hx + 9) continue;
        const vx = 105 - hx, vy = 34 - hy; const L = hyp(vx, vy) || 1; const perp = Math.abs((ox - hx) * vy - (oy - hy) * vx) / L;
        if (perp > 1.8) continue;
        const b = SIM.block * (D.style === 'ローブロック' ? 1.3 : 1) * (this.tiltOf(1 - k) === 'def' ? 1.15 : 1) * (1 - perp / 1.8) * (0.75 + o.e[DEF] / 250) + this.bonus(o, 'block', sc === 'mid' ? 'mid' : 'loose', 'def', fires) / 60;
        if (r.next() < b) { blk = o; break; } pNo *= 1 - b;
      }
      void pNo;
    }
    /* 文：シュートまで */
    if (this.mic) {
      if (!this.cur || this.cur.k !== k) {
        if (sc === 'mid') this.line(k, fillLine(pickFresh(r, PH.mid.open), { A: this.tok(h) }), 'mid', h);
        else if (sc !== 'pk' && sc !== 'fk') this.line(k, fillLine(pickFresh(r, (PH as unknown as Record<string, { open: string[] }>)[sc]?.open ?? PH.combo.open), { A: this.tok(h), S: this.tok(this.seq.assist ?? h), D: this.tok(this.nearestOpp(h, h.x, h.y) ?? h) }), sc, h, this.seq.assist);
      }
      const it = this.cur; if (it) { it.att = h; if (this.seq.assist && this.seq.assist !== h) it.assist = this.seq.assist; if (!SP_SCENES.includes(it.scene) && it.scene !== 'pk') it.scene = sc === 'flow' ? 'combo' : sc; }
      const shotL = sc === 'pk' ? PH.shot.pk : sc === 'fk' ? PH.shot.fk : headed ? PH.shot.head : sc === 'mid' ? PH.shot.mid : PH.shot.foot;
      const oneOnOne = hyp(105 - hx, 34 - hy) < 15 && ['through', 'counter', 'error'].includes(sc) && this.pressOn(h) > 3;
      const pool = oneOnOne ? shotL : shotL.filter((x) => !/1対1/.test(x));
      this.line(k, fillLine(pickFresh(r, pool.length ? pool : shotL), { A: this.tok(h), G: this.tok(g ?? h), F: this.foot(h) }));
      if (sf.filter((f) => !f.gk).length) this.line(k, this.fireTok(sf.filter((f) => !f.gk)));
    }
    if (!this.cur) this.cur = this.newItem(k, sc, h);
    const it = this.cur; it.shot = true; it.ok = true; it.att = h; it.xg = Math.max(it.xg, xg); if (this.seq.assist && this.seq.assist !== h && this.seq.assist.k === k) it.assist = this.seq.assist;
    if (!it.def) it.def = blk ?? this.nearestOpp(h, h.x, h.y);
    const B = this.ball; this.ball.h = null; this.carry = null;
    const gy = 34 + (r.next() - 0.5) * 6.4; const [gx, gyw] = tc(k, 105.6, gy);
    const shotRec = { min: this.minute(), x: Math.round(h.x * 10) / 10, y: Math.round(h.y * 10) / 10, goal: false, ot: false, sp: SP_SCENES.includes(sc) || sc === 'pk' || sc === 'fk' || (this.seq.from === 'setpiece' && this.T - this.seq.t0 < 8), who: h.o.p.name, how: SCENE_JP[this.seq.from === 'setpiece' && this.T - this.seq.t0 < 8 && this.seq.spk ? this.seq.spk : sc === 'flow' ? 'combo' : sc] ?? 'シュート' };
    A.shots.push(shotRec); this.push(k, 0.6);
    it.hv = Math.max(it.hv, 2 + xg * 22 + (sc === 'pk' ? 4 : 0));
    if (blk) {
      const [bx, by] = [blk.x, blk.y];
      this.fx('shot', k); this.noKick = true;
      this.kickBall(bx, by, 24, false, () => {
        this.fx('block', k);
        if (this.mic) { if (fires.length) this.line(k, this.fireTok(fires)); this.line(k, fillLine(pickFresh(r, PH.mid.lose.filter((x) => /ブロック|当て|投げ出/.test(x))), { D: this.tok(blk!), A: this.tok(h) })); }
        stOf(D, blk!.o.p).tk++;
        if (r.next() < 0.42) this.dead('corner', k, ...this.cornerSpot(k, by), 24 + r.next() * 12);
        else this.looseTo(bx + (r.next() - 0.5) * 12, by + (r.next() - 0.5) * 12, 0.7);
      });
      return;
    }
    /* 枠に行くか・入るか */
    const press = this.pressOn(h);
    const pOT = clamp(0.36 + 0.85 * xg + (sv - 62) / 230 - (press < 1.5 ? 0.07 : 0) - (headed ? 0.08 : 0) - (sc === 'fk' ? 0.12 : 0) + (sc === 'pk' ? 0.55 : 0), 0.18, 0.95);
    const ot = r.next() < pOT;
    const goal = ot && r.next() < clamp(xg / pOT, 0, 0.97);
    const post = !ot && r.next() < 0.07;
    shotRec.ot = ot; shotRec.goal = goal;
    if (ot) st.ot++;
    if (g) this.duelGK(h, g, goal, ot);
    const spd = sc === 'pk' ? 24 : 26;
    this.fx('shot', k); this.noKick = true;
    if (goal) {
      this.kickBall(gx, gyw, spd, false, () => this.scored(h, it, sc, headed));
      return;
    }
    if (ot && g) {
      const gs = stOf(D, g.o.p); gs.sv++; if (sc === 'pk') gs.psv = (gs.psv ?? 0) + 1;
      it.save = true; it.hv += 3;
      const catchIt = r.next() < 0.45 + (this.E(g, SHT) - 60) / 150;
      this.kickBall(g.x + (k === 0 ? -0.6 : 0.6), g.y, spd, false, () => {
        this.fx('save', k);
        if (this.mic) { const gkF = sf.filter((f) => f.gk); if (gkF.length) this.line(k, this.fireTok(gkF)); this.line(k, fillLine(pickFresh(r, gkF.length ? PH.save.sp : PH.save.any), { G: this.tok(g) })); }
        if (catchIt) { this.give(g, 'gk'); return; }
        if (r.next() < 0.5) this.dead('corner', k, ...this.cornerSpot(k, g.y), 24 + r.next() * 12);
        else this.looseTo(g.x + (k === 0 ? -1 : 1) * (4 + r.next() * 8), g.y + (r.next() - 0.5) * 18, 0.7);
      });
      return;
    }
    /* 外れ */
    if (post) it.hv += 3;
    const my = 34 + (r.next() < 0.5 ? -1 : 1) * (post ? 3.7 : 4.5 + r.next() * 6); const [mx, myw] = tc(k, post ? 104.8 : 106.5, my);
    this.kickBall(mx, myw, spd, false, () => {
      this.fx(post ? 'post' : 'miss', k);
      if (this.mic) this.line(k, post ? [pickFresh(r, PH.miss.filter((x) => /ポスト|バー/.test(x)))] : [pickFresh(r, [...PH.miss.filter((x) => !/ポスト|バー/.test(x)), '{A} のシュートは、枠の外へ。'.replace('{A}', h.o.p.name)])]);
      if (post) this.looseTo(tc(k, 96 - r.next() * 10, 34 + (r.next() - 0.5) * 22)[0], tc(k, 96, 34 + (r.next() - 0.5) * 22)[1], 0.6);
      else if (r.next() < 0.08) this.dead('corner', k, ...this.cornerSpot(k, myw), 24 + r.next() * 12);
      else this.dead('goalkick', (1 - k) as 0 | 1, ...this.gkSpot(1 - k), 18 + r.next() * 12);
    });
  }
  private gkSpot(k: number): [number, number] { return tc(k, 5.5, 34 + (this.r.next() < 0.5 ? -9 : 9)); }
  private scored(h: Ag, it: Item, sc: string, headed: boolean) {
    const k = h.k; const A = this.sides[k], D = this.sides[1 - k]; const g = this.gk(1 - k); const mm = this.minute();
    const before: [number, number] = [this.sides[0].goals, this.sides[1].goals];
    this.fx('goal', k); A.goals++; this.lastGoal = mm; A.moUntil = mm + 5; this.marks.push({ min: mm, kind: 'goal', side: k });
    const st = stOf(A, h.o.p); st.g++; if (g) stOf(D, g.o.p).ga++;
    const as = it.assist && it.assist.k === k && it.assist !== h ? it.assist : null; if (as) stOf(A, as.o.p).as++;
    it.goal = true; it.hv = 100;
    this.push(k, 1.6);
    if (this.mic) { this.line(k, fillLine(pickFresh(this.r, headed ? PH.goal.head : sc === 'mid' || sc === 'fk' ? PH.goal.long : PH.goal.any), { G: this.tok(g ?? h) })); const tp = [...this.tap].reverse().find((x) => x.gid === it.id); if (tp) { tp.goal = [this.sides[0].goals, this.sides[1].goals]; tp.imp = true; } }
    const tie = this.sides[0].goals === this.sides[1].goals; const lead = before[k] === before[1 - k] && D.goals > 0;
    const flow = tie ? '同点' : lead ? '勝ち越し' : before[k] < before[1 - k] && A.goals > D.goals ? '逆転' : null;
    const mem = A.t.me && h.o.p.goals === 0 && !this.log.some((x) => x.goal && x.att.p === h.o.p);
    (it as Item & { flow?: string | null; mem?: boolean; score?: [number, number] }).flow = flow;
    (it as Item & { mem?: boolean }).mem = mem;
    (it as Item & { score?: [number, number] }).score = [this.sides[0].goals, this.sides[1].goals];
    this.closeItem();
    if (this.mic) {
      const p = h.o.p; const inMatch = this.log.filter((x) => x.goal && x.att.p === p).length;
      const line = goalComment(this.r, { min: mm, flow, lead: A.goals - D.goals, first: this.sides[0].goals + this.sides[1].goals === 1, p, seasonGoals: p.seasonGoals + inMatch, headed, mem, me: A.t.me }, this.tok(h));
      if (line) this.evp({ t: mm, sec: this.clk + 4, kind: 'talk', me: A.t.me, text: line, who: '実況', after: true, hl: true });
    }
    this.stopAcc += 45;
    this.dead('kickoff', (1 - k) as 0 | 1, 52.5, 34, 60 + this.r.next() * 30);
  }

  /* ================= 反則・カード ================= */
  /** d が a にファウルするか（mul：抜かれたときは大きい）。したら true */
  private foul(d: Ag, a: Ag, mul: number): boolean {
    if (d.o.pos === 'GK' || d.out) return false;
    const D = this.sides[d.k], A = this.sides[a.k]; const st = stOf(D, d.o.p);
    const [ax0, ay0] = tc(a.k, a.x, a.y);
    let pf = SIM.foul * mul * ((st.yc ?? 0) ? 0.6 : 1) * this.sp(d.k).foul * (DEFP.includes(d.o.pos) ? 1.1 : 0.92) * (ax0 > 88.5 && Math.abs(ay0 - 34) < 20.1 ? 0.3 : 1);
    if (hasBad(d.o, 'ラフプレイヤー')) pf *= 1.4; if (has(d.o, 'クリーンディフェンス')) pf *= 0.6;
    if (this.r.next() >= pf) return false;
    D.fouls++; st.fo = (st.fo ?? 0) + 1; this.fx('foul', d.k);
    const mm = this.minute();
    const hot = (this.opts.big ? 1.3 : 1) * (mm >= 70 && D.goals < A.goals ? 1.35 : 1) * (mul > 1.3 ? 1.5 : 0.85);
    const py = SIM.yel * hot * ((st.yc ?? 0) ? 0.35 : 1) * (hasBad(d.o, 'ラフプレイヤー') ? 1.6 : 1) * (has(d.o, 'クリーンディフェンス') ? 0.5 : 1);
    const [ax, ay] = tc(a.k, a.x, a.y);
    const inBox = ax > 88.5 && Math.abs(ay - 34) < 20.1;
    let pkProb = inBox ? 0.85 : 0; if (inBox && hasBad(d.o, 'ラフプレイヤー')) pkProb = 1;
    if (this.r.next() < 0.0012 * hot * (hasBad(d.o, 'ラフプレイヤー') ? 2 : 1)) this.sendOff(d, false);
    else if (this.r.next() < py) {
      this.fx('card', d.k); st.yc = (st.yc ?? 0) + 1; D.cards.push({ min: mm, p: d.o.p, red: false }); this.stopAcc += 15;
      if (st.yc >= 2) this.sendOff(d, true);
      else if (this.mic) this.say(fillY(this.r, this.tok(d), this.tok(a)), 'flow', d.k === this.meK());
    }
    this.closeItem();
    if (inBox && this.r.next() < pkProb) {
      st.pkc = (st.pkc ?? 0) + 1;
      if (this.mic) this.line(a.k, fillLine(pickFresh(this.r, PH.pk.open), { A: this.tok(a), D: this.tok(d) }), 'pk', a);
      this.stopAcc += 30;
      this.dead('pk', a.k, ...tc(a.k, 94, 34), 45 + this.r.next() * 25);
      return true;
    }
    const near = ax > 75 && Math.abs(ay - 34) < 26;
    this.dead(near ? 'fk' : 'free', a.k, a.x, a.y, near ? 32 + this.r.next() * 22 : 14 + this.r.next() * 14);
    return true;
  }
  private sendOff(d: Ag, second: boolean) {
    const D = this.sides[d.k]; const mm = this.minute(); const st = stOf(D, d.o.p); st.rc = 1; st.to = mm;
    d.out = true; this.tmOk = false; D.on = D.on.filter((x) => x !== d.o); D.offs.push(d.o); D.men--; D.cards.push({ min: mm, p: d.o.p, red: true }); this.marks.push({ min: mm, kind: 'red', side: d.k });
    if (this.ball.h === d) this.ball.h = null;
    this.fx('card', d.k, 1.3);
    this.stopAcc += 30;
    if (this.mic) this.say(second ? ['2枚目のイエロー。', this.tok(d), ' は退場だ。', this.ctok(D), ' は10人になった。'] : ['レッドカード！', this.tok(d), ' は一発退場。', this.ctok(D), ' は10人で戦うことになった。'], 'flow', D.t.me, 8);
    this.hlNew.push({ T: this.T, start: this.T - 8, hv: 6 });
    if (D.kick.ck === d.o.p || D.kick.fk === d.o.p || D.kick.pk === d.o.p) D.kick = chooseKickers(this.r, D);
    if (d.o.pos === 'GK') {
      const off = this.team(d.k).filter((x) => ATKP.includes(x.o.pos)).sort((a, b) => ovr(a.o.p) - ovr(b.o.p))[0] ?? this.team(d.k).find((x) => x.o.pos !== 'GK');
      if (!(off && this.doSub(D, off, ['GK'], mm, '退場'))) { const f = this.team(d.k).sort((a, b) => b.o.p.height - a.o.p.height)[0]; if (f) { f.o.pos = 'GK'; this.placeRoles(d.k); } }
    } else if (DEFP.includes(d.o.pos) && D.subs < 5 && D.windows < 3 && this.autoSub[d.k]) {
      const off = this.team(d.k).filter((x) => ATKP.includes(x.o.pos)).sort((a, b) => ovr(a.o.p) - ovr(b.o.p))[0];
      if (off && this.doSub(D, off, [d.o.pos], mm, '退場')) { D.windows++; D.lastAct = mm; }
    }
    this.placeRoles(d.k);
  }

  /* ================= 止まったボール・再開 ================= */
  private outOfPlay(lastK: number) {
    const B = this.ball; const x = B.x, y = B.y; const opp = (1 - lastK) as 0 | 1;
    this.closeItem();
    if (x < 0.3 || x > 104.7) {
      const ownGoalLine = (x > 104.7 && lastK === 1) || (x < 0.3 && lastK === 0);
      if (ownGoalLine) this.dead('corner', opp, ...this.cornerSpot(opp, y), 24 + this.r.next() * 12);
      else this.dead('goalkick', opp, ...this.gkSpot(opp), 18 + this.r.next() * 12);
    } else this.dead('throw', opp, clamp(x, 1, 104), y < 34 ? 0.3 : 67.7, 10 + this.r.next() * 10);
  }
  dead(kind: string, k: 0 | 1, x: number, y: number, delay: number) {
    const B = this.ball; this.closeItem();
    B.st = 'dead'; B.h = null; B.rcv = null; B.land = null; this.carry = null;
    B.fx = B.x; B.fy = B.y; B.tx = x; B.ty = y; B.t0 = this.T; B.t1 = this.T + Math.min(2.5, delay * 0.4);
    const pool = this.team(k).filter((a) => kind === 'goalkick' ? a.o.pos === 'GK' : a.o.pos !== 'GK');
    let taker: Ag | null = null;
    const S = this.sides[k];
    const byP = (p: Player | null) => (p ? pool.find((a) => a.o.p === p) ?? null : null);
    if (kind === 'corner') { taker = byP(S.kick.ck); S.corners++; this.push(k, 0.4); }
    else if (kind === 'pk') taker = byP(S.kick.pk);
    else if (kind === 'fk') taker = byP(S.kick.fk);
    else if (kind === 'throw') { const thr = pool.find((a) => has(a.o, 'ロングスロー')); if (thr && tc(k, x, y)[0] > 72) { taker = thr; kind = 'lthrow'; } }
    if (kind === 'kickoff') taker = null;
    if (!taker && kind !== 'kickoff') taker = [...pool].sort((a, b) => hyp(a.x - x, a.y - y) - hyp(b.x - x, b.y - y))[0] ?? null;
    if (kind === 'fk') { const [fx, fy] = tc(k, x, y); if (!(fx > 78 && Math.abs(fy - 34) < 14 && hyp(105 - fx, 34 - fy) < 29) || this.r.next() < 0.6) kind = 'fkx'; }
    this.restart = { at: this.T + delay, kind, k, x, y, taker };
    this.poss = k;
    if (this.mic && kind === 'corner' && taker) this.line(k, fillLine(pickFresh(this.r, PH.setpiece.open.filter((x) => /コーナー/.test(x))), { S: this.tok(taker) }), 'corner', null, taker);
    if (this.mic && kind === 'fkx' && taker && tc(k, x, y)[0] > 70) this.line(k, ['フリーキック。', this.tok(taker), ' がゴール前へ入れる。'], 'fkcross', null, taker);
    if (this.mic && kind === 'fk' && taker) { this.line(k, [pickFresh(this.r, PH.fk.open)], 'fk', taker); this.line(k, fillLine(pickFresh(this.r, PH.fk.duel), { A: this.tok(taker), G: this.tok(this.gk(1 - k) ?? taker) })); }
    if (this.mic && kind === 'pk' && taker) this.line(k, fillLine(pickFresh(this.r, PH.pk.duel), { A: this.tok(taker), G: this.tok(this.gk(1 - k) ?? taker) }));
    if (this.mic && kind === 'lthrow' && taker) this.line(k, ['ロングスロー。', this.tok(taker), ' がゴール前へ投げこむ。'], 'throw', null, taker);
    this.doSubs();
  }
  private roll() { const B = this.ball; const u = clamp((this.T - B.t0) / Math.max(0.05, B.t1 - B.t0), 0, 1); B.x = B.fx + (B.tx - B.fx) * u; B.y = B.fy + (B.ty - B.fy) * u; }
  private doRestart() {
    const R = this.restart!; const B = this.ball; const k = R.k; const r = this.r;
    let t = R.taker;
    if (t && !t.out && hyp(t.x - R.x, t.y - R.y) > 2.5 && this.T < (R.lim ??= R.at + 6)) { R.at = this.T + 0.8; return; }
    if (!t || t.out) t = this.team(k).filter((a) => a.o.pos !== 'GK').sort((a, b) => hyp(a.x - R.x, a.y - R.y) - hyp(b.x - R.x, b.y - R.y))[0];
    if (!t) return;
    this.restart = null; B.x = R.x; B.y = R.y; t.x = R.x; t.y = R.y;
    const kind = R.kind;
    this.newSeq(t, kind === 'corner' || kind === 'fkx' || kind === 'lthrow' ? 'setpiece' : kind);
    if (kind === 'corner' || kind === 'fkx' || kind === 'lthrow') { this.poss = k; B.h = t; this.seq.from = 'setpiece'; this.seq.spk = kind === 'corner' ? 'corner' : kind === 'lthrow' ? 'throw' : 'fkcross'; const it = this.cur; this.cross(t, 'setpiece', kind); if (it) it.scene = kind === 'corner' ? 'corner' : kind === 'lthrow' ? 'throw' : 'fkcross'; return; }
    if (kind === 'fk') { this.poss = k; B.h = t; this.seq.from = 'fk'; const [x, y] = tc(k, R.x, R.y); this.shoot(t, 'fk', xgAt(x, y) * 1.15); return; }
    if (kind === 'pk') { this.poss = k; B.h = t; this.seq.from = 'pk'; const pv = this.E(t, SHT) + this.bonus(t, 'shot', 'pk', 'att'); void pv; this.shoot(t, 'pk', 0.74); return; }
    if (kind === 'kickoff') {
      this.fx('kickoff', k);
      const mates = this.team(k).filter((a) => a !== t && (a.o.pos === 'CM' || a.o.pos === 'DM' || a.o.pos === 'CB'));
      const to = mates.sort((a, b) => hyp(a.x - R.x, a.y - R.y) - hyp(b.x - R.x, b.y - R.y))[0];
      this.give(t, 'restart'); if (to) { this.pass(t, to, ...tc(k, to.x, to.y), 'pass', 0.95); }
      return;
    }
    if (kind === 'goalkick') {
      const short = this.sp(k).gk === 'short' || (this.sp(k).gk === 'mix' && r.next() < 0.45);
      const g = t; this.give(g, 'restart');
      if (short) { const cb = this.team(k).filter((a) => a.o.pos === 'CB' || a.o.pos === 'DM').sort((a, b) => this.pressOn(b) - this.pressOn(a))[0]; if (cb) { this.pass(g, cb, ...tc(k, cb.x, cb.y), 'pass', 0.9); return; } }
      const tg = this.team(k).filter((a) => a.o.pos === 'ST' || a.o.pos === 'AM' || a.o.pos === 'WG').sort((a, b) => b.e[PHY] - a.e[PHY])[0];
      if (tg) { stOf(this.sides[k], g.o.p).pa++; const [wx, wy] = [tg.x, tg.y]; this.ball.rcv = tg; this.kickBall(wx, wy, 20, true, () => this.contest(tg, wx, wy, 'longball')); }
      return;
    }
    /* スローイン・自由なフリーキック */
    this.give(t, 'restart'); this.due = this.T + 0.4;
  }

  /* ================= 1分ごと（ケガ・交代・流れ） ================= */
  private perMinute(mm: number) {
    for (const a of this.ags) if (!a.out) this.refresh(a);
    this.calcDq();
    /* 流れのグラフ：相手の陣地にボールがあるほうが押している */
    if (this.ball.st !== 'dead') { const [bx] = tc(this.poss, this.ball.x, this.ball.y); this.push(this.poss, bx > 70 ? 0.5 : bx > 52 ? 0.3 : 0.12); }
    /* ケガ */
    for (const s of this.sides) for (const a of this.team(this.sides.indexOf(s))) {
      const x = a.o; let ir = (0.012 / 90) * (1 + x.p.fat / 120) * (s.t.injMul ?? 1); if (hasBad(x, 'スペ体質')) ir *= 2.2; if (has(x, 'ケガをしにくい')) ir *= 0.45;
      if (!this.injured.has(x.p) && this.r.next() < ir) {
        this.injured.set(x.p, this.r.int(1, 5)); this.stopAcc += 60;
        if (this.mic) this.say([this.tok(a), ' が倒れこんだまま、起き上がれない。ケガのようだ。'], 'talk', s.t.me);
        if (this.autoSub[a.k] || x.pos === 'GK') this.doSub(s, a, [x.pos], mm, 'ケガ');
      }
    }
    /* 監督（ヘッドコーチ）の交代 */
    if (mm >= 55 && mm <= 88) for (let k = 0; k < 2; k++) if (this.autoSub[k]) this.mgrTick(k, mm);
    /* 負けている場所は、2人で守る */
    if (mm >= 30 && mm % 5 === 0) for (let k = 0; k < 2; k++) { const D = this.sides[k], A = this.sides[1 - k];
      for (const z of ['R', 'L']) if (!D.cover.has(z) && this.dom(A, z) > 0.35 && this.r.next() < tacOf(D.t.mgr)) { D.cover.add(z); if (this.mic) this.say([this.mg(D), ' が手を打った。', z === 'R' ? '左サイド' : '右サイド', 'を2人で守らせる。'], 'flow', D.t.me); } }
    /* 15分ごとの流れのひとこと */
    if (this.mic && mm % 15 === 7 && this.ball.st !== 'dead') this.flowTalk();
    if (this.mic && mm >= 80 && !this.lateTie && this.sides[0].goals === this.sides[1].goals && this.items.some((x) => x.shot && x.min >= 78) && this.r.next() < 0.15) { this.lateTie = true; this.evp({ t: mm, sec: this.clk, kind: 'talk', me: false, text: [pickFresh(this.r, LATE_TIE)], who: '実況', after: true, hl: true }); }
    /* 前半・後半のロスタイム */
    if (this.half === 1 && mm === 45 && !this.add[0]) { this.add[0] = clamp(Math.round(this.stopAcc / 60 * 0.5 + this.r.next()), 0, 3); this.stopAcc = 0; if (this.mic && this.add[0]) this.say([`前半のアディショナルタイムは${this.add[0]}分。`]); }
    if (this.half === 2 && mm === 90 && !this.add[1]) { this.add[1] = clamp(Math.round(this.stopAcc / 60 * 0.5 + 1 + this.r.next()), 1, 6); if (this.mic) this.say([`アディショナルタイムは${this.add[1]}分。`]); }
  }
  private calcDq() { for (let k = 0; k < 2; k++) { const f = this.team(k).filter((a) => a.o.pos !== 'GK'); this.dq[k] = f.length ? f.reduce((t, a) => t + a.e[DEF] * 0.5 + a.e[IQ] * 0.5, 0) / f.length : 50; } }
  private flowTalk() {
    const tot = this.possT[0] + this.possT[1] || 1; const share = this.possT[0] / tot; const k = share >= 0.5 ? 0 : 1; const S = this.sides[k], O = this.sides[1 - k];
    const mids = this.team(k).filter((a) => ['DM', 'CM', 'AM'].includes(a.o.pos)); const m1 = mids.length ? this.r.pick(mids) : this.team(k)[1]; const o1 = this.team(1 - k).find((a) => a.o.pos !== 'GK');
    if (!m1 || !o1) return;
    const talk: Line = Math.abs(share - 0.5) > 0.07
      ? this.r.pick<Line>([[this.ctok(S), ' がボールを持つ時間が長い。', this.tok(m1), ' を中心に、落ち着いてパスを回す。'], [this.tok(m1), ' が中盤で前を向く。', this.ctok(O), ' は自陣で耐える時間だ。'], [this.ctok(O), ' はなかなか前に出られない。', this.tok(o1), ' が声を出して守りを整える。'], [this.ctok(S), ' が押しこむ。', this.ctok(O), ' は守りの人数をそろえて、すきを見せない。']])
      : this.r.pick<Line>([['一進一退の攻防。', this.tok(m1), ' と ', this.tok(o1), ' が中盤で激しくぶつかる。'], ['どちらも決め手を欠いたまま、時間が過ぎていく。'], ['ボールが行ったり来たり。', this.tok(m1), ' が落ち着かせようと、何度も手で合図を送る。']]);
    this.say(talk);
  }
  private dom(s: Side, zone: string): number { let w = 0, l = 0; for (const d of s.duels.values()) if (d.zone === zone) { w += d.w; l += d.l; } return (w - l) / (w + l + 5); }
  /** 1対1の記録（攻める側から見て） */
  private duel(a: Ag, d: Ag, win: boolean) {
    const A = this.sides[a.k], D = this.sides[d.k];
    if (d.o.pos !== 'GK') { if (win) stOf(D, d.o.p).dl++; else stOf(D, d.o.p).dw++; }
    const key = `${a.o.p.id}-${d.o.p.id}`; let x = A.duels.get(key);
    if (!x) { x = { a: a.o.p, d: d.o.p, zone: zoneOf(a.o), w: 0, l: 0 }; A.duels.set(key, x); }
    if (win) x.w++; else x.l++;
    if (this.mic && !x.said && x.w + x.l >= 6 && (x.w >= x.l * 3 || x.l >= x.w * 3) && x.zone !== 'M') {
      x.said = true; const winA = x.w > x.l;
      this.evp({ t: this.minute(), sec: this.clk + 6, kind: 'talk', me: false, text: fillDuel(this.r, ZONE_NAME[x.zone], winA ? this.tok(a) : this.tok(d), winA ? this.tok(d) : this.tok(a)), who: '実況' });
    }
  }
  private duelGK(a: Ag, g: Ag, goal: boolean, ot: boolean) { if (!ot) return; const A = this.sides[a.k]; const key = `${a.o.p.id}-${g.o.p.id}`; let x = A.duels.get(key); if (!x) { x = { a: a.o.p, d: g.o.p, zone: 'G', w: 0, l: 0 }; A.duels.set(key, x); } if (goal) x.w++; else x.l++; }

  /* ---- 交代 ---- */
  private benchFor(s: Side, inPos: Pos[], youth = false) {
    const pool = s.bench.filter((b) => b.inj === 0 && !this.injured.has(b) && inPos.some((q) => b.apt[q] >= 1));
    if (!pool.length) return null;
    const best = (p: Player) => Math.max(...inPos.map((q) => posRating(p, q)));
    const subOrd = (p: Player) => (s.t.me && p.ord?.kind === 'sub' && s.t.heard?.get(p.id) ? 40 : 0);
    const score = (p: Player) => best(p) + (youth && p.age <= 21 ? 12 : 0) + (p.sp.includes('スーパーサブ') ? 3 : 0) - p.fat * 0.05 + subOrd(p) + (s.t.me ? youthBonus(p.age, youthBias(s.t)) * 0 : 0);
    const on = pool.sort((x, y) => score(y) - score(x))[0];
    const pos = inPos.slice().sort((a, b) => posRating(on, b) - posRating(on, a))[0];
    return { on, pos };
  }
  /** 交代する（off の選手を、ベンチの on と） */
  doSub(s: Side, off: Ag, inPos: Pos[], mm: number, why: string, youth = false, pick?: Player): boolean {
    if (s.subs >= 5 || off.out) return false;
    const b = pick ? { on: pick, pos: inPos[0] } : this.benchFor(s, inPos, youth); if (!b || !s.bench.includes(b.on)) return false;
    s.bench = s.bench.filter((x) => x !== b.on);
    const k = this.sides.indexOf(s);
    const lr = b.pos === off.o.pos ? off.o.lr : b.pos === 'WG' || b.pos === 'SB' ? (s.on.some((x) => x.pos === b.pos && x.lr === 'R') ? 'L' : 'R') : 'C';
    const nw: OnPl = { p: b.on, pos: b.pos, sub: true, lr };
    const idx = s.on.indexOf(off.o); if (idx >= 0) s.on[idx] = nw; s.offs.push(off.o); s.subs++; subMin(s, off.o.p, b.on, mm);
    s.subLog.push({ min: mm, off: off.o.p, on: b.on, why }); this.marks.push({ min: mm, kind: 'sub', side: k as 0 | 1 });
    off.o = nw; off.fx = []; for (const sp of b.on.sp) { const d = SP_MAP[sp]; if (d) off.fx.push(...d.fx); }
    off.en = clamp(1 - b.on.fat / 420, 0.7, 1); off.runUntil = 0; this.flags(off); this.refresh(off);
    if (this.ball.h === off && this.ball.st === 'held') { /* そのまま */ }
    this.placeRoles(k);
    if (s.kick.ck === off.o.p || s.kick.fk === off.o.p || s.kick.pk === off.o.p || [s.kick.ck, s.kick.fk, s.kick.pk].some((p) => p && !s.on.some((x) => x.p === p))) s.kick = chooseKickers(this.r, s);
    this.stopAcc += 20;
    if (this.mic) {
      const last = s.subLog[s.subLog.length - 1];
      this.say(['交代。', { t: last.off.name, me: s.t.me }, ' に代わって、', { t: b.on.name, me: s.t.me }, ' が入る。', WHY_LINE[why] ?? ''], 'talk', false);
      if (s.t.me && b.on.apps === 0) this.evp({ t: mm, sec: this.clk, kind: 'memo', me: true, text: [{ t: b.on.name, me: true }, ' が途中出場。これがプロ初出場だ。'] });
    }
    return true;
  }
  private formTo(s: Side, kind: 'atk' | 'def', mm: number) {
    if (s.changed) return;
    const f = [...s.t.mgr.forms].sort((x, y) => kind === 'atk' ? FORM_ATK[y] - FORM_ATK[x] : FORM_ATK[x] - FORM_ATK[y])[0];
    if (f === s.form || (kind === 'def' && FORM_ATK[f] >= FORM_ATK[s.form] - 1)) return;
    s.changed = true; this.setForm(this.sides.indexOf(s), f);
    if (this.mic) this.say([this.mg(s), kind === 'atk' ? ' が動いた。' + f + ' に切りかえて、攻めに出る。' : ' は ' + f + ' に変えて、リードを守りにいく。'], 'flow', s.t.me); void mm;
  }
  private mgrTick(k: number, mm: number) {
    const s = this.sides[k], o = this.sides[1 - k];
    if (s.subs >= 5 || (mm !== 46 && s.windows >= 3)) return;
    if (mm !== 46 && mm - s.lastAct < 4) return;
    const tac = tacOf(s.t.mgr); const lead = s.goals - o.goals;
    const lean = defLean(s.t.mgr) + (s.t.tilt === 'def' ? 1 : s.t.tilt === 'atk' ? -1 : 0);
    const justGoal = mm - this.lastGoal <= 3;
    const reasons: { why: string; off: Ag; inPos: Pos[]; form?: 'atk' | 'def'; youth?: boolean }[] = [];
    const outf = this.team(k).filter((x) => x.o.pos !== 'GK' && !this.injured.has(x.o.p));
    const tiredOf = (x: Ag) => (1 - x.en) * 160 + x.o.p.fat * 0.3 - x.o.p.cond * 4 - (x.o.sub ? 30 : 0);
    const byTired = [...outf].sort((a, b) => tiredOf(b) - tiredOf(a));
    if (s.t.me && mm >= 55) for (const on of s.bench.filter((b) => b.inj === 0 && b.ord?.kind === 'sub' && s.t.heard?.get(b.id))) {
      const off = byTired.find((x) => on.apt[x.o.pos] >= 2); if (off) { reasons.push({ why: 'オーナーの頼み', off, inPos: [off.o.pos] }); break; }
    }
    if (lead < 0 && mm >= 62 - tac * 14 - (justGoal ? 4 : 0)) {
      const d = [...outf].filter((x) => DEFP.includes(x.o.pos) && !(x.o.pos === 'CB' && outf.filter((y) => y.o.pos === 'CB').length <= 2 && lead > -2)).sort((a, b) => ovr(a.o.p) - ovr(b.o.p))[0] ?? outf.filter((x) => x.o.pos === 'DM' || x.o.pos === 'CM')[0];
      if (d) reasons.push({ why: '点を取りにいく', off: d, inPos: ATKP, form: 'atk' });
    }
    if (lead === 1 && mm >= 74 - lean * 6 - tac * 4 && (lean >= 0 || mm >= 84)) {
      const a = [...outf].filter((x) => ATKP.includes(x.o.pos)).sort((x, y) => tiredOf(y) - tiredOf(x))[0];
      if (a) reasons.push({ why: '守りきる', off: a, inPos: ['DM', 'CB', 'SB'], form: 'def' });
    }
    const yel = outf.find((x) => DEFP.includes(x.o.pos) && (stOf(s, x.o.p).yc ?? 0) >= 1);
    if (yel && mm >= 52 && this.r.next() < 0.3 + tac * 0.4) reasons.push({ why: 'イエロー', off: yel, inPos: [yel.o.pos] });
    if (mm >= 58 && byTired[0] && tiredOf(byTired[0]) > 30 - tac * 6) reasons.push({ why: '疲れ', off: byTired[0], inPos: [byTired[0].o.pos] });
    if ((lead >= 2 || (mm >= 75 && Math.abs(lead) >= 2)) && this.r.next() < 0.3 * youthBias(s.t) && byTired[0]) reasons.push({ why: '若手', off: byTired[0], inPos: [byTired[0].o.pos], youth: true });
    if (!reasons.length) return;
    const pAct = mm === 46 ? 0.15 + tac * 0.35 : 0.05 + tac * 0.2 + (mm >= 80 ? 0.15 : 0);
    if (this.r.next() > pAct) return;
    let n = 0; const used = new Set<Ag>();
    for (const x of reasons) {
      if (n >= 2 || used.has(x.off)) continue;
      if (x.form) this.formTo(s, x.form, mm);
      if (this.doSub(s, x.off, x.inPos, mm, x.why, x.youth)) { n++; used.add(x.off); }
    }
    if (!n) return;
    if (mm !== 46) s.windows++;
    s.lastAct = mm;
    if (this.mic && this.r.next() < 0.5) {
      const late = lead < 0 && mm >= 80 && s.subs <= n; const good = tac >= 0.72 && mm < 75;
      if (late) this.evp({ t: mm, sec: this.clk + 3, kind: 'talk', me: false, text: [pickFresh(this.r, ANA_LATE)], who: '解説', after: true });
      else if (good) this.evp({ t: mm, sec: this.clk + 3, kind: 'talk', me: false, text: [pickFresh(this.r, ANA_GOOD)], who: '解説', after: true });
    }
  }
  /** 並び方を変える（いまピッチにいる選手を、新しい枠に一番合うように並べ直す） */
  setForm(k: number, form: string) {
    const s = this.sides[k]; const slots = FORM[form]; if (!slots) return;
    const ags = this.team(k); const gk = ags.find((a) => a.o.pos === 'GK');
    const field = ags.filter((a) => a !== gk); const fslots = slots.filter((p) => p !== 'GK').slice(0, field.length);
    const pairs: { i: number; a: Ag; s: number }[] = [];
    fslots.forEach((pos, i) => { for (const a of field) pairs.push({ i, a, s: posRating(a.o.p, pos) + (a.o.pos === pos ? 3 : 0) }); });
    pairs.sort((a, b) => b.s - a.s);
    const done = new Set<Ag>(); const fill: (Ag | null)[] = fslots.map(() => null);
    for (const x of pairs) { if (fill[x.i] || done.has(x.a)) continue; fill[x.i] = x.a; done.add(x.a); }
    fill.forEach((a, i) => { if (a) { a.o.pos = fslots[i]; a.o.lr = undefined; this.flags(a); } });
    s.form = form;
    const tmp = { on: this.team(k).map((a) => a.o) } as unknown as Side; assignLR(tmp);
    this.placeRoles(k);
  }
  private doSubs() {
    if (!this.subQ.length) return;
    const q = this.subQ.splice(0); const mm = this.minute(); const winK = new Set<number>();
    for (const x of q) {
      const s = this.sides[x.k]; const off = this.ags.find((a) => a.k === x.k && !a.out && a.o.p === x.off);
      if (!off || !s.bench.includes(x.on)) continue;
      if (this.doSub(s, off, [x.pos ?? off.o.pos], mm, '指示', false, x.on)) winK.add(x.k);
    }
    for (const k of winK) { const s = this.sides[k]; if (!(this.half === 2 && this.clk < 2720)) s.windows++; s.lastAct = mm; }
  }

  /* ================= 試合の途中の指示（画面から） ================= */
  /** 並び方・戦い方・攻めと守りの方針を変える。すぐに効く */
  order(k: 0 | 1, o: SimOrder) {
    const s = this.sides[k];
    if (o.form && o.form !== s.form) { this.setForm(k, o.form); if (this.mic) this.say([this.mg(s), ' の指示で、並び方を ', o.form, ' に変えた。'], 'flow', s.t.me); }
    if (o.style && o.style !== s.style) { s.style = o.style; for (const a of this.team(k)) this.refresh(a); if (this.mic) this.say([this.mg(s), ' が戦い方を「', o.style, '」に切りかえる。'], 'flow', s.t.me); }
    if (o.tilt !== undefined && o.tilt !== this.ord[k].tilt) { this.ord[k].tilt = o.tilt; s.t.tilt = o.tilt; for (const a of this.team(k)) this.refresh(a); if (this.mic) this.say([this.mg(s), o.tilt === 'atk' ? ' が前へ出ろと指示。攻撃的に戦う。' : o.tilt === 'def' ? ' が守りを固めろと指示。守備的に戦う。' : ' はバランスよく戦うよう指示を出した。'], 'flow', s.t.me); }
    s.changed = true;
  }
  /** 交代を予約する（次にボールが止まったときに入る） */
  sub(k: 0 | 1, offId: number, onId: number, pos?: Pos): string | null {
    const s = this.sides[k];
    if (s.subs + this.subQ.filter((x) => x.k === k).length >= 5) return '交代は5人までです。';
    if (s.windows >= 3 && !(this.half === 2 && this.clk < 2720)) return '交代できる回数（3回）を使いきりました。';
    const off = this.ags.find((a) => a.k === k && !a.out && a.o.p.id === offId); const on = s.bench.find((p) => p.id === onId);
    if (!off || !on) return '選べない選手です。';
    if (this.subQ.some((x) => x.off === off.o.p || x.on === on)) return 'もう予約しています。';
    this.subQ.push({ k, off: off.o.p, on, pos: pos ?? off.o.pos });
    if (this.ball.st === 'dead') this.doSubs();
    return null;
  }

  /* ================= 前半の終わり・試合の終わり ================= */
  private kickoff(k: 0 | 1, first = false) {
    for (const a of this.ags) { if (a.out) continue; const [x, y] = tc(a.k, Math.min(a.ax, 48), a.ay); a.x = x; a.y = y; a.px = x; a.py = y; a.vx = a.vy = 0; }
    const B = this.ball; B.x = B.px = 52.5; B.y = B.py = 34;
    this.dead('kickoff', k, 52.5, 34, first ? 1.5 : 1.5);
    const t = this.team(k).find((a) => a.o.pos === 'ST') ?? this.team(k).find((a) => a.o.pos === 'AM') ?? this.team(k).find((a) => a.o.pos !== 'GK');
    if (t) { this.restart!.taker = t; t.x = 52.5 + (k === 0 ? -0.8 : 0.8); t.y = 34; }
  }
  private halftime() {
    this.closeItem(); const mm = 45; this.fx('half', 0);
    this.say(['前半終了。', this.ctok(this.sides[0]), ' ', String(this.sides[0].goals), ' - ', String(this.sides[1].goals), ' ', this.ctok(this.sides[1]), '。'], 'talk', false, 0, 2700 + this.add[0] * 60);
    if (this.mic) {
      const tot = Math.max(1, this.possT[0] + this.possT[1]);
      const shots = this.sides.map((x) => [...x.st.values()].reduce((t, y) => t + y.sh, 0)) as [number, number];
      let star: { name: Token; why: string } | null = null; let bs = 2.5;
      for (const x of this.sides) for (const [p, y] of x.st) { const v = y.g * 3 + y.as * 2 + y.kp + y.tk * 0.25 + y.dr * 0.45 + y.sv * 0.6; if (v > bs) { bs = v; star = { name: { t: p.name, me: x.t.me }, why: y.g ? 'もう点も取りました。' : y.sv >= 2 ? 'キーパーが当たっていますね。' : y.tk >= 5 ? '何度もボールを奪っています。' : y.dr >= 3 ? 'ドリブルで仕掛け続けています。' : y.kp >= 2 ? 'チャンスを何度も作っています。' : 'ボールがよく集まっています。' }; } }
      for (const m of halfTalk(this.r, { score: [this.sides[0].goals, this.sides[1].goals], poss: [Math.round((this.possT[0] / tot) * 100), 100 - Math.round((this.possT[0] / tot) * 100)], shots, names: [this.ctok(this.sides[0]), this.ctok(this.sides[1])], star })) this.evp({ t: 45, sec: 2700 + this.add[0] * 60 + 2, kind: 'talk', me: false, text: m.line, who: m.who, after: true, hl: true });
    }
    this.half = 2; this.clk = 2700; this.lastMin = 45;
    for (const a of this.ags) a.en = Math.min(1, a.en + 0.06);
    this.evp({ t: 46, sec: 2700, kind: 'talk', me: false, text: [this.r.pick(['後半が始まる。', '後半のキックオフ。', '選手たちがピッチにもどってきた。後半開始。'])] });
    for (let k = 0; k < 2; k++) if (this.autoSub[k]) this.mgrTick(k, 46);
    this.doSubs();
    this.kickoff(1);
    void mm;
  }
  private fulltime() {
    this.closeItem(); this.over = true; this.fx('end', 0);
    this.say(['試合終了の笛。', this.ctok(this.sides[0]), ' ', String(this.sides[0].goals), ' - ', String(this.sides[1].goals), ' ', this.ctok(this.sides[1]), '。'], 'talk', false, 0);
    this.ev[this.ev.length - 1].t = 90;
  }
  /** 試合の結果をまとめる（記録はここで1回だけ） */
  finish(): MatchResult {
    if (this.result) return this.result;
    while (!this.over) this.step();
    const sides = this.sides; const opts = this.opts; const r = this.r; const log = this.log; const ev = this.ev;
    log.sort((x, y) => (x.sec ?? x.min * 60) - (y.sec ?? y.min * 60));
    let pk: [number, number] | null = null;
    if (opts.cup && sides[0].goals === sides[1].goals) pk = shootout(r, sides, ev);
    const score: [number, number] = [sides[0].goals, sides[1].goals];
    const winner: 0 | 1 | null = score[0] > score[1] ? 0 : score[1] > score[0] ? 1 : pk ? (pk[0] > pk[1] ? 0 : 1) : null;
    for (const s of sides) for (const x of s.on) { const st = s.st.get(x.p); if (st) st.to = 90; }
    const rt = rateAll(sides, score);
    if (opts.record) record(r, sides, log, opts.label || '', rt, sides[0].t.comp ?? 'L', this.injured);
    const view = buildView(sides, log, ev, score, pk, !!opts.big, opts.title || '', rt);
    view.lineups = this.xi0;
    const tot = Math.max(1, this.possT[0] + this.possT[1]); const P = Math.round((this.possT[0] / tot) * 100);
    const sum = (s: Side, f: (x: St) => number) => [...s.st.values()].reduce((t, x) => t + f(x), 0);
    const two = (f: (s: Side) => number): [number, number] => [f(sides[0]), f(sides[1])];
    view.stats = { poss: [P, 100 - P], sh: two((s) => sum(s, (x) => x.sh)), ot: two((s) => sum(s, (x) => x.ot)), pa: two((s) => sum(s, (x) => x.pa)), pc: two((s) => sum(s, (x) => x.pc)), ck: two((s) => s.corners), fo: two((s) => s.fouls), yc: two((s) => s.cards.filter((c) => !c.red).length), rc: two((s) => s.cards.filter((c) => c.red).length), off: two((s) => s.offsides), sv: two((s) => sum(s, (x) => x.sv)) };
    const pts: number[] = []; for (let b = 0; b < 18; b++) { let v = 0; for (let m = b * 5 + 1; m <= b * 5 + 5; m++) v += this.pg[m]; pts.push(Math.round(Math.tanh(v / 4) * 100) / 100); }
    view.flowG = { pts, marks: this.marks };
    view.shots = sides.flatMap((s, k) => s.shots.map((x) => ({ ...x, side: k as 0 | 1 })));
    view.cards = sides.flatMap((s, k) => s.cards.map((c) => ({ min: c.min, side: k as 0 | 1, who: c.p.name, red: c.red })));
    view.subs = sides.flatMap((s, k) => s.subLog.map((x) => { const y = stOf(s, x.on); return { min: x.min, side: k as 0 | 1, off: x.off.name, on: x.on.name, why: WHY_SHORT[x.why] ?? x.why, rt: rt.get(x.on), g: y.g, a: y.as }; }));
    const meK = this.meK();
    if (meK >= 0) {
      const M = sides[meK], O = sides[1 - meK];
      const dz: { zone: string; me: string; opp: string; w: number; l: number; x: number; y: number }[] = [];
      const add = (zone: string, meP: Player, opP: Player, w: number, l: number) => { const e = dz.find((d) => d.me === meP.name && d.opp === opP.name); if (e) { e.w += w; e.l += l; } else { const xy = ZXY[zone]; dz.push({ zone, me: meP.name, opp: opP.name, w, l, x: xy[0], y: xy[1] }); } };
      for (const d of M.duels.values()) add(d.zone, d.a, d.d, d.w, d.l);
      for (const d of O.duels.values()) add(d.zone === 'R' ? 'Ld' : d.zone === 'L' ? 'Rd' : d.zone === 'C' ? 'Cd' : d.zone === 'G' ? 'Gd' : d.zone, d.d, d.a, d.l, d.w);
      view.duels = dz.filter((d) => d.w + d.l >= 3 && d.zone !== 'M').sort((a, b) => b.w + b.l - (a.w + a.l)).slice(0, 8);
      const kk = M.kick; view.kick = { ck: kk.ck?.name ?? '', fk: kk.fk?.name ?? '', pk: kk.pk?.name ?? '' };
    }
    if (this.mic) {
      const pp: [number, number] = [P, 100 - P];
      let decider: { name: Token; min: number } | null = null;
      if (winner != null && !pk) { const lose = score[1 - winner]; const g = log.filter((c) => c.goal && c.k === winner)[lose]; if (g) decider = { name: { t: g.att.p.name, me: sides[winner].t.me }, min: g.min }; }
      const m = view.mom; let momT: { name: Token; rt: string; why: string } | null = null;
      if (m) { const sd = sides.find((x) => x.t.name === m.club)!; const pl = [...sd.on, ...sd.offs].find((x) => x.p.name === m.name); const y = pl ? stOf(sd, pl.p) : null;
        const why = !y ? '' : y.g >= 2 ? `${y.g}点を取りました。` : y.g && y.as ? '点も取って、アシストもしました。' : y.g ? '大事なゴールを決めました。' : y.as ? 'アシストで勝ちに貢献しました。' : (y.psv ?? 0) ? 'PKを止めました。' : y.sv >= 3 ? `${y.sv}本のセーブで、ゴールを守りました。` : y.tk >= 6 ? `ボールを${y.tk}回も奪いました。` : '攻めも守りも、よく走っていました。';
        momT = { name: { t: m.name, me: m.me }, rt: m.rt.toFixed(1), why }; }
      let saves: { name: Token; n: number } | null = null;
      for (const x of sides) { const g = [...x.on, ...x.offs].find((y) => y.pos === 'GK'); if (g) { const n = stOf(x, g.p).sv; if (!saves || n > saves.n) saves = { name: { t: g.p.name, me: x.t.me }, n }; } }
      view.recap = fullTalk(r, { score, pk, names: [this.ctok(sides[0]), this.ctok(sides[1])], poss: pp, winner, decider, mom: momT, saves, final: !!opts.final, big: !!opts.big }).map((x: MicLine) => ({ who: x.who, line: x.line }));
    }
    this.pkRes = pk;
    return (this.result = { score, pk, winner, view });
  }

  /* ================= 実況 ================= */
  meK() { return this.sides[0].t.me ? 0 : this.sides[1].t.me ? 1 : -1; }
  tok(a: Ag): Token { return { t: a.o.p.name, me: this.sides[a.k].t.me }; }
  ctok(s: Side): Token { return { t: s.t.name, me: s.t.me }; }
  mg(s: Side): Token { return s.t.me ? { t: s.t.fixed ? s.t.mgr.name.split(' ')[0] + 'ヘッドコーチ' : mgrShort(s.t.mgr), me: true } : { t: s.t.name + 'の監督', me: false }; }
  private foot(a: Ag) { const f = a.o.p.foot; return f === '左' ? '左足' : f === '両' ? (this.r.next() < 0.5 ? '右足' : '左足') : '右足'; }
  private fireTok(f: Fire[]): Line { return f.slice(0, 2).map((u) => ({ sp: u.sp, t: u.t, me: u.me })); }
  private gk(k: number): Ag | null { return this.team(k).find((a) => a.o.pos === 'GK') ?? null; }
  private push(k: number, v: number) { const mm = Math.min(91, this.minute()); this.pg[mm] += k === 0 ? v : -v; }
  private newItem(k: 0 | 1, scene: string, att: Ag | null): Item { return { id: ++this.gid, k, sec: this.clk, lines: [], secs: [], scene, att, assist: null, def: null, shot: false, ok: false, goal: false, save: false, hv: 0, xg: 0, min: this.minute() }; }
  /** 攻めの場面に1行足す（場面がなければ始める） */
  private line(k: 0 | 1, l: Line, scene = '', att: Ag | null = null, assist: Ag | null = null, def: Ag | null = null) {
    if (!this.mic) return;
    if (this.cur && (this.cur.k !== k || (!this.cur.shot && this.clk - (this.cur.secs[this.cur.secs.length - 1] ?? this.cur.sec) > 9))) this.closeItem();
    if (!this.cur) this.cur = this.newItem(k, scene || 'combo', att);
    const it = this.cur;
    if (scene && !it.lines.length) it.scene = scene;
    if (att) it.att = att; if (assist && assist !== att) it.assist = assist; if (def) it.def = def;
    const last = it.secs.length ? it.secs[it.secs.length - 1] : -99;
    const ln = l.filter((x) => x !== '' && x != null); const sec = Math.max(this.clk, last + 0.9);
    it.lines.push(ln); it.secs.push(sec);
    this.tapIn({ T: this.T + (sec - this.clk), clk: sec, half: this.half, min: this.minute(), line: ln, kind: 'play', me: this.sides[k].t.me, gid: it.id, k });
    this.nextPlay = this.T + 12;
  }
  /** 場面を閉じて、記録にする（シュートがあった場面・言葉のある場面） */
  private closeItem() {
    const it = this.cur; this.cur = null;
    if (!it || (!it.shot && !it.lines.length)) return;
    if (!it.att) { if (!it.lines.length) return; }
    this.items.push(it);
    const att = it.att ?? this.team(it.k)[0]; if (!att) return;
    const c: Chance = { min: it.min, scene: it.scene, k: it.k, att: att.o, assist: it.assist && it.assist !== att ? it.assist.o : null, def: it.def?.o ?? null, ok: it.shot, goal: it.goal, save: it.save, shotAv: it.xg * 100, text: it.lines, sec: it.sec, secs: it.secs, hv: it.shot ? it.hv : it.lines.length >= 3 ? 1 : 0 };
    const x = it as Item & { flow?: string | null; mem?: boolean; score?: [number, number] };
    if (it.goal) { c.flow = x.flow ?? null; c.mem = x.mem; c.score = x.score; }
    /* 見どころだけのとき：場面の始まりから見せる */
    if (it.shot && (it.goal || it.hv >= SIM_HL)) { const toT = (sec: number) => this.T - (this.clk - sec); const end = toT(it.secs[it.secs.length - 1] ?? it.sec); this.hlNew.push({ T: end, start: Math.max(toT(it.sec) - 6, end - 16), hv: it.hv }); }
    if (!it.shot && !this.mic) return;
    if (!it.shot && it.lines.length < 2) { this.ev.push({ t: it.min, sec: it.sec, kind: 'talk', me: this.sides[it.k].t.me && it.lines.length > 0 && /奪|かわ|抜/.test(JSON.stringify(it.lines)), text: it.lines[0], good: false }); return; }
    this.log.push(c);
  }
  /** 画面用の行を、時刻の順に入れる */
  private tapIn(t: Tap) { const a = this.tap; let i = a.length; while (i > 0 && a[i - 1].T > t.T) i--; if (i === a.length) a.push(t); else a.splice(i, 0, t); }
  private evp(e: Ev) {
    this.ev.push(e);
    if (this.mic) { const sec = e.sec ?? this.clk; this.tapIn({ T: this.T + (sec - this.clk), clk: sec, half: this.half, min: e.t, line: e.text, kind: e.kind, me: e.me, who: e.who, imp: e.kind !== 'talk' || !!e.who || e.pre || /交代|ケガ|前半|後半|試合終了|アディショナル/.test(String(e.text[0])) }); }
  }
  /** 場面の外のひとこと */
  say(l: Line, kind: 'talk' | 'flow' = 'talk', me = false, hvNo = 0, sec = this.clk) { void hvNo; if (!this.mic) return; this.evp({ t: this.minute(), sec, kind, me, text: l.filter((x) => x !== '') }); }
  private play(k: PlayKind, a: Ag, d: Ag | null) {
    if (!this.mic || this.T < this.nextPlay) return;
    this.nextPlay = this.T + 25;
    const A = this.sides[a.k]; const D = this.sides[1 - a.k];
    const map: Record<string, Token> = { A: this.tok(a), T: this.ctok(A), O: this.ctok(D) }; if (d) map.D = this.tok(d);
    const good = (A.t.me && k === 'dr') || (d != null && this.sides[d.k].t.me && k === 'tk');
    this.evp({ t: this.minute(), sec: this.clk, kind: 'talk', me: good, text: playLine(this.r, k, map), good });
  }
  private pre() {
    const ev = this.ev; const sides = this.sides; const r = this.r; const opts = this.opts;
    if (this.mic) {
      const ms = sides.find((x) => x.t.me)!; const ace = [...ms.on].filter((x) => x.pos !== 'GK').sort((a, b) => b.p.seasonGoals - a.p.seasonGoals || ovr(b.p) - ovr(a.p))[0];
      for (const m of preTalk(r, this.ctok(sides[0]), this.ctok(sides[1]), opts.pre?.info ?? '', opts.pre?.stakes ?? { kind: '' }, ace ? { name: this.ctokP(ms, ace), goals: ace.p.seasonGoals } : null)) this.evp({ t: 0, sec: 0, kind: 'talk', me: false, text: m.line, who: m.who as Who, pre: true, hl: true });
    }
    this.evp({ t: 0, sec: 0.5, kind: 'talk', me: false, text: ['キックオフ。', this.ctok(sides[0]), ' は ', sides[0].form, '、', this.ctok(sides[1]), ' は ', sides[1].form, ' で入った。'] });
    for (const s of sides) for (const x of s.on) if (s.t.me && x.p.apps === 0) this.evp({ t: 1, sec: 1, kind: 'memo', text: [this.ctokP(s, x), ' がプロとして初めてピッチに立つ。'], me: true });
  }
  private ctokP(s: Side, x: OnPl): Token { return { t: x.p.name, me: s.t.me }; }
}
const SIM_HL = 4.2;

/** 試合を最後まで進めて、結果を返す（見ない試合・ほかのクラブの試合） */
export function simulateMatch(r: Rng, home: TeamIn, away: TeamIn, opts: MatchOpts = {}): MatchResult {
  return new MatchSim(r, home, away, opts).run();
}
