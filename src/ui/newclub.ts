/* はじめの画面：47都道府県から1つ → クラブの名前・色・エンブレム → 3部から（企画書 3） */
import { PREFS, REGIONS, cityShort, prefScale } from '../core/data/prefs';
import { EMBLEM_COLORS, PATTERNS, SHAPES, SYMBOLS, type Emblem } from '../core/emblem';
import { CLUB_WORDS } from '../core/data/names';
import { $, $$, esc } from './dom';
import { emblemSVG } from './emblem';
import { applyClubColor } from './theme';

const MAIN_COLORS = ['#1f6f5c', '#2c6aa0', '#1d3f8f', '#b23b3b', '#c2561b', '#c99a1c', '#5b3f8f', '#8f2f4f', '#2f7d4f', '#1d7f8a', '#3a3f47', '#d94f8a'];
export interface NewClubChoice { pref: string; name: string; color: string; emblem: Emblem; }

export function openNewClub(onDone: (c: NewClubChoice) => void, onCancel: (() => void) | null) {
  const st: NewClubChoice = { pref: '静岡県', name: '', color: MAIN_COLORS[0], emblem: { shape: 0, pattern: 0, c1: MAIN_COLORS[0], c2: '#ffffff', symbol: 1 } };
  let step = 1;
  const layer = $('#layer');
  const draw = () => {
    applyClubColor(st.color);
    const P = PREFS.find((p) => p.name === st.pref)!;
    const sc = prefScale(st.pref);
    const size = sc >= 1.2 ? '大きい' : sc >= 0.95 ? 'ふつう' : '小さい';
    let body = '';
    if (step === 1) {
      body = `<section class="card"><h2>1. ホームの県を選ぶ</h2>
        <div class="field"><label for="pref">47都道府県から1つ</label><select id="pref">${REGIONS.map((rg) => `<optgroup label="${rg}">${PREFS.filter((p) => p.region === rg).map((p) => `<option value="${p.name}" ${p.name === st.pref ? 'selected' : ''}>${p.name}（${p.city}）</option>`).join('')}</optgroup>`).join('')}</select></div>
        <div style="margin-top:10px" class="goal">${esc(P.name)} ${esc(P.city)}</div>
        <dl class="kv" style="margin-top:6px"><dt>町の大きさ</dt><dd>${size}</dd><dt>人口</dt><dd>約${P.pop}万人</dd></dl>
        <div class="muted" style="margin-top:6px">人口の多い県ほど、お客さんとお金が集まりやすく、ユースに入る子も多くなります。小さい県は苦しいぶん、育てて勝つ楽しみが大きくなります。</div></section>`;
    } else if (step === 2) {
      const sug = suggest(st.pref);
      body = `<section class="card"><h2>2. クラブの名前</h2>
        <div class="field"><label for="cname">名前（20文字まで）</label><input type="text" id="cname" maxlength="20" value="${esc(st.name || sug[0])}" autocomplete="off"></div>
        <div class="chips" style="margin-top:8px">${sug.map((s) => `<button class="chip spbtn" data-sug="${esc(s)}">${esc(s)}</button>`).join('')}</div></section>
        <section class="card"><h2>クラブの色</h2><div class="swatches">${MAIN_COLORS.map((c) => `<button class="sw" style="background:${c}" data-col="${c}" aria-pressed="${st.color === c}" aria-label="色 ${c}"></button>`).join('')}</div>
        <div class="muted small" style="margin-top:6px">画面全体が、この色で染まります。</div></section>`;
    } else if (step === 3) {
      const e = st.emblem;
      const opt = (k: keyof Emblem, list: string[]) => list.map((l, i) => { const prev = { ...e, [k]: i } as Emblem; return `<button class="opt" data-em="${k}" data-v="${i}" aria-pressed="${e[k] === i}">${emblemSVG(prev, 'mini')}${esc(l)}</button>`; }).join('');
      body = `<section class="card" style="text-align:center"><h2>3. エンブレム</h2>${emblemSVG(e, 'big')}</section>
        <section class="card"><h2>形</h2><div class="optgrid">${opt('shape', SHAPES)}</div></section>
        <section class="card"><h2>模様</h2><div class="optgrid">${opt('pattern', PATTERNS)}</div></section>
        <section class="card"><h2>しるし</h2><div class="optgrid">${opt('symbol', SYMBOLS)}</div></section>
        <section class="card"><h2>2つめの色</h2><div class="swatches">${EMBLEM_COLORS.map((c) => `<button class="sw" style="background:${c}" data-c2="${c}" aria-pressed="${e.c2 === c}" aria-label="色 ${c}"></button>`).join('')}</div></section>`;
    } else {
      body = `<section class="card" style="text-align:center">${emblemSVG(st.emblem, 'big')}<div class="goal" style="font-size:20px;margin-top:6px">${esc(st.name)}</div><div class="muted">${esc(P.name)} ${esc(P.city)} ・ 3部から</div></section>
        <section class="card"><h2>はじめに</h2><div>できたばかりのクラブです。地元の若手を中心に22人ほどが集まりました。まだ力は低めです。</div><div class="muted" style="margin-top:6px">あなたはオーナー。試合は監督にまかせて見守ります。目標は、まず3部で2位以内に入って昇格することです。</div></section>`;
    }
    layer.innerHTML = `<div class="sheet" role="dialog" aria-label="クラブを作る"><div class="in"><div class="bar"><h2>クラブを作る（${step}/4）</h2></div>${body}</div></div>
      <div class="dock"><div class="in2">${step > 1 ? '<button class="btn ghost" id="nBack">もどる</button>' : onCancel ? '<button class="btn ghost" id="nCancel">やめる</button>' : '<span></span>'}<button class="btn primary" id="nNext">${step === 4 ? 'このクラブで始める' : '次へ'}</button></div></div>`;
    $('#pref', layer)?.addEventListener('change', (ev) => { st.pref = (ev.target as HTMLSelectElement).value; st.name = ''; draw(); });
    const inp = $('#cname', layer) as HTMLInputElement | null;
    inp?.addEventListener('input', () => { st.name = inp.value; });
    $$<HTMLElement>('[data-sug]', layer).forEach((b) => b.addEventListener('click', () => { st.name = b.dataset.sug!; draw(); }));
    $$<HTMLElement>('[data-col]', layer).forEach((b) => b.addEventListener('click', () => { if (inp) st.name = inp.value; st.color = b.dataset.col!; st.emblem.c1 = st.color; draw(); }));
    $$<HTMLElement>('[data-c2]', layer).forEach((b) => b.addEventListener('click', () => { st.emblem.c2 = b.dataset.c2!; draw(); }));
    $$<HTMLElement>('[data-em]', layer).forEach((b) => b.addEventListener('click', () => { (st.emblem as any)[b.dataset.em!] = +b.dataset.v!; draw(); }));
    $('#nBack', layer)?.addEventListener('click', () => { step--; draw(); });
    $('#nCancel', layer)?.addEventListener('click', () => { layer.innerHTML = ''; onCancel?.(); });
    $('#nNext', layer).addEventListener('click', () => {
      if (step === 2) { st.name = (inp?.value || '').trim() || suggest(st.pref)[0]; }
      if (step < 4) { step++; draw(); return; }
      layer.innerHTML = ''; onDone({ ...st, emblem: { ...st.emblem } });
    });
  };
  draw();
}
function suggest(pref: string): string[] {
  const p = PREFS.find((x) => x.name === pref)!; const c = cityShort(p.city);
  const h = [...pref].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const w1 = CLUB_WORDS[h % CLUB_WORDS.length], w2 = CLUB_WORDS[(h * 7 + 3) % CLUB_WORDS.length];
  return [`わかば${c}FC`, `${c}${w1}`, `FC${c}${w2}`];
}
