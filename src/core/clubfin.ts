/* ほかのクラブのお金（問126〜129）
   - ほかのクラブも、自分と同じくらい細かくやりくりする：スポンサー・分配金・入場料・グッズ・賞金・選手を売ったお金／給料・スタッフ・運営費・選手を獲ったお金・施設・利息
   - クラブごとに性格がある（堅実・ふつう・勝負好き）
   - 借金が限度まで来ても、助けも罰もない（問127 D）。お金が足りないと主力を売る。立ち直る道は自然なものだけ（問128）
   - 給料の上限の決まりはない（問128・129の「収入の7割まで」は、あとでなくした）。ほかのクラブは、性格ごとに自分で決めた割合までしか給料に使わない */
import { Rng, clamp } from './rng';
import { ovr, salaryFor, teamStrength, makePlayer } from './player';
import { debtCap, distYear, emptyLedger, gate, goodsSales, INTEREST, leaguePrize, opsCost, sponsorYear, type Ledger, type MoneyKey } from './finance';
import { TIER_LVL, type Club } from './world';
import { DEFAULT_CTX, type GrowCtx } from './growth';
import type { Player } from './types';
import type { GameState } from './game';

export type Style = '堅実' | 'ふつう' | '勝負好き';
export const STYLES: Style[] = ['堅実', 'ふつう', '勝負好き'];
export const STYLE_NOTE: Record<Style, string> = { 堅実: 'お金をためて、若手を育てる', ふつう: '収入に見合った補強をする', 勝負好き: '借金をしてでも大物を取りにいく' };
export interface ClubFin { money: number; debt: number; pop: number; stadium: number; style: Style; ledger: Ledger; last: Ledger | null; sold?: number; fac?: number }
export type FinWord = '裕福' | 'ふつう' | '苦しい';

/** 給料に使ってもいいと考えるいちばん上（性格で変わる。リーグの決まりではない） */
export const PAY_LIMIT: Record<Style, number> = { 堅実: 0.5, ふつう: 0.65, 勝負好き: 0.9 };
/** 給料に回す割合の目安（性格で変わる） */
const SPEND: Record<Style, number> = { 堅実: 0.31, ふつう: 0.39, 勝負好き: 0.44 };
/** 余ったお金のうち、給料に上乗せする割合 */
const EXTRA: Record<Style, number> = { 堅実: 0.04, ふつう: 0.08, 勝負好き: 0.18 };
/** 手もとに残しておきたいお金（1年の収入の何倍か） */
const RESERVE: Record<Style, number> = { 堅実: 0.8, ふつう: 0.4, 勝負好き: 0.1 };
/** 段の強さの目安への寄せ先（選手が育つぶん、下の段ほど低めに置く） */
const ANCHOR: Record<number, number> = { 1: -0.8, 2: -1.8, 3: -3.5 };
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
  const np = makePlayer(r, G.ids, Math.max(40, ovr(p) - 14), p.pos, { age: r.int(20, 26), prefPool: [c.pref] }); np.num = p.num; np.salary = salaryFor(ovr(np)); c.squad[i] = np;
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
  let move = clamp(Math.log(target / now) / Math.max(0.08, g), -6, 6);
  /* 問132：勝負好きは、苦しくなると一気に崩れる（主力をまとめて手放す） */
  if (f.style === '勝負好き' && finWord(c) === '苦しい') move = Math.min(move, -5);
  /* 問131：お金は「いい選手を獲る・給料の高い選手を手放す」で効く（チームごとまとめて上げ下げはしない） */
  aiRoster(G, c, r, move, s);
  /* 段の強さがずれないための小さな調整（選手の市場は段ごとにだいたい決まっている） */
  shift(c, teamStrength(c.squad) + clamp((TIER_LVL[c.tier] + ANCHOR[c.tier] - teamStrength(c.squad)) * 0.35, -2.5, 2.5));
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

