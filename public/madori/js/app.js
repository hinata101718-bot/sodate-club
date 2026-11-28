/* ゆめのおうち：画面の操作（案の保存・もとに戻す・タブ・間取りを描く指の動き・土地・外観・画像） */
import {
  CELL, ROOMS, ROOM_ORDER, OPEN, DOOR_KINDS, WIN_KINDS, FIX, FIX_ORDER, EXT, EXT_ORDER,
  ROOF_SHAPES, WALL_COLORS, TEMPLATES, uid, fixSize, blankPlan,
} from './data.js';
import { dims, walls, areas, houseBounds, fmt1, mtxt, cm, M2, JO, TSUBO } from './model.js';
import { drawPlan, drawScale, FONT } from './plan2d.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const CANVAS_ACCENT = '#557a3f';

/* ---------- 保存 ---------- */
const KEY = 'yume-ouchi-v1';
function loadStore() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.plans)) return s; } catch {}
  return { plans: [], cur: null, guided: false };
}
const store = loadStore();
let plan = store.plans.find((p) => p.id === store.cur) || store.plans[0] || null;
let saveTimer = 0;
function save(now) {
  clearTimeout(saveTimer);
  const go = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { toast('保存できませんでした（iPhoneの空きが少ないかもしれません）'); } };
  if (now) go(); else saveTimer = setTimeout(go, 250);
}
window.addEventListener('pagehide', () => save(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });

/* ---------- もとに戻す・やり直す ---------- */
const hist = { undo: [], redo: [], tag: null, t: 0 };
function pushUndo(str) { hist.undo.push(str); if (hist.undo.length > 100) hist.undo.shift(); hist.redo = []; hist.tag = null; }
function commit(fn, tag, opts = {}) {
  const now = Date.now();
  if (!(tag && hist.tag === tag && now - hist.t < 2000)) { hist.undo.push(JSON.stringify(plan)); if (hist.undo.length > 100) hist.undo.shift(); }
  hist.tag = tag || null; hist.t = now; hist.redo = [];
  fn(plan);
  changed(opts);
}
function replacePlan(obj) {
  const i = store.plans.findIndex((p) => p.id === plan.id);
  store.plans[i] = obj; plan = obj;
}
function undo() {
  if (!hist.undo.length) return;
  hist.redo.push(JSON.stringify(plan)); replacePlan(JSON.parse(hist.undo.pop())); hist.tag = null;
  changed({ full: true });
}
function redo() {
  if (!hist.redo.length) return;
  hist.undo.push(JSON.stringify(plan)); replacePlan(JSON.parse(hist.redo.pop())); hist.tag = null;
  changed({ full: true });
}
function changed(opts = {}) {
  plan.updated = Date.now();
  save();
  dirty3d = true;
  refresh(opts);
}

/* ---------- 画面の状態 ---------- */
const ui = {
  look: false, floor: 1, mode: 'room', roomType: 'western', fixType: 'kitchenI', extType: 'parking',
  sel: null, view: null, vis: 'all', lookTab: 'roof', season: 'winter', hour: 12,
};
let dirty3d = true, fit3d = true, view3d = null;

function resolveSel() {
  const s = ui.sel; if (!s) return null;
  const list = { room: plan.rooms, open: plan.openings, fix: plan.fixtures, ext: plan.ext }[s.kind];
  const obj = list?.find((o) => o.id === s.id);
  if (!obj) { ui.sel = null; return null; }
  return { kind: s.kind, id: s.id, obj };
}

/* ---------- 小さな道具 ---------- */
let toastTimer = 0;
function toast(msg) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}
function modal(html, { onMount, closable = true } = {}) {
  const layer = document.createElement('div');
  layer.className = 'layer';
  layer.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  $('#layer').append(layer);
  const close = () => layer.remove();
  if (closable) layer.addEventListener('click', (e) => { if (e.target === layer) close(); });
  $$('[data-close]', layer).forEach((b) => b.addEventListener('click', close));
  onMount?.(layer.firstElementChild, close);
  return close;
}
function confirmBox(text, okLabel, onOk, danger) {
  modal(`<h2>${esc(text)}</h2><div class="row"><button class="btn" data-close>やめる</button><button class="btn ${danger ? 'danger' : 'primary'}" id="ok">${esc(okLabel)}</button></div>`,
    { onMount: (m, close) => $('#ok', m).addEventListener('click', () => { close(); onOk(); }) });
}
function promptBox(title, value, onOk) {
  modal(`<h2>${esc(title)}</h2><input class="txt" id="pv" value="${esc(value)}" maxlength="40"><div class="row"><button class="btn" data-close>やめる</button><button class="btn primary" id="ok">決める</button></div>`,
    { onMount: (m, close) => { const i = $('#pv', m); i.focus(); i.select(); const ok = () => { const v = i.value.trim(); if (!v) return; close(); onOk(v); }; $('#ok', m).addEventListener('click', ok); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); }); } });
}
const tsubo = (m2) => fmt1(m2 / TSUBO);
const dateTxt = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };

/* ---------- 画面の更新 ---------- */
function refresh(opts = {}) {
  if (!plan) return;
  if (plan.floors !== 2 && ui.floor === 2) ui.floor = 1;
  $('#planName').textContent = plan.name;
  $('#undoBtn').disabled = !hist.undo.length;
  $('#redoBtn').disabled = !hist.redo.length;
  if (ui.look) { renderLook(opts); return; }
  drawCanvas();
  if (!opts.keepTray) renderTray();
  renderFloorSeg();
  renderAreaBtn();
}

/* =========================================================
   間取り（描く画面）
   ========================================================= */
const cv = $('#planCanvas'), stage = $('#planStage');
const ctx = cv.getContext('2d');
let cw = 0, ch = 0, dpr = 1, raf = 0;

function resizeCanvas() {
  const r = stage.getBoundingClientRect();
  if (!r.width || !r.height) return;
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  cw = r.width; ch = r.height;
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  if (!ui.view) fitView();
  paint();
}
new ResizeObserver(() => { if (!ui.look) resizeCanvas(); }).observe(stage);

