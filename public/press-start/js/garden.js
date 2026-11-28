/* 箱庭（問28〜問30・問57・問60・問70）。斜め上から見た事務所に、社員が座って働いたり歩いたり寝たりする。
   ドットは整数倍で拡大する。部屋の動かない部分は下書きに一度だけ描き、社員は毎回描く。 */
import { px, sprite, sleeperOnSofa, C } from "./sprites.js";
import { roleOf } from "./data.js";

const TW = 12, TH = 6, WH = 44;
const P = {
  sky: "#cfe8f8", cloud: "#ffffff", slab: "#9cc3df", slabD: "#7aa9cc", wallE: "#7aa9cc", base: "#b7d6ec",
  desk: "#dbe7f0", deskE: "#ffffff", deskF: "#9bb6cb", deskD: "#6f8fa8", mon: "#2c3e50", monL: "#4a5d70", scr: "#7fd0ff", scrL: "#c4ecff", scrOff: "#33465a",
  plant: "#2f8f55", plantL: "#58c27d", pot: "#e0e8ef", potD: "#9fb6c8", win: "#a9dcf7", winL: "#d6f0fd", wood: "#c79a6b", woodD: "#9b7148",
  sofa: "#2f7fc1", sofaL: "#5b9fd6", sofaD: "#1f5f99", chair: "#4a6a8a", chairL: "#6a8aaa", green: "#35a565", book: ["#e86a6a", "#f2b33d", "#35a565", "#2f7fc1", "#7a5cc2"],
};

/* 事務所ごとの部屋 */
const ROOMS = [
  { // ① 自宅のガレージ
    N: 4, floor: ["#d3dbe1", "#c6cfd7"], wallL: "#e4e9ed", wallR: "#eef2f5",
    desks: [[1.3, 0.9], [1.3, 2.7]], sofa: null, coffee: [3.2, 3.2], plants: [], boxes: [[3.1, 0.2]],
    deco: "garage",
  },
  { // ② アパートの一室
    N: 5, floor: ["#e9d5b6", "#dfc7a2"], wallL: "#eef4f8", wallR: "#ffffff",
    desks: [[0.9, 0.8], [0.9, 2.6], [2.6, 0.8], [2.6, 2.6], [4.2, 0.8]], sofa: [4.1, 3.7], coffee: [0, 4.2], plants: [[0, 0]], boxes: [],
    deco: "apart",
  },
  { // ③ 雑居ビルの小さな事務所
    N: 7, floor: ["#eef5fa", "#dbe9f3"], rug: ["#cfe3f4", "#bcd7ee"], wallL: "#e2eef7", wallR: "#ffffff",
    desks: [[1.1, 0.9], [1.1, 2.7], [2.7, 0.9], [2.7, 2.7], [4.3, 0.9], [4.3, 2.7], [5.9, 0.9], [5.9, 2.7], [1.1, 4.5], [2.7, 4.5]],
    sofa: [5.4, 5.9], coffee: [0, 6], plants: [[0, 0], [6.5, 0]], boxes: [],
    deco: "office",
  },
];

