/* 2Dの選手の動き：実際の試合の位置データから学んだ「立ち位置のずれ」を使う
   出典：Metrica Sports のサンプルデータ（Sample Game 1・2。https://github.com/metrica-sports/sample-data）
   学んだもの（scripts は docs/pc/movement.md）：選手のふだんの位置（エリア）・ボールを持っているか・ボールの位置ごとに、
   その選手がふだんの位置からどれだけずれるか（平均と、ばらつき）。座標は 105×68（m）で、自分のチームが右へ攻める向き */
import M from './movemodel.json';

type Grid = number[][][][][];
const dx = M.dx as unknown as Grid, dy = M.dy as unknown as Grid, sd = M.sd as unknown as Grid, n = M.n as unknown as Grid;
const bin = (v: number, edges: number[]) => { for (let i = 0; i < edges.length - 1; i++) if (v < edges[i + 1]) return i; return edges.length - 2; };
const NA = M.ax.length - 1, NY = M.ay.length - 1, NBX = M.bx.length - 1, NBY = M.by.length - 1;

/** データのあるエリアの中で、いちばん近いものを選ぶ（データのない組み合わせを補う） */
function cell(ia: number, ja: number, own: number, ib: number, jb: number): [number, number, number] {
  let best: [number, number, number] | null = null; let bd = 1e9;
  for (let a = 0; a < NA; a++) for (let j = 0; j < NY; j++) {
    const c = n[a][j][own][ib][jb]; if (c < 25) continue;
    const d = (a - ia) ** 2 * 1.2 + (j - ja) ** 2;
    if (d < bd) { bd = d; best = [dx[a][j][own][ib][jb], dy[a][j][own][ib][jb], sd[a][j][own][ib][jb]]; }
  }
  return best ?? [0, 0, 4];
}
const cache = new Map<string, [number, number, number]>();
/** ふだんの位置（ax, ay）の選手が、ボール（bx, by）のとき、どれだけずれるか。own：自分のチームがボールを持っているか */
export function shift(ax: number, ay: number, bx: number, by: number, own: boolean): [number, number, number] {
  const ia = bin(ax, M.ax), ja = bin(ay, M.ay), ib = bin(Math.max(0, Math.min(105, bx)), M.bx), jb = bin(Math.max(0, Math.min(68, by)), M.by);
  const key = `${ia},${ja},${own ? 1 : 0},${ib},${jb}`;
  let v = cache.get(key); if (!v) { v = cell(ia, ja, own ? 1 : 0, ib, jb); cache.set(key, v); }
  /* となりのボールの位置とならして、ボールが動いたときに選手がカクッと動かないようにする */
  const fx = (Math.max(0, Math.min(104.9, bx)) - M.bx[ib]) / (M.bx[ib + 1] - M.bx[ib]) - 0.5, fy = (Math.max(0, Math.min(67.9, by)) - M.by[jb]) / (M.by[jb + 1] - M.by[jb]) - 0.5;
  const ib2 = Math.max(0, Math.min(NBX - 1, ib + (fx > 0 ? 1 : -1))), jb2 = Math.max(0, Math.min(NBY - 1, jb + (fy > 0 ? 1 : -1)));
  const k2 = `${ia},${ja},${own ? 1 : 0},${ib2},${jb2}`; let v2 = cache.get(k2); if (!v2) { v2 = cell(ia, ja, own ? 1 : 0, ib2, jb2); cache.set(k2, v2); }
  const w = (Math.abs(fx) + Math.abs(fy)) * 0.5;
  return [v[0] * (1 - w) + v2[0] * w, v[1] * (1 - w) + v2[1] * w, v[2]];
}
/** 同じチームのパスの間隔の目安（秒） */
export const PASS_GAP = M.passGap as number;
export const SOURCE = M.src as string;
