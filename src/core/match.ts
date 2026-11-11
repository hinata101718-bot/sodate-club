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

export type Policy = '若手多め' | 'ふつう' | '勝ち優先';
export interface TeamIn { id: number; name: string; me: boolean; color: string; squad: Player[]; mgr: Manager; policy?: Policy; injMul?: number;
  /** オーナーの頼みを聞いたか（選手ごと。試合の中で決まる） */
  heard?: Map<number, boolean>;
  /** 監督の今月の方針（月の経営会議で話したこと）：守りを固める／攻めに出る */
  tilt?: 'def' | 'atk' | null; }
export interface MatchOpts { record?: boolean; label?: string; big?: boolean; cup?: boolean; neutral?: boolean; title?: string; }
export interface OnPl { p: Player; pos: Pos; sub: boolean; }
/** 1試合の選手ごとの数字（問107） */
export interface St { pa: number; pc: number; tk: number; sh: number; ot: number; sv: number; dr: number; kp: number; as: number; g: number; dw: number; dl: number; ga: number; from: number; to: number }
const zeroSt = (from = 0): St => ({ pa: 0, pc: 0, tk: 0, sh: 0, ot: 0, sv: 0, dr: 0, kp: 0, as: 0, g: 0, dw: 0, dl: 0, ga: 0, from, to: 90 });
interface Side {
  t: TeamIn; home: boolean; day: number; style: StyleName; form: string; on: OnPl[]; bench: Player[]; subs: number; goals: number; str: number; offs: OnPl[]; changed: boolean;
  st: Map<Player, St>;
}
export interface Fire { sp: string; t: string; me: boolean; gk?: boolean; step?: string }
interface Chance {
  min: number; scene: string; k: number; att: OnPl; assist: OnPl | null; def: OnPl | null; ok: boolean; goal: boolean; save: boolean; shotAv: number; text: Line[];
  flow?: string | null; mem?: boolean; score?: [number, number]; turnover?: boolean;
}
interface Ev { t: number; kind: 'talk' | 'flow' | 'memo'; text: Line; me: boolean; }

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
  let sq = t.squad.filter((p) => p.inj === 0);
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
export function simulateMatch(r: Rng, home: TeamIn, away: TeamIn, opts: MatchOpts = {}): MatchResult {
  const sides: Side[] = [home, away].map((t, ix) => {
    const myS = teamStrength(t.squad), opS = teamStrength((ix ? home : away).squad);
    const form = chooseForm(t.mgr, myS, opS, t.squad, t.tilt);
    const { lineup, bench } = pickLineup(r, t, form);
    return { t, home: ix === 0 && !opts.neutral, day: (r.next() - 0.5) * 8, style: t.mgr.style, form, on: lineup, bench, subs: 0, goals: 0, str: myS, offs: [], changed: false, st: new Map(lineup.map((x) => [x.p, zeroSt()])) };
  });
  const ev: Ev[] = []; const log: Chance[] = [];
  const T = (side: Side, pl: OnPl | Player): Token => ({ t: ('p' in pl ? pl.p : pl).name, me: side.t.me });
  const C = (side: Side): Token => ({ t: side.t.name, me: side.t.me });
  for (const s of sides) for (const x of s.on) if (s.t.me && x.p.apps === 0) ev.push({ t: 1, kind: 'memo', text: [T(s, x), ' がプロとして初めてピッチに立つ。'], me: true });
  ev.push({ t: 0, kind: 'talk', me: false, text: ['キックオフ。', C(sides[0]), ' は ', sides[0].form, '、', C(sides[1]), ' は ', sides[1].form, ' で入った。'] });
  const pending: { k: number; min: number }[] = [];
  for (let blk = 0; blk < 6; blk++) {
    const t0 = blk * 15;
    if (blk === 3) {
      ev.push({ t: 45, kind: 'talk', me: false, text: ['前半終了。', C(sides[0]), ' ', String(sides[0].goals), ' - ', String(sides[1].goals), ' ', C(sides[1]), '。'] });
      ev.push({ t: 46, kind: 'talk', me: false, text: [r.pick(['後半が始まる。', '後半のキックオフ。', '選手たちがピッチにもどってきた。後半開始。'])] });
    }
    /* 点差で監督が動く（問56・問62） */
    if (blk === 4) {
      for (let k = 0; k < 2; k++) {
        const s = sides[k], o = sides[1 - k];
        if (s.goals < o.goals && !s.changed) {
          const att = [...s.t.mgr.forms].sort((x, y) => FORM_ATK[y] - FORM_ATK[x])[0];
          if (att !== s.form) { s.form = att; s.changed = true; ev.push({ t: 60, kind: 'flow', me: s.t.me, text: [s.t.me ? { t: mgrShort(s.t.mgr), me: true } : { t: s.t.name + 'の監督', me: false }, ' が動いた。' + att + ' に切りかえて、攻めに出る。'] }); }
        } else if (s.goals > o.goals && s.goals - o.goals <= 1 && !s.changed) {
          const def = [...s.t.mgr.forms].sort((x, y) => FORM_ATK[x] - FORM_ATK[y])[0];
          if (def !== s.form && FORM_ATK[def] < FORM_ATK[s.form] - 1) { s.form = def; s.changed = true; ev.push({ t: 66, kind: 'flow', me: s.t.me, text: [s.t.me ? { t: mgrShort(s.t.mgr), me: true } : { t: s.t.name + 'の監督', me: false }, ' は ' + def + ' に変えて、リードを守りにいく。'] }); }
        }
        doSubs(r, s, o, ev, 60);
      }
    }
    if (blk === 5) for (let k = 0; k < 2; k++) doSubs(r, sides[k], sides[1 - k], ev, 75);
    const mH = mid(sides[0]), mA = mid(sides[1]);
    const st0 = STYLES[sides[0].style], st1 = STYLES[sides[1].style];
    const lazy = (s: Side) => countBad(s, '守備をサボる') * 0.12;
    const share = sig((mH - mA) / 11 + (st0.chanceAdj - st1.chanceAdj) * 0.15 + (st1.oppChance - st0.oppChance) * 0.06 + (FORM_ATK[sides[0].form] - FORM_ATK[sides[1].form]) * 0.05 + 0.08 + lazy(sides[1]) - lazy(sides[0]));
    const total = TUNE.base + (st0.chanceAdj + st1.chanceAdj) * 0.12 + (st0.oppChance + st1.oppChance) * 0.1 + (FORM_ATK[sides[0].form] + FORM_ATK[sides[1].form]) * 0.06;
    const n = Math.max(0, Math.round(total + (r.next() - 0.5) * 1.6));
    {
      const k = share >= 0.5 ? 0 : 1; const S = sides[k], O = sides[1 - k];
      const mm = S.on.filter((x) => MID.includes(x.pos)); const m1 = mm.length ? r.pick(mm) : r.pick(S.on); const o1 = r.pick(O.on.filter((x) => x.pos !== 'GK'));
      const talk: Line = Math.abs(share - 0.5) > 0.08
        ? r.pick<Line>([[C(S), ' がボールを持つ時間が長い。', T(S, m1), ' を中心に、落ち着いてパスを回す。'], [T(S, m1), ' が中盤で前を向く。', C(O), ' は自陣で耐える時間だ。'], [C(O), ' はなかなか前に出られない。', T(O, o1), ' が声を出して守りを整える。'], [C(S), ' が押しこむ。', C(O), ' は守りの人数をそろえて、すきを見せない。']])
        : r.pick<Line>([['一進一退の攻防。', T(S, m1), ' と ', T(O, o1), ' が中盤で激しくぶつかる。'], ['どちらも決め手を欠いたまま、時間が過ぎていく。'], [T(O, o1), ' のファウルで試合が止まる。', T(S, m1), ' が立ち上がって、プレーが再開した。'], ['ボールが行ったり来たり。', T(S, m1), ' が落ち着かせようと、何度も手で合図を送る。'], [T(O, o1), ' が ', T(S, m1), ' を後ろから倒した。審判が注意を与える。']]);
      ev.push({ t: t0 + r.int(2, 13), kind: 'talk', me: false, text: talk });
    }
    const minutes: { k: number; min: number }[] = [];
    for (let c = 0; c < n; c++) minutes.push({ k: r.next() < share ? 0 : 1, min: t0 + r.int(1, 15) });
    minutes.push(...pending.splice(0).map((x) => ({ k: x.k, min: Math.max(x.min, t0 + 1) })));
    minutes.sort((x, y) => x.min - y.min);
    const press = sides.map((s) => { const f = s.on.filter((x) => x.pos !== 'GK'); return f.reduce((t, x) => t + x.p.a[DEF] * 0.6 + x.p.a[IQ] * 0.4, 0) / Math.max(1, f.length); });
    let ci = 0;
    for (let mm = t0 + 1; mm <= t0 + 15; mm++) {
      /* この1分のボールの動き。決定機がある分は、その攻めの流れが決定機につながる */
      const here: { k: number; min: number }[] = [];
      while (ci < minutes.length && minutes[ci].min <= mm) here.push(minutes[ci++]);
      if (!here.length) { const k = r.next() < share ? 0 : 1; flow(r, sides[k], sides[1 - k], mm, press[1 - k], false, 11, 5); if (r.next() < 0.85) flow(r, sides[1 - k], sides[k], mm, press[k], false, 7, 2); }
      for (const { k } of here) flow(r, sides[k], sides[1 - k], mm, press[1 - k], true);
    for (const { k, min } of here) {
      const A = sides[k], D = sides[1 - k];
      const res = resolveChance(r, A, D, Math.min(90, min));
      if (!res) continue;
      res.k = k;
      log.push(res);
      chanceStats(A, D, res);
      if (res.turnover && min < 89) pending.push({ k: 1 - k, min: min + 1 });
      if (res.goal) {
        const before: [number, number] = [sides[0].goals, sides[1].goals]; A.goals++;
        const tie = sides[0].goals === sides[1].goals; const lead = before[k] === before[1 - k] && D.goals > 0;
        res.flow = tie ? '同点' : lead ? '勝ち越し' : before[k] < before[1 - k] && A.goals > D.goals ? '逆転' : null;
        if (A.t.me && res.att.p.goals === 0 && !log.some((x) => x !== res && x.goal && x.att.p === res.att.p)) res.mem = true;
        res.score = [sides[0].goals, sides[1].goals];
      }
    }
    }
    if (pending.length && blk === 5) pending.length = 0;
  }
  ev.push({ t: 90, kind: 'talk', me: false, text: ['試合終了の笛。', C(sides[0]), ' ', String(sides[0].goals), ' - ', String(sides[1].goals), ' ', C(sides[1]), '。'] });
  log.sort((x, y) => x.min - y.min);
  /* 勝ち抜きの大会で引き分け：延長はせず、すぐにPK戦 */
  let pk: [number, number] | null = null;
  if (opts.cup && sides[0].goals === sides[1].goals) pk = shootout(r, sides, ev);
  const score: [number, number] = [sides[0].goals, sides[1].goals];
  const winner: 0 | 1 | null = score[0] > score[1] ? 0 : score[1] > score[0] ? 1 : pk ? (pk[0] > pk[1] ? 0 : 1) : null;
  const rt = rateAll(sides, score);
  if (opts.record) record(r, sides, log, opts.label || '', rt);
  const view = buildView(sides, log, ev, score, pk, !!opts.big, opts.title || '', rt);
  return { score, pk, winner, view };
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

function doSubs(r: Rng, s: Side, o: Side, ev: Ev[], min: number) {
  if (s.subs >= 5) return;
  const cands = [...s.on].filter((x) => x.pos !== 'GK').sort((x, y) => (y.p.fat + (100 - y.p.a[STA]) * 0.4 - y.p.cond * 8) - (x.p.fat + (100 - x.p.a[STA]) * 0.4 - x.p.cond * 8));
  const lead = s.goals - o.goals;
  /* オーナーの「途中からでも使ってほしい」（問93）：聞いてくれたら、その選手が得意なポジションの選手と代える */
  if (s.t.me) for (const on of s.bench.filter((b) => b.inj === 0 && b.ord?.kind === 'sub' && s.t.heard?.get(b.id))) {
    if (s.subs >= 5) break;
    const off = cands.filter((x) => on.apt[x.pos] >= 2 && x.pos !== 'GK')[0]; if (!off) continue;
    s.bench = s.bench.filter((b) => b !== on); cands.splice(cands.indexOf(off), 1);
    const idx = s.on.indexOf(off); s.on[idx] = { p: on, pos: off.pos, sub: true }; s.offs.push(off); s.subs++; subMin(s, off.p, on, min);
    ev.push({ t: min, kind: 'talk', me: false, text: ['交代。', { t: off.p.name, me: true }, ' に代わって、', { t: on.name, me: true }, ' が入る。'] });
    if (on.apps === 0) ev.push({ t: min, kind: 'memo', me: true, text: [{ t: on.name, me: true }, ' が途中出場。これがプロ初出場だ。'] });
  }
  const want = 2;
  for (let i = 0; i < want && s.subs < 5; i++) {
    const off = cands[i]; if (!off) break;
    const pool = s.bench.filter((b) => b.inj === 0 && b.apt[off.pos] >= 1);
    if (!pool.length) break;
    const youthTry = (lead >= 2 || (min === 75 && Math.abs(lead) >= 2)) && r.next() < 0.5 * youthBias(s.t);
    const subOrd = (p: Player) => (s.t.me && p.ord?.kind === 'sub' && s.t.heard?.get(p.id) ? 40 : 0);
    const score = (p: Player) => posRating(p, off.pos) + (youthTry && p.age <= 21 ? 12 : 0) + (p.sp.includes('スーパーサブ') ? 3 : 0) - p.fat * 0.05 + subOrd(p);
    pool.sort((x, y) => score(y) - score(x));
    const on = pool[0]; s.bench = s.bench.filter((b) => b !== on);
    const idx = s.on.indexOf(off); s.on[idx] = { p: on, pos: off.pos, sub: true }; s.offs.push(off); s.subs++; subMin(s, off.p, on, min);
    ev.push({ t: min, kind: 'talk', me: false, text: ['交代。', { t: off.p.name, me: s.t.me }, ' に代わって、', { t: on.name, me: s.t.me }, ' が入る。'] });
    if (s.t.me && on.apps === 0) ev.push({ t: min, kind: 'memo', me: true, text: [{ t: on.name, me: true }, ' が途中出場。これがプロ初出場だ。'] });
  }
}

/** 調整用の数字（バランスの確かめで動かす） */
export const TUNE = { base: 2.0, shotK: 17, shotMul: 1.06, duelK: 15 };

/* ---------- 場面の解決（企画書 13-2 の表） ---------- */
function resolveChance(r: Rng, A: Side, D: Side, min: number): Chance | null {
  const st = STYLES[A.style];
  const w: [string, number][] = Object.entries(SCENE_BASE).map(([k, v]) => [k, v * (st.scene[k] || 1)]);
  const mul = (k: string, m: number) => { const e = w.find((x) => x[0] === k); if (e) e[1] *= m; };
  if (anyOn(A, '仕掛け屋')) mul('dribble', 1.6);
  if (anyOn(A, 'チャンスメーカー')) { mul('combo', 1.5); mul('counter', 1.15); }
  if (A.style === 'ゲーゲンプレス' && anyOn(A, 'プレッサー')) mul('error', 1.4);
  if (anyOn(D, '現代型キーパー')) mul('error', 0.75);
  mul('pk', Math.pow(1.8, countBad(D, 'ラフプレイヤー')) * Math.pow(0.6, countOn(D, 'クリーンディフェンス')));
  if (anyOn(D, '2列目からの飛び出し') || anyOn(D, '攻撃参加')) mul('counter', 1.2);
  let scene = r.wpick(w);
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
  if (scene === 'setpiece') { const fkMan = A.on.some((x) => has(x, 'フリーキックの名手')); if (r.next() < (fkMan ? 0.45 : 0.22)) scene = 'fk'; }
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
      assist = wPlayer(r, A.on, PAS, 'assist', 'プレースキッカー'); att = wPlayer(r, byPos(A, ['CB', 'ST', 'DM']).filter((x) => x !== assist), PHY, 'shoot', 'パワーヘッダー'); def = cb();
      ok = vs(att, air(A, att), def, air(D, def), 'air', TUNE.duelK, feed(assist, PAS)); headed = true; shotBonus = -3; break;
    }
    case 'fk': {
      const fkm = A.on.filter((x) => has(x, 'フリーキックの名手'));
      att = fkm.length ? r.pick(fkm) : wPlayer(r, A.on.filter((x) => x.pos !== 'GK'), SHT, 'shoot', 'プレースキッカー'); def = cb(); shotBonus = -7; break;
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
      att = [...A.on].filter((x) => x.pos !== 'GK').sort((x, y) => y.p.a[SHT] + (has(y, 'PKの名手') ? 15 : 0) - x.p.a[SHT] - (has(x, 'PKの名手') ? 15 : 0))[0];
      const rough = D.on.filter((x) => x.p.bad.includes('ラフプレイヤー'));
      def = rough.length && r.next() < 0.6 ? r.pick(rough) : pickDef(r, D, ['CB', 'SB', 'DM']); shotBonus = 14; break;
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
  let goal = false, save = false, shotAv = 0, gkFired = false;
  if (ok) {
    const sv = E(A, att, SHT) + bonus(A, att, 'shot', 'att', shotFires) + shotBonus;
    let gv = E(D, g, SHT) + bonus(D, g, 'save', 'def', shotFires);
    if (headed) gv = (gv + E(D, g, DEF)) / 2 + (shotFires.some((f) => f.sp === 'ハイボール処理') ? 3.5 : 0);
    const pr = sig((sv - gv) / TUNE.shotK) * (scene === 'pk' ? 1.15 : TUNE.shotMul);
    goal = r.next() < pr; save = !goal; shotAv = sv;
    gkFired = shotFires.some((f) => f.gk);
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
  const text = narrate(r, scene, A, D, att, assist, def, g, ok, goal, fires, shotFires, headed, rec, gkFired);
  return { min, scene, k: 0, att, assist: assist && assist !== att ? assist : null, def: def ?? null, ok, goal, save, shotAv, text, turnover };
}
function gk(s: Side) { return gkOf(s); }


/* ---------- 記録（出場・疲れ・ケガ・ゴール） ---------- */
function record(r: Rng, sides: Side[], log: Chance[], label: string, rt: Map<Player, number>) {
  for (const s of sides) {
    for (const x of [...s.on, ...s.offs]) {
      const p = x.p;
      p.apps++; p.seasonApps++; p.seasonPerf += 1;
      const v = rt.get(p); if (v != null) { p.seasonRt = (p.seasonRt ?? 0) + v; p.seasonRtN = (p.seasonRtN ?? 0) + 1; p.seasonPerf += clamp(v - 6.5, -1, 2); }
      p.exp = clamp(p.exp + (p.sp.includes('吸収力') ? 8 : 3), 0, 100);
      if (s.t.me && !p.firstApp) p.firstApp = label;
      p.played = true;
      if (p.apt[x.pos] < 3) p.aptXp[x.pos] = (p.aptXp[x.pos] || 0) + 1;
      let f = 24 * (1.25 - p.a[STA] / 100); if (p.bad.includes('スタミナ切れ')) f *= 1.3; p.fat = clamp(p.fat + f, 0, 100);
      let ir = 0.012 * (1 + p.fat / 120) * (s.t.injMul ?? 1); if (p.bad.includes('スペ体質')) ir *= 2.2; if (p.sp.includes('ケガをしにくい')) ir *= 0.45;
      if (r.next() < ir) { p.inj = r.int(1, 5); p.injNew = true; }
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
  const evItem = (e: Ev): ViewItem => ({ min: e.t, kind: e.kind, me: e.me, lines: [e.text] });
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
  hl.sort((a, b) => a.min - b.min || (a.kind === 'memo' ? -1 : 1));
  const full: ViewItem[] = [...log.map(toItem), ...ev.map(evItem)].sort((x, y) => x.min - y.min || (x.kind === 'talk' && y.kind !== 'talk' ? (x.min >= 90 ? 1 : -1) : 0));
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
/** 1回の攻め：パスをつなぐ。keep のときは、このあと決定機になる（とちゅうで奪われない） */
function flow(r: Rng, A: Side, D: Side, t: number, press: number, keep: boolean, maxLen = 7, minLen = 2): void {
  let h = r.wpick(A.on.map((x) => [x, W_HOLD[x.pos]] as [OnPl, number]));
  const n = r.int(minLen, maxLen);
  for (let i = 0; i < n; i++) {
    const sh = stOf(A, h.p);
    /* 決定機にならないシュート（遠め・角度がない）：点にはならない。枠外・ブロック・キーパーが楽に止める */
    if (!keep && i >= 1 && (FWD.includes(h.pos) || h.pos === 'CM') && r.next() < (FWD.includes(h.pos) ? 0.1 : 0.035) * (0.6 + h.p.a[SHT] / 100)) {
      sh.sh++; if (r.next() >= 0.7) { sh.ot++; stOf(D, gkOf(D).p).sv++; }
      return;
    }
    if (FWD.includes(h.pos) && r.next() < 0.16) {
      const d = winner(r, D);
      const win = keep || r.next() < sig((fv(A, h, DRI, t) - fv(D, d, DEF, t)) / 14 + 0.25);
      if (win) sh.dr++; else { stOf(D, d.p).tk++; return; }
    }
    const to = r.wpick(A.on.filter((x) => x !== h).map((x) => [x, W_HOLD[x.pos] * (i >= 2 && FWD.includes(x.pos) ? 1.6 : 1) * (x.pos === 'GK' ? 0.6 : 1)] as [OnPl, number]));
    const pOk = clamp(0.83 + ((fv(A, h, PAS, t) + fv(A, h, IQ, t)) / 2 - press) / 140 - i * 0.012 - (h.pos === 'GK' ? 0.08 : 0) + (FWD.includes(to.pos) ? -0.04 : 0.03), 0.55, 0.97);
    sh.pa++;
    if (keep || r.next() < pOk) { sh.pc++; h = to; } else { stOf(D, winner(r, D).p).tk++; return; }
  }
}
function chanceStats(A: Side, D: Side, c: Chance) {
  const g = gkOf(D);
  if (c.ok) {
    const s = stOf(A, c.att.p); s.sh++;
    if (c.goal) { s.g++; s.ot++; stOf(D, g.p).ga++; if (c.assist) stOf(A, c.assist.p).as++; }
    else if (c.save) { s.ot++; stOf(D, g.p).sv++; }
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
  v += st.pc * 0.007 - (st.pa - st.pc) * 0.025;
  v += st.tk * 0.06 + st.dr * 0.08 + st.dw * 0.22 - st.dl * 0.2;
  if (pos === 'GK') v += st.sv * 0.33 - ga * 0.35 + (ga === 0 ? 0.45 : 0);
  else if (DEFS.includes(pos)) v += -ga * 0.15 + (ga === 0 ? 0.35 : 0);
  else if (pos === 'DM') v += -ga * 0.07 + (ga === 0 ? 0.15 : 0);
  v += res * 0.25;
  const mins = Math.max(1, st.to - st.from);
  v = 6 + (v - 6) * Math.min(1, 0.45 + mins / 50);
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
