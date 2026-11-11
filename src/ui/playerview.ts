/* 選手の画面：8角形の能力図（感想 19）・2列×4行の数字・ポジション適性・特殊能力（押すと説明：感想 20）・記録 */
import type { Player, ReportEntry } from '../core/types';
import { APT, AT_F, AT_K, ORDER_F, ORDER_K, POS, POS_NOTE, colorOf } from '../core/constants';
import { SP_MAP } from '../core/data/specials';
import { inGrowth, ovr } from '../core/player';
import { $, $$, esc, posTag, val } from './dom';

export function radarSVG(p: Player): string {
  const L = p.pos === 'GK' ? AT_K : AT_F; const order = p.pos === 'GK' ? ORDER_K : ORDER_F;
  const cx = 160, cy = 150, R = 100, n = 8;
  const pt = (i: number, v: number) => { const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n; const r = (R * v) / 99; return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)]; };
  const ring = (v: number) => order.map((_, i) => pt(i, v).map((x) => x.toFixed(1)).join(',')).join(' ');
  const rings = [25, 50, 75, 99].map((v) => `<polygon points="${ring(v)}" fill="none" stroke="var(--line)" stroke-width="1"/>`).join('');
  const spokes = order.map((_, i) => { const [x, y] = pt(i, 99); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`; }).join('');
  const shape = order.map((ai, i) => pt(i, Math.floor(p.a[ai])).map((x) => x.toFixed(1)).join(',')).join(' ');
  const labels = order.map((ai, i) => {
    const [x, y] = pt(i, 124); const v = Math.floor(p.a[ai]); const anchor = Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end';
    return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${anchor}" font-size="14" fill="var(--muted)">${L[ai]}</text><text x="${x.toFixed(1)}" y="${(y + 21).toFixed(1)}" text-anchor="${anchor}" font-size="15" font-weight="800" class="${colorOf(v)}" fill="currentColor">${v}</text>`;
  }).join('');
  return `<svg viewBox="-28 0 376 300" width="100%" style="max-width:380px;display:block;margin:0 auto" role="img" aria-label="能力の8角形の図">${rings}${spokes}<polygon points="${shape}" fill="var(--club)" fill-opacity=".28" stroke="var(--club)" stroke-width="2.5" stroke-linejoin="round"/>${labels}</svg>`;
}
/** コーチのひとことの評価（素質がぼんやりわかる。腕前で当たり外れ：企画書 8-4・問18） */
export function hintFor(p: Player, skill = 0.6, seed = 0): string {
  const o = ovr(p);
  const wrong = ((p.id * 7919 + seed * 31) % 100) / 100 > 0.55 + skill * 0.45;
  const room = p.pot - o + (wrong ? (p.id % 2 ? 8 : -8) : 0);
  const growing = inGrowth(p) !== (wrong && p.id % 3 === 0);
  let t = growing ? (room > 12 ? 'いま、ぐんぐん伸びている。まだまだ化けるかもしれない' : room > 5 ? '伸びている時期だ。どこまで行けるか楽しみだ' : '伸びている時期だが、上はそれほど高くないかもしれない')
    : p.age < p.gStart ? (room > 12 ? 'まだ伸びる時期が来ていない。化けるかもしれない' : 'まだ伸びる時期が来ていない。焦らず使い続けたい')
      : p.age >= p.decl ? '力が少しずつ落ちてきた。経験でおぎなっている' : room < 4 ? 'もう伸びしろは少ないかもしれない' : '伸びはゆるやかになってきた';
  const g = p.sp.find((s) => SP_MAP[s]?.cat === '育成系');
  if (g && skill > 0.5) t += `。${g === '練習の虫' ? 'あいつは練習の虫です' : g === 'キャンプで化ける' ? 'キャンプで一気に伸びるタイプです' : g === '実戦で伸びる' ? '試合で使うほど伸びるタイプです' : g === '吸収力' ? '覚えるのが早い' : g === '学ぶ力' ? '新しいことを身につけるのがうまい' : '長く力を保てそうです'}`;
  return `「${t}」`;
}