function fitView() {
  if (!cw || !plan) return;
  const { W, H } = dims(plan);
  let x0 = 0, y0 = 0, x1 = W, y1 = H;
  if (plan.rooms.some((r) => r.f <= plan.floors)) { const b = houseBounds(plan); x0 = Math.max(0, b.x0 - 3); y0 = Math.max(0, b.y0 - 3); x1 = Math.min(W, b.x1 + 3); y1 = Math.min(H, b.y1 + 3); }
  const top = 58, bottom = 74;
  const s = Math.max(6, Math.min((cw - 20) / (x1 - x0), (ch - top - bottom) / (y1 - y0)));
  ui.view = { s, ox: (cw - (x1 - x0) * s) / 2 - x0 * s, oy: top + (ch - top - bottom - (y1 - y0) * s) / 2 - y0 * s };
}
function drawCanvas() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; paint(); }); }
function paint() {
  if (!plan || !cw || !ui.view) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  drawPlan(ctx, plan, ui.floor, ui.view, { sel: resolveSel(), draft: drag?.draft, accent: CANVAS_ACCENT, plain: true, ext: false });
  drawScale(ctx, 16, ch - 14, ui.view.s);
}

const toGrid = (p) => ({ gx: (p.x - ui.view.ox) / ui.view.s, gy: (p.y - ui.view.oy) / ui.view.s });
const ptPos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
const ptrs = new Map();
let drag = null, pinch = null;

cv.addEventListener('pointerdown', (e) => {
  if (!plan) return;
  try { cv.setPointerCapture(e.pointerId); } catch {}
  ptrs.set(e.pointerId, ptPos(e));
  if (ptrs.size === 2) {
    cancelDrag();
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, view: { ...ui.view } };
    return;
  }
  if (ptrs.size > 2 || pinch) return;
  const p = ptPos(e), g = toGrid(p);
  drag = { id: e.pointerId, p0: p, g0: g, moved: false, act: 'tap', view: { ...ui.view } };
  const sel = resolveSel();
  const hh = sel && hitHandle(sel, p);
  if (hh != null) { Object.assign(drag, { act: 'resize', handle: hh, pre: JSON.stringify(plan), orig: structuredClone(sel.obj) }); return; }
  if (sel && sel.kind !== 'open' && hitObj(sel, g)) { Object.assign(drag, { act: 'move', pre: JSON.stringify(plan), orig: structuredClone(sel.obj) }); return; }
  if (ui.mode === 'select') {
    const hit = hitTest(g);
    if (hit) {
      ui.sel = { kind: hit.kind, id: hit.obj.id };
      Object.assign(drag, { act: 'move', pre: JSON.stringify(plan), orig: structuredClone(hit.obj), justSel: true });
      renderTray(); drawCanvas();
    } else drag.act = 'pan';
    return;
  }
  if (ui.mode === 'room') drag.act = 'rect';
  if (ui.mode === 'ext') { const sh = EXT[ui.extType].shape; drag.act = sh === 'rect' ? 'rect' : sh === 'line' ? 'line' : 'tap'; }
});
cv.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, ptPos(e));
  if (pinch) {
    if (ptrs.size < 2) return;
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const v = pinch.view;
    const s = clamp(v.s * (d / pinch.d), 6, 140);
    const gx = (pinch.mx - v.ox) / v.s, gy = (pinch.my - v.oy) / v.s;
    ui.view = { s, ox: mx - gx * s, oy: my - gy * s };
    drawCanvas();
    return;
  }
  if (!drag || drag.id !== e.pointerId) return;
  const p = ptPos(e);
  if (!drag.moved && Math.hypot(p.x - drag.p0.x, p.y - drag.p0.y) < 7) return;
  if (!drag.moved) { drag.moved = true; if (drag.act === 'tap') drag.act = 'pan'; }
  const g = toGrid(p);
  const { W, H } = dims(plan);
  switch (drag.act) {
    case 'pan': ui.view = { ...drag.view, ox: drag.view.ox + p.x - drag.p0.x, oy: drag.view.oy + p.y - drag.p0.y }; break;
    case 'rect': {
      const ax = clamp(Math.floor(drag.g0.gx), 0, W - 1), ay = clamp(Math.floor(drag.g0.gy), 0, H - 1);
      const bx = clamp(Math.floor(g.gx), 0, W - 1), by = clamp(Math.floor(g.gy), 0, H - 1);
      drag.draft = { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax) + 1, h: Math.abs(by - ay) + 1 };
      break;
    }
    case 'line': {
      const x1 = clamp(Math.round(drag.g0.gx), 0, W), y1 = clamp(Math.round(drag.g0.gy), 0, H);
      let x2 = clamp(Math.round(g.gx), 0, W), y2 = clamp(Math.round(g.gy), 0, H);
      if (Math.abs(x2 - x1) >= Math.abs(y2 - y1)) y2 = y1; else x2 = x1;
      drag.draft = { line: true, x1, y1, x2, y2 };
      break;
    }
    case 'move': moveSel(g); break;
    case 'resize': resizeSel(g); break;
  }
  drawCanvas();
});
function endPointer(e, cancel) {
  ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
  if (!drag || drag.id !== e.pointerId) return;
  const d = drag; drag = null;
  if (cancel) { if (d.pre && JSON.stringify(plan) !== d.pre) replacePlan(JSON.parse(d.pre)); refresh(); return; }
  if (!d.moved) {
    if (d.act === 'move' || d.act === 'resize') { if (!d.justSel) onTap(d.g0); else drawCanvas(); return; }
    onTap(d.g0); return;
  }
  if (d.act === 'rect' && d.draft) createRect(d.draft);
  else if (d.act === 'line' && d.draft && (d.draft.x1 !== d.draft.x2 || d.draft.y1 !== d.draft.y2)) createLine(d.draft);
  else if ((d.act === 'move' || d.act === 'resize') && JSON.stringify(plan) !== d.pre) { pushUndo(d.pre); changed(); }
  else refresh();
}
cv.addEventListener('pointerup', (e) => endPointer(e, false));
cv.addEventListener('pointercancel', (e) => endPointer(e, true));
function cancelDrag() {
  if (drag?.pre && JSON.stringify(plan) !== drag.pre) replacePlan(JSON.parse(drag.pre));
  drag = null; drawCanvas();
}
document.addEventListener('gesturestart', (e) => e.preventDefault());

