/* タイトル（セーブの一覧）と、新しいクラブを作る画面 */
import { S, ACT, CHANGE, INPUT, esc, toast, confirmBox, closeModal } from './util';
import { newGame, type GameState } from '../core/game';
import { DIFFS, DIFF_KEYS, type Diff } from '../core/gm';
import { PREFS, REGIONS, prefScale, cityShort } from '../core/data/prefs';
import { SHAPES, PATTERNS, SYMBOLS, EMBLEM_COLORS, type Emblem } from '../core/emblem';
import { emblemSVG } from '../ui/emblem';
import { migrate } from '../core/save';
import { render, load, save, slots, delSlot } from './app';

const COLORS = ['#1f6f5c', '#2f7fe0', '#c93a3a', '#f2b544', '#7a3fa0', '#e07a1f', '#1d7f8a', '#d94f8a', '#3b4fd1', '#2f7d4f', '#b5893a', '#111827'];
const NICK = ['FC', 'ユナイテッド', 'SC', 'シティ', 'アスレティック', 'ヴォルテ', 'レグルス', 'ソレイユ', 'アストラ', 'フォルティス'];

export function titleHTML(): string {
  if (S.ui.newCfg) return newHTML();
  const list = slots().map((s, i) => {
    const n = i + 1;
    if (s.broken) return `<div class="slot"><div class="info"><div class="sname bad">スロット${n}　読みこめないデータ</div></div><button class="btn danger" data-act="delSlot" data-arg="${n}">消す</button></div>`;
    if (!s.exists) return `<div class="slot"><span class="crest" style="background:var(--line)"></span><div class="info"><div class="sname muted">スロット${n}　空き</div><div class="muted" style="font-size:12px">新しいクラブを立ち上げられます</div></div><button class="btn primary" data-act="newClub" data-arg="${n}">新しく始める</button></div>`;
    return `<div class="slot"><div class="info"><div class="sname">${esc(s.summary)}</div><div class="muted" style="font-size:12px">スロット${n}・保存 ${esc(new Date(s.savedAt).toLocaleString('ja-JP'))}</div></div>
      <button class="btn primary" data-act="loadSlot" data-arg="${n}">続きから</button><button class="btn ghost small" data-act="delSlotAsk" data-arg="${n}">消す</button></div>`;
  }).join('');
  return `<div class="title-screen"><div class="title-wrap">
    <div class="logo"><div class="eyebrow">サッカークラブ経営シミュレーション・PC版</div><div class="mark">育ての街<br><span>クラブ</span></div>
    <div class="sub">自分の県にできたばかりのクラブで、GM兼監督になる。並び方も練習も補強も自分で決めて、無名の若手が化けるのを見届けよう。</div></div>
    <div class="slots">${list}</div>
    <div class="panel"><h2>セーブコードから再開</h2>
      <textarea class="input" id="import-code" placeholder="「セーブ・設定」で書き出したコードを貼り付ける"></textarea>
      <div class="row"><select class="input" id="import-slot" style="width:auto">${[1, 2, 3].map((n) => `<option value="${n}">スロット${n}に読みこむ</option>`).join('')}</select>
      <button class="btn" data-act="importCode">コードを読みこむ</button><label class="btn">ファイルを選ぶ<input type="file" id="import-file" accept=".txt,.json" hidden></label></div>
      <div id="import-msg" class="muted" style="font-size:12px"></div></div>
  </div></div>`;
}
function newHTML(): string {
  const c = S.ui.newCfg;
  const opts = REGIONS.map((r) => `<optgroup label="${r}">${PREFS.filter((p) => p.region === r).map((p) => `<option value="${p.name}" ${p.name === c.pref ? 'selected' : ''}>${p.name}（${cityShort(p.city)}）　お金の集まりやすさ ${'★'.repeat(Math.max(1, Math.round(prefScale(p.name) * 4 + 1)))}</option>`).join('')}</optgroup>`).join('');
  const e: Emblem = c.emblem;
  const pick = (k: keyof Emblem, arr: string[]) => `<div class="tabs">${arr.map((n, i) => `<button class="tab ${e[k] === i ? 'on' : ''}" data-act="ngEmb" data-arg="${k}:${i}">${n}</button>`).join('')}</div>`;
  return `<div class="title-screen"><div class="title-wrap" style="width:min(900px,100%)">
    <div class="logo"><div class="eyebrow">スロット${c.slot}・新しいクラブ</div><div class="mark" style="font-size:54px">クラブを<span>作る</span></div></div>
    <div class="panel form-grid">
      <div class="field"><label for="ng-pref">ホームの県</label><select class="input" id="ng-pref" data-change="ngPref">${opts}</select>
        <div class="muted" style="font-size:12px">人口の多い県ほど、お客さん・スポンサー・ユースの子が集まりやすい。小さな県から成り上がるのも楽しい。</div></div>
      <div class="field"><label for="ng-name">クラブの名前</label><input class="input" id="ng-name" maxlength="20" value="${esc(c.name)}" data-input="ngName">
        <div class="row"><button class="btn small" data-act="ngRand">名前の候補を出す</button></div></div>
      <div class="two-col">
        <div class="field"><label>クラブの色</label><div class="swatches">${COLORS.map((col) => `<button class="swatch ${col === c.color ? 'on' : ''}" style="background:${col}" data-act="ngColor" data-arg="${col}" aria-label="色 ${col}"></button>`).join('')}</div>
          <label>エンブレム</label>${pick('shape', SHAPES)}${pick('pattern', PATTERNS)}${pick('symbol', SYMBOLS)}
          <div class="swatches">${EMBLEM_COLORS.map((col) => `<button class="swatch ${col === e.c2 ? 'on' : ''}" style="background:${col}" data-act="ngC2" data-arg="${col}" aria-label="2つめの色 ${col}"></button>`).join('')}</div></div>
        <div class="field" style="justify-items:center;align-content:center"><div style="width:140px">${emblemSVG(e).replace('class="crest"', 'class="crest" style="width:140px;height:154px"')}</div><b>${esc(c.name)}</b></div>
      </div>
      <div class="field"><label>難易度</label><div class="diff-cards">${DIFF_KEYS.map((k) => `<button class="diff ${k === c.diff ? 'on' : ''}" data-act="ngDiff" data-arg="${k}"><b>${DIFFS[k].n}</b><span>${DIFFS[k].d}</span></button>`).join('')}</div></div>
      <div class="row between"><button class="btn ghost" data-act="toTitle">もどる</button><button class="btn primary next-btn" data-act="startGame">このクラブで始める</button></div>
    </div></div></div>`;
}
const randName = (pref: string) => { const P = PREFS.find((p) => p.name === pref)!; const city = cityShort(P.city); const n = NICK[Math.floor(Math.random() * NICK.length)]; return n === 'FC' || n === 'SC' ? `${city}${n}` : `${n}${city}`; };
ACT.newClub = (n) => { const pref = '静岡県'; S.ui.newCfg = { slot: +n, pref, name: randName(pref), color: COLORS[0], diff: 'normal' as Diff, emblem: { shape: 0, pattern: 0, c1: COLORS[0], c2: '#ffffff', symbol: 1 } }; render(); };
ACT.ngRand = () => { S.ui.newCfg.name = randName(S.ui.newCfg.pref); render(); };
ACT.ngColor = (c) => { S.ui.newCfg.color = c; S.ui.newCfg.emblem.c1 = c; render(); };
ACT.ngC2 = (c) => { S.ui.newCfg.emblem.c2 = c; render(); };
ACT.ngEmb = (v) => { const [k, i] = v.split(':'); (S.ui.newCfg.emblem as any)[k] = +i; render(); };
ACT.ngDiff = (d) => { S.ui.newCfg.diff = d; render(); };
ACT.toTitle = () => { S.ui.newCfg = null; render(); };
CHANGE.ngPref = (v) => { const c = S.ui.newCfg; const old = randName(c.pref); void old; c.pref = v; c.name = randName(v); render(); };
INPUT.ngName = (v) => { S.ui.newCfg.name = v; };
ACT.startGame = () => {
  const c = S.ui.newCfg; const name = (c.name || '').trim() || randName(c.pref);
  S.G = newGame({ seed: Math.floor(Math.random() * 1e9), pref: c.pref, name, color: c.color, emblem: { ...c.emblem, c1: c.color }, diff: c.diff });
  S.slot = c.slot; S.ui = {}; S.view = 'home'; save(); render();
  import('./app').then((m) => m.chain());
};
ACT.loadSlot = (n) => { if (load(+n)) { S.ui = {}; render(); import('./app').then((m) => m.chain()); } else toast('読みこめません', 'このセーブはPC版のものではないか、こわれています', 'bad'); };
ACT.delSlotAsk = (n) => confirmBox('セーブを消す', `スロット${n}のデータを消します。元にはもどせません。`, '消す', () => { delSlot(+n); closeModal(); render(); }, true);
ACT.delSlot = (n) => { delSlot(+n); render(); };