/* ---------- 交渉のときの経理のアドバイス（感想） ---------- */
/** 自分のクラブの1年の収入の見こみ（去年の実際の収入のほうが多く、段が同じなら、そちらを使う） */
export function myRevenue(G: GameState): number {
  const me = G.clubs.find((c) => c.me)!; const o = G.owner;
  const est = revenueOf(me.tier, G.club.pref, o.pop, o.fac.stadium);
  const L = o.lastLedger; const last = L ? L.gate + L.sponsor + L.goods + L.dist + L.prize : 0;
  const h = G.history.at(-1); const same = !h || (!h.promoted && !h.relegated);
  return r100(same ? Math.max(est, last) : est);
}
/** 経理のひとこと：今のお金・給料の重さ・1年の見こみ・予算・借金・相手の懐ぐあいから。fee は移籍金、salary は年の給料、staff はスタッフの給料（1年） */
export function acctAdvice(G: GameState, seller: Club | null, fee: number, salary: number, staff: number): string[] {
  const o = G.owner; const me = G.clubs.find((c) => c.me)!;
  const rev = Math.max(1, myRevenue(G)); const pay = G.squad.reduce((s, p) => s + p.salary, 0);
  const ops = 11 * (opsCost(me.tier, true) + opsCost(me.tier, false));
  const monthOut = (pay + staff + ops) / 12;
  const out: string[] = [];
  const left = o.money - o.mk.bids.reduce((s, b) => s + b.fee, 0) - fee;
  if (fee > 0) {
    if (left < 0) out.push(`移籍金 ${man(fee)} は、いまのお金では払えません（あと${man(-left)}足りません）。`);
    else if (left < monthOut * 2) out.push(`移籍金 ${man(fee)} を払うと、手もとのお金は ${man(left)} です。給料などの2か月分を切るので、心細くなります。`);
    else out.push(`移籍金 ${man(fee)} を払っても、手もとに ${man(left)} 残ります。`);
  }
  if (G.budget && fee > 0) { const rest = G.budget.cap - G.budget.spent; out.push(rest - fee >= 0 ? `補強の予算は、この移籍金を払うと残り ${man(rest - fee)} です。` : `補強の予算（残り ${man(Math.max(0, rest))}）をこえてしまいます。`); }
  const share = Math.round(((pay + salary) / rev) * 100);
  const net = rev - (pay + salary) - staff - ops;
  out.push(`給料 年${salary.toLocaleString()}万円を足すと、選手の給料の合計は収入の約${share}%です。${share >= 80 ? 'かなり重く、赤字になりやすい形です。' : share >= 65 ? '少し重めです。' : share < 45 ? 'まだ余裕があります。' : 'ちょうどいいくらいです。'}`);
  out.push(net >= 0 ? `このまま1年いくと、選手を売らなくても、およそ ${man(net)} の黒字の見こみです。` : `このまま1年いくと、およそ ${man(-net)} の赤字の見こみです。${o.debt >= debtCap(me.tier) * 0.7 ? '借金も上限に近いので、おすすめしません。' : '選手を売るか、借金でうめることになります。'}`);
  if (o.debt > 0 && o.debt < debtCap(me.tier) * 0.7) out.push(`借金が ${man(o.debt)} 残っていることも、頭に入れておいてください。`);
  if (seller) { const w = finWord(seller); if (w === '苦しい') out.push(`${seller.name}はお金に苦しいようです。安めの額でも、話に乗ってくるかもしれません。`); else if (w === '裕福') out.push(`${seller.name}はお金に余裕があります。安い額では売ってくれないでしょう。`); }
  return out;
}

