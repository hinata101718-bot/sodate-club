/* ゆめのおうち：画面の操作（案の保存・もとに戻す・タブ・間取りを描く指の動き・土地・外観・画像） */
import {
  CELL, ROOMS, ROOM_ORDER, OPEN, DOOR_KINDS, WIN_KINDS, FIX, FIX_ORDER, EXT, EXT_ORDER,
  ROOF_SHAPES, WALL_MATS, WALL_COLORS, ROOF_COLORS, SASH_COLORS, DOOR_COLORS, TEMPLATES, uid, fixSize,
} from './data.js';
import { dims, walls, areas, warnings, houseBounds, fmt1, mtxt, cm, M2, JO, TSUBO, sideDir, dirName, sunPos } from './model.js';
import { drawPlan, drawCompass, drawScale, FONT } from './plan2d.js';

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
  tab: 'plan', floor: 1, mode: 'room', roomType: 'western', fixType: 'kitchenI', extType: 'parking',
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
  if (ui.tab === 'plan') {
    drawCanvas();
    if (!opts.keepTray) renderTray();
    renderFloorSeg();
    renderAreaBtn();
  } else if (ui.tab === 'site') {
    if (opts.full) renderSite(); else updateSiteDyn();
  } else if (ui.tab === 'look') {
    renderLook(opts);
  }
}