export interface PlayerViewOpts {
  report?: ReportEntry | null;
  coachName?: string; coachSkill?: number;
  mgrName?: string; mgrObeyWord?: string;
  onReq?: (p: Player) => void;
  extraHTML?: string;
  /** コーチのひとことの代わりに出す（他クラブの選手：スカウトのひとこと。ポテンシャルは見せない） */
  hintHTML?: string;
  hideRecords?: boolean;
  bindExtra?: (root: HTMLElement) => void;
  back: () => void;
}
export function openPlayer(p: Player, o: PlayerViewOpts) {
  const L = p.pos === 'GK' ? AT_K : AT_F; const order = p.pos === 'GK' ? ORDER_K : ORDER_F;
  const rep = o.report; const ov = ovr(p);
  const layer = $('#layer');
  const hist = p.hist.length ? `<table><thead><tr><th class="l">年</th><th>年齢</th><th>総合力</th></tr></thead><tbody>${p.hist.slice(-8).map((h, i, arr) => `<tr><td class="l">${h.y}年目</td><td>${p.age - (arr.length - i)}歳</td><td>${val(h.ovr)}</td></tr>`).join('')}<tr><td class="l">いま</td><td>${p.age}歳</td><td>${val(ov)}</td></tr></tbody></table>` : '<div class="muted">まだ記録がない（年末に1年ぶんがのる）</div>';
  layer.innerHTML = `<div class="sheet" role="dialog" aria-label="選手"><div class="in">
    <div class="bar"><span class="num" style="font-size:16px">${p.num || ''}</span><h2>${esc(p.name)}</h2><span class="ovr ${colorOf(ov)}">${ov}</span></div>
    <div class="row wrap">${posTag(p.pos)}<span class="muted">${p.age}歳 ・ ${p.height}cm ・ 利き足 ${p.foot === '両' ? '両足' : p.foot} ・ ${esc(p.pref)}出身 ・ ${esc(p.origin)}</span></div>
    ${p.inj ? `<div class="tag bad">ケガ（あと${p.inj}週）</div>` : ''}
    <section class="card"><h2>能力</h2>${radarSVG(p)}<div class="attrs" style="margin-top:8px">${order.map((i) => { const v = Math.floor(p.a[i]); const u = rep ? rep.ups[i] : 0; return `<div class="attr ${u >= 2 ? 'glow' : ''}"><span class="k">${L[i]}</span><span>${val(v)}${u > 0 ? `<span class="up">+${u}</span>` : u < 0 ? `<span class="down">${u}</span>` : ''}</span></div>`; }).join('')}</div>
      <div class="muted small" style="margin-top:6px">色：〜69 灰・70〜79 銅・80〜89 銀・90〜99 金</div></section>
    <section class="card"><h2>ポジション適性</h2><div class="apt">${POS.map((x) => `<div>${x}<b>${APT[p.apt[x]]}</b></div>`).join('')}</div>
      <div class="muted small" style="margin-top:6px">${p.pos}：${POS_NOTE[p.pos]}。◎はそのままの力、○は少し下がる、△はかなり下がる、×は大きく下がる。そのポジションで出ていると伸びる。</div></section>
    <section class="card"><h2>特殊能力</h2><div class="chips">${p.sp.length ? p.sp.map((s) => `<button class="chip good spbtn" data-sp="${esc(s)}" aria-pressed="false">${esc(s)}</button>`).join('') : '<span class="muted">まだない</span>'}${p.bad.map((s) => `<button class="chip bad spbtn" data-sp="${esc(s)}" aria-pressed="false">${esc(s)}</button>`).join('')}</div><div id="spDesc" class="spdesc" hidden></div>${p.sp.length || p.bad.length ? '<div class="muted small" style="margin-top:6px">押すと効果がわかります</div>' : ''}</section>
    ${o.hintHTML ?? `<section class="card"><h2>${esc(o.coachName || 'コーチ')}のひとこと</h2><div>${hintFor(p, o.coachSkill ?? 0.6)}</div></section>`}
    ${o.hideRecords ? '' : `<section class="card"><h2>記録</h2><dl class="kv"><dt>通算</dt><dd>${p.apps}試合 ${p.goals}点</dd><dt>今シーズン</dt><dd>${p.seasonApps}試合 ${p.seasonGoals}点</dd><dt>初出場</dt><dd>${esc(p.firstApp || 'まだ')}</dd><dt>初ゴール</dt><dd>${esc(p.firstGoal || 'まだ')}</dd><dt>契約</dt><dd>あと${p.contract}年 ・ 年${p.salary.toLocaleString()}万円</dd></dl>
      <h3>伸びの記録</h3>${hist}</section>`}
    ${o.onReq ? `<section class="card"><h2>監督への頼み</h2><button class="btn ${p.req ? 'primary' : 'ghost'} wide" id="pReq">${p.req ? '起用の依頼を取り下げる' : 'この選手を試合で使ってほしい'}</button><div class="muted small" style="margin-top:6px">${esc(o.mgrName || '監督')}は、${esc(o.mgrObeyWord || '')}。</div></section>` : ''}
    ${o.extraHTML || ''}
  </div></div><div class="dock"><div class="in2 one"><button class="btn primary" id="pBack">もどる</button></div></div>`;
  const root = layer.querySelector('.sheet') as HTMLElement;
  $$<HTMLButtonElement>('.spbtn', layer).forEach((b) => b.addEventListener('click', () => {
    const d = $('#spDesc'); const s = b.dataset.sp!; const same = d.dataset.cur === s && !d.hidden;
    $$('.spbtn', layer).forEach((x) => x.setAttribute('aria-pressed', String(x === b && !same)));
    if (same) { d.hidden = true; return; }
    const def = SP_MAP[s];
    d.dataset.cur = s;
    d.innerHTML = `<b>${esc(s)}</b>（${esc(def?.cat || '')}）：${esc(def?.desc || '')}${def && !def.good ? `<br><span class="small">試合に出たり、コーチがよかったりすると、克服できることがある。克服しやすくなること：${esc(def.cure || '')}</span>` : ''}`;
    d.hidden = false;
  }));
  if (o.onReq) $('#pReq').addEventListener('click', () => { o.onReq!(p); openPlayer(p, o); });
  o.bindExtra?.(root);
  $('#pBack').addEventListener('click', () => { layer.innerHTML = ''; o.back(); });
}