function diamond(c, cx, top, col) { for (let r = 0; r < 12; r++) { const h = r < 6 ? (r + 1) * 2 : (12 - r) * 2; px(c, cx - h, top + r, h * 2, 1, col); } }
function cloud(c, x, y) { px(c, x, y, 16, 4, P.cloud); px(c, x + 4, y - 3, 8, 3, P.cloud); px(c, x - 3, y + 2, 22, 3, P.cloud); }
function plant(c, cx, cy) {
  px(c, cx - 6, cy + 1, 12, 2, C.shadow); px(c, cx - 4, cy - 6, 9, 7, P.pot); px(c, cx - 4, cy - 1, 9, 2, P.potD); px(c, cx - 5, cy - 7, 11, 2, P.potD);
  for (const [x, y, w, h] of [[-6, -17, 13, 10], [-3, -22, 7, 5], [-8, -13, 4, 4], [5, -14, 4, 4]]) px(c, cx + x, cy + y, w, h, P.plant);
  for (const [x, y] of [[-3, -16], [2, -19], [0, -12], [-6, -12], [4, -15], [-1, -21]]) px(c, cx + x, cy + y, 2, 1, P.plantL);
}
function coffee(c, cx, cy) {
  px(c, cx - 7, cy + 1, 14, 2, C.shadow); px(c, cx - 6, cy - 10, 12, 11, P.wood); px(c, cx - 6, cy - 10, 12, 2, P.woodD); px(c, cx - 5, cy - 5, 10, 1, P.woodD);
  px(c, cx - 4, cy - 21, 8, 11, "#3d4a59"); px(c, cx - 3, cy - 20, 6, 3, P.scr); px(c, cx - 1, cy - 15, 2, 3, "#8a4b2a"); px(c, cx - 2, cy - 12, 4, 2, C.white);
}
function boxes(c, cx, cy) {
  px(c, cx - 9, cy + 1, 18, 2, C.shadow);
  px(c, cx - 8, cy - 8, 10, 9, "#c79a6b"); px(c, cx - 8, cy - 8, 10, 1, "#e0b98a"); px(c, cx - 4, cy - 8, 2, 9, "#9b7148");
  px(c, cx - 1, cy - 4, 9, 5, "#d8ad7c"); px(c, cx - 1, cy - 4, 9, 1, "#ecc89c");
  px(c, cx - 6, cy - 15, 9, 7, "#d8ad7c"); px(c, cx - 6, cy - 15, 9, 1, "#ecc89c");
}
function sofa(c, cx, cy) { px(c, cx - 15, cy + 4, 30, 2, C.shadow); px(c, cx - 15, cy - 9, 30, 6, P.sofaD); px(c, cx - 15, cy - 3, 30, 7, P.sofa); px(c, cx - 15, cy - 3, 30, 1, P.sofaL); px(c, cx - 17, cy - 6, 3, 10, P.sofaD); px(c, cx + 14, cy - 6, 3, 10, P.sofaD); }
function chair(c, x, y) { px(c, x - 5, y - 14, 10, 8, P.chair); px(c, x - 5, y - 14, 10, 1, P.chairL); px(c, x - 1, y - 6, 2, 3, P.deskD); }