function setTab(tab) {
  ui.tab = tab;
  $$('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $('#sitePane').hidden = tab !== 'site';
  $('#planPane').hidden = tab !== 'plan';
  $('#lookPane').hidden = tab !== 'look';
  if (tab !== 'look') view3d?.stop();
  if (tab === 'site') renderSite();
  if (tab === 'plan') { resizeCanvas(); refresh(); }
  if (tab === 'look') openLook();
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
new ResizeObserver(() => { if (ui.tab === 'plan') resizeCanvas(); }).observe(stage);

function fitView() {
  if (!cw || !plan) return;
  const sw = plan.site.w / CELL, sd = plan.site.d / CELL;
  const top = 56, bottom = 56;
  const s = Math.max(6, Math.min((cw - 20) / (sw + 1), (ch - top - bottom) / (sd + 1)));
  ui.view = { s, ox: (cw - sw * s) / 2, oy: top + (ch - top - bottom - sd * s) / 2 };
}
function drawCanvas() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; paint(); }); }
function paint() {
  if (!plan || !cw || !ui.view) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  drawPlan(ctx, plan, ui.floor, ui.view, { sel: resolveSel(), draft: drag?.draft, accent: CANVAS_ACCENT });
  drawCompass(ctx, 32, ch - 40, 19, plan.site.north);
  drawScale(ctx, 64, ch - 20, ui.view.s);
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
  const want = (k) => !only || only === k;
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
function edgeAt(g) {
  const dv = Math.abs(g.gx - Math.round(g.gx)), dh = Math.abs(g.gy - Math.round(g.gy));
  const tol = Math.max(0.3, Math.min(0.45, 14 / ui.view.s));
  if (Math.min(dv, dh) > tol) return null;
  if (dh <= dv) return { o: 'h', x: Math.floor(g.gx), y: Math.round(g.gy) };
  return { o: 'v', x: Math.round(g.gx), y: Math.floor(g.gy) };
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
  ['ext', '外構', '<path d="M12 21v-5.5"/><path d="M12 3.5a5 5 0 0 0-5 5 3.8 3.8 0 0 0 .6 7h8.8a3.8 3.8 0 0 0 .6-7 5 5 0 0 0-5-5z"/>'],
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
    select: '部屋・設備・外構をタップしてえらび、そのまま引っぱると動きます。何もないところをなぞると画面が動き、2本指で拡大できます。',
    room: '部屋の種類をえらんで、マス目を指でなぞると部屋ができます（1マス＝91cm）。',
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
  const ar = areas(plan), ws = warnings(plan, ar);
  const per = plan.floors === 2 ? `1階 ${fmt1(ar.floors[1].area)}・2階 ${fmt1(ar.floors[2].area)}㎡` : `建ぺい率 ${fmt1(ar.bcr)}％`;
  $('#areaBtn').innerHTML = `<span>延床 ${fmt1(ar.total)}㎡（${tsubo(ar.total)}坪）<span class="sm">${per}</span></span>${ws.length ? `<span class="badge">気づき ${ws.length}</span>` : '<span class="badge ok">OK</span>'}`;
}
$('#areaBtn').addEventListener('click', () => openAreaModal());
$('#fitBtn').addEventListener('click', () => { fitView(); drawCanvas(); });

function openAreaModal() {
  const ar = areas(plan), ws = warnings(plan, ar);
  const floorTable = (f) => {
    const fa = ar.floors[f]; if (!fa) return '';
    const rows = fa.groups.map((g) => {
      const r = plan.rooms[g.main];
      return `<tr><td>${esc(r.name || ROOMS[r.t].label)}${r.t === 'balcony' ? '<span class="unit">（床面積に入れない）</span>' : ''}</td><td>${fmt1(g.area / JO)}帖（${fmt1(g.area)}㎡）</td></tr>`;
    }).join('');
    return `<h2>${f}階</h2><table class="rooms">${rows || '<tr><td>まだ部屋がありません</td><td></td></tr>'}<tr class="sum"><td>${f}階の床面積</td><td>${fmt1(fa.area)}㎡（${tsubo(fa.area)}坪）</td></tr></table>`;
  };
  const over = (v, lim) => (lim && v > lim ? ' class="over"' : '');
  modal(`<div class="mhead"><h2>広さと気づき</h2><button class="btn sm" data-close>とじる</button></div>
    <ul class="warns">${ws.length ? ws.map((w) => `<li>${esc(w.t)}</li>`).join('') : '<li class="ok">気になるところは見つかりませんでした</li>'}</ul>
    <dl class="facts">
      <dt>延床面積</dt><dd>${fmt1(ar.total)}㎡（${tsubo(ar.total)}坪）</dd>
      <dt>建築面積</dt><dd>${fmt1(ar.building)}㎡（${tsubo(ar.building)}坪）</dd>
      <dt>敷地面積</dt><dd>${fmt1(ar.site)}㎡（${tsubo(ar.site)}坪）</dd>
      <dt>建ぺい率</dt><dd${over(ar.bcr, plan.site.bcr)}>${fmt1(ar.bcr)}％（上限 ${plan.site.bcr || '—'}％）</dd>
      <dt>容積率</dt><dd${over(ar.far, plan.site.far)}>${fmt1(ar.far)}％（上限 ${plan.site.far || '—'}％）</dd>
    </dl>
    ${floorTable(1)}${plan.floors === 2 ? floorTable(2) : ''}
    <p class="hint">1マス＝91cm×91cm（0.83㎡）、1帖＝1.62㎡、1坪＝3.31㎡で計算しています。建築面積は、1階と2階の部屋を真上から見た広さです。バルコニー・ウッドデッキ・駐車場は入れていません。正確な面積は、設計する方に確かめてください。</p>`);
}

/* =========================================================
   土地
   ========================================================= */
const SIDES = [['up', '上'], ['right', '右'], ['down', '下'], ['left', '左']];
function renderSite() {
  const s = plan.site;
  const { W, H } = dims(plan);
  $('#siteForm').innerHTML = `
    <div class="card"><h2>土地の大きさ</h2>
      <div class="field"><label for="sw">間口（横）</label><span><input class="num" id="sw" type="number" inputmode="decimal" step="0.1" min="4" max="60" value="${s.w}"><span class="unit">m</span></span></div>
      <div class="field"><label for="sd">奥行き（縦）</label><span><input class="num" id="sd" type="number" inputmode="decimal" step="0.1" min="4" max="60" value="${s.d}"><span class="unit">m</span></span></div>
      <dl class="facts" id="siteFacts"></dl>
    </div>
    <div class="card"><h2>方角</h2>
      <div class="compassPick"><svg viewBox="-32 -32 64 64" id="cmp"></svg><div style="flex:1"><input type="range" id="north" min="0" max="359" step="1" value="${s.north}" aria-label="北の向き"><p class="hint" id="northTxt"></p></div></div>
      <div class="chips wrap">${SIDES.map(([k, l]) => `<button class="chip" data-north="${{ up: 0, right: 90, down: 180, left: 270 }[k]}">${l}が北</button>`).join('')}</div>
    </div>
    <div class="card"><h2>道路に面している側</h2>
      <div class="chips wrap" id="roads"></div>
      <p class="hint">角地のときは2つえらべます。3Dの家は、はじめ道路の側から見た向きで出ます。</p>
    </div>
    <div class="card"><h2>階数</h2>
      <div class="chips wrap"><button class="chip" data-fl="1" aria-pressed="${plan.floors === 1}">平屋</button><button class="chip" data-fl="2" aria-pressed="${plan.floors === 2}">2階建て</button></div>
    </div>
    <div class="card"><h2>建ぺい率・容積率</h2>
      <div class="field"><label for="bcr">建ぺい率の上限</label><span><input class="num" id="bcr" type="number" inputmode="numeric" min="0" max="100" step="10" value="${s.bcr}"><span class="unit">％</span></span></div>
      <div class="field"><label for="far">容積率の上限</label><span><input class="num" id="far" type="number" inputmode="numeric" min="0" max="1000" step="10" value="${s.far}"><span class="unit">％</span></span></div>
      <dl class="facts" id="ratioFacts"></dl>
      <p class="hint">上限は土地の用途地域で決まっています。不動産会社や役所の資料で確かめて入れてください。ここで出す数字は目安です。</p>
    </div>
    <div class="card"><h2>家の位置</h2>
      <p class="hint">家（部屋・ドア窓・設備）をまとめて1マス（91cm）ずつ動かします。外構は動きません。</p>
      <div class="pad"><button class="ib u" data-mv="0,-1" aria-label="上へ">▲</button><button class="ib l" data-mv="-1,0" aria-label="左へ">◀</button><button class="ib d" data-mv="0,1" aria-label="下へ">▼</button><button class="ib r" data-mv="1,0" aria-label="右へ">▶</button></div>
    </div>
    <div class="card"><h2>配置図</h2><canvas class="mini" id="mini"></canvas><p class="hint" id="gridTxt">マス目は ${W}×${H}マス（1マス＝91cm）。</p></div>`;
  const f = $('#siteForm');
  const num = (id, key, lo, hi) => $(id, f).addEventListener('change', (e) => {
    let v = parseFloat(e.target.value); if (!isFinite(v)) v = plan.site[key];
    v = clamp(Math.round(v * 10) / 10, lo, hi); e.target.value = v;
    commit((p) => { p.site[key] = v; }, null, {});
    ui.view = null;
  });
  num('#sw', 'w', 4, 60); num('#sd', 'd', 4, 60); num('#bcr', 'bcr', 0, 100); num('#far', 'far', 0, 1000);
  $('#north', f).addEventListener('input', (e) => commit((p) => { p.site.north = Number(e.target.value); }, 'north'));
  f.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.north) { commit((p) => { p.site.north = Number(b.dataset.north); }); $('#north', f).value = plan.site.north; }
    if (b.dataset.road) {
      const k = b.dataset.road;
      commit((p) => { const r = new Set(p.site.road); if (r.has(k)) r.delete(k); else r.add(k); p.site.road = SIDES.map(([s2]) => s2).filter((s2) => r.has(s2)); });
      fit3d = true;
    }
    if (b.dataset.fl) {
      const n = Number(b.dataset.fl);
      if (n === plan.floors) return;
      commit((p) => { p.floors = n; }, null, { full: true });
      if (n === 1 && plan.rooms.some((r) => r.f === 2)) toast('2階の部屋は残してあります。2階建てに戻すとまた出てきます');
      renderSite();
    }
    if (b.dataset.mv) moveHouse(...b.dataset.mv.split(',').map(Number));
  };
  updateSiteDyn();
}
function updateSiteDyn() {
  const f = $('#siteForm'); if (!f || !$('#siteFacts', f)) return;
  const s = plan.site, ar = areas(plan);
  const { W, H } = dims(plan);
  $('#siteFacts', f).innerHTML = `<dt>敷地面積</dt><dd>${fmt1(ar.site)}㎡（${tsubo(ar.site)}坪）</dd>`;
  const over = (v, lim) => (lim && v > lim ? ' class="over"' : '');
  $('#ratioFacts', f).innerHTML = `<dt>建築面積</dt><dd>${fmt1(ar.building)}㎡</dd><dt>建ぺい率</dt><dd${over(ar.bcr, s.bcr)}>${fmt1(ar.bcr)}％</dd><dt>延床面積</dt><dd>${fmt1(ar.total)}㎡</dd><dt>容積率</dt><dd${over(ar.far, s.far)}>${fmt1(ar.far)}％</dd>`;
  $('#cmp', f).innerHTML = `<circle r="30" fill="#fbfaf5" stroke="#cfc9b4"/><g transform="rotate(${s.north})"><path d="M0-24 7 2H-7z" fill="#b0574a"/><path d="M0 22 6 2H-6z" fill="#9a958a"/><text y="-12" text-anchor="middle" font-size="9" font-weight="700" fill="#fff">北</text></g>`;
  $('#northTxt', f).textContent = SIDES.map(([k, l]) => `${l}は${sideDir(plan, k)}`).join('、');
  $('#roads', f).innerHTML = SIDES.map(([k, l]) => `<button class="chip" data-road="${k}" aria-pressed="${s.road.includes(k)}">${l}（${sideDir(plan, k)}）</button>`).join('');
  $('#gridTxt', f).textContent = `マス目は ${W}×${H}マス（1マス＝91cm）。`;
  drawMini($('#mini', f));
}
function moveHouse(dx, dy) {
  const { W, H } = dims(plan);
  const ok = plan.rooms.every((r) => r.x + dx >= 0 && r.y + dy >= 0 && r.x + r.w + dx <= W && r.y + r.h + dy <= H);
  if (!ok) { toast('これ以上は土地からはみ出してしまいます'); return; }
  commit((p) => {
    for (const r of p.rooms) { r.x += dx; r.y += dy; }
    for (const o of p.openings) { o.x += dx; o.y += dy; }
    for (const fx of p.fixtures) { fx.x += dx; fx.y += dy; }
  }, 'mv');
}
function drawMini(c) {
  if (!c) return;
  const r = c.getBoundingClientRect(); if (!r.width) return;
  const d = Math.min(window.devicePixelRatio || 1, 2);
  c.width = r.width * d; c.height = r.height * d;
  const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
  const sw = plan.site.w / CELL, sd = plan.site.d / CELL, pad = 4.4 + 0.4;
  const s = Math.min(r.width / (sw + pad * 2), r.height / (sd + pad * 2));
  const view = { s, ox: (r.width - sw * s) / 2, oy: (r.height - sd * s) / 2 };
  drawPlan(g, plan, 1, view, {});
  if (plan.floors === 2) outline2F(g, view);
  drawCompass(g, r.width - 24, 26, 15, plan.site.north);
}
function outline2F(g, view) {
  const w2 = walls(plan, 2);
  g.save(); g.strokeStyle = 'rgba(176,87,74,.85)'; g.lineWidth = 2; g.setLineDash([5, 4]);
  g.beginPath();
  for (const w of w2.values()) {
    if (w.k !== 'ext' && w.k !== 'para') continue;
    const X = (x) => view.ox + x * view.s, Y = (y) => view.oy + y * view.s;
    if (w.o === 'h') { g.moveTo(X(w.x), Y(w.y)); g.lineTo(X(w.x + 1), Y(w.y)); } else { g.moveTo(X(w.x), Y(w.y)); g.lineTo(X(w.x), Y(w.y + 1)); }
  }
  g.stroke(); g.restore();
}

