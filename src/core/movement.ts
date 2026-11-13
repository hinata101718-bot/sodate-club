/* 試合の動きのもとになる、実データから学んだ数字（試合のエンジンと2Dの画面の両方で使う）
   - 選手の立ち位置：SkillCorner の公開データ（A-League 2024/25 の実際の試合の位置データ。https://github.com/SkillCorner/opendata）
     役割（GK・CB左右・SB左右・DM・CM・AM・WG左右・STなど）ごとに、ボールの位置（12×8のマス）と、
     自分のチームがボールを持っているかで、ふだんの位置から何mずれるか。役割のふだんの位置も
   - ボールの動き：StatsBomb の公開データ（イベントデータ。https://github.com/statsbomb/open-data）
     ボールのある場所（12×8のマス）ごとに、パスとドリブルの割合・パスの行き先・成功率・外に出る割合・ボールの速さ・次のプレーまでの時間
   集め方は docs/pc/movement.md と scripts/learn_positions.py・scripts/learn_ball.py
   座標は 105×68（m）。どれも「自分のチームが右（+x）へ攻める」向きで、y は下が＋（右サイド＝下） */
import P from './data/posmodel.json';
import BM from './data/ballmodel.json';

type RoleT = { dx: number[][][]; dy: number[][][]; sd: number[][][]; n: number[][][]; speed: number[]; anchor: [number, number, number] | null };
const ROLES = P.roles as unknown as Record<string, RoleT>;
const NBX = P.nbx, NBY = P.nby;
const CW = 105 / NBX, CH = 68 / NBY;
/** その役割のデータがなければ、近い役割で代わりにする */
export function roleKey(pos: string, lr: string): string {
  const k = `${pos}-${lr}`; if (ROLES[k]) return k;
  const c = `${pos}-C`; if (ROLES[c]) return c;
  for (const s of ['L', 'R']) if (ROLES[`${pos}-${s}`]) return `${pos}-${s}`;
  const near: Record<string, string> = { DM: 'CM', CM: 'DM', AM: 'CM', WG: 'AM', ST: 'AM', SB: 'CB', CB: 'SB' };
  return roleKey(near[pos] ?? 'CM', lr);
}
export const roleAnchor = (role: string): [number, number] | null => { const a = ROLES[role]?.anchor; return a ? [a[0], a[1]] : null; };
export const roleSpeed = (role: string): number => ROLES[role]?.speed?.[2] ?? 7;
/** データのないマスを近くのマスで埋めた表（はじめに1回だけ作る）。[own][i][j] → [dx, dy, sd] */
const FILLED: Record<string, Float32Array[]> = {};
export function filled(role: string): Float32Array[] | null {
  if (FILLED[role]) return FILLED[role];
  const R = ROLES[role]; if (!R) return null;
  const out: Float32Array[] = [];
  for (let o = 0; o < 2; o++) {
    const g = new Float32Array(NBX * NBY * 3);
    const ok = (i: number, j: number) => R.n[o][i][j] >= 20;
    for (let i = 0; i < NBX; i++) for (let j = 0; j < NBY; j++) {
      let bi = i, bj = j;
      if (!ok(i, j)) { let bd = 1e9; for (let a = 0; a < NBX; a++) for (let b = 0; b < NBY; b++) { if (!ok(a, b)) continue; const d = (a - i) ** 2 + (b - j) ** 2; if (d < bd) { bd = d; bi = a; bj = b; } } if (bd === 1e9) { g.set([0, 0, 3], (i * NBY + j) * 3); continue; } }
      g.set([R.dx[o][bi][bj], R.dy[o][bi][bj], R.sd[o][bi][bj]], (i * NBY + j) * 3);
    }
    out.push(g);
  }
  return (FILLED[role] = out);
}
const SH: [number, number, number] = [0, 0, 0];
/** 役割 role の選手が、ボール（bx, by）のとき、ふだんの位置から何mずれるか（となりのマスとならす）。返す配列は使い回す */
export function roleShift(role: string, bx: number, by: number, own: boolean): [number, number, number] {
  const F = filled(role); if (!F) { SH[0] = 0; SH[1] = 0; SH[2] = 3; return SH; }
  return gridShift(F[own ? 1 : 0], bx, by);
}
/** 表（filled の片方）を直接わたす版（試合のエンジン用） */
export function gridShift(g: Float32Array, bx: number, by: number): [number, number, number] {
  const fx = Math.max(0, Math.min(NBX - 1.001, bx / CW - 0.5)), fy = Math.max(0, Math.min(NBY - 1.001, by / CH - 0.5));
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const i1 = Math.min(NBX - 1, i + 1), j1 = Math.min(NBY - 1, j + 1);
  const a = (i * NBY + j) * 3, b = (i1 * NBY + j) * 3, c = (i * NBY + j1) * 3, d = (i1 * NBY + j1) * 3;
  const w0 = (1 - u) * (1 - v), w1 = u * (1 - v), w2 = (1 - u) * v, w3 = u * v;
  for (let k = 0; k < 3; k++) SH[k] = g[a + k] * w0 + g[b + k] * w1 + g[c + k] * w2 + g[d + k] * w3;
  return SH;
}

