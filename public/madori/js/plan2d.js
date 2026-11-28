/* ゆめのおうち：間取り図を canvas に描く。view = { s: 1マスの画素数, ox, oy: マス(0,0)の画面位置 } */
import { CELL, ROOMS, OPEN, FIX, EXT, fixParts, fixSize, rotPt } from './data.js';
import { dims, owners, walls, openingUnits, groups, roomLabel, fmt1, JO, isIndoor } from './model.js';

const FONT = '"Zen Kaku Gothic New", "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif';
const INK = '#3a3631';
const ROAD_M = 4;

export function drawPlan(ctx, plan, f, view, opts = {}) {
  const { s, ox, oy } = view;
  const { W, H } = dims(plan);
  const X = (gx) => ox + gx * s, Y = (gy) => oy + gy * s;
  const sw = plan.site.w / CELL, sd = plan.site.d / CELL;

  if (!opts.noBg) { ctx.fillStyle = '#f6f3ea'; ctx.fillRect(-1e4, -1e4, 2e4, 2e4); }

  // 道路
  const rw = ROAD_M / CELL;
  ctx.font = `700 ${Math.max(10, s * 0.55)}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const side of opts.plain ? [] : plan.site.road || []) {
    let r;
    if (side === 'down') r = [X(-rw), Y(sd), (sw + 2 * rw) * s, rw * s];
    if (side === 'up') r = [X(-rw), Y(-rw), (sw + 2 * rw) * s, rw * s];
    if (side === 'left') r = [X(-rw), Y(-rw), rw * s, (sd + 2 * rw) * s];
    if (side === 'right') r = [X(sw), Y(-rw), rw * s, (sd + 2 * rw) * s];
    if (!r) continue;
    ctx.fillStyle = '#d8d5cd'; ctx.fillRect(...r);
    ctx.fillStyle = '#8f8b81';
    const cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
    ctx.save(); ctx.translate(cx, cy); if (side === 'left' || side === 'right') ctx.rotate(-Math.PI / 2);
    ctx.fillText('道 路', 0, 0); ctx.restore();
  }
  // 土地
  ctx.fillStyle = '#eef0e1'; ctx.fillRect(X(0), Y(0), sw * s, sd * s);
  // マス目
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x++) { ctx.strokeStyle = x % 2 ? '#e2e1d2' : '#d3d2bf'; line(ctx, X(x), Y(0), X(x), Y(H)); }
  for (let y = 0; y <= H; y++) { ctx.strokeStyle = y % 2 ? '#e2e1d2' : '#d3d2bf'; line(ctx, X(0), Y(y), X(W), Y(y)); }
  if (!opts.plain) {
    ctx.setLineDash([6, 4]); ctx.strokeStyle = '#8b8a70'; ctx.lineWidth = 1.5;
    ctx.strokeRect(X(0), Y(0), sw * s, sd * s); ctx.setLineDash([]);
  }

  // 外構（1階のときだけ）
  if (f === 1 && opts.ext !== false) for (const e of plan.ext) drawExt(ctx, e, X, Y, s, opts.sel?.id === e.id);

  // 2階を描くときは1階をうっすら
  if (f === 2 && opts.ghost !== false) {
    const own1 = owners(plan, 1);
    ctx.fillStyle = 'rgba(120,110,95,.10)';
    own1.g.forEach((ri, i) => { if (ri >= 0 && isIndoor(plan.rooms[ri].t)) ctx.fillRect(X(i % W), Y((i / W) | 0), s + 0.5, s + 0.5); });
    const w1 = walls(plan, 1, own1);
    ctx.strokeStyle = 'rgba(90,80,70,.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    for (const w of w1.values()) if (w.k === 'ext') edgeLine(ctx, w, X, Y);
    ctx.setLineDash([]);
  }

  // 部屋
  const own = owners(plan, f);
  plan.rooms.forEach((r) => { if (r.f === f) drawRoomFill(ctx, r, X, Y, s); });

  // 設備
  for (const fx of plan.fixtures) if (fx.f === f) drawFix(ctx, fx, X, Y, s, opts.sel?.id === fx.id);

  // 壁
  const wl = walls(plan, f, own);
  const units = openingUnits(plan, f);
  const wt = { ext: Math.max(3, s * 0.17), int: Math.max(2, s * 0.1), para: Math.max(2, s * 0.09) };
  const wc = { ext: INK, int: '#5a554c', para: '#8b867b' };
  ctx.lineCap = 'square';
  for (const kk of ['para', 'int', 'ext']) {
    ctx.strokeStyle = wc[kk]; ctx.lineWidth = wt[kk];
    ctx.beginPath();
    for (const [key, w] of wl) {
      if (w.k !== kk) continue;
      if (units.has(key) && w.k !== 'para') continue;
      if (w.o === 'h') { ctx.moveTo(X(w.x), Y(w.y)); ctx.lineTo(X(w.x + 1), Y(w.y)); }
      else { ctx.moveTo(X(w.x), Y(w.y)); ctx.lineTo(X(w.x), Y(w.y + 1)); }
    }
    ctx.stroke();
  }
  ctx.lineCap = 'butt';

  // ドア・窓
  for (const op of plan.openings) if (op.f === f) drawOpening(ctx, op, wl, X, Y, s, wt, opts.sel?.id === op.id);

  // 部屋の名前と広さ
  for (const gr of groups(plan, f, own)) {
    const r = plan.rooms[gr.main];
    let cx = 0, cy = 0, n = 0;
    for (const c of gr.cells) { if (own.g[c] !== gr.main) continue; cx += c % W + 0.5; cy += ((c / W) | 0) + 0.5; n++; }
    if (!n) continue;
    cx /= n; cy /= n;
    // 名前を置くのは、その部屋の四角の中心（見えている部分の重心がずれるときはそちら）
    const rcx = r.x + r.w / 2, rcy = r.y + r.h / 2;
    if (own.at(Math.floor(rcx), Math.floor(rcy)) === gr.main) { cx = rcx; cy = rcy; }
    const minSide = Math.min(r.w, r.h) * s;
    const fs = Math.max(9, Math.min(s * 0.5, minSide * 0.28, 22));
    ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${fs}px ${FONT}`;
    const label = roomLabel(r);
    const showArea = !['stairs', 'toilet', 'storage', 'wic', 'pantry', 'balcony', 'hall', 'corridor'].includes(r.t) || gr.cells.length >= 6;
    const vertical = r.w * s < ctx.measureText(label).width + 4 && r.h > r.w;
    if (vertical) {
      ctx.save(); ctx.translate(X(cx), Y(cy)); ctx.rotate(Math.PI / 2);
      ctx.fillText(label, 0, 0); ctx.restore();
    } else {
      ctx.fillText(label, X(cx), Y(cy) - (showArea ? fs * 0.55 : 0));
      if (showArea) {
        ctx.font = `500 ${fs * 0.86}px ${FONT}`; ctx.fillStyle = '#5c5950';
        ctx.fillText(fmt1(gr.area / JO) + '帖', X(cx), Y(cy) + fs * 0.6);
      }
    }
  }

  // 選んでいる部屋・外構
  const sel = opts.sel;
  if (sel) {
    const obj = sel.obj;
    ctx.strokeStyle = opts.accent || '#557a3f'; ctx.lineWidth = 3;
    if (sel.kind === 'room' && obj.f === f) {
      ctx.setLineDash([7, 4]); ctx.strokeRect(X(obj.x), Y(obj.y), obj.w * s, obj.h * s); ctx.setLineDash([]);
      handles(ctx, [[obj.x, obj.y], [obj.x + obj.w, obj.y], [obj.x, obj.y + obj.h], [obj.x + obj.w, obj.y + obj.h]], X, Y, opts.accent);
    }
    if (sel.kind === 'ext' && f === 1) {
      const sh = EXT[obj.t].shape;
      if (sh === 'rect') {
        ctx.setLineDash([7, 4]); ctx.strokeRect(X(obj.x), Y(obj.y), obj.w * s, obj.h * s); ctx.setLineDash([]);
        handles(ctx, [[obj.x, obj.y], [obj.x + obj.w, obj.y], [obj.x, obj.y + obj.h], [obj.x + obj.w, obj.y + obj.h]], X, Y, opts.accent);
      } else if (sh === 'line') handles(ctx, [[obj.x1, obj.y1], [obj.x2, obj.y2]], X, Y, opts.accent);
    }
  }
  // なぞっている途中
  const dr = opts.draft;
  if (dr) {
    ctx.fillStyle = 'rgba(85,122,63,.18)'; ctx.strokeStyle = opts.accent || '#557a3f'; ctx.lineWidth = 2.5;
    if (dr.line) { ctx.lineWidth = 5; line(ctx, X(dr.x1), Y(dr.y1), X(dr.x2), Y(dr.y2)); }
    else {
      ctx.fillRect(X(dr.x), Y(dr.y), dr.w * s, dr.h * s); ctx.strokeRect(X(dr.x), Y(dr.y), dr.w * s, dr.h * s);
      const txt = `${mtxt2(dr.w)} × ${mtxt2(dr.h)}`;
      ctx.font = `700 ${Math.max(12, s * 0.45)}px ${FONT}`;
      const tw = ctx.measureText(txt).width + 12;
      const tx = X(dr.x + dr.w / 2), ty = Y(dr.y) - 16;
      ctx.fillStyle = 'rgba(43,42,38,.85)'; roundRect(ctx, tx - tw / 2, ty - 12, tw, 24, 6); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, tx, ty);
    }
  }
}
const mtxt2 = (c) => (c * CELL).toFixed(2) + 'm';

