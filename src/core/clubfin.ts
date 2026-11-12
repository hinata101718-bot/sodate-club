/* ほかのクラブのお金（問126〜129）
   - ほかのクラブも、自分と同じくらい細かくやりくりする：スポンサー・分配金・入場料・グッズ・賞金・選手を売ったお金／給料・スタッフ・運営費・選手を獲ったお金・施設・利息
   - クラブごとに性格がある（堅実・ふつう・勝負好き）
   - 借金が限度まで来ても、助けも罰もない（問127 D）。お金が足りないと主力を売る。立ち直る道は自然なものだけ（問128）
   - 給料の上限の決まりはない（問128・129の「収入の7割まで」は、あとでなくした）。ほかのクラブは、性格ごとに自分で決めた割合までしか給料に使わない */
import { Rng, clamp } from './rng';
import { ovr, salaryFor, teamStrength, makePlayer } from './player';
import { debtCap, distYear, emptyLedger, gate, goodsSales, INTEREST, leaguePrize, opsCost, sponsorYear, type Ledger, type MoneyKey } from './finance';
import { TIER_LVL, type Club } from './world';
import type { GameState } from './game';

export type Style = '堅実' | 'ふつう' | '勝負好き';
export const STYLES: Style[] = ['堅実', 'ふつう', '勝負好き'];
export const STYLE_NOTE: Record<Style, string> = { 堅実: 'お金をためて、若手を育てる', ふつう: '収入に見合った補強をする', 勝負好き: '借金をしてでも大物を取りにいく' };
export interface ClubFin { money: number; debt: number; pop: number; stadium: number; style: Style; ledger: Ledger; last: Ledger | null; sold?: number; fac?: number }
export type FinWord = '裕福' | 'ふつう' | '苦しい';

/** 給料に使ってもいいと考えるいちばん上（性格で変わる。リーグの決まりではない） */
export const PAY_LIMIT: Record<Style, number> = { 堅実: 0.5, ふつう: 0.65, 勝負好き: 0.9 };
/** 給料に回す割合の目安（性格で変わる） */
const SPEND: Record<Style, number> = { 堅実: 0.31, ふつう: 0.36, 勝負好き: 0.44 };
/** 余ったお金のうち、給料に上乗せする割合 */
const EXTRA: Record<Style, number> = { 堅実: 0.04, ふつう: 0.08, 勝負好き: 0.18 };
/** 手もとに残しておきたいお金（1年の収入の何倍か） */
const RESERVE: Record<Style, number> = { 堅実: 0.8, ふつう: 0.4, 勝負好き: 0.1 };
const STAFF_YEAR: Record<number, number> = { 3: 2500, 2: 5000, 1: 10000 };
const r100 = (v: number) => Math.round(v / 100) * 100;

/** 1年の収入の見こみ（スポンサー・分配金・ホーム11試合の入場料とグッズ）。選手を売ったお金は入れない */
export function revenueOf(tier: number, pref: string, pop: number, stadium: number): number {
  const g = gate(tier, pref, pop, stadium, tier, false);
  return r100(sponsorYear(tier, pref, pop) + distYear(tier) + 11 * (g.money + goodsSales(tier, g.fans, false)));
}
export const clubRevenue = (c: Club) => (c.fin ? revenueOf(c.tier, c.pref, c.fin.pop, c.fin.stadium) : 0);
export const clubPayroll = (c: Club) => c.squad.reduce((s, p) => s + p.salary, 0);
export const clubPayCap = (c: Club) => r100(clubRevenue(c) * PAY_LIMIT[c.fin?.style ?? 'ふつう']);

