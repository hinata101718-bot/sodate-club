/* ゆめのおうち：間取りから壁・広さ・気づきを計算する（画面には触らない） */
import { CELL, ROOMS, OPEN, FIX, EXT, fixSize } from './data.js';

export const M2 = CELL * CELL;          // 1マスの面積（㎡）
export const JO = 1.62;                 // 1帖（㎡）
export const TSUBO = 3.30579;           // 1坪（㎡）

export const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
export const cm = (cells) => Math.round(cells * CELL * 100);
export const mtxt = (cells) => (Math.round(cells * CELL * 100) / 100).toFixed(2) + 'm';

export function dims(plan) {
  return {
    W: Math.max(2, Math.floor(plan.site.w / CELL + 1e-6)),
    H: Math.max(2, Math.floor(plan.site.d / CELL + 1e-6)),
  };
}

export const isIndoor = (t) => !ROOMS[t]?.out;
export const roomLabel = (r) => r.name || ROOMS[r.t]?.label || '';
export function joined(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const za = ROOMS[a.t]?.zone, zb = ROOMS[b.t]?.zone;
  return !!za && za === zb;
}

export const floorsOf = (plan) => (plan.floors === 2 ? [1, 2] : [1]);

/* 階ごとのマス目の持ち主（部屋の番号、なければ -1）。あとに描いた部屋が上になる */
export function owners(plan, f) {
  const { W, H } = dims(plan);
  const g = new Int32Array(W * H).fill(-1);
  plan.rooms.forEach((r, i) => {
    if (r.f !== f) return;
    for (let y = Math.max(0, r.y); y < Math.min(H, r.y + r.h); y++)
      for (let x = Math.max(0, r.x); x < Math.min(W, r.x + r.w); x++) g[y * W + x] = i;
  });
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : g[y * W + x]);
  return { W, H, g, at };
}

/* 壁。h＝横の線（x,y)-(x+1,y)、v＝縦の線 (x,y)-(x,y+1)。k: int＝部屋の間、ext＝外壁、para＝バルコニーの手すり壁 */
export function walls(plan, f, own = owners(plan, f)) {
  const rooms = plan.rooms;
  const map = new Map();
  const kind = (ia, ib) => {
    const a = ia >= 0 ? rooms[ia] : null, b = ib >= 0 ? rooms[ib] : null;
    if (!a && !b) return null;
    if (joined(a, b)) return null;
    const ai = a && isIndoor(a.t), bi = b && isIndoor(b.t);
    if (ai && bi) return 'int';
    if (ai || bi) return 'ext';
    if (!a || !b) return 'para';
    return null;
  };
  const { W, H, at } = own;
  for (let y = 0; y <= H; y++) for (let x = 0; x < W; x++) {
    const k = kind(at(x, y - 1), at(x, y));
    if (k) map.set(`h${x},${y}`, { o: 'h', x, y, k, a: at(x, y - 1), b: at(x, y) });
  }
  for (let x = 0; x <= W; x++) for (let y = 0; y < H; y++) {
    const k = kind(at(x - 1, y), at(x, y));
    if (k) map.set(`v${x},${y}`, { o: 'v', x, y, k, a: at(x - 1, y), b: at(x, y) });
  }
  return map;
}

/* ドア・窓が乗っているマスの辺 → そのドア・窓 */
export function openingUnits(plan, f) {
  const m = new Map();
  for (const op of plan.openings) {
    if (op.f !== f) continue;
    for (let i = 0; i < op.len; i++) m.set(op.o === 'h' ? `h${op.x + i},${op.y}` : `v${op.x},${op.y + i}`, op);
  }
  return m;
}

/* つながった部屋のまとまり（LDK＋キッチンなど）。広さと名前を出すところ */
export function groups(plan, f, own = owners(plan, f)) {
  const { W, H, g } = own;
  const seen = new Int8Array(W * H);
  const out = [];
  for (let i = 0; i < W * H; i++) {
    if (g[i] < 0 || seen[i]) continue;
    const cells = [], count = new Map();
    const st = [i]; seen[i] = 1;
    while (st.length) {
      const c = st.pop(); cells.push(c);
      count.set(g[c], (count.get(g[c]) || 0) + 1);
      const x = c % W, y = (c / W) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (seen[n] || g[n] < 0) continue;
        if (!joined(plan.rooms[g[c]], plan.rooms[g[n]])) continue;
        seen[n] = 1; st.push(n);
      }
    }
    let main = -1, best = -1;
    for (const [ri, n] of count) if (n > best) { best = n; main = ri; }
    out.push({ main, rooms: [...count.keys()], cells, area: cells.length * M2 });
  }
  return out;
}

export function areas(plan) {
  const { W, H } = dims(plan);
  const res = { floors: {}, total: 0, building: 0, site: plan.site.w * plan.site.d };
  const proj = new Uint8Array(W * H);
  for (const f of floorsOf(plan)) {
    const own = owners(plan, f);
    let n = 0;
    for (let i = 0; i < W * H; i++) {
      const ri = own.g[i];
      if (ri >= 0 && isIndoor(plan.rooms[ri].t)) { n++; proj[i] = 1; }
    }
    res.floors[f] = { area: n * M2, groups: groups(plan, f, own) };
    res.total += n * M2;
  }
  res.building = proj.reduce((a, b) => a + b, 0) * M2;
  res.bcr = res.site ? (res.building / res.site) * 100 : 0;
  res.far = res.site ? (res.total / res.site) * 100 : 0;
  return res;
}

const isWin = (k) => OPEN[k]?.g === 'win';

