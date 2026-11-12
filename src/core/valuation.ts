/* 経理の目で見た、選手の値打ちと値段（感想64）
   - 買うとき：移籍金が相場より安いか高いか、契約の年数ぶんの給料と合わせた総額、契約が終わるころに売るといくらになりそうか
   - 売るとき：オファーが相場より高いか安いか、浮く給料、1年後・2年後にはいくらになりそうか（年齢で上がる・下がる） */
import { ovr, salaryFor } from './player';
const salaryForOvr = salaryFor;
import { marketValue } from './market';
import type { Player } from './types';
import type { GameState } from './game';

const man = (v: number) => (Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}億円` : `${Math.round(v).toLocaleString()}万円`);
const r100 = (v: number) => Math.round(v / 100) * 100;
/** y年後の総合力の見こみ（経理は伸びしろを知らないので、年齢だけで見る） */
function ovrIn(p: Player, y: number): number {
  let o = ovr(p);
  for (let i = 0; i < y; i++) { const a = p.age + i; o += a <= 21 ? 3 : a <= 24 ? 1.5 : a <= 28 ? 0 : a <= 30 ? -1 : -2.5; }
  return o;
}
/** y年後に売るとしたら、いくらくらいか（契約の残り left 年として） */
export function valueIn(p: Player, y: number, tier: number, left: number): number {
  const d = ovrIn(p, y) - ovr(p);
  const q = { ...p, a: p.a.map((v) => v + d), age: p.age + y, contract: Math.max(1, left) } as Player;
  return r100(marketValue(q, tier));
}
const myTier = (G: GameState) => G.clubs.find((c) => c.me)!.tier;
/** 同じポジションの、いまの先発の中でいちばん低い総合力（先発の枠：GK・DM・AMは1つ、ほかは2つ） */
function starterLine(G: GameState, p: Player): number | null {
  const same = G.squad.filter((x) => x.pos === p.pos && x.id !== p.id).map(ovr).sort((a, b) => b - a);
  const slots = p.pos === 'GK' || p.pos === 'DM' || p.pos === 'AM' ? 1 : 2;
  return same.length >= slots ? same[slots - 1] : null;
}

/** 買うとき。fee＝移籍金、salary＝年の給料、years＝契約の年数、fair＝相場 */
export function buyValue(G: GameState, p: Player, fee: number, salary: number, years: number, fair: number): string[] {
  const out: string[] = [];
  if (fair > 0 && fee > 0) {
    const r = fee / fair;
    out.push(`移籍金は相場（${man(fair)}）の${Math.round(r * 100)}%。${r <= 0.9 ? '割安です。' : r <= 1.1 ? '相場どおりです。' : r <= 1.3 ? '少し割高です。' : 'かなり割高です。'}`);
  }
  const total = fee + salary * years;
  const resale = valueIn(p, years - 1, myTier(G), 1);
  out.push(`${years}年契約の給料と合わせると、総額 ${man(total)}。契約の最後の年に売るなら、およそ ${man(resale)} の見こみなので、実際にかかるのは約${man(Math.max(0, total - resale))}です。`);
  const now = ovr(p); const later = Math.round(ovrIn(p, years - 1));
  out.push(later >= now + 3 ? `${p.age}歳なので、これから値打ちが上がっていきそうです。` : later <= now - 3 ? `${p.age}歳なので、これから値打ちは下がっていきます。長い契約は、あとで重くなります。` : `${p.age}歳なので、値打ちはしばらく大きく変わらないでしょう。`);
  const line = starterLine(G, p);
  if (line != null) { const d = now - line; out.push(d >= 3 ? `うちの${p.pos}の先発より総合力が${d}高いので、お金に見合う戦力になります。` : d >= 0 ? `うちの${p.pos}の先発と、ほぼ同じくらいの力です。` : `うちの${p.pos}では控えになりそうです。この額は、控えには高い買い物です。`); }
  else out.push(`うちには${p.pos}が足りていないので、いてくれると助かります。`);
  return out;
}

/** 売るとき（オファー）。price＝相手が出している額 */
export function sellValue(G: GameState, p: Player, price: number): string[] {
  const out: string[] = []; const tier = myTier(G);
  const fair = marketValue(p, tier);
  const r = price / Math.max(1, fair);
  out.push(`オファーは相場（${man(fair)}）の${Math.round(r * 100)}%。${r >= 1.2 ? 'かなりいい値段です。' : r >= 1.05 ? 'いい値段です。' : r >= 0.9 ? '相場どおりです。' : '安すぎます。値上げを言ってもいいと思います。'}`);
  const left = Math.max(1, p.contract);
  out.push(`売ると、給料 年${p.salary.toLocaleString()}万円が浮きます（契約の残り${left}年で ${man(p.salary * left)}）。`);
  const v1 = valueIn(p, 1, tier, left - 1);
  out.push(p.contract <= 1 ? `契約が今年で切れるので、更新しなければ来年はただで出ていきます。売るなら今です。` : v1 >= fair * 1.1 ? `${p.age}歳なので、1年待てば約${man(v1)}まで上がりそうです。急いで売る必要はありません。` : v1 <= fair * 0.85 ? `${p.age}歳なので、1年たつと約${man(v1)}に下がりそうです。売りどきです。` : `1年待っても、値段はあまり変わらないでしょう（約${man(v1)}）。`);
  const line = starterLine(G, p);
  if (line != null && ovr(p) > line) out.push(`ただ、${p.pos}の先発です。売るなら、かわりの選手を考えておいてください。`);
  else if (line == null) out.push(`売ると、${p.pos}が足りなくなります。かわりの選手が必要です。`);
  return out;
}

/** 契約更新のとき（感想65）。newSalary＝更新後の給料、years＝選んでいる年数 */
export function renewValue(G: GameState, p: Player, newSalary: number, years: number): string[] {
  const out: string[] = []; const tier = myTier(G);
  const up = newSalary - p.salary;
  const fairSal = Math.round(salaryForOvr(ovr(p)));
  out.push(up > 0 ? `更新すると、給料は年${up.toLocaleString()}万円上がって、年${newSalary.toLocaleString()}万円です。` : `更新しても、給料は年${newSalary.toLocaleString()}万円のままです。`);
  const r = newSalary / Math.max(1, fairSal);
  out.push(`いまの力（総合力${ovr(p)}）の相場の給料は年${fairSal.toLocaleString()}万円。${r >= 1.25 ? 'それよりかなり高い給料です。' : r >= 1.08 ? 'それより少し高めです。' : r <= 0.9 ? 'それより安く、お得な契約です。' : 'ほぼ相場どおりです。'}`);
  const later = ovrIn(p, years); const now = ovr(p);
  out.push(`${years}年で給料は合わせて ${man(newSalary * years)}。${later <= now - 4 ? `${p.age}歳なので、契約の終わりごろには力が落ちて、給料が重くなりそうです。短めの契約がおすすめです。` : later >= now + 3 ? `${p.age}歳なので、まだ伸びそうです。長めの契約にすると、あとでお得になります。` : `この${years}年は、力は大きく変わらないでしょう。`}`);
  const v = valueIn(p, years - 1, tier, 1);
  out.push(`契約の最後の年に売るなら、およそ ${man(v)}。いま売るなら、およそ ${man(marketValue(p, tier))}です。`);
  const line = starterLine(G, p);
  if (line != null && now < line - 2) out.push(`いまは控えの選手です。${r >= 1.08 ? 'この給料なら、更新しないのも手です。' : '控えとしては、無理のない給料です。'}`);
  else if (line == null || now >= line) out.push(`${p.pos}の先発なので、いなくなると戦力が落ちます。`);
  return out;
}