/** 問131：お金に合わせた選手の入れかえ。move＞0なら強い選手を獲り、move＜0なら給料の高い選手を手放す */
function aiRoster(G: GameState, c: Club, r: Rng, move: number, s: number) {
  const n = Math.min(5, Math.round(Math.abs(move) / 1.5)); if (!n) return;
  const free = G.owner?.mk.free;
  const toFree = (p: Player) => { if (free && p.age <= 32 && free.length < 24) { p.contract = 0; p.num = 0; p.listed = false; free.push(p); } };
  const prospect = (p: Player) => p.age <= 21 && p.pot - ovr(p) >= 8;
  for (let k = 0; k < n; k++) {
    if (move > 0) {
      const out = [...c.squad].filter((p) => !prospect(p)).sort((a, b) => ovr(a) - ovr(b))[0]; if (!out) return;
      const np = makePlayer(r, G.ids, s + move + r.int(1, 4), out.pos, { age: r.int(23, 29), prefPool: [c.pref, '東京都', '大阪府'] });
      np.num = out.num; np.contract = r.int(2, 4); np.salary = salaryFor(ovr(np)); c.squad[c.squad.indexOf(out)] = np; toFree(out);
    } else {
      const gk = c.squad.filter((x) => x.pos === 'GK').length;
      /* 堅実なクラブは、育てた選手（ユース出身の25歳まで）を手放さない */
      const keepYouth = c.fin?.style === '堅実';
      const out = [...c.squad].filter((p) => p.age >= 24 && !(p.pos === 'GK' && gk <= 2) && !(keepYouth && p.origin === 'ユース出身' && p.age <= 25)).sort((a, b) => b.salary - a.salary)[0]; if (!out) return;
      const np = makePlayer(r, G.ids, s - r.int(4, 7), out.pos, { age: r.int(22, 28), prefPool: [c.pref, c.pref, r.pick(['東京都', '大阪府', '愛知県'])] });
      np.num = out.num; np.contract = r.int(2, 3); np.salary = salaryFor(ovr(np)); c.squad[c.squad.indexOf(out)] = np; toFree(out);
    }
  }
}
/** 問131：ほかのクラブにも、ユースから毎年1〜2人、伸びしろのある子が上がる（堅実なクラブ・施設にお金をかけたクラブほど多く、いい子） */
export function aiYouth(G: GameState, c: Club, r: Rng): Player[] {
  const f = c.fin; const st = f?.style ?? 'ふつう';
  const good = (f?.stadium ?? 2) + (st === '堅実' ? 1 : 0);
  const n = (r.next() < 0.6 + (st === '堅実' ? 0.25 : 0) ? 1 : 0) + (r.next() < good * 0.05 + (st === '堅実' ? 0.1 : 0) ? 1 : 0);
  /* 伸びなかったユース出身（21歳をこえても、チームの力より8以上低い子）は去り、即戦力が入る */
  const s0 = teamStrength(c.squad);
  for (const p of c.squad.filter((x) => x.origin === 'ユース出身' && x.age >= 21 && ovr(x) < s0 - 8)) { const np = makePlayer(r, G.ids, s0 - r.int(2, 5), p.pos, { age: r.int(24, 29), prefPool: [c.pref, '東京都', '大阪府'] }); np.num = p.num; np.salary = salaryFor(ovr(np)); c.squad[c.squad.indexOf(p)] = np; }
  const up: Player[] = [];
  for (let i = 0; i < n; i++) {
    /* 入れかわるのは、年をとった控え（いなければ、いちばん弱い選手） */
    const gk = c.squad.filter((x) => x.pos === 'GK').length;
    const out = [...c.squad].filter((p) => !(p.pos === 'GK' && gk <= 2)).sort((a, b) => (b.age >= 29 ? 1 : 0) - (a.age >= 29 ? 1 : 0) || ovr(a) - ovr(b))[0]; if (!out) break;
    const k = makePlayer(r, G.ids, 40 + c.tier * -2 + 8 + r.int(0, 6) + (st === '堅実' ? 2 : 0), out.pos, { age: r.int(17, 18), nSp: 0, exp: 0, prefPool: [c.pref], origin: 'ユース出身' });
    k.pot = clamp(ovr(k) + r.int(14, 30) + good * 2 + (st === '堅実' ? 3 : 0) + (r.next() < (st === '堅実' ? 0.1 : 0.06) ? r.int(6, 12) : 0), 40, 90); k.gStart = k.age; k.gLen = r.int(4, 7); k.contract = 3; k.salary = salaryFor(ovr(k));
    k.num = out.num; c.squad[c.squad.indexOf(out)] = k; up.push(k);
  }
  return up;
}
/** 問131：ほかのクラブの選手も、自分の選手と同じしくみで育つ。練習の伸びは段と施設で変わる */
export function aiGrowCtx(c: Club, camp: boolean): GrowCtx {
  const t = ({ 1: 1.1, 2: 0.9, 3: 0.68 } as Record<number, number>)[c.tier] ?? 1;
  const fac = 1 + ((c.fin?.stadium ?? 2) - 2) * 0.04;
  /* 問132：堅実なクラブは育成が強み（練習の伸びが大きい）。勝負好きは補強にお金を回すので、育成は弱め */
  const sm = ({ 堅実: 1.1, ふつう: 1.07, 勝負好き: 0.94 } as Record<Style, number>)[c.fin?.style ?? 'ふつう'];
  return { ...DEFAULT_CTX, mgrGrow: c.mgr.grow ?? 1, style: c.mgr.style, camp, coach: Array(8).fill(t * sm), field: t * fac * sm };
}
