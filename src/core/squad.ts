/* トップの人数と選手登録（感想42・問117）
   - トップは35人まで持てる。試合に出られるのは登録した23人だけ
   - 登録は、開幕の前と夏の中断期間の2回。「選手登録の会議」で監督・コーチ・スカウトがおすすめを言い、オーナーが決める
   - 登録の期間中は、4週以上のケガ人が出たときだけ入れかえられる。登録に空きがあれば、新しく入った選手はそのまま登録される */
import { ovr } from './player';
import { mgrView } from './bond';
import type { Pos } from './constants';
import type { Player } from './types';
import type { GameState } from './game';

export const MAX_SQUAD = 35;
export const REG_SIZE = 23;
/** 登録の会議が開く週（開幕の前・夏の中断期間の最後の週） */
export const REG_WEEKS = [7, 28];
export interface RegMeet { open: boolean; kind: '開幕前' | '中断期間'; rec: number[]; coach: number[]; scout: { pid: number; text: string }[]; sel: number[] }

export const regd = (G: GameState) => G.squad.filter((p) => p.reg);
const absW = (G: GameState) => G.season * 48 + G.week;
const score = (G: GameState, p: Player) => ovr(p) + mgrView(p, G.mgr) + p.cond - (p.inj >= 4 ? 30 : p.inj ? 4 : 0) - (p.retiring ? 1 : 0);
/** 監督のおすすめの23人：キーパー2〜3人、ポジションごとに最低の人数をそろえてから、強い順 */
export function mgrRec(G: GameState): number[] {
  const all = [...G.squad].sort((a, b) => score(G, b) - score(G, a));
  if (all.length <= REG_SIZE) return all.map((p) => p.id);
  const pick = new Set<Player>();
  const need: [Pos[], number][] = [[['GK'], 2], [['CB'], 3], [['SB'], 2], [['DM', 'CM'], 3], [['AM', 'WG'], 2], [['ST'], 2]];
  for (const [ps, n] of need) for (const p of all.filter((x) => ps.includes(x.pos)).slice(0, n)) pick.add(p);
  const gk3 = all.filter((x) => x.pos === 'GK')[2]; if (gk3) pick.add(gk3);
  for (const p of all) { if (pick.size >= REG_SIZE) break; pick.add(p); }
  return [...pick].slice(0, REG_SIZE).map((p) => p.id);
}
/** コーチ：試合で使って伸ばしたい若手 */
export function coachRec(G: GameState): number[] {
  return G.squad.filter((p) => p.age <= 21 && p.pot - ovr(p) >= 10).sort((a, b) => (b.pot - ovr(b)) - (a.pot - ovr(a))).slice(0, 4).map((p) => p.id);
}
/** スカウト：新しく入った選手の見立て */
export function scoutNotes(G: GameState): { pid: number; text: string }[] {
  const order = [...G.squad].sort((a, b) => ovr(b) - ovr(a));
  return G.squad.filter((p) => p.joined != null && absW(G) - p.joined <= 20).map((p) => {
    const i = order.indexOf(p);
    return { pid: p.id, text: i < 11 ? 'すぐに先発で使える力があります' : i < 18 ? 'ベンチに置いておくと、頼りになります' : p.age <= 21 ? 'まだ若い。まずは練習で慣れさせたい' : '今の力だと、登録の枠は少し厳しいかもしれません' };
  });
}
export function openReg(G: GameState): RegMeet {
  const rec = mgrRec(G);
  G.regm = { open: true, kind: G.week < 20 ? '開幕前' : '中断期間', rec, coach: coachRec(G), scout: scoutNotes(G), sel: [...rec] };
  return G.regm;
}
export function applyReg(G: GameState, ids: number[]): string[] {
  const set = new Set(ids.slice(0, REG_SIZE));
  for (const p of G.squad) p.reg = set.has(p.id);
  const out = G.regm?.open ? [`選手登録の会議で、${set.size}人を登録した（${G.regm.kind}）。登録から外れた${G.squad.length - set.size}人は、次の登録まで試合に出られない。`] : [];
  G.regm = null;
  return out;
}
/** 古いセーブ・最初のシーズン：まだ登録がなければ、監督のおすすめで登録しておく */
export function ensureReg(G: GameState) {
  if (G.squad.some((p) => p.reg != null)) { for (const p of G.squad) if (p.reg == null) autoReg(G, p); return; }
  const set = new Set(mgrRec(G)); for (const p of G.squad) p.reg = set.has(p.id);
}
/** 新しく入った選手：空きがあればそのまま登録 */
export function autoReg(G: GameState, p: Player) { p.joined = absW(G); p.reg = regd(G).length < REG_SIZE; }
/** 4週以上のケガ人だけ、登録を入れかえられる */
export function canSwapOut(p: Player) { return !!p.reg && p.inj >= 4; }
export function swapReg(G: GameState, outId: number, inId: number): string | null {
  const o = G.squad.find((p) => p.id === outId), n = G.squad.find((p) => p.id === inId);
  if (!o || !n) return null;
  if (!canSwapOut(o)) return '登録を入れかえられるのは、4週以上のケガをした選手だけ。';
  if (n.reg) return 'その選手は、もう登録されている。';
  o.reg = false; n.reg = true;
  return null;
}
/** 試合に出せる選手（登録した選手。もし16人より少なければ、全員から） */
export function matchSquad(G: GameState): Player[] { const r = regd(G); return r.filter((p) => !p.inj).length >= 14 ? r : G.squad; }
