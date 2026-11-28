/* ゆめのおうち：間取りから3Dの家を組み立てて見せる */
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls-0.160.0.js';
import { CELL, ROOMS, OPEN, FIX, EXT, fixParts, rotPt } from './data.js';
import { dims, owners, walls, openingUnits, isIndoor, rectangles, sunPos, floorsOf, houseBounds } from './model.js';

const C = CELL;
const BASE = 0.4, FH = 2.9, INT_H = 2.5, PARA_H = 1.1, SLAB = 0.22;
const T = { ext: 0.16, int: 0.1, para: 0.12 };
const floorY = (f) => BASE + (f - 1) * FH;

/* ---------- 模様（canvasで描く） ---------- */
const TEX = {};
function canvasTex(size, draw, tile) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.repeat.set(1 / tile, 1 / tile);
  return t;
}
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function tex(kind) {
  if (TEX[kind]) return TEX[kind];
  seed = 11;
  const S = 256;
  const make = {
    siding: () => canvasTex(S, (g) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 4; i++) { const y = (i * S) / 4; g.fillStyle = '#c9c9c9'; g.fillRect(0, y, S, 3); g.fillStyle = '#f0f0f0'; g.fillRect(0, y + 3, S, 6); }
    }, 1.0),
    plaster: () => canvasTex(S, (g) => {
      g.fillStyle = '#f6f6f6'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 2600; i++) { g.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.6)'; g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2); }
    }, 1.2),
    wood: () => canvasTex(S, (g) => {
      const n = 8;
      for (let i = 0; i < n; i++) {
        const v = 215 + Math.floor(rnd() * 40);
        g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, (i * S) / n, S, S / n);
        g.strokeStyle = 'rgba(0,0,0,.08)';
        for (let k = 0; k < 5; k++) { g.beginPath(); const y = (i * S) / n + rnd() * (S / n); g.moveTo(0, y); g.bezierCurveTo(S * 0.3, y + 3, S * 0.6, y - 3, S, y); g.stroke(); }
        g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, (i * S) / n, S, 1.5);
      }
    }, 1.2),
    galva: () => canvasTex(S, (g) => {
      const n = 8;
      for (let i = 0; i < n; i++) {
        const x = (i * S) / n, w = S / n;
        const gr = g.createLinearGradient(x, 0, x + w, 0);
        gr.addColorStop(0, '#d8d8d8'); gr.addColorStop(0.35, '#ffffff'); gr.addColorStop(0.5, '#bcbcbc'); gr.addColorStop(1, '#e6e6e6');
        g.fillStyle = gr; g.fillRect(x, 0, w, S);
      }
    }, 1.6),
    tile: () => canvasTex(S, (g) => {
      g.fillStyle = '#cfcfcf'; g.fillRect(0, 0, S, S);
      const rows = 8, h = S / rows, w = S / 2;
      for (let r = 0; r < rows; r++) for (let c = -1; c < 3; c++) {
        const x = c * w + (r % 2 ? w / 2 : 0);
        const v = 225 + Math.floor(rnd() * 30);
        g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x + 2, r * h + 2, w - 4, h - 4);
      }
    }, 0.5),
    roof: () => canvasTex(S, (g) => {
      g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, S, S);
      const rows = 5;
      for (let r = 0; r < rows; r++) {
        const y = (r * S) / rows;
        g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, y, S, 3);
        g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(0, y + 3, S, 2);
        for (let c = 0; c < 4; c++) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(((c + (r % 2) * 0.5) * S) / 4, y, 2, S / rows); }
      }
    }, 1.0),
    grass: () => canvasTex(S, (g) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 4000; i++) { g.fillStyle = rnd() > 0.5 ? 'rgba(0,40,0,.10)' : 'rgba(255,255,200,.25)'; g.fillRect(rnd() * S, rnd() * S, 1, 2 + rnd() * 3); }
    }, 1.5),
  };
  TEX[kind] = make[kind]();
  return TEX[kind];
}

const MATS = new Map();
function mat(color, kind = null, extra = {}) {
  const key = color + '|' + kind + '|' + JSON.stringify(extra);
  if (MATS.has(key)) return MATS.get(key);
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color), map: kind ? tex(kind) : null,
    roughness: kind === 'galva' ? 0.45 : 0.88, metalness: kind === 'galva' ? 0.35 : 0, side: THREE.DoubleSide, ...extra,
  });
  MATS.set(key, m);
  return m;
}
const GLASS = new THREE.MeshStandardMaterial({ color: 0x8fb0c4, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.55, side: THREE.DoubleSide });