/* 当たり判定 */
function inRect(o, g) { return g.gx >= o.x && g.gx <= o.x + o.w && g.gy >= o.y && g.gy <= o.y + o.h; }
function fixBox(fx) { const [w, d] = fixSize(fx); return { x: fx.x, y: fx.y, w: w / CELL, h: d / CELL }; }
function segDist(g, e) {
  const ax = e.x1, ay = e.y1, bx = e.x2, by = e.y2;
  const L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
  const t = clamp(((g.gx - ax) * (bx - ax) + (g.gy - ay) * (by - ay)) / L2, 0, 1);
  return Math.hypot(g.gx - (ax + t * (bx - ax)), g.gy - (ay + t * (by - ay)));
}
function extHit(e, g) {
  const sh = EXT[e.t].shape;
  if (sh === 'rect') return inRect(e, g);
  if (sh === 'line') return segDist(g, e) < 0.45;
  return Math.hypot(g.gx - e.x, g.gy - e.y) < 0.9;
}
function hitObj(sel, g) {
  const o = sel.obj;
  if (sel.kind === 'room') return o.f === ui.floor && inRect(o, g);
  if (sel.kind === 'fix') return o.f === ui.floor && inRect(fixBox(o), g);
  if (sel.kind === 'ext') return ui.floor === 1 && extHit(o, g);
  return false;
}
function hitTest(g, only) {
  const f = ui.floor;
  const want = (k) => k !== 'ext' && (!only || only === k);
  if (want('fix')) for (let i = plan.fixtures.length - 1; i >= 0; i--) { const fx = plan.fixtures[i]; if (fx.f === f && inRect(fixBox(fx), g)) return { kind: 'fix', obj: fx }; }
  if (want('ext') && f === 1) for (let i = plan.ext.length - 1; i >= 0; i--) { const e = plan.ext[i]; if (EXT[e.t].shape !== 'rect' && extHit(e, g)) return { kind: 'ext', obj: e }; }
  if (want('room')) for (let i = plan.rooms.length - 1; i >= 0; i--) { const r = plan.rooms[i]; if (r.f === f && inRect(r, g)) return { kind: 'room', obj: r }; }
  if (want('ext') && f === 1) for (let i = plan.ext.length - 1; i >= 0; i--) { const e = plan.ext[i]; if (EXT[e.t].shape === 'rect' && extHit(e, g)) return { kind: 'ext', obj: e }; }
  return null;
}
function hitHandle(sel, p) {
  const o = sel.obj, v = ui.view;
  let pts = null;
  if (sel.kind === 'room' && o.f === ui.floor) pts = [[o.x, o.y], [o.x + o.w, o.y], [o.x, o.y + o.h], [o.x + o.w, o.y + o.h]];
  if (sel.kind === 'ext' && ui.floor === 1) {
    const sh = EXT[o.t].shape;
    if (sh === 'rect') pts = [[o.x, o.y], [o.x + o.w, o.y], [o.x, o.y + o.h], [o.x + o.w, o.y + o.h]];
    if (sh === 'line') pts = [[o.x1, o.y1], [o.x2, o.y2]];
  }
  if (!pts) return null;
  let best = null, bd = 22;
  pts.forEach(([gx, gy], i) => { const d = Math.hypot(v.ox + gx * v.s - p.x, v.oy + gy * v.s - p.y); if (d < bd) { bd = d; best = i; } });
  return best;
}
function edgeCands(g) {
  const dv = Math.abs(g.gx - Math.round(g.gx)), dh = Math.abs(g.gy - Math.round(g.gy));
  const tol = Math.max(0.3, Math.min(0.45, 14 / ui.view.s));
  const c = [];
  if (dh <= tol) c.push({ d: dh, o: 'h', x: Math.floor(g.gx), y: Math.round(g.gy) });
  if (dv <= tol) c.push({ d: dv, o: 'v', x: Math.round(g.gx), y: Math.floor(g.gy) });
  return c.sort((a, b) => a.d - b.d);
}
/* 角の近くでは、ドア・窓や壁がある方をえらぶ */
function edgeAt(g) {
  const c = edgeCands(g);
  if (!c.length) return null;
  const wl = walls(plan, ui.floor);
  return c.find((e) => openingAt(e)) || c.find((e) => wl.has(e.o === 'h' ? `h${e.x},${e.y}` : `v${e.x},${e.y}`)) || c[0];
}
function openingAt(e) {
  return plan.openings.find((op) => op.f === ui.floor && op.o === e.o &&
    (op.o === 'h' ? op.y === e.y && e.x >= op.x && e.x < op.x + op.len : op.x === e.x && e.y >= op.y && e.y < op.y + op.len));
}