/* 壁の飾り（左の壁は x が減ると下がる、右の壁は x が増えると下がる） */
function wallStrip(c, cx, oy, side, x0, x1, top, h, col) {
  for (let x = x0; x <= x1; x++) { const y = oy + (side < 0 ? (cx - x) / 2 : (x - cx) / 2); px(c, x, y - top, 1, h, typeof col === "function" ? col(x, y) : col); }
}
function decorate(c, room, cx, oy, N) {
  const L = cx - N * TW, R = cx + N * TW;
  if (room.deco === "garage") {
    // 左：シャッター
    wallStrip(c, cx, oy, -1, L + 4, cx - 6, 40, 36, "#9fb0bf");
    for (let k = 0; k < 9; k++) wallStrip(c, cx, oy, -1, L + 5, cx - 7, 38 - k * 4, 1, "#7f93a5");
    // 右：工具を掛ける板
    wallStrip(c, cx, oy, 1, cx + 8, cx + 34, 36, 18, "#c79a6b");
    for (let x = cx + 10; x < cx + 33; x += 3) wallStrip(c, cx, oy, 1, x, x, 34, 14, (xx, yy) => ((Math.floor(yy) + x) % 4 === 0 ? "#9b7148" : "#c79a6b"));
    wallStrip(c, cx, oy, 1, cx + 13, cx + 13, 33, 9, "#6e6e76"); wallStrip(c, cx, oy, 1, cx + 20, cx + 22, 32, 3, "#e86a6a"); wallStrip(c, cx, oy, 1, cx + 27, cx + 27, 33, 7, "#6e6e76");
    // 裸電球
    px(c, cx - 1, oy - WH - 1, 2, 8, "#3d4a59"); px(c, cx - 2, oy - WH + 7, 4, 4, "#ffe9a8");
  }
  if (room.deco === "apart") {
    // 左：窓
    wallStrip(c, cx, oy, -1, cx - 44, cx - 16, 36, 20, P.wallE);
    wallStrip(c, cx, oy, -1, cx - 43, cx - 17, 35, 18, (x) => ((x - cx) % 9 === 0 ? P.wallE : P.win));
    wallStrip(c, cx, oy, -1, cx - 40, cx - 30, 31, 2, P.winL);
    // 右：時計とカレンダー
    wallStrip(c, cx, oy, 1, cx + 16, cx + 24, 38, 9, "#1d3557"); wallStrip(c, cx, oy, 1, cx + 17, cx + 23, 37, 7, C.white); wallStrip(c, cx, oy, 1, cx + 20, cx + 20, 36, 3, "#1d3557");
    wallStrip(c, cx, oy, 1, cx + 34, cx + 46, 36, 16, C.white); wallStrip(c, cx, oy, 1, cx + 34, cx + 46, 36, 3, "#e86a6a");
    for (let k = 0; k < 3; k++) wallStrip(c, cx, oy, 1, cx + 36, cx + 44, 30 - k * 4, 1, "#b7d6ec");
  }
  if (room.deco === "office") {
    wallStrip(c, cx, oy, -1, cx - 76, cx - 46, 36, 20, P.wallE);
    wallStrip(c, cx, oy, -1, cx - 75, cx - 47, 35, 18, (x) => ((x - cx + 76) % 10 === 0 ? P.wallE : P.win));
    wallStrip(c, cx, oy, -1, cx - 72, cx - 62, 30, 3, C.white);
    for (let x = cx - 38; x <= cx - 16; x++) {
      const y = oy + (cx - x) / 2; px(c, x, y - 34, 1, 32, P.woodD);
      if (x > cx - 38 && x < cx - 16) for (const s of [-33, -23, -13]) { const k = ((Math.floor((x + s) / 2)) % 5 + 5) % 5; px(c, x, y + s, 1, 8, P.book[k]); px(c, x, y + s, 1, 1, "rgba(255,255,255,.35)"); }
    }
    for (let x = cx + 62; x <= cx + 76; x++) {
      const y = oy + (x - cx) / 2; px(c, x, y - 40, 1, 22, "#1d3557");
      if (x > cx + 62 && x < cx + 76) { px(c, x, y - 39, 1, 20, "#2a4a7a"); if (x > cx + 66 && x < cx + 72) px(c, x, y - 33, 1, 5, "#2f7fc1"); px(c, x, y - 23, 1, 3, "#e0a21b"); }
    }
  }
}
/* ホワイトボード（開発の進み具合）は毎回描く */
function board(c, room, cx, oy, prog) {
  const [a, b] = room.deco === "office" ? [14, 54] : room.deco === "apart" ? [-12, -2] : [-34, -18];
  if (room.deco !== "office") return; // 小さい部屋は壁がせまいので、上の帯の進み具合だけ
  for (let x = cx + a; x <= cx + b; x++) { const y = oy + (x - cx) / 2; px(c, x, y - 38, 1, 22, "#1d3557"); if (x > cx + a && x < cx + b) px(c, x, y - 37, 1, 20, C.white); }
  const w = b - a - 8;
  for (let x = cx + a + 4; x <= cx + b - 4; x++) {
    const y = oy + (x - cx) / 2;
    if (x < cx + a + 24) px(c, x, y - 34, 1, 1, "#1d3557");
    if ((x - cx) % 6 < 3) px(c, x, y - 30, 1, 1, "#9fb6c8");
    px(c, x, y - 25, 1, 5, prog != null && x - (cx + a + 4) < w * prog ? P.green : "#dbe9f3");
  }
}