/* ---------- 形づくりの道具 ---------- */
function worldUV(g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, p.getZ(i), p.getY(i));
    else if (ay >= az) uv.setXY(i, p.getX(i), p.getZ(i));
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
  uv.needsUpdate = true;
}
function boxG(x0, x1, y0, y1, z0, z1) {
  const g = new THREE.BoxGeometry(Math.max(0.001, x1 - x0), Math.max(0.001, y1 - y0), Math.max(0.001, z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  worldUV(g);
  return g;
}
/* 凸な多角形（点は [x,y,z]、uvは [u,v]） */
function polyG(pts, uvs) {
  const pos = [], uv = [];
  for (let i = 1; i < pts.length - 1; i++) for (const k of [0, i, i + 1]) { pos.push(...pts[k]); uv.push(...uvs[k]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
function add(group, g, m, ud) {
  const me = new THREE.Mesh(g, m);
  me.castShadow = m !== GLASS; me.receiveShadow = true;
  if (ud) me.userData = ud;
  group.add(me);
  return me;
}

/* ---------- 本体 ---------- */
export class View3D {
  constructor(host, { onWallTap, onFrame } = {}) {
    this.host = host; this.onWallTap = onWallTap; this.onFrame = onFrame;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.className = 'gl';
    host.prepend(r.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#d3e3ee');
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 600);
    const c = (this.controls = new OrbitControls(this.camera, r.domElement));
    c.enableDamping = true; c.dampingFactor = 0.12; c.maxPolarAngle = Math.PI * 0.49; c.minDistance = 2; c.maxDistance = 120;
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    c.screenSpacePanning = false;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xb9b29c, 0.9);
    this.sun = new THREE.DirectionalLight(0xfff6e8, 2.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.vis = 'all'; this.pick = false; this.running = false;
    this.center = new THREE.Vector3();
    new ResizeObserver(() => this.resize()).observe(host);
    // タップで壁をえらぶ
    let down = null;
    r.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; });
    r.domElement.addEventListener('pointerup', (e) => {
      if (!down || !this.pick) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved > 8 || Date.now() - down.t > 600) return;
      const rect = r.domElement.getBoundingClientRect();
      const v = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster(); ray.setFromCamera(v, this.camera);
      const hits = ray.intersectObjects(this.root.children, true).filter((h) => h.object.visible && visibleUp(h.object));
      const hit = hits[0];
      if (hit && hit.object.userData.accentKey) this.onWallTap?.(hit.object.userData.accentKey);
    });
    const visibleUp = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.render();
  }
  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.controls.update();
      this.render();
      requestAnimationFrame(loop);
    };
    this.resize();
    requestAnimationFrame(loop);
  }
  stop() { this.running = false; }
  render() {
    this.renderer.render(this.scene, this.camera);
    if (this.onFrame) {
      const d = new THREE.Vector3().subVectors(this.controls.target, this.camera.position);
      const n = this.northVec;
      if (n) {
        const rx = -d.z, rz = d.x;
        this.onFrame(Math.atan2(n.x * rx + n.z * rz, n.x * d.x + n.z * d.z));
      }
    }
  }
  snapshot() {
    // 画像にするときだけ細かく描く
    const r = this.renderer, pr = r.getPixelRatio();
    const w = this.host.clientWidth, h = this.host.clientHeight;
    r.setPixelRatio(Math.max(pr, 3)); r.setSize(w, h, false);
    this.controls.update(); this.render();
    const url = r.domElement.toDataURL('image/png');
    r.setPixelRatio(pr); r.setSize(w, h, false); this.render();
    return url;
  }

  setVis(mode) {
    this.vis = mode;
    const g = this.groups; if (!g) return;
    g.roof1.visible = g.roof2.visible = mode === 'all';
    g.f2.visible = mode !== 'f1';
    this.render();
  }

  fit(plan) {
    const b = houseBounds(plan);
    const cx = ((b.x0 + b.x1) / 2) * C, cz = ((b.y0 + b.y1) / 2) * C;
    const size = Math.max((b.x1 - b.x0) * C, (b.y1 - b.y0) * C, 6);
    this.controls.target.set(cx, plan.floors === 2 ? 3 : 1.8, cz);
    const side = (plan.site.road || [])[0] || 'down';
    const dir = { down: [0.45, 1], up: [-0.45, -1], right: [1, -0.45], left: [-1, 0.45] }[side];
    const len = Math.hypot(dir[0], dir[1]);
    const dist = size * 1.9 + 6;
    this.camera.position.set(cx + (dir[0] / len) * dist * 0.85, dist * 0.55, cz + (dir[1] / len) * dist * 0.85);
    this.controls.update();
  }

  setSun(plan, season, hour) {
    const { az, alt } = sunPos(season, hour);
    const th = (plan.site.north * Math.PI) / 180;
    const n = { x: Math.sin(th), z: -Math.cos(th) }, e = { x: Math.cos(th), z: Math.sin(th) };
    this.northVec = n;
    const a = (az * Math.PI) / 180, h = (Math.max(alt, 2) * Math.PI) / 180;
    const hx = n.x * Math.cos(a) + e.x * Math.sin(a), hz = n.z * Math.cos(a) + e.z * Math.sin(a);
    const dir = new THREE.Vector3(hx * Math.cos(h), Math.sin(h), hz * Math.cos(h));
    const sw = plan.site.w, sd = plan.site.d;
    const cen = new THREE.Vector3(sw / 2, 0, sd / 2);
    this.sun.position.copy(cen).addScaledVector(dir, 80);
    this.sun.target.position.copy(cen);
    const R = Math.max(sw, sd) * 0.75 + 10;
    const sc = this.sun.shadow.camera;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 200; sc.updateProjectionMatrix();
    const day = alt > 0;
    const k = day ? Math.min(1, alt / 12) : 0;
    this.sun.intensity = 2.1 * k;
    this.sun.color.set(alt < 12 ? '#ffd9a8' : '#fff6e8');
    this.hemi.intensity = day ? 0.55 + 0.4 * k : 0.3;
    this.scene.background.set(day ? (alt < 10 ? '#e8d3bd' : '#d3e3ee') : '#2a3242');
    this.render();
    return { az, alt };
  }

  build(plan, opts = {}) {
    this.root.traverse((o) => o.geometry?.dispose());
    this.root.clear();
    const G = (this.groups = { ground: new THREE.Group(), f1: new THREE.Group(), f2: new THREE.Group(), roof1: new THREE.Group(), roof2: new THREE.Group(), ext: new THREE.Group() });
    Object.values(G).forEach((g) => this.root.add(g));
    const look = plan.look;
    const { W, H } = dims(plan);
    const fl = floorsOf(plan);
    const wallM = mat(look.wallColor, look.wallMat);
    const accM = mat(look.accentColor, look.accentMat);
    const intM = mat('#f3f0e8');
    const accentOf = (f, key) => (look.accent === '2f' && f === 2) || (look.accent === 'walls' && look.accentWalls.includes(key));

    // 地面・土地・道路
    const sw = plan.site.w, sd = plan.site.d;
    const gnd = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat('#b7c697', 'grass'));
    gnd.rotation.x = -Math.PI / 2; gnd.position.set(sw / 2, -0.01, sd / 2); gnd.receiveShadow = true; G.ground.add(gnd);
    if (!opts.simple) add(G.ground, boxG(0, sw, -0.01, 0.01, 0, sd), mat('#c4c8a6', 'grass'));
    for (const side of opts.simple ? [] : plan.site.road || []) {
      const rw = 4;
      const r = { down: [-rw, sw + rw, sd, sd + rw], up: [-rw, sw + rw, -rw, 0], left: [-rw, 0, -rw, sd + rw], right: [sw, sw + rw, -rw, sd + rw] }[side];
      if (r) add(G.ground, boxG(r[0], r[1], -0.01, 0.012, r[2], r[3]), mat('#8e9092'));
    }

    // 階ごと
    const own = {}, mask = {};
    for (const f of fl) {
      own[f] = owners(plan, f);
      mask[f] = { any: new Uint8Array(W * H), indoor: new Uint8Array(W * H), slab: new Uint8Array(W * H) };
      own[f].g.forEach((ri, i) => {
        if (ri < 0) return;
        const t = plan.rooms[ri].t;
        mask[f].any[i] = 1;
        if (isIndoor(t)) mask[f].indoor[i] = 1;
        if (t !== 'stairs') mask[f].slab[i] = 1;
      });
    }
    for (const f of fl) {
      const grp = f === 1 ? G.f1 : G.f2;
      const y0 = floorY(f);
      const o = own[f];
      // 床
      plan.rooms.forEach((r, idx) => {
        if (r.f !== f) return;
        if (f === 2 && r.t === 'stairs') return;
        const fm = floorMat(r.t);
        add(grp, boxG(r.x * C, (r.x + r.w) * C, y0, y0 + 0.012 + idx * 0.0006, r.y * C, (r.y + r.h) * C), fm);
        if (r.t === 'stairs' && f === 1 && plan.floors === 2) stairs(grp, r, y0);
      });
      // 基礎（1階）・床の板（2階）
      for (const rc of rectangles(f === 1 ? mask[1].any : mask[2].slab, W, H)) {
        const e = T.ext / 2;
        if (f === 1) add(grp, boxG(rc.x * C - e, (rc.x + rc.w) * C + e, 0, BASE, rc.y * C - e, (rc.y + rc.h) * C + e), mat('#b8b5ad'));
        else add(grp, boxG(rc.x * C - e, (rc.x + rc.w) * C + e, y0 - SLAB, y0, rc.y * C - e, (rc.y + rc.h) * C + e), mat('#d9d4c8'));
      }
      // 壁とドア・窓
      const wl = walls(plan, f, o);
      const units = openingUnits(plan, f);
      const get = (o2, line, i) => {
        const key = o2 === 'h' ? `h${i},${line}` : `v${line},${i}`;
        const w = wl.get(key); if (!w) return null;
        let op = units.get(key) || null;
        if (w.k === 'para') op = null;
        return { k: w.k, op };
      };
      const lineRuns = (o2, line, count) => {
        let i = 0;
        while (i < count) {
          const u = get(o2, line, i);
          if (!u) { i++; continue; }
          let j = i + 1;
          while (j < count) { const v = get(o2, line, j); if (!v || v.k !== u.k || (v.op?.id || null) !== (u.op?.id || null)) break; j++; }
          this.wallRun(grp, f, o2, line, i, j, u, get(o2, line, i - 1), get(o2, line, j), { wallM, accM, intM, accentOf, look });
          i = j;
        }
      };
      for (let y = 0; y <= H; y++) lineRuns('h', y, W);
      for (let x = 0; x <= W; x++) lineRuns('v', x, H);
      // 設備
      for (const fx of plan.fixtures) {
        if (fx.f !== f) continue;
        const d = FIX[fx.t];
        for (const p of fixParts(fx.t)) {
          const [ua, va] = rotPt(p.x, p.y, d.w, d.d, fx.rot), [ub, vb] = rotPt(p.x + p.w, p.y + p.d, d.w, d.d, fx.rot);
          const x0 = fx.x * C + Math.min(ua, ub), x1 = fx.x * C + Math.max(ua, ub), z0 = fx.y * C + Math.min(va, vb), z1 = fx.y * C + Math.max(va, vb);
          add(grp, boxG(x0, x1, y0 + 0.012, y0 + 0.012 + p.h, z0, z1), mat(p.c));
        }
      }
    }

    // 屋根
    const pitch = look.pitch / 10;
    if (plan.floors === 2) {
      for (const rc of roofRects(mask[2].indoor, mask[2].any, W, H)) this.roof(G.roof2, rc, floorY(2) + FH, look.roof, pitch, look, null);
      const m1 = new Uint8Array(W * H);
      mask[1].indoor.forEach((v, i) => { if (v && !mask[2].any[i]) m1[i] = 1; });
      for (const rc of rectangles(m1, W, H)) {
        if (look.roof === 'riku') { this.roof(G.roof1, rc, floorY(2), 'riku', pitch, look); continue; }
        // 2階にくっつく側を高くした片流れ（下屋）
        const touch = { up: 0, down: 0, left: 0, right: 0 };
        const m2 = mask[2].any;
        const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : m2[y * W + x]);
        for (let x = rc.x; x < rc.x + rc.w; x++) { touch.up += at(x, rc.y - 1); touch.down += at(x, rc.y + rc.h); }
        for (let y = rc.y; y < rc.y + rc.h; y++) { touch.left += at(rc.x - 1, y); touch.right += at(rc.x + rc.w, y); }
        const best = Object.entries(touch).sort((a, b) => b[1] - a[1])[0];
        if (best[1] > 0) {
          const low = { up: 'down', down: 'up', left: 'right', right: 'left' }[best[0]];
          this.roof(G.roof1, rc, floorY(2), 'kata', Math.min(pitch, 0.3), look, { low, abut: true });
        } else this.roof(G.roof1, rc, floorY(2), look.roof, pitch, look);
      }
      if (look.roof === 'riku') { this.parapets(G.roof2, mask[2].indoor, W, H, floorY(2) + FH, look); this.parapets(G.roof1, m1, W, H, floorY(2), look); }
    } else {
      const m1 = mask[1].indoor;
      for (const rc of roofRects(m1, mask[1].any, W, H)) this.roof(G.roof1, rc, floorY(1) + FH, look.roof, pitch, look);
      if (look.roof === 'riku') this.parapets(G.roof1, m1, W, H, floorY(1) + FH, look);
    }

    // 外構
    if (!opts.simple) for (const e of plan.ext) this.extItem(G.ext, e);

    this.setVis(this.vis);
  }

  wallRun(grp, f, o, line, i, j, u, prev, next, M) {
    const y0 = floorY(f);
    const k = u.k, t = T[k];
    const hgt = k === 'ext' ? FH : k === 'int' ? INT_H : PARA_H;
    const key = `${f}|${o}|${line}`;
    const wm = k === 'int' ? M.intM : M.accentOf(f, key) ? M.accM : M.wallM;
    const ud = k === 'int' ? null : { accentKey: key };
    const L = line * C;
    // 線に沿った a0..a1 と、厚み方向 b0..b1 で箱を作る
    const box = (a0, a1, yy0, yy1, b0 = L - t / 2, b1 = L + t / 2, m = wm, data = ud) => {
      const g = o === 'h' ? boxG(a0, a1, yy0, yy1, b0, b1) : boxG(b0, b1, yy0, yy1, a0, a1);
      return add(grp, g, m, data);
    };
    let a0 = i * C, a1 = j * C;
    if (!u.op) {
      if (!prev || prev.k !== k) a0 -= t / 2;
      if (!next || next.k !== k) a1 += t / 2;
      box(a0, a1, y0, y0 + hgt);
      return;
    }
    const kind = u.op.k, spec = OPEN[kind];
    if (kind === 'open') return;
    const top = Math.min(spec.top, hgt - 0.1), sill = spec.sill;
    if (sill > 0) box(a0, a1, y0, y0 + sill);
    box(a0, a1, y0 + top, y0 + hgt);
    const sashM = mat(M.look.sash);
    const glassLike = spec.g === 'win' || (kind === 'sliding' && k === 'ext');
    if (glassLike) {
      const fw = 0.05, fd = 0.07;
      box(a0, a1, y0 + sill + fw * 0.3, y0 + top - fw * 0.3, L - 0.01, L + 0.01, GLASS, null);
      box(a0, a1, y0 + top - fw, y0 + top, L - fd / 2, L + fd / 2, sashM, null);
      box(a0, a1, y0 + sill, y0 + sill + fw, L - fd / 2, L + fd / 2, sashM, null);
      box(a0, a0 + fw, y0 + sill, y0 + top, L - fd / 2, L + fd / 2, sashM, null);
      box(a1 - fw, a1, y0 + sill, y0 + top, L - fd / 2, L + fd / 2, sashM, null);
      const n = Math.max(2, Math.round((a1 - a0) / 0.9));
      for (let s = 1; s < n; s++) { const m = a0 + ((a1 - a0) * s) / n; box(m - fw / 2, m + fw / 2, y0 + sill, y0 + top, L - fd / 2, L + fd / 2, sashM, null); }
    } else if (k === 'ext' && (kind === 'entry' || kind === 'door')) {
      const dm = mat(M.look.door, M.look.door === '#9a6a42' ? 'wood' : null);
      box(a0 + 0.03, a1 - 0.03, y0, y0 + top - 0.02, L - 0.03, L + 0.03, dm, null);
      const hx = (u.op.sw & 2) ? a0 + 0.12 : a1 - 0.12;
      box(hx - 0.02, hx + 0.02, y0 + 0.9, y0 + 1.25, L - 0.07, L + 0.07, mat('#c9c2b4'), null);
      box(a0, a1, y0 + top - 0.04, y0 + top, L - t / 2, L + t / 2, sashM, null);
    }
  }

  roof(grp, rc, yb, type, k, look, opt) {
    const e0 = T.ext / 2;
    const x0 = rc.x * C - e0, x1 = (rc.x + rc.w) * C + e0, z0 = rc.y * C - e0, z1 = (rc.y + rc.h) * C + e0;
    const rm = mat(look.roofColor, 'roof');
    const wallM = look.accent === '2f' && yb > floorY(2) ? mat(look.accentColor, look.accentMat) : mat(look.wallColor, look.wallMat);
    const fascia = mat(darken(look.roofColor));
    const e = look.eave;
    const sl = Math.sqrt(1 + k * k);
    if (type === 'riku') {
      add(grp, boxG(x0 - 0.05, x1 + 0.05, yb, yb + 0.14, z0 - 0.05, z1 + 0.05), mat('#9c9a94'));
      return;
    }
    const wx = x1 - x0, wz = z1 - z0;
    let alongX = wx >= wz;
    if (type === 'kiri' && look.ridge === 'x') alongX = true;
    if (type === 'kiri' && look.ridge === 'z') alongX = false;
    // a＝棟の向き、b＝横切る向き
    const [a0, a1, b0, b1] = alongX ? [x0, x1, z0, z1] : [z0, z1, x0, x1];
    const P = (a, y, b) => (alongX ? [a, y, b] : [b, y, a]);
    const A0 = a0 - e, A1 = a1 + e, B0 = b0 - e, B1 = b1 + e;
    if (type === 'kiri' || type === 'yose') {
      const bm = (b0 + b1) / 2, S = (b1 - b0) / 2;
      const yr = yb + S * k, ye = yb - e * k;
      const span = (b) => Math.abs(b - (b < bm ? B0 : B1)) * sl;
      if (type === 'kiri') {
        for (const Be of [B0, B1]) {
          add(grp, polyG([P(A0, ye, Be), P(A1, ye, Be), P(A1, yr, bm), P(A0, yr, bm)], [[A0, 0], [A1, 0], [A1, span(bm)], [A0, span(bm)]]), rm);
          add(grp, boxG(...boxAB(alongX, A0, A1, ye - 0.14, ye + 0.02, Be - 0.02, Be + 0.02)), fascia);
        }
        for (const a of [a0, a1]) add(grp, polyG([P(a, yb, b0), P(a, yb, b1), P(a, yr, bm)], [[b0, yb], [b1, yb], [bm, yr]]), wallM);
        // 破風（妻側の縁）
        for (const a of [A0, A1]) for (const Be of [B0, B1]) {
          add(grp, polyG([P(a, ye, Be), P(a, yr, bm), P(a, yr - 0.16, bm), P(a, ye - 0.16, Be)], [[0, 0], [1, 0], [1, 1], [0, 1]]), fascia);
        }
        add(grp, boxG(...boxAB(alongX, A0, A1, yr - 0.02, yr + 0.06, bm - 0.08, bm + 0.08)), fascia);
      } else {
        const h = Math.min(S, (a1 - a0) / 2);
        const R0 = P(a0 + h, yr, bm), R1 = P(a1 - h, yr, bm);
        for (const Be of [B0, B1]) {
          add(grp, polyG([P(A0, ye, Be), P(A1, ye, Be), R1, R0], [[A0, 0], [A1, 0], [a1 - h, span(bm)], [a0 + h, span(bm)]]), rm);
          add(grp, boxG(...boxAB(alongX, A0, A1, ye - 0.14, ye + 0.02, Be - 0.02, Be + 0.02)), fascia);
        }
        for (const [Ae, R] of [[A0, R0], [A1, R1]]) {
          const ra = Ae === A0 ? a0 + h : a1 - h;
          add(grp, polyG([P(Ae, ye, B0), P(Ae, ye, B1), R], [[B0, 0], [B1, 0], [bm, Math.abs(ra - Ae) * sl]]), rm);
          add(grp, boxG(...boxAB(!alongX, B0, B1, ye - 0.14, ye + 0.02, Ae - 0.02, Ae + 0.02)), fascia);
        }
        if (a1 - a0 > 2 * h + 0.01) add(grp, boxG(...boxAB(alongX, a0 + h, a1 - h, yr - 0.02, yr + 0.06, bm - 0.08, bm + 0.08)), fascia);
      }
      return;
    }
    // 片流れ：low の側へ流れる
    const low = opt?.low || look.shedDir || 'down';
    const slopeZ = low === 'up' || low === 'down';
    // s＝低い壁からの距離。u＝横の向き
    const [s0w, s1w] = slopeZ ? [z0, z1] : [x0, x1];
    const [u0, u1] = slopeZ ? [x0, x1] : [z0, z1];
    const lowAtMin = low === 'up' || low === 'left';
    const Sp = s1w - s0w;
    const W2 = (s, y, u) => {
      const c = lowAtMin ? s0w + s : s1w - s;
      return slopeZ ? [u, y, c] : [c, y, u];
    };
    const eh = opt?.abut ? 0 : e;
    const ylo = yb - e * k, yhi = yb + Sp * k + eh * k;
    const U0 = u0 - e, U1 = u1 + e;
    add(grp, polyG([W2(-e, ylo, U0), W2(-e, ylo, U1), W2(Sp + eh, yhi, U1), W2(Sp + eh, yhi, U0)], [[U0, 0], [U1, 0], [U1, (Sp + e + eh) * sl], [U0, (Sp + e + eh) * sl]]), rm);
    for (const u of [u0, u1]) add(grp, polyG([W2(0, yb, u), W2(Sp, yb, u), W2(Sp, yb + Sp * k, u)], [[0, yb], [Sp, yb], [Sp, yb + Sp * k]]), wallM);
    // 高い側の壁
    const hiC = lowAtMin ? s1w : s0w;
    const tt = T.ext;
    if (slopeZ) add(grp, boxG(u0, u1, yb, yb + Sp * k, hiC - tt / 2, hiC + tt / 2), wallM);
    else add(grp, boxG(hiC - tt / 2, hiC + tt / 2, yb, yb + Sp * k, u0, u1), wallM);
    // 鼻隠し
    const loC = lowAtMin ? s0w - e : s1w + e;
    if (slopeZ) add(grp, boxG(U0, U1, ylo - 0.14, ylo + 0.02, loC - 0.02, loC + 0.02), fascia);
    else add(grp, boxG(loC - 0.02, loC + 0.02, ylo - 0.14, ylo + 0.02, U0, U1), fascia);
    if (!opt?.abut) {
      const hC = lowAtMin ? s1w + eh : s0w - eh;
      if (slopeZ) add(grp, boxG(U0, U1, yhi - 0.14, yhi + 0.02, hC - 0.02, hC + 0.02), fascia);
      else add(grp, boxG(hC - 0.02, hC + 0.02, yhi - 0.14, yhi + 0.02, U0, U1), fascia);
    }
  }

  parapets(grp, m, W, H, yb, look) {
    const wm = mat(look.wallColor, look.wallMat);
    const t = T.ext;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : m[y * W + x]);
    for (let y = 0; y <= H; y++) {
      let x = 0;
      while (x < W) {
        const b = at(x, y - 1) !== at(x, y);
        if (!b) { x++; continue; }
        let j = x; while (j < W && at(j, y - 1) !== at(j, y)) j++;
        add(grp, boxG(x * C - t / 2, j * C + t / 2, yb, yb + 0.42, y * C - t / 2, y * C + t / 2), wm);
        x = j;
      }
    }
    for (let x = 0; x <= W; x++) {
      let y = 0;
      while (y < H) {
        const b = at(x - 1, y) !== at(x, y);
        if (!b) { y++; continue; }
        let j = y; while (j < H && at(x - 1, j) !== at(x, j)) j++;
        add(grp, boxG(x * C - t / 2, x * C + t / 2, yb, yb + 0.42, y * C - t / 2, j * C + t / 2), wm);
        y = j;
      }
    }
  }

  extItem(grp, e) {
    const d = EXT[e.t];
    if (d.shape === 'rect') {
      const x0 = e.x * C, x1 = (e.x + e.w) * C, z0 = e.y * C, z1 = (e.y + e.h) * C;
      if (e.t === 'parking') {
        add(grp, boxG(x0, x1, 0, 0.03, z0, z1), mat('#c9c7c1'));
        const vert = z1 - z0 >= x1 - x0;
        const aw = vert ? x1 - x0 : z1 - z0, al = vert ? z1 - z0 : x1 - x0;
        const n = Math.max(1, Math.floor(aw / 2.35));
        if (al >= 4.4 && aw >= 1.8) for (let i = 0; i < n; i++) {
          const c = (vert ? x0 : z0) + (aw * (i + 0.5)) / n;
          car(grp, vert ? c : (x0 + x1) / 2, vert ? (z0 + z1) / 2 : c, vert, ['#8ea2b5', '#b9473f', '#e8e8e6'][i % 3]);
        }
      } else if (e.t === 'deck') add(grp, boxG(x0, x1, 0, 0.38, z0, z1), mat('#b98a5e', 'wood'));
      else if (e.t === 'terrace') add(grp, boxG(x0, x1, 0, 0.14, z0, z1), mat('#ddd5c8', 'tile'));
      else if (e.t === 'lawn') add(grp, boxG(x0, x1, 0, 0.025, z0, z1), mat('#7fa75b', 'grass'));
      else if (e.t === 'approach') add(grp, boxG(x0, x1, 0, 0.04, z0, z1), mat('#d9d3c7', 'tile'));
      else if (e.t === 'flower') {
        add(grp, boxG(x0, x1, 0, 0.28, z0, z1), mat('#a8735a', 'tile'));
        add(grp, boxG(x0 + 0.08, x1 - 0.08, 0.28, 0.3, z0 + 0.08, z1 - 0.08), mat('#6b5140'));
        const cs = ['#d9738a', '#e8b84a', '#9a7ac8', '#f6f6f6'];
        seed = 31;
        const n = Math.floor((x1 - x0) * (z1 - z0) * 10);
        const geo = new THREE.SphereGeometry(0.07, 8, 6);
        for (let i = 0; i < n; i++) {
          const m = new THREE.Mesh(geo, mat(cs[i % 4]));
          m.position.set(x0 + 0.15 + rnd() * (x1 - x0 - 0.3), 0.36 + rnd() * 0.1, z0 + 0.15 + rnd() * (z1 - z0 - 0.3));
          grp.add(m);
        }
      }
    } else if (d.shape === 'line') {
      const ax = e.x1 * C, az = e.y1 * C, bx = e.x2 * C, bz = e.y2 * C;
      const L = Math.hypot(bx - ax, bz - az); if (L < 0.1) return;
      const g = new THREE.Group();
      const wm = mat('#5d4c3e', 'wood');
      for (let k = 0; k < 6; k++) add(g, boxG(0, L, 0.2 + k * 0.17, 0.32 + k * 0.17, -0.015, 0.015), wm);
      const n = Math.max(1, Math.round(L / 1.8));
      for (let k = 0; k <= n; k++) { const p = (L * k) / n; add(g, boxG(p - 0.04, p + 0.04, 0, 1.25, -0.04, 0.04), mat('#3e3a36')); }
      g.position.set(ax, 0, az); g.rotation.y = -Math.atan2(bz - az, bx - ax);
      grp.add(g);
    } else if (e.t === 'tree') {
      const g = new THREE.Group();
      add(g, new THREE.CylinderGeometry(0.07, 0.1, 1.6, 8).translate(0, 0.8, 0), mat('#6b5442'));
      const fm = new THREE.MeshStandardMaterial({ color: 0x6d9a4f, roughness: 1, flatShading: true });
      add(g, new THREE.IcosahedronGeometry(1.0, 1).translate(0, 2.2, 0), fm);
      add(g, new THREE.IcosahedronGeometry(0.7, 1).translate(0.35, 2.9, 0.1), fm);
      g.position.set(e.x * C, 0, e.y * C);
      grp.add(g);
    } else if (e.t === 'gate') {
      const g = new THREE.Group();
      add(g, boxG(-0.6, 0.6, 0, 1.3, -0.18, 0.18), mat('#d8d0c2', 'plaster'));
      add(g, boxG(-0.45, -0.05, 0.75, 1.05, 0.18, 0.22), mat('#2e2e2e'));
      add(g, boxG(0.15, 0.45, 0.95, 1.1, 0.18, 0.2), mat('#9a6a42'));
      g.position.set(e.x * C, 0, e.y * C); g.rotation.y = -(e.rot || 0) * Math.PI / 2;
      grp.add(g);
    }
  }
}

