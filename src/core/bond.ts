/* 監督と選手の関係（問93〜95）
   - オーナーの頼み：先発で／途中からでも／使わないで／このポジションで（5人まで。多いほど聞いてもらいにくい）
   - 監督の見方：戦術に合うか（戦い方ごとの大事な能力）、信頼（これまでの活躍）
   - 選手の気持ち：クラブへの愛着、監督との相性、出番への不満（問52を変更して入れた） */
import { STYLES, type Pos, type StyleName } from './constants';
import { clamp } from './rng';
import { ovr } from './player';
import type { Manager, Player } from './types';
import type { GameState } from './game';

export type OrderKind = 'start' | 'sub' | 'bench' | 'pos';
export interface Order { kind: OrderKind; pos?: Pos }
export const ORDER_LIMIT = 5;
export const ORDER_NAME: Record<OrderKind, string> = { start: '先発で使ってほしい', sub: '途中からでも使ってほしい', bench: '使わないでほしい', pos: 'このポジションで使ってほしい' };
export const ORDER_SHORT: Record<OrderKind, string> = { start: '先発で', sub: '途中から', bench: '使わないで', pos: 'ポジション指定' };

/** 頼みを聞いてくれる見こみ：監督の素直さ。3人をこえると、1人ふえるごとに少しずつ聞いてもらいにくくなる */
export const obeyChance = (obey: number, n: number) => clamp(obey * Math.pow(0.88, Math.max(0, n - 3)), 0.05, 0.95);
export const orderCount = (squad: Player[]) => squad.filter((p) => p.ord).length;
export function setOrder(G: GameState, pid: number, o: Order | null): string | null {
  const p = G.squad.find((x) => x.id === pid); if (!p) return null;
  if (o && !p.ord && orderCount(G.squad) >= ORDER_LIMIT) return `監督への頼みは${ORDER_LIMIT}人まで。ほかの選手の頼みを取り下げてから。`;
  p.ord = o ?? undefined; p.req = o?.kind === 'start';
  return null;
}

/** 監督との相性（-1 合わない / 0 ふつう / 1 合う）。選手と監督の組み合わせで決まり、監督を変えると変わる */
export function compat(p: Player, m: Manager): -1 | 0 | 1 {
  let h = (p.id * 2654435761 + m.id * 40503) >>> 0; h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 1274126177) >>> 0;
  const v = h % 10; return v < 2 ? -1 : v >= 8 ? 1 : 0;
}
export const COMPAT_MARK = { '-1': '△', '0': '○', '1': '◎' } as Record<string, string>;
export const COMPAT_WORD = { '-1': '合わない', '0': 'ふつう', '1': '合う' } as Record<string, string>;

/** 戦術に合うか（-1 / 0 / 1）：監督の戦い方が大事にする能力が、その選手の中で強いか */
export function tacticFit(p: Player, style: StyleName): -1 | 0 | 1 {
  if (p.pos === 'GK') return 0;
  const key = STYLES[style].key; const k = key.reduce((s, i) => s + p.a[i], 0) / key.length;
  const d = k - ovr(p);
  return d >= 3 ? 1 : d <= -4 ? -1 : 0;
}
export const trustOf = (p: Player) => p.trust ?? 50;
export const loveOf = (p: Player) => p.love ?? (p.origin === 'ユース出身' ? 65 : 40);
export const trustStars = (p: Player) => clamp(Math.round(trustOf(p) / 20), 1, 5);
export const loveHearts = (p: Player) => clamp(Math.round(loveOf(p) / 20), 1, 5);
export const unhappy = (p: Player) => (p.unrest ?? 0) >= 50;

/** 若手のおまけ点：年齢で少しずつ減る（22歳で急に0にならないように） */
export function youthBonus(age: number, yb: number): number {
  const f = age <= 19 ? 1 : age === 20 ? 0.9 : age === 21 ? 0.75 : age === 22 ? 0.45 : age === 23 ? 0.2 : 0;
  if (!f) return 0;
  return f * (2.2 * (yb - 1) * 3 + (yb > 1 ? 1.5 : 0));
}
/** 監督が先発を選ぶときの、能力以外の点（自分のクラブだけ） */
export const mgrView = (p: Player, m: Manager) => tacticFit(p, m.style) * 3 + (trustOf(p) - 50) * 0.08;