export function createGarden(host, opts) {
  const cv = document.createElement("canvas");
  cv.className = "gcv";
  host.prepend(cv);
  const fxLayer = document.createElement("div");
  fxLayer.className = "gfx";
  host.appendChild(fxLayer);
  let c, W, H, SC, cx, oy, bg, roomIdx = -1, peek = false;
  let t = 0;
  const walkers = new Map(); // 社員ごとの、歩きの予定
  let hits = [];
  const anchors = new Map(); // 社員ごとの、頭の上の位置（画面の点）

  function layout() {
    const s = opts.state();
    const room = ROOMS[s.office];
    const cw = host.clientWidth, ch = host.clientHeight;
    if (!cw || !ch) return;
    const need = room.N * TW * 2 + 6;
    SC = Math.max(1, Math.min(3, Math.floor(cw / need)));
    W = Math.floor(cw / SC); H = Math.floor(ch / SC);
    cv.width = W; cv.height = H;
    cv.style.width = W * SC + "px"; cv.style.height = H * SC + "px";
    cv.style.left = Math.floor((cw - W * SC) / 2) + "px"; cv.style.top = Math.floor((ch - H * SC) / 2) + "px";
    c = cv.getContext("2d"); c.imageSmoothingEnabled = false;
    cx = Math.floor(W / 2);
    peek = ch < 200;
    const roomH = WH + room.N * TH * 2 + 8;
    const mid = room.desks.slice(0, Math.max(1, s.staff.length)).reduce((a, [i, j]) => a + i + j, 0) / Math.max(1, Math.min(room.desks.length, s.staff.length || 1));
    oy = peek ? Math.floor(H / 2) + 12 - Math.round(mid * TH) - TH : Math.max(WH + 4, Math.floor((H - roomH) / 2) + WH);
    roomIdx = s.office;
    bg = document.createElement("canvas"); bg.width = W; bg.height = H;
    const b = bg.getContext("2d");
    const N = room.N;
    px(b, 0, 0, W, H, P.sky);
    for (let y = 0; y < H; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < W; x += 8) px(b, x, y, 1, 1, "rgba(255,255,255,.6)");
    cloud(b, 10, 14); cloud(b, W - 40, 30); cloud(b, Math.floor(W * 0.42), H - 18);
    for (let x = cx - N * TW; x <= cx + N * TW; x++) { const y = oy + N * TH * 2 - Math.abs(cx - x) / 2; px(b, x, y, 1, 8, x < cx ? P.slab : P.slabD); }
    for (let x = cx - N * TW; x <= cx; x++) { const y = oy + (cx - x) / 2; px(b, x, y - WH, 1, WH, room.wallL); px(b, x, y - 4, 1, 4, P.base); }
    for (let x = cx; x <= cx + N * TW; x++) { const y = oy + (x - cx) / 2; px(b, x, y - WH, 1, WH, room.wallR); px(b, x, y - 4, 1, 4, P.base); }
    for (let x = cx - N * TW; x <= cx + N * TW; x++) { const y = oy + Math.abs(cx - x) / 2; px(b, x, y - WH - 3, 1, 3, P.wallE); }
    px(b, cx - N * TW, oy + N * TH - WH - 3, 1, WH + 3, P.wallE); px(b, cx + N * TW, oy + N * TH - WH - 3, 1, WH + 3, P.wallE);
    decorate(b, room, cx, oy, N);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const [x, y] = tile(i, j);
      const rug = room.rug && i >= 1 && i <= 6 && j >= 0 && j <= 3;
      const pal = rug ? room.rug : room.floor;
      diamond(b, x, y, (i + j) % 2 ? pal[1] : pal[0]);
    }
  }
  const tile = (i, j) => [cx + (i - j) * TW, oy + (i + j) * TH];

  function behavior(s, p) {
    if (p.rest) return "rest";
    const busy = s.projects.some((x) => x.members.includes(p.id)) || s.contracts.some((x) => x.members.includes(p.id));
    if (busy) return "work";
    if (!roleOf(p.role).dev && (s.projects.length || s.contracts.length)) return "work";
    return "idle";
  }

  function frame() {
    const s = opts.state();
    if (!s) return;
    if (s.office !== roomIdx || !c) layout();
    if (!c) return;
    const room = ROOMS[s.office];
    c.drawImage(bg, 0, 0);
    const pj = s.projects[0];
    board(c, room, cx, oy, pj ? pj.done / pj.ticks : null);
    const items = [];
    hits = [];
    anchors.clear();
    let sofaUsed = false;
    const staff = s.staff;
    room.desks.forEach(([i, j], k) => {
      const p = staff[k];
      const b = p ? behavior(s, p) : null;
      const sitting = p && (b === "work" || (b === "idle" && !walking(p)) || (b === "rest" && (!room.sofa || sofaUsed)));
      if (p && b === "rest" && room.sofa && !sofaUsed) sofaUsed = p.id;
      items.push({ d: i + j, f: () => {
        const [x, y0] = tile(i, j); const y = y0 + TH;
        chair(c, x + 3, y - 2);
        if (sitting) {
          const blink = b === "rest" || (t + p.id * 3) % 11 === 0;
          sprite(c, x - 3, y - 19, p.look, "sit", blink);
          addHit(p.id, x - 3, y - 19, 12, 16);
        }
        px(c, x - 13, y + 6, 26, 2, C.shadow);
        px(c, x - 12, y - 4, 24, 4, P.desk); px(c, x - 12, y - 4, 24, 1, P.deskE); px(c, x - 12, y, 24, 5, P.deskF); px(c, x - 12, y + 5, 2, 3, P.deskD); px(c, x + 10, y + 5, 2, 3, P.deskD);
        px(c, x - 11, y - 15, 11, 10, P.mon); px(c, x - 11, y - 15, 11, 1, P.monL);
        const on = p && b === "work";
        px(c, x - 10, y - 14, 9, 7, p ? (on ? (p.role === "designer" ? "#9ee0b5" : P.scr) : "#5c7a96") : P.scrOff);
        if (on) for (let r = 0; r < 3; r++) px(c, x - 9, y - 13 + r * 2, 2 + ((t + r * 3 + p.id) % 5), 1, P.scrL);
        px(c, x - 7, y - 5, 3, 1, P.mon);
        px(c, x - 1, y - 3, 8, 2, "#b9c9d6"); px(c, x - 1, y - 3, 8, 1, C.white);
        if (sitting && on) { const a = (t + p.id) % 2; const sk = ["#f6d2b3", "#efc09a", "#d9a37b"][p.look.skin % 3]; px(c, x - 2 + a, y - 4 + a, 2, 1, sk); px(c, x + 5 - a, y - 4 + (1 - a), 2, 1, sk); }
        if (p) { px(c, x + 8, y - 6, 3, 3, C.white); px(c, x + 8, y - 6, 3, 1, "#8a4b2a"); }
        if (sitting && b === "rest") anchors.set(p.id, { x: x + 2, y: y - 22, zz: true });
        else if (sitting) anchors.set(p.id, { x: x + 3, y: y - 21 });
      } });
      // 歩いている社員
      if (p && b === "idle" && walking(p)) {
        const w = walkers.get(p.id);
        const f = Math.min(1, w.k / w.len), back = w.phase === 1;
        const [ai, aj] = back ? w.to : [i + 0.6, j + 0.6], [bi, bj] = back ? [i + 0.6, j + 0.6] : w.to;
        const wi = ai + (bi - ai) * f, wj = aj + (bj - aj) * f;
        items.push({ d: wi + wj + 0.5, f: () => {
          const [x, y0] = tile(wi, wj); const y = y0 + TH;
          px(c, x - 5, y + 4, 10, 2, C.shadow);
          sprite(c, x - 6, y + 5 - 21, p.look, f >= 1 ? "stand" : t % 2 ? "walk0" : "walk1", (t + p.id) % 13 === 0, back);
          addHit(p.id, x - 6, y - 16, 12, 22);
          anchors.set(p.id, { x, y: y - 18 });
        } });
      }
    });
    // 机からあふれた社員（ふつうは出ない）は描かない
    room.plants.forEach(([i, j]) => items.push({ d: i + j, f: () => { const [x, y] = tile(i, j); plant(c, x, y + TH); } }));
    room.boxes.forEach(([i, j]) => items.push({ d: i + j, f: () => { const [x, y] = tile(i, j); boxes(c, x, y + TH); } }));
    if (room.coffee) { const [i, j] = room.coffee; items.push({ d: i + j, f: () => { const [x, y] = tile(i, j); coffee(c, x, y + TH); } }); }
    if (room.sofa) {
      const [i, j] = room.sofa;
      items.push({ d: i + j + 0.3, f: () => {
        const [x, y0] = tile(i, j); const y = y0 + TH;
        sofa(c, x, y);
        if (sofaUsed) { const p = staff.find((q) => q.id === sofaUsed); sleeperOnSofa(c, x, y, p.look, Math.floor(t / 4)); addHit(p.id, x - 13, y - 12, 26, 10); anchors.set(p.id, { x: x + 10, y: y - 12, zz: true }); }
      } });
    }
    items.sort((a, b) => a.d - b.d).forEach((it) => it.f());
    stepWalkers(s, room);
    placeFx();
    t++;
  }
  function addHit(id, x, y, w, h) { hits.push({ id, x, y, w, h }); }
  function walking(p) { return walkers.has(p.id); }
  function stepWalkers(s, room) {
    for (const [id, w] of walkers) {
      w.k += 1;
      if (w.k >= w.len + (w.phase === 0 ? w.stay : 0)) { if (w.phase === 0) { w.phase = 1; w.k = 0; } else walkers.delete(id); }
    }
    if (!room.coffee) return;
    for (const p of s.staff) {
      if (walkers.has(p.id) || behavior(s, p) !== "idle") continue;
      if (Math.random() < 0.012) walkers.set(p.id, { to: [room.coffee[0] + 0.9, room.coffee[1] - 0.2 + Math.random() * 0.4], k: 0, len: 22, stay: 10, phase: 0 });
    }
  }

  /* お知らせの吹き出し・数字・電球 */
  const live = [];
  function showFx(e) {
    const el = document.createElement("div");
    if (e.kind === "bubble") { el.className = "gbub"; el.textContent = e.text; }
    else if (e.kind === "pop") { el.className = "gpop" + (e.color === "b" ? " b" : ""); el.textContent = e.text; }
    else if (e.kind === "spark") { el.className = "gbulb"; }
    else return;
    fxLayer.appendChild(el);
    const life = e.kind === "bubble" ? 3600 : e.kind === "spark" ? 1800 : 1500;
    const item = { el, who: e.who, born: performance.now(), life, kind: e.kind };
    // 同じ社員の吹き出しは1つだけ
    if (e.kind === "bubble") for (const o of live) if (o.kind === "bubble" && o.who === e.who) o.life = 0;
    live.push(item);
    placeFx();
  }
  function placeFx() {
    const now = performance.now();
    const ox = parseFloat(cv.style.left) || 0, oyy = parseFloat(cv.style.top) || 0;
    let freeRow = 0;
    for (let k = live.length - 1; k >= 0; k--) {
      const o = live[k];
      if (now - o.born > o.life) { o.el.remove(); live.splice(k, 1); continue; }
      const a = o.who != null ? anchors.get(o.who) : null;
      let x, y;
      if (a) { x = ox + a.x * SC; y = oyy + a.y * SC; }
      else { x = host.clientWidth / 2; y = (peek ? 34 : 70) + freeRow * 30; if (o.kind === "bubble") freeRow++; }
      const rise = o.kind === "pop" ? ((now - o.born) / o.life) * 22 : 0;
      o.el.style.left = Math.round(Math.max(60, Math.min(host.clientWidth - 60, x))) + "px";
      o.el.style.top = Math.round(y - rise - (o.kind === "pop" ? 6 : 0)) + "px";
      if (o.kind === "pop") o.el.style.opacity = String(1 - Math.max(0, (now - o.born) / o.life - 0.6) * 2.5);
    }
    // 寝ている社員の「Zzz」
    for (const [id, a] of anchors) {
      if (!a.zz) continue;
      let z = fxLayer.querySelector(`[data-zz="${id}"]`);
      if (!z) { z = document.createElement("div"); z.className = "gzz"; z.dataset.zz = id; z.textContent = "Zzz"; fxLayer.appendChild(z); }
      z.style.left = Math.round(ox + a.x * SC + 10) + "px"; z.style.top = Math.round(oyy + a.y * SC - (t % 6)) + "px";
      z.dataset.seen = String(t);
    }
    fxLayer.querySelectorAll("[data-zz]").forEach((z) => { if (z.dataset.seen !== String(t)) z.remove(); });
  }

  cv.addEventListener("click", (ev) => {
    const r = cv.getBoundingClientRect();
    const x = (ev.clientX - r.left) / SC, y = (ev.clientY - r.top) / SC;
    const h = [...hits].reverse().find((b) => x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 2 && y <= b.y + b.h + 2);
    if (h) opts.onTap(h.id);
  });
  const ro = new ResizeObserver(() => { roomIdx = -1; frame(); });
  ro.observe(host);
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const timer = setInterval(() => { if (!document.hidden) frame(); }, still ? 1000 : 220);
  frame();
  return { showFx, redraw: () => { roomIdx = -1; frame(); }, destroy: () => { clearInterval(timer); ro.disconnect(); cv.remove(); fxLayer.remove(); } };
}