function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function edgeLine(ctx, w, X, Y) {
  if (w.o === 'h') line(ctx, X(w.x), Y(w.y), X(w.x + 1), Y(w.y));
  else line(ctx, X(w.x), Y(w.y), X(w.x), Y(w.y + 1));
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function handles(ctx, pts, X, Y, accent) {
  for (const [gx, gy] of pts) {
    ctx.beginPath(); ctx.arc(X(gx), Y(gy), 9, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = accent || '#557a3f'; ctx.stroke();
  }
}

function drawRoomFill(ctx, r, X, Y, s) {
  const d = ROOMS[r.t] || ROOMS.western;
  const x = X(r.x), y = Y(r.y), w = r.w * s, h = r.h * s;
  ctx.fillStyle = d.c; ctx.fillRect(x, y, w, h);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (r.t === 'washitsu') {
    // 畳（1枚＝1マス×2マス）
    ctx.strokeStyle = 'rgba(110,120,60,.35)'; ctx.lineWidth = 1;
    for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i += 2) {
      const horiz = (i / 2 + j) % 2 === 0;
      if (horiz) ctx.strokeRect(X(r.x + i), Y(r.y + j), Math.min(2, r.w - i) * s, s);
      else { ctx.strokeRect(X(r.x + i), Y(r.y + j), s, s); ctx.strokeRect(X(r.x + i + 1), Y(r.y + j), s, s); }
    }
  } else if (r.t === 'stairs') {
    ctx.strokeStyle = 'rgba(80,70,55,.45)'; ctx.lineWidth = 1;
    const long = r.h >= r.w;
    const n = Math.round((long ? r.h : r.w) * 4);
    for (let i = 1; i < n; i++) {
      if (long) line(ctx, x, y + (h * i) / n, x + w, y + (h * i) / n);
      else line(ctx, x + (w * i) / n, y, x + (w * i) / n, y + h);
    }
    // 上る向きの矢印
    ctx.strokeStyle = 'rgba(60,55,45,.7)'; ctx.lineWidth = 1.5;
    const ax = x + w / 2, ay = y + h / 2;
    if (long) { line(ctx, ax, y + h - 6, ax, y + 8); line(ctx, ax, y + 8, ax - 5, y + 15); line(ctx, ax, y + 8, ax + 5, y + 15); }
    else { line(ctx, x + 6, ay, x + w - 8, ay); line(ctx, x + w - 8, ay, x + w - 15, ay - 5); line(ctx, x + w - 8, ay, x + w - 15, ay + 5); }
  } else if (r.t === 'balcony') {
    ctx.strokeStyle = 'rgba(120,115,100,.3)'; ctx.lineWidth = 1;
    for (let k = -h; k < w; k += 8) line(ctx, x + k, y + h, x + k + h, y);
  } else if (r.t === 'entry') {
    ctx.fillStyle = 'rgba(120,105,85,.12)';
    for (let i = 0; i < r.w; i++) for (let j = 0; j < r.h; j++) if ((i + j) % 2) ctx.fillRect(X(r.x + i), Y(r.y + j), s, s);
  }
  ctx.restore();
}

function fixTransform(ctx, fx, X, Y, s) {
  const d = FIX[fx.t];
  const W = d.w / CELL * s, D = d.d / CELL * s;
  ctx.translate(X(fx.x), Y(fx.y));
  const r = fx.rot % 4;
  if (r === 1) { ctx.translate(D, 0); ctx.rotate(Math.PI / 2); }
  if (r === 2) { ctx.translate(W, D); ctx.rotate(Math.PI); }
  if (r === 3) { ctx.translate(0, W); ctx.rotate(-Math.PI / 2); }
  return [W, D];
}

function drawFix(ctx, fx, X, Y, s, selected) {
  const k = s / CELL; // 1mの画素数
  ctx.save();
  const [W, D] = fixTransform(ctx, fx, X, Y, s);
  ctx.lineWidth = 1.3; ctx.strokeStyle = '#6d675c'; ctx.fillStyle = '#fbfaf6';
  for (const p of fixParts(fx.t)) {
    if (p.h < 0.05) continue;
    ctx.fillRect(p.x * k, p.y * k, p.w * k, p.d * k); ctx.strokeRect(p.x * k, p.y * k, p.w * k, p.d * k);
  }
  ctx.strokeStyle = '#8a8478'; ctx.lineWidth = 1;
  const circle = (cx, cy, r) => { ctx.beginPath(); ctx.arc(cx * k, cy * k, r * k, 0, Math.PI * 2); ctx.stroke(); };
  switch (fx.t) {
    case 'kitchenI': case 'island':
      ctx.strokeRect(0.3 * k, 0.12 * k, 0.75 * k, 0.4 * k); circle(2.0, 0.33, 0.1); circle(2.3, 0.33, 0.1); circle(2.15, 0.5, 0.07); break;
    case 'kitchenL':
      ctx.strokeRect(0.9 * k, 0.12 * k, 0.7 * k, 0.4 * k); circle(0.33, 1.25, 0.1); circle(0.33, 1.55, 0.1); break;
    case 'bath1': case 'bath125': {
      const bw = fx.t === 'bath1' ? 1.6 : 2.0;
      ctx.strokeRect(0, 0, bw * k, 1.6 * k);
      roundRect(ctx, 0.1 * k, 0.08 * k, (bw - 0.2) * k, 0.6 * k, 0.2 * k); ctx.stroke(); break;
    }
    case 'vanity': ctx.beginPath(); ctx.ellipse(0.375 * k, 0.3 * k, 0.22 * k, 0.15 * k, 0, 0, Math.PI * 2); ctx.stroke(); break;
    case 'washer': circle(0.32, 0.32, 0.22); break;
    case 'toilet': ctx.beginPath(); ctx.ellipse(0.21 * k, 0.45 * k, 0.15 * k, 0.22 * k, 0, 0, Math.PI * 2); ctx.stroke(); break;
    case 'fridge': ctx.font = `700 ${Math.max(8, 0.22 * k)}px ${FONT}`; ctx.fillStyle = '#6d675c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('冷', 0.35 * k, 0.35 * k); break;
  }
  if (selected) { ctx.strokeStyle = '#557a3f'; ctx.lineWidth = 3; ctx.setLineDash([5, 3]); ctx.strokeRect(-3, -3, W + 6, D + 6); ctx.setLineDash([]); }
  ctx.restore();
}

function drawOpening(ctx, op, wl, X, Y, s, wt, selected) {
  const units = [];
  for (let i = 0; i < op.len; i++) {
    const key = op.o === 'h' ? `h${op.x + i},${op.y}` : `v${op.x},${op.y + i}`;
    units.push(wl.get(key));
  }
  const wallK = units.find(Boolean)?.k || 'int';
  const t = wallK === 'ext' ? wt.ext : wt.int;
  const L = op.len * s;
  ctx.save();
  ctx.translate(X(op.x), Y(op.y));
  if (op.o === 'v') ctx.rotate(Math.PI / 2);
  // ここで線は x 方向（0..L）、壁の厚みは y 方向（-t/2..t/2）
  const g = OPEN[op.k]?.g;
  // 壁が切れていないところ（壁がない辺）は、うすい点線で示す
  units.forEach((u, i) => { if (!u) { ctx.strokeStyle = 'rgba(176,87,74,.6)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 2; line(ctx, i * s, 0, (i + 1) * s, 0); ctx.setLineDash([]); } });
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
  // 枠の端
  ctx.fillStyle = INK;
  if (op.k !== 'open') { ctx.fillRect(-1, -t / 2, 3, t); ctx.fillRect(L - 2, -t / 2, 3, t); }
  if (g === 'win') {
    ctx.fillStyle = '#fbfaf6'; ctx.fillRect(1, -t / 2, L - 2, t);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
    if (op.k === 'high') ctx.setLineDash([4, 3]);
    line(ctx, 0, -t / 2, L, -t / 2); line(ctx, 0, t / 2, L, t / 2);
    ctx.setLineDash([]);
    ctx.strokeStyle = '#4e7fa6'; ctx.lineWidth = op.k === 'hakidashi' ? 2.4 : 1.6;
    line(ctx, 2, -t * 0.12, L / 2 + 2, -t * 0.12); line(ctx, L / 2 - 2, t * 0.12, L - 2, t * 0.12);
    if (op.k === 'hakidashi') { ctx.strokeStyle = INK; ctx.lineWidth = 1; for (let i = 0; i <= 4; i++) line(ctx, (L * i) / 4, t / 2, (L * i) / 4, t / 2 + 4); }
    if (op.k === 'small') { ctx.fillStyle = '#4e7fa6'; ctx.fillRect(L / 2 - 2, -2, 4, 4); }
  } else if (op.k === 'open') {
    ctx.strokeStyle = 'rgba(90,85,76,.35)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); line(ctx, 0, 0, L, 0); ctx.setLineDash([]);
  } else if (op.k === 'sliding') {
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    line(ctx, 0, -t * 0.18, L * 0.6, -t * 0.18); line(ctx, L * 0.4, t * 0.18, L, t * 0.18);
  } else {
    // 開き戸・玄関ドア：sw の1の位＝開く側、2の位＝吊り元
    const side = op.sw & 1 ? 1 : -1, hingeEnd = op.sw & 2 ? 1 : 0;
    const leaves = op.len >= 2 && op.k !== 'entry' ? 2 : 1;
    ctx.strokeStyle = op.k === 'entry' ? '#9a6a42' : INK; ctx.lineWidth = op.k === 'entry' ? 2.6 : 1.6;
    const lw = L / leaves;
    for (let i = 0; i < leaves; i++) {
      const hx = leaves === 2 ? (i === 0 ? 0 : L) : (hingeEnd ? L : 0);
      const dir = leaves === 2 ? (i === 0 ? 1 : -1) : (hingeEnd ? -1 : 1);
      const ly = side * lw;
      line(ctx, hx, 0, hx, ly);
      // 円弧は、開いたドアの先から閉じた位置まで
      ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(hx, ly);
      const steps = 12;
      for (let k = 1; k <= steps; k++) {
        const th = (Math.PI / 2) * (k / steps);
        ctx.lineTo(hx + dir * lw * Math.sin(th), side * lw * Math.cos(th));
      }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.lineWidth = op.k === 'entry' ? 2.6 : 1.6;
    }
  }
  if (selected) {
    ctx.strokeStyle = '#557a3f'; ctx.lineWidth = 4; ctx.globalAlpha = 0.55;
    ctx.strokeRect(-4, -t / 2 - 5, L + 8, t + 10); ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawExt(ctx, e, X, Y, s, selected) {
  const d = EXT[e.t];
  if (d.shape === 'rect') {
    const x = X(e.x), y = Y(e.y), w = e.w * s, h = e.h * s;
    ctx.fillStyle = d.c; ctx.fillRect(x, y, w, h);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.lineWidth = 1;
    if (e.t === 'deck') { ctx.strokeStyle = 'rgba(120,80,45,.35)'; const n = (e.w >= e.h ? e.h : e.w) * 6; for (let i = 1; i < n; i++) { if (e.w >= e.h) line(ctx, x, y + (h * i) / n, x + w, y + (h * i) / n); else line(ctx, x + (w * i) / n, y, x + (w * i) / n, y + h); } }
    if (e.t === 'terrace') { ctx.strokeStyle = 'rgba(120,110,95,.3)'; for (let i = 0; i <= e.w * 2; i++) line(ctx, x + (i * s) / 2, y, x + (i * s) / 2, y + h); for (let j = 0; j <= e.h * 2; j++) line(ctx, x, y + (j * s) / 2, x + w, y + (j * s) / 2); }
    if (e.t === 'lawn') { ctx.fillStyle = 'rgba(90,130,60,.25)'; for (let i = 0; i < e.w * e.h * 6; i++) { const rx = hash(e.id, i) * w, ry = hash(e.id, i + 999) * h; ctx.fillRect(x + rx, y + ry, 2, 3); } }
    if (e.t === 'flower') { const cs = ['#d9738a', '#e8b84a', '#9a7ac8', '#f2f2f2']; for (let i = 0; i < e.w * e.h * 5; i++) { ctx.fillStyle = cs[i % 4]; ctx.beginPath(); ctx.arc(x + 4 + hash(e.id, i) * (w - 8), y + 4 + hash(e.id, i + 77) * (h - 8), Math.max(2, s * 0.08), 0, Math.PI * 2); ctx.fill(); } }
    if (e.t === 'approach') { ctx.fillStyle = 'rgba(150,140,125,.35)'; const n = Math.max(e.w, e.h) * 1.5; for (let i = 0; i < n; i++) { const vert = e.h >= e.w; const cx = vert ? x + w / 2 : x + ((i + 0.5) * w) / n, cy = vert ? y + ((i + 0.5) * h) / n : y + h / 2; ctx.beginPath(); ctx.ellipse(cx, cy, (vert ? w : w / n) * 0.32, (vert ? h / n : h) * 0.32, 0, 0, Math.PI * 2); ctx.fill(); } }
    if (e.t === 'parking') {
      ctx.strokeStyle = 'rgba(90,90,90,.45)'; ctx.lineWidth = 1.2;
      const cw = 1.75 / CELL * s, cl = 4.6 / CELL * s;
      const vert = e.h >= e.w;
      const [aw, al] = vert ? [w, h] : [h, w];
      const nCars = Math.max(1, Math.floor(aw / (cw + 0.6 / CELL * s)));
      if (al >= cl * 0.95 && aw >= cw) for (let i = 0; i < nCars; i++) {
        const cx = vert ? x + (aw * (i + 0.5)) / nCars : x + w / 2, cy = vert ? y + h / 2 : y + (aw * (i + 0.5)) / nCars;
        ctx.save(); ctx.translate(cx, cy); if (!vert) ctx.rotate(Math.PI / 2);
        roundRect(ctx, -cw / 2, -cl / 2, cw, cl, cw * 0.25); ctx.stroke();
        ctx.strokeRect(-cw * 0.38, -cl * 0.18, cw * 0.76, cl * 0.42);
        ctx.restore();
      }
    }
    ctx.restore();
    ctx.font = `700 ${Math.max(9, Math.min(s * 0.38, 14))}px ${FONT}`; ctx.fillStyle = 'rgba(60,55,45,.75)'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (w > 40 && h > 16) ctx.fillText(d.label, x + 4, y + 3);
  } else if (d.shape === 'line') {
    ctx.strokeStyle = '#6b5a48'; ctx.lineWidth = Math.max(3, s * 0.12); ctx.setLineDash([s * 0.3, s * 0.12]);
    line(ctx, X(e.x1), Y(e.y1), X(e.x2), Y(e.y2)); ctx.setLineDash([]);
  } else if (e.t === 'tree') {
    const r = d.r / CELL * s * 1.4;
    ctx.fillStyle = 'rgba(95,140,70,.55)'; ctx.strokeStyle = '#4f7a3a'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2; const rr = r * (i % 2 ? 0.82 : 1); ctx.lineTo(X(e.x) + Math.cos(a) * rr, Y(e.y) + Math.sin(a) * rr); }
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6b5a48'; ctx.beginPath(); ctx.arc(X(e.x), Y(e.y), Math.max(2, s * 0.08), 0, Math.PI * 2); ctx.fill();
  } else if (e.t === 'gate') {
    const gw = (e.rot % 2 ? d.d : d.w) / CELL * s, gd = (e.rot % 2 ? d.w : d.d) / CELL * s;
    ctx.fillStyle = '#d8d0c2'; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
    ctx.fillRect(X(e.x) - gw / 2, Y(e.y) - gd / 2, gw, gd); ctx.strokeRect(X(e.x) - gw / 2, Y(e.y) - gd / 2, gw, gd);
    ctx.fillStyle = INK; ctx.fillRect(X(e.x) - 3, Y(e.y) - 3, 6, 6);
  }
  if (selected && d.shape !== 'rect') {
    ctx.strokeStyle = '#557a3f'; ctx.lineWidth = 3; ctx.setLineDash([5, 3]);
    if (d.shape === 'point') { ctx.beginPath(); ctx.arc(X(e.x), Y(e.y), s * 1.0, 0, Math.PI * 2); ctx.stroke(); }
    else line(ctx, X(e.x1), Y(e.y1), X(e.x2), Y(e.y2));
    ctx.setLineDash([]);
  }
}

function hash(id, i) {
  let h = 2166136261;
  const str = id + ':' + i;
  for (let k = 0; k < str.length; k++) { h ^= str.charCodeAt(k); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

/* 画面の角に出す方位と、ものさし */
export function drawCompass(ctx, cx, cy, r, north) {
  ctx.save(); ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(251,250,245,.92)'; ctx.strokeStyle = '#cfc9b4'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.rotate((north * Math.PI) / 180);
  ctx.fillStyle = '#b0574a';
  ctx.beginPath(); ctx.moveTo(0, -r * 0.72); ctx.lineTo(r * 0.26, r * 0.1); ctx.lineTo(-r * 0.26, r * 0.1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#9a958a';
  ctx.beginPath(); ctx.moveTo(0, r * 0.62); ctx.lineTo(r * 0.2, r * 0.1); ctx.lineTo(-r * 0.2, r * 0.1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2b2a26'; ctx.font = `700 ${r * 0.42}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('北', 0, -r * 1.25 + r * 0.05);
  ctx.restore();
}

export function drawScale(ctx, x, y, s) {
  const m = s / CELL; // 1mの画素数
  let len = 1;
  for (const c of [1, 2, 5, 10]) if (c * m <= 140) len = c;
  const w = len * m;
  ctx.save();
  ctx.fillStyle = 'rgba(251,250,245,.92)'; ctx.fillRect(x - 6, y - 18, w + 50, 28);
  ctx.strokeStyle = '#2b2a26'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y - 5); ctx.stroke();
  ctx.fillStyle = '#2b2a26'; ctx.font = `500 12px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(len + 'm', x + w + 6, y - 3);
  ctx.restore();
}

export { FONT };