/** 主力のつもりの選手か（出番がないと不満がたまる） */
function thinksRegular(G: GameState, p: Player): boolean {
  if (p.age < 20 || p.inj) return false;
  const rank = [...G.squad].sort((a, b) => ovr(b) - ovr(a)).indexOf(p);
  return rank < 15;
}

/** 試合のあと：信頼と不満が動く */
export function afterMyMatch(G: GameState, played: { id: number; sub: boolean; goals: number }[]): void {
  const on = new Map(played.map((x) => [x.id, x]));
  for (const p of G.squad) {
    const c = compat(p, G.mgr); const x = on.get(p.id);
    if (x) {
      const up = (x.sub ? 1 : 2.5) + x.goals * 3;
      p.trust = clamp(trustOf(p) + up * (c > 0 ? 1.4 : c < 0 ? 0.6 : 1), 0, 100);
      p.unrest = clamp((p.unrest ?? 0) - (x.sub ? 6 : 12), 0, 100);
    } else {
      p.trust = clamp(trustOf(p) - 0.6, 0, 100);
      if (thinksRegular(G, p) && p.ord?.kind !== 'bench') p.unrest = clamp((p.unrest ?? 0) + 7 * (c < 0 ? 1.4 : 1), 0, 100);
    }
  }
}
/** 毎月：不満がたまった選手が「移籍したい」と言いに来る */
export function monthBond(G: GameState): string[] {
  const out: string[] = [];
  for (const p of G.squad) {
    if ((p.unrest ?? 0) >= 75 && !p.wantOut && !p.listed) { p.wantOut = true; out.push(`${p.name}（${p.pos}）が「試合に出たい。移籍させてほしい」と言ってきた。ホームのお知らせから答えよう。`); }
  }
  return out;
}
/** 「移籍したい」への答え。売りに出す／残ってもらう（説得）。説得できるかは愛着で決まる */
export function answerWantOut(G: GameState, pid: number, sell: boolean, roll: number): string {
  const p = G.squad.find((x) => x.id === pid); if (!p) return '';
  p.wantOut = false;
  if (sell) { p.listed = true; p.unrest = 30; return `${p.name} を売りに出した。移籍の期間に買い手を探す。`; }
  if (roll < 0.3 + loveOf(p) / 140) { p.unrest = 25; p.love = clamp(loveOf(p) - 3, 0, 100); return `${p.name} は「わかりました。ここでがんばります」と残ることにした。`; }
  p.unrest = 60; p.love = clamp(loveOf(p) - 12, 0, 100); return `${p.name} は納得していない。クラブへの愛着が下がった。`;
}
/** 新しいシーズン：愛着が育つ（長くいる・試合に出る・ユース出身・監督と合う） */
export function seasonBond(G: GameState): void {
  for (const p of G.squad) {
    const c = compat(p, G.mgr);
    p.love = clamp(loveOf(p) + 5 + Math.min(8, p.seasonApps / 4) + (p.origin === 'ユース出身' ? 3 : 0) + c * 2 - ((p.unrest ?? 0) >= 50 ? 6 : 0), 0, 100);
    p.unrest = Math.round((p.unrest ?? 0) * 0.5);
  }
}
/** 監督が変わると、信頼は相性しだいで新しくなる */
export function newManagerBond(G: GameState): void {
  for (const p of G.squad) { p.trust = 45 + compat(p, G.mgr) * 10; p.ord = undefined; p.req = false; }
}
/** 新しく入った選手 */
export function joinBond(p: Player, youth: boolean): void { p.love = youth ? 65 : 35; p.trust = 45; p.unrest = 0; p.wantOut = false; p.ord = undefined; }
/** 愛着で、契約更新の給料の上がり方が変わる（高いほど控えめで残ってくれる） */
export const loveSalaryMul = (p: Player) => (loveOf(p) >= 80 ? 0.92 : loveOf(p) >= 60 ? 0.97 : loveOf(p) < 30 ? 1.15 : 1);
/** 愛着がとても高い選手は、売ろうとしても「残りたい」と断ることがある */
export const refusesToLeave = (p: Player, season: number) => loveOf(p) >= 85 && !p.wantOut && ((p.id + season) % 10) < 6;