const man = (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(1)}億円` : `${v.toLocaleString()}万円`);

/* ---------- ほかのクラブ ---------- */
export function initFin(c: Club, r: Rng): ClubFin {
  const style = r.pick(STYLES);
  const pop = clamp(({ 1: 60, 2: 45, 3: 32 } as Record<number, number>)[c.tier] + r.int(-10, 10), 5, 95);
  const stadium = ({ 1: 4, 2: 3, 3: 2 } as Record<number, number>)[c.tier] + (r.next() < 0.3 ? 1 : 0) - (r.next() < 0.2 ? 1 : 0);
  const rev = revenueOf(c.tier, c.pref, pop, clamp(stadium, 1, 5));
  const money = r100(rev * (style === '堅実' ? 0.6 : style === 'ふつう' ? 0.3 : 0.1) * (0.6 + r.next() * 0.8));
  const debt = style === '勝負好き' && r.next() < 0.5 ? r100(debtCap(c.tier) * (0.1 + r.next() * 0.3)) : 0;
  return { money, debt, pop, stadium: clamp(stadium, 1, 5), style, ledger: emptyLedger(), last: null };
}
/** 古いセーブや新しいクラブに、お金の情報をつける */
export function ensureFin(G: GameState) {
  for (const c of G.clubs) if (!c.me && !c.fin) {
    const r = new Rng((G.ids.n * 31 + c.id * 7919) >>> 0); c.fin = initFin(c, r);
    for (const p of c.squad) if (!p.salary) p.salary = salaryFor(ovr(p));
  }
}
const earnC = (c: Club, k: MoneyKey, v: number) => { c.fin!.money += v; c.fin!.ledger[k] += v; };
const payC = (c: Club, k: MoneyKey, v: number) => { c.fin!.money -= v; c.fin!.ledger[k] += v; };
export function clubEarn(c: Club, k: MoneyKey, v: number) { if (c.fin) earnC(c, k, v); }
export function clubPay(c: Club, k: MoneyKey, v: number) { if (c.fin) payC(c, k, v); }

/** お金の目安（問126：クラブの画面に出す） */
export function finWord(c: Club): FinWord {
  const f = c.fin; if (!f) return 'ふつう';
  const rev = Math.max(1, clubRevenue(c)); const net = f.money - f.debt;
  if (f.money < rev * 0.03 || f.debt >= debtCap(c.tier) * 0.5 || net < -rev * 0.4) return '苦しい';
  if (net >= rev * 1.2) return '裕福';
  return 'ふつう';
}
/** 相手の懐ぐあいで、売ってもいい値段がどう変わるか（苦しいクラブは安く売る） */
export const sellMul = (c: Club | null | undefined) => (c ? ({ 裕福: 1.15, ふつう: 1, 苦しい: 0.75 } as Record<FinWord, number>)[finWord(c)] : 1);
/** 移籍金を払えるか（勝負好きは借りてでも払う） */
export function canPay(c: Club, fee: number): boolean {
  const f = c.fin; if (!f) return true;
  const room = Math.max(0, debtCap(c.tier) - f.debt);
  const keep = clubRevenue(c) * RESERVE[f.style] * 0.5;
  return f.style === '勝負好き' ? f.money + room * 0.7 >= fee : f.money - keep >= fee;
}
/** 性格で決めた給料の使い方の中で、この選手を足せるか（out の選手が出ていくなら、その分を引く） */
export const payRoomOK = (c: Club, add: number, out = 0) => clubPayroll(c) - out + add <= clubPayCap(c);

export type AiMatch = { home: boolean; won: boolean; oppTier: number; cup: boolean; gf: number; ga: number };
/** 毎週のお金の出入り（自分のクラブと同じ項目） */
export function aiWeekMoney(G: GameState, c: Club, m: AiMatch | null, r: Rng): string[] {
  const f = c.fin; if (!f) return [];
  const out: string[] = [];
  payC(c, 'salary', Math.round(clubPayroll(c) / 48));
  payC(c, 'staff', Math.round(((c.mgr.salary ?? 0) + STAFF_YEAR[c.tier]) / 48));
  earnC(c, 'sponsor', Math.round(sponsorYear(c.tier, c.pref, f.pop) / 48));
  earnC(c, 'dist', Math.round(distYear(c.tier) / 48));
  if (m) {
    f.pop = clamp(f.pop + (m.gf > m.ga ? 0.7 : m.gf === m.ga ? 0.15 : -0.35), 0, 100);
    payC(c, 'ops', opsCost(c.tier, m.home));
    if (m.home) { const g = gate(c.tier, c.pref, f.pop, f.stadium, m.oppTier, m.cup); earnC(c, 'gate', g.money); earnC(c, 'goods', goodsSales(c.tier, g.fans, m.won)); }
  }
  if (G.week % 4 === 3 && f.debt > 0) payC(c, 'interest', Math.round((f.debt * INTEREST) / 12));
  /* 余ったお金で借金を返す（勝負好きは、お金が1年の収入をこえたときだけ） */
  const keepM = clubRevenue(c) * (f.style === '勝負好き' ? 1 : RESERVE[f.style]);
  if (f.debt > 0 && G.week % 4 === 0 && f.money > keepM) { const a = Math.min(f.debt, r100((f.money - keepM) * 0.5)); f.debt -= a; f.money -= a; }
  if (f.money < 0) {
    const cap = debtCap(c.tier); const got = Math.max(0, Math.min(Math.ceil(-f.money / 1000) * 1000, cap - f.debt));
    f.debt += got; f.money += got;
    /* 借金も限度：助けはない（問127 D）。月の終わりに、いちばん値段のつく選手を売る */
    if (f.money < 0 && G.week % 4 === 3 && (f.sold ?? -99) < G.season * 48 + G.week - 8) { const n = distressSale(G, c, r); if (n) out.push(n); }
  }
  return out;
}
/** 経営難で主力を放出する（買うのは、払えるいちばん上の段のクラブ。いなければ海外のクラブ） */
export function distressSale(G: GameState, c: Club, r: Rng): string | null {
  const top = [...c.squad].sort((a, b) => ovr(b) - ovr(a)).slice(0, 5).filter((p) => !(p.pos === 'GK' && c.squad.filter((x) => x.pos === 'GK').length <= 2));
  const p = top[0]; if (!p) return null;
  const fee = r100(Math.max(300, salaryFor(ovr(p)) * 1.5 * 0.75));
  const buyer = G.clubs.filter((b) => !b.me && b !== c && b.fin && b.tier <= c.tier && canPay(b, fee) && payRoomOK(b, p.salary)).sort((a, b) => a.tier - b.tier || (b.fin!.money - a.fin!.money))[0];
  const i = c.squad.indexOf(p);
  const np = makePlayer(r, G.ids, Math.max(40, ovr(p) - 14), p.pos, { age: r.int(18, 22), prefPool: [c.pref] }); np.num = p.num; np.salary = salaryFor(ovr(np)); c.squad[i] = np;
  earnC(c, 'sales', fee); c.fin!.sold = G.season * 48 + G.week;
  if (buyer) {
    const weak = buyer.squad.filter((x) => x.pos === p.pos).sort((a, b) => ovr(a) - ovr(b))[0] ?? [...buyer.squad].sort((a, b) => ovr(a) - ovr(b))[0];
    payC(buyer, 'buy', fee); p.num = weak.num; p.contract = 3; buyer.squad[buyer.squad.indexOf(weak)] = p;
    G.owner?.mk && (G.owner.mk.bids = G.owner.mk.bids.filter((b) => b.pid !== p.id));
    return `経営難のニュース：お金が回らなくなった${c.name}（${c.tier}部）が、主力の${p.name}（${p.pos}・${p.age}歳）を${buyer.name}へ放出した（移籍金 ${man(fee)}）。`;
  }
  G.owner?.mk && (G.owner.mk.bids = G.owner.mk.bids.filter((b) => b.pid !== p.id));
  return `経営難のニュース：お金が回らなくなった${c.name}（${c.tier}部）が、主力の${p.name}（${p.pos}・${p.age}歳）を海外のクラブへ売った（移籍金 ${man(fee)}）。`;
}
/** 1年の終わり（昇格・降格のあと）：賞金をもらい、来年の給料の目安を決め、それに合わせて強さが動く。
    rank は終わった年の順位、oldTier はその段 */
export function aiSeasonFin(G: GameState, c: Club, r: Rng, rank: number, oldTier: number, shift: (c: Club, target: number) => void): string[] {
  const f = c.fin; if (!f) return [];
  const out: string[] = [];
  earnC(c, 'prize', leaguePrize(oldTier, rank));
  f.last = f.ledger; f.ledger = emptyLedger();
  const rev = clubRevenue(c);
  /* 施設づくり：余ったお金の半分ほどを、練習場やスタジアムに使う。スタジアムが大きくなると入場料が増える */
  const spare = f.money - rev * RESERVE[f.style];
  if (spare > 0 && f.debt < debtCap(c.tier) * 0.3) {
    const b = r100(spare * (f.style === '堅実' ? 0.4 : f.style === 'ふつう' ? 0.5 : 0.6)); payC(c, 'build', b);
    f.fac = (f.fac ?? 0) + b; const need = 27000 * (f.stadium + 1) * (f.stadium + 2) / 6;
    if (f.stadium < 5 && f.fac >= need) { f.fac -= need; f.stadium++; }
  }
  /* 勝負好き：借金をして、施設と補強のお金にする（借金が重くなると「苦しい」になる） */
  if (f.style === '勝負好き' && f.debt < debtCap(c.tier) * 0.8) {
    const loan = r100((debtCap(c.tier) * 0.8 - f.debt) * 0.3); f.debt += loan; f.money += loan;
    const b = r100(loan * 0.6); payC(c, 'build', b); f.fac = (f.fac ?? 0) + b; const need = 27000 * (f.stadium + 1) * (f.stadium + 2) / 6;
    if (f.stadium < 5 && f.fac >= need) { f.fac -= need; f.stadium++; }
  }
  /* 来年の給料の目安：収入×性格の割合。余ったお金が多ければ上乗せ、借金が重ければ削る。上限は性格ごと（勝負好きは収入の9割まで使う） */
  const extra = f.money - rev * RESERVE[f.style];
  let target = rev * SPEND[f.style] + (extra > 0 ? extra * EXTRA[f.style] : extra * 0.2);
  if (f.debt >= debtCap(c.tier) * 0.8) target -= rev * 0.08;
  target = clamp(target, rev * 0.2, rev * PAY_LIMIT[f.style]);
  const now = Math.max(1, clubPayroll(c));
  /* 給料が目安の何倍か → 強さをどれだけ動かすか（給料は強さにつれて急に上がるので、対数で見る） */
  const s = teamStrength(c.squad); const d = s - 55; const g = 0.05 + 0.006 * Math.abs(d) * (d > 0 ? 1 : 0.4);
  const move = clamp(Math.log(target / now) / Math.max(0.08, g), -6, 6);
  /* 選手の市場は段ごとにだいたい決まっているので、段の目安にも少し寄る（何十年たっても段の強さがずれないように） */
  shift(c, (s + move) * 0.75 + (TIER_LVL[c.tier] - 1.5 + (r.next() - 0.5) * 4) * 0.25);
  for (const p of c.squad) p.salary = salaryFor(ovr(p));
  /* 大きな動きはニュースに */
  if (move >= 4 && f.style === '勝負好き') out.push(`補強のニュース：${c.name}（${c.tier}部）が、お金をかけて大型補強に動いた。`);
  if (move <= -4) out.push(`経営のニュース：${c.name}（${c.tier}部）が、収入に合わせて給料の高い選手を手放した。`);
  return out;
}
/** ゲームの始まりで、給料が性格の上限をこえているクラブは、少し弱めて給料を合わせる */
export function fitPayCap(c: Club) {
  if (!c.fin) return;
  for (let i = 0; i < 20 && clubPayroll(c) > clubPayCap(c) * 0.95; i++) for (const p of c.squad) { p.a = p.a.map((v) => Math.max(10, v - 1)); p.salary = salaryFor(ovr(p)); }
}
