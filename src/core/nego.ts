/* 移籍の交渉（問118：問52を変更）
   - 獲るとき：① 相手のクラブと移籍金（相場より高く・安く）② 選手本人と給料と契約の年数。それぞれ3往復まで
   - 断られたら、同じ移籍の期間は、その選手にもう申し込めない
   - 売るとき：オファーに値上げを言える（強気だと相手が引く）。3往復まで */
import { Rng } from './rng';
import { sellMul, finWord, payCapCheck } from './clubfin';
import { ovr } from './player';
import { MAX_SQUAD } from './squad';
import { marketOpen, playerIndex, valueOf, fromTierOf, offerSalary, completeSign, type Where } from './market';
import type { GameState, Offer } from './game';

export interface Nego { pid: number; side: 'club' | 'player'; round: number; fee: number; ask: number | null; salary: number; years: number; sAsk: number | null; log: { me: boolean; t: string }[]; end: 'ok' | 'fail' | null }
export const FEE_STEPS = [0.8, 0.9, 1, 1.15, 1.3];
export const SAL_STEPS = [1, 1.2, 1.5, 2];
const windowKey = (G: GameState) => `${G.season}-${G.week >= 44 ? 'w' : 's'}`;
export const isBlocked = (G: GameState, pid: number) => (G.owner.mk.blocked ?? {})[pid] === windowKey(G);
const block = (G: GameState, pid: number) => { (G.owner.mk.blocked ??= {})[pid] = windowKey(G); };
/** 選手ごとの小さなゆれ（同じ選手・同じシーズンなら同じ） */
const jit = (pid: number, season: number, salt: number) => { let h = (pid * 2654435761 + season * 40503 + salt * 97) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; return (h % 1000) / 1000; };
const man = (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(1)}億円` : `${v.toLocaleString()}万円`);
const r100 = (v: number) => Math.round(v / 100) * 100;
const r10 = (v: number) => Math.round(v / 10) * 10;

/** 相手のクラブが売ってもいい最低の額（主力ほど高い。契約が切れそうなら安い） */
export function clubMin(G: GameState, w: Where): number {
  if (!w.club) return 0;
  const c = w.club; const rank = [...c.squad].sort((a, b) => ovr(b) - ovr(a)).indexOf(w.p);
  let m = rank < 3 ? 1.6 : rank < 11 ? 1.25 : rank < 16 ? 1.0 : 0.85;
  if (w.p.contract <= 1) m *= 0.75;
  m *= sellMul(c); /* 問126：苦しいクラブは安く売る、裕福なクラブは高くないと売らない */
  return r100(valueOf(w) * m * (0.94 + jit(w.p.id, G.season, 1) * 0.12));
}
/** 選手本人が来てもいい給料（段の差・フリーかどうか・年数の希望で変わる） */
export function playerNeed(G: GameState, w: Where, years: number): number {
  const my = G.clubs.find((c) => c.me)!.tier; const d = my - fromTierOf(w);
  let m = d <= -1 ? 0.9 : d === 0 ? 1.02 : d === 1 ? 1.3 : 1.7;
  const want = w.p.age <= 23 ? 3 : w.p.age >= 30 ? 3 : 2;
  if (years < want) m *= 1 + (want - years) * 0.08;
  if (w.p.age <= 23 && years >= 4) m *= 0.95;
  return r10(offerSalary(w, 0) * m * (0.94 + jit(w.p.id, G.season, 2) * 0.12));
}
export function startNego(G: GameState, pid: number): Nego | string {
  const w = playerIndex(G).get(pid);
  if (!w || w.kind === 'ama') return 'この選手とは交渉できない。';
  if (!marketOpen(G)) return 'プロとフリーの選手は、移籍の期間（7〜8月・12月）にしか申し込めない。';
  if (isBlocked(G, pid)) return 'この選手には、この移籍の期間はもう申し込めない（交渉がまとまらなかった）。';
  if (G.squad.length >= MAX_SQUAD) return `トップは${MAX_SQUAD}人まで。誰かを売りに出してから獲ろう。`;
  const v = valueOf(w);
  const n: Nego = { pid, side: w.club ? 'club' : 'player', round: 0, fee: v, ask: null, salary: offerSalary(w, 0), years: 3, sAsk: null, log: [], end: null };
  const fw = w.club ? finWord(w.club) : null;
  n.log.push({ me: false, t: w.club ? `${w.club.name}との交渉。相場は ${man(v)}。${fw === '苦しい' ? 'このクラブはお金に苦しい。安くても売ってくれるかもしれない。' : fw === '裕福' ? 'このクラブはお金に余裕がある。高めでないと売ってくれないかもしれない。' : ''}移籍金を決めて申し込もう。` : `${w.p.name}本人との交渉（フリーなので移籍金はいらない）。給料と年数を決めよう。` });
  return n;
}
/** 1往復すすめる。fee・salary・years は、こちらが出す条件 */
export function negoTurn(G: GameState, n: Nego, r: Rng): string | null {
  const w = playerIndex(G).get(n.pid); if (!w) { n.end = 'fail'; return 'この選手は、もういない。'; }
  const free = G.owner.money - G.owner.mk.bids.reduce((s, b) => s + b.fee, 0);
  if (n.side === 'club') {
    if (n.fee > free) return 'お金が足りない。';
    if (G.budget && G.budget.spent + n.fee > G.budget.cap) return `補強の予算（${man(G.budget.cap)}）をこえてしまう。`;
    n.round++;
    const min = clubMin(G, w);
    n.log.push({ me: true, t: `移籍金 ${man(n.fee)} でどうですか。` });
    if (n.fee >= min) { n.log.push({ me: false, t: `${w.club!.name}：「わかりました。${man(n.fee)}で手を打ちましょう。あとは本人と話してください」` }); n.side = 'player'; n.round = 0; n.log.push({ me: false, t: `${w.p.name}本人との交渉。給料と年数を決めよう。` }); return null; }
    if (n.round >= 3 || n.fee < min * 0.55) { n.log.push({ me: false, t: `${w.club!.name}：「その額では、話になりません。この話はなかったことに」` }); n.end = 'fail'; block(G, n.pid); return null; }
    n.ask = r100(min * (1.12 - n.round * 0.05));
    n.log.push({ me: false, t: `${w.club!.name}：「${man(n.ask)}なら考えます」（あと${3 - n.round}回）` });
    return null;
  }
  n.round++;
  const need = playerNeed(G, w, n.years);
  n.log.push({ me: true, t: `給料 年${n.salary.toLocaleString()}万円・${n.years}年契約でどうですか。` });
  const capMsg = payCapCheck(G, n.salary); if (capMsg) { n.round--; n.log.pop(); return capMsg; }
  if (n.salary >= need) {
    if (G.squad.length >= MAX_SQUAD) { n.end = 'fail'; return `トップが${MAX_SQUAD}人いて、入れられない。`; }
    if (n.fee > G.owner.money) { n.end = 'fail'; return 'お金が足りなくなっていた。'; }
    completeSign(G, w, n.fee, n.salary, n.years, r);
    n.log.push({ me: false, t: `${w.p.name}：「よろしくお願いします！」` }); n.end = 'ok'; return null;
  }
  if (n.round >= 3 || n.salary < need * 0.6) { n.log.push({ me: false, t: `${w.p.name}：「すみません、ほかの話を考えます」` }); n.end = 'fail'; block(G, n.pid); return null; }
  n.sAsk = r10(need * (1.08 - n.round * 0.03));
  n.log.push({ me: false, t: `${w.p.name}：「年${n.sAsk.toLocaleString()}万円${n.years < 3 && w.p.age <= 23 ? '、それと長めの契約' : ''}なら、前向きに考えます」（あと${3 - n.round}回）` });
  return null;
}

/* ---------- 売るとき：値上げを言う ---------- */
/** 相手が出してもいい上限（強い選手・若い選手ほど上乗せしてくれる） */
const buyerMax = (G: GameState, e: Offer, p: { id: number; age: number }, o: number) => { const c = e.clubId != null ? G.clubs.find((x) => x.id === e.clubId) : undefined; const fw = c ? finWord(c) : 'ふつう';
  return r100(e.base! * (1.05 + jit(p.id, G.season, 3) * 0.25 + (o >= 70 ? 0.08 : 0) + (p.age <= 23 ? 0.06 : 0) + (fw === '裕福' ? 0.12 : fw === '苦しい' ? -0.08 : 0))); };
export function raiseOffer(G: GameState, i: number, pct: number): string {
  const e = G.pending[i]; if (!e) return '';
  const p = G.squad.find((x) => x.id === e.pid); if (!p) return '';
  e.base ??= e.price; e.rounds = (e.rounds ?? 0) + 1;
  const want = r100(e.price * (1 + pct / 100)); const max = buyerMax(G, e, p, ovr(p));
  if (want <= max) { e.price = want; return `${e.club}：「わかりました。${man(want)}出しましょう」`; }
  if (want > max * 1.12 || e.rounds >= 3) { G.pending.splice(i, 1); return `${e.club}：「その額は出せません。この話はなかったことに」（オファーが取り下げられた）`; }
  e.price = Math.max(e.price, max); return `${e.club}：「${man(e.price)}が精いっぱいです」`;
}