/* =========================================================
   外観（3D）
   ========================================================= */
const LOOK_TABS = [['roof', '屋根'], ['wall', '外壁'], ['win', '窓・玄関'], ['sun', '日当たり']];
const SEASONS = [['summer', '夏至（6月）'], ['equinox', '春分・秋分'], ['winter', '冬至（12月）']];
let viewLoading = null;
async function openLook() {
  renderLookChrome();
  if (!view3d) {
    if (!viewLoading) viewLoading = import('./view3d.js');
    let mod;
    try { mod = await viewLoading; } catch (e) { toast('3Dの部品を読みこめませんでした'); console.error(e); return; }
    if (view3d) return;
    view3d = new mod.View3D($('#stage3d'), {
      onWallTap: (key) => {
        commit((p) => { const s = new Set(p.look.accentWalls); if (s.has(key)) s.delete(key); else s.add(key); p.look.accentWalls = [...s]; });
      },
      onFrame: (ang) => { $('#compass3d svg').style.transform = `rotate(${ang}rad)`; },
    });
  }
  if (ui.tab !== 'look') return;
  renderLook({ full: true });
  view3d.start();
}
function renderLookChrome() {
  const vis = [['all', 'ぜんぶ'], ['noroof', '屋根なし'], ...(plan.floors === 2 ? [['f1', '1階だけ']] : [])];
  if (plan.floors !== 2 && ui.vis === 'f1') ui.vis = 'noroof';
  $('#visSeg').innerHTML = vis.map(([k, l]) => `<button data-vis="${k}" aria-pressed="${ui.vis === k}">${l}</button>`).join('');
  $('#lookTabs').innerHTML = LOOK_TABS.map(([k, l]) => `<button data-lt="${k}" aria-pressed="${ui.lookTab === k}">${l}</button>`).join('');
  $('#compass3d').innerHTML = '<svg viewBox="-20 -20 40 40"><path d="M0-13 5.5 3h-11z" fill="#b0574a"/><path d="M0 13 4.5 3h-9z" fill="#9a958a"/><text y="-2" text-anchor="middle" font-size="7" font-weight="700" fill="#fff">北</text></svg>';
}
function renderLook(opts = {}) {
  if (!view3d) return;
  if (dirty3d) { view3d.build(plan); dirty3d = false; }
  if (fit3d) { view3d.fit(plan); fit3d = false; }
  view3d.setVis(ui.vis);
  updateSun();
  view3d.pick = ui.lookTab === 'wall' && plan.look.accent === 'walls';
  $('#pickBanner').hidden = !view3d.pick;
  renderLookChrome();
  if (!opts.keepBody) renderLookBody();
}
function swatchesHTML(list, cur, attr) {
  return `<div class="swatches">${list.map(([n, c]) => `<button class="sw" style="background:${c}" data-${attr}="${c}" aria-pressed="${c.toLowerCase() === String(cur).toLowerCase()}" aria-label="${n}" title="${n}"></button>`).join('')}</div>`;
}
function renderLookBody() {
  const L = plan.look, b = $('#lookBody');
  const chip = (attr, k, label, cur) => `<button class="chip" data-${attr}="${k}" aria-pressed="${k === cur}">${label}</button>`;
  let h = '';
  if (ui.lookTab === 'roof') {
    h += `<p class="lbl">屋根の形</p><div class="chips">${Object.entries(ROOF_SHAPES).map(([k, l]) => chip('roof', k, l, L.roof)).join('')}</div>`;
    if (L.roof === 'kiri') h += `<p class="lbl">棟（てっぺん）の向き</p><div class="chips">${[['auto', 'おまかせ'], ['x', '横'], ['z', '縦']].map(([k, l]) => chip('ridge', k, l, L.ridge)).join('')}</div>`;
    if (L.roof === 'kata') h += `<p class="lbl">雨が流れる側</p><div class="chips">${SIDES.map(([k, l]) => chip('shed', k, `${l}（${sideDir(plan, k)}）`, L.shedDir)).join('')}</div>`;
    if (L.roof !== 'riku') {
      h += `<p class="lbl">勾配 <span id="pitchTxt">${L.pitch}寸</span></p><input type="range" id="pitch" min="1" max="8" step="0.5" value="${L.pitch}" aria-label="屋根の勾配">`;
      h += `<p class="lbl">軒の出</p><div class="chips">${[[0, 'なし'], [0.3, '30cm'], [0.45, '45cm'], [0.6, '60cm'], [0.9, '90cm']].map(([k, l]) => chip('eave', k, l, L.eave)).join('')}</div>`;
    }
    h += `<p class="lbl">屋根の色</p>${swatchesHTML(ROOF_COLORS, L.roofColor, 'rc')}`;
  } else if (ui.lookTab === 'wall') {
    h += `<p class="lbl">外壁の素材</p><div class="chips">${Object.entries(WALL_MATS).map(([k, l]) => chip('wm', k, l, L.wallMat)).join('')}</div>`;
    h += `<p class="lbl">外壁の色</p>${swatchesHTML(WALL_COLORS, L.wallColor, 'wc')}`;
    h += `<p class="lbl">アクセント（一部だけ別の素材に）</p><div class="chips">${[['none', 'なし'], ...(plan.floors === 2 ? [['2f', '2階だけ']] : []), ['walls', '壁をえらぶ']].map(([k, l]) => chip('acc', k, l, L.accent)).join('')}</div>`;
    if (L.accent !== 'none') {
      h += `<div class="chips">${Object.entries(WALL_MATS).map(([k, l]) => chip('am', k, l, L.accentMat)).join('')}</div>${swatchesHTML([...WALL_COLORS, ['木目', '#9a6a42']], L.accentColor, 'ac')}`;
      if (L.accent === 'walls') h += `<p class="hint">上の3Dで外壁をタップすると、その面（その階のひと続きの壁）がアクセントに切りかわります。いま ${L.accentWalls.length} 面。</p>`;
    }
  } else if (ui.lookTab === 'win') {
    h += `<p class="lbl">サッシ（窓枠）の色</p>${swatchesHTML(SASH_COLORS, L.sash, 'sash')}`;
    h += `<p class="lbl">玄関ドアの色</p>${swatchesHTML(DOOR_COLORS, L.door, 'door')}`;
    h += '<p class="hint">窓やドアの場所・大きさは「間取り」の「ドア・窓」で変えられます。</p>';
  } else {
    h += `<p class="lbl">季節</p><div class="chips">${SEASONS.map(([k, l]) => chip('season', k, l, ui.season)).join('')}</div>`;
    h += `<p class="lbl">時刻 <span id="hourTxt">${hourTxt(ui.hour)}</span></p><input type="range" id="hour" min="4" max="20" step="0.25" value="${ui.hour}" aria-label="時刻">`;
    h += '<p class="sunline" id="sunTxt"></p><p class="hint">北緯35度（東京・名古屋・大阪あたり）で計算しています。方角は「土地」で変えられます。</p>';
  }
  b.innerHTML = h;
  if (ui.lookTab === 'sun') updateSun();
  const pitch = $('#pitch', b);
  if (pitch) {
    pitch.addEventListener('input', () => { $('#pitchTxt').textContent = pitch.value + '寸'; });
    pitch.addEventListener('change', () => commit((p) => { p.look.pitch = Number(pitch.value); }, null, { keepBody: true }));
  }
  const hour = $('#hour', b);
  if (hour) hour.addEventListener('input', () => { ui.hour = Number(hour.value); $('#hourTxt').textContent = hourTxt(ui.hour); updateSun(); });
}
const hourTxt = (h) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
function updateSun() {
  if (!view3d) return;
  const { az, alt } = view3d.setSun(plan, ui.season, ui.hour);
  const el = $('#sunTxt');
  if (el) el.textContent = alt > 0 ? `太陽は ${dirName(az)}、高さ ${Math.round(alt)}°` : '日の出前か日の入り後です（夜の明るさで表示）';
}
$('#lookTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lt]'); if (!b) return;
  ui.lookTab = b.dataset.lt; renderLook();
});
$('#visSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-vis]'); if (!b) return;
  ui.vis = b.dataset.vis; renderLook({ keepBody: true });
});
$('#frontBtn').addEventListener('click', () => { view3d?.fit(plan); });
$('#lookBody').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  const set = (fn) => commit((p) => fn(p.look));
  if (d.roof) set((l) => { l.roof = d.roof; });
  else if (d.ridge) set((l) => { l.ridge = d.ridge; });
  else if (d.shed) set((l) => { l.shedDir = d.shed; });
  else if (d.eave) set((l) => { l.eave = Number(d.eave); });
  else if (d.rc) set((l) => { l.roofColor = d.rc; });
  else if (d.wm) set((l) => { l.wallMat = d.wm; });
  else if (d.wc) set((l) => { l.wallColor = d.wc; });
  else if (d.acc) set((l) => { l.accent = d.acc; });
  else if (d.am) set((l) => { l.accentMat = d.am; });
  else if (d.ac) set((l) => { l.accentColor = d.ac; });
  else if (d.sash) set((l) => { l.sash = d.sash; });
  else if (d.door) set((l) => { l.door = d.door; });
  else if (d.season) { ui.season = d.season; renderLookBody(); }
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
  g.fillText(`延床 ${fmt1(ar.total)}㎡（${tsubo(ar.total)}坪）　建築面積 ${fmt1(ar.building)}㎡　建ぺい率 ${fmt1(ar.bcr)}％　容積率 ${fmt1(ar.far)}％`, pad, 88);
  let y = headH;
  for (const f of fls) {
    g.fillStyle = '#2b2a26'; g.font = `700 24px ${FONT}`;
    g.fillText(`${f}階　${fmt1(ar.floors[f].area)}㎡（${tsubo(ar.floors[f].area)}坪）`, pad, y + 36);
    const top = y + blockHead, left = (W - bw) / 2;
    g.save(); g.beginPath(); g.rect(left, top, bw, bh); g.clip();
    drawPlan(g, plan, f, { s, ox: left - x0 * s, oy: top - y0 * s }, { ghost: true });
    g.restore();
    g.strokeStyle = '#d8d3c1'; g.lineWidth = 1; g.strokeRect(left, top, bw, bh);
    drawCompass(g, left + bw - 34, top + 38, 22, plan.site.north);
    drawScale(g, left + 16, top + bh - 16, s);
    y = top + bh + gap;
  }
  g.fillStyle = '#8a857a'; g.font = `500 16px ${FONT}`;
  const d = new Date();
  g.fillText(`ゆめのおうち ・ 1マス＝91cm ・ ${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`, pad, H - 24);
  return c.toDataURL('image/png');
}
function siteImage() {
  const sw = plan.site.w / CELL, sd = plan.site.d / CELL, pad = 4.8;
  const s = 40;
  const W = Math.max((sw + pad * 2) * s, 820), headH = 110;
  const H = headH + (sd + pad * 2) * s + 50;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, W, H);
  const ar = areas(plan);
  g.fillStyle = '#2b2a26'; g.font = `700 34px ${FONT}`; g.fillText(`${plan.name}　配置図`, 32, 52);
  g.font = `500 20px ${FONT}`; g.fillStyle = '#5c5950';
  g.fillText(`敷地 ${plan.site.w}m × ${plan.site.d}m（${fmt1(ar.site)}㎡・${tsubo(ar.site)}坪）　建ぺい率 ${fmt1(ar.bcr)}％　容積率 ${fmt1(ar.far)}％`, 32, 88);
  const view = { s, ox: (W - sw * s) / 2, oy: headH + pad * s };
  g.save(); g.beginPath(); g.rect(0, headH, W, H - headH - 50); g.clip();
  drawPlan(g, plan, 1, view, {});
  if (plan.floors === 2) outline2F(g, view);
  g.restore();
  drawCompass(g, W - 50, headH + 46, 26, plan.site.north);
  drawScale(g, 40, H - 70, s);
  g.fillStyle = '#8a857a'; g.font = `500 16px ${FONT}`;
  g.fillText(plan.floors === 2 ? 'ゆめのおうち ・ 赤い点線は2階の外壁' : 'ゆめのおうち', 32, H - 20);
  return c.toDataURL('image/png');
}
async function lookImage() {
  if (!view3d) {
    toast('3Dを用意しています…');
    const prev = ui.tab;
    setTab('look');
    await viewLoading;
    await new Promise((r) => setTimeout(r, 300));
    if (prev !== 'look') { /* そのまま外観の画面にとどまる */ }
  }
  renderLook({ keepBody: true });
  return view3d.snapshot();
}
function openShot() {
  modal(`<div class="mhead"><h2>画像にする</h2><button class="btn sm" data-close>とじる</button></div>
    <div class="list">
      <button class="btn wide" data-img="plan">間取り図（${plan.floors === 2 ? '1階・2階' : '1階'}）</button>
      <button class="btn wide" data-img="look">外観（いまの3Dの見え方）</button>
      <button class="btn wide" data-img="site">配置図（土地と外構）</button>
    </div>
    <p class="hint">画像は写真に保存したり、LINEなどで送ったりできます。</p>`, {
    onMount: (m, close) => m.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-img]'); if (!b) return;
      close();
      const kind = b.dataset.img;
      const url = kind === 'plan' ? planImage() : kind === 'site' ? siteImage() : await lookImage();
      showImage(url, `${plan.name}_${{ plan: '間取り図', site: '配置図', look: '外観' }[kind]}.png`);
    }),
  });
}
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
  if (ui.tab === 'plan') resizeCanvas();
  refresh({ full: true });
  if (ui.tab === 'look') openLook();
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
      $('#newPlan', m).addEventListener('click', () => { close(); openTemplates(false); });
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
          if (!store.plans.length) { close(); openTemplates(true); return; }
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
function openTemplates(first) {
  modal(`<div class="mhead"><h2>${first ? 'どこから始めますか？' : '新しい案'}</h2>${first ? '' : '<button class="btn sm" data-close>とじる</button>'}</div>
    <p class="hint">見本をもとに直していくか、白紙から描けます。あとから土地の大きさや向きも変えられます。</p>
    <div class="tpl">${TEMPLATES.map((t) => `<button class="tplbtn" data-t="${t.key}"><canvas></canvas><b>${t.title}</b><span>${t.sub}</span></button>`).join('')}</div>`, {
    closable: !first,
    onMount: (m, close) => {
      $$('.tplbtn', m).forEach((b) => {
        const t = TEMPLATES.find((x) => x.key === b.dataset.t);
        const p = t.make();
        requestAnimationFrame(() => {
          const c = $('canvas', b), r = c.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
          c.width = r.width * d; c.height = r.height * d;
          const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
          const sw = p.site.w / CELL, sd = p.site.d / CELL;
          const s = Math.min(r.width / (sw + 1), r.height / (sd + 1));
          drawPlan(g, p, 1, { s, ox: (r.width - sw * s) / 2, oy: (r.height - sd * s) / 2 }, {});
        });
        b.addEventListener('click', () => {
          const np = t.make();
          if (store.plans.some((x) => x.name === np.name)) np.name = copyName(np.name);
          store.plans.push(np); close(); setCurrent(np);
          if (!store.guided) { store.guided = true; save(); openGuide(); }
        });
      });
    },
  });
}
function openGuide() {
  modal(`<h2>ゆめのおうちの使い方</h2>
    <ol class="steps">
      <li><div><b>「土地」で土地を入れる</b><span>間口・奥行き（m）、北の向き、道路に面している側を入れます。建ぺい率・容積率の上限も入れておくと、こえたときに知らせます。</span></div></li>
      <li><div><b>「間取り」で部屋を描く</b><span>部屋の種類をえらんで、マス目を指でなぞります。1マスは91cm。部屋をタップすると、角の丸で大きさを、まん中を引っぱって場所を変えられます。2本指で拡大・移動できます。</span></div></li>
      <li><div><b>ドア・窓・設備・外構をつける</b><span>「ドア・窓」は壁をタップ。種類と幅をえらびます。「設備」「外構」はえらんでタップか、なぞって置きます。</span></div></li>
      <li><div><b>「外観」で家を回して見る</b><span>指で回す・つまんで近づく。屋根の形や外壁の素材・色をえらび、季節と時刻で日当たりも確かめられます。「屋根なし」で中ものぞけます。</span></div></li>
      <li><div><b>画像にして見せる</b><span>上のカメラのボタンで、間取り図・外観・配置図を画像にできます。打ち合わせのときに見せたり、家族に送ったりできます。</span></div></li>
    </ol>
    <p class="hint">案はこのiPhoneの中に保存されます。Safariの共有ボタンから「ホーム画面に追加」しておくと、アプリのように開けて、保存も消えにくくなります。ときどきメニューの「バックアップ」もおすすめです。</p>
    <button class="btn primary wide" data-close>はじめる</button>`);
}
function openMenu() {
  modal(`<div class="mhead"><h2>メニュー</h2><button class="btn sm" data-close>とじる</button></div>
    <div class="list">
      <button class="btn wide" data-m="plans">案の一覧</button>
      <button class="btn wide" data-m="rename">この案の名前を変える</button>
      <button class="btn wide" data-m="guide">使い方</button>
      <button class="btn wide" data-m="export">バックアップを書き出す</button>
      <button class="btn wide" data-m="import">バックアップを読みこむ</button>
    </div>
    <p class="hint">案はこのiPhoneの中だけに保存され、ネットには送りません。機種変更のときや念のために、バックアップのファイルを書き出しておけます。</p>
    <input type="file" id="importFile" accept=".json,application/json" hidden>`, {
    onMount: (m, close) => {
      m.addEventListener('click', (e) => {
        const b = e.target.closest('[data-m]'); if (!b) return;
        const k = b.dataset.m;
        if (k === 'plans') { close(); openPlans(); }
        if (k === 'rename') { close(); promptBox('案の名前', plan.name, (v) => { commit((p) => { p.name = v; }); }); }
        if (k === 'guide') { close(); openGuide(); }
        if (k === 'export') {
          const d = new Date();
          const name = `ゆめのおうち_バックアップ_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
          const url = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify({ app: 'yume-ouchi', v: 1, plans: store.plans }));
          shareFile(url, name, 'application/json');
        }
        if (k === 'import') $('#importFile', m).click();
      });
      $('#importFile', m).addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try {
          const data = JSON.parse(await file.text());
          const list = Array.isArray(data.plans) ? data.plans : [];
          let n = 0;
          for (const p of list) {
            if (!p || !p.site || !Array.isArray(p.rooms)) continue;
            const cp = structuredClone(p);
            if (store.plans.some((x) => x.id === cp.id)) { cp.id = uid(); cp.name = copyName(cp.name); }
            cp.openings ||= []; cp.fixtures ||= []; cp.ext ||= [];
            store.plans.push(cp); n++;
          }
          save(); close();
          toast(n ? `${n}つの案を読みこみました（「案の一覧」から開けます）` : '読みこめる案がありませんでした');
        } catch { toast('このファイルは読みこめませんでした'); }
      });
    },
  });
}

/* ---------- はじまり ---------- */
$$('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
$('#undoBtn').addEventListener('click', undo);
$('#redoBtn').addEventListener('click', redo);
$('#planBtn').addEventListener('click', openPlans);
$('#menuBtn').addEventListener('click', openMenu);
$('#shotBtn').addEventListener('click', openShot);
renderTools();
if (plan) { store.cur = plan.id; setTab('plan'); }
else { $('#planName').textContent = 'ようこそ'; setTab('plan'); openTemplates(true); }
document.fonts?.ready.then(() => drawCanvas());
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
if (new URLSearchParams(location.search).has('test')) window.__view = () => ui.view;
