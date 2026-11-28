/* PRESS START のドット絵。社員（箱庭の全身・12×22）と顔（24×24）、メニューの絵、小物 */

export const C = {
  navy: "#1d3557", white: "#ffffff", mouth: "#b5524a", blush: "#f29a9a",
  pants: "#33415c", pantsD: "#242f45", shoe: "#2b2b2b", shadow: "rgba(29,53,87,.16)",
};
export const SKIN = [["#f6d2b3", "#e2b08c"], ["#efc09a", "#d49c74"], ["#d9a37b", "#b98059"]];
export const HAIR = [["#4a3426", "#2e1f16", "#6b4e3a"], ["#e2a83a", "#b9821c", "#f3cf6e"], ["#26262e", "#121216", "#4a4a58"], ["#9a5530", "#6e3a1e", "#c27a4c"], ["#5b3a8a", "#3d2560", "#8a64b8"], ["#c2410c", "#8a2c06", "#e86a3a"], ["#9a9aa2", "#6e6e76", "#c8c8d0"]];
export const SHIRT = [["#2f7fc1", "#1f5f99"], ["#35a565", "#257a49"], ["#e86a6a", "#c04848"], ["#f2b33d", "#c98d1f"], ["#7a5cc2", "#5a3f98"], ["#4fb3bf", "#338893"], ["#ffffff", "#c9d8e4"]];

export const px = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
const span = (c, y, x0, x1, col) => px(c, x0, y, x1 - x0 + 1, 1, col);

/* 箱庭の社員（12×22）。pose：stand / walk0 / walk1 / sit。年配の髪（style 4）は短髪で描く */
export function sprite(c, x0, y0, look, pose, blink, cup) {
  const [sk, skD] = SKIN[look.skin % 3], [h, hD, hL] = HAIR[look.hair % 7], [sh, shD] = SHIRT[look.shirt % 7];
  const st = look.style;
  const X = (x) => x0 + x, Y = (y) => y0 + y;
  if (st === 1) for (let y = 5; y <= 12; y++) { px(c, X(1), Y(y), 1, 1, hD); px(c, X(10), Y(y), 1, 1, hD); }
  const hw = [3, 4, 5, 5, 5, 5, 5, 4, 3];
  hw.forEach((w, k) => span(c, Y(2 + k), X(6 - w), X(5 + w), sk));
  hw.forEach((w, k) => px(c, X(5 + w), Y(2 + k), 1, 1, skD));
  if (blink) { px(c, X(4), Y(7), 1, 1, C.navy); px(c, X(7), Y(7), 1, 1, C.navy); }
  else { px(c, X(4), Y(6), 1, 2, C.navy); px(c, X(7), Y(6), 1, 2, C.navy); px(c, X(4), Y(6), 1, 1, "#3c5a85"); px(c, X(7), Y(6), 1, 1, "#3c5a85"); }
  if (look.glasses) { span(c, Y(5), X(3), X(8), C.navy); }
  px(c, X(3), Y(8), 1, 1, C.blush); px(c, X(8), Y(8), 1, 1, C.blush);
  px(c, X(5), Y(9), 2, 1, C.mouth);
  if (st === 4) { span(c, Y(1), X(3), X(8), h); span(c, Y(2), X(2), X(9), h); px(c, X(2), Y(3), 1, 2, h); px(c, X(9), Y(3), 1, 2, h); span(c, Y(1), X(4), X(5), hL); }
  else {
    span(c, Y(1), X(3), X(8), h); span(c, Y(2), X(2), X(9), h); span(c, Y(3), X(1), X(10), h);
    if (st === 5) span(c, Y(4), X(1), X(10), h);
    else { span(c, Y(4), X(1), X(2), h); span(c, Y(4), X(4), X(6), h); span(c, Y(4), X(9), X(10), h); }
    px(c, X(1), Y(5), 1, 2, h); px(c, X(10), Y(5), 1, 2, h);
    span(c, Y(2), X(4), X(5), hL); px(c, X(9), Y(3), 2, 1, hD);
    if (st === 2) { span(c, Y(-1), X(5), X(6), h); span(c, Y(0), X(4), X(7), h); px(c, X(5), Y(-1), 1, 1, hL); }
    if (st === 3) { px(c, X(3), Y(0), 1, 1, h); px(c, X(6), Y(0), 1, 1, h); px(c, X(8), Y(0), 1, 1, h); px(c, X(5), Y(4), 1, 1, sk); }
    if (st === 1) span(c, Y(4), X(3), X(3), h);
  }
  px(c, X(5), Y(11), 2, 1, skD);
  span(c, Y(12), X(3), X(8), sh); px(c, X(4), Y(12), 4, 1, C.white);
  for (let y = 13; y <= 17; y++) { span(c, Y(y), X(2), X(9), sh); px(c, X(9), Y(y), 1, 1, shD); }
  px(c, X(5), Y(13), 2, 1, C.white);
  if (pose === "sit") { px(c, X(1), Y(13), 1, 3, sh); px(c, X(10), Y(13), 1, 3, shD); }
  else if (pose === "walk0") { px(c, X(1), Y(13), 1, 3, sh); px(c, X(1), Y(16), 1, 1, sk); px(c, X(10), Y(12), 1, 3, shD); px(c, X(10), Y(15), 1, 1, sk); }
  else if (pose === "walk1") { px(c, X(1), Y(12), 1, 3, sh); px(c, X(1), Y(15), 1, 1, sk); px(c, X(10), Y(13), 1, 3, shD); px(c, X(10), Y(16), 1, 1, sk); }
  else { px(c, X(1), Y(13), 1, 4, sh); px(c, X(1), Y(17), 1, 1, sk); px(c, X(10), Y(13), 1, 4, shD); px(c, X(10), Y(17), 1, 1, sk); }
  if (cup) { px(c, X(10), Y(14), 2, 3, C.white); px(c, X(10), Y(14), 2, 1, "#8a4b2a"); px(c, X(12), Y(15), 1, 1, C.white); }
  if (pose === "sit") return;
  span(c, Y(18), X(3), X(8), C.pants);
  if (pose === "walk0") { px(c, X(3), Y(19), 2, 2, C.pants); px(c, X(7), Y(19), 2, 1, C.pantsD); px(c, X(3), Y(21), 2, 1, C.shoe); px(c, X(7), Y(20), 2, 1, C.shoe); }
  else if (pose === "walk1") { px(c, X(3), Y(19), 2, 1, C.pantsD); px(c, X(7), Y(19), 2, 2, C.pants); px(c, X(3), Y(20), 2, 1, C.shoe); px(c, X(7), Y(21), 2, 1, C.shoe); }
  else { px(c, X(3), Y(19), 2, 2, C.pants); px(c, X(7), Y(19), 2, 2, C.pantsD); px(c, X(3), Y(21), 2, 1, C.shoe); px(c, X(7), Y(21), 2, 1, C.shoe); }
}