/* 動かす・大きさを変える（指を離すまでは plan をそのまま書きかえ、離したときに履歴へ） */
function moveSel(g) {
  const sel = resolveSel(); if (!sel) return;
  const o = sel.obj, or = drag.orig;
  const dx = g.gx - drag.g0.gx, dy = g.gy - drag.g0.gy;
  const { W, H } = dims(plan);
  if (sel.kind === 'room' || (sel.kind === 'ext' && EXT[o.t].shape === 'rect')) {
    o.x = clamp(or.x + Math.round(dx), 0, W - o.w); o.y = clamp(or.y + Math.round(dy), 0, H - o.h);
  } else if (sel.kind === 'fix') {
    const b = fixBox(o), q = 0.125;
    o.x = clamp(Math.round((or.x + dx) / q) * q, 0, W - b.w); o.y = clamp(Math.round((or.y + dy) / q) * q, 0, H - b.h);
  } else if (sel.kind === 'ext' && EXT[o.t].shape === 'point') {
    o.x = clamp(Math.round((or.x + dx) * 4) / 4, 0, W); o.y = clamp(Math.round((or.y + dy) * 4) / 4, 0, H);
  } else if (sel.kind === 'ext') {
    const mx = clamp(Math.round(dx), -Math.min(or.x1, or.x2), W - Math.max(or.x1, or.x2));
    const my = clamp(Math.round(dy), -Math.min(or.y1, or.y2), H - Math.max(or.y1, or.y2));
    o.x1 = or.x1 + mx; o.x2 = or.x2 + mx; o.y1 = or.y1 + my; o.y2 = or.y2 + my;
  }
}
function resizeSel(g) {
  const sel = resolveSel(); if (!sel) return;
  const o = sel.obj, or = drag.orig;
  const { W, H } = dims(plan);
  const gx = clamp(Math.round(g.gx), 0, W), gy = clamp(Math.round(g.gy), 0, H);
  if (sel.kind === 'ext' && EXT[o.t].shape === 'line') {
    if (drag.handle === 0) { o.x1 = gx; o.y1 = gy; if (Math.abs(o.x1 - o.x2) >= Math.abs(o.y1 - o.y2)) o.y1 = o.y2; else o.x1 = o.x2; }
    else { o.x2 = gx; o.y2 = gy; if (Math.abs(o.x2 - o.x1) >= Math.abs(o.y2 - o.y1)) o.y2 = o.y1; else o.x2 = o.x1; }
    return;
  }
  const corners = [[or.x, or.y], [or.x + or.w, or.y], [or.x, or.y + or.h], [or.x + or.w, or.y + or.h]];
  const [fx, fy] = corners[3 - drag.handle];
  let x0 = Math.min(fx, gx), x1 = Math.max(fx, gx), y0 = Math.min(fy, gy), y1 = Math.max(fy, gy);
  if (x1 - x0 < 1) { if (gx < fx) x0 = x1 - 1; else x1 = x0 + 1; }
  if (y1 - y0 < 1) { if (gy < fy) y0 = y1 - 1; else y1 = y0 + 1; }
  o.x = x0; o.y = y0; o.w = x1 - x0; o.h = y1 - y0;
}

/* タップ */
function onTap(g) {
  const f = ui.floor;
  if (ui.mode === 'open' || ui.mode === 'select') {
    const e = edgeAt(g);
    if (e) {
      const op = openingAt(e);
      if (op) { ui.sel = { kind: 'open', id: op.id }; refresh(); return; }
      if (ui.mode === 'open') {
        const key = e.o === 'h' ? `h${e.x},${e.y}` : `v${e.x},${e.y}`;
        const w = walls(plan, f).get(key);
        if (!w) { toast('壁のあるところをタップしてください'); return; }
        if (w.k === 'para') { toast('バルコニーの手すり壁には付けられません'); return; }
        const op2 = { id: uid(), f, o: e.o, x: e.x, y: e.y, len: 1, k: w.k === 'ext' ? 'koshi' : 'door', sw: 0 };
        commit((p) => p.openings.push(op2));
        ui.sel = { kind: 'open', id: op2.id }; refresh();
        return;
      }
    }
    if (ui.mode === 'open') { ui.sel = null; refresh(); toast('壁（部屋のさかいめの線）をタップしてください'); return; }
  }
  if (ui.mode === 'select') {
    const hit = hitTest(g);
    ui.sel = hit ? { kind: hit.kind, id: hit.obj.id } : null; refresh(); return;
  }
  if (ui.mode === 'room') {
    const hit = hitTest(g, 'room');
    ui.sel = hit ? { kind: 'room', id: hit.obj.id } : null; refresh(); return;
  }
  if (ui.mode === 'fix') {
    const hit = hitTest(g, 'fix');
    if (hit) { ui.sel = { kind: 'fix', id: hit.obj.id }; refresh(); return; }
    const d = FIX[ui.fixType];
    const { W, H } = dims(plan);
    const fx = { id: uid(), f, t: ui.fixType, rot: 0, x: 0, y: 0 };
    fx.x = clamp(Math.round((g.gx - d.w / CELL / 2) * 8) / 8, 0, W - d.w / CELL);
    fx.y = clamp(Math.round((g.gy - d.d / CELL / 2) * 8) / 8, 0, H - d.d / CELL);
    commit((p) => p.fixtures.push(fx));
    ui.sel = { kind: 'fix', id: fx.id }; refresh();
    return;
  }
  if (ui.mode === 'ext') {
    const hit = hitTest(g, 'ext');
    if (hit) { ui.sel = { kind: 'ext', id: hit.obj.id }; refresh(); return; }
    if (EXT[ui.extType].shape === 'point') {
      const { W, H } = dims(plan);
      const e = { id: uid(), t: ui.extType, x: clamp(Math.round(g.gx * 4) / 4, 0, W), y: clamp(Math.round(g.gy * 4) / 4, 0, H), rot: 0 };
      commit((p) => p.ext.push(e));
      ui.sel = { kind: 'ext', id: e.id }; refresh();
    } else { ui.sel = null; refresh(); }
  }
}
function createRect(d) {
  if (ui.mode === 'room') {
    const r = { id: uid(), f: ui.floor, t: ui.roomType, x: d.x, y: d.y, w: d.w, h: d.h, name: '' };
    commit((p) => p.rooms.push(r));
    ui.sel = { kind: 'room', id: r.id };
  } else {
    const e = { id: uid(), t: ui.extType, x: d.x, y: d.y, w: d.w, h: d.h };
    commit((p) => p.ext.push(e));
    ui.sel = { kind: 'ext', id: e.id };
  }
  refresh();
}
function createLine(d) {
  const e = { id: uid(), t: ui.extType, x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 };
  commit((p) => p.ext.push(e));
  ui.sel = { kind: 'ext', id: e.id }; refresh();
}