export function warnings(plan, ar = areas(plan)) {
  const out = [];
  const { W, H } = dims(plan);
  const fl = floorsOf(plan);
  const outside = (x, y, w, h) => x < 0 || y < 0 || x + w > W + 1e-6 || y + h > H + 1e-6;
  if (plan.rooms.some((r) => fl.includes(r.f) && outside(r.x, r.y, r.w, r.h)) ||
      plan.fixtures.some((fx) => { const [w, d] = fixSize(fx); return fl.includes(fx.f) && outside(fx.x, fx.y, w / CELL, d / CELL); }))
    out.push({ k: 'out', t: '土地からはみ出しているところがあります（「土地」で家を動かすか、土地を広げてください）' });
  if (!plan.rooms.some((r) => r.f === 1)) return out;
  if (!plan.openings.some((o) => o.f === 1 && o.k === 'entry')) out.push({ k: 'entry', t: '玄関ドアがありません（「ドア・窓」で玄関の外壁をタップ）' });
  if (plan.floors === 2) {
    const o1 = owners(plan, 1), o2 = owners(plan, 2);
    const st = (own) => { const s = new Set(); own.g.forEach((ri, i) => { if (ri >= 0 && plan.rooms[ri].t === 'stairs') s.add(i); }); return s; };
    const s1 = st(o1), s2 = st(o2);
    if (plan.rooms.some((r) => r.f === 2)) {
      if (!s1.size || !s2.size) out.push({ k: 'stairs', t: '階段が' + (!s1.size && !s2.size ? '1階にも2階にも' : !s1.size ? '1階に' : '2階に') + 'ありません' });
      else if (s1.size !== s2.size || [...s1].some((i) => !s2.has(i))) out.push({ k: 'stairs', t: '階段の場所が1階と2階でずれています' });
      let float = false;
      o2.g.forEach((ri, i) => { if (ri >= 0 && isIndoor(plan.rooms[ri].t)) { const r1 = o1.g[i]; if (r1 < 0 || !isIndoor(plan.rooms[r1].t)) float = true; } });
      if (float) out.push({ k: 'float', t: '2階の部屋の下に、1階の部屋がないところがあります' });
    }
  }
  // 窓のない居室
  for (const f of fl) {
    const own = owners(plan, f);
    const units = openingUnits(plan, f);
    const wl = walls(plan, f, own);
    for (const gr of ar.floors[f]?.groups || []) {
      const main = plan.rooms[gr.main];
      if (!ROOMS[main.t]?.live) continue;
      let has = false;
      for (const c of gr.cells) {
        const x = c % own.W, y = (c / own.W) | 0;
        for (const key of [`h${x},${y}`, `h${x},${y + 1}`, `v${x},${y}`, `v${x + 1},${y}`]) {
          const op = units.get(key);
          if (op && isWin(op.k) && wl.get(key)?.k === 'ext') { has = true; break; }
        }
        if (has) break;
      }
      if (!has) out.push({ k: 'win', t: `窓のない部屋があります：${f}階の${roomLabel(main)}` });
    }
  }
  if (plan.site.bcr && ar.bcr > plan.site.bcr + 1e-6) out.push({ k: 'bcr', t: `建ぺい率が上限をこえています（${fmt1(ar.bcr)}％／上限${plan.site.bcr}％）` });
  if (plan.site.far && ar.far > plan.site.far + 1e-6) out.push({ k: 'far', t: `容積率が上限をこえています（${fmt1(ar.far)}％／上限${plan.site.far}％）` });
  return out;
}

/* 家（部屋・ドア窓・設備）の広がり（マス）。画像にするときの範囲 */
export function houseBounds(plan) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const fl = floorsOf(plan);
  for (const r of plan.rooms) {
    if (!fl.includes(r.f)) continue;
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
  }
  if (x0 === Infinity) { const { W, H } = dims(plan); return { x0: 0, y0: 0, x1: W, y1: H }; }
  return { x0, y0, x1, y1 };
}

/* 長方形のまとまりを、なるべく大きな四角に分ける（屋根・基礎づくりに使う） */
export function rectangles(mask, W, H) {
  const used = new Uint8Array(W * H);
  const out = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!mask[i] || used[i]) continue;
    let w = 0;
    while (x + w < W && mask[y * W + x + w] && !used[y * W + x + w]) w++;
    let h = 1;
    outer: while (y + h < H) {
      for (let k = 0; k < w; k++) { const j = (y + h) * W + x + k; if (!mask[j] || used[j]) break outer; }
      h++;
    }
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) used[yy * W + xx] = 1;
    out.push({ x, y, w, h });
  }
  return out;
}

/* 方角の言葉（0＝北、時計回りの度） */
export function dirName(deg) {
  const names = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];
  return names[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/* 画面の上・右・下・左が、どの方角か */
export function sideDir(plan, side) {
  const base = { up: 0, right: 90, down: 180, left: 270 }[side];
  return dirName(base - plan.site.north);
}

/* 太陽の位置（北緯35度）。season: summer/equinox/winter、hour: 0〜24 → 方位（北0・時計回り）と高さ（度） */
export function sunPos(season, hour) {
  const lat = 35 * Math.PI / 180;
  const dec = { summer: 23.44, equinox: 0, winter: -23.44 }[season] * Math.PI / 180;
  const H = (hour - 12) * 15 * Math.PI / 180;
  const alt = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H));
  const azS = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat));
  return { az: (azS * 180 / Math.PI + 180 + 360) % 360, alt: alt * 180 / Math.PI };
}

export { CELL, ROOMS, OPEN, FIX, EXT };
