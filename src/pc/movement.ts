/* 2Dの動きのもとになる、実データから学んだ数字
   - 選手の立ち位置：SkillCorner の公開データ（A-League 2024/25 の実際の試合の位置データ。https://github.com/SkillCorner/opendata）
     役割（GK・CB左右・SB左右・DM・CM・AM・WG左右・STなど）ごとに、ボールの位置（12×8のマス）と、
     自分のチームがボールを持っているかで、ふだんの位置から何mずれるか。役割のふだんの位置も
   - ボールの動き：StatsBomb の公開データ（イベントデータ。https://github.com/statsbomb/open-data）
     ボールのある場所（12×8のマス）ごとに、パスとドリブルの割合・パスの行き先・成功率・外に出る割合・ボールの速さ・次のプレーまでの時間
   集め方は docs/pc/movement.md と scripts/learn_positions.py・scripts/learn_ball.py
   座標は 105×68（m）。どれも「自分のチームが右（+x）へ攻める」向きで、y は下が＋（右サイド＝下） */
import P from './posmodel.json';
import BM from './ballmodel.json';

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
function at(R: RoleT, own: number, i: number, j: number): [number, number, number] | null {
  if (R.n[own][i][j] < 20) return null; return [R.dx[own][i][j], R.dy[own][i][j], R.sd[own][i][j]];
}
/** データのないマスは、近くのマスで補う */
function cellNear(R: RoleT, own: number, i: number, j: number): [number, number, number] {
  const v = at(R, own, i, j); if (v) return v;
  let best: [number, number, number] | null = null; let bd = 1e9;
  for (let a = 0; a < NBX; a++) for (let b = 0; b < NBY; b++) { const w = at(R, own, a, b); if (!w) continue; const d = (a - i) ** 2 + (b - j) ** 2; if (d < bd) { bd = d; best = w; } }
  return best ?? [0, 0, 3];
}
/** 役割 role の選手が、ボール（bx, by）のとき、ふだんの位置から何mずれるか（となりのマスとならす） */
export function roleShift(role: string, bx: number, by: number, own: boolean): [number, number, number] {
  const R = ROLES[role]; if (!R) return [0, 0, 3];
  const o = own ? 1 : 0;
  const fx = Math.max(0, Math.min(NBX - 1.001, bx / CW - 0.5)), fy = Math.max(0, Math.min(NBY - 1.001, by / CH - 0.5));
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const c00 = cellNear(R, o, i, j), c10 = cellNear(R, o, Math.min(NBX - 1, i + 1), j), c01 = cellNear(R, o, i, Math.min(NBY - 1, j + 1)), c11 = cellNear(R, o, Math.min(NBX - 1, i + 1), Math.min(NBY - 1, j + 1));
  const mix = (k: number) => c00[k] * (1 - u) * (1 - v) + c10[k] * u * (1 - v) + c01[k] * (1 - u) * v + c11[k] * u * v;
  return [mix(0), mix(1), mix(2)];
}

/* ---------- ボール ---------- */
type ZoneT = { n: number; pPass: number; pass: [number, number][]; carry: [number, number][]; pOk: number; pOut: number; cOk: number; speed: number; gap: number };
const ZONES = BM.zones as unknown as ZoneT[];
const BNX = BM.nx, BNY = BM.ny;
const zoneOf = (x: number, y: number) => Math.min(BNX - 1, Math.max(0, Math.floor(x / (105 / BNX)))) * BNY + Math.min(BNY - 1, Math.max(0, Math.floor(y / (68 / BNY))));
const zoneCenter = (z: number, r: () => number): [number, number] => { const i = Math.floor(z / BNY), j = z % BNY; return [(i + r()) * (105 / BNX), (j + r()) * (68 / BNY)]; };
const pickW = (arr: [number, number][], r: () => number) => { let t = r() * arr.reduce((s, x) => s + x[1], 0); for (const x of arr) { t -= x[1]; if (t <= 0) return x[0]; } return arr[arr.length - 1]?.[0] ?? 0; };
export interface BallAct { kind: 'pass' | 'carry'; tx: number; ty: number; result: 'ok' | 'lost' | 'out'; speed: number; gap: number }
/** ボールを持っている選手（チームの向きの座標 x, y）が、次にすること */
export function nextAct(x: number, y: number, r: () => number = Math.random): BallAct {
  const Z = ZONES[zoneOf(x, y)];
  const pass = r() < (Z?.pPass ?? 0.7);
  const list = pass ? Z?.pass : Z?.carry;
  const [tx, ty] = list?.length ? zoneCenter(pickW(list, r), r) : [x + 8, y];
  const q = r();
  const result: BallAct['result'] = pass ? (q < (Z?.pOk ?? 0.8) ? 'ok' : q < (Z?.pOk ?? 0.8) + (Z?.pOut ?? 0.05) ? 'out' : 'lost') : (q < (Z?.cOk ?? 0.95) ? 'ok' : 'lost');
  return { kind: pass ? 'pass' : 'carry', tx: Math.max(0.5, Math.min(104.5, tx)), ty: Math.max(0.5, Math.min(67.5, ty)), result, speed: pass ? Z?.speed ?? 14 : 4.6, gap: Z?.gap ?? 1.8 };
}
export const SOURCES = [P.src, BM.src];