/* 道具の帯と、その上の段（選んだもの・パレット） */
const TOOLS = [
  ['select', 'えらぶ', '<path d="M6 3.5 18 11l-5.2 1.6L10.5 18z"/><path d="m13 13 4.5 5"/>'],
  ['room', '部屋', '<rect x="3.5" y="4" width="17" height="16" rx="1"/><path d="M3.5 12h9M12.5 4v16"/>'],
  ['open', 'ドア・窓', '<path d="M6.5 20.5V4h10v16.5M3.5 20.5h17"/><path d="M13.5 12.5h.01"/>'],
  ['fix', '設備', '<path d="M3.5 12.5h17v2.5a4 4 0 0 1-4 4h-9a4 4 0 0 1-4-4z"/><path d="M6.5 12.5V6a2 2 0 0 1 4 0v.5"/><path d="M7 19l-1 1.5M17 19l1 1.5"/>'],
];
function renderTools() {
  $('#tools').innerHTML = TOOLS.map(([k, label, svg]) => `<button class="tool" data-mode="${k}" aria-pressed="${ui.mode === k}"><svg viewBox="0 0 24 24">${svg}</svg>${label}</button>`).join('');
}
$('#tools').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]'); if (!b) return;
  ui.mode = b.dataset.mode;
  ui.sel = null;
  if (ui.mode === 'ext' && ui.floor !== 1) { ui.floor = 1; toast('外構は1階の画面で置きます'); }
  renderTools(); refresh();
});

function chipsHTML(items, cur, attr) {
  return items.map(([k, label, color]) => `<button class="chip" data-${attr}="${k}" aria-pressed="${k === cur}">${color ? `<span class="dot" style="background:${color}"></span>` : ''}${esc(label)}</button>`).join('');
}
const roomChips = (cur) => chipsHTML(ROOM_ORDER.map((k) => [k, ROOMS[k].label, ROOMS[k].c]), cur, 'rt');

function renderTray() {
  const tray = $('#tray');
  const sel = resolveSel();
  tray.onclick = null;
  if (sel) { tray.innerHTML = selHTML(sel); bindSel(tray, sel); keepChipInView(tray); return; }
  const hints = {
    select: '部屋や設備をタップしてえらび、そのまま引っぱると動きます。何もないところをなぞると画面が動き、2本指で拡大できます。',
    room: '部屋の種類をえらんで、マス目を指でなぞると部屋ができます（1マス＝91cm）。できたら右下の「3Dで見る」へ。',
    open: '壁（部屋のさかいめの線）をタップすると、ドアや窓がつきます。もう一度タップすると種類や幅を変えられます。',
    fix: '設備をえらんで、置きたいところをタップします。置いたあとは引っぱって動かせます。',
    ext: EXT[ui.extType].shape === 'point' ? 'えらんだものを、置きたいところにタップします。' : EXT[ui.extType].shape === 'line' ? 'フェンスを立てたいところを、まっすぐなぞります。' : '置きたいところを指でなぞって四角を描きます。',
  };
  let chips = '';
  if (ui.mode === 'room') chips = roomChips(ui.roomType);
  if (ui.mode === 'fix') chips = chipsHTML(FIX_ORDER.map((k) => [k, FIX[k].label]), ui.fixType, 'ft');
  if (ui.mode === 'ext') chips = chipsHTML(EXT_ORDER.map((k) => [k, EXT[k].label, EXT[k].c]), ui.extType, 'et');
  tray.innerHTML = `${chips ? `<div class="chips">${chips}</div>` : ''}<p class="hint">${hints[ui.mode]}</p>`;
  keepChipInView(tray);
}
function keepChipInView(tray) {
  const on = $('.chips [aria-pressed="true"]', tray);
  if (on) on.parentElement.scrollLeft = Math.max(0, on.offsetLeft - 40);
}
$('#tray').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.rt && !resolveSel()) { ui.roomType = b.dataset.rt; renderTray(); }
  if (b.dataset.ft && !resolveSel()) { ui.fixType = b.dataset.ft; renderTray(); }
  if (b.dataset.et && !resolveSel()) { ui.extType = b.dataset.et; renderTray(); }
});