/* いちばん上の屋根：部屋とバルコニーで外まわりの四角がうまるなら、ひとつの大きな屋根にする */
function roofRects(indoor, any, W, H) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  indoor.forEach((v, i) => { if (!v) return; const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
  if (x1 < 0) return [];
  let full = true;
  for (let y = y0; y <= y1 && full; y++) for (let x = x0; x <= x1; x++) if (!any[y * W + x]) { full = false; break; }
  if (full) return [{ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }];
  return rectangles(indoor, W, H);
}
function boxAB(alongX, a0, a1, y0, y1, b0, b1) { return alongX ? [a0, a1, y0, y1, b0, b1] : [b0, b1, y0, y1, a0, a1]; }
function darken(hex) {
  const c = new THREE.Color(hex); c.multiplyScalar(0.7);
  return '#' + c.getHexString();
}
function floorMat(t) {
  if (t === 'washitsu') return mat('#cfcd8e');
  if (['entry', 'toilet', 'wash', 'bath'].includes(t)) return mat('#dcd8cf', 'tile');
  if (t === 'balcony') return mat('#b9b8b2');
  return mat('#c9a47c', 'wood');
}
function stairs(grp, r, y0) {
  const long = r.h >= r.w;
  const n = 14, step = FH / n;
  const wm = mat('#b48e66', 'wood');
  for (let i = 0; i < n; i++) {
    if (long) {
      const z1 = (r.y + r.h) * C - (r.h * C * i) / n, z0 = z1 - (r.h * C) / n;
      add(grp, boxG(r.x * C + 0.05, (r.x + r.w) * C - 0.05, y0, y0 + step * (i + 1), z0, z1), wm);
    } else {
      const x0 = r.x * C + (r.w * C * i) / n, x1 = x0 + (r.w * C) / n;
      add(grp, boxG(x0, x1, y0, y0 + step * (i + 1), r.y * C + 0.05, (r.y + r.h) * C - 0.05), wm);
    }
  }
}
function car(grp, cx, cz, vert, color) {
  const g = new THREE.Group();
  const body = mat(color);
  add(g, boxG(-0.86, 0.86, 0.25, 0.85, -2.3, 2.3), body);
  add(g, boxG(-0.75, 0.75, 0.85, 1.4, -1.1, 1.0), body);
  add(g, boxG(-0.76, 0.76, 0.9, 1.35, -1.0, 0.9), GLASS);
  const wg = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14).rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.78, -1.45], [0.78, -1.45], [-0.78, 1.45], [0.78, 1.45]]) add(g, wg.clone().translate(x, 0.32, z), mat('#222222'));
  g.position.set(cx, 0, cz);
  if (!vert) g.rotation.y = Math.PI / 2;
  grp.add(g);
}
