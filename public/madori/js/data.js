/* ゆめのおうち：部屋・ドア窓・設備・外構の種類、色の見本、見本の間取り */

export const CELL = 0.91;            // 1マス＝91cm（半間）

/* 部屋の種類。zone が同じ部屋どうしは、となり合うと壁なしでつながる（LDKとキッチン、廊下とホールなど） */
export const ROOMS = {
  ldk:      { label: 'LDK',        c: '#f7e6c4', zone: 'L', live: 1 },
  living:   { label: 'リビング',   c: '#f7e6c4', zone: 'L', live: 1 },
  dining:   { label: 'ダイニング', c: '#f4e0bd', zone: 'L', live: 1 },
  kitchen:  { label: 'キッチン',   c: '#f0dab8', zone: 'L' },
  western:  { label: '洋室',       c: '#dfe9f3', live: 1 },
  master:   { label: '主寝室',     c: '#e4def2', live: 1 },
  kids:     { label: '子ども部屋', c: '#e0edd6', live: 1 },
  washitsu: { label: '和室',       c: '#e5ebc6', live: 1 },
  study:    { label: '書斎',       c: '#efe1d1', live: 1 },
  entry:    { label: '玄関',       c: '#e2dacd' },
  hall:     { label: 'ホール',     c: '#eeeadf', zone: 'H' },
  corridor: { label: '廊下',       c: '#eeeadf', zone: 'H' },
  stairs:   { label: '階段',       c: '#e8e0cf' },
  toilet:   { label: 'トイレ',     c: '#d9e9ef' },
  wash:     { label: '洗面所',     c: '#d9e9ef' },
  bath:     { label: '浴室',       c: '#cfe3ed' },
  storage:  { label: '収納',       c: '#ebe5d6' },
  wic:      { label: 'WIC',        c: '#ebe5d6' },
  pantry:   { label: 'パントリー', c: '#eee1c6' },
  balcony:  { label: 'バルコニー', c: '#e6e6e1', out: 1 },
};
export const ROOM_ORDER = ['ldk', 'living', 'dining', 'kitchen', 'western', 'master', 'kids', 'washitsu', 'study', 'entry', 'hall', 'corridor', 'stairs', 'toilet', 'wash', 'bath', 'storage', 'wic', 'pantry', 'balcony'];

/* ドア・窓。sill＝床から下端、top＝床から上端（m） */
export const OPEN = {
  door:      { label: '開き戸',     g: 'door', sill: 0,   top: 2.0 },
  sliding:   { label: '引き戸',     g: 'door', sill: 0,   top: 2.0 },
  entry:     { label: '玄関ドア',   g: 'door', sill: 0,   top: 2.2 },
  open:      { label: '壁なし',     g: 'door', sill: 0,   top: 9 },
  koshi:     { label: '腰窓',       g: 'win',  sill: 0.9, top: 2.0 },
  hakidashi: { label: '掃き出し窓', g: 'win',  sill: 0,   top: 2.0 },
  small:     { label: '小窓',       g: 'win',  sill: 1.2, top: 1.7 },
  high:      { label: '高窓',       g: 'win',  sill: 1.9, top: 2.3 },
};
export const DOOR_KINDS = ['door', 'sliding', 'entry', 'open'];
export const WIN_KINDS = ['koshi', 'hakidashi', 'small', 'high'];

/* 設備（大きさはm。w＝横、d＝奥行き） */
export const FIX = {
  kitchenI: { label: 'I型キッチン',          w: 2.55, d: 0.65 },
  kitchenL: { label: 'L型キッチン',          w: 2.40, d: 1.80 },
  island:   { label: 'アイランドキッチン',   w: 2.55, d: 0.95 },
  bath1:    { label: 'ユニットバス 1坪',     w: 1.60, d: 1.60 },
  bath125:  { label: 'ユニットバス 1.25坪',  w: 2.00, d: 1.60 },
  vanity:   { label: '洗面台',               w: 0.75, d: 0.55 },
  washer:   { label: '洗濯機',               w: 0.64, d: 0.64 },
  toilet:   { label: '便器',                 w: 0.42, d: 0.72 },
  fridge:   { label: '冷蔵庫',               w: 0.70, d: 0.70 },
};
export const FIX_ORDER = ['kitchenI', 'kitchenL', 'island', 'bath1', 'bath125', 'vanity', 'washer', 'toilet', 'fridge'];