function selHTML(sel) {
  const o = sel.obj;
  const close = '<button class="btn sm x" data-a="close">とじる</button>';
  if (sel.kind === 'room') {
    const jo = (o.w * o.h * M2) / JO;
    const idx = plan.rooms.indexOf(o);
    const grp = areas(plan).floors[o.f]?.groups.find((g) => g.rooms.includes(idx));
    const joinTxt = grp && grp.rooms.length > 1 ? `（つながった部屋とあわせて ${fmt1(grp.area / JO)}帖）` : '';
    const stairsBtn = o.t === 'stairs' && plan.floors === 2 ? `<button class="btn sm" data-a="stairsCopy">${o.f === 1 ? '2階' : '1階'}にも置く</button>` : '';
    return `<div class="selhead"><b>${esc(o.name || ROOMS[o.t].label)}</b><span class="meta">${fmt1(jo)}帖 ・ ${mtxt(o.w)} × ${mtxt(o.h)}${joinTxt}</span>${close}</div>
      <div class="chips">${roomChips(o.t)}</div>
      <div class="row"><input class="txt" id="roomName" placeholder="名前（例：子ども部屋1）" value="${esc(o.name)}" maxlength="20">${stairsBtn}<button class="btn sm danger" data-a="del">消す</button></div>`;
  }
  if (sel.kind === 'open') {
    const spec = OPEN[o.k];
    const kinds = [...DOOR_KINDS, '|', ...WIN_KINDS].map((k) => k === '|' ? '<span style="flex:none;width:1px;background:var(--line);margin:4px 2px"></span>' : `<button class="chip" data-ok="${k}" aria-pressed="${o.k === k}">${OPEN[k].label}</button>`).join('');
    const turn = ['door', 'entry'].includes(o.k) ? '<button class="btn sm" data-a="swing">開く向き</button>' : '';
    return `<div class="selhead"><b>${spec.label}</b><span class="meta">${o.f}階 ・ 幅 ${cm(o.len)}cm</span>${close}</div>
      <div class="chips">${kinds}</div>
      <div class="row"><span class="stepper"><button class="ib" data-a="lenm" aria-label="幅をせまく">−</button><b>${o.len}マス（${cm(o.len)}cm）</b><button class="ib" data-a="lenp" aria-label="幅を広く">＋</button></span>
      <button class="ib" data-a="slideL" aria-label="${o.o === 'h' ? '左' : '上'}へずらす">${o.o === 'h' ? '◀' : '▲'}</button><button class="ib" data-a="slideR" aria-label="${o.o === 'h' ? '右' : '下'}へずらす">${o.o === 'h' ? '▶' : '▼'}</button>${turn}<button class="btn sm danger" data-a="del">消す</button></div>`;
  }
  if (sel.kind === 'fix') {
    const [w, d] = fixSize(o);
    return `<div class="selhead"><b>${FIX[o.t].label}</b><span class="meta">${w.toFixed(2)}m × ${d.toFixed(2)}m</span>${close}</div>
      <p class="hint">引っぱると動きます（約11cmずつ）。</p>
      <div class="row"><button class="btn sm" data-a="rot">90度まわす</button><button class="btn sm danger" data-a="del">消す</button></div>`;
  }
  const d = EXT[o.t];
  let meta = '';
  if (d.shape === 'rect') meta = `${mtxt(o.w)} × ${mtxt(o.h)}`;
  if (d.shape === 'line') meta = `長さ ${mtxt(Math.abs(o.x2 - o.x1) + Math.abs(o.y2 - o.y1))}`;
  const rot = o.t === 'gate' ? '<button class="btn sm" data-a="rot">90度まわす</button>' : '';
  return `<div class="selhead"><b>${d.label}</b><span class="meta">${meta}</span>${close}</div>
    <p class="hint">${d.shape === 'point' ? '引っぱると動きます。' : '引っぱると動き、角の丸を引っぱると大きさが変わります。'}</p>
    <div class="row">${rot}<button class="btn sm danger" data-a="del">消す</button></div>`;
}
function bindSel(tray, sel) {
  const o = sel.obj;
  const name = $('#roomName', tray);
  if (name) name.addEventListener('input', () => commit(() => { o.name = name.value.trim(); }, 'name:' + o.id, { keepTray: true }));
  tray.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const a = b.dataset.a;
    const listOf = { room: 'rooms', open: 'openings', fix: 'fixtures', ext: 'ext' }[sel.kind];
    if (a === 'close') { ui.sel = null; refresh(); return; }
    if (a === 'del') { commit((p) => { p[listOf] = p[listOf].filter((x) => x.id !== o.id); }); ui.sel = null; refresh(); return; }
    if (b.dataset.rt) { ui.roomType = b.dataset.rt; commit(() => { o.t = b.dataset.rt; }); return; }
    if (b.dataset.ok) { commit(() => { o.k = b.dataset.ok; }); return; }
    const { W, H } = dims(plan);
    const maxLen = o.o === 'h' ? W - o.x : H - o.y;
    if (a === 'lenp') { if (o.len < Math.min(4, maxLen)) commit(() => { o.len++; }); else toast(o.len >= 4 ? '幅は4マス（364cm）までです' : 'これ以上は広げられません'); return; }
    if (a === 'lenm') { if (o.len > 1) commit(() => { o.len--; }); return; }
    if (a === 'slideL') { if ((o.o === 'h' ? o.x : o.y) > 0) commit(() => { if (o.o === 'h') o.x--; else o.y--; }); return; }
    if (a === 'slideR') { if (o.len < maxLen) commit(() => { if (o.o === 'h') o.x++; else o.y++; }); return; }
    if (a === 'swing') { commit(() => { o.sw = ((o.sw || 0) + 1) % 4; }); return; }
    if (a === 'rot') {
      commit(() => {
        o.rot = ((o.rot || 0) + 1) % 4;
        if (sel.kind === 'fix') { const b2 = fixBox(o); o.x = clamp(o.x, 0, W - b2.w); o.y = clamp(o.y, 0, H - b2.h); }
      });
      return;
    }
    if (a === 'stairsCopy') {
      const to = o.f === 1 ? 2 : 1;
      if (plan.rooms.some((r) => r.f === to && r.t === 'stairs' && r.x === o.x && r.y === o.y && r.w === o.w && r.h === o.h)) { toast(`${to}階の同じ場所に、もう階段があります`); return; }
      commit((p) => p.rooms.push({ ...structuredClone(o), id: uid(), f: to }));
      toast(`${to}階の同じ場所に階段を置きました`);
    }
  };
}

function renderFloorSeg() {
  const el = $('#floorSeg');
  el.innerHTML = `<div class="seg"><button data-f="1" aria-pressed="${ui.floor === 1}">1階</button>${plan.floors === 2 ? `<button data-f="2" aria-pressed="${ui.floor === 2}">2階</button>` : '<button data-f="add">＋2階</button>'}</div>`;
}
$('#floorSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.f === 'add') { confirmBox('2階建てにしますか？', '2階建てにする', () => { commit((p) => { p.floors = 2; }); ui.floor = 2; ui.sel = null; if (ui.mode === 'ext') { ui.mode = 'room'; renderTools(); } refresh(); }); return; }
  ui.floor = Number(b.dataset.f); ui.sel = null;
  if (ui.floor === 2 && ui.mode === 'ext') { ui.mode = 'room'; renderTools(); }
  refresh();
});

function renderAreaBtn() {
  const ar = areas(plan);
  const per = plan.floors === 2 ? `<span class="sm">1階 ${fmt1(ar.floors[1].area)}㎡・2階 ${fmt1(ar.floors[2].area)}㎡</span>` : '';
  $('#areaBtn').innerHTML = `<span>延床 ${fmt1(ar.total)}㎡（${tsubo(ar.total)}坪）${per}</span>`;
}
$('#areaBtn').addEventListener('click', () => openAreaModal());
$('#fitBtn').addEventListener('click', () => { fitView(); drawCanvas(); });

function openAreaModal() {
  const ar = areas(plan);
  const floorTable = (f) => {
    const fa = ar.floors[f]; if (!fa) return '';
    const rows = fa.groups.map((g) => {
      const r = plan.rooms[g.main];
      return `<tr><td>${esc(r.name || ROOMS[r.t].label)}${r.t === 'balcony' ? '<span class="unit">（床面積に入れない）</span>' : ''}</td><td>${fmt1(g.area / JO)}帖（${fmt1(g.area)}㎡）</td></tr>`;
    }).join('');
    return `<h2>${f}階</h2><table class="rooms">${rows || '<tr><td>まだ部屋がありません</td><td></td></tr>'}<tr class="sum"><td>${f}階の床面積</td><td>${fmt1(fa.area)}㎡（${tsubo(fa.area)}坪）</td></tr></table>`;
  };
  const over = (v, lim) => (lim && v > lim ? ' class="over"' : '');
  modal(`<div class="mhead"><h2>広さ</h2><button class="btn sm" data-close>とじる</button></div>
    <dl class="facts"><dt>延床面積</dt><dd>${fmt1(ar.total)}㎡（${tsubo(ar.total)}坪）</dd></dl>
    ${floorTable(1)}${plan.floors === 2 ? floorTable(2) : ''}
    <p class="hint">1マス＝91cm×91cm（0.83㎡）、1帖＝1.62㎡、1坪＝3.31㎡で計算しています。バルコニーは床面積に入れていません。</p>`);
}