/* 寝ている社員（ソファ、または机に突っ伏す） */
export function sleeperOnSofa(c, cx, cy, look, t) {
  const [sk, skD] = SKIN[look.skin % 3], [h, hD] = HAIR[look.hair % 7], [sh, shD] = SHIRT[look.shirt % 7];
  px(c, cx - 11, cy - 7, 18, 4, sh); px(c, cx - 11, cy - 4, 18, 1, shD); px(c, cx - 13, cy - 7, 2, 3, C.pants);
  const hy = cy - 10 + (t % 2);
  px(c, cx + 7, hy, 6, 6, sk); px(c, cx + 12, hy + 1, 1, 5, skD); px(c, cx + 7, hy - 1, 6, 2, h); px(c, cx + 6, hy, 1, 4, h); px(c, cx + 12, hy, 1, 2, hD);
  px(c, cx + 8, hy + 3, 2, 1, C.navy); px(c, cx + 11, hy + 3, 1, 1, C.navy); px(c, cx + 9, hy + 5, 1, 1, C.mouth);
}

/* 顔（24×24）。o：見た目（look）に表情 face を足したもの */
export function face(c, o, ox = 0, oy = 0) {
  const [sk, skD] = SKIN[(o.skin || 0) % 3], [h, hD, hL] = HAIR[(o.hair || 0) % 7], [sh, shD] = SHIRT[(o.shirt || 0) % 7];
  const P = (x, y, w, hh, col) => px(c, ox + x, oy + y, w, hh, col), S = (y, a, b, col) => P(a, y, b - a + 1, 1, col);
  if (o.style === 1) for (let y = 8; y <= 21; y++) { S(y, 3, 5, hD); S(y, 18, 20, hD); }
  S(19, 6, 17, sh); for (let y = 20; y < 24; y++) S(y, 3, 20, sh); for (let y = 20; y < 24; y++) P(18, y, 3, 1, shD);
  P(10, 19, 4, 1, C.white); P(9, 20, 2, 1, C.white); P(13, 20, 2, 1, C.white); P(11, 20, 2, 3, skD); P(11, 22, 2, 1, shD);
  if (o.tie) P(11, 21, 2, 3, o.tie);
  P(10, 17, 4, 2, skD);
  const hw = [4, 6, 7, 7, 8, 8, 8, 8, 8, 8, 7, 7, 6, 4];
  hw.forEach((w, k) => S(4 + k, 12 - w, 11 + w, sk));
  hw.forEach((w, k) => P(11 + w, 4 + k, 1, 1, skD)); S(17, 10, 13, skD);
  P(3, 10, 1, 3, sk); P(20, 10, 1, 3, skD); P(3, 11, 1, 1, skD);
  const f = o.face || "smile";
  const eyes = (x) => {
    if (f === "sleepy") { S(11, x, x + 2, C.navy); return; }
    if (f === "smileeye") { P(x, 11, 1, 1, C.navy); P(x + 1, 10, 1, 1, C.navy); P(x + 2, 11, 1, 1, C.navy); return; }
    P(x, 10, 2, 3, C.navy); P(x, 10, 1, 1, C.white);
    if (f === "sparkle") { P(x + 1, 12, 1, 1, C.white); P(x, 10, 2, 1, "#ffe9a8"); }
    if (f === "wow") P(x, 9, 2, 1, C.navy);
  };
  eyes(7); eyes(15);
  const bc = hD;
  if (f === "serious" || f === "sad") { S(8, 6, 9, bc); S(8, 14, 17, bc); if (f === "serious") { P(9, 9, 1, 1, bc); P(14, 9, 1, 1, bc); } else { P(6, 9, 1, 1, bc); P(17, 9, 1, 1, bc); } }
  else if (f === "wow") { S(7, 7, 9, bc); S(7, 14, 16, bc); }
  else { S(8, 7, 9, bc); S(8, 14, 16, bc); }
  if (f !== "serious" && f !== "sad") { P(5, 13, 2, 1, C.blush); P(17, 13, 2, 1, C.blush); }
  if (f === "wow" || f === "sparkle") { S(14, 10, 13, C.mouth); S(15, 10, 13, "#7a2e2a"); P(11, 15, 2, 1, "#e8857c"); S(16, 11, 12, C.mouth); }
  else if (f === "serious") S(15, 10, 13, C.mouth);
  else if (f === "sad") { S(15, 10, 13, C.mouth); P(9, 16, 1, 1, C.mouth); P(14, 16, 1, 1, C.mouth); }
  else if (f === "sleepy") P(11, 15, 2, 1, C.mouth);
  else { P(9, 14, 1, 1, C.mouth); S(15, 10, 13, C.mouth); P(14, 14, 1, 1, C.mouth); }
  if (o.beard) { S(16, 8, 15, h); S(15, 8, 9, h); S(15, 14, 15, h); S(17, 10, 13, h); S(14, 9, 14, h); P(10, 15, 4, 1, C.mouth); }
  if (o.glasses) { const g = C.navy; [6, 14].forEach((x) => { S(9, x, x + 3, g); S(13, x, x + 3, g); P(x, 9, 1, 5, g); P(x + 3, 9, 1, 5, g); }); S(10, 10, 13, g); }
  if (o.style === 4) { S(3, 8, 15, h); S(4, 6, 17, h); P(4, 5, 2, 4, h); P(18, 5, 2, 4, h); S(3, 9, 11, hL); return; }
  S(1, 9, 14, h); S(2, 7, 16, h); S(3, 5, 18, h); S(4, 4, 19, h); S(5, 4, 19, h); S(6, 4, 19, h); S(7, 4, 19, h);
  if (o.style === 5) { S(8, 4, 19, h); S(9, 4, 7, h); S(9, 16, 19, h); P(11, 8, 1, 1, sk); }
  else { S(8, 4, 6, h); S(8, 8, 12, h); S(8, 17, 19, h); P(9, 8, 2, 1, h); P(4, 9, 2, 3, h); P(18, 9, 2, 3, h); P(13, 8, 2, 1, hD); }
  if (o.style === 1) for (let y = 9; y <= 15; y++) { P(3, y, 2, 1, h); P(19, y, 2, 1, h); }
  if (o.style === 2) { P(9, 0, 6, 2, h); P(10, 0, 2, 1, hL); }
  if (o.style === 3) { P(6, 1, 2, 2, h); P(11, 0, 2, 2, h); P(16, 1, 2, 2, h); P(8, 0, 1, 1, h); }
  S(3, 8, 11, hL); S(4, 7, 8, hL); P(17, 4, 2, 3, hD);
}
export function faceCanvas(o, cls = "") {
  const cv = document.createElement("canvas");
  cv.width = 24; cv.height = 24;
  if (cls) cv.className = cls;
  const c = cv.getContext("2d"); c.imageSmoothingEnabled = false;
  face(c, o);
  return cv;
}
/* 社員の今の表情（体力とやる気から） */
export function moodFace(p) {
  if (p.rest || p.stamina < 20) return "sleepy";
  if (p.mood < 25) return "sad";
  if (p.mood > 80) return "smileeye";
  return p.look.face || "smile";
}