/* 外構。rect＝なぞって四角、line＝なぞって線、point＝タップで置く */
export const EXT = {
  parking:  { label: '駐車場',       shape: 'rect',  c: '#d6d4ce' },
  deck:     { label: 'ウッドデッキ', shape: 'rect',  c: '#cfa57a' },
  terrace:  { label: 'テラス',       shape: 'rect',  c: '#e3dacb' },
  lawn:     { label: '芝生',         shape: 'rect',  c: '#bcd69c' },
  flower:   { label: '花壇',         shape: 'rect',  c: '#dcbca5' },
  approach: { label: 'アプローチ',   shape: 'rect',  c: '#e6e1d6' },
  fence:    { label: 'フェンス',     shape: 'line' },
  tree:     { label: '木',           shape: 'point', r: 0.7 },
  gate:     { label: '門柱・ポスト', shape: 'point', w: 1.2, d: 0.4 },
};
export const EXT_ORDER = ['parking', 'deck', 'terrace', 'lawn', 'flower', 'approach', 'fence', 'tree', 'gate'];

/* 外観の選択肢 */
export const ROOF_SHAPES = { kiri: '切妻', yose: '寄棟', kata: '片流れ', riku: '陸屋根' };
export const WALL_MATS = { siding: 'サイディング', plaster: '塗り壁', wood: '木目', galva: 'ガルバリウム', tile: 'タイル' };
export const WALL_COLORS = [
  ['白', '#f2f0ea'], ['アイボリー', '#e9dfc6'], ['ベージュ', '#d5c2a2'], ['ライトグレー', '#c5c5c1'], ['グレー', '#8b8c89'],
  ['チャコール', '#4b4c4e'], ['黒', '#2b2b2c'], ['ネイビー', '#2f3c53'], ['ブラウン', '#7b5b40'], ['グリーン', '#5f6f57'],
];
export const ROOF_COLORS = [
  ['黒', '#2c2d2f'], ['チャコール', '#4a4c50'], ['ブラウン', '#5e4635'], ['赤茶', '#8a4a32'], ['グリーン', '#3f5a49'], ['ネイビー', '#2f3a4f'], ['シルバー', '#a9acae'],
];
export const SASH_COLORS = [['ブラック', '#2b2b2b'], ['ホワイト', '#efefed'], ['シルバー', '#b8bcc0'], ['ブロンズ', '#6b5a48']];
export const DOOR_COLORS = [['木目', '#9a6a42'], ['黒', '#2b2b2b'], ['白', '#ecebe7'], ['ネイビー', '#2f3c53'], ['グリーン', '#4f6b56']];

export const uid = () => Math.random().toString(36).slice(2, 9);

export function defaultLook() {
  return {
    roof: 'kiri', pitch: 4, eave: 0.45, ridge: 'auto', shedDir: 'down', roofColor: '#2c2d2f',
    wallMat: 'siding', wallColor: '#f2f0ea',
    accent: 'none', accentMat: 'wood', accentColor: '#9a6a42', accentWalls: [],
    sash: '#2b2b2b', door: '#9a6a42',
  };
}

export function blankPlan(floors = 1) {
  return {
    v: 1, id: uid(), name: 'わたしの家', updated: Date.now(), floors,
    site: { w: 20, d: 20, north: 0, road: [], bcr: 0, far: 0 },
    rooms: [], openings: [], fixtures: [], ext: [], look: defaultLook(),
  };
}

/* 見本づくりの道具。間取りは家の左上を (0,0) とした位置で書き、ox・oy だけずらして土地に置く */
function builder(p, ox, oy) {
  return {
    R(f, t, x, y, w, h, name) { p.rooms.push({ id: uid(), f, t, x: x + ox, y: y + oy, w, h, name: name || '' }); },
    O(f, o, x, y, len, k, sw = 0) { p.openings.push({ id: uid(), f, o, x: x + ox, y: y + oy, len, k, sw }); },
    F(f, t, x, y, rot = 0) { p.fixtures.push({ id: uid(), f, t, x: x + ox, y: y + oy, rot }); },
  };
}

export const TEMPLATES = [
  { key: 'b1', title: '白紙から', sub: '何もないマス目から描きます', make: () => blankPlan(1) },
  { key: 't2', title: '見本：2階建て 3LDK', sub: '約35坪', make: makeTwoStory },
  { key: 't1', title: '見本：平屋 2LDK', sub: '約21坪', make: makeOneStory },
];