/* =========================================================
   3Dで見る
   ========================================================= */
const ROOF_ORDER = ['kiri', 'yose', 'kata', 'riku'];
let viewLoading = null;
async function open3d() {
  ui.look = true; ui.sel = null;
  $('#planPane').hidden = true; $('#lookPane').hidden = false;
  renderLookChrome(); renderLookBody();
  if (!view3d) {
    if (!viewLoading) viewLoading = import('./view3d.js');
    let mod;
    try { mod = await viewLoading; } catch (e) { toast('3Dの部品を読みこめませんでした'); console.error(e); return; }
    if (!view3d) view3d = new mod.View3D($('#stage3d'), {});
  }
  if (!ui.look) return;
  fit3d = true;
  renderLook();
  view3d.start();
}
function close3d() {
  ui.look = false;
  view3d?.stop();
  $('#lookPane').hidden = true; $('#planPane').hidden = false;
  resizeCanvas(); refresh();
}
function renderLookChrome() {
  const vis = [['all', 'ぜんぶ'], ['noroof', '屋根なし'], ...(plan.floors === 2 ? [['f1', '1階だけ']] : [])];
  if (plan.floors !== 2 && ui.vis === 'f1') ui.vis = 'noroof';
  $('#visSeg').innerHTML = vis.map(([k, l]) => `<button data-vis="${k}" aria-pressed="${ui.vis === k}">${l}</button>`).join('');
}
function renderLook(opts = {}) {
  if (!view3d) return;
  if (dirty3d) { view3d.build(plan, { simple: true }); dirty3d = false; }
  if (fit3d) { view3d.fit(plan); fit3d = false; }
  view3d.setVis(ui.vis);
  view3d.setSun({ site: { ...plan.site, north: 0 } }, 'equinox', 10);
  renderLookChrome();
  if (!opts.keepBody) renderLookBody();
}
function renderLookBody() {
  const L = plan.look;
  $('#lookBody').innerHTML = `<p class="lbl">屋根の形</p><div class="chips">${ROOF_ORDER.map((k) => `<button class="chip" data-roof="${k}" aria-pressed="${k === L.roof}">${ROOF_SHAPES[k]}</button>`).join('')}</div>
    <p class="lbl">外壁の色</p><div class="swatches">${WALL_COLORS.map(([n, c]) => `<button class="sw" style="background:${c}" data-wc="${c}" aria-pressed="${c.toLowerCase() === L.wallColor.toLowerCase()}" aria-label="${n}" title="${n}"></button>`).join('')}</div>
    <p class="hint">指で回す・つまんで近づく・2本指で動かせます。</p>`;
}
$('#go3d').addEventListener('click', () => {
  if (!plan.rooms.some((r) => r.f <= plan.floors)) { toast('まず部屋を描いてください'); return; }
  open3d();
});
$('#back2d').addEventListener('click', close3d);
$('#visSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-vis]'); if (!b) return;
  ui.vis = b.dataset.vis; renderLook({ keepBody: true });
});
$('#lookBody').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.roof) commit((p) => { p.look.roof = b.dataset.roof; });
  if (b.dataset.wc) commit((p) => { p.look.wallColor = b.dataset.wc; });
});

/* =========================================================
   画像にする
   ========================================================= */
function planImage() {
  const b = houseBounds(plan);
  const m = 1.5, s = 44, pad = 32;
  const x0 = b.x0 - m, x1 = b.x1 + m, y0 = b.y0 - m, y1 = b.y1 + m;
  const bw = (x1 - x0) * s, bh = (y1 - y0) * s;
  const fls = plan.floors === 2 ? [1, 2] : [1];
  const W = Math.max(bw + pad * 2, 820), headH = 110, blockHead = 56, gap = 28;
  const H = headH + fls.length * (blockHead + bh + gap) + 60;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, W, H);
  const ar = areas(plan);
  g.fillStyle = '#2b2a26'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.font = `700 34px ${FONT}`; g.fillText(plan.name, pad, 52);
  g.font = `500 20px ${FONT}`; g.fillStyle = '#5c5950';
  g.fillText(`延床 ${fmt1(ar.total)}㎡（${tsubo(ar.total)}坪）`, pad, 88);
  let y = headH;
  for (const f of fls) {
    g.fillStyle = '#2b2a26'; g.font = `700 24px ${FONT}`;
    g.fillText(`${f}階　${fmt1(ar.floors[f].area)}㎡（${tsubo(ar.floors[f].area)}坪）`, pad, y + 36);
    const top = y + blockHead, left = (W - bw) / 2;
    g.save(); g.beginPath(); g.rect(left, top, bw, bh); g.clip();
    drawPlan(g, plan, f, { s, ox: left - x0 * s, oy: top - y0 * s }, { ghost: true, plain: true, ext: false });
    g.restore();
    g.strokeStyle = '#d8d3c1'; g.lineWidth = 1; g.strokeRect(left, top, bw, bh);
    drawScale(g, left + 16, top + bh - 16, s);
    y = top + bh + gap;
  }
  g.fillStyle = '#8a857a'; g.font = `500 16px ${FONT}`;
  const d = new Date();
  g.fillText(`ゆめのおうち ・ 1マス＝91cm ・ ${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`, pad, H - 24);
  return c.toDataURL('image/png');
}
$('#shotBtn').addEventListener('click', () => {
  if (ui.look && view3d) showImage(view3d.snapshot(), `${plan.name}_3D.png`);
  else showImage(planImage(), `${plan.name}_間取り図.png`);
});
function showImage(url, filename) {
  modal(`<div class="mhead"><h2>画像ができました</h2><button class="btn sm" data-close>とじる</button></div>
    <img class="preview" src="${url}" alt="${esc(filename)}">
    <button class="btn primary wide" id="shareImg">共有・保存</button>
    <p class="hint">うまく保存できないときは、画像を長押しして「写真に保存」をえらんでください。</p>`, {
    onMount: (m) => $('#shareImg', m).addEventListener('click', () => shareFile(url, filename, 'image/png')),
  });
}
async function shareFile(url, filename, type) {
  try {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], filename, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: plan.name }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
}