/* 評論家の顔 */
export const CRITIC_LOOKS = [
  { skin: 0, hair: 6, shirt: 2, style: 4, face: "neutral", glasses: 1, tie: "#ffffff" },
  { skin: 1, hair: 2, shirt: 0, style: 0, face: "serious" },
  { skin: 0, hair: 3, shirt: 1, style: 1, face: "smile" },
  { skin: 2, hair: 0, shirt: 3, style: 3, face: "neutral", beard: 1 },
];
export const BOSS_LOOK = { skin: 0, hair: 0, shirt: 0, style: 0, face: "smileeye", tie: "#e86a6a" };

/* メニューの絵（9×9） */
const ICONS = [
  ["#########", "#ooooooo#", "#ooooooo#", "#ooooooo#", "#########", "....#....", "..#####..", ".........", "........."],
  ["...###...", "..#####..", "..#####..", "...###...", ".........", ".#######.", "#########", "#########", "........."],
  ["...###...", "...###...", "....#....", ".#######.", ".#..#..#.", "###.#.###", "###.#.###", ".....###.", ".....###."],
  ["..#####..", ".##***##.", "##*#*#*##", "##**#**##", "##*###*##", "##**#**##", ".##***##.", "..#####..", "........."],
  ["#*******#", "#*******#", ".#*****#.", "..#***#..", "...#*#...", "....#....", "...###...", "..#####..", "........."],
];
export function iconCanvas(k, col) {
  const cv = document.createElement("canvas"); cv.width = 9; cv.height = 9;
  const c = cv.getContext("2d");
  ICONS[k].forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== ".") px(c, x, y, 1, 1, ch === "#" ? col : ch === "o" ? "#35a565" : "#e0a21b"); }));
  return cv;
}