function makeTwoStory() {
  const p = blankPlan(2);
  p.name = '2階建て 3LDK';
  p.floors = 2;
  const { R, O, F } = builder(p, 2, 2);
  // 1階
  R(1, 'bath', 0, 0, 2, 2); R(1, 'wash', 2, 0, 2, 2); R(1, 'pantry', 4, 0, 1, 2); R(1, 'kitchen', 5, 0, 3, 2);
  R(1, 'ldk', 0, 2, 8, 5); R(1, 'stairs', 8, 0, 2, 3); R(1, 'hall', 8, 3, 2, 1); R(1, 'entry', 8, 4, 2, 3);
  R(1, 'toilet', 10, 2, 1, 2); R(1, 'storage', 10, 4, 1, 3, 'シューズクローク');
  O(1, 'v', 2, 1, 1, 'sliding'); O(1, 'h', 3, 2, 1, 'sliding'); O(1, 'h', 4, 2, 1, 'sliding');
  O(1, 'h', 8, 3, 2, 'open'); O(1, 'v', 8, 3, 1, 'door', 1); O(1, 'h', 8, 4, 2, 'open');
  O(1, 'v', 10, 3, 1, 'door'); O(1, 'v', 10, 5, 1, 'sliding'); O(1, 'h', 8, 7, 1, 'entry', 1);
  O(1, 'h', 1, 7, 2, 'hakidashi'); O(1, 'h', 4, 7, 2, 'hakidashi'); O(1, 'v', 0, 3, 2, 'koshi');
  O(1, 'h', 6, 0, 1, 'small'); O(1, 'h', 0, 0, 1, 'small'); O(1, 'h', 2, 0, 1, 'small'); O(1, 'h', 8, 0, 1, 'high');
  O(1, 'v', 10, 1, 1, 'small'); O(1, 'v', 11, 2, 1, 'small'); O(1, 'h', 9, 7, 1, 'small');
  F(1, 'bath1', 0.12, 0.12); F(1, 'vanity', 2.08, 0.06); F(1, 'washer', 3.2, 0.12); F(1, 'kitchenI', 5.1, 0.06);
  F(1, 'fridge', 4.12, 0.12); F(1, 'toilet', 10.27, 2.1);
  // 2階
  R(2, 'master', 0, 0, 5, 3); R(2, 'wic', 5, 0, 2, 3); R(2, 'toilet', 7, 0, 1, 3); R(2, 'stairs', 8, 0, 2, 3);
  R(2, 'corridor', 0, 3, 10, 1); R(2, 'kids', 0, 4, 4, 3, '子ども部屋1'); R(2, 'kids', 4, 4, 4, 3, '子ども部屋2'); R(2, 'balcony', 8, 4, 2, 3);
  O(2, 'h', 8, 3, 2, 'open'); O(2, 'h', 2, 3, 1, 'door'); O(2, 'v', 5, 1, 1, 'sliding'); O(2, 'h', 7, 3, 1, 'door');
  O(2, 'h', 2, 4, 1, 'door', 1); O(2, 'h', 5, 4, 1, 'door', 1); O(2, 'h', 8, 4, 2, 'hakidashi');
  O(2, 'h', 1, 0, 2, 'koshi'); O(2, 'v', 0, 1, 1, 'koshi'); O(2, 'h', 7, 0, 1, 'small'); O(2, 'h', 8, 0, 1, 'high');
  O(2, 'v', 10, 1, 1, 'small'); O(2, 'v', 0, 3, 1, 'small'); O(2, 'h', 1, 7, 2, 'koshi'); O(2, 'v', 0, 5, 1, 'koshi');
  O(2, 'h', 5, 7, 2, 'koshi'); O(2, 'v', 8, 5, 1, 'hakidashi');
  F(2, 'toilet', 7.27, 0.15);
  Object.assign(p.look, { roof: 'kiri', pitch: 4, roofColor: '#2c2d2f', wallMat: 'siding', wallColor: '#f2f0ea', sash: '#2b2b2b', door: '#9a6a42' });
  return p;
}