/* =========================================================
   案の一覧・見本・メニュー・使い方・バックアップ
   ========================================================= */
function setCurrent(p) {
  plan = p; store.cur = p.id; save();
  hist.undo = []; hist.redo = []; hist.tag = null;
  ui.sel = null; ui.view = null; ui.floor = 1;
  dirty3d = true; fit3d = true;
  if (ui.look) close3d(); else { resizeCanvas(); refresh(); }
}
function openPlans() {
  const render = (m) => {
    const list = [...store.plans].sort((a, b) => b.updated - a.updated);
    $('#planList', m).innerHTML = list.map((p) => {
      const ar = areas(p);
      return `<div class="item ${p.id === plan.id ? 'cur' : ''}" data-id="${p.id}"><div class="t">${esc(p.name)}${p.id === plan.id ? '<span class="unit">（いまの案）</span>' : ''}</div>
        <div class="s">${p.floors === 2 ? '2階建て' : '平屋'} ・ 延床 ${fmt1(ar.total)}㎡（${tsubo(ar.total)}坪） ・ ${dateTxt(p.updated)}</div>
        <div class="row">${p.id !== plan.id ? '<button class="btn sm primary" data-a="open">ひらく</button>' : ''}<button class="btn sm" data-a="copy">コピー</button><button class="btn sm" data-a="rename">名前</button><button class="btn sm danger" data-a="del">消す</button></div></div>`;
    }).join('');
  };
  modal(`<div class="mhead"><h2>案の一覧</h2><button class="btn sm" data-close>とじる</button></div>
    <p class="hint">コピーして少しずつ変えると、A案・B案のように比べられます。</p>
    <div class="list" id="planList"></div>
    <button class="btn primary wide" id="newPlan">新しい案をつくる</button>`, {
    onMount: (m, close) => {
      render(m);
      $('#newPlan', m).addEventListener('click', () => { close(); openTemplates(); });
      $('#planList', m).addEventListener('click', (e) => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        const id = b.closest('[data-id]').dataset.id;
        const p = store.plans.find((x) => x.id === id);
        if (b.dataset.a === 'open') { close(); setCurrent(p); }
        if (b.dataset.a === 'copy') {
          const cp = structuredClone(p); cp.id = uid(); cp.name = copyName(p.name); cp.updated = Date.now();
          store.plans.push(cp); save(); render(m); toast(`「${cp.name}」をつくりました`);
        }
        if (b.dataset.a === 'rename') promptBox('案の名前', p.name, (v) => { p.name = v; p.updated = Date.now(); save(); render(m); refresh(); });
        if (b.dataset.a === 'del') confirmBox(`「${p.name}」を消しますか？`, '消す', () => {
          store.plans = store.plans.filter((x) => x.id !== id); save();
          if (!store.plans.length) { close(); const np = blankPlan(1); store.plans.push(np); setCurrent(np); return; }
          if (id === plan.id) setCurrent(store.plans[0]);
          render(m);
        }, true);
      });
    },
  });
}
function copyName(n) {
  const base = n.replace(/（コピー\d*）$/, '');
  let i = 1, name;
  do { name = `${base}（コピー${i > 1 ? i : ''}）`; i++; } while (store.plans.some((p) => p.name === name));
  return name;
}
function openTemplates() {
  modal(`<div class="mhead"><h2>新しい案</h2><button class="btn sm" data-close>とじる</button></div>
    <div class="tpl">${TEMPLATES.map((t) => `<button class="tplbtn" data-t="${t.key}"><canvas></canvas><b>${t.title}</b><span>${t.sub}</span></button>`).join('')}</div>`, {
    onMount: (m, close) => {
      $$('.tplbtn', m).forEach((b) => {
        const t = TEMPLATES.find((x) => x.key === b.dataset.t);
        const p = t.make();
        requestAnimationFrame(() => {
          const c = $('canvas', b), r = c.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
          c.width = r.width * d; c.height = r.height * d;
          const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
          const hb = p.rooms.length ? houseBounds(p) : { x0: 0, y0: 0, x1: 22, y1: 22 };
          const bw = hb.x1 - hb.x0 + 2, bh = hb.y1 - hb.y0 + 2;
          const s = Math.min(r.width / bw, r.height / bh);
          drawPlan(g, p, 1, { s, ox: (r.width - bw * s) / 2 - (hb.x0 - 1) * s, oy: (r.height - bh * s) / 2 - (hb.y0 - 1) * s }, { plain: true, ext: false });
        });
        b.addEventListener('click', () => {
          const np = t.make();
          if (store.plans.some((x) => x.name === np.name)) np.name = copyName(np.name);
          store.plans.push(np); close(); setCurrent(np);
        });
      });
    },
  });
}

/* ---------- はじまり ---------- */
$('#undoBtn').addEventListener('click', undo);
$('#redoBtn').addEventListener('click', redo);
$('#planBtn').addEventListener('click', openPlans);
// 前の版で作った案は、マス目を広げておく（土地の設定はなくしたので）
for (const p of store.plans) { p.site.w = Math.max(p.site.w, 20); p.site.d = Math.max(p.site.d, 20); }
renderTools();
if (!plan) { plan = blankPlan(1); store.plans.push(plan); }
setCurrent(plan);
document.fonts?.ready.then(() => drawCanvas());
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
if (new URLSearchParams(location.search).has('test')) { window.__view = () => ui.view; window.__dbg = { ui, plan: () => plan, walls, edgeAt: (gx, gy) => edgeAt({ gx, gy }) }; }