/* ゲーム機の小さな絵（10×7） */
export function consoleCanvas(con) {
  const cv = document.createElement("canvas"); cv.width = 10; cv.height = 7;
  const c = cv.getContext("2d");
  if (con.kind === "パソコン") { px(c, 1, 0, 8, 5, "#3d4a59"); px(c, 2, 1, 6, 3, "#35a565"); px(c, 0, 5, 10, 2, "#e0e8ef"); }
  else if (con.kind === "携帯機") { px(c, 2, 0, 6, 7, con.color); px(c, 3, 1, 4, 3, "#9bbc8a"); px(c, 3, 5, 1, 1, "#1d3557"); px(c, 6, 5, 1, 1, "#e86a6a"); }
  else if (con.kind === "スマホ") { px(c, 3, 0, 4, 7, "#1d3557"); px(c, 4, 1, 2, 4, "#7fd0ff"); }
  else { px(c, 0, 1, 10, 5, con.color); px(c, 0, 5, 10, 1, "#9fb6c8"); px(c, 1, 2, 3, 2, "#1d3557"); px(c, 7, 2, 1, 1, "#e86a6a"); px(c, 8, 3, 1, 1, "#2f7fc1"); }
  return cv;
}

/* ゲームの箱の絵（24×30）。テーマの色で変える */
const THEME_COL = { space: ["#13284a", "#2f7fc1"], ninja: ["#2b2b2b", "#e86a6a"], cat: ["#f2e3c9", "#f2b33d"], school: ["#dff1fb", "#35a565"], pirate: ["#1f5f99", "#c79a6b"], dino: ["#cde8b8", "#35a565"], robot: ["#3d4a59", "#9fb6c8"], detective: ["#3b2a20", "#e0a21b"], cook: ["#fff3dd", "#e86a6a"], ghost: ["#2a2440", "#c8c8d0"], magic: ["#3d2560", "#e0a21b"], train: ["#dff1fb", "#e86a6a"], sport: ["#35a565", "#ffffff"], bug: ["#e8f5d0", "#5b3a20"] };
export function boxCanvas(g) {
  const cv = document.createElement("canvas"); cv.width = 24; cv.height = 30;
  const c = cv.getContext("2d");
  const [bg, fg] = THEME_COL[g.theme] || ["#13284a", "#2f7fc1"];
  px(c, 0, 0, 24, 30, bg);
  let h = 0; for (const ch of g.title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  for (let i = 0; i < 7; i++) { h = (h * 1103515245 + 12345) >>> 0; px(c, 2 + (h % 20), 2 + ((h >> 8) % 20), 1, 1, "rgba(255,255,255,.7)"); }
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) { const d = (x - 5) ** 2 + (y - 5) ** 2; if (d <= 26) px(c, 7 + x, 9 + y, 1, 1, d < 8 ? "#ffffff" : (x + y + (h & 3)) % 3 ? fg : "#1d3557"); }
  px(c, 0, 24, 24, 6, "#e0a21b"); px(c, 2, 26, 20, 1, "#1d3557"); px(c, 2, 28, 12, 1, "#1d3557");
  return cv;
}