/* ---------- ボール ---------- */
type ZoneT = { n: number; pPass: number; pass: [number, number][]; carry: [number, number][]; pOk: number; pOut: number; cOk: number; speed: number; gap: number };
const ZONES = BM.zones as unknown as ZoneT[];
const BNX = BM.nx, BNY = BM.ny;
export const zoneOf = (x: number, y: number) => Math.min(BNX - 1, Math.max(0, Math.floor(x / (105 / BNX)))) * BNY + Math.min(BNY - 1, Math.max(0, Math.floor(y / (68 / BNY))));
export const zoneData = (x: number, y: number): ZoneT => ZONES[zoneOf(x, y)];
const zoneCenter = (z: number, r: () => number): [number, number] => { const i = Math.floor(z / BNY), j = z % BNY; return [(i + r()) * (105 / BNX), (j + r()) * (68 / BNY)]; };
const pickW = (arr: [number, number][], r: () => number) => { let t = r() * arr.reduce((s, x) => s + x[1], 0); for (const x of arr) { t -= x[1]; if (t <= 0) return x[0]; } return arr[arr.length - 1]?.[0] ?? 0; };
export interface BallAct { kind: 'pass' | 'carry'; tx: number; ty: number; result: 'ok' | 'lost' | 'out'; speed: number; gap: number }
/** ボールを持っている選手（チームの向きの座標 x, y）が、次にすること（実データの割合のまま） */
export function nextAct(x: number, y: number, r: () => number = Math.random): BallAct {
  const Z = ZONES[zoneOf(x, y)];
  const pass = r() < (Z?.pPass ?? 0.7);
  const list = pass ? Z?.pass : Z?.carry;
  const [tx, ty] = list?.length ? zoneCenter(pickW(list, r), r) : [x + 8, y];
  const q = r();
  const result: BallAct['result'] = pass ? (q < (Z?.pOk ?? 0.8) ? 'ok' : q < (Z?.pOk ?? 0.8) + (Z?.pOut ?? 0.05) ? 'out' : 'lost') : (q < (Z?.cOk ?? 0.95) ? 'ok' : 'lost');
  return { kind: pass ? 'pass' : 'carry', tx: Math.max(0.5, Math.min(104.5, tx)), ty: Math.max(0.5, Math.min(67.5, ty)), result, speed: pass ? Z?.speed ?? 14 : 4.6, gap: Z?.gap ?? 1.8 };
}
/** パスの行き先の候補（実データの行き先の割合で選ぶ）。r は0〜1の乱数 */
export function passTarget(x: number, y: number, r: () => number): [number, number] {
  const Z = ZONES[zoneOf(x, y)]; const list = Z?.pass;
  const [tx, ty] = list?.length ? zoneCenter(pickW(list, r), r) : [x + 10, y];
  return [Math.max(0.5, Math.min(104.5, tx)), Math.max(0.5, Math.min(67.5, ty))];
}
export function carryTarget(x: number, y: number, r: () => number): [number, number] {
  const Z = ZONES[zoneOf(x, y)]; const list = Z?.carry;
  const [tx, ty] = list?.length ? zoneCenter(pickW(list, r), r) : [x + 6, y];
  return [Math.max(0.5, Math.min(104.5, tx)), Math.max(0.5, Math.min(67.5, ty))];
}
export const SOURCES = [P.src, BM.src];
export const GRID = { nbx: NBX, nby: NBY };