/* ---------- セーブコード ---------- */
export async function exportCode(G: GameState): Promise<string> {
  const json = JSON.stringify(G);
  try {
    if ('CompressionStream' in window) {
      const cs = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
      const buf = new Uint8Array(await new Response(cs).arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return 'SODATE1:' + btoa(bin);
    }
  } catch { /* 下へ */ }
  return 'SODATE0:' + btoa(unescape(encodeURIComponent(json)));
}
export async function importCode(code: string): Promise<GameState> {
  code = code.trim(); let json: string;
  if (code.startsWith('{')) json = code;
  else if (code.startsWith('SODATE1:')) { const bin = atob(code.slice(8)); const buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i); json = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text(); }
  else if (code.startsWith('SODATE0:')) json = decodeURIComponent(escape(atob(code.slice(8))));
  else throw new Error('format');
  const raw = JSON.parse(json); const st = raw.state ?? raw;
  const G = migrate(st); if (!G.gm || !G.squad) throw new Error('format'); return G;
}
ACT.importCode = async () => {
  const code = (document.querySelector('#import-code') as HTMLTextAreaElement).value; const slot = +(document.querySelector('#import-slot') as HTMLSelectElement).value;
  try { const g = await importCode(code); S.G = g; S.slot = slot; S.ui = {}; S.view = 'home'; save(); render(); toast('読みこみました', `スロット${slot}に入れました`, 'good'); }
  catch { const m = document.querySelector('#import-msg'); if (m) m.textContent = 'コードを読みこめませんでした。全部コピーできているか確かめてください。'; }
};
document.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === 'import-file' && el.files?.[0]) { const fr = new FileReader(); fr.onload = () => { (document.querySelector('#import-code') as HTMLTextAreaElement).value = String(fr.result); ACT.importCode('', el, e); }; fr.readAsText(el.files[0]); }
});