function makeOneStory() {
  const p = blankPlan(1);
  p.name = '平屋 2LDK';
  const { R, O, F } = builder(p, 2, 2);
  R(1, 'bath', 0, 0, 2, 2); R(1, 'wash', 2, 0, 2, 2); R(1, 'kitchen', 4, 0, 3, 2); R(1, 'ldk', 0, 2, 7, 5);
  R(1, 'corridor', 7, 0, 1, 5); R(1, 'master', 8, 0, 4, 3); R(1, 'toilet', 8, 3, 1, 2); R(1, 'storage', 9, 3, 3, 1, 'クローゼット');
  R(1, 'western', 9, 4, 3, 3); R(1, 'entry', 7, 5, 2, 2);
  O(1, 'v', 2, 1, 1, 'sliding'); O(1, 'h', 2, 2, 1, 'sliding'); O(1, 'v', 7, 3, 1, 'door');
  O(1, 'v', 8, 1, 1, 'door', 1); O(1, 'v', 8, 4, 1, 'door', 1); O(1, 'h', 10, 3, 1, 'sliding'); O(1, 'h', 7, 5, 1, 'open');
  O(1, 'v', 9, 5, 1, 'door', 1); O(1, 'h', 7, 7, 1, 'entry', 1);
  O(1, 'h', 1, 7, 2, 'hakidashi'); O(1, 'h', 4, 7, 2, 'hakidashi'); O(1, 'v', 0, 3, 2, 'koshi');
  O(1, 'h', 5, 0, 1, 'small'); O(1, 'h', 0, 0, 1, 'small'); O(1, 'h', 2, 0, 1, 'small'); O(1, 'h', 7, 0, 1, 'small');
  O(1, 'h', 9, 0, 2, 'koshi'); O(1, 'v', 12, 1, 1, 'koshi'); O(1, 'h', 10, 7, 1, 'koshi'); O(1, 'v', 12, 5, 1, 'koshi');
  F(1, 'bath1', 0.12, 0.12); F(1, 'vanity', 2.08, 0.06); F(1, 'washer', 3.2, 0.12); F(1, 'kitchenI', 4.1, 0.06); F(1, 'toilet', 8.27, 3.15);
  Object.assign(p.look, { roof: 'yose', pitch: 4, roofColor: '#5e4635', wallMat: 'siding', wallColor: '#e9dfc6', sash: '#6b5a48', door: '#9a6a42' });
  return p;
}

/* 設備の部品（向き0のとき、左上を原点にしたm単位の四角）。2Dと3Dで同じものを使う */
export function fixParts(t) {
  switch (t) {
    case 'kitchenI': return [{ x: 0, y: 0, w: 2.55, d: 0.65, h: 0.85, c: '#f1efe9' }];
    case 'kitchenL': return [{ x: 0, y: 0, w: 2.4, d: 0.65, h: 0.85, c: '#f1efe9' }, { x: 0, y: 0.65, w: 0.65, d: 1.15, h: 0.85, c: '#f1efe9' }];
    case 'island': return [{ x: 0, y: 0, w: 2.55, d: 0.95, h: 0.85, c: '#f1efe9' }];
    case 'bath1': return [{ x: 0, y: 0, w: 1.6, d: 1.6, h: 0.02, c: '#c9d6dc' }, { x: 0, y: 0, w: 1.6, d: 0.75, h: 0.55, c: '#f4f6f7' }];
    case 'bath125': return [{ x: 0, y: 0, w: 2.0, d: 1.6, h: 0.02, c: '#c9d6dc' }, { x: 0, y: 0, w: 2.0, d: 0.8, h: 0.55, c: '#f4f6f7' }];
    case 'vanity': return [{ x: 0, y: 0, w: 0.75, d: 0.55, h: 0.8, c: '#f4f4f2' }];
    case 'washer': return [{ x: 0, y: 0, w: 0.64, d: 0.64, h: 0.9, c: '#f0f0ee' }];
    case 'toilet': return [{ x: 0.03, y: 0, w: 0.36, d: 0.2, h: 0.8, c: '#f6f6f4' }, { x: 0.04, y: 0.2, w: 0.34, d: 0.5, h: 0.4, c: '#f6f6f4' }];
    case 'fridge': return [{ x: 0.02, y: 0.02, w: 0.66, d: 0.66, h: 1.8, c: '#c9cdd0' }];
  }
  return [];
}

/* 向き（0〜3、90度ずつ右回り）を入れたときの横・奥行き（m） */
export function fixSize(fx) {
  const d = FIX[fx.t];
  return fx.rot % 2 ? [d.d, d.w] : [d.w, d.d];
}

/* 向き0の点 (u,v) を、向き rot の家具の左上原点の位置に直す（W・Dは向き0の大きさ） */
export function rotPt(u, v, W, D, rot) {
  switch (rot % 4) {
    case 1: return [D - v, u];
    case 2: return [W - u, D - v];
    case 3: return [v, W - u];
  }
  return [u, v];
}
